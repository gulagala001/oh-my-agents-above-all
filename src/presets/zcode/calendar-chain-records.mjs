import { z } from 'zod';
import { finiteHash } from './finite-schedule-records.mjs';
const id = z.string().min(1).max(512);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const chainInstant = z.string().refine(value => /^\d{4}-/.test(value)
  && Number.isSafeInteger(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value);
const rule = z.object({ unit: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'yearly']), interval: z.number().int().min(1).max(200),
  hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), anchorAt: integer,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  monthDays: z.array(z.number().int().min(1).max(31)).min(1).optional(),
  months: z.array(z.number().int().min(1).max(12)).min(1).optional(), monthlyMode: z.literal('date').optional(),
}).strict();
export const calendarChainSchema = z.object({
  version: z.literal(1), id, epoch: id, sessionId: id, workspacePath: z.string().min(1).max(4096),
  title: z.string().min(1).max(120), prompt: z.string().min(1).max(16000), createdAt: integer,
  definition: z.object({ rule, timeZone: z.string().min(1).max(128), offset: z.number().int().min(-43200000).max(50400000),
    semantics: z.literal('ecmascript-compatible').optional() }).strict()
    .refine(value => value.semantics === undefined || value.offset === 0, 'Explicit-zone calendar anchors must not contain an offset shift.'),
  standingPolicy: z.string().min(1).max(65536), derivedCarrierApproval: z.literal(true), inactiveCleanupApproval: z.literal(true),
  status: z.enum(['ACTIVE', 'AWAITING_NATIVE', 'CLOSED', 'UNKNOWN', 'POLICY_BLOCKED', 'DELETED']), current: chainInstant,
  confirmedDispatches: integer, skippedOccurrences: integer, reason: z.string().max(512).optional(),
}).strict();
export const calendarOccurrenceSchema = z.object({
  version: z.literal(1), chainId: id, epoch: id, sessionId: id, workspacePath: z.string().min(1).max(4096),
  occurrenceAt: chainInstant, marker: z.string().min(1).max(512),
  phase: z.enum(['PREPARED', 'BOUND', 'RESERVED', 'CONFIRMED', 'RELEASED', 'ADMITTED', 'SKIPPED', 'UNKNOWN']),
  nativeId: id.optional(), nativeDeleted: z.boolean().optional(), cleanupUnknown: z.boolean().optional(),
  nativeMessageId: id.optional(), spliceSeq: integer.optional(), frameSha256: hash.optional(), observedAt: integer.optional(), acknowledgedAt: integer.optional(),
  release: z.object({ messageId: id, turn: integer, step: integer, contentSha256: hash }).strict().optional(),
  reason: z.string().max(512).optional(),
}).strict().superRefine((value, context) => {
  if (value.phase !== 'PREPARED' && value.phase !== 'UNKNOWN' && !value.nativeId
    || ['RESERVED', 'CONFIRMED', 'RELEASED', 'ADMITTED', 'SKIPPED'].includes(value.phase)
      && (!value.nativeMessageId || value.spliceSeq === undefined || !value.frameSha256)
    || ['CONFIRMED', 'RELEASED', 'ADMITTED', 'SKIPPED'].includes(value.phase) && value.acknowledgedAt === undefined
    || ['RELEASED', 'ADMITTED'].includes(value.phase) && !value.release)
    context.addIssue({ code: 'custom', message: 'Calendar occurrence phase lacks its actual native or logical evidence.' });
});
export const calendarOccurrenceKey = (id, epoch, at) => 'occurrence_' + finiteHash([id, epoch, at]);
export const calendarChainKey = id => 'chain_' + finiteHash(id);
export const CALENDAR_CHAIN_LIMIT = 20;
