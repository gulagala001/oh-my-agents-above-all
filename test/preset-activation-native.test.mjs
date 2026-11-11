import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, until } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';

test('base is inert until opt-in; native presets toggle independently and retain settings across restart', { timeout: 120000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: [] });
  await f.boot();
  const baseline = await f.call('agentPresets/list', {});
  const plain = await f.create();
  await f.prompt(plain.sessionId, 'Native baseline');
  const nativeTools = f.requests.findLast(request => request.tools?.length).tools;
  await f.stop(); await f.install(); await f.boot();
  assert.deepEqual(await f.call('agentPresets/list', {}), baseline);
  assert.deepEqual((await f.presets()).value.enabled, []);
  await assert.rejects(access(join(f.home, 'omaa')), { code: 'ENOENT' });
  await f.prompt(plain.sessionId, 'Native base installed');
  assert.deepEqual(f.requests.findLast(request => request.tools?.length).tools, nativeTools);
  const nativeSkills = await f.rpc('skills/list', { sessionId: plain.sessionId });
  let value = (await f.presets()).value;
  const select = async enabled => {
    const result = await f.presets({ enabled, revision: value.revision });
    assert.equal(result.status, 200, JSON.stringify(result));
    value = result.value;
  };
  await select(['codex']);
  assert.deepEqual((await f.call('agentPresets/list', {})).presets.filter(row => row.id.startsWith('omaa-')).map(row => row.id), ['omaa-codex']);
  assert.equal((await f.presets({ enabled: [], revision: value.revision - 1 })).status, 409);
  assert.equal((await f.presets({ enabled: ['codex', 'codex'], revision: value.revision })).status, 400);
  await f.call('settings/update', { ns: 'agent-preset-registry', patch: { selectedDefault: 'omaa-codex' } });
  const defaultDenial = await f.presets({ enabled: [], revision: value.revision });
  assert.equal(defaultDenial.status, 400); assert.match(defaultDenial.value.error, /当前默认/);
  await f.call('settings/update', { ns: 'agent-preset-registry', patch: { selectedDefault: baseline.presets.find(row => row.isDefault).id } });
  const codex = await f.create('omaa-codex');
  assert.equal((await f.api(codex.sessionId, { theme: 'host' })).status, 200);
  const release = f.holdNextReply();
  const running = f.prompt(codex.sessionId, 'Held Codex task');
  await until(() => f.requests.some(request => JSON.stringify(request.messages).includes('Held Codex task')));
  const denied = await f.presets({ enabled: [], revision: value.revision });
  assert.equal(denied.status, 400); assert.match(denied.value.error, /运行中|排队/);
  release(); await running;
  await select(['codex', 'grok', 'cursor', 'pi', 'zcode']);
  const roster = await f.call('agentPresets/list', {});
  assert(roster.presets.filter(row => row.id.startsWith('omaa-')).every(row => !row.broken), JSON.stringify(roster));
  assert.equal(roster.presets.find(row => row.isDefault).id, baseline.presets.find(row => row.isDefault).id);
  assert.deepEqual(await f.rpc('skills/list', { sessionId: plain.sessionId }), nativeSkills);
  for (const id of ['grok', 'cursor', 'pi', 'zcode']) {
    const session = await f.create('omaa-' + id);
    await f.prompt(session.sessionId, 'Opt-in ' + id);
    assert.equal((await f.api(session.sessionId)).value.product.id, id);
  }
  await select([]);
  assert.deepEqual(await f.call('agentPresets/list', {}), baseline);
  await assert.rejects(f.prompt(codex.sessionId, 'Disabled preset cannot execute'), /启用 Codex/);
  assert.deepEqual(await f.rpc('skills/list', { sessionId: plain.sessionId }), nativeSkills);
  await f.prompt(plain.sessionId, 'Native after disable');
  assert.deepEqual(f.requests.findLast(request => request.tools?.length).tools, nativeTools);
  const saved = JSON.parse(await readFile(join(f.home, 'omaa/presets.json'), 'utf8'));
  assert.deepEqual(saved.enabled, []);
  await f.stop(); await f.boot();
  assert.deepEqual((await f.presets()).value.enabled, []);
  assert.deepEqual(await f.call('agentPresets/list', {}), baseline);
  value = (await f.presets()).value;
  await select(['codex']);
  assert.equal((await f.api(codex.sessionId)).value.theme, 'host');
  await f.prompt(codex.sessionId, 'Re-enabled retained conversation');
  await f.stop(); await f.boot();
  assert.deepEqual((await f.presets()).value.enabled, ['codex']);
  assert.equal((await f.api(codex.sessionId)).value.product.id, 'codex');
  assert.deepEqual(f.errors, []);
});

test('settings switches enable and release the real preset UI without changing the native default', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: [] });
  await f.install(); await f.boot();
  const browser = await launchChromium({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.click(); await welcome.waitFor({ state: 'hidden' });
  try {
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    await page.getByText('设置', { exact: true }).click({ timeout: 10000 });
    await page.getByText('OMAA', { exact: true }).click();
    await page.getByRole('heading', { name: '代理预设' }).waitFor();
    if (process.env.OMAA_TEST_SCREENSHOT) await page.screenshot({ path: process.env.OMAA_TEST_SCREENSHOT, fullPage: true });
    await page.setViewportSize({ width: 820, height: 760 });
    assert(await page.locator('.omaa-settings-page').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await page.getByRole('switch').count(), 5);
    assert.equal(await page.locator('[role=switch][aria-checked=true]').count(), 0);
    assert.equal(await page.locator('style[data-omaa-theme-style],style[data-omaa-controls],style[data-omaa-pi-custom-messages]').count(), 0);
    await page.getByRole('switch', { name: '启用 Codex', exact: true }).click();
    await until(async () => (await f.presets()).value.enabled.includes('codex'));
    await until(() => page.getByRole('switch', { name: '启用 Codex', exact: true }).isChecked());
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '标准模式', exact: true }).click();
    await page.getByText('Codex · OMAA', { exact: true }).first().waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    const workspace = await f.rpc('workspace/create', { path: f.workspace });
    const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-codex' });
    await f.prompt(created.sessionId, 'Opt-in UI fixture');
    await f.rpc('session/rename', { sessionId: created.sessionId, title: 'Opt-in UI fixture' });
    await page.reload();
    await page.getByText('workspace', { exact: true }).first().click();
    await page.getByText('Opt-in UI fixture', { exact: true }).first().click({ timeout: 10000 });
    await until(() => page.evaluate(() => Boolean(document.documentElement.dataset.omaaTheme)));
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    await page.getByText('设置', { exact: true }).click({ timeout: 10000 });
    await page.getByText('OMAA', { exact: true }).click();
    await page.getByRole('switch', { name: '启用 Codex', exact: true }).click();
    await until(async () => (await f.presets()).value.enabled.length === 0);
    await until(() => page.evaluate(() => !document.documentElement.dataset.omaaTheme && !document.querySelector('style[data-omaa-controls]')));
    assert.equal(await page.locator('[role=switch][aria-checked=true]').count(), 0);
    assert.deepEqual(errors, []);
  } catch (error) {
    throw Error(error.message + '\n' + JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(-6000),
      buttons: await page.getByRole('button').allTextContents() }));
  }
});

test('saved choices survive startup and rollback failures; session admission follows mounts', async t => {
  const {createPresetActivation}=await import('../src/host/preset-activation.mjs');
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises'), {tmpdir}=await import('node:os');
  const dir=await mkdtemp(join(tmpdir(),'preset-rollback-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'presets.json');await writeFile(file,JSON.stringify({enabled:['codex','pi'],revision:4}));
  const broken=new Set(['pi']);
  const ctx={agents:{list:()=>[]},get:()=>undefined,sessionProjections:{stateOf:()=>undefined},fiber:{assertActive(){}},logger:{warn(){}},
    plugin(){return Object.assign(Promise.resolve(),{dispose:async()=>{}});},
    agentPresets:{resolve:async()=>({}),register:async def=>{if(broken.has(def.id.slice(5)))throw Error('mount '+def.id);return ()=>{};}}};
  const activation=createPresetActivation(ctx,dir); t.after(()=>activation.close());
  await activation.start();assert.deepEqual(activation.inspect().enabled,['codex','pi']);assert.match(activation.inspect().error,/pi/);
  assert.equal(activation.enabled('pi'),false);
  broken.clear();await activation.update({revision:4,enabled:[...activation.inspect().enabled,'cursor']});
  assert.equal(activation.enabled('pi'),true);assert.equal(activation.enabled('codex'),true);
  broken.add('grok');broken.add('pi');
  await assert.rejects(activation.update({revision:5,enabled:['codex','grok','cursor']}),/恢复/);
  assert.equal(activation.inspect().enabled.includes('pi'),true);assert.equal(activation.inspect().mounted.includes('pi'),false);
  assert.throws(()=>activation.assertSession({header:{agentPreset:'omaa-pi'}}),/启用/);
  broken.clear();await activation.update({revision:5,enabled:activation.inspect().enabled});
  activation.assertSession({header:{agentPreset:'omaa-pi'}});assert.equal(activation.inspect().error,'');
});
