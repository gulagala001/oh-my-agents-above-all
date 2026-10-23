import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
async function harness(t, start) {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['zcode'], sessionSandboxMode: 'danger-full-access' });
  await f.install();
  const clockFile = start ? join(f.root, 'clock.txt') : undefined;
  if (clockFile) await writeFile(clockFile, start);
  const path = join(f.home, 'profiles/omaa-fixture/cordis.patch.yml');
  const patch = JSON.parse(await readFile(path, 'utf8'));
  const clockPlugin = join(f.root, 'schedule-clock.mjs');
  await writeFile(clockPlugin, await readFile(new URL('./fixtures/schedule-clock.mjs', import.meta.url)));
  patch.push({ insert: [{ id: 'owned-schedule-clock', name: pathToFileURL(clockPlugin).href,
    config: { clockFile, workspace: f.workspace } }] });
  await writeFile(path, JSON.stringify(patch)); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  let next;
  const delivered = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Owned calendar test');
    const last = request.messages.filter(row => row.role === 'user').map(textOf).at(-1);
    if (last?.startsWith('CALENDAR_TASK_')) { delivered.push(last); return textReply('Actual native scheduled turn received: ' + last); }
    const action = next; next = undefined;
    return action ? toolReply(action.name, action.args) : textReply('MANAGEMENT_COMPLETE');
  });
  const call = async (name, args, allowError = false) => {
    next = { name, args };
    const page = await f.prompt(sessionId, 'Explicitly perform the requested schedule management action.', { timeout: 30000 });
    assert.equal(next, undefined);
    const result = page.records.findLast(row => row.event?.type === 'tool/result')?.event.data.message;
    assert(result, 'tool result must be present');
    if (!allowError) assert(!result.isError, textOf(result));
    if (result.isError) return { error: textOf(result) };
    return JSON.parse(textOf(result));
  };
  const list = async () => { const result = await call('cron_list', { limit: 50 }); return result; };
  const advance = async at => {
    const response = await fetch(f.origin + '/omaa-fixture/schedule-clock', { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, at }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value));
  };
  const settled = async () => until(async () => {
    const snap = await f.snapshot(sessionId);
    return snap.records.findLast(row => row.event?.type === 'turn/start' || row.event?.type === 'turn/end')?.event.type === 'turn/end';
  });
  return { f, sessionId, call, list, advance, delivered, settled };
}

test('native calendar updates preserve identity, deliver across spring DST, close and reopen budgets, then cold resume', { timeout: 120000 }, async t => {
  const h = await harness(t, '2027-03-13T06:00:00.000Z');
  const { f, call, advance, delivered, sessionId, settled } = h;
  const created = await call('cron_create', { title: 'Daily at 02:30 New York', prompt: 'CALENDAR_TASK_ORIGINAL', cron: '30 2 * * *', time_zone: 'America/New_York', intervalUnit: 'daily', interval: 1 });
  assert.equal(created.ok, true); const id = created.automation.id;
  assert.equal(created.automation.currentOccurrenceAt, '2027-03-13T07:30:00.000Z');
  const anchor = created.automation.definition.rule.anchorAt;
  const updated = await call('cron_update', { id, title: 'Daily 02:30 revised; two times', prompt: 'CALENDAR_TASK_REVISED', recurring: false, maxRuns: 2 });
  assert.equal(updated.ok, true); assert.equal(updated.automation.definition.rule.anchorAt, anchor);
  assert.equal(updated.automation.id, id);
  await advance('2027-03-13T07:30:01.000Z'); await until(() => delivered.length === 1); await settled();
  const first = await call('cron_update', { id, title: 'Daily 02:30 retained; two times' });
  assert.equal(first.automation.confirmedDispatches, 1);
  assert.equal(first.automation.currentOccurrenceAt, '2027-03-14T07:30:00.000Z', '02:30 gap uses source-compatible 03:30');
  await f.stop(); await f.boot();
  await call('cron_list', {}); // activate and recover the exact native session
  await advance('2027-03-14T07:30:01.000Z'); await until(() => delivered.length === 2); await settled();
  const closed = await call('cron_update', { id, title: 'Completed two scheduled deliveries' });
  assert.equal(closed.automation.status, 'CLOSED'); assert.equal(closed.automation.confirmedDispatches, 2);
  const reopened = await call('cron_update', { id, title: 'Daily 04:15, four total deliveries', prompt: 'CALENDAR_TASK_NEW_RULE', cron: '15 4 * * *', time_zone: 'America/New_York', recurring: false, maxRuns: 4 });
  assert.equal(reopened.automation.status, 'ACTIVE'); assert.equal(reopened.automation.confirmedDispatches, 2);
  assert.equal(reopened.automation.currentOccurrenceAt, '2027-03-14T08:15:00.000Z');
  await advance('2027-03-14T08:15:01.000Z'); await until(() => delivered.length === 3); await settled();
  const unlimited = await call('cron_update', { id, title: 'Every three hours at :15', intervalUnit: 'hourly', interval: 3, cron: '15 * * * *', time_zone: 'America/New_York', recurring: true });
  assert.equal(unlimited.automation.recurring, true); assert.equal(unlimited.automation.maxRuns, undefined);
  assert.equal(unlimited.automation.confirmedDispatches, 3);
  await call('cron_delete', { id });
  assert.deepEqual(delivered, ['CALENDAR_TASK_REVISED', 'CALENDAR_TASK_REVISED', 'CALENDAR_TASK_NEW_RULE']);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_CALENDAR_EVIDENCE) await writeFile(process.env.OMAA_CALENDAR_EVIDENCE, JSON.stringify({ host: f.evidence.version,
    clock: 'isolated controlled Date.now; actual native Schedule, persistence, inbox, model request and restart', externalModelCalls: 0,
    checks: ['spring DST gap actual dispatch', 'stable logical id', 'content preserves anchor', 'finite close/reopen and unchanged count', 'ordinary cron and interval replacement', 'cold resume'], delivered }, null, 2));
});

test('native finite calendar edits keep counts and history, migrate to interval, and dispatch through autumn DST', { timeout: 120000 }, async t => {
  const { f, call, advance, delivered, settled } = await harness(t, '2027-11-06T04:00:00.000Z');
  const created = await call('cron_create', { title: 'Two daily calendar deliveries', prompt: 'CALENDAR_TASK_FINITE_OLD', cron: '30 1 * * *', time_zone: 'America/New_York', recurring: false, maxRuns: 2 });
  const id = created.automation.id;
  await advance('2027-11-06T05:30:01.000Z'); await until(() => delivered.length === 1); await settled();
  const modified = await call('cron_update', { id, title: 'Three at 01:45', prompt: 'CALENDAR_TASK_FINITE_NEW', cron: '45 1 * * *', time_zone: 'America/New_York', recurring: false, maxRuns: 3 });
  assert.equal(modified.ok, true); assert.equal(modified.automation.finite.confirmedDispatches, 1);
  await advance('2027-11-06T05:45:01.000Z'); await until(() => delivered.length === 2); await settled();
  const reduced = await call('cron_update', { id, title: 'Already completed', recurring: false, maxRuns: 1 });
  assert.equal(reduced.automation.finite.status, 'CLOSED'); assert.equal(reduced.automation.finite.confirmedDispatches, 2);
  const expanded = await call('cron_update', { id, title: 'Four total', recurring: false, maxRuns: 4 });
  assert.equal(expanded.automation.finite.status, 'ACTIVE');
  await f.stop(); await f.boot(); await call('cron_list', {});
  const migrated = await call('cron_update', { id, title: 'Daily at 01:30 indefinitely', prompt: 'CALENDAR_TASK_FOLD', cron: '30 1 * * *', time_zone: 'America/New_York', intervalUnit: 'daily', interval: 1, recurring: true });
  assert.equal(migrated.ok, true); assert.equal(migrated.automation.id, id); assert.equal(migrated.automation.confirmedDispatches, 2);
  assert.equal(migrated.automation.currentOccurrenceAt, '2027-11-07T05:30:00.000Z', 'fold chooses first 01:30');
  await advance('2027-11-07T05:30:01.000Z'); await until(() => delivered.length === 3); await settled();
  const checked = await call('cron_update', { id, title: 'Daily next local day' });
  assert.equal(checked.automation.currentOccurrenceAt, '2027-11-08T06:30:00.000Z', 'fold does not dispatch twice');
  await advance('2027-11-07T06:30:01.000Z'); await call('cron_list', {});
  assert.equal(delivered.length, 3);
  await call('cron_delete', { id });
  const once = await call('cron_create', { title: 'Legacy one-shot', prompt: 'Original one-shot body', delayMinutes: 1 });
  const onceId = once.automation.id;
  await advance('2027-11-07T06:31:05.000Z');
  await until(async () => (await f.call('schedule/catalog', {})).find(row => row.id === onceId)?.status === 'inactive'); await settled();
  const renamed = await call('cron_update', { id: onceId, title: 'Completed one-shot renamed', prompt: 'Revised future instruction' });
  assert.equal(renamed.automation.status, 'CLOSED'); assert.equal(renamed.automation.confirmedDispatches, 1);
  const restored = await call('cron_update', { id: onceId, title: 'Now daily', cron: '0 9 * * *', time_zone: 'America/New_York', recurring: true });
  assert.equal(restored.automation.status, 'ACTIVE'); assert.equal(restored.automation.confirmedDispatches, 1);
  await call('cron_delete', { id: onceId }); assert.deepEqual(f.errors, []);
});

test('an ordinary native minute schedule adopts a finite definition and delivers on the actual clock', { timeout: 100000 }, async t => {
  const { f, call, delivered, settled, sessionId } = await harness(t);
  const started = Date.now();
  const created = await call('cron_create', { title: 'Every minute', prompt: 'CALENDAR_TASK_NATIVE_OLD',
    intervalUnit: 'minute', interval: 1, cron: '* * * * *', time_zone: 'UTC' });
  const id = created.automation.id, at = created.automation.schedule.scheduledAt;
  const changed = await call('cron_update', { id, title: 'Only one actual minute delivery', prompt: 'CALENDAR_TASK_REAL_CLOCK', recurring: false, maxRuns: 1 });
  assert.equal(changed.ok, true); assert.equal(changed.automation.id, id);
  assert.equal(changed.automation.currentOccurrenceAt, at); assert.equal(changed.automation.confirmedDispatches, 0);
  await until(() => delivered.length === 1, 75000); await settled();
  assert(Date.now() - started >= 59000, 'the actual 60-second native timer must elapse');
  const completed = await call('cron_update', { id, title: 'One actual dispatch completed' });
  assert.equal(completed.automation.status, 'CLOSED'); assert.equal(completed.automation.confirmedDispatches, 1);
  assert.deepEqual(delivered, ['CALENDAR_TASK_REAL_CLOCK']);
  assert.equal((await f.call('schedule/catalog', {})).filter(row => row.sessionId === sessionId && row.status === 'active').length, 0);
  await call('cron_delete', { id }); assert.deepEqual(f.errors, []);
  if (process.env.OMAA_CALENDAR_EVIDENCE) {
    const path = process.env.OMAA_CALENDAR_EVIDENCE, evidence = JSON.parse(await readFile(path, 'utf8'));
    evidence.actualClock = { elapsedMs: Date.now() - started, nativeIdPreserved: true, count: 1, closed: true, delivered };
    evidence.checks.push('autumn DST fold actual dispatch without duplicate', 'finite prompt/rule/budget edits and interval migration', 'actual wall-clock minute timer and finite closure');
    await writeFile(path, JSON.stringify(evidence, null, 2));
  }
});
