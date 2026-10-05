import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createCheckpointStore } from '../src/checkpoints.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'omaa-checkpoint-'));
  const workspace = path.join(root, 'workspace'), directory = path.join(root, 'data');
  await fs.mkdir(workspace); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const events = [{ seq: 0, type: 'user/message', data: { content: [{ type: 'text', text: 'Keep the conversation' }] } }, { seq: 1, type: 'turn/start', data: { turn: 1 } }];
  const session = { id: randomUUID(), header: { cwd: workspace }, snapshotEvents: () => events };
  const options = { isIdle: () => true };
  const store = createCheckpointStore(directory, options);
  const capture = (file, run, args = {}) => store.captureExecution({ name: 'write', arguments: { file_path: file, content: 'fixture', ...args }, callId: randomUUID(), agent: { session }, signal: new AbortController().signal }, run);
  return { root, workspace, directory, session, events, store, options, capture, target: file => path.join(workspace, file), restore: args => store.restore(session.id, session, { turn: 1, ...args }), inspect: args => store.inspect(session.id, session, args) };
}

test('exact BOM/CRLF/no-final-newline bytes and original mode survive cold restore; new files are removed', async t => {
  const f = await fixture(t), bytes = Buffer.from('\ufefffirst\r\nlast');
  await fs.writeFile(f.target('a.txt'), bytes, { mode: 0o755 });
  await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'changed\n'));
  await f.capture('new.txt', () => fs.writeFile(f.target('new.txt'), 'new'));
  const before = structuredClone(f.events);
  const cold = createCheckpointStore(f.directory, f.options);
  const result = await cold.restore(f.session.id, f.session, { turn: 1 });
  assert.equal(result.ok, true); assert.deepEqual(result.restored, ['a.txt', 'new.txt']);
  assert.deepEqual(await fs.readFile(f.target('a.txt')), bytes);
  assert.equal((await fs.stat(f.target('a.txt'))).mode & 0o777, 0o755);
  await assert.rejects(fs.stat(f.target('new.txt')), { code: 'ENOENT' });
  assert.deepEqual(f.events, before, 'file restore must not retract or append conversation events');
  assert.match(cold.restorationNote(f.session.id), /Read these files again/);
  assert.equal((await cold.restore(f.session.id, f.session, { turn: 1 })).ok, true, 'recorded restores are idempotent');
});

test('same-turn repeated edits retain the first baseline and final actual bytes, including late cancellation', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'original');
  await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'intermediate'));
  await f.capture('a.txt', async () => { await fs.writeFile(f.target('a.txt'), 'committed-before-cancel'); return { isError: true, error: { code: 'ABORTED' } }; });
  const checkpoint = (await f.inspect({ turn: 1 })).checkpoint;
  assert.equal(checkpoint.files[0].callIds.length, 2); assert.equal(checkpoint.files[0].restorable, true);
  assert.equal((await f.restore()).ok, true); assert.equal(await fs.readFile(f.target('a.txt'), 'utf8'), 'original');
});

test('manual content changes or inode replacement cause whole-group preflight refusal', async t => {
  const f = await fixture(t);
  for (const file of ['a.txt', 'b.txt']) { await fs.writeFile(f.target(file), 'before'); await f.capture(file, () => fs.writeFile(f.target(file), 'after')); }
  await fs.writeFile(f.target('b.txt'), 'manual');
  const result = await f.restore(); assert.equal(result.ok, false); assert.equal(result.partial, false); assert.deepEqual(result.restored, []);
  assert.equal(await fs.readFile(f.target('a.txt'), 'utf8'), 'after'); assert.equal(await fs.readFile(f.target('b.txt'), 'utf8'), 'manual');
  assert.equal(result.conflicts[0].code, 'CHECKPOINT_CONFLICT');
  await fs.writeFile(f.target('b.txt'), 'after'); await fs.rename(f.target('a.txt'), f.target('old-a.txt')); await fs.writeFile(f.target('a.txt'), 'after');
  const swapped = await f.restore(); assert.equal(swapped.ok, false); assert.match(swapped.conflicts[0].message, /replaced/);
});

test('parent symlinks, target links, hardlinks, outside-workspace paths and binary/oversized bytes fail closed', async t => {
  const f = await fixture(t); await fs.mkdir(f.target('folder'));
  await fs.writeFile(f.target('folder/a.txt'), 'before'); await f.capture('folder/a.txt', () => fs.writeFile(f.target('folder/a.txt'), 'after'));
  await fs.rename(f.target('folder'), f.target('original-folder')); await fs.symlink(f.target('original-folder'), f.target('folder'), 'dir');
  const result = await f.restore(); assert.equal(result.ok, false); assert.equal(await fs.readFile(f.target('original-folder/a.txt'), 'utf8'), 'after');
  await fs.writeFile(f.target('leaf-source.txt'), 'before'); await fs.symlink(f.target('leaf-source.txt'), f.target('leaf-link.txt'));
  await f.capture('leaf-link.txt', () => fs.writeFile(f.target('leaf-link.txt'), 'native follows its own policy'));
  await fs.writeFile(f.target('hard.txt'), 'before'); await fs.link(f.target('hard.txt'), f.target('hard-alias.txt'));
  await f.capture('hard.txt', () => fs.writeFile(f.target('hard.txt'), 'after'));
  await fs.writeFile(f.target('binary.txt'), Buffer.from([0, 255, 1])); await f.capture('binary.txt', () => fs.writeFile(f.target('binary.txt'), 'text'));
  await fs.writeFile(f.target('large.txt'), Buffer.alloc(f.store.limits.fileBytes + 1, 65)); await f.capture('large.txt', () => fs.writeFile(f.target('large.txt'), 'small'));
  let ran = false; await f.capture('../outside.txt', async () => { ran = true; await fs.writeFile(path.join(f.root, 'outside.txt'), 'outside'); }); assert(ran);
  const checkpoint = (await f.inspect({ turn: 1 })).checkpoint;
  for (const file of ['leaf-link.txt', 'hard.txt', 'binary.txt', 'large.txt']) assert.equal(checkpoint.files.find(value => value.path === file).restorable, false, file);
  assert(!checkpoint.files.some(value => value.path.includes('outside')));
  assert.equal((await f.restore({ paths: ['binary.txt'] })).ok, false); assert.equal(await fs.readFile(f.target('binary.txt'), 'utf8'), 'text');
});

test('intervening manual edit between two tool calls disables that file and live sessions cannot restore', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'before');
  await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'first'));
  await fs.writeFile(f.target('a.txt'), 'manual'); await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'second'));
  assert.equal((await f.inspect({ turn: 1 })).checkpoint.files[0].reason, 'INTERVENING_CHANGE'); assert.equal((await f.restore()).ok, false);
  const busy = createCheckpointStore(f.directory, { isIdle: () => false });
  await assert.rejects(busy.restore(f.session.id, f.session, { turn: 1 }), { code: 'SESSION_RUNNING' });
});

test('corrupted content or foreign/path-escaping metadata cannot restore any file', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'before'); await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'after'));
  const bucket = path.join(f.directory, createHash('sha256').update(f.session.id).digest('hex'));
  const metaFile = path.join(bucket, 'checkpoint.json'), metadata = JSON.parse(await fs.readFile(metaFile, 'utf8'));
  await fs.writeFile(path.join(bucket, 'content', metadata.turns[0].files[0].before.hash), 'corrupt');
  const corrupt = await f.restore(); assert.equal(corrupt.ok, false); assert.equal(await fs.readFile(f.target('a.txt'), 'utf8'), 'after');
  metadata.turns[0].files[0].path = '../outside.txt'; await fs.writeFile(metaFile, JSON.stringify(metadata));
  await assert.rejects(createCheckpointStore(f.directory, f.options).restore(f.session.id, f.session, { turn: 1 }), { code: 'INVALID_METADATA' });
  metadata.turns[0].files[0].path = 'a.txt'; metadata.sessionId = 'foreign-session'; await fs.writeFile(metaFile, JSON.stringify(metadata));
  await assert.rejects(createCheckpointStore(f.directory, f.options).inspect(f.session.id, f.session), { code: 'INVALID_METADATA' });
});

test('native latest-turn review is reused and private exact-byte restore does not rely on expiring native hunks', async t => {
  const f = await fixture(t), calls = [];
  f.events.push({ seq: 2, type: 'workspace/changes', data: { turn: 1 } }, { seq: 3, type: 'workspace/changes', data: { turn: 1 } });
  const service = { summary(id, seq) { calls.push([id, seq]); return { turn: 1, files: [{ path: 'native.txt' }], cwd: f.workspace }; }, async diff() { return { kind: 'text', path: 'native.txt', before: true, after: true, hunks: [] }; } };
  const store = createCheckpointStore(f.directory, { ...f.options, workspaceChanges: service });
  const view = await store.inspect(f.session.id, f.session); assert.equal(view.checkpoints[0].seq, 3);
  const compared = await store.inspect(f.session.id, f.session, { seq: 3, index: 0 }); assert.equal(compared.diff.path, 'native.txt');
  assert.deepEqual(calls.at(-1), [f.session.id, 3]);
});

test('a later failure returns the actual restored and remaining file lists without claiming group atomicity', async t => {
  const f = await fixture(t);
  for (const file of ['a.txt', 'b.txt']) { await fs.writeFile(f.target(file), 'before'); await f.capture(file, () => fs.writeFile(f.target(file), 'after')); }
  const { readFileSync } = await import('node:fs');
  const partial = createCheckpointStore(f.directory, { isIdle: () => readFileSync(f.target('a.txt'), 'utf8') === 'after' });
  const result = await partial.restore(f.session.id, f.session, { turn: 1 });
  assert.equal(result.ok, false); assert.equal(result.partial, true);
  assert.deepEqual(result.restored, ['a.txt']); assert.deepEqual(result.changed, ['a.txt']); assert.deepEqual(result.notRestored, ['b.txt']);
  assert.equal(await fs.readFile(f.target('a.txt'), 'utf8'), 'before'); assert.equal(await fs.readFile(f.target('b.txt'), 'utf8'), 'after');
});

test('a private content directory symlink cannot redirect capture writes into the workspace', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'before'); await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'after'));
  const bucket = path.join(f.directory, createHash('sha256').update(f.session.id).digest('hex'));
  const victim = '0'.repeat(64); await fs.writeFile(f.target(victim), 'unrelated user work');
  await fs.rm(path.join(bucket, 'content'), { recursive: true }); await fs.symlink(f.workspace, path.join(bucket, 'content'), 'dir');
  await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'native tool still runs'));
  assert.deepEqual((await fs.readdir(f.workspace)).sort(), [victim, 'a.txt']);
  assert.equal(await fs.readFile(f.target(victim), 'utf8'), 'unrelated user work');
  assert.equal((await f.restore()).ok, false);
});

test('replacing the workspace itself invalidates persisted metadata before any restore', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'before'); await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'after'));
  await fs.rename(f.workspace, path.join(f.root, 'previous-workspace')); await fs.mkdir(f.workspace); await fs.writeFile(f.target('a.txt'), 'new workspace user work');
  await assert.rejects(createCheckpointStore(f.directory, f.options).restore(f.session.id, f.session, { turn: 1 }), { code: 'WORKSPACE_CHANGED' });
  assert.equal(await fs.readFile(f.target('a.txt'), 'utf8'), 'new workspace user work');
});

test('scoped installation records only Cursor and does not alter non-agent native dispatch', async t => {
  const f = await fixture(t), listeners = new Map(), sections = [];
  const ctx = { omaa: { product(session) { assert(session); return { id: session.cursor ? 'cursor' : 'pi' }; } }, on(event, handler) { assert(!listeners.has(event)); listeners.set(event, handler); }, systemPrompt: { section(value) { sections.push(value); } } };
  f.store.install(ctx); f.store.install(ctx);
  assert.equal(sections[0].order, 15);
  const execute = listeners.get('tools/execute');
  await execute({ name: 'write' }, async () => 'native without agent');
  const exec = { name: 'write', arguments: { file_path: 'a.txt' }, callId: 'real-call', agent: { session: f.session }, signal: new AbortController().signal };
  await execute(exec, () => fs.writeFile(f.target('a.txt'), 'Pi native write'));
  assert.deepEqual((await f.inspect()).checkpoints, []);
  f.session.cursor = true;
  await execute(exec, () => fs.writeFile(f.target('a.txt'), 'Cursor native write'));
  assert.equal((await f.inspect({ turn: 1 })).checkpoint.files[0].restorable, true);
});

test('cold first Cursor request includes the loaded restoration fact in the already-created assembly', async t => {
  const f = await fixture(t); await fs.writeFile(f.target('a.txt'), 'before'); await f.capture('a.txt', () => fs.writeFile(f.target('a.txt'), 'after')); await f.restore();
  const cold = createCheckpointStore(f.directory, f.options), listeners = new Map(), sections = [];
  const ctx = { omaa: { product: () => ({ id: 'cursor' }) }, on: (event, handler) => listeners.set(event, handler), systemPrompt: { section: section => sections.push(section) } };
  cold.install(ctx);
  const agent = { session: f.session }, initial = { sections: [{ name: 'existing', text: 'Keep this section' }, { ...sections[0], text: sections[0].text({ agent }) }] };
  assert.equal(initial.sections[1].text, '');
  const assembled = await listeners.get('system-prompt/assemble')(initial, { agent }, async () => initial);
  assert.match(assembled.sections[1].text, /The user restored these workspace files/);
  assert.match(assembled.sections[1].text, /Read these files again/);
  assert.equal(assembled.sections[1].interpolate, false); assert.equal(assembled.sections[0].text, 'Keep this section');
});
