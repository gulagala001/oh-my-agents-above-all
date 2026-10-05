import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

test('Pi delivers two typed steers one at a time through the native inbox', { timeout: 45000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  await writeFile(join(f.workspace, 'input.txt'), 'actual native input');
  const { sessionId } = await f.create('omaa-pi'); let phase = 0;
  f.replyWith(payload => payload.tools?.length && phase++ === 0 ? toolReply('read', { file_path: 'input.txt' }) : textReply('Native step completed.'));
  const release = f.holdNextReply(), from = f.requests.length;
  await f.send(sessionId, 'PI_STEER_INITIAL');
  await until(() => f.requests.slice(from).some(p => JSON.stringify(p.messages).includes('PI_STEER_INITIAL')));
  await f.send(sessionId, 'PI_STEER_FIRST', 'steer'); await f.send(sessionId, 'PI_STEER_SECOND', 'steer');
  const pending = await f.snapshot(sessionId), originalIds = pending.projections.values.inbox?.['next-step']?.map(m => m.id);
  release();
  await until(async () => !(await f.api(sessionId)).value.running && f.requests.slice(from).some(p => JSON.stringify(p.messages).includes('PI_STEER_SECOND')));
  const requests = f.requests.slice(from).filter(p => p.tools?.length);
  const first = requests.findIndex(p => JSON.stringify(p.messages).includes('PI_STEER_FIRST'));
  const second = requests.findIndex(p => JSON.stringify(p.messages).includes('PI_STEER_SECOND'));
  assert(first > 0 && second > first); assert(!JSON.stringify(requests[first].messages).includes('PI_STEER_SECOND'));
  const events = (await f.snapshot(sessionId)).records.map(r => r.event).filter(Boolean);
  const entered = events.filter(e => e.type === 'user/message' && JSON.stringify(e.data).includes('PI_STEER_'));
  assert.equal(entered.filter(e => JSON.stringify(e.data).includes('PI_STEER_FIRST')).length, 1);
  assert.equal(entered.filter(e => JSON.stringify(e.data).includes('PI_STEER_SECOND')).length, 1);
  if (originalIds) assert.deepEqual(entered.filter(e => !JSON.stringify(e.data).includes('PI_STEER_INITIAL')).map(e => e.data.id), originalIds);
  assert.equal((await f.snapshot(sessionId)).projections.values.inbox?.['next-step']?.length ?? 0, 0);
});
