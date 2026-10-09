import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

// Heavy native installation is deliberate opt-in. Never pack a source checkout
// or infer installed compatibility from a package's declared peer range.
const enabled = process.env.OMAA_COEXIST === '1';
const run = promisify(execFile);
const names = payload => new Set(payload.tools?.map(tool => tool.function.name));
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const system = payload => payload.messages.filter(message => message.role === 'system').map(textOf).join('\n');
const hasMarker = (payload, marker) => payload.messages.some(message => message.role === 'user'
  && (typeof message.content === 'string' ? [message.content] : (message.content ?? []).map(part => part.text ?? '')).some(text => text.trim() === marker));
const request = (f, marker, after = 0) => f.requests.slice(after).find(payload => payload.tools?.length && hasMarker(payload, marker));
const headings = payload => system(payload).split('\n').filter(line => /^#{1,3} |^<[\w:-]+>/.test(line));
const standardEvidence = payload => ({ tools: [...names(payload)].sort(), headings: headings(payload) });
const runtimeSha = '3f501578d2360c58e56a348f1b1b0ee17d6b1fb3db9bb70d78443ed7754b2908';
const runtimeIntegrity = 'sha512-usYVM30d7kH2Fm3ZPkiE84J8bWAicPsw/3Kh8LjbwvHkBkU3IlEYRQFkTDAf+HSRLLs8h5w/5WHkx/FvNKRZ/g==';

function configuration() {
  for (const name of ['OMAA_TEST_HOST_CLI', 'OMAA_TEST_HOST_VERSION', 'OMAA_TEST_HOST_PACKAGE', 'OMAA_TEST_OMD_PACKAGE', 'OMAA_TEST_PUBLIC_STORE']) {
    assert(process.env[name]?.trim(), name + ' is required when OMAA_COEXIST=1');
    if (name !== 'OMAA_TEST_HOST_VERSION') assert(isAbsolute(process.env[name]), name + ' must be an explicit absolute path');
  }
  for (const name of ['OMAA_COEXIST_REPORT', 'OMAA_COEXIST_CODEGRAPH_RUNTIME', 'OMAA_COEXIST_BASELINE_REPORT']) if (process.env[name]) assert(isAbsolute(process.env[name]), name + ' must be absolute');
  if (process.env.OMAA_COEXIST_ORDER) assert(['omd-first', 'omaa-first'].includes(process.env.OMAA_COEXIST_ORDER), 'Unknown coexistence order');
  if (process.env.OMAA_COEXIST_ORDER === 'omaa-first') assert(process.env.OMAA_COEXIST_BASELINE_REPORT, 'Single reverse-order verification requires its same-host frozen baseline report');
  return { cliPath: resolve(process.env.OMAA_TEST_HOST_CLI), expectedHostVersion: process.env.OMAA_TEST_HOST_VERSION,
    packagePath: resolve(process.env.OMAA_TEST_HOST_PACKAGE), omdPackagePath: resolve(process.env.OMAA_TEST_OMD_PACKAGE),
    storeDir: resolve(process.env.OMAA_TEST_PUBLIC_STORE), safeEnvironment: true, piResources: true, installTimeoutMs: 600000 };
}

async function runtimePrerequisite(f) {
  const archive = process.env.OMAA_COEXIST_CODEGRAPH_RUNTIME;
  if (!archive) return { mode: 'native-optional-dependency-or-normal-runtime-preparation', preseeded: false };
  assert(isAbsolute(archive), 'OMAA_COEXIST_CODEGRAPH_RUNTIME must be an explicit absolute tarball path');
  assert.equal(process.platform, 'darwin', 'This frozen CodeGraph runtime is Darwin only');
  assert.equal(process.arch, 'arm64', 'This frozen CodeGraph runtime is ARM64 only');
  const source = await realpath(archive), bytes = await readFile(source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), runtimeSha, 'Official CodeGraph runtime SHA256');
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), runtimeIntegrity, 'Official npm dist.integrity');
  const manifest = JSON.parse((await run('tar', ['-xOf', source, 'package/package.json'], { maxBuffer: 1024 * 1024 })).stdout);
  assert.equal(manifest.name, '@colbymchenry/codegraph-darwin-arm64'); assert.equal(manifest.version, '1.6.0');
  const destination = join(f.home, 'trisoul-x', 'components', 'codegraph', 'bundles', 'darwin-arm64-1.6.0');
  await mkdir(destination, { recursive: true });
  await run('tar', ['-xf', source, '-C', destination, '--strip-components=1'], { timeout: 120000 });
  for (const path of ['node', 'lib/dist/bin/codegraph.js']) assert((await stat(join(destination, path))).isFile(), 'Full upstream runtime is required: ' + path);
  return { mode: 'official-runtime-preseeded-in-normal-OMD-fallback-cache', preseeded: true, source, destination,
    sha256: runtimeSha, integrity: runtimeIntegrity,
    provenance: 'https://registry.npmjs.org/@colbymchenry%2Fcodegraph-darwin-arm64/1.6.0',
    limitation: 'Proves actual indexing with this runtime prerequisite; does not prove registry optionalDependencies installed successfully.' };
}

async function installedEvidence(f, artifact) {
  const value = await f.installedEvidence(artifact.name);
  assert.equal(value.manifest.name, artifact.name); assert.equal(value.manifest.version, artifact.version);
  assert(value.path.startsWith(await realpath(f.home) + '/'), 'Must use the isolated native installation');
  assert.deepEqual(value.linkedRoots, [], 'Source-linked host roots are forbidden');
  // OMAA's service SDK peers must resolve to the actual host. The separate host
  // matrix owns OMD's documented schemastery utility dependency-chain policy.
  if (artifact.name === 'oh-my-agents-above-all') {
    assert(Object.keys(value.sdk).length > 0, 'Actual native SDK peer evidence is required');
    for (const [name, peer] of Object.entries(value.sdk)) {
      assert.equal(peer.pluginVersion, peer.hostVersion, name + ' SDK version mismatch');
      assert.equal(peer.pluginPath, peer.hostPath, name + ' must share the real host SDK');
      assert.equal(peer.pluginModule, peer.hostModule, name + ' must share the real host module');
      assert.equal(peer.routingScope, 'installation', name + ' must use native installation routing');
    }
    assert(value.nativeHostDetection?.available, 'Candidate must expose actual native host detection');
    assert.equal(value.nativeHostDetection.version, f.evidence.version);
  }
  assert.deepEqual(await f.exemptions(), {}, 'Native peer/version exemptions must remain empty');
  return value;
}

async function toolRound(f, id, marker, name, args, { expectedError = false, advertised = true, timeout = 30000, capture = () => {} } = {}) {
  const before = (await f.snapshot(id)).projections.asOfSeq;
  let callId;
  f.replyWith(payload => {
    assert.equal(payload.model, 'fixture', 'Only the explicit localhost model may run');
    // Context/Dream/title requests quoting a marker must not issue a business
    // tool. The native user turn is the only accepted dispatch lane.
    if (payload.tools?.length && hasMarker(payload, marker) && !callId) {
      if (advertised) assert(names(payload).has(name), name + ' is absent from the actual provider wire');
      const reply = toolReply(name, args); callId = reply.delta.tool_calls[0].id; return reply;
    }
    return textReply('Local coexistence fixture completed.');
  });
  try {
    const indexed = await f.prompt(id, marker, { timeout });
    const fresh = indexed.records.map(row => row.event).filter(row => row?.seq > before);
    const call = fresh.find(row => row.type === 'tool/call' && row.data.callId === callId);
    const result = fresh.find(row => row.type === 'tool/result' && row.data.message?.toolCallId === callId);
    capture({ beforeSeq: before, issuedCallId: callId, callEvent: call, resultEvent: result });
    assert.equal(call?.data.name, name, 'This turn must journal the issued native tool call');
    assert.equal(fresh.filter(row => row.type === 'tool/call' && row.data.callId === callId).length, 1, 'Only one native engine may execute this call');
    assert.equal(fresh.filter(row => row.type === 'tool/result' && row.data.message?.toolCallId === callId).length, 1, 'The issued call must have one native result');
    assert(result && result.seq > call.seq, 'This turn must journal the paired tool result');
    assert.equal(result.data.message.source?.callId, callId);
    assert(result.sourceEventSeqs?.includes(call.seq), 'Tool result must cite this call event');
    assert.equal(Boolean(result.data.message.isError), expectedError, textOf(result.data.message));
    return { beforeSeq: before, callSeq: call.seq, resultSeq: result.seq, callId, name,
      callEvent: call, resultEvent: result, resultSourceEventSeqs: result.sourceEventSeqs, isError: Boolean(result.data.message.isError), text: textOf(result.data.message) };
  } finally { f.replyWith(); }
}

async function readyApi(f, id, samples) {
  const started = Date.now(), deadline = started + 10000;
  while (Date.now() < deadline) {
    const response = await fetch(f.origin + '/omaa/api/session?session=' + encodeURIComponent(id), { headers: { cookie: f.cookie },
      signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))) });
    const api = { status: response.status, value: await response.json() };
    samples.push({ at: new Date().toISOString(), elapsedMs: Date.now() - started, ...api });
    if (api.status === 200 && api.value.omdAvailable === true) return api;
    if (Date.now() < deadline) await delay(Math.min(200, deadline - Date.now()));
  }
  return samples.at(-1);
}

test('frozen OMD and OMAA preserve standard, guarded opt-in tools, actual CodeGraph and cold recovery in both native installation orders', {
  skip: !enabled && 'Not executed: set OMAA_COEXIST=1 and explicit frozen inputs; this skip is not compatibility evidence.',
  timeout: 3600000,
}, async t => {
  const report = { kind: 'actual-omaa-omd-coexistence', startedAt: new Date().toISOString(), completed: false, passed: false,
    scenarios: [], limitations: ['Synthetic localhost model; enabled Computer Use hardware/browser execution is not exercised.',
      'Fixture isolation and actual SDK routing are recorded; the separate host matrix owns full OMD SDK utility-chain verification.'] };
  const save = async () => {
    if (!process.env.OMAA_COEXIST_REPORT) return;
    assert(isAbsolute(process.env.OMAA_COEXIST_REPORT), 'OMAA_COEXIST_REPORT must be absolute');
    const path = resolve(process.env.OMAA_COEXIST_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2));
  };
  t.after(async () => {
    report.completedAt = new Date().toISOString();
    report.completed = t.passed === true && report.scenarios.length === report.requestedOrders?.length && report.scenarios.every(row => row.status === 'passed');
    report.passed = report.completed;
    report.status = report.passed ? 'passed' : 'failed-or-incomplete';
    await save();
    t.diagnostic(JSON.stringify({ completed: report.completed, passed: report.passed, scenarios: report.scenarios.map(({ order, status, runtime, codegraph, failure }) => ({ order, status, runtime, codegraph, failure })) }));
  });
  let config;
  try { config = configuration(); }
  catch (error) { report.failure = { stage: 'configuration', message: error.message }; throw error; }
  report.inputs = config;
  const orders = process.env.OMAA_COEXIST_ORDER ? [process.env.OMAA_COEXIST_ORDER] : ['omd-first', 'omaa-first'];
  report.requestedOrders = orders;
  await save();
  let stockBefore, nativeBefore;
  let baseline;
  if (process.env.OMAA_COEXIST_BASELINE_REPORT) {
    const bytes = await readFile(process.env.OMAA_COEXIST_BASELINE_REPORT); baseline = JSON.parse(bytes).scenarios?.find(row => row.order === 'omd-first' && row.status === 'passed');
    assert(baseline?.standardPreserved && baseline.coldRestored && baseline.originalDshRestored, 'Original order must have passed real lifecycle checks');
    assert.equal(baseline.fixture.version, config.expectedHostVersion);
    stockBefore = baseline.omdOnlyStandard; nativeBefore = baseline.originalDshStandard;
    assert(stockBefore?.tools && nativeBefore?.tools, 'Actual original/OMD-only standard baselines are required');
    report.baselineControl = { file: process.env.OMAA_COEXIST_BASELINE_REPORT, sha256: createHash('sha256').update(bytes).digest('hex'),
      omdSha256: baseline.fixture.omdArtifact.sha256, omaaSha256: baseline.fixture.artifact.sha256, sourceOrder: 'omd-first' };
  }
  for (const order of orders) await t.test(order, { timeout: 1800000 }, async sub => {
    const evidence = { order, status: 'running' }; report.scenarios.push(evidence);
    const progress = async stage => { evidence.stage = stage; evidence.updatedAt = new Date().toISOString(); await save(); };
    let f;
    try {
      await progress('prepare-isolated-real-host');
      f = await installedHost(sub, config); evidence.fixture = f.evidence;
      if (baseline) {
        assert.equal(f.evidence.omdArtifact.sha256, baseline.fixture.omdArtifact.sha256, 'Baseline must use the identical frozen OMD');
        assert.equal(f.evidence.artifact.sha256, baseline.fixture.artifact.sha256, 'Baseline must use the identical frozen OMAA');
        assert.equal(f.evidence.cli, baseline.fixture.cli, 'Baseline must use the identical real host CLI');
      }
      // Keep all calls on the fixture provider, including optional background
      // lanes; this selects a local model without changing enhancement flags.
      const settingsPath = join(f.home, 'settings.yaml'), settings = JSON.parse(await readFile(settingsPath, 'utf8'));
      settings['trisoul-x'] = { ...settings['trisoul-x'], unifiedBackground: { provider: 'fixture', model: 'fixture', effort: 'off' }, dreamProvider: 'fixture', dreamModel: 'fixture' };
      await writeFile(settingsPath, JSON.stringify(settings));
      evidence.runtime = await runtimePrerequisite(f);
      if (order === 'omd-first') {
        await progress('same-host-original-control');
        await f.boot();
        const native = await f.create('standard'), nativeFrom = f.requests.length;
        await f.prompt(native.sessionId, 'COEXIST_NATIVE_STANDARD');
        const nativeRequest = request(f, 'COEXIST_NATIVE_STANDARD', nativeFrom); assert(nativeRequest);
        nativeBefore = standardEvidence(nativeRequest); evidence.originalDshStandard = nativeBefore;
        await f.stop();
        await progress('native-install-omd'); await f.installOmd(); await f.boot();
        const baseline = await f.create('standard'); const from = f.requests.length; await f.prompt(baseline.sessionId, 'COEXIST_OMD_ONLY_STANDARD');
        const stockRequest = request(f, 'COEXIST_OMD_ONLY_STANDARD', from); assert(stockRequest);
        stockBefore = standardEvidence(stockRequest); evidence.omdOnlyStandard = stockBefore;
        await f.stop(); await progress('native-install-omaa'); await f.install();
      } else { await progress('native-install-omaa'); await f.install(); await progress('native-install-omd'); await f.installOmd(); }
      await progress('actual-native-sdk-routing');
      evidence.installed = { omaa: await installedEvidence(f, f.evidence.artifact), omd: await installedEvidence(f, f.evidence.omdArtifact) };
      await f.boot();
      await progress('off-on-session-composition');
      const id = (await f.create(order === 'omd-first' ? 'omaa-codex' : 'omaa-grok')).sessionId;
      const initial = await f.api(id); evidence.initialApi = initial; await save(); assert.equal(initial.status, 200, JSON.stringify(initial));
      assert.equal(initial.value.enhancementActive, false);
      const offMarker = 'COEXIST_DEFAULT_OFF_' + order, from = f.requests.length;
      await f.prompt(id, offMarker); const ordinary = request(f, offMarker, from); assert(ordinary);
      // Native session/create saves a header; the first ordinary prompt realizes
      // the Agent scope. Preserve the initial API observation and require the
      // real optional bridge after this actual base turn, before opting in.
      evidence.readiness = [];
      const realized = await readyApi(f, id, evidence.readiness); evidence.realizedApi = realized; await save();
      assert.equal(realized.status, 200, JSON.stringify(realized));
      assert.equal(realized.value.omdAvailable, true, JSON.stringify(realized)); assert.equal(realized.value.enhancementActive, false);
      assert(!names(ordinary).has('computer_use')); assert(!names(ordinary).has('codegraph_index'));
      assert(!system(ordinary).includes('CodeGraph is bundled')); assert(!system(ordinary).includes('TODO_NUDGE'));
      const enabledState = await f.api(id, { enhancement: true }); assert.equal(enabledState.status, 200, JSON.stringify(enabledState)); assert.equal(enabledState.value.enhancementActive, true);
      const onMarker = 'COEXIST_ENABLED_' + order, onFrom = f.requests.length;
      await f.prompt(id, onMarker); const on = request(f, onMarker, onFrom); assert(on);
      for (const name of ['computer_use', 'computer_use_reset', 'codegraph_index']) assert(names(on).has(name), name + ' absent with OMD enhancement');
      assert(JSON.stringify(on.messages).includes('CodeGraph is bundled'), 'Enabled guide must reach the real provider');
      await writeFile(join(f.workspace, 'example.mjs'), 'export function sum(a,b) { return a+b; }\n');
      await progress('actual-codegraph-index');
      evidence.codegraph = await toolRound(f, id, 'COEXIST_NATIVE_CODEGRAPH_' + order, 'codegraph_index', {}, { timeout: 180000, capture: value => { evidence.codegraph = value; } });
      const database = join(f.workspace, '.codegraph', 'codegraph.db'), databaseBytes = (await stat(database)).size;
      assert(databaseBytes > 0, 'Actual CodeGraph must write a nonempty project index database');
      Object.assign(evidence.codegraph, { database, databaseBytes });
      await progress('actual-disabled-tool-guard');
      const disabled = await f.api(id, { enhancement: false }); assert.equal(disabled.status, 200); assert.equal(disabled.value.enhancementActive, false);
      evidence.guard = await toolRound(f, id, 'COEXIST_DISABLED_GUARD_' + order, 'computer_use', { command: 'snapshot' }, { expectedError: true, advertised: false, capture: value => { evidence.guard = value; } });
      assert.match(evidence.guard.text, /OMD enhancement is disabled/);
      const stock = await f.create('standard'), stockMarker = 'COEXIST_STANDARD_' + order, stockFrom = f.requests.length;
      await f.prompt(stock.sessionId, stockMarker); const stockRequest = request(f, stockMarker, stockFrom); assert(stockRequest);
      assert(!system(stockRequest).includes('You are Codex'));
      assert.deepEqual(standardEvidence(stockRequest), stockBefore, 'OMAA must preserve existing OMD standard tools and sections');
      evidence.standardPreserved = true;
      await progress('cold-session-recovery');
      await f.stop(); await f.boot();
      const cold = await f.api(id); assert.equal(cold.status, 200); assert.equal(cold.value.enhancement, false); assert.equal(cold.value.enhancementActive, false);
      await f.prompt(id, 'COEXIST_COLD_RESTORED_' + order); evidence.coldRestored = true;
      await f.stop(); await progress('native-uninstall-omaa'); await f.uninstall(); await progress('native-uninstall-omd'); await f.removeOmd(); await f.boot();
      const restored = await f.create('standard'), restoredMarker = 'COEXIST_UNINSTALLED_' + order, restoredFrom = f.requests.length;
      await f.prompt(restored.sessionId, restoredMarker); const restoredRequest = request(f, restoredMarker, restoredFrom); assert(restoredRequest);
      assert.deepEqual(standardEvidence(restoredRequest), nativeBefore, 'Uninstall must restore the same-host original tools and sections');
      evidence.originalDshRestored = true;
      assert.deepEqual(await f.exemptions(), {}); assert.deepEqual(f.errors, []);
      await f.stop(); evidence.status = 'passed'; await progress('execution-completed-awaiting-fixture-cleanup');
    } catch (error) { evidence.status = 'failed'; evidence.failure = { message: error.message, stack: error.stack }; evidence.modelRequests = f?.requests; evidence.providerErrors = f?.errors; await save(); throw error; }
  });
  assert(report.scenarios.every(row => row.status === 'passed'), 'Every requested native installation order must complete');
});
