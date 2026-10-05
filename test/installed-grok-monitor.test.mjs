import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const toolValue = (payload, name) => {
  const ids = new Set(payload.messages.flatMap(message => message.tool_calls ?? []).filter(call => call.function?.name === name).map(call => call.id));
  const message = payload.messages.findLast(message => message.role === 'tool' && (message.name === name || ids.has(message.tool_call_id)));
  if (!message) return undefined;
  try { return JSON.parse(text(message)); } catch { return undefined; }
};
const events = snapshot => snapshot.records.map(record => record.event).filter(Boolean);

test('installed Grok monitor uses native guarded jobs, emits stdout events and stops its actual process', { timeout: 180000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const session = await f.create('omaa-grok');
  let phase = 0, id;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    id ??= toolValue(payload, 'monitor')?.taskId;
    if (phase++ === 0) return toolReply('monitor', { command: 'printf "DONE first\\n"; sleep 0.7; printf "FAILED second\\n"; sleep 0.4; printf "DONE partial"', description: 'watch "local"\nstate', persistent: true });
    return textReply('Monitor event observed.');
  });
  const from = f.requests.length;
  await f.prompt(session.sessionId, 'GROK_MONITOR_REAL_EVENTS');
  await until(async () => {
    const snapshot = await f.snapshot(session.sessionId);
    return events(snapshot).filter(event => event.type === 'user/message').some(event => JSON.stringify(event.data).includes('DONE partial'));
  });
  await until(async () => !(await f.api(session.sessionId)).value.running);
  assert(id, 'native monitored job id was not returned');
  const snapshot = await f.snapshot(session.sessionId), notices = events(snapshot).filter(event => event.type === 'user/message').map(event => event.data.message ?? event.data);
  const monitorText = notices.map(message => JSON.stringify(message)).filter(value => value.includes('<monitor-event'));
  assert.equal(monitorText.filter(value => value.includes('DONE first')).length, 1);
  assert.equal(monitorText.filter(value => value.includes('FAILED second')).length, 1);
  assert.equal(monitorText.filter(value => value.includes('DONE partial')).length, 1);
  assert(monitorText.every(value => !value.includes('\\nstate\\" task_id')), 'description newlines must not break the XML attribute');
  const actual = f.requests.slice(from).find(payload => payload.tools?.some(tool => tool.function?.name === 'monitor'));
  assert(actual && JSON.stringify(actual.messages).includes('Use `monitor` for watch processes'));
  assert(f.requests.slice(from).some(payload => JSON.stringify(payload.messages).includes('<monitor-event')));

  // Monitoring reads absolute offsets; the native model cursor still sees all output.
  phase = 0; const outputFrom = f.requests.length;
  f.replyWith(payload => phase++ === 0 ? toolReply('job_output', { job_id: id }) : textReply('Native monitor output collected.'));
  await f.prompt(session.sessionId, 'GROK_MONITOR_NATIVE_OUTPUT');
  assert(f.requests.slice(outputFrom).some(payload => payload.messages.some(message => message.role === 'tool' && text(message).includes('DONE first') && text(message).includes('FAILED second'))));

  phase = 0; let cancelledId;
  f.replyWith(payload => {
    if (phase++ === 0) return toolReply('monitor', { command: 'sleep 1; printf late > should-not-exist.txt', description: 'Explicitly stopped monitor', timeout_ms: 0 });
    if (phase === 2) { const value = toolValue(payload, 'monitor'); cancelledId = value?.taskId; assert(cancelledId); assert.equal(value.timeoutMs, 0); assert.equal(value.persistent, false); return toolReply('job_kill', { job_id: cancelledId }); }
    return textReply('Native monitor process stopped.');
  });
  await f.prompt(session.sessionId, 'GROK_MONITOR_EXPLICIT_STOP');
  await delay(1200);
  await assert.rejects(access(join(f.workspace, 'should-not-exist.txt')), { code: 'ENOENT' });
  phase = 0; const stoppedFrom = f.requests.length;
  f.replyWith(payload => phase++ === 0 ? toolReply('job_list', {}) : textReply('Killed process state checked.'));
  await f.prompt(session.sessionId, 'GROK_MONITOR_STOPPED_STATE');
  assert(f.requests.slice(stoppedFrom).some(payload => payload.messages.some(message => message.role === 'tool' && text(message).includes(cancelledId + ' [bash] killed'))));

  phase = 0;
  f.replyWith(payload => phase++ === 0 ? toolReply('monitor', { command: 'sleep 2; printf late > deadline-missed.txt', description: 'Deadline monitor', timeout_ms: 100 }) : textReply('Deadline event handled.'));
  await f.prompt(session.sessionId, 'GROK_MONITOR_DEADLINE');
  await until(async () => events(await f.snapshot(session.sessionId)).some(event => event.type === 'user/message' && JSON.stringify(event.data).includes('monitor deadline reached')));
  await until(async () => !(await f.api(session.sessionId)).value.running);
  await assert.rejects(access(join(f.workspace, 'deadline-missed.txt')), { code: 'ENOENT' });

  await f.api(session.sessionId, { mode: 'ask' });
  phase = 0;
  f.replyWith(payload => phase++ === 0 ? toolReply('monitor', { command: 'printf forbidden > guard-failed.txt', description: 'Guard probe' }) : textReply('Guard kept the process from starting.'));
  const denied = await f.prompt(session.sessionId, 'GROK_MONITOR_GUARD');
  assert(events(denied).some(event => event.type === 'tool/result' && JSON.stringify(event.data).includes('ask mode')));
  await assert.rejects(access(join(f.workspace, 'guard-failed.txt')), { code: 'ENOENT' });
  f.replyWith();
  const pi = await f.create('omaa-pi'), piFrom = f.requests.length;
  await f.prompt(pi.sessionId, 'NO_GROK_MONITOR_IN_PI');
  assert(f.requests.slice(piFrom).every(payload => !payload.tools?.some(tool => tool.function?.name === 'monitor')));
  assert.deepEqual(f.errors, []);
});
