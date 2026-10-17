import test from 'node:test';
import assert from 'node:assert/strict';
import { startActivation, drainChildren, actorPersona } from '../src/host/subagents.mjs';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { Context } from '@deepseek-ai/cordis';

const signal = new AbortController().signal;
test('legacy activation removes only newer lifecycle and directory inputs', async () => {
  const parent = { id: 'parent' }, request = { parent, prompt: [], cwd: '/new', persona: 'literal {{name}}' };
  let received, drained;
  const ctx = { subagents: { startContinuable: spec => { received = spec; return { childId: 'child', messageId: 'message' }; },
    drainContinuableChildren: (agent, ids) => { drained = [agent, ids]; } } };
  assert.equal((await startActivation(ctx, { provider: 'spawn', label: 'Actor', delivery: 'caller', request, signal })).messageId, 'message');
  assert.deepEqual(received, { provider: 'spawn', label: 'Actor', request: { parent, prompt: [], persona: 'literal {{name}}' }, signal });
  await drainChildren(ctx, parent, ['child']); assert.deepEqual(drained, [parent, ['child']]);
});
test('new activation records only the exact child persona and removes its listener', { skip: !('appendPluginRecord' in await import('@deepseek-ai/dsh-session')) }, async t => {
  const root = new Context(); await root.plugin(SessionStore); t.after(() => root.fiber.dispose());
  const parent = { id: 'parent' }, childId = SessionId('child'), persona = 'literal {{name}}';
  const session = root.sessions.create(childId, { meta: { cwd: process.cwd(), origin: 'subagent', parentSession: SessionId(parent.id) } });
  let observer, removed = false;
  const ctx = { on(event, callback, options) { assert.equal(event, 'agent/created'); assert.equal(options.prepend, true); observer = callback; return () => { removed = true; }; },
    subagents: { async startActivation(spec) {
      assert(!('persona' in spec.request)); assert.equal(spec.request.cwd, '/new');
      observer({ agent: { id: 'unrelated', session } }); assert.equal(actorPersona(session.snapshotEvents()), undefined);
      observer({ agent: { id: childId, session } });
      return { childId, messageId: 'message' };
    } } };
  await startActivation(ctx, { provider: 'spawn', label: 'ZCode Actor · reader', childId, delivery: 'caller', request: { parent, prompt: [], cwd: '/new', persona }, signal });
  assert.equal(removed, true); assert.equal(actorPersona(session.snapshotEvents()), persona);
  assert.equal(session.snapshotEvents().find(event => event.type === 'plugin:omaa/zcode-actor-persona').ignorable, true);
});
