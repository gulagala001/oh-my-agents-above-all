import { randomUUID } from 'node:crypto';

export const CONTINUITY_PROVIDER_PREFIX = 'omaa-zcode-continuity-';

export async function readActorPrefix(ctx, parent, source, signal) {
  signal.throwIfAborted();
  const observation = await ctx.get('sessionQuery').observeSession(source.sessionId, { signal });
  try {
    if (observation.header.origin !== 'subagent' || observation.header.parentSession !== parent.id)
      throw Error('Actor transcript does not belong to the workflow parent.');
    const descriptor = observation.events.slice(observation.inheritedEventCount)
      .find(event => event.type === 'subagent/descriptor')?.data;
    if (!descriptor || descriptor.mode !== 'continuable' || !descriptor.label?.startsWith('ZCode Actor · ')
      || descriptor.persona !== source.persona) throw Error('The source is not the requested native ZCode Actor persona.');
    const boundary = observation.events[source.eventCount - 1];
    if (!Number.isSafeInteger(source.eventCount) || source.eventCount < 1 || boundary?.type !== 'turn/end'
      || boundary.data.reason?.kind !== 'completed') throw Error('Actor continuity requires an exact completed task boundary.');
    signal.throwIfAborted();
    return observation.events.slice(0, source.eventCount);
  } finally { observation[Symbol.dispose](); }
}

// The native manager owns the new descriptor, parent catalog, current policy,
// activation and subsequent cold restoration. This provider supplies only an
// exact completed prefix from an authorized prior Actor, never a text summary.
export function createActorContinuity(ctx, parent) {
  const sources = new Map(), name = CONTINUITY_PROVIDER_PREFIX + randomUUID();
  const spawn = ctx.subagents.getProvider('spawn');
  if (!spawn?.prepareContinuable || !ctx.get('sessionQuery')?.observeSession) throw Error('Native Actor continuity services are unavailable.');
  const provider = { ...spawn, name,
    async prepareContinuable(request) {
      const source = sources.get(request.sessionId);
      if (!source) return spawn.prepareContinuable(request);
      if (request.parent !== parent || source.parentSessionId !== parent.id) throw Error('Actor continuity parent changed.');
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
