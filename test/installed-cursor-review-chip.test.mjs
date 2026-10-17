import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const browserOptions = { headless: true, args: ['--use-mock-keychain', '--password-store=basic'] };
const evidenceDir = resolve(process.env.OMAA_REVIEW_CHIP_EVIDENCE_DIR || '.cache/cursor-review-chip');

test('Cursor composer review handles reads, scope, late results and lifecycle honestly', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `
    export { CheckpointReviewChip } from './src/client/checkpoint-review-chip.jsx';
    export { default as React } from 'react';
    export { createRoot } from 'react-dom/client';
    export { flushSync } from 'react-dom';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'chipFixture', target: 'es2022' });
  const browser = await chromium.launch(browserOptions); t.after(() => browser.close());
  const page = await browser.newPage(); await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { React, createRoot, flushSync, CheckpointReviewChip } = chipFixture;
    let state = { sessionId: 'a', loading: false, saving: false, error: '', data: { product: { id: 'cursor' }, running: false } }, mountedId = 'a', scopeId = 'a';
    const listeners = new Set(), mountedListeners = new Set(), calls = [], opened = [];
    const settings = { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const sidebarRight = { mounted: { getSnapshot: () => mountedId, subscribe: fn => { mountedListeners.add(fn); return () => mountedListeners.delete(fn); } }, openResourceIn: (...args) => opened.push(args) };
    window.fetch = (url, options) => new Promise(resolve => calls.push({ url, options, finish: (value, status = 200) => resolve(new Response(JSON.stringify(value), { status })) }));
    const root = createRoot(document.getElementById('app'));
    const render = () => flushSync(() => root.render(React.createElement(CheckpointReviewChip, { settings, sidebarRight, sessionId: scopeId })));
    const set = value => { state = value; flushSync(() => { for (const fn of listeners) fn(); }); };
    const mount = value => { mountedId = value; flushSync(() => { for (const fn of mountedListeners) fn(); }); };
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const until = async check => { for (let i = 0; i < 500; i++) { if (check()) return; await tick(); } throw Error('chip did not settle'); };
    const button = () => document.querySelector('button');
    const row = (turn, seq, reviewAvailable = true, count = 2) => ({ turn, seq, reviewAvailable, summary: { files: Array.from({ length: count }, (_, i) => ({ path: `file-${i}.txt` })) } });
    const data = (id = state.sessionId) => ({ sessionId: id, checkpoints: [row(2, 20), row(5, 50, false), row(3, 30), row(4, 40, true, 0)] });
    const stages = {};
    try {
      render(); await until(() => calls.length === 1 && document.querySelector('[role="status"]'));
      stages.loading = document.querySelector('[role="status"]').textContent; stages.placeholder = Boolean(button());
      calls[0].finish({ error: '暂时离线' }, 503); await until(() => button()?.textContent.includes('重试'));
      stages.failed = button().getAttribute('aria-label'); flushSync(() => button().click()); await until(() => calls.length === 2);
      calls[1].finish(data()); await until(() => button()?.textContent.includes('回合 3'));
      stages.label = button().textContent;
      const staleClick = Object.entries(button()).find(([key]) => key.startsWith('__reactProps$'))[1].onClick;
      flushSync(() => button().click()); stages.opened = opened.at(-1);
      const count = calls.length; await tick(); stages.noPolling = calls.length === count;
      set({ ...state, data: { ...state.data, running: true } }); stages.runningHidden = !button();
      set({ ...state, data: { ...state.data, running: false } }); await until(() => calls.length === 3);
      scopeId = 'b'; render(); mount('b'); set({ ...state, sessionId: 'b' }); await until(() => calls.length === 4);
      calls[2].finish(data('a')); await tick(); stages.lateHidden = !button();
      calls[3].finish({ sessionId: 'b', checkpoints: [] }); await until(() => !document.querySelector('[role="status"]'));
      stages.emptyHidden = !button(); flushSync(() => staleClick()); stages.staleNotOpened = opened.length === 1;
      set({ ...state, data: { product: { id: 'codex' }, running: false } }); stages.productHidden = !button();
      set({ ...state, data: { product: { id: 'cursor' }, running: false } }); await until(() => calls.length === 5);
      calls[4].finish(data('other')); await until(() => button()?.textContent.includes('重试')); stages.wrongResponse = button().getAttribute('aria-label');
      flushSync(() => button().click()); await until(() => calls.length === 6); mount(undefined); calls[5].finish(data('b')); await tick();
      stages.unmountedHidden = !button(); stages.aborted = calls[5].options.signal.aborted;
      mount('b'); await until(() => calls.length === 7); calls[6].finish(data()); await until(() => button()?.textContent.includes('回合 3'));
      scopeId = 'elsewhere'; render(); stages.wrongScopeHidden = !button(); stages.calls = calls.length;
    } finally { root.unmount(); }
    stages.listeners = listeners.size + mountedListeners.size;
    return stages;
  });
  assert.equal(result.loading, '读取改动…'); assert.equal(result.placeholder, false);
  assert.match(result.failed, /暂时离线/); assert.equal(result.label, '回合 3 改动 · 2 个文件');
  assert.deepEqual(result.opened, ['a', 'dsh-resource://changes-review/session/a/30/3', { params: { index: 0 } }]);
  for (const flag of ['noPolling', 'runningHidden', 'lateHidden', 'emptyHidden', 'staleNotOpened', 'productHidden', 'unmountedHidden', 'aborted', 'wrongScopeHidden']) assert.equal(result[flag], true, flag);
  assert.match(result.wrongResponse, /当前会话不匹配/); assert.equal(result.calls, 7); assert.equal(result.listeners, 0);
});

test('installed Cursor composer entry opens native turn review, hides during run, switches and uninstalls', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, piResources: true }); await f.install(); await f.boot();
  await mkdir(evidenceDir, { recursive: true });
  const before = Buffer.from('\uFEFFbefore\r\nunchanged trailing', 'utf8');
  await writeFile(join(f.workspace, 'chip-a.txt'), before);
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const create = agentPreset => f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset });
  const cursor = await create('omaa-cursor'), empty = await create('omaa-cursor'), codex = await create('omaa-codex');
  let step = 0;
  f.replyWith(payload => !payload.tools?.length ? textReply('Title') : step++ === 0
    ? toolReply('read', { file_path: 'chip-a.txt' }) : step === 2
      ? toolReply('write', { file_path: 'chip-a.txt', content: 'After chip review\nSecond line\n' }) : step === 3
        ? toolReply('write', { file_path: 'chip-b.txt', content: 'New chip file\n' }) : textReply('Two native edits completed.'));
  await f.prompt(cursor.sessionId, 'Produce native checkpoint files for compact review'); f.replyWith();
  await f.prompt(empty.sessionId, 'No file changes'); await f.prompt(codex.sessionId, 'Separate product');
  for (const [id, title] of [[cursor.sessionId, 'Chip Cursor edited'], [empty.sessionId, 'Chip Cursor empty'], [codex.sessionId, 'Chip Codex']]) await f.rpc('session/rename', { sessionId: id, title });
  const checkpointResponse = await fetch(f.origin + '/omaa/api/checkpoints?session=' + cursor.sessionId, { headers: { cookie: f.cookie } });
  const checkpointData = await checkpointResponse.json(); assert.equal(checkpointResponse.status, 200);
  const checkpoint = checkpointData.checkpoints.findLast(row => row.reviewAvailable && row.summary.files.length);
  assert(checkpoint, 'native changes-review must actually exist'); assert.equal(checkpoint.summary.files.length, 2);
  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { if (t.passed === false && !page.isClosed()) { await page.screenshot({ path: join(evidenceDir, 'failure.png') }); t.diagnostic((await page.locator('body').innerText()).slice(-5000)); } } finally { await browser.close(); } });
  await page.goto(f.origin); await page.getByRole('button', { name: /^(Continue|继续)$/ }).click();
  await page.getByText('Chip Cursor edited', { exact: true }).first().click();
  const chip = page.locator('.omaa-composer-chips .omaa-checkpoint-review-chip');
  const label = `回合 ${checkpoint.turn} 改动 · 2 个文件`;
  await page.getByRole('button', { name: label, exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Cursor 文件检查点' }).count(), 0, 'input entry works before opening settings');
  await chip.focus(); await page.keyboard.press('Enter');
  const review = page.locator('[data-changes-review]:visible'); await review.locator('[data-diff-line]').first().waitFor();
  await review.getByText('After chip review', { exact: true }).first().waitFor();
  await page.screenshot({ path: join(evidenceDir, 'light-native-review.png') });
  assert.deepEqual(await readFile(join(f.workspace, 'chip-a.txt')), Buffer.from('After chip review\nSecond line\n'));
  assert.equal(await readFile(join(f.workspace, 'chip-b.txt'), 'utf8'), 'New chip file\n');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
  await page.screenshot({ path: join(evidenceDir, 'dark-native-review.png') });
  // The native pane auto-enters fullscreen below 768px. Collapse it through
  // its real control before measuring the narrow composer, keeping its scope.
  await page.locator('[data-sidebar-right-toggle]:visible').click();
  await page.locator('[data-changes-review]:visible').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 900 }); await chip.waitFor();
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
  const narrow = await until(async () => { const box = await chip.boundingBox(); return box && box.x >= 0 && box.x + box.width <= 390 && box; }, 5000);
  assert(narrow && narrow.x >= 0 && narrow.x + narrow.width <= 390, JSON.stringify(narrow));
  await page.screenshot({ path: join(evidenceDir, 'narrow-input.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const release = f.holdNextReply(); await f.send(cursor.sessionId, 'Hold this actual native run'); await until(async () => (await f.api(cursor.sessionId)).value.running);
  await until(async () => await chip.count() === 0);
  await f.rpc('session/cancel', { sessionId: cursor.sessionId }); release(); await until(async () => !(await f.api(cursor.sessionId)).value.running);
  await page.getByRole('button', { name: label, exact: true }).waitFor();
  await chip.click(); await review.locator('[data-diff-line]').first().waitFor();
  await page.getByText('Chip Cursor empty', { exact: true }).first().click(); await page.getByRole('button', { name: 'Cursor 预设设置', exact: true }).waitFor();
  await until(async () => await page.locator('.omaa-checkpoint-chip-status').count() === 0); assert.equal(await chip.count(), 0);
  assert.equal(await page.locator('[data-changes-review]:visible').count(), 0, 'other session must not show the former review');
  await page.getByText('Chip Codex', { exact: true }).first().click(); await page.getByRole('button', { name: 'Codex 预设设置', exact: true }).waitFor(); assert.equal(await chip.count(), 0);
  await page.getByText('Chip Cursor edited', { exact: true }).first().click(); await page.getByRole('button', { name: label, exact: true }).waitFor();
  await f.stop(); await f.uninstall(); await f.boot();
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  await page.goto(f.origin); await page.reload();
  await until(async () => await page.locator('[contenteditable="true"]').count() > 0);
  assert.equal(await page.locator('.omaa-composer-chips').count(), 0); assert.equal(await page.locator('style[data-omaa-controls]').count(), 0);
  assert.deepEqual(await readFile(join(f.workspace, 'chip-a.txt')), Buffer.from('After chip review\nSecond line\n'));
  assert.deepEqual(errors, []);
  await writeFile(join(evidenceDir, 'installed-evidence.json'), JSON.stringify({ host: f.evidence.version, isolation: f.evidence.isolation, nativeCheckpoint: { turn: checkpoint.turn, seq: checkpoint.seq, files: checkpoint.summary.files }, keyboardOpen: true, cancelRestoresEntry: true, emptySessionHidden: true, productSwitchHidden: true, narrow, uninstallEntryAndStylesRemoved: true, byteChecks: { modified: true, created: true, navigationPreserved: true }, pageErrors: errors }, null, 2) + '\n');
});
