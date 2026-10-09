import { randomUUID } from 'node:crypto';
import { executionDirectories } from '../../host/working-directory.mjs';
import { prepareTypedWorkflow } from './typed-compiler.mjs';
import { createActors, installLiteralActorPersona } from './actors.mjs';
import { createSavedWorkflowStore } from './saved-workflows.mjs';
import { validateWorkflowArgs } from '../../../lib/zcode-saved-args.mjs';
import { createWorldReads } from './world.mjs';
import { createArtifacts } from './artifacts.mjs';
import { WorkflowError } from '../../../lib/zcode-artifact-shared.mjs';
import { createRunProgress } from './run-progress.mjs';
import { createRunCache, importCompletedRun, RUN_CACHE_VERSION } from './run-cache.mjs';
import { checkedConcurrency, createAskConcurrency } from './concurrency.mjs';

export const name = 'omaa-zcode-typed-workflow';
export const inject = ['omaa', 'tools', 'fs', 'agents', 'subagents', 'jobs', 'ptcRuntime', 'sandboxPolicy', 'sandbox', 'subprocess'];
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
  'Load the zcode-workflows skill with skill before revising a script. A call that passes path or script is refused until that skill has been loaded in this session; a settings-only call is not. Pass path (the run’s script file, edited in place — the usual form) or script (the whole revised script inline), never both. Omitted source, name, args and max_concurrency keep their archived values. A call containing only run_id and max_concurrency retunes that live run without restarting or canceling accepted tasks.',
  '',
  'The host typechecks before stopping the predecessor and waits for it to settle. Named Actors with matching personas reuse contiguous completed task results; the first changed or new ask receives the exact completed native transcript prefix. Matching world observations are reused in occurrence order; live world.run and native tools without effect classification close the import window conservatively. Pending asks are canceled rather than resumed from half-finished transcripts. The current DSH model, API and permissions remain authoritative.',
].join('\n');
// The original lowerer emits synchronous Actor construction and narration.
// PTC only transports async JSON bindings, so this pure script-side shim
// retains reference identity and drains queued narration. Native teardown
// cancels unfinished asks after the script returns, as the original engine does.
function programFor(lowered) {
  return `const __init = await zcodeHost.init(null);
const __names = new Set(), __actorOrdinals = new Map(); let __ordinal = 0, __narration = Promise.resolve(), __phase;
const __append = data => { __narration = __narration.then(() => zcodeHost.narrate(data)); __narration.catch(() => {}); };
const __host = {
  args: __init.args,
  createActor(siteId, name, persona) {
    if (name !== undefined && typeof name !== 'string') throw new Error('Actor name must be a string');
    if (name && __names.has(name)) throw new Error('Duplicate Actor name: ' + name);
    if (name) __names.add(name);
    const ordinal = (__actorOrdinals.get(siteId) ?? 0) + 1; __actorOrdinals.set(siteId, ordinal);
    const reference = Object.freeze({ handle: __init.nonce + ':' + (++__ordinal), siteId, ordinal, name: name ?? null, persona: persona ?? null, phaseName: __phase ?? null });
    __append({type:'actor-created',reference}); return reference;
  },
  ask(siteId, actor, instructions) {
    const phaseName = __phase;
    const task = __narration.then(() => zcodeHost.ask({siteId, actor, instructions, ...phaseName===undefined?{}:{phaseName}}));
    task.catch(() => {}); return task;
  },
  log(message) { __append({type:'log',message}); },
  enterPhase(title) { __phase = title; __append({type:'phase',title}); },
  report(siteId, value, artifactId) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error('The report value cannot be represented as JSON.');
      __append({type:'report',siteId,serialized,...artifactId===undefined?{}:{artifactId}});
    } catch (error) { __append({type:'report-error',message:error.message}); }
  },
  worldRead(siteId, op, args) {
    const phaseName = __phase;
    let encodedArgs;
    try { encodedArgs = args.map(value => value === undefined ? {omitted:true} : {value:JSON.parse(JSON.stringify(value))}); }
    catch (error) { return Promise.reject(Object.assign(error,{code:'DriverError'})); }
    const call = __narration.then(async () => {
      const result = await zcodeHost.world({siteId,op,arguments:encodedArgs,...phaseName===undefined?{}:{phaseName}});
      if (result.ok) return result.value;
      throw Object.assign(new Error(result.error.message), {name:result.error.name,code:result.error.code});
    });
    call.catch(() => {}); return call;
  },
  publishArtifact(siteId, op, args) {
    let encodedArgs;
    try { encodedArgs = args.map(value => value === undefined ? {omitted:true} : {value:JSON.parse(JSON.stringify(value))}); }
    catch (error) { return Promise.reject(Object.assign(error,{code:'DriverError'})); }
    const call = __narration.then(async () => {
      const result = await zcodeHost.publishArtifact({siteId,op,arguments:encodedArgs});
      if (result.ok) return result.value;
      throw Object.assign(new Error(result.error.message), {name:result.error.name,code:result.error.code});
    });
    call.catch(() => {}); return call;
  },
  declareArtifact(siteId, op, args) {
    try {
      __append({type:'declare',siteId,op,arguments:args.map(value=>value===undefined?{omitted:true}:{value:JSON.parse(JSON.stringify(value))})});
    } catch(error) { __append({type:'report-error',message:error.message}); }
  }
};
try {
  const value = await (async () => {\n${lowered.code}\n})();
  await __narration;
  return value;
} finally { await __narration; }`;
}

export function apply(ctx) {
  installLiteralActorPersona(ctx);
  const runs = new Map(), amending = new Set();
  function start(parent, prepared, options, job, exec) {
    const control = new AbortController(), signal = control.signal, runId = options.runId ?? randomUUID(), reports = [];
    const policy = ctx.sandboxPolicy.resolve({ session: parent.session }), policyKey = JSON.stringify(policy);
    const concurrency = createAskConcurrency(signal, options.maxConcurrency);
    const ready = Promise.withResolvers(); ready.promise.catch(() => {});
    const record = { parent, control, concurrency }; let fatalError;
    const fatal = error => { if (!fatalError) { fatalError = error; control.abort(error); } };
    const check = () => {
      if (fatalError) throw fatalError;
      signal.throwIfAborted();
      if (ctx.agents.get(parent.id) !== parent || JSON.stringify(ctx.sandboxPolicy.resolve({ session: parent.session })) !== policyKey) { control.abort(Error('The native parent or workflow permission changed.')); signal.throwIfAborted(); }
    };
    const progress = event => job?.append(JSON.stringify(event) + '\n');
    const runProgress = createRunProgress({ store: ctx.omaa.workflowArtifacts, parent, runId, signal, stopReason: () => record.stopReason });
    const cache = createRunCache({ store: ctx.omaa.workflowArtifacts, parent, runId, imported: options.imported });
    const directories = options.directories ? Promise.resolve(options.directories) : executionDirectories(ctx, parent, signal, policy.workspaceRoot);
    void directories.catch(() => {});
    const actors = createActors({ ctx, parent, sites: prepared.sites, askSpecs: prepared.askSpecs, signal, progress, runProgress,
      cache, imported: options.imported, concurrency, directories });
    const world = createWorldReads({ ctx, parent, prepared, signal, check, actor: exec, directories });
    const artifacts = createArtifacts({ ctx, parent, prepared, runId, store: ctx.omaa.workflowArtifacts, signal, check, fatal, actor: exec, directories });
    runs.set(runId, record);
    let narration = Promise.resolve();
    const functions = {
      async init() { check(); return { args: options.args ?? {}, nonce: runId }; },
      async ask(args) { check(); return actors.ask(args); },
      async world(args) {
        check();
        const argumentsValue = world.argumentsFor(args);
        const { cached, ordinal } = cache.admitWorld(args.op, argumentsValue);
        const node = await runProgress.node(args.siteId, args.op === 'run' ? 'world-run' : 'world-read', { phaseName: args.phaseName });
        try {
          if (cached) {
            await cache.worldResult(args.op, argumentsValue, ordinal, cached.result, true);
            await node.settled(undefined, { cached: true }); return { ok: true, value: cached.result };
          }
          if (args.op === 'run') await cache.close('world-run', { siteId: args.siteId });
          await node.dispatched();
          const value = await world.execute(args);
          if (value.ok) await cache.worldResult(args.op, argumentsValue, ordinal, value.value, false);
          await node.settled(value.ok ? undefined : Error(value.error.message));
          return value;
        } catch (error) { await node.settled(error); throw error; }
      },
      async publishArtifact(args) { check(); return artifacts.publish(args); },
      async narrate(data) {
        check();
        const action = async () => {
          if (data.type === 'phase') { if (typeof data.title !== 'string') throw Error('Phase title must be text.'); job?.updateProgress(data.title); await ctx.omaa.workflowArtifacts.mutate(parent.id, runId, value => { value.phase = data.title; }); await runProgress.phase(data.title); }
          else if (data.type === 'log') { if (typeof data.message !== 'string') throw Error('Log message must be text.'); job?.append(data.message + '\n'); }
          else if (data.type === 'report') {
            const value = await artifacts.report(data);
            const event = { type: 'report', siteId: data.siteId, value, ...(data.artifactId === undefined ? {} : { artifactId: data.artifactId }) };
            reports.push(event); job?.append(JSON.stringify(event) + '\n');
          }
          else if (data.type === 'declare') await artifacts.declare(data);
          else if (data.type === 'actor-created') await actors.declare(data.reference);
          else if (data.type === 'report-error') { const error = new WorkflowError('DriverError', data.message); fatal(error); throw error; }
          else throw Error('Unknown workflow narration.');
          return null;
        };
        const work = narration.then(action); narration = work.catch(() => {}); return work;
      },
    };
    const result = (async () => {
      let outcome, began = false;
      const errorValue = (error, kind = signal.aborted && !fatalError ? 'abort' : 'exception') => ({ kind, name: error.name,
        message: error.message, ...(error.code ? { code: error.code } : {}) });
      try {
        const location = await directories; check();
        await ctx.omaa.workflowArtifacts.begin({ runId, sessionId: parent.id, name: options.name,
          graph: prepared.graph, causalityGraph: prepared.causalityGraph, displayGraph: prepared.displayGraph, jobId: job?.id,
          resumedFrom: options.resumedFrom,
          execution: { version: RUN_CACHE_VERSION, cwd: location.cwd, script: prepared.script, args: options.args ?? {}, actors: [], world: [],
            ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }) } }, () => {
          record.stopReason = 'user';
          if (job) ctx.jobs.kill(job.id, parent.id, 'Workflow stopped from its artifact panel.');
          else control.abort(Error('Workflow stopped from its artifact panel.'));
        }); began = true;
        if (options.resumedFrom) await ctx.omaa.workflowArtifacts.mutate(parent.id, options.resumedFrom, value => { value.supersededBy = runId; });
        await runProgress.start(); check(); ready.resolve();
        outcome = await ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: programFor(prepared.lowered), bindings: [{ global: 'zcodeHost', functions }],
          cwd: (await directories).cwd, sandboxPolicy: policy, signal, timeoutMs: null }));
        await narration;
        if (fatalError) outcome = { ...outcome, error: errorValue(fatalError) };
      } catch (error) {
        ready.reject(error);
        outcome = { error: errorValue(fatalError ?? error) };
      } finally {
        control.abort(Error('Workflow execution ended.'));
        try {
          const closed = await Promise.allSettled([actors.close(), world.close(), artifacts.close()]);
          const failures = closed.filter(value => value.status === 'rejected').map(value => value.reason);
          if (failures.length) outcome.error ??= errorValue(new AggregateError(failures, 'Native workflow resources could not be released.'), 'exception');
        if (began) { await cache.flush(); await runProgress.finish(outcome); await runProgress.flush(); await ctx.omaa.workflowArtifacts.finish(parent.id, runId, outcome); }
        } finally { runs.delete(runId); }
      }
      return { runId, ...outcome, reports, actors: actors.view() };
    })();
    record.result = result;
    ctx.omaa.workflowArtifacts.trackRun(runId, result, () => control.abort(Error('Workflow storage scope disposed.')));
    return { runId, result, ready: ready.promise, cancel: reason => {
      if (reason?.kind === 'user') record.stopReason = 'user';
      control.abort(reason instanceof Error ? reason : Object.assign(Error(typeof reason === 'string' ? reason : 'Workflow canceled.'),
        { nativeReason: reason }));
    } };
  }
  async function launch(exec, prepared, info, background) {
    exec.signal.throwIfAborted();
    const graph = { ...(prepared.graph ? { graph: prepared.graph } : {}), ...(prepared.causalityGraph ? { causalityGraph: prepared.causalityGraph } : {}) };
    if (background) {
      let run;
      const jobId = ctx.jobs.start({ kind: 'workflow', label: info.name, owner: exec.agent.id, run(job) {
        run = start(exec.agent, prepared, info, job, exec);
        return { cancel: run.cancel, done: run.result.then(outcome => ({ status: outcome.error ? outcome.error.kind === 'abort' ? 'killed' : 'failed' : 'completed',
          ...(outcome.error ? { detail: outcome.error.message } : {}), result: JSON.stringify(outcome) }), error => ({ status: 'failed', detail: error.message })) };
      } });
      try { await run.ready; }
      catch { const outcome = await run.result; return { ok: false, ...outcome, jobId, ...graph }; }
      return { ok: true, status: 'backgrounded', jobId, runId: run.runId, ...graph,
        response: 'Workflow started as a native job. Its final outcome is delivered by the host when it settles.' };
    }
    const run = start(exec.agent, prepared, info, undefined, exec);
    const abort = () => run.cancel(exec.signal.reason); exec.signal.addEventListener('abort', abort, { once: true });
    if (exec.signal.aborted) abort();
    try { const outcome = await run.result; return { ok: !outcome.error, ...outcome, ...graph }; }
    finally { exec.signal.removeEventListener('abort', abort); }
  }
  ctx.on('session/event', (session, event) => {
    if (['sandbox/mode', 'plan/mode'].includes(event.type)) for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow permissions or working mode changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    if (ctx.omaa.modeFor(session) !== 'default') for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow working mode changed.'));
  }, { global: true });
  ctx.tools.guard(exec => {
    if (['create_workflow', 'amend_workflow'].includes(exec.name) && ctx.omaa.modeFor(exec.agent.session) !== 'default') return 'Execute workflows only in the default working mode.';
  });
  ctx.tools.register({ name: 'create_workflow',
    output: workflowOutput,
    description: 'Typecheck and execute a ZCode TypeScript workflow with the original Actor facade: agent(name, persona?) creates a persistent conversational Actor; await actor.ask<T>(instructions) synthesizes and validates structured result schemas, while ask() and ask<string>() return final assistant text. Repeated asks reuse the same native DSH child and queue FIFO. Load zcode-workflows first; use only when the user chooses a workflow or enables Pro/Ultra. Supply exactly one source: script, path, or saved. Models, API, permissions, jobs and child sessions remain DSH-owned. files and git observations use the workspace and original result contracts; world.run executes only the script\'s declared literal commands under current native permissions. artifact.file and artifact.markdown publish immutable content versions and return {id,version}; top-level artifact.chart/table/metrics/board declarations receive tagged report(item,id) data. Content publication failures are catchable; invalid declarations or reports fail the run. Use the returned run identity to view its published artifacts.',
    parameters: { type: 'object', properties: {
      script: { type: 'string' }, path: { type: 'string' }, saved: { type: 'object', properties: { name: { type: 'string' }, scope: { type: 'string', enum: ['project', 'global'] }, args: { type: 'object', additionalProperties: true } }, required: ['name'], additionalProperties: false },
      name: { type: 'string' }, args: { type: 'object', additionalProperties: true }, run_in_background: { type: 'boolean' }, max_concurrency: { type: 'integer', minimum: 1 },
    }, additionalProperties: false },
    async execute(args, exec) {
      if ([args.script, args.path, args.saved].filter(value => value !== undefined).length !== 1) throw Error('Provide exactly one workflow source: script, path, or saved.');
      const maxConcurrency = checkedConcurrency(args.max_concurrency);
      const store = createSavedWorkflowStore(ctx, exec); let script = args.script, name = args.name, values = args.args ?? {};
      if (args.path !== undefined) script = (await store.read(args.path)).source;
      if (args.saved !== undefined) {
        if (args.args !== undefined) throw Error('Saved workflow arguments belong in saved.args.');
        const saved = await store.load(args.saved.name, args.saved.scope), checked = validateWorkflowArgs(saved.meta.args, args.saved.args);
        if (!checked.ok) throw Error(checked.errors.join('\n'));
        script = saved.script; values = checked.args; name ??= saved.name;
      }
      exec.signal.throwIfAborted();
      const prepared = prepareTypedWorkflow(script); exec.signal.throwIfAborted();
      if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics, response: 'Nothing was executed; fix the TypeScript or unsupported facade calls.' };
      return launch(exec, prepared, { name: name || 'ZCode workflow', args: values, maxConcurrency }, args.run_in_background !== false);
    },
  });
  ctx.tools.register({ name: 'amend_workflow', output: workflowOutput,
    description: amendDescription,
    parameters: { type: 'object', properties: { run_id: { type: 'string' }, script: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' },
      args: { type: 'object', additionalProperties: true }, max_concurrency: { type: 'integer', minimum: 1 }, run_in_background: { type: 'boolean' } },
      required: ['run_id'], additionalProperties: false },
    async execute(args, exec) {
      if (amending.has(args.run_id)) throw Error('This workflow is already being amended.');
      amending.add(args.run_id);
      try {
        const store = ctx.omaa.workflowArtifacts, parent = exec.agent;
        const before = await store.record(parent.id, args.run_id);
        if (before.supersededBy) throw Error('Amend the current successor instead of its superseded predecessor.');
        const maxConcurrency = checkedConcurrency(args.max_concurrency);
        if (maxConcurrency !== undefined && Object.keys(args).every(key => ['run_id', 'max_concurrency'].includes(key))) {
          const running = runs.get(args.run_id);
          if (!running || running.parent !== parent || running.control.signal.aborted) throw Error('Only a live workflow can be retuned.');
          await store.mutate(parent.id, args.run_id, value => { value.execution.maxConcurrency = maxConcurrency; });
          exec.signal.throwIfAborted(); running.concurrency.retune(maxConcurrency);
          return { ok: true, status: 'retuned', runId: args.run_id, maxConcurrency };
        }
        if (args.script !== undefined && args.path !== undefined) throw Error('Supply script or path, never both.');
        if (before.execution?.version !== RUN_CACHE_VERSION) throw Error('This older workflow has no durable task-prefix cache. Create a new workflow before amending it.');
        const script = args.path !== undefined ? (await createSavedWorkflowStore(ctx, exec).read(args.path)).source : args.script ?? before.execution.script;
        exec.signal.throwIfAborted();
        const prepared = prepareTypedWorkflow(script);
        if (!prepared.ok) return { ok: false, runId: args.run_id, diagnostics: prepared.diagnostics,
          response: 'The predecessor was not stopped. Fix the revised TypeScript before amending it.' };
        const directories = await executionDirectories(ctx, parent, exec.signal);
        await importCompletedRun({ ctx, parent, store, record: before, signal: exec.signal, directories });
        exec.signal.throwIfAborted();
        const runId = randomUUID();
        const settled = await store.stopAndWait(parent.id, args.run_id);
        const imported = await importCompletedRun({ ctx, parent, store, record: settled, signal: exec.signal, directories });
        return launch(exec, prepared, { runId, resumedFrom: args.run_id, imported, name: args.name ?? before.name,
          args: args.args ?? before.execution.args, maxConcurrency: maxConcurrency ?? before.execution.maxConcurrency, directories }, args.run_in_background !== false);
      } finally { amending.delete(args.run_id); }
    },
  });
  ctx.effect(() => async () => {
    for (const run of runs.values()) run.control.abort(Error('ZCode workflow scope disposed.'));
    await Promise.allSettled([...runs.values()].map(run => run.result));
  });
}
