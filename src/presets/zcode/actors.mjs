import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validate, formatViolations } from '../../../lib/zcode-workflow-compiler.mjs';
import { CONTINUITY_PROVIDER_PREFIX, createActorContinuity } from './continuity.mjs';
import { inputHash } from '../../../lib/zcode-import-cache.mjs';
import { startActivation, drainChildren } from '../../host/subagents.mjs';
import { ensureDirectory } from '../../host/working-directory.mjs';

const textOf = parts => (parts ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const copy = value => structuredClone(value);
export const ZCODE_ACTOR_LABEL_PREFIX = 'ZCode Actor · ';
const nativeObservations = new Set(['read', 'glob', 'grep', 'read_image', 'skill']);

export function installLiteralActorPersona(ctx) {
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next();
    const session = context.agent?.session;
    const descriptor = session?.snapshotEvents(session.inheritedEventCount).find(event => event.type === 'subagent/descriptor')?.data;
    if (descriptor?.mode !== 'continuable' || descriptor.provider !== 'spawn' && !descriptor.provider?.startsWith(CONTINUITY_PROVIDER_PREFIX)
      || !descriptor.label?.startsWith(ZCODE_ACTOR_LABEL_PREFIX) || typeof descriptor.persona !== 'string') return assembly;
    // The native descriptor owns the durable persona. Its text must survive
    // cold activation without depending on a workflow's temporary variables.
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'deployment:persona-prefix' && section.text === descriptor.persona
      ? { ...section, interpolate: false } : section) };
  }, { global: true });
}

// Only orchestration lives here. Native continuable children own their model,
// permission checks, tools, inbox, transcript, idle state and cold activation.
export function createActors({ ctx, parent, sites, askSpecs, signal, progress, runProgress, cache, imported, concurrency, directories }) {
  const directory = directories ? directories.then(value => value.cwd) : ensureDirectory(ctx, parent, signal);
  void directory.catch(() => {});
  const actors = new Map(), children = new Map(), disposers = [], staged = new WeakMap();
  const continuity = imported ? createActorContinuity(ctx, parent) : undefined;
  const actorSites = new Set(sites.actors.map(site => site.id));
  if (!ctx.subagents.getProvider('spawn')?.prepareContinuable) throw Error('Native continuable spawn provider is unavailable.');
  const check = () => signal.throwIfAborted();
  function install(agent, actor) {
    if (actor.agent === agent && actor.toolPending === actor.pending) return;
    actor.toolDispose?.(); actor.toolDispose = undefined; actor.agent = agent; actor.toolPending = actor.pending;
    const pending = actor.pending;
    if (!pending?.spec.typed) return;
    if (agent.ctx.get('tools').get('submit_result', agent)) throw Error('The native child already owns submit_result.');
    actor.toolDispose = agent.ctx.get('tools').register({
      name: 'submit_result',
      description: 'Submit the final result for this task. The value must match this JSON schema: ' + JSON.stringify(pending.spec.schema),
      parameters: { type: 'object', properties: { value: {} }, required: ['value'], additionalProperties: false },
      output: { schema: { type: 'object', properties: { recorded: { type: 'boolean' } }, required: ['recorded'], additionalProperties: false },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec) {
        check(); exec.signal.throwIfAborted();
        if (actor.pending !== pending || pending.finished || pending.reservation || pending.submitted !== undefined) throw Error('This typed task is no longer accepting a result.');
        const violations = validate(pending.spec.schema, args.value);
        if (violations.length) throw Error(formatViolations(violations));
        // Execution alone is not commitment: result hooks and enclosing PTC
        // calls can still reject. Commit only authoritative successful results.
        const submission = { actor, pending, value: copy(args.value) };
        pending.reservation = submission; staged.set(exec, submission);
        exec.concludeTurn();
        return { recorded: true };
      },
    });
  }
  function finish(actor) {
    const p = actor.pending;
    if (!p || p.finished || p.messageId === undefined || !p.end || !p.messages.has(p.messageId)) return;
    p.finished = true;
    if (p.end.reason?.kind !== 'completed') { p.result.reject(Error('Native actor task ended with ' + (p.end.reason?.kind ?? 'an unknown outcome'))); return; }
    if (p.spec.typed) {
      if (p.submitted === undefined) p.result.reject(Error('Native actor completed without a committed submit_result.'));
      else p.result.resolve(p.submitted.value);
    } else if (!p.assistantText) p.result.reject(Error('Native actor completed without final assistant text.'));
    else p.result.resolve(p.assistantText);
  }
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    const actor = children.get(agent.id); if (actor) install(agent, actor);
  }, { global: true }));
  disposers.push(ctx.on('agent/disposed', ({ agent }) => {
    const actor = children.get(agent.id);
    if (actor?.agent === agent) { actor.toolDispose?.(); actor.toolDispose = undefined; actor.agent = undefined; actor.toolPending = undefined; }
  }, { global: true }));
  disposers.push(ctx.on('tools/result', (exec, result) => {
    const actor = exec.agent && children.get(exec.agent.id), p = actor?.pending;
    if (!p || p.finished) return;
    const direct = staged.get(exec);
    if (direct) {
      staged.delete(exec);
      if (!result.isError && direct.pending === p) {
        if (exec.parent) p.enclosed.set(exec.parent, direct);
        else p.submitted = direct;
      } else if (p.reservation === direct) p.reservation = undefined;
    }
    const enclosed = p.enclosed.get(exec.token);
    if (enclosed) {
      p.enclosed.delete(exec.token);
      if (!result.isError) {
        if (exec.parent) p.enclosed.set(exec.parent, enclosed);
        else p.submitted = enclosed;
      } else if (p.reservation === enclosed) p.reservation = undefined;
    }
  }, { global: true }));
  disposers.push(ctx.on('tools/execute', async (exec, next) => {
    const actor = exec.agent && children.get(exec.agent.id), p = actor?.pending;
    if (!p || p.finished || exec.name === 'submit_result') return next();
    // The native parent-coordination message is not a workspace tool. Other
    // calls are counted at dispatch, including failed/denied bodies; native
    // exposes no authoritative post-approval world-effect classification.
    const target = exec.arguments?.agent_id;
    if (exec.name === 'send_message' && target === parent.id) return next();
    p.worldToolCalls++;
    if (!nativeObservations.has(exec.name)) await cache?.close('unclassified-native-tool', { actorName: actor.reference.name, tool: exec.name });
    return next();
  }, { global: true }));
  disposers.push(ctx.on('session/event', (session, event) => {
    const actor = children.get(session.id), p = actor?.pending;
    if (!p || p.finished) return;
    if (event.type === 'turn/start') { p.turn = event.data.turn; p.end = undefined; p.assistantText = ''; }
    if (event.type === 'user/message') {
      const message = event.data.message ?? event.data;
      p.messages.add(message.id);
    }
    if (event.type === 'assistant/message') p.assistantText = textOf((event.data.message ?? event.data).content);
    if (event.type === 'turn/end' && event.data.turn === p.turn) { p.end = event.data; p.eventCount = event.seq + 1; finish(actor); }
  }, { global: true }));
  const interrupted = () => {
    for (const id of children.keys()) {
      try { ctx.subagents.interrupt(id, { kind: 'ancestor', agent: parent }); } catch {}
    }
    for (const actor of actors.values()) actor.pending?.result.reject(signal.reason ?? Error('Workflow canceled.'));
  };
  signal.addEventListener('abort', interrupted, { once: true });
  function actorFor(reference) {
    check();
    if (!reference || typeof reference.handle !== 'string' || !actorSites.has(reference.siteId)
      || !Number.isInteger(reference.ordinal) || reference.ordinal < 1 || reference.name !== null && typeof reference.name !== 'string') throw Error('Invalid compiled Actor reference.');
    const persona = reference.persona;
    if (persona !== null && typeof persona !== 'string' && (!persona || typeof persona.system !== 'string' || Object.keys(persona).some(key => key !== 'system'))) throw Error('Invalid Actor persona.');
    let actor = actors.get(reference.handle);
    if (actor) { if (!isDeepStrictEqual(reference, actor.reference)) throw Error('An Actor identity cannot be changed.'); return actor; }
    if (reference.name && [...actors.values()].some(a => a.reference.name === reference.name)) throw Error('Duplicate Actor name: ' + reference.name);
    actor = { reference: copy(reference), childId: randomUUID(), created: false, tail: Promise.resolve(), pending: undefined, agent: undefined,
      seq: 0, imported: cache?.attachActor(reference) };
    actors.set(reference.handle, actor); children.set(actor.childId, actor);
    return actor;
  }
  return {
    view: () => [...actors.values()].map(actor => ({ name: actor.reference.name, childId: actor.childId, created: actor.created })),
    async declare(reference) {
      const actor = actorFor(reference);
      if (!actor.declared) { await cache?.declareActor(reference); actor.declared = true; }
      await runProgress?.created(reference, actor.childId);
    },
    async ask({ siteId, actor: reference, instructions, phaseName }) {
      check();
      if (typeof instructions !== 'string' || !askSpecs.has(siteId)) throw Error('Invalid compiled ask.');
      const actor = actorFor(reference), spec = askSpecs.get(siteId);
      const seq = actor.seq++;
      const candidate = actor.imported?.candidate.entries[seq];
      if (candidate && (spec.typed ? validate(spec.schema, candidate.result).length !== 0 : typeof candidate.result !== 'string'))
        actor.imported.reconcileRecorded(seq, inputHash(instructions), true, false);
      const cached = cache?.takeActor(actor.imported, seq, instructions);
      const observation = runProgress?.node(siteId, 'ask', {
        actor: runProgress.actor(reference, actor.childId), phaseName, instructions });
      observation?.catch(() => {});
      const work = actor.tail.then(async () => {
        const node = await observation;
        if (cached) {
          check();
          await cache.actorResult(reference, seq, instructions, cached.result,
            { sessionId: actor.imported.candidate.transcriptSourceSessionId, eventCount: cached.messageBoundary }, cached.stats, true);
          await node?.settled(undefined, { cached: true });
          return copy(cached.result);
        }
        const result = Promise.withResolvers();
        result.promise.catch(() => {});
        // A synchronous delivery may start/finish before its RPC returns. Keep
        // actual message IDs and terminal events, then correlate after receipt.
        const pending = { spec, result, messages: new Set(), enclosed: new Map(), finished: false, node, worldToolCalls: 0 };
        actor.pending = pending;
        const instructionsWithResult = spec.typed ? instructions + '\n\nReturn the final value by calling submit_result; its declared schema is the required task result.' : instructions;
        const prompt = [{ type: 'text', text: instructionsWithResult }];
        progress?.({ type: 'actor-start', siteId, name: reference.name, childId: actor.childId });
        let release;
        try {
          check();
          release = await concurrency?.acquire(); check();
          await node?.dispatched();
          if (!actor.created) {
            const persona = typeof reference.persona === 'string' ? reference.persona : reference.persona?.system;
            const seed = actor.imported?.seed();
            const detach = seed && continuity.attach(actor.childId, { sessionId: seed.sourceSessionId, eventCount: seed.messageCount, persona });
            let receipt;
            const cwd = await directory; check();
            try { receipt = await startActivation(ctx, { provider: seed ? continuity.name : 'spawn', label: ZCODE_ACTOR_LABEL_PREFIX + (reference.name || 'Actor'), childId: actor.childId, delivery: 'caller',
              request: { parent, prompt, ...(cwd === undefined ? {} : { cwd }), ...(persona === undefined ? {} : { persona }) }, signal }); }
            finally { detach?.(); }
            actor.created = true; pending.messageId = receipt.messageId;
            // The a2 result is settled after native teardown; propagate an
            // infrastructure rejection without leaving the pending ask hung.
            receipt.result?.catch(error => pending.result.reject(error));
          } else {
            const agent = ctx.get('agents')?.get(actor.childId); if (agent) install(agent, actor);
            pending.messageId = await ctx.subagents.sendMessage(parent, actor.childId, prompt, { signal });
          }
          await node?.materialized();
          finish(actor);
          const value = await result.promise;
          const agent = ctx.get('agents')?.get(actor.childId);
          if (agent) await agent.whenIdle(signal);
          if (!Number.isSafeInteger(pending.eventCount)) throw Error('The native completed task boundary is missing.');
          await cache?.actorResult(reference, seq, instructions, value, { sessionId: actor.childId, eventCount: pending.eventCount },
            { worldToolCalls: pending.worldToolCalls, observation: 'native-tool-dispatch' }, false);
          // The native continuation manager decides when an idle activation
          // can be released. Do not kill an actor's background work merely to
          // force cold activation for its next question.
          progress?.({ type: 'actor-end', siteId, name: reference.name, childId: actor.childId });
          await node?.settled();
          return value;
        } catch (error) {
          await cache?.stopActor(reference, seq);
          await node?.settled(error);
          throw error;
        } finally {
          release?.();
          if (actor.pending === pending) actor.pending = undefined;
          actor.toolDispose?.(); actor.toolDispose = undefined; actor.toolPending = undefined;
        }
      });
      actor.tail = work.catch(() => {});
      return work;
    },
    async close() {
      signal.removeEventListener('abort', interrupted);
      for (const id of children.keys()) { try { ctx.subagents.interrupt(id, { kind: 'ancestor', agent: parent }); } catch {} }
      for (const actor of actors.values()) actor.pending?.result.reject(Error('Workflow closed.'));
      await Promise.allSettled([...actors.values()].map(a => a.tail));
      await drainChildren(ctx, parent, [...children.keys()]);
      for (const actor of actors.values()) actor.toolDispose?.();
      for (const dispose of disposers.reverse()) dispose();
      continuity?.dispose();
    },
  };
}
