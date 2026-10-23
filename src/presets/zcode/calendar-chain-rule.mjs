import { parseCronInput, createCronScheduleRecord } from '@deepseek-ai/dsh-schedule';
import { computeScheduleRuleNextRunAt, scheduleRuleDefinition } from '../../../lib/zcode-calendar-rule.mjs';
import { bindCalendarDate } from '../../../lib/zcode-zoned-calendar-rule.mjs';
import { calendarDateFor } from './calendar-date.mjs';

export const CHAIN_UNITS = ['minute', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'];
export function calendarZone(timeZone) {
  const zone = parseCronInput({ expression: '0 0 * * *', time_zone: timeZone }).timeZone;
  if (zone === 'UTC') return { zone, offset: 0 };
  const match = /^Etc\/GMT([+-])([1-9]\d?)$/.exec(zone);
  if (!match || Number(match[2]) > (match[1] === '+' ? 12 : 14))
    throw Error('Calendar chains require explicit UTC or native-validated Etc/GMT fixed-offset time_zone.');
  return { zone, offset: (match[1] === '+' ? -1 : 1) * Number(match[2]) * 3_600_000 };
}
export function createCalendarChainRule(args, anchorAt) {
  if (!CHAIN_UNITS.includes(args.intervalUnit) || !Number.isInteger(args.interval) || args.interval < 1 || args.interval > 200)
    throw Error('Calendar chain interval must be hourly/daily/weekly/monthly/yearly, 1–200.');
  if (!Number.isSafeInteger(anchorAt) || anchorAt < 0 || typeof args.time_zone !== 'string' || !args.time_zone.trim())
    throw Error('Calendar chains require an actual creation anchor and an explicit time_zone.');
  const zone = parseCronInput({ expression: args.cron, time_zone: args.time_zone }).timeZone;
  const rules = bindCalendarDate(calendarDateFor(zone));
  const rule = rules.buildIntervalScheduleRule(args.intervalUnit, args.interval, args.cron, anchorAt);
  if (rule.hour < 0 || rule.hour > 23 || rule.minute < 0 || rule.minute > 59
    || rule.weekdays?.some(day => day < 0 || day > 6) || rule.monthDays?.some(day => day < 1 || day > 31)
    || rule.months?.some(month => month < 1 || month > 12)) throw Error('Invalid source calendar rule.');
  return { rule, timeZone: zone, offset: 0, semantics: 'ecmascript-compatible' };
}
export function nextCalendarChainAt(definition, from) {
  if (definition.kind === 'cron') return createCronScheduleRecord('calendar-preview', 'preview',
    { expression: definition.expression, time_zone: definition.timeZone }, from, 'preview').scheduledAt;
  if (definition.semantics !== undefined && definition.semantics !== 'ecmascript-compatible')
    throw Error('Unknown calendar chain semantics.');
  const zoned = definition.semantics === 'ecmascript-compatible';
  if (zoned && definition.offset !== 0) throw Error('Zoned calendar anchors must be actual instants without an offset shift.');
  // Tagless persisted definitions retain their original shifted fixed-offset
  // anchor and UTC-transformed computation. Never reinterpret an existing phase.
  const next = zoned
    ? bindCalendarDate(calendarDateFor(definition.timeZone)).computeScheduleRuleNextRunAt(definition.rule, from)
    : computeScheduleRuleNextRunAt(definition.rule, from + definition.offset);
  if (next === null) return null;
  const value = zoned ? next : next - definition.offset;
  if (!Number.isSafeInteger(value) || value <= from || !/^\d{4}-/.test(new Date(value).toISOString()))
    throw Error('The next calendar occurrence is outside the admitted native instant range.');
  return new Date(value).toISOString();
}

// Omitted timing preserves the original phase. Equal source rule definitions
// also preserve it; a real frequency/zone edit anchors at the accepted update.
export function updatedCalendarDefinition(previous, args, now) {
  if (args.cron === undefined) return previous;
  const cron = parseCronInput({ expression: args.cron, time_zone: args.time_zone });
  const inferred = /^\*\/([1-9]\d*)\s+\*\s+\*\s+\*\s+\*$/.exec(args.cron.trim());
  const next = args.intervalUnit !== undefined || inferred
    ? createCalendarChainRule({ ...args, intervalUnit: args.intervalUnit ?? 'minute', interval: args.interval ?? Number(inferred[1]) }, now)
    : { kind: 'cron', expression: cron.expression, timeZone: cron.timeZone };
  if (!previous) return next;
  const identity = value => value.rule ? { ...value, rule: scheduleRuleDefinition(value.rule) } : value;
  return JSON.stringify(identity(previous)) === JSON.stringify(identity(next)) ? previous : next;
}
