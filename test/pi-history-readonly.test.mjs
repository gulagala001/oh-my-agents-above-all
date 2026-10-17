import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { piHistoryEntries, readPiHistory } from '../src/presets/pi/history.mjs';

const host = createRequire(realpathSync(new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
const load = name => import(pathToFileURL(host.resolve(name)).href);
const [{ Context }, { default: SessionStore, SessionId }, { SessionQueryEngine }, { createUserMessage }] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-session-query'), load('@deepseek-ai/dsh-llm'),
]);
class Query extends SessionQueryEngine {}
const options = { content: async blocks => structuredClone(blocks), argumentsFor: (_name, args) => args };

test('complete raw messages and current branch share one immutable native observation', async t => {
  const ctx = new Context(); await ctx.plugin(SessionStore); await ctx.plugin(Query);
  t.after(() => ctx.fiber.dispose());
  const session = ctx.sessions.create(SessionId('pi-complete-history'));
  const original = '原文完整保留🙂'.repeat(900);
  let first;
  for (let i = 0; i < 105; i++) {
    const event = session.append('user/message', createUserMessage({ source: { kind: 'user' },
      content: [{ type: 'text', text: i === 0 ? original : `USER_${i}` }] }), { surfaceOp: 'append' });
    first ??= event;
  }
  session.append('user/message', createUserMessage({ source: { kind: 'plugin:test' }, content: [{ type: 'text', text: 'CURRENT_REPLACEMENT' }] }),
    { surfaceOp: { op: 'replace', startSeq: first.seq, endSeq: first.seq }, sourceEventSeqs: [first.seq] });
  const value = await readPiHistory(ctx.sessionQuery, session.id, options);
  assert.equal(value.entries.length, 106); assert.equal(value.branch.length, 105);
  assert.equal(value.entries[0].message.content[0].text, original);
  assert(!value.branch.some(entry => entry.id === String(first.seq)), 'shadowed original never masquerades as current context');
  const nativeSurface = await ctx.sessionQuery.readSurface(session.id);
  assert.deepEqual(value.branch.map(entry => entry.id), nativeSurface.events.filter(event => event.type === 'user/message').map(event => String(event.seq)));
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const pending = readPiHistory(ctx.sessionQuery, session.id, { ...options, content: async blocks => { entered(); await gate; return blocks; } });
  await ready;
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'LATE_MESSAGE' }] }), { surfaceOp: 'append' });
  release();
  assert.equal((await pending).entries.length, 106, 'async attachment work cannot move the captured native cut');
  assert.equal((await readPiHistory(ctx.sessionQuery, session.id, options)).entries.length, 107);
});

test('message adaptation preserves complete thinking, attachment bytes, native blocks, call input and result identity', async () => {
  const raw = '{"file_path":"a.txt","large":900719925474099312345}';
  const events = [
    { type: 'tool/call', seq: 0, time: 1000, data: { callId: 'call', name: 'read' } },
    { type: 'assistant/message', seq: 1, time: 1001, data: { message: { source: { model: 'actual-model' }, content: [
      { type: 'reasoning', text: 'THINKING_' + '深'.repeat(5000) }, { type: 'tool-call', name: 'read', id: 'call', arguments: raw },
    ] }, usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } } },
    { type: 'tool/result', seq: 2, time: 1002, data: { message: { toolCallId: 'call', content: [
      { type: 'image', attachment: { attachmentId: 'owned-image' } }, { type: 'file', attachment: { attachmentId: 'owned-file', name: 'a.txt', bytes: 7 } },
    ], isError: false }, meta: { piExtension: { details: { source: 'actual-result' } } } } },
  ];
  const mapped = await piHistoryEntries(events, { ...options, content: async blocks => blocks.map(block => block.type === 'image'
    ? { type: 'image', data: Buffer.from('actual image bytes').toString('base64'), mimeType: 'image/png' } : block) });
  assert.equal(mapped[0].message.content[0].thinking, events[1].data.message.content[0].text);
  assert.equal(mapped[0].message.content[1].argumentsRaw, raw, 'retain the exact native argument material, including numbers beyond JS precision');
  assert.equal(mapped[0].message.usage.input, 12); assert.equal(mapped[0].message.usage.cost, undefined);
  assert.equal(mapped[1].message.toolName, 'read'); assert.equal(mapped[1].message.toolCallId, 'call');
  assert.equal(Buffer.from(mapped[1].message.content[0].data, 'base64').toString(), 'actual image bytes');
  assert.deepEqual(mapped[1].message.content[1], events[2].data.message.content[1]);
  assert.deepEqual(mapped[1].message.details, { source: 'actual-result' });
});

test('reused native call IDs retain each result dispatch identity and never resolve future calls', async () => {
  const call = (seq, name) => ({ type: 'tool/call', seq, time: seq, data: { callId: 'reused', name } });
  const result = (seq, linked) => ({ type: 'tool/result', seq, time: seq,
    ...(linked === undefined ? {} : { sourceEventSeqs: [linked] }),
    data: { message: { toolCallId: 'reused', content: [{ type: 'text', text: String(seq) }] } } });
  const events = [call(1, 'read'), result(2, 1), call(3, 'write'), result(4), result(5, 1), call(6, 'future')];
  const value = await piHistoryEntries(events, options);
  assert.deepEqual(value.map(entry => entry.message.toolName), ['read', 'write', 'read']);
});

test('content-only native result replacements inherit the original dispatch through their result chain', async () => {
  const call = (seq, name) => ({ type: 'tool/call', seq, time: seq, data: { callId: 'reused', name } });
  const result = (seq, linked, id) => ({ type: 'tool/result', seq, time: seq, sourceEventSeqs: [linked],
    data: { message: { id, toolCallId: 'reused', content: [{ type: 'text', text: String(seq) }] } } });
  const events = [call(1, 'read'), result(2, 1, 'original-read'), call(3, 'write'), result(4, 3, 'original-write'),
    result(5, 2, 'original-read'), result(6, 5, 'original-read')];
  assert.deepEqual((await piHistoryEntries(events, options)).map(entry => entry.message.toolName), ['read', 'write', 'read', 'read']);
  assert.equal((await piHistoryEntries(events, { ...options, selected: [6, 4] }))[0].message.toolName, 'read');
});

test('image conversion is shared only within one immutable observation and errors always dispose it', async () => {
  const image = { type: 'image', attachment: { attachmentId: 'same-image' } };
  const events = [{ type: 'user/message', seq: 0, time: 0, surfaceOp: 'append', data: { content: [image, image] } }];
  let disposed = 0, conversions = 0;
  const query = { async observeSession() { return { events, header: {}, cursor: 0, [Symbol.dispose]() { disposed++; } }; } };
  const convert = async () => { conversions++; return [{ type: 'image', data: 'Ynl0ZXM=', mimeType: 'image/png' }]; };
  const value = await readPiHistory(query, 'owned', { ...options, content: convert });
  assert.equal(conversions, 1); assert.equal(disposed, 1);
  assert.equal(value.branch[0].message.content.length, 2);
  await readPiHistory(query, 'owned', { ...options, content: convert });
  assert.equal(conversions, 2, 'later cut re-reads the native attachment');
  await assert.rejects(readPiHistory(query, 'owned', { ...options, content: async () => { throw Error('native image read failed'); } }), /native image read failed/);
  assert.equal(disposed, 3);
});
