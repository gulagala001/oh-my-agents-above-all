import { prepareTypedSnippet } from './typed-prepare.mjs';
import { createWorldReads } from './world.mjs';
import { executionDirectories } from '../../host/working-directory.mjs';
import { ZCODE_CELL_STREAMS_BOOTSTRAP } from '../../../lib/zcode-streams.mjs';

// Native PTC adaptation of exact aac4755 3.15.1 scratch-facade service/tool
// contracts. No original engine, session cloning, saved run, artifact or job.
export const SNIPPET_LIMITS = Object.freeze({ defaultTimeoutMs: 60_000, minTimeoutMs: 1_000,
  maxTimeoutMs: 600_000, toolTimeoutMs: 660_000, maxLogs: 100, maxLogChars: 2_048,
  maxReturnBytes: 256 * 1024, modelBytes: 24_000, nativeSourceBytes: 256 * 1024 });
const FORMAT = 'omaa.zcode.snippet';
function snippetPresentation(value) {
  const meta = { kind: 'eval_workflow_snippet', ok: value.ok, durationMs: value.durationMs,
    diagnostics: [], logs: [], diagnosticsTruncated: false, logsTruncated: false };
  // Presentation retains actual returned fields within a separate 64 KiB
  // display budget. It never recovers hidden values by parsing response prose.
  for (const diagnostic of value.diagnostics) {
    if (meta.diagnostics.length >= 32) { meta.diagnosticsTruncated = true; break; }
    const row = { code: diagnostic.code, line: diagnostic.line, column: diagnostic.column,
      message: diagnostic.message.slice(0, 1024) };
    meta.diagnostics.push(row);
    if (Buffer.byteLength(JSON.stringify(meta)) > 64 * 1024 - 1024) { meta.diagnostics.pop(); meta.diagnosticsTruncated = true; break; }
    if (row.message.length < diagnostic.message.length) meta.diagnosticsTruncated = true;
  }
  for (const log of value.logs) {
    meta.logs.push(log.slice(0, SNIPPET_LIMITS.maxLogChars));
    if (meta.logs.length > SNIPPET_LIMITS.maxLogs || Buffer.byteLength(JSON.stringify(meta)) > 64 * 1024 - 1024) {
      meta.logs.pop(); meta.logsTruncated = true; break;
    }
    if (log.length > SNIPPET_LIMITS.maxLogChars) meta.logsTruncated = true;
  }
  return meta;
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code, message) => Object.assign(Error(message), { code });
const errorText = error => typeof error?.message === 'string' ? error.message : String(error);
const sourceError = 'Provide exactly one snippet source: `code` for the snippet inline, or `path` for a file holding it. Passing both, or neither, is ambiguous.';
function inputChecked(args) {
  if (!object(args) || Object.keys(args).some(key => !['code', 'path', 'timeoutMs'].includes(key))
    || (args.code !== undefined) === (args.path !== undefined)) throw Error(sourceError);
  if (args.code !== undefined && (typeof args.code !== 'string' || !args.code.length)
    || args.path !== undefined && (typeof args.path !== 'string' || !args.path.length)) throw Error(sourceError);
  const timeoutMs = args.timeoutMs ?? SNIPPET_LIMITS.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < SNIPPET_LIMITS.minTimeoutMs || timeoutMs > SNIPPET_LIMITS.maxTimeoutMs)
    throw Error('timeoutMs must be an integer from 1000 through 600000.');
  return { ...args, timeoutMs };
}
function skillLoaded(exec) {
  const events = exec.agent.session.snapshotEvents();
  const calls = new Set(events.filter(event => {
    if (event.type !== 'tool/call' || event.data.name !== 'skill') return false;
    try {
      const args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments;
      return args?.name === 'zcode-workflows';
    } catch { return false; }
  }).map(event => event.data.callId));
  return events.some(event => event.type === 'tool/result' && calls.has(event.data.message?.toolCallId) && !event.data.message?.isError);
}
async function readSource(ctx, exec, path, location, signal) {
  const target = await ctx.fs.resolve(path, { cwd: location.cwd, signal });
  const root = await ctx.fs.resolve(location.workspaceRoot, { signal });
  if (!ctx.fs.contains(root, target)) throw Error('Snippet source must be inside the native workspace.');
  const before = await ctx.fs.stat(target, signal);
  if (!before || before.type !== 'file') throw Error('Snippet source is not a regular file: ' + target.displayPath);
  if (before.size > SNIPPET_LIMITS.nativeSourceBytes) throw Error('Snippet source exceeds the native 256 KiB compiler bound.');
  let source = '', bytes = 0;
  for await (const part of await ctx.fs.streamText(target, signal)) {
    bytes += Buffer.byteLength(part);
    if (bytes > SNIPPET_LIMITS.nativeSourceBytes) throw Error('Snippet source exceeds the native 256 KiB compiler bound.');
    source += part;
  }
  const after = await ctx.fs.stat(target, signal);
  if (!after || after.version !== before.version) throw Error('Snippet source changed while reading.');
  ctx.emit('fs/observed', target, { kind: 'present', version: after.version }, exec);
  return { code: source, path: target.displayPath };
}
function programFor(lowered) {
  return `const __pending = new Map(); let __settled = false;
const __streamFailure = Promise.withResolvers(); __streamFailure.promise.catch(() => {});
const __complete = (ok, error) => { if (!__settled && !ok) { __settled = true; __streamFailure.reject(error); } };
const __scheduleCheck = () => setImmediate(() => { if (!__settled) __checkStreams(); });
const __rpc = (name, args) => {
  const token = {}; __pending.set(token, true);
  return Promise.resolve().then(() => zcodeSnippetHost[name](args))
    .finally(() => { __pending.delete(token); __scheduleCheck(); });
};
let __narration = Promise.resolve(), __logCount = 0, __logOverflow = false;
const __host = {
  args: Object.freeze({}),
  log(message) {
    if (typeof message !== 'string') throw new Error('log() requires a string.');
    if (__logCount >= ${SNIPPET_LIMITS.maxLogs}) {
      if (__logOverflow) return;
      __logOverflow = true;
      __narration = __narration.then(() => __rpc('log', {truncated:true}));
    } else {
      __logCount++;
      const truncated = message.length > ${SNIPPET_LIMITS.maxLogChars}, content = message.slice(0, ${SNIPPET_LIMITS.maxLogChars});
      __narration = __narration.then(() => __rpc('log', {message:content,truncated}));
    }
    __narration.catch(() => {});
  },
  worldRead(siteId, op, args) {
    let wrapped;
    try { wrapped = args.map(value => value === undefined ? {omitted:true} : {value:JSON.parse(JSON.stringify(value))}); }
    catch (error) { return Promise.reject(Object.assign(error,{code:'DriverError'})); }
    const work = __narration.then(() => __rpc('world', {siteId,op,arguments:wrapped})).then(result => {
      if (result.ok) return result.value;
      throw Object.assign(new Error(result.error.message), {name:result.error.name,code:result.error.code});
    });
    work.catch(() => {}); return work;
  }
};
const __checkStreams = (() => { const globalThis = { __host };
${ZCODE_CELL_STREAMS_BOOTSTRAP}
return globalThis.__checkStalled; })();
let __value;
try {
  const body = (async () => {\n${lowered.code}\n})();
  __scheduleCheck();
  __value = await Promise.race([body, __streamFailure.promise]);
  __settled = true;
  await __narration;
} catch (error) {
  __settled = true;
  try { await __narration; } catch {}
  return {format:${JSON.stringify(FORMAT)},version:1,ok:false,error:{code:'DriverError',message:typeof error?.message==='string'?error.message:String(error)}};
} finally { __settled = true; }
let serialized;
try { serialized = JSON.stringify(__value); }
catch (error) { return {format:${JSON.stringify(FORMAT)},version:1,ok:false,error:{code:'DriverError',message:'The snippet return value could not be serialized: '+String(error?.message??error)}}; }
if (serialized === undefined) return {format:${JSON.stringify(FORMAT)},version:1,ok:true};
const bytes = new TextEncoder().encode(serialized).byteLength;
if (bytes > ${SNIPPET_LIMITS.maxReturnBytes}) return {format:${JSON.stringify(FORMAT)},version:1,ok:false,error:{code:'ArtifactTooLarge',message:'The snippet return value serializes to '+bytes+' bytes, over the ${SNIPPET_LIMITS.maxReturnBytes}-byte cap. Return a summary.'}};
return {format:${JSON.stringify(FORMAT)},version:1,ok:true,serialized};`;
}
function parsedResult(value) {
  if (!object(value) || value.format !== FORMAT || value.version !== 1 || typeof value.ok !== 'boolean'
    || Object.keys(value).some(key => !['format', 'version', 'ok', 'serialized', 'error'].includes(key))) throw failure('Interrupted', 'The native snippet returned an invalid completion envelope.');
  if (value.ok) {
    if (value.error !== undefined || value.serialized !== undefined && typeof value.serialized !== 'string') throw failure('Interrupted', 'Invalid snippet return value.');
    if (value.serialized !== undefined) {
      if (Buffer.byteLength(value.serialized) > SNIPPET_LIMITS.maxReturnBytes) throw failure('ArtifactTooLarge', 'The snippet return value exceeded 256 KiB.');
      JSON.parse(value.serialized);
    }
  } else if (value.serialized !== undefined || !object(value.error) || typeof value.error.code !== 'string'
    || typeof value.error.message !== 'string' || Object.keys(value.error).some(key => !['code', 'message'].includes(key))) throw failure('Interrupted', 'Invalid snippet failure.');
  return value;
}
// Exact 3.15.1 presentation contract after the native JSON completion boundary:
// strings stay prose; structured values use two-space formatted JSON.
function presentReturn(serialized) {
  if (serialized === undefined) return undefined;
  const value = JSON.parse(serialized);
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
function logSection(logs, truncated) {
  return logs.length ? ['', 'Logs:', ...logs.map(value => '- ' + value), ...(truncated ? ['- … (logs truncated)'] : [])] : [];
}
function clipModel(response) {
  const bytes = Buffer.from(response);
  if (bytes.length <= SNIPPET_LIMITS.modelBytes) return response;
  const note = '\n… (model preview truncated)', budget = SNIPPET_LIMITS.modelBytes - Buffer.byteLength(note);
  let end = budget;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8') + note;
}

export function installWorkflowSnippetTool(ctx) {
  const active = new Set();
  ctx.effect(() => async () => {
    const running = [...active];
    for (const state of running) state.control.abort(failure('Cancelled', 'Snippet evaluation cancelled.'));
    await Promise.allSettled(running.map(state => state.done));
  }, 'ZCode scratch snippets');
  ctx.on('session/event', (session, event) => {
    if (['sandbox/mode', 'plan/mode'].includes(event.type)) for (const state of active)
      if (state.parent.id === session.id) state.control.abort(failure('Cancelled', 'Snippet permissions changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    for (const state of active) if (state.parent.id === session.id && ctx.omaa.modeFor(session) !== state.mode)
      state.control.abort(failure('Cancelled', 'Snippet working mode changed.'));
  }, { global: true });
  ctx.tools.guard(exec => {
    if (exec.name === 'eval_workflow_snippet' && !skillLoaded(exec)) return 'Load the zcode-workflows skill before evaluating a snippet.';
  });
  ctx.tools.register({ name: 'eval_workflow_snippet', timeoutMs: SNIPPET_LIMITS.toolTimeoutMs,
    description: 'Compile and synchronously run a small TypeScript snippet through the fixed ZCode scratch facade and native confined PTC runtime. Load zcode-workflows first. Pass code or path, never both; the whole file is code. Supports files, git, declared literal world.run commands, log, args={}, channel and future; excludes Actors, report, artifact, phase and holes. No saved run or job is created. Current native workspace permissions apply. Sources are bounded at 256 KiB, returned JSON at 256 KiB, logs at 100 messages of 2048 characters, and timeoutMs at 1000–600000 (default 60000). Unknown mutating outcomes stop evaluation and are never retried.',
    parameters: { type: 'object', properties: { code: { type: 'string', minLength: 1 }, path: { type: 'string', minLength: 1 },
      timeoutMs: { type: 'integer', minimum: SNIPPET_LIMITS.minTimeoutMs, maximum: SNIPPET_LIMITS.maxTimeoutMs } }, additionalProperties: false },
    output: { schema: { type: 'object', properties: { ok: { type: 'boolean' }, diagnostics: { type: 'array', items: { type: 'object', properties: {
      code: { type: 'integer' }, line: { type: 'integer' }, column: { type: 'integer' }, message: { type: 'string' } }, required: ['code', 'line', 'column', 'message'], additionalProperties: false } },
      // Native DSH output schemas enforce a smaller subset than parameter
      // schemas. evaluate() retains the concrete log and timeout bounds.
      logs: { type: 'array', items: { type: 'string' } },
      response: { type: 'string' }, durationMs: { type: 'integer' } }, required: ['ok', 'diagnostics', 'logs', 'response', 'durationMs'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: clipModel(value.response) }],
      presentationMeta: (_args, value) => snippetPresentation(value) },
    execute(args, exec) {
      const input = inputChecked(args);
      if (!skillLoaded(exec)) throw Error('Load the zcode-workflows skill before evaluating a snippet.');
      const state = { parent: exec.agent, mode: ctx.omaa.modeFor(exec.agent.session), control: new AbortController() };
      active.add(state);
      state.done = evaluate(ctx, input, exec, state.control).finally(() => active.delete(state));
      return state.done;
    },
  });
}

async function evaluate(ctx, input, exec, control) {
  const startedAt = Date.now(), logs = [], bindings = new Set(), signal = AbortSignal.any([exec.signal, control.signal]);
  let logsTruncated = false, fatalError, world, timer, timedOut = false, diagnostics = [], result, sourcePath;
  const parent = exec.agent, mode = ctx.omaa.modeFor(parent.session), policy = ctx.sandboxPolicy.resolve({ session: parent.session }), policyKey = JSON.stringify(policy);
  const fatal = error => { fatalError ??= error; control.abort(error); };
  const check = () => {
    if (fatalError) throw fatalError;
    signal.throwIfAborted();
    if (ctx.agents.get(parent.id) !== parent || ctx.omaa.modeFor(parent.session) !== mode
      || JSON.stringify(ctx.sandboxPolicy.resolve({ session: parent.session })) !== policyKey) {
      const error = failure('Cancelled', 'The native snippet parent, permissions or working mode changed.');
      fatal(error); throw error;
    }
  };
  try {
    check();
    const location = await executionDirectories(ctx, parent, signal, policy.workspaceRoot); check();
    let code = input.code;
    if (input.path !== undefined) { const source = await readSource(ctx, exec, input.path, location, signal); code = source.code; sourcePath = source.path; }
    const prepared = await prepareTypedSnippet(code, signal); check();
    if (!prepared.ok) diagnostics = prepared.diagnostics;
    else {
      if (prepared.declaredRunCommands.size && ctx.omaa.modeFor(parent.session) !== 'default') throw failure('Cancelled', 'Execute mutating snippets only in the default working mode.');
      world = createWorldReads({ ctx, parent, prepared, signal, check, actor: exec, directories: Promise.resolve(location) });
      const functions = {
        async log(value) {
          check();
          if (!object(value) || typeof value.truncated !== 'boolean' || value.message !== undefined && typeof value.message !== 'string') throw failure('DriverError', 'Invalid snippet log transport.');
          logsTruncated ||= value.truncated;
          if (value.message !== undefined) {
            if (logs.length >= SNIPPET_LIMITS.maxLogs) logsTruncated = true;
            else { logsTruncated ||= value.message.length > SNIPPET_LIMITS.maxLogChars; logs.push(value.message.slice(0, SNIPPET_LIMITS.maxLogChars)); }
          }
          return null;
        },
        world(request) {
          const work = (async () => {
            check();
            world.argumentsFor(request); // Reject invalid compiled sites before dispatch.
            try {
              const response = await world.execute(request);
              if (request.op === 'run' && !response.ok) {
                const error = failure('uncertain_effect', 'Native world.run returned no complete observation; the workspace may have changed. ' + response.error.message);
                fatal(error); throw error;
              }
              return response;
            } catch (error) {
              if (request.op === 'run') fatal(error?.code === 'uncertain_effect' ? error
                : failure('uncertain_effect', 'Native world.run outcome is uncertain: ' + errorText(error)));
              throw error;
            }
          })();
          bindings.add(work); work.finally(() => bindings.delete(work)).catch(() => {});
          return work;
        },
      };
      timer = setTimeout(() => { timedOut = true; control.abort(failure('Interrupted', 'The snippet exceeded its wall-clock timeout of ' + input.timeoutMs + 'ms.')); }, input.timeoutMs);
      timer.unref?.();
      const outcome = await ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: programFor(prepared.lowered),
        bindings: [{ global: 'zcodeSnippetHost', functions }], cwd: location.cwd, sandboxPolicy: policy, signal, timeoutMs: input.timeoutMs }));
      if (outcome.error) throw failure(outcome.error.kind === 'timeout' || timedOut ? 'Interrupted' : outcome.error.kind === 'abort' ? 'Cancelled' : 'Interrupted', outcome.error.message);
      result = parsedResult(outcome.value);
    }
  } catch (error) { result = { ok: false, error: { code: fatalError?.code ?? error?.code ?? (signal.aborted ? timedOut ? 'Interrupted' : 'Cancelled' : 'DriverError'), message: errorText(fatalError ?? error) } }; }
  finally {
    clearTimeout(timer);
    control.abort(failure('Cancelled', 'Snippet execution ended.'));
    try { await world?.close(); }
    catch (error) { fatalError ??= failure('Interrupted', 'Native snippet resources could not be released: ' + errorText(error)); }
    await Promise.allSettled([...bindings]);
  }
  if (fatalError) result = { ok: false, error: { code: fatalError.code ?? 'Interrupted', message: errorText(fatalError) } };
  const durationMs = Math.max(0, Date.now() - startedAt);
  if (diagnostics.length) return { ok: false, diagnostics, logs: [], response: ['The snippet has errors:',
    ...diagnostics.map(item => `${sourcePath ? sourcePath + ':' : ''}${item.line}:${item.column} TS${item.code}: ${item.message}`), '',
    'NOTE: The snippet was NOT executed — fix the errors above and call the tool again.'].join('\n'), durationMs };
  const section = logSection(logs, logsTruncated), returned = result.ok ? presentReturn(result.serialized) : undefined;
  return { ok: result.ok, diagnostics: [], logs, response: result.ok
    ? ['The snippet completed in ' + durationMs + 'ms.', returned === undefined ? 'It returned no value.' : 'Return value:\n' + returned, ...section].join('\n')
    : ['The snippet failed (' + result.error.code + '): ' + result.error.message, ...section].join('\n'), durationMs };
}
