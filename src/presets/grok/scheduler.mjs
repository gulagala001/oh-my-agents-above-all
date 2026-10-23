import { readFileSync } from 'node:fs';

export const name = 'omaa-grok-scheduler';
export const inject = ['tools', 'omaa', 'agents', 'sandboxPolicy', 'schedule'];
const LIST_TASK_LIMIT = 50, LIST_BYTE_LIMIT = 24_000, PROMPT_PREVIEW_BYTES = 80;
const base = './sources/crates/codegen/xai-grok-tools/src/implementations/grok_build/scheduler/';
const source = file => readFileSync(new URL(base + file, import.meta.url), 'utf8');
const createDescription = source('create.rs').match(/format!\(\s*r#"([\s\S]*?)"#/)[1]
  .replace('Set fire_immediately: true to also fire once on creation; by default the first run waits for the interval.', 'Set fire_immediately: true for one immediate controlled first iteration of a newly created recurring task; otherwise the first run waits for the interval. It is ignored with task_id and refused for one-shot tasks.')
  .replace('the schedule keeps its phase.', 'the schedule keeps its phase when the interval is unchanged. A changed interval is refused; delete and recreate the task when the user requests a new cadence.')
  .replace('- Tasks auto-expire after {} days', '- Recurring Grok adapter dispatch expires after 7 days. Legacy ordinary native reminders retain their native lifecycle. Cross-session durable tasks are not supported.')
  .replace('- For one-time delayed work, run a background terminal command (e.g. `sleep 1800 && <command>`) instead; its completion notifies you', '- For one-time delayed work, set recurring: false to schedule a controlled one-shot Grok child.');
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
function promptPreview(prompt) {
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  if (promptBytes <= PROMPT_PREVIEW_BYTES) return { prompt, promptBytes };
  const bytes = Buffer.from(prompt.slice(0, PROMPT_PREVIEW_BYTES), 'utf8');
  let end = PROMPT_PREVIEW_BYTES;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return { prompt: bytes.subarray(0, end).toString('utf8') + '...', promptBytes, promptTruncated: true };
}
function taskSummary(task) {
  const summary = { id: task.id, ...promptPreview(task.prompt), intervalHuman: task.kind === 'every' ? intervalToHuman(task.everySeconds) : task.kind === 'after' ? `once after ${task.afterSeconds} seconds` : task.kind,
    nextFireAt: task.scheduledAt, recurring: task.kind !== 'after' && task.kind !== 'at',
    taskType: task.taskType ?? (task.adapterStatus === undefined ? 'ordinary-native-reminder' : 'grok-adapter-task') };
  const copy = (source, target, key, limit) => {
    if (source[key] === undefined) return;
    if (typeof source[key] === 'string' && source[key].length <= limit) target[key] = source[key];
    else summary.metadataTruncated = true;
  };
  copy(task, summary, 'adapterStatus', 32); copy(task, summary, 'expiresAt', 128);
  if (task.expiryRemoval && typeof task.expiryRemoval === 'object') {
    const removal = {};
    for (const [key, limit] of Object.entries({ state: 32, id: 512, expiresAt: 128, observedAt: 128, reason: 512 }))
      copy(task.expiryRemoval, removal, key, limit);
    if (Number.isSafeInteger(task.expiryRemoval.ownerRevision) && task.expiryRemoval.ownerRevision > 0)
      removal.ownerRevision = task.expiryRemoval.ownerRevision;
    else summary.metadataTruncated = true;
    if (task.expiryRemoval.observedAbsent === true) removal.observedAbsent = true;
    if (task.expiryRemoval.receipt && typeof task.expiryRemoval.receipt === 'object') {
      const receipt = {};
      copy(task.expiryRemoval.receipt, receipt, 'id', 512);
      if (typeof task.expiryRemoval.receipt.deleted === 'boolean') receipt.deleted = task.expiryRemoval.receipt.deleted;
      else summary.metadataTruncated = true;
      removal.receipt = receipt;
    }
    summary.expiryRemoval = removal;
  }
  if (task.lastOccurrence && typeof task.lastOccurrence === 'object') {
    const last = {};
    for (const [key, limit] of Object.entries({ occurrenceAt: 128, state: 32, sourceKind: 32, sourceMessageId: 512, sourceCallId: 512,
      rootCallId: 512, childId: 512, runId: 512, acceptedMessageId: 512,
      executionMode: 32, chainReason: 128, stopReason: 128, reason: 512 }))
      copy(task.lastOccurrence, last, key, limit);
    if (task.lastOccurrence.chainIteration !== undefined) {
      if (Number.isInteger(task.lastOccurrence.chainIteration) && task.lastOccurrence.chainIteration >= 1 && task.lastOccurrence.chainIteration <= 10)
        last.chainIteration = task.lastOccurrence.chainIteration;
      else summary.metadataTruncated = true;
    }
    if (task.lastOccurrence.terminalDurable !== undefined) {
      if (typeof task.lastOccurrence.terminalDurable === 'boolean') last.terminalDurable = task.lastOccurrence.terminalDurable;
      else summary.metadataTruncated = true;
    }
    summary.lastOccurrence = last;
  }
  return summary;
}
function listResult(tasks, total, adapterAvailable) {
  const result = { tasks, total, tasksTruncated: tasks.length < total,
    promptPreviewsTruncated: tasks.filter(task => task.promptTruncated).length,
    truncated: tasks.length < total || tasks.some(task => task.promptTruncated || task.metadataTruncated),
    grokAdapterAvailable: adapterAvailable, readConsistency: 'separate-current-reads',
    ...(!adapterAvailable ? { message: 'Grok scheduled-child dispatch is unavailable. Ordinary native reminders remain separately manageable; adapter references are read-only.' } : {}),
    taskLimit: LIST_TASK_LIMIT, byteLimit: LIST_BYTE_LIMIT, bytes: 0 };
  let bytes;
  do { bytes = result.bytes; result.bytes = Buffer.byteLength(JSON.stringify(result)); } while (result.bytes !== bytes);
  return result;
}
function caller(ctx, exec) {
  if (!exec.agent || exec.agent.session.header.origin === 'subagent' || Number(exec.agent.session.header.delegationDepth ?? 0) > 0) throw new Error('scheduler requires an ordinary session agent');
  if (ctx.agents.get(exec.agent.id) !== exec.agent) throw new Error('scheduler requires its actual live owning session agent');
  return exec.agent.session.id;
}
export function apply(ctx) {
  return mountScheduler(ctx);
}
function mountScheduler(ctx) {
  const lifetime = new AbortController(), requests = new Set();
  const stop = (request, code, message) => {
    request.interruption ??= { code, message };
    if (!request.controller.signal.aborted) request.controller.abort(Error(message));
  };
  ctx.effect(() => () => {
    for (const request of requests) stop(request, 'scope_disposed', 'Grok scheduler scope disposed.');
    lifetime.abort(Error('Grok scheduler scope disposed.'));
  });
  const policyFor = parent => {
    const sandbox = parent.ctx.get('sandboxPolicy') ?? ctx.sandboxPolicy;
    const approval = parent.ctx.get('approval'), permissions = parent.ctx.get('permissionPresets');
    if (typeof sandbox?.resolve !== 'function') throw Error('Native sandbox policy observation is unavailable.');
    if (approval && typeof approval.overrideOf !== 'function') throw Error('Native approval policy observation is unavailable.');
    if (permissions && typeof permissions.current !== 'function') throw Error('Native permission preset observation is unavailable.');
    return JSON.stringify({ sandbox: sandbox.resolve({ session: parent.session }),
      approval: approval ? { override: approval.overrideOf(parent.session) ?? null, configured: approval.config?.policy ?? null } : null,
      permissionPreset: permissions?.current(parent.session) ?? null });
  };
  const requestFor = (exec, arming = false) => {
    const sessionId = caller(ctx, exec), parent = exec.agent;
    const controller = new AbortController(), signal = AbortSignal.any([exec.signal, lifetime.signal, controller.signal]);
    const preset = () => parent.ctx.get('agentPresets')?.composedPreset(parent.ctx);
    const policyKey = arming ? policyFor(parent) : undefined;
    const request = { sessionId, parent, arming, controller, signal, interruption: undefined };
    const inspect = () => {
      if (exec.agent !== parent || ctx.agents.get(parent.id) !== parent || parent.session.id !== sessionId)
        stop(request, 'owner_changed', 'The scheduler live owner changed.');
      else if (arming && (ctx.omaa.product(parent.session)?.id !== 'grok' || preset() !== 'omaa-grok'))
        stop(request, 'preset_changed', 'The owning Grok preset is no longer active.');
      else if (arming && (ctx.omaa.modeFor(parent.session, parent) !== 'default' || policyFor(parent) !== policyKey))
        stop(request, 'permission_changed', 'Scheduler creation or update requires the same native permissions and default working mode.');
    };
    const check = () => {
      inspect();
      signal.throwIfAborted();
    };
    request.inspect = inspect;
    const receipt = (value, record) => {
      // A returned native write receipt remains authoritative even if its caller
      // or policy changed during persistence. Never present that as no commit.
      try { inspect(); } catch { stop(request, 'permission_changed', 'The scheduler standing policy could not be revalidated.'); }
      const interruption = request.interruption ?? (exec.signal.aborted ? { code: 'caller_cancelled', message: 'The caller cancelled while the native operation was in flight.' }
        : lifetime.signal.aborted ? { code: 'scope_disposed', message: 'The scheduler scope was disposed while the native operation was in flight.' } : undefined);
      return interruption ? { ...value, confirmed: true, interrupted: true, interruptionReason: interruption.code,
        message: interruption.message, ...(record ? { confirmedRecord: taskSummary(record) } : {}) } : value;
    };
    check(); requests.add(request);
    return { sessionId, signal, check, receipt, close: () => requests.delete(request) };
  };
  const relevant = new Set(['sandbox/mode', 'approval/policy', 'permission/preset', 'plan/mode', 'agent-preset/selected']);
  ctx.on('session/event', (session, event) => {
    if (relevant.has(event.type)) for (const request of requests) if (request.parent.session === session)
      stop(request, 'permission_changed', 'The scheduler owner policy, mode or preset changed during the native request.');
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    for (const request of requests) if (request.parent.session === session) {
      try { request.inspect(); } catch { stop(request, 'permission_changed', 'Scheduler owner preferences changed during the native request.'); }
    }
  }, { global: true });
  ctx.on('agent-preset/selected', sessionId => {
    for (const request of requests) if (request.sessionId === sessionId)
      stop(request, 'preset_changed', 'The scheduler owning preset changed during the native request.');
  }, { global: true });
  ctx.on('agent/disposed', ({ agent }) => {
    for (const request of requests) if (request.parent === agent)
      stop(request, 'owner_disposed', 'The scheduler live owner was disposed during the native request.');
  }, { global: true });
  ctx.on('session/disposed', session => {
    for (const request of requests) if (request.parent.session === session)
      stop(request, 'owner_disposed', 'The scheduler owning session was disposed during the native request.');
  }, { global: true });
  const creations = new Map();
  const createFor = (sessionId, work) => {
    const previous = creations.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    creations.set(sessionId, current);
    return current.finally(() => { if (creations.get(sessionId) === current) creations.delete(sessionId); });
  };
  const adapter = () => ctx.omaa.grokSchedules;
  const requireAdapter = () => {
    const service = adapter();
    if (!service || ['create', 'update', 'remove', 'list', 'ownership'].some(key => typeof service[key] !== 'function'))
      throw Error('Grok scheduled-child dispatch is unavailable. No new ordinary native reminder was created.');
    return service;
  };
  const readSchedules = async (exec, check) => {
    const service = adapter();
    if (service && ['list', 'ownership'].some(key => typeof service[key] !== 'function')) throw Error('Grok scheduled-child dispatch ownership or listing is unavailable.');
    const owned = service ? await service.list(exec) : []; check();
    // list() returns unbound records; catalog() supplies the actual Session
    // binding and status needed for the ownership comparison below.
    const native = (await ctx.schedule.catalog()).filter(row => row.sessionId === exec.agent.session.id && row.status === 'active'); check();
    const merged = new Map(), matching = new Set();
    for (const task of native) {
      const ownership = service?.ownership(exec, task.id, task); check();
      if (ownership?.nativeMatches) matching.add(task.id);
      merged.set(task.id, { ...task,
        // Preserve the actual native text even if an old owned task's marker
        // changed. An owner fact never authorizes silently re-adopting it.
        ...(ownership?.owned ? { taskType: 'unresolved-owned-grok-task', adapterStatus: ownership.status } : {
          // Reserved text alone establishes no ownership; an orphaned marker
          // stays inert instead of receiving a raw legacy prompt update.
          taskType: task.prompt.startsWith('[OMAA GROK DISPATCH ') ? 'unresolved-grok-reference' : 'ordinary-native-reminder' }) });
    }
    // An external edit/deletion between these reads must keep the later native
    // fact, including its real new prompt, instead of replacing it with a stale
    // adapter DTO. This remains an explicitly non-atomic current read.
    for (const task of owned) if (matching.has(task.id)) merged.set(task.id, { ...task, taskType: 'grok-adapter-task' });
    return { service, tasks: [...merged.values()] };
  };
  const rejectReference = task => {
    if (task?.taskType === 'unresolved-grok-reference') throw Error('This inert Grok reference has no verified adapter ownership. Read native reminder state; it cannot be adopted or overwritten through Grok scheduler tools.');
  };
  const isOwned = task => ['grok-adapter-task', 'unresolved-owned-grok-task'].includes(task?.taskType);
  const writeResult = (record, updated) => {
    const value = { id: record.id, humanSchedule: taskSummary(record).intervalHuman, updated, task: taskSummary(record) };
    for (const key of ['creationConfirmed', 'ownershipConfirmed']) if (typeof record[key] === 'boolean') value[key] = record[key];
    if (record.immediateDispatch && typeof record.immediateDispatch === 'object') {
      const immediate = {};
      for (const [key, limit] of Object.entries({ occurrenceAt: 128, state: 32, outcome: 1024, sourceCallId: 512,
        rootCallId: 512, childId: 512, runId: 512, acceptedMessageId: 512 })) {
        const text = record.immediateDispatch[key];
        if (typeof text === 'string' && text.length <= limit) immediate[key] = text;
        else if (text !== undefined) immediate.metadataTruncated = true;
      }
      value.immediateDispatch = immediate;
    }
    return value;
  };
  ctx.tools.register({ name: 'scheduler_create', description: createDescription,
    parameters: { type: 'object', properties: {
      task_id: { type: 'string', description: 'Id of an existing task to update in place: provided fields replace old values, omitted ones are unchanged, and an unknown id errors. Omit to create a task.' },
      interval: { type: 'string', description: 'Interval between executions, e.g. "5m", "2h", "1d". Required to create; optional with task_id.' },
      prompt: { type: 'string', description: 'The prompt text to execute on each scheduled fire. Required to create; optional with task_id.' },
      recurring: { type: 'boolean', description: 'Default true. Set false for a native one-shot delayed reminder.' },
      durable: { type: 'boolean', description: 'Cross-session durability is unavailable; true is refused. Ignored with task_id.' },
      fire_immediately: { type: 'boolean', description: 'Default false. Set true to explicitly start one immediate controlled first iteration of a new recurring task. Ignored with task_id; one-shot true is refused.' },
    }, additionalProperties: false },
    output: { schema: { type: 'object', properties: { id: { type: 'string' }, humanSchedule: { type: 'string' }, updated: { type: 'boolean' },
      task: { type: 'object' }, creationConfirmed: { type: 'boolean' }, ownershipConfirmed: { type: 'boolean' }, immediateDispatch: { type: 'object' },
      confirmed: { type: 'boolean' }, interrupted: { type: 'boolean' }, interruptionReason: { type: 'string' }, message: { type: 'string' }, confirmedRecord: { type: 'object' } }, required: ['id', 'humanSchedule', 'updated'] }, render },
    async execute(args, exec) {
      const { sessionId, signal, check, receipt, close } = requestFor(exec, true);
      try {
        const serviceExec = { agent: exec.agent, signal };
        const seconds = args.interval === undefined ? undefined : parseInterval(args.interval);
        if (args.task_id !== undefined) {
          if (args.prompt === undefined && seconds === undefined) throw new Error('nothing to update: provide interval and/or prompt alongside task_id');
          const { service, tasks } = await readSchedules(serviceExec, check);
          const current = tasks.find(task => task.id === args.task_id);
          if (!current) throw new Error('No scheduled task with ID ' + args.task_id + ' found.');
          rejectReference(current);
          if (isOwned(current)) {
            const result = await service.update(serviceExec, { id: current.id,
              ...(args.prompt === undefined ? {} : { prompt: args.prompt }), ...(seconds === undefined ? {} : { seconds }) });
            if (!result.record) throw new Error(result.message ?? result.code ?? 'Grok adapter update was not confirmed');
            return receipt(writeResult(result.record, result.updated), result.record);
          }
          if (seconds !== undefined && (current.kind !== 'every' || seconds !== current.everySeconds)) throw new Error('Changing interval cannot preserve the native schedule phase; delete and recreate the task when the user requests a new cadence.');
          const { taskType: _type, sessionId: _binding, status: _status, lastDelivery: _delivery, ...expected } = current;
          const result = await ctx.schedule.update({ sessionId, id: current.id, expected, ...(args.prompt === undefined ? {} : { prompt: args.prompt }) }, signal);
          if (!result.record) throw new Error(result.message ?? result.code ?? 'native schedule update failed');
          return receipt(writeResult(result.record, result.updated), result.record);
        }
        if (args.durable === true) throw new Error('Cross-session durable tasks are not supported by the native session scheduler.');
        if (args.fire_immediately === true && args.recurring === false) throw new Error('Immediate first fire requires a recurring task; one-shot immediate execution is not defined by the fixed Grok source.');
        if (seconds === undefined) throw new Error('interval is required when creating a task');
        if (typeof args.prompt !== 'string' || !args.prompt.trim()) throw new Error('prompt is required when creating a task');
        const service = requireAdapter();
        return await createFor(sessionId, async () => {
          check();
          const current = await ctx.schedule.list({ sessionId }); check();
          if (current.length >= LIST_TASK_LIMIT) throw new Error('Maximum 50 active tasks observed for this session; other native callers retain their own controls.');
          // Preserve the actual accepted execution object. Its opaque token is
          // not recreated or cloned; the adapter separately captures our fused
          // lifetime signal while the native body owns this invocation.
          const task = await service.create(exec, { prompt: args.prompt, seconds, recurring: args.recurring ?? true,
            fireImmediately: args.fire_immediately === true }, signal);
          return receipt(writeResult(task, false), task);
        });
      } finally { close(); }
    },
  });
  ctx.tools.register({ name: 'scheduler_output', description: 'Read the full closing text of one verified scheduled child iteration from its original parent inbox receipt. Use the occurrence_at in the completion notice to select that exact iteration; otherwise select the latest retained verified completion. Offsets and limits are UTF-8 bytes. Follow nextOffset until done. No child execution is started.',
    parameters: { type: 'object', properties: {
      task_id: { type: 'string', minLength: 1, maxLength: 512 },
      occurrence_at: { type: 'string', description: 'Exact canonical UTC occurrence from the completion notice.' },
      offset: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      limit: { type: 'integer', minimum: 4, maximum: 32768 },
    }, required: ['task_id'], additionalProperties: false },
    output: { schema: { type: 'object', properties: {
      taskId: { type: 'string' }, occurrenceAt: { type: 'string' }, childId: { type: 'string' }, runId: { type: 'string' }, messageId: { type: 'string' },
      offset: { type: 'integer' }, nextOffset: { type: 'integer' }, totalBytes: { type: 'integer' }, done: { type: 'boolean' }, text: { type: 'string' },
    }, required: ['taskId', 'occurrenceAt', 'childId', 'runId', 'messageId', 'offset', 'nextOffset', 'totalBytes', 'done', 'text'], additionalProperties: false }, render },
    async execute(args, exec) {
      const request = requestFor(exec);
      try {
        const service = requireAdapter();
        if (typeof service.output !== 'function') throw Error('Verified scheduled completion output is unavailable.');
        request.check();
        const result = await service.output({ agent: exec.agent, signal: request.signal },
          { id: args.task_id, occurrenceAt: args.occurrence_at, offset: args.offset, limit: args.limit });
        request.check(); return result;
      } finally { request.close(); }
    },
  });
  ctx.tools.register({ name: 'scheduler_list', description: listDescription + ' Shows Grok adapter tasks and separately labeled ordinary native reminders, with at most 50 rows and 24000 JSON bytes. Prompt content has a UTF-8-safe prefix of at most 80 bytes plus a fixed ... suffix when truncated. Totals and truncation are explicit. Adapter and native records come from separate current reads; this is not a stable snapshot or a global native task limit. Actual child acceptance is distinct from completion.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' }, truncated: { type: 'boolean' }, bytes: { type: 'integer' },
      grokAdapterAvailable: { type: 'boolean' }, readConsistency: { type: 'string' }, message: { type: 'string' } }, required: ['tasks', 'total', 'truncated', 'bytes'] }, render },
    async execute(_args, exec) {
      const { signal, check, close } = requestFor(exec);
      try {
        const { service, tasks: current } = await readSchedules({ agent: exec.agent, signal }, check);
        const tasks = [];
        for (const task of current.slice(0, LIST_TASK_LIMIT)) {
          tasks.push(taskSummary(task));
          if (listResult(tasks, current.length, Boolean(service)).bytes > LIST_BYTE_LIMIT) { tasks.pop(); break; }
        }
        check(); return listResult(tasks, current.length, Boolean(service));
      } finally { close(); }
    },
  });
  ctx.tools.register({ name: 'scheduler_delete', description: deleteDescription,
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'The task ID to cancel (from scheduler_create output)' } }, required: ['id'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, id: { type: 'string' },
      confirmed: { type: 'boolean' }, interrupted: { type: 'boolean' }, interruptionReason: { type: 'string' } }, required: ['success', 'message'] }, render },
    async execute({ id }, exec) {
      const { sessionId, signal, check, receipt, close } = requestFor(exec);
      try {
        const serviceExec = { agent: exec.agent, signal };
        const { service, tasks } = await readSchedules(serviceExec, check);
        const current = tasks.find(task => task.id === id);
        rejectReference(current);
        // An inactive owned task can be absent from both active lists. Its
        // durable ownership still requires the adapter's fence before delete.
        const owned = isOwned(current) || service?.ownership(serviceExec, id).owned;
        check();
        const result = owned
          ? await service.remove(serviceExec, id) : await ctx.schedule.delete({ sessionId, id }, signal);
        return receipt({ id: result.id, success: result.deleted, message: result.deleted ? `Scheduled task ${id} cancelled.` : `No scheduled task with ID ${id} found. Use scheduler_list to see active tasks.` });
      } finally { close(); }
    },
  });
}
