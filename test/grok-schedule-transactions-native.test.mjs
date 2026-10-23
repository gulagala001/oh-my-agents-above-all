import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { grokUpdatedTarget } from '../src/host/grok-schedule-transaction.mjs';
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');

test('Grok interval updates retain the source anchor and defer an already-due target', () => {
  const anchor = '2027-01-01T00:00:00.000Z', now = Date.parse(anchor) + 90_000;
  assert.equal(grokUpdatedTarget(anchor, 120, now), '2027-01-01T00:02:00.000Z');
  assert.equal(grokUpdatedTarget(anchor, 60, now), '2027-01-01T00:02:30.000Z');
  assert.throws(() => grokUpdatedTarget(anchor, Number.MAX_SAFE_INTEGER, now));
});

test('Grok native cadence, expiry, concurrent edits, cancellation and cold receipts remain connected', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['grok'] });
  await f.install();
  const clockFile = join(f.root, 'clock.txt'); await writeFile(clockFile, '2027-01-01T00:00:00.000Z');
  const clockPlugin = join(f.root, 'schedule-clock.mjs'), transactionPlugin = join(f.root, 'transactions.mjs');
  await writeFile(clockPlugin, await readFile(new URL('./fixtures/schedule-clock.mjs', import.meta.url)));
  await writeFile(transactionPlugin, await readFile(new URL('./fixtures/grok-schedule-transactions.mjs', import.meta.url)));
  const patchPath = join(f.home, 'profiles/omaa-fixture/cordis.patch.yml');
  await writeFile(patchPath, JSON.stringify([{ insert: [
    { id: 'owned-clock', name: pathToFileURL(clockPlugin).href, config: { workspace: f.workspace, clockFile } },
    { id: 'owned-transactions', name: pathToFileURL(transactionPlugin).href, config: { workspace: f.workspace,
      transactionModule: new URL('../src/host/grok-schedule-transaction.mjs', import.meta.url).href,
      recordsModule: new URL('../src/host/grok-schedule-records.mjs', import.meta.url).href } },
  ] }]));
  await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-grok' });
  let action; const children = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Owned schedule fixture');
    if (request.messages.some(row => row.role === 'system' && textOf(row).includes('You are a Grok Build subagent'))) {
      children.push(request.messages.filter(row => row.role === 'user').map(textOf).join('\n'));
      return textReply('GROK_TRANSACTION_CHILD_COMPLETED');
    }
    const next = action; action = undefined;
    return next ? toolReply(next.name, next.args) : textReply('Management complete');
  });
  const call = async (name, args, allowError = false) => {
    await until(async () => !(await f.api(sessionId)).value.running);
    action = { name, args };
    const page = await f.prompt(sessionId, 'Explicitly perform this Grok schedule management action.');
    assert.equal(action, undefined);
    const result = page.records.findLast(row => row.event?.type === 'tool/result')?.event.data.message;
    assert(result); if (!allowError) assert(!result.isError, textOf(result));
    return result.isError ? { error: textOf(result) } : JSON.parse(textOf(result));
  };
  const post = async (path, body) => {
    const response = await fetch(f.origin + path, { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, ...body }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
  };
  const owner = id => post('/omaa-fixture/grok-transaction', { action: 'owner', id });
  const catalog = async id => (await f.call('schedule/catalog', {})).find(row => row.id === id && row.sessionId === sessionId);
  const advance = at => post('/omaa-fixture/schedule-clock', { at });
  const created = await call('scheduler_create', { interval: '2m', prompt: 'GROK_TRANSACTION_TASK_ORIGINAL' });
  const id = created.id, original = await catalog(id), initialOwner = await owner(id);
  const changed = await call('scheduler_create', { task_id: id, interval: '3m', prompt: 'GROK_TRANSACTION_TASK_REVISED' });
  assert.equal(changed.updated, true); assert.equal(changed.id, id);
  const revised = await catalog(id);
  assert.equal(Date.parse(revised.scheduledAt) - Date.parse(original.scheduledAt), 60000);
  assert.equal((await owner(id)).expiresAt, initialOwner.expiresAt);
  await f.stop(); await f.boot();
  await call('scheduler_list', {});
  assert.equal((await catalog(id)).scheduledAt, revised.scheduledAt);
  await advance(new Date(Date.parse(revised.scheduledAt) + 1000).toISOString());
  await until(() => children.length === 1);
  const first = await until(async () => { const row = await owner(id); return row.occurrences.at(-1)?.state === 'COMPLETED' && row; });
  assert(children[0].includes('GROK_TRANSACTION_TASK_REVISED'));
  assert.equal(first.occurrences.at(-1).terminalDurable, true);
  const afterFire = await catalog(id);
  await call('scheduler_create', { task_id: id, interval: '2m' });
  const afterCadence = await catalog(id), afterOwner = await owner(id);
  assert.equal(Date.parse(afterCadence.scheduledAt), Date.parse(afterFire.lastDelivery.deliveredAt) + 120000);
  assert.equal(afterOwner.chain.childId, first.chain.childId);
  assert.equal(afterOwner.chain.revision, afterOwner.revision);
  assert.deepEqual(afterCadence.lastDelivery, afterFire.lastDelivery);
  await advance(new Date(Date.parse(afterCadence.scheduledAt) + 1000).toISOString());
  await until(() => children.length === 2);
  const second = await until(async () => { const row = await owner(id); return row.occurrences.length === 2 && row.occurrences.at(-1)?.state === 'COMPLETED' && row; });
  assert.equal(second.occurrences.at(-1).executionMode, 'continuation');
  assert.equal(second.occurrences.at(-1).childId, first.chain.childId);
  await call('scheduler_delete', { id }); assert.equal(await catalog(id), undefined);

  const once = await call('scheduler_create', { interval: '2m', prompt: 'GROK_TRANSACTION_ONCE', recurring: false });
  const onceBefore = await catalog(once.id);
  await call('scheduler_create', { task_id: once.id, interval: '4m' });
  assert.equal(Date.parse((await catalog(once.id)).scheduledAt) - Date.parse(onceBefore.scheduledAt), 120000);
  await call('scheduler_delete', { id: once.id });
  const race = await call('scheduler_create', { interval: '1h', prompt: 'GROK_TRANSACTION_RACE' });
  const conflict = await post('/omaa-fixture/grok-transaction', { action: 'conflict', id: race.id });
  assert.equal(conflict.callbackRan, false); assert.equal(conflict.result.code, 'schedule_conflict');
  assert.equal(conflict.current.prompt, 'EXTERNAL_NATIVE_EDIT');
  const canceled = await post('/omaa-fixture/grok-transaction', { action: 'cancel', id: race.id });
  assert.equal(canceled.callbackRan, false); assert.match(canceled.result.error, /cancellation/);
  await f.call('schedule/delete', { request: { sessionId, id: race.id } });

  const expiring = await call('scheduler_create', { interval: '8d', prompt: 'GROK_TRANSACTION_MUST_EXPIRE' });
  const expiryBefore = await owner(expiring.id);
  await advance(new Date(Date.parse(expiryBefore.expiresAt) + 1000).toISOString());
  await until(async () => !await catalog(expiring.id)).catch(async error => {
    throw Error(error.message + '\n' + JSON.stringify({ owner: await owner(expiring.id), native: await catalog(expiring.id) }));
  });
  const expired = await owner(expiring.id);
  assert.equal(expired.status, 'EXPIRED'); assert.equal(expired.expiryRemoval.state, 'REMOVED');
  assert.equal(expired.expiryRemoval.receipt.deleted, true); assert.equal(expired.occurrences.length, 0);
  await f.stop(); await f.boot();
  await call('scheduler_list', {});
  assert.equal(await catalog(expiring.id), undefined);
  assert.deepEqual((await owner(expiring.id)).expiryRemoval, expired.expiryRemoval);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_GROK_SCHEDULE_EVIDENCE) await writeFile(process.env.OMAA_GROK_SCHEDULE_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), host: f.evidence.version,
    modelRequests: f.requests.length, externalModelCalls: 0, clock: 'controlled Date.now; real native timers, store, inbox, subagent requests and cold restart',
    checks: ['creation and last-fire phase retained', 'changed interval dispatches actual child', 'cadence keeps transcript continuation', 'one-shot interval update', 'same-queue external edit conflict', 'queued cancellation', 'seven-day expiry before eight-day first fire', 'cold retained deletion receipt'],
    original, revised, afterCadence, first: first.occurrences, second: second.occurrences, conflict, canceled, expired }, null, 2));
});

test('changed Grok cadence fires through the real clock and native child', { timeout: 100000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['grok'] });
  await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-grok' });
  let action; const fired = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Real-clock schedule fixture');
    if (request.messages.some(row => row.role === 'system' && textOf(row).includes('You are a Grok Build subagent'))) {
      assert(request.messages.some(row => row.role === 'user' && textOf(row).includes('GROK_REAL_CLOCK_REVISED')));
      fired.push(Date.now()); return textReply('REAL_CLOCK_CHILD_FINISHED');
    }
    const next = action; action = undefined;
    return next ? toolReply(next.name, next.args) : textReply('Real-clock management completed');
  });
  const call = async (name, args) => {
    await until(async () => !(await f.api(sessionId)).value.running);
    action = { name, args };
    const page = await f.prompt(sessionId, 'Perform the explicitly requested Grok schedule mutation.');
    const result = page.records.findLast(row => row.event?.type === 'tool/result')?.event.data.message;
    assert(result && !result.isError, textOf(result)); return JSON.parse(textOf(result));
  };
  const created = await call('scheduler_create', { interval: '2m', prompt: 'GROK_REAL_CLOCK_ORIGINAL' });
  const before = (await f.call('schedule/catalog', {})).find(row => row.id === created.id);
  const updated = await call('scheduler_create', { task_id: created.id, interval: '1m', prompt: 'GROK_REAL_CLOCK_REVISED' });
  assert.equal(updated.id, created.id);
  const after = (await f.call('schedule/catalog', {})).find(row => row.id === created.id);
  assert.equal(Date.parse(after.scheduledAt), Date.parse(before.scheduledAt) - 60000);
  await until(() => fired.length === 1, 75000);
  assert(fired[0] >= Date.parse(after.scheduledAt), 'No early or manually injected dispatch');
  const completed = await until(async () => {
    const list = await call('scheduler_list', {}), row = list.tasks.find(row => row.id === created.id);
    return row?.lastOccurrence?.state === 'COMPLETED' && row.lastOccurrence;
  });
  assert.equal(completed.terminalDurable, true);
  if (process.env.OMAA_GROK_SCHEDULE_EVIDENCE) {
    const file = process.env.OMAA_GROK_SCHEDULE_EVIDENCE, value = JSON.parse(await readFile(file, 'utf8'));
    value.realClock = { before, after, completed, firedAt: new Date(fired[0]).toISOString(), modelRequests: f.requests.length, externalModelCalls: 0 };
    await writeFile(file, JSON.stringify(value, null, 2));
  }
});
