import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitReviewState, reviewDraftsFor, reviewHunkRows, sendReviewFeedback, sendReviewFeedbackBatch } from '../src/client/git-review-state.mjs';

function fixture() {
  let value = { sessionId: 'a', data: { product: { id: 'codex' }, running: false, mode: 'default' } };
  const listeners = new Set(), calls = [];
  const settings = { getSnapshot: () => value, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); } };
  const store = createGitReviewState(settings, (url, options) => new Promise(resolve => calls.push({ url, options, finish: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status })) })));
  return { store, calls, settings, update(patch) { value = { ...value, ...patch }; for (const callback of listeners) callback(); } };
}
const summary = (revision = 'r1') => ({ sessionId: 'a', root: '/repo', scope: 'unstaged', revision, files: [{ path: 'src/a #.js', display: 'src/a #.js', added: 2, deleted: 1, actions: ['stage', 'revert'] }], total: 1, added: 2, deleted: 1 });
const diff = { kind: 'text', path: 'src/a #.js', hunks: [{ oldStart: 4, newStart: 4, oldLines: 2, newLines: 3, lines: [' unchanged', '-old', '+new', '+extra'] }] };

test('scope and comparison reads use relative cookie-authenticated routes and observed revision', async () => {
  const f = fixture(); const loading = f.store.read();
  assert.equal(new URL(f.calls[0].url, 'https://host/dsh/').pathname, '/dsh/omaa/api/git-review');
  assert.equal(f.calls[0].options.credentials, 'same-origin');
  f.calls[0].finish(summary()); await loading;
  const selecting = f.store.read('unstaged', '', diff.path);
  const query = new URL(f.calls[1].url, 'https://host/dsh/').searchParams;
  assert.equal(query.get('path'), diff.path); assert.equal(query.get('revision'), 'r1');
  f.calls[1].finish({ revision: 'r1', diff, hunkActions: { 0: ['stage'] } }); await selecting;
  const staged = f.store.mutate(diff.path, 'stage', 0);
  assert.deepEqual(JSON.parse(f.calls[2].options.body), { scope: 'unstaged', revision: 'r1', path: diff.path, action: 'stage', hunk: 0 });
  f.calls[2].finish({ ok: true, summary: summary('r2') }); await staged;
  assert.equal(f.store.getSnapshot().summary.revision, 'r2'); assert.equal(f.store.getSnapshot().diff, null); f.store.dispose();
});

test('switching sessions fences late reads and writes, and rejects absent native actions', async () => {
  const f = fixture(); const pending = f.store.read();
  f.update({ sessionId: 'b' }); assert.equal(f.calls[0].options.signal.aborted, true);
  f.calls[0].finish(summary()); await pending; assert.equal(f.store.getSnapshot().summary, null);
  f.update({ sessionId: 'a' }); const loading = f.store.read(); f.calls[1].finish(summary()); await loading;
  await assert.rejects(f.store.mutate(diff.path, 'unstage'), /不支持/);
  const saving = f.store.mutate(diff.path, 'stage'); f.update({ sessionId: 'b' });
  f.calls[2].finish({ ok: true, summary: summary('r2') }); await saving;
  assert.equal(f.store.getSnapshot().sessionId, 'b'); assert.equal(f.store.getSnapshot().summary, null); f.store.dispose();
});

test('revision conflict clears the invalid comparison and never retries a write', async () => {
  const f = fixture(); const loading = f.store.read(); f.calls[0].finish(summary()); await loading;
  const saving = f.store.mutate(diff.path, 'revert'); f.calls[1].finish({ error: '工作树已变化，请刷新', code: 'revision-conflict' }, 409);
  await assert.rejects(saving, /已变化/); assert.equal(f.calls.length, 2); assert.equal(f.store.getSnapshot().summary, null); f.store.dispose();
});

test('Ask, Plan, pending modes and running state cannot admit file writes', async () => {
  const f = fixture(); const loading = f.store.read(); f.calls[0].finish(summary()); await loading;
  for (const data of [{ mode: 'ask' }, { mode: 'plan' }, { mode: 'default', pendingMode: true }, { mode: 'default', running: true }]) {
    f.update({ data: { product: { id: 'codex' }, ...data } });
    await assert.rejects(f.store.mutate(diff.path, 'stage'), /执行模式/);
  }
  assert.equal(f.calls.length, 1); f.store.dispose();
});

test('line coordinates preserve old/new numbering for context, removals and additions', () => {
  assert.deepEqual(reviewHunkRows(diff.hunks[0]), [
    { kind: 'context', text: 'unchanged', old: 4, new: 4 }, { kind: 'del', text: 'old', old: 5, new: undefined },
    { kind: 'add', text: 'new', old: undefined, new: 5 }, { kind: 'add', text: 'extra', old: undefined, new: 6 },
  ]);
});

test('line feedback uses native local echo and exact admission identity, preserving comparison coordinates', async () => {
  const f = fixture(), calls = [], target = { scope: 'branch', ref: 'main', revision: 'git-abc', path: diff.path, side: 'new', line: 5 };
  const session = { getSnapshot: () => ({ running: false }), beginSubmission(input) { calls.push(input); return { requestId: 'echo-id', abandon: () => calls.push('abandoned') }; },
    async prompt(...args) { calls.push(args); return { ok: true, value: { accepted: true } }; } };
  const sessions = { using: async (id, options, fn) => { assert.equal(id, 'a'); return fn({ ready: Promise.resolve({ session }) }); } };
  await sendReviewFeedback(f.settings, sessions, 'a', target, 'Fix this edge case.');
  assert.equal(calls[0].mode, 'queue'); assert.deepEqual(calls[0].attachments, []);
  assert(calls[0].text.includes(JSON.stringify(target))); assert(calls[0].text.endsWith('Fix this edge case.'));
  assert.deepEqual(calls[1], [[{ type: 'text', text: calls[0].text }], 'queue', undefined, 'echo-id']); f.store.dispose();
});

test('feedback refuses late session switches before native admission', async () => {
  const f = fixture(); let resolve, admitted = false;
  const ready = new Promise(done => { resolve = done; });
  const sessions = { using: (id, options, fn) => fn({ ready }) };
  const sending = sendReviewFeedback(f.settings, sessions, 'a', { scope: 'unstaged', revision: 'r1', path: 'a.js', side: 'old', line: 1 }, 'Fix');
  f.update({ sessionId: 'b' }); resolve({ session: { beginSubmission() { admitted = true; } } });
  await assert.rejects(sending, /会话已切换/); assert.equal(admitted, false); f.store.dispose();
});

test('multi-file drafts retain exact coordinates, edits and editor across file/scope changes and session remounts', () => {
  const f = fixture(), drafts = reviewDraftsFor(f.settings);
  const first = { scope: 'unstaged', revision: 'original-r1', path: 'a.js', side: 'new', line: 3 };
  const second = { scope: 'branch', ref: 'main', revision: 'original-r2', path: 'b.js', side: 'old', line: 9 };
  const a = drafts.add('a', first, 'First comment'), b = drafts.add('a', second, 'Second comment');
  drafts.update('a', a, first, 'Edited first comment');
  drafts.setEditor('a', { target: second, note: 'Unsaved editor text', key: b });
  f.update({ sessionId: 'b' });
  assert.equal(drafts.getSnapshot('b').items.length, 0);
  assert.equal(drafts.getSnapshot('b').editor, null);
  assert.throws(() => drafts.remove('a', a), /会话已切换/);
  f.update({ sessionId: 'a' });
  assert.equal(reviewDraftsFor(f.settings), drafts, 'same application lifetime retains drafts after component remount');
  assert.deepEqual(drafts.getSnapshot('a').items.map(item => [item.target, item.note]), [[first, 'Edited first comment'], [second, 'Second comment']]);
  assert.equal(drafts.getSnapshot('a').editor.note, 'Unsaved editor text');
  drafts.remove('a', b); assert.equal(drafts.getSnapshot('a').items.length, 1);
  assert.throws(() => drafts.add('a', second, '字'.repeat(2000)), /4000/);
  f.store.dispose();
});

test('one native batch request submits all comments; rejection preserves them and late acceptance only clears its source session', async () => {
  const f = fixture(), drafts = reviewDraftsFor(f.settings), calls = [];
  const first = { scope: 'unstaged', revision: 'r1', path: 'a.js', side: 'new', line: 3 };
  const second = { scope: 'commit', ref: 'HEAD', revision: 'r2', path: 'b.js', side: 'old', line: 9 };
  drafts.add('a', first, 'First comment'); drafts.add('a', second, 'Second comment');
  await assert.rejects(drafts.submit('a', async () => { throw new Error('transport failed'); }), /transport failed/);
  assert.equal(drafts.getSnapshot('a').items.length, 2);
  let resolve, admitted;
  const admission = new Promise(done => { admitted = done; });
  const session = { getSnapshot: () => ({ running: false }), beginSubmission(input) { calls.push(input); return { requestId: 'one-batch-id', abandon() {} }; },
    prompt(...args) { calls.push(args); admitted(); return new Promise(done => { resolve = done; }); } };
  const sessions = { using: (id, options, fn) => fn({ ready: Promise.resolve({ session }) }) };
  const submission = drafts.submit('a', items => sendReviewFeedbackBatch(f.settings, sessions, 'a', items));
  await admission;
  assert.equal(calls.length, 2, 'one echo and one prompt, not one request per file');
  assert(calls[0].text.includes(JSON.stringify(first))); assert(calls[0].text.includes(JSON.stringify(second)));
  assert(calls[0].text.includes('First comment')); assert(calls[0].text.includes('Second comment'));
  assert.equal(calls[1][3], 'one-batch-id');
  f.update({ sessionId: 'b' }); drafts.add('b', first, 'Other session comment');
  resolve({ ok: true, value: { accepted: true } }); await submission;
  assert.equal(drafts.getSnapshot('a').items.length, 0); assert.equal(drafts.getSnapshot('b').items.length, 1);
  f.update({ sessionId: 'a' });
  for (let i = 0; i < 50; i++) drafts.add('a', first, 'Bounded comment');
  assert.throws(() => drafts.add('a', second, '51st'), /50/);
  f.store.dispose();
});
