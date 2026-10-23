import { createHash } from 'node:crypto';
import { NO_ARTIFACT_CHANGE } from '../../host/zcode-artifacts.mjs';
import { foldNativeRunFact } from './run-progress.mjs';
import { assertRunCache, decodeContinuationRecord, startHeaderRecord } from './continuation-records.mjs';
import { spliceHoleBody, validateFill } from './holes-contract.mjs';

// Native OMAA live binding. The original engine and its journal are not loaded.
// Contract evidence: pinned engine-holes.ts (park before reached, release all
// ordinals, remember by site), lower-hole.ts (lexical direct eval), hole-splice.ts.
const hashOf = script => createHash('sha256').update(script).digest('hex');
const boundPrompt = prompt => prompt.length <= 4000 ? prompt : prompt.slice(0, 3999) + '…';
const cancelled = reason => reason instanceof Error ? reason : Error('Workflow hole waiting ended.');
const emptyFacts = prepared => ({ version: 1, scriptHash: hashOf(prepared.script),
  phaseNames: [...prepared.phaseNames], holes: [...prepared.holes], open: [], filled: [] });
function factsFor(record, prepared, verifySource = true) {
  const facts = record.liveHoles ??= emptyFacts(prepared);
  if (facts.version !== 1 || !Array.isArray(facts.open) || !Array.isArray(facts.filled)
    || !Array.isArray(facts.phaseNames) || !Array.isArray(facts.holes)
    || typeof facts.scriptHash !== 'string' || !/^[a-f0-9]{64}$/.test(facts.scriptHash)
    || verifySource && facts.scriptHash !== hashOf(prepared.script)) throw Error('Native live hole source or facts changed.');
  return facts;
}

// swapPrepared must be synchronous and install previously validated tables in
// every native consumer. It runs only after the durable source/facts commit,
// and before any waiting evaluator can see the new body. prepare must run the
// existing whole-script compiler, including schema and authoring validation.
export function createLiveWorkflowHoles({ store, parent, runId, signal, prepared, prepare, check = () => signal.throwIfAborted(), swapPrepared, journal }) {
  if (!prepared?.ok || !(prepared.sitePhases instanceof Map) || !Array.isArray(prepared.phaseNames) || !Array.isArray(prepared.holes)
    || typeof prepare !== 'function' || typeof swapPrepared !== 'function')
    throw Error('Native live holes require a compiled workflow, compiler and synchronous table installer.');
  const owner = { sessionId: parent.id, runId };
  const parked = new Map(), remembered = new Map(), ordinals = new Map(), operations = new Set(), callerCancellations = new Set();
  let current = prepared, phaseRevision = 0, settled = false, settlementError, factsPublished = false, fillTail = Promise.resolve(), closing;
  const track = work => {
    operations.add(work);
    work.finally(() => operations.delete(work)).catch(() => {});
    return work;
  };
  const waiting = siteId => (parked.get(siteId)?.length ?? 0) > 0 || remembered.has(siteId);
  const responseFor = code => ({ code, phaseRevision, sitePhases: Object.fromEntries(current.sitePhases) });
  const rejectAll = reason => {
    settled = true;
    settlementError ??= cancelled(reason);
    const entries = [...parked.values()].flat(); parked.clear();
    for (const entry of entries) entry.result.reject(settlementError);
  };
  const interrupted = () => rejectAll(signal.reason);
  signal.addEventListener('abort', interrupted, { once: true });
  if (signal.aborted) interrupted();
  function assertRunning() {
    check();
    if (settled) throw settlementError;
  }
  function reach({ siteId, name, prompt, phaseName } = {}) {
    try { assertRunning(); } catch (error) { return Promise.reject(error); }
    const site = current.sites.holes.find(site => site.id === siteId);
    if (!site || site.name !== name || typeof name !== 'string' || site.body !== undefined && !remembered.has(siteId)
      || prompt !== undefined && typeof prompt !== 'string' || phaseName !== undefined && typeof phaseName !== 'string')
      return Promise.reject(Error('Invalid compiled open hole binding.'));
    const ordinal = (ordinals.get(siteId) ?? 0) + 1; ordinals.set(siteId, ordinal);
    const known = remembered.get(siteId);
    if (known) return Promise.resolve(responseFor(known.code));
    const result = Promise.withResolvers(); result.promise.catch(() => {});
    const birthPhase = current.sitePhases.get(siteId) ?? phaseName;
    const entry = { siteId, ordinal, name, since: Date.now(), result,
      ...(prompt === undefined ? {} : { prompt: boundPrompt(prompt) }),
      ...(birthPhase === undefined ? {} : { phaseName: birthPhase }) };
    const list = parked.get(siteId) ?? []; list.push(entry); parked.set(siteId, list);
    // Park synchronously before enqueueing the reached observation. A fill
    // waits for that observation to commit before replacing the source.
    entry.announced = store.mutate(parent.id, runId, record => {
      assertRunning();
      if (record.status !== 'running') throw Error('The workflow is no longer accepting hole bindings.');
      // A native store write awaits I/O. A reach admitted during a committed
      // fill must not recreate its open fact while the table swap is pending.
      if (remembered.has(siteId) || record.liveHoles?.filled.some(fill => fill.siteId === siteId)
        || !(parked.get(siteId) ?? []).includes(entry)) return NO_ARTIFACT_CHANGE;
      // Other sites may arrive while a fill replaces the source. Existing
      // lexical phases are immutable, so their arrival remains valid; the fill
      // transaction alone checks effective-source equality.
      const facts = factsFor(record, current, false);
      const { result: ignored, announced: ignoredAnnouncement, ...open } = entry;
      facts.open.push(open);
      foldNativeRunFact(record, runId, 'hole-reached', { instance: { siteId, ordinal }, name, since: entry.since,
        ...(prompt === undefined ? {} : { prompt: entry.prompt }) });
    });
    const work = (async () => {
      try { await entry.announced; factsPublished = true; return await result.promise; }
      catch (error) {
        result.reject(error);
        const remaining = (parked.get(siteId) ?? []).filter(value => value !== entry);
        if (remaining.length) parked.set(siteId, remaining); else parked.delete(siteId);
        throw error;
      }
    })();
    return track(work);
  }
  function fill({ siteId, body, filledBy, signal: callerSignal } = {}) {
    const requestSignal = callerSignal ? AbortSignal.any([signal, callerSignal]) : signal;
    const assertRequest = () => { assertRunning(); requestSignal.throwIfAborted(); };
    const work = fillTail.then(async () => {
      if (settled || signal.aborted) return { ok: false, reason: 'settled' };
      assertRequest();
      if (typeof siteId !== 'string' || typeof body !== 'string' || filledBy !== undefined && filledBy !== parent.id)
        throw Error('A live hole fill needs a site, body text and its owning native parent.');
      if (!waiting(siteId)) return { ok: false, reason: 'not_waiting' };
      const original = current;
      const spliced = spliceHoleBody(original.script, original.sites, siteId, body);
      if (!spliced) return { ok: false, reason: 'already_filled' };
      const revised = await prepare(spliced.text);
      assertRequest();
      if (!revised.ok) return { ok: false, reason: 'invalid_fill', diagnostics: revised.diagnostics };
      const validated = validateFill(original, revised, { siteId, body, spliced });
      if (!validated.ok) return validated;
      await Promise.all((parked.get(siteId) ?? []).map(entry => entry.announced));
      assertRequest();
      const filledAt = Date.now(), fillingSession = filledBy ?? parent.id;
      const committed = await store.mutate(parent.id, runId, async record => {
        assertRequest();
        if (record.status !== 'running' || current !== original || !waiting(siteId)) return NO_ARTIFACT_CHANGE;
        const facts = factsFor(record, original), execution = assertRunCache(record, parent.id);
        if (execution.version === 1) {
          if (execution.script !== original.script) throw Error('The archived effective workflow source changed.');
          execution.script = revised.script;
        } else {
          const header = decodeContinuationRecord('start-header', await store.readItem(execution.startHeaderRef, signal), owner);
          if (await store.readItem(header.scriptRef, signal) !== original.script) throw Error('The archived effective workflow source changed.');
          const scriptRef = await store.saveItem(revised.script);
          execution.startHeaderRef = await store.saveItem(startHeaderRecord({ ...header, revision: header.revision + 1, scriptRef }));
        }
        assertRequest();
        facts.scriptHash = hashOf(revised.script);
        facts.phaseNames = [...revised.phaseNames]; facts.holes = [...revised.holes];
        facts.open = facts.open.filter(entry => entry.siteId !== siteId);
        facts.filled = facts.filled.filter(entry => entry.siteId !== siteId);
        facts.filled.push({ siteId, name: original.sites.holes.find(site => site.id === siteId)?.name, filledAt, filledBy: fillingSession });
        record.graph = revised.graph; record.causalityGraph = revised.causalityGraph; record.displayGraph = revised.displayGraph;
        await journal?.()?.noteEffectiveSource(record, revised.script);
        foldNativeRunFact(record, runId, 'hole-filled', { siteId, filledAt, filledBy: fillingSession,
          phaseNames: [...revised.phaseNames], holes: [...revised.holes] });
        return true;
      }, { signal: requestSignal });
      if (!committed) return { ok: false, reason: 'settled' };
      factsPublished = true;
      // No awaits between installing the effective tables and releasing the
      // parked lexical evaluators. A failed store commit reaches neither.
      try { swapPrepared(revised); }
      catch (error) { rejectAll(error); throw error; }
      current = revised;
      phaseRevision++;
      remembered.set(siteId, { code: validated.code, filledAt, filledBy: fillingSession });
      const entries = parked.get(siteId) ?? []; parked.delete(siteId);
      for (const entry of entries) entry.result.resolve(responseFor(validated.code));
      return { ok: true, siteId, filledAt };
    });
    fillTail = work.catch(error => {
      if (callerSignal?.aborted && error === callerSignal.reason) callerCancellations.add(error);
    });
    return track(work);
  }
  return {
    reach, fill,
    current: () => current,
    open: () => [...parked.values()].flat().map(({ result, announced, ...entry }) => ({ ...entry })),
    filled: () => [...remembered].map(([siteId, { code, ...entry }]) => ({ siteId, ...entry })),
    close(reason = signal.reason) {
      if (closing) return closing;
      signal.removeEventListener('abort', interrupted); rejectAll(reason);
      closing = (async () => {
        const drained = await Promise.allSettled([...operations]);
        if (factsPublished) await store.mutate(parent.id, runId, record => {
          if (!record.liveHoles?.open.length) return NO_ARTIFACT_CHANGE;
          record.liveHoles.open = [];
        });
        const errors = drained.filter(value => value.status === 'rejected' && value.reason !== settlementError && value.reason !== signal.reason && !callerCancellations.has(value.reason)).map(value => value.reason);
        if (errors.length) throw new AggregateError(errors, 'Native hole operations could not be drained.');
      })();
      return closing;
    },
  };
}
