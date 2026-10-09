import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const runFile = promisify(execFile);
const enabled = process.env.OMAA_A2_ZCODE_DIRECTORY_NATIVE === '1';
const digest = value => createHash('sha256').update(value).digest('hex');
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const toolsOf = request => request.tools?.map(tool => tool.function.name) ?? [];
function resultOf(page, name) {
  const call = page.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
  const result = page.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(result, 'Missing actual ' + name + ' result');
  assert.equal(result.data.message.isError ?? false, false, textOf(result.data.message));
  return JSON.parse(textOf(result.data.message));
}

test('a2 native ZCode directories preserve project identity, confine artifacts and invalidate changed-directory caches', {
  timeout: 300000,
  skip: !enabled && 'Explicit frozen a2 host and artifact inputs are required.',
}, async t => {
  for (const key of ['OMAA_TEST_HOST_CLI', 'OMAA_TEST_HOST_VERSION', 'OMAA_TEST_HOST_PACKAGE', 'OMAA_TEST_PUBLIC_STORE']) assert(process.env[key], key + ' is required');
  assert.equal(process.env.OMAA_TEST_HOST_VERSION, '0.2.1-alpha.2');
  const directory = resolve(process.env.OMAA_A2_ZCODE_DIRECTORY_EVIDENCE_DIR || 'work/a2-compat/zcode-directory/actual');
  await mkdir(directory, { recursive: true });
  const source = await readFile(new URL(import.meta.url));
  await writeFile(join(directory, 'test-source-at-execution.mjs'), source);
  const evidence = { startedAt: new Date().toISOString(), testSha256: digest(source), cases: [],
    scope: 'Darwin arm64 official a2 host, native installation and tools, localhost scripted model, owned temporary HOME. No OMD ecosystem or other platform claim.' };
  const save = () => writeFile(join(directory, 'execution.json'), JSON.stringify(evidence, null, 2) + '\n');
  t.after(async () => { evidence.finishedAt = new Date().toISOString(); evidence.passed = t.passed === true; await save(); });
  const f = await installedHost(t, { safeEnvironment: true, piResources: true, expectedHostVersion: '0.2.1-alpha.2' });
  assert.equal(f.evidence.platform, 'darwin'); assert.equal(f.evidence.arch, 'arm64');
  evidence.fixture = { root: f.root, workspace: f.workspace, cli: f.evidence.cli, version: f.evidence.version, node: f.evidence.node,
    artifact: Object.fromEntries(['path', 'name', 'version', 'sha256'].map(key => [key, f.evidence.artifact[key]])), isolation: f.evidence.isolation };
  await save();
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    const processes = (await runFile('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(line => line.includes(f.root));
    assert.deepEqual(processes, []);
    await writeFile(join(directory, 'cleanup.json'), JSON.stringify({ fixtureRoot: f.root, fixtureRootRemoved: true, ownedProcessesRemaining: processes }, null, 2) + '\n');
  });
  const nested = join(f.workspace, 'nested'), outside = join(f.root, 'outside-secret.txt');
  await mkdir(nested);
  await writeFile(join(f.workspace, 'same.txt'), 'A_SAME_BYTES_ORIGINAL\r\n');
  await writeFile(join(nested, 'same.txt'), 'B_SAME_BYTES_ORIGINAL\r\n');
  await writeFile(outside, 'EXTERNAL_SECRET_BYTES_NEVER_PUBLISH');
  await symlink(outside, join(nested, 'escape.txt'));
  await runFile('git', ['init', '-b', 'main'], { cwd: f.workspace });
  await runFile('git', ['config', 'user.name', 'OMAA owned fixture'], { cwd: f.workspace });
  await runFile('git', ['config', 'user.email', 'fixture@invalid.example'], { cwd: f.workspace });
  await runFile('git', ['add', '.'], { cwd: f.workspace });
  await runFile('git', ['commit', '-m', 'owned directory baseline'], { cwd: f.workspace });
  await writeFile(join(f.workspace, 'same.txt'), 'A_SAME_BYTES_ORIGINAL\r\nA_ROOT_GIT_CHANGE\n');
  await writeFile(join(nested, 'same.txt'), 'B_SAME_BYTES_ORIGINAL\r\nB_NESTED_GIT_CHANGE\n');
  await f.install(); await f.boot();
  const installed = await f.installedEvidence();
  assert.equal(installed.nativeHostDetection.version, '0.2.1-alpha.2');
  for (const [name, sdk] of Object.entries(installed.sdk)) {
    assert.equal(sdk.pluginPath, sdk.hostPath, name + ' package identity');
    assert.equal(sdk.pluginModule, sdk.hostModule, name + ' module identity');
    assert.equal(sdk.pluginVersion, sdk.hostVersion, name + ' version identity');
    assert.equal(sdk.hostVersion, name === '@deepseek-ai/cordis-plugin-loader' ? '1.0.6-alpha.1' : '0.2.1-alpha.2');
  }
  const gate = JSON.parse(await readFile(join(installed.path, 'src/host/compatibility.json'), 'utf8'));
  assert.equal(gate.hostRange, '0.2.1-alpha.2');
  assert.equal(gate.validationHosts.find(value => value.version === '0.2.1-alpha.2').validationPending, true);
  assert.deepEqual(await f.exemptions(), {});
  evidence.identity = { installed, gate, exemptions: {} }; await save();

  const permission = async id => {
    const result = await f.call('commands/execute', { agentId: id, line: '/permission workspace-write', submittedAttachments: [] });
    assert.equal(result?.result?.kind, 'success', JSON.stringify(result));
  };
  const create = async title => {
    const { sessionId } = await f.create('omaa-zcode');
    await f.rpc('session/rename', { sessionId, title }); await permission(sessionId);
    return sessionId;
  };
  const identity = async id => (await f.call('session/list', { _request: {} })).items.find(item => item.sessionId === id);
  const worldText = async path => (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
  const actorRequests = [];
  let rootReplies = [], nextReply = 0, actorHandler;
  f.replyWith(async request => {
    assert.equal(request.model, 'fixture', 'only explicit localhost model may execute');
    if (!request.tools?.length) return textReply('Owned fixture title.');
    if (toolsOf(request).includes('submit_result')) {
      actorRequests.push(structuredClone(request));
      if (actorHandler) return actorHandler(request);
      const instruction = request.messages.filter(message => message.role === 'user').map(textOf).at(-1) ?? '';
      if (instruction.includes('ACTOR_NATIVE_COMMAND_CWD')) {
        const native = request.messages.filter(message => message.role === 'tool').map(textOf).findLast(value => value.includes('NATIVE_ACTOR_CWD='));
        if (native) return toolReply('submit_result', { value: JSON.parse(native.match(/NATIVE_ACTOR_CWD=(\{[^\n]+\})/)[1]) });
        const command = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(f.workspace, 'actor-original-root.txt'))},'ACTOR_ROOT_A_WRITE');let outsideDenied=false;try{fs.writeFileSync(${JSON.stringify(join(f.root, 'actor-outside.txt'))},'forbidden')}catch{outsideDenied=true}process.stdout.write('NATIVE_ACTOR_CWD='+JSON.stringify({cwd:process.cwd(),outsideDenied,originalRootWritable:true}));`;
        return toolReply('bash', { command: 'node -e ' + "'" + command.replaceAll("'", "'\\''") + "'", description: 'Observe native Actor directory and original policy root' });
      }
      const native = request.messages.filter(message => message.role === 'tool').map(textOf).findLast(value => /[AB]_SAME_BYTES_[A-Z]+/.test(value));
      if (!native) return toolReply('read', { file_path: 'same.txt' });
      return toolReply('submit_result', { value: { value: native.match(/[AB]_SAME_BYTES_[A-Z]+/)[0] } });
    }
    if (actorHandler && request.messages.some(message => message.role === 'user' && textOf(message).includes('COLD_DIRECTORY_ACTOR'))) return actorHandler(request);
    return nextReply < rootReplies.length ? rootReplies[nextReply++] : textReply('Owned native operation complete.');
  });
  const round = async (id, marker, replies) => { rootReplies = replies; nextReply = 0; return f.prompt(id, marker, { timeout: 45000 }); };
  const cd = async (id, path) => {
    const page = await round(id, 'NATIVE_CD_' + crypto.randomUUID(), [toolReply('working_directory', { cd: path })]);
    const call = page.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'working_directory')?.event;
    const result = page.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
    assert(result && !result.data.message.isError, JSON.stringify(result));
    return { call, result };
  };
  const workflow = async (id, script, marker = 'CREATE_DIRECTORY_WORKFLOW') => resultOf(await round(id, marker, [
    toolReply('skill', { name: 'zcode-workflows' }), toolReply('create_workflow', { script, run_in_background: false }),
  ]), 'create_workflow');
  const amend = async (id, runId, script) => resultOf(await round(id, 'AMEND_DIRECTORY_WORKFLOW_' + crypto.randomUUID(), [
    toolReply('amend_workflow', { run_id: runId, script, run_in_background: false }),
  ]), 'amend_workflow');
  const api = async (id, name, params = {}, binary = false) => {
    const response = await fetch(f.origin + '/omaa/api/' + name + '?' + new URLSearchParams({ session: id, ...params }), { headers: { cookie: f.cookie } });
    const body = binary ? await response.text() : await response.json(); return { status: response.status, body };
  };
  const childPage = async (parentId, childId) => {
    const projection = await f.rpc('session/projections', { sessionId: childId });
    return f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: parentId, childSessionId: childId, mode: 'continuable' }, throughSeq: projection.asOfSeq, maxMessages: 100 });
  };

  await t.test('current world read, Git, command and immutable artifact bytes follow B while root A remains authoritative', async () => {
    const item = { name: 'world-artifact' }; evidence.cases.push(item);
    const id = await create('ZCODE_DIRECTORY_IMMUTABLE_TITLE'), before = await identity(id); item.sessionId = id; item.before = before;
    const initial = await workflow(id, "return await files.read('same.txt');"); assert(initial.ok, JSON.stringify(initial));
    assert.equal(initial.value, await worldText(join(f.workspace, 'same.txt')));
    item.cd = await cd(id, 'nested');
    const command = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(f.workspace, 'policy-root-owned.txt'))},'ROOT_A_STILL_WRITEABLE');let denied=false;try{fs.writeFileSync(${JSON.stringify(join(f.root, 'outside-write.txt'))},'forbidden')}catch{denied=true}process.stdout.write(JSON.stringify({cwd:process.cwd(),bytes:fs.readFileSync('same.txt','utf8'),denied}));`;
    const script = `const read=await files.read('same.txt'); const sibling=await files.read('../same.txt');
const hits=await files.grep('B_SAME_BYTES_ORIGINAL','same.txt'); const changed=await git.changedFiles();const diff=await git.diff(undefined,'same.txt');
const command=await world.run('node',['-e',${JSON.stringify(command)}]);const published=await artifact.file('current','same.txt',{primary:true});
let directRead='',escapeRead='',directReadCode='',escapeReadCode='';try{directRead=await files.read(${JSON.stringify(outside)})}catch(error){directReadCode=(error as {code:string}).code}
try{escapeRead=await files.read('escape.txt')}catch(error){escapeReadCode=(error as {code:string}).code}
let direct='',escape='';try{await artifact.file('external',${JSON.stringify(outside)})}catch(error){direct=(error as {code:string}).code}
try{await artifact.file('escape','escape.txt')}catch(error){escape=(error as {code:string}).code}
return {read,sibling,hits,changed,diff,command,published,direct,escape,directRead,escapeRead,directReadCode,escapeReadCode};`;
    const result = await workflow(id, script); item.initial = initial; item.result = result; await save();
    assert(result.ok, JSON.stringify(result));
    assert.equal(result.value.read, await worldText(join(nested, 'same.txt')));
    assert.equal(result.value.sibling, await worldText(join(f.workspace, 'same.txt')));
    assert(result.value.hits.some(value => value.path === 'same.txt' && value.text === 'B_SAME_BYTES_ORIGINAL'));
    assert(result.value.changed.includes('same.txt')); assert(!result.value.changed.includes('../same.txt'));
    assert(result.value.diff.includes('B_NESTED_GIT_CHANGE')); assert(!result.value.diff.includes('A_ROOT_GIT_CHANGE'));
    assert.equal(result.value.command.exitCode, 0, JSON.stringify(result.value.command));
    assert.deepEqual(JSON.parse(result.value.command.stdout), { cwd: nested, bytes: await readFile(join(nested, 'same.txt'), 'utf8'), denied: true });
    assert.equal(await readFile(join(f.workspace, 'policy-root-owned.txt'), 'utf8'), 'ROOT_A_STILL_WRITEABLE');
    await assert.rejects(access(join(f.root, 'outside-write.txt')), { code: 'ENOENT' });
    assert.deepEqual([result.value.direct, result.value.escape], ['ArtifactPathOutsideWorkspace', 'ArtifactPathOutsideWorkspace']);
    assert.equal(result.value.directRead, ''); assert.equal(result.value.escapeRead, '', 'world file reads must not disclose owned external secret through an escape symlink');
    assert.deepEqual([result.value.directReadCode, result.value.escapeReadCode], ['DriverError', 'DriverError']);
    const content = await api(id, 'zcode-artifact-content', { run: result.runId, id: 'current', version: '1' }, true);
    assert.equal(content.status, 200); assert.equal(content.body, await readFile(join(nested, 'same.txt'), 'utf8'));
    const detail = await api(id, 'zcode-workflow', { run: result.runId }); assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.artifacts.map(value => value.id), ['current']);
    for (const artifactId of ['external', 'escape']) {
      const denied = await api(id, 'zcode-artifact-content', { run: result.runId, id: artifactId, version: '1' }, true);
      assert.equal(denied.status, 400); assert(!denied.body.includes('EXTERNAL_SECRET_BYTES_NEVER_PUBLISH'));
    }
    item.after = await identity(id); item.artifactContentSha256 = digest(content.body); item.artifactDetail = detail.body; await save();
    assert.equal(item.after.cwd, f.workspace); assert.equal(before.cwd, f.workspace);
    assert.equal(before.projections.values.title, 'ZCODE_DIRECTORY_IMMUTABLE_TITLE');
    assert.equal(item.after.projections.values.title, before.projections.values.title);
    await f.stop(); await f.boot();
    const cold = await api(id, 'zcode-artifact-content', { run: result.runId, id: 'current', version: '1' }, true);
    assert.deepEqual(cold, content);
  });

  await t.test('first Actor activation and native tool use B, then cold continuation preserves persona and B transcript', async () => {
    const item = { name: 'actor-directory-cold' }; evidence.cases.push(item);
    const id = await create('ZCODE_ACTOR_DIRECTORY_TITLE'), before = await identity(id); item.sessionId = id;
    await cd(id, 'nested');
    const actorFrom = actorRequests.length;
    const result = await workflow(id, "interface Fact {value:string}interface NativeDirectory {cwd:string;outsideDenied:boolean;originalRootWritable:boolean}const reader=agent('directory-reader','Preserve literal {{customer_name}} and native file facts.');const first=await reader.ask<Fact>('ACTOR_READ_CURRENT_DIRECTORY: read same.txt with the native tool and submit its actual bytes marker.');const execution=await reader.ask<NativeDirectory>('ACTOR_NATIVE_COMMAND_CWD: use the native command to observe execution directory and original root policy.');return {first,execution};");
    item.result = result; item.requests = actorRequests.slice(actorFrom); await save();
    assert(result.ok, JSON.stringify(result)); assert.equal(result.value.first.value, 'B_SAME_BYTES_ORIGINAL');
    assert.deepEqual(result.value.execution, { cwd: nested, outsideDenied: true, originalRootWritable: true });
    assert.equal(await readFile(join(f.workspace, 'actor-original-root.txt'), 'utf8'), 'ACTOR_ROOT_A_WRITE');
    await assert.rejects(access(join(f.root, 'actor-outside.txt')), { code: 'ENOENT' });
    assert(item.requests.length >= 2);
    assert(item.requests[0].messages.map(textOf).join('\n').includes('Current working directory: ' + JSON.stringify(nested)), 'the first actual Actor request must receive current directory B');
    const actor = result.actors.find(value => value.name === 'directory-reader'); assert(actor?.created);
    const history = await childPage(id, actor.childId); item.history = history;
    assert(history.records.some(row => row.event?.type === 'tool/result' && textOf(row.event.data.message).includes('B_SAME_BYTES_ORIGINAL')));
    assert(!history.records.some(row => row.event?.type === 'tool/result' && textOf(row.event.data.message).includes('A_SAME_BYTES_ORIGINAL')));
    const after = await identity(id); assert.equal(after.cwd, f.workspace);
    assert.equal(before.projections.values.title, 'ZCODE_ACTOR_DIRECTORY_TITLE'); assert.equal(after.projections.values.title, before.projections.values.title);
    await f.stop(); await f.boot();
    assert.equal((await f.api(id)).status, 200);
    const requestFrom = f.requests.length;
    actorHandler = request => textReply(request.messages.map(textOf).join('\n').includes('B_SAME_BYTES_ORIGINAL') ? 'COLD_DIRECTORY_ACTOR_B_RETAINED' : 'COLD_DIRECTORY_ACTOR_MISSING');
    try {
      await f.rpc('subagents/prompt', { parentSessionId: id, childSessionId: actor.childId, mode: 'continuable', delivery: 'queue', requestId: crypto.randomUUID(), content: [{ type: 'text', text: 'COLD_DIRECTORY_ACTOR: recall the native file fact.' }] });
      const cold = await until(async () => { const page = await childPage(id, actor.childId); return page.records.filter(row => row.event?.type === 'turn/end').length === 3 && page; }, 30000);
      assert.equal(cold.records.findLast(row => row.event?.type === 'turn/end').event.data.reason.kind, 'completed');
      assert(cold.records.some(row => row.event?.type === 'assistant/message' && textOf(row.event.data.message ?? row.event.data).includes('COLD_DIRECTORY_ACTOR_B_RETAINED')));
      const request = f.requests.slice(requestFrom).find(value => value.tools?.length);
      assert(request.messages.filter(message => message.role === 'system').map(textOf).join('\n').includes('literal {{customer_name}}'));
      item.cold = cold; item.coldRequest = request; await save();
    } finally { actorHandler = undefined; }
  });

  await t.test('same-cwd amendments reuse completed world and Actor prefixes; every cd amendment re-executes against actual new bytes', async () => {
    const item = { name: 'amend-directory-cache', rounds: [] }; evidence.cases.push(item);
    const id = await create('ZCODE_CACHE_DIRECTORY_TITLE'); item.sessionId = id;
    const effect = `const fs=require('node:fs');const p='effect-count.txt';const n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8'))+1:1;fs.writeFileSync(p,String(n));process.stdout.write(JSON.stringify({count:n,cwd:process.cwd(),bytes:fs.readFileSync('same.txt','utf8')}));`;
    const script = `interface Fact {value:string}const reader=agent('cache-reader','Read native facts in the current directory.');const observed=await files.read('same.txt');const first=await reader.ask<Fact>('CACHE_CURRENT_DIRECTORY: read same.txt using native read, then submit its actual marker.');const effect=await world.run('node',['-e',${JSON.stringify(effect)}]);return {observed,first,effect,suffix:'INITIAL'};`;
    const amended = suffix => script.replace("suffix:'INITIAL'", 'suffix:' + JSON.stringify(suffix));
    const count = async cwd => Number(await readFile(join(cwd, 'effect-count.txt'), 'utf8'));
    let from = actorRequests.length;
    const initial = await workflow(id, script); assert(initial.ok, JSON.stringify(initial));
    assert.equal(initial.value.first.value, 'A_SAME_BYTES_ORIGINAL'); assert.equal(await count(f.workspace), 1);
    item.rounds.push({ kind: 'initial-A', result: initial, actorRequests: actorRequests.length - from });
    await writeFile(join(f.workspace, 'same.txt'), 'A_SAME_BYTES_CHANGED\n');
    await f.stop(); await f.boot(); assert.equal((await f.api(id)).status, 200);
    from = actorRequests.length;
    const sameA = await amend(id, initial.runId, amended('SAME_A')); assert(sameA.ok, JSON.stringify(sameA));
    item.rounds.push({ kind: 'same-A-cold', result: sameA, actorRequests: actorRequests.length - from }); await save();
    assert.equal(sameA.value.observed, initial.value.observed); assert.deepEqual(sameA.value.first, initial.value.first);
    assert.deepEqual(sameA.value.effect, initial.value.effect); assert.equal(await count(f.workspace), 1); assert.equal(actorRequests.length - from, 0);
    await cd(id, 'nested'); from = actorRequests.length;
    const changedB = await amend(id, sameA.runId, amended('CHANGED_B')); item.rounds.push({ kind: 'changed-B', result: changedB, actorRequests: actorRequests.length - from }); await save();
    assert(changedB.ok, JSON.stringify(changedB)); assert.equal(changedB.value.observed, await worldText(join(nested, 'same.txt')));
    assert.equal(changedB.value.first.value, 'B_SAME_BYTES_ORIGINAL'); assert(actorRequests.length - from >= 2);
    assert.equal(await count(nested), 1); assert.equal(await count(f.workspace), 1);
    assert.deepEqual(JSON.parse(changedB.value.effect.stdout), { count: 1, cwd: nested, bytes: await readFile(join(nested, 'same.txt'), 'utf8') });
    await writeFile(join(nested, 'same.txt'), 'B_SAME_BYTES_CHANGED\n');
    await f.stop(); await f.boot(); assert.equal((await f.api(id)).status, 200); from = actorRequests.length;
    const sameB = await amend(id, changedB.runId, amended('SAME_B')); item.rounds.push({ kind: 'same-B', result: sameB, actorRequests: actorRequests.length - from }); await save();
    assert(sameB.ok, JSON.stringify(sameB)); assert.equal(sameB.value.observed, changedB.value.observed); assert.deepEqual(sameB.value.first, changedB.value.first);
    assert.deepEqual(sameB.value.effect, changedB.value.effect); assert.equal(await count(nested), 1); assert.equal(actorRequests.length - from, 0);
    await cd(id, '..'); from = actorRequests.length;
    const changedA = await amend(id, sameB.runId, amended('CHANGED_A')); item.rounds.push({ kind: 'changed-back-A', result: changedA, actorRequests: actorRequests.length - from }); await save();
    assert(changedA.ok, JSON.stringify(changedA)); assert.equal(changedA.value.observed, 'A_SAME_BYTES_CHANGED\n');
    assert.equal(changedA.value.first.value, 'A_SAME_BYTES_CHANGED'); assert(actorRequests.length - from >= 2);
    assert.equal(await count(f.workspace), 2); assert.equal(await count(nested), 1);
    assert.deepEqual(JSON.parse(changedA.value.effect.stdout), { count: 2, cwd: f.workspace, bytes: 'A_SAME_BYTES_CHANGED\n' });
  });

  await t.test('B Actor cancellation drains native child and host native tools remain usable after disable and uninstall', async () => {
    const item = { name: 'cancel-native-coexistence' }; evidence.cases.push(item);
    const id = await create('ZCODE_CANCEL_DIRECTORY_TITLE'); item.sessionId = id; await cd(id, 'nested');
    let started = false, release;
    const held = new Promise(resolve => { release = resolve; });
    t.after(() => release());
    actorHandler = async () => { started = true; await held; return toolReply('submit_result', { value: { value: 'MUST_NOT_COMMIT' } }); };
    try {
      const page = await round(id, 'START_HELD_DIRECTORY_ACTOR', [toolReply('skill', { name: 'zcode-workflows' }), toolReply('create_workflow', {
        script: "interface Fact{value:string}const worker=agent('held-directory');return await worker.ask<Fact>('HELD_DIRECTORY_ACTOR');", run_in_background: true,
      })]);
      const receipt = resultOf(page, 'create_workflow'); assert(receipt.jobId); item.receipt = receipt;
      await until(() => started, 30000); assert.equal((await f.api(id, { mode: 'ask' })).status, 200);
      actorHandler = undefined;
      const collected = await round(id, 'COLLECT_CANCELED_DIRECTORY_ACTOR', [toolReply('job_output', { job_id: receipt.jobId, wait: true, timeout_ms: 8000 })]);
      const outputCall = collected.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'job_output')?.event;
      const outputResult = collected.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === outputCall?.data.callId)?.event;
      assert(outputResult && !outputResult.data.message.isError, JSON.stringify(outputResult));
      const output = textOf(outputResult.data.message); item.output = output;
      assert.match(output, /killed/); assert.match(output, /working mode changed/);
      const detail = await until(async () => { const value = await api(id, 'zcode-workflow', { run: receipt.runId }); return value.status === 200 && value.body.status === 'killed' && value.body; });
      const childId = detail.runtime?.actors?.[0]?.childId ?? output.match(/"childId"\s*:\s*"([^"]+)"/)?.[1];
      assert(childId, 'Canceled run must expose its actual native child');
      const child = await childPage(id, childId); item.child = child; await save();
      assert.equal(child.records.findLast(row => row.event?.type === 'turn/end').event.data.reason.kind, 'aborted');
      assert(!child.records.some(row => row.event?.type === 'tool/call' && row.event.data.name === 'submit_result'));
    } finally { release(); actorHandler = undefined; }
    const native = async marker => {
      const { sessionId } = await f.create('standard');
      const page = await round(sessionId, marker, [toolReply('read', { file_path: 'same.txt' })]);
      const call = page.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'read')?.event;
      const result = page.records.findLast(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
      assert(result && !result.data.message.isError, JSON.stringify(result)); assert(textOf(result.data.message).includes('A_SAME_BYTES_CHANGED'));
      return { call, result };
    };
    await f.stop(); await f.bundleEnabled(false); await f.boot(); item.disabledNative = await native('NATIVE_WITH_OMAA_DISABLED');
    await f.stop(); await f.bundleEnabled(true); await f.boot();
    const reenabling = await create('ZCODE_REENABLED'); item.reenabled = await workflow(reenabling, "return await files.read('same.txt');"); assert(item.reenabled.ok);
    await f.stop(); await f.uninstall(); await f.boot(); item.uninstalledNative = await native('NATIVE_AFTER_OMAA_UNINSTALLED');
    assert.deepEqual(await f.exemptions(), {}); await save();
  });
  assert.deepEqual(f.errors, []);
});
