import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

test('installed web keeps native conversation and switches five session themes and modes', { timeout: 180000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const ids = {};
  for (const product of products) {
    const created = await f.rpc('session/create', {workspaceId:workspace.workspace.workspaceId,agentPreset:product.preset}); ids[product.id] = created.sessionId;
    if (product.id === 'cursor') {
      let step = 0;
      f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply('write', {file_path:'browser-restore.txt',content:'Cursor checkpoint browser verification'}) : textReply('Browser native Cursor edit'));
    }
    await f.prompt(created.sessionId, 'Browser native conversation ' + product.id);
    f.replyWith();
    await f.rpc('session/rename', { sessionId: created.sessionId, title: 'OMAA browser ' + product.id });
  }
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await context.addCookies(f.cookie.split('; ').map(value => { const at=value.indexOf('='); return {name:value.slice(0,at),value:value.slice(at+1),url:f.origin}; }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  t.after(async () => { if (!t.passed && !page.isClosed()) { await page.screenshot({path:'.cache/browser-failure.png',fullPage:true}); t.diagnostic((await page.locator('body').innerText()).slice(0,3000)); t.diagnostic(JSON.stringify(errors)); } });
  try {
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.waitFor({state:'visible'}); await welcome.click();
  await mkdir('.cache', { recursive: true });
  for (const product of products) {
    await page.getByText('OMAA browser ' + product.id, { exact: true }).first().click();
    await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 1);
    await page.getByRole('button', { name: product.name + ' 预设设置' }).click();
    const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置' });
    await panel.getByLabel('会话主题', { exact: true }).waitFor();
    assert.equal(await panel.getByLabel('OMD 增强', { exact: true }).isChecked(), false);
    assert.equal(await panel.getByLabel('OMD 增强', { exact: true }).isDisabled(), true);
    await panel.getByLabel('明暗模式', { exact: true }).selectOption('dark');
    await page.locator('html[data-appearance="dark"]').waitFor();
    await panel.getByLabel('明暗模式', { exact: true }).selectOption('light');
    await page.locator('html[data-appearance="light"]').waitFor();
    if (product.id === 'pi') {
      assert(await panel.getByText('执行（Pi 默认模式）', { exact: true }).isVisible());
      assert.equal(await panel.getByLabel('工作模式', { exact: true }).count(), 0);
      const rejected = await f.api(ids[product.id], { mode: 'ask' });
      assert.equal(rejected.status, 400, 'Pi must reject non-default modes through the native settings API');
      assert.equal((await f.api(ids[product.id])).value.mode, 'default');
    }
    else {
      await panel.getByLabel('工作模式', { exact: true }).selectOption('ask');
      await page.waitForFunction(() => document.querySelector('.omaa-preset-controls select[aria-label="工作模式"]')?.value === 'ask');
      assert.equal((await f.api(ids[product.id])).value.mode, 'ask');
      await panel.getByLabel('工作模式', { exact: true }).selectOption('default');
    }
    if (product.id === 'cursor') {
      const files = page.getByRole('region', { name: 'Cursor 文件检查点' });
      await files.getByRole('button', {name:'恢复文件',exact:true}).click();
      await files.getByRole('status').filter({hasText:'已恢复 1 个文件'}).waitFor();
      await assert.rejects(readFile(join(f.workspace, 'browser-restore.txt')), { code:'ENOENT' });
    }
    await page.screenshot({ path: '.cache/browser-' + product.id + '.png', fullPage: true });
  }
  await page.getByText('OMAA browser cursor', { exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置' });
  await panel.getByLabel('会话主题', { exact: true }).selectOption('host');
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-omaa-theme'));
  assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 0);
  await panel.getByLabel('会话主题', { exact: true }).selectOption('product');
  await page.locator('html[data-omaa-theme="cursor-cli"]').waitFor();
  await page.reload();
  await page.locator('html[data-omaa-theme="cursor-cli"]').waitFor();
  const colors = await page.evaluate(() => { const body = getComputedStyle(document.body); return { color: body.color, background: body.backgroundColor }; });
  assert(!Object.values(colors).includes(''), 'inherited Cursor colors must resolve');
  assert.deepEqual(errors, []);
  } catch(error) { await page.screenshot({path:'.cache/browser-failure.png',fullPage:true}); t.diagnostic((await page.locator('body').innerText()).slice(0,3000)); t.diagnostic(JSON.stringify(errors)); throw error; }
});
