import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { createCronScheduleRecord } from '@deepseek-ai/dsh-schedule';
import { acquireZCodeCronStore } from './cron-store.mjs';
import { cronOwnerKey, finiteHash, finiteScheduleSchema, FINITE_TOKEN_LIMIT } from './finite-schedule-records.mjs';

const original = value => value?.[symbols.original] ?? value;
const SOURCE = 'omaa-zcode-finite-schedule';
const instant = value => typeof value === 'string' && /^\d{4}-/.test(value) && Number.isSafeInteger(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value;
const short = error => String(error?.message ?? error).slice(0, 512);
const frame = rows => '[SCHEDULE REMINDER BATCH]\nThis is a scheduled message from the user\nreminders_json: ' + JSON.stringify(rows);

// The attribution, canonical native framing and exact durable inbox splice are
// all required. A string containing a marker is never delegation authority.
export function parseFiniteScheduleFrame(message) {
  if (message?.source?.kind !== 'schedule' || message.content?.length !== 1 || message.content[0].type !== 'text'
    || typeof message.content[0].text !== 'string') return;
  const text = message.content[0].text, lines = text.split('\n');
  try {
    let rows;
    if (lines.length === 3 && lines[0] === '[SCHEDULE REMINDER BATCH]'
      && lines[1] === 'This is a scheduled message from the user' && lines[2].startsWith('reminders_json: ')) {
      rows = JSON.parse(lines[2].slice(16));
      if (text !== frame(rows)) return;
    } else return; // This branch creates recurring cron, never one-shot frames.
    if (!Array.isArray(rows) || !rows.length || !rows.every(row => row && !Array.isArray(row)
      && Object.keys(row).sort().join(',') === 'occurrence_at,reminder_prompt,schedule_id'
      && typeof row.schedule_id === 'string' && row.schedule_id.length > 0 && row.schedule_id.length <= 512
      && instant(row.occurrence_at) && typeof row.reminder_prompt === 'string')
      || new Set(rows.map(row => row.schedule_id)).size !== rows.length) return;
    return rows;
  } catch { return; }
}

export function installFiniteScheduleGate(ctx) {
  let store, owners, pendingRecords;
  const ready = acquireZCodeCronStore(ctx).then(value => {
    store = value; owners = value.owners; pendingRecords = value.pending;
  });
  ready.catch(() => {});
  const controller = new AbortController(), queues = new Map(), poisoned = new Set(), pending = new Set(), listeners = [];
  const track = work => {
    const result = Promise.resolve().then(work);
    pending.add(result);
    result.then(() => pending.delete(result), () => pending.delete(result));
    return result;
  };
  const liveOwner = agent => {
    const current = ctx.agents.get(agent.id), key = agent.ctx && scopeOf(agent.ctx);
    return !!key && !!current && scopeOf(current.ctx) === key
      && original(current.session) === original(agent.session)
      && original(ctx.sessions.get(agent.id)) === original(agent.session);
  };
  let closed = false, closing, unprovide;
  const ownerFor = (session, id) => {
    const owner = owners.get(cronOwnerKey(session.id, id));
    return owner?.finite && owner.sessionId === session.id && owner.workspacePath === session.header.cwd ? owner : undefined;
  };
  const pendingFor = (session, marker) => [...pendingRecords.entries()].some(([, value]) =>
    value.sessionId === session.id && value.workspacePath === session.header.cwd && value.marker === marker);
  const handles = (session, row) => ownerFor(session, row.schedule_id)?.finite.marker === row.reminder_prompt
    || pendingFor(session, row.reminder_prompt);
  const write = (owner, update) => owners.update(cronOwnerKey(owner.sessionId, owner.id), current => {
    if (current.id !== owner.id || current.sessionId !== owner.sessionId || current.workspacePath !== owner.workspacePath
      || !current.finite || current.finite.marker !== owner.finite.marker || current.finite.prompt !== owner.finite.prompt)
      throw Error('Finite Cron owner changed.');
    return { ...current, finite: finiteScheduleSchema.parse(update(current.finite)) };
  });
  const fault = async (owner, error) => {
    poisoned.add(owner.id);
    try { await write(owner, value => ({ ...value, status: 'UNKNOWN', reason: short(error),
      tokens: value.tokens.map(token => token.state === 'RESERVED' ? { ...token, state: 'UNKNOWN', reason: short(error) } : token) })); }
    catch { /* Actual Session splice remains the recovery evidence; never replay. */ }
    try { ctx.logger?.warn('Finite ZCode Cron ' + owner.id + ' is fenced: ' + short(error)); } catch {}
  };
  const enqueue = (sessionId, work) => {
    const previous = queues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => ready).then(work);
    queues.set(sessionId, next);
    next.catch(error => { try { ctx.logger?.warn('Finite Cron observation failed: ' + short(error)); } catch {} })
      .finally(() => { if (queues.get(sessionId) === next) queues.delete(sessionId); });
    return next;
  };
  const flush = async session => {
    if (closed || !await ctx.sessions.flush(session)) throw Error('Native Session persistence did not acknowledge the finite dispatch.');
    if (closed) throw Error('Finite gate closed during native persistence.');
  };
  const observe = async session => {
    const observation = await ctx.sessionQuery.observeSession(session.id, { signal: controller.signal, projectionMode: 'none' });
    if (observation.source !== 'live' || original(observation.header) !== original(session.header)) {
      observation[Symbol.dispose](); throw Error('Finite dispatch requires its exact live Session observation.');
    }
    return observation;
  };
  const proofFor = (events, message, suppliedSeq) => {
    const hash = finiteHash(message.content);
    return events.find(event => event.type === 'agent/inbox/spliced' && (suppliedSeq === undefined || suppliedSeq === event.seq)
      && ['next-turn', 'next-step'].includes(event.data.target)
      && event.data.inserted?.some(input => input.id === message.id && input.source?.kind === 'schedule'
        && finiteHash(input.content) === hash && parseFiniteScheduleFrame(input)));
  };
  const atPosition = (events, seq, release) => {
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
  const checkRule = async (session, owner, row) => {
    const agent = ctx.agents.get(session.id), service = agent?.ctx?.get('schedule') ?? ctx.get('schedule');
    if (!service?.catalog) throw Error('Native finite carrier is unavailable.');
    const native = (await service.catalog()).find(value => value.id === owner.id && value.sessionId === session.id);
    const value = owner.finite, at = Date.parse(row.occurrence_at);
    if (!native || native.kind !== 'cron' || native.prompt !== value.marker || native.expression !== value.expression
      || native.timeZone !== value.timeZone || !instant(native.scheduledAt) || row.occurrence_at < value.initialScheduledAt
      || at > Date.now()) throw Error('Finite carrier identity, rule or occurrence changed.');
    const expected = createCronScheduleRecord('finite-proof', 'proof', { expression: value.expression, time_zone: value.timeZone }, at - 1, 'proof');
    if (expected.scheduledAt !== row.occurrence_at) throw Error('Finite occurrence does not belong to its admitted calendar rule.');
  };
  async function confirm(session, message, row, suppliedSeq) {
    let owner = ownerFor(session, row.schedule_id);
    if (!owner || owner.finite.marker !== row.reminder_prompt) return;
    const existing = owner.finite.tokens.find(token => token.occurrenceAt === row.occurrence_at);
    if (existing) return existing;
    if (owner.deleted || owner.finite.status !== 'ACTIVE' || poisoned.has(owner.id)
      || owner.finite.highWaterAt && row.occurrence_at <= owner.finite.highWaterAt) return;
    try {
      const observation = await observe(session);
      let proof;
      try { proof = proofFor(observation.events.slice(observation.inheritedEventCount), message, suppliedSeq); }
      finally { observation[Symbol.dispose](); }
      if (!proof) throw Error('The exact native finite frame has no actual own inbox splice.');
      await checkRule(session, owner, row);
      const saved = await write(owner, value => {
        if (value.status !== 'ACTIVE' || value.tokens.some(token => token.occurrenceAt === row.occurrence_at)
          || value.highWaterAt && row.occurrence_at <= value.highWaterAt) return value;
        const unresolved = value.tokens.filter(token => !token.dispatchConfirmed).length;
        if (unresolved >= value.maxRuns - value.confirmed) return value;
        const tokens = value.tokens.filter(token => token.state !== 'ADMITTED');
        if (tokens.length >= FINITE_TOKEN_LIMIT) throw Error('Finite unresolved input history is full; no input is replayed or evicted.');
        return { ...value, highWaterAt: row.occurrence_at, tokens: [...tokens, { occurrenceAt: row.occurrence_at,
          nativeMessageId: message.id, spliceSeq: proof.seq, frameSha256: finiteHash(message.content),
          state: 'RESERVED', dispatchConfirmed: false }] };
      });
      const reservation = saved.finite.tokens.find(token => token.occurrenceAt === row.occurrence_at);
      if (!reservation || reservation.nativeMessageId !== message.id) return;
      // This ACK is native durable inbox acceptance, not model consumption.
      await flush(session);
      owner = await write(saved, value => {
        const token = value.tokens.find(item => item.occurrenceAt === row.occurrence_at);
        if (!token || token.state !== 'RESERVED' || token.nativeMessageId !== message.id) return value;
        const confirmed = value.confirmed + 1;
        return { ...value, confirmed, status: confirmed === value.maxRuns ? 'CLOSED' : value.status,
          tokens: value.tokens.map(item => item !== token ? item : { ...item, state: 'CONFIRMED', dispatchConfirmed: true }),
          ...(['DELETED', 'UNKNOWN'].includes(value.status) ? { status: value.status } : {}) };
      });
      return owner.finite.tokens.find(token => token.occurrenceAt === row.occurrence_at);
    } catch (error) { await fault(owner, error); return; }
  }
  async function logicalInput(agent, message, row, turn, step) {
    const session = agent.session;
    await confirm(session, message, row);
    const owner = ownerFor(session, row.schedule_id), value = owner?.finite;
    const token = value?.tokens.find(item => item.occurrenceAt === row.occurrence_at);
    if (!owner || value.marker !== row.reminder_prompt || !token?.dispatchConfirmed || token.state !== 'CONFIRMED'
      || token.nativeMessageId !== message.id || token.frameSha256 !== finiteHash(message.content)
      || value.status === 'UNKNOWN' || poisoned.has(owner.id) || ctx.get('omaa').product(session)?.id !== 'zcode'
      || !liveOwner(agent) || session.header.origin === 'subagent') return;
    const input = createUserMessage({ content: [{ type: 'text', text: value.prompt }], source: {
      kind: SOURCE, form: 'logical-prompt', scheduleId: owner.id, occurrenceAt: row.occurrence_at, originalMessageId: message.id } });
    try {
      const saved = await write(owner, current => ({ ...current, tokens: current.tokens.map(item => {
        if (item.occurrenceAt !== row.occurrence_at || item.state !== 'CONFIRMED' || current.status === 'UNKNOWN') return item;
        return { ...item, state: 'RELEASED', release: { messageId: input.id, turn, step, contentSha256: finiteHash(input.content) } };
      }) }));
      if (closed || ctx.get('omaa').product(session)?.id !== 'zcode' || !liveOwner(agent))
        throw Error('The original ZCode owner changed while its logical release was being saved.');
      return saved.finite.tokens.some(item => item.release?.messageId === input.id) ? input : undefined;
    } catch (error) { await fault(owner, error); }
  }

  async function recover(agent) {
    const session = agent.session;
    const rows = [...owners.entries()].map(([, owner]) => owner).filter(owner => owner.finite
      && owner.sessionId === session.id && owner.workspacePath === session.header.cwd
      && owner.finite.tokens.some(token => ['RESERVED', 'RELEASED'].includes(token.state)));
    if (!rows.length) return;
    let observation;
    try {
      observation = await observe(session);
      const events = observation.events.slice(observation.inheritedEventCount);
      for (const owner of rows) for (const token of owner.finite.tokens) {
        if (!['RESERVED', 'RELEASED'].includes(token.state)) continue;
        try {
          const accepted = token.release && events.some(event => event.type === 'user/message' && event.surfaceOp === 'append'
            && event.data.id === token.release.messageId && finiteHash(event.data.content) === token.release.contentSha256
            && event.data.source?.kind === SOURCE && event.data.source.scheduleId === owner.id
            && event.data.source.occurrenceAt === token.occurrenceAt && event.data.source.originalMessageId === token.nativeMessageId
            && atPosition(events, event.seq, token.release));
          if (token.state === 'RELEASED' && !accepted) throw Error('A prior logical release has no proved accepted input. It is retained UNKNOWN and is not replayed.');
          if (token.state === 'RESERVED') {
            const splice = events.find(event => event.seq === token.spliceSeq && event.type === 'agent/inbox/spliced');
            const message = splice?.data.inserted?.find(input => input.id === token.nativeMessageId);
            if (!message || finiteHash(message.content) !== token.frameSha256
              || !parseFiniteScheduleFrame(message)?.some(row => row.schedule_id === owner.id
                && row.occurrence_at === token.occurrenceAt && row.reminder_prompt === owner.finite.marker))
              throw Error('A prior reservation has no exact persisted native splice. No input is retried.');
          }
          await flush(session);
          await write(owner, value => {
            const current = value.tokens.find(item => item.occurrenceAt === token.occurrenceAt);
            if (!current || current.state !== token.state || current.nativeMessageId !== token.nativeMessageId) return value;
            const confirmed = value.confirmed + Number(!current.dispatchConfirmed);
            return { ...value, confirmed,
              status: value.status === 'ACTIVE' && confirmed === value.maxRuns ? 'CLOSED' : value.status,
              tokens: value.tokens.map(item => item !== current ? item : { ...item,
                state: accepted ? 'ADMITTED' : 'CONFIRMED', dispatchConfirmed: true }) };
          });
        } catch (error) { await fault(owner, error); }
      }
    } catch (error) { for (const owner of rows) await fault(owner, error); }
    finally { observation?.[Symbol.dispose](); }
  }

  const gateway = { available: () => !!store && !closed, isPoisoned: id => poisoned.has(id) };
  function close() {
    if (closing) return closing;
    // Publish the idempotent close promise before aborting: cancellation
    // observers cannot reenter cleanup and release the borrower twice.
    const done = Promise.withResolvers();
    closing = done.promise;
    closed = true; controller.abort(Error('Persistent finite Cron gate closed.'));
    void (async () => {
      const failures = [];
      const disposed = await Promise.allSettled(listeners.splice(0).map(dispose => Promise.resolve().then(() => dispose())));
      for (const result of disposed) if (result.status === 'rejected') failures.push(result.reason);
      // Hooks include downstream next(): no table is released while a claimed
      // mixed batch can still return to this gate and inspect ownership.
      while (pending.size || queues.size) await Promise.allSettled([...pending, ...queues.values()]);
      await ready.catch(() => {});
      try { await store?.release(); } catch (error) { failures.push(error); }
      // Cordis groups stop their sequential disposal chain on rejection, so
      // yielded child effects alone cannot supply this failure-path cleanup.
      try { await unprovide?.(); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'Persistent finite Cron gate cleanup failed.');
    })().then(done.resolve, done.reject);
    return closing;
  }

  try {
  listeners.push(ctx.on('session/event', (session, event) => {
    if (closed) return;
    if (event.type === 'agent/inbox/spliced') for (const message of event.data.inserted ?? []) {
      const rows = parseFiniteScheduleFrame(message);
      if (!rows) continue;
      void enqueue(session.id, async () => { for (const row of rows) await confirm(session, message, row, event.seq); });
    }
    if (event.type === 'user/message' && event.surfaceOp === 'append') {
      const message = event.data, source = message.source;
      if (source?.kind !== SOURCE || source.form !== 'logical-prompt') return;
      void enqueue(session.id, async () => {
        const owner = ownerFor(session, source.scheduleId);
        if (!owner) return;
        try {
          const token = owner.finite.tokens.find(item => item.occurrenceAt === source.occurrenceAt);
          if (!token?.release || token.state !== 'RELEASED' || token.release.messageId !== message.id
            || token.nativeMessageId !== source.originalMessageId || token.release.contentSha256 !== finiteHash(message.content))
            throw Error('The actual logical input differs from its frozen finite release.');
          const observation = await observe(session);
          try {
            if (!atPosition(observation.events, event.seq, token.release)) throw Error('Finite logical input entered a different native turn or step.');
          } finally { observation[Symbol.dispose](); }
          await flush(session);
          await write(owner, value => ({ ...value, tokens: value.tokens.map(token => token.occurrenceAt === source.occurrenceAt
            && token.state === 'RELEASED' && token.release.messageId === message.id
            && token.nativeMessageId === source.originalMessageId && token.release.contentSha256 === finiteHash(message.content)
            ? { ...token, state: 'ADMITTED' } : token) }));
        } catch (error) { await fault(owner, error); }
      });
    }
  }, { global: true }));
  listeners.push(ctx.on('agent/pre-step', ({ agent, signal, turn, step }, next) => track(async () => {
    await ready;
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    await queues.get(agent.id)?.catch(() => {});
    const messages = []; let handled = false;
    for (const message of decision.messages) {
      const rows = parseFiniteScheduleFrame(message);
      if (!rows?.some(row => handles(agent.session, row))) { messages.push(message); continue; }
      handled = true;
      let unowned = [];
      const keepUnowned = () => {
        if (!unowned.length) return;
        messages.push(createUserMessage({ content: [{ type: 'text', text: frame(unowned) }], source: {
          kind: SOURCE, form: 'passthrough', originalMessageId: message.id, originalSource: message.source } }));
        unowned = [];
      };
      for (const row of rows) {
        if (!handles(agent.session, row)) { unowned.push(row); continue; }
        keepUnowned();
        if (closed || signal.aborted) continue;
        const input = await enqueue(agent.id, () => logicalInput(agent, message, row, turn, step)).catch(() => undefined);
        if (input) messages.push(input);
      }
      keepUnowned();
    }
    // Same native empty-step contract used by Grok: inert markers alone must
    // not leave a runtime-context-only request, including across preset changes.
    return { ...decision, messages: handled && !messages.some(message => message.source?.kind !== 'runtime-context') ? [] : messages };
  }), { global: true }));
  listeners.push(ctx.on('agent/request', ({ agent }, next) => track(async () => {
    await ready;
    const proposal = await next();
    await queues.get(agent.id)?.catch(() => {});
    return proposal; // Never await this request's future user/message append.
  }), { global: true }));
  listeners.push(ctx.on('agent/created', ({ agent }) => {
    if (!closed) return enqueue(agent.id, () => recover(agent));
  }, { global: true }));
  unprovide = ctx.provide('omaaZCodeFiniteCron', gateway);
  ctx.effect(function* () {
    for (const dispose of listeners) yield dispose;
    yield unprovide;
    return close;
  });
  // Late host attachment only reconciles real persisted evidence. It never
  // recreates a claimed message or wakes a model to repair unknown delivery.
  gateway.ready = track(async () => {
    await ready;
    if (!closed) await Promise.all([...ctx.agents.list()].map(agent => enqueue(agent.id, () => recover(agent))));
  });
  gateway.ready.catch(() => {});
  return gateway;
  } catch (error) {
    // Registration can fail after acquisition began. Its borrower and any
    // successfully registered effects still belong to this failed installer.
    void close().catch(() => {});
    throw error;
  }
}
