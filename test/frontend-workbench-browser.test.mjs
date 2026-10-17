import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const evidence = resolve('work/rea-upgrade/frontend-015/components');
const cssFiles = ['preset-controls.css', 'workbench.css'];
const graphAliases = JSON.parse(await readFile(new URL('../scripts/zcode-graph-ui-aliases.json', import.meta.url), 'utf8'));
const alias = Object.fromEntries([
  ['@/ErrorBoundary.js', 'src/client/zcode-artifact-primitives.jsx'],
  ['@/components/lib/utils.js', 'src/presets/zcode/sources/upstream/packages/ui/src/components/lib/utils.ts'],
  ['@/components/ui/chart.js', 'src/presets/zcode/sources/upstream/packages/ui/src/components/ui/chart.tsx'],
  ...['apply', 'spec', 'palette', 'parts'].map(name => ['@/app-shell/workflow-artifacts/presets/' + name + '.js', 'src/presets/zcode/sources/upstream/packages/ui/src/app-shell/workflow-artifacts/presets/' + name + (name === 'parts' ? '.tsx' : '.ts')]),
  ...Object.entries(graphAliases),
].map(([key, path]) => [key, root + path]));
const bundle = await build({ stdin: { resolveDir: root, contents: `
  export { PresetControls } from './src/client/preset-controls.jsx';
  export { GitReview } from './src/client/git-review.jsx';
  export { CheckpointControls } from './src/client/checkpoint-controls.jsx';
  export { PiBranches } from './src/client/pi-branches.jsx';
  export { PiExtensions } from './src/client/pi-extensions.jsx';
  export { ZCodeWorkflows } from './src/client/zcode-workflows.jsx';
  export { createThemeRuntime } from './src/client/themes/runtime.mjs';
  export { products } from './src/shared/products.mjs';
  export { default as adapterCss } from './src/client/themes/shared/adapter.css';
  export { default as codexCss } from './src/client/themes/shared/codex-layout.css';
  export { default as cursorCss } from './src/client/themes/cursor-agent.css';
  export { default as responsiveCss } from './src/client/themes/responsive.css';
  export { default as React } from 'react';
  export { createRoot } from 'react-dom/client'; export { flushSync } from 'react-dom';
` }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'frontendFixture', target: 'es2022', alias,
  plugins: [{ name: 'css-text', setup(builder) { builder.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }],
});

test('five product components retain themes, fit narrow workbenches and recover settings without claiming native execution', { timeout: 60000 }, async t => {
  await mkdir(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<style>html{--dsw-alias-label-primary:#202124;--dsw-alias-label-secondary:#526070;--dsw-alias-label-tertiary:#697684;--dsw-alias-brand-primary:#1474de;--dsw-alias-border-l2:#ccd4dc;--dsw-alias-bg-layer-1:#f5f7fa;--dsw-alias-markdown-code-block:#f5f7fa;--dsw-alias-state-error-primary:#c62828;--dsw-alias-interactive-bg-hover:#e8edf3}body{margin:0;background:var(--omd-bg,#fff);font:13px/1.5 system-ui;color:var(--dsw-alias-label-primary)}#app{width:360px;margin:12px;background:var(--omd-surface-solid,#fff);border:1px solid var(--dsw-alias-border-l2)}.native-header{display:grid}button,select{font:inherit}</style><div class="wSkVaW_header native-header">Native header control</div><div id="app"></div>`);
  await page.addStyleTag({ content: (await Promise.all(cssFiles.map(name => readFile(root + 'src/client/' + name, 'utf8')))).join('\n') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { React, createRoot, flushSync, PresetControls, GitReview, CheckpointControls, PiBranches, PiExtensions, ZCodeWorkflows, createThemeRuntime, products, adapterCss, codexCss, cursorCss, responsiveCss } = frontendFixture;
    let state = { sessionId: 'fixture', data: null, loading: false, saving: false, error: '' }, appearance = 'light';
    const listeners = new Set(), themeListeners = new Set(), actions = [];
    const emit = () => flushSync(() => { for (const fn of listeners) fn(); });
    const settings = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => state,
      async refresh() { actions.push('refresh'); }, async update(patch) { actions.push(patch); state = { ...state, data: { ...state.data, ...patch } }; emit(); } };
    const theme = { getTheme: () => ({ preference: appearance, active: { colorScheme: appearance } }), overrideTokens(id, tokens) {
      const tag = document.createElement('style'); tag.dataset.fixtureTokens = id;
      tag.textContent = ['light','dark'].map(mode => `html[data-appearance="${mode}"]{${Object.entries(tokens).map(([key, value]) => `${key}:${value[mode]}`).join(';')}}`).join('\n');
      document.head.append(tag); return () => tag.remove();
    } };
    const runtime = createThemeRuntime({ theme, on: (name, fn) => { themeListeners.add(fn); return () => themeListeners.delete(fn); }, configForms: { get: () => ({ getSnapshot: () => ({ mode: 'file' }), set: async (key, value) => { appearance = value; for (const fn of themeListeners) fn(theme.getTheme()); return true; } }) } }, settings, adapterCss, { 'codex-desktop': codexCss, 'cursor-agent': cursorCss }, responsiveCss);
    const sidebarRight = { mounted: { getSnapshot: () => state.sessionId, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } }, openResourceIn: (...args) => actions.push(args), openResource: value => actions.push(value) };
    const sessions = { refresh: async () => {}, list: { getSnapshot: () => ({ byId: {} }) } }, uiWorkspace = { openSession: value => actions.push(value) };
    window.fetch = async (target, options = {}) => {
      const url = new URL(target, 'https://fixture.invalid/'), id = state.sessionId; let value;
      if (url.pathname.endsWith('/git-review')) value = url.searchParams.has('path') ? { diff: { path: 'src/example-with-long-name.mjs', display: 'src/example-with-long-name.mjs', kind: 'text', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old()', '+new()'] }] } } : { sessionId: id, root: '/fixture', revision: 'read-only-fixture-revision', scope: 'unstaged', total: 1, added: 1, deleted: 1, files: [{ path: 'src/example-with-long-name.mjs', added: 1, deleted: 1, actions: ['stage','revert'] }] };
      else if (url.pathname.endsWith('/checkpoints')) value = { sessionId: id, checkpoints: [{ turn: 1, seq: 9, reviewAvailable: true, summary: { files: [{ path: 'src/example-with-long-name.mjs' }] }, files: [{ path: 'src/example-with-long-name.mjs', before: { kind: 'bytes' }, after: { kind: 'bytes' }, restorable: true }] }] };
      else if (url.pathname.endsWith('/pi-branches')) value = { sessionId: id, head: 20, canFork: true, points: [{ seq: 20, turn: 2 }], branches: [{ sessionId: id, title: '当前工作分支', current: true }, { sessionId: 'other', parentSessionId: id, title: '检查错误与实现', cwd: '/fixture' }] };
      else if (url.pathname.endsWith('/pi-extensions')) value = { files: ['/fixture/explicit-extension.ts'], revision: 1, states: [] };
      else if (url.pathname.endsWith('/zcode-workflows')) value = { sessionId: id, runs: [{ runId: 'real-shape', status: 'completed', name: 'Compile and publish' }] };
      else if (url.pathname.endsWith('/zcode-workflow')) value = { sessionId: id, runId: 'real-shape', status: 'completed', artifacts: [{ id: 'one', title: 'Final metrics', kind: 'metrics', spec: { metrics: [{ field: 'value', label: 'Quality' }] }, primary: true }, { id: 'two', title: 'Second metrics', kind: 'metrics', spec: { metrics: [{ field: 'value' }] } }], graph: { steps: [] }, reports: [{ sequence: 1, siteId: 'fixture', ordinal: 0, item: { value: 42 } }] };
      else if (url.pathname.endsWith('/zcode-artifact-data')) value = { sessionId: id, runId: 'real-shape', id: url.searchParams.get('id'), cursor: 1, hasMore: false, items: [{ sequence: 1, siteId: 'fixture', ordinal: 0, item: { value: 42 } }] };
      else throw new Error('Unexpected fixture request: ' + url.pathname);
      return new Response(JSON.stringify(value), { status: 200 });
    };
    const root = createRoot(document.getElementById('app'));
    window.renderProduct = (id, mode = 'light', width = 360) => {
      const product = products.find(value => value.id === id); appearance = mode;
      state = { sessionId: 'fixture-' + id, agentPreset: product.preset, data: { product, mode: 'default', theme: 'product', running: false, enhancement: true, enhancementActive: true, omdAvailable: true, enhancementWorkMode: 'pro', enhancementWorkModeAvailable: true, enhancementWorkModeActive: true }, loading: false, saving: false, error: '' };
      document.getElementById('app').style.width = width + 'px';
      flushSync(() => { for (const fn of listeners) fn(); for (const fn of themeListeners) fn(theme.getTheme()); });
      flushSync(() => root.render(React.createElement('div', { className: 'omaa-workbench', 'data-product': id },
        React.createElement(PresetControls, { settings, getThemeRuntime: () => runtime, compact: true, openPanel: () => actions.push('open') }),
        React.createElement(PresetControls, { settings, getThemeRuntime: () => runtime, visible: false }),
        React.createElement(GitReview, { settings, sidebarRight, sessions }), React.createElement(CheckpointControls, { settings, sidebarRight, sessions }),
        React.createElement(PiBranches, { settings, uiWorkspace, sessions }), id === 'pi' && React.createElement(PiExtensions, { settings }),
        id === 'zcode' && React.createElement(ZCodeWorkflows, { settings, sidebarRight }))));
    };
    window.patchProduct = patch => { state = { ...state, ...patch, data: patch.data === null ? null : { ...state.data, ...patch.data } }; emit(); };
    window.componentActions = actions;
    window.disposeProduct = () => { root.unmount(); runtime.dispose(); };
  });
  const checks = [];
  for (const product of ['codex','grok','cursor','pi','zcode']) for (const appearance of ['light','dark']) {
    await page.evaluate(({ product, appearance }) => renderProduct(product, appearance, 260), { product, appearance });
    await page.getByRole('button', { name: new RegExp('预设设置$') }).waitFor();
    if (product === 'codex') { await page.locator('.omaa-git-path').click(); await page.locator('.omaa-git-diff').waitFor(); }
    if (product === 'cursor') await page.getByRole('button', { name: '预览当前文件', exact: true }).waitFor();
    if (product === 'pi') await page.getByRole('button', { name: '创建并打开新分支', exact: true }).waitFor();
    if (product === 'zcode') await page.locator('.omaa-zcode-artifact').waitFor();
    const geometry = await page.locator('#app').evaluate(node => ({ overflow: node.scrollWidth > node.clientWidth + 1, width: node.clientWidth, text: node.textContent, theme: document.documentElement.dataset.omaaTheme, appearance: document.documentElement.dataset.appearance, font: getComputedStyle(node).fontFamily }));
    assert.equal(geometry.overflow, false, product + '/' + appearance + ' workbench overflow');
    assert.equal(geometry.appearance, appearance);
    if (product === 'pi') assert(!geometry.text.includes('工作模式执行计划'), 'Pi retains its default execution mode');
    checks.push({ product, appearance, ...geometry, text: undefined });
    await page.locator('#app').screenshot({ path: resolve(evidence, product + '-' + appearance + '-narrow.png') });
  }
  await page.getByRole('button', { name: /Final metrics/ }).focus(); await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.omaa-zcode-artifact-tabs [aria-current="page"]').innerText(), /Second metrics/);
  await page.keyboard.press('Home'); assert.match(await page.locator('.omaa-zcode-artifact-tabs [aria-current="page"]').innerText(), /Final metrics/);
  await page.getByRole('button', { name: '源码与记录', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '工作流源码与记录');
  await page.evaluate(() => { document.documentElement.dataset.omdReduceEffects = ''; document.querySelector('.omaa-zcode-artifact').classList.add('omaa-zcode-reveal'); });
  assert.equal(await page.locator('.omaa-zcode-artifact').evaluate(node => getComputedStyle(node).animationName), 'none');
  await page.addStyleTag({ content: '.omaa-zcode-artifact::before{content:"";animation:omaa-zcode-reveal 1s infinite;transition:opacity 1s;backdrop-filter:blur(4px)}' });
  assert.deepEqual(await page.locator('.omaa-zcode-artifact').evaluate(node => { const style = getComputedStyle(node,'::before'); return { animation: style.animationName, transition: style.transitionDuration, backdrop: style.backdropFilter }; }), { animation: 'none', transition: '0s', backdrop: 'none' });
  await page.evaluate(() => patchProduct({ error: '读取权限已改变' }));
  assert.equal(await page.locator('style[data-omaa-theme-style]').count(), 0);
  assert.equal(await page.locator('.omaa-preset-chip').getAttribute('data-state'), 'error');
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  assert(await page.evaluate(() => componentActions.includes('refresh')));
  await page.evaluate(() => patchProduct({ error: '', data: { omdAvailable: false, enhancementActive: false } }));
  await page.getByRole('button', { name: '检查增强状态', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: 'OMD 增强', exact: true }).isDisabled(), true);
  await page.evaluate(() => patchProduct({ data: { theme: 'host' } }));
  assert.equal(await page.locator('.native-header').evaluate(node => getComputedStyle(node).display), 'grid', 'OMAA must not restyle the host header after releasing appearance');
  await page.evaluate(() => disposeProduct());
  assert.equal(await page.locator('style[data-omaa-theme-style],style[data-fixture-tokens]').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'verification.json'), JSON.stringify({ verified: true, scope: 'Pure CFT component execution with synthetic API fixtures; this is not native host or hardware acceptance.', browser: chromium.executablePath(), bundleSha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex'), checks, errors, disposed: true }, null, 2) + '\n');
});
