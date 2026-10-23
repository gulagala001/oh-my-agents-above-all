import { basename, isAbsolute, join, relative } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { currentDirectory, executionDirectories } from '../../host/working-directory.mjs';
import { resolveRgPath } from '@deepseek-ai/dsh-tool-fs-search';
import { executeWorldRead, toWorkspaceRelative } from '../../../lib/zcode-world-read.mjs';
import { WorkflowError, WORLD_READ_CAPS } from '../../../lib/zcode-world-shared.mjs';
import { createFileSystemError } from '../../../lib/zcode-fs-contracts.mjs';
import { createGlobMatcher, VCS_DIRECTORIES_TO_EXCLUDE, createRipgrepSearchPlan, parseRipgrepJsonOutput,
  finishTextSearchResult, toRipgrepFileSystemError, decodeTextBuffer, detectLineEndings,
  normalizeLineEndings, shouldNormalizeLineEndings } from '../../../lib/zcode-fs-helpers.mjs';

// Original world-read code owns argument validation, shapes and limits. These
// ports only bind its observations to the current native execution world.
export function createWorldReads({ ctx, parent, prepared, signal, check, actor, directories }) {
  let cwd = currentDirectory(ctx, parent.session), workspaceRoot = parent.session.header.cwd;
  const directoryReady = (directories ?? executionDirectories(ctx, parent, signal)).then(value => { cwd = value.cwd; workspaceRoot = value.workspaceRoot; });
  void directoryReady.catch(() => {});
  const calls = new Set(), processes = new Set(), ranges = new WeakMap();
  const rangeOf = child => {
    let range = ranges.get(child);
    if (!range) {
      range = Promise.resolve().then(() => child.waitForExit()).then(empty => {
        if (empty !== true) throw new WorkflowError('DriverError', 'The native process range was not confirmed empty.');
      });
      // Range observation starts independently of the direct command result.
      // A provider failure must not hide behind an unsettled done promise.
      range.catch(() => {}); ranges.set(child, range);
    }
    return range;
  };
  const sites = new Map(prepared.sites.worldReads.map(site => [site.id, site.op]));
  const assert = () => { check(); if (!cwd) throw new WorkflowError('DriverError', 'World operations require a native workspace directory.'); };
  const fileError = (code, path, message) => createFileSystemError({ code, path, message });
  const resolve = async path => {
    await directoryReady; assert();
    const target = await ctx.fs.resolve(path, { cwd, signal }), root = await ctx.fs.resolve(workspaceRoot, { signal });
    if (!ctx.fs.contains(root, target)) throw new WorkflowError('DriverError', 'World path is outside the native workspace.');
    return target;
  };
  function deadline(control, milliseconds) {
    const until = Date.now() + milliseconds;
    let timer;
    const tick = () => {
      const remaining = until - Date.now();
      if (remaining <= 0) control.abort(Error('World command deadline reached.'));
      else { timer = setTimeout(tick, Math.min(remaining, 2_147_483_647)); timer.unref?.(); }
    };
    tick(); return () => clearTimeout(timer);
  }
  async function run(request, { readOnly = false, onLine } = {}) {
    assert();
    const startedAt = new Date(), control = new AbortController(), timing = new AbortController();
    const fused = AbortSignal.any([signal, control.signal, timing.signal]);
    const clearDeadline = deadline(timing, request.timeoutMs ?? WORLD_READ_CAPS.runDefaultTimeoutMs);
    const empty = () => ({ text: '', bytes: 0, truncated: false });
    let child, output, stdout = empty(), stderr = empty(), failure, ended;
    const terminationFailures = [], pipeFailures = [];
    const terminate = () => {
      try { child?.terminate(); } catch (error) { terminationFailures.push(error); }
    };
    const drainPipes = async () => {
      if (!output) return;
      let drainTimer;
      const drained = await Promise.race([output.then(() => true, () => false), new Promise(resolve => { drainTimer = setTimeout(() => resolve(false), 1000); })]);
      clearTimeout(drainTimer);
      if (!drained) {
        const error = new WorkflowError('DriverError', 'Native command output did not close after termination; no complete observation was returned.');
        failure ??= error; pipeFailures.push(error);
        for (const stream of [child.stdout, child.stderr]) {
          try { stream?.destroy(); } catch (error) { pipeFailures.push(error); }
        }
      }
      try { [stdout, stderr] = await output; } catch (error) { failure ??= error; pipeFailures.push(error); }
      output = undefined;
    };
    try {
      if (request.command.mode !== 'argv' || !Array.isArray(request.command.args)) throw Error('World execution requires an argv command.');
      const file = request.command.file;
      const executable = file === 'rg' && onLine ? await resolveRgPath() : !isAbsolute(file) && /[\\/]/.test(file)
        ? ctx.fs.processPath(await ctx.fs.resolve(file, { cwd, signal: fused })) : file;
      const program = await ctx.subprocess.resolveExecutable(executable, undefined, fused);
      const argv = [program, ...request.command.args];
      const base = ctx.sandboxPolicy.resolve({ session: parent.session });
      const policy = readOnly ? { ...base, mode: 'read-only' } : base;
      const confined = policy.mode === 'danger-full-access' ? { argv } : await ctx.sandbox.confine(argv, policy, fused);
      assert(); fused.throwIfAborted();
      child = ctx.subprocess.spawn({ argv: confined.argv, cwd,
        env: { ELECTRON_RUN_AS_NODE: undefined, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal: fused });
      processes.add(child);
      const range = rangeOf(child);
      const cap = request.outputLimit?.maxInlineBytes ?? 4 * 1024 * 1024;
      const pump = async (stream, callback) => {
        let bytes = 0, buffer = ''; const chunks = [], decoder = new StringDecoder('utf8');
        try {
          for await (const chunk of stream) {
            bytes += chunk.length;
            if (!callback) {
              if (bytes > cap) throw new WorkflowError('WorldReadCapExceeded', `World command output exceeds ${cap} bytes. Narrow the work or write a summary file.`);
              chunks.push(chunk); continue;
            }
            buffer += decoder.write(chunk);
            let split;
            while ((split = buffer.indexOf('\n')) >= 0) { callback(buffer.slice(0, split)); buffer = buffer.slice(split + 1); }
            if (Buffer.byteLength(buffer) > 1024 * 1024) throw new WorkflowError('WorldReadCapExceeded', 'A search result frame exceeds 1 MiB. Narrow the search.');
          }
          if (callback) { buffer += decoder.end(); if (buffer) callback(buffer); }
        } catch (error) { failure ??= error; control.abort(error); terminate(); }
        return { text: callback ? '' : Buffer.concat(chunks).toString('utf8'), bytes, truncated: false };
      };
      output = Promise.all([pump(child.stdout, onLine), pump(child.stderr)]);
      output.catch(() => {});
      [ended] = await Promise.all([
        child.done.then(value => { terminate(); return value; }, error => { failure ??= error; terminate(); return undefined; }),
        range,
      ]);
      // The provider owns the process range, but pipes are caller-owned. An
      // escaped descendant can keep one open after the range is empty.
      await drainPipes();
      processes.delete(child);
      if (failure instanceof WorkflowError) throw failure;
      const timedOut = timing.signal.aborted, cancelled = signal.aborted;
      const status = cancelled ? 'cancelled' : timedOut ? 'timed_out' : failure || !ended ? 'spawn_error' : ended.exitCode === 0 ? 'completed' : 'failed';
      return { status, ...(ended ? { exitCode: ended.exitCode, signal: ended.signal } : {}), stdout, stderr, durationMs: Date.now() - startedAt.getTime(),
        timedOut, cancelled, startedAt, completedAt: new Date(), ...(failure ? { error: { type: 'execution_error', message: failure.message } } : {}) };
    } catch (error) {
      failure ??= error;
      if (error instanceof WorkflowError || signal.aborted) throw error;
      return { status: timing.signal.aborted ? 'timed_out' : 'spawn_error', stdout, stderr,
        timedOut: timing.signal.aborted, cancelled: false, durationMs: Date.now() - startedAt.getTime(), startedAt, completedAt: new Date(),
        error: { type: 'execution_error', message: error.message } };
    } finally {
      clearDeadline();
      const cleanupFailures = [];
      try {
        if (child && processes.has(child)) {
          terminate();
          // A signalling error cannot skip the independent range observation.
          await rangeOf(child); processes.delete(child);
        }
      } catch (error) { cleanupFailures.push(error); }
      try { await drainPipes(); } catch (error) { cleanupFailures.push(error); }
      cleanupFailures.push(...terminationFailures, ...pipeFailures);
      if (cleanupFailures.length) {
        const causes = [...new Set([failure, ...cleanupFailures].filter(Boolean))];
        const detail = cleanupFailures.slice(0, 4).map(error => String(error?.message ?? error).slice(0, 256)).join('; ');
        throw new WorkflowError(failure instanceof WorkflowError ? failure.code : 'DriverError',
          `${failure?.message ?? 'Native world command did not fully settle.'} Cleanup: ${detail}`.slice(0, 2048),
          { cause: new AggregateError(causes, 'Native world command cleanup failed.') });
      }
    }
  }
  const fileSystemPort = {
    async searchFiles(request) {
      const startedAt = Date.now(), pattern = request.pattern.trim(), matches = [];
      if (!pattern) throw fileError('invalid_pattern', request.path, 'Glob pattern must not be empty');
      const matcher = createGlobMatcher(pattern), cap = request.maxResults;
      const root = await resolve(request.path), info = await ctx.fs.stat(root, signal);
      if (info?.type !== 'directory') throw fileError('not_file', request.path, 'Glob search path must be a directory');
      async function walk(path, target) {
        assert();
        for (const entry of await ctx.fs.listDir(target, signal)) {
          const file = join(path, entry.name), lexical = await ctx.fs.lstat(file, { cwd }, signal);
          if (lexical?.type === 'directory' && !VCS_DIRECTORIES_TO_EXCLUDE.has(entry.name)) {
            if (await walk(file, entry.target)) return true;
          } else if (lexical?.type === 'file' && matcher(relative(request.path, file).replaceAll('\\', '/'), basename(file))) {
            matches.push(file); if (matches.length >= cap) return true;
          }
        }
        return false;
      }
      const truncated = await walk(request.path, root);
      return { path: request.path, pattern, durationMs: Date.now() - startedAt, files: matches.slice(0, cap), numFiles: Math.min(matches.length, cap), truncated };
    },
    async readTextFile(request) {
      const target = await resolve(request.path), info = await ctx.fs.stat(target, signal);
      if (!info) throw fileError('not_found', request.path, 'File was not found');
      if (info.type !== 'file') throw fileError(info.type === 'directory' ? 'is_directory' : 'not_file', request.path, 'Cannot read a non-file path as text');
      const bytes = await ctx.fs.readBytes(target, signal, info.size ?? Number.MAX_SAFE_INTEGER);
      assert();
      const decoded = decodeTextBuffer({ buffer: Buffer.from(bytes), path: request.path });
      const isText = shouldNormalizeLineEndings(decoded.encoding);
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, actor);
      return { path: request.path, content: isText ? normalizeLineEndings(decoded.content) : decoded.content, encoding: decoded.encoding,
        lineEndings: isText ? detectLineEndings(decoded.content) : undefined, bytesRead: bytes.length, sizeBytes: info.size, truncated: false };
    },
    async searchText(request) {
      const startedAt = Date.now(), pattern = request.pattern.trim();
      if (!pattern) throw fileError('invalid_pattern', request.path, 'Grep pattern must not be empty');
      const target = await resolve(request.path), info = await ctx.fs.stat(target, signal);
      if (!info || !['directory', 'file'].includes(info.type)) throw fileError('not_file', request.path, 'Grep search path must be a directory or file');
      const plan = createRipgrepSearchPlan(request.path, { isDirectory: () => info.type === 'directory' }, request, 'content');
      const entries = [], files = new Set(); let numMatches = 0, matchBytes = 2;
      const outcome = await run({ command: { mode: 'argv', file: 'rg', args: plan.args }, timeoutMs: 300_000,
        outputLimit: { maxInlineBytes: 256 * 1024 } }, { readOnly: true, onLine(line) {
        if (!line.trim()) return;
        const parsed = parseRipgrepJsonOutput(line, plan.outputRoot, request);
        numMatches += parsed.numMatches;
        for (const path of parsed.files) files.add(path);
        for (const entry of parsed.entries) {
          entries.push(entry);
          if (entries.length > WORLD_READ_CAPS.grepMaxMatches) throw new WorkflowError('WorldReadCapExceeded', `files.grep: over ${WORLD_READ_CAPS.grepMaxMatches} matches. Narrow the pattern or add a glob.`);
          if (entry.lineNumber !== undefined && entry.text !== undefined) {
            matchBytes += Buffer.byteLength(JSON.stringify({ path: toWorkspaceRelative(cwd, entry.path), line: entry.lineNumber, text: entry.text })) + (entries.length > 1 ? 1 : 0);
            if (matchBytes > WORLD_READ_CAPS.grepMaxSerializedBytes) throw new WorkflowError('WorldReadCapExceeded', `files.grep: result exceeds ${WORLD_READ_CAPS.grepMaxSerializedBytes} bytes. Narrow the pattern or add a glob.`);
          }
        }
      } });
      if (outcome.exitCode === 2) throw toRipgrepFileSystemError(outcome.stderr.text, request.path, pattern);
      if (![0, 1].includes(outcome.exitCode) || outcome.error) throw new WorkflowError('DriverError', outcome.error?.message ?? `ripgrep did not complete (${outcome.status}).`);
      return finishTextSearchResult({ path: request.path, pattern, mode: 'content', startedAt, request, files: [...files], entries, numMatches });
    },
  };
  function argumentsFor({ siteId, op, arguments: wrapped }) {
      assert();
      if (sites.get(siteId) !== op || !Array.isArray(wrapped)) throw new WorkflowError('DriverError', 'Invalid compiled world-read site.');
      return wrapped.map(item => {
        if (item?.omitted === true && Object.keys(item).length === 1) return undefined;
        if (item && Object.hasOwn(item, 'value') && Object.keys(item).length === 1) return item.value;
        throw new WorkflowError('DriverError', 'Invalid world-read argument transport.');
      });
  }
  return {
    updatePrepared(next) {
      prepared = next; sites.clear();
      for (const site of prepared.sites.worldReads) sites.set(site.id, site.op);
    },
    argumentsFor,
    async execute(request) {
      await directoryReady;
      const args = argumentsFor(request), op = request.op;
      const deps = { cwd, workspaceRoot, fileSystemPort, declaredRunCommands: prepared.declaredRunCommands };
      const call = executeWorldRead({ ...deps, executionPort: { run: request => run(request, { readOnly: op !== 'run' }) } }, op, args); calls.add(call);
      try { return { ok: true, value: await call }; }
      catch (error) { return { ok: false, error: { name: error.name || 'Error', code: error.code || 'DriverError', message: error.message } }; }
      finally { calls.delete(call); }
    },
    async close() {
      const failures = [], waiting = [];
      for (const child of processes) {
        try { child.terminate(); } catch (error) { failures.push(error); }
        waiting.push(rangeOf(child));
      }
      // Start every cleanup before waiting and retain every range failure.
      const [, outcomes] = await Promise.all([Promise.allSettled([...calls]), Promise.allSettled(waiting)]);
      for (const outcome of outcomes) if (outcome.status === 'rejected') failures.push(outcome.reason);
      if (failures.length) throw new AggregateError(failures, 'Native world resources did not fully settle.');
    },
  };
}
