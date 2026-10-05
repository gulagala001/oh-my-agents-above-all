import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

const text = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const system = payload => payload.messages.filter(message => message.role === 'system').map(text).join('\n');
const lastUser = payload => text(payload.messages.findLast(message => message.role === 'user'));
const probe = (f, marker, from = 0) => f.requests.slice(from).filter(payload => payload.tools?.length && JSON.stringify(payload.messages).includes(marker));
async function nativeCompactInstruction() {
  const require = createRequire(await realpath(new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
  const source = await readFile(require.resolve('@deepseek-ai/dsh-compaction-basic'), 'utf8');
  const tag = source.match(/const SUMMARY_OPEN_TAG = "([^"]+)";/)?.[1];
  const array = source.match(/const COMPACTION_INSTRUCTION = \[([\s\S]*?)\]\.join\("\\n"\);/)?.[1];
  assert(tag && array, 'fixed native compaction source entry unavailable');
  return array.split('\n').map(line => line.trim().replace(/,$/, '')).filter(Boolean).map(line => {
    if (line.startsWith('"')) return JSON.parse(line);
    assert(line.startsWith('`') && line.endsWith('`'), 'unexpected native instruction expression');
    return line.slice(1, -1).replace('${SUMMARY_OPEN_TAG}', tag);
  }).join('\n');
}

// One real package install serves the distinct rules, compaction and inbox checks.
test('installed DSH applies scoped Cursor rules, native product compaction and steer/queue boundaries', { timeout: 300000 }, async t => {
  const f = await installedHost(t);
  await mkdir(join(f.workspace, '.cursor/rules'), { recursive: true });
  await mkdir(join(f.workspace, 'src'));
  const rule = (name, header, body) => writeFile(join(f.workspace, '.cursor/rules', name + '.mdc'), '---\n' + header + '\n---\n' + body);
  await rule('always', 'alwaysApply: true', 'FIRST_ACTUAL_ALWAYS {{literal}}');
  await rule('manual', '', 'FIRST_ACTUAL_MANUAL');
  await rule('typed', 'globs: src/**/*.ts', 'AFTER_REAL_READ_GLOB');
  await rule('agent', 'description: Choose backend conventions', 'AFTER_REAL_RULE_REQUEST');
  await writeFile(join(f.workspace, 'src/entry.ts'), 'export const actual = 1;\n');
  await f.install(); await f.boot();
  const cursor = await f.create('omaa-cursor');
  await t.test('first provider request has always/manual, later read and requested rule update their next request', async () => {
    let phase = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (phase++ === 0) return toolReply('read', { file_path: 'src/entry.ts' });
      if (phase === 2) return toolReply('cursor_rule', { name: 'agent' });
      return textReply('Rules inspected on native requests.');
    });
    const from = f.requests.length;
    await f.prompt(cursor.sessionId, 'RULES_ACTUAL_FIRST: use @manual. Read the file and choose backend conventions.');
    const requests = probe(f, 'RULES_ACTUAL_FIRST', from);
    assert.equal(requests.length, 3);
    assert(system(requests[0]).includes('FIRST_ACTUAL_ALWAYS {{literal}}'));
    assert(system(requests[0]).includes('FIRST_ACTUAL_MANUAL'));
    assert(!system(requests[0]).includes('AFTER_REAL_READ_GLOB'));
    assert(!system(requests[0]).includes('AFTER_REAL_RULE_REQUEST'));
    assert(system(requests[0]).includes('Choose backend conventions'), 'Agent Requested catalog must be visible without its body');
    assert(system(requests[1]).includes('AFTER_REAL_READ_GLOB'));
    assert(!system(requests[1]).includes('AFTER_REAL_RULE_REQUEST'));
    assert(system(requests[2]).includes('AFTER_REAL_RULE_REQUEST'));
    f.replyWith();
  });
  await t.test('each preset manual /compact routes its actual instruction and closes the native transaction', async () => {
    const fallback = await nativeCompactInstruction();
    for (const product of products) {
      const session = product.id === 'cursor' ? cursor : await f.create(product.preset);
      const module = await import(`../src/presets/${product.id}/prompt.mjs`);
      const expected = module.buildCompactionPrompt() ?? fallback;
      await f.prompt(session.sessionId, 'COMPACT_OLDER_' + product.id + ': ' + 'Stable loopback history detail. '.repeat(500));
      await f.prompt(session.sessionId, 'COMPACT_RECENT_' + product.id + ': ' + 'Recent loopback history detail. '.repeat(100));
      const before = await f.snapshot(session.sessionId), from = f.requests.length;
      f.replyWith(payload => lastUser(payload) === expected ? textReply('NATIVE_CHECKPOINT_' + product.id) : undefined);
      const result = await f.call('commands/execute', { agentId: session.sessionId, line: '/compact', submittedAttachments: [] });
      assert.match(JSON.stringify(result), /Compacted/, product.id + ': ' + JSON.stringify(result));
      const summarize = f.requests.slice(from).find(payload => lastUser(payload) === expected);
      assert(summarize, product.id + ' compaction instruction absent from provider payload');
      assert.equal(lastUser(summarize), expected);
      const snapshot = await f.snapshot(session.sessionId);
      const events = snapshot.records.map(record => record.event).filter(Boolean);
      const start = events.findLast(event => event.type === 'compaction/start');
      const summary = events.findLast(event => event.type === 'compaction/summary');
      const end = events.findLast(event => event.type === 'compaction/end');
      assert(start && summary && end, product.id + ' native compaction lifecycle missing');
      assert.equal(start.data.compactionId, summary.data.compactionId); assert.equal(end.data.compactionId, summary.data.compactionId);
      assert(!end.data.error); assert(summary.data.shadowedSeqs.length > 0);
      assert(events.some(event => event.type === 'system/message' && !summary.data.shadowedSeqs.includes(event.seq)), 'first system message must remain outside compaction');
      assert.equal(start.data.turn, null, 'manual compaction must be an idle-session transaction');
      const turns = value => value.records.map(record => record.event).filter(event => event?.type === 'turn/start' || event?.type === 'turn/end').map(event => [event.seq, event.type, event.data.turn]);
      assert.deepEqual(turns(snapshot), turns(before), 'manual compaction must preserve native turn boundaries');
      f.replyWith();
      const continuedFrom = f.requests.length;
      await f.prompt(session.sessionId, 'AFTER_COMPACT_' + product.id);
      assert(probe(f, 'AFTER_COMPACT_' + product.id, continuedFrom).some(payload => JSON.stringify(payload.messages).includes('NATIVE_CHECKPOINT_' + product.id)), product.id + ' continued request omitted native checkpoint');
    }
  });
  await t.test('native steer is delivered after the tool batch in the current turn and queue starts the next turn', async () => {
    const session = await f.create('omaa-pi');
    let phase = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (phase++ === 0) {
        const one = toolReply('read', { file_path: 'src/entry.ts' });
        one.delta.tool_calls.push({ ...toolReply('read', { file_path: 'src/entry.ts' }).delta.tool_calls[0], index: 1 });
        return one;
      }
      return textReply(phase === 2 ? 'Steered turn complete.' : 'Queued turn complete.');
    });
    const from = f.requests.length, release = f.holdNextReply();
    await f.send(session.sessionId, 'INBOX_INITIAL');
    await until(() => probe(f, 'INBOX_INITIAL', from).length === 1);
    await f.send(session.sessionId, 'INBOX_QUEUE_LATER', 'queue');
    await f.send(session.sessionId, 'INBOX_STEER_NOW', 'steer');
    release();
    await until(async () => !(await f.api(session.sessionId)).value.running && probe(f, 'INBOX_QUEUE_LATER', from).length > 0);
    const requests = probe(f, 'INBOX_INITIAL', from);
    assert.equal(requests.length, 3);
    assert(JSON.stringify(requests[1].messages).includes('INBOX_STEER_NOW'));
    assert(!JSON.stringify(requests[1].messages).includes('INBOX_QUEUE_LATER'));
    assert.equal(requests[1].messages.filter(message => message.role === 'tool').length, 2, 'steering must follow both native tool results');
    assert(JSON.stringify(requests[2].messages).includes('INBOX_QUEUE_LATER'));
    const snapshot = await f.snapshot(session.sessionId), events = snapshot.records.map(record => record.event).filter(Boolean);
    const steer = events.find(event => event.type === 'user/message' && JSON.stringify(event.data).includes('INBOX_STEER_NOW'));
    const queued = events.find(event => event.type === 'user/message' && JSON.stringify(event.data).includes('INBOX_QUEUE_LATER'));
    const end = events.find(event => event.type === 'turn/end');
    assert(steer.seq < end.seq && queued.seq > end.seq, 'native inbox turn boundary must separate steer from queued follow-up');
    f.replyWith();
  });
  assert.deepEqual(f.errors, []);
});
