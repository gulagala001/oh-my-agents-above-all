import { buildWorkflowActorPrompt } from './prompt.mjs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validate, formatViolations } from '../../../lib/zcode-workflow-validate.mjs';
import { CONTINUITY_PROVIDER_PREFIX, createActorContinuity } from './continuity.mjs';
import { inputHash } from '../../../lib/zcode-import-cache.mjs';
import { startActivation, drainChildren, actorPersona } from '../../host/subagents.mjs';
import { ensureDirectory } from '../../host/working-directory.mjs';
import { createAskReceipt, observeAskEvent, askReceiptOutcome } from './ask-receipt.mjs';
import { ESCALATE_PARAMETERS, ESCALATE_OUTPUT, ESCALATE_DESCRIPTION, renderEscalateResult } from './questions.mjs';

const textOf = parts => (parts ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const copy = value => structuredClone(value);
export const ZCODE_ACTOR_LABEL_PREFIX = 'ZCode Actor · ';
const nativeObservations = new Set(['read', 'glob', 'grep', 'read_image', 'skill', 'todo_read', 'read_pdf']);
const completedDeliveryMessage = 'Native Actor has completed, but its result delivery or settlement failed; do not retry the completed task.';

export function installLiteralActorPersona(ctx) {
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next();
    const session = context.agent?.session;
    const events = session?.snapshotEvents(session.inheritedEventCount) ?? [];
    const descriptor = events.find(event => event.type === 'subagent/descriptor')?.data;
    const persona = actorPersona(events);
    if (descriptor?.mode !== 'continuable' || descriptor.provider !== 'spawn' && !descriptor.provider?.startsWith(CONTINUITY_PROVIDER_PREFIX)
      || !descriptor.label?.startsWith(ZCODE_ACTOR_LABEL_PREFIX) || typeof persona !== 'string') return assembly;
    // Both the legacy native descriptor and the new plugin record retain the
    // literal persona across cold activation and exact completed-prefix reuse.
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'deployment:persona-prefix'
      ? { ...section, text: buildWorkflowActorPrompt({ persona, tools: new Set(context.agent.ctx.get('tools').schemas(context.agent).map(tool => tool.name)),
          cwd: context.agent.session.header.cwd, platform: process.platform, mode: ctx.omaa.modeFor(context.agent.session, context.agent),
          outputStyle: ctx.omaa.preferences(context.agent.session).outputStyle }), interpolate: false } : section) };
  }, { global: true });
}

// Only orchestration lives here. Native continuable children own their model,
// permission checks, tools, inbox, transcript, idle state and cold activation.
export function createActors({ ctx, parent, sites, askSpecs, signal, progress, runProgress, cache, imported, replay = false, concurrency, directories, modelBindings, subagentModel, questions }) {
  const directory = directories ? directories.then(value => value.cwd) : ensureDirectory(ctx, parent, signal);
  void directory.catch(() => {});
  const actors = new Map(), children = new Map(), disposers = [], staged = new WeakMap();
  const replayNodes = new Map();
  const continuity = imported || replay ? createActorContinuity(ctx, parent) : undefined;
  const actorSites = new Set(sites.actors.map(site => site.id));
  if (!ctx.subagents.getProvider('spawn')?.prepareContinuable) throw Error('Native continuable spawn provider is unavailable.');
  const check = () => signal.throwIfAborted();
  function publishProgress(p) {
    if (p.progressFailure || !p.node?.progress || p.messageId === undefined) return;
    const turn = p.receipt.admitted.get(p.messageId), claimed = p.receipt.claimed.get(p.messageId);
    if (turn === undefined || claimed !== undefined && claimed !== turn) return;
    const observed = p.progressTurns.get(turn);
    if (!observed || observed.revision === p.progressRevision) return;
    p.progressRevision = observed.revision;
    const snapshot = { ...observed };
    p.progressTail = p.progressTail.then(() => {
      if (!p.progressFailure) return p.node.progress(snapshot.turn, snapshot.toolCalls, snapshot.lastTool);
    }).catch(error => {
      p.progressFailure ??= Object.assign(Error('Native Actor progress could not be persisted; establish the accepted task outcome before continuation.',
        { cause: error }), { code: 'uncertain_effect' });
      p.result.reject(p.progressFailure);
    });
  }
  const progressFor = (p, turn) => {
    let observed = p.progressTurns.get(turn);
    if (!observed) { observed = { revision: 0, toolCalls: 0 }; p.progressTurns.set(turn, observed); }
    return observed;
  };
  function observeProgress(p, event) {
    if (event.type === 'tool/call') p.callTurns.set(event.data.callId, event.data.turn);
    if (event.type === 'turn/end' && event.data.reason?.kind === 'completed') {
      // Native repair/model steps share one task turn. This adapter does not
      // start the original driver's nudge turns; never relabel steps as turns.
      const observed = progressFor(p, event.data.turn);
      observed.turn = 1; observed.revision++;
    }
    publishProgress(p);
  }
  function dispatchedProgress(p, exec) {
    const turn = p.callTurns.get(exec.rootCallId ?? exec.callId);
    if (turn === undefined || p.progressTokens.has(exec.token)) return;
    p.progressTokens.add(exec.token);
    const observed = progressFor(p, turn);
    observed.toolCalls++; observed.lastTool = { name: exec.name.slice(0, 64) }; observed.revision++;
    publishProgress(p);
  }
  function install(agent, actor) {
    if (actor.agent === agent && actor.toolPending === actor.pending) return;
    actor.toolDispose?.(); actor.toolDispose = undefined; actor.agent = agent; actor.toolPending = actor.pending;
    const pending = actor.pending;
    if (!pending) return;
    const tools = agent.ctx.get('tools'), registrations = [];
    actor.toolDispose = () => {
      const errors = [];
      for (const dispose of registrations.splice(0).reverse()) {
        try { dispose(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Native Actor tools could not all be disposed.');
    };
    try {
      if (questions) {
        if (tools.get('escalate', agent)) throw Error('The native child already owns escalate.');
        registrations.push(tools.register({
          name: 'escalate', description: ESCALATE_DESCRIPTION, parameters: ESCALATE_PARAMETERS,
          output: { schema: ESCALATE_OUTPUT, render: renderEscalateResult },
          async execute(args, exec) {
            check(); exec.signal.throwIfAborted();
            return questions.escalate({ task: pending, actor: actor.reference, actorSeq: pending.actorSeq,
              childId: actor.childId, toolCallId: exec.callId, question: args.question, ...(args.context === undefined ? {} : { context: args.context }),
              signal: exec.signal, isActive: () => actor.pending === pending && !pending.finished });
          },
        }));
      }
      if (!pending.spec.typed) return;
      if (tools.get('submit_result', agent)) throw Error('The native child already owns submit_result.');
      registrations.push(tools.register({
        name: 'submit_result',
        description: 'Submit the final result for this task. The value must match this JSON schema: ' + JSON.stringify(pending.spec.schema),
        parameters: { type: 'object', properties: { value: {} }, required: ['value'], additionalProperties: false },
        output: { schema: { type: 'object', properties: { recorded: { type: 'boolean' } }, required: ['recorded'], additionalProperties: false },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, exec) {
          check(); exec.signal.throwIfAborted();
          const turn = pending.receipt.currentTurn;
          if (actor.pending !== pending || pending.finished || turn === undefined || pending.reservations.has(turn) || pending.submissions.has(turn)) throw Error('This typed task is no longer accepting a result.');
          const violations = validate(pending.spec.schema, args.value);
          if (violations.length) throw Error(formatViolations(violations));
          // Execution alone is not commitment: result hooks and enclosing PTC
          // calls can still reject. Commit only authoritative successful results.
          const submission = { actor, pending, turn, value: copy(args.value) };
          pending.reservations.set(turn, submission); staged.set(exec, submission);
          exec.concludeTurn();
          return { recorded: true };
        },
      }));
    } catch (error) { actor.toolDispose(); actor.toolDispose = undefined; throw error; }
  }
  function finish(actor) {
    const p = actor.pending;
    if (!p || p.finished) return;
    const outcome = askReceiptOutcome(p.receipt, p.messageId);
    if (!outcome) return;
    p.finished = true;
    questions?.cancelAsk(p, outcome.error ?? Error('The native ask completed before the main agent answered.'));
    if (outcome.error) {
      const admitted = p.receipt.admitted.get(p.messageId), claimed = p.receipt.claimed.get(p.messageId);
      const terminal = p.receipt.turns.get(admitted ?? claimed)?.end;
      // A known discarded input or this exact task's committed failed turn is
      // a task failure. Contradictory/missing admission is infrastructure loss.
      if (p.receipt.discarded.has(p.messageId) || terminal && terminal.reason?.kind !== 'completed'
        && (admitted === undefined || claimed === undefined || admitted === claimed)) p.nativeTaskError = outcome.error;
      p.result.reject(outcome.error); return;
    }
    p.eventCount = outcome.eventCount;
    if (p.spec.typed) {
      const submitted = p.submissions.get(outcome.turn);
      if (submitted === undefined) {
        p.nativeTaskError = Error('Native actor completed without a committed submit_result.');
        p.result.reject(p.nativeTaskError);
      }
      else p.result.resolve(submitted.value);
    } else if (!outcome.text) {
      p.nativeTaskError = Error('Native actor completed without final assistant text.');
      p.result.reject(p.nativeTaskError);
    }
    else p.result.resolve(outcome.text);
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
        else p.submissions.set(direct.turn, direct);
      } else if (p.reservations.get(direct.turn) === direct) p.reservations.delete(direct.turn);
    }
    const enclosed = p.enclosed.get(exec.token);
    if (enclosed) {
      p.enclosed.delete(exec.token);
      if (!result.isError) {
        if (exec.parent) p.enclosed.set(exec.parent, enclosed);
        else p.submissions.set(enclosed.turn, enclosed);
      } else if (p.reservations.get(enclosed.turn) === enclosed) p.reservations.delete(enclosed.turn);
    }
  }, { global: true }));
  disposers.push(ctx.on('tools/execute', async (exec, next) => {
    const actor = exec.agent && children.get(exec.agent.id), p = actor?.pending;
    if (!p || p.finished) return next();
    // This public hook sees allowed dispatches, unlike pre-approval tool/call
    // records. Count protocol tools too; keep cache-effect accounting separate.
    dispatchedProgress(p, exec);
    if (exec.name === 'submit_result' || exec.name === 'escalate') return next();
    // The native parent-coordination message is not a workspace tool. Other
    // calls are counted at dispatch, including failed/denied bodies; native
    // exposes no authoritative post-approval world-effect classification.
    const target = exec.arguments?.agent_id;
    if (exec.name === 'send_message' && target === parent.id) return next();
    if (exec.name === 'respond_to_coordinator' && exec.agent.session.header.parentSession === parent.id) return next();
    p.worldToolCalls++;
    if (!nativeObservations.has(exec.name)) await cache?.close('unclassified-native-tool', { actorName: actor.reference.name, tool: exec.name });
    return next();
  }, { global: true }));
  disposers.push(ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const actor = children.get(agent.id), p = actor?.pending;
    if (!p || p.finished) return;
    p.receipt.claimed.set(message.id, turn); publishProgress(p); finish(actor);
  }, { global: true }));
  disposers.push(ctx.on('agent/inbox/discarded', ({ agent, message }) => {
    const actor = children.get(agent.id), p = actor?.pending;
    if (!p || p.finished) return;
    p.receipt.discarded.add(message.id); finish(actor);
  }, { global: true }));
  disposers.push(ctx.on('session/event', (session, event) => {
    const actor = children.get(session.id), p = actor?.pending;
    if (!p || p.finished) return;
    observeAskEvent(p.receipt, event, textOf);
    observeProgress(p, event);
    finish(actor);
  }, { global: true }));
  const interrupted = () => {
    for (const id of children.keys()) {
      try { ctx.subagents.interrupt(id, { kind: 'ancestor', agent: parent }); } catch {}
    }
    for (const actor of actors.values()) {
      if (actor.pending) questions?.cancelAsk(actor.pending, signal.reason);
      actor.pending?.result.reject(signal.reason ?? Error('Workflow canceled.'));
    }
  };
  signal.addEventListener('abort', interrupted, { once: true });
  function actorFor(reference) {
    check();
    if (!reference || typeof reference.handle !== 'string' || !actorSites.has(reference.siteId)
      || !Number.isInteger(reference.ordinal) || reference.ordinal < 1 || reference.name !== null && typeof reference.name !== 'string') throw Error('Invalid compiled Actor reference.');
    const persona = reference.persona;
    if (persona !== null && typeof persona !== 'string' && (!persona || Array.isArray(persona)
      || Object.keys(persona).some(key => !['system', 'model'].includes(key))
      || persona.system !== undefined && typeof persona.system !== 'string'
      || persona.model !== undefined && typeof persona.model !== 'string')) throw Error('Invalid Actor persona.');
    if (persona && typeof persona === 'object' && persona.model !== undefined && !modelBindings?.has(persona.model))
      throw Error('Actor model was not resolved at launch: ' + persona.model);
    let actor = actors.get(reference.handle);
    if (actor) { if (!isDeepStrictEqual(reference, actor.reference)) throw Error('An Actor identity cannot be changed.'); return actor; }
    if (reference.name && [...actors.values()].some(a => a.reference.name === reference.name)) throw Error('Duplicate Actor name: ' + reference.name);
    actor = { reference: copy(reference), childId: randomUUID(), created: false, tail: Promise.resolve(), pending: undefined, agent: undefined,
      seq: 0, imported: cache?.attachActor(reference) };
    actors.set(reference.handle, actor); children.set(actor.childId, actor);
    return actor;
  }
  return {
    updatePrepared(next) {
      sites = next.sites; askSpecs = next.askSpecs;
      actorSites.clear(); for (const site of sites.actors) actorSites.add(site.id);
    },
    view: () => [...actors.values()].map(actor => ({ name: actor.reference.name, childId: actor.childId, created: actor.created })),
    async declare(reference) {
      const actor = actorFor(reference);
      if (!actor.declared) { await cache?.declareActor(reference); actor.declared = true; }
      await runProgress?.created(reference, actor.childId);
    },
    async replayAsk(node, meta) {
      check();
      const reference = meta.args?.actor, instructions = meta.args?.instructions, actor = actorFor(reference);
      if (!replay || typeof instructions !== 'string' || actor.seq !== meta.actor?.seq)
        throw Object.assign(Error('Native Actor replay admission order or input changed.'), { code: 'uncertain_effect' });
      const seq = actor.seq++;
      const observation = runProgress?.node(meta.siteId, 'ask', {
        actor: runProgress.actor(reference, actor.childId), phaseName: meta.phaseName, instructions });
      observation?.catch(() => {});
      replayNodes.set(JSON.stringify([reference.handle, seq]), observation);
      const work = actor.tail.then(async () => {
        const context = await cache.replayActorAsk(reference, seq, instructions, node);
        actor.replaySource = context.source; actor.replayNativeAgentOptions = context.nativeAgentOptions;
        actor.replayBlocked ||= context.blocked;
      });
      actor.tail = work.catch(error => { actor.replayBlocked = true; actor.replayError = error; });
      return work;
    },
    async settleReplayAsk({ actor: reference, actorSeq }, error) {
      const key = JSON.stringify([reference.handle, actorSeq]), observation = replayNodes.get(key);
      replayNodes.delete(key);
      const node = await observation;
      const actor = actors.get(reference.handle);
      await node?.settled(error, { cached: true, ...(actor?.replaySource?.sourceSessionId === undefined ? {}
        : { sourceSessionId: actor.replaySource.sourceSessionId }) });
    },
    async ask({ siteId, actor: reference, instructions, phaseName, actorSeq }, journalContext) {
      check();
      if (typeof instructions !== 'string' || !askSpecs.has(siteId)) throw Error('Invalid compiled ask.');
      const actor = actorFor(reference), spec = askSpecs.get(siteId);
      const seq = actor.seq;
      if (actorSeq !== undefined && actorSeq !== seq) throw Object.assign(Error('Native Actor ask sequence changed.'), { code: 'uncertain_effect' });
      actor.seq++;
      const candidate = actor.imported?.candidate.entries[seq];
      if (candidate && (spec.typed ? validate(spec.schema, candidate.result).length !== 0 : typeof candidate.result !== 'string'))
        actor.imported.reconcileRecorded(seq, inputHash(instructions), true, false);
      const cached = cache?.takeActor(actor.imported, seq, instructions);
      const observation = runProgress?.node(siteId, 'ask', {
        actor: runProgress.actor(reference, actor.childId), phaseName, instructions });
      observation?.catch(() => {});
      const work = actor.tail.then(async () => {
        if (actor.replayBlocked) throw actor.replayError ?? Object.assign(Error('A failed replayed Actor prefix cannot dispatch new work.'), { code: 'uncertain_effect' });
        cache?.assertActorLive(reference);
        const node = await observation;
        if (cached) {
          check();
          try {
            await cache.actorResult(reference, seq, instructions, cached.result,
              { sessionId: actor.imported.candidate.transcriptSourceSessionId, eventCount: cached.messageBoundary }, cached.stats, true);
            await node?.settled(undefined, { cached: true, sourceSessionId: actor.imported.candidate.transcriptSourceSessionId });
          }
          catch (error) {
            const failure = Object.assign(Error(completedDeliveryMessage, { cause: error }), { code: 'uncertain_effect' });
            actor.replayBlocked = true; actor.replayError = failure;
            throw failure;
          }
          return copy(cached.result);
        }
        const result = Promise.withResolvers();
        result.promise.catch(() => {});
        // A synchronous delivery may start/finish before its RPC returns. Keep
        // actual message IDs and terminal events, then correlate after receipt.
        const pending = { spec, actorSeq: seq, result, receipt: createAskReceipt(), enclosed: new Map(), reservations: new Map(), submissions: new Map(), finished: false, node, worldToolCalls: 0,
          callTurns: new Map(), progressTurns: new Map(), progressTokens: new Set(), progressTail: Promise.resolve(), progressRevision: -1 };
        actor.pending = pending;
        const instructionsWithResult = spec.typed ? instructions + '\n\nReturn the final value by calling submit_result; its declared schema is the required task result.' : instructions;
        const prompt = [{ type: 'text', text: instructionsWithResult }];
        progress?.({ type: 'actor-start', siteId, name: reference.name, childId: actor.childId });
        let release, completedContextCommitted = false, primaryFailure, hasPrimaryFailure = false;
        const cleanupFailures = [];
        const attemptCleanup = async (stage, action) => {
          try { await action(); }
          catch (error) { cleanupFailures.push(Object.assign(Error('Native Actor cleanup failed: ' + stage, { cause: error }), { stage })); }
        };
        try {
          check();
          release = await concurrency?.acquire(); check();
          await node?.dispatched();
          if (!actor.created) {
            const cwd = await directory; check();
            const persona = typeof reference.persona === 'string' ? reference.persona : reference.persona?.system;
            const seed = actor.replaySource ?? cache?.actorSeed(actor.imported, seq);
            pending.carriedContext = seed?.allowAborted === true;
            const agentOptions = typeof reference.persona === 'object' && reference.persona?.model !== undefined
              ? modelBindings.get(reference.persona.model) : subagentModel?.options ?? (seed ? actor.replayNativeAgentOptions ?? actor.imported?.candidate.nativeAgentOptions : undefined);
            const detach = seed && continuity.attach(actor.childId, { sessionId: seed.sourceSessionId, eventCount: seed.messageCount, persona,
              ...(seed.allowAborted ? { allowAborted: true, messageId: seed.messageId, completedEventCounts: seed.completedEventCounts,
                completedFallbackCount: seed.completedFallbackCount, isCarryOpen: seed.isCarryOpen } : {}) });
            let receipt;
            // This wrapper can reject after native inbox admission but before
            // returning its ID (fixed manager.submitMaterialized). It can also
            // fail in host option inheritance before native admission; absent
            // a returned receipt we conservatively leave delivery unconfirmed.
            pending.deliveryAttempted = true;
            try { receipt = await startActivation(ctx, { provider: seed ? continuity.name : 'spawn', label: ZCODE_ACTOR_LABEL_PREFIX + (reference.name || 'Actor'), childId: actor.childId, delivery: 'caller',
              request: { parent, prompt, ...(cwd === undefined ? {} : { cwd }), ...(persona === undefined ? {} : { persona }),
                ...(agentOptions === undefined ? {} : { agentOptions }) }, signal });
              // Retain acceptance before detach: even a local provider cleanup
              // failure cannot erase an already returned native receipt.
              actor.created = true; pending.accepted = true; pending.messageId = receipt.messageId;
              // The a2 result settles after native teardown. Propagate its
              // infrastructure rejection without leaving the ask hung.
              receipt.result?.catch(error => pending.result.reject(error));
            }
            finally { detach?.(); }
          } else {
            const agent = ctx.get('agents')?.get(actor.childId); if (agent) install(agent, actor);
            pending.deliveryAttempted = true;
            pending.messageId = await ctx.subagents.sendMessage(parent, actor.childId, prompt, { signal });
            pending.accepted = true;
          }
          // Acceptance is a durable identity fact, not a completed result.
          // Persist even if cancellation raced the native receipt's return.
          const acceptedRef = await cache?.actorAccepted(reference, seq, instructions, { sessionId: actor.childId, messageId: pending.messageId });
          if (journalContext?.updateRunning) {
            if (!acceptedRef) throw Object.assign(Error('Accepted Actor work has no durable native replay identity.'), { code: 'uncertain_effect' });
            await journalContext.updateRunning(acceptedRef);
          }
          await node?.materialized();
          publishProgress(pending);
          finish(actor);
          const value = await result.promise;
          const agent = ctx.get('agents')?.get(actor.childId);
          if (agent) await agent.whenIdle(signal);
          await pending.progressTail;
          if (pending.progressFailure) throw pending.progressFailure;
          if (!Number.isSafeInteger(pending.eventCount)) throw Error('The native completed task boundary is missing.');
          await cache?.actorResult(reference, seq, instructions, value, { sessionId: actor.childId, eventCount: pending.eventCount },
            { ...(pending.carriedContext ? {} : { worldToolCalls: pending.worldToolCalls }),
              observation: pending.carriedContext ? 'native-tool-dispatch-with-carried-context' : 'native-tool-dispatch' }, false);
          completedContextCommitted = true;
          // The native continuation manager decides when an idle activation
          // can be released. Do not kill an actor's background work merely to
          // force cold activation for its next question.
          progress?.({ type: 'actor-end', siteId, name: reference.name, childId: actor.childId });
          await node?.settled();
          return value;
        } catch (error) {
          await pending.progressTail;
          if (pending.progressFailure && error !== pending.progressFailure)
            error = Object.assign(new AggregateError([error, pending.progressFailure], 'Native Actor task and progress persistence both failed.'), { code: 'uncertain_effect' });
          const uncertain = !completedContextCommitted && (pending.worldToolCalls > 0
            || pending.deliveryAttempted && !(Object.hasOwn(pending, 'nativeTaskError') && error === pending.nativeTaskError));
          const failure = completedContextCommitted
            ? Object.assign(Error(completedDeliveryMessage, { cause: error }), { code: 'uncertain_effect' }) : uncertain
            ? Object.assign(Error('Native Actor delivery or execution has no authoritative outcome; establish its actual outcome before continuation.'),
              { code: 'uncertain_effect', cause: error }) : error;
          primaryFailure = failure; hasPrimaryFailure = true;
          if (uncertain || completedContextCommitted) {
            // Block this Actor immediately, before awaiting any diagnostic or
            // persistence cleanup. The journal will stop the whole driver.
            actor.replayBlocked = true; actor.replayError = failure;
          }
          if (uncertain) {
            await attemptCleanup('interrupt', () => ctx.subagents.interrupt(actor.childId, { kind: 'ancestor', agent: parent }));
          }
          if (!completedContextCommitted) await attemptCleanup('cache', () => cache?.stopActor(reference, seq));
          await attemptCleanup('progress', () => node?.settled(failure));
          throw failure;
        } finally {
          await attemptCleanup('questions', () => questions?.cancelAsk(pending, signal.reason ?? Error('The native ask is no longer in flight.')));
          await attemptCleanup('concurrency', () => release?.());
          if (actor.pending === pending) actor.pending = undefined;
          await attemptCleanup('tools', () => actor.toolDispose?.());
          actor.toolDispose = undefined; actor.toolPending = undefined;
          if (cleanupFailures.length) {
            const failure = new AggregateError(hasPrimaryFailure ? [primaryFailure, ...cleanupFailures] : cleanupFailures,
              !hasPrimaryFailure && completedContextCommitted ? completedDeliveryMessage : 'Native Actor task cleanup did not fully settle.',
              { cause: hasPrimaryFailure ? primaryFailure : cleanupFailures[0] });
            if (hasPrimaryFailure && typeof primaryFailure?.code === 'string') failure.code = primaryFailure.code;
            else if (completedContextCommitted) failure.code = 'uncertain_effect';
            if (failure.code === 'uncertain_effect') { actor.replayBlocked = true; actor.replayError = failure; }
            throw failure;
          }
        }
      });
      actor.tail = work.then(() => {}, () => {});
      return work;
    },
    async close({ persistDrain = true } = {}) {
      const errors = [];
      const attempt = async action => {
        try { await action(); return true; }
        catch (error) { errors.push(error); return false; }
      };
      signal.removeEventListener('abort', interrupted);
      for (const id of children.keys()) { try { ctx.subagents.interrupt(id, { kind: 'ancestor', agent: parent }); } catch {} }
      for (const actor of actors.values()) {
        try { if (actor.pending) questions?.cancelAsk(actor.pending, Error('Workflow closed.')); }
        catch (error) { errors.push(error); }
        actor.pending?.result.reject(Error('Workflow closed.'));
      }
      await Promise.allSettled([...actors.values()].map(a => a.tail));
      const drained = await attempt(() => drainChildren(ctx, parent, [...children.keys()]));
      // Releasing local hooks must not depend on native drain or persistence
      // succeeding. A failed drain never earns a durable successful marker.
      if (drained && persistDrain) await attempt(() => cache?.actorsDrained());
      for (const actor of actors.values()) await attempt(() => actor.toolDispose?.());
      for (const dispose of disposers.splice(0).reverse()) await attempt(dispose);
      await attempt(() => continuity?.dispose());
      if (errors.length) throw new AggregateError(errors, 'Native Actor shutdown did not fully settle.');
    },
  };
}
