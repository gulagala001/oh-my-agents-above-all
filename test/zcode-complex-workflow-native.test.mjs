import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { NUDGE_PROMPT } from '../lib/zcode-ask-protocol.mjs';
import { verifyAskExchange } from '../src/presets/zcode/ask-receipt.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const taskText = text => text.replace(/^Agent \S+ sent a message: /, '');
const options = { safeEnvironment: true, sourceLinked: true, enabledPresets: ['zcode'], sessionSandboxMode: 'danger-full-access' };
async function harness(t, reply) {
  const f = await installedHost(t, options); await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  let next;
  f.replyWith(request => {
    if (request.tools?.some(tool => tool.function.name === 'submit_result')) return reply(request, f);
    const call = next; next = undefined;
    return call ? toolReply(call.name, call.args) : textReply('PARENT_DONE');
  });
  const call = async (name, args) => {
    next = { name, args };
    const page = await f.prompt(sessionId, 'PARENT_PRIVATE_CONTEXT: execute the requested workflow action.', { timeout: 45000 });
    assert.equal(next, undefined);
    const result = page.records.findLast(row => row.event?.type === 'tool/result')?.event.data.message;
    assert(result && !result.isError, textOf(result));
    if (name === 'skill') return textOf(result);
    try { return JSON.parse(textOf(result)); } catch { return textOf(result); }
  };
  await call('skill', { name: 'zcode-workflows' });
  return { f, sessionId, call };
}

test('complex native workflow keeps FIFO and isolated contexts through repair, nudge, cold replay and amendment', { timeout: 90000 }, async t => {
  const seen = [], turns = new Map();
  const { f, sessionId, call } = await harness(t, request => {
    const users = request.messages.filter(row => row.role === 'user').map(row => taskText(textOf(row)));
    const task = users.findLast(text => text.startsWith('TASK_'))?.split('\n')[0];
    const all = request.messages.map(textOf).join('\n');
    seen.push({ task, nudge: users.at(-1) === NUDGE_PROMPT });
    assert(!all.includes('PARENT_PRIVATE_CONTEXT'), 'fresh Actors must not inherit the parent conversation');
    if (task === 'TASK_PEER') {
      assert(!all.includes('OWNED_READER_FACT'), 'different Actors must not share their task transcripts');
      return toolReply('submit_result', { value: { answer: 'peer' } });
    }
    if (task === 'TASK_NUDGE') {
      const count = (turns.get(task) ?? 0) + 1; turns.set(task, count);
      if (count === 1) return toolReply('read', { file_path: 'fact.txt' });
      if (count === 2) return toolReply('submit_result', { value: JSON.stringify({ answer: 4 }) });
      if (count === 3) {
        const error = request.messages.findLast(row => row.role === 'tool');
        assert.match(textOf(error), /answer/); // Parsed-object violations, not expected object/got string.
        return textReply('Interim response; the structured result has not been submitted.');
      }
      assert.equal(users.at(-1), NUDGE_PROMPT);
      assert(all.includes('OWNED_READER_FACT'));
      return toolReply('submit_result', { value: JSON.stringify({ answer: 'OWNED_READER_FACT' }) });
    }
    assert(['TASK_RECALL', 'TASK_AMENDED'].includes(task), task);
    assert(all.includes('OWNED_READER_FACT') && all.includes(NUDGE_PROMPT));
    return toolReply('submit_result', { value: { answer: task } });
  });
  await writeFile(join(f.workspace, 'fact.txt'), 'OWNED_READER_FACT');
  const script = `interface Answer { answer: string }
phase('Parallel work');
const reader = agent('reader', 'Literal {{target}} reader');
const peer = agent('peer');
const results = await Promise.all([reader.ask<Answer>('TASK_NUDGE'), reader.ask<Answer>('TASK_RECALL'), peer.ask<Answer>('TASK_PEER')]);
report(results); throw new Error('SCRIPT_STOP_AFTER_COMPLETED_ASKS');`;
  const first = await call('create_workflow', { script, max_concurrency: 2, run_in_background: false });
  assert.equal(first.ok, false, JSON.stringify(first));
  assert.match(first.error.message, /SCRIPT_STOP_AFTER_COMPLETED_ASKS/);
  assert.equal(seen.filter(row => row.task === 'TASK_NUDGE').length, 4);
  assert.equal(seen.filter(row => row.task === 'TASK_RECALL').length, 1);
  const reader = first.actors.find(actor => actor.name === 'reader');
  const projections = await f.rpc('session/projections', { sessionId: reader.childId });
  const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: reader.childId, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 200 });
  const ends = page.records.filter(row => row.event?.type === 'turn/end');
  assert.equal(ends.length, 3, 'nudge is a second actual native turn, then the next FIFO ask');
  assert.equal(page.records.filter(row => row.event?.type === 'tool/call' && row.event.data.name === 'read').length, 1);
  const before = seen.length;
  await f.stop(); await f.boot();
  await call('skill', { name: 'zcode-workflows' });
  const replay = await call('resume_workflow', { run_id: first.runId, run_in_background: false });
  assert.equal(replay.ok, false, JSON.stringify(replay));
  assert.match(replay.error.message, /SCRIPT_STOP_AFTER_COMPLETED_ASKS/);
  assert.equal(seen.length, before, 'cold replay must not re-run reads, repairs or nudge');
  const revised = script.replace("report(results); throw new Error('SCRIPT_STOP_AFTER_COMPLETED_ASKS');",
    "const final = await reader.ask<Answer>('TASK_AMENDED'); return {results, final};");
  const amended = await call('amend_workflow', { run_id: first.runId, script: revised, run_in_background: false });
  assert.equal(amended.ok, true, JSON.stringify(amended));
  assert.deepEqual(amended.value, { results: [{ answer: 'OWNED_READER_FACT' }, { answer: 'TASK_RECALL' }, { answer: 'peer' }], final: { answer: 'TASK_AMENDED' } });
  assert.equal(seen.length, before + 1);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_COMPLEX_EVIDENCE) await writeFile(process.env.OMAA_COMPLEX_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), host: f.evidence.version,
    checks: ['independent Actor contexts', 'same Actor FIFO and retained read', 'schema-aware JSON decoding', 'repair then one actual nudge turn', 'cold same-run replay without duplicate tools', 'cold amendment with exact multi-turn context'], seen, externalModelCalls: 0 }, null, 2) + '\n');
});

test('native typed task budgets terminate, remain catchable and reset only for the next ask', { timeout: 90000 }, async t => {
  const attempts = new Map();
  const { f, call } = await harness(t, request => {
    const task = request.messages.filter(row => row.role === 'user').map(row => taskText(textOf(row))).findLast(text => text.startsWith('LIMIT_'))?.split('\n')[0];
    const count = (attempts.get(task) ?? 0) + 1; attempts.set(task, count);
    if (task === 'LIMIT_MISSING') return textReply('No result submitted.');
    if (task === 'LIMIT_INVALID') return toolReply('submit_result', { value: { answer: 42 } });
    if (task === 'LIMIT_RESET' && count === 1) return toolReply('submit_result', { value: { answer: false } });
    return toolReply('submit_result', { value: { answer: 'RECOVERED' } });
  });
  const outcome = await call('create_workflow', { script: `interface Answer { answer: string }
const actor = agent('bounded'); const errors: string[] = [];
try { await actor.ask<Answer>('LIMIT_MISSING'); } catch (error) { errors.push((error as {code: string}).code); }
try { await actor.ask<Answer>('LIMIT_INVALID'); } catch (error) { errors.push((error as {code: string}).code); }
const final = await actor.ask<Answer>('LIMIT_RESET'); return {errors, final};`, run_in_background: false });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.deepEqual(outcome.value, { errors: ['ResultNotSubmitted', 'ValidationFailed'], final: { answer: 'RECOVERED' } });
  assert.equal(attempts.get('LIMIT_MISSING'), 2);
  assert.equal(attempts.get('LIMIT_INVALID'), 4);
  assert.equal(attempts.get('LIMIT_RESET'), 2);
  assert.deepEqual(f.errors, []);
});

test('canceling a real nudge drains its native turn and amendment carries that exact accepted context', { timeout: 90000 }, async t => {
  let nudged = false, released = false, allowSuccess = false, calls = 0, release;
  const held = new Promise(resolve => { release = () => { released = true; resolve(); }; });
  t.after(() => release());
  const { f, sessionId, call } = await harness(t, async request => {
    calls++;
    const users = request.messages.filter(row => row.role === 'user').map(row => taskText(textOf(row)));
    if (allowSuccess) {
      assert(request.messages.map(textOf).join('\n').includes('CARRIED_NUDGE_CONTEXT'));
      return toolReply('submit_result', { value: { answer: 'CARRIED_AFTER_CANCEL' } });
    }
    if (users.at(-1) !== NUDGE_PROMPT) return textReply('CARRIED_NUDGE_CONTEXT');
    nudged = true; await held;
    return toolReply('submit_result', { value: { answer: 'LATE_CANCELED_RESULT' } });
  });
  const script = "interface Answer { answer: string }; const actor = agent('carry'); return await actor.ask<Answer>('CANCEL_NUDGE_TASK');";
  const started = await call('create_workflow', { script, max_concurrency: 1, run_in_background: true });
  assert(started.jobId, JSON.stringify(started)); await until(() => nudged);
  const active = await call('get_workflow_run', { run_id: started.runId, include: ['runtime'] });
  assert(active.runtime.nodes.some(node => node.phase === 'nudged'));
  await call('job_kill', { job_id: started.jobId });
  await call('job_output', { job_id: started.jobId, wait: true, timeout_ms: 8000 });
  const stopped = await call('get_workflow_run', { run_id: started.runId, include: ['runtime'] });
  assert.equal(stopped.status, 'stopped'); assert.equal(released, false);
  const childId = active.runtime.actors[0].sessionId ?? active.runtime.nodes.find(node => node.sessionId)?.sessionId;
  assert(childId, JSON.stringify(active.runtime));
  const projection = await f.rpc('session/projections', { sessionId: childId });
  const child = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: childId, mode: 'continuable' }, throughSeq: projection.asOfSeq, maxMessages: 100 });
  assert.equal(child.records.findLast(row => row.event?.type === 'turn/end').event.data.reason.kind, 'aborted');
  const before = calls; allowSuccess = true; release();
  const resumed = await call('amend_workflow', { run_id: started.runId, run_in_background: false });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.deepEqual(resumed.value, { answer: 'CARRIED_AFTER_CANCEL' });
  assert.equal(calls, before + 1, 'one fresh task uses the accepted canceled prefix, without retrying the old driver');
  assert.deepEqual(f.errors, []);
});

test('a forged nudge receipt cannot import an unrelated native turn', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', surfaceOp: 'append', data: { id: 'first', content: [{ type: 'text', text: 'task' }] } },
    { seq: 2, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { seq: 3, type: 'turn/start', data: { turn: 2 } },
    { seq: 4, type: 'user/message', surfaceOp: 'append', data: { id: 'second', source: { kind: 'agent-message', form: 'relay', senderSessionId: 'parent' },
      content: [{ type: 'text', text: 'Agent parent sent a message: ' }, { type: 'text', text: NUDGE_PROMPT }] } },
    { seq: 5, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
  ];
  const accepted = { sessionId: 'parent', messageId: 'first', continuations: [{ messageId: 'second', afterEventCount: 3 }] };
  verifyAskExchange(events, accepted, 6);
  const forged = structuredClone(events); forged[4].data.content[0].text = 'unrelated user input';
  assert.throws(() => verifyAskExchange(forged, accepted, 6), /exact owned/);
  assert.throws(() => verifyAskExchange(events, { messageId: 'first' }, 6), /exact owned/);
});
