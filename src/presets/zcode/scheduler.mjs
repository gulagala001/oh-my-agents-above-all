import { createHash, randomUUID } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { compileNativeSchedule, nativeTimingChange, scheduleIntent, nativeTimingIdentity, sameNativeCalendar } from './advanced-schedule.mjs';
import { acquireZCodeCronStore } from './cron-store.mjs';
import { parseCronInput } from '@deepseek-ai/dsh-schedule';
import { finiteScheduleSchema, finiteStatus, finitePendingKey } from './finite-schedule-records.mjs';
import { cronListPage } from './cron-list-page.mjs';

// Fixed 3.15.1 Cron handlers/AutomationPort, adapted to the public native
// Schedule service. Native inbox delivery is not model execution completion.
export const name = 'omaa-zcode-scheduler';
export const inject = ['omaa', 'tools', 'agents', 'sessions', 'storageDomain', 'sessionQuery'];
const original = value => value?.[symbols.original] ?? value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const keyOf = (sessionId, id) => 'schedule_' + createHash('sha256').update(JSON.stringify([sessionId, id])).digest('hex');
const hashOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timingReceipt = (intent, record) => ({ intentSha256: hashOf(intent), nativeSha256: hashOf(nativeTimingIdentity(record)) });
const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
const byteSize = value => Buffer.byteLength(JSON.stringify(value));
function publicNative(value) {
  const json = JSON.stringify(value), recordJsonBytes = Buffer.byteLength(json);
  if (recordJsonBytes > 6000) return { id: value.id, recordJsonBytes,
    recordJsonSha256: createHash('sha256').update(json).digest('hex'), omitted: true };
  return Object.fromEntries(['id', 'sessionId', 'kind', 'status', 'title', 'prompt', 'scheduledAt', 'afterSeconds',
    'everySeconds', 'time', 'timeZone', 'weekdays', 'expression', 'lastDelivery']
    .filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
// Finalization facts omit prompt/catalog payloads. They survive replacement of
// a body success by the native registry's late cancellation/error result.
const receiptRecord = record => Object.fromEntries(['id', 'kind', 'scheduledAt', 'afterSeconds', 'everySeconds']
  .filter(key => record?.[key] !== undefined).map(key => [key, record[key]]));
const needsCalendarChain = args => {
  if (!['hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(args.intervalUnit)) return false;
  if (!text(args.time_zone, 128)) throw Error('Calendar carriers require an explicit time_zone.');
  const zone = parseCronInput({ expression: args.cron, time_zone: args.time_zone }).timeZone;
  // A new rule in a changing-offset zone needs the original compatible wall
  // clock operations even when its numeric interval fits a native cron selector.
  if (zone !== 'UTC' && !/^Etc\/GMT[+-]([1-9]\d?)$/.test(zone)) return true;
  return args.intervalUnit === 'hourly'
    && (![1, 2, 3, 4, 6, 8, 12, 24].includes(args.interval) || !/^\d+$/.test(String(args.cron ?? '').trim().split(/\s+/)[0]))
  || args.intervalUnit === 'daily' && ![1, 7].includes(args.interval)
  || ['weekly', 'yearly'].includes(args.intervalUnit) && args.interval !== 1
  || args.intervalUnit === 'monthly' && ![1, 2, 3, 4, 6, 12].includes(args.interval);
};
const unsupported = () => { throw Error('This interval or finite dispatch limit has no admitted exact native mapping. Supported UTC or explicit fixed-offset calendar carriers are daily 1/7, weekly 1, monthly 1/2/3/4/6/12 and yearly 1; no reminder was changed.'); };
function validate(args, action) {
  const keys = action === 'create' ? ['title', 'prompt', 'delayMinutes', 'cron', 'time_zone', 'recurring', 'maxRuns', 'intervalUnit', 'interval']
    : action === 'update' ? ['id', 'title', 'prompt', 'cron', 'time_zone', 'recurring', 'maxRuns', 'intervalUnit', 'interval'] : action === 'delete' ? ['id'] : ['cursor', 'limit'];
  if (!object(args) || Object.keys(args).some(key => !keys.includes(key))) throw Error('Invalid native Cron arguments.');
  if (action === 'list' && (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 50)
    || args.cursor !== undefined && (typeof args.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(args.cursor))))
    throw Error('Cron list requires limit 1–50 and an actual nextCursor, or no cursor to start again.');
  if (args.maxRuns !== undefined && (!Number.isSafeInteger(args.maxRuns) || args.maxRuns < 1 || args.recurring !== false)) unsupported();
  if (args.maxRuns > 1 && (action !== 'create' || args.intervalUnit !== undefined || args.delayMinutes != null
    || args.cron === undefined || /^\*\/([1-9]\d*)\s+\*\s+\*\s+\*\s+\*$/.test(args.cron.trim())))
    throw Error('Finite dispatch budgets require a new explicit calendar cron, recurring=false and maxRuns>=2. Interval carriers, inferred minute intervals and finite updates are not admitted.');
  if ((args.intervalUnit === undefined) !== (args.interval === undefined)) throw Error('intervalUnit and interval must be supplied together.');
  if (args.intervalUnit !== undefined) {
    if (!['minute', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(args.intervalUnit)) unsupported();
    if (!Number.isInteger(args.interval) || args.interval < 1 || args.interval > 200
      || args.recurring === false || args.maxRuns !== undefined || args.delayMinutes != null || args.cron === undefined)
      throw Error('Interval carriers require interval 1–200, compatibility cron and indefinite recurrence, without delayMinutes/maxRuns. Updates must supply their compatibility cron explicitly.');
    if (action === 'update' && needsCalendarChain(args)) throw Error('Calendar chains are admitted only as new logical schedules; existing native ids are never migrated.');
  }
  if (args.recurring !== undefined && typeof args.recurring !== 'boolean') throw Error('recurring must be boolean.');
  if (['update', 'delete'].includes(action) && !text(args.id, 256)) throw Error('Use an actual id from cron_create or cron_list.');
  if (['create', 'update'].includes(action) && !text(args.title, 120)) throw Error('A nonempty title of at most 120 characters is required, retaining the user’s schedule phrase.');
  if ((action === 'create' || args.prompt !== undefined) && !text(args.prompt, 16000)) throw Error('Provide a nonempty prompt of at most 16000 characters describing the final scheduled work directly.');
  if (args.cron !== undefined && (!text(args.cron, 256) || !text(args.time_zone, 128))) throw Error('Calendar cron requires a five-field expression and an explicitly selected IANA time_zone; never guess the user’s zone.');
  if (args.time_zone !== undefined && args.cron === undefined) throw Error('time_zone belongs to an explicit cron replacement.');
  if (action === 'create') {
    if (Number(args.delayMinutes != null) + Number(args.cron !== undefined) !== 1) throw Error('Supply delayMinutes or cron, never both.');
    if (args.delayMinutes != null && (!Number.isSafeInteger(args.delayMinutes) || args.delayMinutes <= 0 || args.delayMinutes > 525600
      || args.recurring === true || args.maxRuns !== undefined)) throw Error('delayMinutes must be a whole-minute one-shot delay from 1 through 525600, without recurring=true or maxRuns.');
  }
}
export async function apply(ctx) {
  const store = await acquireZCodeCronStore(ctx);
  const owners = store.owners, lifetime = new AbortController(), pending = new Set(), requests = new Set(), receipts = new Map();
  let closing = false;
  const track = work => { pending.add(work); work.finally(() => pending.delete(work)).catch(() => {}); return work; };
  ctx.effect(() => async () => {
    closing = true; lifetime.abort(Error('ZCode Cron scope disposed.'));
    while (pending.size) await Promise.allSettled([...pending]);
    await store.release();
  });
  ctx.on('session/event', (session, event) => {
    if (['turn/start', 'turn/end'].includes(event.type)
      || event.type === 'user/message' && (event.data.message ?? event.data).source?.kind && ['schedule', 'omaa-zcode-finite-schedule', 'omaa-zcode-calendar-chain'].includes((event.data.message ?? event.data).source.kind)) {
      for (const request of requests) if (request.mutating && request.sessionId === session.id)
        request.control.abort(Error('Cron mutation turn identity or scheduled-input context changed.'));
    }
    if (!['sandbox/mode', 'plan/mode', 'approval/policy', 'permission/preset', 'agent-preset/selected'].includes(event.type)) return;
    for (const request of requests) if (request.mutating && request.sessionId === session.id)
      request.control.abort(Error('Cron standing permissions or working mode changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    for (const request of requests) if (request.mutating && request.sessionId === session.id)
      request.control.abort(Error('Cron session preferences changed.'));
  }, { global: true });
  ctx.on('agent/disposed', ({ agent }) => {
    for (const request of requests) if (request.agent === agent) request.control.abort(Error('Cron parent disposed.'));
  }, { global: true });
  const policy = agent => {
    const sandbox = agent.ctx.get('sandboxPolicy'), approval = agent.ctx.get('approval'), permissions = agent.ctx.get('permissionPresets');
    if (typeof sandbox?.resolve !== 'function' || typeof approval?.overrideOf !== 'function') throw Error('Native standing policy services are unavailable.');
    return JSON.stringify({ sandbox: sandbox.resolve({ session: agent.session }),
      approval: approval.overrideOf(agent.session) ?? approval.config?.policy ?? null,
      permissions: permissions?.current(agent.session) ?? null });
  };
  const begin = (exec, mutating) => {
    const agent = exec.agent, session = agent?.session, workspacePath = session?.header.cwd;
    if (!agent || !session) throw Error('Cron requires a native calling Agent.');
    const control = new AbortController(), signal = AbortSignal.any([exec.signal, lifetime.signal, control.signal]);
    const standing = mutating ? policy(agent) : undefined, ownerScope = scopeOf(agent.ctx);
    const check = () => {
      signal.throwIfAborted();
      if (closing || !ownerScope || (!ctx.agents.get(agent.id)?.ctx || scopeOf(ctx.agents.get(agent.id).ctx) !== ownerScope)
        || original(ctx.agents.get(agent.id)?.session) !== original(session) || original(ctx.sessions.get(agent.id)) !== original(session)
        || session.header.origin === 'subagent' || ctx.omaa.product(session)?.id !== 'zcode' || !text(workspacePath, 4096))
        throw Error('Cron requires the exact live main ZCode session with its own workspace.');
      if (mutating && (ctx.omaa.modeFor(session, agent) !== 'default' || policy(agent) !== standing))
        throw Error('Cron mutations require unchanged native permissions and default mode, outside a scheduled automation turn.');
    };
    check();
    const service = agent.ctx.get('schedule');
    if (!service || !['create', 'catalog', 'update', 'delete'].every(key => typeof service[key] === 'function')) throw Error('Native Schedule service is unavailable; no reminder was changed.');
    const request = { agent, sessionId: agent.id, workspacePath, signal, control, mutating, check, service,
      interrupted() { try { check(); return false; } catch { return true; } } };
    requests.add(request); return request;
  };
  const checkAutomationTurn = async scope => {
    scope.check();
    const observation = await ctx.sessionQuery.observeSession(scope.sessionId, { signal: scope.signal, projectionMode: 'none' });
    try {
      scope.check();
      if (observation.source !== 'live' || original(observation.header) !== original(scope.agent.session.header))
        throw Error('Cron requires an observation of the exact live calling Session.');
      const events = observation.events;
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.type === 'turn/start') return;
        if (event.type === 'turn/end') break;
        if (event.type === 'user/message' && (event.data.message ?? event.data).source?.kind && ['schedule', 'omaa-zcode-finite-schedule', 'omaa-zcode-calendar-chain'].includes((event.data.message ?? event.data).source.kind))
          throw Error('Cron mutation tools cannot run from a scheduled automation turn.');
      }
      throw Error('Cron mutations require an actual open native turn.');
    } finally { observation[Symbol.dispose](); }
  };
  const owned = (scope, id, includeDeletedFinite = false) => {
    const row = owners.get(keyOf(scope.sessionId, id));
    if (!row || row.deleted && !(includeDeletedFinite && row.finite) || row.id !== id || row.sessionId !== scope.sessionId || row.workspacePath !== scope.workspacePath)
      throw Error('No adapter-owned reminder with this id belongs to the current session and workspace.');
    return row;
  };
  const approve = async (exec, scope, derived = false) => {
    scope.check();
    const approval = scope.agent.ctx.get('approval');
    if (typeof approval?.request !== 'function') throw Error('Native approval is unavailable; no reminder was changed.');
    const decision = await approval.request({ agent: scope.agent, toolName: exec.name, callId: exec.callId,
      reason: derived ? 'Create this persistent calendar series: explicitly authorize derived native one-shot carriers and deletion of each verified inactive predecessor under the unchanged session, workspace, default mode and standing permissions. Policy changes stop future arming. Unknown creation/cleanup is never automatically retried. Native marker dispatch is not model task completion.'
        : 'Change this session’s persistent ZCode reminder within existing permissions. Native reminder delivery is not confirmation that its model task completed.', signal: scope.signal });
    if (decision !== 'allowed-once') throw Error('Native Cron approval was not granted: ' + decision);
    scope.check();
    await checkAutomationTurn(scope);
  };
  const view = (owner, native) => ({ id: owner.id, scope: 'owner-session', workspacePath: owner.workspacePath,
    nativeStatus: native?.status ?? 'native_record_missing', ...(native ? { schedule: publicNative(native) } : {}),
    executionSemantics: 'native-inbox-reminder-current-session-model', modelCompletionVerified: false,
    ...(owner.finite ? { finite: finiteStatus(owner.finite), frozenPrompt: owner.finite.prompt,
      recoveryEvidence: { retained: owner.finite.tokens.filter(token => token.state !== 'ADMITTED').slice(0, 8),
        omitted: Math.max(0, owner.finite.tokens.filter(token => token.state !== 'ADMITTED').length - 8),
        tokensSha256: hashOf(owner.finite.tokens), recovery: 'Exact native Session events and frozen typed owner remain authoritative; never retry UNKNOWN.' },
      carrierCleanup: owner.deleted ? 'deletion-requested; queued markers remain fenced'
        : owner.finite.status === 'ACTIVE' ? 'carrier-retained' : 'inert-carrier-retained; explicit cron_delete cleans up the native resource' } : {}) });
  const execute = async (action, args, exec) => {
    validate(args, action);
    const scope = begin(exec, action !== 'list');
    try {
    if (action !== 'list') await checkAutomationTurn(scope);
    const chains = ctx.get('omaaZCodeCalendarChains');
    if (action !== 'create' && action !== 'list' && args.id.startsWith('zcode-calendar-')) {
      if (!chains?.available()) throw Error('Persistent calendar chain service is unavailable.');
      if (action === 'update' && Object.keys(args).some(key => !['id', 'title'].includes(key)))
        throw Error('Calendar logical schedules currently admit only id/title updates. Rule, anchor and prompt replacements require a separately versioned implementation.');
      await approve(exec, scope);
      return action === 'update' ? chains.rename(scope, args.id, args.title.trim(), value => receipts.set(exec.token, value))
        : chains.delete(scope, args.id, value => receipts.set(exec.token, value));
    }
    if (action === 'list') {
      const catalog = await scope.service.catalog(); scope.check();
      const rows = [...owners.entries()].map(([, value]) => value).filter(row => (!row.deleted || row.finite)
        && row.sessionId === scope.sessionId && row.workspacePath === scope.workspacePath);
      const pending = [...store.pending.entries()].map(([, value]) => value).filter(row => row.sessionId === scope.sessionId && row.workspacePath === scope.workspacePath);
      const entries = pending.map(value => ({ kind: 'pending', id: finitePendingKey(value.marker), createdAt: value.createdAt, read() {
        const matches = catalog.filter(native => native.sessionId === scope.sessionId && native.prompt === value.marker
          && native.kind === 'cron' && native.expression === value.expression && native.timeZone === value.timeZone);
        return { preparationId: finitePendingKey(value.marker), status: value.status, title: value.title, maxRuns: value.maxRuns, nativeId: value.nativeId,
          actualNativeIds: matches.map(native => native.id),
          frozenPrompt: value.prompt.length <= 1024 ? value.prompt : { sha256: hashOf(value.prompt), bytes: byteSize(value.prompt), omitted: true }, reason: value.reason,
          semantics: 'durable creation preparation, not successful dispatch; inert marker is filtered; never retry automatically' };
      } }));
      if (chains?.available()) {
        for (const value of await chains.list(scope)) {
          entries.push({ kind: 'calendar', id: value.id, createdAt: value.createdAt, read: () => value });
        }
      }
      for (const row of rows) {
        entries.push({ kind: 'native', id: row.id, createdAt: row.createdAt,
          read: () => view(row, catalog.find(native => native.id === row.id && native.sessionId === scope.sessionId)) });
      }
      const result = cronListPage({ ownerSessionId: scope.sessionId, workspacePath: scope.workspacePath,
        entries, cursor: args.cursor, limit: args.limit });
      scope.check(); return result;
    }
    let owner, native;
    if (action !== 'create') {
      native = (await scope.service.catalog()).find(row => row.id === args.id && row.sessionId === scope.sessionId);
      try { owner = owned(scope, args.id, action === 'delete'); } catch (error) {
        const pending = [...store.pending.entries()].find(([, value]) => value.sessionId === scope.sessionId
          && value.workspacePath === scope.workspacePath && (value.nativeId === args.id || native && native.kind === 'cron'
            && native.prompt === value.marker && native.expression === value.expression && native.timeZone === value.timeZone));
        if (action !== 'delete' || !pending) throw error;
        owner = { id: args.id, pendingCreation: pending };
      }
      scope.check();
      if (action === 'update') {
        if (owner.finite && Object.keys(args).some(key => !['id', 'title'].includes(key)))
          throw Error('Finite reminders currently admit only id/title updates. Prompt, rule and budget replacements require a separately versioned implementation.');
        if (!native || native.status !== 'active') return { ok: false, id: args.id, code: native ? 'schedule_ended' : 'schedule_not_found' };
        const recurring = ['every', 'daily', 'weekly', 'cron'].includes(native.kind);
        if (args.recurring !== undefined && args.recurring !== recurring && args.cron === undefined)
          throw Error('Changing recurrence requires an explicit replacement cron and time_zone.');
      }
    }
    await approve(exec, scope, action === 'create' && needsCalendarChain(args));
    if (action === 'create' && needsCalendarChain(args)) {
      if (!chains?.available()) throw Error('Persistent calendar chain service is unavailable; no carrier was created.');
      return { ok: true, automation: await chains.create(scope, args, value => receipts.set(exec.token, value)),
        response: 'Calendar logical series saved with native one-shot carriers. Its frozen anchor is permanent; unknown outcomes stop future arming without retry. Dispatch counts are not model completion.' };
    }
    if (action === 'create') {
      // Capture fallback calendar slots and their provenance from one clock
      // sample; async native persistence must not change the chosen payload.
      const finite = args.maxRuns > 1;
      if (finite && !ctx.get('omaaZCodeFiniteCron')?.available())
        throw Error('The persistent finite dispatch gate is unavailable; no reminder was created.');
      const acceptedAt = Date.now(), intent = scheduleIntent(args, acceptedAt);
      const marker = finite ? '[OMAA ZCODE FINITE CRON ' + randomUUID() + ']' : undefined;
      const request = { title: args.title.trim(), prompt: marker ?? args.prompt.trim(),
        ...compileNativeSchedule(finite ? { ...args, recurring: true } : args, acceptedAt) };
      let schedule;
      if (finite) {
        const rule = parseCronInput(request.cron);
        await store.preparePending({ version: 1, sessionId: scope.sessionId, workspacePath: scope.workspacePath,
          marker, title: request.title, prompt: args.prompt.trim(), maxRuns: args.maxRuns,
          expression: rule.expression, timeZone: rule.timeZone, createdAt: acceptedAt, status: 'PREPARED' });
      }
      scope.check();
      receipts.set(exec.token, { operation: action, status: 'unknown', sessionId: scope.sessionId });
      try { schedule = await scope.service.create(scope.sessionId, request, scope.signal); }
      catch (cause) {
        if (finite) { try { await store.pending.update(finitePendingKey(marker), value => ({ ...value, status: 'UNKNOWN',
          reason: 'Native creation was invoked without a confirmed receipt; do not automatically retry.' })); } catch {} }
        throw Object.assign(Error('Native reminder creation has no confirmed receipt. Inspect native reminders; do not retry automatically.', { cause }), { code: 'uncertain_effect' });
      }
      const receipt = { operation: action, status: 'native-confirmed', sessionId: scope.sessionId,
        id: schedule.id, creationConfirmed: true, ownershipConfirmed: false, schedule: receiptRecord(schedule) };
      receipts.set(exec.token, receipt);
      if (finite) {
        try { await store.pending.update(finitePendingKey(marker), value => ({ ...value, status: 'NATIVE_CONFIRMED', nativeId: schedule.id })); }
        catch { /* Durable PREPARED still filters its exact marker; actual id remains in this native receipt. */ }
      }
      // Native commit cannot be rolled back by cancellation or a second store's
      // ownership failure. Never automatically delete or retry the reminder.
      owner = { id: schedule.id, sessionId: scope.sessionId, workspacePath: scope.workspacePath, createdAt: Date.now(), timing: timingReceipt(intent, schedule),
        ...(finite ? { finite: finiteScheduleSchema.parse({ version: 1, marker, prompt: args.prompt.trim(),
          maxRuns: args.maxRuns, confirmed: 0, status: 'ACTIVE', expression: schedule.expression,
          timeZone: schedule.timeZone, initialScheduledAt: schedule.scheduledAt, tokens: [] }) } : {}) };
      try { await owners.put(keyOf(scope.sessionId, schedule.id), owner); }
      catch { return { ok: false, creationConfirmed: true, ownershipConfirmed: false, id: schedule.id, schedule: publicNative(schedule),
        response: 'Native reminder creation committed, but adapter ownership could not be confirmed. Inspect this exact native id; do not retry or roll back automatically.' }; }
      receipt.ownershipConfirmed = true;
      if (finite) { try { await store.pending.delete(finitePendingKey(marker)); } catch {} }
      return { ok: true, creationConfirmed: true, ownershipConfirmed: true, interrupted: scope.interrupted(),
        automation: { ...view(owner, { ...schedule, status: 'active' }) }, response: 'Native reminder saved. Delivery is not model task completion; future work uses the session’s native model and permissions.' };
    }
    if (action === 'update') {
      const { sessionId: _session, status: _status, lastDelivery: _receipt, ...expected } = native;
      const effective = args.cron === undefined ? undefined : { ...args,
        prompt: args.prompt ?? native.prompt, recurring: args.intervalUnit === undefined
          ? args.recurring ?? ['every', 'daily', 'weekly', 'cron'].includes(native.kind) : true };
      const acceptedAt = Date.now(), intent = effective && scheduleIntent(effective, acceptedAt);
      let change;
      if (effective) {
        const sameIntent = owner.timing?.nativeSha256 === hashOf(nativeTimingIdentity(native))
          && owner.timing.intentSha256 === hashOf(intent);
        // Preserve old adapter calendar records verbatim on an equivalent
        // resubmission. Never silently migrate their phase into inferred every.
        if (!sameIntent && !sameNativeCalendar(effective, native)) {
          if (['hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(effective.intervalUnit) && native.kind === 'cron'
            && owner.timing?.nativeSha256 !== hashOf(nativeTimingIdentity(native)))
            throw Error('This calendar record has no verified carrier provenance. A carrier replacement could silently rephase it; use an unambiguous new schedule instead.');
          change = nativeTimingChange(compileNativeSchedule(effective, acceptedAt), acceptedAt);
        }
      }
      let result;
      scope.check();
      receipts.set(exec.token, { operation: action, status: 'unknown', sessionId: scope.sessionId, id: args.id });
      try { result = await scope.service.update({ sessionId: scope.sessionId, id: args.id, expected, title: args.title.trim(),
        ...(args.prompt === undefined ? {} : { prompt: args.prompt.trim() }),
        ...(change === undefined ? {} : { change }) }, scope.signal); }
      catch (cause) { throw Object.assign(Error('Native reminder update has no confirmed receipt for ' + args.id + '; inspect it before another request.', { cause }), { code: 'uncertain_effect' }); }
      const mutationReceipt = { operation: action, status: result.record ? 'native-confirmed' : 'native-refused',
        sessionId: scope.sessionId, id: args.id,
        ...(result.record ? { updated: result.updated, schedule: receiptRecord(result.record) } : { code: result.code }) };
      receipts.set(exec.token, mutationReceipt);
      let provenanceConfirmed;
      if (effective && result.record) {
        provenanceConfirmed = false; mutationReceipt.provenanceConfirmed = false;
        try { await owners.update(keyOf(scope.sessionId, args.id), current => {
          if (current.deleted || current.id !== owner.id || current.sessionId !== owner.sessionId
            || current.workspacePath !== owner.workspacePath || current.createdAt !== owner.createdAt
            || JSON.stringify(current.timing) !== JSON.stringify(owner.timing))
            throw Error('Schedule ownership or timing provenance changed before its receipt could be saved.');
          return { ...current, timing: timingReceipt(intent, result.record) };
        });
          provenanceConfirmed = true; mutationReceipt.provenanceConfirmed = true; } catch { /* Native update committed; no retry/rollback. Stale provenance must fail its native fingerprint check. */ }
      }
      return { ok: Boolean(result.record), ...(provenanceConfirmed === undefined ? {} : { provenanceConfirmed }), interrupted: scope.interrupted(), result: result.record ? { ...result, record: publicNative(result.record) } : result,
        response: result.record ? 'Native reminder update confirmed; its id and native delivery history were preserved.' : 'Native update was refused; inspect the actual result before another request.' };
    }
    let result;
    scope.check();
    if (owner.pendingCreation) {
      const [key, saved] = owner.pendingCreation;
      await store.pending.update(key, current => {
        if (current.marker !== saved.marker || current.sessionId !== scope.sessionId || current.workspacePath !== scope.workspacePath)
          throw Error('Pending creation identity changed; native deletion was not invoked.');
        return { ...current, nativeId: args.id, status: 'DELETED' };
      });
      receipts.set(exec.token, { operation: action, status: 'pending-marker-fenced', sessionId: scope.sessionId, id: args.id });
      scope.check();
    }
    if (owner.finite) {
      // Close new dispatch reservations before resource cleanup. Confirmed
      // durable queued references remain eligible, as native deletion cannot
      // retract an already queued reminder. Never reopen a budget or replay.
      try { owner = await owners.update(keyOf(scope.sessionId, args.id), current => {
        if (!current.finite || current.createdAt !== owner.createdAt || current.finite.marker !== owner.finite.marker)
          throw Error('Finite owner changed before deletion.');
        return { ...current, deleted: true, finite: { ...current.finite, status: 'DELETED' } };
      }); } catch (cause) { throw Error('Finite admission closure could not be confirmed; native deletion was not invoked. Inspect ownership before another request.', { cause }); }
      receipts.set(exec.token, { operation: action, status: 'finite-new-dispatch-admission-closed', sessionId: scope.sessionId, id: args.id });
      scope.check();
    }
    receipts.set(exec.token, { operation: action, status: 'unknown', sessionId: scope.sessionId, id: args.id,
      ...(owner.finite ? { finiteFutureReservationsClosed: true, confirmedQueuedReferencesRetained: true } : {}) });
    try { result = await scope.service.delete({ sessionId: scope.sessionId, id: args.id }, scope.signal); }
    catch (cause) { throw Object.assign(Error('Native reminder deletion has no confirmed receipt for ' + args.id + '; inspect it before another request.', { cause }), { code: 'uncertain_effect' }); }
    const receipt = { operation: action, status: 'native-confirmed', sessionId: scope.sessionId, id: args.id,
      deleted: result.deleted, ...(result.code === undefined ? {} : { code: result.code }), ownershipConfirmed: false };
    receipts.set(exec.token, receipt);
    let ownershipConfirmed = true;
    if (!owner.pendingCreation && (result.deleted || result.code === 'schedule_not_found')) {
      try { await owners.update(keyOf(scope.sessionId, args.id), current => ({ ...current, deleted: true })); }
      catch { ownershipConfirmed = false; }
    }
    receipt.ownershipConfirmed = ownershipConfirmed;
    return { ok: Boolean(result.deleted), result, ownershipConfirmed, interrupted: scope.interrupted(),
      response: 'This is the native deletion receipt. Already queued reminder messages are not retracted; no model completion is implied.' };
    } finally { requests.delete(scope); }
  };
  const timing = { cron: { type: 'string', description: 'Five-field calendar cron, or validated compatibility cron for an admitted interval carrier. Requires explicit time_zone. recurring=false selects its next occurrence once.' },
    time_zone: { type: 'string', description: 'Explicit user-selected IANA zone or UTC. Never infer it from the server clock.' },
    recurring: { type: 'boolean' }, maxRuns: { type: 'integer', description: 'With recurring=false: 1 selects a native one-shot; >=2 on NEW explicit calendar cron selects a persistent finite native-inbox dispatch budget. Confirmed marker-reference dispatch is not model prompt acceptance or completion. UNKNOWN is fenced without automatic replay; interval carriers are excluded.' },
    intervalUnit: { type: 'string', enum: ['minute', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'], description: 'New hourly/daily/weekly/monthly/yearly carriers admit interval 1–200 and an explicit native-validated IANA time_zone. Changing-offset zones use stable logical one-shot chains with the original calendar operations and compatible gap/fold resolution. Existing exact UTC/fixed-offset native mappings remain; other intervals/minute fallbacks use chains. Compatibility slots retain original numeric/fallback parsing; yearly uses first month/day only. Logical schedules admit only title updates; current native carrier titles stay unchanged.' }, interval: { type: 'integer', minimum: 1, maximum: 200 } };
  for (const action of ['create', 'list', 'update', 'delete']) {
    const mutating = action !== 'list';
    ctx.tools.register({ name: 'cron_' + action, timeoutMs: 30000,
      description: action === 'list' ? 'Page through this adapter’s retained reminders and pending creations for THIS native ZCode session/workspace, including inactive one-shots. Defaults to 10 entries (limit 1–50). Continue with nextCursor; restart if the ID roster changed. Oversized entries return their actual ID, SHA256 and size instead of blocking later entries. count includes all groups; counts gives group totals. Native delivery receipts are not completed model runs.'
        : 'Native session-owned ZCode Cron adaptation. Use only on the user’s explicit request. Requires native approval and current default mode; forbidden during scheduled turns. delayMinutes creates a one-shot. Calendar cron requires explicit time_zone; recurring=false delivers its next occurrence once. A fixed calendar target missed by less than a minute uses a native one-second grace delay; 1–30 minutes stale is refused. intervalUnit=minute with interval 1–200 uses creation-anchored fixed intervals. On NEW schedules, exact */N * * * * also infers the original minute anchor; recurring=false delays N minutes once. Existing equivalent calendar timing is preserved. The existing UTC/fixed-offset native hourly mapping supports intervals 1,2,3,4,6,8,12,24 with numeric cron minute. New changing-offset-zone interval carriers use compatible calendar chains instead; existing native ids are never migrated. Explicit UTC or native-validated Etc/GMT fixed-offset zones additionally admit daily 1/7, weekly 1, monthly 1/2/3/4/6/12, yearly 1. Numeric compatibility slots and upstream fallbacks are preserved; yearly uses only first month/day. Native calendar recurrence remains indefinite and does not reproduce upstream century-scale search horizons. Carrier updates require explicit compatibility cron. Content-only updates never recompile timing; matching confirmed intent preserves its native anchor. New explicit calendar cron with recurring=false and maxRuns>=2 uses an inert native carrier and persistent finite inbox-dispatch gate. Prompt/rule/budget freeze; title-only updates use the native full-record comparison; UNKNOWN is never retried. Closed carriers remain inert until explicit deletion. Counts prove durable marker-reference dispatch, not logical prompt acceptance or model completion. Other hourly/daily/weekly/monthly/yearly intervals 1–200, hourly minute fallbacks, and all NEW changing-offset-zone interval carriers use a stable logical schedule with derived native one-shot carriers, explicit standing approval and a permanent original calendar anchor. New tagged chains use original local Date operations bound to the selected IANA zone through Temporal compatible gap/fold resolution; host timezone data equivalence is unverified. Existing tagless fixed-offset chains keep their original shifted anchor and UTC algorithm. Inactive predecessors are cleaned only with that approval. Misfires at least five minutes late skip the prompt; UNKNOWN stops without retry. Logical title-only updates preserve existing native carrier titles and apply to future carriers; rule/anchor/prompt replacements remain refused. Delete closes future arming but retains confirmed queued references. Creation-time model pinning is not provided. Updates compare the complete observed native record; deletion is not compare-and-delete. Do not retry unknown outcomes. Native delivery can repeat after a crash and is not model execution completion.',
      parameters: { type: 'object', additionalProperties: false, properties: action === 'create'
        ? { title: { type: 'string' }, prompt: { type: 'string' }, delayMinutes: { type: ['integer', 'null'] }, ...timing }
        : action === 'update' ? { id: { type: 'string' }, title: { type: 'string' }, prompt: { type: 'string' }, ...timing }
          : action === 'delete' ? { id: { type: 'string' } } : { cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
      ...(action === 'create' ? { required: ['title', 'prompt'] } : action === 'update' ? { required: ['id', 'title'] } : action === 'delete' ? { required: ['id'] } : {}) }, output,
      finalizeContent(exec, result) {
        const receipt = receipts.get(exec.token); receipts.delete(exec.token);
        if (!receipt || !result.isError) return undefined;
        return [...result.content, { type: 'text', text: 'Native Cron mutation facts: ' + JSON.stringify(receipt)
          + '. Keep the error above. Do not automatically retry or roll back; inspect this native reminder before another action. A native delivery receipt is not model execution completion.' }];
      },
      execute(args, exec) {
        if (closing) throw Error('ZCode Cron scope is closed.');
        return track(execute(action, args, exec));
      },
    });
  }
}
