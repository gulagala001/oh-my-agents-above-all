import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedConcurrency, createAskConcurrency } from '../src/presets/zcode/concurrency.mjs';
import { checkedWorkflowSubagentModel, resolveWorkflowModelBindings } from '../src/presets/zcode/model-bindings.mjs';
import { createAskReceipt, observeAskEvent, askReceiptOutcome } from '../src/presets/zcode/ask-receipt.mjs';
import { readActorContinuation, readAcceptedActorContinuation, ActorCarryUnavailable } from '../src/presets/zcode/continuity.mjs';
import { createNativeReplayJournal, readNativeReplayJournalRecord, nativeReplayOwnership, decodeNativeSettlementEnvelope } from '../src/presets/zcode/replay-journal.mjs';

// Synthetic coverage of concurrency, exact model routes, Actor continuity and replay.
const signal = () => new AbortController().signal;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('concurrency shrinking retains accepted work and FIFO; clearing cap drains; release is idempotent', async () => {
  const gate = createAskConcurrency(signal(), 2), admitted = [];
  const first = await gate.acquire(), second = await gate.acquire();
  gate.retune(1);
  const third = gate.acquire().then(release => { admitted.push(3); return release; });
  const fourth = gate.acquire().then(release => { admitted.push(4); return release; });
  first(); first(); await tick(); assert.deepEqual(admitted, []);
  second(); const releaseThird = await third; assert.deepEqual(admitted, [3]);
  gate.retune(undefined); const releaseFourth = await fourth; assert.deepEqual(admitted, [3, 4]);
  releaseThird(); releaseFourth();
});

test('concurrency abort rejects queued admissions with exact reason and never admits them later', async () => {
  const controller = new AbortController(), gate = createAskConcurrency(controller.signal, 1);
  const release = await gate.acquire(), reason = Error('owner stopped');
  const queued = assert.rejects(gate.acquire(), error => error === reason);
  controller.abort(reason); await queued; release(); gate.retune(undefined);
  assert.throws(() => gate.acquire(), error => error === reason);
  for (const value of [null, 0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '2']) assert.throws(() => checkedConcurrency(value));
  assert.equal(checkedConcurrency(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});

const catalog = [
  { provider: 'a', id: 'shared', reasoning: { efforts: [{ id: 'high' }] } },
  { provider: 'b', id: 'shared' }, { provider: 'a', id: 'unique' },
];
const modelContext = { get(key) { assert.equal(key, 'llm'); return {
  listProviders: () => [{ id: 'a' }, { id: 'b' }],
  listModels: async id => catalog.filter(model => model.provider === id),
  resolveModelInfo: async (provider, id) => catalog.find(model => model.provider === provider && model.id === id),
}; } };
test('catalog model resolution preserves source locations and requires exact advertised provider/effort', async () => {
  const references = ['shared', 'a/shared$high', 'a/shared$low', 'missing'].map((name, index) => ({ name, line: index + 7, column: 3 }));
  const result = await resolveWorkflowModelBindings(modelContext, references, signal(), ' a/unique ');
  assert.deepEqual([...result.bindings], [['a/shared$high', { provider: 'a', model: 'shared', reasoningEffort: 'high' }]]);
  assert.deepEqual(result.diagnostics.map(d => [d.line, d.column, d.code]), [[7, 3, 9011], [9, 3, 9011], [10, 3, 9011]]);
  assert.match(result.diagnostics[0].message, /ambiguous/);
  assert.equal(result.subagentModel.canonical, 'a/unique');
  assert(Object.isFrozen(result.subagentModel.options));
  assert.throws(() => checkedWorkflowSubagentModel({ canonical: 'b/unique', options: { provider: 'a', model: 'unique' } }));
  assert.throws(() => checkedWorkflowSubagentModel({ canonical: 'a/unique', options: { provider: 'a', model: 'unique', guessed: true } }));
});

test('empty model references avoid catalog dependency, and aborted catalog lookup stops resolution', async () => {
  assert.deepEqual(await resolveWorkflowModelBindings({ get() { throw Error('must stay lazy'); } }, [], signal()), { bindings: new Map(), diagnostics: [] });
  const controller = new AbortController(), reason = Error('cancel catalog');
  const ctx = { get: () => ({ listProviders: () => [{ id: 'a' }], listModels: async () => { controller.abort(reason); return catalog; } }) };
  await assert.rejects(resolveWorkflowModelBindings(ctx, [{ name: 'unique', line: 1, column: 1 }], controller.signal), error => error === reason);
});

const event = (type, data, seq = 0, surfaceOp) => ({ type, data, seq, ...(surfaceOp ? { surfaceOp } : {}) });
const feed = (receipt, type, data, seq, surfaceOp) => observeAskEvent(receipt, event(type, data, seq, surfaceOp), content => content);
test('receipt keeps completed accepted task facts when delivery returns after unrelated turns', () => {
  const receipt = createAskReceipt();
  feed(receipt, 'turn/start', { turn: 'one' });
  feed(receipt, 'user/message', { message: { id: 'accepted' } }, 1, 'append');
  feed(receipt, 'assistant/message', { content: 'answer one' }, 2, 'append');
  feed(receipt, 'turn/end', { turn: 'one', reason: { kind: 'completed' } }, 3);
  feed(receipt, 'turn/start', { turn: 'two' });
  feed(receipt, 'assistant/message', { turn: 'one', content: 'late overwrite' }, 5, 'append');
  feed(receipt, 'assistant/message', { content: 'answer two' }, 6, 'append');
  feed(receipt, 'turn/end', { turn: 'two', reason: { kind: 'failed' } }, 7);
  assert.deepEqual(askReceiptOutcome(receipt, 'accepted'), { turn: 'one', text: 'answer one', end: { turn: 'one', reason: { kind: 'completed' } }, eventCount: 4 });
  receipt.claimed.set('accepted', 'two'); assert.match(askReceiptOutcome(receipt, 'accepted').error.message, /different turns/);
  receipt.discarded.add('accepted'); assert.match(askReceiptOutcome(receipt, 'accepted').error.message, /discarded/);
});

test('receipt does not treat claimed-but-unadmitted completion or aborted admission as success', () => {
  const receipt = createAskReceipt(); receipt.claimed.set('claim', 'one');
  feed(receipt, 'turn/end', { turn: 'one', reason: { kind: 'completed' } }, 2);
  assert.match(askReceiptOutcome(receipt, 'claim').error.message, /without admitting/);
  receipt.admitted.set('abort', 'two'); feed(receipt, 'turn/end', { turn: 'two', reason: { kind: 'aborted' } }, 4);
  assert.match(askReceiptOutcome(receipt, 'abort').error.message, /aborted/);
  assert.equal(askReceiptOutcome(receipt, 'unknown'), undefined);
});

function transcriptFixture() {
  let disposed = 0;
  const events = [event('subagent/descriptor', { mode: 'continuable', label: 'ZCode Actor · writer', provider: 'spawn', persona: 'writer', agentProvider: 'a', agentModel: 'unique' }),
    event('turn/start', { turn: 't' }), event('step/start', { turn: 't', step: 's' }),
    event('user/message', { id: 'accepted' }, 3, 'append'), event('step/end', { turn: 't', step: 's' }),
    event('turn/end', { turn: 't', reason: { kind: 'completed' } })].map((e, seq) => ({ ...e, seq }));
  const observation = { header: { origin: 'subagent', parentSession: 'parent' }, inheritedEventCount: 0, events, [Symbol.dispose]() { disposed++; } };
  const ctx = { get: () => ({ observeSession: async () => observation }) };
  return { ctx, observation, events, disposed: () => disposed, source: { sessionId: 'child', persona: 'writer', eventCount: events.length } };
}
test('continuity clones exact authorized completed prefix and disposes observation on rejection', async () => {
  const f = transcriptFixture();
  const result = await readActorContinuation(f.ctx, { id: 'parent' }, f.source, signal());
  assert.deepEqual(result.nativeModel, { provider: 'a', model: 'unique' });
  result.events[0].data.persona = 'mutated'; assert.equal(f.events[0].data.persona, 'writer');
  f.observation.header.parentSession = 'foreign';
  await assert.rejects(readActorContinuation(f.ctx, { id: 'parent' }, f.source, signal()), /does not belong/);
  assert.equal(f.disposed(), 2);
});
test('Actor model pin follows the actual request inside the carried prefix, never a later suffix', async () => {
  const f = transcriptFixture();
  f.events.splice(4, 0, event('request/header', { header: { config: { provider: 'b', model: 'shared', reasoningEffort: 'high' } } }));
  f.events.forEach((row, seq) => row.seq = seq);
  const source = { ...f.source, eventCount: f.events.length };
  f.events.push(event('request/header', { header: { config: { provider: 'later', model: 'discarded' } } }, f.events.length));
  assert.deepEqual((await readActorContinuation(f.ctx, { id: 'parent' }, source, signal())).nativeModel,
    { provider: 'b', model: 'shared', reasoningEffort: 'high' });
  delete f.events[4].data.header.config.model;
  await assert.rejects(readActorContinuation(f.ctx, { id: 'parent' }, source, signal()), /no complete native model pin/);
});

test('accepted continuity requires balanced native cancellation and rejects undrained queued input', async () => {
  const f = transcriptFixture(); f.events.at(-1).data.reason = { kind: 'aborted', reason: { kind: 'parent' } };
  const source = { ...f.source, messageId: 'accepted' };
  assert.equal((await readAcceptedActorContinuation(f.ctx, { id: 'parent' }, source, signal())).eventCount, 6);
  f.events.push(event('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ id: 'unrelated' }] }, 6));
  await assert.rejects(readAcceptedActorContinuation(f.ctx, { id: 'parent' }, { ...source, eventCount: 7 }, signal()), ActorCarryUnavailable);
  assert.equal(f.disposed(), 2);
});

// In-memory transactional persistence fixture: no network, model, native task,
// shell effect or production store. save/read clone to exercise cold hydration.
function replayFixture() {
  const items = new Map(); let next = 0;
  let record = { sessionId: 'parent', runId: 'run', status: 'running', revision: 1, artifacts: [], reports: [], execution: { actors: [], world: [] } };
  const store = {
    async saveItem(value) { const attachmentId = String(++next); items.set(attachmentId, structuredClone(value)); return { attachmentId, name: 'fixture', bytes: 1 }; },
    async readItem(ref) { assert(items.has(ref.attachmentId)); return structuredClone(items.get(ref.attachmentId)); },
    async record() { return structuredClone(record); },
    async mutate(_parent, _run, callback) { const draft = structuredClone(record); await callback(draft); record = draft; },
  };
  const options = { store, parent: { id: 'parent' }, runId: 'run', ownership: { script: 'fixture source', args: { n: 1 }, cwd: '/offline', modelBindings: new Map() }, signal: signal() };
  return { options, store, items, setStatus: status => { record.status = status; } };
}
test('prospective replay uses durable cached result and rejects changed inputs before dispatch', async () => {
  const f = replayFixture(), meta = { siteId: 'read', kind: 'world-read', args: { path: 'fixture' } };
  const first = await createNativeReplayJournal(f.options);
  assert.deepEqual(await first.run(meta, async () => ({ value: 42 })), { value: 42 }); await first.finish(); await first.dispose();
  f.setStatus('failed');
  const summary = await readNativeReplayJournalRecord(f.options);
  assert.equal(summary.journalIntegrityVerified, true); assert.equal(summary.payloadsVerified, false);
  assert.equal(summary.nodeCounts['world-read'].completed, 1);
  let calls = 0;
  const second = await createNativeReplayJournal({ ...f.options, replay: true });
  const cached = second.run(meta, () => { calls++; throw Error('must not dispatch'); });
  await second.finish(); assert.deepEqual(await cached, { value: 42 }); assert.equal(calls, 0); await second.dispose();
  const third = await createNativeReplayJournal({ ...f.options, replay: true });
  await assert.rejects(third.run({ ...meta, args: { path: 'changed' } }, () => { calls++; }), /mismatched before dispatch/);
  assert.equal(calls, 0); await third.dispose();
});
test('interrupted world mutation remains RUNNING and blocks replay before any new driver', async () => {
  const f = replayFixture(), journal = await createNativeReplayJournal(f.options);
  const interrupted = Object.assign(Error('unknown effect completion'), { name: 'AbortError' });
  await assert.rejects(journal.run({ siteId: 'mutation', kind: 'world-run', args: {} }, () => { throw interrupted; }), error => error === interrupted);
  assert.equal(journal.entries()[0].status, 'running'); await journal.dispose(); f.setStatus('failed');
  await assert.rejects(createNativeReplayJournal({ ...f.options, replay: true }), error => error.code === 'uncertain_effect' && /mutation@0/.test(error.message));
});
test('replay ownership binds effective source, arguments, directory and selected native run model', () => {
  const ownership = replayFixture().options.ownership;
  const first = nativeReplayOwnership(ownership);
  assert.deepEqual(first, nativeReplayOwnership({ ...ownership, modelBindings: {} }));
  for (const patch of [{ script: 'other' }, { args: { n: 2 } }, { cwd: '/other' }]) assert.notDeepEqual(first, nativeReplayOwnership({ ...ownership, ...patch }));
  const chosen = nativeReplayOwnership({ ...ownership, subagentModel: { canonical: 'a/unique', options: { provider: 'a', model: 'unique' } } });
  assert.match(chosen.subagentModelHash, /^[a-f0-9]{64}$/); assert.equal(Object.hasOwn(first, 'subagentModelHash'), false);
});
test('settlement envelope distinguishes undefined from null, clones payload, and rejects contradictory facts', () => {
  const base = { format: 'omaa.zcode.settlement', version: 1, sequence: 1 };
  const value = { ...base, outcome: { ok: true, value: { n: null } } };
  const copy = decodeNativeSettlementEnvelope(value); copy.outcome.value.n = 2; assert.equal(value.outcome.value.n, null);
  assert.deepEqual(decodeNativeSettlementEnvelope({ ...base, outcome: { ok: true, undefined: true } }).outcome, { ok: true, undefined: true });
  for (const outcome of [{ ok: true }, { ok: true, undefined: true, value: null }, { ok: false, error: { name: 'Error', message: 'failure', token: 'extra' } }]) assert.throws(() => decodeNativeSettlementEnvelope({ ...base, outcome }));
});
