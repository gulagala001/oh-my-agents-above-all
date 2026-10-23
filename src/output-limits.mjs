import { createHash } from 'node:crypto';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

export const name = 'omaa-zcode-output-limits';
export const inject = ['omaa', 'agents', 'sessions', 'sessionQuery', 'storageDomain'];

// Fixed DSH agent-loop assertAgentOptions rejects zero, negative, fractional,
// and unsafe caps. Zero is not a request to infer a default or remove a limit.
const checkedLimit = value => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('agent maxTokens must be a positive safe integer');
  return value;
};
const recordSchema = z.object({ sessionId: z.string(), maxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  observedSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).strict();
const keyOf = id => 'session_' + createHash('sha256').update(id).digest('hex');

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'omaa_zcode_output_limits', version: 1,
    layout: 'per-record', tables: { sessions: domainTable(recordSchema) } }));
  const table = domain.table('sessions');
  const states = new WeakMap(), writes = new Map(), pending = new Set(), shutdown = new AbortController();
  let closing = false;
  const track = work => {
    pending.add(work); work.finally(() => pending.delete(work)).catch(() => {}); return work;
  };
  ctx.effect(() => async () => {
    closing = true; shutdown.abort(Error('Output-limit service disposed.'));
    while (pending.size) await Promise.allSettled([...pending]);
    await domain.close();
  });
  const matches = agent => ctx.omaa.product(agent.session)?.id === 'zcode';
  const live = agent => !closing && ctx.agents.get(agent.id) === agent && ctx.sessions.get(agent.id) === agent.session;
  const check = agent => { if (!live(agent)) throw Error('Output-limit owner is no longer the exact live Agent.'); };
  const read = agent => {
    const record = table.get(keyOf(agent.id));
    if (record && record.sessionId !== agent.id) throw Error('Output-limit session identity mismatch.');
    return record;
  };
  const header = (state, event) => {
    if (event.type !== 'request/header' || state.header && state.header.seq >= event.seq) return;
    const maxTokens = event.data.header.config.maxTokens;
    state.header = { seq: event.seq, maxTokens: maxTokens === undefined ? undefined : checkedLimit(maxTokens),
      nativeSeed: event.data.header.adapterDefaults?.maxTokens === true ? undefined : maxTokens };
  };
  function stateFor(agent, preserveSaved = true) {
    check(agent);
    let state = states.get(agent);
    if (state) return state;
    state = { restoring: preserveSaved && read(agent) !== undefined, constructorSeed: agent.options.maxTokens, ready: false };
    states.set(agent, state);
    state.initialized = track((async () => {
      const observation = await ctx.sessionQuery.observeSession(agent.id, { signal: shutdown.signal, projectionMode: 'none' });
      try {
        check(agent);
        if (observation.source !== 'live' || observation.header !== agent.session.header)
          throw Error('Output-limit history is not an observation of the exact live Session.');
        const latest = observation.events.findLast(event => event.type === 'request/header');
        if (latest) header(state, latest);
        // Events received while awaiting the observation may be newer than its
        // immutable cut. Merge by seq; never write the captured old cap back.
        if (!preserveSaved) await remember(agent, agent.options.maxTokens);
        else if (read(agent) === undefined) {
          // A late attachment without a saved choice has an effective header,
          // if any; constructor options must not overrule that observed fact.
          if (state.header) await remember(agent, state.header.maxTokens, state.header.seq);
          else await remember(agent, agent.options.maxTokens);
        }
        check(agent); state.ready = true;
      } finally { observation[Symbol.dispose](); }
    })());
    return state;
  }
  function remember(agent, value, observedSeq = agent.session.seq) {
    if (value === undefined) return;
    const maxTokens = checkedLimit(value);
    // Serialize this plugin's read/replace operations for each session. Domain
    // put itself is durable, but a separate get followed by put is not atomic.
    const work = (writes.get(agent.id) ?? Promise.resolve()).then(async () => {
      check(agent);
      const saved = read(agent);
      if (saved?.maxTokens !== maxTokens || saved.observedSeq !== observedSeq)
        await table.put(keyOf(agent.id), { sessionId: agent.id, maxTokens, observedSeq });
      // Durability precedes any cancellation/owner gate below: a canceled
      // pre-header request must not lose its confirmed choice. Keep the native
      // seed until a later header proves that the request actually committed.
      const state = states.get(agent);
      if (state && !(state.header?.seq >= observedSeq)) state.restoring = true;
      check(agent);
    });
    const tail = work.catch(() => {}); writes.set(agent.id, tail);
    tail.finally(() => { if (writes.get(agent.id) === tail) writes.delete(agent.id); });
    return track(work);
  }
  const selection = (agent, state, saved = read(agent)) => {
    if (saved?.observedSeq !== undefined && state.header?.seq >= saved.observedSeq)
      return state.header.maxTokens; // A newer header with no cap stays unknown.
    return saved?.maxTokens;
  };
  function created({ agent, source, signal }) {
    if (!matches(agent)) return;
    return track((async () => {
      signal?.throwIfAborted();
      const state = stateFor(agent, source === 'resume');
      await state.initialized; check(agent); signal?.throwIfAborted();
    })());
  }
  ctx.on('agent/created', created, { global: true });
  ctx.on('agent/request', ({ agent, signal }, next) => {
    if (!matches(agent)) return next();
    return track((async () => {
      const proposal = await next();
      if (!matches(agent)) return proposal;
      signal.throwIfAborted();
      const state = stateFor(agent);
      await state.initialized; check(agent); signal.throwIfAborted();
      // Late attachment cannot tell whether this loop instance already logged
      // a header. Accept its two possible native seeds while a choice is pending;
      // adapter-derived caps are removed by the native requestProposal helper.
      const seedProposal = state.restoring && (proposal.maxTokens === undefined || proposal.maxTokens === state.constructorSeed
        || state.header && proposal.maxTokens === state.header.nativeSeed);
      const maxTokens = seedProposal || proposal.maxTokens === undefined ? selection(agent, state) : proposal.maxTokens;
      await remember(agent, maxTokens);
      check(agent); signal.throwIfAborted();
      if (proposal.maxTokens === maxTokens) return proposal;
      if (maxTokens !== undefined) return { ...proposal, maxTokens };
      const { maxTokens: _cap, ...withoutCap } = proposal;
      return withoutCap;
    })());
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'request/header') return;
    const agent = ctx.agents.get(session.id);
    if (agent && agent.session === session && !closing) {
      const state = states.get(agent);
      if (state) { header(state, event); state.restoring = false; }
    }
  }, { global: true });
  ctx.provide('omaaOutputLimits', {
    inheritOptions(parent, requested) {
      if (!matches(parent) || requested?.maxTokens !== undefined) return requested;
      check(parent);
      const state = states.get(parent);
      if (!state?.ready) throw Error('Output-limit ordering has not been observed for this live Agent.');
      const saved = read(parent);
      // A watermark distinguishes a later effective header from a durable
      // choice whose request was canceled before any header could be appended.
      // Legacy records lack that evidence and retain the earlier policy.
      const value = saved?.observedSeq !== undefined ? selection(parent, state, saved)
        : saved ? state.restoring ? saved.maxTokens : state.header?.maxTokens ?? saved.maxTokens
          : state.header ? state.header.maxTokens : parent.options.maxTokens;
      return value === undefined ? requested : { ...requested, maxTokens: checkedLimit(value) };
    },
  });
  // Mount before observing: the event cache must also retain headers committed
  // while an immutable query cut is being resolved. Every lease is released.
  for (const agent of ctx.agents.list()) if (matches(agent)) {
    const state = stateFor(agent);
    await state.initialized; check(agent);
  }
}
