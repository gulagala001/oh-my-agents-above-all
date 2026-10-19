import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/preset-agent.mjs';
import { apply as applyPiExtensions } from '../src/presets/pi/extensions.mjs';
import { promptFrame } from '../src/presets/pi/extension-prompt.mjs';

test('Pi Team membership preserves native communication without inheriting unrelated enhancement', () => {
  let guard;
  const member = { id: 'member', session: { id: 'member', header: { origin: 'subagent' } } };
  const lead = { id: 'lead', session: { id: 'lead', header: { origin: 'user' } } };
  const ordinary = { id: 'ordinary', session: { id: 'ordinary', header: { origin: 'subagent' } } };
  const ctx = {
    tools: { presentAs() {}, guard: fn => { guard = fn; } },
    systemPrompt: { section() {} }, on() {}, inject() {},
    omaa: { enhancementEnabled: () => false, modeFor: () => 'default' },
    get: name => name === 'agentTeams' ? { tryMembership: agent => agent === member ? { role: 'teammate', name: 'member' } : agent === lead ? { role: 'lead' } : undefined } : undefined,
  };
  apply(ctx, { product: 'pi' });
  for (const name of ['send_message', 'list_agents', 'interrupt_agent']) {
    assert.equal(guard({ agent: member, name }), undefined, name + ' is native for a rostered member');
    assert.equal(guard({ agent: lead, name }), undefined, name + ' is native for the lead');
    assert.match(guard({ agent: ordinary, name }), /enhancement is disabled/, name + ' stays guarded outside Team');
  }
  for (const name of ['workflow', 'subagent', 'computer_use', 'computer_use_reset', 'codegraph_index', 'job_kill']) {
    assert.match(guard({ agent: member, name }), /enhancement is disabled/, name + ' still uses the member preference');
  }
});

test('Pi final prompt assembly preserves native Team lead tools with enhancement disabled', async () => {
  const hooks = new Map(), states = new Map();
  const schemas = ['read', 'send_message', 'interrupt_agent', 'list_agents', 'workflow', 'subagent', 'job_kill', 'computer_use'].map(name => ({ name }));
  const agent = { id: 'lead', session: { id: 'lead', header: { origin: 'user', cwd: '/workspace' }, snapshotEvents: () => [] } };
  let membership = { role: 'lead' }, enhancement = false;
  const resources = {
    prepare: async () => ({ users: [], messages: [], customMessages: [], startsRun: false }),
    frame: (_agent, assembly, tools) => promptFrame(assembly.sections, { tools: new Set(tools.map(tool => tool.name)), cwd: '/workspace', catalog: {} }),
  };
  const ctx = {
    tools: { schemas: () => schemas, guard() {} },
    omaa: { product: () => ({ id: 'pi' }), enhancementEnabled: () => enhancement,
      piExtensions: { states, settings: { read: () => ({ files: [] }) } } },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    get: name => name === 'agentTeams' ? { tryMembership: () => membership } : name === 'omaaPiResources' ? resources : undefined,
    on: (name, fn) => hooks.set(name, fn), provide() {}, effect() {},
  };
  applyPiExtensions(ctx);
  const assemble = () => hooks.get('system-prompt/assemble')({}, { agent }, async () => ({
    tools: schemas, sections: [{ name: 'deployment:persona-prefix', text: 'Pi' }],
  }));
  assert.deepEqual((await assemble()).tools.map(tool => tool.name), ['read', 'send_message', 'interrupt_agent', 'list_agents']);
  membership = undefined;
  assert.deepEqual((await assemble()).tools.map(tool => tool.name), ['read']);
  enhancement = true;
  assert.deepEqual((await assemble()).tools, schemas);
});
