import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omaa-work-mode-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    await rm(directory, { recursive: true, force: true });
  });
  const tools = { schemas: () => [{ name: 'workflow', parameters: { properties: { resumeFromRunId: {} } } }] };
  const session = { id: 'mode-session', header: { agentPreset: 'omaa-pi' } };
  const agent = { id: session.id, session, status: 'idle', ctx: { get: name => name === 'tools' ? tools : undefined } };
  const workView = { savedMode: 'ultra', submode: 'free', savedSubmode: 'free', enabled: true,
    currentMode: 'ultra', currentSubmode: 'workflow', pending: true };
  const workControl = { inspect: async () => workView, select() {}, submode() {} };
  let hub;
  const omd = { installOmaaEnhancement() {}, omaaWorkMode: workControl };
  const ctx = {
    storageDomain: { open: async () => ({ table: () => ({}) }) }, attachments: {},
    agents: { get: () => agent, list: () => [agent] }, sessions: { flush: async () => {} },
    sessionProjections: { stateOf: () => undefined },
    effect() {}, on() {}, inject() {}, emit() {},
    get: name => name === 'trisoulX' ? omd : undefined,
    provide: (name, service) => { if (name === 'omaa') hub = service; },
  };
  await apply(ctx);
  hub.enhancementScopes.add(() => true);
  hub.workflowControllers.add({ matches: () => true, mode: 'omd' });
  await hub.update(session.id, { enhancement: true });
  return { hub, session, agent, workView, workControl };
}

test('OMAA keeps the current Ultra strategy distinct from the saved next-turn choice', async t => {
  const f = await fixture(t); f.agent.status = 'running';
  const { value } = await f.hub.inspect(f.session.id);
  assert.equal(value.enhancementWorkMode, 'ultra'); assert.equal(value.enhancementWorkSubmode, 'free');
  assert.equal(value.enhancementWorkModePending, true);
  assert.equal(value.enhancementWorkModeCurrent, 'ultra'); assert.equal(value.enhancementWorkSubmodeCurrent, 'workflow');
  assert.equal(value.enhancementWorkModeActive, true);
});

test('OMAA waits for bridge inspection instead of publishing a transitional mode', async t => {
  const f = await fixture(t);
  let complete;
  f.workControl.inspect = () => new Promise(resolve => { complete = resolve; });
  let finished = false;
  const reading = f.hub.inspect(f.session.id).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  complete(f.workView);
  assert.equal((await reading).value.enhancementWorkMode, 'ultra');
});
