// OMAA's native attachment codecs, not recovered historical ZCode codecs.
// Headers carry references and execution facts; content lives in immutable items.
import { checkedWorkflowSubagentModel } from './model-bindings.mjs';
export const RUN_CACHE_VERSION = 2;
export const CONTINUATION_RECORD_VERSION = 1;
const prefix = 'omaa.zcode.continuation.';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const reference = value => object(value) && integer(value.bytes) &&
  (value.format === 'omaa.zcode.json' && value.version === 2 && object(value.root)
    || text(value.attachmentId) && typeof value.name === 'string');
const allowed = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const common = ['format', 'version', 'sessionId', 'runId', 'revision'];
function envelope(kind, fields) {
  const value = { format: prefix + kind, version: CONTINUATION_RECORD_VERSION, ...fields };
  return decodeContinuationRecord(kind, value);
}
export function decodeContinuationRecord(kind, value, owner) {
  if (!object(value) || value.format !== prefix + kind || !(value.version === CONTINUATION_RECORD_VERSION || kind === 'start-header' && value.version === 2)
    || !text(value.sessionId) || !text(value.runId) || !integer(value.revision, 1)
    || owner && (value.sessionId !== owner.sessionId || value.runId !== owner.runId))
    throw Error('Unsupported or incorrectly owned native continuation record.');
  let valid = false;
  if (kind === 'start-header') valid = allowed(value, [...common, 'cwd', 'scriptRef', 'argsRef', 'modelBindingsRef', 'resumedFrom', 'maxConcurrency', ...(value.version === 2 ? ['subagentModelRef'] : [])])
    && text(value.cwd) && reference(value.scriptRef) && reference(value.argsRef) && reference(value.modelBindingsRef)
    && (value.version !== 2 || reference(value.subagentModelRef))
    && (value.resumedFrom === undefined || text(value.resumedFrom) && value.resumedFrom !== value.runId)
    && (value.maxConcurrency === undefined || integer(value.maxConcurrency, 1));
  if (kind === 'subagent-model') {
    checkedWorkflowSubagentModel({ canonical: value.canonical, options: value.options });
    valid = allowed(value, [...common, 'canonical', 'options']) && value.revision === 1;
  }
  if (kind === 'candidate') valid = allowed(value, [...common, 'handle', 'personaRef', 'chapterCount', 'lastChapterRef', 'prefixClosedAt', 'acceptedRef'])
    && text(value.handle) && reference(value.personaRef) && integer(value.chapterCount)
    && value.revision > value.chapterCount
    && (value.chapterCount === 0 ? value.lastChapterRef === undefined : reference(value.lastChapterRef))
    && (value.acceptedRef === undefined || reference(value.acceptedRef))
    && (value.prefixClosedAt === undefined || integer(value.prefixClosedAt));
  if (kind === 'accepted-ask') valid = allowed(value, [...common, 'handle', 'actorSeq', 'inputHash', 'sourceSessionId', 'messageId'])
    && text(value.handle) && integer(value.actorSeq) && value.revision === value.actorSeq + 1
    && text(value.inputHash) && text(value.sourceSessionId) && text(value.messageId);
  if (kind === 'chapter') {
    valid = value.kind === 'actor'
      ? allowed(value, [...common, 'kind', 'handle', 'actorSeq', 'inputHash', 'resultRef', 'sourceSessionId', 'messageBoundary', 'statsRef', 'cached', 'previousChapterRef'])
        && text(value.handle) && integer(value.actorSeq) && text(value.sourceSessionId) && integer(value.messageBoundary, 1)
        && value.revision === value.actorSeq + 1
        && (value.actorSeq === 0 ? value.previousChapterRef === undefined : reference(value.previousChapterRef))
        && (value.statsRef === undefined || reference(value.statsRef))
      : value.kind === 'world' && allowed(value, [...common, 'kind', 'ordinal', 'inputHash', 'resultRef', 'cached']) && integer(value.ordinal, 1);
    valid &&= text(value.inputHash) && reference(value.resultRef) && typeof value.cached === 'boolean';
  }
  if (!valid) throw Error('Invalid native continuation ' + kind + ' record.');
  return structuredClone(value);
}
export const startHeaderRecord = fields => envelope('start-header', { version: fields.subagentModelRef === undefined ? 1 : 2, ...fields });
export const subagentModelRecord = fields => envelope('subagent-model', fields);
export const candidateRecord = fields => envelope('candidate', fields);
export const chapterRecord = fields => envelope('chapter', fields);
export const acceptedAskRecord = fields => envelope('accepted-ask', fields);
export function assertRunCache(record, sessionId) {
  const execution = record?.execution;
  if (!object(record) || record.sessionId !== sessionId || !text(record.runId) || !object(execution)
    || ![1, RUN_CACHE_VERSION].includes(execution.version) || !Array.isArray(execution.actors) || !Array.isArray(execution.world))
    throw Error('This workflow has no supported durable task-prefix cache.');
  if (execution.version === 1 && typeof execution.script !== 'string'
    || execution.version === RUN_CACHE_VERSION && !reference(execution.startHeaderRef))
    throw Error('The native continuation start header is incomplete.');
  return execution;
}
