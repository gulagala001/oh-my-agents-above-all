import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost, toolReply, textReply, until } from './fixtures/installed-host.mjs';
const run = promisify(execFile);
const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(part => part.text ?? '').join('\n');

test('ZCode world facade uses native files, bundled search, Git and confined argv with catchable original limits', { timeout: 90000 }, async t => {
  const f = await installedHost(t), cwd = join(f.workspace, 'sub'), outside = join(process.cwd(), '.cache', 'world-owned-probe-' + crypto.randomUUID() + '.txt');
  t.after(() => rm(outside, { force: true }));
  await mkdir(cwd);
  await run('git', ['init', '-b', 'main'], { cwd: f.workspace });
  await run('git', ['config', 'user.name', 'OMAA fixture'], { cwd: f.workspace });
  await run('git', ['config', 'user.email', 'fixture@invalid.example'], { cwd: f.workspace });
  await writeFile(join(cwd, 'changed.txt'), 'before\n');
  await writeFile(join(f.workspace, 'outside-workspace.txt'), 'before\n');
  await writeFile(join(cwd, '.gitignore'), 'ignored/\n');
  await run('git', ['add', '.'], { cwd: f.workspace });
  await run('git', ['commit', '-m', 'world baseline'], { cwd: f.workspace });
  await writeFile(join(cwd, 'changed.txt'), 'WORLD_SENTINEL\n');
  await writeFile(join(f.workspace, 'outside-workspace.txt'), 'outside change\n');
  for (const dir of ['ignored', '.hidden', '.hg']) await mkdir(join(cwd, dir));
  await writeFile(join(cwd, 'ignored', 'hidden.txt'), 'WORLD_SENTINEL\n');
  await writeFile(join(cwd, '.hidden', 'hidden.txt'), 'WORLD_SENTINEL\n');
  await writeFile(join(cwd, '.hg', 'hidden.txt'), 'WORLD_SENTINEL\n');
  await writeFile(join(cwd, 'utf16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('你好\r\nnext\rline', 'utf16le')]));
  await writeFile(join(cwd, 'cap.txt'), 'CAP\n'.repeat(2001));
  await writeFile(join(cwd, '[literal].txt'), 'brackets');
  await Promise.all(Array.from({ length: 130 }, (_, index) => writeFile(join(cwd, 'sample-' + index + '.txt'), 'sample')));
  await symlink(join(cwd, 'changed.txt'), join(cwd, 'link.txt'));
  await symlink(process.execPath, join(cwd, 'local-node'));
  await f.install(); await f.boot();
  const { sessionId } = await f.rpc('session/create', { cwd, agentPreset: 'omaa-zcode' });
  await f.call('commands/execute', { agentId: sessionId, line: '/permission workspace-write', submittedAttachments: [] });
  const script = `const filesFound = await files.glob('*.txt');
const literal = await files.glob('[literal].txt');
const text = await files.read('utf16.txt');
const hits = await files.grep('WORLD_SENTINEL', '*.txt');
const changed = await git.changedFiles();
const status = await git.status();
const diff = await git.diff(undefined, 'changed.txt');
const commits = await git.log(1);
const command = await world.run('node', ['-e', 'process.stdout.write("WORLD_EXIT_VALUE");process.exitCode=7']);
const relativeCommand = await world.run('./local-node', ['-e', 'process.stdout.write("RELATIVE_COMMAND_VALUE")']);
const denied = await world.run('node', ['-e', ${JSON.stringify('require("node:fs").writeFileSync(' + JSON.stringify(outside) + ',"forbidden")')}]);
let capError = '', pathError = '', refError = '', outputError = '';
try { await files.grep('CAP', 'cap.txt'); } catch (error) { capError = (error as {code:string}).code; }
try { await files.read('../outside-workspace.txt'); } catch (error) { pathError = (error as {code:string}).code; }
try { await git.diff('--help'); } catch (error) { refError = (error as {code:string}).code; }
try { await world.run('node', ['-e', 'process.stdout.write("x".repeat(262146))']); } catch (error) { outputError = (error as {code:string}).code; }
return {filesFound,literal,text,hits,changed,status,diff,commits,command,relativeCommand,denied,capError,pathError,refError,outputError};`;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Native fixture complete.');
    if (!request.messages.some(message => message.role === 'tool' && textOf(message).includes('The `workflow` tool'))) return toolReply('skill', { name: 'zcode-workflows' });
    if (request.messages.some(message => message.role === 'tool' && textOf(message).includes('"runId"'))) return textReply('Collected actual world observations.');
    return toolReply('create_workflow', { script, run_in_background: false });
  });
  const result = await f.prompt(sessionId, 'Use a workflow for the actual world observations.');
  const calls = new Set(result.records.filter(row => row.event?.type === 'tool/call' && row.event.data.name === 'create_workflow').map(row => row.event.data.callId));
  const outcomes = result.records.filter(row => row.event?.type === 'tool/result' && calls.has(row.event.data.message?.toolCallId)).map(row => JSON.parse(textOf(row.event.data.message)));
  const outcome = outcomes.find(value => value.runId); assert(outcome?.ok, JSON.stringify(outcomes));
  const value = outcome.value;
  assert(value.filesFound.length > 100);
  assert(value.filesFound.includes('ignored/hidden.txt'));
  assert(value.filesFound.includes('.hidden/hidden.txt'));
  assert(!value.filesFound.includes('.hg/hidden.txt'));
  assert(!value.filesFound.includes('link.txt'));
  assert.deepEqual(value.filesFound, [...value.filesFound].sort());
  assert.deepEqual(value.literal, ['[literal].txt']);
  assert.equal(value.text, '\ufeff你好\nnext\rline');
  assert(value.hits.some(hit => hit.path === 'changed.txt' && hit.line === 1 && hit.text === 'WORLD_SENTINEL'));
  assert(!value.hits.some(hit => hit.path.startsWith('ignored/') || hit.path.startsWith('.hg/')));
  assert(value.changed.includes('changed.txt') && !value.changed.includes('../outside-workspace.txt'));
  assert.equal(value.status.branch, 'main');
  assert(value.status.unstaged.includes('changed.txt'));
  assert(value.diff.includes('WORLD_SENTINEL'));
  assert.equal(value.commits[0].subject, 'world baseline');
  assert.deepEqual(value.command, { exitCode: 7, stdout: 'WORLD_EXIT_VALUE', stderr: '' });
  assert.equal(value.relativeCommand.stdout, 'RELATIVE_COMMAND_VALUE');
  assert.notEqual(value.denied.exitCode, 0);
  await assert.rejects(access(outside), { code: 'ENOENT' });
  assert.equal(value.capError, 'WorldReadCapExceeded');
  assert.equal(value.pathError, 'DriverError');
  assert.equal(value.refError, 'DriverError');
  assert.equal(value.outputError, 'WorldReadCapExceeded');

  let phase = 0;
  const waiting = "return await world.run('node', ['-e', 'require(\"node:fs\").writeFileSync(\"world-started.txt\",\"started\");setTimeout(()=>require(\"node:fs\").writeFileSync(\"must-not-finish.txt\",\"late\"),60000)']);";
  f.replyWith(request => request.tools?.length && phase++ === 0 ? toolReply('create_workflow', { script: waiting, run_in_background: true }) : textReply('Background world command started.'));
  const background = await f.prompt(sessionId, 'Start a workflow with the waiting world command.');
  const call = background.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === 'create_workflow').event;
  const receipt = JSON.parse(textOf(background.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call.data.callId).event.data.message));
  await until(async () => { try { await access(join(cwd, 'world-started.txt')); return true; } catch { return false; } });
  assert.equal((await f.api(sessionId, { mode: 'ask' })).status, 200);
  let inspected = false;
  f.replyWith(request => {
    if (request.messages.some(m => m.role === 'user' && textOf(m).includes('COLLECT_WORLD_STOP')) && !inspected) { inspected = true; return toolReply('job_output', { job_id: receipt.jobId, wait: true, timeout_ms: 8000 }); }
    return textReply('Collected the native stopped world job.');
  });
  await f.send(sessionId, 'COLLECT_WORLD_STOP: collect the actual native job outcome.');
  const stopped = await until(async () => {
    const snapshot = await f.snapshot(sessionId), message = snapshot.records.find(r => r.event?.type === 'user/message' && textOf(r.event.data.message ?? r.event.data).includes('COLLECT_WORLD_STOP'))?.event;
    return message && snapshot.records.some(r => r.event?.type === 'turn/end' && r.event.seq > message.seq) && snapshot;
  });
  const output = stopped.records.filter(r => r.event?.type === 'tool/result').map(r => textOf(r.event.data.message)).join('\n');
  assert.match(output, /killed/);
  await assert.rejects(access(join(cwd, 'must-not-finish.txt')), { code: 'ENOENT' });
  assert.deepEqual(f.errors, []);
});
