import test from 'node:test';
import assert from 'node:assert/strict';
import { apply as applySessionContext } from '../src/presets/zcode/session-context.mjs';

const text = value => ({ type: 'text', text: value });
const hidden = { type: 'reasoning', text: 'HIDDEN_REASONING_MUST_NOT_APPEAR' };
const event = (seq, type, data) => ({ seq, type, data, time: 1700000000000 + seq });
const events = [
  event(0, 'turn/end', { reason: { kind: 'completed' } }),
  event(1, 'user/message', { id: 'user-1', source: { kind: 'user' }, content: [text('USER_ONLY_REQUIREMENT'), hidden] }),
  event(2, 'assistant/message', { turn: 2, step: 1, message: { id: 'assistant-1', content: [hidden, text('ASSISTANT_ONLY_DECISION: preserve BOM')] } }),
  event(3, 'tool/call', { callId: 'read-call', name: 'read', arguments: '{"file_path":"src/read-only.csv"}' }),
  event(4, 'tool/result', { message: { id: 'result-1', toolCallId: 'read-call', content: [text('TOOL_ONLY_FINDING'), hidden] } }),
  event(5, 'tool/call', { callId: 'edit-call', name: 'edit', arguments: '{"file_path":"src/changed.csv","old_string":"old","new_string":"new"}' }),
  event(6, 'tool/call', { callId: 'bad-call', name: 'edit', arguments: '{malformed-args' }),
  event(7, 'tool/call', { callId: 'null-call', name: 'read', arguments: 'null' }),
  event(8, 'tool/call', { callId: 'array-call', name: 'read', arguments: '["array-argument"]' }),
  event(9, 'turn/end', { reason: { kind: 'completed' } }),
];
const agent = { session: { id: 'current', requestHeader: () => ({ config: { provider: 'fixture', model: 'fixture' } }), snapshotEvents: () => [event(0, 'user/message', { source: { kind: 'user' }, content: [text('Continue target-session')] })] } };
async function* reply(value) { yield { type: 'text-delta', index: 0, text: value }; }
const requestText = request => request.messages.flatMap(message => message.content.map(part => part.text ?? '')).join('\n');

// Pi summary/fork/restart is covered against the installed native host in installed-pi-branches.test.mjs.
test('ZCode context retains native assistant-only text in model extraction and fallback', async () => {
  let tool, request, fail = false;
  applySessionContext({
    tools: { register: value => { tool = value; } },
    sessionQuery: { observeSession: async () => ({ header: { id: 'target-session', title: 'Prior session', cwd: '/fixture' }, events, inheritedEventCount: 0, [Symbol.dispose]() {} }) },
    llm: { stream: options => { request = options; if (fail) throw new Error('fixture unavailable'); return reply('MODEL_CONTEXT'); } },
  });
  const args = { sessionId: 'target-session', query: 'preserve BOM', strategy: 'handoff' };
  const exec = { agent, signal: new AbortController().signal };
  const extracted = await tool.execute(args, exec);
  assert.equal(extracted.source, 'model'); assert.equal(extracted.content, 'MODEL_CONTEXT');
  const material = requestText(request);
  assert.match(material, /assistant assistant-1\ncreated:.*\nASSISTANT_ONLY_DECISION: preserve BOM/);
  assert.match(material, /USER_ONLY_REQUIREMENT/); assert.match(material, /TOOL_ONLY_FINDING/);
  assert.match(material, /Tool result: read, returned/);
  assert.doesNotMatch(material, /HIDDEN_REASONING_MUST_NOT_APPEAR/);
  fail = true;
  const fallback = await tool.execute(args, exec);
  assert.equal(fallback.source, 'fallback');
  assert.match(fallback.content, /ASSISTANT_ONLY_DECISION: preserve BOM/);
  assert.match(fallback.content, /TOOL_ONLY_FINDING/);
  assert.doesNotMatch(fallback.content, /HIDDEN_REASONING_MUST_NOT_APPEAR/);
  assert(fallback.references.some(reference => reference.messageId === 'assistant-1' && reference.role === 'assistant'));
});
