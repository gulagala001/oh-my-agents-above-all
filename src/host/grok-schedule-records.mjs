import { createHash } from 'node:crypto';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

export const GROK_SCHEDULE_HISTORY_LIMIT = 64;
export const GROK_SCHEDULE_RECORD_LIMIT = 1024;
export const GROK_SCHEDULE_PROMPT_BYTES = 64 * 1024;
const identifier = z.string().min(1).max(512);
const instant = z.string().refine(value => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value && /^\d{4}-/.test(value);
}, 'expected a canonical UTC instant');
const occurrenceFields = {
  occurrenceAt: instant, revision: z.number().int().positive(), runtimeId: identifier,
  state: z.enum(['RUNNING', 'ACCEPTED', 'COMPLETED', 'FAILED', 'BLOCKED', 'SKIPPED', 'UNKNOWN']),
  childId: identifier.optional(), runId: identifier.optional(), acceptedMessageId: identifier.optional(),
  executionMode: z.enum(['fresh', 'continuation', 'fresh-fallback']).optional(),
  chainIteration: z.number().int().min(1).max(10).optional(), chainReason: z.string().max(128).optional(),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), promptSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  startedAt: instant, acceptedAt: instant.optional(), endedAt: instant.optional(),
  terminalSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  terminalTurn: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), terminalDurable: z.boolean().optional(),
  stopReason: z.string().max(128).optional(), summary: z.string().max(2400).optional(),
  completionRef: z.object({
    messageId: identifier, spliceSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    messageSha256: z.string().regex(/^[a-f0-9]{64}$/), outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outputStart: z.literal(2), outputCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    outputBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), shownBytes: z.number().int().min(0).max(4000),
    origin: z.enum(['native', 'caller']),
    nativeCapture: z.object({ kind: z.literal('cold-local-plain'),
      stopReason: z.enum(['completed', 'aborted', 'max-tokens', 'refusal', 'error']),
    }).strict().optional(),
  }).strict().optional(),
  reason: z.string().max(512).optional(),
};
const occurrence = z.discriminatedUnion('sourceKind', [
  z.object({ ...occurrenceFields, sourceKind: z.literal('schedule'), sourceMessageId: identifier }).strict(),
  z.object({ ...occurrenceFields, sourceKind: z.literal('scheduler-create'), sourceCallId: identifier, rootCallId: identifier }).strict(),
]);
const expiryRemoval = z.object({
  state: z.enum(['PENDING', 'REMOVED', 'ABSENT', 'FENCED', 'UNKNOWN']),
  id: identifier, expiresAt: instant,
  ownerRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), observedAt: instant,
  receipt: z.object({ id: identifier, deleted: z.boolean() }).strict().optional(),
  observedAbsent: z.literal(true).optional(), reason: z.string().max(512).optional(),
}).strict();
const taskSchema = z.object({
  version: z.literal(1), id: identifier, sessionId: identifier, owningPreset: z.literal('omaa-grok'),
  marker: z.string().min(1).max(512), prompt: z.string().min(1).refine(value => Buffer.byteLength(value) <= GROK_SCHEDULE_PROMPT_BYTES),
  kind: z.enum(['every', 'after']), seconds: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  initialScheduledAt: instant, createdAt: instant, expiresAt: instant.optional(), phaseAnchorAt: instant.optional(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.enum(['ACTIVE', 'DELETED', 'FENCED', 'UNKNOWN', 'EXPIRED']), expiryRemoval: expiryRemoval.optional(),
  policyKey: z.string().min(1).max(8192), highWaterAt: instant.optional(),
  chain: z.object({ childId: identifier, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    iterations: z.number().int().min(1).max(10), lastOccurrenceAt: instant, policyKey: z.string().min(1).max(8192) }).strict().optional(),
  occurrences: z.array(occurrence).max(GROK_SCHEDULE_HISTORY_LIMIT), reason: z.string().max(512).optional(),
}).strict().superRefine((task, context) => {
  if (task.phaseAnchorAt && Date.parse(task.phaseAnchorAt) + task.seconds * 1000 !== Date.parse(task.initialScheduledAt))
    context.addIssue({ code: 'custom', path: ['phaseAnchorAt'], message: 'The saved cadence anchor must produce the initial target exactly.' });
  for (const [index, row] of task.occurrences.entries()) {
    const ref = row.completionRef;
    if (ref && (!row.childId || !row.runId || !row.endedAt || !['COMPLETED', 'FAILED'].includes(row.state)
      || ref.shownBytes > ref.outputBytes || ref.nativeCapture && (ref.origin !== 'native'
        || row.executionMode !== 'continuation' || row.state !== 'FAILED' || row.stopReason !== 'error'))) context.addIssue({ code: 'custom', path: ['occurrences', index, 'completionRef'],
      message: 'Completion references require exact terminal child/run ownership and a bounded output preview.' });
  }
  const removal = task.expiryRemoval;
  if (!removal) return;
  if (task.kind !== 'every' || removal.id !== task.id || removal.expiresAt !== task.expiresAt
    || removal.ownerRevision !== task.revision || !['EXPIRED', 'DELETED'].includes(task.status)
    || removal.receipt && removal.receipt.id !== task.id
    || removal.state === 'REMOVED' && removal.receipt?.deleted !== true
    || removal.state === 'ABSENT' && removal.observedAbsent !== true
    || removal.state === 'ABSENT' && removal.receipt && removal.receipt.deleted !== false
    || removal.state !== 'ABSENT' && removal.observedAbsent !== undefined
    || ['PENDING', 'FENCED'].includes(removal.state) && removal.receipt !== undefined)
    context.addIssue({ code: 'custom', message: 'Grok expiry removal must retain its exact owner and actual outcome evidence.' });
});
const keyOf = id => 'task_' + createHash('sha256').update(id).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) freeze(member);
    Object.freeze(value);
  }
  return value;
};

// Authoritative owner and occurrence facts stay together in one durable row.
// There is no cross-domain transaction with native Schedule creation/deletion.
export async function createGrokScheduleRecords(ctx) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'omaa_grok_schedules', version: 1,
    layout: 'per-record', tables: { tasks: domainTable(taskSchema) } }));
  const table = domain.table('tasks');
  let writeChain = Promise.resolve(), closing = false;
  try {
    for (const [key, task] of table.entries()) {
      if (key !== keyOf(task.id)) throw Error('Grok scheduled-task storage identity mismatch.');
      freeze(task);
    }
  } catch (error) {
    await domain.close().catch(() => {});
    throw error;
  }
  return {
    get(id) { return table.get(keyOf(id)); },
    list(sessionId) { return [...table.entries()].map(([, row]) => row).filter(row => sessionId === undefined || row.sessionId === sessionId); },
    put(value) {
      const next = freeze(taskSchema.parse(value));
      if (closing) return Promise.reject(Error('Grok scheduled-task storage is closing.'));
      const write = writeChain.then(async () => {
        // Capacity and insertion share this adapter-wide critical section;
        // independent sessions cannot reserve the same last free record slot.
        if (!table.get(keyOf(next.id)) && table.size >= GROK_SCHEDULE_RECORD_LIMIT) throw Error('Grok schedule owner storage is full; no new native reminder was adopted.');
        await table.put(keyOf(next.id), next);
        return next;
      });
      writeChain = write.catch(() => {});
      return write;
    },
    get size() { return table.size; },
    async close() { closing = true; await writeChain; await domain.close(); },
  };
}
