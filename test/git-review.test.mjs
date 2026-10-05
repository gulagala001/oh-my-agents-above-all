import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createGitReview } from '../src/git-review.mjs';
const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'omaa-git-')); t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => exec('git', ['-C', root, ...args]).then(r => r.stdout);
  await git('init', '-b', 'main'); await git('config', 'user.name', 'OMAA fixture'); await git('config', 'user.email', 'fixture@invalid.example');
  const before = Array.from({ length: 30 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n';
  await writeFile(path.join(root, 'task.txt'), before); await git('add', '--', 'task.txt'); await git('commit', '-m', 'baseline');
  const session = { id: 'native-session', header: { cwd: root }, snapshotEvents: () => [{ type: 'workspace/changes', seq: 42, data: { turn: 2 } }] };
  // Pure Git semantics in temporary repositories; installed browser checks
  // exercise the real host subprocess/sandbox implementations.
  const subprocess = { resolveExecutable: async name => name, spawn(spec) {
    const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'], signal: spec.signal });
    const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal })); });
    return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, done, terminate: () => child.kill() };
  } };
  let writable = true; const review = createGitReview({ execution: () => ({ subprocess, sandbox: { confine: async argv => ({ argv }) }, policy: { mode: 'danger-full-access', workspaceRoot: root } }), writable: () => writable });
  return { root, git, before, session, review, readonly: () => { writable = false; } };
}
test('real Git hunk stage, unstage and revert preserve independent changes and stale writes fail', async t => {
  const f = await fixture(t), after = f.before.replace('line 2\n', 'first change\n').replace('line 29\n', 'last change\n');
  await writeFile(path.join(f.root, 'task.txt'), after);
  let summary = await f.review.inspect(f.session), diff = await f.review.inspect(f.session, { path: 'task.txt', revision: summary.revision });
  assert.equal(diff.diff.hunks.length, 2); assert.deepEqual(summary.lastTurn, { seq: 42, turn: 2 });
  await f.review.change(f.session, { scope: 'unstaged', revision: summary.revision, path: 'task.txt', action: 'stage', hunk: 0 });
  assert.equal(await f.git('show', ':task.txt'), f.before.replace('line 2\n', 'first change\n'));
  assert.equal(await readFile(path.join(f.root, 'task.txt'), 'utf8'), after);
  await assert.rejects(f.review.change(f.session, { revision: summary.revision, path: 'task.txt', action: 'revert' }), { code: 'revision-conflict' });
  summary = await f.review.inspect(f.session);
  await f.review.change(f.session, { revision: summary.revision, path: 'task.txt', action: 'revert' });
  assert.equal(await readFile(path.join(f.root, 'task.txt'), 'utf8'), f.before.replace('line 2\n', 'first change\n'));
  summary = await f.review.inspect(f.session, { scope: 'staged' });
  await f.review.change(f.session, { scope: 'staged', revision: summary.revision, path: 'task.txt', action: 'unstage' });
  assert.equal(await f.git('show', ':task.txt'), f.before);
  assert.equal(await readFile(path.join(f.root, 'task.txt'), 'utf8'), f.before.replace('line 2\n', 'first change\n'));
  f.readonly(); summary = await f.review.inspect(f.session); assert.deepEqual(summary.files[0].actions, []);
  await assert.rejects(f.review.change(f.session, { revision: summary.revision, path: 'task.txt', action: 'stage' }), { code: 'READ_ONLY' });
});
test('nested workspace stages actual new files with spaces, empty bytes and executable mode inside its boundary', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'nested'); await mkdir(dir); f.session.header.cwd = dir;
  await writeFile(path.join(f.root, 'outside.txt'), 'outside');
  await writeFile(path.join(dir, 'new task.txt'), 'exact no final newline', { mode: 0o755 }); await writeFile(path.join(dir, 'empty.txt'), '');
  let summary = await f.review.inspect(f.session); assert.equal(summary.files.length, 2); assert(summary.files.every(file => !file.path.startsWith('..')));
  await f.review.change(f.session, { revision: summary.revision, path: 'new task.txt', action: 'stage' });
  assert.equal(await f.git('show', ':nested/new task.txt'), 'exact no final newline');
  assert.match(await f.git('ls-files', '--stage', '--', 'nested/new task.txt'), /^100755 /);
  summary = await f.review.inspect(f.session); await f.review.change(f.session, { revision: summary.revision, path: 'empty.txt', action: 'stage' });
  assert.equal(await f.git('show', ':nested/empty.txt'), ''); assert.equal(await f.git('ls-files', '--', 'outside.txt'), '');
  await assert.rejects(f.review.inspect(f.session, { path: '../outside.txt' }), { code: 'FILE_NOT_LISTED' });
});
test('commit and branch compare committed contents and reject symbolic-link writes', async t => {
  const f = await fixture(t); await f.git('checkout', '-b', 'feature'); await writeFile(path.join(f.root, 'task.txt'), 'feature\n'); await f.git('commit', '-am', 'feature');
  for (const scope of ['commit', 'branch']) {
    const summary = await f.review.inspect(f.session, { scope, ...(scope === 'branch' ? { ref: 'main' } : {}) });
    assert.equal(summary.files[0].path, 'task.txt'); assert.deepEqual(summary.files[0].actions, []);
    const result = await f.review.inspect(f.session, { scope, ...(scope === 'branch' ? { ref: 'main' } : {}), path: 'task.txt', revision: summary.revision });
    assert(result.diff.hunks.some(h => h.lines.includes('+feature')));
  }
  await symlink(path.join(f.root, 'task.txt'), path.join(f.root, 'link.txt'));
  const summary = await f.review.inspect(f.session); assert.deepEqual(summary.files.find(f => f.path === 'link.txt').actions, []);
});
