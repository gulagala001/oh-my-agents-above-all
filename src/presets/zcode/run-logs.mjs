// GetWorkflowRunLogEntrySchema (fixed 3.15.1) exposes sequence/message/at.
// Its v4 display uses 40 entries and 1024 UTF-16 units per message. The
// additional 64 KiB JSON envelope budget below is an explicit native bound.
export const WORKFLOW_LOG_LIMITS = Object.freeze({ entries: 40, messageChars: 1024, storedBytes: 64 * 1024 });
const FORMAT = 'omaa.zcode.log-tail';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const bytes = value => Buffer.byteLength(JSON.stringify(value));

function facts(record) {
  const value = record.workflowLog;
  if (value === undefined) return;
  if (!object(value) || value.format !== FORMAT || value.version !== 1
    || !keys(value, ['format', 'version', 'sessionId', 'runId', 'coverage', 'coverageStartedAt', 'lastSequence', 'truncatedMessages', 'entries'])
    || value.sessionId !== record.sessionId || value.runId !== record.runId
    || !['run', 'since-activation'].includes(value.coverage) || !integer(value.coverageStartedAt) || !integer(value.lastSequence)
    || !integer(value.truncatedMessages) || value.truncatedMessages > value.lastSequence
    || !Array.isArray(value.entries) || value.entries.length > WORKFLOW_LOG_LIMITS.entries
    || value.entries.length > value.lastSequence || value.lastSequence > 0 && value.entries.length === 0)
    throw Error('Invalid native workflow log facts.');
  let sequence = value.lastSequence - value.entries.length;
  for (const entry of value.entries) {
    if (!object(entry) || !keys(entry, ['sequence', 'message', 'at', 'truncated'])
      || entry.sequence !== ++sequence || typeof entry.message !== 'string'
      || entry.message.length > WORKFLOW_LOG_LIMITS.messageChars || !integer(entry.at)
      || typeof entry.truncated !== 'boolean') throw Error('Invalid native workflow log entry.');
  }
  if (value.entries.filter(entry => entry.truncated).length > value.truncatedMessages || bytes(value) > WORKFLOW_LOG_LIMITS.storedBytes)
    throw Error('Native workflow log facts exceed their storage budget.');
  return value;
}

export function initializeWorkflowLog(record, { resuming = false } = {}) {
  if (facts(record)) return false;
  record.workflowLog = { format: FORMAT, version: 1, sessionId: record.sessionId, runId: record.runId,
    coverage: resuming ? 'since-activation' : 'run', coverageStartedAt: Date.now(), lastSequence: 0, truncatedMessages: 0, entries: [] };
  if (bytes(record.workflowLog) > WORKFLOW_LOG_LIMITS.storedBytes) throw Error('Native workflow log identity exceeds its storage budget.');
  return true;
}

// Called only inside the owning store.mutate callback. These candidate values
// become facts only if that mutation commits. at is its native commit-admission
// clock, not a recovered original-journal timestamp or a job-output timestamp.
export function appendWorkflowLog(record, message) {
  if (typeof message !== 'string') throw Error('Log message must be text.');
  const value = facts(record);
  if (!value || value.lastSequence === Number.MAX_SAFE_INTEGER) throw Error('Native workflow log admission is unavailable.');
  let end = Math.min(message.length, WORKFLOW_LOG_LIMITS.messageChars);
  if (end < message.length && end > 0 && /[\uD800-\uDBFF]/.test(message[end - 1]) && /[\uDC00-\uDFFF]/.test(message[end])) end--;
  const truncated = end < message.length;
  const entry = { sequence: value.lastSequence + 1, message: message.slice(0, end), at: Date.now(), truncated };
  value.lastSequence = entry.sequence; if (truncated) value.truncatedMessages++;
  value.entries.push(entry);
  while (value.entries.length > WORKFLOW_LOG_LIMITS.entries || bytes(value) > WORKFLOW_LOG_LIMITS.storedBytes) {
    if (value.entries.length === 1) throw Error('Native workflow log entry exceeds its storage budget.');
    value.entries.shift();
  }
  return { sequence: entry.sequence, at: entry.at };
}

export function workflowLogView(record) {
  const value = facts(record);
  if (!value) return { logTailAvailable: false, logTailUnavailable: 'native_log_facts_not_recorded' };
  const dropped = value.lastSequence - value.entries.length;
  return { logTailAvailable: true, logTail: value.entries.map(({ sequence, message, at }) => ({ sequence, message, at })),
    logTailCoverage: value.coverage, logTailCoverageStartedAt: value.coverageStartedAt,
    logTailSequenceScope: 'native-log-ordinal', logTailAtScope: 'native-durable-commit-admission',
    logTailCommittedCount: value.lastSequence, logTailDroppedEntries: dropped, logTailTruncatedMessages: value.truncatedMessages,
    logTailTruncated: dropped > 0 || value.truncatedMessages > 0,
    logTailLimits: { ...WORKFLOW_LOG_LIMITS } };
}
