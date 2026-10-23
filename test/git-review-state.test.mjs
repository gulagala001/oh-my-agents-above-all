import test from 'node:test';
import assert from 'node:assert/strict';
import { createCursorReviewState, submitCursorReview } from '../src/client/cursor-review-state.mjs';
import { gitReviewErrorHint } from '../src/client/git-review-state.mjs';

const summary = { sessionId: 'a', root: '/repo', scope: 'unstaged', revision: 'r1', total: 1, files: [{ path: 'a.js', actions: ['stage', 'revert'] }] };
const detail = { diff: { kind: 'text', path: 'a.js', hunks: [] }, hunkActions: { 0: ['stage'] } };
function fixture(product = 'codex') {
  let value = { sessionId: 'a', data: { product: { id: product }, mode: 'default', running: false } }, responder;
  const listeners = new Set(), calls = [];
  const settings = { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const store = createCursorReviewState(settings, async (url, options) => {
    calls.push({ url, options });
    if (responder) return responder(url, options);
    const query = new URL(url, 'https://host/dsh/').searchParams;
    return new Response(JSON.stringify(query.has('path') ? detail : query.get('kind') === 'notes' ? { revision: 1, comments: [], reviewed: [] } : summary));
  }, product);
  return { store, settings, calls, respond(fn) { responder = fn; }, update(patch) { value = { ...value, ...patch }; for (const fn of listeners) fn(); } };
}
test('Codex uses its own durable route and preserves native Git action revisions', async () => {
  const f = fixture(); await f.store.open();
  assert.equal(new URL(f.calls[0].url, 'https://host/dsh/').pathname, '/dsh/omaa/api/codex-review');
  assert.equal(f.calls[0].options.credentials, 'same-origin');
  assert.equal(new URL(f.calls[1].url, 'https://host/dsh/').searchParams.get('revision'), 'r1');
  f.respond(async (_url, options) => options.method === 'POST' ? new Response(JSON.stringify({ ok: true, summary })) : new Response(JSON.stringify(new URL(_url, 'https://host/').searchParams.has('path') ? detail : summary)));
  await f.store.mutate('a.js', 'stage', 0);
  assert(f.calls[2].url.startsWith('omaa/api/git-review?'));
  assert.deepEqual(JSON.parse(f.calls[2].options.body), { scope: 'unstaged', revision: 'r1', path: 'a.js', action: 'stage', hunk: 0 });
  f.store.dispose();
});
test('session and product switches fence reads, late writes, and subsequent feedback admission', async () => {
  const f = fixture(); await f.store.open();
  let finish; f.respond(() => new Promise(resolve => { finish = resolve; }));
  const changing = f.store.mutate('a.js', 'stage');
  f.update({ sessionId: 'b', data: { product: { id: 'cursor' }, mode: 'default' } });
  finish(new Response(JSON.stringify({ ok: true, summary }))); await changing;
  assert.equal(f.store.getSnapshot().sessionId, 'b'); assert.equal(f.store.getSnapshot().summary, null); assert.equal(f.calls.length, 3);
  await assert.rejects(submitCursorReview(f.settings, f.store, 'submit'), /会话已切换/); f.store.dispose();
});
test('mode, missing capabilities and stale revisions cannot mutate or silently retry', async () => {
  const f = fixture(); await f.store.open();
  await assert.rejects(f.store.mutate('a.js', 'unstage'), /不支持/);
  for (const data of [{ mode: 'ask' }, { mode: 'plan' }, { mode: 'default', pendingMode: true }, { mode: 'default', running: true }]) {
    f.update({ data: { product: { id: 'codex' }, ...data } }); await assert.rejects(f.store.mutate('a.js', 'stage'), /执行模式/);
  }
  f.update({ data: { product: { id: 'codex' }, mode: 'default' } });
  f.respond(() => new Response(JSON.stringify({ code: 'revision-conflict', error: '文件已变化' }), { status: 409 }));
  await assert.rejects(f.store.mutate('a.js', 'revert'), /文件已变化/); assert.equal(f.calls.length, 3); assert.equal(f.store.getSnapshot().summary, null); f.store.dispose();
});
test('non-Git explanation retains precise native diagnostics and unrelated failures', async () => {
  const f = fixture(), diagnostic = 'fatal: not a git repository (or any of the parent directories): .git';
  f.respond(() => new Response(JSON.stringify({ code: 'GIT_FAILED', error: diagnostic }), { status: 400 }));
  await f.store.open(); assert.equal(f.store.getSnapshot().error, diagnostic);
  assert.equal(gitReviewErrorHint(f.store.getSnapshot().errorCode, diagnostic), '当前目录不属于 Git 仓库；选择仓库后审阅。');
  for (const [code, message] of [['permission-denied', diagnostic], ['GIT_FAILED', 'request failed before Git: ' + diagnostic], ['GIT_FAILED', 'fatal: ambiguous argument HEAD']]) assert.equal(gitReviewErrorHint(code, message), null);
  f.respond(); await f.store.open(); assert.equal(f.store.getSnapshot().error, ''); f.store.dispose();
});
