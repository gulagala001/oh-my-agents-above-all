import { actorPersona as recordedActorPersona } from '../../host/subagents.mjs';
import { inputHash, normalizePersona, matchImportedActor, ImportedWorldQueue } from '../../../lib/zcode-import-cache.mjs';
import { isDeepStrictEqual } from 'node:util';
import { CONTINUITY_PROVIDER_PREFIX, ActorCarryUnavailable, readActorContinuation, readAcceptedActorContinuation } from './continuity.mjs';
import { executionDirectories } from '../../host/working-directory.mjs';
import { RUN_CACHE_VERSION, assertRunCache, decodeContinuationRecord, startHeaderRecord, subagentModelRecord, candidateRecord, chapterRecord, acceptedAskRecord } from './continuation-records.mjs';
import { checkedWorkflowSubagentModel } from './model-bindings.mjs';

export { RUN_CACHE_VERSION };
export const actorPersona = reference => normalizePersona(reference.name || undefined, reference.persona ?? undefined);
export const actorReplayIdentity = reference => inputHash(actorPersona(reference));
const replayProofs = new WeakSet();
const uncertainReplay = message => { throw Object.assign(Error('Native Actor replay: ' + message), { code: 'uncertain_effect' }); };
const replayFingerprint = execution => inputHash({ actors: execution.actors, world: execution.world, replay: execution.replay });
const assertResidentSourceIdle = (ctx, sourceSessionId) => {
  const resident = ctx.agents.get(sourceSessionId);
  if (resident && (resident.status !== 'idle' || resident.inbox?.nextTurn.length || resident.inbox?.nextStep.length))
    uncertainReplay('the archived native Actor source still owns active or queued work.');
};
async function verifyReplayReceipts(ctx, parent, sourceSessionId, receipts, signal) {
  assertResidentSourceIdle(ctx, sourceSessionId);
  const observation = await ctx.get('sessionQuery').observeSession(sourceSessionId, { signal });
  try {
    if (observation.header.origin !== 'subagent' || observation.header.parentSession !== parent.id)
      uncertainReplay('the accepted task source does not belong to this parent.');
    const ownEvents = observation.events.slice(observation.inheritedEventCount);
    const descriptor = ownEvents.find(event => event.type === 'subagent/descriptor')?.data;
    if (!descriptor || descriptor.mode !== 'continuable' || !descriptor.label?.startsWith('ZCode Actor · ')
      || descriptor.provider !== 'spawn' && !descriptor.provider?.startsWith(CONTINUITY_PROVIDER_PREFIX))
      uncertainReplay('the accepted task source is not a native ZCode Actor.');
    const admitted = new Map(); let turn;
    for (const event of ownEvents) {
      if (event.type === 'turn/start') turn = event.data.turn;
      else if (event.type === 'turn/end') turn = undefined;
      else if (event.type === 'user/message' && event.surfaceOp === 'append') {
        const id = (event.data.message ?? event.data).id, entries = admitted.get(id) ?? [];
        entries.push({ turn, seq: event.seq }); admitted.set(id, entries);
      }
    }
    for (const { accepted, chapter, persona } of receipts) {
      const admissions = admitted.get(accepted.messageId), boundary = observation.events[chapter.messageBoundary - 1];
      if (recordedActorPersona(ownEvents) !== persona.system || admissions?.length !== 1 || admissions[0].turn === undefined
        || boundary?.type !== 'turn/end' || boundary.data.reason?.kind !== 'completed'
        || admissions[0].turn !== boundary.data.turn || admissions[0].seq >= boundary.seq)
        uncertainReplay('the accepted native message is not correlated with its recorded completed boundary.');
    }
    signal.throwIfAborted(); assertResidentSourceIdle(ctx, sourceSessionId);
  } finally { observation[Symbol.dispose](); }
}
const ownerOf = (parent, runId) => ({ sessionId: parent.id, runId });
const readEnvelope = async (store, kind, ref, owner, signal) => decodeContinuationRecord(kind, await store.readItem(ref, signal), owner);
const personaChecked = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['name', 'system', 'model'].includes(key) || typeof value[key] !== 'string'))
    throw Error('Invalid native Actor candidate persona.');
  return value;
};

export async function createRunExecution({ store, parent, runId, cwd, script, args, modelBindings, subagentModel, maxConcurrency, resumedFrom }) {
  const scriptRef = await store.saveItem(script), argsRef = await store.saveItem(args);
  const modelBindingsRef = await store.saveItem(Object.fromEntries(modelBindings ?? []));
  const subagentModelRef = subagentModel === undefined ? undefined : await store.saveItem(subagentModelRecord({
    ...ownerOf(parent, runId), revision: 1, ...checkedWorkflowSubagentModel(subagentModel) }));
  const header = startHeaderRecord({ ...ownerOf(parent, runId), revision: 1, cwd, scriptRef, argsRef, modelBindingsRef,
    ...(subagentModelRef === undefined ? {} : { subagentModelRef }),
    ...(resumedFrom === undefined ? {} : { resumedFrom }), ...(maxConcurrency === undefined ? {} : { maxConcurrency }) });
  return { version: RUN_CACHE_VERSION, startHeaderRef: await store.saveItem(header), actors: [], world: [] };
}

export async function readRunSettings({ store, parent, record, signal }) {
  const execution = assertRunCache(record, parent.id);
  if (execution.version === 1) { const { subagentModel: ignoredChoice, ...legacy } = execution; return legacy; }
  const header = await readEnvelope(store, 'start-header', execution.startHeaderRef, ownerOf(parent, record.runId), signal);
  if (header.resumedFrom !== record.resumedFrom) throw Error('Native continuation predecessor identity changed.');
  const script = await store.readItem(header.scriptRef, signal), args = await store.readItem(header.argsRef, signal);
  const modelBindings = await store.readItem(header.modelBindingsRef, signal);
  if (typeof script !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)
    || !modelBindings || typeof modelBindings !== 'object' || Array.isArray(modelBindings)) throw Error('Native continuation source content is invalid.');
  for (const binding of Object.values(modelBindings)) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding) || typeof binding.provider !== 'string' || typeof binding.model !== 'string'
      || Object.keys(binding).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))
      || binding.reasoningEffort !== undefined && typeof binding.reasoningEffort !== 'string') throw Error('Native continuation model binding is invalid.');
  }
  const choice = header.version === 2 ? await readEnvelope(store, 'subagent-model', header.subagentModelRef, ownerOf(parent, record.runId), signal) : undefined;
  return { ...header, script, args, modelBindings,
    ...(choice === undefined ? {} : { subagentModel: checkedWorkflowSubagentModel({ canonical: choice.canonical, options: choice.options }) }) };
}

export async function retuneRunExecution(store, parent, record, maxConcurrency) {
  const execution = assertRunCache(record, parent.id);
  if (execution.version === 1) { execution.maxConcurrency = maxConcurrency; return; }
  const header = await readEnvelope(store, 'start-header', execution.startHeaderRef, ownerOf(parent, record.runId));
  execution.startHeaderRef = await store.saveItem(startHeaderRecord({ ...header, revision: header.revision + 1, maxConcurrency }));
}

async function readCandidate(store, row, owner, signal) {
  const candidate = await readEnvelope(store, 'candidate', row.candidateRef, owner, signal);
  if (candidate.handle !== row.handle) throw Error('Native Actor candidate identity changed.');
  const persona = personaChecked(await store.readItem(candidate.personaRef, signal));
  const entries = [];
  let ref = candidate.lastChapterRef;
  // Linked immutable chapters append in constant space; no growing list is
  // recopied on every completed ask. Read backwards, then restore FIFO order.
  for (let seq = candidate.chapterCount - 1; seq >= 0; seq--) {
    const chapter = await readEnvelope(store, 'chapter', ref, owner, signal);
    if (chapter.kind !== 'actor' || chapter.handle !== row.handle || chapter.actorSeq !== seq
      || candidate.prefixClosedAt !== undefined && chapter.actorSeq >= candidate.prefixClosedAt)
      throw Error('The completed Actor cache prefix is incomplete.');
    entries.push({ actorSeq: chapter.actorSeq, inputHash: chapter.inputHash, resultRef: chapter.resultRef,
      messageBoundary: chapter.messageBoundary, sourceSessionId: chapter.sourceSessionId,
      cached: chapter.cached,
      stats: chapter.statsRef === undefined ? undefined : await store.readItem(chapter.statsRef, signal) });
    ref = chapter.previousChapterRef;
  }
  entries.reverse();
  for (let index = 1; index < entries.length; index++) {
    if (entries[index].messageBoundary <= entries[index - 1].messageBoundary)
      throw Error('The completed Actor cache boundaries are not a strictly increasing native prefix.');
  }
  return { ...candidate, persona, entries, transcriptSourceSessionId: entries.at(-1)?.sourceSessionId };
}

// Prospective v3 journal nodes and native completed chapters must agree before
// any replay source executes. Older v2 runs retain amendment compatibility.
export async function prepareActorReplay({ ctx, parent, store, record, journalNodes, signal, directories }) {
  const execution = assertRunCache(record, parent.id), owner = ownerOf(parent, record.runId);
  if (execution.version !== RUN_CACHE_VERSION || execution.replay?.version !== 3 || !Array.isArray(journalNodes))
    uncertainReplay('this run has no prospective native replay facts.');
  if (execution.importClosureRef !== undefined || execution.importClosure !== undefined) {
    const closure = execution.importClosureRef !== undefined
      ? await store.readItem(execution.importClosureRef, signal) : execution.importClosure;
    if (!closure || typeof closure !== 'object' || Array.isArray(closure)
      || typeof closure.cause !== 'string' || !closure.cause)
      uncertainReplay('the archived effect closure is invalid or incomplete.');
    // The first closure cause cannot account for later tool effects. A
    // completed Actor turn does not establish native background-job outcomes.
    uncertainReplay('the effect window closed without a complete native external-outcome proof.');
  }
  const settings = await readRunSettings({ store, parent, record, signal });
  const location = directories ?? await executionDirectories(ctx, parent, signal);
  if (settings.cwd !== location.cwd) uncertainReplay('the archived working directory changed.');
  const actors = new Map(), coordinates = new Map(), worlds = new Map();
  for (const row of execution.actors) {
    if (typeof row.handle !== 'string' || actors.has(row.handle) || typeof row.siteId !== 'string'
      || !Number.isSafeInteger(row.ordinal) || row.ordinal < 1) uncertainReplay('Actor declaration coordinates are missing or duplicated.');
    const actor = await readCandidate(store, row, owner, signal);
    const key = JSON.stringify([row.siteId, row.ordinal]);
    if (coordinates.has(key)) uncertainReplay('Actor declaration coordinates are duplicated.');
    if (actor.acceptedRef) uncertainReplay('an accepted Actor task has no authoritative journal settlement.');
    let nativeAgentOptions;
    if (actor.entries.length) {
      assertResidentSourceIdle(ctx, actor.transcriptSourceSessionId);
      const source = await readActorContinuation(ctx, parent, { sessionId: actor.transcriptSourceSessionId,
        eventCount: actor.entries.at(-1).messageBoundary, persona: actor.persona.system }, signal,
      { eventCounts: actor.entries.map(entry => entry.messageBoundary), includeEvents: false });
      nativeAgentOptions = source.nativeModel;
      assertResidentSourceIdle(ctx, actor.transcriptSourceSessionId);
    }
    const candidate = { row: structuredClone(row), ...actor, nativeAgentOptions };
    actors.set(row.handle, candidate); coordinates.set(key, candidate);
  }
  const accounted = new Map(), receipts = new Map();
  for (const node of journalNodes) {
    if (node.kind !== 'ask') continue;
    if (node.status === 'running') uncertainReplay('running Actor asks require an independently proven carry contract.');
    const actor = node.actor && coordinates.get(JSON.stringify([node.actor.siteId, node.actor.ordinal]));
    if (!actor || inputHash(actor.persona) !== node.actor.identity) uncertainReplay('the journal Actor identity has no native declaration proof.');
    const chapter = actor.entries[node.actor.seq];
    if (!chapter) uncertainReplay('a recorded Actor failure or result has no exact completed native context.');
    if (node.carryRef !== undefined) {
      const accepted = await readEnvelope(store, 'accepted-ask', node.carryRef, owner, signal);
      if (accepted.handle !== actor.handle || accepted.actorSeq !== node.actor.seq || accepted.inputHash !== chapter.inputHash
        || accepted.sourceSessionId !== chapter.sourceSessionId)
        uncertainReplay('the journal acceptance reference differs from its native completed chapter.');
      const group = receipts.get(accepted.sourceSessionId) ?? [];
      group.push({ accepted, chapter, persona: actor.persona }); receipts.set(accepted.sourceSessionId, group);
    } else if (chapter.cached !== true) uncertainReplay('a native completed task has no recorded acceptance reference.');
    if (node.status === 'completed') {
      const saved = await store.readItem(node.resultRef, signal), actual = await store.readItem(chapter.resultRef, signal);
      if (!saved || typeof saved !== 'object' || !Object.hasOwn(saved, 'value') || saved.undefined === true
        || !isDeepStrictEqual(saved.value, actual)) uncertainReplay('the journal result differs from its native completed chapter.');
    } else if (node.status !== 'failed') uncertainReplay('the journal Actor settlement is unsupported.');
    const sequences = accounted.get(actor.handle) ?? new Set();
    if (sequences.has(node.actor.seq)) uncertainReplay('an Actor sequence has more than one replay settlement.');
    sequences.add(node.actor.seq); accounted.set(actor.handle, sequences);
  }
  for (const actor of actors.values()) if ((accounted.get(actor.handle)?.size ?? 0) !== actor.entries.length)
    uncertainReplay('a native completed Actor chapter has no authoritative journal settlement.');
  for (const [sourceSessionId, group] of receipts) await verifyReplayReceipts(ctx, parent, sourceSessionId, group, signal);
  for (const row of execution.world) {
    const chapter = await readEnvelope(store, 'chapter', row.chapterRef, owner, signal);
    if (chapter.kind !== 'world' || chapter.ordinal !== row.ordinal || worlds.has(row.ordinal))
      uncertainReplay('world observation identity is incomplete.');
    worlds.set(row.ordinal, { ...chapter, result: await store.readItem(chapter.resultRef, signal) });
  }
  let worldOrdinal = 0;
  for (const node of journalNodes) {
    if (!['world-read', 'world-run'].includes(node.kind)) continue;
    const chapter = worlds.get(++worldOrdinal);
    if (node.kind === 'world-run' && node.status === 'running') uncertainReplay('an external world operation has an uncertain outcome.');
    if (!chapter) {
      if (node.status === 'completed') uncertainReplay('a completed world operation has no authoritative observation chapter.');
      continue;
    }
    if (node.status === 'completed') {
      const saved = await store.readItem(node.resultRef, signal);
      if (!saved || typeof saved !== 'object' || !Object.hasOwn(saved, 'value') || saved.undefined === true
        || !isDeepStrictEqual(saved.value, chapter.result))
        uncertainReplay('a world journal result differs from its authoritative observation.');
    } else if (node.status !== 'running' || node.kind !== 'world-read') uncertainReplay('a world observation contradicts its journal settlement.');
  }
  if ([...worlds.keys()].some(ordinal => ordinal > worldOrdinal)) uncertainReplay('a world observation has no journal admission.');
  const proof = { ...owner, cwd: location.cwd, fingerprint: replayFingerprint(execution), actors, worlds };
  replayProofs.add(proof); return proof;
}

export async function importCompletedRun({ ctx, parent, store, record, signal, directories, effectsVerified = false }) {
  const execution = assertRunCache(record, parent.id);
  if (execution.importClosureRef !== undefined || execution.importClosure !== undefined) {
    const effectClosure = execution.importClosureRef !== undefined
      ? await store.readItem(execution.importClosureRef, signal) : execution.importClosure;
    const uncertain = () => { throw Object.assign(Error('The predecessor has unfinished or unidentifiable external effects. Establish their actual outcome before continuation; this adapter will not retry them.'), { code: 'uncertain_effect' }); };
    // A persisted closure's presence is monotonic. A null/false payload is
    // damaged evidence, not proof that the predecessor's effect window stayed open.
    if (!effectClosure || typeof effectClosure !== 'object' || Array.isArray(effectClosure)
      || typeof effectClosure.cause !== 'string' || !effectClosure.cause) uncertain();
    // A legacy closure records only the first cause, not all later effects.
    // Completed task prefixes cannot establish whole-run effect completion.
    if (!effectsVerified) uncertain();
    if (execution.version !== 1) for (const row of execution.actors) {
      const candidate = await readEnvelope(store, 'candidate', row.candidateRef, ownerOf(parent, record.runId), signal);
      if (candidate.acceptedRef) uncertain();
    }
  }
  const settings = await readRunSettings({ store, parent, record, signal });
  const actors = new Map(), world = new Map(), partialOmissions = [];
  const location = directories ?? await executionDirectories(ctx, parent, signal);
  const previousCwd = settings.cwd ?? location.workspaceRoot;
  if (previousCwd !== location.cwd) return { actors, world, cwd: location.cwd, directoryChanged: true };
  const owner = ownerOf(parent, record.runId), handles = new Set();
  for (const row of execution.actors) {
    if (!row || typeof row.handle !== 'string' || handles.has(row.handle)) throw Error('Native Actor candidate identity is invalid.');
    handles.add(row.handle);
    const actor = execution.version === 1 ? row : await readCandidate(store, row, owner, signal);
    const persona = personaChecked(actor.persona);
    if (!persona.name) continue;
    if (actors.has(persona.name)) throw Error('Duplicate named Actor continuation candidate.');
    if (!Array.isArray(actor.entries)) throw Error('The completed Actor cache prefix is incomplete.');
    const entries = [];
    for (const entry of actor.entries) {
      if (entry.actorSeq !== entries.length || !entry.resultRef || typeof entry.inputHash !== 'string'
        || !Number.isSafeInteger(entry.messageBoundary) || entry.messageBoundary < 1
        || entries.length > 0 && entry.messageBoundary <= entries.at(-1).messageBoundary
        || actor.prefixClosedAt !== undefined && entry.actorSeq >= actor.prefixClosedAt)
        throw Error('The completed Actor cache prefix is incomplete.');
      entries.push({ inputHash: entry.inputHash, result: await store.readItem(entry.resultRef, signal),
        messageBoundary: entry.messageBoundary, stats: entry.stats });
    }
    // The last source owns the canonical prefix, including any immutable seed
    // inherited from earlier successors. Validate every selectable completed
    // cut before stopping a live predecessor, not only its longest boundary.
    const completedEventCounts = entries.map(entry => entry.messageBoundary);
    let transcriptSourceSessionId = actor.transcriptSourceSessionId, nativeAgentOptions, inFlight, inFlightMessageId;
    if (entries.length) {
      const source = await readActorContinuation(ctx, parent, { sessionId: transcriptSourceSessionId,
        eventCount: entries.at(-1).messageBoundary, persona: persona.system }, signal,
      { eventCounts: completedEventCounts, includeEvents: false });
      nativeAgentOptions = source.nativeModel;
    }
    if (actor.acceptedRef) {
      const accepted = await readEnvelope(store, 'accepted-ask', actor.acceptedRef, owner, signal);
      if (accepted.handle !== row.handle || accepted.actorSeq !== entries.length)
        throw Error('Accepted Actor work does not immediately follow its completed prefix.');
      if (record.status !== 'running') {
        if (execution.importClosureRef || execution.importClosure || execution.actorDrainComplete !== true)
          partialOmissions.push({ actorName: persona.name, reason: 'The predecessor import window closed or its native children did not finish draining.' });
        else {
          try {
            const source = await readAcceptedActorContinuation(ctx, parent, { sessionId: accepted.sourceSessionId,
              messageId: accepted.messageId, persona: persona.system }, signal,
            { eventCounts: completedEventCounts, includeEvents: false });
            inFlight = { inputHash: accepted.inputHash, messageBoundary: source.eventCount };
            inFlightMessageId = accepted.messageId;
            transcriptSourceSessionId = accepted.sourceSessionId; nativeAgentOptions = source.nativeModel;
          } catch (error) {
            if (!(error instanceof ActorCarryUnavailable)) throw error;
            partialOmissions.push({ actorName: persona.name, reason: error.message });
          }
        }
      }
    }
    if (!entries.length && !inFlight) continue;
    actors.set(persona.name, { persona, entries, transcriptSourceSessionId,
      ...(inFlight === undefined ? {} : { inFlight, inFlightMessageId }),
      ...(nativeAgentOptions === undefined ? {} : { nativeAgentOptions: Object.freeze(nativeAgentOptions) }) });
  }
  const ordinals = new Set();
  for (const row of [...execution.world].sort((a, b) => a.ordinal - b.ordinal)) {
    const chapter = execution.version === 1 ? row : await readEnvelope(store, 'chapter', row.chapterRef, owner, signal);
    if (execution.version !== 1 && (chapter.kind !== 'world' || chapter.ordinal !== row.ordinal)
      || !Number.isSafeInteger(chapter.ordinal) || chapter.ordinal < 1 || ordinals.has(chapter.ordinal)
      || typeof chapter.inputHash !== 'string' || !chapter.resultRef) throw Error('Native world continuation order is invalid.');
    ordinals.add(chapter.ordinal);
    const entries = world.get(chapter.inputHash) ?? [];
    entries.push({ result: await store.readItem(chapter.resultRef, signal) }); world.set(chapter.inputHash, entries);
  }
  return { actors, world, cwd: location.cwd, partialOmissions };
}

export function createRunCache({ store, parent, runId, imported, replay = false }) {
  const world = new ImportedWorldQueue(imported?.world ?? new Map());
  const blocked = new Set(), owner = ownerOf(parent, runId);
  let closed = false, closure, worldOrdinal = 0;
  let replayProof;
  const mutate = fn => store.mutate(parent.id, runId, record => fn(assertRunCache(record, parent.id)));
  return {
    async initializeReplay(options) {
      if (!replay) return;
      const record = options.record ?? await store.record(parent.id, runId);
      const proof = options.proof ?? await prepareActorReplay({ ...options, store, parent, record });
      if (!replayProofs.has(proof) || proof.runId !== runId || proof.sessionId !== parent.id
        || proof.fingerprint !== replayFingerprint(assertRunCache(record, parent.id))) uncertainReplay('the archived replay proof changed before initialization.');
      replayProof = proof;
      closed = Boolean(record.execution.importClosureRef || record.execution.importClosure);
      for (const actor of proof.actors.values()) if (actor.prefixClosedAt !== undefined) blocked.add(actor.handle);
    },
    async replayActorAsk(reference, actorSeq, instructions, node) {
      if (!replayProof) uncertainReplay('Actor replay was not preflighted.');
      const actor = replayProof.actors.get(reference.handle);
      if (!actor || actor.row.siteId !== reference.siteId || actor.row.ordinal !== reference.ordinal
        || !isDeepStrictEqual(actor.persona, actorPersona(reference)) || actorReplayIdentity(reference) !== node.actor?.identity
        || node.actor.seq !== actorSeq) uncertainReplay('the replayed Actor identity changed.');
      const chapter = actor.entries[actorSeq];
      if (!chapter || chapter.inputHash !== inputHash(instructions)) uncertainReplay('the replayed Actor input has no completed native context.');
      return { source: { sourceSessionId: actor.transcriptSourceSessionId, messageCount: chapter.messageBoundary },
        nativeAgentOptions: actor.nativeAgentOptions, blocked: actor.prefixClosedAt !== undefined || node.status === 'failed' };
    },
    assertActorLive(reference) {
      if (replay && !replayProof) uncertainReplay('Actor replay was not initialized.');
      if (replay && blocked.has(reference.handle)) uncertainReplay('the durable failed Actor prefix cannot dispatch new work.');
    },
    attachActor: reference => matchImportedActor(imported, actorPersona(reference)),
    async declareActor(reference) {
      if (replay && !replayProof) uncertainReplay('Actor declaration replay was not preflighted.');
      const prior = replayProof?.actors.get(reference.handle);
      if (prior) {
        if (prior.row.siteId !== reference.siteId || prior.row.ordinal !== reference.ordinal
          || !isDeepStrictEqual(prior.persona, actorPersona(reference))) uncertainReplay('an archived Actor declaration changed.');
        return;
      }
      const personaRef = await store.saveItem(actorPersona(reference));
      const candidateRef = await store.saveItem(candidateRecord({ ...owner, revision: 1, handle: reference.handle, personaRef, chapterCount: 0 }));
      await mutate(facts => {
        if (facts.actors.some(row => row.handle === reference.handle)) throw Error('Actor continuation identity is already declared.');
        facts.actors.push({ handle: reference.handle, siteId: reference.siteId, ordinal: reference.ordinal, candidateRef });
      });
    },
    takeActor(actor, seq, instructions) {
      return closed ? actor?.takeIfPure(seq, inputHash(instructions)) : actor?.take(seq, inputHash(instructions));
    },
    actorSeed(actor, actorSeq) {
      if (!actor) return;
      const carried = actor.carriedAt(actorSeq) && actor.candidate.inFlight !== undefined;
      if (carried && closed) {
        const last = actor.candidate.entries[actorSeq - 1];
        return last && { sourceSessionId: actor.candidate.transcriptSourceSessionId, messageCount: last.messageBoundary };
      }
      const seed = actor.seed();
      return seed && { ...seed, ...(carried ? { allowAborted: true, messageId: actor.candidate.inFlightMessageId,
        completedEventCounts: actor.candidate.entries.map(entry => entry.messageBoundary), isCarryOpen: () => !closed,
        completedFallbackCount: actor.candidate.entries[actorSeq - 1]?.messageBoundary } : {}) };
    },
    async actorAccepted(reference, actorSeq, instructions, source) {
      if (replay && blocked.has(reference.handle)) uncertainReplay('accepted work cannot extend a closed failed Actor prefix.');
      const acceptedRef = await store.saveItem(acceptedAskRecord({ ...owner, revision: actorSeq + 1, handle: reference.handle,
        actorSeq, inputHash: inputHash(instructions), sourceSessionId: source.sessionId, messageId: source.messageId }));
      // A caught failure closes reusable context, not this live Actor. Later
      // accepted work still needs its own durable identity in the v3 journal;
      // it must not extend the earlier incomplete continuation candidate.
      if (blocked.has(reference.handle)) return acceptedRef;
      await mutate(async facts => {
        const row = facts.actors.find(row => row.handle === reference.handle);
        if (!row) throw Error('Accepted Actor work has no declared candidate.');
        const candidate = await readEnvelope(store, 'candidate', row.candidateRef, owner);
        if (candidate.chapterCount !== actorSeq || candidate.acceptedRef !== undefined)
          throw Error('Accepted Actor work does not immediately follow its completed prefix.');
        row.candidateRef = await store.saveItem(candidateRecord({ ...candidate, revision: candidate.revision + 1, acceptedRef }));
      });
      return acceptedRef;
    },
    actorsDrained: () => mutate(facts => { facts.actorDrainComplete = true; }),
    admitWorld(op, args) {
      const ordinal = ++worldOrdinal, hash = inputHash({ op, args });
      if (replay && !replayProof) uncertainReplay('world replay was not initialized.');
      const previous = replayProof?.worlds.get(ordinal);
      if (previous && previous.inputHash !== hash) uncertainReplay('the archived world observation input changed.');
      return { ordinal, cached: previous ? { result: structuredClone(previous.result) } : closed ? undefined : world.take(hash) };
    },
    close(cause, detail) {
      if (closed) return closure ?? Promise.resolve();
      closed = true;
      closure = mutate(async facts => { facts.importClosureRef = await store.saveItem({ cause, ...detail }); });
      closure.catch(() => {}); return closure;
    },
    async actorResult(reference, actorSeq, instructions, value, source, stats, cached) {
      if (replay && blocked.has(reference.handle)) uncertainReplay('a result cannot extend a closed failed Actor prefix.');
      if (blocked.has(reference.handle)) return;
      const resultRef = await store.saveItem(value), statsRef = stats === undefined ? undefined : await store.saveItem(stats);
      await mutate(async facts => {
        const row = facts.actors.find(row => row.handle === reference.handle);
        if (!row) throw Error('Actor result has no declared continuation candidate.');
        const candidate = await readEnvelope(store, 'candidate', row.candidateRef, owner);
        if (candidate.chapterCount !== actorSeq
          || candidate.prefixClosedAt !== undefined && actorSeq >= candidate.prefixClosedAt) throw Error('Actor result is not a contiguous completed prefix.');
        const chapterRef = await store.saveItem(chapterRecord({ ...owner, revision: actorSeq + 1, kind: 'actor', handle: reference.handle,
          actorSeq, inputHash: inputHash(instructions), resultRef, messageBoundary: source.eventCount, sourceSessionId: source.sessionId,
          ...(candidate.lastChapterRef === undefined ? {} : { previousChapterRef: candidate.lastChapterRef }),
          ...(statsRef === undefined ? {} : { statsRef }), cached }));
        const { acceptedRef: _acceptedRef, ...completed } = candidate;
        row.candidateRef = await store.saveItem(candidateRecord({ ...completed, revision: candidate.revision + 1,
          chapterCount: actorSeq + 1, lastChapterRef: chapterRef }));
      });
    },
    stopActor(reference, actorSeq) {
      blocked.add(reference.handle);
      return mutate(async facts => {
        const row = facts.actors.find(row => row.handle === reference.handle);
        if (!row) return;
        const candidate = await readEnvelope(store, 'candidate', row.candidateRef, owner);
        row.candidateRef = await store.saveItem(candidateRecord({ ...candidate, revision: candidate.revision + 1,
          prefixClosedAt: Math.min(candidate.prefixClosedAt ?? actorSeq, actorSeq) }));
      });
    },
    async worldResult(op, args, ordinal, value, cached) {
      const previous = replayProof?.worlds.get(ordinal);
      if (previous) {
        if (previous.inputHash !== inputHash({ op, args }) || !isDeepStrictEqual(previous.result, value))
          uncertainReplay('a repeated world observation differs from its durable result.');
        return;
      }
      const resultRef = await store.saveItem(value);
      const chapterRef = await store.saveItem(chapterRecord({ ...owner, revision: ordinal, kind: 'world', inputHash: inputHash({ op, args }), ordinal, resultRef, cached }));
      await mutate(facts => {
        if (facts.world.some(row => row.ordinal === ordinal)) uncertainReplay('world observation ordinal is already committed.');
        facts.world.push({ ordinal, chapterRef });
      });
    },
    flush: () => closure ?? Promise.resolve(),
  };
}
