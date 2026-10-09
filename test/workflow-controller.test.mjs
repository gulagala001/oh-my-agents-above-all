import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as controller from '../src/workflow-controller.mjs';
import * as enhancement from '../src/enhancement.mjs';

const cli = process.env.OMAA_TEST_HOST_CLI ?? fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url));
const host = createRequire(await realpath(cli)), minimal = createRequire(host.resolve('@deepseek-ai/dsh-sdk-minimal'));
const agent = createRequire(minimal.resolve('@deepseek-ai/dsh-agent'));
const { Context } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis')));
const { Loader, EntryTree } = await import(pathToFileURL(host.resolve('@deepseek-ai/cordis-plugin-loader')));
const scopes = await import(pathToFileURL(agent.resolve('@deepseek-ai/dsh-scope')));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (check()) return; await tick(); }
  throw Error('Workflow transition barrier timed out');
}

async function nativeRoot() {
  const root = new Context();
  await root.plugin(Loader);
  await root.loader.root.update([{ id: 'host-native', name: '@deepseek-ai/dsh-workflow-ptc', disabled: true }]);
  const native = [...root.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-workflow-ptc');
  native.parent.tree.import = async name => { assert.equal(name, '@deepseek-ai/dsh-scope'); return scopes; };
  return { root, native };
}

// Real Cordis, Loader, scopes and product modules. The maintenance substitute
// records the first queued observation when the actual product releases it.
async function withController(kind, check) {
  const { root } = await nativeRoot();
  try {
    await root.plugin({ inject: ['loader'], async apply(host) {
      const revision = {}, preset = scopes.createScope(host, revision);
      const agentScope = scopes.createScope(host, {}, { parent: revision });
      await preset.ctx.fiber.await(); await agentScope.ctx.fiber.await();
      let provider, definitions = [], queued = false, busy = false;
      const observations = [], hub = { workflowControllers: new Set() };
      const nativeEntered = Promise.withResolvers(), nativeGate = Promise.withResolvers();
      const oldDisposeEntered = Promise.withResolvers(), oldDisposeGate = Promise.withResolvers();
      const enhancedEntered = Promise.withResolvers(), enhancedGate = Promise.withResolvers();
      const member = {
        id: 'fixture-agent', ctx: agentScope.ctx, whenIdle: () => Promise.resolve(),
        runMaintenance(callback) {
          if (busy) throw Error('busy');
          busy = true;
          return Promise.resolve(callback()).finally(() => {
            busy = false;
            if (queued) { observations.push(definitions.map(row => row.version)); queued = false; }
          });
        },
      };
      for (const [name, value] of Object.entries({
        omaa: hub, agents: { list: () => kind.startsWith('initial-') ? [] : [member] },
        tools: { schemas: () => definitions }, systemPrompt: {},
        subagents: { getProvider: () => provider }, ptcRuntime: {}, sandboxPolicy: {},
      })) root.provide(name, value);
      const makeEngine = version => ({ async apply(ctx) {
        nativeEntered.resolve();
        if (version === 'native' && kind === 'initial-failure') throw Error('fixture-native-failure');
        ctx.provide('workflowEngine', { version });
        if (version === 'native' && kind === 'initial-dispose') await nativeGate.promise;
      } });
      const makeTool = version => ({ apply(ctx) { ctx.effect(() => {
        assert.equal(definitions.length, 0, 'Only one workflow tool may be registered');
        const value = { name: 'workflow', version, parameters: { properties: version === 'native' ? {} : { resumeFromRunId: {} } } };
        definitions.push(value);
        return async () => {
          if (version === 'native' && kind === 'provider-reload') { oldDisposeEntered.resolve(); await oldDisposeGate.promise; }
          definitions = definitions.filter(row => row !== value);
        };
      }); } });
      const modules = Object.fromEntries(['native', 'v1', 'v2'].flatMap(version => [
        ['engine-' + version, makeEngine(version)], ['tool-' + version, makeTool(version)],
      ]));
      modules.stage = { async apply() { enhancedEntered.resolve(); await enhancedGate.promise; } };
      class FixtureTree extends EntryTree {
        write() {}
        async import(name) { return name === 'controller' ? controller : modules[name]; }
      }
      const tree = new FixtureTree(preset.ctx);
      await tree.root.update([{ id: 'controller', name: 'controller', isolate: { workflowEngine: true },
        config: { native: [{ name: 'engine-native' }, { name: 'tool-native' }] } }]);
      const bridge = version => ({ omaaWorkflowComposition: () => [
        { name: 'engine-' + version }, { name: 'tool-' + version },
        ...kind === 'provider-removed' ? [{ name: 'stage' }] : [],
      ] });
      await check({ root, hub, entry: tree.store.controller, nativeEntered, nativeGate,
        oldDisposeEntered, oldDisposeGate, enhancedEntered, enhancedGate, observations,
        schemas: () => definitions, queue: () => { queued = true; },
        setProvider: value => { provider = value; }, bridge });
    } });
  } finally { await root.fiber.dispose(); }
}

test('failed initial native branch leaves no controller or tool registrations', async () => {
  await withController('initial-failure', async f => {
    await f.nativeEntered.promise;
    await assert.rejects(f.entry.fiber.await(), /fixture-native-failure/);
    assert.equal(f.hub.workflowControllers.size, 0); assert.equal(f.schemas().length, 0);
  });
});
test('disposing during initialization releases the controller and child tools', async () => {
  await withController('initial-dispose', async f => {
    await f.nativeEntered.promise; assert.equal(f.hub.workflowControllers.size, 1);
    const disposal = f.entry.fiber.dispose(); f.nativeGate.resolve(); await disposal;
    assert.equal(f.hub.workflowControllers.size, 0); assert.equal(f.schemas().length, 0);
  });
});
test('a provider removed during mount cannot reach the first queued turn', async () => {
  await withController('provider-removed', async f => {
    await f.entry.fiber.await(); f.setProvider({ name: 'omd-workflow', version: 1 });
    f.root.provide('trisoulX', f.bridge('v1')); f.root.emit('subagent/provider-added', { name: 'omd-workflow' });
    await f.enhancedEntered.promise; f.queue(); f.setProvider(undefined);
    f.root.emit('subagent/provider-removed', 'omd-workflow'); f.enhancedGate.resolve();
    await until(() => f.observations.length === 1);
    assert.deepEqual(f.observations, [['native']]); assert.equal([...f.hub.workflowControllers][0].mode, 'native');
    assert.equal(f.schemas().length, 1);
  });
});
test('async old-owner teardown installs the latest provider before releasing input', async () => {
  await withController('provider-reload', async f => {
    await f.entry.fiber.await(); f.setProvider({ name: 'omd-workflow', version: 1 });
    const remove = f.root.provide('trisoulX', f.bridge('v1')); f.root.emit('subagent/provider-added', { name: 'omd-workflow' });
    await f.oldDisposeEntered.promise; f.queue(); f.setProvider(undefined);
    f.root.emit('subagent/provider-removed', 'omd-workflow'); await remove();
    f.setProvider({ name: 'omd-workflow', version: 2 }); f.root.provide('trisoulX', f.bridge('v2'));
    f.root.emit('subagent/provider-added', { name: 'omd-workflow' }); f.oldDisposeGate.resolve();
    await until(() => f.observations.length === 1);
    assert.deepEqual(f.observations, [['v2']]); assert.equal([...f.hub.workflowControllers][0].mode, 'omd');
    assert.equal(f.schemas().length, 1);
  });
});
test('enhancement readiness cannot be registered after its owner is disposed', async () => {
  const { root, native } = await nativeRoot(), gate = Promise.withResolvers(), entered = Promise.withResolvers();
  try {
    const hub = { enhancementScopes: new Set(), enhancementEnabled: () => false };
    for (const [name, value] of Object.entries({ omaa: hub, tools: { guard() {} }, systemPrompt: {} })) root.provide(name, value);
    root.provide('trisoulX', { installOmaaEnhancement: async () => [] });
    native.parent.tree.import = async () => { entered.resolve(); await gate.promise; return scopes; };
    const outer = await root.plugin(enhancement); await entered.promise;
    const runtime = [...root.registry.values()].find(row => row.name === 'omaa-optional-enhancement');
    const disposal = [...runtime.fibers][0].dispose(); gate.resolve(); await disposal;
    assert.equal(hub.enhancementScopes.size, 0); assert.equal(outer.state, 2);
  } finally { gate.resolve(); await root.fiber.dispose(); }
});
