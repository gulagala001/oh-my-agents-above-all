import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('saved tool cards validate parameters, submit native requests and invalidate callbacks across navigation', { timeout: 45000 }, async t => {
  const bundle = await build({ stdin: { contents: `export { ZCodeSavedWorkflowTool } from './src/client/zcode-saved-workflow-tool.jsx'; export { default as React } from 'react'; export { createRoot } from 'react-dom/client'; export { flushSync } from 'react-dom';`, resolveDir: new URL('../', import.meta.url).pathname },
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'savedFixture', target: 'es2022',
    plugins: [{ name: 'css-text', setup(builder) { builder.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }],
  });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="app"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { React, createRoot, flushSync, ZCodeSavedWorkflowTool } = savedFixture;
    const root = createRoot(document.getElementById('app')), listeners = new Set(), mountedListeners = new Set();
    let state = { sessionId: 'one', agentPreset: 'omaa-zcode', data: { product: { id: 'zcode' }, mode: 'default', running: false } }, mounted = 'one', props, pending, calls = 0;
    const prompts = [], submissions = [], opened = [];
    const session = { getSnapshot: () => ({ running: state.data.running }), beginSubmission(value) { const item = { ...value, requestId: 'receipt', abandon() { item.abandoned = true; } }; submissions.push(item); return item; },
      async prompt(...args) { prompts.push(args); return { ok: true, value: { accepted: true } }; } };
    const settings = { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const sidebarRight = { mounted: { getSnapshot: () => mounted, subscribe: fn => { mountedListeners.add(fn); return () => mountedListeners.delete(fn); } }, openTabIn(...args) { opened.push(args); } };
    const sessions = { using(id, options, fn) { return fn({ ready: pending || Promise.resolve({ session }) }); } };
    function useDisclosure() { const [expanded, set] = React.useState(true); return { expanded, toggle: () => set(value => !value) }; }
    window.renderSaved = (toolName, value, phase = 'result', extra = {}) => {
      props = { settings, sidebarRight, sessions, sessionId: 'one', callId: `saved-call-${++calls}`, toolName, phase, block: { content: [{ type: 'text', text: JSON.stringify(value) }], ...extra }, useDisclosure };
      flushSync(() => root.render(React.createElement(ZCodeSavedWorkflowTool, props)));
    };
    window.patchSaved = patch => { state = { ...state, ...patch, data: { ...state.data, ...patch.data } }; flushSync(() => { for (const fn of listeners) fn(); }); };
    window.mountSaved = id => { mounted = id; flushSync(() => { for (const fn of mountedListeners) fn(); }); };
    window.holdSaved = () => { pending = new Promise(resolve => { window.releaseSaved = () => { resolve({ session }); pending = undefined; }; }); };
    window.unmountSaved = () => flushSync(() => root.unmount());
    window.savedActions = { prompts, submissions, opened };
  });
  const definition = { name: 'reuse', scope: 'project', path: '/isolated/project/.zcode/workflows/reuse.dwf.ts', facade: 'zcode', script: 'return args;', source: 'saved source', description: 'Parameters', args: {
    text: { type: 'string', required: true }, count: { type: 'number', default: 0 }, enabled: { type: 'boolean', default: false }, data: { type: 'json', default: null },
  } };
  const render = (name, value, phase = 'result', extra = {}) => page.evaluate(({ name, value, phase, extra }) => renderSaved(name, value, phase, extra), { name, value, phase, extra });
  const { name, scope, path, description, args } = definition;
  const listed = { name, scope, path, description, args };
  await render('list_saved_workflows', { workflows: [listed, { ...listed, scope: 'global', path: '/isolated/home/.zcode/workflows/reuse.dwf.ts' }], invalid: [{ path: '/isolated/broken.dwf.ts', reason: 'invalid_metadata' }] });
  assert.match(await page.locator('.omaa-saved-body').innerText(), /项目/); assert.match(await page.locator('.omaa-saved-body').innerText(), /全局/);
  await page.getByText('invalid_metadata', { exact: true }).waitFor();
  await page.getByRole('button', { name: '读取定义', exact: true }).nth(1).click();
  await page.getByRole('status').filter({ hasText: '请求已发送' }).waitFor();
  await page.locator('.omaa-saved-title').click();
  assert.equal(await page.locator('.omaa-saved-body').count(), 0);
  assert.equal(await page.getByRole('status').filter({ hasText: '请求已发送' }).isVisible(), true, 'accepted request remains visible when the tool body is collapsed');
  await page.locator('.omaa-saved-title').click();
  assert.match(await page.evaluate(() => savedActions.prompts[0][0][0].text), /"scope":"global"/);
  await render('read_saved_workflow', definition);
  await page.getByText('默认值：0', { exact: true }).waitFor(); await page.getByText('默认值：false', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: '传入 count', exact: true }).check(); await page.getByRole('textbox', { name: '参数 count', exact: true }).fill('0');
  await page.getByRole('checkbox', { name: '传入 enabled', exact: true }).check(); await page.getByRole('combobox', { name: '参数 enabled', exact: true }).selectOption('false');
  await page.getByRole('checkbox', { name: '传入 data', exact: true }).check(); await page.getByRole('textbox', { name: '参数 data', exact: true }).fill('null');
  await page.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '请求已发送' }).waitFor();
  const sent = await page.evaluate(() => savedActions.prompts[1]);
  assert.match(sent[0][0].text, /"args":\{"text":"","count":0,"enabled":false,"data":null\}/); assert.equal(sent[3], 'receipt');
  await page.getByRole('checkbox', { name: '传入 text', exact: true }).uncheck(); await page.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: "missing required argument 'text'" }).waitFor();
  await page.getByRole('checkbox', { name: '传入 text', exact: true }).check(); await page.getByRole('textbox', { name: '参数 count', exact: true }).fill('1e999');
  await page.getByRole('button', { name: '发送运行请求', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '有限数字' }).waitFor();
  await page.getByRole('textbox', { name: '参数 count', exact: true }).fill('0');
  await page.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[{"overflow":1e999}]}');
  await page.getByRole('button', { name: '发送运行请求', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '数字必须为有限值' }).waitFor();
  await page.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[{"integer":9007199254740993}]}');
  await page.getByRole('button', { name: '发送运行请求', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '整数超出可精确处理的范围' }).waitFor();
  assert.equal(await page.evaluate(() => savedActions.prompts.length), 2);
  await page.evaluate(() => patchSaved({ data: { mode: 'ask' } }));
  assert.equal(await page.getByRole('button', { name: '发送运行请求', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '重新读取定义', exact: true }).click(); await page.getByRole('status').filter({ hasText: '请求已发送' }).waitFor();
  await page.evaluate(() => patchSaved({ data: { mode: 'default' } }));
  await render('read_saved_workflow', { ...definition, args: { count: { type: 'number', default: false } } });
  await page.getByRole('button', { name: '发送运行请求', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'default value' }).waitFor();
  await render('read_saved_workflow', { ...definition, facade: 'unknown' });
  assert.equal(await page.getByRole('button', { name: '发送运行请求', exact: true }).count(), 0);
  await render('read_saved_workflow', definition); await page.evaluate(() => holdSaved());
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(value => value.textContent === '重新读取定义');
    window.oldSavedClick = Object.entries(button).find(([key]) => key.startsWith('__reactProps$'))[1].onClick;
  });
  await page.getByRole('button', { name: '重新读取定义', exact: true }).click();
  await page.evaluate(() => { mountSaved('two'); mountSaved('one'); releaseSaved(); });
  await page.waitForTimeout(20); await page.evaluate(() => oldSavedClick());
  assert.equal(await page.evaluate(() => savedActions.prompts.length), 3);
  await render('run_saved_workflow', { name: 'reuse', scope: 'project', path: definition.path, result: { ok: true, status: 'backgrounded', runId: 'actual-run', jobId: 'actual-job' } });
  await page.getByRole('button', { name: '查看运行与产物', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => savedActions.opened), [['one', 'omaa-zcode-workflows', { params: { runId: 'actual-run' } }]]);
  await render('run_saved_workflow', { name: 'reuse', scope: 'project', path: definition.path, result: { ok: false, runId: 'actual-failed-run', reports: [], actors: [], error: { kind: 'failed', message: 'actual failure' } } });
  await page.getByRole('button', { name: '查看运行与产物', exact: true }).click();
  assert.equal(await page.evaluate(() => savedActions.opened.at(-1)[2].params.runId), 'actual-failed-run');
  for (const kind of ['foreground', 'background']) {
    await render('run_saved_workflow', { name: 'reuse', scope: 'project', path: definition.path, result: { kind, runId: 'native-run', ...(kind === 'foreground' ? { agentsStarted: 0, result: { value: 0 } } : { jobId: 'native-job' }) } });
    assert.equal(await page.getByRole('button', { name: '查看运行与产物', exact: true }).count(), 0, kind);
    assert.match(await page.locator('.omaa-saved-body').innerText(), /native-run/);
    if (kind === 'background') assert.match(await page.locator('.omaa-saved-title').innerText(), /已启动后台任务/);
  }
  await page.evaluate(() => patchSaved({ data: { running: true } }));
  await render('read_saved_workflow', definition); assert.equal(await page.getByRole('button', { name: '重新读取定义', exact: true }).isDisabled(), true);
  await page.evaluate(() => patchSaved({ data: { running: false } })); await page.evaluate(() => holdSaved());
  await page.getByRole('button', { name: '重新读取定义', exact: true }).click(); await page.evaluate(() => { unmountSaved(); releaseSaved(); });
  await page.waitForTimeout(20); assert.equal(await page.evaluate(() => savedActions.prompts.length), 3);
  assert.deepEqual(errors, []);
});
