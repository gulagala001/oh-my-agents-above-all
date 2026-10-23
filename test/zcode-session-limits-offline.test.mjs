import test from 'node:test';
import assert from 'node:assert/strict';
import { apply as applyOutputLimits } from '../src/output-limits.mjs';
import { createWorkflowQuestions, readWorkflowQuestionFacts } from '../src/presets/zcode/questions.mjs';
import { foldNativeRunFact } from '../src/presets/zcode/run-progress.mjs';

// Explicit offline mocks; all sessions and content are synthetic.
async function limitFixture(rows = new Map(), agents = []) {
  const handlers = new Map(), services = {}, writes = [];
  const ctx = {
    omaa: { product: session => ({ id: session.product ?? 'zcode' }) },
    agents: { list: () => agents, get: id => agents.find(agent => agent.id === id) },
    sessions: { get: id => agents.find(agent => agent.id === id)?.session },
    sessionQuery: { async observeSession(id) { const session = agents.find(agent => agent.id === id).session; return { source: 'live', header: session.header, events: session.events, [Symbol.dispose]() {} }; } },
    storageDomain: { async open() { return { table: () => ({ get: key => structuredClone(rows.get(key)), async put(key, value) { rows.set(key, structuredClone(value)); writes.push(value); } }), async close() {} }; } },
    effect() {}, on(name, handler) { handlers.set(name, handler); }, provide(name, service) { services[name] = service; },
  };
  await applyOutputLimits(ctx);
  return { rows, writes, inherit: services.omaaOutputLimits.inheritOptions,
    created: (agent, source) => { if (!agents.includes(agent)) agents.push(agent); return handlers.get('agent/created')({ agent, source }); },
    request: (agent, proposal) => handlers.get('agent/request')({ agent, signal: new AbortController().signal }, async () => proposal),
    header: agent => { const event = { type: 'request/header', seq: agent.session.seq++, data: { header: { config: agent.session.requestHeader().config } } }; agent.session.events.push(event); handlers.get('session/event')(agent.session, event); },
  };
}
function agent(id, maxTokens, config = {}) {
  return { id, options: Object.freeze(maxTokens === undefined ? {} : { maxTokens }), session: { id, header: { id }, events: [], seq: 0, requestHeader: () => ({ config }) } };
}

test('output cap persists effective selection, restores over stale constructor seed, and honors explicit child cap', async () => {
  const first = await limitFixture(), original = agent('mock-parent', 1200);
  await first.created(original, 'create');
  assert.equal((await first.request(original, { maxTokens: 2400, marker: 'mock' })).maxTokens, 2400);
  const restored = agent('mock-parent', 1200, { maxTokens: 1200 }), cold = await limitFixture(first.rows, [restored]);
  await cold.created(restored, 'resume');
  assert.equal(cold.inherit(restored, {}).maxTokens, 2400);
  const explicit = { maxTokens: 700, marker: 'child' };
  assert.strictEqual(cold.inherit(restored, explicit), explicit);
  assert.equal((await cold.request(restored, { maxTokens: 1200 })).maxTokens, 2400);
  assert.equal(restored.options.maxTokens, 1200, 'restoration must not mutate agent construction options');
  assert.equal((await cold.request(restored, { maxTokens: 3600 })).maxTokens, 3600);
  assert.equal(cold.inherit(restored, {}).maxTokens, 3600);
  cold.header(restored);
  assert.equal(cold.inherit(restored, {}).maxTokens, 1200, 'after committed header the effective parent header wins');
  assert.equal((await cold.request(restored, {})).maxTokens, 1200, 'a newer committed header replaces the pending saved choice');
});

test('unknown output cap remains absent; invalid selections reject and other products pass through', async () => {
  const f = await limitFixture(), parent = agent('mock-unknown');
  await f.created(parent, 'create');
  const requested = { marker: true };
  assert.strictEqual(f.inherit(parent, requested), requested);
  assert.deepEqual(await f.request(parent, {}), {});
  for (const maxTokens of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(f.request(parent, { maxTokens }), /positive safe integer/);
  assert.equal(f.writes.length, 0);
  const other = agent('mock-other', 77); other.session.product = 'pi';
  await f.created(other, 'create');
  const proposal = { maxTokens: 0 };
  assert.strictEqual(await f.request(other, proposal), proposal);
  assert.strictEqual(f.inherit(other, requested), requested);
});

function questionFixture(initial) {
  let record = initial ?? { runId: 'mock-run', sessionId: 'mock-parent', status: 'running' };
  if (!record.runtime) foldNativeRunFact(record, record.runId, 'run-started');
  let tail = Promise.resolve(), fail = false;
  const notices = [], controller = new AbortController();
  const store = {
    async record(sessionId, runId) { assert.equal(sessionId, record.sessionId); assert.equal(runId, record.runId); return structuredClone(record); },
    list(sessionId) { return { runs: record.sessionId === sessionId ? [{ runId: record.runId }] : [] }; },
    mutate(sessionId, runId, fn, { signal } = {}) {
      const work = tail.then(async () => {
        signal?.throwIfAborted(); assert.equal(sessionId, record.sessionId); assert.equal(runId, record.runId);
        const draft = structuredClone(record); await fn(draft); signal?.throwIfAborted();
        if (fail) throw Error('mock durable commit failure'); record = draft;
      });
      tail = work.catch(() => {}); return work;
    },
  };
  const registry = createWorkflowQuestions({ store, parent: { id: record.sessionId }, runId: record.runId, signal: controller.signal,
    notify: async event => { notices.push(event); } });
  return { store, registry, notices, get record() { return structuredClone(record); }, set fail(value) { fail = value; },
    ask(task = {}) { return registry.escalate({ task, actor: { siteId: 'mock-site', ordinal: 1 }, actorSeq: 0, childId: 'mock-child', toolCallId: 'mock-tool', question: 'Which mock option?', isActive: () => true }); },
  };
}
async function admitted(f) {
  for (let n = 0; n < 20; n++) { if (f.registry.pending().length) return f.registry.pending()[0]; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('mock question admission did not finish');
}

test('question answer requires owning session and durable commit before releasing the waiting tool', async () => {
  const f = questionFixture(), answer = f.ask(), { qid } = await admitted(f);
  await assert.rejects(f.registry.resolve({ sessionId: 'other', questionId: qid, answer: 'wrong' }), /current session/);
  assert.equal(readWorkflowQuestionFacts(f.record)[0].status, 'pending');
  f.fail = true;
  await assert.rejects(f.registry.resolve({ sessionId: 'mock-parent', questionId: qid, answer: 'not committed' }), /commit failure/);
  assert.equal(f.registry.pending().length, 1); assert.equal(readWorkflowQuestionFacts(f.record)[0].status, 'pending');
  f.fail = false;
  assert.deepEqual(await f.registry.resolve({ sessionId: 'mock-parent', questionId: qid, answer: 'mock chosen' }), { ok: true, qid });
  assert.deepEqual(await answer, { status: 'answered', message: 'mock chosen', qid });
  assert.equal(readWorkflowQuestionFacts(f.record)[0].answer, 'mock chosen');
  assert.equal(f.registry.pending().length, 0);
  assert.equal((await f.registry.resolve({ sessionId: 'mock-parent', questionId: qid, answer: 'again' })).reason, 'already_resolved');
  await f.registry.close();
});

test('cold pending facts cannot recreate a live deferred or accept answers', async () => {
  const live = questionFixture(), waiting = live.ask(); waiting.catch(() => {});
  const { qid } = await admitted(live), snapshot = live.record;
  const cold = questionFixture(snapshot);
  assert.deepEqual(cold.registry.pending(), []);
  assert.equal((await cold.registry.resolve({ sessionId: 'mock-parent', questionId: qid, answer: 'mock stale answer' })).reason, 'run_not_in_flight');
  assert.equal(readWorkflowQuestionFacts(cold.record)[0].status, 'pending');
  await cold.registry.close(); await live.registry.close();
  await assert.rejects(waiting, /closed/);
  assert.equal(readWorkflowQuestionFacts(live.record)[0].status, 'withdrawn');
});

test('question budget belongs to each ask; cancellation withdraws pending questions durably', async () => {
  const f = questionFixture(), task = {};
  for (let n = 0; n < 3; n++) {
    const waiting = f.ask(task), { qid } = await admitted(f);
    await f.registry.resolve({ sessionId: 'mock-parent', questionId: qid, answer: `mock answer ${n}` }); await waiting;
  }
  assert.equal((await f.ask(task)).reason, 'budget_exhausted');
  const nextTask = {}, waiting = f.ask(nextTask); waiting.catch(() => {});
  await admitted(f); f.registry.cancelAsk(nextTask, Error('mock ask canceled'));
  await assert.rejects(waiting, /ask canceled/); await f.registry.close();
  const facts = readWorkflowQuestionFacts(f.record);
  assert.deepEqual(facts.map(row => row.status), ['answered', 'answered', 'answered', 'withdrawn']);
});
