import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const repo = new URL('../', import.meta.url).pathname;
const hostRequire = createRequire(await realpath(join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js')));
const keys = ['create_workflow', 'amend_workflow', 'save_workflow', 'list_saved_workflows', 'read_saved_workflow', 'run_saved_workflow'];

test('six ZCode views are public low-priority fallbacks and preserve foreign registrations in either load order', async () => {
  const source = await readFile(join(repo, 'src/client/index.jsx'), 'utf8'), priorities = new Map();
  for (const match of source.matchAll(/for \(const key of \[([^\]]+)\]\) ctx\.slots\.inject\('tool.call.toolview', \(\) => ctx\.slots\.register\(\{ name: 'tool.call.toolview', key, priority: (\d+)/g)) {
    for (const key of match[1].matchAll(/'([^']+)'/g)) priorities.set(key[1], Number(match[2]));
  }
  assert.equal(priorities.size, 6); for (const key of keys) assert.equal(priorities.get(key), 100, key);
  assert(source.includes("inject: sessionId => ({ openArtifacts: runId => ctx.sidebarRight.openTabIn(sessionId, 'omaa-zcode-workflows', { params: { runId } }) })"));
  assert(source.includes('inject: sessionId => ({ sessionId, toolName: key, settings, sessions: ctx.sessions, sidebarRight: ctx.sidebarRight })'));
  const file = join(dirname(hostRequire.resolve('@deepseek-ai/dsh-client-ui-renderer/package.json')), 'lib/client.js');
  const require = createRequire(file), { Context } = require('@deepseek-ai/cordis'); let native;
  vm.runInNewContext(await readFile(file, 'utf8'), { window: { __ModuleLoader__: { load(value) { native = value.factory(require); } } }, console });
  for (const key of keys) for (const order of [['foreign', 'omaa'], ['omaa', 'foreign']]) {
    const ctx = new Context(); new native.SlotRegistry(ctx);
    ctx.slots.register({ name: 'root', children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } } }, () => {});
    const declared = ctx.slots.spec('tool.call.toolview'), foreign = () => null, own = () => null;
    const foreignInject = () => ({ original: true }), ownInject = () => ({ saved: true }), off = {};
    for (const owner of order) off[owner] = ctx.slots.register({ name: 'tool.call.toolview', key,
      ...(owner === 'omaa' ? { priority: priorities.get(key), inject: ownInject } : { inject: foreignInject, locale: 'foreign-original' }),
    }, owner === 'omaa' ? own : foreign);
    assert.equal(ctx.slots.entriesOfSlot('tool.call.toolview')[0].component, foreign, `${key}:${order}`);
    const entry = ctx.slots.entries('tool.call.toolview').find(row => row.component === foreign);
    assert.equal(entry.inject, foreignInject); assert.equal(entry.locale, 'foreign-original'); assert.equal(ctx.slots.spec('tool.call.toolview'), declared);
    off.foreign(); assert.equal(ctx.slots.entriesOfSlot('tool.call.toolview')[0].component, own);
    off.omaa(); assert.equal(ctx.slots.entries('tool.call.toolview').length, 0); await ctx.fiber.dispose();
  }
});

test('real native foreign results remain read-only when incompatible, then normal cards and inherited status strings still render', { timeout: 45000 }, async t => {
  const { Context } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')));
  const { default: SystemPrompt } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-system-prompt')));
  const { default: Tools } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-tools')));
  const ctx = new Context(); await ctx.plugin(SystemPrompt, {}); await ctx.plugin(Tools, { mode: 'native' }); t.after(() => ctx.fiber.dispose());
  const read = { name: 'reuse', scope: 'project', path: '/project/reuse.dwf.ts', description: 'Actual definition', facade: 'zcode', script: 'return args;', source: 'saved source', bodyLineOffset: 0, args: { value: { type: 'number', default: 0 } } };
  const corrupt = [
    ['list_saved_workflows', { workflows: [null] }],
    ['list_saved_workflows', { workflows: [{ name: 'foreign', scope: 'project', path: '/foreign', description: { format: 'custom' } }] }],
    ['list_saved_workflows', { workflows: [], invalid: [null] }],
    ['list_saved_workflows', { workflows: [], invalid: [{ path: '/bad', reason: { details: true } }] }],
    ['list_saved_workflows', { workflows: [], name: 'foreign', scope: {} }],
    ['read_saved_workflow', { ...read, description: {} }],
    ['read_saved_workflow', { ...read, whenToUse: {} }],
    ['read_saved_workflow', { ...read, bodyLineOffset: {} }],
    ['read_saved_workflow', { ...read, args: { value: { type: 'unknown' } } }],
    ['save_workflow', { ok: true, name: 'foreign', scope: 'project', path: '/foreign', description: {}, diagnostics: [], response: 'foreign', overwritten: false }],
    ['save_workflow', { ok: true, name: 'foreign', scope: 'project', path: '/foreign', diagnostics: [{ message: {} }], response: 'foreign', overwritten: false }],
    ['run_saved_workflow', { name: 'foreign', scope: 'project', path: '/foreign', result: { ok: true, runId: 'foreign', reports: [], actors: [], status: {} } }],
    ['run_saved_workflow', { name: 'foreign', scope: 'project', path: '/foreign', result: { kind: 'foreground', runId: 'foreign', agentsStarted: {}, result: {} } }],
    ['run_saved_workflow', { name: 'foreign', scope: 'project', path: '/foreign', result: { kind: 'custom', payload: true } }],
    ['list_saved_workflows', { customCatalog: { rows: [] } }],
  ];
  const canonical = async (name, value) => {
    const off = ctx.tools.register({ name, description: 'Independent foreign canonical result', parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute: () => value });
    try { const block = await ctx.tools.execute({ name, arguments: {}, callId: crypto.randomUUID(), signal: new AbortController().signal }); assert.equal(block.isError, false); return block; } finally { off(); }
  };
  const bundle = await build({ stdin: { contents: `export { ZCodeSavedWorkflowTool } from './src/client/zcode-saved-workflow-tool.jsx';export { ZCodeWorkflowTool } from './src/client/zcode-workflow-tool.jsx';export {default as React} from 'react';export {createRoot} from 'react-dom/client';export {flushSync} from 'react-dom';`, resolveDir: repo }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'compatFixture', target: 'es2022',
    plugins: [{ name: 'css-text', setup(builder) { builder.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }],
  });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="app"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { React, createRoot, flushSync, ZCodeSavedWorkflowTool, ZCodeWorkflowTool } = compatFixture, root = createRoot(document.getElementById('app'));
    const state = { sessionId: 'one', agentPreset: 'omaa-zcode', data: { product: { id: 'zcode' }, mode: 'default', running: false } };
    const settings = { subscribe: () => () => {}, getSnapshot: () => state }, sidebarRight = { mounted: { subscribe: () => () => {}, getSnapshot: () => 'one' } };
    function useDisclosure() { return { expanded: true, toggle() {} }; }
    window.renderCanonical = (toolName, block, legacy = false, phase = 'result') => flushSync(() => root.render(React.createElement(legacy ? ZCodeWorkflowTool : ZCodeSavedWorkflowTool, { toolName, block, phase, callId: 'canonical', sessionId: 'one', settings, sidebarRight, useDisclosure })));
  });
  for (const [toolName, value] of corrupt) {
    const block = await canonical(toolName, value); await page.evaluate(({ toolName, block }) => renderCanonical(toolName, block), { toolName, block });
    assert.equal(await page.getByRole('button', { name: /读取定义|发送运行请求|查看运行与产物|读取已保存定义/ }).count(), 0, JSON.stringify(value));
    assert.equal(await page.locator('.omaa-saved-body pre').innerText(), block.content[0].text);
    const normal = await canonical('read_saved_workflow', read); await page.evaluate(block => renderCanonical('read_saved_workflow', block), normal);
    await page.getByRole('button', { name: '发送运行请求', exact: true }).waitFor();
  }
  for (const status of ['__proto__', 'constructor']) {
    const block = await canonical('run_saved_workflow', { name: 'reuse', scope: 'project', path: read.path, result: { ok: true, runId: 'actual', reports: [], actors: [], status } });
    await page.evaluate(block => renderCanonical('run_saved_workflow', block), block); assert.match(await page.locator('.omaa-saved-title').innerText(), new RegExp(status));
    const legacy = await canonical('create_workflow', { ok: true, runId: 'actual', status });
    await page.evaluate(block => renderCanonical('create_workflow', block, true), legacy); assert.equal(await page.locator('.omaa-zcode-tool-status').innerText(), status);
  }
  const failure = { isError: true, content: [{ type: 'text', text: 'Actual native error result' }] };
  await page.evaluate(block => renderCanonical('save_workflow', block), failure); assert.match(await page.locator('.omaa-saved-body').innerText(), /Actual native error result/);
  for (const phase of ['preparing', 'start']) { await page.evaluate(phase => renderCanonical('list_saved_workflows', { content: [] }, false, phase), phase); assert.match(await page.locator('.omaa-saved-body').innerText(), /正在准备工具参数|等待实际工具结果/); }
  assert.deepEqual(errors, []);
});
