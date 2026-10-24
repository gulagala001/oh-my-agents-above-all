import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, until } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';
import { products } from '../src/shared/products.mjs';

test('OMAA details use host controls, fit both settings and sidebars, and retain real saves', { timeout: 120000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace }), ids = {};
  f.replyWith(() => textReply('UI fixture ready.'));
  for (const product of products) {
    const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: product.preset });
    ids[product.id] = sessionId;
    await f.prompt(sessionId, 'Prepare settings UI.');
    await f.rpc('session/rename', { sessionId, title: 'UI ' + product.id });
    assert.equal((await f.api(sessionId, { theme: 'host' })).status, 200);
  }
  const browser = await launchChromium({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  const capture = async name => {
    if (!process.env.OMAA_UI_EVIDENCE_DIR) return;
    await mkdir(process.env.OMAA_UI_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.OMAA_UI_EVIDENCE_DIR, name + '.png') });
  };
  t.after(async () => { if (t.passed === false && !page.isClosed()) { await capture('failure'); t.diagnostic((await page.locator('body').innerText()).slice(-5000)); t.diagnostic(JSON.stringify(errors)); } await browser.close(); });
  const fit = async locator => {
    const result = await locator.evaluate(root => ({ width: root.clientWidth, scroll: root.scrollWidth,
      fields: [...root.querySelectorAll('input:not([type=checkbox]),textarea,select')].map(node => ({
        label: node.getAttribute('aria-label'), width: node.getBoundingClientRect().width,
        right: node.getBoundingClientRect().right, limit: root.getBoundingClientRect().right,
        radius: getComputedStyle(node.tagName === 'INPUT' ? node.parentElement : node).borderRadius,
      })) }));
    assert(result.scroll <= result.width + 1, JSON.stringify(result));
    for (const field of result.fields) { assert(field.width > 50 && field.right <= field.limit + 1, JSON.stringify(field)); assert.notEqual(field.radius, '0px', JSON.stringify(field)); }
  };
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.click(); await welcome.waitFor({ state: 'hidden' });
  if (!(await page.getByText('UI codex', { exact: true }).first().isVisible())) await page.getByText('workspace', { exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置' });
  for (const product of products) {
    await page.getByText('UI ' + product.id, { exact: true }).first().click();
    await page.getByRole('button', { name: product.name + ' 预设设置', exact: true }).click();
    await panel.getByLabel('会话主题', { exact: true }).waitFor();
    await until(() => panel.getByLabel('会话主题', { exact: true }).isEnabled());
    await panel.getByLabel('会话主题', { exact: true }).selectOption('product');
    await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    await fit(page.locator('.omaa-workbench'));
    assert(await panel.getByRole('switch', { name: 'OMD 增强', exact: true }).isDisabled());
    for (const appearance of ['dark', 'light']) {
      await panel.getByLabel('明暗模式', { exact: true }).selectOption(appearance);
      await page.waitForFunction(value => document.body.hasAttribute('data-ds-dark-theme') === (value === 'dark'), appearance);
      await fit(panel);
    }
    await panel.getByLabel('会话主题', { exact: true }).selectOption('host');
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-omaa-theme'));
  }
  await page.getByText('更多', { exact: true }).click();
  await page.getByText('设置', { exact: true }).click();
  await page.getByText('OMAA', { exact: true }).click();
  const settings = page.locator('.omaa-settings-page');
  await settings.getByText('当前会话', { exact: true }).click();
  const style = settings.getByRole('group', { name: 'ZCode 输出风格', exact: true });
  await style.getByLabel('输出风格名称').fill('清晰');
  await style.getByRole('button', { name: '保存输出风格', exact: true }).click();
  await style.getByRole('alert').waitFor();
  assert.equal(await style.getByLabel('输出风格名称').inputValue(), '清晰');
  await style.getByLabel('输出风格提示内容').fill('先给结论，再给必要说明。');
  await style.getByRole('button', { name: '保存输出风格', exact: true }).click();
  await until(async () => (await f.api(ids.zcode)).value.outputStyle?.name === '清晰');
  for (const [label, save, key] of [
    ['项目记忆目录', '保存并启用项目记忆', 'projectMemory'],
    ['全局 Agent 目录路径', '保存目录', 'agentProfileDirectory'],
    ['Agent 记忆存储根目录', '保存并启用 Agent 记忆', 'agentMemory'],
  ]) {
    const path = join(f.workspace, key); await mkdir(path);
    await until(() => settings.getByLabel(label, { exact: true }).isEnabled());
    await settings.getByLabel(label, { exact: true }).fill(path);
    await settings.getByRole('button', { name: save, exact: true }).click();
    await until(async () => (await f.api(ids.zcode)).value[key]?.root === path);
  }
  await until(() => settings.getByLabel('工作模式', { exact: true }).isEnabled());
  await settings.getByLabel('工作模式', { exact: true }).selectOption('ask');
  await until(() => settings.getByLabel('项目记忆目录', { exact: true }).isDisabled());
  await settings.getByLabel('工作模式', { exact: true }).selectOption('default');
  await until(() => settings.getByLabel('项目记忆目录', { exact: true }).isEnabled());
  for (const [width, appearance] of [[1440, 'light'], [820, 'dark']]) {
    await page.setViewportSize({ width, height: 1000 });
    await settings.getByLabel('明暗模式', { exact: true }).selectOption(appearance);
    await page.waitForFunction(value => document.body.hasAttribute('data-ds-dark-theme') === (value === 'dark'), appearance);
    await style.scrollIntoViewIfNeeded();
    await fit(settings);
    assert.equal(await style.getByLabel('输出风格名称').locator('..').getAttribute('class').then(value => value.includes('omaa-input')), true);
    await capture('settings-' + appearance);
  }
  await settings.getByText('Pi 本地扩展', { exact: true }).click();
  await settings.getByLabel('Pi 扩展文件路径').waitFor();
  await fit(settings);
  await capture('extensions-dark');
  assert.deepEqual(errors, []);
});
