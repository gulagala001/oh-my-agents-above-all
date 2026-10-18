import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/preset-agent.mjs';

test('Pi Team membership preserves native communication without inheriting unrelated enhancement', () => {
  let guard;
  const member = { id: 'member', session: { id: 'member', header: { origin: 'subagent' } } };
  const ordinary = { id: 'ordinary', session: { id: 'ordinary', header: { origin: 'subagent' } } };
  const ctx = {
    tools: { presentAs() {}, guard: fn => { guard = fn; } },
    systemPrompt: { section() {} }, on() {}, inject() {},
    omaa: { enhancementEnabled: () => false, modeFor: () => 'default' },
    get: name => name === 'agentTeams' ? { tryMembership: agent => agent === member ? { role: 'teammate', name: 'member' } : undefined } : undefined,
  };
  apply(ctx, { product: 'pi' });
  for (const name of ['send_message', 'list_agents', 'interrupt_agent']) {
    assert.equal(guard({ agent: member, name }), undefined, name + ' is native for a rostered member');
    assert.match(guard({ agent: ordinary, name }), /enhancement is disabled/, name + ' stays guarded outside Team');
  }
  for (const name of ['workflow', 'subagent', 'computer_use', 'computer_use_reset', 'codegraph_index', 'job_kill']) {
    assert.match(guard({ agent: member, name }), /enhancement is disabled/, name + ' still uses the member preference');
  }
});
