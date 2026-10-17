import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
function nativeResult(snapshot, name) {
  const call = snapshot.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
  const event = snapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
  assert(event && !event.data.message.isError, 'Missing successful native result: ' + name);
  return { call, event, value: JSON.parse(textOf(event.data.message)) };
}

const enabled = process.env.OMAA_ZCODE_WORKBENCH === '1' || Boolean(process.env.OMAA_TEST_HOST_PACKAGE);
test('installed ZCode workbench clicks native artifacts, Actor lineage, retune and Stop with exact run authority', { timeout: 300000,
  skip: !enabled && 'Set OMAA_ZCODE_WORKBENCH=1 with an explicit frozen host-matching package to run this native acceptance.' }, async t => {
  assert(process.env.OMAA_TEST_HOST_PACKAGE, 'This acceptance test requires an explicit frozen host-matching package');
  const evidenceDir = resolve(process.env.OMAA_WORKBENCH_EVIDENCE_DIR || 'work/rea-upgrade/zcode-workbench-ui');
  await mkdir(evidenceDir, { recursive: true });
  let f, context, page, sessionId, initial, successor, finalDetail, childPid, releaseHeld;
  const errors = [], protocolFrames = [], checks = [], downloads = [];
  let verified = false;
  // Capture the still-live real page/native log before the shared fixture's
  // cleanup. Preserve failed runs too, then use only native stop for cleanup.
  t.after(async () => {
    try {
      if (page && !page.isClosed()) {
        await page.screenshot({ path: join(evidenceDir, verified ? 'final.png' : 'failure.png'), animations: 'disabled' });
        await writeFile(join(evidenceDir, 'page.txt'), await page.locator('body').innerText());
        await writeFile(join(evidenceDir, 'page.html'), await page.content());
      }
      if (f?.origin && sessionId) await writeFile(join(evidenceDir, 'final-session.json'), JSON.stringify(await f.snapshot(sessionId), null, 2) + '\n');
      await writeFile(join(evidenceDir, 'capture.json'), JSON.stringify({ verified, errors, nativeErrors: f?.errors, checks, downloads, protocolFrames }, null, 2) + '\n');
    } finally {
      if (f?.origin && successor?.value.runId) {
        const response = await fetch(f.origin + '/omaa/api/zcode-workflow?' + new URLSearchParams({ session: sessionId, run: successor.value.runId }), { headers: { cookie: f.cookie } }).catch(() => undefined);
        const detail = await response?.json().catch(() => undefined);
        if (detail?.status === 'running') await fetch(response.url, { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
      }
      releaseHeld?.(); await context?.close();
    }
  });
  f = await installedHost(t, { safeEnvironment: true, piResources: true, isolatedHome: true });
  t.after(async () => {
    await assert.rejects(access(f.root), { code: 'ENOENT' });
    if (childPid) assert(!alive(childPid), 'Owned world process remained after host cleanup');
    const ps = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' });
    const remaining = ps.split('\n').filter(line => line.includes(f.root)); assert.deepEqual(remaining, []);
    await writeFile(join(evidenceDir, 'cleanup.json'), JSON.stringify({ fixtureRoot: f.root, fixtureRootRemoved: true, isolatedUserHome: f.userHome, ownedWorldPid: childPid, ownedWorldExited: !childPid || !alive(childPid), ownedProfileProcessesRemaining: remaining }, null, 2) + '\n');
  });
  await writeFile(join(f.workspace, 'fact.txt'), 'WORKBENCH_NATIVE_FACT');
  await writeFile(join(f.workspace, 'deliverable.txt'), 'WB_VERSION_ONE');
  await f.install();
  if (process.env.OMAA_TEST_HOST_PACKAGE_SHA256) assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256, 'The native UI must execute the exact frozen final package');
  const sdk = await f.installedEvidence();
  const executable = chromium.executablePath();
  await writeFile(join(evidenceDir, 'identity.json'), JSON.stringify({ fixture: f.evidence, installedSdk: sdk, testSource: { path: new URL(import.meta.url).pathname, sha256: sha(await readFile(new URL(import.meta.url))) }, browser: { executable, sha256: sha(await readFile(executable)) }, corepackHome: process.env.COREPACK_HOME ?? null }, null, 2) + '\n');
  await f.boot();
  const registered = await f.rpc('workspace/create', { path: f.workspace });
  ({ sessionId } = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'omaa-zcode' }));
  const title = 'ZCode native workbench';
  const prefix = `interface Fact { fact: string }
phase('Inspect'); const reader=agent('WorkbenchReader','Return the exact typed native fact.');
const fact=await files.read('fact.txt');
const first=await reader.ask<Fact>('WORKBENCH_PREFIX_TASK');
phase('Publish');
artifact.table('table',{columns:[{field:'name'},{field:'value'}],key:'name'});
artifact.metrics('metrics',{metrics:[{field:'value'}]});
artifact.board('board',{key:'name',status:'status',columns:['todo','done'],cardTitle:'name'});
artifact.chart('chart',{x:{field:'x'},y:{field:'value'},type:'line'});
report({name:'Row A',value:1},'table'); report({name:'Row A',value:2},'table');
report({value:42},'metrics'); report({name:'Card A',status:'done'},'board');
report({x:1,value:2},'chart'); report({x:2,value:3},'chart'); report({x:3,value:4},'chart');
await artifact.file('deliverable','deliverable.txt',{primary:true,title:'Workbench deliverable'});
await world.run('node',['-e','require("node:fs").writeFileSync("deliverable.txt","WB_VERSION_TWO")']);
await artifact.file('deliverable','deliverable.txt');`;
  const child = `const fs=require('node:fs');fs.writeFileSync('workbench-owned.pid',String(process.pid));setTimeout(()=>fs.writeFileSync('workbench-late.txt','UNEXPECTED_LATE_EFFECT'),12000);`;
  const holding = `phase('Holding'); const workers=['HeldOne','HeldTwo'].map(name=>agent(name));
const asks=workers.map(worker=>worker.ask<Fact>('WORKBENCH_HOLD_TASK'));
const proc=world.run('node',['-e',${JSON.stringify(child)}]);
await Promise.all([...asks,proc]); return {first,fact};`;
  let rootPlan = [], rootCursor = 0, prefixRequests = 0, heldRequests = 0;
  const held = new Promise(resolveHeld => { releaseHeld = resolveHeld; });
  f.replyWith(async request => {
    const names = request.tools?.map(tool => tool.function.name) ?? [];
    if (names.includes('submit_result')) {
      const input = request.messages.filter(message => message.role === 'user').map(textOf).findLast(text => /WORKBENCH_(?:PREFIX|HOLD)_TASK/.test(text)) ?? '';
      if (input.includes('WORKBENCH_HOLD_TASK')) { heldRequests++; await held; return toolReply('submit_result', { value: { fact: 'MUST_NOT_COMMIT_AFTER_STOP' } }); }
      assert.match(input, /WORKBENCH_PREFIX_TASK/); prefixRequests++;
      return toolReply('submit_result', { value: { fact: 'WORKBENCH_NATIVE_FACT' } });
    }
    if (!names.length) return textReply('Native workbench fixture');
    const next = rootPlan[rootCursor++];
    return next ? toolReply(next.name, next.args) : textReply('WORKBENCH_NATIVE_TURN_COMPLETE');
  });
  const run = async (plan, prompt) => {
    rootPlan = plan; rootCursor = 0;
    return f.prompt(sessionId, prompt, { timeout: 60000 });
  };
  initial = nativeResult(await run([{ name: 'skill', args: { name: 'zcode-workflows' } }, { name: 'create_workflow', args: { name: 'Workbench initial', script: prefix + '\nreturn {first,fact};', run_in_background: false } }], 'Create the native workbench fixture and its explicit deliverables.'), 'create_workflow');
  assert(initial.value.ok, JSON.stringify(initial.value)); assert.equal(prefixRequests, 1);
  await f.rpc('session/rename', { sessionId, title });
  const detail = async runId => {
    const response = await fetch(f.origin + '/omaa/api/zcode-workflow?' + new URLSearchParams({ session: sessionId, run: runId }), { headers: { cookie: f.cookie } });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); assert.equal(value.runId, runId); assert.equal(value.sessionId, sessionId); return value;
  };
  const initialDetail = await detail(initial.value.runId);
  const actor = initialDetail.runtime.actors.find(value => value.name === 'WorkbenchReader'); assert(actor?.sessionId);
  context = await chromium.launchPersistentContext(join(f.root, 'cft-profile'), { headless: true, executablePath: executable, args: ['--use-mock-keychain', '--password-store=basic'], viewport: { width: 1440, height: 1100 }, colorScheme: 'light', acceptDownloads: true });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(18000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'POST' || !new URL(request.url()).pathname.startsWith('/api/')) return; try { protocolFrames.push({ direction: 'native-http-request', url: new URL(request.url()).pathname, value: request.postDataJSON() }); } catch {} });
  page.on('websocket', socket => { for (const direction of ['framesent', 'framereceived']) socket.on(direction, frame => { try { const value = JSON.parse(String(frame.payload)); protocolFrames.push({ direction, value }); } catch {} }); });
  await page.goto(f.origin); const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }); await welcome.click(); await welcome.waitFor({ state: 'hidden' });
  await page.getByText(title, { exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'ZCode 工作流产物', exact: true });
  const reveal = async native => {
    const turn = page.locator(`[data-turn-process="${native.call.data.turn}"]`); await turn.waitFor();
    if (await turn.getAttribute('aria-expanded') === 'false') await turn.click();
    let card = page.locator('.omaa-zcode-tool').filter({ has: page.locator('.omaa-zcode-tool-title').filter({ hasText: native.value.status === 'retuned' ? '已调整并发' : native.call.data.args?.name ?? (native === initial ? 'Workbench initial' : 'Workbench successor') }) }).last();
    if (!await card.isVisible()) {
      const activity = card.locator('xpath=ancestor::*[@data-step-process][1]').locator('button[data-process-activity]').first();
      if (await activity.isVisible()) await activity.click();
    }
    if (!await card.isVisible()) {
      for (const activity of await turn.locator('button[data-process-activity]:visible').all()) {
        if (await card.isVisible()) break;
        if (await activity.getAttribute('aria-expanded') !== 'true') await activity.click();
      }
    }
    await card.waitFor(); return card;
  };
  const openRun = async native => { const card = await reveal(native); await card.getByRole('button', { name: '查看产物', exact: true }).click(); await panel.waitFor(); await until(async () => await panel.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue() === native.value.runId); return card; };
  await openRun(initial);
  for (const kind of ['table', 'metrics', 'board', 'chart']) {
    const tab = panel.locator('.omaa-zcode-artifact-tabs button').filter({ hasText: new RegExp('^' + kind) }); await tab.click();
    assert.equal(await tab.getAttribute('aria-current'), 'page');
    await panel.getByTestId('artifact-' + kind).waitFor();
    if (kind === 'table') { assert.equal(await panel.getByTestId('artifact-table-row').count(), 1); assert.match(await panel.getByTestId('artifact-table-row').innerText(), /Row A\s+2/); }
    if (kind === 'metrics') assert.equal(await panel.getByTestId('artifact-metric-value').innerText(), '42');
    if (kind === 'board') { await panel.locator('[data-column-id="done"]').getByText('Card A', { exact: true }).waitFor(); }
    if (kind === 'chart') await until(async () => !!(await panel.locator('path.recharts-line-curve').first().getAttribute('d')));
    await page.screenshot({ path: join(evidenceDir, kind + '-light.png'), animations: 'disabled' }); checks.push({ action: 'click-dashboard', kind, runId: initial.value.runId });
  }
  const deliverable = initialDetail.artifacts.find(artifact => artifact.id === 'deliverable');
  assert(deliverable && deliverable.versions.length === 2);
  await panel.locator('.omaa-zcode-artifact-tabs button').filter({ hasText: deliverable.title || deliverable.spec?.title || deliverable.id }).click();
  for (const [version, expected] of [[1, 'WB_VERSION_ONE'], [2, 'WB_VERSION_TWO']]) {
    await panel.getByRole('combobox', { name: '产物版本', exact: true }).selectOption(String(version));
    const pending = page.waitForEvent('download'); await panel.getByRole('link', { name: '下载', exact: true }).click(); const download = await pending;
    assert.equal(await download.failure(), null); const bytes = await readFile(await download.path()); assert.equal(bytes.toString(), expected);
    const url = new URL(download.url()); assert.equal(url.searchParams.get('session'), sessionId); assert.equal(url.searchParams.get('run'), initial.value.runId); assert.equal(url.searchParams.get('version'), String(version));
    await writeFile(join(evidenceDir, 'download-v' + version + '.txt'), bytes); downloads.push({ runId: initial.value.runId, version, bytes: bytes.length, sha256: sha(bytes), url: download.url() });
  }
  await panel.getByRole('combobox', { name: '产物版本', exact: true }).selectOption('1');
  const previewResponse = page.waitForResponse(response => response.url().includes('/omaa/api/zcode-artifact-preview?'));
  await panel.getByRole('button', { name: '打开原生预览', exact: true }).click(); const preview = await (await previewResponse).json();
  assert.deepEqual([preview.sessionId, preview.runId, preview.id, preview.version], [sessionId, initial.value.runId, 'deliverable', 1]);
  await page.locator('[data-textpreview-body]:visible').getByText('WB_VERSION_ONE', { exact: false }).waitFor();
  await page.screenshot({ path: join(evidenceDir, 'native-version-preview.png'), animations: 'disabled' });
  await openRun(initial); await panel.getByTestId('workflow-timeline').waitFor();
  const beforeActor = protocolFrames.length;
  await panel.getByRole('button', { name: /(?:打开 WorkbenchReader 的会话记录|Open the transcript of WorkbenchReader)/ }).first().click();
  await until(() => protocolFrames.slice(beforeActor).some(frame => JSON.stringify(frame.value).includes(actor.sessionId)));
  await page.getByText(/WORKBENCH_PREFIX_TASK/).first().waitFor();
  await page.screenshot({ path: join(evidenceDir, 'native-actor.png'), animations: 'disabled' });
  await page.getByText(title, { exact: true }).first().click(); await openRun(initial);
  checks.push({ action: 'native-actor-roundtrip', childSessionId: actor.sessionId, parentSessionId: sessionId });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  await page.screenshot({ path: join(evidenceDir, 'workbench-dark.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 1000 });
  await panel.getByRole('combobox', { name: '产物版本', exact: true }).scrollIntoViewIfNeeded();
  const bounds = await panel.boundingBox(); assert(bounds && bounds.width <= 392 && bounds.x >= -2, JSON.stringify(bounds));
  await page.screenshot({ path: join(evidenceDir, 'workbench-narrow.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.emulateMedia({ colorScheme: 'light' });
  successor = nativeResult(await run([{ name: 'amend_workflow', args: { run_id: initial.value.runId, name: 'Workbench successor', script: prefix + '\n' + holding, run_in_background: true, max_concurrency: 1 } }], 'Amend this workflow into the requested live successor.'), 'amend_workflow');
  assert(successor.value.ok && successor.value.jobId); assert.notEqual(successor.value.runId, initial.value.runId);
  await until(() => heldRequests === 1);
  childPid = await until(async () => { try { return Number(await readFile(join(f.workspace, 'workbench-owned.pid'), 'utf8')); } catch { return false; } });
  assert(Number.isSafeInteger(childPid) && childPid > 1 && alive(childPid)); assert.equal(prefixRequests, 1, 'Successor really reused the completed Actor prefix');
  await openRun(successor);
  await panel.getByRole('button', { name: '← 前次运行', exact: true }).click(); await until(async () => await panel.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue() === initial.value.runId);
  await panel.getByRole('button', { name: '后续运行 →', exact: true }).click(); await until(async () => await panel.getByRole('combobox', { name: '工作流运行', exact: true }).inputValue() === successor.value.runId);
  const live = await detail(successor.value.runId); assert.equal(live.status, 'running'); assert.equal(live.resumedFrom, initial.value.runId);
  const retuned = nativeResult(await run([{ name: 'amend_workflow', args: { run_id: successor.value.runId, max_concurrency: 2 } }], 'Retune this actual live successor to concurrency two.'), 'amend_workflow');
  assert.equal(retuned.value.status, 'retuned'); assert.equal(retuned.value.runId, successor.value.runId); await until(() => heldRequests === 2);
  const retuneCard = await reveal(retuned); await retuneCard.getByText('已调整并发', { exact: true }).waitFor(); await retuneCard.getByRole('button', { name: '查看产物', exact: true }).click();
  await panel.getByRole('button', { name: '停止运行', exact: true }).waitFor();
  await page.screenshot({ path: join(evidenceDir, 'retuned-running.png'), animations: 'disabled' });
  const stopResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/omaa/api/zcode-workflow?'));
  await panel.getByRole('button', { name: '停止运行', exact: true }).click(); const stop = await stopResponse; const acknowledgement = await stop.json();
  assert.equal(stop.status(), 202); assert.deepEqual([acknowledgement.sessionId, acknowledgement.runId, acknowledgement.requested], [sessionId, successor.value.runId, true]);
  finalDetail = await until(async () => { const value = await detail(successor.value.runId); return value.status !== 'running' && value; });
  assert.equal(finalDetail.status, 'killed'); assert.equal(finalDetail.error.kind, 'abort');
  await until(() => !alive(childPid), 5000); releaseHeld();
  await until(async () => await panel.locator('.omaa-zcode-status').getAttribute('data-status') === 'killed');
  assert.equal(await panel.getByRole('button', { name: '停止运行', exact: true }).count(), 0);
  const stoppedRevision = finalDetail.revision;
  await delay(13000); await assert.rejects(access(join(f.workspace, 'workbench-late.txt')), { code: 'ENOENT' });
  assert(!alive(childPid)); assert.equal((await detail(successor.value.runId)).revision, stoppedRevision, 'No late provider result mutated the terminal run');
  checks.push({ action: 'live-successor-retune-stop', runId: successor.value.runId, predecessor: initial.value.runId, maxConcurrency: retuned.value.maxConcurrency, acknowledgement, actualTerminalStatus: finalDetail.status, childPid, childExited: true, noLateEffect: true });
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
  await writeFile(join(evidenceDir, 'verification.json'), JSON.stringify({ passed: true, fixture: f.evidence, sessionId, initialRunId: initial.value.runId, successorRunId: successor.value.runId, initialDetail, finalDetail, checks, downloads, typedActorPrefixRequests: prefixRequests, heldActorRequests: heldRequests, uiErrors: errors, nativeErrors: f.errors, limits: ['macOS headless CFT and scripted localhost model with actual DSH native tools/results and package installation.', 'Two workflow runs; no duplicate backend baseline, desktop/Windows claim or same-run replay claim.', 'Safe fixture process environment and isolated HOME are not an OS filesystem or network sandbox.'] }, null, 2) + '\n');
  verified = true;
});
