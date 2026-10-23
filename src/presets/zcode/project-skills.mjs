import { dirname, isAbsolute, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { expandProjectSkillDirectory, parseProjectSkill, shouldScanProjectSkillDirectory } from './project-skill-parser.mjs';

const NAME = 'omaa-zcode-project-skills';
const MAX_CANDIDATES = 2048, MAX_READ_BYTES = 16 * 1024 * 1024;
function admitCandidate(budget) {
  if (++budget.candidates > MAX_CANDIDATES)
    throw Object.assign(Error('ZCode skill discovery exceeds its native 2048-candidate observation budget.'), { code: 'OMAA_ZCODE_SKILL_BUDGET_EXCEEDED' });
}
function admitBytes(budget, bytes) {
  if (bytes > MAX_READ_BYTES - budget.bytes)
    throw Object.assign(Error('ZCode skill reads exceed their native 16MiB observation budget.'), { code: 'OMAA_ZCODE_SKILL_BUDGET_EXCEEDED' });
  budget.bytes += bytes;
}
const original = value => value?.[symbols.original] ?? value;
// Shared module state prevents duplicate registrations from overlapping native
// preset assemblies. Scope identity alone never authorizes a lookup: every
// operation also verifies the actual live Session, product and workspace.
const registrations = new WeakMap();

function waitFor(work, signal) {
  const pending = Promise.resolve(work); pending.catch(() => {});
  signal?.throwIfAborted();
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const done = () => signal.removeEventListener('abort', abort);
    const abort = () => { done(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { done(); resolve(value); }, error => { done(); reject(error); });
  });
}

function checkOwner(record) {
  record.abort.signal.throwIfAborted();
  const current = record.ctx.get('agents')?.get(record.id);
  if (record.closed || !current || scopeOf(current.ctx) !== record.key
    || original(current.session) !== record.session || original(record.ctx.get('sessions')?.get(record.id)) !== record.session
    || record.ctx.get('omaa').product(current.session)?.id !== 'zcode' || record.ctx.get('omaa').product(current.session)?.preset !== record.preset
    || current.session.header.cwd !== record.workspace)
    throw Error('The project skill owner, preset or immutable workspace changed.');
}

async function verifyBase(record, signal) {
  checkOwner(record); signal.throwIfAborted();
  const base = await record.fs.resolve(record.workspace, { signal });
  checkOwner(record); signal.throwIfAborted();
  if (record.fs.processPath(base) !== record.basePath) throw Error('The canonical immutable skill workspace changed.');
  return base;
}

// Original user roots use the OS home, not DSH_HOME/DSH_AGENTS_HOME.
// A remote execution world must explicitly map that same host location; never
// infer its home from the parent cwd or a similarly spelled path.
async function userRootsFor(record, signal) {
  const roots = [];
  for (const source of ['zcode', 'agents']) {
    checkOwner(record); signal.throwIfAborted();
    const hostPath = join(homedir(), '.' + source, 'skills');
    const mapped = record.fs.processPathFromHostPath?.(hostPath);
    if (mapped === undefined) {
      if (!record.unmappedUserRoots.has(source)) {
        record.unmappedUserRoots.add(source);
        record.ctx.logger.warn('ZCode user .' + source + '/skills discovery omitted: native filesystem has no host-path mapping.');
      }
      continue;
    }
    if (typeof mapped !== 'string' || !isAbsolute(mapped)) throw Error('A native user skill mapping is not an absolute execution-world path.');
    const mappedPath = normalize(mapped), target = await record.fs.resolve(mappedPath, { signal });
    checkOwner(record); signal.throwIfAborted();
    // A root alias into a project or another home directory is outside this
    // deliberately narrow user-root authority, even on the first observation.
    if (record.fs.processPath(target) !== mappedPath) throw Error('A mapped user skill root has a different canonical path.');
    roots.push({ path: mappedPath, mappedPath, hostPath, scope: 'user', source });
  }
  return roots;
}

async function boundaryFor(record, root, signal) {
  const workspace = await verifyBase(record, signal);
  let boundary = workspace;
  if (root.scope === 'user') {
    const mapped = record.fs.processPathFromHostPath?.(root.hostPath);
    if (typeof mapped !== 'string' || !isAbsolute(mapped) || normalize(mapped) !== root.mappedPath)
      throw Error('The native user skill host-path mapping changed.');
    boundary = await record.fs.resolve(root.mappedPath, { signal });
    if (record.fs.processPath(boundary) !== root.path) throw Error('The canonical user skill root changed.');
  }
  const target = await record.fs.resolve(root.path, { signal });
  checkOwner(record); signal.throwIfAborted();
  if (!record.fs.contains(boundary, target) || record.fs.processPath(target) !== root.path)
    throw Error('The canonical skill root changed.');
  return boundary;
}

// Fixed roots.ts walks cwd upward to the nearest Git marker. Never inspect an
// ancestor above this Agent's authorized immutable workspace. Without a marker
// inside that boundary, use cwd alone (the original no-worktree fallback).
async function rootsFor(record, cwd, signal) {
  const base = await verifyBase(record, signal);
  const roots = await userRootsFor(record, signal), seen = new Set(roots.map(root => root.path));
  let directory = await record.fs.resolve(cwd ?? record.workspace, { cwd: record.workspace, signal });
  if (!record.fs.contains(base, directory)) return roots.map((root, index) => ({ ...root, rank: 150 + index / 1024 }));
  const directories = []; let foundGit = false;
  for (;;) {
    checkOwner(record); signal.throwIfAborted();
    const path = record.fs.processPath(directory);
    if (!isAbsolute(path)) throw Error('Native skill paths must use the mounted provider\'s absolute path spelling.');
    directories.push(path);
    const marker = await record.fs.resolve('.git', { cwd: path, signal });
    if (record.fs.contains(base, marker) && await record.fs.stat(marker, signal)) { foundGit = true; break; }
    if (path === record.basePath) break;
    if (directories.length >= 64) throw Error('Project skill ancestor discovery exceeds the native 64-directory bound.');
    const parent = await record.fs.resolve(dirname(path), { signal });
    if (!record.fs.contains(base, parent) || record.fs.processPath(parent) === path) break;
    directory = parent;
  }
  const selected = foundGit ? directories : directories.slice(0, 1);
  for (const path of selected) for (const source of ['zcode', 'agents']) {
    const target = await record.fs.resolve('.' + source + '/skills', { cwd: path, signal });
    const rootPath = record.fs.processPath(target);
    if (!record.fs.contains(base, target)) throw Error('A project skill root resolves outside the immutable workspace.');
    if (!isAbsolute(rootPath)) throw Error('Native skill root has no absolute execution-world path.');
    if (!seen.has(rootPath)) { seen.add(rootPath); roots.push({ path: rootPath, scope: 'project', source }); }
  }
  await verifyBase(record, signal);
  // User roots precede project roots within this provider. Native registry
  // rank/name resolution still owns cross-provider duplicate winners.
  return roots.map((root, index) => ({ ...root, rank: 150 + index / 1024 }));
}

async function verifyCandidate(record, root, candidate, signal) {
  const base = await boundaryFor(record, root, signal);
  if (typeof candidate.path !== 'string') return false;
  const target = await record.fs.resolve(candidate.path, { signal });
  if (!record.fs.contains(base, target)) return false;
  const info = await record.fs.stat(target, signal);
  checkOwner(record); signal.throwIfAborted();
  return info?.type === 'file';
}

async function skillFilesForRoot(record, root, signal, budget) {
  const base = await boundaryFor(record, root, signal), target = await record.fs.resolve(root.path, { signal });
  if (!record.fs.contains(base, target) || record.fs.processPath(target) !== root.path)
    throw Error('The canonical skill root changed before directory observation.');
  const info = await record.fs.stat(target, signal);
  if (!info || info.type !== 'directory') return new Map();
  const entries = await record.fs.listDir(target, signal);
  if (!Array.isArray(entries) || entries.length > 1024) throw Error('Project skill discovery exceeds its native 1024-entry-per-root bound.');
  const names = [];
  for (const entry of entries) {
    if (typeof entry.name !== 'string' || !entry.name || /[/\\\0]/u.test(entry.name)) throw Error('Invalid native skill directory entry.');
    if (!shouldScanProjectSkillDirectory(entry.name)) continue;
    let directory = entry.type === 'directory';
    // Native listings need not label a symbolic-link directory as directory.
    // Follow only a separately resolved target inside this root's authorized boundary.
    if (!directory && entry.type === 'other') {
      const child = await record.fs.resolve(entry.name, { cwd: root.path, signal });
      if (record.fs.contains(base, child)) directory = (await record.fs.stat(child, signal))?.type === 'directory';
    }
    if (directory) names.push(entry.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  const files = new Map();
  for (const directory of [root.path, ...names.map(name => join(root.path, name))]) {
    signal.throwIfAborted(); checkOwner(record);
    const lexical = join(directory, 'SKILL.md'), file = await record.fs.resolve(lexical, { signal });
    if (!record.fs.contains(base, file)) continue;
    const stat = await record.fs.stat(file, signal), path = record.fs.processPath(file);
    if (stat?.type === 'file') {
      admitCandidate(budget);
      if (!files.has(path)) files.set(path, { path, lexical, directory });
    }
  }
  await boundaryFor(record, root, signal); return files;
}

async function readDefinition(record, root, file, signal, budget) {
  if (!await verifyCandidate(record, root, file, signal)) return undefined;
  const target = await record.fs.resolve(file.lexical, { signal });
  const baseBefore = await boundaryFor(record, root, signal);
  if (!record.fs.contains(baseBefore, target) || record.fs.processPath(target) !== file.path)
    throw Error('A project skill escaped or changed before its bounded read.');
  const before = await record.fs.stat(target, signal);
  // Original generic Skill.load admits at most 100000 bytes. This reader
  // refuses oversized or unversioned input rather than pretending it is full.
  if (!before || before.type !== 'file' || !Number.isSafeInteger(before.size) || before.size < 0
    || before.size > 100000 || typeof before.version !== 'string') return undefined;
  // Reserve the observed complete size before reading. A growing file fails
  // this bounded read; the budget is admission, not an atomic I/O lease.
  const readLimit = Math.max(1, before.size);
  admitBytes(budget, readLimit);
  const bytes = await record.fs.readBytes(target, signal, readLimit), after = await record.fs.stat(target, signal);
  checkOwner(record); signal.throwIfAborted();
  const current = await record.fs.resolve(file.lexical, { signal });
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== before.size || !after || after.type !== 'file'
    || before.version !== after.version || before.size !== after.size || record.fs.processPath(current) !== file.path)
    throw Error('A project skill changed during its bounded read.');
  let parsed;
  try { parsed = parseProjectSkill(new TextDecoder('utf-8', { fatal: true }).decode(bytes), file.lexical); }
  catch (error) {
    record.ctx.logger.warn('Project skill ignored: invalid UTF-8, YAML or invocation metadata: ' + String(error).slice(0, 512));
    return undefined;
  }
  if (!parsed) return undefined;
  const directory = await record.fs.resolve(file.directory, { signal });
  const base = await boundaryFor(record, root, signal);
  if (!record.fs.contains(base, directory)) return undefined;
  return { ...parsed, source: root.scope + '-' + root.source, provider: NAME, path: file.path,
    resourceBase: { kind: 'directory', path: record.fs.processPath(directory) } };
}

async function initialize(record) {
  checkOwner(record);
  const signal = record.abort.signal;
  const base = await record.fs.resolve(record.workspace, { signal });
  checkOwner(record);
  record.basePath = record.fs.processPath(base);
  // Root joins use the provider's absolute execution-world spelling, never
  // process.cwd-relative or host-only filesystem input.
  if (!isAbsolute(record.basePath)) throw Error('The immutable workspace cannot be represented by the native filesystem skill provider.');
  record.unregister = record.ownerCtx.get('skills').registerProvider(control => {
    record.control = control;
    control.signal.addEventListener('abort', () => record.abort.abort(control.signal.reason), { once: true });
    const borrowed = new WeakMap();
    const run = (options, action) => {
      const signal = AbortSignal.any([record.abort.signal, ...(options.signal ? [options.signal] : [])]);
      const work = Promise.resolve().then(async () => {
        await verifyBase(record, signal);
        const value = await action(signal);
        await verifyBase(record, signal);
        return value;
      });
      record.pending.add(work);
      void work.finally(() => record.pending.delete(work)).catch(() => {});
      return work;
    };
    return { name: NAME,
      list(options) {
        return run(options, async signal => {
          const roots = await rootsFor(record, options.cwd, signal), selected = [], paths = new Set();
          const budget = { candidates: 0, bytes: 0 };
          for (const root of roots) {
            const files = await skillFilesForRoot(record, root, signal, budget);
            for (const file of files.values()) {
              if (paths.has(file.path)) continue;
              const definition = await readDefinition(record, root, file, signal, budget);
              if (!definition) continue;
              const { content: _body, ...summary } = definition;
              const value = Object.freeze({ ...summary, rank: root.rank, locator: Object.freeze({ format: 'project-skill' }) });
              borrowed.set(value, { root, path: file.path, name: definition.name });
              paths.add(file.path); selected.push(value);
            }
          }
          for (const root of roots) await boundaryFor(record, root, signal);
          // Preserve native completeness: tool-skill deliberately withholds
          // the entire model catalog when any provider is incomplete. The
          // installer invalidates unwatched observations at each assembly.
          return { candidates: selected, complete: true };
        });
      },
      get(candidate, options) {
        return run(options, async signal => {
          const selected = borrowed.get(candidate), roots = await rootsFor(record, options.cwd, signal);
          if (!selected || !roots.some(root => root.path === selected.root.path && root.source === selected.root.source
            && root.scope === selected.root.scope && root.hostPath === selected.root.hostPath && root.mappedPath === selected.root.mappedPath)) return undefined;
          const budget = { candidates: 0, bytes: 0 };
          const files = await skillFilesForRoot(record, selected.root, signal, budget), file = files.get(selected.path);
          if (!file) return undefined;
          const value = await readDefinition(record, selected.root, file, signal, budget);
          if (!value || value.name !== selected.name || !await verifyCandidate(record, selected.root, file, signal)) return undefined;
          const content = value.resourceBase?.kind === 'directory'
            ? expandProjectSkillDirectory(value.content, value.resourceBase.path) : value.content;
          return { ...value, content, source: selected.root.scope + '-' + selected.root.source };
        });
      },
    };
  });
  checkOwner(record);
}

function closeRecord(record) {
  if (record.closing) return record.closing;
  record.closed = true; record.abort.abort(Error('Project skill registration disposed.'));
  if (registrations.get(record.key) === record) registrations.delete(record.key);
  for (const holder of record.holders) holder.held.delete(record);
  record.holders.clear();
  record.closing = (async () => {
    const failures = [];
    // Revoke the native registry entry before waiting for any already borrowed
    // operation. Such an operation cannot return a late successful definition.
    try { record.unregister?.(); } catch (error) { failures.push(error); }
    await Promise.allSettled([record.ready]);
    await Promise.allSettled([...record.pending]);
    if (failures.length) throw new AggregateError(failures, 'Project skill disposal failed.');
  })();
  return record.closing;
}

/** Root integration calls ensure before next() in system-prompt/assemble. */
export function createProjectSkillsInstaller(ctx) {
  const held = new Set(), holder = { held };
  let disposed = false, disposal;
  async function dispose() {
    if (disposal) return disposal;
    disposed = true;
    const closing = [];
    for (const record of held) {
      record.holders.delete(holder);
      if (!record.holders.size) closing.push(closeRecord(record));
    }
    held.clear();
    disposal = Promise.allSettled(closing).then(outcomes => {
      const failures = outcomes.filter(value => value.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(value => value.reason), 'Project skill installer disposal failed.');
    });
    return disposal;
  }
  ctx.effect(() => dispose, 'ZCode project skill registrations');
  ctx.on('agent/disposed', ({ agent }) => {
    const key = agent?.ctx && scopeOf(agent.ctx), record = key && registrations.get(key);
    if (record && original(agent.session) === record.session) {
      void closeRecord(record).catch(error => {
        try { ctx.logger.warn('Project skill cleanup failed: ' + String(error).slice(0, 512)); }
        catch { /* Diagnostic failure must not create an unhandled rejection. */ }
      });
    }
  }, { global: true });
  return {
    dispose,
    async ensureProjectSkills(agent, signal) {
      signal?.throwIfAborted();
      if (disposed) throw Error('The project skill installer is disposed.');
      if (!agent) return;
      if (ctx.get('omaa').product(agent?.session)?.id !== 'zcode') return;
      const current = agent?.id && ctx.get('agents')?.get(agent.id), ownerCtx = agent?.ctx;
      const key = ownerCtx && scopeOf(ownerCtx), session = original(agent?.session);
      if (!current || !key || scopeOf(current.ctx) !== key || original(current.session) !== session
        || original(ctx.get('sessions')?.get(agent.id)) !== session || typeof session.header.cwd !== 'string' || !session.header.cwd)
        throw Error('Project skills require the exact live owning native Agent and immutable workspace.');
      let record = registrations.get(key);
      if (record && (record.session !== session || record.preset !== ctx.get('omaa').product(agent.session)?.preset || record.workspace !== session.header.cwd)) {
        await closeRecord(record); signal?.throwIfAborted();
        if (disposed) throw Error('The project skill installer is disposed.');
        record = registrations.get(key);
      }
      if (!record) {
        const fs = ownerCtx.get('fs');
        if (!fs || !ownerCtx.get('skills')) throw Error('Native filesystem skill services are unavailable.');
        record = { ctx: ownerCtx, ownerCtx, key, session, id: agent.id, preset: ctx.get('omaa').product(agent.session).preset,
          workspace: session.header.cwd, fs, abort: new AbortController(),
          holders: new Set(), pending: new Set(), unmappedUserRoots: new Set(), closed: false };
        registrations.set(key, record);
        record.ready = Promise.resolve().then(() => initialize(record));
        record.ready.catch(() => {});
      }
      record.holders.add(holder); held.add(record);
      try {
        await waitFor(record.ready, signal); signal?.throwIfAborted(); checkOwner(record);
        // No local watcher is installed over a potentially remote fs world.
        // Refresh the native cache before the next model step; incomplete is
        // an availability fact, not a substitute for cache invalidation.
        record.control.invalidate();
      }
      catch (error) {
        if (!signal?.aborted) {
          try { await closeRecord(record); }
          catch (cleanup) { throw new AggregateError([error, cleanup], 'Project skill installation and cleanup failed.'); }
        }
        throw error;
      }
    },
  };
}
