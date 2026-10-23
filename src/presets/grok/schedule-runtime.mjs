import { createHash, randomUUID } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { startActivation } from '../../host/subagents.mjs';
import { GROK_SCHEDULE_HISTORY_LIMIT, GROK_SCHEDULE_RECORD_LIMIT, GROK_SCHEDULE_PROMPT_BYTES } from '../../host/grok-schedule-records.mjs';
import { createGrokScheduleExpiry } from './schedule-expiry.mjs';
import { createGrokCompletionReceipts } from './completion-receipts.mjs';
import { withGrokScheduleTransaction, grokUpdatedTarget } from '../../host/grok-schedule-transaction.mjs';

const PRESET = 'omaa-grok';
const DAY = 86400_000;
const MAX_FRAME_BYTES = 512 * 1024;
const MAX_CHILD_EVENTS = 4096;
const MAX_CHILD_LOG_BYTES = 4 * 1024 * 1024;
const FRESH_CHAIN_EVERY = 10;
const utc = () => new Date(Date.now()).toISOString();
const reason = text => String(text).slice(0, 512);
const instant = text => typeof text === 'string' && /^\d{4}-/.test(text)
  && Number.isFinite(Date.parse(text)) && new Date(Date.parse(text)).toISOString() === text;
const markerFor = () => `[OMAA GROK DISPATCH ${randomUUID()}]\nThis is an adapter dispatch reference. It contains no task instructions. If the owning adapter is unavailable, report that scheduled dispatch is unavailable and do not infer a task.`;
const scheduleIdentity = service => service?.[symbols.original] ?? service;
const ownKeys = (row, names) => row && typeof row === 'object' && !Array.isArray(row)
  && Object.keys(row).sort().join(',') === [...names].sort().join(',');
const validRow = row => ownKeys(row, ['schedule_id', 'occurrence_at', 'reminder_prompt'])
  && typeof row.schedule_id === 'string' && row.schedule_id.length > 0 && row.schedule_id.length <= 512
  && instant(row.occurrence_at) && typeof row.reminder_prompt === 'string';
function summaryOf(blocks) {
  let output = '', remaining = 600, seen = false;
  for (const block of blocks ?? []) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue;
    if (seen) {
      if (remaining === 0) return output + '…';
      output += '\n'; remaining--;
    }
    seen = true;
    for (const point of block.text) {
      if (remaining === 0) return output + '…';
      output += point; remaining--;
    }
  }
  return output;
}
function iterationPrompt(owner, priorSummary, fallback) {
  const size = owner.seconds % 86400 === 0 ? 86400 : owner.seconds % 3600 === 0 ? 3600 : owner.seconds % 60 === 0 ? 60 : 1;
  const unit = size === 86400 ? 'day' : size === 3600 ? 'hour' : size === 60 ? 'minute' : 'second', count = owner.seconds / size;
  const human = owner.kind === 'after' ? `once after ${owner.seconds} seconds` : `every ${count} ${unit}${count === 1 ? '' : 's'}`;
  // Fixed reminders/mod.rs:130-151. The optional tool footer is omitted: this
  // adapter's child cannot itself mutate the ordinary parent's schedule.
  return `<system-reminder>\nScheduled task ${owner.id} (${human}). Earlier iterations, if any, appear above.\n`
    + 'Run the task below. End with a short status: what changed or needs attention. The status is relayed to the main agent.\n'
    + (priorSummary === undefined ? '' : `\nYour previous iteration ended with:\n${priorSummary}\n`)
    + (fallback ? '\nThis iteration starts fresh because the previous child could not be safely continued. Do not infer unverified earlier results.\n' : '')
    + `\n</system-reminder>\n\n${owner.prompt}`;
}

// Only actual native Schedule attribution plus the exact fixed framing enters
// this parser. User text resembling that framing grants no scheduler authority.
export function parseGrokScheduleDue(message) {
  if (message?.source?.kind !== 'schedule' || message.content?.length !== 1
    || message.content[0].type !== 'text' || typeof message.content[0].text !== 'string') return;
  const text = message.content[0].text;
  if (Buffer.byteLength(text) > MAX_FRAME_BYTES) return;
  const lines = text.split('\n');
  try {
    let rows;
    if (lines.length === 5 && lines[0] === '[SCHEDULE REMINDER]' && lines[1] === 'This is a scheduled message from the user'
      && lines[2].startsWith('schedule_id_json: ') && lines[3].startsWith('occurrence_at: ') && lines[4].startsWith('reminder_prompt_json: ')) {
      rows = [{ schedule_id: JSON.parse(lines[2].slice(18)), occurrence_at: lines[3].slice(15), reminder_prompt: JSON.parse(lines[4].slice(22)) }];
    } else if (lines.length === 3 && lines[0] === '[SCHEDULE REMINDER BATCH]' && lines[1] === 'This is a scheduled message from the user'
      && lines[2].startsWith('reminders_json: ')) rows = JSON.parse(lines[2].slice(16));
    if (!Array.isArray(rows) || rows.length === 0 || !rows.every(validRow)) return;
    // Canonical JSON, rather than a permissive JSON lookalike, is native framing.
    if (lines[0] === '[SCHEDULE REMINDER BATCH]' && lines[2] !== 'reminders_json: ' + JSON.stringify(rows)) return;
    if (lines[0] === '[SCHEDULE REMINDER]' && (lines[2] !== 'schedule_id_json: ' + JSON.stringify(rows[0].schedule_id)
      || lines[4] !== 'reminder_prompt_json: ' + JSON.stringify(rows[0].reminder_prompt))) return;
    return rows;
  } catch { return; }
}

const canonical = value => {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  throw Error('Native standing policy cannot be captured as plain data.');
};
const contentHash = content => createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
const continuationReference = owner => owner.marker + '\nDo not repeat prior iterations from conversation history for this reference. Only the owning adapter can supply the new occurrence instructions.';
function awaitAdmission(child, signal) {
  const signals = [signal, child.scope.signal];
  if (signals.some(source => source.aborted)) return Promise.resolve(false);
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      for (const source of signals) source.removeEventListener('abort', abort);
      resolve(Boolean(value));
    };
    const abort = () => finish(false);
    for (const source of signals) source.addEventListener('abort', abort, { once: true });
    void child.admission.promise.then(finish, abort);
    if (signals.some(source => source.aborted)) abort();
  });
}

// This host-wide adapter deliberately stays mounted when the owning session
// changes preset. Native reminders contain inert markers; author task text is
// present only in the authoritative owner row and in a controlled child prompt.
export function createGrokScheduleRuntime(ctx, hub, records) {
  const runtimeId = randomUUID(), queues = new Map(), scopes = new Set(), children = new Map(), writes = new Set(), poisoned = new Set();
  const runEpochs = new Map(), draining = new Map();
  const usedImmediateExecutions = new WeakSet();
  const expiryPending = new Set(), expiryPoisoned = new Set();
  let expiry, expirySchedule;
  let hostSeam, completions;
  let closed = false;
  const listeners = [];
  const on = (...args) => listeners.push(ctx.on(...args));
  try {
  const optional = (agent, name) => agent?.ctx?.get(name) ?? ctx.get(name);
  const serialize = (id, work) => {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    queues.set(id, next);
    return next.finally(() => { if (queues.get(id) === next) queues.delete(id); });
  };
  const track = promise => {
    writes.add(promise);
    void promise.catch(error => ctx.logger.warn('Grok schedule adapter: ' + reason(error?.message ?? 'operation failed')))
      .finally(() => writes.delete(promise));
    return promise;
  };
  const putOwner = async owner => {
    const saved = await records.put(owner);
    expiry?.notify();
    return saved;
  };
  function presetOf(agent) {
    const roster = optional(agent, 'agentPresets');
    if (typeof roster?.composedPreset !== 'function') throw Error('Native composed preset identity is unavailable.');
    return roster.composedPreset(agent.ctx);
  }
  function policyFor(agent) {
    const sandbox = optional(agent, 'sandboxPolicy');
    if (typeof sandbox?.resolve !== 'function') throw Error('Native standing sandbox policy is unavailable.');
    const approval = optional(agent, 'approval'), permissions = optional(agent, 'permissionPresets');
    if (approval && typeof approval.overrideOf !== 'function') throw Error('Native approval policy observation is unavailable.');
    if (permissions && typeof permissions.current !== 'function') throw Error('Native permission preset observation is unavailable.');
    const key = JSON.stringify(canonical({ sandbox: sandbox.resolve({ session: agent.session }),
      approval: approval ? { override: approval.overrideOf(agent.session) ?? null, configured: approval.config?.policy ?? null } : null,
      permissionPreset: permissions?.current(agent.session) ?? null }));
    if (key.length > 8192) throw Error('Native standing policy exceeds the adapter record bound.');
    return key;
  }
  function checkIdentity(agent) {
    if (closed || !agent || ctx.agents.get(agent.id) !== agent || agent.session.header.origin === 'subagent'
      || Number(agent.session.header.delegationDepth ?? 0) > 0) throw Error('Grok scheduler requires its exact ordinary live parent.');
    if (hub.product(agent.session)?.id !== 'grok' || presetOf(agent) !== PRESET) throw Error('The owning Grok preset is no longer active.');
  }
  function check(agent, expectedPolicy) {
    checkIdentity(agent);
    if (hub.modeFor(agent.session, agent) !== 'default') throw Error('Scheduled children require default execution mode.');
    const key = policyFor(agent);
    if (expectedPolicy !== undefined && key !== expectedPolicy) throw Error('The scheduled task standing policy changed; recreate it under the reviewed policy.');
    return key;
  }
  function immediateGrant(exec, { seconds, prompt, recurring }, signal, policyKey) {
    const args = exec.arguments;
    // The trusted scheduler body passes the ORIGINAL registry ToolRunContext.
    // Fixed tools/index.ts:412-419,1499-1596: body invocation follows native
    // gates and receives fused cancellation. Shape checks do not independently
    // authenticate a token: there is no public token-verification API.
    if (!exec || exec.name !== 'scheduler_create' || typeof exec.token !== 'symbol'
      || typeof exec.deferContext !== 'function' || !args || !Object.isFrozen(args)
      || args.fire_immediately !== true || args.task_id !== undefined || args.durable === true
      || args.prompt !== prompt || (args.recurring ?? true) !== recurring
      || typeof exec.callId !== 'string' || !exec.callId || exec.callId.length > 512
      || typeof exec.rootCallId !== 'string' || !exec.rootCallId || exec.rootCallId.length > 512)
      throw Error('Immediate dispatch requires this actual accepted scheduler_create body and its explicit creation arguments.');
    const match = typeof args.interval === 'string' && args.interval.trim().match(/^\+?(\d+)([smhd])$/);
    const requestedSeconds = match && BigInt(match[1]) * { s: 1n, m: 60n, h: 3600n, d: 86400n }[match[2]];
    if (!requestedSeconds || requestedSeconds > BigInt(Number.MAX_SAFE_INTEGER)
      || Math.max(60, Number(requestedSeconds)) !== seconds)
      throw Error('Immediate dispatch cadence must match the actual scheduler_create arguments.');
    if (usedImmediateExecutions.has(exec)) throw Error('This immediate creation execution was already used; do not automatically retry it.');
    exec.signal.throwIfAborted(); signal.throwIfAborted();
    usedImmediateExecutions.add(exec);
    return { exec, agent: exec.agent, token: exec.token, args, callId: exec.callId, rootCallId: exec.rootCallId, policyKey };
  }
  function checkGrant(grant, agent) {
    const exec = grant.exec;
    exec.signal.throwIfAborted();
    if (exec.agent !== agent || grant.agent !== agent || exec.arguments !== grant.args || exec.token !== grant.token
      || exec.callId !== grant.callId || exec.rootCallId !== grant.rootCallId || exec.name !== 'scheduler_create')
      throw Error('The actual immediate creation execution identity changed.');
    check(agent, grant.policyKey);
  }
  const nativeSchedule = agent => {
    const schedule = optional(agent, 'schedule');
    if (!schedule || typeof schedule.create !== 'function' || typeof schedule.catalog !== 'function') throw Error('Native schedule management is unavailable.');
    return schedule;
  };
  const nativeRecord = async (agent, id) => (await nativeSchedule(agent).catalog()).find(row => row.id === id && row.sessionId === agent.id);
  const sameRule = (owner, native) => {
    if (!native || native.prompt !== owner.marker || native.kind !== owner.kind
      || (owner.kind === 'every' ? native.everySeconds : native.afterSeconds) !== owner.seconds) return false;
    if (!instant(owner.initialScheduledAt) || !instant(native.scheduledAt)) return false;
    if (owner.kind !== 'every') return native.scheduledAt === owner.initialScheduledAt;
    // Native every dispatch advances by whole intervals from its saved target.
    // An external cadence edit and edit-back can retain marker/seconds while
    // changing this phase; do not mistake that row for the original owned rule.
    const initial = Date.parse(owner.initialScheduledAt), target = Date.parse(native.scheduledAt);
    const interval = owner.seconds * 1000, offset = target - initial;
    return Number.isSafeInteger(initial) && Number.isSafeInteger(target)
      && Number.isSafeInteger(interval) && interval > 0 && Number.isSafeInteger(offset)
      && offset >= 0 && offset % interval === 0;
  };
  async function checkNativeDue(agent, owner, native, message, due) {
    if (!instant(native.scheduledAt) || !['active', 'inactive'].includes(native.status)) throw Error('Native occurrence state is unavailable.');
    if (owner.kind === 'after' && native.scheduledAt !== due.occurrence_at) throw Error('Native one-shot target does not match this occurrence.');
    // followup happens before inbox flush/task commit (fixed runtime.ts:123-139).
    // The still-due target is a valid pre-commit origin; do not require an ACK
    // which that native delivery has not yet had an opportunity to publish.
    if (native.status === 'active' && native.scheduledAt <= due.occurrence_at) return;
    const matches = receipt => receipt?.scheduledAt === due.occurrence_at && receipt.messageId === message.id;
    if (matches(native.lastDelivery)) return;
    const schedule = nativeSchedule(agent);
    if (typeof schedule.history !== 'function') throw Error('Native delivery evidence for this queued occurrence is unavailable.');
    const history = await schedule.history({ sessionId: agent.id, id: owner.id, limit: 100 });
    if (history.id !== owner.id || !Array.isArray(history.records) || !history.records.some(receipt => matches(receipt)
      && (receipt.prompt === undefined || receipt.prompt === owner.marker)))
      throw Error('This queued occurrence has no matching native delivery receipt in the bounded history lookup.');
    // A native inbox receipt verifies origin only. It is never child acceptance
    // or completion, and cannot substitute for the controlled activation seam.
  }
  const publicRecord = (owner, native) => {
    const last = owner.occurrences.reduce((latest, row) => !latest || row.occurrenceAt > latest.occurrenceAt ? row : latest, undefined);
    return { id: owner.id, kind: owner.kind, title: native.title, prompt: owner.prompt,
      scheduledAt: native.scheduledAt, ...(owner.kind === 'every' ? { everySeconds: owner.seconds } : { afterSeconds: owner.seconds }),
      adapterStatus: owner.status === 'EXPIRED' ? 'EXPIRED' : poisoned.has(owner.id) ? 'UNKNOWN' : owner.status,
      ...(owner.expiresAt ? { expiresAt: owner.expiresAt } : {}),
      ...(owner.expiryRemoval ? { expiryRemoval: { ...owner.expiryRemoval,
        ...(owner.expiryRemoval.receipt ? { receipt: { ...owner.expiryRemoval.receipt } } : {}) } } : {}),
      ...(last ? { lastOccurrence: { occurrenceAt: last.occurrenceAt, state: last.state,
        sourceKind: last.sourceKind,
        ...(last.sourceKind === 'schedule' ? { sourceMessageId: last.sourceMessageId }
          : { sourceCallId: last.sourceCallId, rootCallId: last.rootCallId }),
        ...last.childId ? { childId: last.childId } : {}, ...last.runId ? { runId: last.runId } : {},
        ...last.acceptedMessageId ? { acceptedMessageId: last.acceptedMessageId } : {},
        ...last.executionMode ? { executionMode: last.executionMode } : {},
        ...last.chainIteration ? { chainIteration: last.chainIteration } : {},
        ...last.chainReason ? { chainReason: last.chainReason } : {},
        ...(typeof last.terminalDurable === 'boolean' ? { terminalDurable: last.terminalDurable } : {}),
        ...last.stopReason ? { stopReason: last.stopReason } : {}, ...last.reason ? { reason: last.reason } : {} } } : {}) };
  };
  const requireOwner = (agent, id) => {
    const owner = records.get(id);
    if (!owner || owner.sessionId !== agent.id || owner.owningPreset !== PRESET) throw Error('This task has no Grok adapter ownership; use native reminder management for legacy reminders.');
    return owner;
  };
  const historyWith = (owner, occurrence) => {
    const other = owner.occurrences.filter(row => row.occurrenceAt !== occurrence.occurrenceAt);
    // Unresolved records are never evicted; highWaterAt suppresses older known
    // occurrences after bounded terminal-history retention removes their row.
    const unresolved = other.filter(row => ['RUNNING', 'ACCEPTED', 'UNKNOWN'].includes(row.state));
    const terminal = other.filter(row => !['RUNNING', 'ACCEPTED', 'UNKNOWN'].includes(row.state));
    if (unresolved.length >= GROK_SCHEDULE_HISTORY_LIMIT) throw Error('Unresolved Grok occurrence history is full.');
    return [...terminal.slice(-(GROK_SCHEDULE_HISTORY_LIMIT - unresolved.length - 1) || terminal.length), ...unresolved, occurrence].slice(-GROK_SCHEDULE_HISTORY_LIMIT);
  };
  async function saveOccurrence(id, occurrence, extra = {}) {
    const owner = records.get(id);
    if (!owner) throw Error('Grok occurrence owner disappeared.');
    return putOwner({ ...owner, ...extra, occurrences: historyWith(owner, occurrence) });
  }
  async function unknown(id, occurrence, message) {
    poisoned.add(id);
    const status = ['EXPIRED', 'DELETED'].includes(records.get(id)?.status) ? records.get(id).status : 'UNKNOWN';
    try { await saveOccurrence(id, { ...occurrence, state: 'UNKNOWN', reason: reason(message) }, { status, reason: reason(message) }); }
    catch { ctx.logger.warn(`Grok schedule ${id}: outcome remains unknown; durable recovery was unavailable.`); }
  }
  completions = createGrokCompletionReceipts({ ctx, records, checkIdentity, serialize, saveOccurrence, hash: contentHash,
    getPending: id => children.get(id), isCurrentRun: pending => runEpochs.get(pending.childId) === pending.runInfo?.runId,
    isClosed: () => closed });
  async function relinquishMarker(id) {
    return serialize(id, async () => {
      const owner = records.get(id);
      if (!owner || owner.status !== 'ACTIVE') return;
      try { await putOwner({ ...owner, status: 'FENCED', reason: 'Native reminder content changed outside the Grok adapter; ownership was relinquished.' }); }
      catch {
        poisoned.add(id);
        try { await putOwner({ ...owner, status: 'UNKNOWN', reason: 'Native reminder ownership fence persistence is unknown.' }); }
        catch { ctx.logger.warn(`Grok schedule ${id}: ownership fence persistence is unknown.`); }
      }
    });
  }
  const expiryEligible = owner => owner?.owningPreset === PRESET && owner.kind === 'every' && owner.expiresAt
    && !expiryPoisoned.has(owner.id) && (['ACTIVE', 'UNKNOWN'].includes(owner.status)
      || owner.status === 'EXPIRED' && (!owner.expiryRemoval || owner.expiryRemoval.state === 'PENDING'
        || owner.expiryRemoval.state === 'FENCED' && owner.expiryRemoval.reason?.startsWith('Dispatch expired; native reminder retained because')));
  function expireOwner(id, signal) {
    const queued = serialize(id, async () => {
      const owner = records.get(id);
      if (closed || signal.aborted || !expiryEligible(owner) || Date.now() < Date.parse(owner.expiresAt)) return;
      const schedule = expirySchedule;
      if (!schedule || scheduleIdentity(ctx.get('schedule')) !== schedule || typeof schedule.catalog !== 'function')
        throw Error('Native expiry catalog is unavailable.');
      const control = new AbortController();
      const pending = { control, schedule };
      expiryPending.add(pending); // Register before the catalog read can await.
      const guarded = AbortSignal.any([signal, control.signal]);
      let intent = false, expectedOwner = owner;
      const checkOwner = () => {
        guarded.throwIfAborted();
        if (closed || expirySchedule !== schedule || scheduleIdentity(ctx.get('schedule')) !== schedule)
          throw Error('Native expiry service residency changed.');
        if (records.get(id) !== expectedOwner || owner.revision !== records.get(id)?.revision
          || owner.expiresAt !== records.get(id)?.expiresAt || Date.now() < Date.parse(owner.expiresAt))
          throw Error('The saved expiry owner or deadline changed.');
      };
      const fact = (state, extra = {}) => ({ state, id: owner.id, expiresAt: owner.expiresAt,
        ownerRevision: owner.revision, observedAt: utc(), ...extra });
      const save = async removal => {
        intent = true;
        expectedOwner = await putOwner({ ...records.get(id), status: 'EXPIRED', expiryRemoval: removal });
        return expectedOwner;
      };
      try {
        if (Date.parse(owner.expiresAt) !== Date.parse(owner.createdAt) + 7 * DAY) {
          await save(fact('FENCED', { reason: 'The saved deadline does not prove the fixed seven-day creation grant.' }));
          return;
        }
        const rows = await schedule.catalog();
        checkOwner();
        if (!Array.isArray(rows)) throw Error('Native expiry catalog is unavailable.');
        const matches = rows.filter(row => row.id === id);
        if (!matches.length) { await save(fact('ABSENT', { observedAbsent: true })); return; }
        const native = matches[0];
        if (matches.length !== 1 || native.sessionId !== owner.sessionId || native.id !== owner.id
          || !sameRule(owner, native) || !['active', 'inactive'].includes(native.status)) {
          await save(fact('FENCED', { reason: 'The native task binding or rule changed; its real reminder was retained.' }));
          return;
        }
        // The condition and removal share Schedule's own FIFO slot with
        // delivery, human edits and archive. No read-then-delete lease.
        await withGrokScheduleTransaction(schedule, { sessionId: owner.sessionId, id, expected: native,
          signal: guarded, check: checkOwner }, async transaction => {
          await save(fact('PENDING'));
          const receipt = await transaction.remove();
          // A native committed notification may cancel the preparation signal.
          // Its acknowledged result still owns this final persistence.
          await save(fact('REMOVED', { receipt }));
        });
      } catch (error) {
        // A comparison miss has no mutation; the changed notification arms a
        // fresh read. Never turn it into a claim that a different row was deleted.
        if (!intent && (error.code === 'schedule_conflict' || closed || signal.aborted || control.signal.aborted)) return;
        expiryPoisoned.add(id);
        try { await save(fact('UNKNOWN', { reason: reason(error?.message ?? 'Expiry owner-fence persistence is unknown.') })); }
        catch { ctx.logger.warn(`Grok schedule ${id}: expiry removal persistence is unknown; automatic cleanup stopped.`); }
      } finally { expiryPending.delete(pending); }
    });
    // Closing the timer must not wait behind a queued parent admission before
    // the runtime can drain children. The queued callback checks closed/signal
    // before every effect, and remains joined by the runtime queue drain.
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); resolve(); };
      signal.addEventListener('abort', abort, { once: true });
      void queued.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
        signal.removeEventListener('abort', abort); reject(error);
      });
      if (signal.aborted) abort();
    });
  }
  async function readStoredAnchor(agent, owner, anchor, signal) {
    if (!anchor?.terminalDurable || anchor.state !== 'COMPLETED' || anchor.stopReason !== 'completed'
      || !Number.isSafeInteger(anchor.terminalSeq) || anchor.terminalSeq + 1 > MAX_CHILD_EVENTS || !Number.isSafeInteger(anchor.terminalTurn))
      throw Error('The previous terminal prefix has no acknowledged target durability barrier.');
    if (ctx.agents.get(anchor.childId) || draining.has(anchor.childId)) throw Error('The previous child has another live activation or teardown.');
    const persistence = optional(agent, 'sessionPersistence');
    if (typeof persistence?.open !== 'function' || typeof persistence.stat !== 'function' || persistence.identity === undefined) throw Error('Raw native session persistence is unavailable.');
    const identity = persistence.identity, before = await persistence.stat(anchor.childId, { signal });
    if (!before || before.header.id !== anchor.childId || before.header.parentSession !== agent.id
      || before.header.origin !== 'subagent' || before.header.agentPreset !== PRESET || !Number.isSafeInteger(before.sizeBytes)
      || before.sizeBytes < 0 || before.sizeBytes > MAX_CHILD_LOG_BYTES
      || before.eventCount !== undefined && before.eventCount !== anchor.terminalSeq + 1
      || optional(agent, 'sessionPersistence')?.identity !== identity || ctx.agents.get(anchor.childId))
      throw Error('Stored child metadata is unavailable, changed or exceeds the physical read admission bound.');
    // Public read limits events, not I/O bytes: JSONL open may decode the whole
    // file. This stat admission check is conservative, not an atomic byte lease.
    const handle = await persistence.open(anchor.childId, 'read', { signal });
    try {
      signal.throwIfAborted();
      if (handle.id !== anchor.childId || handle.header.id !== anchor.childId || handle.header.parentSession !== agent.id
        || handle.header.origin !== 'subagent' || handle.header.agentPreset !== PRESET || handle.header.isSeeded !== false
        || handle.inheritedEventCount !== 0) throw Error('Stored scheduled child lineage or inherited prefix does not match.');
      const result = await handle.read(0, MAX_CHILD_EVENTS + 1, { signal });
      const events = result.events;
      if (!Array.isArray(events) || events.length > MAX_CHILD_EVENTS || events.length !== anchor.terminalSeq + 1)
        throw Error('Stored child prefix is stale, changed or exceeds the adapter read bound.');
      let bytes = 0, openTurn, openStep, matchedTurn, accepted = 0, inserted = 0, descriptors = 0;
      const inbox = { 'next-turn': [], 'next-step': [] }, tools = new Set();
      for (let seq = 0; seq < events.length; seq++) {
        const event = events[seq];
        bytes += Buffer.byteLength(JSON.stringify(event));
        if (bytes > MAX_CHILD_LOG_BYTES || event.seq !== seq) throw Error('Stored child prefix is not bounded and contiguous.');
        switch (event.type) {
          case 'subagent/descriptor':
            if (event.data.mode !== 'continuable' || event.data.provider !== 'spawn' || event.data.label !== 'Grok scheduled task')
              throw Error('Stored child descriptor is not the owned scheduled continuation.');
            descriptors++; break;
          case 'turn/start':
            if (openTurn !== undefined) throw Error('Stored child has overlapping turns.');
            openTurn = event.data.turn; break;
          case 'step/start':
            if (openStep !== undefined || openTurn !== event.data.turn) throw Error('Stored child step does not match its turn.');
            openStep = event.data.step; break;
          case 'agent/inbox/spliced': {
            const { target, start, removedCount = 0, inserted: messages } = event.data, list = inbox[target];
            if (!list || !Number.isSafeInteger(start) || !Number.isSafeInteger(removedCount) || start < 0
              || removedCount < 0 || start + removedCount > list.length || !Array.isArray(messages)) throw Error('Stored child inbox splice is invalid.');
            for (const message of messages) if (message.id === anchor.acceptedMessageId) {
              if (!anchor.inputSha256 || contentHash(message.content) !== anchor.inputSha256) throw Error('Stored original inbox input does not match actual acceptance.');
              if (anchor.executionMode === 'continuation' && (message.source.kind !== 'omaa-grok-schedule'
                || message.content.length !== 1 || message.content[0].type !== 'text' || message.content[0].text !== continuationReference(owner)))
                throw Error('Stored continuation inbox input is not the original inert reference.');
              inserted++;
            }
            list.splice(start, removedCount, ...messages); break;
          }
          case 'user/message':
            if (event.data.id === anchor.acceptedMessageId) {
              if (event.surfaceOp !== 'append' || openTurn === undefined || openStep === undefined
                || !anchor.promptSha256 || contentHash(event.data.content) !== anchor.promptSha256)
                throw Error('The accepted prompt did not append its actual admitted body in a real child step.');
              if (anchor.executionMode === 'continuation' && (event.data.source.kind !== 'omaa-grok-schedule'
                || event.data.source.taskId !== owner.id || event.data.source.occurrenceAt !== anchor.occurrenceAt
                || event.data.source.originalMessageId !== anchor.sourceMessageId)) throw Error('Stored host continuation provenance does not match.');
              if (anchor.executionMode !== 'continuation' && event.data.source.kind !== 'user') throw Error('Stored initial child source does not match native acceptance.');
              accepted++; matchedTurn = openTurn;
            }
            break;
          case 'assistant/message':
            for (const block of event.data.message.content) if (block.type === 'tool-call') tools.add(block.id);
            break;
          case 'tool/call': tools.add(event.data.callId); break;
          case 'tool/result': tools.delete(event.data.message.source.callId); break;
          case 'step/end':
            if (openTurn !== event.data.turn || openStep !== event.data.step || tools.size) throw Error('Stored child has an unresolved step or tool outcome.');
            openStep = undefined; break;
          case 'turn/end':
            if (openTurn !== event.data.turn || openStep !== undefined || tools.size) throw Error('Stored child has an unresolved turn.');
            openTurn = undefined; break;
          default: break;
        }
      }
      const tail = events.at(-1);
      if (descriptors !== 1 || accepted !== 1 || inserted !== 1 || matchedTurn !== anchor.terminalTurn || openTurn !== undefined
        || openStep !== undefined || tools.size || inbox['next-turn'].length || inbox['next-step'].length
        || tail?.type !== 'turn/end' || tail.data.turn !== anchor.terminalTurn || tail.data.reason.kind !== 'completed')
        throw Error('Stored child does not end with the actual accepted prompt completed and an empty inbox.');
      if (optional(agent, 'sessionPersistence')?.identity !== identity || ctx.agents.get(anchor.childId) || draining.has(anchor.childId))
        throw Error('The child persistence source or residency changed during continuation preflight.');
      const after = await persistence.stat(anchor.childId, { signal });
      if (!after || after.revision !== before.revision || after.sizeBytes !== before.sizeBytes
        || JSON.stringify(after.header) !== JSON.stringify(before.header)
        || after.eventCount !== undefined && after.eventCount !== anchor.terminalSeq + 1
        || optional(agent, 'sessionPersistence')?.identity !== identity || ctx.agents.get(anchor.childId))
        throw Error('Stored child changed while reading its terminal prefix.');
      return { eventCount: events.length, eventsSha256: contentHash(events), headerSha256: contentHash(handle.header) };
    } finally { await handle.close(); }
  }
  async function chooseChain(agent, owner, policyKey, subagents, signal) {
    const chain = owner.chain;
    if (!chain) return { executionMode: 'fresh', iteration: 1, chainReason: 'initial-or-unrecorded' };
    if (ctx.agents.get(chain.childId) || draining.has(chain.childId)) return { busy: true };
    if (chain.revision !== owner.revision) return { executionMode: 'fresh', iteration: 1, chainReason: 'prompt-changed' };
    if (chain.policyKey !== policyKey) return { executionMode: 'fresh', iteration: 1, chainReason: 'standing-policy-changed' };
    const anchor = owner.occurrences.find(row => row.occurrenceAt === chain.lastOccurrenceAt && row.childId === chain.childId);
    if (anchor?.state !== 'COMPLETED' || anchor.stopReason !== 'completed')
      return { executionMode: 'fresh', iteration: 1, chainReason: 'previous-child-not-completed' };
    let prefixProof;
    try { prefixProof = await readStoredAnchor(agent, owner, anchor, signal); }
    catch { signal.throwIfAborted(); return { executionMode: 'fresh-fallback', iteration: 1, chainReason: 'previous-transcript-unverified' }; }
    if (chain.iterations >= FRESH_CHAIN_EVERY) return { executionMode: 'fresh', iteration: 1, chainReason: 'ten-iteration-rollover', priorSummary: anchor.summary };
    try {
      hostSeam ??= await import('@deepseek-ai/dsh-subagent/internal');
      if (typeof hostSeam.queueHostSubagentPrompt !== 'function' || typeof subagents[hostSeam.deliverSubagentPrompt] !== 'function'
        || typeof subagents.drainChildren !== 'function') throw Error('Native host continuation seam is unavailable.');
    } catch { return { executionMode: 'fresh-fallback', iteration: 1, chainReason: 'native-host-continuation-unavailable' }; }
    return { executionMode: 'continuation', iteration: chain.iterations + 1, chainReason: 'completed-chain', childId: chain.childId, prefixProof };
  }
  function continuationActivation(pending, subagents) {
    return { childId: pending.childId,
      dispose() {
        // The public drain mutates admission synchronously before its first
        // await. This exact epoch check therefore cannot cancel a later resume.
        if (pending.endInfo || children.get(pending.childId) !== pending || runEpochs.get(pending.childId) !== pending.runInfo?.runId
          || ctx.agents.get(pending.childId) !== pending.runAgent || ctx.agents.get(pending.scope.agent.id) !== pending.scope.agent
          || pending.runAgent?.session.header.parentSession !== pending.scope.agent.id || !pending.protectable) return Promise.resolve();
        const result = subagents.drainChildren(pending.scope.agent, [pending.childId]);
        const hold = Promise.resolve(result).finally(() => { if (draining.get(pending.childId) === hold) draining.delete(pending.childId); });
        draining.set(pending.childId, hold); return hold;
      } };
  }
  function stopActivation(scope) {
    if (scope.activation && !scope.stopping) scope.stopping = track(Promise.resolve().then(() => scope.activation.dispose()));
  }
  function fence(scope, message) {
    scope.control.abort(Error(message));
    stopActivation(scope);
  }
  function scopeFor(agent, signal, policyKey) {
    const control = new AbortController();
    const scope = { agent, control, signal: AbortSignal.any([signal, control.signal]), activation: undefined,
      check() { scope.signal.throwIfAborted(); check(agent, policyKey); },
      dispose() { scopes.delete(scope); scope.signal.removeEventListener('abort', scope.onAbort); } };
    scope.onAbort = () => stopActivation(scope);
    scope.check();
    scope.signal.addEventListener('abort', scope.onAbort, { once: true });
    scopes.add(scope); return scope;
  }
  function endChild(pending) {
    if (!pending.admissionDone || !pending.endInfo || pending.finishing
      || pending.callerDelivery && !pending.resultSettled) return;
    pending.finishing = true;
    track(serialize(pending.id, async () => {
      const owner = records.get(pending.id), row = owner?.occurrences.find(item => item.occurrenceAt === pending.occurrenceAt);
      if (!pending.accepted || !row || row.state !== 'ACCEPTED' || row.runId !== pending.endInfo.runId) return;
      if (pending.resultRejected) {
        await unknown(pending.id, row, 'Native child result capture is unknown.');
        return;
      }
      const info = pending.endInfo;
      const terminal = pending.terminal;
      const durable = terminal?.stopReason === 'completed' && await terminal.flushed;
      // Native end is published only after owned descendants and teardown have
      // settled. Its stopReason also reports teardown failure, unlike result.
      try { await saveOccurrence(pending.id, { ...row, state: info.stopReason === 'completed' ? 'COMPLETED' : 'FAILED',
        endedAt: utc(), stopReason: reason(info.stopReason).slice(0, 128), summary: summaryOf(info.lastAssistantMessage),
        terminalDurable: Boolean(durable), ...(terminal ? { terminalSeq: terminal.seq, terminalTurn: terminal.turn } : {}) }); }
      catch { await unknown(pending.id, row, 'Native child ended, but terminal persistence is unknown.'); }
    }).finally(() => {
      completions.settled(pending);
      // Caller delivery was selected before native admission. Even a later
      // adapter failure must not discard an actual captured execution result.
      try { if (pending.callerDelivery) completions.deliverCaller(pending); }
      finally { if (children.get(pending.childId) === pending) children.delete(pending.childId); pending.scope.dispose(); pending.settled.resolve(); }
    }));
  }
  on('subagent/start', info => {
    const pending = children.get(info.id);
    if (!pending || !info.local) return;
    runEpochs.set(info.id, info.runId);
    if (info.provider === pending.provider && !pending.runInfo) {
      pending.runInfo = { ...info };
      pending.runAgent = ctx.agents.get(info.id);
      pending.runStartSeq = pending.runAgent?.session.seq;
    }
  }, { global: true });
  on('subagent/end', info => {
    const pending = children.get(info.id);
    if (!pending || !pending.runInfo || pending.runInfo.runId !== info.runId) return;
    if (runEpochs.get(info.id) === info.runId) runEpochs.delete(info.id);
    pending.endInfo = { ...info }; endChild(pending);
  }, { global: true });
  on('session/event', (session, event) => {
    completions.observe(session, event);
    const pending = children.get(session.id);
    if (!pending?.runInfo || event.type !== 'turn/end' || pending.runAgent?.session !== session) return;
    const terminal = { seq: event.seq, turn: event.data.turn, stopReason: event.data.reason.kind };
    // A raw read alone can observe buffered appends. Capture a real, targeted
    // public durability barrier while this exact child Session is still known.
    terminal.flushed = track(Promise.resolve().then(async () => {
      if (ctx.sessions.get(session.id) !== session || ctx.agents.get(session.id) !== pending.runAgent
        || pending.runInfo.runId !== runEpochs.get(session.id) || session.seq !== event.seq + 1) return false;
      try { return await ctx.sessions.flush(session) === true; } catch { return false; }
    }));
    pending.terminal = terminal;
  }, { global: true });

  // Persisted RUNNING/ACCEPTED belongs to an earlier residency, never to a live
  // handle in this process. No session history is read to invent its completion.
  for (const owner of records.list()) {
    const coldChild = owner.occurrences.some(row => ['RUNNING', 'ACCEPTED'].includes(row.state));
    const coldExpiry = owner.expiryRemoval?.state === 'PENDING';
    if (owner.expiryRemoval?.state === 'UNKNOWN' || coldExpiry) expiryPoisoned.add(owner.id);
    if (!coldChild && !coldExpiry) continue;
    if (coldChild) poisoned.add(owner.id);
    track(serialize(owner.id, () => {
      const current = records.get(owner.id);
      if (!current) return;
      return putOwner({ ...current,
        status: ['EXPIRED', 'DELETED'].includes(current.status) ? current.status : coldExpiry ? 'EXPIRED' : 'UNKNOWN',
        ...(coldChild ? { reason: 'Previous runtime child outcome is unknown.',
          occurrences: current.occurrences.map(row => ['RUNNING', 'ACCEPTED'].includes(row.state)
            ? { ...row, state: 'UNKNOWN', reason: 'Cold startup does not restore an unverified child.' } : row) } : {}),
        ...(coldExpiry ? { expiryRemoval: { ...current.expiryRemoval, state: 'UNKNOWN', observedAt: utc(),
          reason: 'Cold startup cannot prove whether the pending native expiry deletion completed.' } } : {}) });
    }));
  }

  // Independent expiry wakes without a parent/model activation. Optional native
  // Schedule residency controls eligibility; no other product gains a hard dep.
  expiry = createGrokScheduleExpiry(ctx, {
    list: () => !closed && expirySchedule && scheduleIdentity(ctx.get('schedule')) === expirySchedule
      ? records.list().filter(expiryEligible).map(owner => ({ id: owner.id, expiresAt: owner.expiresAt })) : [],
    expire: expireOwner,
  });
  on('schedule/changed', () => {
    for (const pending of expiryPending) pending.control.abort(Error('Native schedule changed during expiry reconciliation.'));
    expiry.notify();
  }, { global: true, prepend: true });
  const scheduleFiber = ctx.inject(['schedule'], scope => {
    if (closed) return;
    const schedule = scheduleIdentity(scope.schedule);
    expirySchedule = schedule;
    expiry.notify();
    scope.effect(() => () => {
      for (const pending of expiryPending) if (pending.schedule === schedule)
        pending.control.abort(Error('Native expiry Schedule residency ended.'));
      if (expirySchedule === schedule) expirySchedule = undefined;
      expiry.notify();
    });
  });
  listeners.push(() => scheduleFiber.dispose());

  async function dispatchOccurrence(agent, origin, signal) {
    const { taskId, occurrenceAt } = origin;
    return serialize(taskId, async () => {
      const owner = records.get(taskId);
      if (!owner || owner.sessionId !== agent.id || origin.kind === 'schedule' && origin.due.reminder_prompt !== owner.marker) return 'blocked: ownership or marker mismatch';
      if (owner.occurrences.some(row => row.occurrenceAt === occurrenceAt) || owner.highWaterAt && occurrenceAt <= owner.highWaterAt) return 'duplicate: already recorded';
      // The retained native marker stays inert after logical expiry. Consume
      // only this actual owned Schedule input; edited ordinary reminders still
      // follow the unowned path. Do not produce repeated parent-model notices.
      if (origin.kind === 'schedule' && owner.status === 'EXPIRED' && owner.expiresAt && Date.now() >= Date.parse(owner.expiresAt))
        return 'skipped: dispatch expired';
      let occurrence = { occurrenceAt, revision: origin.kind === 'scheduler-create' ? origin.createdOwner.revision : owner.revision, runtimeId,
        ...(origin.kind === 'schedule' ? { sourceKind: 'schedule', sourceMessageId: origin.message.id }
          : { sourceKind: 'scheduler-create', sourceCallId: origin.grant.callId, rootCallId: origin.grant.rootCallId }),
        state: 'RUNNING', startedAt: utc() };
      let scope, pending, intentAttempted = false;
      try {
        signal.throwIfAborted();
        if (origin.kind === 'scheduler-create') checkGrant(origin.grant, agent);
        const currentPolicy = check(agent, origin.kind === 'scheduler-create' ? origin.grant.policyKey : undefined);
        if (poisoned.has(owner.id) || owner.status !== 'ACTIVE' || owner.occurrences.some(row => row.state === 'UNKNOWN'))
          throw Error('Previous scheduled child outcome is unresolved or its owner is fenced.');
        if (owner.occurrences.some(row => ['RUNNING', 'ACCEPTED'].includes(row.state))) {
          await saveOccurrence(owner.id, { ...occurrence, state: 'SKIPPED', reason: 'Previous scheduled activation and its descendants have not settled.' }, { highWaterAt: occurrenceAt });
          return 'skipped: previous native child has not settled';
        }
        if (owner.expiresAt && Date.now() >= Date.parse(owner.expiresAt)) throw Error('The recurring task has expired.');
        const offset = Date.parse(occurrenceAt) - Date.parse(owner.initialScheduledAt);
        if (origin.kind === 'scheduler-create') {
          // An owning update may win the task queue after create persists its
          // owner. The original opt-in grants only that confirmed creation
          // snapshot, never a replacement prompt or revision.
          const expected = origin.createdOwner;
          if (!expected || ['id', 'sessionId', 'owningPreset', 'marker', 'prompt', 'revision', 'kind', 'seconds', 'initialScheduledAt']
            .some(field => owner[field] !== expected[field]))
            throw Error('The confirmed task changed after creation; its original immediate grant cannot execute the changed task.');
          if (owner.kind !== 'every' || owner.chain || owner.occurrences.length || offset !== -owner.seconds * 1000)
            throw Error('Immediate dispatch must be the first occurrence at the confirmed native interval anchor.');
        } else if (offset < 0 || Date.parse(occurrenceAt) > Date.now() || (owner.kind === 'after' ? offset !== 0 : offset % (owner.seconds * 1000) !== 0))
          throw Error('The due occurrence does not match the owned native rule.');
        const native = await nativeRecord(agent, owner.id);
        check(agent, currentPolicy); signal.throwIfAborted();
        if (!sameRule(owner, native)) throw Error('The native task was deleted or changed outside the owning adapter.');
        if (origin.kind === 'schedule') await checkNativeDue(agent, owner, native, origin.message, origin.due);
        else checkGrant(origin.grant, agent);
        check(agent, currentPolicy); signal.throwIfAborted();
        const subagents = optional(agent, 'subagents'), provider = subagents?.getProvider?.('spawn');
        if (typeof subagents?.startActivation !== 'function' || typeof provider?.prepareContinuable !== 'function' || provider.inheritsParentContext !== false)
          throw Error('Native fresh controlled child activation is unavailable.');
        const choice = await chooseChain(agent, owner, currentPolicy, subagents, signal);
        check(agent, currentPolicy); signal.throwIfAborted();
        if (choice.busy) {
          await saveOccurrence(owner.id, { ...occurrence, state: 'SKIPPED', reason: 'The previous chain child has another live activation or teardown.' }, { highWaterAt: occurrenceAt });
          return 'skipped: previous chain child has not settled';
        }
        scope = scopeFor(agent, signal, currentPolicy);
        const childId = choice.childId ?? randomUUID();
        occurrence = { ...occurrence, childId, executionMode: choice.executionMode, chainIteration: choice.iteration, chainReason: choice.chainReason };
        const promptContent = [{ type: 'text', text: iterationPrompt(owner, choice.priorSummary, choice.executionMode === 'fresh-fallback') }];
        // Persist intent BEFORE any dispatch. No history delivery receipt or
        // lifecycle start notification is mistaken for accepted child work.
        intentAttempted = true;
        await saveOccurrence(owner.id, occurrence, { highWaterAt: occurrenceAt });
        scope.check();
        if (origin.kind === 'scheduler-create') checkGrant(origin.grant, agent);
        pending = { id: owner.id, occurrenceAt: occurrenceAt, childId, provider: provider.name, scope, accepted: false,
          executionMode: choice.executionMode, promptContent, prefixProof: choice.prefixProof,
          admission: Promise.withResolvers(), settled: Promise.withResolvers(), protectable: false };
        children.set(childId, pending);
        let activation, messageId;
        if (choice.executionMode === 'continuation') {
          if (ctx.agents.get(childId) || draining.has(childId)) throw Error('Another activation won the continuation admission race.');
          messageId = await hostSeam.queueHostSubagentPrompt(subagents, agent, childId, [{ type: 'text', text: continuationReference(owner) }],
            { kind: 'omaa-grok-schedule', form: 'notice', summary: boundContextSummary('Scheduled Grok iteration reference'),
              taskId: owner.id, occurrenceAt: occurrenceAt, originalMessageId: origin.message.id, originalSource: origin.message.source }, scope.signal);
        } else {
          pending.callerDelivery = typeof subagents.startActivation === 'function';
          activation = await startActivation({ subagents, get: name => optional(agent, name) }, {
            provider: provider.name, childId, label: 'Grok scheduled task', signal: scope.signal,
            delivery: pending.callerDelivery ? 'caller' : 'parent',
            request: { parent: agent, maxDepth: subagents.resolveMaxDepth?.(), prompt: promptContent },
          });
          scope.activation = activation; messageId = activation.messageId;
          // Observe immediately: admission persistence may fail after the
          // native driver has already accepted and later captured this run.
          track(activation.result.then(result => {
            pending.resultValue = result; pending.resultSettled = true; endChild(pending);
          }, () => {
            pending.resultRejected = true; pending.resultSettled = true; endChild(pending);
          }));
        }
        if (typeof messageId === 'string' && messageId) occurrence = { ...occurrence, acceptedAt: utc(), acceptedMessageId: messageId,
          ...(pending.runInfo ? { runId: pending.runInfo.runId } : {}) };
        if (activation && activation.childId !== childId || typeof messageId !== 'string' || !messageId || !pending.runInfo || !pending.runAgent)
          throw Error('Native child acceptance could not be correlated with its exact activation.');
        const inserts = pending.runAgent.session.snapshotEvents(pending.runStartSeq).filter(event => event.type === 'agent/inbox/spliced')
          .flatMap(event => event.data.inserted).filter(input => input.source.kind !== 'runtime-context');
        const original = inserts.find(input => input.id === messageId);
        pending.protectable = inserts[0]?.id === messageId && ctx.agents.get(childId) === pending.runAgent
          && pending.runAgent.session.header.parentSession === agent.id && runEpochs.get(childId) === pending.runInfo.runId;
        if (!original || choice.executionMode === 'continuation' && !pending.protectable)
          throw Error('Native continuation joined another caller activation; its outcome is unknown and that caller will not be cancelled.');
        if (choice.executionMode === 'continuation') {
          // Preflight is not a lease: another caller may have changed the cold
          // log before native resume. Authenticate the actual loaded prefix,
          // before permitting this inert reference to acquire task instructions.
          const proof = pending.prefixProof;
          if (!proof || pending.runStartSeq !== proof.eventCount + 1)
            throw Error('The native resumed transcript changed after preflight; accepted reference remains inert and its outcome is unknown.');
          const loaded = pending.runAgent.session.snapshotEvents(0, pending.runStartSeq), resumeMarker = loaded.at(-1);
          // Fixed Session restore appends this one real marker to a completed
          // unseeded log. Synthetic interrupted-turn closers or plugin writes
          // are not equivalent to the verified terminal transcript.
          if (loaded.length !== pending.runStartSeq || resumeMarker.seq !== proof.eventCount
            || resumeMarker.type !== 'session/end-seed' || !ownKeys(resumeMarker.data, [])
            || contentHash(loaded.slice(0, proof.eventCount)) !== proof.eventsSha256
            || contentHash(pending.runAgent.session.header) !== proof.headerSha256)
            throw Error('The native resumed transcript changed after preflight; accepted reference remains inert and its outcome is unknown.');
          // Fixed manager.coldResume supplies no outputSchema; materialize
          // therefore attaches no structured runtime. captureLocalResult has
          // no diagnostic field. Only this verified cold local activation can
          // prove that native settlement has no opaque result/diagnostic tail.
          pending.coldPlainSettlement = true;
        }
        occurrence = { ...occurrence, state: 'ACCEPTED', inputSha256: contentHash(original.content),
          promptSha256: contentHash(choice.executionMode === 'continuation' ? promptContent : original.content),
          reason: choice.executionMode === 'fresh-fallback' ? 'Fresh fallback: ' + choice.chainReason
            : `${choice.executionMode === 'continuation' ? 'Continued' : 'Fresh'} chain admission, iteration ${choice.iteration} of ${FRESH_CHAIN_EVERY}: ${choice.chainReason}.` };
        if (choice.executionMode === 'continuation') scope.activation = continuationActivation(pending, subagents);
        await saveOccurrence(owner.id, occurrence, { chain: { childId, revision: owner.revision, iterations: choice.iteration,
          lastOccurrenceAt: occurrenceAt, policyKey: currentPolicy } });
        pending.accepted = true;
        pending.admissionDone = true;
        pending.messageId = messageId;
        pending.admission.resolve(true);
        if (choice.executionMode === 'continuation') track(pending.settled.promise);
        if (scope.signal.aborted) fence(scope, 'Scheduled child admission was fenced.');
        else { try { scope.check(); } catch { fence(scope, 'Scheduled parent mode or policy changed.'); } }
        endChild(pending);
        return 'accepted: native child inbox receipt recorded' + (choice.executionMode === 'fresh-fallback' ? '; fresh fallback: ' + choice.chainReason : '');
      } catch (error) {
        const text = reason(error?.message ?? 'scheduled dispatch unavailable');
        pending?.admission.resolve(false);
        if (pending) pending.admissionDone = true;
        if (intentAttempted || records.get(owner.id)?.occurrences.some(row => row.occurrenceAt === occurrenceAt)) {
          // A rejected promise can follow synchronous inbox acceptance/catalog
          // failure. Do not infer that dispatch never happened or retry it.
          await unknown(owner.id, occurrence, text);
          if (scope?.activation) fence(scope, 'Scheduled child acceptance or storage outcome is unknown.');
        } else {
          try { await saveOccurrence(owner.id, { ...occurrence, state: 'BLOCKED', reason: text }, { highWaterAt: occurrenceAt }); }
          catch { await unknown(owner.id, occurrence, 'Occurrence intent persistence is unknown.'); }
        }
        if (pending && !pending.accepted) completions.abandon(pending);
        const awaitingCaller = pending?.callerDelivery && scope?.activation && pending.runInfo;
        if (pending && !pending.accepted && !awaitingCaller && children.get(pending.childId) === pending) children.delete(pending.childId);
        if (!pending?.accepted && !awaitingCaller) { pending?.settled.resolve(); scope?.dispose(); }
        if (pending) endChild(pending);
        return 'blocked: ' + text;
      }
    });
  }

  const consume = (agent, message, due, signal) => dispatchOccurrence(agent,
    { kind: 'schedule', taskId: due.schedule_id, occurrenceAt: due.occurrence_at, message, due }, signal);

  on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    const child = children.get(agent.id);
    if (child?.executionMode === 'continuation') {
      const ownReference = input => input.source.kind === 'omaa-grok-schedule' && input.source.taskId === child.id
        && input.source.occurrenceAt === child.occurrenceAt;
      if (decision.messages.some(ownReference)) {
        // Native queue failure waits for child cancellation/drain before it
        // rejects. Observe the real pre-step signal so that cleanup can finish
        // without waiting for the parent's eventual negative ACK.
        const admitted = !closed && await awaitAdmission(child, signal);
        const messages = decision.messages.flatMap(input => !ownReference(input) ? [input]
          : admitted && !closed && child.protectable && child.accepted && input.id === child.messageId
            && ctx.agents.get(agent.id) === child.runAgent && runEpochs.get(agent.id) === child.runInfo.runId && !child.scope.signal.aborted
            ? [{ ...input, content: child.promptContent }] : []);
        return { ...decision, messages: messages.some(input => input.source.kind !== 'runtime-context') ? messages : [] };
      }
    }
    if (closed) return decision;
    const messages = []; let handled = false;
    for (const message of decision.messages) {
      const rows = parseGrokScheduleDue(message);
      if (!rows) { messages.push(await completions.prepare(agent, message, signal)); continue; }
      const ownedRow = row => {
        const owner = records.get(row.schedule_id);
        return owner?.sessionId === agent.id && owner.owningPreset === PRESET && owner.marker === row.reminder_prompt;
      };
      // A native prompt edit changes this row into an ordinary reminder. Retain
      // its real instructions, while preventing later silent re-adoption of the
      // old Grok owner if somebody restores its marker.
      for (const row of rows) {
        const owner = records.get(row.schedule_id);
        if (owner?.sessionId === agent.id && owner.marker !== row.reminder_prompt) {
          await relinquishMarker(owner.id);
          if (closed) return decision;
        }
      }
      if (!rows.some(ownedRow)) { messages.push(message); continue; }
      handled = true;
      const unowned = [], outcomes = [];
      for (const row of rows) {
        if (!ownedRow(row)) unowned.push(row);
        else {
          const outcome = await consume(agent, message, row, signal);
          if (closed) return decision;
          outcomes.push({ schedule_id: row.schedule_id, occurrence_at: row.occurrence_at, outcome });
        }
      }
      // A new, self-attributed notice retains unowned work and original native
      // provenance. It does not forge another Schedule message or echo any
      // owned instruction back to the parent for duplicate execution.
      if (unowned.length || outcomes.some(row => !['accepted:', 'duplicate:', 'skipped:'].some(prefix => row.outcome.startsWith(prefix)))) messages.push(createUserMessage({
        source: { kind: 'omaa-grok-schedule', form: 'notice', summary: boundContextSummary('Grok scheduled dispatch outcomes'),
          originalMessageId: message.id, originalSource: message.source },
        content: [{ type: 'text', text: 'OMAA scheduled dispatch report. Do not infer completion from acceptance.\n'
          + JSON.stringify({ originalMessageId: message.id, originalSource: message.source, outcomes, unownedReminders: unowned })
          + (unowned.length ? '\nThe unowned reminders above retain their original instructions and require ordinary reminder handling.' : '') }],
      }));
    }
    // Runtime-context alone should not spend a parent model call for a fully
    // consumed scheduled turn. Other actual inputs always retain their order.
    const meaningful = messages.some(message => message.source.kind !== 'runtime-context');
    return { ...decision, messages: handled && !meaningful ? [] : messages };
  }, { global: true });

  const relevant = new Set(['sandbox/mode', 'approval/policy', 'permission/preset', 'plan/mode', 'agent-preset/selected']);
  on('session/event', (session, event) => {
    if (relevant.has(event.type)) for (const scope of scopes) if (scope.agent.session === session) fence(scope, 'Scheduled parent policy, mode or preset changed.');
  }, { global: true });
  on('omaa/preferences-updated', session => {
    for (const scope of scopes) if (scope.agent.session === session) { try { scope.check(); } catch { fence(scope, 'Scheduled parent preferences changed.'); } }
  }, { global: true });
  on('agent-preset/selected', sessionId => {
    for (const scope of scopes) if (scope.agent.id === sessionId) fence(scope, 'Scheduled parent preset changed.');
  }, { global: true });
  on('agent/disposed', ({ agent }) => {
    completions.forgetParent(agent);
    for (const scope of scopes) if (scope.agent === agent) fence(scope, 'Scheduled parent was disposed.');
  }, { global: true });

  return {
    output(exec, args) { return completions.read(exec.agent, args, exec.signal); },
    async create(exec, { seconds, prompt, recurring = true, fireImmediately = false }, requestSignal = exec.signal) {
      const signal = AbortSignal.any([exec.signal, requestSignal]);
      const agent = exec.agent, policyKey = check(agent); signal.throwIfAborted();
      if (typeof recurring !== 'boolean') throw Error('recurring must be a boolean.');
      if (typeof fireImmediately !== 'boolean') throw Error('fireImmediately must be a boolean.');
      if (fireImmediately && !recurring) throw Error('Immediate creation is supported only for recurring tasks.');
      if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds * 1000 > Number.MAX_SAFE_INTEGER) throw Error('Scheduled interval is outside the native safe range.');
      if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt.trim()) > GROK_SCHEDULE_PROMPT_BYTES) throw Error('Scheduled prompt is empty or exceeds the adapter bound.');
      const grant = fireImmediately ? immediateGrant(exec, { seconds, prompt, recurring }, signal, policyKey) : undefined;
      return serialize('create:' + agent.id, async () => {
        check(agent, policyKey); signal.throwIfAborted();
        if (grant) checkGrant(grant, agent);
        const schedule = nativeSchedule(agent), active = await schedule.list({ sessionId: agent.id });
        check(agent, policyKey); signal.throwIfAborted();
        if (grant) checkGrant(grant, agent);
        if (active.length >= 50 || records.size >= GROK_SCHEDULE_RECORD_LIMIT) throw Error('Scheduled task or owner record limit reached.');
        const marker = markerFor(), createdAt = utc();
        let native;
        try { native = await schedule.create(agent.id, { title: 'Grok scheduled task', prompt: marker,
          ...(recurring ? { every_seconds: seconds } : { after_seconds: seconds }) }, signal); }
        catch { throw Error('Native inert reminder creation was not acknowledged; its outcome may be partial or unknown. Do not automatically retry creation.'); }
        const owner = { version: 1, id: native.id, sessionId: agent.id, owningPreset: PRESET, marker, prompt: prompt.trim(),
          kind: recurring ? 'every' : 'after', seconds, initialScheduledAt: native.scheduledAt, createdAt,
          ...(recurring ? { expiresAt: new Date(Date.parse(createdAt) + 7 * DAY).toISOString() } : {}),
          revision: 1, status: 'ACTIVE', policyKey, occurrences: [] };
        try { check(agent, policyKey); signal.throwIfAborted(); if (grant) checkGrant(grant, agent); await putOwner(owner); }
        catch {
          poisoned.add(native.id);
          const text = `Native inert reminder ${native.id} was created, but adapter ownership is partial or unknown. Do not automatically retry creation.`;
          if (!grant) throw Error(text);
          // Native creation is a confirmed fact even when its separate owner
          // write fails or cancellation arrives. The inert native reference is
          // never activated without confirmed ownership.
          return { ...publicRecord({ ...owner, status: 'UNKNOWN' }, native), creationConfirmed: true, ownershipConfirmed: false,
            immediateDispatch: { state: 'UNKNOWN', outcome: text, sourceCallId: grant.callId, rootCallId: grant.rootCallId } };
        }
        if (!grant) return publicRecord(owner, native);
        let occurrenceAt, outcome, current = owner;
        try {
          // Fixed native every factory domain.ts:1377-1385 commits target =
          // acceptance-now + interval. This creation fire uses that same phase
          // anchor; it is not a native schedule delivery or history receipt.
          occurrenceAt = new Date(Date.parse(native.scheduledAt) - seconds * 1000).toISOString();
          const createdOwner = Object.freeze({ id: owner.id, sessionId: owner.sessionId, owningPreset: owner.owningPreset,
            marker: owner.marker, prompt: owner.prompt, revision: owner.revision, kind: owner.kind,
            seconds: owner.seconds, initialScheduledAt: owner.initialScheduledAt });
          outcome = await dispatchOccurrence(agent, { kind: 'scheduler-create', taskId: native.id, occurrenceAt, grant, createdOwner }, signal);
          // close joins this create queue before records.close: this read can
          // retain a known admission even when shutdown has already begun.
          current = records.get(native.id) ?? owner;
        } catch (error) {
          poisoned.add(native.id);
          outcome = 'Immediate dispatch outcome is unknown: ' + reason(error?.message ?? 'adapter unavailable') + '. Do not automatically retry creation or its first dispatch.';
          // A valid phase lets the ordinary occurrence ledger retain the
          // uncertainty; a closed store cannot be revived to manufacture it.
          if (occurrenceAt && !closed) {
            await unknown(native.id, { occurrenceAt, revision: owner.revision, runtimeId, sourceKind: 'scheduler-create',
              sourceCallId: grant.callId, rootCallId: grant.rootCallId, state: 'UNKNOWN', startedAt: utc() }, outcome);
            current = records.get(native.id) ?? owner;
          }
        }
        const first = current.occurrences.find(row => row.occurrenceAt === occurrenceAt);
        return { ...publicRecord(current, native), creationConfirmed: true, ownershipConfirmed: true,
          immediateDispatch: { ...(occurrenceAt ? { occurrenceAt } : {}), state: poisoned.has(native.id) ? 'UNKNOWN' : first?.state ?? 'UNKNOWN', outcome: reason(outcome),
            sourceCallId: grant.callId, rootCallId: grant.rootCallId,
            ...(first?.childId ? { childId: first.childId } : {}), ...(first?.runId ? { runId: first.runId } : {}),
            ...(first?.acceptedMessageId ? { acceptedMessageId: first.acceptedMessageId } : {}) } };
      });
    },
    async update(exec, { id, prompt, seconds }) {
      const agent = exec.agent, currentPolicy = check(agent); exec.signal.throwIfAborted();
      return serialize(id, async () => {
        const owner = requireOwner(agent, id); check(agent, currentPolicy);
        if (owner.status !== 'ACTIVE' || poisoned.has(id)) throw Error('This Grok task is fenced or has an unknown outcome.');
        if (owner.expiresAt && Date.now() >= Date.parse(owner.expiresAt)) throw Error('The recurring task has expired.');
        if (seconds !== undefined && (!Number.isSafeInteger(seconds) || seconds < 60 || !Number.isSafeInteger(seconds * 1000)))
          throw Error('Scheduled interval is outside the native safe range.');
        if (prompt !== undefined && (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt.trim()) > GROK_SCHEDULE_PROMPT_BYTES)) throw Error('Scheduled prompt is empty or exceeds the adapter bound.');
        const schedule = nativeSchedule(agent), native = await nativeRecord(agent, id);
        check(agent, currentPolicy); exec.signal.throwIfAborted();
        if (!sameRule(owner, native) || native.status !== 'active') throw Error('The owned native schedule is inactive, absent or changed.');
        let intent = false, expectedOwner = owner;
        try {
          return await withGrokScheduleTransaction(schedule, { sessionId: agent.id, id, expected: native, signal: exec.signal,
            check() { check(agent, currentPolicy); if (records.get(id) !== expectedOwner) throw Error('Grok owner changed during update.'); } }, async transaction => {
            const changedPrompt = prompt !== undefined && prompt.trim() !== owner.prompt;
            const nextSeconds = seconds ?? owner.seconds;
            // A timing update uses the last actual native dispatch, or the
            // retained creation/update anchor when no later dispatch exists.
            const anchors = [owner.phaseAnchorAt ?? new Date(Date.parse(owner.initialScheduledAt) - owner.seconds * 1000).toISOString(),
              native.lastDelivery?.deliveredAt, ...owner.occurrences.filter(row => row.sourceKind === 'scheduler-create').map(row => row.occurrenceAt)].filter(Boolean);
            const anchor = anchors.reduce((a, b) => a > b ? a : b);
            const target = seconds === undefined ? native.scheduledAt : grokUpdatedTarget(anchor, nextSeconds);
            const timingChanged = nextSeconds !== owner.seconds || target !== native.scheduledAt;
            if (!changedPrompt && !timingChanged) return { id, updated: false, record: publicRecord(owner, native) };
            const revision = owner.revision + 1;
            if (!Number.isSafeInteger(revision)) throw Error('Grok schedule revision limit reached.');
            const next = { ...owner, prompt: prompt?.trim() ?? owner.prompt, seconds: nextSeconds, revision,
              ...(timingChanged ? { initialScheduledAt: target,
                phaseAnchorAt: new Date(Date.parse(target) - nextSeconds * 1000).toISOString() } : {}),
              // Cadence alone does not reset the original task transcript.
              ...(!changedPrompt && owner.chain ? { chain: { ...owner.chain, revision } } : {}) };
            intent = true;
            expectedOwner = await putOwner({ ...owner, status: 'UNKNOWN', reason: 'Schedule update is pending; do not automatically retry.' });
            let committed = native;
            if (timingChanged) {
              const { sessionId: _session, status: _status, lastDelivery: _delivery, ...record } = native;
              committed = await transaction.replace({ ...record, scheduledAt: target,
                ...(owner.kind === 'every' ? { everySeconds: nextSeconds } : { afterSeconds: nextSeconds }) });
            } else transaction.check();
            // Same native queue slot: a due delivery cannot overtake this owner.
            expectedOwner = await putOwner(next);
            return { id, updated: true, record: publicRecord(expectedOwner, committed) };
          });
        } catch (error) {
          if (intent) { poisoned.add(id); throw Error('Grok schedule update has a partial or unknown outcome. Inspect its owner and native record; do not automatically retry. ' + reason(error.message)); }
          throw error;
        }
      });
    },
    async remove(exec, id) {
      const agent = exec.agent, currentPolicy = check(agent); exec.signal.throwIfAborted();
      return serialize(id, async () => {
        const owner = requireOwner(agent, id), schedule = nativeSchedule(agent), native = await nativeRecord(agent, id);
        check(agent, currentPolicy); exec.signal.throwIfAborted();
        if (native && !sameRule(owner, native)) throw Error('Native reminder changed outside the Grok adapter; use native reminder management for its current contents.');
        let expectedOwner = owner;
        return withGrokScheduleTransaction(schedule, { sessionId: agent.id, id, expected: native, signal: exec.signal,
          check() { check(agent, currentPolicy); if (records.get(id) !== expectedOwner) throw Error('Grok owner changed during deletion.'); } }, async transaction => {
          expectedOwner = await putOwner({ ...owner, status: 'DELETED', reason: 'Deleted through the owning adapter.' });
          // Fixed actor Delete leaves an accepted child and its receipt alive.
          if (!transaction.current) return { id, deleted: false, code: 'schedule_not_found' };
          try { return await transaction.remove(); }
          catch { throw Error(`Grok task ${id} is fenced, but native deletion is partial or unknown. Read native reminder state before retrying.`); }
        });
      });
    },
    async list(exec) {
      const agent = exec.agent; checkIdentity(agent); exec.signal.throwIfAborted();
      const native = await nativeSchedule(agent).catalog(); exec.signal.throwIfAborted(); checkIdentity(agent);
      return native.filter(row => row.sessionId === agent.id && row.status === 'active').flatMap(row => {
        const owner = records.get(row.id);
        return owner && owner.sessionId === agent.id && sameRule(owner, row) ? [publicRecord(owner, row)] : [];
      });
    },
    ownership(exec, id, native) {
      const agent = exec.agent; checkIdentity(agent); exec.signal.throwIfAborted();
      const owner = records.get(id);
      return owner?.sessionId === agent.id && owner.owningPreset === PRESET
        ? { owned: true, status: owner.status === 'EXPIRED' ? 'EXPIRED' : poisoned.has(id) ? 'UNKNOWN' : owner.status,
          ...(native === undefined ? {} : { nativeMatches: native.id === id && native.sessionId === agent.id && sameRule(owner, native) }) }
        : { owned: false };
    },
    async close() {
      closed = true;
      completions.close();
      for (const pending of expiryPending) pending.control.abort(Error('Grok scheduled expiry adapter closed.'));
      await expiry.close();
      for (const scope of scopes) fence(scope, 'Grok scheduled adapter was disposed.');
      // Disposal may publish an end while the first drain is in flight. Join
      // those terminal writes before closing the authoritative domain as well.
      while (queues.size || writes.size) await Promise.allSettled([...queues.values(), ...writes]);
      for (const dispose of listeners.splice(0)) dispose();
      await records.close();
    },
  };
  } catch (error) {
    closed = true;
    completions?.close();
    for (const pending of expiryPending) pending.control.abort(Error('Grok schedule adapter construction failed.'));
    void expiry?.close();
    for (const dispose of listeners.splice(0)) dispose();
    throw error;
  }
}
