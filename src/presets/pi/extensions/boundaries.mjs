import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { buildSessionProjection, convertToLlm } from '../../../../lib/pi-session-projection.mjs';
import { selectTreeRequest } from './tree-state.mjs';
import { currentSystem, requestToPi, requestFromPi } from './context.mjs';

export const boundaryRecord = 'plugin:omaa/pi-boundary';
export { buildSessionProjection, convertToLlm };
export function chainEntries(entries) {
  return entries.map((entry, index) => ({ ...entry, parentId: entries[index - 1]?.id ?? null }));
}
// The native journal holds one authoritative batch. Native custom-message
// copies are presentation receipts and are never applied twice to context.
export function boundaryEntries(events) {
  return events.filter(event => event.type === boundaryRecord).flatMap(event => event.data.entries);
}
export function materializeBoundaryMessages(session) {
  const events = session.snapshotEvents(), receipts = new Set(events.filter(event => event.type === 'user/message').map(event => event.data.source?.piBoundaryEntryId));
  for (const event of events) if (event.type === boundaryRecord) for (const message of event.data.messages) {
    if (!receipts.has(message.source.piBoundaryEntryId)) {
      session.append('user/message', message, { surfaceOp: 'append' });
      receipts.add(message.source.piBoundaryEntryId);
    }
  }
}
const contentValid = content => typeof content === 'string' || Array.isArray(content);
const customTypeValid = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
export async function prepareBoundaryEntries(base, drafts, { signal, admitContent, piContent, timestamp = new Date().toISOString() }) {
  if (!Array.isArray(drafts) || drafts.length > 4096) throw Error('Pi boundary entries must be an array of at most 4096 drafts');
  const entries = [...base], additions = [], messages = [];
  for (const draft of drafts) {
    signal.throwIfAborted();
    const entry = { id: randomUUID(), parentId: entries.at(-1)?.id ?? null, timestamp };
    if (draft?.type === 'custom') {
      if (!customTypeValid(draft.customType)) throw Error('Pi boundary customType is invalid');
      Object.assign(entry, { type: 'custom', customType: draft.customType, ...draft.data === undefined ? {} : { data: draft.data } });
    } else if (draft?.type === 'custom_message') {
      if (!customTypeValid(draft.customType) || !contentValid(draft.content) || typeof draft.display !== 'boolean') throw Error('Pi boundary custom message is invalid');
      Object.assign(entry, { type: draft.type, customType: draft.customType, content: draft.content, display: draft.display,
        ...draft.details === undefined ? {} : { details: draft.details } });
      const blocks = await admitContent(typeof draft.content === 'string' ? [{ type: 'text', text: draft.content }] : draft.content, signal);
      entry.content = await Promise.all(blocks.map(async block => ({ ...block, ...(await piContent([block], signal))[0] })));
      messages.push(createUserMessage({ content: blocks, source: { kind: 'pi-extension', form: 'context', customType: entry.customType,
        display: entry.display, ...entry.details === undefined ? {} : { details: entry.details }, timestamp: Date.parse(timestamp), piBoundaryEntryId: entry.id } }));
    } else if (draft?.type === 'context_edit') {
      const target = entries.find(entry => entry.id === draft.targetId);
      if (!target || !(target.type === 'custom_message' || target.type === 'message' && ['user', 'assistant', 'toolResult', 'custom'].includes(target.message.role))) throw Error('Pi context edit must target editable content on this branch');
      if (draft.replacement !== null && (!draft.replacement || !contentValid(draft.replacement.content))) throw Error('Pi context edit replacement must be null or contain content');
      Object.assign(entry, { type: draft.type, targetId: draft.targetId, replacement: draft.replacement });
    } else if (draft?.type === 'compaction') {
      if (typeof draft.summary !== 'string' || !draft.summary.trim() || draft.firstKeptEntryId !== null && !entries.some(entry => entry.id === draft.firstKeptEntryId)) throw Error('Pi compaction requires a summary and a retained entry on this branch');
      const systemMessage = currentSystem(buildSessionProjection(chainEntries(entries)).messages);
      Object.assign(entry, { type: draft.type, summary: draft.summary, firstKeptEntryId: draft.firstKeptEntryId ?? entry.id,
        fromHook: true, ...draft.details === undefined ? {} : { details: draft.details }, ...draft.usage === undefined ? {} : { usage: draft.usage },
        ...systemMessage ? { systemMessage } : {} });
      // No token count is invented: native requests provide actual usage, not
      // Pi's tokenizer estimate. The summary projection does not require it.
    } else throw Error('Unsupported Pi boundary draft type');
    entries.push(entry); additions.push(entry);
  }
  return { entries: chainEntries(entries), additions, messages };
}
export function commitBoundary(session, prepared, eventName) {
  if (!prepared.additions.length) return;
  appendPluginRecord(session, boundaryRecord, { eventName, entries: prepared.additions, messages: prepared.messages });
  // On publication failure the accepted batch remains authoritative. Recovery
  // replays only missing display receipts, never the extension callback.
  materializeBoundaryMessages(session);
}
export async function projectBoundaryRequest(request, events, adapters, drafts = []) {
  ({ request, events } = selectTreeRequest(request, events));
  const adapted = await requestToPi(request, adapters), entries = [], byMessageId = new Map();
  for (const event of events) {
    const message = event.data.message ?? event.data;
    if (message?.id && event.surfaceOp) byMessageId.set(message.id, event);
  }
  const receipts = new Map(request.messages.flatMap((message, index) => message.source?.piBoundaryEntryId
    ? [[message.source.piBoundaryEntryId, adapted.messages[index]]] : []));
  const checkpoint = request.messages.filter(message => message.source?.kind === 'compact-checkpoint')
    .reduce((seq, message) => Math.max(seq, byMessageId.get(message.id)?.seq ?? -1), -1);
  const currentIds = new Set(request.messages.map(message => String(byMessageId.get(message.id)?.seq ?? message.id)));
  const records = events.filter(event => event.type === boundaryRecord).map(event => ({ ...event, data: { ...event.data,
    entries: event.data.entries.filter(entry => event.seq > checkpoint || entry.type === 'custom'
      || entry.type === 'custom_message' && receipts.has(entry.id)
      || entry.type === 'context_edit' && (currentIds.has(entry.targetId) || receipts.has(entry.targetId))) } }));
  const insert = until => {
    while (records.length && records[0].seq < until) entries.push(...records.shift().data.entries.map(entry => entry.type === 'custom_message' && receipts.has(entry.id)
      ? { ...entry, content: receipts.get(entry.id).content } : entry));
  };
  request.messages.forEach((native, index) => {
    const event = byMessageId.get(native.id);
    // A replaced leading native system prompt stays at position zero, even
    // though its new journal sequence is later than every boundary record.
    // It must not drag those records in front of the original conversation.
    if (index !== 0 || native.role !== 'system') insert(event?.seq ?? Infinity);
    if (!native.source?.piBoundaryEntryId && !native.source?.piContinuation) entries.push({ type: 'message', id: String(event?.seq ?? native.id),
      timestamp: new Date(event?.time ?? 0).toISOString(), message: adapted.messages[index] });
  });
  insert(Infinity);
  const system = currentSystem(adapted.messages);
  for (let index = entries.length - 1; index >= 0; index--) if (entries[index].type === 'compaction') {
    // Native assembly owns the current system/tool state. A Pi checkpoint
    // retains it across context pruning, including a later SYSTEM.md change.
    entries[index] = { ...entries[index], ...system ? { systemMessage: system } : { systemMessage: undefined } };
    break;
  }
  const prepared = await prepareBoundaryEntries(chainEntries(entries), drafts, adapters);
  const projection = buildSessionProjection(prepared.entries);
  // Keep custom metadata for the extension context; only summary messages need
  // conversion before the native request adapter.
  const messages = projection.entries.flatMap(entry => entry.messages.flatMap(message => {
    if (['compactionSummary', 'branchSummary'].includes(message.role)) return convertToLlm([message]);
    const receipt = receipts.get(entry.sourceEntry.id);
    if (message.role === 'custom' && receipt && isDeepStrictEqual(message.content, receipt.content)) return [receipt];
    return [message.role === 'custom' ? { ...message, timestamp: 0 } : message];
  }));
  const converted = await requestFromPi(messages, { ...adapters, originals: adapted.originals, parts: adapted.parts, request });
  return { request: converted ?? request, prepared, projection, llmMessages: convertToLlm(projection.messages) };
}
