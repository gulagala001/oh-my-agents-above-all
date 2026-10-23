import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createGrokScheduleRecords } from '../src/host/grok-schedule-records.mjs';
import { parseGrokScheduleDue } from '../src/presets/grok/schedule-runtime.mjs';
import { createGrokScheduleExpiry } from '../src/presets/grok/schedule-expiry.mjs';
import { buildPrompt, buildCompactionPrompt } from '../src/presets/grok/prompt.mjs';

const key = id => 'task_' + createHash('sha256').update(id).digest('hex');
const instant = '2030-01-01T00:00:00.000Z';
const owner = (id = 'fixture', sessionId = 'session') => ({ version: 1, id, sessionId, owningPreset: 'omaa-grok',
  marker: '[OMAA GROK DISPATCH fixture]', prompt: 'Owned fixture task', kind: 'every', seconds: 60,
  initialScheduledAt: instant, createdAt: instant, revision: 1, status: 'ACTIVE', policyKey: '{}', occurrences: [] });
async function records(rows = [], beforePut) {
  const values = new Map(rows.map(row => [key(row.id), structuredClone(row)])); let closed = 0;
  const table = { entries: () => values.entries(), get: id => values.get(id), get size() { return values.size; },
    async put(id, value) { await beforePut?.(); values.set(id, value); } };
  const ctx = { storageDomain: { async open() { return { table: () => table, async close() { closed++; } }; } } };
  return { ctx, values, store: await createGrokScheduleRecords(ctx), get closed() { return closed; } };
}
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(2); }
  assert.fail('Owned offline callback did not settle');
};

test('Grok main/child prompts retain native tools and decline unregistered capabilities', () => {
  const tools = new Set(['read', 'bash', 'monitor', 'job_output', 'todo_write', 'subagent', 'interrupt_agent']);
  const main = buildPrompt({ tools, cwd: '/owned/fixture', platform: 'linux' });
  const child = buildPrompt({ tools, child: true, cwd: '/owned/fixture', platform: 'linux' });
  assert.match(main, /Grok Build/); assert.match(main, /Every call replaces the entire current list/);
  assert.match(main, /Set `wait: true` to wait/); assert.match(main, /distinct from background job ids/);
  assert.match(child, /^You are a Grok Build subagent/); assert(!child.includes('background: true'));
  assert(!main.includes('${%') && !main.includes('${{'));
  assert(!buildPrompt({ tools: new Set(['read']) }).includes('Use `monitor`'));
});

test('Grok compaction recognizes native checkpoint and retained-conversation framing', () => {
  const prompt = buildCompactionPrompt();
  assert.match(prompt, /compacted-summary/); assert.match(prompt, /automatically generated checkpoint/);
  assert.match(prompt, /retained conversation/); assert(!prompt.includes('{user_context_section}'));
});

test('due decoding requires native attribution and canonical fixed framing', () => {
  const row = { schedule_id: 'fixture', occurrence_at: instant, reminder_prompt: 'owned marker' };
  const content = '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\nschedule_id_json: "fixture"\noccurrence_at: ' + instant + '\nreminder_prompt_json: "owned marker"';
  const message = { source: { kind: 'schedule' }, content: [{ type: 'text', text: content }] };
  assert.deepEqual(parseGrokScheduleDue(message), [row]);
  assert.equal(parseGrokScheduleDue({ ...message, source: { kind: 'user' } }), undefined);
  assert.equal(parseGrokScheduleDue({ ...message, content: [{ type: 'text', text: content.replace('"fixture"', ' "fixture"') }] }), undefined);
  assert.equal(parseGrokScheduleDue({ ...message, content: [...message.content, { type: 'text', text: 'extra' }] }), undefined);
});

test('due batch parsing enforces canonical JSON and its physical frame budget', () => {
  const rows = [{ schedule_id: 'fixture', occurrence_at: instant, reminder_prompt: 'owned marker' }];
  const prefix = '[SCHEDULE REMINDER BATCH]\nThis is a scheduled message from the user\nreminders_json: ';
  const message = text => ({ source: { kind: 'schedule' }, content: [{ type: 'text', text }] });
  assert.deepEqual(parseGrokScheduleDue(message(prefix + JSON.stringify(rows))), rows);
  assert.equal(parseGrokScheduleDue(message(prefix + JSON.stringify(rows, null, 1))), undefined);
  rows[0].reminder_prompt = 'x'.repeat(512 * 1024);
  assert.equal(parseGrokScheduleDue(message(prefix + JSON.stringify(rows))), undefined);
});

test('owner records remain immutable and survive a domain reopen without mutating callers', async () => {
  const f = await records(), original = owner(); await f.store.put(original); original.prompt = 'caller changed';
  assert.equal(f.store.get('fixture').prompt, 'Owned fixture task');
  assert.throws(() => { f.store.get('fixture').occurrences.push({}); }, TypeError);
  await f.store.close();
  const cold = await createGrokScheduleRecords(f.ctx); assert.equal(cold.get('fixture').sessionId, 'session'); await cold.close();
});

test('owner storage serializes the last capacity slot across independent sessions', async () => {
  const f = await records(Array.from({ length: 1023 }, (_, i) => owner('existing-' + i)));
  const result = await Promise.allSettled([f.store.put(owner('last-a', 'a')), f.store.put(owner('last-b', 'b'))]);
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1); assert.equal(f.store.size, 1024);
  assert.match(result.find(row => row.status === 'rejected').reason.message, /storage is full/); await f.store.close();
});

test('closing owner storage joins accepted writes and refuses later admissions', async () => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const f = await records([], async () => { entered.resolve(); await release.promise; });
  const write = f.store.put(owner('accepted')); await entered.promise; const closing = f.store.close();
  await assert.rejects(f.store.put(owner('late')), /storage is closing/); assert.equal(f.closed, 0);
  release.resolve(); await write; await closing; assert.equal(f.closed, 1); assert(f.values.has(key('accepted')));
});

test('record decoding rejects oversized history, mixed provenance and unproven expiry outcomes', async () => {
  const f = await records();
  const occurrence = { occurrenceAt: instant, revision: 1, runtimeId: 'runtime', state: 'COMPLETED',
    sourceKind: 'schedule', sourceMessageId: 'message', startedAt: instant };
  await assert.rejects(async () => f.store.put({ ...owner(), occurrences: Array.from({ length: 65 }, () => occurrence) }));
  await assert.rejects(async () => f.store.put({ ...owner(), occurrences: [{ ...occurrence, sourceCallId: 'not-a-schedule-message' }] }));
  const expired = { ...owner(), status: 'EXPIRED', expiresAt: instant,
    expiryRemoval: { state: 'REMOVED', id: 'fixture', expiresAt: instant, ownerRevision: 1, observedAt: instant } };
  await assert.rejects(async () => f.store.put(expired));
  await f.store.put({ ...expired, expiryRemoval: { ...expired.expiryRemoval, receipt: { id: 'fixture', deleted: true } } });
  assert.equal(f.store.get('fixture').expiryRemoval.state, 'REMOVED'); await f.store.close();
});

test('expiry wake-up does not busy-retry an unknown outcome and only a new notification re-arms', async () => {
  let attempts = 0;
  const expiresAt = new Date(Date.now() - 1000).toISOString();
  const driver = createGrokScheduleExpiry({ logger: { warn() {} } }, {
    list: () => [{ id: 'fixture', expiresAt }],
    async expire() { attempts++; throw Error('unknown native outcome'); },
  });
  await waitFor(() => attempts === 1); await delay(20); assert.equal(attempts, 1);
  driver.notify(); await waitFor(() => attempts === 2); await driver.close(); driver.notify(); await delay(10); assert.equal(attempts, 2);
});

test('expiry close aborts and joins the exact pending owner callback', async () => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let signal;
  const expiresAt = new Date(Date.now() - 1000).toISOString();
  const driver = createGrokScheduleExpiry({}, {
    list: () => [{ id: 'fixture', expiresAt }],
    async expire(_id, current) { signal = current; entered.resolve(); await release.promise; },
  });
  await entered.promise; const closing = driver.close(); assert.equal(signal.aborted, true); release.resolve(); await closing;
});
