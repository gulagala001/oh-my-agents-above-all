import { symbols } from '@deepseek-ai/cordis';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { finiteScheduleSchema, finitePendingSchema, FINITE_PENDING_LIMIT, finitePendingKey } from './finite-schedule-records.mjs';

import { calendarChainSchema, calendarOccurrenceSchema, calendarChainKey, CALENDAR_CHAIN_LIMIT } from './calendar-chain-records.mjs';

const ownerSchema = z.object({ sessionId: z.string(), workspacePath: z.string(), id: z.string(), createdAt: z.number(),
  timing: z.object({ intentSha256: z.string(), nativeSha256: z.string() }).strict().optional(),
  finite: finiteScheduleSchema.optional(),
  deleted: z.boolean().optional() }).strict();
const stores = new WeakMap();

// DomainFacility rejects a second open(name), including one from another
// Agent scope. All ZCode scopes borrow this one typed handle; only the last
// drained borrower closes it. No diagnostic get(name) or untyped adoption.
export async function acquireZCodeCronStore(ctx) {
  const service = ctx.get('storageDomain');
  if (!service?.open) throw Error('Native ZCode Cron storage is unavailable.');
  const facility = service[symbols.original] ?? service;
  for (;;) {
    let record = stores.get(facility);
    if (record?.closing) { await record.closing; continue; }
    if (!record) {
      record = { references: 0, closing: undefined, pendingWrites: Promise.resolve() };
      record.ready = Promise.resolve().then(() => service.open(defineDomain({ name: 'omaa_zcode_cron', version: 1,
        layout: 'per-record', tables: { owners: domainTable(ownerSchema), pending: domainTable(finitePendingSchema),
          calendar_chains: domainTable(calendarChainSchema), calendar_occurrences: domainTable(calendarOccurrenceSchema) } })));
      record.ready.catch(() => {});
      stores.set(facility, record);
    }
    record.references++;
    let released = false;
    const release = () => {
      if (released) return record.closing ?? Promise.resolve();
      released = true;
      if (--record.references !== 0) return Promise.resolve();
      record.closing = record.ready.then(async domain => {
        await record.pendingWrites.catch(() => {});
        await domain.close();
        if (stores.get(facility) === record) stores.delete(facility);
      }, error => {
        // No handle was acquired. The last failed opener can release its slot.
        if (stores.get(facility) === record) stores.delete(facility);
        throw error;
      });
      // A failed close retains the rejected closing promise: another borrower
      // must not silently reopen a domain whose prior owner is not quiescent.
      record.closing.catch(() => {});
      return record.closing;
    };
    try {
      const domain = await record.ready;
      const pending = domain.table('pending'), calendarChains = domain.table('calendar_chains');
      return { owners: domain.table('owners'), pending, calendarChains, calendarOccurrences: domain.table('calendar_occurrences'), release,
        prepareCalendarChain(value) {
          const saved = calendarChainSchema.parse(value);
          const work = record.pendingWrites.catch(() => {}).then(async () => {
            if (record.closing) throw Error('Calendar chain admission is closing.');
            if ([...calendarChains.entries()].filter(([, row]) => row.status !== 'DELETED' && row.status !== 'CLOSED').length >= CALENDAR_CHAIN_LIMIT)
              throw Error('Calendar chain admission is full; no retained receipt was evicted.');
            if (calendarChains.get(calendarChainKey(saved.id))) throw Error('Calendar chain id already exists.');
            await calendarChains.put(calendarChainKey(saved.id), saved);
          });
          record.pendingWrites = work; work.catch(() => {}); return work;
        },
        preparePending(value) {
          const saved = finitePendingSchema.parse(value);
          // Shared handle serializes bounded admission. This is not a native
          // Schedule/owner transaction; durable PREPARED precedes native I/O.
          const work = record.pendingWrites.catch(() => {}).then(async () => {
            if (record.closing) throw Error('Finite pending admission is closing.');
            if (pending.size >= FINITE_PENDING_LIMIT) throw Error('Unresolved finite creations are full; inspect them explicitly. No record was evicted.');
            await pending.put(finitePendingKey(saved.marker), saved);
          });
          record.pendingWrites = work; work.catch(() => {}); return work;
        },
      };
    } catch (error) {
      // The failed opener remains reserved until every awaiting borrower has
      // left; a failed native close is reported rather than silently retried.
      try { await release(); } catch (cleanup) {
        if (cleanup !== error) throw new AggregateError([error, cleanup], 'ZCode Cron storage acquisition and cleanup failed.');
      }
      throw error;
    }
  }
}
