import { readFileSync } from 'node:fs';

export const name = 'omaa-grok-scheduler';
export const inject = ['tools'];
const base = './sources/crates/codegen/xai-grok-tools/src/implementations/grok_build/scheduler/';
const source = file => readFileSync(new URL(base + file, import.meta.url), 'utf8');
const createDescription = source('create.rs').match(/format!\(\s*r#"([\s\S]*?)"#/)[1]
  .replace('Set fire_immediately: true to also fire once on creation; by default the first run waits for the interval.', 'The first run waits for the interval. fire_immediately: true is not supported by this session scheduler.')
  .replace('the schedule keeps its phase.', 'the schedule keeps its phase when the interval is unchanged. A changed interval is refused; delete and recreate the task when the user requests a new cadence.')
  .replace('- Tasks auto-expire after {} days', '- Tasks remain active until deleted and resume with this session after host restarts. Cross-session durable tasks are not supported.')
  .replace('- For one-time delayed work, run a background terminal command (e.g. `sleep 1800 && <command>`) instead; its completion notifies you', '- For one-time delayed work, set recurring: false to create a native one-shot reminder.');
const listDescription = source('list.rs').match(/fn description_template\(&self\) -> &str \{\s*"([^"]+)"/)[1];
const deleteDescription = source('delete.rs').match(/fn description_template\(&self\) -> &str \{\s*r#"([\s\S]*?)"#/)[1];

export function parseInterval(value) {
  if (typeof value !== 'string') throw new Error('interval is required when creating a task');
  const text = value.trim(), match = text.match(/^\+?(\d+)([smhd])$/);
  if (!match) throw new Error('invalid interval format: expected e.g. 5m, 2h, 1d');
  const count = BigInt(match[1]);
  if (count === 0n) throw new Error('interval value must be greater than 0');
  const seconds = count * { s: 1n, m: 60n, h: 3600n, d: 86400n }[match[2]];
  if (seconds > 18446744073709551615n || seconds > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('interval is too large for the native scheduler');
  return Math.max(60, Number(seconds));
}
export function intervalToHuman(seconds) {
  const [size, unit] = seconds % 86400 === 0 ? [86400, 'day'] : seconds % 3600 === 0 ? [3600, 'hour'] : seconds % 60 === 0 ? [60, 'minute'] : [1, 'second'];
  const count = seconds / size; return `every ${count} ${unit}${count === 1 ? '' : 's'}`;
}
const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }];
const taskSummary = task => ({ id: task.id, prompt: task.prompt, intervalHuman: task.kind === 'every' ? intervalToHuman(task.everySeconds) : task.kind === 'after' ? `once after ${task.afterSeconds} seconds` : task.kind,
  nextFireAt: task.scheduledAt, recurring: task.kind !== 'after' && task.kind !== 'at' });
function caller(exec) {
  if (!exec.agent || exec.agent.session.header.origin === 'subagent') throw new Error('scheduler requires an ordinary session agent');
  return exec.agent.session.id;
}
export function apply(ctx) {
  return ctx.inject(['schedule'], scope => mountScheduler(scope));
}
function mountScheduler(ctx) {
  const creations = new Map();
  const createFor = (sessionId, work) => {
    const previous = creations.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    creations.set(sessionId, current);
    return current.finally(() => { if (creations.get(sessionId) === current) creations.delete(sessionId); });
  };
  ctx.tools.register({ name: 'scheduler_create', description: createDescription,
    parameters: { type: 'object', properties: {
      task_id: { type: 'string', description: 'Id of an existing task to update in place: provided fields replace old values, omitted ones are unchanged, and an unknown id errors. Omit to create a task.' },
      interval: { type: 'string', description: 'Interval between executions, e.g. "5m", "2h", "1d". Required to create; optional with task_id.' },
      prompt: { type: 'string', description: 'The prompt text to execute on each scheduled fire. Required to create; optional with task_id.' },
      recurring: { type: 'boolean', description: 'Default true. Set false for a native one-shot delayed reminder.' },
      durable: { type: 'boolean', description: 'Cross-session durability is unavailable; true is refused. Ignored with task_id.' },
      fire_immediately: { type: 'boolean', description: 'Immediate delivery is unavailable; true is refused. Ignored with task_id.' },
    }, additionalProperties: false },
    output: { schema: { type: 'object', properties: { id: { type: 'string' }, humanSchedule: { type: 'string' }, updated: { type: 'boolean' } }, required: ['id', 'humanSchedule', 'updated'] }, render },
    async execute(args, exec) {
      const sessionId = caller(exec); exec.signal.throwIfAborted();
      const seconds = args.interval === undefined ? undefined : parseInterval(args.interval);
      if (args.task_id !== undefined) {
        if (args.prompt === undefined && seconds === undefined) throw new Error('nothing to update: provide interval and/or prompt alongside task_id');
        const current = (await ctx.schedule.list({ sessionId })).find(task => task.id === args.task_id);
        if (!current) throw new Error('No scheduled task with ID ' + args.task_id + ' found.');
        if (seconds !== undefined && (current.kind !== 'every' || seconds !== current.everySeconds)) throw new Error('Changing interval cannot preserve the native schedule phase; delete and recreate the task when the user requests a new cadence.');
        const result = await ctx.schedule.update({ sessionId, id: current.id, expected: current, ...(args.prompt === undefined ? {} : { prompt: args.prompt }) }, exec.signal);
        if (!result.record) throw new Error(result.message ?? result.code ?? 'native schedule update failed');
        return { id: result.record.id, humanSchedule: taskSummary(result.record).intervalHuman, updated: true };
      }
      if (args.durable === true) throw new Error('Cross-session durable tasks are not supported by the native session scheduler.');
      if (args.fire_immediately === true) throw new Error('fire_immediately is not supported by the native session scheduler.');
      if (seconds === undefined) throw new Error('interval is required when creating a task');
      if (typeof args.prompt !== 'string' || !args.prompt.trim()) throw new Error('prompt is required when creating a task');
      return createFor(sessionId, async () => {
        exec.signal.throwIfAborted();
        if ((await ctx.schedule.list({ sessionId })).length >= 50) throw new Error('Maximum 50 scheduled tasks at once');
        const task = await ctx.schedule.create(sessionId, { title: 'Grok: ' + args.prompt.trim().slice(0, 80), prompt: args.prompt,
          ...(args.recurring === false ? { after_seconds: seconds } : { every_seconds: seconds }) }, exec.signal);
        return { id: task.id, humanSchedule: taskSummary(task).intervalHuman, updated: false };
      });
    },
  });
  ctx.tools.register({ name: 'scheduler_list', description: listDescription,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object' } } }, required: ['tasks'] }, render },
    async execute(_args, exec) { return { tasks: (await ctx.schedule.list({ sessionId: caller(exec) })).map(taskSummary) }; },
  });
  ctx.tools.register({ name: 'scheduler_delete', description: deleteDescription,
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'The task ID to cancel (from scheduler_create output)' } }, required: ['id'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } }, required: ['success', 'message'] }, render },
    async execute({ id }, exec) {
      const result = await ctx.schedule.delete({ sessionId: caller(exec), id }, exec.signal);
      return { success: result.deleted, message: result.deleted ? `Scheduled task ${id} cancelled.` : `No scheduled task with ID ${id} found. Use scheduler_list to see active tasks.` };
    },
  });
}
