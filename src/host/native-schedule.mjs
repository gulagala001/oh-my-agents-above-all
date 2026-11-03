import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';

const adapters = new WeakMap(), originals = new WeakMap();
const recordKeys = ['id', 'kind', 'title', 'prompt', 'scheduledAt', 'afterSeconds', 'everySeconds', 'time', 'timeZone', 'weekdays', 'expression', 'rrule'];
export const scheduleRecord = value => Object.fromEntries(recordKeys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export const scheduleOriginal = value => originals.get(value) ?? value?.[symbols.original] ?? value;
export function sessionScheduleRow(value) {
  if (!value?.target) return value;
  return { ...scheduleRecord(value), sessionId: value.target.kind === 'session' ? value.target.sessionId : undefined,
    status: value.status === 'active' ? 'active' : 'inactive',
    ...(value.lastDelivery === undefined ? {} : { lastDelivery: value.lastDelivery }) };
}
function timing(request) {
  if (request.timing) return request.timing;
  const choices = [['after', 'after_seconds'], ['at', 'at'], ['every', 'every_seconds'], ['daily', 'daily'], ['weekly', 'weekly'], ['cron', 'cron'], ['rrule', 'rrule']]
    .filter(([, key]) => request[key] !== undefined);
  if (choices.length !== 1) throw Error('Exactly one native schedule timing is required.');
  const [kind, key] = choices[0]; return { kind, [key]: request[key] };
}

/** Keep preset-owned Session scheduling on the Host's public task-management API. */
export function sessionSchedule(service) {
  service = scheduleOriginal(service);
  if (!service || typeof service.edit !== 'function') return service;
  if (adapters.has(service)) return adapters.get(service);
  const owned = async (sessionId, id) => {
    const row = await service.view({ id });
    return row?.target?.kind === 'session' && row.target.sessionId === sessionId ? row : undefined;
  };
  const adapter = {
    async catalog() { return (await service.catalog()).map(sessionScheduleRow); },
    async list({ sessionId }) { return (await adapter.catalog()).filter(row => row.sessionId === sessionId && row.status === 'active'); },
    async create(sessionId, request, signal) {
      return sessionScheduleRow(await service.create({ title: request.title, prompt: request.prompt, timing: timing(request),
        target: { kind: 'session', sessionId } }, sessionId, signal));
    },
    async update(request, signal) {
      signal?.throwIfAborted();
      const current = await owned(request.sessionId, request.id);
      if (!current) return { id: request.id, code: 'schedule_not_found' };
      if (request.expected && !isDeepStrictEqual(scheduleRecord(current), scheduleRecord(request.expected)))
        return { id: request.id, code: 'schedule_conflict' };
      const changedTiming = request.change ?? request.timing;
      const patch = { ...(request.title === undefined ? {} : { title: request.title }), ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
        ...(changedTiming === undefined ? {} : { timing: changedTiming }) };
      if (!Object.keys(patch).length) return { updated: false, record: sessionScheduleRow(current) };
      const result = await service.edit({ id: request.id, action: 'update', patch, expectedUpdatedAt: current.updatedAt ?? null }, request.sessionId, signal);
      if (result.code) return result;
      return { updated: !isDeepStrictEqual(scheduleRecord(result), scheduleRecord(current)), record: sessionScheduleRow(result) };
    },
    async delete({ sessionId, id }, signal) {
      signal?.throwIfAborted(); const current = await owned(sessionId, id);
      if (!current) return { id, code: 'schedule_not_found' };
      return service.edit({ id, action: 'delete', expectedUpdatedAt: current.updatedAt ?? null }, sessionId, signal);
    },
    async history({ sessionId, ...request }) {
      if (!await owned(sessionId, request.id)) throw Error('The scheduled task no longer targets this Session.');
      return service.history(request);
    },
  };
  adapters.set(service, adapter); originals.set(adapter, service); return adapter;
}
