import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: [new URL('../src/client/preset-controls.jsx', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
const { createSessionSettings } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const value = (product = 'codex', extra = {}) => ({ product: { id: product, name: product, theme: product + '-theme' },
  mode: 'default', theme: 'product', enhancement: false, enhancementActive: false, omdAvailable: false,
  pendingMode: false, running: false, ...extra });
function source(initial) {
  let state = initial;
  const listeners = new Set();
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { state = next; for (const fn of listeners) fn(); }, listeners };
}
function fixture(initial = 'a') {
  const mounted = source(initial), list = source({ byId: { a: { running: false }, b: { running: false } } }), calls = [];
  const request = (url, options) => new Promise(resolve => calls.push({ url, options, resolve: data => resolve(new Response(JSON.stringify(data), { status: 200 })) }));
  const store = createSessionSettings({ sidebarRight: { mounted }, sessions: { list } }, request);
  return { mounted, list, calls, store };
}

test('visible host session is the only API target, with host cookies and no recurring polling', async () => {
  const f = fixture(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'omaa/api/session?session=a');
  assert.equal(new URL(f.calls[0].url, 'https://host.example/dsh/').pathname, '/dsh/omaa/api/session');
  assert.equal(f.calls[0].options.credentials, 'same-origin');
  f.calls[0].resolve(value()); await tick();
  f.list.set({ byId: { a: { running: false, title: 'rename only' }, b: { running: false } } }); await tick();
  assert.equal(f.calls.length, 1, 'unrelated list metadata does not reload settings');
  f.mounted.set(undefined); await tick();
  assert.equal(f.store.getSnapshot().data, null); assert.equal(f.calls.length, 1);
  f.store.dispose(); assert.equal(f.mounted.listeners.size, 0); assert.equal(f.list.listeners.size, 0);
});

test('late GET from a previous foreground session cannot change the active preset', async () => {
  const f = fixture(); await tick(); const old = f.calls[0];
  f.mounted.set('b'); await tick();
  assert.equal(old.options.signal.aborted, true); assert.equal(f.calls.length, 2);
  f.calls[1].resolve(value('cursor')); await tick();
  old.resolve(value('codex')); await tick();
  assert.equal(f.store.getSnapshot().sessionId, 'b'); assert.equal(f.store.getSnapshot().data.product.id, 'cursor');
  f.store.dispose();
});

test('running transitions immediately disable writes and actual plan projection triggers a refresh', async () => {
  const f = fixture(); await tick(); f.calls[0].resolve(value()); await tick();
  f.list.set({ byId: { a: { running: true, projectionValues: { plan: { active: true, pending: false } } } } });
  assert.equal(f.store.getSnapshot().data.running, true);
  await assert.rejects(f.store.update({ theme: 'host' }), /停止/);
  await tick(); assert.equal(f.calls.length, 2);
  f.calls[1].resolve(value('codex', { running: true, mode: 'plan' })); await tick();
  assert.equal(f.store.getSnapshot().data.mode, 'plan');
  f.store.dispose();
});

test('late POST completion does not overwrite another session, and stale callbacks are rejected', async () => {
  const f = fixture(); await tick(); f.calls[0].resolve(value()); await tick();
  const writing = f.store.update({ theme: 'host' }, 'a'); await tick();
  assert.equal(f.calls[1].options.method, 'POST'); assert.deepEqual(JSON.parse(f.calls[1].options.body), { theme: 'host' });
  f.mounted.set('b'); await tick();
  f.calls[2].resolve(value('pi')); await tick();
  f.calls[1].resolve(value('codex', { theme: 'host' })); await writing;
  assert.equal(f.store.getSnapshot().data.product.id, 'pi'); assert.equal(f.store.getSnapshot().data.theme, 'product');
  await assert.rejects(f.store.update({ enhancement: true }, 'a'), /已切换/);
  f.store.dispose();
});

test('POST emits accepted preferences immediately, and explicit reopening refresh needs no custom projection', async () => {
  const f = fixture(); await tick(); f.calls[0].resolve(value()); await tick();
  const writing = f.store.update({ mode: 'ask' }); await tick();
  f.list.set({ byId: { a: { running: false, title: 'metadata only' } } }); await tick();
  assert.equal(f.calls.length, 2);
  f.calls[1].resolve(value('codex', { mode: 'ask' })); await writing;
  assert.equal(f.store.getSnapshot().data.mode, 'ask'); assert.equal(f.store.getSnapshot().saving, false);
  const reopening = f.store.refresh(); await tick();
  assert.equal(f.calls.length, 3);
  f.calls[2].resolve(value('codex', { mode: 'ask', theme: 'host' })); await reopening;
  assert.equal(f.store.getSnapshot().data.theme, 'host');
  f.store.dispose();
});
