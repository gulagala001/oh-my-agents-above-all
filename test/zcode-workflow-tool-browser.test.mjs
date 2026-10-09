import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('workflow view reads rc.2 raw arguments and live native preparing arguments', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `
    export { ZCodeWorkflowTool } from './src/client/zcode-workflow-tool.jsx';
    export { default as React } from 'react';
    export { createRoot } from 'react-dom/client';
    export { flushSync } from 'react-dom';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'workflowFixture', target: 'es2022' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const stages = await page.evaluate(async () => {
    const { React, createRoot, flushSync, ZCodeWorkflowTool } = workflowFixture;
    const root = createRoot(document.getElementById('app'));
    const opened = [], inspected = [];
    function useDisclosure() {
      const [expanded, setExpanded] = React.useState(true);
      return { expanded, toggle: () => setExpanded(value => !value) };
    }
    const render = (phase, block) => {
      flushSync(() => root.render(React.createElement(ZCodeWorkflowTool, { phase, block, useDisclosure,
        callId: 'workflow-call', openArtifacts: runId => opened.push(runId), inspect: () => inspected.push('workflow-call') })));
      return { name: document.querySelector('.omaa-zcode-tool-title>span:nth-child(2)').textContent,
        status: document.querySelector('.omaa-zcode-tool-status').textContent,
        input: document.querySelector('pre').textContent };
    };
    const raw = '{\n  "name": "RC2 report", "steps": []\n}';
    const result = { call: { argsRaw: raw }, content: [{ type: 'text', text: '{"runId":"run-rc2","status":"completed","ok":true}' }] };
    try {
      const stages = { start: render('start', { argsRaw: raw }), result: render('result', result) };
      stages.output = document.querySelectorAll('pre')[1].textContent;
      flushSync(() => document.querySelector('.omaa-zcode-tool-artifacts').click());
      flushSync(() => document.querySelector('.omaa-zcode-tool-inspect').click());
      stages.actions = { opened, inspected };
      stages.saved = render('result', { ...result, call: { argsRaw: '{"saved":{"name":"Saved report"}}' } });
      stages.path = render('start', { argsRaw: '{"path":"workflows/report.json"}' });
      stages.malformed = render('result', { ...result, call: { argsRaw: '{"name":"unfinished' } });
      stages.invalidName = render('start', { argsRaw: '{"name":{},"saved":{"name":{}},"path":[]}' });
      stages.partialPreparing = render('preparing', { argsRaw: '{"name":"unavailable before start"}' });
      const values = {};
      const nativeArgs = {
        textPrefix: (key, size) => typeof values[key] === 'string' ? values[key].slice(0, size) : undefined,
        value: key => values[key], keys: () => Object.keys(values),
        text: key => typeof values[key] === 'string' ? values[key] : undefined,
      };
      stages.preparingEmpty = render('preparing', { args: nativeArgs });
      values.name = 'Live native report';
      stages.preparingGrown = render('preparing', { args: nativeArgs });
      stages.nativePriority = render('start', { args: nativeArgs, argsRaw: raw });
      stages.failed = render('result', { ...result, isError: true });
      stages.stopped = render('result', { ...result, error: { code: 'interrupted' } });
      stages.unknown = render('result', { call: { argsRaw: raw }, content: [{ type: 'text', text: 'unrecognized host result' }] });
      return stages;
    } finally { root.unmount(); }
  });
  assert.equal(stages.start.name, 'RC2 report');
  assert.equal(stages.result.name, 'RC2 report');
  assert.equal(stages.start.status, '执行中');
  assert.equal(stages.result.status, '已完成');
  assert.equal(stages.start.input, '{\n  "name": "RC2 report", "steps": []\n}');
  assert.equal(stages.result.input, stages.start.input);
  assert.equal(stages.output, '{"runId":"run-rc2","status":"completed","ok":true}');
  assert.deepEqual(stages.actions, { opened: ['run-rc2'], inspected: ['workflow-call'] });
  assert.equal(stages.saved.name, 'Saved report');
  assert.equal(stages.path.name, 'workflows/report.json');
  assert.equal(stages.malformed.name, 'ZCode 工作流');
  assert.equal(stages.invalidName.name, 'ZCode 工作流');
  assert.equal(stages.partialPreparing.name, 'ZCode 工作流');
  assert.equal(stages.partialPreparing.input, '等待参数…');
  assert.equal(stages.preparingEmpty.input, '等待参数…');
  assert.equal(stages.preparingGrown.name, 'Live native report');
  assert.deepEqual(JSON.parse(stages.preparingGrown.input), { name: 'Live native report' });
  assert.equal(stages.nativePriority.name, 'Live native report');
  assert.equal(stages.failed.status, '失败');
  assert.equal(stages.stopped.status, '已中断');
  assert.equal(stages.unknown.status, '原始结果', 'unknown payload is visible without claiming successful completion');
  assert.deepEqual(errors, []);
});

test('workflow navigation rejects duplicate opens and discards late failures after a different tool call', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `export { ZCodeWorkflowTool } from './src/client/zcode-workflow-tool.jsx'; export { default as React } from 'react'; export { createRoot } from 'react-dom/client'; export { flushSync } from 'react-dom';`, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'workflowFixture', target: 'es2022' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="app"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const { React, createRoot, flushSync, ZCodeWorkflowTool } = workflowFixture;
    const root = createRoot(document.getElementById('app')), calls = [];
    function useDisclosure() { const [expanded, set] = React.useState(false); return { expanded, toggle: () => set(value => !value) }; }
    window.renderNavigation = id => flushSync(() => root.render(React.createElement(ZCodeWorkflowTool, { phase: 'result', callId: id, block: { content: [{ type: 'text', text: JSON.stringify({ runId: id, status: 'completed' }) }] }, useDisclosure, openArtifacts: runId => new Promise((resolve, reject) => { calls.push(runId); window.rejectNavigation = reject; }) })));
    window.navigationCalls = calls; window.unmountNavigation = () => root.unmount();
  });
  await page.evaluate(() => renderNavigation('first'));
  await page.getByRole('button', { name: '查看产物', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '正在打开…', exact: true }).isDisabled(), true);
  await page.evaluate(() => {
    const button = document.querySelector('.omaa-zcode-tool-artifacts');
    const callback = Object.entries(button).find(([key]) => key.startsWith('__reactProps$'))[1].onClick;
    window.oldNavigation = callback; callback();
    renderNavigation('second'); rejectNavigation(new Error('late first failure'));
  });
  await page.getByRole('button', { name: '查看产物', exact: true }).waitFor();
  await page.evaluate(() => oldNavigation());
  assert.deepEqual(await page.evaluate(() => navigationCalls), ['first']);
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: '查看产物', exact: true }).click();
  await page.evaluate(() => rejectNavigation(new Error('current navigation failure')));
  await page.getByRole('alert').filter({ hasText: 'current navigation failure' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看产物', exact: true }).isEnabled(), true);
  await page.evaluate(() => unmountNavigation()); assert.deepEqual(errors, []);
});
