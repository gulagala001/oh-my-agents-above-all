import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, MonitorLines, MonitorRateLimiter } from '../src/presets/grok/monitor.mjs';
import { setTimeout as delay } from 'node:timers/promises';

function fixture({ failNotice = false, foreign = false } = {}) {
  let listener, tool, offset = 0; const disposers = [], pending = [], messages = [], killed = [];
  const job = { id: 'owned-job', owner: foreign ? 'foreign' : 'owner', kind: 'bash', label: 'owned command', status: 'running' };
  const agent = { id: 'owner', status: 'idle', followup(message) { if (failNotice) throw Error('notice unavailable'); messages.push(message); }, inject(message) { messages.push(message); } };
  const ctx = { omaaGrokMonitorShell: { run: (_call, next) => next() }, agents: { get: () => agent }, logger: { warn() {} }, effect(fn) { disposers.push(fn()); },
    jobs: { events: { subscribe(_filter, fn) { listener = fn; } }, get() { return job; },
      readAt(id, from, owner) { assert.equal(id, job.id); assert.equal(owner, agent.id); assert.equal(from, offset);
        const value = pending.shift() ?? { chunks: [] }; offset += value.chunks.reduce((n, row) => n + Buffer.byteLength(row.text), 0);
        return { lossy: false, ...value, next: offset }; },
      kill(id, owner, reason) { killed.push({ id, owner, reason }); job.status = 'killed'; listener({ type: 'stopping', job }); } },
    tools: { register(value) { tool = value; }, get: name => name === 'bash', async execute() {
      listener({ type: 'registered', job }); return { isError: false, value: { kind: 'background', jobId: job.id } };
    } },
  };
  apply(ctx);
  return { job, messages, killed,
    start: args => tool.execute({ command: 'owned command', description: 'watch "own"\nstate', ...args },
      { agent, callId: 'outer', token: Symbol('accepted'), signal: new AbortController().signal }),
    output(chunks, extra = {}) { pending.push({ chunks, ...extra }); listener({ type: 'output', id: job.id }); },
    finish() { job.status = 'completed'; listener({ type: 'settled', job, cause: 'completed' }); },
    async close() { for (const fn of disposers.reverse()) await fn?.(); } };
}

test('monitor preserves partial UTF-8 stdout lines and rate overload eventually stops rather than only suppressing', () => {
  const lines = new MonitorLines();
  assert.deepEqual(lines.push('DONE first\n\npartial 世'), ['DONE first']);
  assert.deepEqual(lines.push('界\nlast'), ['partial 世界']);
  assert.deepEqual(lines.flush(), ['last']);
  const limiter = new MonitorRateLimiter(0);
  for (let i = 0; i < 10; i++) assert.equal(limiter.process(0).kind, 'allowed');
  assert.equal(limiter.process(0).kind, 'suppressed');
  assert.equal(limiter.process(2000).kind, 'allowed');
  let outcome;
  for (let now = 2200; now <= 30400; now += 200) { outcome = limiter.process(now); if (outcome.kind === 'kill') break; }
  assert.equal(outcome.kind, 'kill');
  assert.match(outcome.notice, /Monitor stopped/);
  assert.equal(limiter.process(36000).kind, 'suppressed');
});

test('monitor byte cap and fragmented Unicode retain the original tail and reset contract', () => {
  const fragments = ['x'.repeat(1_048_573), '世界', '\ud83d', '\ude80', '', 'tail\nlast'];
  const lines = new MonitorLines(); let pending = '';
  const truncate = text => {
    const buffer = Buffer.from(text); if (buffer.length <= 500) return text;
    let end = 500; while ((buffer[end] & 0xc0) === 0x80) end--;
    return buffer.subarray(0, end).toString('utf8') + '...(truncated)';
  };
  for (const fragment of fragments) {
    pending += fragment;
    if (Buffer.byteLength(pending) > 1_048_576) pending = Buffer.from(pending).subarray(-1_048_576).toString('utf8');
    const expected = pending.split('\n'); pending = expected.pop();
    assert.deepEqual(lines.push(fragment), expected.map(line => line.trim()).filter(Boolean).map(truncate));
    assert.equal(lines.pending, pending);
  }
  assert.deepEqual(lines.flush(), ['last']);
  for (let index = 0; index < 3000; index++) lines.push('log '.repeat(115));
  assert.equal(Buffer.byteLength(lines.pending), 1_048_576);
  lines.pending = '';
  assert.deepEqual(lines.push('new\n'), ['new']);
  assert.deepEqual(lines.flush(), []);
});

test('cancel after native job registration kills the exact started job even when final tool materialization loses its value', async () => {
  let listener, tool, registeredExec; const killed = [], controller = new AbortController();
  const job = { id: 'bash-exact', owner: 'owner', kind: 'bash', label: 'sleep 30', status: 'running' };
  const ctx = {
    omaaGrokMonitorShell: { run: (_call, next) => next() },
    logger: { warn() {} }, effect() {},
    jobs: { events: { subscribe(_filter, callback) { listener = callback; } }, get() { return job; }, kill(id, owner, reason) { killed.push({ id, owner, reason }); } },
    tools: { register(definition) { tool = definition; }, get(name) { return name === 'bash'; }, async execute(exec) {
      registeredExec = exec;
      listener({ type: 'registered', job });
      controller.abort(new Error('late cancellation'));
      return { isError: true, error: { message: 'ABORTED' } };
    } },
  };
  apply(ctx);
  await assert.rejects(tool.execute({ command: 'sleep 30', description: 'cancel probe', persistent: true, timeout_ms: 36_000_001 }, { agent: { id: 'owner' }, callId: 'outer', token: 'parent-token', signal: controller.signal }), /ABORTED/);
  assert.equal(registeredExec.parent, 'parent-token');
  assert.equal(registeredExec.name, 'bash');
  assert.equal(registeredExec.arguments.run_in_background, true);
  assert.equal(killed.length, 1, 'late abort and failed materialization must not cancel twice');
  assert(killed.every(value => value.id === 'bash-exact' && value.owner === 'owner'));
});

test('monitor timeout zero is persistent and a producer gap severs earlier partial stdout', async t => {
  const f = fixture(); t.after(() => f.close());
  const started = await f.start({ timeout_ms: 0 }); assert.equal(started.timeoutMs, 0); assert.equal(started.persistent, true);
  f.output([{ channel: 'stdout', text: 'BEFORE_PARTIAL' }]);
  f.output([{ channel: 'stdout', text: 'AFTER\n', gapBefore: true }, { channel: 'stderr', text: 'HIDDEN_STDERR\n' }]);
  f.finish();
  const text = f.messages.map(row => row.content[0].text).join('\n');
  assert.match(text, /Monitor output gap/); assert.match(text, /AFTER/);
  assert(!text.includes('BEFORE_PARTIAL')); assert(!text.includes('HIDDEN_STDERR'));
  assert.match(text, /description="watch 'own' state"/);
});

test('monitor complete batches include gap and truncation notices inside the UTF-8 body budget', async t => {
  const f = fixture(); t.after(() => f.close()); await f.start({ persistent: true });
  f.output([{ channel: 'stdout', text: ('世界'.repeat(800) + '\n').repeat(20), gapBefore: true }]); f.finish();
  assert.equal(f.messages.length, 1);
  const body = f.messages[0].content[0].text.split('\n').slice(1, -1).join('\n');
  assert(Buffer.byteLength(body.replace(/\n\.\.\.\(truncated\)$/, '')) <= 3000); assert.match(body, /Monitor output gap/); assert.match(body, /truncated/); assert(!body.includes('\ufffd'));
});

test('notice transport failure stops exactly the owned native job', async t => {
  const f = fixture({ failNotice: true }); t.after(() => f.close()); await f.start({ persistent: true });
  f.output([{ channel: 'stdout', text: 'one event\n' }]); await delay(250);
  assert.equal(f.killed.length, 1); assert.equal(f.killed[0].id, 'owned-job'); assert.equal(f.killed[0].owner, 'owner');
});

test('foreign native job identity is refused without canceling that other owner', async t => {
  const f = fixture({ foreign: true }); t.after(() => f.close());
  await assert.rejects(f.start({ persistent: true }), /identity did not match/); assert.deepEqual(f.killed, []);
});
