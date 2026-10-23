import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../lib/zcode-artifact-shared.mjs';
import { checkedWorkflowSubagentModel } from './model-bindings.mjs';

// Native OMAA format: deliberately not the original synchronous SQLite port.
// Only new executions that attached this format BEFORE dispatch are eligible.
export const NATIVE_REPLAY_VERSION = 3;
const FORMAT = 'omaa.zcode.replay';
const KINDS = new Set(['ask', 'world-read', 'world-run', 'report', 'artifact']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(canonicalJson(value));
const allowed = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const reference = value => object(value) && integer(value.bytes, 1) &&
  (value.format === 'omaa.zcode.json' && value.version === 2 && object(value.root)
    || text(value.attachmentId) && typeof value.name === 'string');
const keyOf = instance => JSON.stringify([instance.siteId, instance.ordinal]);
const actorKey = actor => JSON.stringify([actor.siteId, actor.ordinal, actor.seq]);
const common = ['format', 'version', 'sessionId', 'runId'];
const fail = message => { throw Error('Native same-run replay: ' + message); };
const abortError = signal => signal?.reason instanceof Error ? signal.reason : Error('Native same-run replay canceled.');
const plain = value => JSON.parse(JSON.stringify(value));

export function nativeReplayOwnership({ script, args, cwd, modelBindings, subagentModel }) {
  if (typeof script !== 'string' || !object(args) || !text(cwd)) fail('invalid saved execution settings.');
  const bindings = modelBindings instanceof Map ? Object.fromEntries(modelBindings) : modelBindings;
  if (!object(bindings)) fail('invalid saved model bindings.');
  return { scriptHash: digest(script), argsHash: digest(args), cwd, modelBindingsHash: digest(bindings),
    ...(subagentModel === undefined ? {} : { subagentModelHash: digest(checkedWorkflowSubagentModel(subagentModel)) }) };
}
function ownershipChecked(value) {
  if (!object(value) || !allowed(value, ['scriptHash', 'argsHash', 'cwd', 'modelBindingsHash', 'subagentModelHash'])
    || value.subagentModelHash !== undefined && (typeof value.subagentModelHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.subagentModelHash))
    || !text(value.cwd) || ![value.scriptHash, value.argsHash, value.modelBindingsHash].every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)))
    fail('invalid execution ownership.');
  return value;
}
function envelope(kind, fields) { return { format: FORMAT + '.' + kind, version: NATIVE_REPLAY_VERSION, ...fields }; }
function baseChecked(kind, value, owner) {
  if (!object(value) || value.format !== FORMAT + '.' + kind || value.version !== NATIVE_REPLAY_VERSION
    || value.sessionId !== owner.sessionId || value.runId !== owner.runId) fail('unsupported format or changed record ownership.');
  return value;
}
function pointerOf(record, owner) {
  if (!object(record) || record.sessionId !== owner.sessionId || record.runId !== owner.runId || !object(record.execution)) fail('changed run ownership.');
  const pointer = record.execution.replay;
  if (!object(pointer) || !allowed(pointer, ['format', 'version', 'rootRef']) || pointer.format !== FORMAT
    || pointer.version !== NATIVE_REPLAY_VERSION || !reference(pointer.rootRef)) fail('this execution has no prospective replay journal.');
  return pointer;
}
function rootChecked(value, owner) {
  baseChecked('root', value, owner);
  if (!allowed(value, [...common, 'ownershipRef', 'eventCount', 'nodeCount', 'settlementCount', 'lastChapterRef'])
    || !reference(value.ownershipRef) || !integer(value.eventCount) || !integer(value.nodeCount)
    || !integer(value.settlementCount) || value.nodeCount > value.eventCount || value.settlementCount > value.nodeCount
    || (value.eventCount === 0 ? value.lastChapterRef !== undefined : !reference(value.lastChapterRef))) fail('invalid journal root.');
  return value;
}
function actorChecked(actor) {
  if (!object(actor) || !allowed(actor, ['siteId', 'ordinal', 'seq', 'identity']) || !text(actor.siteId)
    || !integer(actor.ordinal) || !integer(actor.seq) || !text(actor.identity)) fail('invalid Actor ask identity.');
  return { siteId: actor.siteId, ordinal: actor.ordinal, seq: actor.seq, identity: actor.identity };
}
function nodeChecked(value, owner) {
  baseChecked('node', value, owner);
  if (!allowed(value, [...common, 'siteId', 'ordinal', 'kind', 'inputHash', 'actor', 'status', 'claimsSettlement', 'resultRef', 'errorRef', 'settlementSeq', 'carryRef'])
    || !text(value.siteId) || !integer(value.ordinal) || !KINDS.has(value.kind)
    || !/^[a-f0-9]{64}$/.test(value.inputHash) || typeof value.claimsSettlement !== 'boolean'
    || !['running', 'completed', 'failed'].includes(value.status)) fail('invalid journal node.');
  if (value.kind === 'ask') actorChecked(value.actor);
  else if (value.actor !== undefined || value.carryRef !== undefined) fail('Actor facts on a non-ask node.');
  if (value.kind === 'report' && value.claimsSettlement) fail('report cannot claim settlement order.');
  if (['ask', 'world-read', 'world-run'].includes(value.kind) && !value.claimsSettlement) fail('promise effects must claim settlement order.');
  if (value.carryRef !== undefined && !reference(value.carryRef)) fail('invalid Actor carry reference.');
  if (value.status === 'running') {
    if (value.resultRef !== undefined || value.errorRef !== undefined || value.settlementSeq !== undefined) fail('running node has terminal facts.');
  } else {
    if (value.status === 'completed' ? !reference(value.resultRef) || value.errorRef !== undefined : !reference(value.errorRef) || value.resultRef !== undefined)
      fail('missing or contradictory terminal payload.');
    if (value.claimsSettlement ? !integer(value.settlementSeq, 1) : value.settlementSeq !== undefined) fail('invalid settlement identity.');
  }
  return value;
}
function sameIdentity(a, b) {
  return a.siteId === b.siteId && a.ordinal === b.ordinal && a.kind === b.kind && a.inputHash === b.inputHash
    && a.claimsSettlement === b.claimsSettlement && canonicalJson(a.actor) === canonicalJson(b.actor);
}
function carryTransitionChecked(before, next) {
  if (!before) {
    if (next.carryRef !== undefined) fail('initial running marker already contains an accepted-task reference.');
    return;
  }
  if (before.carryRef !== undefined) {
    if (canonicalJson(before.carryRef) !== canonicalJson(next.carryRef)) fail('accepted-task reference changed or disappeared.');
  } else if (next.carryRef !== undefined && next.status !== 'running') {
    fail('accepted-task reference was not durably checkpointed while running.');
  }
}
function chapterChecked(value, owner, sequence) {
  baseChecked('chapter', value, owner);
  if (!allowed(value, [...common, 'sequence', 'nodeRef', 'previousChapterRef']) || value.sequence !== sequence || !reference(value.nodeRef)
    || (sequence === 1 ? value.previousChapterRef !== undefined : !reference(value.previousChapterRef))) fail('incomplete chapter chain.');
  return value;
}
class CommitFailure extends Error { constructor(cause) { super('Native authoritative commit failed.'); this.cause = cause; } }
const savedError = error => error instanceof Error
  ? { type: 'error', name: error.name, message: error.message, ...(typeof error.code === 'string' ? { code: error.code } : {}) }
  : { type: 'thrown', ...(error === undefined ? { undefined: true } : { value: plain(error) }) };
function restoreError(value) {
  if (!object(value)) fail('invalid saved failure.');
  if (value.type === 'thrown') {
    if (Object.hasOwn(value, 'undefined')) {
      if (value.undefined !== true || !allowed(value, ['type', 'undefined'])) fail('invalid saved thrown value.');
      return undefined;
    }
    if (!Object.hasOwn(value, 'value') || !allowed(value, ['type', 'value'])) fail('invalid saved thrown value.');
    return value.value;
  }
  if (value.type !== 'error' || !allowed(value, ['type', 'name', 'message', 'code']) || typeof value.name !== 'string'
    || typeof value.message !== 'string' || value.code !== undefined && typeof value.code !== 'string') fail('invalid saved failure.');
  const error = Error(value.message); error.name = value.name;
  if (value.code !== undefined) error.code = value.code;
  return error;
}
const savedValue = value => value === undefined ? { undefined: true } : { value: plain(value) };
function restoreValue(value) {
  if (!object(value)) fail('invalid saved result.');
  if (Object.hasOwn(value, 'undefined')) {
    if (value.undefined !== true || !allowed(value, ['undefined'])) fail('invalid saved result.');
    return undefined;
  }
  if (!Object.hasOwn(value, 'value') || !allowed(value, ['value'])) fail('invalid saved result.');
  return value.value;
}

const SETTLEMENT_FORMAT = 'omaa.zcode.settlement';
/** Validate the script-facing final RPC envelope, without releasing it. */
export function decodeNativeSettlementEnvelope(value) {
  if (!object(value) || !allowed(value, ['format', 'version', 'sequence', 'outcome'])
    || value.format !== SETTLEMENT_FORMAT || value.version !== 1 || !integer(value.sequence, 1)
    || !object(value.outcome) || typeof value.outcome.ok !== 'boolean') fail('invalid settlement transport envelope.');
  const outcome = value.outcome;
  if (outcome.ok) {
    if (Object.hasOwn(outcome, 'undefined')) {
      if (outcome.undefined !== true || !allowed(outcome, ['ok', 'undefined'])) fail('invalid undefined settlement outcome.');
    } else if (!Object.hasOwn(outcome, 'value') || !allowed(outcome, ['ok', 'value'])) fail('invalid settlement value outcome.');
  } else {
    const error = outcome.error;
    if (!allowed(outcome, ['ok', 'error']) || !object(error) || !allowed(error, ['name', 'message', 'code'])
      || typeof error.name !== 'string' || typeof error.message !== 'string'
      || error.code !== undefined && typeof error.code !== 'string') fail('invalid settlement failure outcome.');
  }
  return structuredClone(value);
}
const transportError = error => ({ name: typeof error?.name === 'string' ? error.name : 'Error',
  message: typeof error?.message === 'string' ? error.message : String(error),
  ...(typeof error?.code === 'string' ? { code: error.code } : {}) });

// First-ever terminal commits own the order. Reports and preset declarations
// never claim it. FIFO microtask release lets script awaits attach before pumping.
class SettleGate {
  constructor(order) { this.order = order; this.position = new Map(order.map((key, index) => [key, index])); }
  cursor = 0; parked = new Map(); queue = []; flushing = false; stopped; opened = false;
  hold(key, release, reject) {
    if (this.stopped) { reject(this.stopped); return; }
    const at = this.position.get(key);
    if (this.opened || at === undefined || at < this.cursor) { this.enqueue(release, reject); return; }
    if (this.parked.has(key)) { reject(Error('Duplicate replay settlement claim.')); return; }
    this.parked.set(key, { release, reject });
    while (this.cursor < this.order.length && this.parked.has(this.order[this.cursor])) {
      const next = this.parked.get(this.order[this.cursor]); this.parked.delete(this.order[this.cursor++]);
      this.enqueue(next.release, next.reject);
    }
  }
  enqueue(release, reject) {
    this.queue.push({ release, reject });
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => {
      this.flushing = false; const batch = this.queue; this.queue = [];
      for (const item of batch) this.stopped ? item.reject(this.stopped) : item.release();
    });
  }
  stop(error) {
    if (this.stopped) return;
    this.stopped = error;
    const pending = [...this.queue, ...this.parked.values()]; this.queue = []; this.parked.clear();
    for (const item of pending) item.reject(error);
  }
  open() {
    if (this.opened || this.stopped) return;
    this.opened = true;
    const queued = this.queue; this.queue = [];
    for (const item of queued) item.release();
    for (let index = this.cursor; index < this.order.length; index++) {
      const key = this.order[index], item = this.parked.get(key);
      if (item) { this.parked.delete(key); item.release(); }
    }
    this.cursor = this.order.length;
    for (const item of this.parked.values()) item.release();
    this.parked.clear();
  }
}

/** Read metadata once; payload refs remain cold until their node is replayed. */
export async function readNativeReplayJournal({ store, parent, runId, ownership, signal, record }) {
  const owner = { sessionId: parent.id, runId };
  record ??= await store.record(parent.id, runId);
  if (!['running', 'failed', 'killed', 'completed'].includes(record?.status)) fail('invalid archived run status.');
  const pointer = pointerOf(record, owner);
  const root = rootChecked(await store.readItem(pointer.rootRef, signal), owner);
  const storedOwnership = ownershipChecked(await store.readItem(root.ownershipRef, signal));
  const expected = nativeReplayOwnership(ownership);
  if (canonicalJson(storedOwnership) !== canonicalJson(expected)) fail('saved source, arguments, directory, or model bindings changed.');
  const events = []; let ref = root.lastChapterRef;
  for (let sequence = root.eventCount; sequence > 0; sequence--) {
    signal?.throwIfAborted();
    const chapter = chapterChecked(await store.readItem(ref, signal), owner, sequence);
    const node = nodeChecked(await store.readItem(chapter.nodeRef, signal), owner);
    events.push(node); ref = chapter.previousChapterRef;
  }
  const nodes = new Map(), actors = new Map(), sites = new Map(), order = []; let settlements = 0;
  for (const node of events.reverse()) {
    const key = keyOf(node), before = nodes.get(key);
    if (!before) {
      if (node.status !== 'running') fail('node was dispatched without a durable running marker.');
      const site = sites.get(node.siteId) ?? { next: 0, kind: node.kind, claimsSettlement: node.claimsSettlement };
      if (node.ordinal !== site.next || node.kind !== site.kind || node.claimsSettlement !== site.claimsSettlement)
        fail('site ordinals are incomplete or the compiled site kind changed.');
      site.next++; sites.set(node.siteId, site);
      if (node.actor) {
        const identity = actorKey(node.actor);
        if (actors.has(identity)) fail('duplicate Actor ask sequence.');
        actors.set(identity, key);
      }
    } else if (!sameIdentity(before, node) || before.status !== 'running') fail('node identity changed or settled more than once.');
    carryTransitionChecked(before, node);
    if (node.status !== 'running' && node.claimsSettlement) {
      if (node.settlementSeq !== ++settlements) fail('settlement chain is incomplete.');
      order.push(key);
    }
    nodes.set(key, node);
  }
  if (nodes.size !== root.nodeCount || settlements !== root.settlementCount) fail('journal root counts do not match its chapters.');
  // A single actor identity must also own a contiguous admission prefix.
  const prefixes = new Map();
  for (const node of nodes.values()) if (node.actor) {
    const identity = JSON.stringify([node.actor.siteId, node.actor.ordinal]);
    const prefix = prefixes.get(identity) ?? { seq: 0, identity: node.actor.identity };
    if (node.actor.seq !== prefix.seq++ || node.actor.identity !== prefix.identity) fail('Actor admission prefix or persona identity changed.');
    prefixes.set(identity, prefix);
  }
  return { root, pointer, nodes, order, ownership: storedOwnership };
}

/** Read-only amendment preflight; completed archives are valid inputs here. */
export async function readNativeReplayJournalRecord({ store, parent, record, runId = record?.runId, ownership, signal }) {
  if (!ownership) fail('archived settings are required to verify replay ownership.');
  const state = await readNativeReplayJournal({ store, parent, record, runId, ownership, signal });
  const entries = [...state.nodes.values()].map(node => structuredClone(node));
  const nodeCounts = Object.fromEntries([...KINDS].map(kind => [kind, { running: 0, completed: 0, failed: 0 }]));
  for (const node of entries) nodeCounts[node.kind][node.status]++;
  // Journal terminal status proves durable host settlement, not a classification
  // of tools an Actor used. Every ask still needs native transcript/stat proof.
  return { journalIntegrityVerified: true, verificationScope: 'journal-metadata', payloadsVerified: false, nodeCounts, version: NATIVE_REPLAY_VERSION, ownership: structuredClone(state.ownership),
    eventCount: state.root.eventCount, settlementCount: state.root.settlementCount, entries,
    uncertainEffects: entries.filter(node => node.status === 'running' && node.kind === 'world-run'),
    runningAsks: entries.filter(node => node.status === 'running' && node.kind === 'ask'),
    asksRequiringEffectReview: entries.filter(node => node.kind === 'ask'),
    worldRunsRequiringOutcomeReview: entries.filter(node => node.kind === 'world-run') };
}
export const preflightNativeReplayJournalRecord = readNativeReplayJournalRecord;

/**
 * Create after store.begin, before any workflow effect. Reopen only an existing
 * explicit v3 pointer. Both paths use the same public PTC executor in the caller.
 * Native v3 site ordinals start at zero, matching existing OMAA bindings.
 */
export async function createNativeReplayJournal({ store, parent, runId, ownership, signal, replay = false,
  replayRunningAsk, preflightRunningAsk, onReplayAsk }) {
  const owner = { sessionId: parent.id, runId }, expected = nativeReplayOwnership(ownership);
  let state;
  if (replay) {
    const record = await store.record(parent.id, runId);
    if (!['running', 'failed', 'killed'].includes(record?.status) || record.supersededBy !== undefined)
      fail('only an interrupted, failed, or stopped unsuperseded execution can resume.');
    state = await readNativeReplayJournal({ store, parent, runId, ownership, signal, record });
  }
  else {
    const ownershipRef = await store.saveItem(expected);
    const root = envelope('root', { ...owner, ownershipRef, eventCount: 0, nodeCount: 0, settlementCount: 0 });
    const rootRef = await store.saveItem(root);
    await store.mutate(parent.id, runId, record => {
      if (record.sessionId !== owner.sessionId || record.runId !== owner.runId || !object(record.execution)
        || record.status !== 'running' || record.execution.replay !== undefined
        || record.revision !== 1 || record.artifacts?.length !== 0 || record.reports?.length !== 0
        || record.execution.actors?.length !== 0 || record.execution.world?.length !== 0)
        fail('journal must be attached to a fresh running execution before its first effect.');
      record.execution.replay = { format: FORMAT, version: NATIVE_REPLAY_VERSION, rootRef };
    }, { signal });
    state = { root, nodes: new Map(), order: [], pointer: { format: FORMAT, version: NATIVE_REPLAY_VERSION, rootRef } };
  }
  // Stop before executing any source when a previous external effect has an
  // uncertain outcome. Running observations/immutable preparation can retry;
  // an unclassified mutating world effect cannot safely do so.
  if (replay) for (const node of state.nodes.values()) if (node.status === 'running') {
    if (node.kind === 'world-run') {
      const error = Error('Native same-run replay: uncertain external effect at ' + node.siteId + '@' + node.ordinal + '.');
      error.code = 'uncertain_effect'; throw error;
    }
    if (node.kind === 'ask') {
      if (typeof replayRunningAsk !== 'function' || typeof preflightRunningAsk !== 'function') {
        const error = Error('Native same-run replay: running ask has no validated native carry hooks.');
        error.code = 'uncertain_effect'; throw error;
      }
      await preflightRunningAsk(structuredClone(node));
    }
  }
  const originalKeys = new Set(state.nodes.keys()), visited = new Set(), ordinals = new Map(), actorAdmissions = new Map(), transportOrdinals = new Map();
  const gate = new SettleGate(state.order), pending = new Set(), cachedPending = new Set();
  let closed = false, poison;
  const approvedSourceHashes = new Set([expected.scriptHash]);
  const checkActive = () => { if (poison) throw poison; signal?.throwIfAborted(); };
  const check = () => { checkActive(); if (closed) fail('journal is closed.'); };
  const stop = error => {
    const failure = error instanceof Error ? error : Error('Native replay integrity failure: ' + String(error));
    poison ??= failure; gate.stop(poison);
  };
  const onAbort = () => stop(abortError(signal));
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const track = (work, cached) => {
    pending.add(work); if (cached) cachedPending.add(work);
    work.finally(() => { pending.delete(work); cachedPending.delete(work); }).catch(() => {});
    return work;
  };

  const savePayload = async encode => {
    try { return await store.saveItem(encode()); }
    catch (error) { stop(error); throw error; }
  };

  // Summary persistence is the commit point. A terminal payload, global order,
  // and optional authoritative report/artifact mutation share that one commit.
  async function append(node, commit) {
    let committedRoot, rootRef, settledNode, committedValue;
    await store.mutate(parent.id, runId, async record => {
      const pointer = pointerOf(record, owner);
      if (canonicalJson(pointer.rootRef) !== canonicalJson(state.pointer.rootRef)) {
        // A live hole fill can atomically replace just effective-source ownership
        // in its existing metadata transaction. No chapter or count may change.
        const updated = rootChecked(await store.readItem(pointer.rootRef), owner);
        const sourceOwner = ownershipChecked(await store.readItem(updated.ownershipRef));
        if (updated.eventCount !== state.root.eventCount || updated.nodeCount !== state.root.nodeCount
          || updated.settlementCount !== state.root.settlementCount
          || canonicalJson(updated.lastChapterRef) !== canonicalJson(state.root.lastChapterRef)
          || !approvedSourceHashes.has(sourceOwner.scriptHash) || sourceOwner.argsHash !== expected.argsHash
          || sourceOwner.cwd !== expected.cwd || sourceOwner.modelBindingsHash !== expected.modelBindingsHash
          || sourceOwner.subagentModelHash !== expected.subagentModelHash)
          fail('journal changed outside its execution owner.');
        state.root = updated; state.pointer = structuredClone(pointer);
      }
      const before = state.nodes.get(keyOf(node));
      if (before ? !sameIdentity(before, node) || before.status !== 'running' : node.status !== 'running') fail('invalid node transition.');
      carryTransitionChecked(before, node);
      const root = state.root;
      settledNode = { ...node };
      if (node.status !== 'running' && node.claimsSettlement) settledNode.settlementSeq = root.settlementCount + 1;
      if (commit) {
        // Source return closes new admission, but this immutable preparation
        // was already admitted. Its publication may complete before the caller
        // cancels live work; the mutation signal guards the final commit point.
        checkActive();
        let value;
        try { value = await commit(record, { siteId: node.siteId, ordinal: node.ordinal }); }
        catch (error) { throw new CommitFailure(error); }
        committedValue = value;
        settledNode.resultRef = await store.saveItem(savedValue(value));
      }
      nodeChecked(settledNode, owner);
      const nodeRef = await store.saveItem(settledNode);
      const sequence = root.eventCount + 1;
      const lastChapterRef = await store.saveItem(envelope('chapter', { ...owner, sequence, nodeRef,
        ...(root.lastChapterRef === undefined ? {} : { previousChapterRef: root.lastChapterRef }) }));
      committedRoot = { ...root, eventCount: sequence, nodeCount: root.nodeCount + (before ? 0 : 1),
        settlementCount: root.settlementCount + (node.status !== 'running' && node.claimsSettlement ? 1 : 0), lastChapterRef };
      rootRef = await store.saveItem(committedRoot);
      record.execution.replay = { format: FORMAT, version: NATIVE_REPLAY_VERSION, rootRef };
    }, commit ? { signal } : undefined);
    state.root = committedRoot; state.pointer = { format: FORMAT, version: NATIVE_REPLAY_VERSION, rootRef };
    state.nodes.set(keyOf(settledNode), settledNode);
    return { node: settledNode, value: committedValue };
  }
  // Keep local root updates serialized too: store.mutate's queue may start the
  // next callback before an awaiting caller has observed the previous commit.
  let writes = Promise.resolve();
  const write = (node, commit) => {
    const work = writes.then(() => append(node, commit));
    writes = work.catch(error => { if (!(error instanceof CommitFailure)) stop(error); });
    return work;
  };
  function admit(meta) {
    check();
    if (!object(meta) || !text(meta.siteId) || !KINDS.has(meta.kind)) fail('invalid compiled effect site.');
    const claimsSettlement = meta.claimsSettlement ?? meta.kind !== 'report';
    const site = ordinals.get(meta.siteId) ?? { next: 0, kind: meta.kind, claimsSettlement };
    if (site.kind !== meta.kind || site.claimsSettlement !== claimsSettlement) fail('compiled site changed kind or settlement behavior.');
    const ordinal = site.next++; ordinals.set(meta.siteId, site);
    const actor = meta.kind === 'ask' ? actorChecked(meta.actor) : undefined;
    if (meta.kind !== 'ask' && meta.actor !== undefined) fail('unexpected Actor identity.');
    if (actor) {
      const key = JSON.stringify([actor.siteId, actor.ordinal]);
      const prefix = actorAdmissions.get(key) ?? { next: 0, identity: actor.identity };
      if (actor.seq !== prefix.next || actor.identity !== prefix.identity) fail('Actor calls changed identity or contiguous admission order.');
      prefix.next++; actorAdmissions.set(key, prefix);
    }
    const node = nodeChecked(envelope('node', { ...owner, siteId: meta.siteId, ordinal, kind: meta.kind,
      inputHash: digest(meta.args), status: 'running', claimsSettlement, ...(actor ? { actor } : {}) }), owner);
    const key = keyOf(node), before = state.nodes.get(key);
    if (visited.has(key) || before && !sameIdentity(before, node)) fail('kind, input hash, or Actor identity mismatched before dispatch.');
    visited.add(key);
    return { node, before, key };
  }
  async function hit(before, key, meta) {
    let restored;
    try {
      if (before.kind === 'ask' && onReplayAsk) await onReplayAsk(structuredClone(before), meta);
      const payload = await store.readItem(before.status === 'completed' ? before.resultRef : before.errorRef, signal);
      restored = before.status === 'completed' ? restoreValue(payload) : restoreError(payload);
    } catch (error) {
      // Hydration/continuity integrity failures are not the recorded task's
      // failure. Poison admission even if workflow source catches the error.
      stop(error); throw error;
    }
    const release = () => { if (before.status === 'failed') throw restored; return restored; };
    if (!before.claimsSettlement) return release();
    return new Promise((resolve, reject) => gate.hold(key, () => { try { resolve(release()); } catch (error) { reject(error); } }, reject));
  }
  async function execute(admission, meta, prepare, commit) {
    const { node, before, key } = admission;
    if (before && before.status !== 'running') return hit(before, key, meta);
    if (before?.kind === 'ask' && typeof replayRunningAsk !== 'function') fail('a recorded running ask requires native carry validation.');
    const carry = before?.kind === 'ask' ? await replayRunningAsk(structuredClone(before), meta) : undefined;
    if (!before) await write(node);
    check();
    const instance = { siteId: node.siteId, ordinal: node.ordinal };
    const context = { instance, recorded: before && structuredClone(before), carry,
      updateRunning: carryRef => updateRunning(instance, carryRef) };
    let value;
    try { value = await prepare(context); }
    catch (error) {
      // Cancellation says nothing about whether an accepted native task or
      // external operation finished. Keep RUNNING so recovery must validate
      // carry or stop on uncertain_effect instead of caching cancellation.
      if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'uncertain_effect') {
        stop(error); throw error;
      }
      const errorRef = await savePayload(() => savedError(error));
      await write({ ...(state.nodes.get(key) ?? node), status: 'failed', errorRef });
      throw error;
    }
    if (commit) {
      let settled;
      try { settled = await write({ ...(state.nodes.get(key) ?? node), status: 'completed' }, (record, current) => commit(record, value, current)); }
      catch (error) {
        if (!(error instanceof CommitFailure)) throw error;
        if (signal?.aborted || error.cause?.name === 'AbortError' || error.cause?.code === 'uncertain_effect') {
          stop(error.cause); throw error.cause;
        }
        // The store discarded the draft, including any partial authoritative
        // edits. Publish only the failure and its original-order position.
        const errorRef = await savePayload(() => savedError(error.cause));
        await write({ ...(state.nodes.get(key) ?? node), status: 'failed', errorRef });
        throw error.cause;
      }
      return settled.value;
    }
    const resultRef = await savePayload(() => savedValue(value));
    await write({ ...(state.nodes.get(key) ?? node), status: 'completed', resultRef });
    return value;
  }
  function updateRunning(instance, carryRef) {
    const invalid = message => {
      const error = Error(message); error.code = 'uncertain_effect'; stop(error); return Promise.reject(error);
    };
    if (!reference(carryRef)) return invalid('Invalid native ask carry reference.');
    const node = state.nodes.get(keyOf(instance));
    if (!node || node.kind !== 'ask' || node.status !== 'running') return invalid('No running ask owns this native carry.');
    return write({ ...node, carryRef });
  }
  return {
    version: NATIVE_REPLAY_VERSION,
    transport(meta, operation) {
      let cached = false;
      const work = (async () => {
        // Invoke at the outermost binding boundary, before any per-kind awaits.
        // Operation must include UI bookkeeping and final response mapping. The
        // script's common gate consumes this committed sequence AFTER RPC arrival.
        check();
        if (!object(meta) || !text(meta.siteId) || !['ask', 'world-read', 'world-run', 'artifact'].includes(meta.kind)
          || typeof operation !== 'function') fail('invalid promise-effect transport binding.');
        const ordinal = transportOrdinals.get(meta.siteId) ?? 0;
        transportOrdinals.set(meta.siteId, ordinal + 1);
        const instance = { siteId: meta.siteId, ordinal };
        const recorded = state.nodes.get(keyOf(instance));
        cached = recorded !== undefined && recorded.status !== 'running';
        let outcome, rejection, rejected = false;
        try {
          const value = await operation({ instance });
          outcome = value === undefined ? { ok: true, undefined: true } : { ok: true, value: plain(value) };
        } catch (error) {
          rejected = true; rejection = error; outcome = { ok: false, error: transportError(error) };
        }
        const node = state.nodes.get(keyOf(instance));
        if (!visited.has(keyOf(instance)) || !node || node.kind !== meta.kind || !node.claimsSettlement
          || node.status === 'running' || !integer(node.settlementSeq, 1)) {
          // There is no durable terminal fact to authorize a sequence. A thrown
          // unknown effect remains the actual interruption, never a made-up token.
          if (rejected) { stop(rejection); throw rejection; }
          const error = Error('Native same-run replay: final RPC outcome has no matching committed settlement.');
          error.code = 'uncertain_effect'; stop(error); throw error;
        }
        if (rejected && node.status === 'completed') {
          // A durable success cannot become a catchable task failure merely
          // because response bookkeeping failed. Replay would otherwise expose
          // a different branch on the next activation of this same run.
          const error = Error('Native same-run replay: delivery failed after a completed effect: ' + transportError(rejection).message);
          error.code = 'replay_delivery_failed'; error.cause = rejection;
          stop(error); throw error;
        }
        if (poison) throw poison;
        return decodeNativeSettlementEnvelope({ format: SETTLEMENT_FORMAT, version: 1, sequence: node.settlementSeq, outcome });
      })();
      return track(work.catch(error => { stop(error); throw error; }), cached);
    },
    entries: () => [...state.nodes.values()].map(node => structuredClone(node)),
    run(meta, driver) {
      try {
        const admission = admit(meta);
        return track(execute(admission, meta, driver), admission.before && admission.before.status !== 'running');
      }
      catch (error) { stop(error); return Promise.reject(error); }
    },
    runAtomic(meta, prepare, commit) {
      try {
        if (typeof commit !== 'function') fail('atomic binding needs an authoritative commit callback.');
        const admission = admit(meta);
        return track(execute(admission, meta, prepare, commit), admission.before && admission.before.status !== 'running');
      } catch (error) { stop(error); return Promise.reject(error); }
    },
    updateRunning,
    async noteEffectiveSource(record, script) {
      if (typeof script !== 'string') fail('effective source must be text.');
      const pointer = pointerOf(record, owner);
      const root = rootChecked(await store.readItem(pointer.rootRef), owner);
      const previous = ownershipChecked(await store.readItem(root.ownershipRef));
      if (previous.argsHash !== expected.argsHash || previous.cwd !== expected.cwd
        || previous.modelBindingsHash !== expected.modelBindingsHash
        || previous.subagentModelHash !== expected.subagentModelHash) fail('effective source update changed execution settings.');
      const scriptHash = digest(script);
      const ownershipRef = await store.saveItem({ ...previous, scriptHash });
      const rootRef = await store.saveItem({ ...root, ownershipRef });
      approvedSourceHashes.add(scriptHash);
      record.execution.replay = { format: FORMAT, version: NATIVE_REPLAY_VERSION, rootRef };
    },
    async finish() {
      try {
        check();
        for (const key of originalKeys) if (!visited.has(key)) fail('workflow ended before reaching a recorded effect.');
      } catch (error) { stop(error); throw error; }
      // Script return closes host admission first. Cached promises the script
      // dropped must drain even if attachment reads arrive after this point.
      // Live dropped tasks remain the caller's cancellation responsibility.
      closed = true; gate.open();
      await Promise.allSettled([...cachedPending]); await writes;
      if (poison) throw poison;
    },
    async dispose(error = Error('Native same-run replay disposed.')) {
      closed = true; gate.stop(error); signal?.removeEventListener('abort', onAbort);
      await Promise.allSettled([...pending]); await writes;
    },
  };
}
