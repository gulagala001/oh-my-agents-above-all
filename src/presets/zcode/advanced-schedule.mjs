import { createAtScheduleRecord, createCronScheduleRecord, parseCronInput } from '@deepseek-ai/dsh-schedule';

const inferredMinutes = cron => /^\*\/([1-9]\d*)\s+\*\s+\*\s+\*\s+\*$/.exec(cron.trim());
const calendarUnits = new Set(['daily', 'weekly', 'monthly', 'yearly']);

function calendarCarrier(args, now) {
  const normalized = parseCronInput({ expression: args.cron, time_zone: args.time_zone });
  const zone = normalized.timeZone, fixed = /^Etc\/GMT([+-])([1-9]\d?)$/.exec(zone);
  // IANA's Etc/GMT signs are POSIX signs: +4 means UTC-04:00. These
  // explicitly named zones have one constant offset and no DST rules.
  // https://data.iana.org/time-zones/tzdb/etcetera
  if (zone !== 'UTC' && (!fixed || Number(fixed[2]) > (fixed[1] === '+' ? 12 : 14)))
    throw Error('Calendar interval carriers require explicit UTC or a native-validated Etc/GMT fixed-offset zone. Other zones may change offset; DST adaptation is not inferred.');
  const offset = fixed ? (fixed[1] === '+' ? -1 : 1) * Number(fixed[2]) * 3_600_000 : 0;
  const anchor = new Date(now + offset), [minuteToken, hourToken, dayToken, monthToken, weekdayToken] = args.cron.trim().split(/\s+/);
  // Keep existing UTC provenance byte-for-byte. A fixed-offset rule must
  // include its zone so a real zone edit cannot masquerade as content-only.
  const intent = values => zone === 'UTC' ? values : [...values, zone];
  // Match the original carrier parser, not an expansion of the compatibility
  // cron: ranges/steps are not literal numeric slots and fall back as upstream.
  const single = token => ['*', '?'].includes(token) ? undefined : Number.isInteger(Number(token)) ? Number(token) : undefined;
  const list = token => {
    if (['*', '?'].includes(token)) return;
    const values = token.split(',').map(Number).filter(Number.isInteger);
    return values.length ? values : undefined;
  };
  const minute = single(minuteToken) ?? anchor.getUTCMinutes(), hour = single(hourToken) ?? anchor.getUTCHours();
  const days = list(dayToken) ?? [anchor.getUTCDate()], months = list(monthToken) ?? [anchor.getUTCMonth() + 1];
  const weekdays = list(weekdayToken) ?? [1];
  const unique = values => [...new Set(values)].sort((a, b) => a - b);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  if (args.intervalUnit === 'daily') {
    if (![1, 7].includes(args.interval)) throw Error('Native fixed-offset daily carriers support interval 1 or 7 only.');
    return { intent: intent(['daily', args.interval, hour, minute]), selector: args.interval === 1
      ? { daily: { time, time_zone: zone } }
      : { weekly: { time, time_zone: zone, weekdays: [anchor.getUTCDay() || 7] } } };
  }
  if (args.intervalUnit === 'weekly') {
    if (args.interval !== 1 || weekdays.some(day => day < 0 || day > 6)) throw Error('Native fixed-offset weekly carriers require interval 1 and original weekdays 0–6.');
    const selected = unique(weekdays.map(day => day || 7));
    return { intent: intent(['weekly', 1, hour, minute, selected]), selector: { weekly: { time, time_zone: zone, weekdays: selected } } };
  }
  if (args.intervalUnit === 'monthly') {
    if (![1, 2, 3, 4, 6, 12].includes(args.interval) || days.some(day => day < 1 || day > 31))
      throw Error('Native fixed-offset monthly carriers require interval 1,2,3,4,6,12 and original month days 1–31.');
    const selected = unique(days), phaseMonths = [];
    for (let month = 1; month <= 12; month++) if ((month - 1 - anchor.getUTCMonth() + 12) % args.interval === 0) phaseMonths.push(month);
    return { intent: intent(['monthly', args.interval, hour, minute, selected]), selector: {
      cron: { expression: `${minute} ${hour} ${selected.join(',')} ${phaseMonths.join(',')} *`, time_zone: zone } } };
  }
  if (args.interval !== 1 || months.some(month => month < 1 || month > 12) || days.some(day => day < 1 || day > 31))
    throw Error('Native fixed-offset yearly carriers require interval 1, months 1–12 and month days 1–31.');
  // The original yearly engine uses only the FIRST month/day, not their union.
  return { intent: intent(['yearly', 1, hour, minute, months[0], days[0]]), selector: {
    cron: { expression: `${minute} ${hour} ${days[0]} ${months[0]} *`, time_zone: zone } } };
}

export function scheduleIntent(args, now = Date.now()) {
  if (args.delayMinutes != null) return ['after', args.delayMinutes];
  const cron = parseCronInput({ expression: args.cron, time_zone: args.time_zone });
  if (args.intervalUnit === 'minute') return ['minute', args.interval];
  if (args.intervalUnit === 'hourly') return ['hourly', args.interval, Number(args.cron.trim().split(/\s+/)[0]), cron.timeZone];
  if (calendarUnits.has(args.intervalUnit)) return calendarCarrier(args, now).intent;
  return ['cron', cron.expression, cron.timeZone, args.recurring !== false];
}

// A recurring dispatch changes scheduledAt, but preserves the interval's phase.
// Content changes do not invalidate this provenance; native timing edits do.
export function nativeTimingIdentity(record) {
  if (record.kind === 'every') return ['every', record.everySeconds, Date.parse(record.scheduledAt) % (record.everySeconds * 1000)];
  if (record.kind === 'cron') return ['cron', record.expression, record.timeZone];
  if (record.kind === 'daily') return ['daily', record.time, record.timeZone];
  if (record.kind === 'weekly') return ['weekly', record.time, record.timeZone, [...record.weekdays].sort((a, b) => a - b)];
  return [record.kind, record.scheduledAt];
}

export function sameNativeCalendar(args, record) {
  if (record.kind !== 'cron' || args.intervalUnit !== undefined || args.recurring === false) return false;
  const cron = parseCronInput({ expression: args.cron, time_zone: args.time_zone });
  return cron.expression === record.expression && cron.timeZone === record.timeZone;
}

function hourlyCron(args, now) {
  const minute = args.cron.trim().split(/\s+/)[0];
  if (!/^\d+$/.test(minute) || Number(minute) > 59 || ![1, 2, 3, 4, 6, 8, 12, 24].includes(args.interval))
    throw Error('Exact native hourly carriers require a numeric compatibility-cron minute and interval 1, 2, 3, 4, 6, 8, 12 or 24. Other hour anchors cannot be represented by the public native selectors.');
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: args.time_zone, year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  // Resolve only this anchor using native strict local-time semantics (including
  // earlier overlap, and rejection of a missing local time). No custom timer.
  const base = createAtScheduleRecord('omaa-hour-preview', 'preview', { date: `${local.year}-${local.month}-${local.day}`,
    time: `${local.hour}:${String(Number(minute)).padStart(2, '0')}:00`, time_zone: args.time_zone }, now - 2 * 86_400_000, args.title);
  const utc = new Date(base.scheduledAt), hours = [];
  for (let hour = 0; hour < 24; hour++) if ((hour - utc.getUTCHours() + 24) % args.interval === 0) hours.push(hour);
  return { expression: `${utc.getUTCMinutes()} ${hours.join(',')} * * *`, time_zone: 'UTC' };
}

// Pure rule compilation: native Schedule owns every timer, write and delivery.
// The original service anchors minute carriers at creation, independently of
// the compatibility cron's wall-clock slots. Never compile them as */N cron.
export function compileNativeSchedule(args, now = Date.now()) {
  if (args.delayMinutes != null) return { after_seconds: args.delayMinutes * 60 };
  const cron = { expression: args.cron, time_zone: args.time_zone };
  // A compatibility cron needs valid syntax, not a future calendar occurrence:
  // e.g. a February/31 display can still carry monthly day 31 in other months.
  parseCronInput(cron);
  if (args.intervalUnit === 'minute') return { every_seconds: args.interval * 60 };
  if (args.intervalUnit === 'hourly') return { cron: hourlyCron(args, now) };
  if (calendarUnits.has(args.intervalUnit)) {
    const selector = calendarCarrier(args, now).selector;
    if (selector.cron) createCronScheduleRecord('omaa-rule-preview', args.prompt ?? 'preview', selector.cron, now, args.title);
    return selector;
  }
  const inferred = inferredMinutes(args.cron);
  if (inferred) return args.recurring === false ? { after_seconds: Number(inferred[1]) * 60 } : { every_seconds: Number(inferred[1]) * 60 };
  const next = createCronScheduleRecord('omaa-rule-preview', args.prompt ?? 'preview', cron, now, args.title);
  if (args.recurring !== false) return { cron };

  // Original computeInitialAutomationNextRunAt protects fixed calendar targets
  // from accidentally rolling a just-missed relative request into next year.
  if (/^\d+\s+\d+\s+\d+\s+\d+\s+\*$/.test(args.cron.trim())) {
    const prior = createCronScheduleRecord('omaa-rule-preview', args.prompt ?? 'preview', cron, now - 30 * 60_000 - 1, args.title);
    const age = now - Date.parse(prior.scheduledAt);
    if (age >= 0 && age <= 30 * 60_000) {
      if (age >= 60_000) throw Error('The one-shot calendar target just passed. Use delayMinutes for a relative request or confirm a future calendar time.');
      // Native at requires a future instant. Its minimum one-second delay is
      // an explicit adaptation of the original immediate missed-minute grace.
      return { after_seconds: 1 };
    }
  }
  return { at: next.scheduledAt };
}

export function nativeTimingChange(selector, now = Date.now()) {
  if (selector.every_seconds !== undefined) return { kind: 'every', every_seconds: selector.every_seconds };
  if (selector.after_seconds !== undefined) return { kind: 'at', at: new Date(now + selector.after_seconds * 1000).toISOString() };
  if (selector.at !== undefined) return { kind: 'at', at: selector.at };
  if (selector.daily !== undefined) return { kind: 'daily', daily: selector.daily };
  if (selector.weekly !== undefined) return { kind: 'weekly', weekly: selector.weekly };
  return { kind: 'cron', cron: selector.cron };
}
