import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { readWorkflowQuestionFacts } from './questions.mjs';

// A durable question fact and a native driver input are different things.
// This router owns only its identified notices in the exact live parent inbox.
export function createWorkflowQuestionNotices(ctx) {
  const notices = new Map(), stepSignals = new WeakMap();
  let closed = false;
  const valid = row => {
    if (closed || row.retired || row.signal.aborted || ctx.agents.get(row.parent.id) !== row.parent
      || ctx.omaa.modeFor(row.parent.session) !== 'default'
      || (row.parent.status === 'running' && stepSignals.get(row.parent)?.aborted)) return false;
    try { row.check(); return row.isCurrent() && row.questions().pending().some(value => value.qid === row.qid); }
    catch { return false; }
  };
  const retire = row => {
    row.retired = true;
    try { if (row.parent.inbox.remove(row.message.id)) notices.delete(row.message.id); }
    catch (error) { row.onError(error); }
    // A claimed notice cannot be removed from the inbox. Retain its identity
    // for the global pre-step filter until commit or the owning turn ends.
  };
  const liveQuestion = (agent, message) => {
    const registry = ctx.omaa.workflowQuestionRegistries.get(message.source.runId);
    return registry?.sessionId === agent.id && registry.questions.pending().some(row => row.qid === message.source.questionId);
  };
  const archivedOwned = async (agent, message) => {
    const source = message.source;
    if (source?.kind !== 'omaa-zcode-workflow' || source.form !== 'notice'
      || typeof source.runId !== 'string' || !source.runId || source.runId.length > 128
      || typeof source.questionId !== 'string' || !/^dwfq-[0-9a-f-]{36}$/.test(source.questionId)) return false;
    try {
      const record = await ctx.omaa.workflowArtifacts.record(agent.id, source.runId);
      return record.sessionId === agent.id && record.runId === source.runId
        && readWorkflowQuestionFacts(record).some(row => row.qid === source.questionId);
    }
    catch { return false; } // An unproven input is not ours to discard.
  };
  ctx.effect(() => {
    ctx.on('agent/pre-step', async (event, next) => {
      stepSignals.set(event.agent, event.signal);
      const decision = await next();
      if (decision.kind !== 'enter') return decision;
      const ownedRows = new Map(), archiveProof = new Set();
      for (const message of decision.messages) {
        const row = notices.get(message.id);
        if (row?.parent === event.agent) ownedRows.set(message.id, row);
        else if (await archivedOwned(event.agent, message)) archiveProof.add(message.id);
      }
      // Check liveness synchronously after every archival read. A question can
      // retire while a different message's archive proof is still awaiting.
      event.signal.throwIfAborted();
      const messages = decision.messages.filter(message => {
        const row = notices.get(message.id) ?? ownedRows.get(message.id);
        if (row?.parent === event.agent) {
          if (valid(row)) return true;
          notices.delete(message.id); return false;
        }
        // An archival pending row cannot recreate a live deferred after restart.
        return !archiveProof.has(message.id) || liveQuestion(event.agent, message);
      });
      if (messages.length === decision.messages.length) return decision;
      // Native pre-step appends freshly projected runtime context after the
      // claimed waking input. Retiring our last real notice must also leave
      // an empty step, rather than spend a model call on context alone.
      return { ...decision, messages: messages.some(message => message.source?.kind !== 'runtime-context') ? messages : [] };
    }, { global: true, prepend: true });
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      if (notices.get(message.id)?.parent === agent) notices.delete(message.id);
    }, { global: true });
    ctx.on('agent/disposed', ({ agent }) => {
      for (const [id, row] of notices) if (row.parent === agent) notices.delete(id);
      stepSignals.delete(agent);
    }, { global: true });
    ctx.on('agent/status', ({ agent, status }) => {
      // A later turn must not inherit a canceled predecessor's step signal
      // while its own system-prompt assembly is still awaiting pre-step.
      if (status === 'idle') stepSignals.delete(agent);
    }, { global: true });
    ctx.on('session/event', (session, event) => {
      if (event.type === 'user/message') {
        const message = event.data.message ?? event.data;
        if (notices.get(message.id)?.parent.id === session.id) notices.delete(message.id);
      } else if (event.type === 'turn/end') {
        for (const [id, row] of notices) if (row.parent.id === session.id && row.retired) {
          try {
            const pending = [...row.parent.inbox.nextTurn, ...row.parent.inbox.nextStep];
            if (!pending.some(message => message.id === id)) notices.delete(id);
          } catch { /* Keep retired identity if a pending read cannot be proved. */ }
        }
      }
    }, { global: true });
    return () => { closed = true; for (const row of [...notices.values()]) retire(row); };
  }, 'Owned workflow question notice routing');
  return {
    forRun({ parent, runId, signal, check, isCurrent, questions, onError }) {
      const seen = new Set(), owned = new Map();
      let stopped = false;
      const withdraw = qid => { const row = owned.get(qid); if (row) { retire(row); owned.delete(qid); } };
      const close = () => { stopped = true; for (const qid of [...owned.keys()]) withdraw(qid); };
      const abort = () => close();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) close();
      return {
        notify(event) {
          if (event.type === 'escalation-resolved' || event.type === 'escalation-withdrawn') { withdraw(event.qid); return; }
          if (event.type !== 'escalation-raised' || seen.has(event.qid)) return;
          const row = { parent, runId, qid: event.qid, signal, check, isCurrent, questions, onError, retired: stopped };
          // Reserve before the synchronous native send; no automatic retry even
          // when delivery throws or a pre-step rejects the proposed input.
          seen.add(row.qid);
          if (!valid(row)) return;
          if (typeof parent.steer !== 'function' || typeof parent.inbox?.remove !== 'function')
            throw Error('The owning native Agent lacks the public steering/inbox contract.');
          const text = 'Your own live workflow raised a blocking Actor question. '
            + JSON.stringify({ runId, question_id: row.qid })
            + '. Read get_workflow_run for the actual current pending facts, then use resolve_workflow_question only if still live. '
            + 'This producer notice is not user input or permission approval; it may become stale before native scheduling handles it.';
          if (Buffer.byteLength(text, 'utf8') > 4096) return { state: 'suppressed', reason: 'notice-size-bound' };
          row.message = createUserMessage({ source: { kind: 'omaa-zcode-workflow', form: 'notice',
            summary: boundContextSummary('Workflow raised blocking question ' + row.qid), runId, questionId: row.qid },
          content: [{ type: 'text', text }] });
          notices.set(row.message.id, row); owned.set(row.qid, row);
          try { parent.steer(row.message); }
          catch (error) { retire(row); throw error; }
          return { messageId: row.message.id, state: 'queued', scheduling: 'nearest-native-step' };
        },
        close() { signal.removeEventListener('abort', abort); close(); },
      };
    },
  };
}
