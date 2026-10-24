import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readlink, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { createGitReview } from '../src/git-review.mjs';
const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(path.join(process.env.OMAA_TEST_ROOT_DIR ?? tmpdir(), 'omaa-git-')); t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => exec('git', ['-C', root, ...args]).then(r => r.stdout);
  await git('init', '-b', 'main'); await git('config', 'user.name', 'OMAA fixture'); await git('config', 'user.email', 'fixture@invalid.example');
  const before = Array.from({ length: 30 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n';
  await writeFile(path.join(root, 'task.txt'), before); await git('add', '--', 'task.txt'); await git('commit', '-m', 'baseline');
  const session = { id: 'native-session', header: { cwd: root }, snapshotEvents: () => [{ type: 'workspace/changes', seq: 42, data: { turn: 2 } }] };
  // Pure Git semantics in temporary repositories; installed browser checks
  // exercise the real host subprocess/sandbox implementations.
  let beforeSpawn;
  const invocations = [];
  const subprocess = { resolveExecutable: async name => name, spawn(spec) {
    invocations.push(spec.argv); beforeSpawn?.(spec.argv);
    const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: { ...process.env, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'], signal: spec.signal });
    const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal })); });
    return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, done, terminate: () => child.kill() };
  } };
  let writable = true; const review = createGitReview({ execution: () => ({ subprocess, sandbox: { confine: async argv => ({ argv }) }, policy: { mode: 'danger-full-access', workspaceRoot: root } }), writable: () => writable });
  return { root, git, before, session, review, invocations, intercept: fn => { beforeSpawn = fn; }, readonly: () => { writable = false; } };
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

test('untracked detail retention preserves stale revisions, exact previews and guarded removal', async t => {
  const f = await fixture(t), target = path.join(f.root, 'new task.txt');
  await writeFile(target, 'original new file'); await writeFile(path.join(f.root, 'keep.txt'), 'keep unchanged');
  const before = await f.review.inspect(f.session);
  const detail = await f.review.inspect(f.session, { path: 'new task.txt', revision: before.revision });
  assert.ok(detail.diff.hunks.some(hunk => hunk.lines.includes('+original new file')));
  await writeFile(target, 'changed new file');
  await assert.rejects(f.review.change(f.session, { path: 'new task.txt', revision: before.revision, action: 'revert' }), { code: 'revision-conflict' });
  assert.equal(await readFile(target, 'utf8'), 'changed new file');
  const current = await f.review.inspect(f.session);
  await f.review.change(f.session, { path: 'new task.txt', revision: current.revision, action: 'revert' });
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.root, 'keep.txt'), 'utf8'), 'keep unchanged');
});

test('committed comparisons use their Git objects regardless of current file type', async t => {
  const f = await fixture(t);
  await f.git('checkout', '-b', 'feature');
  await writeFile(path.join(f.root, 'task.txt'), 'committed text\n'); await f.git('commit', '-am', 'feature');
  for (const current of ['binary', 'oversized', 'symlink']) {
    await rm(path.join(f.root, 'task.txt'));
    if (current === 'symlink') await symlink('missing-target', path.join(f.root, 'task.txt'));
    else await writeFile(path.join(f.root, 'task.txt'), current === 'binary' ? Buffer.from([0, 1, 2]) : 'x'.repeat(2 * 1024 * 1024 + 1));
    for (const scope of ['commit', 'branch']) {
      const options = { scope, ...(scope === 'branch' ? { ref: 'main' } : {}) };
      const summary = await f.review.inspect(f.session, options);
      assert.equal(summary.files[0].binary, undefined, current + ' must not classify committed text');
      assert.equal(summary.files[0].oversized, undefined, current + ' must not size committed text');
      const detail = await f.review.inspect(f.session, { ...options, path: 'task.txt', revision: summary.revision });
      assert.equal(detail.diff.kind, 'text');
      assert(detail.diff.hunks.some(h => h.lines.includes('+committed text')));
    }
  }
});

test('staged text can be viewed and unstaged independently of the current worktree file', async t => {
  for (const current of ['binary', 'oversized', 'symlink']) await t.test(current, async t => {
    const f = await fixture(t), target = path.join(f.root, 'task.txt');
    await writeFile(target, 'staged text\n'); await f.git('add', '--', 'task.txt'); await rm(target);
    const bytes = current === 'binary' ? Buffer.from([0, 1, 2]) : Buffer.from('x'.repeat(2 * 1024 * 1024 + 1));
    if (current === 'symlink') await symlink('missing-target', target); else await writeFile(target, bytes);
    const summary = await f.review.inspect(f.session, { scope: 'staged' });
    assert.deepEqual(summary.files[0].actions, ['unstage']);
    const detail = await f.review.inspect(f.session, { scope: 'staged', path: 'task.txt', revision: summary.revision });
    assert(detail.diff.hunks.some(h => h.lines.includes('+staged text')));
    await f.review.change(f.session, { scope: 'staged', path: 'task.txt', revision: summary.revision, action: 'unstage' });
    assert.equal(await f.git('show', ':task.txt'), f.before);
    if (current === 'symlink') assert.equal(await readlink(target), 'missing-target');
    else assert.deepEqual(await readFile(target), bytes);
  });
});

test('immutable comparison revisions ignore unrelated worktree and index edits', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'task.txt'), 'committed text\n'); await f.git('commit', '-am', 'second');
  const commit = (await f.git('rev-parse', 'HEAD')).trim();
  const summary = await f.review.inspect(f.session, { scope: 'commit', ref: commit });
  await writeFile(path.join(f.root, 'task.txt'), 'uncommitted text\n'); await f.git('add', 'task.txt');
  const detail = await f.review.inspect(f.session, { scope: 'commit', ref: commit, path: 'task.txt', revision: summary.revision });
  assert(detail.diff.hunks.some(h => h.lines.includes('+committed text')));
});

test('comparison size limits follow both selected Git versions', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'task.txt'), 'large line\n'.repeat(200000)); await f.git('commit', '-am', 'large');
  await writeFile(path.join(f.root, 'task.txt'), 'small now\n');
  const summary = await f.review.inspect(f.session, { scope: 'commit' });
  assert.equal(summary.files[0].oversized, true);
  const detail = await f.review.inspect(f.session, { scope: 'commit', path: 'task.txt', revision: summary.revision });
  assert.equal(detail.diff.kind, 'oversized');
});

test('review patch semantics do not depend on user diff prefix and relative preferences', async t => {
  const f = await fixture(t), nested = path.join(f.root, 'nested'); await mkdir(nested);
  await writeFile(path.join(nested, 'file.txt'), 'before\n\ncontext\n'); await f.git('add', '.'); await f.git('commit', '-m', 'nested');
  await f.git('config', 'diff.noprefix', 'true'); await f.git('config', 'diff.relative', 'true');
  await f.git('config', 'diff.suppressBlankEmpty', 'true'); await f.git('config', 'diff.outputIndicatorNew', '>');
  await f.git('config', 'diff.outputIndicatorOld', '<'); await f.git('config', 'diff.outputIndicatorContext', '.');
  f.session.header.cwd = nested; await writeFile(path.join(nested, 'file.txt'), 'after\n\ncontext\n');
  const summary = await f.review.inspect(f.session);
  const detail = await f.review.inspect(f.session, { path: 'file.txt', revision: summary.revision });
  assert(detail.diff.hunks[0].lines.includes('+after'));
  await f.review.change(f.session, { path: 'file.txt', revision: summary.revision, action: 'stage', hunk: 0 });
  assert.equal(await f.git('show', ':nested/file.txt'), 'after\n\ncontext\n');
});

test('merge commits have a stable first-parent comparison and unresolved files stay read-only', async t => {
  const f = await fixture(t);
  await f.git('checkout', '-b', 'feature'); await writeFile(path.join(f.root, 'feature.txt'), 'feature\n'); await f.git('add', '.'); await f.git('commit', '-m', 'feature');
  await f.git('checkout', 'main'); await writeFile(path.join(f.root, 'main.txt'), 'main\n'); await f.git('add', '.'); await f.git('commit', '-m', 'main');
  await f.git('merge', '--no-ff', 'feature', '-m', 'merge');
  const summary = await f.review.inspect(f.session, { scope: 'commit' });
  assert.deepEqual(summary.files.map(file => file.path), ['feature.txt']);
  const detail = await f.review.inspect(f.session, { scope: 'commit', path: 'feature.txt', revision: summary.revision });
  assert(detail.diff.hunks[0].lines.includes('+feature'));
  await f.git('checkout', 'feature'); await writeFile(path.join(f.root, 'task.txt'), 'theirs\n'); await f.git('commit', '-am', 'theirs');
  await f.git('checkout', 'main'); await writeFile(path.join(f.root, 'task.txt'), 'ours\n'); await f.git('commit', '-am', 'ours');
  await assert.rejects(f.git('merge', 'feature'));
  const conflicted = await f.review.inspect(f.session);
  assert.equal(conflicted.files.filter(file => file.path === 'task.txt').length, 1);
  assert.deepEqual(conflicted.files.find(file => file.path === 'task.txt').actions, []);
  await assert.rejects(f.review.change(f.session, { path: 'task.txt', revision: conflicted.revision, action: 'revert' }), { code: 'INVALID_ACTION' });
});

test('a worktree change during detail reading cannot return new lines under an old revision', async t => {
  const f = await fixture(t), target = path.join(f.root, 'task.txt');
  await writeFile(target, 'observed\n');
  const summary = await f.review.inspect(f.session);
  f.intercept(argv => {
    if (argv.includes('diff') && !argv.includes('--raw') && !argv.includes('--binary')) {
      f.intercept(null); writeFileSync(target, 'later external edit\n');
    }
  });
  await assert.rejects(f.review.inspect(f.session, { path: 'task.txt', revision: summary.revision }), { code: 'revision-conflict' });
  assert.equal(await readFile(target, 'utf8'), 'later external edit\n');
});
