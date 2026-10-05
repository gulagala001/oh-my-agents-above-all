import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { checkpointFileAddress, checkpointReviewAddress, openCheckpointFile, openCheckpointReview, assertCheckpointSession } from '../src/client/checkpoint-navigation.mjs';

const packages = await readdir(new URL('../node_modules/.pnpm/', import.meta.url));
const source = (name, file) => new URL(`../node_modules/.pnpm/${packages.find(value => value.startsWith('@deepseek-ai+' + name + '@'))}/node_modules/@deepseek-ai/${name}/${file}`, import.meta.url);
const { sessionFileAddress } = await import(source('dsh-util-workspace-path', 'lib/index.js'));
// This native helper is internal to the browser bundle, not a public export.
const nativeBundle = await readFile(source('dsh-client-ui-deliverables', 'lib/client.js'), 'utf8');
const addressConstant = nativeBundle.match(/const CHANGES_REVIEW_ADDRESS = [^;]+;/)[0];
const addressFunction = nativeBundle.match(/function changesReviewAddress\(coordinates\) \{[\s\S]*?\n\t\t\}/)[0];
const changesReviewAddress = new Function(`${addressConstant}\n${addressFunction}\nreturn changesReviewAddress;`)();
const checkpoint = { turn: 3, seq: 27, reviewAvailable: true, summary: { files: [{ path: 'src/a.js' }, { path: 'src/b.js' }] } };
function fixture() {
  let state = { sessionId: 'a/#', data: { product: { id: 'cursor' }, running: false } }, mounted = state.sessionId;
  const calls = [];
  return { settings: { getSnapshot: () => state }, sidebarRight: { mounted: { getSnapshot: () => mounted }, openResourceIn: (...args) => calls.push(args) }, calls,
    switch(id) { state = { ...state, sessionId: id }; mounted = id; }, run() { state.data.running = true; }, unmount() { mounted = undefined; } };
}

test('resource addresses match installed native grammar, including spaces, fragments and Windows paths', () => {
  for (const id of ['a/#', '会话 1', 'simple']) {
    assert.equal(checkpointReviewAddress(id, checkpoint), changesReviewAddress({ sessionId: id, seq: 27, turn: 3 }));
    for (const path of ['src/a b#?.js', './目录/a.md', 'C:\\项目\\a#b.ts', '/tmp/a b.txt', '\\\\server\\share\\a.txt']) {
      assert.equal(checkpointFileAddress(id, path), sessionFileAddress(id, path));
    }
  }
});

test('review opens the recorded comparison and preserves its exact native file index', () => {
  const f = fixture(); openCheckpointReview(f.settings, f.sidebarRight, 'a/#', checkpoint, 1);
  assert.deepEqual(f.calls, [['a/#', changesReviewAddress({ sessionId: 'a/#', seq: 27, turn: 3 }), { params: { index: 1 } }]]);
  assert.throws(() => openCheckpointReview(f.settings, f.sidebarRight, 'a/#', { ...checkpoint, reviewAvailable: false }), /不可用/);
  assert.throws(() => openCheckpointReview(f.settings, f.sidebarRight, 'a/#', checkpoint, 2), /不可用/);
  assert.equal(f.calls.length, 1);
});

test('stale callbacks and hidden session cannot navigate; running only blocks idle operations', () => {
  const f = fixture(); f.switch('b');
  assert.throws(() => openCheckpointReview(f.settings, f.sidebarRight, 'a/#', checkpoint), /会话已切换/);
  assert.throws(() => assertCheckpointSession(f.settings, 'a/#', f.sidebarRight), /会话已切换/);
  f.switch('a/#'); f.run();
  assert.throws(() => assertCheckpointSession(f.settings, 'a/#', f.sidebarRight), /停止/);
  openCheckpointFile(f.settings, f.sidebarRight, 'a/#', { path: 'src/a.js' });
  openCheckpointReview(f.settings, f.sidebarRight, 'a/#', checkpoint, 1);
  assert.equal(f.calls.length, 2);
  f.unmount();
  assert.throws(() => assertCheckpointSession(f.settings, 'a/#', f.sidebarRight), /会话已切换/);
  assert.throws(() => openCheckpointFile(f.settings, f.sidebarRight, 'a/#', { path: 'src/a.js' }), /会话已切换/);
  assert.equal(f.calls.length, 2);
});

test('current preview is separate from recorded diff and refuses files absent after restore', () => {
  const f = fixture(), file = { path: 'new file.md', before: { kind: 'absent' }, after: { kind: 'bytes' } };
  openCheckpointFile(f.settings, f.sidebarRight, 'a/#', file);
  assert.deepEqual(f.calls, [['a/#', sessionFileAddress('a/#', file.path)]]);
  assert.throws(() => openCheckpointFile(f.settings, f.sidebarRight, 'a/#', { ...file, restored: true }), /已删除/);
  assert.equal(f.calls.length, 1);
});
