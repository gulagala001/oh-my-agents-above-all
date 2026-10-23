import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, toolReply, textReply } from './fixtures/installed-host.mjs';
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');

test('workflow amendment retains the native Actor model after restart and honors explicit run and Actor choices', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['zcode'], sessionSandboxMode: 'danger-full-access' });
  const settingsPath = join(f.home, 'settings.yaml'), settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  settings['llm-pi-ai'].providers.fixture.models.push({ ...settings['llm-pi-ai'].providers.fixture.models[0], id: 'alternate', name: 'Alternate fixture route', reasoningEfforts: { high: 'high' } });
  await writeFile(settingsPath, JSON.stringify(settings));
  await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  let nextCall;
  const observed = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Model fixture');
    if (request.tools.some(tool => tool.function.name === 'submit_result')) {
      const input = request.messages.filter(message => message.role === 'user').map(textOf).findLast(text => text.startsWith('PIN_TASK_'));
      const name = input?.split('\n')[0];
      observed.push({ task: name, model: request.model, effort: request.reasoning_effort });
      return toolReply('submit_result', { value: { answer: name } });
    }
    const call = nextCall; nextCall = undefined;
    return call ? toolReply(call.name, call.args) : textReply('PARENT_DONE');
  });
  const call = async (name, args) => {
    nextCall = { name, args };
    const page = await f.prompt(sessionId, 'Execute the next native workflow fixture.', { timeout: 45000 });
    assert.equal(nextCall, undefined);
    const result = page.records.findLast(row => row.event?.type === 'tool/result')?.event.data.message;
    assert(result && !result.isError, textOf(result) + '\n' + JSON.stringify(f.errors));
    return JSON.parse(textOf(result));
  };
  // Skill output is formatted native content rather than JSON.
  nextCall = { name: 'skill', args: { name: 'zcode-workflows' } };
  await f.prompt(sessionId, 'Load zcode-workflows for this explicitly requested workflow.');
  const first = `interface Answer { answer: string }; const reader = agent('reader', 'PINNED_WORKFLOW_PERSONA');
const first = await reader.ask<Answer>('PIN_TASK_FIRST'); return first;`;
  const launched = await call('create_workflow', { script: first, run_in_background: false });
  assert.equal(observed.find(row => row.task === 'PIN_TASK_FIRST')?.model, 'fixture');
  await f.crash(); await f.boot();
  await f.rpc('session/selectModel', { sessionId, provider: 'fixture', model: 'alternate' });
  nextCall = { name: 'skill', args: { name: 'zcode-workflows' } };
  await f.prompt(sessionId, 'Load the workflow skill after restart.');
  const second = first.replace('return first;', "const second = await reader.ask<Answer>('PIN_TASK_CARRIED'); return {first, second};");
  const amended = await call('amend_workflow', { run_id: launched.runId, script: second, run_in_background: false });
  assert.equal(observed.filter(row => row.task === 'PIN_TASK_FIRST').length, 1, 'cached completed ask is not re-executed');
  assert.equal(observed.find(row => row.task === 'PIN_TASK_CARRIED')?.model, 'fixture', 'parent route changes cannot move a pinned Actor');
  const third = second.replace('return {first, second};', "const third = await reader.ask<Answer>('PIN_TASK_RUN_CHOICE'); return third;");
  await call('amend_workflow', { run_id: amended.runId, script: third, subagent_model: 'fixture/alternate$high', run_in_background: false });
  const runChoice = observed.find(row => row.task === 'PIN_TASK_RUN_CHOICE');
  assert.equal(runChoice?.model, 'alternate'); assert.equal(runChoice?.effort, 'high');
  await call('create_workflow', { script: "interface Answer { answer: string }; const reader = agent('explicit', {system:'PINNED_WORKFLOW_PERSONA', model: model('fixture/fixture')}); return await reader.ask<Answer>('PIN_TASK_ACTOR_CHOICE');",
    subagent_model: 'fixture/alternate$high', run_in_background: false });
  assert.equal(observed.find(row => row.task === 'PIN_TASK_ACTOR_CHOICE')?.model, 'fixture');
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_MODEL_PIN_EVIDENCE) await writeFile(process.env.OMAA_MODEL_PIN_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), host: f.evidence.version, observed,
    checks: ['native Actor first route', 'completed prefix reused after cold restart', 'pin retained after parent route change', 'explicit run model and effort override pin', 'Actor model overrides run selection'], externalModelCalls: 0 }, null, 2) + '\n');
});
