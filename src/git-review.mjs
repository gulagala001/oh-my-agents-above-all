import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_BYTES = 2 * 1024 * 1024, MAX_OUTPUT = 16 * 1024 * 1024, MAX_FILES = 200;
const scopes = new Set(['unstaged', 'staged', 'commit', 'branch', 'working']);
const locks = new Map();
const executionContext = new AsyncLocalStorage();
const digest = value => createHash('sha256').update(value).digest('hex');
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
export class GitReviewError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new GitReviewError(code, message); };
const decode = bytes => {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('UNSUPPORTED_ENCODING', '该比较含非 UTF-8 字节，请使用原生文件工具处理；没有改动索引或文件'); }
};

// Never pass a shell command or a client-supplied patch to Git. Disable external
// diff/textconv and use an explicit path separator for every file argument.
async function git(cwd, args, { input, allowDifference = false, bytes = false, mutation = false } = {}) {
  const executor = executionContext.getStore();
  if (!executor?.policy || !executor.subprocess || !executor.sandbox) fail('HOST_EXECUTOR_REQUIRED', 'Git 审阅需要原生 subprocess 和 sandbox 服务');
  const signal = AbortSignal.timeout(20000), policy = { ...executor.policy, ...mutation ? {} : { mode: 'read-only' } };
  const program = await executor.subprocess.resolveExecutable('git', undefined, signal);
  const command = [program, '--literal-pathspecs', '--no-optional-locks', '-c', 'core.quotePath=false', '-c', 'core.pager=cat', '-c', 'core.fsmonitor=false', '-c', 'diff.suppressBlankEmpty=false', '-C', cwd, ...args];
  const confined = policy.mode === 'danger-full-access' ? { argv: command } : await executor.sandbox.confine(command, policy, signal);
  if (mutation && (executor.policy?.mode !== policy.mode || executor.policy?.workspaceRoot !== policy.workspaceRoot)) fail('READ_ONLY', '宿主权限或会话模式已变化，请刷新后操作');
  const child = executor.subprocess.spawn({ argv: confined.argv, cwd, env: { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal });
  child.stdin?.on('error', () => {}); child.stdin?.end(input);
  const collect = async (stream, max) => { const chunks = []; let count = 0; for await (const chunk of stream) { count += chunk.length; if (count > max) { child.terminate(); fail('REVIEW_TOO_LARGE', 'Git 输出超过大小限制，请缩小比较范围'); } chunks.push(chunk); } return Buffer.concat(chunks); };
  const [outcome, stdout, stderr] = await Promise.all([child.done, collect(child.stdout, MAX_OUTPUT), collect(child.stderr, 65536)]);
  if (outcome.exitCode !== 0 && !(allowDifference && outcome.exitCode === 1)) fail(signal.aborted ? 'GIT_TIMEOUT' : 'GIT_FAILED', stderr.toString('utf8').slice(-4096).trim() || 'Git 操作失败');
  if (bytes) return stdout;
  return decode(stdout);
}
async function serial(key, run) {
  const previous = locks.get(key) ?? Promise.resolve(); let release;
  const pending = new Promise(resolve => { release = resolve; }), tail = previous.then(() => pending); locks.set(key, tail);
  await previous; try { return await run(); } finally { release(); if (locks.get(key) === tail) locks.delete(key); }
}
async function binding(session) {
  if (typeof session?.header?.cwd !== 'string') fail('INVALID_SESSION', '缺少原生会话工作目录');
  const root = await fs.realpath(executionContext.getStore()?.cwd ?? session.header.cwd), repo = await fs.realpath((await git(root, ['rev-parse', '--show-toplevel'])).trim());
  if (!inside(repo, root)) fail('UNSAFE_PATH', '工作目录不在 Git 仓库内');
  const gitDir = await fs.realpath((await git(root, ['rev-parse', '--absolute-git-dir'])).trim());
  const policyRoot = executionContext.getStore()?.policy?.workspaceRoot;
  const canonicalPolicyRoot = policyRoot && await fs.realpath(policyRoot);
  return { root, repo, gitDir, policyRoot, canonicalPolicyRoot, prefix: path.relative(repo, root).split(path.sep).join('/') };
}
function filePath(bound, file) {
  if (typeof file !== 'string' || !file || file.includes('\0') || file.includes('\\') || path.posix.isAbsolute(file) || file.split('/').some(p => p === '..' || p === '.git')) fail('UNSAFE_PATH', '文件路径无效');
  const target = path.resolve(bound.root, file);
  if (target === bound.root || !inside(bound.root, target)) fail('UNSAFE_PATH', '文件路径超出工作目录');
  return { target, gitPath: bound.prefix ? bound.prefix + '/' + file : file };
}
async function regular(bound, file, { absent = true } = {}) {
  const { target } = filePath(bound, file); let current = bound.root;
  for (const part of path.relative(bound.root, target).split(path.sep)) {
    current = path.join(current, part);
    let stat; try { stat = await fs.lstat(current); } catch (error) { if (absent && error.code === 'ENOENT') return undefined; throw error; }
    if (stat.isSymbolicLink() || current !== target && !stat.isDirectory() || current === target && (!stat.isFile() || stat.nlink !== 1)) fail('UNSAFE_PATH', '审阅写操作不支持符号链接、硬链接或非普通文件');
  }
  const stat = await fs.stat(target);
  if (stat.size > MAX_BYTES) return { oversized: true, stat };
  const bytes = await fs.readFile(target);
  if (bytes.length > MAX_BYTES) return { oversized: true, stat };
  let text; try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return { binary: true, stat }; }
  return bytes.includes(0) ? { binary: true, stat } : { bytes, text, stat };
}
// The patch is a machine contract, independent of the user's display settings.
const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', '--full-index',
  '--output-indicator-new=+', '--output-indicator-old=-', '--output-indicator-context= '];
async function resolveScope(bound, scope, ref) {
  if (!scopes.has(scope)) fail('INVALID_SCOPE', 'Git 比较范围无效');
  if (ref !== undefined && (typeof ref !== 'string' || ref.length > 256 || ref.includes('\0') || ref.startsWith('-'))) fail('INVALID_REF', 'Git 引用无效');
  if (scope === 'unstaged') return { scope, args: ['diff', ...diffFlags] };
  if (scope === 'staged') return { scope, args: ['diff', '--cached', ...diffFlags] };
  if (scope === 'working') return { scope, args: ['diff', ...diffFlags, 'HEAD'] };
  let selected = ref || 'HEAD';
  if (scope === 'branch' && !ref) {
    selected = await git(bound.repo, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).then(s => s.trim()).catch(() => 'main');
  }
  const commit = (await git(bound.repo, ['rev-parse', '--verify', '--end-of-options', selected + '^{commit}'])).trim();
  if (scope === 'commit') return { scope, ref: selected, commit, args: ['show', '--format=', '--diff-merges=first-parent', ...diffFlags, commit] };
  const head = (await git(bound.repo, ['rev-parse', '--verify', 'HEAD'])).trim();
  const base = (await git(bound.repo, ['merge-base', commit, head])).trim();
  return { scope, ref: selected, commit, base, head, args: ['diff', ...diffFlags, base, head] };
}
async function parseStats(text, bound) {
  const rows = text.split('\0'), versions = new Map(), stats = [], objects = new Set();
  for (let at = 0; at < rows.length; at++) {
    const row = rows[at];
    if (!row) continue;
    if (row.startsWith(':')) {
      const parents = /^:+/.exec(row)[0].length, fields = row.slice(parents).split(' '), count = parents + 1;
      if (fields.length !== count * 2 + 1 || !rows[at + 1] || !/^[A-Z]+\d*$/.test(fields.at(-1))) fail('INVALID_DIFF', '无法读取 Git 文件版本');
      const sides = fields.slice(0, count).map((mode, index) => ({ mode, oid: fields[index + count] }));
      if (sides.some(side => !/^\d{6}$/.test(side.mode) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(side.oid))) fail('INVALID_DIFF', 'Git 文件对象无效');
      const file = rows[++at];
      versions.set(file, { sides, unmerged: parents > 1 || fields.at(-1) === 'U' || versions.get(file)?.unmerged });
      // Git can emit only combined raw records for unresolved index entries.
      // Keep those files visible and read-only even without a text/numstat body.
      stats.push('0\t0\t' + file);
      for (const side of sides) if (/^100(?:644|755)$/.test(side.mode) && !/^0+$/.test(side.oid)) objects.add(side.oid);
    } else stats.push(row);
  }
  // Ask Git for the selected blobs' sizes without loading their contents or
  // borrowing the current worktree file as a substitute for a historical side.
  const sizes = new Map();
  if (objects.size) {
    const result = await git(bound.repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input: [...objects].join('\n') + '\n' });
    for (const row of result.trim().split('\n')) {
      const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(row);
      if (!match) fail('INVALID_DIFF', '无法读取 Git 文件大小');
      sizes.set(match[1], Number(match[2]));
    }
  }
  const files = new Map();
  for (const row of stats) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(row);
    if (!match) fail('INVALID_DIFF', '无法读取 Git 文件统计');
    const gitPath = match[3], prefix = bound.prefix && bound.prefix + '/';
    if (prefix && !gitPath.startsWith(prefix)) continue;
    const file = prefix ? gitPath.slice(prefix.length) : gitPath; filePath(bound, file);
    const version = versions.get(gitPath);
    if (!version) fail('INVALID_DIFF', 'Git 文件统计缺少对应版本');
    const oversized = version.sides.some(side => sizes.get(side.oid) > MAX_BYTES);
    const unsafe = version.unmerged || version.sides.some(side => !['000000', '100644', '100755'].includes(side.mode));
    files.set(file, { path: file, display: file, added: match[1] === '-' ? 0 : Number(match[1]), deleted: match[2] === '-' ? 0 : Number(match[2]),
      ...(match[1] === '-' ? { binary: true } : {}), ...(oversized ? { oversized: true } : {}), ...(unsafe ? { unsafe: true } : {}) });
  }
  return [...files.values()];
}
function parsePatch(patch, file) {
  const rows = patch.split('\n'), first = rows.findIndex(row => /^@@ /.test(row));
  if (first < 0) return { kind: 'binary', path: file, display: file };
  const hunks = [], rawHunks = []; let hunk, raw;
  for (const row of rows.slice(first)) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (match) { hunk = { oldStart: Math.max(1, Number(match[1])), oldLines: Number(match[2] ?? 1), newStart: Math.max(1, Number(match[3])), newLines: Number(match[4] ?? 1), lines: [] }; hunks.push(hunk); raw = [row]; rawHunks.push(raw); }
    else if (hunk && /^[ +\-\\]/.test(row)) { raw.push(row); if (row[0] !== '\\') hunk.lines.push(row); }
  }
  return { diff: { kind: 'text', path: file, display: file, before: !/^new file mode /m.test(patch), after: !/^deleted file mode /m.test(patch), hunks, coarse: false }, header: rows.slice(0, first).join('\n') + '\n', rawHunks };
}
function untrackedPatch(file, text, mode, objectId) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let patch = `diff --git ${JSON.stringify('a/' + file)} ${JSON.stringify('b/' + file)}\nnew file mode ${mode & 0o111 ? '100755' : '100644'}\nindex ${'0'.repeat(objectId.length)}..${objectId}\n--- /dev/null\n+++ ${JSON.stringify('b/' + file)}\n`;
  if (lines.length) patch += `@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => '+' + line).join('\n') + '\n' + (text.endsWith('\n') ? '' : '\\ No newline at end of file\n');
  // Empty files are staged as real empty new files, without an invented hunk.
  return patch;
}
async function readComparison(bound, selected) {
  // Git emits NUL-delimited raw/numstat records, an empty record, then the
  // patch. Read them together so metadata and content share one observation.
  const bytes = await git(bound.repo, [...selected.args, '--raw', '--no-abbrev', '--numstat', '-z', '--patch', '--binary', '--', bound.prefix || '.'], { bytes: true });
  const at = bytes.indexOf(Buffer.from([0, 0]));
  if (bytes.length && at < 0 && bytes.at(-1) !== 0) fail('INVALID_DIFF', 'Git 比较缺少正文边界');
  return { stats: decode(at < 0 ? bytes : bytes.subarray(0, at)), revision: digest(bytes) };
}
async function state(session, scope = 'unstaged', ref, detail) {
  const bound = await binding(session), selected = await resolveScope(bound, scope, ref);
  const fromWorktree = ['unstaged', 'working'].includes(scope);
  const [snapshot, untrackedText] = await Promise.all([
    readComparison(bound, selected),
    fromWorktree ? git(bound.repo, ['ls-files', '--others', '--exclude-standard', '-z', '--', bound.prefix || '.']) : '',
  ]);
  const files = await parseStats(snapshot.stats, bound), seen = new Set(files.map(f => f.path)), untracked = new Map(), untrackedRevisions = [];
  if (fromWorktree) for (const file of files) {
    const value = await regular(bound, file.path).catch(error => error.code === 'UNSAFE_PATH' ? { unsafe: true } : Promise.reject(error));
    if (value?.binary) file.binary = true;
    if (value?.oversized) file.oversized = true;
    if (value?.unsafe) file.unsafe = true;
  }
  for (const gitPath of untrackedText.split('\0').filter(Boolean)) {
    const file = bound.prefix ? gitPath.slice(bound.prefix.length + 1) : gitPath;
    const value = await regular(bound, file).catch(error => error.code === 'UNSAFE_PATH' ? { unsafe: true } : Promise.reject(error));
    if (!value || seen.has(file)) continue;
    untrackedRevisions.push([file, value.bytes ? [digest(value.bytes), value.stat.mode] : [value.stat?.size, value.stat?.mtimeMs, value.stat?.ctimeMs, value.unsafe]]);
    if (file === detail) untracked.set(file, value);
    files.push({ path: file, display: file, added: value.text ? value.text.split('\n').length - (value.text.endsWith('\n') ? 1 : 0) : 0, deleted: 0, status: 'untracked', ...(value.binary ? { binary: true } : {}), ...(value.oversized ? { oversized: true } : {}), ...(value.unsafe ? { unsafe: true } : {}) });
  }
  const revision = digest(JSON.stringify({ root: bound.root, scope, ref: selected.ref, commit: selected.commit, base: selected.base, head: selected.head,
    snapshot: snapshot.revision, untracked: untrackedRevisions }));
  files.sort((a, b) => a.display.localeCompare(b.display));
  return { bound, selected, files, revision, untracked, snapshot };
}
function actions(file, scope, writable, bound) {
  if (!writable || file.binary || file.oversized || file.unsafe) return [];
  const policy = executionContext.getStore()?.policy;
  const indexAllowed = policy?.mode === 'danger-full-access' || policy?.mode === 'workspace-write' && policy.workspaceRoot === bound.policyRoot && inside(bound.canonicalPolicyRoot, bound.gitDir);
  return scope === 'unstaged' ? [...indexAllowed ? ['stage'] : [], 'revert'] : scope === 'staged' && indexAllowed ? ['unstage'] : [];
}
function summary(session, value, writable) {
  const last = session.snapshotEvents().findLast(event => event.type === 'workspace/changes');
  return { sessionId: session.id, root: value.bound.root, scope: value.selected.scope, ...(value.selected.ref ? { ref: value.selected.ref } : {}), revision: value.revision,
    ...(value.selected.commit ? { commit: value.selected.commit } : {}), ...(value.selected.base ? { base: value.selected.base } : {}),
    files: value.files.slice(0, MAX_FILES).map(file => ({ ...file, actions: actions(file, value.selected.scope, writable, value.bound) })), total: value.files.length,
    added: value.files.reduce((n, f) => n + f.added, 0), deleted: value.files.reduce((n, f) => n + f.deleted, 0),
    ...(last ? { lastTurn: { seq: last.seq, turn: last.data.turn } } : {}) };
}
async function comparison(value, file) {
  const selected = value.files.find(f => f.path === file);
  if (!selected) fail('FILE_NOT_LISTED', '该文件不在当前比较范围');
  if (selected.binary || selected.oversized || selected.unsafe) return { diff: { kind: selected.oversized ? 'oversized' : 'binary', path: file, display: file } };
  const observed = value.untracked.get(file), gitPath = filePath(value.bound, file).gitPath;
  const patch = observed ? untrackedPatch(gitPath, observed.text ?? '', observed.stat.mode, (await git(value.bound.repo, ['hash-object', '--stdin'], { input: observed.bytes })).trim()) : await git(value.bound.repo, [...value.selected.args, '--', gitPath]);
  const parsed = parsePatch(patch, file);
  return { ...parsed, diff: parsed.diff ?? { kind: 'text', path: file, display: file, before: !/^new file mode /m.test(patch), after: !/^deleted file mode /m.test(patch), hunks: [], coarse: false }, patch };
}

export function createGitReview({ writable, execution }) {
  const environment = session => {
    const capabilities = execution(session);
    return { ...capabilities, get policy() { return execution(session)?.policy; } };
  };
  return {
    async references(session) {
      return executionContext.run(environment(session), async () => {
        const bound = await binding(session);
        const [names, current] = await Promise.all([
          git(bound.repo, ['for-each-ref', '--format=%(refname:short)', '--count=200', 'refs/heads', 'refs/remotes']),
          git(bound.repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then(value => value.trim()).catch(() => ''),
        ]);
        return { current, refs: names.split('\n').filter(Boolean).filter(name => !name.endsWith('/HEAD')) };
      });
    },
    async inspect(session, options = {}) {
      return executionContext.run(environment(session), async () => {
      const value = await state(session, options.scope, options.ref, options.path), canWrite = writable(session);
      if (options.revision && options.revision !== value.revision) fail('revision-conflict', '文件或索引已变化，请刷新比较');
      if (!options.path) return summary(session, value, canWrite);
      const result = await comparison(value, options.path), file = value.files.find(f => f.path === options.path), allowed = actions(file, value.selected.scope, canWrite, value.bound);
      // Git objects are pinned for committed scopes. Index/worktree reads can
      // change between commands, so never attach an old revision to new lines.
      if (!['commit', 'branch'].includes(value.selected.scope) && !value.untracked.has(options.path)
        && (await readComparison(value.bound, value.selected)).revision !== value.snapshot.revision)
        fail('revision-conflict', '读取期间文件或索引已变化，请刷新比较');
      const hunkActions = {};
      if (result.diff.kind === 'text' && result.diff.before && result.diff.after) result.diff.hunks.forEach((_, index) => { hunkActions[index] = allowed; });
      return { sessionId: session.id, scope: value.selected.scope, revision: value.revision, diff: result.diff, hunkActions };
      });
    },
    async change(session, request) {
      return executionContext.run(environment(session), async () => {
      const bound = await binding(session);
      return serial(bound.repo, async () => {
        if (!writable(session)) fail('READ_ONLY', '请先停止任务并切到默认模式；宿主权限也须允许写入');
        if (typeof request.revision !== 'string' || !/^[a-f0-9]{64}$/.test(request.revision)) fail('INVALID_REVISION', '请刷新比较后操作');
        const value = await state(session, request.scope, request.ref, request.path);
        if (value.revision !== request.revision) fail('revision-conflict', '文件或索引已变化，请刷新比较');
        const file = value.files.find(f => f.path === request.path);
        if (!file || !actions(file, value.selected.scope, true, value.bound).includes(request.action)) fail('INVALID_ACTION', '当前文件或宿主工作目录权限不支持该操作');
        if (request.action !== 'unstage') await regular(value.bound, file.path);
        const compared = await comparison(value, file.path); let patch = compared.patch;
        if (request.hunk !== undefined) {
          if (!Number.isSafeInteger(request.hunk) || request.hunk < 0 || !compared.diff.before || !compared.diff.after || !compared.rawHunks?.[request.hunk]) fail('INVALID_HUNK', '当前比较块不支持该操作');
          patch = compared.header.replace(/^(?:old|new) mode [^\n]*\n/gm, '') + compared.rawHunks[request.hunk].join('\n') + '\n';
        }
        const args = ['apply', '--whitespace=nowarn', ...(request.action === 'revert' || request.action === 'unstage' ? ['--reverse'] : []), ...(request.action === 'stage' || request.action === 'unstage' ? ['--cached'] : [])];
        if (file.status !== 'untracked') await git(value.bound.repo, [...args, '--check'], { input: patch });
        if (!writable(session) || (await state(session, request.scope, request.ref)).revision !== request.revision) fail('revision-conflict', '操作前文件或会话状态已变化，请刷新比较');
        if (request.action === 'revert' && file.status === 'untracked') {
          const current = await regular(value.bound, file.path), expected = value.untracked.get(file.path);
          if (!current?.bytes || digest(current.bytes) !== digest(expected.bytes)) fail('revision-conflict', '新文件已变化，请刷新比较');
          await git(value.bound.repo, ['clean', '-f', '--', filePath(value.bound, file.path).gitPath], { mutation: true });
        } else if (request.action === 'stage' && file.status === 'untracked') await git(value.bound.repo, ['add', '--', filePath(value.bound, file.path).gitPath], { mutation: true });
        else await git(value.bound.repo, args, { input: patch, mutation: true });
        return { ok: true, summary: summary(session, await state(session, request.scope, request.ref), writable(session)) };
      });
      });
    },
  };
}
