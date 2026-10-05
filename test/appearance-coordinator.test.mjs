import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceCoordinator } from '../src/client/themes/coordinator.mjs';

function providers(broker, log) {
  const omd = broker.register({ id: 'omd', priority: 0, select: () => ({ key: 'global' }),
    mount: () => { log.push('omd:on'); return () => log.push('omd:off'); } });
  const omaa = broker.register({ id: 'omaa', priority: 10, select: state => state.mode ? { key: state.mode } : null,
    mount: ({ key }) => { log.push(key + ':on'); return () => log.push(key + ':off'); } });
  return { omd, omaa };
}

test('appearance control transfers exclusively and restores the existing OMD choice', () => {
  const broker = appearanceCoordinator({}), log = [];
  const { omd, omaa } = providers(broker, log);
  const foreground = broker.observeForeground('host');
  foreground.set({ sessionId: 'a', mode: 'codex' });
  foreground.set({ sessionId: 'b', mode: 'zcode' });
  foreground.set({ sessionId: 'standard', mode: null });
  assert.deepEqual(log, ['omd:on', 'omd:off', 'codex:on', 'codex:off', 'zcode:on', 'zcode:off', 'omd:on']);
  omaa(); omd();
  assert.equal(log.at(-1), 'omd:off');
  assert.equal(broker.getSnapshot().owner, null);
});

test('either plugin can be first and stale releases cannot remove a replacement provider', () => {
  const surface = {}, broker = appearanceCoordinator(surface), foreground = broker.observeForeground('host');
  assert.equal(appearanceCoordinator(surface), broker);
  foreground.set({ sessionId: 'native', mode: 'codex' });
  const log = [];
  const native = broker.register({ id: 'omaa', priority: 10, select: state => state.mode ? { key: state.mode } : null,
    mount: () => { log.push('native:on'); return () => log.push('native:off'); } });
  const fallback = broker.register({ id: 'omd', select: () => ({ key: 'global' }), mount: () => { log.push('omd:on'); return () => log.push('omd:off'); } });
  assert.deepEqual(log, ['native:on']);
  native();
  assert.deepEqual(log, ['native:on', 'native:off', 'omd:on']);
  const replacement = broker.register({ id: 'omaa', priority: 10, select: () => ({ key: 'new' }), mount: () => () => {} });
  native(); assert.equal(broker.getSnapshot().owner, 'omaa');
  replacement(); fallback();
});

test('a late foreground owner cannot overwrite the replacement mounted conversation', () => {
  const broker = appearanceCoordinator({});
  const old = broker.observeForeground('old'); old.set({ sessionId: 'a', mode: 'codex' });
  const next = broker.observeForeground('new'); next.set({ sessionId: 'b', mode: 'grok' });
  old.set({ sessionId: 'stale', mode: 'zcode' }); old.dispose();
  assert.deepEqual(broker.getSnapshot().foreground, { sessionId: 'b', mode: 'grok' });
  next.dispose(); assert.deepEqual(broker.getSnapshot().foreground, { sessionId: null, mode: null });
});

test('same theme across sessions keeps one renderer; unload restores fallback', () => {
  const broker = appearanceCoordinator({}), log = [], { omaa } = providers(broker, log);
  const owner = broker.observeForeground('host');
  owner.set({ sessionId: 'first', mode: 'codex' });
  owner.set({ sessionId: 'second', mode: 'codex' });
  assert.equal(log.filter(value => value === 'codex:on').length, 1);
  omaa(); assert.equal(broker.getSnapshot().owner, 'omd');
});

test('duplicate providers and incompatible protocol versions reject instead of competing', () => {
  const surface = {}, broker = appearanceCoordinator(surface);
  broker.register({ id: 'omd', select: () => null, mount: () => () => {} });
  assert.throws(() => broker.register({ id: 'omd', select: () => null, mount: () => () => {} }), /already registered/);
  assert.throws(() => appearanceCoordinator({ [Symbol.for('omd.omaa.appearance.v1')]: { version: 2 } }), /Incompatible/);
});
