import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreferencesStore, defaults } from '../src/host/preferences.mjs';
import { createSessionTransfer } from '../src/host/session-transfer.mjs';

// Model the admission boundary, not a second Session implementation. In
// particular Pro is ineligible until both enhancement and execution are active.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omaa-transfer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createPreferencesStore(directory), modes = new Map([['source', 'pro']]), plans = new Map();
  const sessions = Object.fromEntries(['source', 'target'].map(id => [id, { id, events: [], snapshotEvents() { return this.events; } }]));
  const agents = Object.fromEntries(['source', 'target'].map(id => [id, { session: sessions[id], status: 'idle' }]));
  let failFlush = false;
  const planController = { get: agent => ({ active: plans.get(agent.session.id) ?? false }), set: (agent, active) => plans.set(agent.session.id, active) };
  const control = {
    inspect: session => ({ savedMode: modes.get(session.id) ?? 'off' }),
    async select(id, mode) {
      if (mode !== 'off') assert(store.get(id).enhancement && store.get(id).mode === 'default' && !plans.get(id), 'Pro requires enabled OMAA execution before native selection');
      modes.set(id, mode);
    },
  };
  const transfer = createSessionTransfer({ store, workControl: () => control,
    hub: { inspect: async id => ({ session: sessions[id], agent: agents[id] }), product: () => ({ id: 'pi' }),
      modeFor: session => plans.get(session.id) ? 'plan' : store.get(session.id).mode, planController: () => planController },
    flush: async () => { if (failFlush) { failFlush = false; throw new Error('native flush failed'); } },
  });
  return { store, modes, plans, sessions, agents, transfer, fail: () => { failFlush = true; } };
}
const request = { sourceSessionId: 'source', targetSessionId: 'target', requestId: 'draft-request' };

test('draft admission transfers enhancement before Pro, preserves host theme, retries and refuses later edits', async t => {
  const f = await fixture(t), desired = { ...defaults, enhancement: true, theme: 'host' };
  f.store.set('source', desired);
  assert.deepEqual(await f.transfer(request), { copied: true, handledWorkMode: true });
  assert.equal(f.modes.get('target'), 'pro'); assert.deepEqual(f.store.get('target'), desired);
  assert.deepEqual(await f.transfer(request), { copied: true, handledWorkMode: true });
  f.store.set('target', { ...desired, theme: 'product' });
  await assert.rejects(f.transfer(request), /独立修改/);
  assert.equal(f.store.get('target').theme, 'product'); assert.equal(f.store.get('source').theme, 'host');
});

test('new draft may inherit completed source, preserves paused Pro in Plan and compensates failed admission', async t => {
  const f = await fixture(t), desired = { ...defaults, enhancement: true, theme: 'pi-coding-agent' };
  f.sessions.source.events.push({ type: 'user/message' });
  f.store.set('source', desired); f.plans.set('source', true);
  f.fail();
  await assert.rejects(f.transfer(request), /native flush failed/);
  assert.equal(f.store.has('target'), false); assert.equal(f.store.transfer('target'), null);
  assert.equal(f.modes.get('target'), 'off'); assert.equal(f.plans.get('target'), false);
  await f.transfer(request);
  assert.deepEqual(f.store.get('target'), desired); assert.equal(f.modes.get('target'), 'pro'); assert.equal(f.plans.get('target'), true);
  await f.transfer(request); // native Plan is paused temporarily for Pro selection
  assert.equal(f.plans.get('target'), true);
  f.sessions.target.events.push({ type: 'user/message' });
  await assert.rejects(f.transfer(request), /尚未发送/);
});
