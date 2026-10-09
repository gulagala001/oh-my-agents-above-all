import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { parse as parseYaml } from 'yaml';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

const enabled = process.env.OMAA_FRONTEND_NATIVE === '1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const order of ['omaa-first','omd-first']) test(`native frontend preserves five themes, surfaces and sidebar across ownership/lifecycle (${order})`, { timeout: 420000, skip: !enabled && 'Explicit frozen OMAA/OMD frontend inputs are required.' }, async t => {
  for (const key of ['OMAA_TEST_HOST_PACKAGE','OMAA_TEST_HOST_PACKAGE_SHA256','OMAA_TEST_OMD_PACKAGE','OMAA_TEST_OMD_PACKAGE_SHA256']) assert(process.env[key], 'Missing frozen input: ' + key);
  const directory = resolve(process.env.OMAA_FRONTEND_EVIDENCE_DIR || 'work/rea-upgrade/frontend-015/native-handoff', order);
  await mkdir(directory, { recursive: true });
  let f, browser, page, verified = false; const errors = [], checks = [], responses = [];
  t.after(async () => {
    if (page && !page.isClosed()) { await page.screenshot({ path: join(directory, verified ? 'final.png' : 'failure.png'), fullPage: true }); await writeFile(join(directory, 'page.txt'), await page.locator('body').innerText()); }
    await browser?.close();
    await writeFile(join(directory, 'verification.json'), JSON.stringify({ verified, order, checks, errors, responses, fixture: f?.evidence, scope: `Official native ${f?.evidence.version} + frozen OMAA/OMD packages, owned local provider/HOME/CFT; no hardware or real account actions.` }, null, 2) + '\n');
  });
  f = await installedHost(t, { safeEnvironment: true, omdPackagePath: process.env.OMAA_TEST_OMD_PACKAGE });
  t.after(async () => { await assert.rejects(access(f.root), { code: 'ENOENT' }); assert.equal(f.evidence.cleanup.rootRemoved, true); assert(f.evidence.cleanup.stopReceipts.every(value => !value.forced)); await writeFile(join(directory, 'cleanup.json'), JSON.stringify(f.evidence.cleanup, null, 2) + '\n'); });
  assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256); assert.equal(f.evidence.omdArtifact.sha256, process.env.OMAA_TEST_OMD_PACKAGE_SHA256);
  const seededCredentialBytes = await readFile(join(f.home, '.credentials.yaml')), seededCredentials = parseYaml(seededCredentialBytes.toString('utf8'));
  if (order === 'omaa-first') { await f.install(); await f.installOmd(); } else { await f.installOmd(); await f.install(); }
  const installed = await f.installedEvidence(); await writeFile(join(directory, 'installed-sdk.json'), JSON.stringify(installed, null, 2) + '\n');
  assert.equal(installed.manifest.version, f.evidence.artifact.version); assert.deepEqual(installed.linkedRoots, []);
  for (const [name, row] of Object.entries(installed.sdk)) { assert.equal(row.pluginVersion, row.hostVersion, name); assert.equal(row.pluginPath, row.hostPath, name); assert.equal(row.pluginModule, row.hostModule, name); }
  assert.deepEqual(await f.exemptions(), {});
  const profilePath = join(f.home, 'profiles/omaa-fixture/package.json'), profileBefore = JSON.parse(await readFile(profilePath, 'utf8'));
  await f.boot();
  const bootCredentialBytes = await readFile(join(f.home, '.credentials.yaml')), bootCredentials = parseYaml(bootCredentialBytes.toString('utf8'));
  assert.deepEqual(bootCredentials.refs, seededCredentials.refs, 'First web boot preserves the synthetic model credential');
  assert.deepEqual(Object.keys(bootCredentials.records || {}), ['client-connection/browser-session'], 'Only the official browser signing record is initialized');
  const credentialHash = sha(bootCredentialBytes);
  await writeFile(join(directory, 'credential-stages.json'), JSON.stringify({ seeded: { sha256: sha(seededCredentialBytes), bytes: seededCredentialBytes.length }, firstBoot: { sha256: credentialHash, bytes: bootCredentialBytes.length }, addedRecordNames: Object.keys(bootCredentials.records || {}), syntheticModelRefHashes: Object.fromEntries(Object.entries(bootCredentials.refs).map(([key,value]) => [key, sha(Buffer.from(value))])), source: { package: '@deepseek-ai/dsh-client-connection', version: f.evidence.version, operation: 'BrowserAuth.create -> initializeSecret -> credentials.modifyRecord(client-connection/browser-session)' }, subsequentStagesRequireExactBytes: true }, null, 2) + '\n');
  await writeFile(join(f.workspace, 'frontend.txt'), 'OWNED_FRONTEND_READ\n');
  const workspace = await f.rpc('workspace/create', { path: f.workspace }), ids = {};
  for (const product of products) {
    const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: product.preset }); ids[product.id] = sessionId;
    let step = 0;
    f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply('read', { file_path: 'frontend.txt' }) : textReply('OWNED_FRONTEND_RESULT'));
    const history = await f.prompt(sessionId, `Owned frontend ${product.id}`);
    assert(history.records.some(row => row.event?.type === 'tool/result' && !row.event.data.message?.isError), product.id + ': actual native read result');
    f.replyWith(); await f.rpc('session/rename', { sessionId, title: `Frontend ${product.name}` });
  }
  const { sessionId: ordinary } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'standard' });
  await f.prompt(ordinary, 'Owned standard session for lifecycle navigation');
  await f.rpc('session/rename', { sessionId: ordinary, title: 'Frontend native control' });
  browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain','--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }); page = await context.newPage(); page.setDefaultTimeout(18000);
  page.on('pageerror', error => errors.push(error.message)); page.on('response', response => { if (response.status() >= 400) responses.push({ status: response.status(), url: new URL(response.url()).pathname }); });
  const expandSessions = async () => {
    const more = page.getByRole('button', { name: /^Show \d+ more sessions$/ });
    while (await more.count()) await more.first().click();
  };
  const load = async () => {
    await context.clearCookies(); await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0,at), value: value.slice(at+1), url: f.origin }; }));
    await page.goto(f.origin); const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
    if (!checks.length) { await welcome.waitFor({ state: 'visible' }); await welcome.click(); }
    else {
      // Boot/reload hydration can publish the notice after the shell. Await
      // its real visibility before deciding this owned profile dismissed it.
      try { await welcome.waitFor({ state: 'visible', timeout: 3000 }); await welcome.click(); }
      catch (error) { if (await welcome.count() || !await page.getByRole('button', { name: /^(Settings|设置)$/, exact: true }).isVisible()) throw error; }
    }
    await page.locator('[data-omd-surface="sidebar"]').waitFor();
    await expandSessions();
  };
  const row = id => page.locator(`[role="treeitem"][data-row-key="session:${id}"]`);
  const select = async id => {
    // Native session hydration can publish Show more after the shell. Wait for
    // the real target row while expanding the public list, never fabricate it.
    await until(async () => { await expandSessions(); return await row(id).isVisible(); });
    await row(id).click(); await until(async () => await row(id).getAttribute('aria-selected') === 'true');
  };
  const markers = async label => {
    await expandSessions();
    const actual = await page.evaluate(() => ({ areas: [...document.querySelectorAll('[data-omd-surface]')].map(value => value.dataset.omdSurface), hookCount: document.querySelectorAll('[data-omd-nav-part]').length, owner: document[Symbol.for('omd.omaa.appearance.v1')]?.getSnapshot(), nativeTree: document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]').length }));
    for (const area of ['frame','sidebar-column','sidebar','conversation','workbench-column']) assert(actual.areas.includes(area), label + ': ' + area);
    assert(actual.hookCount > 0, label + ': native navigation hooks'); assert(actual.nativeTree >= products.length + 1, label + ': native session rows');
    checks.push({ label, ...actual }); return actual;
  };
  const keyboard = async (id, label) => {
    await row(id).focus(); await page.keyboard.press('End');
    const last = await page.evaluate(() => ({ key: document.activeElement?.getAttribute('data-row-key'), role: document.activeElement?.getAttribute('role') }));
    assert.equal(last.role, 'treeitem', label + ': End retains native tree focus'); assert(last.key, label + ': native row identity');
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'treeitem', label + ': Home');
    await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'treeitem', label + ': ArrowDown');
    await select(id); checks.push({ label, keyboard: true, end: last });
  };
  await load();
  for (const product of products) {
    await select(ids[product.id]); await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    await page.getByRole('button', { name: `${product.name} 预设设置`, exact: true }).click();
    const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置', exact: true });
    await until(async () => (await f.api(ids[product.id])).value.omdAvailable === true);
    if (await panel.getByRole('button', { name: '检查增强状态', exact: true }).isVisible()) await panel.getByRole('button', { name: '检查增强状态', exact: true }).click();
    await until(async () => await panel.getByRole('switch', { name: 'OMD 增强', exact: true }).isEnabled());
    await panel.getByRole('switch', { name: 'OMD 增强', exact: true }).check();
    await until(async () => await panel.getByLabel('增强工作方式', { exact: true }).isEnabled());
    await panel.getByLabel('增强工作方式', { exact: true }).selectOption('pro');
    await until(async () => (await f.api(ids[product.id])).value.enhancementWorkMode === 'pro');
    for (const mode of ['light','dark']) {
      await panel.getByLabel('明暗模式', { exact: true }).selectOption(mode); await page.locator(`html[data-appearance="${mode}"]`).waitFor();
      assert.equal((await markers(`${product.id}/${mode}/product`)).owner.owner, 'omaa');
      await keyboard(ids[product.id], `${product.id}/${mode}/product`); await page.screenshot({ path: join(directory, `${product.id}-${mode}.png`), fullPage: true });
    }
    for (const target of ['host','omd','product']) {
      await panel.getByLabel('会话主题', { exact: true }).selectOption(target);
      await until(async () => await page.evaluate(target => {
        const snapshot = document[Symbol.for('omd.omaa.appearance.v1')]?.getSnapshot();
        return target === 'host' ? snapshot?.owner === 'omaa' && snapshot.key === 'host' : target === 'omd' ? snapshot?.owner === 'omd' : Boolean(document.documentElement.dataset.omaaTheme);
      }, target));
      await markers(`${product.id}/${target}`); await keyboard(ids[product.id], `${product.id}/${target}`);
    }
  }
  await page.reload(); await page.locator('html[data-omaa-theme="zcode"]').waitFor(); await markers('reload/product'); await keyboard(ids.zcode, 'reload/product');
  assert.equal(sha(await readFile(join(f.home, '.credentials.yaml'))), credentialHash); assert.deepEqual(JSON.parse(await readFile(profilePath, 'utf8')), profileBefore); assert.deepEqual(await f.exemptions(), {});
  await f.stop(); await f.bundleEnabled(false); await f.boot(); await load(); await select(ordinary); await markers('disabled/native'); await keyboard(ordinary, 'disabled/native');
  assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 0);
  await f.stop(); await f.bundleEnabled(true); await f.boot(); await load(); await select(ids.zcode); await page.locator('html[data-omaa-theme="zcode"]').waitFor(); await markers('enabled/product');
  await f.stop(); await f.command(['plugin','--profile','omaa-fixture','remove','oh-my-agents-above-all']); await f.boot(); await load(); await select(ordinary); await markers('uninstalled/native'); await keyboard(ordinary, 'uninstalled/native');
  assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 0); assert.equal(await page.getByRole('button', { name: 'ZCode 预设设置', exact: true }).count(), 0);
  assert.equal(sha(await readFile(join(f.home, '.credentials.yaml'))), credentialHash); assert.deepEqual(await f.exemptions(), {}); assert.deepEqual(f.errors, []); assert.deepEqual(errors, []);
  verified = true;
});
