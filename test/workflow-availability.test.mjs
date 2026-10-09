import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

// Run each actual SDK with explicit packed artifacts and the public-only store.
// Default npm test does not perform this heavyweight native installation matrix.
const enabled = process.env.OMAA_WORKFLOW_AVAILABILITY === '1';
const runFile = promisify(execFile);
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const userText = payload => payload.messages.filter(row => row.role === 'user').map(textOf).join('\n');
function configuration(omd = false) {
  for (const name of ['OMAA_TEST_HOST_CLI', 'OMAA_TEST_HOST_VERSION', 'OMAA_TEST_HOST_PACKAGE', 'OMAA_TEST_PUBLIC_STORE', ...omd ? ['OMAA_TEST_OMD_PACKAGE'] : []]) assert(process.env[name], name + ' is required');
  return { cliPath: resolve(process.env.OMAA_TEST_HOST_CLI), expectedHostVersion: process.env.OMAA_TEST_HOST_VERSION,
    packagePath: resolve(process.env.OMAA_TEST_HOST_PACKAGE), storeDir: resolve(process.env.OMAA_TEST_PUBLIC_STORE),
    ...(omd ? { omdPackagePath: resolve(process.env.OMAA_TEST_OMD_PACKAGE) } : {}), safeEnvironment: true, piResources: true };
}
async function observer(f, sessionId) {
  const response = await fetch(f.origin + '/workflow-availability-observer?session=' + encodeURIComponent(sessionId), { headers: { cookie: f.cookie }, signal: AbortSignal.timeout(10000) });
  const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
}
async function expectMode(f, sessionId, mode) {
  let observed;
  try { await until(async () => { observed = await observer(f, sessionId); return observed.controller && observed.mode === mode; }); }
  catch (error) { throw new Error('Expected workflow mode ' + mode + ', observed ' + JSON.stringify(observed), { cause: error }); }
}
async function addObserver(f) {
  // The hot native Plugin Manager runs pnpm in this profile, independently of
  // the CLI's --store-dir flag. pnpm 11 reads storeDir from workspace YAML,
  // while .npmrc now holds registry/auth settings only. Use its public config
  // command so existing build decisions and workspace settings are preserved.
  const profile = join(f.home, 'profiles', 'omaa-fixture');
  const emptyAuth = join(f.home, 'fixture-empty.npmrc');
  await writeFile(emptyAuth, '');
  await writeFile(join(profile, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  env.XDG_CONFIG_HOME = join(f.root, 'pnpm-config');
  env.PNPM_CONFIG_NPMRC_AUTH_FILE = emptyAuth;
  env.NPM_CONFIG_USERCONFIG = emptyAuth;
  const options = { cwd: profile, env, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 };
  const store = resolve(process.env.OMAA_TEST_PUBLIC_STORE);
  await runFile('pnpm', ['config', 'set', '--location=project', 'storeDir', store], options);
  assert.equal((await runFile('pnpm', ['config', 'get', 'storeDir'], options)).stdout.trim(), store);
  const file = join(f.root, 'workflow-availability-observer.mjs');
  await writeFile(file, await readFile(new URL('./fixtures/workflow-availability-observer.mjs', import.meta.url), 'utf8'));
  return { insert: [{ id: 'workflow-availability-observer', name: pathToFileURL(file).href }] };
}
async function profilePatch(f, entries) {
  await writeFile(join(f.home, 'profiles', 'omaa-fixture', 'cordis.patch.yml'), JSON.stringify(entries));
}
async function toolRound(f, sessionId, name, args, marker, children = []) {
  const before = (await f.snapshot(sessionId)).projections.asOfSeq;
  let issued;
  f.replyWith(payload => {
    assert.equal(payload.model, 'fixture', 'only the explicit localhost model may run');
    const child = /WORKFLOW_AVAIL_CHILD_[A-Za-z0-9]+/.exec(userText(payload))?.[0];
    if (child) { children.push(child); return textReply(child + '_RESULT'); }
    if (payload.tools?.length && userText(payload).includes(marker) && !issued) {
      const reply = toolReply(name, args); issued = reply.delta.tool_calls[0].id; return reply;
    }
    return textReply('Local availability fixture completed.');
  });
  const result = await f.prompt(sessionId, marker, { timeout: 30000 });
  const fresh = result.records.map(row => row.event).filter(row => row?.seq > before);
  const call = fresh.find(row => row.type === 'tool/call' && row.data.callId === issued);
  assert.equal(call?.data.name, name, marker + ' must execute its issued native tool');
  const outcome = fresh.find(row => row.type === 'tool/result' && row.data.message?.toolCallId === issued);
  assert(outcome, marker + ' must have the paired native result');
  assert.equal(Boolean(outcome.data.message.isError), false, textOf(outcome.data.message));
  assert.equal(fresh.filter(row => row.type === 'tool/call' && row.data.callId === issued).length, 1);
  return { result, fresh, text: textOf(outcome.data.message) };
}
async function fiveBases(f, ids, marker) {
  await writeFile(join(f.workspace, 'availability-basis.txt'), 'LOCAL_BASE_AVAILABLE');
  for (const product of products) {
    const sessionId = ids[product.id] ??= (await f.create(product.preset)).sessionId;
    const round = await toolRound(f, sessionId, 'read', { file_path: 'availability-basis.txt' }, marker + '_' + product.id);
    assert.match(round.text, /LOCAL_BASE_AVAILABLE/);
    const api = await f.api(sessionId); assert.equal(api.status, 200);
    assert.equal(api.value.product.id, product.id);
    const state = await observer(f, sessionId);
    assert.equal(state.controller, true, product.id + ' retains its base workflow controller');
    assert.equal(state.workflows.length, 1, product.id + ' must have one native registry workflow');
  }
}
async function workflow(f, sessionId, marker, args, children) {
  const round = await toolRound(f, sessionId, 'workflow', args ?? { meta: { name: 'availability', description: 'Native availability probe' }, script: `return '${marker}_VALUE';` }, marker, children);
  assert(round.fresh.some(row => row.type === 'tool-workflow/run-end' && row.data.stopReason === 'completed'), 'the actual workflow engine must complete');
  return round;
}

test('actual OMD hot disable, enable and uninstall preserve bases and restore resumable workflow once', { skip: !enabled, timeout: 900000 }, async t => {
  const f = await installedHost(t, configuration(true));
  t.diagnostic('Artifact evidence: ' + JSON.stringify({ host: f.evidence.version,
    omaa: f.evidence.artifact.sha256, omd: f.evidence.omdArtifact.sha256, isolation: f.evidence.isolation }));
  await f.installOmd(); await f.install();
  await profilePatch(f, [await addObserver(f)]); await f.boot();
  const initiallyDisabled = await f.call('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: false });
  assert(!initiallyDisabled.error, JSON.stringify(initiallyDisabled));
  const ids = {}; await fiveBases(f, ids, 'AVAILABLE_NATIVE_BASELINE');
  const id = ids.codex, children = [], child = 'WORKFLOW_AVAIL_CHILD_' + crypto.randomUUID().replaceAll('-', '');
  await expectMode(f, id, 'native');
  assert.equal((await observer(f, id)).workflows[0].resumable, false);
  assert.match((await workflow(f, id, 'AVAILABLE_NATIVE_BEFORE_ENABLE')).text, /AVAILABLE_NATIVE_BEFORE_ENABLE_VALUE/);
  const initiallyEnabled = await f.call('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: true });
  assert(!initiallyEnabled.error, JSON.stringify(initiallyEnabled));
  await fiveBases(f, ids, 'AVAILABLE_INSTALLED');
  await expectMode(f, id, 'omd');
  assert.equal((await f.api(id, { enhancement: true })).value.enhancementActive, true);
  const first = await workflow(f, id, 'AVAILABLE_FIRST_RUN', { script: `export const meta={name:'availability-resume',description:'Resume across optional provider lifecycle'}; return await agent('${child}');` }, children);
  const saved = { runId: first.text.match(/Run ID: (\S+)/)?.[1], scriptPath: first.text.match(/Script: ([^\n]+)/)?.[1] };
  assert(saved.runId && saved.scriptPath, first.text);
  assert(saved.scriptPath.startsWith(f.home + '/'), 'only the isolated host may own saved workflow artifacts');
  assert.deepEqual(children, [child]);
  const disabled = await f.call('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: false });
  assert(!disabled.error, JSON.stringify(disabled));
  // Native dependency reloads can dispose idle Agents. Prompt the same saved
  // sessions first, as the real client does, before observing live scopes.
  await fiveBases(f, ids, 'AVAILABLE_DISABLED');
  await expectMode(f, id, 'native');
  for (const sessionId of Object.values(ids)) {
    const state = await observer(f, sessionId);
    assert.equal(state.mode, 'native'); assert.equal(state.workflows[0].resumable, false);
    assert.equal((await f.api(sessionId)).value.omdAvailable, false);
  }
  assert.match((await workflow(f, id, 'AVAILABLE_NATIVE_AFTER_DISABLE')).text, /AVAILABLE_NATIVE_AFTER_DISABLE_VALUE/);
  const restored = await f.call('pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled: true });
  assert(!restored.error, JSON.stringify(restored));
  await fiveBases(f, ids, 'AVAILABLE_REENABLED');
  await expectMode(f, id, 'omd');
  assert.equal((await observer(f, id)).workflows[0].resumable, true);
  const resumed = await workflow(f, id, 'AVAILABLE_RESUMED', { scriptPath: saved.scriptPath, resumeFromRunId: saved.runId }, children);
  assert.match(resumed.text, new RegExp(child + '_RESULT'));
  assert.deepEqual(children, [child], 'resuming must reuse the prior child result without a duplicate model request');
  assert.equal(f.requests.filter(payload => userText(payload).includes(child)).length, 1, 'the full lifecycle must contain only one request for this child');
  const removed = await f.call('pluginManager/removeBundle', { name: 'trisoul_x' });
  const restartDiagnostic = 'profile resolution: replacing "immer" requires a process restart';
  if (removed.packageResult?.exitCode === 0 && removed.error?.diagnostic === restartDiagnostic) {
    const manifest = JSON.parse(await readFile(join(f.home, 'profiles', 'omaa-fixture', 'package.json'), 'utf8'));
    assert([manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies].every(values => !Object.hasOwn(values ?? {}, 'trisoul_x')), 'the actual package must be uninstalled before accepting the native restart boundary');
    assert(!manifest.dsh.profile.bundles.includes('trisoul_x'), 'the uninstalled bundle must be absent from the saved profile');
    t.diagnostic('Native remove RPC result: ' + JSON.stringify(removed));
    t.diagnostic('Successful package uninstall requires the native immer resolution restart; verifying the same saved sessions after restarting this profile.');
    await f.stop(); await f.boot();
  } else assert(!removed.error, JSON.stringify(removed));
  await fiveBases(f, ids, 'AVAILABLE_UNINSTALLED');
  await expectMode(f, id, 'native');
  assert.match((await workflow(f, id, 'AVAILABLE_NATIVE_AFTER_UNINSTALL')).text, /AVAILABLE_NATIVE_AFTER_UNINSTALL_VALUE/);
  assert.equal(f.requests.filter(payload => userText(payload).includes(child)).length, 1);
  assert.deepEqual(await f.exemptions(), {});
  // This is a separate cold recovery check after successful removal, whether
  // or not the host needed its own guarded resolution restart above.
  await f.stop(); await f.boot();
  await fiveBases(f, ids, 'AVAILABLE_COLD_RESTART');
  for (const sessionId of Object.values(ids)) {
    const state = await observer(f, sessionId);
    assert.equal(state.mode, 'native'); assert.equal(state.workflows[0].resumable, false);
    assert.equal((await f.api(sessionId)).value.omdAvailable, false);
  }
  assert.match((await workflow(f, id, 'AVAILABLE_NATIVE_AFTER_COLD_RESTART')).text, /AVAILABLE_NATIVE_AFTER_COLD_RESTART_VALUE/);
  assert.equal(f.requests.filter(payload => userText(payload).includes(child)).length, 1);
  assert.deepEqual(await f.exemptions(), {}); assert.deepEqual(f.errors, []);
});

async function faultPackage(f, mode, index) {
  const root = join(f.root, 'fault-' + mode), dir = join(root, 'package'); await mkdir(dir, { recursive: true });
  const code = {
    import: 'export function apply( {',
    apply: `export function apply(){throw Error('WORKFLOW_AVAIL_APPLY_FAILURE');}`,
    pending: `export const inject=['workflowAvailabilityNeverProvided'];export function apply(){throw Error('Pending provider must never apply');}`,
    bridge: `export function apply(ctx){ctx.provide('trisoulX',{});}`,
    optional: `export const inject=['subagents'];export function apply(ctx){ctx.subagents.registerProvider({name:'omd-workflow',capabilities:{},inheritsParentContext:false,start(){throw Error('Failing optional branch must never spawn');}});ctx.provide('trisoulX',{omaaWorkflowComposition(){return [{name:${JSON.stringify(pathToFileURL(join(root, 'missing-workflow-branch.mjs')).href)}}];},installOmaaEnhancement(){throw Error('WORKFLOW_AVAIL_OPTIONAL_FAILURE');}});}`,
  }[mode];
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'trisoul_x', version: f.evidence.version + '.omd.0.0.' + index, type: 'module', main: './index.mjs', exports: { '.': './index.mjs' }, dsh: { bundle: { patch: ['./cordis.patch.yml'] } } }));
  await writeFile(join(dir, 'index.mjs'), code);
  // Installation is ordinary and complete; the isolated profile explicitly
  // activates this intentionally faulty row only for the boot being tested.
  await writeFile(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: trisoul-x\n      name: trisoul_x\n      disabled: true\n');
  const path = join(root, 'fault.tgz'); await runFile('tar', ['-czf', path, '-C', root, 'package']);
  await f.command(['plugin', '--profile', 'omaa-fixture', 'add', 'file:' + path]);
}

test('configured OMD import/apply/PENDING and missing bridge cannot drag five base presets', { skip: !enabled, timeout: 900000 }, async t => {
  let index = 0;
  for (const mode of ['import', 'apply', 'pending', 'bridge']) await t.test(mode, async sub => {
    const f = await installedHost(sub, configuration()); await f.install();
    const observe = await addObserver(f);
    await faultPackage(f, mode, ++index);
    await profilePatch(f, [{ id: 'trisoul-x', disabled: false }, observe]);
    const manifest = JSON.parse(await readFile(join(f.home, 'profiles', 'omaa-fixture', 'package.json'), 'utf8'));
    assert(manifest.dsh.profile.bundles.includes('trisoul_x'), 'the OMD bundle must really remain configured');
    await f.boot();
    const ids = {}; await fiveBases(f, ids, 'AVAILABLE_FAULT_' + mode);
    for (const sessionId of Object.values(ids)) {
      const state = await observer(f, sessionId); assert.equal(state.mode, 'native'); assert.equal(state.workflows[0].resumable, false);
      const api = await f.api(sessionId); assert.equal(api.value.omdAvailable, false);
      if (mode === 'bridge') assert.equal(api.value.omdIncompatible, true);
    }
    assert.match((await workflow(f, ids.codex, 'AVAILABLE_NATIVE_' + mode)).text, new RegExp('AVAILABLE_NATIVE_' + mode + '_VALUE'));
    assert.deepEqual(await f.exemptions(), {}); assert.deepEqual(f.errors, []);
  });
});

test('an optional workflow/enhancement branch failure falls back to one working native engine', { skip: !enabled, timeout: 900000 }, async t => {
  const f = await installedHost(t, configuration()); await f.install(); await faultPackage(f, 'optional', 9);
  await profilePatch(f, [{ id: 'trisoul-x', disabled: false }, await addObserver(f)]); await f.boot();
  const ids = {}; await fiveBases(f, ids, 'AVAILABLE_OPTIONAL_FAILED');
  for (const sessionId of Object.values(ids)) {
    const state = await observer(f, sessionId); assert.equal(state.mode, 'native'); assert.equal(state.workflows.length, 1); assert.equal(state.workflows[0].resumable, false);
    const api = await f.api(sessionId); assert.equal(api.value.omdAvailable, false); assert.equal(api.value.enhancementActive, false);
  }
  assert.match((await workflow(f, ids.codex, 'AVAILABLE_OPTIONAL_NATIVE')).text, /AVAILABLE_OPTIONAL_NATIVE_VALUE/);
  assert.deepEqual(await f.exemptions(), {}); assert.deepEqual(f.errors, []);
});
