import { randomUUID } from 'node:crypto';
import { prepareTypedWorkflow } from './typed-compiler.mjs';
import { createActors, installLiteralActorPersona } from './actors.mjs';
import { createSavedWorkflowStore } from './saved-workflows.mjs';
import { validateWorkflowArgs } from '../../../lib/zcode-saved-args.mjs';
import { REPORT_CAPS } from '../../../lib/zcode-workflow-compiler.mjs';

export const name = 'omaa-zcode-typed-workflow';
export const inject = ['omaa', 'tools', 'fs', 'agents', 'subagents', 'jobs', 'ptcRuntime', 'sandboxPolicy'];
// The original lowerer emits synchronous Actor construction and narration.
// PTC only transports async JSON bindings, so this pure script-side shim
// retains reference identity and drains queued narration. Native teardown
// cancels unfinished asks after the script returns, as the original engine does.
function programFor(lowered) {
  return `const __init = await zcodeHost.init(null);
const __names = new Set(); let __ordinal = 0, __narration = Promise.resolve();
const __append = data => { __narration = __narration.then(() => zcodeHost.narrate(data)); __narration.catch(() => {}); };
const __host = {
  args: __init.args,
  createActor(siteId, name, persona) {
    if (name !== undefined && typeof name !== 'string') throw new Error('Actor name must be a string');
    if (name && __names.has(name)) throw new Error('Duplicate Actor name: ' + name);
    if (name) __names.add(name);
    return Object.freeze({ handle: __init.nonce + ':' + (++__ordinal), siteId, name: name ?? null, persona: persona ?? null });
  },
  ask(siteId, actor, instructions) {
    const task = __narration.then(() => zcodeHost.ask({siteId, actor, instructions}));
    task.catch(() => {}); return task;
  },
  log(message) { __append({type:'log',message}); },
  enterPhase(title) { __append({type:'phase',title}); },
  report(siteId,value,metric) { __append({type:'report',siteId,value,...metric===undefined?{}:{metric}}); },
  worldRead() { throw new Error('World-read facade is not connected'); },
  publishArtifact() { throw new Error('Artifact registry is not connected'); },
  declareArtifact() { throw new Error('Artifact registry is not connected'); }
};
try {
  const value = await (async () => {\n${lowered.code}\n})();
  await __narration;
  return value;
} finally { await __narration; }`;
}

export function apply(ctx) {
  installLiteralActorPersona(ctx);
  const runs = new Map();
  function start(parent, prepared, options, job) {
    const control = new AbortController(), signal = control.signal, runId = randomUUID(), reports = [];
    const policy = ctx.sandboxPolicy.resolve({ session: parent.session }), policyKey = JSON.stringify(policy);
    const record = { parent, control };
    const check = () => {
      signal.throwIfAborted();
      if (ctx.agents.get(parent.id) !== parent || JSON.stringify(ctx.sandboxPolicy.resolve({ session: parent.session })) !== policyKey) { control.abort(Error('The native parent or workflow permission changed.')); signal.throwIfAborted(); }
    };
    const progress = event => job?.append(JSON.stringify(event) + '\n');
    const actors = createActors({ ctx, parent, sites: prepared.sites, askSpecs: prepared.askSpecs, signal, progress });
    runs.set(runId, record);
    let narration = Promise.resolve();
    const functions = {
      async init() { check(); return { args: options.args ?? {}, nonce: runId }; },
      async ask(args) { check(); return actors.ask(args); },
      async narrate(data) {
        check();
        const action = async () => {
          if (data.type === 'phase') { if (typeof data.title !== 'string') throw Error('Phase title must be text.'); job?.updateProgress(data.title); }
          else if (data.type === 'log') { if (typeof data.message !== 'string') throw Error('Log message must be text.'); job?.append(data.message + '\n'); }
          else if (data.type === 'report') {
            if (reports.length >= REPORT_CAPS.maxItemsPerRun || Buffer.byteLength(JSON.stringify(data.value)) > REPORT_CAPS.maxItemSerializedBytes) throw Error('Report exceeded the original ZCode report budget.');
            reports.push(data); job?.append(JSON.stringify(data) + '\n');
          }
          else throw Error('Unknown workflow narration.');
          return null;
        };
        const work = narration.then(action); narration = work.catch(() => {}); return work;
      },
    };
    const result = (async () => {
      try {
        const outcome = await ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: programFor(prepared.lowered), bindings: [{ global: 'zcodeHost', functions }],
          cwd: parent.session.header.cwd, sandboxPolicy: policy, signal, timeoutMs: null }));
        await narration;
        return { runId, ...outcome, reports, actors: actors.view() };
      } finally {
        control.abort(Error('Workflow execution ended.'));
        try { await actors.close(); } finally { runs.delete(runId); }
      }
    })();
    record.result = result;
    return { runId, result, cancel: reason => control.abort(Error(reason || 'Workflow canceled.')) };
  }
  ctx.on('session/event', (session, event) => {
    if (['sandbox/mode', 'plan/mode'].includes(event.type)) for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow permissions or working mode changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    if (ctx.omaa.modeFor(session) !== 'default') for (const run of runs.values()) if (run.parent.id === session.id) run.control.abort(Error('Workflow working mode changed.'));
  }, { global: true });
  ctx.tools.guard(exec => {
    if (exec.name === 'create_workflow' && ctx.omaa.modeFor(exec.agent.session) !== 'default') return 'Execute workflows only in the default working mode.';
  });
  ctx.tools.register({ name: 'create_workflow',
    description: 'Typecheck and execute a ZCode TypeScript workflow with the original Actor facade: agent(name, persona?) creates a persistent conversational Actor; await actor.ask<T>(instructions) synthesizes and validates structured result schemas, while ask() and ask<string>() return final assistant text. Repeated asks reuse the same native DSH child and queue FIFO. Load zcode-workflows first; use only when the user chooses a workflow or enables Pro/Ultra. Supply exactly one source: script, path, or saved. Models, API, permissions, jobs and child sessions remain DSH-owned. World-read and artifact registry calls are diagnosed before execution.',
    parameters: { type: 'object', properties: {
      script: { type: 'string' }, path: { type: 'string' }, saved: { type: 'object', properties: { name: { type: 'string' }, scope: { type: 'string', enum: ['project', 'global'] }, args: { type: 'object', additionalProperties: true } }, required: ['name'], additionalProperties: false },
      name: { type: 'string' }, args: { type: 'object', additionalProperties: true }, run_in_background: { type: 'boolean' },
    }, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args, exec) {
      if ([args.script, args.path, args.saved].filter(value => value !== undefined).length !== 1) throw Error('Provide exactly one workflow source: script, path, or saved.');
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
      const info = { name: name || 'ZCode workflow', args: values }, graph = { ...(prepared.graph ? { graph: prepared.graph } : {}), ...(prepared.causalityGraph ? { causalityGraph: prepared.causalityGraph } : {}) };
      if (args.run_in_background !== false) {
        let run;
        const jobId = ctx.jobs.start({ kind: 'workflow', label: info.name, owner: exec.agent.id, run(job) {
          run = start(exec.agent, prepared, info, job);
          return { cancel: run.cancel, done: run.result.then(outcome => ({ status: outcome.error ? outcome.error.kind === 'abort' ? 'killed' : 'failed' : 'completed',
            ...(outcome.error ? { detail: outcome.error.message } : {}), result: JSON.stringify(outcome) }), error => ({ status: 'failed', detail: error.message })) };
        } });
        return { ok: true, status: 'backgrounded', jobId, runId: run.runId, ...graph, response: 'Workflow started as a native job. Its final outcome is delivered by the host when it settles.' };
      }
      const run = start(exec.agent, prepared, info);
      const abort = () => run.cancel('Native tool call canceled.'); exec.signal.addEventListener('abort', abort, { once: true });
      try { const outcome = await run.result; return { ok: !outcome.error, ...outcome, ...graph }; }
      finally { exec.signal.removeEventListener('abort', abort); }
    },
  });
  ctx.effect(() => async () => {
    for (const run of runs.values()) run.control.abort(Error('ZCode workflow scope disposed.'));
    await Promise.allSettled([...runs.values()].map(run => run.result));
  });
}
