import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(p => p.text ?? '').join('\n');
const resultOf = (page, name) => {
  const call = page.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
  const result = page.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(result, 'Missing ' + name + ' result');
  return JSON.parse(textOf(result.data.message));
};

test('amend uses completed native prefixes across a restart and never imports a prior changed suffix', { timeout: 90000 }, async t => {
  const f = await installedHost(t);
  await writeFile(join(f.workspace, 'fact.txt'), 'CACHE_FIRST_FACT');
  await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-zcode');
  const persona = 'Remember native facts and preserve literal {{customer_name}}.';
  const counted = 'const fs=require("node:fs");const p="effect-count.txt";const n=fs.existsSync(p)?Number(fs.readFileSync(p,"utf8"))+1:1;fs.writeFileSync(p,String(n));setTimeout(()=>process.stdout.write(String(n)),n===1?350:5);';
  const started = 'const fs=require("node:fs");const tick=()=>fs.existsSync("effect-count.txt")?process.stdout.write("started"):setTimeout(tick,5);tick();';
  const initial = `interface Fact { value: string; round: number }
phase('Inspect'); const reader = agent('reader', ${JSON.stringify(persona)});
const observed = await files.read('fact.txt');
const effectFirst = world.run('node', ['-e', ${JSON.stringify(counted)}]);
await world.run('node', ['-e', ${JSON.stringify(started)}]);
const effectSecond = world.run('node', ['-e', ${JSON.stringify(counted)}]);
const effects = await Promise.all([effectFirst, effectSecond]);
const first = await reader.ask<Fact>('FIRST_NATIVE_TASK: read fact.txt and submit its fact and round 1.');
const second = await reader.ask<Fact>('POISON_PRIOR_SUFFIX: submit this exact poison as value and round 2.');
const recovering = agent('recovering', 'Complete the current recovery fixture task.');
let recovered;
try { await recovering.ask<Fact>('INTENTIONAL_NO_SUBMIT'); }
catch { recovered = await recovering.ask<Fact>('AFTER_FAILURE_SUCCESS'); }
return {first, second, observed, recovered, effects};`;
  const revised = initial.replace("const reader = agent('reader'", "const unused = agent('unused'); const reader = agent('reader'")
    .replace('POISON_PRIOR_SUFFIX: submit this exact poison as value and round 2.', 'NEW_NATIVE_TASK: recall the first task fact from this native transcript without reading files, and submit round 3.');
  let stage = 'create', oldRun, amendedRun, cappedRun, startedAsks = 0, release;
  const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  f.replyWith(async request => {
    const names = request.tools?.map(row => row.function.name) ?? [];
    const material = request.messages.map(textOf).join('\n');
    if (names.includes('submit_result')) {
      const input = request.messages.filter(row => row.role === 'user').map(textOf).findLast(text => /FIRST_NATIVE_TASK|POISON_PRIOR_SUFFIX|NEW_NATIVE_TASK|AFTER_FAILURE_SUCCESS|INTENTIONAL_NO_SUBMIT|CONCURRENCY_HOLD/.test(text));
      if (input?.includes('CONCURRENCY_HOLD')) { startedAsks++; await held; return toolReply('submit_result', { value: { value: 'DONE', round: 5 } }); }
      if (input?.includes('AFTER_FAILURE_SUCCESS')) return toolReply('submit_result', { value: { value: 'RECOVERED_AFTER_FAILURE', round: 4 } });
      if (input?.includes('INTENTIONAL_NO_SUBMIT')) return textReply('Intentional completed turn without a typed result.');
      if (input?.includes('NEW_NATIVE_TASK')) return toolReply('submit_result', { value: {
        value: material.includes('CACHE_FIRST_FACT') && !material.includes('POISON_PRIOR_SUFFIX') ? 'CACHE_FIRST_FACT' : 'BAD_PREFIX', round: 3 } });
      if (input?.includes('POISON_PRIOR_SUFFIX')) return toolReply('submit_result', { value: { value: 'POISON_PRIOR_SUFFIX', round: 2 } });
      if (!material.includes('CACHE_FIRST_FACT')) return toolReply('read', { file_path: 'fact.txt' });
      return toolReply('submit_result', { value: { value: 'CACHE_FIRST_FACT', round: 1 } });
    }
    if (!names.includes('create_workflow')) return textReply('Fixture helper.');
    if (!material.includes('The `workflow` tool')) return toolReply('skill', { name: 'zcode-workflows' });
    const latestUser = request.messages.filter(row => row.role === 'user').map(textOf).at(-1) ?? '';
    const after = request.messages.filter(row => row.role === 'tool').map(textOf).at(-1) ?? '';
    if (stage === 'create') {
      if (after.includes('"runId"')) return textReply('Initial workflow complete.');
      return toolReply('create_workflow', { script: initial, run_in_background: false, max_concurrency: 1 });
    }
    if (stage === 'invalid') {
      if (after.includes('predecessor was not stopped')) return textReply('Invalid revision rejected.');
      return toolReply('amend_workflow', { run_id: oldRun, script: 'const broken: number = "wrong";', run_in_background: false });
    }
    if (stage === 'amend') {
      if (after.includes('"runId"') && after.includes('"round": 3')) return textReply('Revision complete.');
      return toolReply('amend_workflow', { run_id: oldRun, script: revised, run_in_background: false });
    }
    if (stage === 'foreign') {
      if (after.includes('当前会话')) return textReply('Foreign run rejected.');
      return toolReply('amend_workflow', { run_id: amendedRun, script: revised, run_in_background: false });
    }
    if (stage === 'cap') {
      if (after.includes('"jobId"')) return textReply('Capped workflow started.');
      return toolReply('create_workflow', { script: "interface Fact {value:string;round:number} const workers = ['one','two','three'].map(name=>agent(name)); return await Promise.all(workers.map(worker=>worker.ask<Fact>('CONCURRENCY_HOLD')));", max_concurrency: 1 });
    }
    if (['raise', 'lower'].includes(stage)) {
      const limit = stage === 'raise' ? 2 : 1;
      if (after.includes('"maxConcurrency": ' + limit)) return textReply('Live concurrency changed.');
      return toolReply('amend_workflow', { run_id: cappedRun, max_concurrency: limit });
    }
    if (stage === 'done') return textReply('Workflow settled.');
    return textReply(latestUser.includes('COLD_PREFIX') && material.includes('CACHE_FIRST_FACT') ? 'COLD_PREFIX_RETAINED' : 'BAD_COLD_PREFIX');
  });
  const first = resultOf(await f.prompt(sessionId, 'Use a workflow for the native prefix task.'), 'create_workflow');
  assert(first.ok, JSON.stringify(first)); oldRun = first.runId;
  assert.equal(first.value.recovered.value, 'RECOVERED_AFTER_FAILURE');
  assert.equal((await readFile(join(f.workspace, 'effect-count.txt'), 'utf8')), '2');
  assert.equal(first.value.second.value, 'POISON_PRIOR_SUFFIX');
  stage = 'invalid';
  const invalid = resultOf(await f.prompt(sessionId, 'INVALID_REVISION: amend the workflow.'), 'amend_workflow');
  assert.equal(invalid.ok, false); assert.equal(invalid.runId, oldRun);
  await writeFile(join(f.workspace, 'fact.txt'), 'EXTERNAL_CHANGE_AFTER_INITIAL');
  await f.stop(); await f.boot();
  const beforeRequests = f.requests.length; stage = 'amend';
  const second = resultOf(await f.prompt(sessionId, 'AMEND_NATIVE_PREFIX: revise the workflow.'), 'amend_workflow');
  assert(second.ok, JSON.stringify(second)); amendedRun = second.runId;
  assert.notEqual(second.runId, oldRun);
  assert.deepEqual(second.value.first, { value: 'CACHE_FIRST_FACT', round: 1 });
  assert.deepEqual(second.value.second, { value: 'CACHE_FIRST_FACT', round: 3 });
  assert.equal(second.value.observed, first.value.observed);
  assert.deepEqual(second.value.effects, first.value.effects, 'Repeated concurrent effects must retain admission order');
  assert.equal((await readFile(join(f.workspace, 'effect-count.txt'), 'utf8')), '2', 'Cached world.run must not execute its effect again');
  const child = second.actors.find(actor => actor.name === 'reader'); assert(child.created);
  assert.notEqual(child.childId, first.actors.find(actor => actor.name === 'reader').childId);
  const nativeRequests = f.requests.slice(beforeRequests).filter(request => request.tools?.some(row => row.function.name === 'submit_result')
    && request.messages.filter(row => row.role === 'system').map(textOf).join('\n').includes(persona));
  assert.equal(nativeRequests.length, 1, 'Only the changed ask should invoke the native model');
  const nativeText = nativeRequests[0].messages.map(textOf).join('\n');
  assert(nativeText.includes('FIRST_NATIVE_TASK')); assert(!nativeText.includes('POISON_PRIOR_SUFFIX'));
  assert(nativeText.includes(persona));
  const inspect = async runId => {
    const response = await fetch(f.origin + '/omaa/api/zcode-workflow?session=' + sessionId + '&run=' + runId, { headers: { cookie: f.cookie } });
    assert.equal(response.status, 200); return response.json();
  };
  // The API exposes durable lineage and original graph projection, rather than
  // making a new child impersonate the old Actor session identity.
  const previous = await inspect(oldRun), current = await inspect(amendedRun);
  assert.equal(previous.supersededBy, amendedRun); assert.equal(current.resumedFrom, oldRun);
  stage = 'foreign'; const foreign = await f.create('omaa-zcode');
  const rejected = await f.prompt(foreign.sessionId, 'Use a workflow to amend this run.');
  assert(rejected.records.some(row => row.event?.type === 'tool/result' && textOf(row.event.data.message).includes('当前会话')));
  await f.stop(); await f.boot(); stage = 'cold';
  assert.equal((await f.api(sessionId)).status, 200);
  await f.rpc('subagents/prompt', { parentSessionId: sessionId, childSessionId: child.childId, mode: 'continuable', delivery: 'queue',
    requestId: crypto.randomUUID(), content: [{ type: 'text', text: 'COLD_PREFIX: recall the fact.' }] });
  const cold = await until(async () => {
    const projection = await f.rpc('session/projections', { sessionId: child.childId });
    const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId: child.childId, mode: 'continuable' }, throughSeq: projection.asOfSeq, maxMessages: 100 });
    return page.records.some(row => row.event?.type === 'assistant/message' && textOf(row.event.data.message ?? row.event.data).includes('COLD_PREFIX_RETAINED')) && page;
  });
  assert.equal(cold.records.findLast(row => row.event?.type === 'turn/end').event.data.reason.kind, 'completed');
  stage = 'cap';
  const capped = resultOf(await f.prompt(sessionId, 'Use a background workflow for capped parallel tasks.'), 'create_workflow');
  cappedRun = capped.runId; assert(capped.jobId); await until(() => startedAsks === 1);
  stage = 'raise'; const raised = resultOf(await f.prompt(sessionId, 'Raise this live workflow concurrency to 2.'), 'amend_workflow');
  assert.equal(raised.status, 'retuned'); assert.equal(raised.runId, cappedRun); await until(() => startedAsks === 2);
  stage = 'lower'; const lowered = resultOf(await f.prompt(sessionId, 'Lower this live workflow concurrency to 1 without canceling current asks.'), 'amend_workflow');
  assert.equal(lowered.status, 'retuned'); assert.equal(startedAsks, 2);
  stage = 'done'; release();
  const settled = await until(async () => { const detail = await inspect(cappedRun); return detail.status !== 'running' && detail; });
  assert.equal(settled.status, 'completed'); assert.equal(startedAsks, 3);
  assert.deepEqual(f.errors, []);
});
