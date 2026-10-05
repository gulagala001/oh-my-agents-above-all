import test from 'node:test';
import assert from 'node:assert/strict';
import { installedHost, textReply } from './fixtures/installed-host.mjs';
import { branchPrompt } from '../src/presets/pi/branches.mjs';

test('Pi branches fork the native completed prefix and retain an explicit branch summary after restart', { timeout: 45000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const { sessionId } = await f.create('omaa-pi');
  await f.prompt(sessionId, 'PI_COMMON_ANCESTOR: preserve the existing DSH model.');
  await f.prompt(sessionId, 'PI_DEPARTED_BRANCH: choose the CSV parser and preserve BOM.');
  const api = async (id, body) => {
    const response = await fetch(f.origin + '/omaa/api/pi-branches?session=' + encodeURIComponent(id), { headers: { cookie: f.cookie, 'content-type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const state = await api(sessionId); assert.equal(state.status, 200);
  assert.equal(state.value.points.length, 2); assert(state.value.canFork);
  const from = f.requests.length;
  f.replyWith(payload => !payload.tools?.length ? textReply('## Goal\nPreserve BOM in the CSV parser.\n## Key Decisions\nPI_BRANCH_CAPSULE: use the selected parser with literal {{PI_LITERAL}}.') : textReply('Branch continued.'));
  const fork = await api(sessionId, { head: state.value.head, atSeq: state.value.points[0].seq, withSummary: true });
  assert.equal(fork.status, 200, JSON.stringify(fork.value)); assert(fork.value.summaryIncluded);
  assert.notEqual(fork.value.sessionId, sessionId); assert.equal(fork.value.parentSessionId, sessionId);
  const summary = f.requests.slice(from).find(payload => !payload.tools?.length);
  assert(summary); assert(summary.messages.some(message => (typeof message.content === 'string' ? message.content : (message.content ?? []).map(part => part.text ?? '').join('\n')).includes(branchPrompt)));
  assert(JSON.stringify(summary.messages).includes('PI_DEPARTED_BRANCH'));
  assert(!JSON.stringify(summary.messages).includes('PI_COMMON_ANCESTOR'));
  assert.equal((await api(sessionId)).value.head, state.value.head, 'fork and summary must not modify the source journal');
  const child = await f.snapshot(fork.value.sessionId);
  assert(JSON.stringify(child.records).includes('PI_COMMON_ANCESTOR')); assert(!JSON.stringify(child.records).includes('PI_DEPARTED_BRANCH'));
  await f.stop(); await f.boot();
  await f.prompt(fork.value.sessionId, 'Continue the selected branch using its retained summary.');
  const current = f.requests.findLast(payload => payload.tools?.length);
  assert.equal(current.model, summary.model); assert(JSON.stringify(current.messages).includes('PI_BRANCH_CAPSULE'));
  assert(JSON.stringify(current.messages).includes('{{PI_LITERAL}}'));
  const branches = (await api(fork.value.sessionId)).value.branches;
  assert(branches.some(row => row.sessionId === fork.value.sessionId && row.parentSessionId === sessionId && row.current));
  assert(branches.some(row => row.sessionId === sessionId));
  assert.equal((await api(sessionId, { head: -1, withSummary: false })).status, 409);
  assert.deepEqual(f.errors, []);
});
