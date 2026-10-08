import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { installedHost, packageEvidence, fixtureEnvironment, until, textReply, toolReply } from './fixtures/installed-host.mjs';

// Opt in with OMAA_HOST_MATRIX=1, OMAA_HOST_CLI, OMAA_HOST_VERSION,
// OMAA_HOST_PACKAGE and OMAA_HOST_BROWSER (an isolated CFT executable).
// Optional: OMAA_HOST_OMD_PACKAGE and OMAA_HOST_REPORT. No desktop state,
// real model credentials, source checkout links, or compatibility exemptions.
const products = [
  { id: 'codex', name: 'Codex', theme: 'codex-desktop' },
  { id: 'grok', name: 'Grok Build', theme: 'grok-build' },
  { id: 'cursor', name: 'Cursor', theme: 'cursor-cli' },
  { id: 'pi', name: 'Pi Coding Agent', theme: 'pi-coding-agent' },
  { id: 'zcode', name: 'ZCode', theme: 'zcode' },
];
const enabled = process.env.OMAA_HOST_MATRIX === '1';
const tools = payload => new Set(payload.tools?.map(row => row.function.name) ?? []);
const system = payload => payload.messages.filter(row => row.role === 'system').map(row => typeof row.content === 'string' ? row.content : row.content.map(part => part.text ?? '').join('\n')).join('\n');
const request = (f, marker, after = 0) => f.requests.slice(after).find(row => row.tools?.length && JSON.stringify(row.messages).includes(marker));
const assertEmpty = value => assert.equal(Object.keys(value).length, 0, 'native compatibility exemptions must remain empty');

async function configuration() {
  const env = process.env;
  for (const name of ['OMAA_HOST_CLI', 'OMAA_HOST_VERSION', 'OMAA_HOST_PACKAGE', 'OMAA_HOST_BROWSER']) assert(env[name]?.trim(), name + ' is required for opt-in host compatibility tests');
  const browserPath = resolve(env.OMAA_HOST_BROWSER);
  assert((await stat(browserPath)).isFile(), 'OMAA_HOST_BROWSER must be a regular executable');
  return { cliPath: resolve(env.OMAA_HOST_CLI), expectedHostVersion: env.OMAA_HOST_VERSION, packagePath: resolve(env.OMAA_HOST_PACKAGE), ...(env.OMAA_HOST_OMD_PACKAGE ? { omdPackagePath: resolve(env.OMAA_HOST_OMD_PACKAGE) } : {}), browserPath: await realpath(browserPath), safeEnvironment: true, piResources: true };
}
async function verifyInstalled(f, artifact, capture = () => {}) {
  const installed = await f.installedEvidence(artifact.name); capture(installed);
  assert.equal(installed.manifest.name, artifact.name);
  assert.equal(installed.manifest.version, artifact.version);
  assert(installed.path.startsWith(await realpath(f.home) + '/'), 'installed package must resolve inside isolated DSH_HOME');
  assert(!installed.path.includes('/workspace/'), 'package must not resolve to a source workspace');
  const profileRoot = await realpath(resolve(f.home, 'profiles/omaa-fixture'));
  const assertProfilePath = (path, label) => assert(path.startsWith(profileRoot + '/'), label + ' must stay inside the isolated profile');
  const verifyPeers = (owner, peers) => {
    for (const [name, row] of Object.entries(peers)) {
      const label = owner + ' -> ' + name;
      assert.equal(row.pluginVersion, row.hostVersion, label + ' resolved a different SDK version');
      if (artifact.name === 'trisoul_x' && name === '@deepseek-ai/schemastery' && row.pluginPath !== row.hostPath) {
        const chain = installed.utilityDependencyChains?.[name];
        assert(chain?.length, 'OMD utility exception requires a proved ordinary dependency chain');
        assert.equal(chain.at(-1).targetManifest, row.pluginPath);
        assert.equal(chain.at(-1).targetVersion, row.hostVersion);
        assertProfilePath(row.pluginPath, label + ' utility package');
        assertProfilePath(row.pluginModule, label + ' utility module');
        for (const hop of chain) {
          assertProfilePath(hop.declaringManifest, label + ' declaring manifest');
          assertProfilePath(hop.targetManifest, label + ' ordinary target');
          assert.equal(hop.field, 'dependencies');
          assert.equal(typeof hop.specifier, 'string');
          assert(hop.specifier.trim().length > 0 && !hop.specifier.includes('/'), 'ordinary utility chain must use registry version/range declarations');
          assert(!/^(?:file|link|workspace|git(?:\+[^:]+)?|github|gitlab|bitbucket|https?|ssh):|^(?:\.\.?[/\\]|[/\\]|[A-Za-z]:[/\\])|^[^@\s]+@[^:\s]+:|\.git(?:[#?]|$)/i.test(hop.specifier), 'ordinary utility dependency must use a registry specifier');
        }
        row.interoperability = { utilityCopy: true, reason: 'OMD ordinary dependency chain supplies same-version schemastery; shared native service peers remain strict.', chain };
        continue;
      }
      assert.equal(row.pluginPath, row.hostPath, label + ' must share the actual host SDK package');
      assert.equal(row.pluginModule, row.hostModule, label + ' must share the actual native module target');
      assert.equal(row.routingScope, 'installation', label + ' must be supplied by the host installation');
    }
  };
  verifyPeers(artifact.name, installed.sdk);
  for (const owner of installed.ordinaryDeclaringPeerSdk ?? []) verifyPeers(owner.declaringPackage, owner.peers);
  if (Object.keys(installed.utilityDependencyChains ?? {}).length) {
    const expected = [...new Set(Object.values(installed.utilityDependencyChains).flat().map(row => row.declaringManifest))].sort();
    assert.deepEqual((installed.ordinaryDeclaringPeerSdk ?? []).map(row => row.declaringManifest).sort(), expected, 'every ordinary declaring package must have native peer evidence');
  }
  assert.deepEqual(installed.linkedRoots, [], 'source-linked profile roots are forbidden');
  if (artifact.name === 'oh-my-agents-above-all') {
    assert(installed.nativeHostDetection?.available, 'candidate must expose installed nativeHostVersion()');
    assert.equal(installed.nativeHostDetection.version, f.evidence.version, 'runtime host detection must use the actual CLI SDK rather than the source package prefix');
  }
  assertEmpty(await f.exemptions());
  return installed;
}
async function browserChecks(t, f, config, sessions, coexist = false) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: config.browserPath, headless: true, env: fixtureEnvironment(f.home, true), args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20000);
  await page.goto(f.origin);
  await page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }).click();
  const loader = await page.evaluate(() => ({ present: !!window.__ModuleLoader__, load: typeof window.__ModuleLoader__?.load }));
  assert.deepEqual(loader, { present: true, load: 'function' }, 'use the real native ModuleLoader');
  const checks = [];
  for (const product of products) {
    await page.getByText('HOST_MATRIX_' + product.id, { exact: true }).first().click();
    await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 1);
    await page.getByRole('button', { name: product.name + ' 预设设置' }).click();
    const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置' });
    const enhancement = panel.getByLabel('OMD 增强', { exact: true });
    assert.equal(await enhancement.isChecked(), false);
    assert.equal(await enhancement.isDisabled(), !coexist);
    await panel.getByLabel('明暗模式', { exact: true }).selectOption('dark');
    await page.locator('html[data-appearance="dark"]').waitFor();
    await panel.getByLabel('明暗模式', { exact: true }).selectOption('light');
    await page.locator('html[data-appearance="light"]').waitFor();
    const mode = panel.getByLabel('工作模式', { exact: true });
    if (product.id === 'pi') {
      assert.equal(await mode.count(), 0, 'Pi intentionally exposes a fixed execution mode');
      await panel.getByText('执行（Pi 默认模式）', { exact: true }).waitFor();
      assert.equal((await f.api(sessions[product.id], { mode: 'plan' })).status, 400);
    }
    else for (const value of ['ask', 'plan', 'default']) {
      await mode.selectOption(value);
      await until(async () => (await f.api(sessions[product.id])).value.mode === value);
    }
    checks.push({ preset: product.id, theme: product.theme, modes: product.id === 'pi' ? ['default'] : ['ask', 'plan', 'default'] });
  }
  assert.deepEqual(errors, []);
  await browser.close();
  return { version: browser.version(), executable: config.browserPath, nativeModuleLoader: loader, checks, pageErrors: errors };
}
async function createSessions(f) {
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const sessions = {};
  for (const product of products) {
    const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-' + product.id });
    sessions[product.id] = created.sessionId;
    await f.rpc('session/rename', { sessionId: created.sessionId, title: 'HOST_MATRIX_' + product.id });
  }
  return sessions;
}
async function nativeCycles(f, sessions, enhancement = false) {
  const result = [];
  for (const product of products) {
    const id = sessions[product.id], file = product.id + '-native.txt', sentinel = 'HOST_NATIVE_' + product.id;
    const settings = await f.api(id);
    assert.equal(settings.status, 200); assert.equal(settings.value.product.id, product.id);
    assert.equal(settings.value.enhancementActive, enhancement);
    let step = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (step++ === 0) return toolReply('write', { file_path: file, content: sentinel });
      if (step === 2) return toolReply('read', { file_path: file });
      return textReply('Native host cycle complete: ' + sentinel);
    });
    const before = (await f.snapshot(id)).projections.asOfSeq;
    const from = f.requests.length, marker = 'HOST_TOOL_ROUND_' + product.id + (enhancement ? '_ENHANCED' : '');
    const snapshot = await f.prompt(id, marker);
    assert.equal(await f.readWorkspace(file), sentinel);
    assert(JSON.stringify(snapshot.records).includes(sentinel), product.id + ' native result must be journaled');
    const payload = request(f, marker, from); assert(payload, product.id + ' never reached the localhost model');
    for (const name of ['read', 'write', 'edit', process.platform === 'win32' ? 'pwsh' : 'bash']) assert(tools(payload).has(name), product.id + ' missing native tool ' + name);
    const toolResults = snapshot.records.filter(row => row.event?.type === 'tool/result' && row.event.seq > before);
    assert(toolResults.length >= 2, product.id + ' did not execute native write/read');
    assert(toolResults.every(row => !row.event.data.message?.isError), product.id + ' native tool failed');
    result.push({ preset: product.id, nativeToolResults: toolResults.length, tools: [...tools(payload)].sort(), modelRequests: f.requests.length - from });
    f.replyWith();
  }
  return result;
}

test('explicit real host and packed OMAA compatibility matrix', { timeout: 600000 }, async t => {
  if (!enabled) { t.skip('Set OMAA_HOST_MATRIX=1 and explicit CLI, host version, tgz and CFT paths to run real host acceptance.'); return; }
  const report = { schema: 1, startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, stages: [], coexistence: [], status: 'running' };
  let stage = 'configuration';
  const run = async (name, fn) => { stage = name; const value = await fn(); report.stages.push({ name, status: 'passed', evidence: value }); return value; };
  try {
    const config = await run('configuration', configuration);
    const artifact = await run('artifact', () => packageEvidence(config.packagePath));
    report.hostVersion = config.expectedHostVersion; report.packSha256 = artifact.sha256; report.packageVersion = artifact.version;
    const f = await run('isolated-host', () => installedHost(t, config));
    // Do not serialize the fixture's functions or access tokens.
    report.stages.at(-1).evidence = { ...f.evidence, artifact: { ...artifact, files: undefined, manifest: undefined } };
    await run('native-baseline', async () => { await f.boot(); const s = await f.create('standard'); await f.prompt(s.sessionId, 'HOST_STOCK_BASELINE'); const payload = request(f, 'HOST_STOCK_BASELINE'); assert(payload); await f.stop(); return { sessionId: s.sessionId, tools: [...tools(payload)].sort() }; });
    await run('native-install', () => f.install());
    await run('shared-sdk-and-empty-exemptions', () => verifyInstalled(f, artifact));
    await run('native-boot', () => f.boot());
    const sessions = await run('five-native-sessions', () => createSessions(f));
    await run('five-localhost-tool-rounds', () => nativeCycles(f, sessions));
    await run('native-module-loader-ui-settings-modes', () => browserChecks(t, f, config, sessions));
    await run('native-stop-and-continue', async () => {
      const id = sessions.pi, release = f.holdNextReply(), from = f.requests.length;
      await f.send(id, 'HOST_STOP_STREAM'); await until(() => request(f, 'HOST_STOP_STREAM', from));
      assert.equal((await f.api(id)).value.running, true);
      await f.rpc('session/cancel', { sessionId: id }); release();
      await until(async () => !(await f.api(id)).value.running);
      assert.equal((await f.snapshot(id)).records.findLast(row => row.event?.type === 'turn/end')?.event.data.reason.kind, 'aborted');
      await f.prompt(id, 'HOST_CONTINUE_AFTER_STOP'); return { aborted: true, resumed: true };
    });
    await run('cold-restart', async () => {
      await f.api(sessions.grok, { mode: 'plan' });
      const before = (await f.snapshot(sessions.grok)).projections.asOfSeq;
      await f.stop(); await f.boot();
      assert.equal((await f.api(sessions.grok)).value.mode, 'plan');
      assert((await f.snapshot(sessions.grok)).projections.asOfSeq >= before);
      await f.api(sessions.grok, { mode: 'default' }); await f.prompt(sessions.grok, 'HOST_COLD_CONTINUE'); return { retainedMode: 'plan', resumed: true };
    });
    await run('bundle-disable-enable', async () => {
      await f.stop(); await f.bundleEnabled(false); await f.boot();
      const disabled = await f.create('standard'); await f.prompt(disabled.sessionId, 'HOST_DISABLED');
      const response = await fetch(f.origin + '/omaa/api/session?session=' + disabled.sessionId, { headers: { cookie: f.cookie } });
      assert.equal(response.status, 404, 'disabled bundle must unmount OMAA API');
      await f.stop(); await f.bundleEnabled(true); await f.boot();
      assert.equal((await f.api(sessions.codex)).status, 200);
      await f.prompt(sessions.codex, 'HOST_REENABLED'); return { disabledApiStatus: response.status, resumed: true };
    });
    await run('native-uninstall', async () => {
      await f.stop(); await f.uninstall(); await f.boot();
      const standard = await f.create('standard'); await f.prompt(standard.sessionId, 'HOST_AFTER_UNINSTALL');
      const payload = request(f, 'HOST_AFTER_UNINSTALL'); assert(payload);
      assert(!system(payload).includes('Pi Coding Agent preset'));
      assert.deepEqual([...tools(payload)].sort(), report.stages.find(row => row.name === 'native-baseline').evidence.tools);
      assertEmpty(await f.exemptions()); await f.stop(); assert.deepEqual(f.errors, []); return { nativeToolsRestored: true };
    });
    for (const order of ['omd-first', 'omaa-first']) await t.test('actual packed coexistence ' + order, { skip: !config.omdPackagePath && 'No OMAA_HOST_OMD_PACKAGE supplied; coexistence was not verified.' }, async sub => {
      stage = 'coexistence-' + order;
      const sdkEvidence = {};
      try {
      const co = await installedHost(sub, config);
      const packages = order === 'omd-first' ? [() => co.installOmd(), () => co.install()] : [() => co.install(), () => co.installOmd()];
      for (const install of packages) await install();
      await verifyInstalled(co, artifact, value => sdkEvidence.omaa = value); const omd = await verifyInstalled(co, co.evidence.omdArtifact, value => sdkEvidence.omd = value);
      await co.boot(); const ids = await createSessions(co); await nativeCycles(co, ids);
      const browser = await browserChecks(sub, co, config, ids, true);
      const enabledChecks = [];
      for (const product of products) {
        const id = ids[product.id];
        assert.equal((await co.api(id)).value.omdAvailable, true);
        const before = co.requests.length; await co.prompt(id, 'HOST_COEXIST_OFF_' + product.id);
        assert(!tools(request(co, 'HOST_COEXIST_OFF_' + product.id, before)).has('computer_use'));
        assert.equal((await co.api(id, { enhancement: true })).value.enhancementActive, true);
        const from = co.requests.length; await co.prompt(id, 'HOST_COEXIST_ON_' + product.id);
        const payload = request(co, 'HOST_COEXIST_ON_' + product.id, from);
        for (const name of ['computer_use', 'computer_use_reset', 'codegraph_index']) assert(tools(payload).has(name), product.id + ' enhancement missing ' + name);
        enabledChecks.push({ preset: product.id, enhancementActive: true, tools: [...tools(payload)].sort() });
      }
      const enhancedNative = await nativeCycles(co, ids, true);
      // Exercise an actual safe bundled OMD tool. Never call computer_use:
      // browser/keychain/desktop drivers are outside this acceptance fixture.
      const codegraphBefore = (await co.snapshot(ids.codex)).projections.asOfSeq;
      let step = 0, issuedCodegraphCallId;
      co.replyWith(payload => {
        if (payload.tools?.length && step++ === 0) {
          const reply = toolReply('codegraph_index', {}); issuedCodegraphCallId = reply.delta.tool_calls[0].id; return reply;
        }
        return textReply('Bundled CodeGraph complete.');
      });
      const indexed = await co.prompt(ids.codex, 'HOST_COEXIST_CODEGRAPH');
      const fresh = indexed.records.map(row => row.event).filter(event => event?.seq > codegraphBefore);
      const indexCall = fresh.find(event => event.type === 'tool/call' && event.data.name === 'codegraph_index' && event.data.callId === issuedCodegraphCallId);
      assert(indexCall, 'this round must journal the issued codegraph_index call');
      const indexResult = fresh.find(event => event.type === 'tool/result' && event.data.message?.toolCallId === indexCall.data.callId);
      if (indexResult?.data.name !== undefined) assert.equal(indexResult.data.name, 'codegraph_index');
      assert.equal(indexResult?.data.message?.source?.callId, indexCall.data.callId);
      assert(indexResult?.sourceEventSeqs?.includes(indexCall.seq), 'the result must cite this codegraph_index call event');
      assert(indexResult && indexResult.seq > indexCall.seq && !indexResult.data.message.isError, 'this round must journal a successful paired codegraph_index result');
      const codegraphEvidence = { beforeSeq: codegraphBefore, callSeq: indexCall.seq, resultSeq: indexResult.seq, callId: indexCall.data.callId, name: indexCall.data.name, resultSourceEventSeqs: indexResult.sourceEventSeqs, isError: Boolean(indexResult.data.message.isError) };
      co.replyWith();
      for (const id of Object.values(ids)) await co.api(id, { enhancement: false });
      await co.stop(); await co.boot();
      for (const id of Object.values(ids)) assert.equal((await co.api(id)).value.enhancementActive, false);
      await co.stop(); await co.uninstall(); await co.removeOmd(); await co.boot();
      const stock = await co.create('standard'); await co.prompt(stock.sessionId, 'HOST_COEXIST_UNINSTALLED');
      assertEmpty(await co.exemptions()); assert.deepEqual(co.errors, []);
      report.coexistence.push({ order, status: 'passed', packSha256: co.evidence.omdArtifact.sha256, packageVersion: omd.manifest.version, browser, sdkEvidence, enabledChecks, enhancedNative, codegraphExecuted: true, codegraphEvidence });
      } catch (error) { report.coexistence.push({ order, status: 'failed', message: error.message, sdkEvidence }); throw error; }
    });
    if (!config.omdPackagePath) report.coexistence = ['omd-first', 'omaa-first'].map(order => ({ order, status: 'skipped', reason: 'No explicit OMD tarball supplied' }));
    assert(!report.coexistence.some(row => row.status === 'failed'), 'one or more coexistence subtests failed');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = { stage, message: error.message }; throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    t.diagnostic(JSON.stringify({ status: report.status, hostVersion: report.hostVersion, packSha256: report.packSha256, failure: report.failure, stages: report.stages.map(row => row.name), coexistence: report.coexistence.map(({ order, status, packSha256, packageVersion, reason, message, codegraphExecuted }) => ({ order, status, packSha256, packageVersion, reason, message, codegraphExecuted })) }));
    if (process.env.OMAA_HOST_REPORT) {
      const path = resolve(process.env.OMAA_HOST_REPORT); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    }
  }
});
