import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { installedHost, until } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';

// Explicit opt-in only: the caller owns a disposable editor/profile and a
// probe extension that records VS Code's real activeTextEditor selection.
// No production editor setting or model response is used as selection proof.
const product = process.env.OMAA_TEST_REVIEW_PRODUCT === 'codex' ? 'codex' : 'cursor';
const label = product === 'codex' ? 'Codex' : 'Cursor';
const receipt = process.env.OMAA_TEST_EDITOR_RECEIPT;
const exec = promisify(execFile);
test(`native ${label} review opens exact editor lines, remaps durable comments after restart, and rejects stale/ambiguous targets`, { skip: !receipt, timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: [product] });
  const stopEditor = async () => {
    const editorRoot = process.env.OMAA_TEST_EDITOR_ROOT;
    if (!editorRoot) return;
    const processes = (await exec('ps', ['-axo', 'pid=,command='])).stdout;
    for (const row of processes.split('\n')) {
      const match = /^\s*(\d+)\s+(.+)$/.exec(row);
      if (match && ['Code', 'Electron'].some(binary => match[2] === editorRoot + '/Contents/MacOS/' + binary || match[2].startsWith(editorRoot + '/Contents/MacOS/' + binary + ' '))) {
        try { process.kill(Number(match[1]), 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        await until(async () => { try { process.kill(Number(match[1]), 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, 10000);
      }
    }
  };
  t.after(stopEditor);
  await mkdir(join(f.userHome, 'Applications'));
  await symlink(process.env.OMAA_TEST_EDITOR_ROOT, join(f.userHome, 'Applications/Visual Studio Code.app'));
  await f.install();
  const git = (...args) => exec('git', ['-C', f.workspace, ...args]);
  await git('init', '-b', 'main'); await git('config', 'user.name', 'OMAA fixture'); await git('config', 'user.email', 'fixture@invalid.example');
  const name = '定位 "quoted" ;$(literal).txt', path = join(f.workspace, name);
  const original = Array.from({ length: 25 }, (_, i) => 'source line ' + (i + 1)).join('\r\n') + '\r\n';
  await writeFile(path, original); await git('add', '.'); await git('commit', '-m', 'baseline');
  const changed = original.replace('source line 12', 'edited line 12'); await writeFile(path, changed);
  await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-' + product });
  await f.prompt(sessionId, 'Open this workspace for code review.');
  await f.rpc('session/rename', { sessionId, title: 'Cursor editor navigation' });
  const api = async (query = {}, body) => {
    const response = await fetch(f.origin + '/omaa/api/' + product + '-review?' + new URLSearchParams({ session: sessionId, ...query }), {
      headers: { cookie: f.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  assert((await api({ kind: 'editors' })).value.editors.some(item => item.id === 'vscode'));
  const browser = await launchChromium({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  let page, review, first = true;
  const open = async () => {
    await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
    page = await context.newPage(); page.setDefaultTimeout(15000); await page.goto(f.origin);
    if (first) { const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }); await welcome.waitFor(); await welcome.click(); first = false; }
    const project = page.locator('[data-row-key="workspace:' + workspace.workspace.workspaceId + '"]');
    await project.waitFor();
    const row = page.locator('[data-row-key="session:' + sessionId + '"]');
    await until(async () => {
      if (await row.isVisible()) return true;
      if (await project.getAttribute('aria-expanded') === 'false') await project.click();
      return false;
    });
    await row.click();
    await page.getByRole('button', { name: product === 'codex' ? 'Codex 预设设置' : '打开 Cursor 代码审阅', exact: true }).click();
    review = page.getByRole('region', { name: product === 'codex' ? 'Codex Git 审阅' : 'Cursor 代码审阅', exact: true });
    await until(async () => review.getByRole('button', { name: '刷新', exact: true }).isEnabled());
  };
  const selection = line => until(async () => {
    const value = await readFile(receipt, 'utf8').then(JSON.parse).catch(() => null);
    return value?.path === path && value?.line === line && value?.column === 1 && value;
  }, 60000);
  await open();
  await review.getByLabel(label + ' 本机编辑器').selectOption('vscode');
  await review.getByRole('button', { name: '评论新文件第 12 行', exact: true }).click();
  const firstLaunch = page.waitForResponse(response => response.url().includes('/omaa/api/' + product + '-review') && response.request().method() === 'POST');
  await review.getByRole('button', { name: '在编辑器定位此行', exact: true }).click();
  const firstResponse = await firstLaunch; assert.equal(firstResponse.status(), 200, await firstResponse.text());
  const initial = await selection(12);
  for (const [button, line] of [['在编辑器打开', 1], ['在编辑器定位此行', 12]]) {
    const response = page.waitForResponse(response => response.url().includes('/omaa/api/' + product + '-review') && response.request().method() === 'POST');
    await review.getByRole('button', { name: button, exact: true }).click();
    const value = await response; assert.equal(value.status(), 200, await value.text());
    await selection(line);
  }
  await review.getByLabel(label + ' 行级批注').fill('Keep this exact line while reviewing.');
  await review.getByRole('button', { name: '保存批注', exact: true }).click();
  const notes = await until(async () => { const value = (await api({ kind: 'notes' })).value; return value.comments?.length === 1 && value; });
  assert(notes.comments[0].anchor);
  await page.close(); await open();
  assert.equal(await review.getByLabel(label + ' 本机编辑器').inputValue(), 'vscode');
  await page.close(); await stopEditor(); await f.stop();
  await writeFile(path, 'inserted first\r\ninserted second\r\n' + changed);
  await f.boot(); await open(); // ephemeral host port changes: the new origin has its own browser preference
  const coldLaunch = page.waitForResponse(response => response.url().includes('/omaa/api/' + product + '-review') && response.request().method() === 'POST');
  await review.getByRole('button', { name: '在编辑器定位', exact: true }).click();
  const coldResponse = await coldLaunch; assert.equal(coldResponse.status(), 200, await coldResponse.text());
  const remapped = await selection(14);
  await review.getByText(/已按当前内容重新定位/).waitFor();
  const stale = await api({}, { action: 'open-editor', target: notes.comments[0].target, editor: 'vscode' }); assert.equal(stale.status, 409);
  await writeFile(path, changed + changed);
  const ambiguous = await api({}, { action: 'open-editor', commentId: notes.comments[0].id, editor: 'vscode' }); assert.notEqual(ambiguous.status, 200); assert.match(ambiguous.value.error, /多个匹配/);
  await writeFile(path, changed.replace('edited line 12', 'deleted target'));
  const deleted = await api({}, { action: 'open-editor', commentId: notes.comments[0].id, editor: 'vscode' }); assert.notEqual(deleted.status, 200); assert.match(deleted.value.error, /变化／删除/);
  const denied = await fetch(f.origin + '/omaa/api/' + product + '-review?session=' + sessionId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open-editor', commentId: notes.comments[0].id }) }); assert.equal(denied.status, 401);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_EDITOR_EVIDENCE) await writeFile(resolve(process.env.OMAA_EDITOR_EVIDENCE), JSON.stringify({ product, host: f.evidence.version, nativeUi: true, nativeEditor: initial.version,
    initial: { path: name, line: initial.line, column: initial.column }, coldRemapped: { line: remapped.line, column: remapped.column },
    persistedAnchor: true, editorChoiceRestored: true, runningEditorReused: true, fileHeaderOpened: true, staleRefused: true, ambiguousRefused: true, removedRefused: true, unauthenticatedRefused: true,
    modelRequests: f.requests.length, externalModels: false }, null, 2) + '\n');
});
