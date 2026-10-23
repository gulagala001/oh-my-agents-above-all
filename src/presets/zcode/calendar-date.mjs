import { Temporal } from '../../../lib/zcode-temporal.mjs';

const NativeDate = globalThis.Date;
// Narrow Date binding for the five retained original calendar functions only.
// Normalize overflow using UTC calendar fields, then resolve the wall clock in
// the explicit zone with the legacy Date gap/fold rule. No global TZ mutation.
function wallEpoch(zone, year, month, day, hour, minute, second, millisecond) {
  const normalized = new NativeDate(0);
  normalized.setUTCFullYear(year, month, day);
  normalized.setUTCHours(hour, minute, second, millisecond);
  if (!Number.isSafeInteger(normalized.getTime())) throw Error('Calendar wall time is outside the Date range.');
  return Temporal.PlainDateTime.from({ year: normalized.getUTCFullYear(), month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(), hour: normalized.getUTCHours(), minute: normalized.getUTCMinutes(),
    second: normalized.getUTCSeconds(), millisecond: normalized.getUTCMilliseconds() }, { overflow: 'reject' })
    .toZonedDateTime(zone, { disambiguation: 'compatible' }).epochMilliseconds;
}
export function calendarDateFor(zone) {
  const fields = date => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(zone);
  return class CalendarDate extends NativeDate {
    constructor(...args) {
      // Date-to-Date construction copies the exact epoch, including the second
      // occurrence of a folded local hour. It must never pass through a string.
      if (args.length <= 1) { super(...args); return; }
      const [inputYear, month, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0] = args;
      const year = inputYear >= 0 && inputYear <= 99 ? inputYear + 1900 : inputYear;
      super(wallEpoch(zone, year, month, day, hour, minute, second, millisecond));
    }
    getFullYear() { return fields(this).year; }
    getMonth() { return fields(this).month - 1; }
    getDate() { return fields(this).day; }
    getDay() { return fields(this).dayOfWeek % 7; }
    getHours() { return fields(this).hour; }
    getMinutes() { return fields(this).minute; }
    setDate(day) {
      const value = fields(this);
      return this.setTime(wallEpoch(zone, value.year, value.month - 1, day,
        value.hour, value.minute, value.second, value.millisecond));
    }
    setMinutes(minute, second, millisecond) {
      const value = fields(this);
      return this.setTime(wallEpoch(zone, value.year, value.month - 1, value.day, value.hour, minute,
        arguments.length > 1 ? second : value.second, arguments.length > 2 ? millisecond : value.millisecond));
    }
  };
}
