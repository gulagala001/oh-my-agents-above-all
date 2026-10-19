import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { apply as applyBranches } from '../src/presets/pi/branches.mjs';
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

// Invoke the production services, so assertions cover the actual material passed
// to the native assembler/model and the persisted Pi file lists.
test('Pi branch summary reads rc.2 messages and JSON tool arguments', async t => {
  const root = await mkdtemp(new URL('../.local-history-', import.meta.url).pathname);
  const previousHome = process.env.DSH_HOME; process.env.DSH_HOME = root;
  t.after(async () => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; await rm(root, { recursive: true, force: true }); });
  let request, forked = false;
  const ctx = {
    omaa: { inspect: async () => ({ agent, value: { product: { id: 'pi' }, running: false } }) },
    systemPrompt: { variable() {}, context() {} },
    sessionController: { inspect: async () => ({ events }), fork: async input => { assert.equal(input.atSeq, 0); forked = true; return { sessionId: 'child' }; } },
    llm: { stream: options => { request = options; return reply('CAPSULE'); } }, effect: effect => effect(),
  };
  applyBranches(ctx);
  const result = await ctx.omaa.piBranches.fork('current', { head: 9, atSeq: 0, withSummary: true });
  const material = requestText(request);
  assert.match(material, /ASSISTANT_ONLY_DECISION: preserve BOM/);
  assert.match(material, /USER_ONLY_REQUIREMENT/);
  assert.match(material, /TOOL_ONLY_FINDING/);
  assert.doesNotMatch(material, /HIDDEN_REASONING_MUST_NOT_APPEAR/);
  assert.match(material, /read\(file_path="src\/read-only.csv"\)/);
  assert.match(material, /edit\(\{malformed-args\)/);
  assert.match(material, /read\(null\)/);
  assert.match(material, /read\(\["array-argument"\]\)/);
  assert.equal(forked, true); assert.equal(result.summaryIncluded, true);
  const capsule = JSON.parse(await readFile(join(root, 'omaa/pi-branch-context', createHash('sha256').update('child').digest('hex') + '.json'), 'utf8')).text;
  assert.match(capsule, /<read-files>\nsrc\/read-only.csv\n<\/read-files>/);
  assert.match(capsule, /<modified-files>\nsrc\/changed.csv\n<\/modified-files>/);
});

test('ZCode context retains rc.2 assistant-only text in model extraction and fallback', async () => {
  let tool, request, fail = false;
  applySessionContext({
    tools: { register: value => { tool = value; } },
    sessionController: { inspect: async () => ({ meta: { id: 'target-session', title: 'Prior session', cwd: '/fixture' }, events }) },
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
