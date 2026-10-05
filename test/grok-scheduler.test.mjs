import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, parseInterval } from '../src/presets/grok/scheduler.mjs';

test('Grok intervals retain their real minimum, reject malformed/overflow values and serialize the task cap', async () => {
  assert.equal(parseInterval(' 1s '), 60); assert.equal(parseInterval('2h'), 7200);
  for (const value of ['0m', '1.5m', '5M', '9223372036854775808d']) assert.throws(() => parseInterval(value));
  const tasks = Array.from({ length: 49 }, (_, index) => ({ id: String(index) })), registered = new Map();
  const ctx = { inject(_services, mount) { return mount(this); }, tools: { register(tool) { registered.set(tool.name, tool); } }, schedule: {
    async list() { return [...tasks]; }, async create(_id, args) { await Promise.resolve(); const task = { id: 'last', kind: 'every', everySeconds: args.every_seconds }; tasks.push(task); return task; },
  } };
  apply(ctx);
  const exec = { agent: { session: { id: 'session', header: {} } }, signal: new AbortController().signal };
  const outcomes = await Promise.allSettled([1, 2].map(() => registered.get('scheduler_create').execute({ interval: '1m', prompt: 'Cap boundary' }, exec)));
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(outcome => outcome.status === 'rejected').reason.message, /Maximum 50/);
  assert.equal(tasks.length, 50);
});
