import { randomUUID } from 'node:crypto';
import { foldNativeRunFact } from './run-progress.mjs';

const FORMAT = 'omaa.zcode.questions';
const VERSION = 1;
const MAX_TEXT_BYTES = 256 * 1024; // Native attachment/admission bound, not an upstream schema limit.
export const WORKFLOW_QUESTION_BUDGET = 3;
export const ESCALATE_PARAMETERS = { type: 'object', properties: {
  question: { type: 'string', minLength: 1 }, context: { type: 'string' },
}, required: ['question'], additionalProperties: false };
export const ESCALATE_OUTPUT = { type: 'object', properties: {
  status: { type: 'string', enum: ['answered', 'refused'] }, message: { type: 'string' }, qid: { type: 'string' },
  reason: { type: 'string', enum: ['budget_exhausted', 'no_active_ask'] },
}, required: ['status', 'message'], additionalProperties: false };
export const ESCALATE_DESCRIPTION = 'Escalate ONE question that is genuinely BLOCKING this task to the main agent that created the workflow. '
  + 'This is a LAST RESORT for contradictory instructions, an impossible gate, or an unobtainable fact. Put what you tried and the evidence in context. '
  + 'Do not use it for curiosity, progress reports, permission, or conclusions you can verify. The call waits indefinitely for the answer; '
  + 'you get at most 3 escalations per ask. A refused result means proceed on your own best judgement. Answering continues this same tool call and turn.';

function text(value, name, nonempty = true) {
  if (typeof value !== 'string' || nonempty && value.length === 0 || Buffer.byteLength(value) > MAX_TEXT_BYTES)
    throw Error(`${name} must be ${nonempty ? 'nonempty ' : ''}text within the native 256 KiB bound.`);
  return value;
}
function failure(reason, qid) {
  const messages = {
    unknown_question: `Unknown question id ${qid}. Use get_workflow_run to read the questions actually awaiting an answer in this session.`,
    already_resolved: `Question ${qid} was already answered. No need to answer again; wait for the subagent's next escalation.`,
    run_not_in_flight: `The ask that raised question ${qid} is no longer in flight, so nobody is waiting for this answer. Use get_workflow_run to inspect the run before continuing.`,
  };
  return { ok: false, reason, message: messages[reason] };
}
const refusal = reason => ({ status: 'refused', reason, message: reason === 'budget_exhausted'
  ? 'The escalation budget for this ask is exhausted (3 questions). Proceed on your own best judgement; do not retry this escalation.'
  : 'There is no active ask waiting for an escalation. Continue with the current task state; do not retry this escalation.' });
const canceled = reason => reason ?? Error('escalate was cancelled before the main agent answered');
const publicFact = row => ({ qid: row.qid, actor: row.actor, ...(row.actorName === undefined ? {} : { actorName: row.actorName }),
  question: row.question, ...(row.context === undefined ? {} : { context: row.context }), askedAt: row.askedAt });

// These are archival native facts. A persisted pending row never proves that a
// deferred survived a restart, and must not be exposed as a live question alone.
export function readWorkflowQuestionFacts(record) {
  const value = record.workflowQuestions;
  if (value === undefined) return [];
  if (value?.format !== FORMAT || value.version !== VERSION || value.runId !== record.runId
    || value.sessionId !== record.sessionId || !Array.isArray(value.entries)) throw Error('Invalid native workflow question facts.');
  const seen = new Set();
  for (const row of value.entries) {
    if (!row || typeof row.qid !== 'string' || !/^dwfq-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.qid) || seen.has(row.qid)
      || typeof row.actor !== 'string' || !row.actor || !Number.isSafeInteger(row.actorSeq) || row.actorSeq < 0
      || typeof row.actorRef?.siteId !== 'string' || !row.actorRef.siteId || !Number.isSafeInteger(row.actorRef.ordinal) || row.actorRef.ordinal < 1
      || row.actor !== `${row.actorRef.siteId}@${row.actorRef.ordinal}` || typeof row.toolCallId !== 'string' || !row.toolCallId
      || typeof row.childId !== 'string' || !row.childId || !Number.isSafeInteger(row.askedAt) || row.askedAt < 0
      || !['pending', 'answered', 'withdrawn'].includes(row.status)
      || row.actorName !== undefined && typeof row.actorName !== 'string') throw Error('Invalid native workflow question entry.');
    text(row.question, 'question'); if (row.context !== undefined) text(row.context, 'context', false);
    if (row.status === 'answered') { text(row.answer, 'answer'); if (!Number.isSafeInteger(row.resolvedAt) || row.resolvedAt < 0) throw Error('Invalid question answer time.'); }
    else if (Object.hasOwn(row, 'answer') || Object.hasOwn(row, 'resolvedAt')) throw Error('Unexpected native question answer.');
    if (row.status === 'withdrawn' && (!Number.isSafeInteger(row.withdrawnAt) || row.withdrawnAt < 0)) throw Error('Invalid question withdrawal time.');
    seen.add(row.qid);
  }
  return structuredClone(value.entries);
}
export async function findWorkflowQuestionFact(store, sessionId, questionId, signal) {
  text(questionId, 'question_id');
  for (const summary of store.list(sessionId).runs) {
    signal?.throwIfAborted();
    const record = await store.record(sessionId, summary.runId);
    const fact = readWorkflowQuestionFacts(record).find(row => row.qid === questionId);
    if (fact) return { runId: summary.runId, fact };
  }
}
export function renderEscalateResult(_args, value) {
  const bytes = Buffer.from(value.message);
  let end = Math.min(bytes.length, 16_000);
  while (end < bytes.length && end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return [{ type: 'text', text: bytes.subarray(0, end).toString('utf8') }];
}

export function createWorkflowQuestions({ store, parent, runId, signal, notify, onError }) {
  if (!store?.mutate || !store?.record || typeof parent?.id !== 'string' || typeof runId !== 'string' || !signal)
    throw Error('Native workflow question registry requires an owning live run.');
  const sessionId = parent.id, tasks = new WeakMap(), parked = new Map(), writes = new Set();
  let closed = false, hasFailure = false, firstFailure;
  const track = work => { writes.add(work); work.finally(() => writes.delete(work)).catch(() => {}); return work; };
  const report = error => { if (!hasFailure) { hasFailure = true; firstFailure = error; } try { onError?.(error); } catch {} };
  const active = entry => !closed && !signal.aborted && !entry.controller.signal.aborted && entry.isActive();
  const owner = record => { if (record.runId !== runId || record.sessionId !== sessionId) throw Error('Question run ownership changed.'); };
  const rows = record => {
    owner(record); readWorkflowQuestionFacts(record);
    return (record.workflowQuestions ??= { format: FORMAT, version: VERSION, runId, sessionId, entries: [] }).entries;
  };
  const cleanup = entry => { entry.cleanup?.(); parked.delete(entry.fact.qid); entry.taskState.entries.delete(entry); };
  function withdraw(entry, reason) {
    if (entry.done) return;
    entry.controller.abort(canceled(reason)); entry.reject(canceled(reason));
    // Do not race a committing answer. Its own signal gate decides whether the
    // answer committed; a later withdrawal never rewrites an answered fact.
    const work = entry.operation.catch(() => {}).then(async () => {
      if (entry.done) return;
      try {
        await store.mutate(sessionId, runId, record => {
          const row = rows(record).find(row => row.qid === entry.fact.qid);
          if (row?.status === 'pending') { row.status = 'withdrawn'; row.withdrawnAt = Date.now(); }
        });
      } finally {
        entry.done = true; entry.state = 'withdrawn'; cleanup(entry);
        try { await notify?.({ type: 'escalation-withdrawn', runId, qid: entry.fact.qid }); } catch (error) { report(error); }
      }
    });
    entry.operation = track(work); work.catch(report);
  }
  function cancelAsk(task, reason) {
    for (const entry of tasks.get(task)?.entries ?? []) withdraw(entry, reason);
  }
  const abort = () => { for (const entry of [...parked.values()]) withdraw(entry, signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  return {
    async escalate({ task, actor, actorSeq, childId, toolCallId, question, context, signal: toolSignal, isActive }) {
      text(question, 'question'); if (context !== undefined) text(context, 'context', false);
      if (typeof isActive !== 'function' || typeof task !== 'object' || !task) throw Error('Missing native active ask identity.');
      if (closed || signal.aborted || toolSignal?.aborted) throw canceled(toolSignal?.reason ?? signal.reason);
      if (!isActive()) return refusal('no_active_ask');
      if (typeof actor?.siteId !== 'string' || !Number.isSafeInteger(actor.ordinal) || actor.ordinal < 1
        || !Number.isSafeInteger(actorSeq) || actorSeq < 0 || typeof childId !== 'string' || !childId
        || typeof toolCallId !== 'string' || !toolCallId) throw Error('Invalid question Actor/tool identity.');
      let taskState = tasks.get(task);
      if (!taskState) { taskState = { count: 0, entries: new Set() }; tasks.set(task, taskState); }
      if (taskState.count >= WORKFLOW_QUESTION_BUDGET) return refusal('budget_exhausted');
      taskState.count++;
      const fact = { qid: `dwfq-${randomUUID()}`, actor: `${actor.siteId}@${actor.ordinal}`,
        actorRef: { siteId: actor.siteId, ordinal: actor.ordinal }, actorSeq, childId, toolCallId,
        ...(actor.name ? { actorName: actor.name } : {}), question, ...(context === undefined ? {} : { context }), askedAt: Date.now(), status: 'pending' };
      let resolve, reject;
      const answer = new Promise((yes, no) => { resolve = yes; reject = no; });
      void answer.catch(() => {});
      const entry = { fact, taskState, isActive, resolve, reject, controller: new AbortController(), done: false, operation: Promise.resolve() };
      parked.set(fact.qid, entry); taskState.entries.add(entry);
      const toolAbort = () => withdraw(entry, toolSignal.reason);
      toolSignal?.addEventListener('abort', toolAbort, { once: true });
      entry.cleanup = () => toolSignal?.removeEventListener('abort', toolAbort);
      const admission = store.mutate(sessionId, runId, record => {
        if (!active(entry) || record.status !== 'running' || record.supersededBy !== undefined) throw canceled(entry.controller.signal.reason);
        const entries = rows(record);
        if (entries.some(row => row.qid === fact.qid)) throw Error('Duplicate native workflow question identity.');
        entries.push(structuredClone(fact));
        if (!foldNativeRunFact(record, runId, 'escalation-raised', { ...publicFact(fact), actor: fact.actorRef }))
          throw Error('The native run did not accept its actual escalation observation.');
      }, { signal: AbortSignal.any([signal, entry.controller.signal]) });
      entry.operation = track(admission);
      try {
        await admission;
        entry.admitted = true;
        if (active(entry)) await notify?.({ type: 'escalation-raised', runId, ...publicFact(fact), actor: fact.actorRef });
        return await answer;
      } catch (error) {
        if (!signal.aborted && !toolSignal?.aborted && !entry.controller.signal.aborted) report(error);
        withdraw(entry, error); throw error;
      }
    },
    async resolve({ sessionId: caller, questionId, answer, signal: callerSignal }) {
      if (caller !== sessionId) throw Error('Workflow question does not belong to the current session.');
      text(questionId, 'question_id'); text(answer, 'answer'); callerSignal?.throwIfAborted();
      const entry = parked.get(questionId);
      if (!entry) {
        const record = await store.record(sessionId, runId), row = readWorkflowQuestionFacts(record).find(row => row.qid === questionId);
        return failure(row?.status === 'answered' ? 'already_resolved' : row ? 'run_not_in_flight' : 'unknown_question', questionId);
      }
      const work = entry.operation.then(async () => {
        if (!active(entry) || entry.done) return failure(entry.state === 'answered' ? 'already_resolved' : 'run_not_in_flight', questionId);
        let result;
        await store.mutate(sessionId, runId, record => {
          const row = rows(record).find(row => row.qid === questionId);
          if (!row) { result = failure('unknown_question', questionId); return; }
          if (row.status !== 'pending') { result = failure(row.status === 'answered' ? 'already_resolved' : 'run_not_in_flight', questionId); return; }
          if (!active(entry) || record.status !== 'running' || record.supersededBy !== undefined) { result = failure('run_not_in_flight', questionId); return; }
          row.status = 'answered'; row.answer = answer; row.resolvedAt = Date.now(); result = { ok: true, qid: questionId };
          if (!foldNativeRunFact(record, runId, 'escalation-resolved', { qid: questionId, answer }))
            throw Error('The native run did not accept its actual escalation answer observation.');
        }, { signal: AbortSignal.any([signal, entry.controller.signal, ...(callerSignal ? [callerSignal] : [])]) });
        if (result.ok) {
          // The summary commit can finish after ask/tool cancellation already
          // rejected the parked call. Keep the committed answer fact, but do
          // not claim that its answer reached a waiter which no longer exists.
          const deliverable = active(entry);
          entry.done = true; entry.state = 'answered'; cleanup(entry);
          if (deliverable) entry.resolve({ status: 'answered', message: answer, qid: questionId });
          try { await notify?.({ type: 'escalation-resolved', runId, qid: questionId, answer }); } catch (error) { report(error); }
          if (!deliverable) return failure('run_not_in_flight', questionId);
        }
        return result;
      });
      entry.operation = track(work.catch(() => {}));
      try { return await work; } catch (error) { if (!active(entry)) return failure('run_not_in_flight', questionId); throw error; }
    },
    cancelAsk,
    pending() { return [...parked.values()].filter(entry => entry.admitted && active(entry) && !entry.done).map(entry => publicFact(entry.fact)); },
    async close(reason = Error('Workflow closed.')) {
      closed = true; signal.removeEventListener('abort', abort);
      for (const entry of [...parked.values()]) withdraw(entry, reason);
      while (writes.size) await Promise.allSettled([...writes]);
      if (hasFailure) throw firstFailure ?? Error('Native workflow question cleanup failed.');
    },
  };
}
