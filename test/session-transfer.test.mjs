import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreferencesStore, defaults } from '../src/host/preferences.mjs';
import { createSessionTransfer } from '../src/host/session-transfer.mjs';

// Model the admission boundary, not a second Session implementation. In
// particular Ultra is ineligible until both enhancement and execution are active.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omaa-transfer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createPreferencesStore(directory), modes = new Map([['source', 'ultra']]), plans = new Map();
  const submodes = new Map([['source', 'workflow']]), teamAvailable = new Map();
  const sessions = Object.fromEntries(['source', 'target'].map(id => [id, { id, events: [], snapshotEvents() { return this.events; } }]));
  const agents = Object.fromEntries(['source', 'target'].map(id => [id, { session: sessions[id], status: 'idle' }]));
  let failFlush = false;
  const planController = { get: agent => ({ active: plans.get(agent.session.id) ?? false }), set: (agent, active) => plans.set(agent.session.id, active) };
  const control = {
    inspect: async session => {
      const savedSubmode = submodes.get(session.id) ?? 'free', available = teamAvailable.get(session.id) === true;
      return { savedMode: modes.get(session.id) ?? 'off', savedSubmode, submode: savedSubmode === 'team' && !available ? 'free' : savedSubmode, teamAvailable: available };
    },
    async select(id, mode, submode) {
      if (mode !== 'off') assert(store.get(id).enhancement && store.get(id).mode === 'default' && !plans.get(id), 'Ultra requires enabled OMAA execution before native selection');
      if (mode !== 'off' && submode === 'team' && !teamAvailable.get(id)) throw new Error('Agent Team is unavailable');
      const before = await control.inspect(sessions[id]);
      modes.set(id, mode); submodes.set(id, submode ?? (mode === 'off' ? before.savedSubmode : before.submode));
    },
    async restore(id, snapshot) {
      modes.set(id, snapshot.savedMode); submodes.set(id, snapshot.savedSubmode);
    },
  };
  const transfer = createSessionTransfer({ store, workControl: () => control,
    hub: { inspect: async id => ({ session: sessions[id], agent: agents[id] }), product: () => ({ id: 'pi' }),
      modeFor: session => plans.get(session.id) ? 'plan' : store.get(session.id).mode, planController: () => planController },
    flush: async () => { if (failFlush) { failFlush = false; throw new Error('native flush failed'); } },
  });
  return { store, modes, submodes, teamAvailable, plans, sessions, agents, transfer, control, fail: () => { failFlush = true; } };
}
const request = { sourceSessionId: 'source', targetSessionId: 'target', requestId: 'draft-request' };

test('draft admission transfers enhancement before Ultra, preserves host theme, retries and refuses later edits', async t => {
  const f = await fixture(t), desired = { ...defaults, enhancement: true, theme: 'host' };
  f.store.set('source', desired);
  assert.deepEqual(await f.transfer(request), { copied: true, handledWorkMode: true });
  assert.equal(f.modes.get('target'), 'ultra'); assert.equal(f.submodes.get('target'), 'workflow'); assert.deepEqual(f.store.get('target'), desired);
  assert.deepEqual(await f.transfer(request), { copied: true, handledWorkMode: true });
  f.store.set('target', { ...desired, theme: 'product' });
  await assert.rejects(f.transfer(request), /独立修改/);
  assert.equal(f.store.get('target').theme, 'product'); assert.equal(f.store.get('source').theme, 'host');
});

test('new draft may inherit completed source, preserves paused Ultra in Plan and compensates failed admission', async t => {
  const f = await fixture(t), desired = { ...defaults, enhancement: true, theme: 'pi-coding-agent' };
  f.sessions.source.events.push({ type: 'user/message' });
  f.store.set('source', desired); f.plans.set('source', true);
  f.fail();
  await assert.rejects(f.transfer(request), /native flush failed/);
  assert.equal(f.store.has('target'), false); assert.equal(f.store.transfer('target'), null);
  assert.equal(f.modes.get('target'), 'off'); assert.equal(f.plans.get('target'), false);
  await f.transfer(request);
  assert.deepEqual(f.store.get('target'), desired); assert.equal(f.modes.get('target'), 'ultra'); assert.equal(f.plans.get('target'), true);
  await f.transfer(request); // native Plan is paused temporarily for Ultra selection
  assert.equal(f.plans.get('target'), true);
  f.sessions.target.events.push({ type: 'user/message' });
  await assert.rejects(f.transfer(request), /尚未发送/);
});

// An off mode still has a remembered submode, including during compensation.
test('draft transfer copies and restores remembered Ultra submodes while off', async t => {
  const f = await fixture(t);
  f.modes.set('source', 'off'); f.submodes.set('source', 'team'); f.submodes.set('target', 'workflow');
  f.fail();
  await assert.rejects(f.transfer(request), /native flush failed/);
  assert.equal(f.modes.get('target'), 'off'); assert.equal(f.submodes.get('target'), 'workflow');
  await f.transfer(request);
  assert.equal(f.modes.get('target'), 'off'); assert.equal(f.submodes.get('target'), 'team');
});

test('enabled drafts copy the effective fallback while preserving source Team memory', async t => {
  const f = await fixture(t);
  f.store.set('source', { ...defaults, enhancement: true }); f.submodes.set('source', 'team');
  await f.transfer(request);
  assert.equal(f.modes.get('target'), 'ultra'); assert.equal(f.submodes.get('target'), 'free');
  assert.equal(f.submodes.get('source'), 'team');
});

test('failed draft transfer restores active Ultra with unavailable Team memory', async t => {
  const f = await fixture(t);
  f.store.set('source', { ...defaults, enhancement: true });
  f.modes.set('target', 'ultra'); f.submodes.set('target', 'team');
  f.fail(); await assert.rejects(f.transfer(request), /native flush failed/);
  assert.equal(f.modes.get('target'), 'ultra'); assert.equal(f.submodes.get('target'), 'team');
});

test('older bridges without snapshot restoration preserve an unavailable Team target before transfer', async t => {
  const f = await fixture(t);
  f.store.set('source', { ...defaults, enhancement: true });
  f.modes.set('target', 'ultra'); f.submodes.set('target', 'team');
  delete f.control.restore;
  await assert.rejects(f.transfer(request), /目标设置已保留/);
  assert.equal(f.modes.get('target'), 'ultra'); assert.equal(f.submodes.get('target'), 'team');
  assert.equal(f.store.has('target'), false);
});
