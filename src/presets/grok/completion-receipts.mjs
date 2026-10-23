import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { capClosingContent, closingOutputPage, completionBytes, completionTextBlocks, nativeSettlementContent } from './completion-preview.mjs';

const MAX_PENDING = 1024;
const MAX_RECEIPT_LOG_BYTES = 16 * 1024 * 1024;
const LOCAL_CAPTURE_REASONS = ['completed', 'aborted', 'max-tokens', 'refusal', 'error'];
const valueOf = message => ({ source: message.source, content: message.content });
const waitFor = (promise, signal) => new Promise((resolve, reject) => {
  const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) return abort();
  Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); },
    error => { signal.removeEventListener('abort', abort); reject(error); });
});

// The original full notice is accepted through the public inbox before its
// model-facing view is capped. Its actual splice event supplies durable full
// output, without a second store, synthetic journal event or second loop.
export function createGrokCompletionReceipts({ ctx, records, checkIdentity, serialize, saveOccurrence, hash,
  getPending, isCurrentRun, isClosed }) {
  const notices = new Map();
  function current(agent, proof) {
    checkIdentity(agent);
    if (proof && (proof.parent !== agent || proof.session !== agent.session)) throw Error('Completion notice owner changed.');
  }
  const toolAvailable = agent => ctx.tools.schemas(agent).some(tool => tool.name === 'scheduler_output');
  const add = (pending, message, origin, output) => {
    if (notices.size >= MAX_PENDING || notices.has(message.id)) return;
    const proof = { pending, parent: pending.scope.agent, session: pending.scope.agent.session,
      messageId: message.id, messageHash: hash(valueOf(message)), origin, output,
      ended: Promise.withResolvers() };
    if (pending.endInfo) proof.ended.resolve(true);
    notices.set(message.id, proof);
    return proof;
  };
  const persistenceFor = agent => agent.ctx.get('sessionPersistence') ?? ctx.get('sessionPersistence');
  async function sourceEvent(agent, ref, signal, expectedIdentity) {
    current(agent); signal.throwIfAborted();
    const persistence = persistenceFor(agent);
    if (typeof persistence?.stat !== 'function' || typeof persistence.open !== 'function' || persistence.identity === undefined)
      throw Error('Durable completion receipt reads are unavailable.');
    const identity = persistence.identity;
    if (expectedIdentity !== undefined && identity !== expectedIdentity) throw Error('Completion receipt backend changed across the flush barrier.');
    const sameBackend = () => persistenceFor(agent)?.identity === identity;
    const stat = await persistence.stat(agent.id, { signal });
    current(agent); signal.throwIfAborted();
    // Some backends decode a whole physical artifact even for a one-event
    // logical read. This is conservative admission, not an atomic I/O lease.
    if (!sameBackend() || stat?.header.id !== agent.id || !Number.isSafeInteger(stat.sizeBytes)
      || stat.sizeBytes < 0 || stat.sizeBytes > MAX_RECEIPT_LOG_BYTES
      || stat.eventCount !== undefined && stat.eventCount <= ref.spliceSeq)
      throw Error('Completion receipt storage is unavailable, changed or exceeds the read admission bound.');
    const handle = await persistence.open(agent.id, 'read', { signal });
    let event;
    try {
      current(agent); signal.throwIfAborted();
      if (!sameBackend() || handle.id !== agent.id || handle.header.id !== agent.id || handle.access !== 'read')
        throw Error('Completion receipt storage identity changed.');
      const result = await handle.read(ref.spliceSeq, 1, { signal });
      if (!Array.isArray(result.events) || result.events.length !== 1) throw Error('Completion receipt is not retained.');
      event = result.events[0];
      current(agent); signal.throwIfAborted();
      if (!sameBackend()) throw Error('Completion receipt storage identity changed.');
    } finally { await handle.close(); }
    current(agent); signal.throwIfAborted();
    if (!sameBackend()) throw Error('Completion receipt storage identity changed.');
    const message = event?.type === 'agent/inbox/spliced' && event.seq === ref.spliceSeq
      && event.data.inserted.find(item => item.id === ref.messageId);
    if (!message || hash(valueOf(message)) !== ref.messageSha256) throw Error('The full completion receipt is unavailable or changed.');
    const blocks = message.content.slice(ref.outputStart, ref.outputStart + ref.outputCount);
    if (blocks.length !== ref.outputCount || completionTextBlocks(blocks).length !== blocks.length
      || hash(blocks.map(block => block.text)) !== ref.outputSha256 || completionBytes(blocks) !== ref.outputBytes)
      throw Error('The full completion output does not match its receipt.');
    return { message, blocks };
  }
  function stored(agent, messageId, taskId, occurrenceAt) {
    const owners = taskId === undefined ? records.list(agent.id) : [records.get(taskId)].filter(Boolean);
    const matches = owners.flatMap(owner => owner.sessionId !== agent.id || owner.owningPreset !== 'omaa-grok' ? [] : owner.occurrences
      .filter(row => row.completionRef && row.childId && row.runId && ['COMPLETED', 'FAILED'].includes(row.state)
        && (messageId === undefined || row.completionRef.messageId === messageId)
        && (occurrenceAt === undefined || row.occurrenceAt === occurrenceAt))
      .map(row => ({ owner, row, ref: row.completionRef })));
    if (messageId !== undefined && matches.length !== 1) return;
    return matches.sort((a, b) => String(a.row.endedAt).localeCompare(String(b.row.endedAt))).at(-1);
  }
  function outputSpan(proof, message) {
    const { pending } = proof, info = pending.endInfo;
    if (!pending.accepted || !info || pending.runInfo?.runId !== info.runId || !info.local
      || pending.executionMode === 'continuation' && !pending.protectable) return;
    const output = proof.origin === 'caller' ? proof.output : info.lastAssistantMessage ?? [];
    const blocks = completionTextBlocks(output);
    if (proof.origin === 'native') {
      const source = message.source;
      if (source.kind !== 'subagent-settled' || source.form !== 'notice' || source.senderSessionId !== pending.childId) return;
      const expected = nativeSettlementContent(pending.childId, { output, stopReason: info.stopReason });
      // Match the status and the complete closing-output span. Structured
      // result/provider diagnostic tails remain opaque and are never capped.
      if (source.summary !== boundContextSummary(expected[0].text)
        || hash(message.content.slice(0, expected.length)) !== hash(expected)) {
        // A teardown failure replaces public end.output, while the manager's
        // actual notice still carries its captured result. Verified cold local
        // materialization has neither structured output nor diagnostic, so all
        // blocks after the two fixed header blocks are unambiguously closing
        // text. Authenticate the WHOLE notice; do not reconstruct child logs.
        if (info.stopReason !== 'error' || pending.executionMode !== 'continuation' || !pending.coldPlainSettlement) return;
        const closing = message.content.slice(2);
        if (completionTextBlocks(closing).length !== closing.length) return;
        for (const stopReason of LOCAL_CAPTURE_REASONS) {
          const plain = nativeSettlementContent(pending.childId, { output: closing, stopReason });
          if (source.summary === boundContextSummary(plain[0].text) && hash(message.content) === hash(plain))
            return { start: 2, count: closing.length, blocks: closing,
              nativeCapture: { kind: 'cold-local-plain', stopReason } };
        }
        return;
      }
    }
    return { start: 2, count: blocks.length, blocks };
  }
  const footer = (id, occurrenceAt) => 'Use scheduler_output(' + JSON.stringify({ task_id: id, occurrence_at: occurrenceAt, offset: 0 })
    + ') to read the full closing output; follow nextOffset until done.';
  return {
    observe(session, event) {
      if (isClosed() || event.type !== 'agent/inbox/spliced') return;
      for (const message of event.data.inserted) {
        try {
          let proof = notices.get(message.id);
          if (!proof && message.source.kind === 'subagent-settled') {
            const pending = getPending(message.source.senderSessionId);
            if (pending?.runInfo?.local && isCurrentRun(pending) && pending.scope.agent.session === session
              && ctx.agents.get(pending.scope.agent.id) === pending.scope.agent)
              proof = add(pending, message, 'native');
          }
          if (proof && proof.session === session && proof.spliceSeq === undefined && proof.messageHash === hash(valueOf(message)))
            proof.spliceSeq = event.seq;
        } catch { ctx.logger.warn('Grok completion preview proof could not be captured; the full notice is retained.'); }
      }
    },
    settled(pending) {
      for (const proof of notices.values()) if (proof.pending === pending) proof.ended.resolve(true);
    },
    abandon(pending) {
      for (const [id, proof] of notices) if (proof.pending === pending) { proof.ended.resolve(false); notices.delete(id); }
    },
    forgetParent(agent) {
      for (const [id, proof] of notices) if (proof.parent === agent) { proof.ended.resolve(false); notices.delete(id); }
    },
    deliverCaller(pending) {
      const parent = pending.scope.agent;
      if (ctx.agents.get(parent.id) !== parent) return;
      const result = pending.resultValue ?? { output: [], stopReason: pending.endInfo.stopReason,
        diagnostic: 'The native execution result could not be captured; no closing output is inferred.' };
      const content = nativeSettlementContent(pending.childId, result);
      if (pending.endInfo.stopReason !== result.stopReason) content.push({ type: 'text',
        text: 'Native lifecycle/teardown ended with ' + pending.endInfo.stopReason + '; the captured result above is not confirmation of successful teardown.' });
      const message = createUserMessage({ content, source: { kind: 'omaa-grok-schedule', form: 'notice',
        summary: boundContextSummary(content[0].text), taskId: pending.id, occurrenceAt: pending.occurrenceAt,
        childId: pending.childId, runId: pending.runInfo.runId, resultStopReason: result.stopReason,
        lifecycleStopReason: pending.endInfo.stopReason } });
      try { if (!isClosed()) add(pending, message, 'caller', result.output); }
      catch { ctx.logger.warn('Grok completion preview proof is unavailable; delivering the full captured notice.'); }
      // Use the public driver's own wake/inbox semantics. Closing runtimes
      // preserve context without creating a new wake.
      try {
        if (isClosed()) parent.inject(message);
        else if (parent.status === 'idle') parent.followup(message);
        else parent.steer(message);
      } catch { notices.delete(message.id); ctx.logger.warn('Grok completion notice was not accepted by its exact live parent.'); }
    },
    async prepare(agent, message, signal) {
      const proof = notices.get(message.id);
      if (!proof && !['subagent-settled', 'omaa-grok-schedule'].includes(message.source.kind)) return message;
      try {
        current(agent, proof); signal.throwIfAborted();
        if (!toolAvailable(agent)) return message;
        let found = stored(agent, message.id);
        if (!found && proof) {
          if (proof.messageHash !== hash(valueOf(message)) || proof.spliceSeq === undefined
            || !await waitFor(proof.pending.admission.promise, signal) || !await waitFor(proof.ended.promise, signal)) return message;
          current(agent, proof); signal.throwIfAborted();
          const span = outputSpan(proof, message);
          if (!span) return message;
          const capped = capClosingContent(message.content, span.start, span.count, footer(proof.pending.id, proof.pending.occurrenceAt));
          const ref = { messageId: message.id, spliceSeq: proof.spliceSeq, messageSha256: proof.messageHash,
            outputStart: span.start, outputCount: span.count, outputSha256: hash(span.blocks.map(block => block.text)),
            outputBytes: capped.fullBytes, shownBytes: capped.shownBytes, origin: proof.origin,
            ...(span.nativeCapture ? { nativeCapture: span.nativeCapture } : {}) };
          const backendIdentity = persistenceFor(agent)?.identity;
          if (backendIdentity === undefined || await ctx.sessions.flush(agent.session) !== true) return message;
          current(agent, proof); signal.throwIfAborted();
          await sourceEvent(agent, ref, signal, backendIdentity);
          await serialize(proof.pending.id, async () => {
            current(agent, proof); signal.throwIfAborted();
            const owner = records.get(proof.pending.id), row = owner?.occurrences.find(item => item.occurrenceAt === proof.pending.occurrenceAt);
            if (owner?.sessionId !== agent.id || row?.runId !== proof.pending.runInfo.runId || row.childId !== proof.pending.childId
              || !['COMPLETED', 'FAILED'].includes(row.state)) throw Error('Completion occurrence has no confirmed terminal ownership.');
            await saveOccurrence(owner.id, { ...row, completionRef: ref });
          });
          current(agent, proof); signal.throwIfAborted();
          found = stored(agent, message.id);
        }
        if (!found || found.ref.messageSha256 !== hash(valueOf(message))) return message;
        await sourceEvent(agent, found.ref, signal);
        current(agent, proof); signal.throwIfAborted();
        const retained = stored(agent, message.id);
        if (!retained || hash(retained.ref) !== hash(found.ref)) return message;
        const capped = capClosingContent(message.content, found.ref.outputStart, found.ref.outputCount,
          footer(found.owner.id, found.row.occurrenceAt));
        if (found.ref.nativeCapture && found.ref.nativeCapture.stopReason !== found.row.stopReason)
          return { ...message, content: [...capped.content, { type: 'text', text: 'OMAA lifecycle notice: native lifecycle/teardown ended with '
            + found.row.stopReason + '; the captured execution result above ended with ' + found.ref.nativeCapture.stopReason
            + ' and does not confirm successful teardown.' }] };
        return capped.truncated ? { ...message, content: capped.content } : message;
      } catch (error) {
        signal.throwIfAborted();
        // A failed proof/barrier/store leaves the complete original notice.
        // Never emit a preview whose full-output pointer was not confirmed.
        return message;
      } finally { if (proof) notices.delete(message.id); }
    },
    async read(agent, { id, occurrenceAt, offset = 0, limit = 16384 }, signal) {
      current(agent); signal.throwIfAborted();
      if (typeof id !== 'string' || !id || id.length > 512 || occurrenceAt !== undefined
        && (typeof occurrenceAt !== 'string' || !/^\d{4}-/.test(occurrenceAt)
          || !Number.isFinite(Date.parse(occurrenceAt)) || new Date(occurrenceAt).toISOString() !== occurrenceAt))
        throw Error('A task id and an optional exact canonical UTC occurrence are required.');
      const found = stored(agent, undefined, id, occurrenceAt);
      if (!found) throw Error('No retained, verified completion output exists for this task and occurrence.');
      const { blocks } = await sourceEvent(agent, found.ref, signal);
      const retained = stored(agent, undefined, id, found.row.occurrenceAt);
      if (!retained || retained.row.childId !== found.row.childId || retained.row.runId !== found.row.runId
        || hash(retained.ref) !== hash(found.ref)) throw Error('Completion reference is no longer retained.');
      const page = closingOutputPage(blocks, offset, limit);
      current(agent); signal.throwIfAborted();
      return { taskId: found.owner.id, occurrenceAt: found.row.occurrenceAt, childId: found.row.childId, runId: found.row.runId,
        messageId: found.ref.messageId, ...page };
    },
    close() { for (const proof of notices.values()) proof.ended.resolve(false); notices.clear(); },
  };
}
