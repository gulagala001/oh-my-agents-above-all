import { randomUUID } from 'node:crypto';
import { executionDirectories } from '../../host/working-directory.mjs';
import { NO_ARTIFACT_CHANGE } from '../../host/zcode-artifacts.mjs';
import { prepareTypedWorkflow } from './typed-prepare.mjs';
import { createActors, installLiteralActorPersona } from './actors.mjs';
import { createSavedWorkflowStore } from './saved-workflows.mjs';
import { validateWorkflowArgs } from '../../../lib/zcode-saved-args.mjs';
import { parseSavedWorkflow, SAVED_WORKFLOW_SENTINEL } from '../../../lib/zcode-saved-codec.mjs';
import { createWorldReads } from './world.mjs';
import { createArtifacts } from './artifacts.mjs';
import { WorkflowError } from '../../../lib/zcode-artifact-shared.mjs';
import { createRunProgress } from './run-progress.mjs';
import { createRunCache, importCompletedRun, createRunExecution, readRunSettings, retuneRunExecution, actorReplayIdentity, prepareActorReplay } from './run-cache.mjs';
import { checkedConcurrency, createAskConcurrency } from './concurrency.mjs';
import { resolveWorkflowModelBindings, checkedWorkflowSubagentModelInput } from './model-bindings.mjs';
import { ZCODE_CELL_STREAMS_BOOTSTRAP } from '../../../lib/zcode-streams.mjs';
import { createLiveWorkflowHoles } from './holes.mjs';
import { createNativeReplayJournal, readNativeReplayJournalRecord } from './replay-journal.mjs';
import { installWorkflowSnippetTool } from './snippets.mjs';
import { createWorkflowQuestions, findWorkflowQuestionFact } from './questions.mjs';
import { initializeWorkflowLog, appendWorkflowLog } from './run-logs.mjs';

export const name = 'omaa-zcode-typed-workflow';
export const inject = ['omaa', 'tools', 'fs', 'agents', 'subagents', 'jobs', 'ptcRuntime', 'sandboxPolicy', 'sandbox', 'subprocess'];
function decodePathSource(file) {
  // Match the codec's first-nonempty-line rule. Never trim/rewrite the body,
  // including an existing native facade marker after the metadata block.
  const first = file.source.split('\n').find(line => line.trim() !== '');
  if (first?.trim() !== SAVED_WORKFLOW_SENTINEL) return { ...file, script: file.source, bodyLineOffset: 0 };
  const parsed = parseSavedWorkflow(file.source);
  if (!parsed.ok) throw Error(`${file.path}: ${parsed.reason}: ${parsed.detail}`);
  return { ...file, ...parsed };
}
const sourceLines = (items, offset) => !offset ? items : items.map(item => ({ ...item,
  ...(Number.isSafeInteger(item.line) && item.line > 0 ? { line: item.line + offset } : {}) }));
const workflowOutput = {
  schema: { type: 'object' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  presentationMeta: (_args, value) => ({ ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    status: value.status === 'backgrounded' ? 'backgrounded' : value.error || value.ok === false ? 'failed' : 'completed',
    ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}) }),
};
const amendDescription = [
  'Amend an existing ZCode workflow run with a revised script or revised settings. Starts a NEW run that supersedes the old one and imports its finished work as a cache, so unchanged completed prefixes can be reused. Works on runs of this session with durable task-prefix metadata: completed, errored, stopped — or still running.',
  '',
  'When to use:',
  '- The run errored, or completed but needs one more stage: fix or extend the script and amend. Never rewrite the workflow from scratch with create_workflow.',
  '- The run is STILL RUNNING and is visibly going wrong: amend it NOW, in one call. Do not stop it first and do not wait for it to finish — this tool stops the running predecessor and starts the revision; the earlier you amend, the less is re-paid.',
  '- The user wants the same workflow with fewer subagents at once or another name: amend with only that field and neither path nor script.',
  '- To continue the completed portions of a stopped run, amend without path or script; this creates a successor rather than resuming the old run in place.',
  '',
  'Load the zcode-workflows skill with skill before revising a script. A call that passes path or script is refused until that skill has been loaded in this session; a settings-only call is not. Pass path (the run’s script file, edited in place — the usual form) or script (the whole revised script inline), never both. Omitted source, name, args and max_concurrency keep their archived values; max_concurrency: null clears the additional run cap while native capacity and Actor FIFO still apply. A call containing only run_id and max_concurrency retunes a live run without restarting or canceling accepted tasks. If that run ends before retune, successor fallback requires proven non-user stop intent; archived or user-stopped runs need an explicit revision.',
  '',
  'The host typechecks before stopping the predecessor and waits for it to settle. Named Actors with matching personas reuse contiguous completed task results; the first changed or new ask receives the exact completed native transcript prefix. Matching world observations are reused in occurrence order; live world.run and native tools without effect classification close the import window conservatively. Pending asks are canceled and drained. An eligible accepted task may seed its exact settled aborted native transcript into a successor, which receives a fresh identical prompt; no original driver or unbalanced history is revived. The current DSH model, API and permissions remain authoritative.',
].join('\n');
// The original lowerer emits synchronous Actor construction and narration.
// PTC only transports async JSON bindings, so this pure script-side shim
// retains reference identity and drains queued narration. Native teardown
// cancels unfinished asks after the script returns, as the original engine does.
function programFor(lowered) {
  return `const __init = await zcodeHost.init(null);
let __sitePhases = __init.sitePhases;
let __phaseRevision = 0;
const __phaseOf = siteId => __sitePhases[siteId] ?? __phase;
const __pending = new Map(); let __settled = false;
const __streamFailure = Promise.withResolvers(); __streamFailure.promise.catch(() => {});
const __complete = (ok, payload) => { if (__settled) return; __settled = true; if (!ok) __streamFailure.reject(payload); };
const __scheduleCheck = () => { setImmediate(() => { if (!__settled) __checkStreams(); }); };
const __rpc = (name, args) => {
  const token = {}; __pending.set(token, true);
  return Promise.resolve().then(() => zcodeHost[name](args)).finally(() => { __pending.delete(token); __scheduleCheck(); });
};
const __names = new Set(), __actorOrdinals = new Map(), __actorAsks = new Map(); let __narration = Promise.resolve(), __phase;
const __append = data => { __narration = __narration.then(() => __rpc('narrate', data)); __narration.catch(() => {}); };
// Different native RPC replies can arrive in a different order. All promise
// effects cross this SAME final script gate after synchronous result mapping.
const __settlementReplies = new Map(); let __nextSettlement = 1, __settlementPump = false;
const __effect = (name, args, map) => {
  const task = __narration.then(() => __rpc(name, args)).then(reply => {
    if (reply?.format !== 'omaa.zcode.settlement' || reply.version !== 1 || !Number.isSafeInteger(reply.sequence)
      || reply.sequence < __nextSettlement || __settlementReplies.has(reply.sequence) || typeof reply.outcome?.ok !== 'boolean')
      throw new Error('Invalid or duplicate native ZCode settlement receipt.');
    const outcome = reply.outcome;
    if (outcome.ok ? (outcome.undefined !== true && !Object.hasOwn(outcome, 'value'))
      || (outcome.undefined === true && Object.hasOwn(outcome, 'value'))
      : typeof outcome.error?.name !== 'string' || typeof outcome.error?.message !== 'string')
      throw new Error('Invalid native ZCode settlement payload.');
    return new Promise((resolve, reject) => {
      __settlementReplies.set(reply.sequence, { outcome, map, resolve, reject });
      if (__settlementPump) return;
      __settlementPump = true;
      queueMicrotask(() => {
        __settlementPump = false;
        while (__settlementReplies.has(__nextSettlement)) {
          const next = __settlementReplies.get(__nextSettlement++); __settlementReplies.delete(__nextSettlement - 1);
          try {
            if (!next.outcome.ok) throw Object.assign(new Error(next.outcome.error.message), {
              name: next.outcome.error.name, ...next.outcome.error.code===undefined?{}:{code:next.outcome.error.code} });
            next.resolve(next.map(next.outcome.undefined === true ? undefined : next.outcome.value));
          } catch (error) { next.reject(error); }
        }
      });
    });
  });
  task.catch(() => {}); return task;
};
const __unwrapDriver = result => {
  if (result.ok) return result.value;
  throw Object.assign(new Error(result.error.message), { name: result.error.name, code: result.error.code });
};
const __host = {
  args: __init.args,
  createActor(siteId, name, persona) {
    if (name !== undefined && typeof name !== 'string') throw new Error('Actor name must be a string');
    if (name && __names.has(name)) throw new Error('Duplicate Actor name: ' + name);
    if (name) __names.add(name);
    const ordinal = (__actorOrdinals.get(siteId) ?? 0) + 1; __actorOrdinals.set(siteId, ordinal);
    const reference = Object.freeze({ handle: __init.nonce + ':' + encodeURIComponent(siteId) + ':' + ordinal, siteId, ordinal, name: name ?? null, persona: persona ?? null, phaseName: __phaseOf(siteId) ?? null });
    __append({type:'actor-created',reference}); return reference;
  },
  ask(siteId, actor, instructions) {
    const phaseName = __phaseOf(siteId);
    const actorSeq = __actorAsks.get(actor.handle) ?? 0; __actorAsks.set(actor.handle, actorSeq + 1);
    return __effect('ask', {siteId, actor, actorSeq, instructions, ...phaseName===undefined?{}:{phaseName}}, value => value);
  },
  log(message) { __append({type:'log',message}); },
  enterPhase(title) {
    if (typeof title !== 'string') throw new TypeError('Phase title must be text.');
    title = title.trim(); if (!title) return;
    __phase = title; __append({type:'phase',title});
  },
  hole(siteId, name, prompt, evaluator, body) {
    if (body !== undefined) return body();
    const phaseName = __phaseOf(siteId);
    const work = __narration.then(() => __rpc('hole', {siteId,name,...prompt===undefined?{}:{prompt},...phaseName===undefined?{}:{phaseName}}))
      .then(response => {
        if (response.phaseRevision >= __phaseRevision) { __phaseRevision = response.phaseRevision; __sitePhases = response.sitePhases; }
        return evaluator(response.code)();
      });
    work.catch(() => {}); return work;
  },
  report(siteId, value, artifactId) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error('The report value cannot be represented as JSON.');
      __append({type:'report',siteId,serialized,...artifactId===undefined?{}:{artifactId}});
    } catch (error) { __append({type:'report-error',message:error.message}); }
  },
  worldRead(siteId, op, args) {
    const phaseName = __phaseOf(siteId);
    let encodedArgs;
    try { encodedArgs = args.map(value => value === undefined ? {omitted:true} : {value:JSON.parse(JSON.stringify(value))}); }
    catch (error) { return Promise.reject(Object.assign(error,{code:'DriverError'})); }
    return __effect('world', {siteId,op,arguments:encodedArgs,...phaseName===undefined?{}:{phaseName}}, __unwrapDriver);
  },
  publishArtifact(siteId, op, args) {
    let encodedArgs;
    try { encodedArgs = args.map(value => value === undefined ? {omitted:true} : {value:JSON.parse(JSON.stringify(value))}); }
    catch (error) { return Promise.reject(Object.assign(error,{code:'DriverError'})); }
    return __effect('publishArtifact', {siteId,op,arguments:encodedArgs}, __unwrapDriver);
  },
  declareArtifact(siteId, op, args) {
    try {
      __append({type:'declare',siteId,op,arguments:args.map(value=>value===undefined?{omitted:true}:{value:JSON.parse(JSON.stringify(value))})});
    } catch(error) { __append({type:'report-error',message:error.message}); }
  }
};
const __checkStreams = (() => { const globalThis = { __host };
${ZCODE_CELL_STREAMS_BOOTSTRAP}
return globalThis.__checkStalled; })();
try {
  const execution = (async () => {\n${lowered.code}\n})();
  __scheduleCheck();
  const value = await Promise.race([execution, __streamFailure.promise]);
  await __narration;
  __settled = true;
  return value;
} finally { __settled = true; await __narration; }`;
}

export function apply(ctx) {
  installLiteralActorPersona(ctx);
  installWorkflowSnippetTool(ctx);
  const questionNotices = ctx.omaa.workflowQuestionNotices;
  if (typeof questionNotices?.forRun !== 'function') throw Error('The root workflow question notice router is unavailable.');
  const runs = new Map(), amending = new Set();
  let active = true;
  function checkAdmission(exec) {
    exec.signal.throwIfAborted();
    if (!active) throw Error('ZCode workflow scope disposed.');
    if (ctx.agents.get(exec.agent.id) !== exec.agent) throw Error('The native parent changed.');
    if (ctx.omaa.modeFor(exec.agent.session) !== 'default') throw Error('Execute workflows only in the default working mode.');
  }
  const reserveRevision = runId => {
    if (amending.has(runId)) throw Error('This workflow is already being revised.');
    amending.add(runId);
    let held = true;
    return () => {
      // A foreground run may settle after another operation acquires this id.
      // Its finally must not release that later operation's reservation.
      if (held) { held = false; amending.delete(runId); }
    };
  };
  function start(parent, prepared, options, job, exec) {
    const control = new AbortController(), signal = control.signal, runId = options.runId ?? randomUUID(), reports = [];
    if (runs.has(runId)) throw Error('This native workflow run already owns an active execution.');
    if (ctx.omaa.modeFor(parent.session) !== 'default') throw Error('Execute workflows only in the default working mode.');
    let reportCount = 0, reportPreviewBytes = 0, reportsTruncated = false;
    const policy = ctx.sandboxPolicy.resolve({ session: parent.session }), policyKey = JSON.stringify(policy);
    const concurrency = createAskConcurrency(signal, options.maxConcurrency);
    const ready = Promise.withResolvers(); ready.promise.catch(() => {});
    const record = { parent, control, concurrency }; let fatalError, journal;
    const fatal = error => { if (!fatalError) { fatalError = error; control.abort(error); } };
    const check = () => {
      if (fatalError) throw fatalError;
      signal.throwIfAborted();
      if (ctx.agents.get(parent.id) !== parent || ctx.omaa.modeFor(parent.session) !== 'default'
        || JSON.stringify(ctx.sandboxPolicy.resolve({ session: parent.session })) !== policyKey) { control.abort(Error('The native parent, working mode or workflow permission changed.')); signal.throwIfAborted(); }
    };
    const progress = event => job?.append(JSON.stringify(event) + '\n');
    const runProgress = createRunProgress({ store: ctx.omaa.workflowArtifacts, parent, runId, signal, stopReason: () => record.stopReason });
    const cache = createRunCache({ store: ctx.omaa.workflowArtifacts, parent, runId, imported: options.imported, replay: options.replay });
    const directories = options.directories ? Promise.resolve(options.directories) : executionDirectories(ctx, parent, signal, policy.workspaceRoot);
    void directories.catch(() => {});
    let questions, questionRegistry, notices, actors, world, artifacts, holes;
    runs.set(runId, record);
    let narration = Promise.resolve(), narrationFailed = false, narrationFailure;
    const transportEffect = (siteId, kind, operation) => journal.transport({ siteId, kind }, operation).catch(error => {
      // Catchable task failures have a committed envelope. A rejected
      // transport is an integrity, delivery or unknown-effect interruption.
      fatal(error);
      throw error;
    });
    const persistObservation = work => Promise.resolve().then(work).catch(error => { fatal(error); throw error; });
    const functions = {
      async init() { check(); return { args: options.args ?? {}, nonce: runId, sitePhases: Object.fromEntries(prepared.sitePhases) }; },
      async hole(args) { check(); progress({ type: 'hole-waiting', siteId: args.siteId, name: args.name }); return holes.reach(args); },
      async ask(args) {
        check();
        return transportEffect(args.siteId, 'ask', async () => {
          const reference = args.actor; let dispatched = false;
          try {
            const value = await journal.run({ siteId: args.siteId, kind: 'ask', args: { actor: reference, instructions: args.instructions },
              phaseName: args.phaseName,
              actor: { siteId: reference.siteId, ordinal: reference.ordinal, seq: args.actorSeq, identity: actorReplayIdentity(reference) } },
            context => { dispatched = true; return actors.ask(args, context); });
            if (!dispatched) await persistObservation(() => actors.settleReplayAsk(args));
            return value;
          } catch (error) {
            if (fatalError) throw fatalError;
            if (!dispatched) await persistObservation(() => actors.settleReplayAsk(args, error));
            throw error;
          }
        });
      },
      async world(args) {
        check();
        return transportEffect(args.siteId, args.op === 'run' ? 'world-run' : 'world-read', async () => {
        const argumentsValue = world.argumentsFor(args);
        const { cached, ordinal } = cache.admitWorld(args.op, argumentsValue);
        const node = await runProgress.node(args.siteId, args.op === 'run' ? 'world-run' : 'world-read', { phaseName: args.phaseName });
        let dispatched = false;
        try {
          const value = await journal.run({ siteId: args.siteId, kind: args.op === 'run' ? 'world-run' : 'world-read',
            args: { op: args.op, arguments: args.arguments } }, async () => {
            if (cached) {
              await cache.worldResult(args.op, argumentsValue, ordinal, cached.result, true);
              return cached.result;
            }
            if (args.op === 'run') await cache.close('world-run', { siteId: args.siteId });
            await node.dispatched(); check(); dispatched = true;
            try {
              const result = await world.execute(args);
              if (!result.ok) throw Object.assign(Error(result.error.message), { name: result.error.name, code: result.error.code });
              if (args.op === 'run' && ['cancelled', 'timed_out', 'spawn_error'].includes(result.value?.status))
                throw Object.assign(Error('The external command has no complete native outcome.'), { code: 'uncertain_effect' });
              await cache.worldResult(args.op, argumentsValue, ordinal, result.value, false);
              return result.value;
            } catch (error) {
              // Rejection after mutating driver admission cannot establish the
              // complete external outcome. Keep RUNNING even for cap failures.
              if (args.op === 'run') throw Object.assign(Error(error?.message ?? String(error)), { name: error?.name ?? 'Error', code: 'uncertain_effect' });
              throw error;
            }
          });
          await persistObservation(() => node.settled(undefined, { cached: !dispatched })); return { ok: true, value };
        } catch (error) {
          if (fatalError) throw fatalError;
          if (error?.code === 'uncertain_effect') fatal(error);
          await persistObservation(() => node.settled(error, { cached: !dispatched }));
          return { ok: false, error: { name: error?.name ?? 'Error', code: error?.code ?? 'DriverError', message: error?.message ?? String(error) } };
        }
        });
      },
      async publishArtifact(args) { check(); return transportEffect(args.siteId, 'artifact', () => artifacts.publish(args)); },
      async narrate(data) {
        check();
        const action = async () => {
          if (data.type === 'phase') {
            if (typeof data.title !== 'string') throw Error('Phase title must be text.');
            const title = data.title.trim(); if (!title) return null;
            job?.updateProgress(title);
            await ctx.omaa.workflowArtifacts.mutate(parent.id, runId, value => { value.phase = title; });
            await runProgress.phase(title);
          }
          else if (data.type === 'log') {
            if (typeof data.message !== 'string') throw Error('Log message must be text.');
            // A job's output buffer is not durable narration history. Commit
            // the bounded native fact before attempting its optional delivery.
            await ctx.omaa.workflowArtifacts.mutate(parent.id, runId, value => {
              check(); appendWorkflowLog(value, data.message);
            }, { signal });
            job?.append(data.message + '\n');
          }
          else if (data.type === 'report') {
            let cached = false;
            const value = await artifacts.report(data, { onReceipt: receipt => { cached = receipt.cached; } });
            if (cached) return null;
            const event = { type: 'report', siteId: data.siteId, value, ...(data.artifactId === undefined ? {} : { artifactId: data.artifactId }) };
            reportCount++;
            const serialized = reportsTruncated ? undefined : JSON.stringify(event);
            const bytes = serialized === undefined ? 0 : Buffer.byteLength(serialized);
            if (!reportsTruncated && reports.length < 200 && reportPreviewBytes + bytes <= 4 * 1024 * 1024) {
              reports.push(event); reportPreviewBytes += bytes; job?.append(serialized + '\n');
            } else {
              reportsTruncated = true;
              job?.append(JSON.stringify({ type: 'report', siteId: data.siteId, reportCount,
                ...(data.artifactId === undefined ? {} : { artifactId: data.artifactId }), stored: true }) + '\n');
            }
          }
          else if (data.type === 'declare') await artifacts.declare(data);
          else if (data.type === 'actor-created') await actors.declare(data.reference);
          else if (data.type === 'report-error') { const error = new WorkflowError('DriverError', data.message); fatal(error); throw error; }
          else throw Error('Unknown workflow narration.');
          return null;
        };
        const work = narration.then(action);
        narration = work.catch(error => {
          if (data.type === 'log') {
            if (!narrationFailed) { narrationFailed = true; narrationFailure = error; }
            if (!signal.aborted) fatal(error);
          }
        });
        return work;
      },
    };
    const result = (async () => {
      let outcome, began = false;
      const errorValue = (error, kind = signal.aborted && !fatalError ? 'abort' : 'exception') => ({ kind, name: error?.name ?? 'Error',
        message: error?.message ?? String(error), ...(typeof error?.code === 'string' ? { code: error.code } : {}) });
      const cleanupFailures = [];
      const cleanupFailed = (stage, error) => {
        // At most nine shutdown stages, eight nodes per error and three
        // levels. Never persist raw Error objects, stacks or unbounded causes.
        let remaining = 8;
        const seen = new Set();
        const read = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
        const describe = (value, depth = 0) => {
          remaining--;
          const name = read(value, 'name'), message = read(value, 'message'), code = read(value, 'code');
          const raw = typeof message === 'string' ? message
            : value === null || typeof value !== 'object' && typeof value !== 'function' ? String(value) : 'Unknown cleanup failure';
          const row = { name: typeof name === 'string' ? name.slice(0, 96) : 'Error', message: raw.slice(0, 512),
            ...(typeof code === 'string' ? { code: code.slice(0, 96) } : {}) };
          if (raw.length > 512 || typeof name === 'string' && name.length > 96 || typeof code === 'string' && code.length > 96) row.truncated = true;
          if (seen.has(value)) { row.truncated = true; return row; }
          seen.add(value);
          const errors = read(value, 'errors'), cause = read(value, 'cause');
          const children = [];
          if (Array.isArray(errors)) {
            const count = read(errors, 'length');
            for (let index = 0; index < Math.min(count, 4); index++) children.push(read(errors, index));
            if (count > 4) row.truncated = true;
          }
          if (cause !== undefined) children.push(cause);
          for (const child of children) {
            if (depth >= 2 || remaining === 0) { row.truncated = true; break; }
            (row.causes ??= []).push(describe(child, depth + 1));
          }
          return row;
        };
        const detail = describe(error);
        if (cleanupFailures.length < 9) cleanupFailures.push({ stage, ...detail });
        outcome.error ??= { kind: 'exception', name: detail.name, message: detail.message,
          ...(detail.code === undefined ? {} : { code: detail.code }) };
        outcome.error = { ...outcome.error, cleanupFailures };
      };
      try {
        if (ctx.omaa.workflowQuestionRegistries.has(runId)) throw Error('A native workflow question registry already owns this run.');
        const noticeFailure = () => {
          try { progress({ type: 'escalation-notice-unconfirmed', runId,
            message: 'Optional parent notice delivery or retirement was not confirmed. Read current pending questions; do not retry the notice.' }); }
          catch { /* Observer diagnostics cannot invalidate a durable question. */ }
        };
        questions = createWorkflowQuestions({ store: ctx.omaa.workflowArtifacts, parent, runId, signal,
          onError: fatal, notify: event => {
            try { progress(event); } catch { noticeFailure(); }
            // Notice transport is optional. Its uncertain delivery never rewrites
            // the committed question or closes the real Actor's parked call.
            try { return notices?.notify(event); } catch { noticeFailure(); }
          } });
        questionRegistry = { sessionId: parent.id, questions };
        ctx.omaa.workflowQuestionRegistries.set(runId, questionRegistry);
        notices = questionNotices.forRun({ parent, runId, signal, check,
          questions: () => questions, onError: noticeFailure,
          isCurrent: () => runs.get(runId) === record && ctx.omaa.workflowQuestionRegistries.get(runId) === questionRegistry });
        actors = createActors({ ctx, parent, sites: prepared.sites, askSpecs: prepared.askSpecs, signal, progress, runProgress,
          cache, imported: options.imported, concurrency, directories, modelBindings: options.modelBindings,
          subagentModel: options.subagentModel, replay: options.replay, questions });
        world = createWorldReads({ ctx, parent, prepared, signal, check, actor: exec, directories });
        artifacts = createArtifacts({ ctx, parent, prepared, runId, store: ctx.omaa.workflowArtifacts, signal, check, fatal, actor: exec, directories, journal: () => journal });
        holes = createLiveWorkflowHoles({ store: ctx.omaa.workflowArtifacts, parent, runId, signal, prepared,
          prepare: prepareTypedWorkflow, check, journal: () => journal, swapPrepared(next) {
            actors.updatePrepared(next); world.updatePrepared(next); artifacts.updatePrepared(next);
            prepared = next;
          } });
        record.holes = holes;
        const location = await directories; check();
        const store = ctx.omaa.workflowArtifacts;
        const stop = () => {
          record.stopReason = 'user';
          if (job) ctx.jobs.kill(job.id, parent.id, 'Workflow stopped from its artifact panel.');
          else control.abort(Error('Workflow stopped from its artifact panel.'));
        };
        const ownership = { script: prepared.script, args: options.args ?? {}, cwd: location.cwd,
          modelBindings: options.modelBindings, subagentModel: options.subagentModel };
        if (options.replay) {
          const archived = await store.record(parent.id, runId); check();
          if (archived.revision !== options.expectedRevision) throw Error('The archived workflow changed after replay preflight.');
          const replay = await readNativeReplayJournalRecord({ store, parent, record: archived, ownership, signal });
          await cache.initializeReplay({ ctx, record: archived, journalNodes: replay.entries, signal, directories: location });
          journal = await createNativeReplayJournal({ store, parent, runId, ownership, signal, replay: true,
            onReplayAsk: (node, meta) => actors.replayAsk(node, meta) });
          check();
          await store.reopen({ sessionId: parent.id, runId, expectedRevision: options.expectedRevision, jobId: job?.id, signal }, stop);
          began = true;
        } else {
          const execution = await createRunExecution({ store, parent, runId, cwd: location.cwd,
            script: prepared.script, args: options.args ?? {}, modelBindings: options.modelBindings, subagentModel: options.subagentModel,
            maxConcurrency: options.maxConcurrency, resumedFrom: options.resumedFrom });
          check();
          await store.begin({ runId, sessionId: parent.id, name: options.name,
            graph: prepared.graph, causalityGraph: prepared.causalityGraph, displayGraph: prepared.displayGraph, jobId: job?.id,
            resumedFrom: options.resumedFrom, execution }, stop); began = true;
          journal = await createNativeReplayJournal({ store, parent, runId, ownership, signal });
        }
        await ctx.omaa.workflowArtifacts.mutate(parent.id, runId, value =>
          initializeWorkflowLog(value, { resuming: options.replay === true }) ? true : NO_ARTIFACT_CHANGE, { signal });
        if (options.resumedFrom) await ctx.omaa.workflowArtifacts.mutate(parent.id, options.resumedFrom, value => {
          if (value.supersededBy !== undefined && value.supersededBy !== runId)
            throw Error('The predecessor already has another successor. This new run was not executed.');
          value.supersededBy = runId;
        });
        await runProgress.start(prepared); check(); ready.resolve();
        outcome = await ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: programFor(prepared.lowered), bindings: [{ global: 'zcodeHost', functions }],
          cwd: (await directories).cwd, sandboxPolicy: policy, signal, timeoutMs: null }));
        await narration;
        if (fatalError) outcome = { ...outcome, error: errorValue(fatalError) };
        if (!outcome.error) await journal.finish();
      } catch (error) {
        ready.reject(error);
        outcome = { error: errorValue(fatalError ?? error) };
      } finally {
        control.abort(Error('Workflow execution ended.'));
        notices?.close();
        try {
          // An exceptional/cancelled PTC exit can bypass the normal narration
          // join. Its accepted host writes must settle before final run storage.
          await narration;
          if (narrationFailed && narrationFailure !== signal.reason) cleanupFailed('narration', narrationFailure);
          const closed = await Promise.allSettled([actors?.close({ persistDrain: began }), world?.close(), artifacts?.close(), holes?.close()]);
          for (const [index, value] of closed.entries()) {
            if (value.status === 'rejected') cleanupFailed(['actors', 'world', 'artifacts', 'holes'][index], value.reason);
          }
          try { await questions?.close(); } catch (error) { cleanupFailed('questions', error); }
          try { await journal?.dispose(outcome.error ? Object.assign(Error(outcome.error.message), { code: outcome.error.code }) : undefined); }
          catch (error) { cleanupFailed('journal', error); }
          if (began) {
            if (fatalError) outcome.error ??= errorValue(fatalError);
            try { await cache.flush(); }
            catch (error) { cleanupFailed('cache', error); }
            try { await runProgress.finish(outcome); await runProgress.flush(); }
            catch (error) { cleanupFailed('progress', error); }
            // Release the host lease even when an auxiliary flush failed. The
            // store's finalizer preserves its commit failure and releases in finally.
            await ctx.omaa.workflowArtifacts.finish(parent.id, runId, outcome);
          }
        } finally {
          runs.delete(runId);
          if (ctx.omaa.workflowQuestionRegistries.get(runId) === questionRegistry) ctx.omaa.workflowQuestionRegistries.delete(runId);
        }
      }
      return { runId, ...outcome, reports, reportCount, reportsTruncated, actors: actors?.view() ?? [],
        ...(options.subagentModel === undefined ? {} : { subagentModel: options.subagentModel.canonical }) };
    })();
    record.result = result;
    ctx.omaa.workflowArtifacts.trackRun(runId, result, () => control.abort(Error('Workflow storage scope disposed.')));
    return { runId, result, ready: ready.promise, cancel: reason => {
      if (reason?.kind === 'user') record.stopReason = 'user';
      control.abort(reason instanceof Error ? reason : Object.assign(Error(typeof reason === 'string' ? reason : 'Workflow canceled.'),
        { nativeReason: reason }));
    } };
  }
  async function launch(exec, prepared, info, background, onReady) {
    checkAdmission(exec);
    const graph = { ...(prepared.graph ? { graph: prepared.graph } : {}), ...(prepared.causalityGraph ? { causalityGraph: prepared.causalityGraph } : {}) };
    const continuation = info.imported ? { eligiblePartialActors: [...info.imported.actors.values()].filter(value => value.inFlight).length, omittedPartialActors: info.imported.partialOmissions?.length ?? 0 } : undefined;
    const continuityMeta = { ...(continuation ? { continuation } : {}),
      ...(info.subagentModel === undefined ? {} : { subagentModel: info.subagentModel.canonical }) };
    if (background) {
      let run;
      const jobId = ctx.jobs.start({ kind: 'workflow', label: info.name, owner: exec.agent.id, run(job) {
        run = start(exec.agent, prepared, info, job, exec);
        return { cancel: run.cancel, done: run.result.then(outcome => ({ status: outcome.error ? outcome.error.kind === 'abort' ? 'killed' : 'failed' : 'completed',
          ...(outcome.error ? { detail: outcome.error.message } : {}), result: JSON.stringify(outcome) }), error => ({ status: 'failed', detail: error.message })) };
      } });
      try { await run.ready; }
      catch { const outcome = await run.result; return { ok: false, ...outcome, jobId, ...graph }; }
      onReady?.();
      return { ok: true, status: 'backgrounded', jobId, runId: run.runId, ...graph, ...continuityMeta,
        response: 'Workflow started as a native job. Its final outcome is delivered by the host when it settles.' };
    }
    const run = start(exec.agent, prepared, info, undefined, exec);
    const abort = () => run.cancel(exec.signal.reason); exec.signal.addEventListener('abort', abort, { once: true });
    if (exec.signal.aborted) abort();
    try {
      // Release a revision reservation only after begin/reopen and successor
      // linkage commit. Foreground live holes remain usable after admission.
      await run.ready.then(() => onReady?.(), () => {});
      const outcome = await run.result; return { ok: !outcome.error, ...outcome, ...graph, ...continuityMeta };
    }
    finally { exec.signal.removeEventListener('abort', abort); }
  }
  ctx.on('session/event', (session, event) => {
    if (['sandbox/mode', 'plan/mode'].includes(event.type)) for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow permissions or working mode changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    if (ctx.omaa.modeFor(session) !== 'default') for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow working mode changed.'));
  }, { global: true });
  ctx.tools.guard(exec => {
    if (['create_workflow', 'amend_workflow', 'fill_workflow', 'resume_workflow', 'eval_workflow_snippet', 'resolve_workflow_question'].includes(exec.name) && ctx.omaa.modeFor(exec.agent.session) !== 'default') return 'Execute workflows only in the default working mode.';
  });
  ctx.tools.register({ name: 'resolve_workflow_question',
    description: 'Answer a real blocking escalation raised by an Actor in a LIVE workflow owned by THIS session. Read actual pending questions with get_workflow_run. The answer commits before continuing the same parked child tool call. It does not conclude a turn, send a synthetic message, restart an archived driver or wake another model. An archived pending question without its live deferred returns run_not_in_flight.',
    parameters: { type: 'object', properties: { question_id: { type: 'string', minLength: 1 }, answer: { type: 'string', minLength: 1 } },
      required: ['question_id', 'answer'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { ok: { type: 'boolean', const: true }, qid: { type: 'string' }, response: { type: 'string' } },
      required: ['ok', 'qid', 'response'], additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: value.response }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (ctx.agents.get(exec.agent.id) !== exec.agent) throw Error('The native workflow question owner changed.');
      if (typeof args.question_id !== 'string' || !args.question_id || Buffer.byteLength(args.question_id) > 256 * 1024
        || typeof args.answer !== 'string' || !args.answer || Buffer.byteLength(args.answer) > 256 * 1024)
        throw Error('question_id and answer must be nonempty text within the native 256 KiB bound.');
      const checked = result => {
        if (!result.ok) throw Object.assign(Error(result.message), {
          code: String({ unknown_question: 22, already_resolved: 23, run_not_in_flight: 24 }[result.reason]), reason: result.reason });
        return { ok: true, qid: result.qid,
          response: `Answer delivered for question ${result.qid}. The waiting Actor tool call continues with that answer.` };
      };
      for (const entry of ctx.omaa.workflowQuestionRegistries.values()) {
        if (entry.sessionId !== exec.agent.id || !entry.questions.pending().some(row => row.qid === args.question_id)) continue;
        return checked(await entry.questions.resolve({ sessionId: exec.agent.id, questionId: args.question_id, answer: args.answer, signal: exec.signal }));
      }
      const archived = await findWorkflowQuestionFact(ctx.omaa.workflowArtifacts, exec.agent.id, args.question_id, exec.signal);
      const reason = archived?.fact.status === 'answered' ? 'already_resolved' : archived ? 'run_not_in_flight' : 'unknown_question';
      return checked({ ok: false, reason, message: reason === 'already_resolved' ? 'This question was already answered.'
        : reason === 'run_not_in_flight' ? 'This archived question has no live tool call waiting for an answer.'
        : 'No question with this ID belongs to the current session.' });
    },
  });
  ctx.tools.register({ name: 'create_workflow',
    output: workflowOutput,
    description: 'Typecheck and execute a ZCode TypeScript workflow with the original Actor facade: agent(name, persona?) creates a persistent conversational Actor; await actor.ask<T>(instructions) synthesizes and validates structured result schemas, while ask() and ask<string>() return final assistant text. Repeated asks reuse the same native DSH child and queue FIFO. Load zcode-workflows first; use only when the user chooses a workflow or enables Pro/Ultra. Supply exactly one source: script, path, or saved. Models, API, permissions, jobs and child sessions remain DSH-owned. files and git observations use the workspace and original result contracts; world.run executes only the script\'s declared literal commands under current native permissions. artifact.file and artifact.markdown publish immutable content versions and return {id,version}; top-level artifact.chart/table/metrics/board declarations receive tagged report(item,id) data. Content publication failures are catchable; invalid declarations or reports fail the run. Use the returned run identity to view its published artifacts.',
    parameters: { type: 'object', properties: {
      script: { type: 'string' }, path: { type: 'string' }, saved: { type: 'object', properties: { name: { type: 'string' }, scope: { type: 'string', enum: ['project', 'global'] }, args: { type: 'object', additionalProperties: true } }, required: ['name'], additionalProperties: false },
      name: { type: 'string' }, args: { type: 'object', additionalProperties: true }, run_in_background: { type: 'boolean' }, max_concurrency: { type: 'integer', minimum: 1 },
      subagent_model: { type: 'string', minLength: 1, description: 'Default model for subagents: provider/model[$effort] or a unique native model id. Only when the user asks; the parent stays on its session model. Explicit Actor model choices take priority.' },
    }, additionalProperties: false },
    async execute(args, exec) {
      if ([args.script, args.path, args.saved].filter(value => value !== undefined).length !== 1) throw Error('Provide exactly one workflow source: script, path, or saved.');
      const maxConcurrency = checkedConcurrency(args.max_concurrency);
      const subagentModel = args.subagent_model === undefined ? undefined : checkedWorkflowSubagentModelInput(args.subagent_model);
      const store = createSavedWorkflowStore(ctx, exec); let script = args.script, name = args.name, values = args.args ?? {}, bodyLineOffset = 0;
      if (args.path !== undefined) {
        const file = decodePathSource(await store.read(args.path));
        script = file.script; bodyLineOffset = file.bodyLineOffset;
        if (file.meta !== undefined) {
          const checked = validateWorkflowArgs(file.meta.args, args.args);
          if (!checked.ok) throw Error(checked.errors.join('\n'));
          values = checked.args;
        }
      }
      if (args.saved !== undefined) {
        if (args.args !== undefined) throw Error('Saved workflow arguments belong in saved.args.');
        const saved = await store.load(args.saved.name, args.saved.scope), checked = validateWorkflowArgs(saved.meta.args, args.saved.args);
        if (!checked.ok) throw Error(checked.errors.join('\n'));
        script = saved.script; values = checked.args; name ??= saved.name; bodyLineOffset = saved.bodyLineOffset;
      }
      exec.signal.throwIfAborted();
      const prepared = await prepareTypedWorkflow(script, exec.signal); exec.signal.throwIfAborted();
      if (!prepared.ok) return { ok: false, diagnostics: sourceLines(prepared.diagnostics, bodyLineOffset), response: 'Nothing was executed; fix the TypeScript or unsupported facade calls.' };
      const models = await resolveWorkflowModelBindings(ctx, sourceLines(prepared.modelReferences, bodyLineOffset), exec.signal, subagentModel);
      if (models.diagnostics.length) return { ok: false, diagnostics: models.diagnostics, response: 'Nothing was executed; fix the native model references.' };
      return launch(exec, prepared, { name: name || 'ZCode workflow', args: values, maxConcurrency,
        modelBindings: models.bindings, subagentModel: models.subagentModel }, args.run_in_background !== false);
    },
  });
  ctx.tools.register({ name: 'resume_workflow', output: workflowOutput,
    description: 'Resume an interrupted, failed or stopped native ZCode workflow under its SAME run identity and exact archived source, arguments, directory and resolved model bindings. Only executions which attached the prospective v3 replay journal before any effect are eligible. Completed effects return their saved values or failures in recorded settlement order; report and artifact hits do not publish again. Still-running and superseded runs are refused. Unknown external command outcomes, running Actor asks or missing exact completed native Actor context stop BEFORE script execution. This does not revive the old driver or repair session events. Load zcode-workflows first. Use amend_workflow for a revised source or settings.',
    parameters: { type: 'object', properties: { run_id: { type: 'string' }, run_in_background: { type: 'boolean' } },
      required: ['run_id'], additionalProperties: false },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (amending.has(args.run_id) || runs.has(args.run_id)) throw Error('This workflow is already running or being revised.');
      const releaseRevision = reserveRevision(args.run_id);
      try {
        const store = ctx.omaa.workflowArtifacts, parent = exec.agent;
        const archived = await store.record(parent.id, args.run_id);
        if (archived.supersededBy !== undefined || !['running', 'failed', 'killed'].includes(archived.status))
          throw Error('Only an interrupted, failed or stopped unsuperseded execution can resume.');
        const settings = await readRunSettings({ store, parent, record: archived, signal: exec.signal });
        const prepared = await prepareTypedWorkflow(settings.script, exec.signal);
        if (!prepared.ok) return { ok: false, runId: args.run_id, diagnostics: prepared.diagnostics,
          response: 'The archived workflow was not changed. Its exact source cannot be admitted by this compiler.' };
        const models = await resolveWorkflowModelBindings(ctx, prepared.modelReferences, exec.signal, settings.subagentModel?.canonical);
        if (models.diagnostics.length) return { ok: false, runId: args.run_id, diagnostics: models.diagnostics,
          response: 'The archived workflow was not changed. Its exact native model routes are unavailable.' };
        const directories = await executionDirectories(ctx, parent, exec.signal);
        const replay = await readNativeReplayJournalRecord({ store, parent, record: archived, signal: exec.signal,
          ownership: { script: settings.script, args: settings.args, cwd: directories.cwd,
            modelBindings: models.bindings, subagentModel: models.subagentModel } });
        if (replay.uncertainEffects.length || replay.runningAsks.length)
          throw Object.assign(Error('The archived workflow has a running external command or Actor ask whose complete outcome cannot be proven. It was not reopened.'), { code: 'uncertain_effect' });
        await prepareActorReplay({ ctx, parent, store, record: archived, journalNodes: replay.entries,
          signal: exec.signal, directories });
        exec.signal.throwIfAborted();
        return await launch(exec, prepared, { replay: true, runId: args.run_id, expectedRevision: archived.revision,
          name: archived.name, args: settings.args, maxConcurrency: settings.maxConcurrency,
          directories, modelBindings: models.bindings, subagentModel: models.subagentModel }, args.run_in_background !== false, releaseRevision);
      } finally { releaseRevision(); }
    },
  });
  ctx.tools.register({ name: 'fill_workflow', output: workflowOutput,
    description: 'Fill an open hole in a LIVE native ZCode workflow of this session. Supply the requested hole site id and TypeScript BODY STATEMENTS, such as return value;. The original splicer wraps these statements in its async function; do not add an outer function expression. The full effective script is typechecked; existing site/schema/phase identities and launch-resolved models must remain compatible. The source and hole facts commit durably before parked lexical evaluators resume. This native tool does not resume a stopped run or provide crash replay. Load zcode-workflows before authoring the body.',
    parameters: { type: 'object', properties: { run_id: { type: 'string' }, site_id: { type: 'string' }, body: { type: 'string' } },
      required: ['run_id', 'site_id', 'body'], additionalProperties: false },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const releaseRevision = reserveRevision(args.run_id);
      try {
        const run = runs.get(args.run_id);
        if (!run || run.parent !== exec.agent || run.control.signal.aborted) throw Error('Only this parent session can fill its live workflow holes.');
        const result = await run.holes.fill({ siteId: args.site_id, body: args.body, filledBy: exec.agent.id, signal: exec.signal });
        return { runId: args.run_id, status: result.ok ? 'filled' : 'fill_rejected', ...result };
      } finally { releaseRevision(); }
    },
  });
  ctx.tools.register({ name: 'amend_workflow', output: workflowOutput,
    description: amendDescription,
    parameters: { type: 'object', properties: { run_id: { type: 'string' }, script: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' },
      args: { type: 'object', additionalProperties: true }, max_concurrency: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }], description: 'Omit to inherit, null to clear the additional run cap, or a positive integer to set it. Native capacity and per-Actor FIFO remain authoritative.' }, run_in_background: { type: 'boolean' },
      subagent_model: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }], description: 'Omit to inherit the predecessor model choice, null to clear the run choice, or a native model id to replace it. Only when the user asks; explicit Actor choices take priority.' } },
      required: ['run_id'], additionalProperties: false },
    async execute(args, exec) {
      checkAdmission(exec);
      const releaseRevision = reserveRevision(args.run_id);
      try {
        const store = ctx.omaa.workflowArtifacts, parent = exec.agent;
        let before = await store.record(parent.id, args.run_id);
        if (before.supersededBy) throw Error('Amend the current successor instead of its superseded predecessor.');
        const maxConcurrency = args.max_concurrency === null ? undefined : checkedConcurrency(args.max_concurrency);
        if (args.max_concurrency !== undefined && Object.keys(args).every(key => ['run_id', 'max_concurrency'].includes(key))) {
          const running = runs.get(args.run_id);
          if (running && running.parent !== parent) throw Error('Only this parent session can retune its workflow.');
          if (running && !running.control.signal.aborted) {
            const retuneSignal = AbortSignal.any([exec.signal, running.control.signal]);
            let retuned;
            try {
              retuned = await store.mutate(parent.id, args.run_id, async value => {
                if (runs.get(args.run_id) !== running || running.control.signal.aborted || value.status !== 'running') return NO_ARTIFACT_CHANGE;
                await retuneRunExecution(store, parent, value, maxConcurrency);
                return true;
              }, { signal: retuneSignal });
            } catch (error) {
              // Only the known run cancellation before the summary put permits
              // successor fallback. Unknown storage failures must not retry.
              if (error !== retuneSignal.reason || exec.signal.aborted || !running.control.signal.aborted) throw error;
            }
            if (retuned) {
              // A confirmed durable update also updates the live admission cap,
              // even if the caller canceled while the summary put was finishing.
              running.concurrency.retune(maxConcurrency);
              exec.signal.throwIfAborted();
              return { ok: true, status: 'retuned', runId: args.run_id, maxConcurrency: maxConcurrency ?? null };
            }
          }
          // Old terminal rows did not persist every late user-stop request.
          // Only this retained native lifecycle can prove its final stop intent.
          if (!running) throw Error('The run is no longer live and its archived stop intent is unproven. Request an explicit revision instead of an automatic concurrency-only fallback.');
          await running.result;
          exec.signal.throwIfAborted();
          if (running.stopReason === 'user') throw Error('The user stopped this run. Request an explicit revision instead of a concurrency-only fallback.');
          // Finish releases the old control before this fresh terminal read;
          // a user stop during draining cannot be mistaken for a non-user stop.
          before = await store.record(parent.id, args.run_id);
          exec.signal.throwIfAborted();
          if (before.supersededBy) throw Error('Amend the current successor instead of its superseded predecessor.');
          if (!['completed', 'failed'].includes(before.status) || before.runtime?.stopReason === 'user')
            throw Error('This concurrency-only request could not retune a live run. A settled, owned run with a proven non-user stop is required for successor fallback; otherwise request an explicit revision.');
        }
        if (args.script !== undefined && args.path !== undefined) throw Error('Supply script or path, never both.');
        const settings = await readRunSettings({ store, parent, record: before, signal: exec.signal });
        const subagentModel = args.subagent_model === undefined ? settings.subagentModel?.canonical
          : args.subagent_model === null ? undefined : checkedWorkflowSubagentModelInput(args.subagent_model);
        let script = args.script ?? settings.script, values = args.args ?? settings.args, bodyLineOffset = 0;
        if (args.path !== undefined) {
          const file = decodePathSource(await createSavedWorkflowStore(ctx, exec).read(args.path));
          script = file.script; bodyLineOffset = file.bodyLineOffset;
          if (file.meta !== undefined) {
            // Omission inherits actual predecessor values. A changed metadata
            // default must not silently replace a value the old run already used.
            const checked = validateWorkflowArgs(file.meta.args, values);
            if (!checked.ok) throw Error(checked.errors.join('\n'));
            values = checked.args;
          }
        }
        exec.signal.throwIfAborted();
        const prepared = await prepareTypedWorkflow(script, exec.signal);
        checkAdmission(exec);
        if (!prepared.ok) return { ok: false, runId: args.run_id, diagnostics: sourceLines(prepared.diagnostics, bodyLineOffset),
          response: 'The predecessor was not stopped. Fix the revised TypeScript before amending it.' };
        const models = await resolveWorkflowModelBindings(ctx, sourceLines(prepared.modelReferences, bodyLineOffset), exec.signal, subagentModel);
        if (models.diagnostics.length) return { ok: false, runId: args.run_id, diagnostics: models.diagnostics,
          response: 'The predecessor was not stopped. Fix the native model references before amending it.' };
        const directories = await executionDirectories(ctx, parent, exec.signal);
        await importCompletedRun({ ctx, parent, store, record: before, signal: exec.signal, directories });
        checkAdmission(exec);
        const runId = randomUUID();
        const settled = await store.stopAndWait(parent.id, args.run_id);
        const imported = await importCompletedRun({ ctx, parent, store, record: settled, signal: exec.signal, directories });
        return await launch(exec, prepared, { runId, resumedFrom: args.run_id, imported, name: args.name ?? before.name,
          args: values, maxConcurrency: args.max_concurrency === undefined ? settings.maxConcurrency : maxConcurrency, directories,
          modelBindings: models.bindings, subagentModel: models.subagentModel }, args.run_in_background !== false, releaseRevision);
      } finally { releaseRevision(); }
    },
  });
  ctx.effect(() => async () => {
    active = false;
    for (const run of runs.values()) run.control.abort(Error('ZCode workflow scope disposed.'));
    await Promise.allSettled([...runs.values()].map(run => run.result));
  });
}
