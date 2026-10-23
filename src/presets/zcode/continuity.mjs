import { randomUUID } from 'node:crypto';
import { actorPersona } from '../../host/subagents.mjs';
import { ToolCallRecovery } from '@deepseek-ai/dsh-session';

export const CONTINUITY_PROVIDER_PREFIX = 'omaa-zcode-continuity-';

export class ActorCarryUnavailable extends Error {
  constructor(message) { super(message); this.name = 'ActorCarryUnavailable'; }
}

function validateAcceptedTail(events, inheritedEventCount, messageId) {
  const recovery = new ToolCallRecovery();
  const inbox = { 'next-turn': [], 'next-step': [] };
  let turn, step, admittedTurn, admittedCount = 0, acceptedEnd, lastEnd;
  const unavailable = () => { throw new ActorCarryUnavailable('Accepted Actor work has no balanced, admitted native cancellation boundary.'); };
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.seq !== index) unavailable();
    if (event.type === 'agent/inbox/spliced') {
      // Exact pinned native inbox projection semantics, retaining identities
      // only. A drained source must not transfer unrelated queued input.
      const { target, start, inserted } = event.data, removedCount = event.data.removedCount ?? 0;
      const queue = inbox[target];
      if (!queue || !Number.isSafeInteger(start) || start < 0 || start > queue.length
        || !Number.isSafeInteger(removedCount) || removedCount < 0 || start + removedCount > queue.length
        || !Array.isArray(inserted) || inserted.some(message => typeof message.id !== 'string')) unavailable();
      queue.splice(start, removedCount, ...inserted.map(message => message.id));
      const ids = [...inbox['next-turn'], ...inbox['next-step']];
      if (new Set(ids).size !== ids.length) unavailable();
    }
    if (event.type === 'turn/start') {
      if (turn !== undefined || step !== undefined) unavailable();
      turn = event.data.turn;
    } else if (event.type === 'step/start') {
      if (turn !== event.data.turn || step !== undefined) unavailable();
      step = event.data.step;
    } else if (event.type === 'step/end') {
      if (turn !== event.data.turn || step !== event.data.step || recovery.results().length) unavailable();
      step = undefined;
    } else if (event.type === 'turn/end') {
      if (turn !== event.data.turn || step !== undefined || recovery.results().length) unavailable();
      lastEnd = event;
      if (turn === admittedTurn) acceptedEnd = event;
      turn = undefined;
    } else if (event.type === 'user/message' && event.surfaceOp === 'append'
      && event.seq >= inheritedEventCount && (event.data.message ?? event.data).id === messageId) {
      if (turn === undefined || step === undefined) unavailable();
      admittedTurn = turn; admittedCount++;
    }
    // Validate pending native tool requests before their closing boundaries;
    // native recovery owns any missing results, and this reader writes none.
    recovery.observe(event);
  }
  if (turn !== undefined || step !== undefined || recovery.results().length || inbox['next-turn'].length || inbox['next-step'].length
    || admittedCount !== 1 || acceptedEnd !== lastEnd
    || acceptedEnd?.data.reason?.kind !== 'aborted'
    || !['parent', 'user'].includes(acceptedEnd.data.reason.reason?.kind)) unavailable();
}

export async function readActorContinuation(ctx, parent, source, signal, options = {}) {
  signal.throwIfAborted();
  if (typeof source.sessionId !== 'string' || !options.acceptedMessageId
    && (!Number.isSafeInteger(source.eventCount) || source.eventCount < 1))
    throw Error('Actor continuity requires an exact completed task boundary.');
  const observation = await ctx.get('sessionQuery').observeSession(source.sessionId, { signal });
  try {
    if (observation.header.origin !== 'subagent' || observation.header.parentSession !== parent.id)
      throw Error('Actor transcript does not belong to the workflow parent.');
    // A successor's own descriptor follows its inherited seed. An earlier
    // completed cut may lie inside that seed; authenticate the source's own
    // descriptor independently so repeated amendment can shorten the prefix.
    const descriptor = observation.events.slice(observation.inheritedEventCount)
      .find(event => event.type === 'subagent/descriptor')?.data;
    if (!descriptor || descriptor.mode !== 'continuable' || !descriptor.label?.startsWith('ZCode Actor · ')
      || descriptor.provider !== 'spawn' && !descriptor.provider?.startsWith(CONTINUITY_PROVIDER_PREFIX)
      || actorPersona(observation.events.slice(observation.inheritedEventCount)) !== source.persona) throw Error('The source is not the requested native ZCode Actor persona.');
    const eventCount = options.acceptedMessageId ? observation.events.length : source.eventCount;
    if (options.acceptedMessageId) {
      if (source.eventCount !== undefined && source.eventCount !== eventCount)
        throw new ActorCarryUnavailable('The settled Actor carry source changed before successor activation.');
      validateAcceptedTail(observation.events, observation.inheritedEventCount, options.acceptedMessageId);
    }
    for (const count of options.eventCounts ?? (options.acceptedMessageId ? [] : [eventCount])) {
      const boundary = observation.events[count - 1];
      if (!Number.isSafeInteger(count) || count < 1 || count > eventCount || boundary?.type !== 'turn/end'
        || boundary.data.reason?.kind !== 'completed') throw Error('Actor continuity requires an exact completed task boundary.');
    }
    signal.throwIfAborted();
    const nativeModel = typeof descriptor.agentProvider === 'string' && typeof descriptor.agentModel === 'string'
      ? { provider: descriptor.agentProvider, model: descriptor.agentModel,
        ...(descriptor.agentReasoningEffort === undefined ? {} : { reasoningEffort: descriptor.agentReasoningEffort }) } : undefined;
    return { ...(options.includeEvents === false ? {} : { events: structuredClone(observation.events.slice(0, eventCount)) }), nativeModel, eventCount };
  } finally { observation[Symbol.dispose](); }
}

export async function readActorPrefix(ctx, parent, source, signal) {
  return (await readActorContinuation(ctx, parent, source, signal)).events;
}

export async function readAcceptedActorContinuation(ctx, parent, source, signal, options = {}) {
  if (typeof source.messageId !== 'string' || !source.messageId) throw new ActorCarryUnavailable('The accepted Actor message identity is missing.');
  return readActorContinuation(ctx, parent, source, signal, { ...options, acceptedMessageId: source.messageId });
}

// The native manager owns the new descriptor, parent catalog, current policy,
// activation and subsequent cold restoration. This provider supplies only an
// exact completed prefix, or an explicitly validated settled aborted task,
// from an authorized prior Actor. The new task is a fresh native admission.
export function createActorContinuity(ctx, parent) {
  const sources = new Map(), name = CONTINUITY_PROVIDER_PREFIX + randomUUID();
  const spawn = ctx.subagents.getProvider('spawn');
  if (!spawn?.prepareContinuable || !ctx.get('sessionQuery')?.observeSession) throw Error('Native Actor continuity services are unavailable.');
  const provider = { ...spawn, name,
    async prepareContinuable(request) {
      const source = sources.get(request.sessionId);
      if (!source) return spawn.prepareContinuable(request);
      if (request.parent !== parent || source.parentSessionId !== parent.id) throw Error('Actor continuity parent changed.');
      if (source.allowAborted) {
        const seed = await readAcceptedActorContinuation(ctx, parent, source, request.signal, { eventCounts: source.completedEventCounts });
        if (source.isCarryOpen && !source.isCarryOpen()) {
          if (!source.completedFallbackCount) throw new ActorCarryUnavailable('The Actor import window closed before any completed prefix could be seeded.');
          return { seed: seed.events.slice(0, source.completedFallbackCount) };
        }
        return { seed: seed.events };
      }
      return { seed: await readActorPrefix(ctx, parent, source, request.signal) };
    },
  };
  const dispose = ctx.subagents.registerProvider(provider);
  return {
    name,
    attach(childId, source) {
      if (sources.has(childId)) throw Error('Actor continuity identity already reserved.');
      sources.set(childId, Object.freeze({ ...source, parentSessionId: parent.id }));
      return () => sources.delete(childId);
    },
    dispose() { sources.clear(); dispose(); },
  };
}
