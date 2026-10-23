import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

const enabled = process.env.OMAA_ZCODE_OFFLINE_INSTALL === '1' && process.env.OMAA_TEST_SESSION_SANDBOX_MODE === 'danger-full-access';
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
test('native offline plugin installation loads the exact owned package and real ZCode tools', { timeout: 150000, skip: !enabled }, async t => {
  const evidenceDir = resolve(process.env.OMAA_PACKAGE_INSTALL_EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: false, offlineInstall: true, installTimeoutMs: 120000 });
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    await writeFile(join(evidenceDir, 'cleanup.json'), JSON.stringify(f.evidence.cleanup, null, 2) + '\n');
  });
  assert.equal(f.evidence.loadMode, 'installed-package');
  assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256);
  await f.install();
  const installed = await f.installedEvidence();
  assert.equal(installed.nativeHostDetection.version, '0.2.1-alpha.2');
  for (const [name, sdk] of Object.entries(installed.sdk)) {
    assert.equal(sdk.pluginModule, sdk.hostModule, name + ' native SDK identity');
    assert.equal(sdk.pluginVersion, sdk.hostVersion, name + ' native SDK version');
  }
  await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  const control = await f.call('session/create', { request: { cwd: f.workspace, agentPreset: 'omaa-zcode' } });
  const plan = [{ name: 'skill', args: { name: 'zcode-workflows' } },
    { name: 'save_workflow', args: { name: 'installed-proof', scope: 'project', description: 'Owned offline installed definition', facade: 'zcode', script: 'return args;' } },
    { name: 'read_saved_workflow', args: { name: 'installed-proof', scope: 'project' } },
    { name: 'create_workflow', args: { script: 'const broken: = ;', run_in_background: false } },
    { name: 'create_workflow', args: { script: 'return { installedGuestValue: 42 };', run_in_background: false } }];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Owned installed package');
    const next = plan.shift(); return next ? toolReply(next.name, next.args) : textReply('Native installed tools finished.');
  });
  const snapshot = await f.prompt(sessionId, 'Explicitly save/read the owned definition and reject invalid code before execution.');
  assert.equal(plan.length, 0);
  const results = {};
  for (const name of ['save_workflow', 'read_saved_workflow']) {
    const call = snapshot.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
    const output = snapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
    assert(output && !output.data.message.isError, JSON.stringify(output)); results[name] = JSON.parse(textOf(output.data.message));
  }
  assert.equal(results.save_workflow.ok, true); assert.match(results.read_saved_workflow.script, /return args;/);
  const calls = new Set(snapshot.records.filter(row => row.event?.type === 'tool/call' && row.event.data.name === 'create_workflow').map(row => row.event.data.callId));
  results.workflows = snapshot.records.filter(row => row.event?.type === 'tool/result' && calls.has(row.event.data.message?.toolCallId)).map(row => {
    assert(!row.event.data.message.isError, textOf(row.event.data.message)); return JSON.parse(textOf(row.event.data.message));
  });
  assert.equal(results.workflows.length, 2); assert.equal(results.workflows[0].ok, false); assert.equal(results.workflows[0].runId, undefined);
  assert.equal(results.workflows[1].ok, true, JSON.stringify(results.workflows[1])); assert.deepEqual(results.workflows[1].value, { installedGuestValue: 42 });
  const policy = await f.policy(sessionId);
  assert.deepEqual(policy.after, { sandbox: 'danger-full-access', approval: 'ask' });
  assert.deepEqual((await f.policy(control.sessionId)).after, { sandbox: 'workspace-write', approval: 'ask' });
  assert.deepEqual(f.errors, []);
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ fixture: f.evidence, installed, results, sessionPolicies: f.sessionPolicies, controlSessionId: control.sessionId,
    offline: true, installScriptsDisabled: true, model: 'localhost scripted fixture', actualPtcExecution: true }, null, 2) + '\n');
});
