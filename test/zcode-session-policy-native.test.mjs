import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const authorizedSessionPolicy = process.env.OMAA_TEST_SAFE === '1' && process.env.OMAA_TEST_SOURCE_LINKED === '1'
  && process.env.OMAA_TEST_SESSION_SANDBOX_MODE === 'danger-full-access';
test('authorized fixture changes only one session sandbox mode, retains ask and runs real Node PTC', { timeout: 60000, skip: !authorizedSessionPolicy }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, sessionSandboxMode: 'danger-full-access' });
  await f.install(); await f.boot();
  const control = await f.call('session/create', { request: { cwd: f.workspace, agentPreset: 'omaa-zcode' } });
  const controlBefore = await f.policy(control.sessionId);
  assert.deepEqual(controlBefore.after, { sandbox: 'workspace-write', approval: 'ask' });
  const { sessionId } = await f.create('omaa-zcode');
  const receipt = f.sessionPolicies.at(-1);
  assert.equal(receipt.sessionId, sessionId);
  assert.deepEqual(receipt.before, { sandbox: 'workspace-write', approval: 'ask' });
  assert.deepEqual(receipt.after, { sandbox: 'danger-full-access', approval: 'ask' });
  assert.deepEqual(receipt.globalBefore, receipt.globalAfter);
  assert.equal(receipt.approvalEventsBefore, receipt.approvalEventsAfter);
  assert.deepEqual(receipt.appendedEventTypes, ['sandbox/mode']);
  assert.deepEqual((await f.policy(control.sessionId)).after, controlBefore.after);
  const plan = [{ name: 'skill', args: { name: 'zcode-workflows' } },
    { name: 'create_workflow', args: { script: 'return { actualGuestValue: 42 };', run_in_background: false } }];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Owned policy fixture');
    const next = plan.shift(); return next ? toolReply(next.name, next.args) : textReply('Actual PTC finished.');
  });
  const result = await f.prompt(sessionId, 'Explicitly run the owned Node PTC fixture.');
  const call = result.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'create_workflow')?.event;
  const output = result.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(output && !output.data.message.isError, JSON.stringify(output));
  const outcome = JSON.parse(textOf(output.data.message));
  assert.equal(outcome.ok, true, JSON.stringify(outcome)); assert.deepEqual(outcome.value, { actualGuestValue: 42 });
  assert.equal(outcome.sandbox.mode, 'danger-full-access');
  assert.deepEqual((await f.policy(sessionId)).after, receipt.after);
  assert.deepEqual((await f.policy(control.sessionId)).after, controlBefore.after);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_POLICY_EVIDENCE) await writeFile(process.env.OMAA_POLICY_EVIDENCE,
    JSON.stringify({ receipt, control: controlBefore, outcome, realModelInference: false, noPlatformPermissionChange: true }, null, 2) + '\n');
});
