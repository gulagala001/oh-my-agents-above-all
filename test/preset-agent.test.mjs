import { presetHost } from './fixtures/preset-host.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/preset-agent.mjs';
import { apply as applyPiExtensions } from '../src/presets/pi/extensions.mjs';
import { promptFrame } from '../src/presets/pi/extension-prompt.mjs';

test('Pi Team membership preserves native communication without inheriting unrelated enhancement', async t => {
  const root = await presetHost(t);
  const owner = await root.agentLoop.create('preset-owner');
  let guard;
  const member = { id: 'member', session: { id: 'member', header: { origin: 'subagent' } } };
  const lead = { id: 'lead', session: { id: 'lead', header: { origin: 'user' } } };
  const ordinary = { id: 'ordinary', session: { id: 'ordinary', header: { origin: 'subagent' } } };
  const ctx = {
    tools: { setExecutor: executor => root.tools.setExecutor(executor), guard: fn => { guard = fn; } },
    systemPrompt: owner.ctx.systemPrompt, effect: fn => root.effect(fn), on() {}, inject() {},
    omaa: { enhancementEnabled: () => false, modeFor: () => 'default' },
    get: name => name === 'agentTeams' ? { tryMembership: agent => agent === member ? { role: 'teammate', name: 'member' } : agent === lead ? { role: 'lead' } : undefined } : undefined,
  };
  apply(ctx, { product: 'pi' });
  for (const name of ['send_message', 'list_agents', 'interrupt_agent', 'wait_agent']) {
    assert.equal(guard({ agent: member, name }), undefined, name + ' is native for a rostered member');
    assert.equal(guard({ agent: lead, name }), undefined, name + ' is native for the lead');
    assert.match(guard({ agent: ordinary, name }), /enhancement is disabled/, name + ' stays guarded outside Team');
  }
  for (const name of ['workflow', 'subagent', 'subagent_fork', 'computer_use', 'computer_use_reset', 'codegraph_index', 'job_kill']) {
    assert.match(guard({ agent: member, name }), /enhancement is disabled/, name + ' still uses the member preference');
  }
});

test('Pi final prompt assembly preserves native Team lead tools with enhancement disabled', async t => {
  const root = await presetHost(t);
  const agent = await root.agentLoop.create('lead', {}, { cwd: '/workspace', agentPreset: 'omaa-pi' });
  const ctx = agent.ctx;
  let membership = { role: 'lead' }, enhancement = false;
  ctx.provide('agentTeams', { tryMembership: () => membership });
  ctx.provide('commands', { register() {}, list: () => [] });
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
  ctx.provide('omaa', {
    product: () => ({ id: 'pi' }), modeFor: () => 'default', enhancementEnabled: () => enhancement,
    enhancementWorkModeFor: () => 'off', enhancementWorkSubmodeFor: () => 'free',
    piExtensions: { states: new Map(), settings: { read: () => ({ files: [] }) } },
  });
  ctx.provide('omaaPiResources', {
    prepare: async (_agent, _signal, ready) => { ready(); return { users: [], messages: [], customMessages: [], startsRun: false }; },
    frame: (_agent, assembly, tools) => promptFrame(assembly.sections, { tools: new Set(tools.map(tool => tool.name)), cwd: '/workspace', catalog: {} }),
  });
  const names = ['read', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent', 'workflow', 'subagent', 'subagent_fork', 'job_kill', 'computer_use'];
  for (const name of names) ctx.tools.register({ name, parameters: { type: 'object' }, output: { schema: { type: 'string' }, render: () => [] }, execute: () => '' });
  apply(ctx, { product: 'pi' });
  applyPiExtensions(ctx);
  const presented = async () => (await ctx.systemPrompt.assemble({ agent, scope: agent })).tools.map(tool => tool.name).sort();
  assert.deepEqual(await presented(), ['read', 'send_message', 'interrupt_agent', 'list_agents', 'wait_agent'].sort());
  membership = undefined;
  assert.deepEqual(await presented(), ['read']);
  enhancement = true;
  assert.deepEqual(await presented(), [...names].sort());
});
