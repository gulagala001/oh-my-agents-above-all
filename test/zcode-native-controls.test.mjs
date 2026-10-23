import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, toolReply, textReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const authorizedSessionPolicy = process.env.OMAA_TEST_SAFE === '1' && process.env.OMAA_TEST_SOURCE_LINKED === '1'
  && process.env.OMAA_TEST_SESSION_SANDBOX_MODE === 'danger-full-access';
async function fixture(t, childReply) {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, sessionSandboxMode: 'danger-full-access' });
  await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-zcode'), plans = new Map(); let ordinal = 0;
  f.replyWith(request => {
    if (request.tools?.some(row => row.function.name === 'submit_result')) return childReply(request);
    if (!request.tools?.length) return textReply('Owned native controls');
    const user = request.messages.filter(row => row.role === 'user').map(textOf)
      .findLast(text => [...plans.keys()].some(key => text.includes(key + ':'))) ?? '';
    const entry = [...plans].find(([key]) => user.includes(key + ':'));
    const step = entry?.[1].shift(); return step ? toolReply(step.name, step.args) : textReply('Native control request settled.');
  });
  async function call(name, args, owner = sessionId) {
    const marker = 'NATIVE_CONTROL_' + (++ordinal);
    const before = new Set((await f.snapshot(owner)).records.filter(row => row.event?.type === 'tool/call').map(row => row.event.data.callId));
    plans.set(marker, [{ name, args }]); await f.send(owner, marker + ': explicitly call ' + name);
    return until(async () => {
      const snapshot = await f.snapshot(owner);
      const invocation = snapshot.records.findLast(row => row.event?.type === 'tool/call' && !before.has(row.event.data.callId) && row.event.data.name === name)?.event;
      const event = snapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === invocation?.data.callId)?.event;
      if (!event) return;
      const text = textOf(event.data.message); let value; try { value = JSON.parse(text); } catch {}
      return { isError: Boolean(event.data.message.isError), text, value, snapshot };
    }, 30000).catch(async error => {
      const snapshot = await f.snapshot(owner);
      throw Error(error.message + '\n' + JSON.stringify({ marker, requested: name, requests: f.requests.length,
        recent: snapshot.records.filter(row => row.event?.type === 'tool/call' || row.event?.type === 'tool/result').slice(-4),
        modelUsers: f.requests.slice(-2).map(row => row.messages.filter(message => message.role === 'user').map(textOf).at(-1)) }));
    });
  }
  const detail = async runId => {
    const response = await fetch(f.origin + '/omaa/api/zcode-workflow?' + new URLSearchParams({ session: sessionId, run: runId }), { headers: { cookie: f.cookie } });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
  };
  assert.equal((await call('skill', { name: 'zcode-workflows' })).isError, false);
  return { f, sessionId, call, detail };
}

test('a caught typed Actor failure can continue live, while external-effect amendment remains refused', { timeout: 60000, skip: !authorizedSessionPolicy }, async t => {
  const { f, call } = await fixture(t, request => {
    const last = request.messages.filter(row => row.role === 'user').map(textOf)
      .findLast(text => /AFTER_FAILURE_SUCCESS|INTENTIONAL_NO_SUBMIT/.test(text)) ?? '';
    return last.includes('AFTER_FAILURE_SUCCESS') ? toolReply('submit_result', { value: { value: 'RECOVERED' } }) : textReply('Intentional turn without typed submission.');
  });
  const script = `interface Fact { value: string }
await world.run('node', ['-e', 'process.stdout.write("OWNED_COMMAND_OK")']);
const worker = agent('recovery');
try { await worker.ask<Fact>('INTENTIONAL_NO_SUBMIT'); } catch {}
return await worker.ask<Fact>('AFTER_FAILURE_SUCCESS');`;
  const run = await call('create_workflow', { script, run_in_background: false });
  assert.equal(run.isError, false, run.text); assert.equal(run.value.ok, true, run.text);
  assert.deepEqual(run.value.value, { value: 'RECOVERED' });
  const result = await call('get_workflow_run', { run_id: run.value.runId, include: ['result'] });
  assert.deepEqual(result.value.result.value, { value: 'RECOVERED' });
  const childRequests = f.requests.filter(row => row.tools?.some(tool => tool.function.name === 'submit_result')).length;
  const refused = await call('amend_workflow', { run_id: run.value.runId, script: script + '\n', run_in_background: false });
  assert.equal(refused.isError, true); assert.match(refused.text, /unfinished or unidentifiable external effects/);
  assert.equal(f.requests.filter(row => row.tools?.some(tool => tool.function.name === 'submit_result')).length, childRequests);
  assert.deepEqual(f.errors, []);
});

test('real parked questions enforce ownership, commit answers, cancel native children and remain dead after restart', { timeout: 90000, skip: !authorizedSessionPolicy }, async t => {
  const { f, sessionId, call, detail } = await fixture(t, request => {
    const material = request.messages.map(textOf).join('\n');
    return material.includes('NATIVE_ANSWER_0_FALSE') ? toolReply('submit_result', { value: { value: 'NATIVE_ANSWER_0_FALSE' } })
      : toolReply('escalate', { question: 'Choose the exact fixture answer', context: 'Owned synthetic native question' });
  });
  const script = "interface Answer {value:string} const worker=agent('Question'); return await worker.ask<Answer>('QUESTION_TASK');";
  const start = async () => {
    const response = await call('create_workflow', { script }); assert.equal(response.isError, false, response.text); assert.equal(response.value.ok, true, response.text);
    return response.value.runId;
  };
  const runId = await start();
  const waiting = await until(async () => { const value = await detail(runId); return value.pendingQuestions?.length === 1 && value; });
  const qid = waiting.pendingQuestions[0].qid;
  const foreign = await f.call('session/create', { request: { cwd: f.workspace, agentPreset: 'omaa-zcode' } });
  const wrong = await call('resolve_workflow_question', { question_id: qid, answer: 'WRONG_SESSION' }, foreign.sessionId);
  assert.equal(wrong.isError, true);
  const unchanged = await detail(runId);
  assert.equal(unchanged.pendingQuestions?.[0]?.qid, qid, JSON.stringify({ wrong: wrong.text, unchanged }));
  const answered = await call('resolve_workflow_question', { question_id: qid, answer: 'NATIVE_ANSWER_0_FALSE' });
  assert.equal(answered.isError, false, answered.text); assert.match(answered.text, /answer|Answered|回答/);
  await until(async () => (await detail(runId)).status === 'completed');
  const result = await call('get_workflow_run', { run_id: runId, include: ['result'] });
  assert.deepEqual(result.value.result.value, { value: 'NATIVE_ANSWER_0_FALSE' });
  const canceledRun = await start();
  const parked = await until(async () => { const value = await detail(canceledRun); return value.pendingQuestions?.length === 1 && value; });
  const canceledQid = parked.pendingQuestions[0].qid;
  // A child can park on escalate before the activation receipt returns. The
  // public projection attaches its real session ID only after acceptance.
  const childId = await until(async () => (await detail(canceledRun)).runtime.actors
    .find(actor => actor.name === 'Question')?.sessionId);
  const stopped = await fetch(f.origin + '/omaa/api/zcode-workflow?' + new URLSearchParams({ session: sessionId, run: canceledRun }),
    { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
  assert.equal(stopped.status, 202);
  const final = await until(async () => { const value = await detail(canceledRun); return value.status === 'killed' && value; });
  assert.deepEqual(final.pendingQuestions, []);
  const projection = await f.rpc('session/projections', { sessionId: childId });
  const history = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: childId, mode: 'continuable' }, throughSeq: projection.asOfSeq, maxMessages: 100 });
  assert.equal(history.records.findLast(row => row.event?.type === 'turn/end').event.data.reason.kind, 'aborted');
  await f.stop(); await f.boot();
  assert.deepEqual((await detail(canceledRun)).pendingQuestions, []);
  const stale = await call('resolve_workflow_question', { question_id: canceledQid, answer: 'MUST_NOT_WAKE' });
  assert.equal(stale.isError, true); assert.match(stale.text, /no longer in flight|not in flight|no live tool call/);
  assert.deepEqual(f.errors, []);
});

test('live hole rejects invalid fills, commits lexical source before release and cold-restores the actual result', { timeout: 60000, skip: !authorizedSessionPolicy }, async t => {
  const { f, sessionId, call, detail } = await fixture(t, () => textReply('No child expected'));
  const response = await call('create_workflow', { script: "const base=40; return await hole<number>('compute','Return base plus two');" });
  assert.equal(response.isError, false, response.text); assert.equal(response.value.ok, true, response.text);
  const runId = response.value.runId;
  const parked = await until(async () => { const value = await detail(runId); return value.liveHoles?.open.length === 1 && value; });
  const siteId = parked.liveHoles.open[0].siteId;
  const invalid = await call('fill_workflow', { run_id: runId, site_id: siteId, body: "return 'wrong type';" });
  assert.equal(invalid.value.ok, false); assert.equal((await detail(runId)).liveHoles.open.length, 1);
  const filled = await call('fill_workflow', { run_id: runId, site_id: siteId, body: 'return base + 2;' });
  assert.equal(filled.isError, false, filled.text); assert.equal(filled.value.ok, true, filled.text);
  await until(async () => (await detail(runId)).status === 'completed');
  const source = await fetch(f.origin + '/omaa/api/zcode-workflow-source?' + new URLSearchParams({ session: sessionId, run: runId }), { headers: { cookie: f.cookie } }).then(value => value.json());
  assert.match(source.script, /return base \+ 2;/);
  await f.stop(); await f.boot();
  const restored = await call('get_workflow_run', { run_id: runId, include: ['result', 'holes'] });
  assert.equal(restored.value.status, 'completed'); assert.equal(restored.value.result.value, 42);
  assert.deepEqual((await detail(runId)).liveHoles.open, []);
  assert.deepEqual(f.errors, []);
});

test('failed same-run replay restores cached observations after restart without republishing artifacts or reports', { timeout: 60000, skip: !authorizedSessionPolicy }, async t => {
  const { f, sessionId, call, detail } = await fixture(t, () => textReply('No child expected'));
  await writeFile(join(f.workspace, 'replay-fact.txt'), 'SAME_RUN_ORIGINAL_FACT');
  const script = `const value=await files.read('replay-fact.txt');
await artifact.markdown('replay-proof',value);
report({value});
throw new Error('INTENTIONAL_SAME_RUN_ERROR');`;
  const first = await call('create_workflow', { script, run_in_background: false });
  assert.equal(first.isError, false, first.text); assert.equal(first.value.ok, false);
  assert.match(first.value.error.message, /INTENTIONAL_SAME_RUN_ERROR/);
  const runId = first.value.runId, before = await detail(runId);
  assert.equal(before.status, 'failed'); assert.equal(before.reports.length, 1);
  assert.equal(before.artifacts.find(row => row.id === 'replay-proof').versions.length, 1);
  await writeFile(join(f.workspace, 'replay-fact.txt'), 'CHANGED_INPUT_MUST_NOT_BE_OBSERVED');
  await f.stop(); await f.boot();
  const resumed = await call('resume_workflow', { run_id: runId, run_in_background: false });
  assert.equal(resumed.isError, false, resumed.text); assert.equal(resumed.value.ok, false);
  assert.equal(resumed.value.runId, runId); assert.match(resumed.value.error.message, /INTENTIONAL_SAME_RUN_ERROR/);
  const after = await detail(runId);
  assert.equal(after.status, 'failed'); assert.equal(after.reports.length, before.reports.length);
  assert.equal(after.artifacts.find(row => row.id === 'replay-proof').versions.length, 1);
  const content = await fetch(f.origin + '/omaa/api/zcode-artifact-content?' + new URLSearchParams({ session: sessionId, run: runId, id: 'replay-proof', version: '1' }), { headers: { cookie: f.cookie } });
  assert.equal(content.status, 200); assert.equal(await content.text(), 'SAME_RUN_ORIGINAL_FACT');
  const reports = await call('get_workflow_run', { run_id: runId, include: ['reports'] });
  assert.equal(reports.isError, false, reports.text); assert(reports.value, reports.text);
  assert.equal(reports.value.error.code, 'exception'); assert.equal(Object.hasOwn(reports.value.error, 'name'), false);
  assert.deepEqual(reports.value.reports.items.map(row => row.item), [{ value: 'SAME_RUN_ORIGINAL_FACT' }]);
  assert.deepEqual(f.errors, []);
});

test('same-run resume refuses unproven world effects before reopening or repeating a command', { timeout: 60000, skip: !authorizedSessionPolicy }, async t => {
  const { f, call, detail } = await fixture(t, () => textReply('No child expected'));
  const command = 'const fs=require("node:fs");const p="effect-count.txt";fs.writeFileSync(p,String((fs.existsSync(p)?Number(fs.readFileSync(p,"utf8")):0)+1));';
  const first = await call('create_workflow', { script: `await world.run('node',['-e',${JSON.stringify(command)}]); throw new Error('EFFECT_TERMINAL');`, run_in_background: false });
  assert.equal(first.isError, false, first.text); assert.equal(first.value.ok, false);
  assert.match(first.value.error.message, /EFFECT_TERMINAL/);
  const runId = first.value.runId, before = await detail(runId);
  assert.equal(before.status, 'failed'); assert.equal(await readFile(join(f.workspace, 'effect-count.txt'), 'utf8'), '1');
  await f.stop(); await f.boot();
  const refused = await call('resume_workflow', { run_id: runId, run_in_background: false });
  assert.equal(refused.isError, true); assert.match(refused.text, /effect window closed without a complete native external-outcome proof/);
  assert.equal((await detail(runId)).revision, before.revision, 'Refusal must happen before reopening the archived run');
  assert.equal(await readFile(join(f.workspace, 'effect-count.txt'), 'utf8'), '1');
  assert.deepEqual(f.errors, []);
});
