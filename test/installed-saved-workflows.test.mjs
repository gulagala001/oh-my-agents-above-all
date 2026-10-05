import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

const toolText = result => result.records.filter(row => row.event?.type === 'tool/result').map(row => JSON.stringify(row.event.data)).join('\n');

test('saved ZCode definition writes and runs via the native tools, survives restart and guards Ask', { timeout: 90000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const session = await f.create('omaa-zcode');
  let phase = 0;
  const save = { name: 'echo-value', scope: 'project', description: 'Echo a typed argument through the native workflow.', whenToUse: 'When a saved workflow must be reused.', args: { value: { type: 'number', default: 7 } }, script: 'phase("Run"); return { value: args.value, type: typeof args.value };' };
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('save_workflow', save) : textReply('Load the skill first.'));
  let result = await f.prompt(session.sessionId, 'Save this explicitly requested workflow for reuse.');
  assert.match(toolText(result), /Load the zcode-workflows skill/);
  phase = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    if (phase++ === 0) return toolReply('skill', { name: 'zcode-workflows' });
    if (phase === 2) return toolReply('save_workflow', save);
    return textReply('Saved the requested definition.');
  });
  result = await f.prompt(session.sessionId, 'Load the workflow skill and save echo-value to this project.');
  assert.match(toolText(result), /Saved workflow definition/);
  const file = join(f.workspace, '.zcode/workflows/echo-value.dwf.ts'), bytes = await readFile(file, 'utf8');
  assert(bytes.startsWith('/* zcode-workflow\n')); assert(bytes.endsWith(save.script));
  const stat = toolText(result); assert(stat.includes('overwritten')); assert(result.records.some(row => row.event?.type === 'tool/result' && !row.event.data.message?.isError));
  await f.stop(); await f.boot();
  phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('list_saved_workflows', {}) : textReply('Found the saved workflow.'));
  result = await f.prompt(session.sessionId, 'Find the workflow already saved in this project.');
  assert.match(toolText(result), /echo-value/); assert.match(toolText(result), /When a saved workflow/);
  await writeFile(join(f.workspace, '.zcode/workflows/broken.dwf.ts'), '/* zcode-workflow\nmispeled: true\n*/\nreturn {};');
  phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('list_saved_workflows', {}) : textReply('Malformed definitions are reported.'));
  result = await f.prompt(session.sessionId, 'List saved definitions, including problems.'); assert.match(toolText(result), /broken.dwf.ts/); assert.match(toolText(result), /echo-value/);
  phase = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    if (phase++ === 0) return toolReply('skill', { name: 'zcode-workflows' });
    if (phase === 2) return toolReply('run_saved_workflow', { name: 'echo-value' });
    return textReply('The existing native workflow returned the default argument.');
  });
  result = await f.prompt(session.sessionId, 'Run the saved echo-value workflow by name.');
  assert.match(toolText(result), /\\"value\\": 7|value.*7/);
  assert(result.records.some(row => row.event?.type === 'tool-workflow/run-end'), 'the existing native workflow engine must settle: ' + JSON.stringify(result.records.filter(row => row.event?.type === 'tool/call' || row.event?.type === 'tool/result' || row.event?.type.startsWith('tool-workflow/'))));
  phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('run_saved_workflow', { name: 'echo-value', args: { value: 'wrong', extra: 1 } }) : textReply('Correct the invalid arguments.'));
  result = await f.prompt(session.sessionId, 'Use the workflow with these deliberately invalid arguments.'); assert.match(toolText(result), /unknown argument.*extra/); assert.match(toolText(result), /expected a finite number/);
  const api = await f.api(session.sessionId, { mode: 'ask' }); assert.equal(api.status, 200);
  phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('save_workflow', { ...save, script: 'return "must not be saved";' }) : textReply('Ask mode remains read-only.'));
  result = await f.prompt(session.sessionId, 'Keep Ask mode; do not write files.'); assert.match(toolText(result), /ask mode permits reading/); assert.equal(await readFile(file, 'utf8'), bytes);
  assert.deepEqual(f.errors, []);
});
