import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { ScheduleService, decodeScheduleRecord } from '@deepseek-ai/dsh-schedule';

// rc.2's public update re-anchors intervals, and delete has no expected-record
// condition. This narrow, version-pinned seam joins the ORIGINAL FIFO used by
// create/update/delete/delivery/archive. It never replaces a service or timer.
// Keep both the complete package implementation and the live method identities
// checked: a different host must be reviewed before this seam can write.
const binding = JSON.parse(readFileSync(new URL('../presets/grok/source.json', import.meta.url), 'utf8')).schedulerAdapter.transactionCompatibility;
const { implementationSha256 } = binding;
const methods = Object.fromEntries(Object.keys(binding.methods)
  .map(name => [name, ScheduleService.prototype[name]]));
let verified;
const hash = value => createHash('sha256').update(value).digest('hex');
const catalogRow = task => ({ ...task.record, sessionId: task.sessionId, status: task.status,
  ...(task.lastDelivery === undefined ? {} : { lastDelivery: task.lastDelivery }) });
export const scheduleConflict = () => Object.assign(Error('Native schedule changed; refresh its current record before retrying.'), { code: 'schedule_conflict' });

export function verifyGrokScheduleImplementation() {
  if (!verified) {
    const require = createRequire(import.meta.url);
    const manifest = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-schedule/package.json'), 'utf8'));
    if (!binding.reviewedVersions.includes(manifest.version) || hash(readFileSync(require.resolve('@deepseek-ai/dsh-schedule'))) !== implementationSha256
      || Object.entries(methods).some(([name, method]) => typeof method !== 'function' || hash(Function.prototype.toString.call(method)) !== binding.methods[name]))
      throw Error('Grok phase-preserving schedule transactions require a reviewed DSH Schedule implementation: ' + binding.reviewedVersions.join(', '));
    verified = manifest.version;
  }
  return { version: verified, implementationSha256 };
}

export function assertGrokScheduleTransaction(schedule) {
  const service = schedule?.[symbols.original] ?? schedule;
  verifyGrokScheduleImplementation();
  if (!service || Object.getPrototypeOf(service) !== ScheduleService.prototype
    || Object.entries(methods).some(([name, method]) => service[name] !== method)
    || service.stopping || typeof service.runtime?.requestDrive !== 'function')
    throw Error('The reviewed native Schedule queue is unavailable or has been replaced.');
  return service;
}

// `expected` is a complete catalog row, including status and last delivery.
// The callback may persist its own intent/result while retaining the queue.
// Cross-domain persistence is NOT atomic: callers must fence an unknown result.
export async function withGrokScheduleTransaction(schedule, { sessionId, id, expected, signal, check = () => {} }, work) {
  const service = assertGrokScheduleTransaction(schedule);
  return service.serialize(async () => {
    const domain = await service.getDomain();
    const guard = () => { signal?.throwIfAborted(); assertGrokScheduleTransaction(schedule); check(); };
    guard();
    const tasks = domain.table('tasks'), current = tasks.get(id);
    if (!current || current.sessionId !== sessionId) {
      if (expected !== undefined) throw scheduleConflict();
      return work({ current: undefined });
    }
    if (!isDeepStrictEqual(catalogRow(current), expected)) throw scheduleConflict();
    let used = false;
    const beginWrite = () => {
      guard();
      if (used || tasks.get(id) !== current) throw scheduleConflict();
      used = true;
    };
    const notify = () => { service.emitChanged(); service.runtime.requestDrive(); };
    return work({ current: structuredClone(catalogRow(current)), check: guard,
      async replace(record) {
        const refusal = service.reminderTargetRefusal(sessionId);
        if (refusal) throw Error(refusal.message ?? refusal.code);
        const next = decodeScheduleRecord(record);
        if (current.status !== 'active' || next.id !== id) throw scheduleConflict();
        beginWrite();
        await tasks.put(id, { ...current, record: next });
        notify();
        return catalogRow({ ...current, record: next });
      },
      async remove() {
        beginWrite();
        await tasks.delete(id);
        notify();
        return { id, deleted: true };
      },
    });
  });
}

// Fixed Grok actor.rs Update and types.rs next_fire_at: keep the creation or
// last-fire anchor. If the proposed next fire is already due, move the anchor
// to the accepted update time; do not replay missed occurrences.
export function grokUpdatedTarget(anchorAt, seconds, now = Date.now()) {
  const anchor = Date.parse(anchorAt), interval = seconds * 1000;
  if (!Number.isSafeInteger(anchor) || !Number.isSafeInteger(interval) || seconds < 60)
    throw Error('Invalid Grok schedule anchor or interval.');
  const next = (anchor + interval <= now ? now : anchor) + interval;
  if (!Number.isSafeInteger(next) || !Number.isFinite(new Date(next).getTime()) || !/^\d{4}-/.test(new Date(next).toISOString()))
    throw Error('Grok schedule target is outside the supported date range.');
  return new Date(next).toISOString();
}
