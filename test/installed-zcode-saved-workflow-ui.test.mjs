import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message.content === 'string' ? message.content : (message.content || []).map(part => part.text || '').join('\n');
const toolResult = (snapshot, name) => {
  const call = snapshot.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
  const result = snapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(result, 'Actual tool result is missing: ' + name); return result.data.message;
};

test('installed saved workflow cards reuse actual project/global definitions through native permissions and open the actual run', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, piResources: true, isolatedHome: true });
  const evidenceDir = resolve(process.env.OMAA_SAVED_WORKFLOW_EVIDENCE_DIR || '.cache/zcode-saved-workflow-ui');
  await mkdir(evidenceDir, { recursive: true }); await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  const metadata = { text: { type: 'string', required: true }, count: { type: 'number', default: 0 }, enabled: { type: 'boolean', default: false }, data: { type: 'json', default: null } };
  const saved = { name: 'reuse', scope: 'project', description: 'Project reusable parameter fixture', whenToUse: 'Explicit parameter reuse', args: metadata, facade: 'zcode',
    script: `await artifact.markdown('params', JSON.stringify(args), {primary:true, title:'Actual parameters'}); return args;` };
  let step = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('Fixture title');
    if (step++ === 0) return toolReply('skill', { name: 'zcode-workflows' });
    if (step === 2) return toolReply('save_workflow', { ...saved, scope: 'global', description: 'Global reusable parameter fixture', args: { ...metadata, count: { type: 'number', default: 99 } } });
    if (step === 3) return toolReply('save_workflow', saved);
    return textReply('Saved both requested definitions.');
  });
  const initial = await f.prompt(sessionId, 'Load the workflow skill and save these explicitly requested project and global definitions for reuse.');
  assert.equal(JSON.parse(textOf(toolResult(initial, 'save_workflow'))).shadowing, 'hides_global');
  const projectPath = join(f.workspace, '.zcode/workflows/reuse.dwf.ts'), globalPath = join(f.userHome, '.zcode/workflows/reuse.dwf.ts');
  assert.match(await readFile(globalPath, 'utf8'), /Global reusable/); assert.match(await readFile(projectPath, 'utf8'), /Project reusable/);
  await writeFile(join(f.workspace, '.zcode/workflows/broken.dwf.ts'), '/* zcode-workflow\nmispeled: true\n*/\nreturn {};');
  const single = async (name, args, prompt) => {
    step = 0; f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply(name, args) : textReply('SAVED_FIXTURE_COMPLETE'));
    return f.prompt(sessionId, prompt);
  };
  const catalog = JSON.parse(textOf(toolResult(await single('list_saved_workflows', {}, 'List the current saved workflow definitions.'), 'list_saved_workflows')));
  assert.equal(catalog.workflows.length, 1); assert.equal(catalog.workflows[0].scope, 'project'); assert.equal(catalog.workflows[0].args.count.default, 0);
  assert(catalog.invalid.some(value => value.path.endsWith('broken.dwf.ts')));
  await f.rpc('session/rename', { sessionId, title: 'ZCode saved reuse fixture' });
  const other = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  f.replyWith(() => textReply('OTHER_SESSION_READY'));
  await f.prompt(other.sessionId, 'Keep this separate session for native navigation testing.');
  await f.rpc('session/rename', { sessionId: other.sessionId, title: 'ZCode saved other fixture' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light' });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(18000); page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { try { if (t.passed === false && !page.isClosed()) { await page.screenshot({ path: join(evidenceDir, 'failure.png') }); t.diagnostic((await page.locator('body').innerText()).slice(-6000)); } } finally { await browser.close(); } });
  await page.goto(f.origin); await page.getByRole('button', { name: /^(Continue|继续)$/ }).click();
  await page.getByText('ZCode saved reuse fixture', { exact: true }).first().click();
  const reveal = async (card, turnIndex) => {
    await (turnIndex === undefined ? page.getByText(/^Completed in/).last() : page.getByText(/^Completed in/).nth(turnIndex)).click();
    if (!(await card.locator('.omaa-saved-title').isVisible())) {
      await card.locator('xpath=ancestor::*[@data-step-process][1]').locator('button[data-process-activity]').first().click();
    }
  };
  const listCard = page.locator('.omaa-saved-workflow').filter({ has: page.locator('.omaa-saved-title').filter({ hasText: '保存的工作流' }) }).last();
  await reveal(listCard);
  await listCard.locator('.omaa-saved-title').click();
  await listCard.getByText('无法读取的定义', { exact: true }).waitFor();
  assert.match(await listCard.innerText(), /broken.dwf.ts/); assert.match(await listCard.innerText(), /项目/);
  step = 0; f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply('read_saved_workflow', { name: 'reuse', scope: 'project' }) : textReply('READ_SAVED_DEFINITION_COMPLETE'));
  await listCard.getByRole('button', { name: '读取定义', exact: true }).click();
  await page.getByText('READ_SAVED_DEFINITION_COMPLETE', { exact: true }).waitFor();
  const readCard = page.locator('.omaa-saved-workflow').filter({ has: page.locator('.omaa-saved-title').filter({ hasText: '工作流定义 · reuse' }) }).first();
  await reveal(readCard);
  await readCard.locator('.omaa-saved-title').click();
  await readCard.getByText('默认值：0', { exact: true }).waitFor(); await readCard.getByText('默认值：false', { exact: true }).waitFor();
  await readCard.getByRole('textbox', { name: '参数 text', exact: true }).fill('DEFAULT_RUN');
  const contrastEvidence = [];
  const checkContrast = async mode => {
    const samples = await readCard.evaluate(root => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const context = canvas.getContext('2d');
      const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); const pixel = context.getImageData(0, 0, 1, 1).data; return [pixel[0], pixel[1], pixel[2], pixel[3] / 255]; };
      const over = (front, back) => [0, 1, 2].map(index => front[index] * front[3] + back[index] * (1 - front[3])).concat(1);
      const luminance = color => color.slice(0, 3).map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const elements = [...root.querySelectorAll('.omaa-saved-parameter small'), ...[...root.querySelectorAll('small')].filter(node => node.textContent.startsWith('未勾选'))];
      return elements.map(element => {
        const layers = []; for (let node = element; node; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor));
        const background = layers.reverse().reduce((back, front) => over(front, back), [255, 255, 255, 1]);
        const color = getComputedStyle(element).color, foreground = over(rgba(color), background), a = luminance(foreground), b = luminance(background);
        return { text: element.textContent, color, background: background.slice(0, 3), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
    });
    contrastEvidence.push({ mode, samples });
    await writeFile(join(evidenceDir, 'contrast.json'), JSON.stringify(contrastEvidence, null, 2) + '\n');
    for (const sample of samples) assert(sample.ratio >= 4.5, `${mode}: ${sample.text} contrast ${sample.ratio}`);
  };
  await readCard.getByRole('button', { name: '发送运行请求', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidenceDir, 'light-parameters.png') });
  await checkContrast('light');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: join(evidenceDir, 'dark-parameters.png') });
  await checkContrast('dark');
  await page.setViewportSize({ width: 390, height: 1000 });
  await readCard.getByRole('button', { name: '发送运行请求', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidenceDir, 'narrow-parameters.png') });
  await checkContrast('narrow-dark');
  const bounds = await readCard.getByRole('textbox', { name: '参数 text', exact: true }).boundingBox(); assert(bounds && bounds.width > 70 && bounds.width <= 390);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const usersBeforeOverflow = (await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length;
  await readCard.getByRole('checkbox', { name: '传入 data', exact: true }).check();
  await readCard.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[{"overflow":1e999}]}');
  await readCard.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await readCard.getByRole('alert').filter({ hasText: '数字必须为有限值' }).waitFor();
  assert.equal((await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length, usersBeforeOverflow, 'Numeric overflow must not become a native prompt containing null');
  await readCard.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[{"integer":9007199254740993}]}');
  await readCard.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await readCard.getByRole('alert').filter({ hasText: '整数超出可精确处理的范围' }).waitFor();
  assert.equal((await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length, usersBeforeOverflow, 'Unsafe integers must not become a native prompt with a rounded value');
  await page.screenshot({ path: join(evidenceDir, 'invalid-json.png') });
  await readCard.getByRole('checkbox', { name: '传入 data', exact: true }).uncheck();
  const respondToRun = () => {
    step = 0; f.replyWith(payload => {
      if (!payload.tools?.length) return textReply('Fixture title');
      const user = textOf(payload.messages.findLast(value => value.role === 'user') || {});
      if (step++ === 0) return toolReply('skill', { name: 'zcode-workflows' });
      if (step === 2) {
        const match = user.match(/arguments: (\{.*\})\. Read the current saved definition/s); assert(match, 'UI must send the actual selected arguments');
        return toolReply('run_saved_workflow', JSON.parse(match[1]));
      }
      return textReply('RUN_SAVED_DEFINITION_COMPLETE');
    });
  };
  respondToRun(); await readCard.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await page.getByText('RUN_SAVED_DEFINITION_COMPLETE', { exact: true }).last().waitFor(); await until(async () => !(await f.api(sessionId)).value.running);
  const first = JSON.parse(textOf(toolResult(await f.snapshot(sessionId), 'run_saved_workflow')));
  assert.deepEqual(first.result.value, { text: 'DEFAULT_RUN', count: 0, enabled: false, data: null }); assert(first.result.runId);
  // An old read card remains useful for parameter entry, but the backend must
  // load the changed source and current defaults when this request executes.
  await writeFile(projectPath, (await readFile(projectPath, 'utf8')).replace('return args;', `return {...args, source:'CURRENT_SOURCE'};`));
  await readCard.getByRole('textbox', { name: '参数 text', exact: true }).fill('');
  await readCard.getByRole('checkbox', { name: '传入 count', exact: true }).check(); await readCard.getByRole('textbox', { name: '参数 count', exact: true }).fill('0');
  await readCard.getByRole('checkbox', { name: '传入 enabled', exact: true }).check(); await readCard.getByRole('combobox', { name: '参数 enabled', exact: true }).selectOption('false');
  await readCard.getByRole('checkbox', { name: '传入 data', exact: true }).check(); await readCard.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[0,false,"",null]}');
  const turn = (await f.snapshot(sessionId)).projections.asOfSeq;
  respondToRun(); await readCard.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await until(async () => (await f.snapshot(sessionId)).records.some(row => row.event?.type === 'turn/end' && row.event.seq > turn));
  const second = JSON.parse(textOf(toolResult(await f.snapshot(sessionId), 'run_saved_workflow')));
  assert.deepEqual(second.result.value, { text: '', count: 0, enabled: false, data: { nested: [0, false, '', null] }, source: 'CURRENT_SOURCE' });
  assert.notEqual(second.result.runId, first.result.runId);
  const runCards = page.locator('.omaa-saved-workflow').filter({ has: page.locator('.omaa-saved-title').filter({ hasText: '运行保存的工作流 · reuse' }) });
  await until(async () => await runCards.count() === 2);
  const runCard = runCards.last(); await reveal(runCard);
  await runCard.getByRole('button', { name: '查看运行与产物', exact: true }).click();
  await page.getByRole('combobox', { name: '工作流运行', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue(), second.result.runId);
  await page.getByRole('button', { name: /Actual parameters/ }).waitFor();
  await reveal(runCards.first(), 3);
  await runCards.first().getByRole('button', { name: '查看运行与产物', exact: true }).click();
  await until(async () => await page.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue() === first.result.runId);
  await runCards.last().getByRole('button', { name: '查看运行与产物', exact: true }).click();
  await until(async () => await page.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue() === second.result.runId);
  await page.screenshot({ path: join(evidenceDir, 'actual-run.png') });
  await readCard.getByRole('textbox', { name: '参数 count', exact: true }).fill('-0');
  await readCard.getByRole('textbox', { name: '参数 data', exact: true }).fill('{"nested":[-0,false,0,null]}');
  f.replyWith(() => textReply('NEGATIVE_ZERO_MATERIAL_COMPLETE'));
  const materialSeq = (await f.snapshot(sessionId)).projections.asOfSeq;
  await readCard.getByRole('button', { name: '发送运行请求', exact: true }).click();
  await until(async () => (await f.snapshot(sessionId)).records.some(row => row.event?.type === 'turn/end' && row.event.seq > materialSeq));
  const materialSnapshot = await f.snapshot(sessionId), userEvent = materialSnapshot.records.findLast(row => row.event?.type === 'user/message').event;
  const nativeMaterialText = textOf(userEvent.data.message ?? userEvent.data);
  const material = JSON.parse(nativeMaterialText.match(/arguments: (\{.*\})\. Read the current saved definition/s)[1]);
  assert(Object.is(material.args.count, -0)); assert(Object.is(material.args.data.nested[0], -0));
  assert.match(nativeMaterialText, /"count":-0/); assert.match(nativeMaterialText, /"nested":\[-0,false,0,null\]/);
  for (const [args, expected] of [[{ name: 'reuse', args: {} }, /missing required argument/], [{ name: 'reuse', args: { text: 'invalid', count: 'wrong', extra: 1 } }, /unknown argument.*extra/], [{ name: 'broken', args: {} }, /invalid_metadata/]]) {
    const snapshot = await single('run_saved_workflow', args, 'Run the selected workflow with deliberately invalid arguments for the permission fixture.');
    const result = toolResult(snapshot, 'run_saved_workflow'); assert(result.isError); assert.match(textOf(result), expected);
  }
  const globalCatalog = JSON.parse(textOf(toolResult(await single('list_saved_workflows', { scope: 'global' }, 'List the global saved workflow definitions.'), 'list_saved_workflows')));
  assert.equal(globalCatalog.workflows[0].scope, 'global'); assert.equal(globalCatalog.workflows[0].args.count.default, 99);
  const globalRead = JSON.parse(textOf(toolResult(await single('read_saved_workflow', { name: 'reuse', scope: 'global' }, 'Read the global definition without running it.'), 'read_saved_workflow')));
  assert.equal(globalRead.path, globalPath); assert.equal(globalRead.facade, 'zcode');
  assert.equal((await f.api(sessionId, { mode: 'ask' })).status, 200);
  const askRead = toolResult(await single('read_saved_workflow', { name: 'reuse' }, 'Read this definition while remaining in Ask mode.'), 'read_saved_workflow');
  assert(!askRead.isError); assert.equal(JSON.parse(textOf(askRead)).scope, 'project');
  const askRun = toolResult(await single('run_saved_workflow', { name: 'reuse', args: { text: 'blocked' } }, 'Remain in Ask mode; verify that running is rejected.'), 'run_saved_workflow');
  assert(askRun.isError); assert.match(textOf(askRun), /ask mode permits reading/);
  await until(async () => await readCard.getByRole('button', { name: '发送运行请求', exact: true }).isDisabled());
  await readCard.getByRole('button', { name: '重新读取定义', exact: true }).evaluate(element => {
    window.previousSavedReadClick = Object.entries(element).find(([key]) => key.startsWith('__reactProps$'))[1].onClick;
  });
  const originalUserCount = (await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length;
  const otherUserCount = (await f.snapshot(other.sessionId)).records.filter(row => row.event?.type === 'user/message').length;
  await page.getByText('ZCode saved other fixture', { exact: true }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.omaa-saved-workflow').length === 0);
  await page.evaluate(() => previousSavedReadClick()); await page.waitForTimeout(50);
  assert.equal((await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length, originalUserCount);
  assert.equal((await f.snapshot(other.sessionId)).records.filter(row => row.event?.type === 'user/message').length, otherUserCount);
  await page.getByText('ZCode saved reuse fixture', { exact: true }).first().click();
  await page.locator('.omaa-saved-workflow').first().waitFor({ state: 'attached' });
  await page.evaluate(() => previousSavedReadClick()); await page.waitForTimeout(50);
  assert.equal((await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'user/message').length, originalUserCount, 'Returning to the original session must not revive the old callback');
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ evidence: f.evidence, isolatedUserHome: f.userHome, catalog, globalCatalog, runs: [first.result.runId, second.result.runId], actualValue: second.result.value, nativeNavigation: { sessions: [sessionId, other.sessionId], oldCallbackDeclined: true }, nativeMaterial: { negativeZeroNumber: true, negativeZeroNested: true, text: nativeMaterialText }, contrastEvidence, uiErrors: errors, nativeErrors: f.errors }, null, 2) + '\n');
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
});
