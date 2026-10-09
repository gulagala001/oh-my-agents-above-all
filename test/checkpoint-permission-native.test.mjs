import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, realpath, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const enabled = process.env.OMAA_CHECKPOINT_PERMISSION_NATIVE === '1';
const digest = value => createHash('sha256').update(value).digest('hex');
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const describeFile = async path => {
  const bytes = await readFile(path), info = await stat(path);
  return { bytes, hash: digest(bytes), mode: info.mode & 0o7777, size: bytes.length };
};
const summaryFile = value => ({ sha256: value.hash, mode: value.mode, bytes: value.size });
const checkpointSource = process.env.OMAA_CHECKPOINT_PERMISSION_MODULE
  ? pathToFileURL(resolve(process.env.OMAA_CHECKPOINT_PERMISSION_MODULE))
  : new URL('../src/checkpoints.mjs', import.meta.url);
const { createCheckpointStore } = await import(checkpointSource.href);

async function boundaryFixture(t, label, options = {}) {
  const directory = resolve(process.env.OMAA_CHECKPOINT_PERMISSION_EVIDENCE_DIR || 'work/a2-compat/checkpoint-permission/actual');
  const evidenceDirectory = join(directory, 'boundaries'); await mkdir(evidenceDirectory, { recursive: true });
  const root = await mkdtemp(join(evidenceDirectory, label + '-'));
  const workspace = join(root, 'workspace'), storage = join(root, 'storage'); await mkdir(workspace);
  const events = [{ seq: 1, type: 'turn/start', data: { turn: 1 } }];
  const session = { id: randomUUID(), header: { cwd: workspace }, snapshotEvents: () => events };
  const guards = { isIdle: () => true, writable: () => true, ...options };
  const store = createCheckpointStore(storage, guards);
  const evidence = { startedAt: new Date().toISOString(), scope: 'Isolated real filesystem boundary test with explicit policy callbacks; no native host or provider.',
    root, source: checkpointSource.href, sourceSha256: digest(await readFile(checkpointSource)), testSha256: digest(await readFile(new URL(import.meta.url))) };
  const save = () => writeFile(join(evidenceDirectory, label + '.json'), JSON.stringify(evidence, null, 2) + '\n');
  await save();
  t.after(async () => {
    await rm(root, { recursive: true, force: true }); await assert.rejects(access(root), { code: 'ENOENT' });
    evidence.finishedAt = new Date().toISOString(); evidence.fixtureRootRemoved = true; await save();
  });
  const capture = (path, run) => store.captureExecution({ name: 'write', arguments: { file_path: path }, callId: randomUUID(), agent: { session } }, run);
  return { root, workspace, storage, session, events, guards, store, evidence, save, capture,
    restore: (active = store, paths) => active.restore(session.id, session, { turn: 1, ...(paths ? { paths } : {}) }) };
}

test('checkpoint boundary: revoking write policy or selecting Ask/Plan during final restore validation leaves bytes and modes unchanged', async t => {
  for (const restriction of ['read-only', 'ask', 'plan']) await t.test(restriction, async t => {
    let filePolicy = 'workspace-write', mode = 'default', scheduled = false, revoked = false, workspace;
    const f = await boundaryFixture(t, 'during-check-' + restriction, { writable: () => {
      const allowed = filePolicy !== 'read-only' && mode === 'default';
      // Wait for real restore preparation, then revoke on the next microtask while
      // asynchronous file validation is pending. This does not depend on call counts.
      if (workspace && !scheduled && readdirSync(workspace).some(name => name.startsWith('.omaa-restore-'))) {
        scheduled = true;
        queueMicrotask(() => { if (restriction === 'read-only') filePolicy = restriction; else mode = restriction; revoked = true; });
      }
      return allowed;
    } });
    workspace = f.workspace;
    const target = join(workspace, 'owned.txt'), original = Buffer.from('\uFEFForiginal\r\nlast');
    await writeFile(target, original, { mode: 0o750 }); await chmod(target, 0o750);
    await f.capture('owned.txt', () => writeFile(target, 'changed\n'));
    const before = await describeFile(target), events = structuredClone(f.events);
    let result, error; try { result = await f.restore(); } catch (value) { error = { code: value.code, message: value.message }; }
    const after = await describeFile(target);
    Object.assign(f.evidence, { restriction, scheduled, revoked, filePolicy, mode, before: summaryFile(before), after: summaryFile(after), result, error,
      unchanged: before.bytes.equals(after.bytes) && before.mode === after.mode, entriesAfter: await readdir(workspace) }); await f.save();
    assert(scheduled && revoked, 'permission must actually change while the final async check is pending');
    assert(result?.ok === false || error?.code === 'CHECKPOINT_PERMISSION', 'revoked restoration must report denial');
    assert.deepEqual(after.bytes, before.bytes, 'revocation before commit must leave exact file bytes unchanged');
    assert.equal(after.mode, before.mode, 'revocation before commit must leave file permission bits unchanged');
    assert.deepEqual(await readdir(workspace), ['owned.txt'], 'restore staging files must be cleaned');
    assert.deepEqual(f.events, events, 'restore must not mutate the conversation journal');
  });
});

test('checkpoint boundary: cold reload uses current denial, then authorized restore preserves exact bytes and mode', async t => {
  const f = await boundaryFixture(t, 'cold-permission');
  const target = join(f.workspace, 'owned.txt'), original = Buffer.from('\uFEFForiginal\r\nlast');
  await writeFile(target, original, { mode: 0o751 }); await chmod(target, 0o751);
  await f.capture('owned.txt', () => writeFile(target, 'changed\n'));
  const before = await describeFile(target), events = structuredClone(f.events), denials = [];
  for (const restriction of ['read-only', 'ask', 'plan']) {
    const policy = restriction === 'read-only' ? 'read-only' : 'workspace-write', mode = restriction === 'read-only' ? 'default' : restriction;
    const cold = createCheckpointStore(f.storage, { isIdle: () => true, writable: () => policy !== 'read-only' && mode === 'default' });
    await assert.rejects(f.restore(cold), { code: 'CHECKPOINT_PERMISSION' });
    const after = await describeFile(target); assert.deepEqual(after.bytes, before.bytes); assert.equal(after.mode, before.mode);
    denials.push({ restriction, after: summaryFile(after), unchanged: true });
  }
  const defaults = createCheckpointStore(f.storage, { isIdle: () => true });
  await assert.rejects(f.restore(defaults), { code: 'CHECKPOINT_PERMISSION' });
  const coldAllowed = createCheckpointStore(f.storage, f.guards), result = await f.restore(coldAllowed);
  const restored = await describeFile(target);
  Object.assign(f.evidence, { denials, defaultWithoutWritableDenied: true, result, original: { sha256: digest(original), mode: 0o751 }, restored: summaryFile(restored) }); await f.save();
  assert.equal(result.ok, true); assert.deepEqual(restored.bytes, original); assert.equal(restored.mode, 0o751);
  assert.deepEqual(f.events, events);
});

test('checkpoint boundary: current directory capture retains original workspace identity and refuses outside restore scope', async t => {
  let current;
  const f = await boundaryFixture(t, 'current-directory', { currentDirectory: () => current });
  const subdir = join(f.workspace, 'nested'); await mkdir(subdir); current = subdir;
  const rootFile = join(f.workspace, 'same.txt'), nestedFile = join(subdir, 'same.txt');
  const bytes = Buffer.from('\uFEFFnested\r\nlast'); await writeFile(rootFile, 'original project sibling');
  await writeFile(nestedFile, bytes, { mode: 0o750 }); await chmod(nestedFile, 0o750);
  await f.capture('same.txt', () => writeFile(nestedFile, 'nested changed'));
  let view = await f.store.inspect(f.session.id, f.session);
  assert.deepEqual(view.checkpoints[0].files.map(file => file.path), ['nested/same.txt']);
  assert.equal(await readFile(rootFile, 'utf8'), 'original project sibling');
  const outside = join(f.root, 'outside'); await mkdir(outside); current = outside;
  await f.capture('outside.txt', () => writeFile(join(outside, 'outside.txt'), 'native policy owns this untracked write'));
  view = await f.store.inspect(f.session.id, f.session);
  assert.deepEqual(view.checkpoints[0].files.map(file => file.path), ['nested/same.txt']);
  let outsideDenied; try { await f.restore(f.store, ['../outside/outside.txt']); } catch (error) { outsideDenied = error.code; }
  assert.equal(outsideDenied, 'FILE_NOT_FOUND');
  const result = await f.restore(), restored = await describeFile(nestedFile);
  const metadata = JSON.parse(await readFile(join(f.storage, digest(f.session.id), 'checkpoint.json'), 'utf8'));
  Object.assign(f.evidence, { view, outsideDenied, metadataRoot: metadata.root, originalWorkspaceRoot: await realpath(f.workspace), result, restored: summaryFile(restored) }); await f.save();
  assert.equal(result.ok, true); assert.deepEqual(restored.bytes, bytes); assert.equal(restored.mode, 0o750);
  assert.equal(metadata.root, await realpath(f.workspace));
  assert.equal(f.session.header.cwd, f.workspace);
  assert.equal(await readFile(rootFile, 'utf8'), 'original project sibling');
  assert.equal(await readFile(join(outside, 'outside.txt'), 'utf8'), 'native policy owns this untracked write');
});

test('native checkpoint restore obeys file policy and Ask/Plan without changing exact bytes or modes', {
  timeout: 180000,
  skip: !enabled && 'Explicit frozen native inputs required; set OMAA_CHECKPOINT_PERMISSION_NATIVE=1 to execute.',
}, async t => {
  for (const name of ['OMAA_TEST_HOST_CLI', 'OMAA_TEST_HOST_VERSION', 'OMAA_TEST_HOST_PACKAGE', 'OMAA_TEST_PUBLIC_STORE']) {
    assert(process.env[name], name + ' is required for the isolated native permission regression');
  }
  const directory = resolve(process.env.OMAA_CHECKPOINT_PERMISSION_EVIDENCE_DIR || 'work/a2-compat/checkpoint-permission/actual');
  await mkdir(directory, { recursive: true });
  const source = await readFile(new URL(import.meta.url));
  await writeFile(join(directory, 'test-source-at-execution.mjs'), source);
  const cases = [], evidence = { startedAt: new Date().toISOString(), testSha256: digest(source), cases,
    scope: 'Owned native profile and scripted localhost provider; no user account or hardware actions.' };
  const save = () => writeFile(join(directory, 'execution.json'), JSON.stringify(evidence, null, 2) + '\n');
  t.after(async () => { evidence.finishedAt = new Date().toISOString(); evidence.passed = t.passed === true; await save(); });
  const f = await installedHost(t, { safeEnvironment: true, piResources: true });
  evidence.fixture = { cli: f.evidence.cli, version: f.evidence.version, node: f.evidence.node,
    artifact: Object.fromEntries(['path', 'name', 'version', 'sha256'].map(key => [key, f.evidence.artifact[key]])),
    root: f.root, workspace: f.workspace, isolation: f.evidence.isolation };
  await save();
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    const remaining = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(f.root));
    assert.deepEqual(remaining, []);
    await writeFile(join(directory, 'cleanup.json'), JSON.stringify({ fixtureRoot: f.root, fixtureRootRemoved: true, ownedProfileProcessesRemaining: remaining }, null, 2) + '\n');
  });
  await f.install(); await f.boot();
  const installed = await f.installedEvidence();
  for (const [name, peer] of Object.entries(installed.sdk)) {
    assert.equal(peer.pluginVersion, peer.hostVersion, name);
    assert.equal(peer.pluginPath, peer.hostPath, name);
    assert.equal(peer.pluginModule, peer.hostModule, name);
  }
  assert.deepEqual(await f.exemptions(), {});
  evidence.installedSdk = installed.sdk; await save();

  const permission = async (id, mode) => {
    const result = await f.call('commands/execute', { agentId: id, line: '/permission ' + mode, submittedAttachments: [] });
    assert.equal(result?.result?.kind, 'success', JSON.stringify(result));
    assert((await f.snapshot(id)).records.some(row => row.event?.type === 'sandbox/mode' && row.event.data.mode === mode), 'native permission command must commit its actual mode');
    return result;
  };
  const round = async (id, marker, replies) => {
    let next = 0;
    f.replyWith(payload => {
      assert.equal(payload.model, 'fixture', 'only the declared localhost model may run');
      if (!payload.tools?.length) return textReply('Local fixture title.');
      return next < replies.length ? replies[next++] : textReply('Local checkpoint operation completed.');
    });
    try { return await f.prompt(id, marker); } finally { f.replyWith(); }
  };
  const checkpointApi = async (id, body) => {
    const response = await fetch(f.origin + '/omaa/api/checkpoints?session=' + encodeURIComponent(id), {
      headers: { cookie: f.cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };

  for (const restriction of ['workspace-write', 'read-only', 'ask', 'plan']) await t.test(restriction, async () => {
    const record = { restriction }; cases.push(record); await save();
    const { sessionId } = await f.create('omaa-cursor'); record.sessionId = sessionId;
    await permission(sessionId, 'workspace-write');
    const name = restriction + '-owned.txt', target = join(f.workspace, name);
    const baseline = Buffer.from('\uFEFForiginal-' + restriction + '\r\nlast-without-newline', 'utf8');
    await writeFile(target, baseline, { mode: 0o750 }); await chmod(target, 0o750);
    const original = await describeFile(target);
    assert.deepEqual(original.bytes, baseline); assert.equal(original.mode, 0o750);
    record.original = summaryFile(original);
    const changed = 'native changed ' + restriction + '\n';
    const native = await round(sessionId, 'CHECKPOINT_PERMISSION_CAPTURE_' + restriction, [
      toolReply('read', { file_path: name }), toolReply('write', { file_path: name, content: changed }),
    ]);
    const writeCall = native.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'write')?.event;
    const writeResult = native.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === writeCall?.data.callId)?.event;
    assert(writeCall && writeResult && !writeResult.data.message.isError, 'actual native write must succeed before checkpoint denial is tested');
    assert.deepEqual((await describeFile(target)).bytes, Buffer.from(changed));
    record.captureToolCall = writeCall; record.captureToolResult = writeResult;
    const checkpoints = await checkpointApi(sessionId);
    assert.equal(checkpoints.status, 200);
    const checkpoint = checkpoints.body.checkpoints.findLast(value => value.files.some(file => file.path === name && file.restorable));
    assert(checkpoint, 'actual native write must produce a restorable byte checkpoint');
    record.checkpoint = checkpoint;
    if (restriction === 'read-only') record.permission = await permission(sessionId, 'read-only');
    else if (restriction === 'ask' || restriction === 'plan') {
      record.modeUpdate = await f.api(sessionId, { mode: restriction });
      assert.equal(record.modeUpdate.status, 200); assert.equal(record.modeUpdate.value.mode, restriction);
    }
    if (restriction !== 'workspace-write') {
      const forbidden = restriction + '-forbidden.txt';
      const denied = await round(sessionId, 'CHECKPOINT_PERMISSION_NATIVE_DENIAL_' + restriction, [toolReply('write', { file_path: forbidden, content: 'must never be created' })]);
      const deniedCall = denied.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'write')?.event;
      const deniedResult = denied.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === deniedCall?.data.callId)?.event;
      assert(deniedResult?.data.message.isError, 'native file mutation must actually be denied in the standing restricted mode');
      await assert.rejects(access(join(f.workspace, forbidden)), { code: 'ENOENT' });
      record.nativeDeniedToolResult = deniedResult;
    }
    await until(async () => (await f.api(sessionId)).value.running === false);
    record.settingsBeforeRestore = await f.api(sessionId);
    assert.equal(record.settingsBeforeRestore.value.mode, restriction === 'read-only' || restriction === 'workspace-write' ? 'default' : restriction);
    const before = await describeFile(target); record.beforeRestore = summaryFile(before);
    record.restore = await checkpointApi(sessionId, { turn: checkpoint.turn, paths: [name] });
    const after = await describeFile(target); record.afterRestore = summaryFile(after);
    record.unchanged = before.bytes.equals(after.bytes) && before.mode === after.mode;
    record.restoredOriginal = original.bytes.equals(after.bytes) && original.mode === after.mode;
    await save();
    if (restriction === 'workspace-write') {
      assert.equal(record.restore.status, 200, JSON.stringify(record.restore.body));
      assert.equal(record.restore.body.ok, true);
      assert.deepEqual(after.bytes, original.bytes, 'authorized restoration must preserve original BOM, CRLF and no final newline');
      assert.equal(after.mode, original.mode, 'authorized restoration must preserve original permission bits');
    } else {
      assert(record.restore.status >= 400 && record.restore.status < 500, 'restricted direct backend restoration must deny: ' + JSON.stringify(record.restore));
      assert.deepEqual(after.bytes, before.bytes, 'denied backend restoration must not change any original file bytes');
      assert.equal(after.mode, before.mode, 'denied backend restoration must not change file permissions');
    }
  });
  assert.deepEqual(f.errors, []);
});
