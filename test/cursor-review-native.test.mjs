import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';

const exec = promisify(execFile);
const evidence = resolve(process.env.OMAA_REVIEW_EVIDENCE_DIR ?? '../.local/omaa-cursor-review-20261023');

test('Cursor branch and turn review persist comments across a cold host, submit once and perform native edits', { timeout: 180000 }, async t => {
  await mkdir(evidence, { recursive: true });
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['cursor'] });
  await f.install(); await f.boot();
  const git = (...args) => exec('git', ['-C', f.workspace, ...args]).then(result => result.stdout.trim());
  await git('init', '-b', 'main'); await git('config', 'user.name', 'OMAA fixture'); await git('config', 'user.email', 'fixture@invalid.example');
  await writeFile(join(f.workspace, 'review.js'), 'export const answer = 40;\n');
  await writeFile(join(f.workspace, 'helper.js'), 'export const enabled = false;\n');
  await git('add', '.'); await git('commit', '-m', 'baseline'); await git('checkout', '-b', 'feature');
  await writeFile(join(f.workspace, 'review.js'), 'export const answer = 41;\n');
  await writeFile(join(f.workspace, 'helper.js'), 'export const enabled = null;\n');
  await git('commit', '-am', 'feature');
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-cursor' });
  let step = 0;
  f.replyWith(payload => !payload.tools?.length ? textReply('Title') : step++ === 0
    ? toolReply('read', { file_path: 'review.js' }) : step === 2
      ? toolReply('write', { file_path: 'review.js', content: 'export const answer = 41;\n// pending review\n' }) : textReply('Review changes ready.'));
  await f.prompt(sessionId, 'Add the review marker.'); await f.rpc('session/rename', { sessionId, title: 'Cursor review delivery' });
  await writeFile(join(f.workspace, 'new.txt'), 'new file in whole workspace\n');
  const api = async (query = {}, body) => {
    const response = await fetch(f.origin + '/omaa/api/cursor-review?' + new URLSearchParams({ session: sessionId, ...query }), {
      headers: { cookie: f.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const working = await api({ scope: 'working' }); assert.equal(working.status, 200, JSON.stringify(working.value));
  assert.deepEqual(working.value.files.map(file => file.path), ['new.txt', 'review.js']);
  const branch = await api({ scope: 'branch', ref: 'main' }); assert.equal(branch.status, 200);
  assert.equal(branch.value.files.length, 2); assert(branch.value.base); assert(branch.value.commit);
  const turns = (await api({ kind: 'turns' })).value.turns; assert(turns.length);
  const turn = await api({ scope: 'turn', seq: turns.at(-1).seq }); assert.equal(turn.status, 200, JSON.stringify(turn.value));
  assert(turn.value.files.some(file => file.path === 'review.js'));
  const browser = await launchChromium({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
  let page, review, opened = false;
  const errors = [];
  const open = async () => {
    await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
    page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
    await page.goto(f.origin);
    const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
    if (!opened) { await welcome.waitFor({ state: 'visible' }); await welcome.click(); await welcome.waitFor({ state: 'hidden' }); opened = true; }
    await page.getByRole('button', { name: '标准模式', exact: true }).waitFor();
    const workspaceRow = page.locator('[data-row-key^="workspace:"][role="treeitem"]').filter({ has: page.getByText('workspace', { exact: true }) });
    await workspaceRow.waitFor();
    if (await workspaceRow.getAttribute('aria-expanded') === 'false') await workspaceRow.getByText('workspace', { exact: true }).click();
    await until(async () => await workspaceRow.getAttribute('aria-expanded') === 'true');
    await page.getByText('Cursor review delivery', { exact: true }).first().click();
    await page.getByRole('button', { name: '打开 Cursor 代码审阅', exact: true }).click();
    review = page.getByRole('region', { name: 'Cursor 代码审阅', exact: true });
    await review.getByLabel('Cursor 比较范围').waitFor();
    await until(async () => review.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  };
  t.after(async () => {
    try { if (t.passed === false && page && !page.isClosed()) { await page.screenshot({ path: join(evidence, 'failure.png') }); t.diagnostic((await page.locator('body').innerText()).slice(-6000)); t.diagnostic(JSON.stringify(errors)); } }
    finally { await browser.close(); }
  });
  await open();
  await review.getByLabel('Cursor 比较范围').selectOption('branch');
  const selectFile = name => review.getByRole('navigation', { name: '审阅文件' }).getByRole('button', { name: new RegExp(name) }).click();
  await selectFile('review.js');
  await review.getByRole('button', { name: '评论新文件第 1 行', exact: true }).click();
  await review.getByLabel('Cursor 行级批注').fill('ANSWER_TARGET: change the answer to 42, preserving the marker.');
  await review.getByRole('button', { name: '保存批注', exact: true }).click();
  await until(async () => (await api({ kind: 'notes' })).value.comments.length === 1);
  await selectFile('helper.js');
  await review.getByRole('button', { name: '评论新文件第 1 行', exact: true }).click();
  await review.getByLabel('Cursor 行级批注').fill('FLAG_TARGET: change enabled to true.');
  await review.getByRole('button', { name: '保存批注', exact: true }).click();
  await until(async () => (await api({ kind: 'notes' })).value.comments.length === 2);
  await review.getByRole('button', { name: '标为已阅', exact: true }).click();
  await until(async () => (await api({ kind: 'notes' })).value.reviewed.length === 1);
  const notes = (await api({ kind: 'notes' })).value;
  const stale = await api({}, { action: 'delete-comment', revision: notes.revision - 1, id: notes.comments[0].id }); assert.equal(stale.status, 409);
  await until(async () => review.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  await page.screenshot({ path: join(evidence, 'cursor-review.png') });
  // Native turn comparisons are retained by the running host. Test their real
  // renderer before restart; durable comments do not pretend to preserve a
  // native comparison that the host no longer serves.
  await review.getByLabel('Cursor 比较范围').selectOption('turn');
  await until(async () => (await review.getByLabel('Cursor 比较范围').inputValue()) === 'turn' && await review.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  await review.locator('[data-diff-line]').first().waitFor();
  await review.getByRole('button', { name: '并排', exact: true }).click();
  await review.locator('[data-review-view="unified"]').waitFor();
  await review.getByRole('button', { name: '折行', exact: true }).click();
  await review.locator('[data-review-wrap]').waitFor();
  await page.close(); await f.stop(); await f.boot();
  const cold = (await api({ kind: 'notes' })).value;
  assert.deepEqual(cold.comments, notes.comments); assert.deepEqual(cold.reviewed, notes.reviewed);
  await open();
  assert.equal(await review.locator('.omaa-cr-comment').count(), 2);
  step = 0;
  f.replyWith(payload => !payload.tools?.length ? textReply('Title') : step++ === 0
    ? toolReply('write', { file_path: 'review.js', content: 'BLOCKED IN ASK\n' }) : textReply('CURSOR_READONLY_REVIEW_COMPLETE'));
  await review.getByRole('button', { name: '查找范围问题', exact: true }).click();
  await until(async () => !(await f.api(sessionId)).value.running && f.requests.some(payload => JSON.stringify(payload.messages).includes('BLOCKED IN ASK')));
  assert.equal((await f.api(sessionId)).value.mode, 'ask');
  assert.equal(await f.readWorkspace('review.js'), 'export const answer = 41;\n// pending review\n');
  step = 0;
  const from = f.requests.length;
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('Title');
    const replies = [toolReply('read', { file_path: 'review.js' }), toolReply('write', { file_path: 'review.js', content: 'export const answer = 42;\n// pending review\n' }),
      toolReply('read', { file_path: 'helper.js' }), toolReply('write', { file_path: 'helper.js', content: 'export const enabled = true;\n' })];
    return replies[step++] ?? textReply('CURSOR_FEEDBACK_IMPLEMENTED');
  });
  await until(async () => review.getByRole('button', { name: '批量反馈并继续修改', exact: true }).isEnabled());
  await review.getByRole('button', { name: '批量反馈并继续修改', exact: true }).click();
  await until(async () => await f.readWorkspace('helper.js') === 'export const enabled = true;\n' && !(await f.api(sessionId)).value.running);
  assert.equal((await f.api(sessionId)).value.mode, 'default');
  assert.equal(await f.readWorkspace('review.js'), 'export const answer = 42;\n// pending review\n');
  const submitted = (await api({ kind: 'notes' })).value;
  assert(submitted.comments.every(comment => comment.status === 'submitted'));
  const snapshot = await f.snapshot(sessionId);
  const sent = snapshot.records.map(record => record.event).filter(event => event?.type === 'user/message' && event.data.source?.rpcId === submitted.lastDelivery.requestId);
  assert.equal(sent.length, 1, 'one batch admission identity owns both comments');
  const actual = f.requests.slice(from).find(payload => payload.tools?.length); assert(actual);
  for (const marker of ['ANSWER_TARGET', 'FLAG_TARGET', 'revision', 'branch', 'main']) assert(JSON.stringify(actual.messages).includes(marker), marker);
  await review.getByRole('button', { name: '标为解决', exact: true }).first().click();
  await until(async () => (await api({ kind: 'notes' })).value.comments.some(comment => comment.status === 'resolved'));
  await until(async () => review.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  await page.screenshot({ path: join(evidence, 'cursor-review-finished.png') });
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ host: f.evidence.version, source: 'local source-linked rc.2', nativeFlow: true,
    scopes: ['working', 'branch', 'turn'], coldComments: cold.comments.length, oneNativeBatch: sent.length, actualFilesChanged: ['review.js', 'helper.js'],
    askWriteDenied: true, staleWriteDenied: true, frontendErrors: errors, externalModels: false }, null, 2) + '\n');
});
