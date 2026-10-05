import { inputHash, normalizePersona, matchImportedActor, ImportedWorldQueue } from '../../../lib/zcode-import-cache.mjs';
import { readActorPrefix } from './continuity.mjs';

// Results and exact native event offsets are execution facts, independent of
// the bounded workflow UI. Large values stay in native immutable attachments.
export const RUN_CACHE_VERSION = 1;
export const actorPersona = reference => normalizePersona(reference.name || undefined, reference.persona ?? undefined);

export async function importCompletedRun({ ctx, parent, store, record, signal }) {
  if (record.execution?.version !== RUN_CACHE_VERSION || typeof record.execution.script !== 'string')
    throw Error('This workflow predates durable task-prefix caching; create a new workflow before amending it.');
  const actors = new Map(), world = new Map();
  for (const actor of record.execution.actors) {
    if (!actor.persona.name || actors.has(actor.persona.name)) continue;
    const entries = [];
    for (const row of actor.entries) {
      if (row.actorSeq !== entries.length || !row.resultRef || !Number.isSafeInteger(row.messageBoundary))
        throw Error('The completed Actor cache prefix is incomplete.');
      entries.push({ inputHash: row.inputHash, result: await store.readItem(row.resultRef, signal),
        messageBoundary: row.messageBoundary, stats: row.stats });
    }
    if (!entries.length) continue;
    // Validate authorization and the exact cut before altering the predecessor.
    await readActorPrefix(ctx, parent, { sessionId: actor.transcriptSourceSessionId,
      eventCount: entries.at(-1).messageBoundary, persona: actor.persona.system }, signal);
    actors.set(actor.persona.name, { persona: actor.persona, entries,
      transcriptSourceSessionId: actor.transcriptSourceSessionId });
  }
  for (const row of [...record.execution.world].sort((a, b) => a.ordinal - b.ordinal)) {
    const entries = world.get(row.inputHash) ?? [];
    entries.push({ result: await store.readItem(row.resultRef, signal) }); world.set(row.inputHash, entries);
  }
  return { actors, world };
}

export function createRunCache({ store, parent, runId, imported }) {
  const world = new ImportedWorldQueue(imported?.world ?? new Map());
  const blocked = new Set();
  let closed = false, closure, worldOrdinal = 0;
  const mutate = fn => store.mutate(parent.id, runId, record => fn(record.execution));
  return {
    attachActor: reference => matchImportedActor(imported, actorPersona(reference)),
    async declareActor(reference) {
      await mutate(facts => { facts.actors.push({ handle: reference.handle, persona: actorPersona(reference), entries: [] }); });
    },
    takeActor(actor, seq, instructions) {
      return closed ? actor?.takeIfPure(seq, inputHash(instructions)) : actor?.take(seq, inputHash(instructions));
    },
    admitWorld(op, args) { return { ordinal: ++worldOrdinal, cached: closed ? undefined : world.take(inputHash({ op, args })) }; },
    close(cause, detail) {
      if (closed) return closure ?? Promise.resolve();
      closed = true;
      closure = mutate(facts => { facts.importClosure = { cause, ...detail }; });
      closure.catch(() => {}); return closure;
    },
    async actorResult(reference, actorSeq, instructions, value, source, stats, cached) {
      if (blocked.has(reference.handle)) return;
      const resultRef = await store.saveItem(value);
      await mutate(facts => {
        const actor = facts.actors.find(row => row.handle === reference.handle);
        if (!actor || actor.entries.length !== actorSeq) throw Error('Actor result is not a contiguous completed prefix.');
        actor.entries.push({ actorSeq, inputHash: inputHash(instructions), resultRef,
          messageBoundary: source.eventCount, stats, cached });
        actor.transcriptSourceSessionId = source.sessionId;
      });
    },
    stopActor(reference, actorSeq) {
      blocked.add(reference.handle);
      return mutate(facts => {
        const actor = facts.actors.find(row => row.handle === reference.handle);
        if (actor && (actor.prefixClosedAt === undefined || actorSeq < actor.prefixClosedAt)) actor.prefixClosedAt = actorSeq;
      });
    },
    async worldResult(op, args, ordinal, value, cached) {
      const resultRef = await store.saveItem(value);
      await mutate(facts => { facts.world.push({ inputHash: inputHash({ op, args }), ordinal, resultRef, cached }); });
    },
    flush: () => closure ?? Promise.resolve(),
  };
}
