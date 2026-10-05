import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('checkpoint retry and Pi fork recovery preserve the actual native target', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `
    export { CheckpointControls } from './src/client/checkpoint-controls.jsx';
    export { PiBranches } from './src/client/pi-branches.jsx';
    export { default as React } from 'react';
    export { createRoot } from 'react-dom/client';
    export { flushSync } from 'react-dom';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'recoveryFixture', target: 'es2022',
  plugins: [{ name: 'css-text', setup(builder) { builder.onLoad({ filter: /\.css$/ }, async args => ({
    contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js',
  })); } }] });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { React, createRoot, flushSync, CheckpointControls, PiBranches } = recoveryFixture;
    let state = { sessionId: 'cursor-a', data: { product: { id: 'cursor' }, mode: 'default', running: false } };
    const listeners = new Set(), calls = [], opened = [];
    const settings = { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const set = value => { state = value; flushSync(() => { for (const fn of listeners) fn(); }); };
    window.fetch = (url, options = {}) => new Promise(resolve => calls.push({ url, options,
      finish: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status })) }));
    const sidebarRight = { mounted: { getSnapshot: () => state.sessionId }, openResourceIn: (...args) => opened.push(args) };
    const uiWorkspace = { openSession: id => opened.push(id) };
    const sessions = { refresh: async () => { throw new Error('列表暂时断线'); } };
    const root = createRoot(document.getElementById('app'));
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const until = async predicate => {
      for (let i = 0; i < 500; i++) { if (predicate()) return; await tick(); }
      throw new Error('panel did not settle');
    };
    const button = name => [...document.querySelectorAll('button')].find(node => node.textContent === name);
    const click = name => { const node = button(name); if (!node || node.disabled) throw new Error('unavailable action: ' + name); flushSync(() => node.click()); };
    const stages = {};
    try {
      flushSync(() => root.render(React.createElement(React.Fragment, null,
        React.createElement(CheckpointControls, { settings, sidebarRight, sessions }),
        React.createElement(PiBranches, { settings, uiWorkspace, sessions }))));
      await until(() => calls.length === 1); calls.at(-1).finish({ error: '临时读取失败' }, 503);
      await until(() => document.querySelector('[role="alert"]')?.textContent.includes('临时读取失败') && button('刷新检查点') && !button('刷新检查点').disabled);
      stages.failedCheckpoint = document.querySelector('select[aria-label="文件检查点"]').textContent;
      click('刷新检查点'); await until(() => calls.length === 2);
      calls.at(-1).finish({ sessionId: 'cursor-a', checkpoints: [{ turn: 1, seq: 9, reviewAvailable: false,
        files: [{ path: 'src/a.js', before: { kind: 'bytes' }, after: { kind: 'bytes' }, restorable: true }] }] });
      await until(() => button('预览当前文件')); click('预览当前文件');
      stages.preview = opened.at(-1);
      set({ sessionId: 'pi-a', data: { product: { id: 'pi' }, mode: 'default', running: false } });
      await until(() => calls.at(-1).url.includes('/pi-branches'));
      const branchData = points => ({ sessionId: 'pi-a', head: 20, canFork: true,
        branches: [{ sessionId: 'pi-a', title: '原分支', current: true }], points });
      calls.at(-1).finish(branchData([{ seq: 10, turn: 1 }, { seq: 20, turn: 2 }]));
      await until(() => button('创建并打开新分支') && !button('创建并打开新分支').disabled);
      const select = document.querySelector('select[aria-label="Pi 分叉位置"]');
      flushSync(() => { select.value = '10'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      click('刷新分支'); await tick(); calls.at(-1).finish(branchData([{ seq: 20, turn: 2 }]));
      await until(() => !button('创建并打开新分支').disabled);
      stages.refreshedPoint = select.value;
      click('创建并打开新分支'); await until(() => calls.at(-1).options.method === 'POST');
      stages.forkBody = JSON.parse(calls.at(-1).options.body);
      calls.at(-1).finish({ sessionId: 'pi-child', parentSessionId: 'pi-a', summaryIncluded: false });
      await until(() => button('打开已创建分支') && !button('打开已创建分支').disabled);
      stages.createdNotice = document.body.textContent.includes('分支已创建，列表刷新失败');
      stages.duplicateDisabled = button('创建并打开新分支').disabled;
      click('打开已创建分支'); await until(() => opened.at(-1) === 'pi-child'); stages.recoveredTarget = opened.at(-1);
      stages.posts = calls.filter(call => call.options.method === 'POST').length;
      return stages;
    } finally { root.unmount(); }
  });
  assert.match(result.failedCheckpoint, /读取失败，请刷新/);
  assert.deepEqual(result.preview, ['cursor-a', 'dsh-resource://file/session/cursor-a/src/a.js']);
  assert.equal(result.refreshedPoint, '');
  assert.deepEqual(result.forkBody, { head: 20, withSummary: false });
  assert.equal(result.createdNotice, true);
  assert.equal(result.duplicateDisabled, true);
  assert.equal(result.recoveredTarget, 'pi-child');
  assert.equal(result.posts, 1);
});
