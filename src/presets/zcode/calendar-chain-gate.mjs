import { randomUUID } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { acquireZCodeCronStore } from './cron-store.mjs';
import { finiteHash } from './finite-schedule-records.mjs';
import { calendarChainSchema, calendarOccurrenceSchema, calendarChainKey, calendarOccurrenceKey } from './calendar-chain-records.mjs';
import { createCalendarChainRule, nextCalendarChainAt } from './calendar-chain-rule.mjs';

const SOURCE = 'omaa-zcode-calendar-chain';
const original = value => value?.[symbols.original] ?? value;
const short = error => String(error?.message ?? error).slice(0, 512);
const render = (id, at, marker) => `[SCHEDULE REMINDER]\nThis is a scheduled message from the user\nschedule_id_json: ${JSON.stringify(id)}\noccurrence_at: ${at}\nreminder_prompt_json: ${JSON.stringify(marker)}`;
export function parseCalendarChainFrame(message) {
  if (message?.source?.kind !== 'schedule' || message.content?.length !== 1 || message.content[0].type !== 'text') return;
  const text = message.content[0].text;
  if (typeof text !== 'string') return;
  const lines = text.split('\n');
  try {
    if (lines.length !== 5 || !lines[2].startsWith('schedule_id_json: ') || !lines[3].startsWith('occurrence_at: ')
      || !lines[4].startsWith('reminder_prompt_json: ')) return;
    const id = JSON.parse(lines[2].slice(18)), at = lines[3].slice(15), marker = JSON.parse(lines[4].slice(22));
    if (typeof id !== 'string' || typeof marker !== 'string' || !/^\d{4}-/.test(at)
      || new Date(Date.parse(at)).toISOString() !== at || text !== render(id, at, marker)) return;
    return { id, at, marker };
  } catch { return; }
}
export function calendarStandingPolicy(agent) {
  const sandbox = agent.ctx.get('sandboxPolicy'), approval = agent.ctx.get('approval'), permissions = agent.ctx.get('permissionPresets');
  if (typeof sandbox?.resolve !== 'function' || typeof approval?.overrideOf !== 'function') throw Error('Calendar standing policy is unavailable.');
  return JSON.stringify({ sandbox: sandbox.resolve({ session: agent.session }),
    approval: approval.overrideOf(agent.session) ?? approval.config?.policy ?? null, permissions: permissions?.current(agent.session) ?? null });
}
export function installCalendarChainGate(ctx) {
  let store, closed = false;
  const ready = acquireZCodeCronStore(ctx).then(value => { store = value; }); ready.catch(() => {});
  const queues = new Map(), pending = new Set(), listeners = [], controllers = new Set(), poisoned = new Set();
  const generations = new Map(), approvedGenerations = new Map();
  const invalidate = sessionId => generations.set(sessionId, (generations.get(sessionId) ?? 0) + 1);
  const abort = new AbortController();
  let unprovide, closePromise;
  const close = () => closePromise ??= (async () => {
    closed = true; abort.abort(Error('Calendar gate closed.'));
    for (const item of controllers) item.control.abort(abort.signal.reason);
    const errors = [];
    for (const result of await Promise.allSettled(listeners.splice(0).map(dispose => Promise.resolve().then(() => dispose()))))
      if (result.status === 'rejected') errors.push(result.reason);
    while (pending.size || queues.size) await Promise.allSettled([...pending, ...queues.values()]);
    try { await ready; } catch (error) { errors.push(error); }
    try { await store?.release(); } catch (error) { errors.push(error); }
    try { await unprovide?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Calendar gate cleanup failed.');
  })();
  const track = work => {
    const result = Promise.resolve().then(work); pending.add(result);
    result.then(() => pending.delete(result), () => pending.delete(result)); return result;
  };
  const enqueue = (id, work) => {
    const result = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(() => ready).then(work);
    queues.set(id, result);
    result.then(() => { if (queues.get(id) === result) queues.delete(id); }, error => {
      if (queues.get(id) === result) queues.delete(id);
      try { ctx.logger?.warn('Calendar chain observation: ' + short(error)); } catch {}
    });
    return result;
  };
  const chain = id => store.calendarChains.get(calendarChainKey(id));
  const occurrences = value => [...store.calendarOccurrences.entries()].map(([, row]) => row).filter(row => row.chainId === value.id && row.epoch === value.epoch);
  const occurrence = value => store.calendarOccurrences.get(calendarOccurrenceKey(value.chainId, value.epoch, value.occurrenceAt));
  const saveOccurrence = (value, update) => store.calendarOccurrences.update(calendarOccurrenceKey(value.chainId, value.epoch, value.occurrenceAt), current => {
    if (current.marker !== value.marker) throw Error('Calendar occurrence identity changed.');
    return calendarOccurrenceSchema.parse(update(current));
  });
  const saveChain = (value, update) => store.calendarChains.update(calendarChainKey(value.id), current => {
    if (current.epoch !== value.epoch || current.sessionId !== value.sessionId || current.workspacePath !== value.workspacePath)
      throw Error('Calendar chain identity changed.');
    return calendarChainSchema.parse(update(current));
  });
  const fence = async (value, error, row) => {
    poisoned.add(value.id);
    if (row) { try { await saveOccurrence(row, current => ({ ...current,
      ...(['PREPARED', 'BOUND', 'RESERVED', 'RELEASED'].includes(current.phase) ? { phase: 'UNKNOWN' } : {}), reason: short(error) })); } catch {} }
    try { await saveChain(value, current => ({ ...current, status: current.status === 'DELETED' ? 'DELETED' : 'UNKNOWN', reason: short(error) })); } catch {}
    try { ctx.logger?.warn('Calendar chain ' + value.id + ' stopped: ' + short(error)); } catch {}
  };
  const check = (agent, value, signal) => {
    signal?.throwIfAborted(); abort.signal.throwIfAborted();
    const current = ctx.agents.get(value.sessionId), session = agent?.session;
    if (closed || !current || !agent?.ctx || !scopeOf(agent.ctx) || scopeOf(current.ctx) !== scopeOf(agent.ctx)
      || original(current.session) !== original(session) || original(ctx.sessions.get(value.sessionId)) !== original(session)
      || session.id !== value.sessionId || session.header.cwd !== value.workspacePath || session.header.origin === 'subagent'
      || ctx.get('omaa').product(session)?.id !== 'zcode' || ctx.get('omaa').modeFor(session, agent) !== 'default'
      || calendarStandingPolicy(agent) !== value.standingPolicy || poisoned.has(value.id)
      || (approvedGenerations.get(value.id) ?? 0) !== (generations.get(value.sessionId) ?? 0))
      throw Error('Calendar owner, product, workspace, default mode or approved standing policy changed; explicit reapproval is required.');
    const latest = chain(value.id);
    if (!latest || latest.status !== 'ACTIVE' || latest.epoch !== value.epoch) throw Error('Calendar future admission is closed.');
  };
  const observe = async session => {
    const observation = await ctx.sessionQuery.observeSession(session.id, { signal: abort.signal, projectionMode: 'none' });
    if (observation.source !== 'live' || original(observation.header) !== original(session.header)) {
      observation[Symbol.dispose](); throw Error('Calendar chain requires its exact live native Session.');
    }
    return observation;
  };
  const flush = async session => {
    if (closed || !await ctx.sessions.flush(session) || closed) throw Error('Calendar native Session flush was not acknowledged.');
  };
  const position = (events, seq, release) => {
    let turn, step;
    for (const event of events) {
      if (event.seq >= seq) break;
      if (event.type === 'turn/start') { turn = event.data.turn; step = undefined; }
      if (event.type === 'step/start') step = event.data;
      if (event.type === 'step/end') step = undefined;
      if (event.type === 'turn/end') { turn = undefined; step = undefined; }
    }
    return turn === release.turn && step?.turn === release.turn && step.step === release.step;
  };
  const lookup = (session, frame) => [...store.calendarOccurrences.entries()].map(([, row]) => row).find(row =>
    row.sessionId === session.id && row.workspacePath === session.header.cwd && row.marker === frame.marker
    && row.occurrenceAt === frame.at);
  async function arm(agent, value, row, signal, remember = () => {}) {
    const control = new AbortController(), joined = AbortSignal.any([abort.signal, control.signal, ...(signal ? [signal] : [])]);
    const active = { sessionId: value.sessionId, scope: scopeOf(agent.ctx), control }; controllers.add(active);
    try {
      check(agent, value, joined);
      if (row.phase !== 'PREPARED') throw Error('Only a new durable PREPARED carrier may be sent; unknown attempts are never retried.');
      const service = agent.ctx.get('schedule');
      if (!service?.create) throw Error('Native calendar carrier service is unavailable.');
      // The PREPARED receipt already exists. No native call precedes its ACK.
      remember({ operation: 'calendar-create', status: 'unknown', logicalId: value.id, occurrenceAt: row.occurrenceAt });
      let native;
      try { native = await service.create(value.sessionId, { title: value.title, prompt: row.marker, at: row.occurrenceAt }, joined); }
      catch (error) { await fence(value, error, row); throw Object.assign(Error('Calendar carrier creation is unknown; inspect the logical id, never retry automatically.', { cause: error }), { code: 'uncertain_effect' }); }
      remember({ operation: 'calendar-create', status: 'native-confirmed', logicalId: value.id, nativeId: native.id, occurrenceAt: native.scheduledAt, ownershipConfirmed: false });
      if (native.kind !== 'at' || native.scheduledAt !== row.occurrenceAt || native.prompt !== row.marker)
        throw Error('The native carrier receipt differs from its PREPARED occurrence.');
      row = await saveOccurrence(row, current => {
        if (current.phase !== 'PREPARED' || current.nativeId) return { ...current, nativeId: native.id, phase: 'UNKNOWN',
          reason: 'Native creation returned after the PREPARED phase changed; the actual id is retained without retry.' };
        return { ...current, nativeId: native.id, phase: 'BOUND' };
      });
      if (row.phase !== 'BOUND') throw Error('Native carrier binding is unresolved; inspect its retained actual id without retry.');
      remember({ operation: 'calendar-create', status: 'native-confirmed', logicalId: value.id, nativeId: native.id, occurrenceAt: native.scheduledAt, ownershipConfirmed: true });
      check(agent, value, joined);
      return row;
    } catch (error) {
      await fence(value, error, row);
      throw error;
    } finally { controllers.delete(active); }
  }
  async function advance(agent, value, previous, from, signal) {
    const latest = chain(value.id);
    if (!latest || !['ACTIVE', 'AWAITING_NATIVE'].includes(latest.status) || latest.current !== previous.occurrenceAt) return;
    value = latest;
    if (value.status === 'AWAITING_NATIVE') {
      // No arm has been sent. A post-commit native event may prove settlement.
      await saveChain(value, current => ({ ...current, status: 'ACTIVE' }));
      value = chain(value.id);
    }
    check(agent, value, signal);
    // Native runtime holds its management FIFO through delivery. This call is
    // reached only from fire-and-forget observation work, never a flush guard.
    const service = agent.ctx.get('schedule'), native = (await service.catalog()).find(item => item.id === previous.nativeId && item.sessionId === value.sessionId);
    check(agent, value, signal);
    if (native?.status === 'active') {
      await saveChain(value, current => ({ ...current, status: 'AWAITING_NATIVE',
        reason: 'Confirmed native inbox dispatch; waiting for a proved inactive carrier before any next arm. No retry is sent.' }));
      return;
    }
    if (!native && !previous.nativeDeleted) throw Error('The prior carrier disappeared without an adapter cleanup receipt.');
    if (native) {
      if (native.status !== 'inactive' || native.kind !== 'at' || native.prompt !== previous.marker || native.scheduledAt !== previous.occurrenceAt)
        throw Error('The completed calendar carrier changed before standing cleanup.');
      try {
        const result = await service.delete({ sessionId: value.sessionId, id: native.id }, signal);
        if (!result.deleted && result.code !== 'schedule_not_found') throw Error('Native carrier cleanup was refused.');
        previous = await saveOccurrence(previous, current => ({ ...current, nativeDeleted: true }));
      } catch (error) {
        try { await saveOccurrence(previous, current => ({ ...current, cleanupUnknown: true, reason: short(error) })); } catch {}
        throw error;
      }
    }
    check(agent, value, signal);
    const at = nextCalendarChainAt(value.definition, from);
    if (at === null) { await saveChain(value, current => ({ ...current, status: 'CLOSED', reason: 'Fixed original calendar search horizon exhausted.' })); return; }
    const next = calendarOccurrenceSchema.parse({ version: 1, chainId: value.id, epoch: value.epoch,
      sessionId: value.sessionId, workspacePath: value.workspacePath, occurrenceAt: at,
      marker: '[OMAA ZCODE CALENDAR ' + randomUUID() + ']', phase: 'PREPARED' });
    const key = calendarOccurrenceKey(value.id, value.epoch, at);
    if (store.calendarOccurrences.get(key)) throw Error('The next occurrence already has a durable attempt; automatic retry is forbidden.');
    await store.calendarOccurrences.put(key, next);
    await saveChain(value, current => {
      if (current.status !== 'ACTIVE' || current.current !== previous.occurrenceAt) throw Error('Calendar predecessor or future admission changed.');
      return { ...current, current: at };
    });
    await arm(agent, value, next, signal);
  }
  async function prepareNext(agent, value, previous, from) {
    const control = new AbortController(), active = { sessionId: value.sessionId, scope: scopeOf(agent.ctx), control };
    controllers.add(active);
    try { return await advance(agent, value, previous, from, AbortSignal.any([abort.signal, control.signal])); }
    finally { controllers.delete(active); }
  }
  async function dispatch(session, message, frame, suppliedSeq, observedAt = Date.now()) {
    let row = lookup(session, frame);
    if (!row) return;
    const value = chain(row.chainId);
    if (!value || value.epoch !== row.epoch) return;
    if (row.nativeId && row.nativeId !== frame.id) {
      await fence(value, Error('A duplicate/orphan native id reused an owned marker; it is filtered without releasing a prompt.'), row); return;
    }
    if (row.phase !== 'BOUND') return;
    try {
      const agent = ctx.agents.get(session.id); check(agent, value);
      if (value.current !== row.occurrenceAt) throw Error('The received native carrier is not the current calendar obligation.');
      const observation = await observe(session); let proof;
      try { proof = observation.events.slice(observation.inheritedEventCount).find(event => event.type === 'agent/inbox/spliced'
        && (suppliedSeq === undefined || event.seq === suppliedSeq) && ['next-turn', 'next-step'].includes(event.data.target)
        && event.data.inserted?.some(input => input.id === message.id && input.source?.kind === 'schedule'
          && finiteHash(input.content) === finiteHash(message.content) && parseCalendarChainFrame(input))); }
      finally { observation[Symbol.dispose](); }
      if (!proof || row.nativeId !== frame.id) throw Error('Calendar input lacks its exact own native inbox splice.');
      const native = (await agent.ctx.get('schedule').catalog()).find(item => item.id === row.nativeId && item.sessionId === session.id);
      check(agent, value);
      if (!native || native.kind !== 'at' || native.prompt !== row.marker || native.scheduledAt !== row.occurrenceAt)
        throw Error('The native calendar carrier identity changed before reservation.');
      row = await saveOccurrence(row, current => {
        if (current.phase !== 'BOUND') throw Error('Calendar occurrence was already reserved.');
        return { ...current, phase: 'RESERVED', nativeMessageId: message.id, spliceSeq: proof.seq, frameSha256: finiteHash(message.content), observedAt };
      });
      await flush(session);
      const now = Date.now(), missed = Date.parse(row.occurrenceAt) <= observedAt - 5 * 60_000;
      row = await saveOccurrence(row, current => ({ ...current, phase: missed ? 'SKIPPED' : 'CONFIRMED', acknowledgedAt: now }));
      await saveChain(value, current => ({ ...current,
        confirmedDispatches: current.confirmedDispatches + Number(!missed), skippedOccurrences: current.skippedOccurrences + Number(missed) }));
      await prepareNext(agent, value, row, now);
    } catch (error) { await fence(value, error, occurrence(row)); }
  }
  async function logical(agent, message, frame, turn, step) {
    await dispatch(agent.session, message, frame);
    const row = lookup(agent.session, frame), value = row && chain(row.chainId), current = ctx.agents.get(agent.id);
    if (!value || row.phase !== 'CONFIRMED' || row.nativeMessageId !== message.id || row.frameSha256 !== finiteHash(message.content)
      || !current || !scopeOf(agent.ctx) || scopeOf(current.ctx) !== scopeOf(agent.ctx)
      || original(current.session) !== original(agent.session) || original(ctx.sessions.get(agent.id)) !== original(agent.session)
      || ctx.get('omaa').product(agent.session)?.id !== 'zcode' || agent.session.header.origin === 'subagent') return;
    const input = createUserMessage({ content: [{ type: 'text', text: value.prompt }], source: {
      kind: SOURCE, form: 'logical-prompt', chainId: value.id, epoch: value.epoch,
      occurrenceAt: row.occurrenceAt, originalMessageId: message.id } });
    try {
      const saved = await saveOccurrence(row, current => {
        if (current.phase !== 'CONFIRMED') return current;
        return { ...current, phase: 'RELEASED', release: { messageId: input.id, turn, step, contentSha256: finiteHash(input.content) } };
      });
      const latest = ctx.agents.get(agent.id);
      if (closed || !latest || scopeOf(latest.ctx) !== scopeOf(agent.ctx)
        || original(latest.session) !== original(agent.session) || ctx.get('omaa').product(agent.session)?.id !== 'zcode')
        throw Error('Calendar logical input owner changed during durable release.');
      return saved.release?.messageId === input.id ? input : undefined;
    } catch (error) { await fence(value, error, row); }
  }
  async function recover(agent) {
    const values = [...store.calendarChains.entries()].map(([, value]) => value).filter(value =>
      value.sessionId === agent.id && value.workspacePath === agent.session.header.cwd);
    let observation;
    try {
      if (!values.length) return;
      observation = await observe(agent.session);
      const events = observation.events.slice(observation.inheritedEventCount);
      for (const value of values) {
        for (const row of occurrences(value)) {
          if (row.phase === 'RELEASED') {
            const accepted = events.find(event => event.type === 'user/message' && event.surfaceOp === 'append'
              && event.data.id === row.release.messageId && finiteHash(event.data.content) === row.release.contentSha256
              && event.data.source?.kind === SOURCE && event.data.source.chainId === value.id
              && event.data.source.epoch === value.epoch && event.data.source.occurrenceAt === row.occurrenceAt
              && event.data.source.originalMessageId === row.nativeMessageId && position(events, event.seq, row.release));
            if (accepted) {
              await flush(agent.session);
              await saveOccurrence(row, current => current.phase === 'RELEASED' ? { ...current, phase: 'ADMITTED' } : current);
            } else await fence(value, Error('Cold logical release has no exact accepted input; it is retained without replay.'), row);
          }
          if (['PREPARED', 'RESERVED'].includes(row.phase))
            await fence(value, Error('Cold carrier creation or dispatch reservation is unresolved; no automatic retry or replay.'), row);
        }
        const latest = chain(value.id), current = store.calendarOccurrences.get(calendarOccurrenceKey(value.id, value.epoch, value.current));
        if (['ACTIVE', 'AWAITING_NATIVE'].includes(latest.status) && (!current || current.phase !== 'BOUND'))
          await fence(value, Error('Cold continuation lacks a bound future carrier; automatic re-arming is forbidden.'));
      }
    } catch (error) { for (const value of values) await fence(value, error); }
    finally { observation?.[Symbol.dispose](); }
  }
  try {
  listeners.push(ctx.on('session/event', (session, event) => {
    if (closed) return;
    if (['sandbox/mode', 'plan/mode', 'approval/policy', 'permission/preset', 'agent-preset/selected'].includes(event.type)) {
      invalidate(session.id);
      for (const item of controllers) if (item.sessionId === session.id) item.control.abort(Error('Calendar standing policy changed.'));
      void enqueue(session.id, async () => {
        for (const [, value] of store.calendarChains.entries()) if (value.sessionId === session.id && ['ACTIVE', 'AWAITING_NATIVE'].includes(value.status))
          await saveChain(value, current => ['ACTIVE', 'AWAITING_NATIVE'].includes(current.status)
            ? { ...current, status: 'POLICY_BLOCKED', reason: 'Standing permissions or mode changed; explicit reapproval is required.' } : current);
      });
    }
    if (event.type === 'agent/inbox/spliced') for (const message of event.data.inserted ?? []) {
      const frame = parseCalendarChainFrame(message);
      if (frame) {
        const observedAt = Date.now();
        void enqueue(session.id, () => dispatch(session, message, frame, event.seq, observedAt));
      }
    }
    if (event.type === 'user/message' && event.surfaceOp === 'append' && event.data.source?.kind === SOURCE) {
      const message = event.data, source = message.source;
      void enqueue(session.id, async () => {
        const value = chain(source.chainId), row = value && store.calendarOccurrences.get(calendarOccurrenceKey(value.id, source.epoch, source.occurrenceAt));
        if (!value || !row) return;
        try {
          if (row.phase !== 'RELEASED' || row.release?.messageId !== message.id || row.nativeMessageId !== source.originalMessageId
            || row.release.contentSha256 !== finiteHash(message.content)) throw Error('Calendar logical input differs from its frozen release.');
          const observation = await observe(session);
          try { if (!position(observation.events, event.seq, row.release)) throw Error('Calendar logical input entered a different native turn or step.'); }
          finally { observation[Symbol.dispose](); }
          await flush(session);
          await saveOccurrence(row, current => current.phase === 'RELEASED' && current.release?.messageId === message.id
            ? { ...current, phase: 'ADMITTED' } : current);
        } catch (error) { await fence(value, error, row); }
      });
    }
  }, { global: true }));
  listeners.push(ctx.on('omaa/preferences-updated', session => {
    if (closed) return;
    invalidate(session.id);
    for (const item of controllers) if (item.sessionId === session.id) item.control.abort(Error('Calendar session preferences changed.'));
    void enqueue(session.id, async () => {
      for (const [, value] of store.calendarChains.entries()) if (value.sessionId === session.id && ['ACTIVE', 'AWAITING_NATIVE'].includes(value.status))
        await saveChain(value, current => ['ACTIVE', 'AWAITING_NATIVE'].includes(current.status)
          ? { ...current, status: 'POLICY_BLOCKED', reason: 'Session preferences changed; explicit reapproval is required.' } : current);
    });
  }, { global: true }));
  listeners.push(ctx.on('schedule/changed', () => {
    if (closed) return;
    // Native emits this only after its task commit. It is not awaited by drive.
    void track(async () => {
      await ready;
      if (closed) return;
      for (const [, value] of store.calendarChains.entries()) {
        if (!['ACTIVE', 'AWAITING_NATIVE'].includes(value.status)) continue;
        void enqueue(value.sessionId, async () => {
          const latest = chain(value.id), agent = ctx.agents.get(value.sessionId);
          if (!latest || !agent || !['ACTIVE', 'AWAITING_NATIVE'].includes(latest.status)) return;
          const row = store.calendarOccurrences.get(calendarOccurrenceKey(latest.id, latest.epoch, latest.current));
          if (!row || !['CONFIRMED', 'RELEASED', 'ADMITTED', 'SKIPPED'].includes(row.phase)) return;
          try { await prepareNext(agent, latest, row, row.acknowledgedAt); }
          catch (error) { await fence(latest, error, row); }
        });
      }
    }).catch(() => {});
  }, { global: true }));
  listeners.push(ctx.on('agent/pre-step', ({ agent, signal, turn, step }, next) => track(async () => {
    await ready;
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    await queues.get(agent.id)?.catch(() => {});
    const messages = []; let handled = false;
    for (const message of decision.messages) {
      const frame = parseCalendarChainFrame(message);
      if (!frame || !lookup(agent.session, frame)) { messages.push(message); continue; }
      handled = true;
      if (closed || signal.aborted) continue;
      const input = await enqueue(agent.id, () => logical(agent, message, frame, turn, step)).catch(() => undefined);
      if (input) messages.push(input);
    }
    return { ...decision, messages: handled && !messages.some(message => message.source?.kind !== 'runtime-context') ? [] : messages };
  }), { global: true }));
  listeners.push(ctx.on('agent/request', ({ agent }, next) => track(async () => {
    await ready;
    const proposal = await next();
    await queues.get(agent.id)?.catch(() => {});
    return proposal;
  }), { global: true }));
  listeners.push(ctx.on('agent/created', ({ agent }) => {
    if (!closed) return track(async () => { await ready; if (!closed) await recover(agent); });
  }, { global: true }));
  listeners.push(ctx.on('agent/disposed', ({ agent }) => {
    const key = scopeOf(agent.ctx);
    for (const item of controllers) if (item.sessionId === agent.id && item.scope === key)
      item.control.abort(Error('Calendar native owner disposed while work was in flight.'));
  }, { global: true }));
  const gateway = {
    available: () => !!store && !closed,
    async create(scope, args, remember) {
      await ready;
      return enqueue(scope.sessionId, async () => {
        scope.check();
        const createdAt = Date.now(), definition = createCalendarChainRule(args, createdAt), at = nextCalendarChainAt(definition, createdAt);
        if (at === null) throw Error('The original calendar search horizon has no future occurrence.');
        const value = calendarChainSchema.parse({ version: 1, id: 'zcode-calendar-' + randomUUID(), epoch: randomUUID(),
          sessionId: scope.sessionId, workspacePath: scope.workspacePath, title: args.title.trim(), prompt: args.prompt.trim(), createdAt,
          definition, standingPolicy: calendarStandingPolicy(scope.agent), derivedCarrierApproval: true, inactiveCleanupApproval: true,
          status: 'ACTIVE', current: at, confirmedDispatches: 0, skippedOccurrences: 0 });
        approvedGenerations.set(value.id, generations.get(value.sessionId) ?? 0);
        await store.prepareCalendarChain(value);
        const row = calendarOccurrenceSchema.parse({ version: 1, chainId: value.id, epoch: value.epoch, sessionId: value.sessionId,
          workspacePath: value.workspacePath, occurrenceAt: at, marker: '[OMAA ZCODE CALENDAR ' + randomUUID() + ']', phase: 'PREPARED' });
        try {
          await store.calendarOccurrences.put(calendarOccurrenceKey(value.id, value.epoch, at), row);
          scope.check();
          await arm(scope.agent, value, row, scope.signal, remember);
          return gateway.view(value);
        } catch (error) { await fence(value, error, row); throw error; }
      });
    },
    view(value) {
      const rows = occurrences(value), latest = chain(value.id);
      return { id: latest.id, scope: 'owner-session', createdAt: latest.createdAt, status: latest.status, title: latest.title, frozenPrompt: latest.prompt,
        titleScope: 'logical-schedule-and-future-carriers; existing-native-carrier-titles-are-preserved',
        currentOccurrenceAt: latest.current, definition: latest.definition, confirmedDispatches: latest.confirmedDispatches,
        skippedOccurrences: latest.skippedOccurrences, reason: latest.reason, nativeCarrierIds: rows.filter(row => !row.nativeDeleted).map(row => row.nativeId).filter(Boolean).slice(-16),
        retainedReceiptCount: rows.length, recentReceipts: rows.slice(-4), omittedReceiptCount: Math.max(0, rows.length - 4),
        retainedNativeCarrierIdCount: rows.filter(row => !row.nativeDeleted && row.nativeId).length,
        semantics: 'stable logical id; native at carriers; durable marker-reference dispatch is not prompt acceptance or model completion; unknown is never retried' };
    },
    async list(scope) {
      await ready; scope.check();
      const catalog = await scope.service.catalog(); scope.check();
      return [...store.calendarChains.entries()].map(([, value]) => value).filter(value => value.sessionId === scope.sessionId
        && value.workspacePath === scope.workspacePath).map(value => {
          const rows = occurrences(value);
          const actual = catalog.filter(native => native.sessionId === value.sessionId && native.kind === 'at'
            && rows.some(row => row.marker === native.prompt && row.occurrenceAt === native.scheduledAt && (!row.nativeId || row.nativeId === native.id)));
          return { ...gateway.view(value), actualNativeIds: actual.map(row => row.id).slice(-16), actualNativeIdCount: actual.length,
            actualNativeTitles: actual.slice(-16).map(row => ({ id: row.id, title: row.title })) };
        });
    },
    async rename(scope, id, title, remember) {
      await ready;
      return enqueue(scope.sessionId, async () => {
        scope.check();
        const value = chain(id);
        if (!value || value.sessionId !== scope.sessionId || value.workspacePath !== scope.workspacePath)
          throw Error('No calendar logical id belongs to this exact session/workspace.');
        if (typeof title !== 'string' || !title.trim() || title.length > 120) throw Error('Invalid calendar title.');
        remember({ operation: 'calendar-rename', logicalId: id, status: 'unknown', nativeCarriersChanged: false });
        let saved;
        try { saved = await saveChain(value, current => ({ ...current, title: title.trim() })); }
        catch (cause) { throw Object.assign(Error('Logical title persistence has no confirmed receipt; inspect this exact id before another request.', { cause }), { code: 'uncertain_effect' }); }
        remember({ operation: 'calendar-rename', logicalId: id, status: 'logical-metadata-confirmed', nativeCarriersChanged: false });
        return { ok: true, automation: gateway.view(saved), interrupted: scope.interrupted(), nativeCarriersChanged: false,
          response: 'Logical title saved for this series and future carriers. Existing native carrier titles, rule, anchor, prompt, status and dispatch evidence were preserved.' };
      });
    },
    async delete(scope, id, remember) {
      await ready;
      return enqueue(scope.sessionId, async () => {
        scope.check();
        let value = chain(id);
        if (!value || value.sessionId !== scope.sessionId || value.workspacePath !== scope.workspacePath) throw Error('No calendar logical id belongs to this exact session/workspace.');
        value = await saveChain(value, current => ({ ...current, status: 'DELETED' }));
        remember({ operation: 'calendar-delete', logicalId: id, status: 'admission-closed' });
        const catalog = await scope.service.catalog(); scope.check();
        const results = [];
        for (const row of occurrences(value)) {
          const natives = catalog.filter(native => native.sessionId === value.sessionId && native.kind === 'at'
            && native.prompt === row.marker && native.scheduledAt === row.occurrenceAt && (!row.nativeId || row.nativeId === native.id));
          for (const native of natives) {
            scope.check(); remember({ operation: 'calendar-delete', logicalId: id, status: 'unknown', nativeId: native.id, admissionClosed: true });
            try {
              const result = await scope.service.delete({ sessionId: value.sessionId, id: native.id }, scope.signal);
              remember({ operation: 'calendar-delete', logicalId: id, status: 'native-confirmed', nativeId: native.id, deleted: result.deleted, admissionClosed: true });
              results.push({ id: native.id, ...result });
              if (result.deleted || result.code === 'schedule_not_found') await saveOccurrence(row, current => ({ ...current, nativeDeleted: true }));
            } catch (error) { await fence(value, error, row); throw Object.assign(Error('Calendar deletion cleanup is unknown; admission remains closed.', { cause: error }), { code: 'uncertain_effect' }); }
          }
        }
        return { id, admissionClosed: true, cleanupResults: results.slice(-16), cleanupReceiptCount: results.length,
          response: 'Future occurrences are closed. Confirmed queued references and native/logical evidence are retained.' };
      });
    },
  };
  unprovide = ctx.provide('omaaZCodeCalendarChains', gateway);
  ctx.effect(function* () {
    for (const dispose of listeners) yield dispose;
    yield unprovide;
    return close;
  });
  gateway.ready = track(async () => {
    await ready;
    if (!closed) await Promise.all([...ctx.agents.list()].map(agent => track(() => recover(agent))));
  });
  gateway.ready.catch(() => {});
  return gateway;
  } catch (error) {
    void close().catch(cleanup => { try { ctx.logger?.warn('Calendar constructor cleanup failed: ' + short(cleanup)); } catch {} });
    throw error;
  }
}
