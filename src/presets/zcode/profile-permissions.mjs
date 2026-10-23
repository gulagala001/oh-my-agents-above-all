import { actorPersona } from '../../host/subagents.mjs';
import { createHash } from 'node:crypto';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';

export const PROFILE_PLAN_SNAPSHOT_PREFIX = 'omaa-zcode-profile-snapshot-agents-plan-';
export const PROFILE_PLAN_NO_AGENTS_PREFIX = 'omaa-zcode-profile-no-agents-plan-';
const SERVICE = 'omaaZcodeProfilePermissions', RECORD = 'plugin:omaa/zcode/profile-plan-admission';
const MAX_EVENTS = 100000, MAX_PENDING = 128;
const native = value => value?.[symbols.original] ?? value;
const key = agent => agent?.ctx && scopeOf(agent.ctx);
const isPlanProvider = provider => typeof provider === 'string'
  && [PROFILE_PLAN_SNAPSHOT_PREFIX, PROFILE_PLAN_NO_AGENTS_PREFIX].some(prefix => provider.startsWith(prefix));
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + canonical(value[name])).join(',') + '}';
  throw Error('Profile plan admission must retain lossless JSON facts.');
}
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');

// Native plan mode is logged collaboration state, not a sandbox/approval
// override. The independent native delegated policies remain authoritative.
// This record is plugin-owned admission proof, not a native plan event.
export function installZCodeProfilePermissions(ctx) {
  const reservations = new Map(), pending = new Set(), disposers = [];
  const shutdown = new AbortController();
  let closed = false, closing;
  const observe = work => {
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {}); return work;
  };
  const owner = (agent, signal) => {
    signal?.throwIfAborted(); shutdown.signal.throwIfAborted();
    const current = agent && ctx.get('agents')?.get(agent.id);
    if (closed || !key(agent) || key(current) !== key(agent)
      || native(current?.session) !== native(agent.session)
      || native(ctx.get('sessions')?.get(agent.id)) !== native(agent.session)
      || ctx.get('omaa').product(agent.session)?.id !== 'zcode')
      throw Error('The profile plan owner or native Agent lifetime changed.');
  };
  async function inspect(agent, signal) {
    owner(agent, signal);
    const query = ctx.get('sessionQuery');
    if (!query?.observeSession) throw Error('Profile plan admission requires native Session observation.');
    if (reservations.has(agent.id) && agent.session.seq > MAX_EVENTS)
      throw Error('Profile plan verification exceeds its 100000-event bound.');
    const observation = await query.observeSession(agent.id, { projectionMode: 'none', signal });
    try {
      owner(agent, signal);
      const session = native(agent.session);
      const own = observation.events.slice(observation.inheritedEventCount);
      const descriptors = own.filter(event => event.type === 'subagent/descriptor');
      // Avoid imposing this feature's event admission bound on unrelated
      // native children. An inherited-only plan descriptor still fails closed.
      if (!reservations.has(agent.id) && !observation.events.some(event => event.type === 'subagent/descriptor'
        && isPlanProvider(event.data?.provider))) return { events: [], descriptor: undefined, cut: session.seq };
      if (observation.source !== 'live' || native(observation.header) !== session.header
        || observation.events.length > MAX_EVENTS || observation.cursor !== session.seq - 1
        || observation.events.length !== session.seq
        || observation.events.some((event, index) => event.seq !== index))
        throw Error('The profile plan source is not the exact complete live Session cut.');
      if (descriptors.length !== 1) throw Error('The plan profile has no unique own durable descriptor.');
      return { events: own, descriptor: descriptors[0], cut: session.seq };
    } finally { observation[Symbol.dispose](); }
  }
  function validateDescriptor(agent, event) {
    const descriptor = event?.data;
    if (!descriptor || descriptor.mode !== 'continuable' || !isPlanProvider(descriptor.provider)
      || typeof actorPersona(agent.session.snapshotEvents(agent.session.inheritedEventCount)) !== 'string' || typeof descriptor.label !== 'string'
      || !descriptor.label.startsWith('ZCode Profile · ')
      || agent.session.header.origin !== 'subagent' || typeof agent.session.header.parentSession !== 'string')
      throw Error('The native plan profile has no complete own durable descriptor.');
    return descriptor;
  }
  function validateAdmission(agent, proof) {
    const descriptor = validateDescriptor(agent, proof.descriptor);
    const admissions = proof.events.flatMap(event => {
      const record = pluginRecordOf(event);
      return record?.type === RECORD ? [{ event, value: record.data }] : [];
    });
    if (admissions.length !== 1) throw Error('The plan profile has no unique durable initialization admission; it cannot resume.');
    const { event, value } = admissions[0];
    const fields = ['version', 'childId', 'provider', 'parentSessionId', 'workspace', 'preset', 'descriptorSeq', 'descriptorSha256', 'personaSha256', 'nativePlanSeq'];
    const plan = proof.events.find(item => item.seq === value?.nativePlanSeq);
    if (!value || Object.keys(value).length !== fields.length || fields.some(name => !Object.hasOwn(value, name))
      || value.version !== 1 || value.childId !== agent.id || value.provider !== descriptor.provider
      || value.parentSessionId !== agent.session.header.parentSession || value.workspace !== agent.session.header.cwd
      || value.preset !== ctx.get('agentPresets')?.composedPreset(agent.ctx) || value.descriptorSeq !== proof.descriptor.seq
      || value.descriptorSha256 !== sha(descriptor) || value.personaSha256 !== sha(actorPersona(agent.session.snapshotEvents(agent.session.inheritedEventCount)))
      || !Number.isSafeInteger(value.nativePlanSeq) || value.nativePlanSeq <= proof.descriptor.seq
      || value.nativePlanSeq >= event.seq || plan?.type !== 'plan/mode' || plan.data?.active !== true
      || proof.events.findLast(item => item.seq < event.seq && item.type === 'plan/mode')?.seq !== value.nativePlanSeq
      || proof.events.some(item => item.seq < event.seq && ['turn/start', 'request/header'].includes(item.type)))
      throw Error('The durable profile plan admission does not prove native initialization before first work.');
    // Subsequent native plan/mode events are deliberately not reset. They may
    // be real user selections made after this initial admission.
    return value;
  }
  const service = {
    reserve(exec, { childId, provider, persona }, signal, check = () => {}) {
      const parent = exec.agent, session = native(parent?.session), parentKey = key(parent);
      const fused = AbortSignal.any([signal, shutdown.signal]);
      const validate = () => {
        check(); owner(parent, fused);
        if (key(parent) !== parentKey || native(parent.session) !== session
          || session.header.cwd !== workspace || ctx.get('agentPresets')?.composedPreset(parent.ctx) !== preset)
          throw Error('The profile plan launch reservation owner changed.');
      };
      const workspace = session?.header.cwd, preset = ctx.get('agentPresets')?.composedPreset(parent.ctx);
      if (typeof preset !== 'string' || !preset) throw Error('The profile plan parent has no actual retained native preset.');
      validate();
      if (typeof childId !== 'string' || !childId || !isPlanProvider(provider) || typeof persona !== 'string'
        || reservations.has(childId) || reservations.size >= MAX_PENDING)
        throw Error('The profile plan launch reservation is invalid, duplicate, or exceeds 128 pending launches.');
      const done = Promise.withResolvers();
      const reservation = { parent, parentKey, session, workspace, preset, provider, personaSha256: sha(persona), signal: fused, validate, entered: false, done: done.promise };
      reservations.set(childId, reservation);
      // Keep an aborted reservation until the actual native startup settles.
      // A late created listener then fails instead of falling through default.
      return () => { if (reservations.get(childId) === reservation) reservations.delete(childId); done.resolve(); };
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(Error('Profile plan admission scope disposed.'));
      closing = (async () => {
        // Leave the serial guard registered until actual startup calls have
        // settled. Removing it on cancellation alone could let a late fresh
        // child miss initialization and start with the default mode.
        while (reservations.size) await Promise.allSettled([...reservations.values()].map(value => value.done));
        while (pending.size) await Promise.allSettled([...pending]);
        const failures = [];
        for (const dispose of disposers.splice(0).reverse()) try { await dispose(); } catch (error) { failures.push(error); }
        reservations.clear();
        if (failures.length) throw new AggregateError(failures, 'Profile plan admission cleanup failed.');
      })();
      return closing;
    },
  };
  async function created({ agent, source, signal }) {
    // Ordinary children are inspected only to identify their descriptor and do
    // not require plan services. A persisted plan subtype must retain its
    // original admission across resume and other native runtime replacements.
    if (ctx.get('omaa').product(agent.session)?.id !== 'zcode' || agent.session.header.origin !== 'subagent') return;
    const fused = AbortSignal.any([shutdown.signal, ...(signal ? [signal] : [])]);
    const proof = await inspect(agent, fused);
    const descriptor = proof.descriptor?.data;
    if (!isPlanProvider(descriptor?.provider)) {
      if (reservations.has(agent.id)) throw Error('The reserved plan profile has no matching own descriptor.');
      return;
    }
    validateDescriptor(agent, proof.descriptor);
    if (['resume', 'clear', 'compact'].includes(source)) { validateAdmission(agent, proof); return; }
    if (source !== 'startup') throw Error('The native plan profile creation source is unknown.');
    const reservation = reservations.get(agent.id);
    if (!reservation || reservation.entered) throw Error('Fresh plan profile startup has no unique live launch reservation.');
    reservation.entered = true;
    const check = () => {
      owner(agent, fused); reservation.validate();
      if (reservations.get(agent.id) !== reservation || descriptor.provider !== reservation.provider
        || actorPersona(agent.session.snapshotEvents(agent.session.inheritedEventCount)) === undefined || sha(actorPersona(agent.session.snapshotEvents(agent.session.inheritedEventCount))) !== reservation.personaSha256
        || agent.session.header.parentSession !== reservation.parent.id || agent.session.header.cwd !== reservation.workspace
        || !ctx.get('agents')?.isOwnedBy(agent.id, reservation.parent))
        throw Error('The native plan child does not match its exact launch reservation.');
    };
    check();
    if (proof.events.some(event => ['turn/start', 'request/header', RECORD].includes(event.type)))
      throw Error('The plan profile has already started work or initialized before its launch gate.');
    // Planning is isolated inside the actual retained preset composition.
    // The Agent's outer ctx does not carry that isolate symbol.
    const planMode = ctx.get('omaa').planController(agent);
    if (!planMode?.set || !planMode.get) throw Error('The native plan-mode controller is unavailable.');
    const outcome = planMode.set(agent, true);
    const active = () => {
      const current = planMode.get(agent);
      if (current.active !== true || current.pending === false) throw Error('Native profile plan mode was not committed before work.');
    };
    if (!['committed', 'noop'].includes(outcome)) throw Error('Native profile plan mode was queued rather than committed before work.');
    active(); check();
    const committed = await inspect(agent, fused); check(); active();
    if (committed.cut !== agent.session.seq || sha(committed.descriptor?.data) !== sha(descriptor))
      throw Error('The plan descriptor changed during native initialization.');
    const plan = committed.events.findLast(event => event.type === 'plan/mode');
    if (!plan || plan.data?.active !== true || plan.seq <= proof.descriptor.seq)
      throw Error('No own native plan-mode event proves profile initialization.');
    appendPluginRecord(native(agent.session), RECORD, { version: 1, childId: agent.id, provider: descriptor.provider,
      parentSessionId: reservation.parent.id, workspace: reservation.workspace, preset: ctx.get('agentPresets').composedPreset(agent.ctx),
      descriptorSeq: proof.descriptor.seq, descriptorSha256: sha(descriptor), personaSha256: reservation.personaSha256,
      nativePlanSeq: plan.seq });
    check(); active();
    if (await agent.ctx.get('sessions')?.flush(native(agent.session)) !== true)
      throw Error('The native profile plan initialization has no durable flush acknowledgement.');
    check(); active();
  }
  try {
    disposers.push(ctx.on('agent/created', info => observe(created(info)), { global: true, prepend: true }));
    disposers.push(ctx.provide(SERVICE, service));
    ctx.effect(function* () {
      // Keep the serial startup guard installed until close() has drained
      // reservations; automatic sibling teardown must not remove it early.
      for (const dispose of disposers) yield dispose;
      return () => service.close();
    });
  } catch (error) { void service.close().catch(() => {}); throw error; }
  return service;
}
