import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(p => p.text ?? '').join('\n');
test('saved ZCode typed asks reuse one native child, commit structured results and cold-resume literal persona', { timeout: 90000 }, async t => {
  const f = await installedHost(t);
  await writeFile(join(f.workspace, 'sentinel.txt'), 'FIXTURE_ACTOR_FACT');
  await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-zcode');
  const script = `interface Fact { value: string; round: number }
phase('Read'); const reader = agent('reader', {system:'Remember the facts you read; preserve the workspace and literal {{customer_name}} template text.'});
const first = await reader.ask<Fact>('ASK_FIRST: read sentinel.txt with the native read tool, then submit its fact and round 1.');
phase('Recall'); const second = await reader.ask<Fact>('ASK_SECOND: recall the earlier fact without reading the file again, then submit round 2.');
report(first); return {first, second};`;
  f.replyWith(request => {
    const names = request.tools?.map(t => t.function.name) ?? [];
    if (names.includes('submit_result')) {
      const input = request.messages.filter(m => m.role === 'user').map(textOf).findLast(text => text.includes('ASK_FIRST') || text.includes('ASK_SECOND')) ?? '';
      const round = input.includes('ASK_SECOND') ? 2 : 1;
      const material = request.messages.map(textOf).join('\n');
      if (round === 1 && !material.includes('FIXTURE_ACTOR_FACT')) return toolReply('read', { file_path: 'sentinel.txt' });
      return toolReply('submit_result', { value: { value: material.includes('FIXTURE_ACTOR_FACT') ? 'FIXTURE_ACTOR_FACT' : 'MISSING_CONTEXT', round } });
    }
    if (!names.includes('create_workflow')) return textReply('Not an actor workflow request.');
    const hasSkill = request.messages.some(m => m.role === 'tool' && textOf(m).includes('The `workflow` tool'));
    if (!hasSkill) return toolReply('skill', { name: 'zcode-workflows' });
    if (request.messages.some(m => m.role === 'tool' && textOf(m).includes('"runId"'))) return textReply('Actor workflow completed.');
    if (!request.messages.some(m => m.role === 'tool' && textOf(m).includes('Saved workflow definition.'))) return toolReply('save_workflow', {
      name: 'persistent-reader', scope: 'project', description: 'Read and recall the native fixture fact.', facade: 'zcode', script,
    });
    return toolReply('run_saved_workflow', { name: 'persistent-reader', run_in_background: false });
  });
  const root = await f.prompt(sessionId, 'Use a workflow to read and recall the fixture fact.');
  const workflowCalls = new Set(root.records.filter(r => r.event?.type === 'tool/call' && ['create_workflow', 'run_saved_workflow'].includes(r.event.data.name)).map(r => r.event.data.callId));
  const results = root.records.filter(r => r.event?.type === 'tool/result' && workflowCalls.has(r.event.data.message?.toolCallId)).map(r => JSON.parse(textOf(r.event.data.message)));
  const outcome = results.map(value => value.result ?? value).find(value => value.runId);
  assert(outcome?.ok, JSON.stringify(results));
  assert.deepEqual(outcome.value, { first: { value: 'FIXTURE_ACTOR_FACT', round: 1 }, second: { value: 'FIXTURE_ACTOR_FACT', round: 2 } });
  assert(outcome.reports.some(r => r.value.round === 1));
  const histories = await Promise.all(outcome.actors.map(async item => {
    const projections = await f.rpc('session/projections', { sessionId: item.childId });
    const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: item.childId, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 100 });
    return { id: item.childId, ...page };
  }));
  const actor = histories.find(h => h.records.some(r => r.event?.type === 'user/message' && textOf(r.event.data.message ?? r.event.data).includes('ASK_FIRST')));
  assert(actor, 'A native durable Actor session must exist');
  assert(actor.records.some(r => r.event?.type === 'user/message' && textOf(r.event.data.message ?? r.event.data).includes('ASK_SECOND')), 'Both asks must appear in the same native session');
  assert.equal(actor.records.filter(r => r.event?.type === 'turn/end').length, 2);
  assert.equal(actor.records.filter(r => r.event?.type === 'tool/call' && r.event.data.name === 'read').length, 1);
  assert.equal(actor.records.filter(r => r.event?.type === 'tool/call' && r.event.data.name === 'submit_result').length, 2);
  const saved = await readFile(join(f.workspace, '.zcode/workflows/persistent-reader.dwf.ts'), 'utf8');
  assert(saved.includes('// @omaa-workflow-facade: zcode'));
  assert(saved.endsWith(script));

  // Teardown the workflow and entire host before a human continuation. The
  // durable persona must no longer depend on any run-owned variable/listener.
  await f.stop(); await f.boot();
  assert.equal((await f.api(sessionId)).status, 200);
  const from = f.requests.length;
  f.replyWith(request => textReply(request.messages.map(textOf).join('\n').includes('FIXTURE_ACTOR_FACT') ? 'COLD_ACTOR_FACT_RETAINED' : 'MISSING_CONTEXT'));
  await f.rpc('subagents/prompt', { parentSessionId: sessionId, childSessionId: actor.id, mode: 'continuable', delivery: 'queue', requestId: crypto.randomUUID(), content: [{ type: 'text', text: 'COLD_ACTOR_RECALL' }] });
  const cold = await until(async () => {
    const projections = await f.rpc('session/projections', { sessionId: actor.id });
    const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: actor.id, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 100 });
    return page.records.filter(r => r.event?.type === 'turn/end').length === 3 && page;
  });
  assert.equal(cold.records.findLast(r => r.event?.type === 'turn/end').event.data.reason.kind, 'completed');
  assert(cold.records.some(r => r.event?.type === 'assistant/message' && textOf(r.event.data.message ?? r.event.data).includes('COLD_ACTOR_FACT_RETAINED')));
  const request = f.requests.slice(from).find(r => r.tools?.length);
  assert(request.messages.filter(m => m.role === 'system').map(textOf).join('\n').includes('literal {{customer_name}} template text.'));
  assert.deepEqual(f.errors, []);
});

test('background ZCode Actor work stops and drains when the parent switches to Ask', { timeout: 90000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-zcode');
  let release, started = false;
  const held = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  f.replyWith(async request => {
    if (request.tools?.some(tool => tool.function.name === 'submit_result')) {
      started = true; await held;
      return toolReply('submit_result', { value: { fact: 'must-be-canceled' } });
    }
    if (!request.messages.some(m => m.role === 'tool' && textOf(m).includes('The `workflow` tool'))) return toolReply('skill', { name: 'zcode-workflows' });
    if (request.messages.some(m => m.role === 'tool' && textOf(m).includes('"jobId"'))) return textReply('Background workflow started.');
    return toolReply('create_workflow', { script: "interface Result { fact: string } const worker = agent('waiting'); return await worker.ask<Result>('BACKGROUND_HELD_TASK');", run_in_background: true });
  });
  const root = await f.prompt(sessionId, 'Use a background workflow for this task.');
  const call = root.records.find(r => r.event?.type === 'tool/call' && r.event.data.name === 'create_workflow').event;
  const result = root.records.find(r => r.event?.type === 'tool/result' && r.event.data.message?.toolCallId === call.data.callId).event;
  const outcome = JSON.parse(textOf(result.data.message));
  assert(outcome.jobId);
  await until(() => started).catch(async error => {
    const snapshot = await f.snapshot(sessionId);
    throw Error(error.message + ': ' + JSON.stringify({ outcome, events: snapshot.records.slice(-12).map(r => r.event), requestTools: f.requests.slice(-4).map(r => r.tools?.map(t => t.function.name)) }));
  });
  assert.equal((await f.api(sessionId, { mode: 'ask' })).status, 200);
  let inspected = false;
  f.replyWith(request => {
    const requested = request.messages.some(m => m.role === 'user' && textOf(m).includes('INSPECT_CANCELED_WORKFLOW'));
    if (requested && !inspected) { inspected = true; return toolReply('job_output', { job_id: outcome.jobId, wait: true, timeout_ms: 8000 }); }
    return textReply('Collected the native workflow outcome.');
  });
  await f.send(sessionId, 'INSPECT_CANCELED_WORKFLOW: collect its actual native output.');
  const collected = await until(async () => {
    const snapshot = await f.snapshot(sessionId);
    const message = snapshot.records.find(r => r.event?.type === 'user/message' && textOf(r.event.data.message ?? r.event.data).includes('INSPECT_CANCELED_WORKFLOW'))?.event;
    return message && snapshot.records.some(r => r.event?.type === 'turn/end' && r.event.seq > message.seq) && snapshot;
  });
  const output = collected.records.filter(r => r.event?.type === 'tool/result').map(r => textOf(r.event.data.message)).join('\n');
  assert.match(output, /killed/);
  assert.match(output, /working mode changed/);
  const childId = JSON.parse(output.split('\n').find(line => line.startsWith('{') && line.includes('"actors"'))).actors[0].childId;
  const projections = await f.rpc('session/projections', { sessionId: childId });
  const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: childId, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 100 });
  assert.equal(page.records.findLast(r => r.event?.type === 'turn/end').event.data.reason.kind, 'aborted');
  assert.deepEqual(f.errors, []);
});
