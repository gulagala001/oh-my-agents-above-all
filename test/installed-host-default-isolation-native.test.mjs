import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, stat, access, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const enabled = process.env.OMAA_TEST_DEFAULT_ISOLATION_NATIVE === '1';
const output = resolve(process.env.OMAA_DEFAULT_ISOLATION_EVIDENCE ?? 'work/a2-compat/fixture-default-isolation');
const omaa = { path: resolve('work/a2-compat/formal-candidate-a2/oh-my-agents-above-all-0.2.1-alpha.2.omaa.0.14.2.tgz'), sha256: 'b8acefe5475a88d868e00a3dc10b9fe593e8caaf486e57da8218b30f97256023' };
const omd = { path: resolve(process.env.OMAA_DEFAULT_ISOLATION_OMD_ARCHIVE ?? '/Users/mac/.codex/worktrees/dsh-a2-compat/trisoul_x/work/a2-compat/formal-candidate-a2-0122/trisoul_x-0.2.1-alpha.2.omd.0.12.2.tgz'), sha256: process.env.OMAA_DEFAULT_ISOLATION_OMD_SHA ?? 'ec34bca30ad4ff99f84b25da2d00c279f79f6a1beda235382422839cfacfc665' };
const cft = join(output, 'browser/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exec = promisify(execFile);
const sourceBytes = await readFile(new URL(import.meta.url));
const runOutput = process.env.OMAA_DEFAULT_ISOLATION_RUN ? join(output, process.env.OMAA_DEFAULT_ISOLATION_RUN) : output;

async function ownedIoPaths(f) {
  const paths = [];
  async function walk(directory, depth = 0) {
    if (depth > 8) return;
    let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; return; }
    for (const entry of entries) {
      const path = join(directory, entry.name), info = await lstat(path);
      paths.push({ path, kind: info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : 'file', bytes: info.size, mode: info.mode & 0o777 });
      if (info.isDirectory() && !info.isSymbolicLink()) await walk(path, depth + 1);
    }
  }
  for (const path of [join(f.home, 'chrome-profile'), join(f.userHome, 'Library/Application Support/Google/Chrome'), join(f.home, 'trisoul-x/computer-use'), join(f.home, 'tmp')]) await walk(path);
  const processes = (await exec('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(row => row.includes(f.root));
  return { paths, processes };
}

// Only hash and permission metadata are returned. Native manifest bodies are
// never parsed, printed or retained, and this guard has no write operations.
async function realChromeManifestFingerprint() {
  const directory = '/Users/mac/Library/Application Support/Google/Chrome/NativeMessagingHosts';
  let names; try { names = await readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; return []; }
  const rows = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const path = join(directory, name), info = await stat(path); assert(info.isFile());
    rows.push({ path, mode: info.mode & 0o777, sha256: hash(await readFile(path)) });
  }
  return rows;
}

test('ordinary default Native fixture keeps automatic CU prepare and all runtime paths owned', { timeout: 750000, skip: !enabled }, async t => {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
  assert.equal(process.env.OMAA_TEST_SAFE, undefined, 'Run this control without SAFE');
  await mkdir(runOutput, { recursive: true });
  assert.equal(hash(await readFile(omaa.path)), omaa.sha256); assert.equal(hash(await readFile(omd.path)), omd.sha256);
  assert.equal(hash(await readFile(cft)), '8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a');
  const before = await realChromeManifestFingerprint();
  assert(before.some(row => row.sha256 === '3e8d4151f376af9a369a2a1b0332186f31e6cdccb9c7395adc2cc4286729b29f' && row.mode === 0o600), 'The primary-model restored global Chrome registry SHA/mode must be the agreed guard baseline');
  const report = { startedAt: new Date().toISOString(), artifacts: { omaa, omd }, sourceSha256: hash(sourceBytes), globalChromeManifestBefore: before, scope: 'One ordinary non-SAFE fixture; localhost synthetic model, actual Native and owned CFT/CU automatic prepare; no real accounts or keychain.', passed: false };
  const persist = () => writeFile(join(runOutput, 'native-default-verification.json'), JSON.stringify(report, null, 2) + '\n');
  report.globalGuards = [];
  const globalGuard = async phase => { const snapshot = await realChromeManifestFingerprint(); report.globalGuards.push({ phase, snapshot }); await persist(); assert.deepEqual(snapshot, before, 'Unknown global Chrome registry write during ' + phase); };
  await writeFile(join(runOutput, 'native-test-source-at-execution.mjs'), sourceBytes); await persist();
  let f;
  t.after(async () => { if (f) { report.actualOwnedIoBeforeCleanup = await ownedIoPaths(f); await persist(); } });
  f = await installedHost(t, { packagePath: omaa.path, omdPackagePath: omd.path, expectedHostVersion: '0.2.1-alpha.2', storeDir: join(output, 'public-store') });
  report.fixture = f.evidence; assert.equal(report.fixture.isolation.safeEnvironment, false);
  assert.equal(f.userHome, join(f.home, 'user-home')); assert.equal(f.piAgentDir, join(f.home, 'pi-agent'));
  for (const value of Object.values(report.fixture.isolation.paths)) assert(value === f.home || value.startsWith(f.home + '/'));
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    const rows = (await exec('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })).stdout.split('\n').filter(row => row.includes(f.root)); assert.deepEqual(rows, []);
    const after = await realChromeManifestFingerprint(); report.globalChromeManifestAfterCleanup = after; assert.deepEqual(after, before);
    report.cleanup = { rootRemoved: true, ownedProcessesRemaining: rows, ownedTmpRemovedWithRoot: true }; await persist();
  });
  const local = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Owned isolation page</title><h1>DEFAULT_ISOLATION_BROWSER_BYTES</h1>'); });
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  t.after(async () => { local.closeAllConnections(); await new Promise(resolve => local.close(resolve)); });
  const localUrl = 'http://127.0.0.1:' + local.address().port;
  const wrapper = join(f.root, 'owned-cft-exec.sh'); await writeFile(wrapper, "#!/bin/sh\nexec '" + cft.replaceAll("'", "'\\''") + "' --use-mock-keychain --password-store=basic \"$@\"\n", { mode: 0o700 });
  const settingsPath = join(f.home, 'settings.yaml'), settings = JSON.parse(await readFile(settingsPath));
  assert.equal(settings['trisoul-x'].componentAutoSetup, undefined); assert.equal(settings['trisoul-x'].computerUseNativeBinary, undefined);
  Object.assign(settings['trisoul-x'], { computerUseBrowserExecutable: wrapper, unifiedBackground: { provider: 'fixture', model: 'fixture', effort: 'off' }, dreamProvider: 'fixture', dreamModel: 'fixture' });
  await writeFile(settingsPath, JSON.stringify(settings));
  const skillDir = join(f.piAgentDir, 'skills/owned-user-skill'); await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), '---\nname: owned-user-skill\ndescription: Owned default Pi user resource\n---\nDEFAULT_OWNED_PI_RESOURCE\n');
  await writeFile(join(f.workspace, 'default-isolation.txt'), 'DEFAULT_NATIVE_ISOLATION_BYTES\n');
  report.install = await f.install(); report.omdInstall = await f.installOmd(); await globalGuard('native-installation'); await f.boot(); await globalGuard('native-boot');
  report.exemptions = await f.exemptions(); assert.deepEqual(report.exemptions, {});
  report.sdk = await f.installedEvidence(); assert.equal(report.sdk.manifest.version, '0.2.1-alpha.2.omaa.0.14.2');
  const session = await f.create('omaa-zcode'); report.sessionId = session.sessionId;
  let enhanced = await f.api(session.sessionId, { enhancement: true }); report.firstEnhancementPost = enhanced; await persist();
  if (enhanced.status === 400) {
    assert.equal(enhanced.value.error, '请安装并启用兼容的 Oh My DSH 后开启增强', 'Only the documented availability readiness rejection permits a bounded retry');
    report.readiness = [];
    await until(async () => { const value = await f.api(session.sessionId); report.readiness.push(value); await persist(); assert.equal(value.status, 200); return value.value.omdAvailable === true; }, 20000);
    enhanced = await f.api(session.sessionId, { enhancement: true });
  }
  report.enhancementPost = enhanced; await persist(); assert.equal(enhanced.status, 200, JSON.stringify(enhanced)); assert.equal(enhanced.value.enhancementActive, true); report.enhanced = enhanced.value;
  const issued = new Set(); report.issuedNativeCalls = [];
  f.replyWith(payload => {
    const user = payload.messages?.filter(row => row.role === 'user').map(row => typeof row.content === 'string' ? row.content : row.content?.filter(part => part.type === 'text').map(part => part.text).join('\n')).findLast(text => /^DEFAULT_ISOLATION_(READ|CU_OPEN|CU_CHECK)$/.test(text));
    if (!payload.tools?.length || !user || issued.has(user)) return textReply('DEFAULT_ISOLATION_COMPLETED');
    issued.add(user);
    if (user === 'DEFAULT_ISOLATION_READ') { const reply = toolReply('read', { file_path: join(f.workspace, 'default-isolation.txt') }); report.issuedNativeCalls.push({ marker: user, name: 'read', id: reply.delta.tool_calls[0].id }); return reply; }
    const code = user === 'DEFAULT_ISOLATION_CU_OPEN' ? 'var isolationTab = await cua.createBrowserTab("browser", ' + JSON.stringify(localUrl) + ');' : 'nodeRepl.write(await isolationTab.playwright.getByRole("heading", {name:"DEFAULT_ISOLATION_BROWSER_BYTES"}).innerText());';
    const reply = toolReply('computer_use', { title: 'Owned default isolation browser', code }); report.issuedNativeCalls.push({ marker: user, name: 'computer_use', id: reply.delta.tool_calls[0].id }); return reply;
  });
  report.nativeRead = await f.prompt(session.sessionId, 'DEFAULT_ISOLATION_READ');
  const reads = report.nativeRead.records.filter(row => row.event?.type === 'tool/result' && !row.event.data.message?.isError && JSON.stringify(row.event.data.message).includes('DEFAULT_NATIVE_ISOLATION_BYTES')); assert.equal(reads.length, 1);
  report.cuOpen = await f.prompt(session.sessionId, 'DEFAULT_ISOLATION_CU_OPEN', { timeout: 60000 }); await globalGuard('actual-CU-prepare-and-open'); report.actualOwnedIoAfterOpen = await ownedIoPaths(f); await persist();
  const openId = report.issuedNativeCalls.find(row => row.marker === 'DEFAULT_ISOLATION_CU_OPEN').id;
  const openResults = report.cuOpen.records.filter(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === openId); assert.equal(openResults.length, 1); assert.equal(openResults[0].event.data.message.isError, false);
  report.cuCheck = await f.prompt(session.sessionId, 'DEFAULT_ISOLATION_CU_CHECK', { timeout: 60000 });
  await globalGuard('actual-CFT-read');
  assert(report.cuCheck.records.some(row => row.event?.type === 'tool/result' && !row.event.data.message?.isError && JSON.stringify(row.event.data.message).includes('DEFAULT_ISOLATION_BROWSER_BYTES')));
  assert(f.requests.length > 0); for (const payload of f.requests) assert.equal(payload.model, 'fixture'); assert.deepEqual(f.errors, []);
  const pi = await f.create('omaa-pi'); await f.prompt(pi.sessionId, 'Default owned Pi resources');
  assert(f.requests.some(payload => JSON.stringify(payload.messages).includes('Owned default Pi user resource')));
  report.globalChromeManifestAfterPrepare = await realChromeManifestFingerprint(); assert.deepEqual(report.globalChromeManifestAfterPrepare, before);
  report.models = [...new Set(f.requests.map(payload => payload.model))]; report.finishedAt = new Date().toISOString(); report.passed = true; await persist();
});
