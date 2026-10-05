import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

test('Cursor captures actual native edits, restores exact bytes after restart, and rejects conflicts', { timeout: 180000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const created = await f.create('omaa-cursor'), id = created.sessionId;
  const baseline = Buffer.from('\uFEFFfirst\r\nsecond', 'utf8');
  await writeFile(join(f.workspace, 'restored.txt'), baseline);
  const checkpoint = async (patch, query = '') => {
    const response = await fetch(f.origin + '/omaa/api/checkpoints?session=' + id + query, { headers: { cookie: f.cookie, 'content-type': 'application/json' }, ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  let step = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    if (step++ === 0) return toolReply('read', { file_path: 'restored.txt' });
    if (step === 2) return toolReply('write', { file_path: 'restored.txt', content: 'new content\n' });
    if (step === 3) return toolReply('write', { file_path: 'created.txt', content: 'created in Cursor\n' });
    return textReply('Cursor native changes completed.');
  });
  const original = await f.prompt(id, 'CHECKPOINT_NATIVE_EDIT');
  const listed = await checkpoint(); assert.equal(listed.status, 200, JSON.stringify(listed));
  const turn = listed.value.checkpoints.find(row => row.files.some(file => file.path === 'restored.txt'));
  if (!turn) t.diagnostic(JSON.stringify({ listed, events: original.records.filter(row => row.event && ['turn/start', 'tool/call', 'tool/result'].includes(row.event.type)).map(row => row.event) }));
  assert(turn); assert.equal(turn.files.length, 2);
  assert(turn.files.every(file => file.restorable));
  if (turn.reviewAvailable) {
    const reviewed = await checkpoint(undefined, `&seq=${turn.seq}&index=0`);
    assert.equal(reviewed.status, 200); assert.equal(reviewed.value.diff.kind, 'text');
    assert(reviewed.value.diff.hunks.length);
  }
  f.replyWith();
  await f.stop(); await f.boot();
  const cold = await checkpoint(); assert.equal(cold.status, 200); assert.equal(cold.value.checkpoints.at(-1).turn, turn.turn);
  const restored = await checkpoint({ turn: turn.turn }); assert.equal(restored.status, 200, JSON.stringify(restored));
  assert.equal(restored.value.ok, true); assert.deepEqual(restored.value.restored.sort(), ['created.txt', 'restored.txt']);
  assert.deepEqual(await readFile(join(f.workspace, 'restored.txt')), baseline);
  await assert.rejects(readFile(join(f.workspace, 'created.txt')), { code: 'ENOENT' });
  const current = await f.snapshot(id);
  assert(JSON.stringify(current.records).includes('CHECKPOINT_NATIVE_EDIT'));
  assert(current.projections.asOfSeq >= original.projections.asOfSeq, 'restoring files must preserve the native journal');
  await f.stop(); await f.boot();
  const from = f.requests.length;
  await f.prompt(id, 'COLD_RESTORATION_FIRST_REQUEST');
  const request = f.requests.slice(from).find(payload => payload.tools?.length);
  assert(request); assert.match(JSON.stringify(request.messages), /restored_files/); assert.match(JSON.stringify(request.messages), /Read these files again/);
  step = 0;
  f.replyWith(payload => payload.tools?.length && step++ === 0 ? toolReply('write', { file_path: 'conflict.txt', content: 'agent bytes' }) : textReply('changed'));
  await f.prompt(id, 'CHECKPOINT_CONFLICT');
  const conflictTurn = (await checkpoint()).value.checkpoints.at(-1).turn;
  await writeFile(join(f.workspace, 'conflict.txt'), 'user changed it');
  const conflict = await checkpoint({ turn: conflictTurn });
  assert.equal(conflict.status, 200); assert.equal(conflict.value.ok, false); assert.equal(conflict.value.partial, false);
  assert.equal(conflict.value.conflicts[0].code, 'CHECKPOINT_CONFLICT');
  assert.equal(await readFile(join(f.workspace, 'conflict.txt'), 'utf8'), 'user changed it');
  const unauthorized = await fetch(f.origin + '/omaa/api/checkpoints?session=' + id);
  assert([401, 403].includes(unauthorized.status));
  const pi = await f.create('omaa-pi');
  const wrongPreset = await fetch(f.origin + '/omaa/api/checkpoints?session=' + pi.sessionId, { headers: { cookie: f.cookie } });
  assert.equal(wrongPreset.status, 400);
});
