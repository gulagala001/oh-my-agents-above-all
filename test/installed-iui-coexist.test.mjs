import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { products } from '../src/shared/products.mjs';
import { fixtureEnvironment, installedHost, packageEvidence, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const fields = [{ name: 'place', label: '地点', type: 'text', value: '初始', required: true }, { name: 'count', label: '数量', type: 'number', value: 0, min: 0, max: 10 }, { name: 'enabled', label: '启用', type: 'checkbox', value: false }];
// Original IUI catalog positional contract: title, fields, children, submitText, message.
const source = `root = Form("组合验收",${JSON.stringify(fields)},[Text("组合验收")],"提交表单","IUI_SUBMIT_COMBINED")`;
const response = label => label + '\n\n```openui\n' + source + '\n```';

const enabled = process.env.OMAA_IUI_COEXIST === '1' || Boolean(process.env.OMAA_TEST_IUI_PACKAGE);
test('fixed original IUI Forms remain editable, durable and native-submittable across five enhanced OMAA presets and lifecycle', { timeout: 600000,
  skip: !enabled && 'Set OMAA_IUI_COEXIST=1 with explicit frozen OMAA, OMD, IUI and stock host evidence to run this native acceptance.' }, async t => {
  for (const name of ['OMAA_TEST_HOST_PACKAGE', 'OMAA_TEST_HOST_PACKAGE_SHA256', 'OMAA_TEST_OMD_PACKAGE', 'OMAA_TEST_OMD_PACKAGE_SHA256', 'OMAA_TEST_IUI_PACKAGE', 'OMAA_TEST_IUI_PACKAGE_SHA256', 'OMAA_IUI_STOCK_BLANK_EVIDENCE']) assert(process.env[name], 'Explicit frozen input/evidence required: ' + name);
  const out = resolve(process.env.OMAA_IUI_COEXIST_EVIDENCE_DIR || 'work/rea-upgrade/iui-coexist/actual'); await mkdir(out, { recursive: true });
  let f, context, page, installedIui, nativeReadSent = false;
  const sessions = [], checks = [], errors = [], warnings = [], nativeSubmissions = [], userLayerChecks = [], readiness = [];
  const stockBlankEvidencePath = resolve(process.env.OMAA_IUI_STOCK_BLANK_EVIDENCE);
  const stockBlankBytes = await readFile(stockBlankEvidencePath), stockBlankReport = JSON.parse(stockBlankBytes);
  assert.equal(stockBlankReport.stockOnly, true); assert.equal(stockBlankReport.passed, true);
  assert.equal(stockBlankReport.host.version, process.env.OMAA_TEST_HOST_VERSION, 'Missing-preset blank limitation must link the same stock host');
  assert(stockBlankReport.checks.includes('Current default is standard'));
  assert(stockBlankReport.browserResponses.some(row => row.stage === 'after-removal' && row.response.result.error?.code === 'agent-preset/not-found'));
  const stockBlankEvidence = { path: stockBlankEvidencePath, sha256: hash(stockBlankBytes), hostVersion: stockBlankReport.host.version, localCopy: join(out, 'stock-native-missing-preset-blank-reference.json') };
  await writeFile(stockBlankEvidence.localCopy, stockBlankBytes);
  await writeFile(join(out, 'test-source-at-execution.mjs'), await readFile(new URL(import.meta.url)));
  const missingPresetWarning = 'initial Session restoration failed: SessionCreateError: session create failed: agent-preset/not-found: Unknown agent preset: trisoul-x';
  const isKnownNativeBlankWarning = row => row.type === 'warning' && ['original-IUI-control', 'native-restored'].includes(row.phase) && row.text.split('\n')[0] === missingPresetWarning;
  let verified = false, phase = 'initial';
  t.after(async () => {
    try {
      if (page && !page.isClosed()) {
        await page.screenshot({ path: join(out, verified ? 'final.png' : 'failure.png'), animations: 'disabled' });
        await writeFile(join(out, 'page.txt'), await page.locator('body').innerText()); await writeFile(join(out, 'page.html'), await page.content());
      }
      if (f?.origin) for (const session of sessions) {
        await writeFile(join(out, 'session-' + session.id + '.json'), JSON.stringify(await f.snapshot(session.sessionId), null, 2) + '\n');
      }
      await writeFile(join(out, 'capture.json'), JSON.stringify({ verified, phase, errors, warnings, knownNativeBlankWarnings: warnings.filter(isKnownNativeBlankWarning), unexpectedWarnings: warnings.filter(row => !isKnownNativeBlankWarning(row)), automaticMissingPresetBlankRecovery: false, stockBlankEvidence, nativeErrors: f?.errors, checks, userLayerChecks, nativeSubmissions, readiness }, null, 2) + '\n');
    } finally { await context?.close(); }
  });
  f = await installedHost(t, { safeEnvironment: true, piResources: true, isolatedHome: true, omdPackagePath: process.env.OMAA_TEST_OMD_PACKAGE });
  assert.equal(f.root, await realpath(f.root), 'Native IUI state storage requires a canonical temporary directory without ancestor symlinks');
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    const remaining = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(f.root)); assert.deepEqual(remaining, []);
    await writeFile(join(out, 'cleanup.json'), JSON.stringify({ fixtureRoot: f.root, fixtureRootRemoved: true, isolatedUserHome: f.userHome, ownedProfileProcessesRemaining: remaining }, null, 2) + '\n');
  });
  const iui = await packageEvidence(process.env.OMAA_TEST_IUI_PACKAGE);
  assert.equal(iui.name, 'dsh-intelligent-ui'); assert.equal(iui.sha256, process.env.OMAA_TEST_IUI_PACKAGE_SHA256);
  assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256); assert.equal(f.evidence.omdArtifact.sha256, process.env.OMAA_TEST_OMD_PACKAGE_SHA256);
  await f.installOmd(); await f.install();
  await f.command(['plugin', '--profile', 'omaa-fixture', 'add', 'file:' + iui.path]);
  assert.equal(hash(await readFile(iui.path)), iui.sha256); installedIui = true;
  const userLayerPath = join(f.home, 'profiles/omaa-fixture/cordis.yml');
  const initialUserLayer = await readFile(userLayerPath), initialUserLayerSha256 = hash(initialUserLayer);
  const initialUserLayerEvidence = join(out, 'user-layer-installed-baseline.yml'); await writeFile(initialUserLayerEvidence, initialUserLayer);
  const assertUserLayer = async stage => {
    const actual = await readFile(userLayerPath), actualSha256 = hash(actual), bytesEqual = actual.equals(initialUserLayer);
    const evidence = join(out, 'user-layer-' + stage + '.yml'); await writeFile(evidence, actual);
    const record = { phase, stage, path: userLayerPath, baseline: initialUserLayerEvidence, baselineSha256: initialUserLayerSha256, baselineBytes: initialUserLayer.length, actual: evidence, actualSha256, actualBytes: actual.length, bytesEqual };
    userLayerChecks.push(record); await writeFile(join(out, 'user-layer-checks.json'), JSON.stringify(userLayerChecks, null, 2) + '\n');
    if (!bytesEqual) {
      let difference;
      try { difference = execFileSync('diff', ['-u', initialUserLayerEvidence, evidence], { encoding: 'utf8' }); }
      catch (error) { if (error.status !== 1) throw error; difference = error.stdout; }
      record.diff = join(out, 'user-layer-' + stage + '.diff'); await writeFile(record.diff, difference);
      await writeFile(join(out, 'user-layer-checks.json'), JSON.stringify(userLayerChecks, null, 2) + '\n');
    }
    assert.equal(actualSha256, initialUserLayerSha256, 'Native profile user layer changed at ' + stage + '; exact raw diff retained in ' + (record.diff ?? evidence));
    assert(bytesEqual, 'Native profile user layer must remain byte-identical; effective bundle layers must not materialize');
  };
  await assertUserLayer('installed-baseline');
  // IUI declares the official DSH metadata package as an optional peer. That
  // package has no executable root export; inspect its public manifest through
  // the same native resolver, without claiming that a root module exists.
  const probeSource = await readFile(new URL('./fixtures/host-sdk-evidence.mjs', import.meta.url), 'utf8');
  const iuiProbeSource = probeSource.replaceAll('.resolve(name)', ".resolve(name === '@deepseek-ai/dsh' ? name + '/package.json' : name)")
    .replace('declaredPeerSpecifier,\n', "declaredPeerSpecifier, moduleSpecifier: name === '@deepseek-ai/dsh' ? name + '/package.json' : name,\n");
  const iuiProbe = join(out, 'original-iui-sdk-probe.mjs'); await writeFile(iuiProbe, iuiProbeSource);
  const iuiSdk = JSON.parse(execFileSync(process.execPath, [iuiProbe, f.evidence.cli, f.home, 'dsh-intelligent-ui'], {
    cwd: f.workspace, env: { ...fixtureEnvironment(f.home, true), HOME: f.userHome, USERPROFILE: f.userHome, PI_CODING_AGENT_DIR: f.piAgentDir }, encoding: 'utf8', timeout: 30000,
  }));
  const sdk = { omaa: await f.installedEvidence(), omd: await f.installedEvidence('trisoul_x'), iui: iuiSdk };
  await writeFile(join(out, 'sdk-routing.json'), JSON.stringify(sdk, null, 2) + '\n');
  const iuiRuntimeImports = [];
  const inspectSource = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspectSource(path);
      else if (/\.(?:mjs|jsx|js)$/.test(entry.name) && /(?:from\s*|import\s*\(|require\s*\()\s*['"]@deepseek-ai\/schemastery/.test(await readFile(path, 'utf8'))) iuiRuntimeImports.push(path);
    }
  };
  await inspectSource(join(iuiSdk.path, 'src')); await inspectSource(join(iuiSdk.path, 'lib')); assert.deepEqual(iuiRuntimeImports, []);
  assert.equal(iuiSdk.manifest.peerDependenciesMeta['@deepseek-ai/schemastery'].optional, true);
  for (const [owner, installed] of Object.entries(sdk)) {
    const artifact = owner === 'omaa' ? f.evidence.artifact : owner === 'omd' ? f.evidence.omdArtifact : iui;
    assert.equal(installed.manifest.name, artifact.name); assert.equal(installed.manifest.version, artifact.version);
    assert(installed.path.startsWith(installed.profileDir + '/')); assert.deepEqual(installed.linkedRoots, []);
    const verifyPeers = (label, peers) => {
      for (const [name, row] of Object.entries(peers)) {
        assert.equal(row.pluginVersion, row.hostVersion, label + ' ' + name);
        if (['omd', 'iui'].includes(owner) && name === '@deepseek-ai/schemastery' && row.pluginPath !== row.hostPath) {
          const chain = sdk.omd.utilityDependencyChains[name]; assert(chain?.length);
          assert.equal(chain.at(-1).targetManifest, row.pluginPath); assert.equal(chain.at(-1).targetVersion, row.hostVersion);
          assert(row.pluginPath.startsWith(installed.profileDir + '/') && row.pluginModule.startsWith(installed.profileDir + '/'));
          for (const hop of chain) { assert.equal(hop.field, 'dependencies'); assert(hop.declaringManifest.startsWith(installed.profileDir + '/')); assert(hop.targetManifest.startsWith(installed.profileDir + '/')); assert(!hop.specifier.includes('/') && !/^(?:file|link|workspace|git|https?|ssh):/.test(hop.specifier)); }
          if (owner === 'iui') { assert.equal(row.pluginModule, sdk.omd.sdk[name].pluginModule); row.interoperability = { metadataOnlyUtility: true, unusedOptionalPeer: true, runtimeImports: iuiRuntimeImports, sharedService: false, chain }; }
          continue;
        }
        assert.equal(row.pluginPath, row.hostPath, label + ' actual SDK'); assert.equal(row.pluginModule, row.hostModule, label + ' runtime target'); assert.equal(row.routingScope, 'installation', label + ' routing');
      }
    };
    verifyPeers(owner, installed.sdk); for (const declaring of installed.ordinaryDeclaringPeerSdk ?? []) verifyPeers(declaring.declaringPackage, declaring.peers);
  }
  const hostMetadata = JSON.parse(await readFile(iuiSdk.sdk['@deepseek-ai/dsh'].hostPath, 'utf8'));
  assert.equal(hostMetadata.name, '@deepseek-ai/dsh'); assert.equal(hostMetadata.version, f.evidence.version); assert.equal(hostMetadata.exports?.['.'], undefined);
  iuiSdk.sdk['@deepseek-ai/dsh'].rootModuleExported = false; iuiSdk.sdk['@deepseek-ai/dsh'].metadataInspectionOnly = true;
  assert.equal(Object.keys(await f.exemptions()).length, 0, 'No native peer compatibility exemptions');
  await writeFile(join(out, 'identity.json'), JSON.stringify({ fixture: f.evidence, iui, sdk, source: { test: new URL(import.meta.url).pathname, sha256: hash(await readFile(new URL(import.meta.url))), formSource: source, iuiSourceCommit: '410b6b298859eafc6a770598a7a07d4356c9ca3e', originalPeerProbe: { path: iuiProbe, sha256: hash(iuiProbeSource), sharedSourceSha256: hash(probeSource), metadataSpecifier: '@deepseek-ai/dsh/package.json' } }, browser: { executable: chromium.executablePath(), sha256: hash(await readFile(chromium.executablePath())), headless: true, mockKeychain: true }, corepackHome: process.env.COREPACK_HOME ?? null, pnpmHome: process.env.PNPM_HOME ?? null }, null, 2) + '\n');
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('IUI coexist fixture');
    const user = request.messages.filter(message => message.role === 'user').map(textOf).findLast(text => /^IUI_GENERATE_/.test(text) || text.includes('IUI_SUBMIT_COMBINED') || text.includes('IUI_NATIVE_RESTORED')) ?? '';
    if (user.startsWith('IUI_GENERATE_')) return textReply(response(user));
    if (user.includes('IUI_SUBMIT_COMBINED')) {
      const selected = user.match(/所选设置：\s*(\{[\s\S]*\})/); assert(selected, 'Original IUI must send selected fields through the native prompt');
      nativeSubmissions.push({ text: user, state: JSON.parse(selected[1]) }); return textReply('IUI_COMBINED_SUBMIT_ACCEPTED');
    }
    if (user.includes('IUI_NATIVE_RESTORED') && !nativeReadSent) { nativeReadSent = true; return toolReply('read', { file_path: join(f.workspace, 'native-sentinel.txt') }); }
    return textReply('IUI_NATIVE_BASE_COMPLETE');
  });
  await writeFile(join(f.workspace, 'native-sentinel.txt'), 'IUI_NATIVE_READ_RESTORED');
  await f.boot();
  const health = async () => { const r = await fetch(f.origin + '/intelligent-ui/api/health', { headers: { cookie: f.cookie } }); return { status: r.status, ...(r.ok ? { value: await r.json() } : {}) }; };
  const initialHealth = await health(); assert.equal(initialHealth.status, 200, JSON.stringify(initialHealth));
  assert.equal(initialHealth.value.hostVersion, f.evidence.version); assert.equal(initialHealth.value.sdkVersion, f.evidence.version);
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  for (const product of products) {
    const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: product.preset });
    // Base presets load before optional OMD children. Observe actual scoped
    // readiness rather than requiring session/create to block on enhancement.
    const started = Date.now();
    await until(async () => {
      const available = await f.api(created.sessionId);
      assert.equal(available.status, 200, JSON.stringify(available));
      assert.equal(available.value.product?.preset, product.preset);
      const previous = readiness.at(-1);
      if (previous?.sessionId !== created.sessionId || previous.omdAvailable !== available.value.omdAvailable) {
        readiness.push({ sessionId: created.sessionId, product: product.id, elapsedMs: Date.now() - started, omdAvailable: available.value.omdAvailable });
      }
      return available.value.omdAvailable === true;
    });
    const enhanced = await f.api(created.sessionId, { enhancement: true }); assert.equal(enhanced.status, 200, JSON.stringify(enhanced)); assert.equal(enhanced.value.enhancementActive, true);
    await f.prompt(created.sessionId, 'IUI_GENERATE_' + product.id);
    const title = 'IUI combined ' + product.id; await f.rpc('session/rename', { sessionId: created.sessionId, title });
    sessions.push({ id: product.id, sessionId: created.sessionId, title, preset: product.preset, expected: { place: '编辑-' + product.id, count: 0, enabled: false } });
  }
  const browser = async stage => {
    await context?.close();
    context = await chromium.launchPersistentContext(join(f.root, 'cft-' + stage), { headless: true, executablePath: chromium.executablePath(), args: ['--use-mock-keychain', '--password-store=basic'], viewport: { width: 1440, height: 1050 }, colorScheme: 'light' });
    await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
    page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push({ phase, error: error.message }));
    page.on('console', entry => { if (['warning', 'error'].includes(entry.type())) warnings.push({ phase, type: entry.type(), text: entry.text() }); });
    await page.goto(f.origin); const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
    if (stage !== 'initial') {
      await page.getByText('workspace', { exact: true }).first().waitFor();
      await welcome.waitFor({ state: 'visible', timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    }
    if (stage === 'initial' || await welcome.isVisible()) {
      await welcome.click(); await welcome.waitFor({ state: 'hidden' });
      checks.push({ phase, action: 'native-preview-notice-continue', stage });
    } else checks.push({ phase, action: 'hydrated-native-page-without-preview-notice', stage });
  };
  const select = async session => {
    const title = page.getByText(session.title, { exact: true }).first();
    if (!await title.isVisible()) { await page.getByText('workspace', { exact: true }).first().click(); checks.push({ phase, action: 'native-workspace-expand', target: session.title }); }
    await title.click(); await page.locator('.wSkVaW_header').waitFor();
  };
  const surface = () => page.locator('.iui-surface').first();
  const state = async session => {
    const r = await fetch(f.origin + '/intelligent-ui/api/state?' + new URLSearchParams({ session: session.sessionId, block: session.blockId }), { headers: { cookie: f.cookie } });
    const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
  };
  const isUserPrompt = row => row.event?.type === 'user/message' && row.event.data.source?.kind === 'user';
  const userCount = async session => (await f.snapshot(session.sessionId)).records.filter(isUserPrompt).length;
  const assertForm = async session => {
    await select(session); const form = surface().getByRole('form', { name: '组合验收', exact: true }); await form.waitFor();
    await until(async () => await form.getByRole('textbox', { name: '地点', exact: true }).isEnabled());
    const block = await surface().getAttribute('data-iui-block'); assert.match(block, /^\d+:\d+:\d+:\d+$/); if (session.blockId) assert.equal(block, session.blockId); else session.blockId = block;
    return form;
  };
  const submit = async (session, form) => {
    const before = (await f.snapshot(session.sessionId)).projections.asOfSeq, count = await userCount(session), submitted = nativeSubmissions.length;
    await form.getByRole('button', { name: '提交表单', exact: true }).click();
    const snapshot = await until(async () => { const value = await f.snapshot(session.sessionId); return value.records.some(row => row.event?.type === 'turn/end' && row.event.seq > before) && value; });
    const user = snapshot.records.filter(isUserPrompt).at(-1).event;
    assert.match(textOf(user.data.message ?? user.data), /IUI_SUBMIT_COMBINED/); assert.equal(await userCount(session), count + 1);
    assert.equal(nativeSubmissions.length, submitted + 1); assert.deepEqual(nativeSubmissions.at(-1).state, session.expected);
    checks.push({ phase, action: 'native-submit', product: session.id, sessionId: session.sessionId, blockId: session.blockId, selected: session.expected, userEventSeq: user.seq });
  };
  await browser('initial');
  for (const session of sessions) {
    const form = await assertForm(session);
    await form.getByRole('textbox', { name: '地点', exact: true }).fill(session.expected.place);
    await form.getByRole('spinbutton', { name: '数量', exact: true }).fill('7'); await form.getByRole('spinbutton', { name: '数量', exact: true }).fill('0');
    await form.getByRole('checkbox', { name: '启用', exact: true }).check(); await form.getByRole('checkbox', { name: '启用', exact: true }).uncheck();
    await until(async () => { const record = await state(session); return record.revision > 0 && JSON.stringify(record.state) === JSON.stringify(session.expected); });
    assert.equal(await userCount(session), 1, 'Local edits must not silently prompt');
    if (session.id === 'codex') {
      const validationRevision = (await state(session)).revision;
      await form.getByRole('textbox', { name: '地点', exact: true }).fill(''); await form.getByRole('button', { name: '提交表单', exact: true }).click(); await form.getByText('请填写此项', { exact: true }).waitFor(); assert.equal(await userCount(session), 1);
      await form.getByRole('textbox', { name: '地点', exact: true }).fill(session.expected.place); await form.getByRole('spinbutton', { name: '数量', exact: true }).fill('11');
      await form.getByRole('button', { name: '提交表单', exact: true }).click(); await form.getByText('不能大于 10', { exact: true }).waitFor(); assert.equal(await userCount(session), 1);
      await form.getByRole('spinbutton', { name: '数量', exact: true }).fill('0');
      await until(async () => { const record = await state(session); return record.revision > validationRevision && JSON.stringify(record.state) === JSON.stringify(session.expected); });
    }
    await until(async () => JSON.stringify((await state(session)).state) === JSON.stringify(session.expected));
    await page.screenshot({ path: join(out, session.id + '-editable.png'), animations: 'disabled' }); await submit(session, form);
    const saved = await state(session); assert.equal(saved.source.trimEnd(), source); session.saved = saved;
  }
  await context.close(); context = undefined; await f.stop(); await f.boot(); phase = 'cold';
  await assertUserLayer('cold-restart');
  for (const session of sessions) assert.deepEqual(await state(session), session.saved, 'Cold native state must retain source, revision and explicit 0/false');
  await browser('cold');
  for (const session of sessions) {
    const form = await assertForm(session); assert.equal(await form.getByRole('textbox', { name: '地点', exact: true }).inputValue(), session.expected.place); assert.equal(await form.getByRole('spinbutton', { name: '数量', exact: true }).inputValue(), '0'); assert.equal(await form.getByRole('checkbox', { name: '启用', exact: true }).isChecked(), false);
    assert.equal((await f.api(session.sessionId)).value.enhancementActive, true); await page.screenshot({ path: join(out, session.id + '-cold.png'), animations: 'disabled' });
  }
  const toggle = async enabled => {
    const mutation = await f.call('pluginManager/setBundleEnabled', { name: 'dsh-intelligent-ui', enabled }); assert(['applied', 'restart-required'].includes(mutation.application), JSON.stringify(mutation)); checks.push({ phase, action: enabled ? 'native-enable-IUI' : 'native-disable-IUI', mutation });
    await assertUserLayer(enabled ? 'IUI-native-enable' : 'IUI-native-disable');
    await context.close(); context = undefined; await f.stop(); await f.boot();
    await assertUserLayer(enabled ? 'IUI-enable-restart' : 'IUI-disable-restart');
  };
  phase = 'disabled'; await toggle(false); assert.equal((await health()).status, 404); await browser('disabled'); await select(sessions[0]);
  assert.equal(await page.locator('.iui-surface').count(), 0); await page.getByText(/root = Form/).first().waitFor(); assert.equal((await f.api(sessions[0].sessionId)).value.enhancementActive, true);
  await page.screenshot({ path: join(out, 'disabled-native-markdown.png'), animations: 'disabled' });
  phase = 'reenabled'; await toggle(true); assert.equal((await health()).status, 200); await browser('reenabled');
  for (const session of sessions) { const form = await assertForm(session); assert.equal(await form.getByRole('textbox', { name: '地点', exact: true }).inputValue(), session.expected.place); await submit(session, form); }
  await context.close(); context = undefined; await f.stop(); await f.uninstall(); await assertUserLayer('OMAA-native-uninstall');
  await f.removeOmd(); await assertUserLayer('OMD-native-uninstall'); await f.boot(); phase = 'original-IUI-control'; await assertUserLayer('OMAA-OMD-uninstall-restart');
  assert.equal((await health()).status, 200);
  const control = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'standard' });
  const original = { id: 'standard', sessionId: control.sessionId, title: 'IUI original native control', expected: { place: '原生对照', count: 0, enabled: false } };
  await f.prompt(original.sessionId, 'IUI_GENERATE_standard'); await f.rpc('session/rename', { sessionId: original.sessionId, title: original.title }); sessions.push(original);
  await browser('original-control'); const nativeForm = await assertForm(original); await nativeForm.getByRole('textbox', { name: '地点', exact: true }).fill(original.expected.place);
  await until(async () => JSON.stringify((await state(original)).state) === JSON.stringify(original.expected)); await submit(original, nativeForm);
  const removedOmaa = await fetch(f.origin + '/omaa/api/session?session=' + encodeURIComponent(original.sessionId), { headers: { cookie: f.cookie } });
  assert.equal(removedOmaa.status, 404); await page.screenshot({ path: join(out, 'original-native-IUI-control.png'), animations: 'disabled' });
  const records = (await readdir(join(f.home, 'intelligent-ui/state'))).filter(name => name.endsWith('.json')).sort(); assert(records.length >= 6);
  const preservedStateBytes = Object.fromEntries(await Promise.all(records.map(async name => [name, hash(await readFile(join(f.home, 'intelligent-ui/state', name)))])));
  await context.close(); context = undefined; await f.stop();
  await f.command(['plugin', '--profile', 'omaa-fixture', 'remove', 'dsh-intelligent-ui']); installedIui = false; await assertUserLayer('IUI-native-uninstall');
  await f.boot(); phase = 'native-restored'; await assertUserLayer('IUI-uninstall-restart');
  assert.equal((await health()).status, 404); assert.deepEqual((await readdir(join(f.home, 'intelligent-ui/state'))).filter(name => name.endsWith('.json')).sort(), records, 'Uninstall must preserve the original IUI user-state contract');
  for (const name of records) assert.equal(hash(await readFile(join(f.home, 'intelligent-ui/state', name))), preservedStateBytes[name], 'Uninstall must preserve actual source/state bytes: ' + name);
  await browser('native-restored'); await select(original); assert.equal(await page.locator('.iui-surface').count(), 0);
  const restored = await f.prompt(original.sessionId, 'IUI_NATIVE_RESTORED: read the actual sentinel through the ordinary host.');
  assert(restored.records.some(row => row.event?.type === 'tool/result' && textOf(row.event.data.message).includes('IUI_NATIVE_READ_RESTORED')));
  const bundles = await f.call('pluginManager/listBundles', {}); for (const name of ['trisoul_x', 'oh-my-agents-above-all', 'dsh-intelligent-ui']) assert(!bundles.some(row => row.name === name && row.installed));
  const knownNativeBlankWarnings = warnings.filter(isKnownNativeBlankWarning), unexpectedWarnings = warnings.filter(row => !isKnownNativeBlankWarning(row));
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []); assert.deepEqual(unexpectedWarnings, [], 'Only the exact stock-confirmed missing-preset blank warning is classified; all other warnings fail');
  await writeFile(join(out, 'verification.json'), JSON.stringify({ passed: true, acceptanceScope: 'Five-preset Form business/lifecycle and exact native user-layer preservation; automatic missing-preset blank recovery is a known stock-host limitation, not passed.', fixture: f.evidence, iuiArtifact: iui, source, sessions, checks, userLayerChecks, nativeSubmissions, uiErrors: errors, browserWarnings: warnings, knownNativeBlankWarnings, unexpectedWarnings, nativeErrors: f.errors, preservedStateFiles: records, preservedStateBytes, nativeReadRestored: true, nativeBaseUsableAfterExplicitNavigation: true, automaticMissingPresetBlankRecovery: false, stockBlankEvidence, limits: ['macOS headless CFT, scripted localhost model, real frozen native package installation and original IUI renderer.', 'Five OMAA presets with OMD enhancement enabled; separate original IUI standard control after OMD/OMAA removal.', 'Missing stored-preset blank restoration fails in stock DSH even when registry default remains standard; no blank/session/draft migration or deletion is performed.', 'Safe fixture isolated HOME; no real accounts/desktop, no rebuild of IUI and no custom renderer injection.'] }, null, 2) + '\n');
  verified = true; void installedIui;
});
