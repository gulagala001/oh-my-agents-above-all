import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const name = 'omaa-cursor-checkpoints';
export const inject = ['omaa', 'tools', 'systemPrompt', 'agents'];
const FILE_BYTES = 2 * 1024 * 1024, CONTENT_BYTES = 64 * 1024 * 1024, META_BYTES = 512 * 1024, MAX_TURNS = 32, MAX_FILES = 64;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const sameIdentity = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;
const sameSide = (a, b) => a?.kind === 'absent' && b?.kind === 'absent' || a?.kind === 'bytes' && b?.kind === 'bytes' && a.hash === b.hash && a.mode === b.mode;
const fileLocks = new Map();
async function locked(locks, key, run) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release; const wait = new Promise(resolve => { release = resolve; });
  const tail = previous.then(() => wait); locks.set(key, tail);
  await previous;
  try { return await run(); } finally { release(); if (locks.get(key) === tail) locks.delete(key); }
}
function lockFiles(files, run, index = 0) { return index === files.length ? run() : locked(fileLocks, files[index], () => lockFiles(files, run, index + 1)); }
export class CheckpointError extends Error {
  constructor(code, message, details) { super(message); this.name = 'CheckpointError'; this.code = code; this.details = details; }
}
const fail = (code, message) => { throw new CheckpointError(code, message); };
function integer(value, label) { if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_CHECKPOINT', `${label} must be a non-negative integer`); return value; }
async function boundedRead(handle, max = FILE_BYTES) {
  const buffer = Buffer.alloc(max + 1); let length = 0;
  while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead; }
  if (length > max) fail('FILE_TOO_LARGE', 'The file exceeds the checkpoint byte limit');
  return buffer.subarray(0, length);
}
async function rootFor(sessionId, session) {
  if (session?.id !== sessionId || typeof session?.header?.cwd !== 'string') fail('INVALID_SESSION', 'A matching native DSH Session and workspace are required');
  const root = await fs.realpath(session.header.cwd), stat = await fs.lstat(root);
  if (!stat.isDirectory()) fail('UNSAFE_PATH', 'The workspace is not a directory');
  return { root, rootIdentity: identity(stat) };
}
async function parentsFor(root, target) {
  if (!inside(root, target) || target === root) fail('UNSAFE_PATH', 'The file path escapes the workspace');
  const parents = []; let current = root;
  for (const component of [''].concat(path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean))) {
    if (component) current = path.join(current, component);
    let stat; try { stat = await fs.lstat(current); } catch (error) { if (error.code === 'ENOENT') return { parents, missing: true }; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('UNSAFE_PATH', 'A checkpoint parent is a symbolic link or non-directory');
    if (!inside(root, await fs.realpath(current))) fail('UNSAFE_PATH', 'A checkpoint parent resolves outside the workspace');
    parents.push({ path: path.relative(root, current), ...identity(stat) });
  }
  return { parents, missing: false };
}
async function readSide(root, target) {
  const { parents, missing } = await parentsFor(root, target);
  if (missing) return { kind: 'absent', parents };
  let handle;
  try {
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) fail('UNSAFE_PATH', 'Checkpoint files must be regular files without symbolic or hard links');
    if (entry.size > FILE_BYTES) fail('FILE_TOO_LARGE', 'The file exceeds the checkpoint byte limit');
    handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || !sameIdentity(identity(entry), identity(before))) fail('FILE_CHANGED', 'The checkpoint file changed while opening');
    const bytes = await boundedRead(handle), after = await handle.stat(), named = await fs.lstat(target);
    if (!sameIdentity(identity(before), identity(named)) || named.isSymbolicLink() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('FILE_CHANGED', 'The checkpoint file changed while reading');
    if (bytes.includes(0)) fail('BINARY_FILE', 'Binary files are outside text checkpoint coverage');
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('BINARY_FILE', 'Non-UTF-8 files are outside text checkpoint coverage'); }
    return { kind: 'bytes', hash: hash(bytes), size: bytes.length, mode: before.mode & 0o7777, identity: identity(before), parents, bytes };
  } catch (error) { if (error.code === 'ENOENT') return { kind: 'absent', parents }; throw error; }
  finally { await handle?.close(); }
}
function cleanSide(side) { const { bytes, ...data } = side; return data; }
function changesIn(session) {
  const latest = new Map();
  for (const event of session.snapshotEvents()) if (event.type === 'workspace/changes' && Number.isSafeInteger(event.seq) && Number.isSafeInteger(event.data?.turn)) latest.set(event.data.turn, { seq: event.seq, turn: event.data.turn });
  return [...latest.values()].sort((a, b) => a.seq - b.seq);
}
function validateMetadata(value, id, root) {
  if (value.version !== 1 || value.sessionId !== id || value.root !== root || !Array.isArray(value.turns) || value.turns.length > MAX_TURNS) fail('INVALID_METADATA', 'Checkpoint metadata does not match the Session workspace');
  for (const turn of value.turns) {
    integer(turn.turn, 'turn');
    if (!Array.isArray(turn.files) || turn.files.length > MAX_FILES) fail('INVALID_METADATA', 'Checkpoint file list is invalid');
    const paths = new Set();
    for (const file of turn.files) {
      if (typeof file.path !== 'string' || paths.has(file.path) || !inside(root, path.resolve(root, file.path)) || path.resolve(root, file.path) === root) fail('INVALID_METADATA', 'Checkpoint file path is invalid');
      paths.add(file.path);
      for (const side of [file.before, file.after, file.restored?.side]) {
        if (side === undefined) continue;
        if (side.kind === 'bytes' && (!/^[a-f0-9]{64}$/.test(side.hash) || !Number.isSafeInteger(side.size) || side.size < 0 || side.size > FILE_BYTES || !Number.isSafeInteger(side.mode) || side.mode < 0 || side.mode > 0o7777)) fail('INVALID_METADATA', 'Checkpoint content reference is invalid');
        if (!['bytes', 'absent', 'unavailable'].includes(side.kind)) fail('INVALID_METADATA', 'Checkpoint content side is invalid');
        if (side.parents?.some(parent => typeof parent.path !== 'string' || !inside(root, path.resolve(root, parent.path)))) fail('INVALID_METADATA', 'Checkpoint parent reference is invalid');
      }
    }
  }
  if (value.restoredAt !== undefined && (typeof value.restoredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.restoredAt))) fail('INVALID_METADATA', 'Checkpoint restoration time is invalid');
  if (value.lastRestoredPaths !== undefined && (!Array.isArray(value.lastRestoredPaths) || value.lastRestoredPaths.length > MAX_FILES || value.lastRestoredPaths.some(file => typeof file !== 'string' || !inside(root, path.resolve(root, file)) || path.resolve(root, file) === root))) fail('INVALID_METADATA', 'Checkpoint restoration paths are invalid');
  return value;
}

export function createCheckpointStore(directory, { workspaceChanges, isIdle = () => false } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('INVALID_STORE', 'An absolute checkpoint directory is required');
  const sessions = new Map(), sessionLocks = new Map(), installed = new WeakSet();
  let storageRoot, storageIdentity;
  const location = id => path.join(storageRoot ?? directory, hash(Buffer.from(id)));
  async function privateDirectory(target) {
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('INVALID_STORE', 'Checkpoint storage directories must not be symbolic links');
    const resolved = await fs.realpath(target);
    if (storageRoot && (!inside(storageRoot, resolved) || resolved !== target)) fail('INVALID_STORE', 'Checkpoint storage resolves outside its private directory');
    return { resolved, stat };
  }
  async function prepare(id) {
    if (!storageRoot) { const value = await privateDirectory(directory); storageRoot = value.resolved; storageIdentity = identity(value.stat); }
    const rootStat = await fs.lstat(storageRoot);
    if (rootStat.isSymbolicLink() || !sameIdentity(storageIdentity, identity(rootStat))) fail('INVALID_STORE', 'Checkpoint storage identity changed');
    await privateDirectory(location(id));
  }
  const metadataPath = id => path.join(location(id), 'checkpoint.json');
  async function load(id, session) {
    const binding = await rootFor(id, session); await prepare(id);
    let state = sessions.get(id);
    if (!state) {
      try {
        const handle = await fs.open(metadataPath(id), constants.O_RDONLY | constants.O_NOFOLLOW);
        try { state = validateMetadata(JSON.parse((await boundedRead(handle, META_BYTES)).toString('utf8')), id, binding.root); } finally { await handle.close(); }
      } catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, sessionId: id, ...binding, turns: [] }; }
      sessions.set(id, state);
    }
    if (state.root !== binding.root || !sameIdentity(state.rootIdentity, binding.rootIdentity)) fail('WORKSPACE_CHANGED', 'The checkpoint workspace identity changed');
    return state;
  }
  function referenced(state) {
    const refs = new Map();
    for (const turn of state.turns) for (const file of turn.files) for (const side of [file.before, file.after]) if (side?.kind === 'bytes') refs.set(side.hash, side.size);
    return refs;
  }
  async function save(state) {
    state.turns = state.turns.slice(-MAX_TURNS);
    const text = JSON.stringify(state);
    if (Buffer.byteLength(text) > META_BYTES) fail('METADATA_TOO_LARGE', 'Checkpoint metadata exceeds its limit');
    await prepare(state.sessionId); const folder = location(state.sessionId);
    await privateDirectory(path.join(folder, 'content'));
    const temporary = path.join(folder, randomUUID() + '.tmp');
    try { await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, metadataPath(state.sessionId)); }
    finally { await fs.rm(temporary, { force: true }); }
    const blobs = path.join(folder, 'content'), keep = referenced(state);
    for (const entry of await fs.readdir(blobs).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) if (/^[a-f0-9]{64}$/.test(entry) && !keep.has(entry)) await fs.unlink(path.join(blobs, entry));
  }
  async function remember(state, side) {
    if (side.kind !== 'bytes') return cleanSide(side);
    const refs = referenced(state);
    if (!refs.has(side.hash) && [...refs.values()].reduce((sum, size) => sum + size, 0) + side.size > CONTENT_BYTES) return { kind: 'unavailable', reason: 'CONTENT_LIMIT' };
    await prepare(state.sessionId); const folder = path.join(location(state.sessionId), 'content'); await privateDirectory(folder);
    const target = path.join(folder, side.hash);
    try { await fs.writeFile(target, side.bytes, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return cleanSide(side);
  }
  async function content(state, side) {
    if (side.kind !== 'bytes') return null;
    await prepare(state.sessionId); await privateDirectory(path.join(location(state.sessionId), 'content'));
    const handle = await fs.open(path.join(location(state.sessionId), 'content', side.hash), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const bytes = await boundedRead(handle); if (bytes.length !== side.size || hash(bytes) !== side.hash) fail('CONTENT_CORRUPT', 'The checkpoint content hash does not match'); return bytes; }
    finally { await handle.close(); }
  }
  async function observed(state, target) {
    try { return await remember(state, await readSide(state.root, target)); }
    catch (error) { return { kind: 'unavailable', reason: error.code ?? 'CAPTURE_FAILED' }; }
  }
  const idle = session => { if (!isIdle(session)) fail('SESSION_RUNNING', 'Stop the session before restoring files'); };
  function matchCurrent(expected, current) {
    if (!sameSide(expected, current)) fail('CHECKPOINT_CONFLICT', 'The file contents or permissions changed after this checkpoint');
    if (expected.kind === 'bytes' && !sameIdentity(expected.identity, current.identity)) fail('CHECKPOINT_CONFLICT', 'The file was replaced after this checkpoint');
    for (const parent of expected.parents ?? []) if (!sameIdentity(parent, current.parents?.find(value => value.path === parent.path))) fail('CHECKPOINT_CONFLICT', 'A checkpoint parent directory was replaced');
  }
  async function check(state, file, session) {
    idle(session);
    const current = await readSide(state.root, path.resolve(state.root, file.path));
    const expected = file.restored ? file.restored.side : file.after;
    if (!expected || expected.kind === 'unavailable' || file.before.kind === 'unavailable' || file.discontinuous) fail('RESTORE_UNAVAILABLE', 'Exact checkpoint bytes are not available for this file');
    matchCurrent(expected, current);
    await content(state, file.before); // Verify every baseline before any file is changed.
    return current;
  }
  async function replace(state, file, session, applied) {
    const target = path.resolve(state.root, file.path), before = file.before;
    await check(state, file, session);
    if (file.restored) return;
    if (before.kind === 'absent') { await check(state, file, session); await fs.unlink(target); applied(); return; }
    const bytes = await content(state, before), temporary = path.join(path.dirname(target), '.omaa-restore-' + randomUUID() + '.tmp');
    try {
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, before.mode);
      try { await handle.writeFile(bytes); await handle.chmod(before.mode); await handle.sync(); } finally { await handle.close(); }
      await check(state, file, session);
      if (file.after.kind === 'absent') { await fs.link(temporary, target); await fs.unlink(temporary); }
      else await fs.rename(temporary, target);
      applied();
    } finally { await fs.rm(temporary, { force: true }); }
  }
  const store = {
    limits: Object.freeze({ fileBytes: FILE_BYTES, contentBytes: CONTENT_BYTES, turns: MAX_TURNS, filesPerTurn: MAX_FILES }),
    async captureExecution(exec, next) {
      const session = exec.agent?.session, id = session?.id, requested = exec.arguments?.file_path;
      if (!id || !['write', 'edit'].includes(exec.name) || typeof requested !== 'string') return next();
      let binding; try { binding = await rootFor(id, session); } catch { return next(); }
      const target = path.resolve(binding.root, requested);
      if (!inside(binding.root, target) || target === binding.root) return next();
      const turnNumber = session.snapshotEvents().findLast(event => event.type === 'turn/start')?.data.turn;
      if (!Number.isSafeInteger(turnNumber) || turnNumber < 1) return next();
      return locked(sessionLocks, id, () => lockFiles([target], async () => {
        let state, file;
        try {
          state = await load(id, session);
          let turn = state.turns.find(value => value.turn === turnNumber);
          if (!turn) { turn = { turn: turnNumber, files: [] }; state.turns.push(turn); }
          const before = await observed(state, target), relative = path.relative(state.root, target);
          file = turn.files.find(value => value.path === relative);
          if (!file && turn.files.length >= MAX_FILES) turn.captureLimitReached = true;
          if (!file && turn.files.length < MAX_FILES) { file = { path: relative, before, callIds: [] }; turn.files.push(file); }
          else if (file && file.after && !sameSide(file.after, before)) file.discontinuous = true;
          if (file) { file.callIds = [...new Set([...file.callIds, String(exec.callId)])].slice(-64); file.after = undefined; file.restored = undefined; await save(state); }
        } catch (error) { file = undefined; store.onError?.(error); }
        try { return await next(); }
        finally {
          if (file) try { file.after = await observed(state, target); file.changed = !sameSide(file.before, file.after); await save(state); }
          catch (error) { file.after = { kind: 'unavailable', reason: error.code ?? 'CAPTURE_FAILED' }; store.onError?.(error); }
        }
      }));
    },
    async inspect(sessionId, session, { turn, seq, index, signal = new AbortController().signal } = {}) {
      signal.throwIfAborted();
      const state = await locked(sessionLocks, sessionId, () => load(sessionId, session));
      const native = changesIn(session).map(record => ({ ...record, summary: workspaceChanges?.summary?.(sessionId, record.seq) }));
      const checkpoints = [...new Set([...state.turns.map(value => value.turn), ...native.map(value => value.turn)])].sort((a, b) => a - b).map(number => {
        const captured = state.turns.find(value => value.turn === number), review = native.find(value => value.turn === number);
        return { turn: number, captureLimitReached: Boolean(captured?.captureLimitReached), ...(review ? { seq: review.seq, reviewAvailable: Boolean(review.summary), ...(review.summary ? { summary: structuredClone(review.summary) } : {}) } : { reviewAvailable: false }),
          files: (captured?.files ?? []).filter(file => file.changed !== false).map(file => ({ path: file.path, before: cleanSide(file.before), after: file.after && cleanSide(file.after), callIds: [...file.callIds], restorable: !file.discontinuous && ['bytes', 'absent'].includes(file.before.kind) && ['bytes', 'absent'].includes(file.after?.kind), restored: Boolean(file.restored), reason: file.discontinuous ? 'INTERVENING_CHANGE' : file.before.reason ?? file.after?.reason })) };
      });
      if (seq !== undefined) { integer(seq, 'seq'); const selected = checkpoints.find(value => value.seq === seq); if (!selected) fail('CHECKPOINT_NOT_FOUND', 'The native checkpoint sequence is unavailable'); turn = selected.turn; }
      if (index !== undefined) {
        integer(index, 'index'); const selected = checkpoints.find(value => value.turn === turn);
        if (!selected?.reviewAvailable || !selected.summary.files[index]) fail('CHECKPOINT_UNAVAILABLE', 'The native comparison is unavailable');
        const diff = await workspaceChanges.diff(sessionId, selected.seq, index, signal); if (!diff) fail('CHECKPOINT_UNAVAILABLE', 'The native comparison is unavailable');
        return { checkpoint: selected, diff: structuredClone(diff) };
      }
      if (turn !== undefined) { integer(turn, 'turn'); const selected = checkpoints.find(value => value.turn === turn); if (!selected) fail('CHECKPOINT_NOT_FOUND', 'This turn has no checkpoint'); return { checkpoint: selected }; }
      return { sessionId, limits: store.limits, checkpoints, restoredAt: state.restoredAt, lastRestoredPaths: state.lastRestoredPaths ?? [] };
    },
    async restore(sessionId, session, { turn, paths, signal = new AbortController().signal } = {}) {
      integer(turn, 'turn'); signal.throwIfAborted(); idle(session);
      return locked(sessionLocks, sessionId, async () => {
        const state = await load(sessionId, session), record = state.turns.find(value => value.turn === turn);
        if (!record) fail('CHECKPOINT_NOT_FOUND', 'This turn has no captured file checkpoint');
        if (paths !== undefined && (!Array.isArray(paths) || paths.some(value => typeof value !== 'string') || new Set(paths).size !== paths.length)) fail('INVALID_CHECKPOINT', 'Checkpoint paths must be a unique list');
        const files = record.files.filter(file => file.changed !== false && (paths === undefined || paths.includes(file.path)));
        if (!files.length || paths?.some(value => !files.some(file => file.path === value))) fail('FILE_NOT_FOUND', 'The selected checkpoint files are unavailable');
        const restored = [], changed = [], conflicts = [];
        return lockFiles(files.map(file => path.resolve(state.root, file.path)).sort(), async () => {
          for (const file of files) try { signal.throwIfAborted(); await check(state, file, session); }
          catch (error) { conflicts.push({ path: file.path, code: error.code ?? 'RESTORE_FAILED', message: error.message }); }
          if (conflicts.length) return { ok: false, partial: false, restored, changed, notRestored: files.map(file => file.path), conflicts };
          for (const file of files) {
            try {
              signal.throwIfAborted(); await replace(state, file, session, () => changed.push(file.path));
              const current = await readSide(state.root, path.resolve(state.root, file.path));
              if (!sameSide(file.before, current)) fail('RESTORE_VERIFICATION_FAILED', 'The restored bytes or permissions do not match the checkpoint');
              restored.push(file.path); file.restored = { side: cleanSide(current) };
              state.restoredAt = new Date().toISOString(); state.lastRestoredPaths = [...restored]; await save(state);
            } catch (error) { conflicts.push({ path: file.path, code: error.code ?? 'RESTORE_FAILED', message: error.message }); break; }
          }
          return { ok: conflicts.length === 0, partial: conflicts.length > 0 && changed.length > 0, restored, changed, notRestored: files.filter(file => !restored.includes(file.path)).map(file => file.path), conflicts };
        });
      });
    },
    restorationNote(sessionId) {
      const state = sessions.get(sessionId);
      return state?.lastRestoredPaths?.length ? `<restored_files>\nThe user restored these workspace files from a Cursor checkpoint at ${state.restoredAt}:\n${state.lastRestoredPaths.map(file => '- ' + JSON.stringify(file).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')).join('\n')}\nConversation messages were preserved. Earlier assistant statements may describe the previous file contents. Read these files again before further edits.\n</restored_files>` : '';
    },
    install(ctx) {
      if (installed.has(ctx)) return; installed.add(ctx);
      ctx.on('tools/execute', async (exec, next) => exec.agent?.session && ctx.omaa.product(exec.agent.session)?.id === 'cursor' ? store.captureExecution(exec, next) : next());
      ctx.on('system-prompt/assemble', async (_initial, context, next) => {
        if (!context.agent || ctx.omaa.product(context.agent.session)?.id !== 'cursor') return next();
        await locked(sessionLocks, context.agent.session.id, () => load(context.agent.session.id, context.agent.session));
        const assembly = await next();
        // Native DSH evaluates section.text before this waterfall; update this request's section.
        return { ...assembly, sections: assembly.sections.map(section => section.name === 'deployment:cursor-restored-files'
          ? { ...section, text: store.restorationNote(context.agent.session.id), interpolate: false } : section) };
      });
      ctx.systemPrompt.section({ name: 'deployment:cursor-restored-files', order: 15, interpolate: false, text: ({ agent }) => agent ? store.restorationNote(agent.session.id) : '' });
    },
  };
  return store;
}
export function apply(ctx) {
  const agents = ctx.agents;
  ctx.omaa.checkpoints ??= createCheckpointStore(ctx.omaa.checkpointDirectory, { workspaceChanges: ctx.get('workspaceChanges'), isIdle: session => agents.get(session.id)?.status !== 'running' });
  ctx.omaa.checkpoints.onError ??= error => ctx.logger.warn('Cursor checkpoint capture: %s', error.message);
  ctx.omaa.checkpoints.install(ctx);
}
