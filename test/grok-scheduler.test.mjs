import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, parseInterval } from '../src/presets/grok/scheduler.mjs';

function fixture(tasks = []) {
  const registered = new Map(), listeners = new Map(), cleanups = [];
  let mode = 'default', sequence = 0;
  const services = new Map([
    ['agentPresets', { composedPreset: () => 'omaa-grok' }],
    ['sandboxPolicy', { resolve: () => ({ mode: 'workspace-write' }) }],
    ['approval', { overrideOf: () => undefined, config: { policy: 'ask' } }],
  ]);
  const agent = { id: 'session', session: { id: 'session', header: {} }, ctx: { get: key => services.get(key) } };
  const controller = new AbortController(), exec = { agent, signal: controller.signal, token: Symbol('accepted-body'), callId: 'call', rootCallId: 'root' };
  const schedule = { async list() { return [...tasks]; }, async catalog() { return [...tasks]; }, update() { throw Error('Unexpected native update'); }, delete() { throw Error('Unexpected native delete'); } };
  const adapter = {
    async list() { return []; }, ownership() { return { owned: false, nativeMatches: false }; },
    async create(received, args) {
      assert.equal(received, exec, 'The actual accepted body context must be passed without cloning');
      await Promise.resolve(); const row = task('new-' + (++sequence), args.prompt); tasks.push(row); return row;
    }, update() { throw Error('Unexpected owned update'); }, remove() { throw Error('Unexpected owned removal'); },
  };
  const ctx = { inject(_services, mount) { return mount(this); }, effect(fn) { cleanups.push(fn()); },
    on(name, fn) { const rows = listeners.get(name) ?? []; rows.push(fn); listeners.set(name, rows); return () => {}; },
    tools: { register(tool) { registered.set(tool.name, tool); } }, schedule,
    agents: { get: id => id === agent.id ? agent : undefined }, sandboxPolicy: services.get('sandboxPolicy'),
    omaa: { product: () => ({ id: 'grok' }), modeFor: () => mode, grokSchedules: adapter } };
  apply(ctx);
  return { tasks, ctx, adapter, exec, controller, setMode(value) { mode = value; },
    call: (name, args, caller = exec) => registered.get(name).execute(args, caller),
    close() { for (const fn of cleanups.reverse()) fn?.(); } };
}
function task(id, prompt = 'Owned fixture task') {
  return { id, prompt, kind: 'every', everySeconds: 60, scheduledAt: '2030-01-01T00:00:00.000Z', status: 'active', sessionId: 'session' };
}

test('Grok intervals retain their real minimum, reject malformed/overflow values and serialize the task cap', async () => {
  assert.equal(parseInterval(' 1s '), 60); assert.equal(parseInterval('2h'), 7200);
  for (const value of ['0m', '1.5m', '5M', '9223372036854775808d']) assert.throws(() => parseInterval(value));
  const tasks = Array.from({ length: 49 }, (_, index) => task(String(index))), f = fixture(tasks);
  const outcomes = await Promise.allSettled([1, 2].map(() => f.call('scheduler_create', { interval: '1m', prompt: 'Cap boundary' })));
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(outcome => outcome.status === 'rejected').reason.message, /Maximum 50/);
  assert.equal(tasks.length, 50);
  f.close();
});

test('scheduler listing enforces the full UTF-8 JSON budget and labels ordinary reminders', async () => {
  const f = fixture(Array.from({ length: 60 }, (_, i) => task(String(i) + 'x'.repeat(400), '世界'.repeat(1000))));
  const value = await f.call('scheduler_list', {});
  assert.equal(value.total, 60); assert(value.tasks.length < 50); assert.equal(value.truncated, true);
  assert(value.bytes <= 24000); assert.equal(value.bytes, Buffer.byteLength(JSON.stringify(value)));
  for (const row of value.tasks) {
    assert.equal(row.taskType, 'ordinary-native-reminder'); assert(row.prompt.endsWith('...'));
    assert(Buffer.byteLength(row.prompt.slice(0, -3)) <= 80); assert(!row.prompt.includes('\ufffd'));
  }
  f.close();
});

test('durable retarget and one-shot immediate requests reject before any native creation', async () => {
  const f = fixture();
  await assert.rejects(f.call('scheduler_create', { interval: '1m', prompt: 'fixture', durable: true }), /Cross-session durable/);
  await assert.rejects(f.call('scheduler_create', { interval: '1m', prompt: 'fixture', recurring: false, fire_immediately: true }), /requires a recurring task/);
  assert.equal(f.tasks.length, 0); f.close();
});

test('observed mode change during preparation fences scheduler admission', async () => {
  const f = fixture(); f.ctx.schedule.list = async () => { f.setMode('ask'); return []; };
  await assert.rejects(f.call('scheduler_create', { interval: '1m', prompt: 'fixture' }), /permissions.*mode|working mode/);
  assert.equal(f.tasks.length, 0); f.close();
});

test('confirmed native creation retains its identity when the caller cancels after commit', async () => {
  const f = fixture(), create = f.adapter.create;
  f.adapter.create = async (...args) => { const row = await create(...args); f.controller.abort(Error('caller canceled')); return row; };
  const result = await f.call('scheduler_create', { interval: '1m', prompt: 'fixture' });
  assert.equal(result.id, f.tasks[0].id); assert.equal(result.confirmed, true); assert.equal(result.interrupted, true);
  assert.equal(result.interruptionReason, 'caller_cancelled'); f.close();
});

test('unowned inert references cannot be adopted by update or delete', async () => {
  const f = fixture([task('orphan', '[OMAA GROK DISPATCH unowned]\nInert fixture reference')]);
  await assert.rejects(f.call('scheduler_create', { task_id: 'orphan', prompt: 'replacement' }), /inert Grok reference/);
  await assert.rejects(f.call('scheduler_delete', { id: 'orphan' }), /inert Grok reference/);
  assert.equal(f.tasks[0].prompt, '[OMAA GROK DISPATCH unowned]\nInert fixture reference'); f.close();
});

test('owned listing uses actual catalog bindings and never surfaces a different session', async () => {
  const actual = task('owned', '[OMAA GROK DISPATCH owned]'), foreign = { ...task('foreign'), sessionId: 'someone-else' };
  const f = fixture([actual, foreign]);
  f.ctx.schedule.list = async () => [{ id: actual.id, prompt: actual.prompt, kind: actual.kind }];
  f.adapter.list = async () => [{ ...actual, prompt: 'Actual owned task body', adapterStatus: 'ACTIVE' }];
  f.adapter.ownership = (_exec, id, row) => ({ owned: id === actual.id, status: 'ACTIVE', nativeMatches: row?.sessionId === 'session' });
  const listed = await f.call('scheduler_list', {});
  assert.equal(listed.tasks.length, 1); assert.equal(listed.tasks[0].taskType, 'grok-adapter-task');
  assert.equal(listed.tasks[0].prompt, 'Actual owned task body'); f.close();
});

test('ordinary native update preserves record comparison without catalog-only metadata', async () => {
  const f = fixture([task('legacy')]); let captured;
  f.ctx.schedule.update = async request => {
    captured = request; return { updated: true, record: { ...request.expected, prompt: request.prompt } };
  };
  const result = await f.call('scheduler_create', { task_id: 'legacy', prompt: 'revised' });
  assert.equal(result.updated, true); assert.equal(captured.sessionId, 'session');
  for (const key of ['sessionId', 'status', 'lastDelivery', 'taskType']) assert(!Object.hasOwn(captured.expected, key));
  assert.equal(captured.expected.id, 'legacy'); f.close();
});
