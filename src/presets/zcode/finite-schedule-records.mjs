import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FINITE_TOKEN_LIMIT = 128;
const id = z.string().min(1).max(512);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.string().refine(value => /^\d{4}-/.test(value) && Number.isSafeInteger(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value, 'Expected a canonical four-digit UTC instant.');
const tokenSchema = z.object({
  occurrenceAt: instant, nativeMessageId: id, spliceSeq: integer, frameSha256: hash,
  state: z.enum(['RESERVED', 'CONFIRMED', 'RELEASED', 'ADMITTED', 'UNKNOWN']),
  dispatchConfirmed: z.boolean(),
  release: z.object({ messageId: id, turn: integer, step: integer, contentSha256: hash }).strict().optional(),
  reason: z.string().max(512).optional(),
}).strict();

// PREPARED is durable before native.create. Even an unknown native creation
// therefore leaves an inert marker that the root gate can filter after restart.
export const FINITE_PENDING_LIMIT = 20;
export const finitePendingSchema = z.object({
  version: z.literal(1), sessionId: id, workspacePath: z.string().min(1).max(4096),
  marker: z.string().min(1).max(512), title: z.string().min(1).max(120), prompt: z.string().min(1).max(16000),
  maxRuns: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER),
  expression: z.string().min(1).max(1024), timeZone: z.string().min(1).max(128),
  createdAt: integer, status: z.enum(['PREPARED', 'NATIVE_CONFIRMED', 'UNKNOWN', 'DELETED']),
  nativeId: id.optional(), reason: z.string().max(512).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'NATIVE_CONFIRMED' && !value.nativeId)
    context.addIssue({ code: 'custom', message: 'A confirmed native creation requires its actual id.' });
});
export const finitePendingKey = marker => 'pending_' + finiteHash(marker);

// Missing finite metadata means an existing ordinary native reminder. It is
// never inferred from maxRuns text or silently adopted by the persistent gate.
export const finiteScheduleSchema = z.object({
  version: z.literal(1), marker: z.string().min(1).max(512), prompt: z.string().min(1).max(16000),
  maxRuns: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER), confirmed: integer,
  status: z.enum(['ACTIVE', 'CLOSED', 'DELETED', 'UNKNOWN']),
  expression: z.string().min(1).max(1024), timeZone: z.string().min(1).max(128), initialScheduledAt: instant,
  highWaterAt: instant.optional(), tokens: z.array(tokenSchema).max(FINITE_TOKEN_LIMIT),
  reason: z.string().max(512).optional(),
}).strict().superRefine((value, context) => {
  const pending = value.tokens.filter(token => !token.dispatchConfirmed).length;
  if (value.confirmed > value.maxRuns || pending > value.maxRuns - value.confirmed
    || value.tokens.filter(token => token.dispatchConfirmed).length > value.confirmed)
    context.addIssue({ code: 'custom', message: 'Confirmed dispatches plus unresolved reservations must not exceed maxRuns.' });
  const seen = new Set();
  for (const [index, token] of value.tokens.entries()) {
    if (seen.has(token.occurrenceAt) || !value.highWaterAt || token.occurrenceAt > value.highWaterAt
      || ['CONFIRMED', 'RELEASED', 'ADMITTED'].includes(token.state) && !token.dispatchConfirmed
      || ['RELEASED', 'ADMITTED'].includes(token.state) && !token.release
      || token.state === 'RESERVED' && token.dispatchConfirmed)
      context.addIssue({ code: 'custom', path: ['tokens', index], message: 'Finite occurrence identity, phase or acceptance evidence is inconsistent.' });
    seen.add(token.occurrenceAt);
  }
});

export const finiteHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const cronOwnerKey = (sessionId, scheduleId) => 'schedule_' + finiteHash([sessionId, scheduleId]);
export function finiteStatus(value) {
  return { maxRuns: value.maxRuns, confirmedDispatches: value.confirmed, status: value.status,
    unresolvedReservations: value.tokens.filter(token => !token.dispatchConfirmed).length,
    pendingLogicalInputs: value.tokens.filter(token => token.dispatchConfirmed && token.state !== 'ADMITTED').length,
    ...(value.reason ? { reason: value.reason } : {}),
    semantics: 'confirmed-native-inbox-dispatch; not model completion; UNKNOWN is never automatically replayed' };
}
