import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, MonitorBatch, MonitorLines, MonitorRateLimiter } from '../src/presets/grok/monitor.mjs';

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
  const ctx = {
    logger: { warn() {} }, effect() {},
    jobs: { events: { subscribe(_filter, callback) { listener = callback; } }, kill(id, owner, reason) { killed.push({ id, owner, reason }); } },
    tools: { register(definition) { tool = definition; }, get(name) { return name === 'bash'; }, async execute(exec) {
      registeredExec = exec;
      listener({ type: 'registered', job: { id: 'bash-exact', owner: 'owner', kind: 'bash' } });
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

test('notification batches retain the exact UTF-8 prefix and reset after delivery', () => {
  const truncate = text => {
    const bytes = Buffer.from(text); if (bytes.length <= 3000) return text;
    let end = 3000; while ((bytes[end] & 0xc0) === 0x80) end--;
    return bytes.subarray(0, end).toString('utf8') + '...(truncated)';
  };
  for (const lines of [
    ['first', '世界', '🚀', 'tail'],
    ['x'.repeat(2999), '世界', 'tail'],
    ['x'.repeat(2998), '🚀', 'tail'],
    ['x'.repeat(3000), 'tail'],
    ['\ud800', ...Array(100).fill('中文🙂'.repeat(70))],
  ]) {
    const batch = new MonitorBatch(); batch.push([]);
    for (let i = 0; i < lines.length; i++) batch.push([lines[i]]);
    assert.ok(batch.length <= 3014); assert.equal(batch.flush(), truncate(lines.join('\n')));
    assert.equal(batch.length, 0); assert.equal(batch.flush(), '');
    batch.push(['new']); assert.equal(batch.flush(), 'new');
  }
});

test('stopping a monitor releases queued notice and partial line without changing the output cursor', async t => {
  let tool, listener, batch, lines, reads = 0; const notices = [], killed = [];
  const pushBatch = MonitorBatch.prototype.push, pushLines = MonitorLines.prototype.push;
  t.mock.method(MonitorBatch.prototype, 'push', function (values) { batch = this; return pushBatch.call(this, values); });
  t.mock.method(MonitorLines.prototype, 'push', function (text) { lines = this; return pushLines.call(this, text); });
  const agent = { id: 'owner', status: 'idle', followup: message => notices.push(message) };
  const ctx = {
    logger: { warn() {} }, effect() {},
    jobs: {
      events: { subscribe(_filter, callback) { listener = callback; } },
      kill(...args) { killed.push(args); },
      readAt(_id, offset) { reads++; assert.equal(offset, reads === 1 ? 0 : 12); return reads === 1
        ? { next: 12, chunks: [{ channel: 'stdout', text: 'notice\npartial' }], lossy: false }
        : { next: 12, chunks: [], lossy: false }; },
    },
    tools: { register(value) { tool = value; }, get() { return true; }, async execute() {
      listener({ type: 'registered', job: { id: 'watch', owner: agent.id, kind: 'bash' } });
      return { isError: false, value: { kind: 'background', jobId: 'watch' } };
    } },
  };
  apply(ctx);
  await tool.execute({ command: 'synthetic', description: 'release', persistent: true }, { agent, callId: 'call', signal: new AbortController().signal });
  assert.ok(batch.length); assert.equal(lines.pending, 'partial');
  listener({ type: 'stopping', job: { id: 'watch' } });
  assert.equal(batch.length, 0); assert.equal(lines.pending, '');
  listener({ type: 'output', id: 'watch' });
  listener({ type: 'settled', job: { id: 'watch', status: 'killed' } });
  assert.equal(reads, 1); assert.deepEqual(notices, []); assert.deepEqual(killed, []);
});
