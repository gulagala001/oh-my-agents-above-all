import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const toolValue = (payload, name) => {
  const ids = new Set(payload.messages.flatMap(message => message.tool_calls ?? []).filter(call => call.function?.name === name).map(call => call.id));
  const message = payload.messages.findLast(message => message.role === 'tool' && ids.has(message.tool_call_id));
  if (!message) return undefined;
  try { return JSON.parse(text(message)); } catch { return undefined; }
};

test('installed Grok interval scheduler persists native schedules, preserves prompt-update phase and actually fires', { timeout: 180000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const optional = (await f.call('pluginManager/listBundles', {})).find(bundle => bundle.name === '@deepseek-ai/dsh-experimental-schedule-bundle');
  const switches = [];
  if (optional && !optional.enabled) {
    const off = await f.create('omaa-grok'), start = f.requests.length;
    f.replyWith(() => textReply('Native schedule remains disabled.'));
    await f.prompt(off.sessionId, 'NATIVE_SCHEDULE_OFF');
    assert(f.requests.slice(start).filter(request => request.tools?.length).every(request => !request.tools.some(tool => tool.function.name.startsWith('scheduler_'))));
    const enabled = await f.call('pluginManager/setBundleEnabled', { name: optional.name, enabled: true });
    assert(['applied', 'restart-required'].includes(enabled.application), JSON.stringify(enabled));
    switches.push({ action: 'enable', result: enabled });
    if (enabled.application === 'restart-required') { await f.stop(); await f.boot(); }
  }
  const session = await f.create('omaa-grok');
  const catalog = async () => (await f.call('schedule/catalog', {})).filter(task => task.sessionId === session.sessionId);
  const invoke = async (name, args, marker) => {
    let phase = 0; const from = f.requests.length;
    f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply(name, args) : textReply('Native scheduler operation settled.'));
    const snapshot = await f.prompt(session.sessionId, marker);
    await until(async () => !(await f.api(session.sessionId)).value.running);
    return { snapshot, requests: f.requests.slice(from), value: f.requests.slice(from).map(payload => toolValue(payload, name)).findLast(Boolean) };
  };
  const created = await invoke('scheduler_create', { interval: '1s', prompt: 'SCHEDULER_ACTUAL_FIRE: write scheduled-native.txt with NATIVE_SCHEDULE_SENTINEL.' }, 'SCHEDULER_CREATE_REAL');
  await mkdir('work/rea-upgrade/grok-scheduler', { recursive: true });
  await writeFile(`work/rea-upgrade/grok-scheduler/${f.evidence.version}-first-native.json`, JSON.stringify({
    host: f.evidence.version, value: created.value,
    tools: created.requests.filter(request => request.tools?.length).map(request => request.tools.map(tool => tool.function.name)),
    events: created.snapshot.records.filter(row => ['tool/call', 'tool/result'].includes(row.event?.type)),
  }, null, 2) + '\n');
  assert(created.value?.id); const id = created.value.id;
  const first = (await catalog()).find(task => task.id === id);
  assert.equal(first.kind, 'every'); assert.equal(first.everySeconds, 60);
  assert.equal(created.value.humanSchedule, 'every 1 minute');
  assert(Date.parse(first.scheduledAt) > Date.now() + 50000, 'first scheduled fire must wait for its actual interval');
  const updated = await invoke('scheduler_create', { task_id: id, interval: '60s', prompt: 'SCHEDULER_ACTUAL_FIRE: write scheduled-native.txt with UPDATED_NATIVE_SCHEDULE_SENTINEL.' }, 'SCHEDULER_UPDATE_PROMPT');
  assert.equal(updated.value.id, id); assert.equal(updated.value.updated, true);
  const afterUpdate = (await catalog()).find(task => task.id === id);
  assert.equal(afterUpdate.scheduledAt, first.scheduledAt, 'same interval and prompt update must preserve phase');
  assert(afterUpdate.prompt.includes('UPDATED_NATIVE'));
  const listing = await invoke('scheduler_list', {}, 'SCHEDULER_LIST_REAL');
  assert(listing.value.tasks.some(task => task.id === id && task.nextFireAt === first.scheduledAt));
  assert(!('createdAt' in listing.value.tasks[0]), 'unavailable creation time must not be invented');

  for (const [args, pattern] of [
    [{ task_id: id, interval: '2m' }, /preserve.*phase/],
    [{ interval: '60s', prompt: 'No immediate approximation', fire_immediately: true }, /fire_immediately.*not supported/],
    [{ interval: '60s', prompt: 'No cross-session approximation', durable: true }, /Cross-session durable/],
    [{ task_id: 'missing-id', prompt: 'Unknown id' }, /No scheduled task/],
  ]) {
    const result = await invoke('scheduler_create', args, 'SCHEDULER_EXPLICIT_REFUSAL');
    assert.match(JSON.stringify(result.snapshot.records.findLast(record => record.event?.type === 'tool/result')?.event.data), pattern);
    assert.equal((await catalog()).filter(task => task.status === 'active').length, 1);
    assert.equal((await catalog()).find(task => task.id === id).scheduledAt, first.scheduledAt);
  }

  // A real child Node test must execute, despite the outer Node test runner.
  await writeFile(join(f.workspace, 'independent.test.mjs'), 'import test from "node:test"; import {writeFileSync} from "node:fs"; test("actually executes",()=>writeFileSync("nested-test-ran.txt","EXECUTED"));');
  const nativeTest = await invoke(process.platform === 'win32' ? 'pwsh' : 'bash', { description: 'Verify isolated child test runner', command: 'node --test independent.test.mjs' }, 'SCHEDULER_NATIVE_CHILD_TEST');
  assert.equal(await readFile(join(f.workspace, 'nested-test-ran.txt'), 'utf8'), 'EXECUTED');
  assert(!JSON.stringify(nativeTest.snapshot.records).includes('recursively calling run'));

  await f.stop(); await f.boot();
  assert.equal((await catalog()).find(task => task.id === id).scheduledAt, first.scheduledAt, 'cold restart retains native schedule identity and target');
  let wrote = false;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    const reminder = payload.messages.findLast(message => message.role === 'user' && text(message).includes('[SCHEDULE REMINDER'));
    if (reminder && !wrote) { wrote = true; return toolReply('write', { file_path: 'scheduled-native.txt', content: 'UPDATED_NATIVE_SCHEDULE_SENTINEL' }); }
    return textReply('Scheduled native task completed.');
  });
  t.diagnostic('Waiting for the real native 60-second first occurrence.');
  await until(async () => { try { return (await readFile(join(f.workspace, 'scheduled-native.txt'), 'utf8')) === 'UPDATED_NATIVE_SCHEDULE_SENTINEL'; } catch { return false; } }, 75000);
  await until(async () => !(await f.api(session.sessionId)).value.running);
  const fired = await f.snapshot(session.sessionId);
  assert(fired.records.some(record => record.event?.type === 'user/message' && record.event.data.source?.kind === 'schedule'));
  assert(Date.parse((await catalog()).find(task => task.id === id).scheduledAt) > Date.parse(first.scheduledAt));
  const removed = await invoke('scheduler_delete', { id }, 'SCHEDULER_DELETE_REAL');
  assert.equal(removed.value.success, true); assert(!(await catalog()).some(task => task.id === id));
  const absent = await invoke('scheduler_delete', { id }, 'SCHEDULER_DELETE_MISSING');
  assert.equal(absent.value.success, false);
  const oneShot = await invoke('scheduler_create', { interval: '60s', prompt: 'One-shot compatibility request', recurring: false }, 'SCHEDULER_ONE_SHOT');
  assert.equal((await catalog()).find(task => task.id === oneShot.value.id).kind, 'after');
  await invoke('scheduler_delete', { id: oneShot.value.id }, 'SCHEDULER_ONE_SHOT_CLEANUP');
  if (optional) {
    const kept = await invoke('scheduler_create', { interval: '1h', prompt: 'Native future record retained across the optional service switch.' }, 'SCHEDULER_SWITCH_RECORD');
    const before = (await catalog()).find(task => task.id === kept.value.id);
    const disabled = await f.call('pluginManager/setBundleEnabled', { name: optional.name, enabled: false });
    assert(['applied', 'restart-required'].includes(disabled.application), JSON.stringify(disabled));
    switches.push({ action: 'disable', result: disabled });
    if (disabled.application === 'restart-required') { await f.stop(); await f.boot(); }
    const start = f.requests.length; f.replyWith(() => textReply('Native schedule is off again.'));
    await f.prompt(session.sessionId, 'SCHEDULER_SWITCH_OFF');
    assert(f.requests.slice(start).filter(request => request.tools?.length).every(request => !request.tools.some(tool => tool.function.name.startsWith('scheduler_'))));
    const enabled = await f.call('pluginManager/setBundleEnabled', { name: optional.name, enabled: true });
    assert(['applied', 'restart-required'].includes(enabled.application), JSON.stringify(enabled));
    switches.push({ action: 'reenable', result: enabled });
    if (enabled.application === 'restart-required') { await f.stop(); await f.boot(); }
    assert.equal((await catalog()).find(task => task.id === kept.value.id).scheduledAt, before.scheduledAt);
    await invoke('scheduler_delete', { id: kept.value.id }, 'SCHEDULER_SWITCH_CLEANUP');
  }
  f.replyWith();
  const pi = await f.create('omaa-pi'), piFrom = f.requests.length;
  await f.prompt(pi.sessionId, 'PI_NO_SCHEDULER_SCOPE');
  assert(f.requests.slice(piFrom).every(payload => !payload.tools?.some(tool => tool.function?.name.startsWith('scheduler_'))));
  assert.deepEqual(f.errors, []);
  await writeFile(`work/rea-upgrade/grok-scheduler/${f.evidence.version}-verified.json`, JSON.stringify({ host: f.evidence.version,
    optionalBundle: optional?.name, switches, realFirstOccurrence: true, coldIdentityPreserved: true,
    limits: 'Real native 60-second first occurrence with isolated local provider; no original Grok scheduler or real accounts.' }, null, 2) + '\n');
});
