import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, MonitorLines, MonitorRateLimiter } from '../src/presets/grok/monitor.mjs';

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
