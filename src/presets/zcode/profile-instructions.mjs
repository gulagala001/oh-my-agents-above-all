import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { deriveEventMessage, foldSurface } from '@deepseek-ai/dsh-session';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

export const PROFILE_INSTRUCTIONS_PROVIDER_PREFIX = 'omaa-zcode-profile-snapshot-agents-';
const SERVICE = 'omaaZcodeProfileInstructions', SOURCE = 'omaa-zcode-profile-instructions';
const TEXT_BYTES = 65536, ROW_BYTES = 131072, MAX_ROWS = 512, MAX_SOURCE_EVENTS = 100000;
const id = z.string().min(1).max(512), digest = z.string().regex(/^[a-f0-9]{64}$/);
const ordinal = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instruction = z.object({ id, role: z.literal('user'), source: z.record(z.string(), z.unknown()),
  content: z.array(z.object({ type: z.literal('text'), text: z.string() }).strict()).max(128) }).strict();
const rowSchema = z.object({ version: z.literal(1), childId: id, provider: id,
  profileName: z.string().min(1).max(200), personaSha256: digest,
  parentSessionId: id, parentWorkspace: z.string().min(1).max(4096), parentPreset: id,
  parentHeaderSha256: digest, lifecycle: id, createdSource: z.enum(['startup', 'resume', 'clear', 'compact']),
  sourceCursor: ordinal, contentGeneration: ordinal, requestMessageIdsSha256: digest,
  capturedAt: z.number().int().nonnegative(), messages: z.array(instruction).max(128),
  instructionsSha256: digest, snapshotSha256: digest }).strict();
const native = value => value?.[symbols.original] ?? value;
const keyOf = childId => 'child_' + createHash('sha256').update(childId).digest('hex');
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw Error('Profile instructions must retain lossless JSON facts.');
}
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) freeze(member);
    Object.freeze(value);
  }
  return value;
}
function instructionMessages(messages) {
  const selected = [];
  for (const message of messages) if (message.source?.kind === 'agent-instructions') {
    if (message.role !== 'user' || message.source.form !== 'instructions' || !Array.isArray(message.content)
      || message.content.some(block => block?.type !== 'text' || typeof block.text !== 'string'))
      throw Error('The received native instructions have an unsupported content form.');
    selected.push({ id: message.id, role: 'user', source: structuredClone(message.source),
      content: message.content.map(block => ({ type: 'text', text: block.text })) });
  }
  if (selected.length > 128 || selected.reduce((sum, message) => sum + message.content.reduce((n, block) => n + Buffer.byteLength(block.text), 0), 0) > TEXT_BYTES)
    throw Error('The received native instruction snapshot exceeds 128 messages or 64 KiB text; it was not truncated.');
  return selected;
}
function checkedRow(input) {
  const row = rowSchema.parse(input), { snapshotSha256, ...body } = row;
  if (!row.provider.startsWith(PROFILE_INSTRUCTIONS_PROVIDER_PREFIX)
    || row.messages.some(message => message.source.kind !== 'agent-instructions' || message.source.form !== 'instructions')
    || row.instructionsSha256 !== sha(instructionMessages(row.messages)) || snapshotSha256 !== sha(body)
    || Buffer.byteLength(canonical(row)) > ROW_BYTES)
    throw Error('The durable profile instruction snapshot is incomplete or inconsistent.');
  return freeze(row);
}

/** Install in the root before Agent creation; ready owns only storage startup.
 * This copies actual native received text, never original raw file metadata.
 */
export function installZCodeProfileInstructions(ctx) {
  const lifetimes = new WeakMap(), pending = new Set(), disposers = [];
  const shutdown = new AbortController();
  let closed = false, closing, domain, domainClosing, table, tail = Promise.resolve();
  const closeDomain = () => domain ? (domainClosing ??= domain.close()) : Promise.resolve();
  const keyFor = agent => agent?.ctx && scopeOf(agent.ctx);
  const owner = (agent, entry, signal) => {
    signal?.throwIfAborted(); shutdown.signal.throwIfAborted();
    const current = agent && ctx.get('agents')?.get(agent.id);
    if (closed || !entry || entry.disposed || keyFor(agent) !== entry.key || keyFor(current) !== entry.key
      || native(agent.session) !== entry.session || native(current?.session) !== entry.session
      || native(ctx.get('sessions')?.get(agent.id)) !== entry.session
      || ctx.get('omaa').product(entry.session)?.id !== 'zcode' || ctx.get('omaa').product(entry.session)?.preset !== entry.preset)
      throw Error('The native profile instruction owner or Agent lifetime changed.');
  };
  const observe = work => {
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {}); return work;
  };
  const ready = ctx.storageDomain.open(defineDomain({ name: 'omaa_zcode_profile_instructions', version: 1,
    layout: 'per-record', tables: { children: domainTable(rowSchema) } })).then(async opened => {
    domain = opened;
    if (closed) throw Error('Profile instruction storage closed during initialization.');
    table = domain.table('children');
    if (table.size > MAX_ROWS) throw Error('Profile instruction storage exceeds its 512-record admission bound.');
    for (const [key, value] of table.entries()) if (key !== keyOf(checkedRow(value).childId))
      throw Error('Profile instruction storage key does not match its child.');
  }).catch(async error => {
    try { await closeDomain(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Profile instruction initialization and cleanup failed.', { cause: error }); }
    throw error;
  });
  void ready.catch(() => {});
  async function sourceProof(agent, entry, signal) {
    owner(agent, entry, signal);
    const capture = entry.capture;
    if (!capture) throw Error('No verified first native LOOP request snapshot exists for this actual Agent lifetime.', { cause: entry.failure });
    if (entry.session.seq > MAX_SOURCE_EVENTS) throw Error('The native instruction source exceeds the 100000-event verification bound.');
    const query = ctx.get('sessionQuery');
    if (!query?.observeSession) throw Error('Native instruction source observation is unavailable.');
    const observation = await query.observeSession(agent.id, { projectionMode: 'none', signal });
    try {
      owner(agent, entry, signal);
      if (observation.source !== 'live' || native(observation.header) !== entry.session.header
        || observation.cursor < capture.sourceCursor || observation.cursor >= MAX_SOURCE_EVENTS
        || sha(observation.header) !== capture.parentHeaderSha256)
        throw Error('The instruction source no longer matches its exact received request cut.');
      const events = observation.events.slice(0, capture.sourceCursor + 1);
      if (events.length !== capture.sourceCursor + 1 || events.some((event, index) => event.seq !== index))
        throw Error('The instruction source prefix is not complete.');
      const surface = foldSurface(events, ctx.get('sessions')?.messageProjections ?? []);
      const messages = surface.nodes.map(seq => deriveEventMessage(events[seq], surface.projectedMessages)).filter(Boolean);
      if (sha(messages.map(message => message.id)) !== capture.requestMessageIdsSha256
        || !isDeepStrictEqual(instructionMessages(messages), capture.messages))
        throw Error('The current source interpreters do not reproduce the received instruction snapshot.');
      return capture;
    } finally { observation[Symbol.dispose](); }
  }
  const service = {
    ready,
    reserve(exec, { childId, provider, profileName, persona }, signal, check = () => {}) {
      const work = (async () => {
        const fused = AbortSignal.any([shutdown.signal, signal]);
        const agent = exec.agent, entry = lifetimes.get(keyFor(agent));
        check(); owner(agent, entry, fused); await ready;
        const captured = await sourceProof(agent, entry, fused);
        check(); owner(agent, entry, fused);
        const body = { version: 1, childId, provider, profileName, personaSha256: sha(persona),
          parentSessionId: agent.id, parentWorkspace: entry.session.header.cwd, parentPreset: entry.preset, ...captured };
        const row = checkedRow({ ...body, snapshotSha256: sha(body) });
        const write = tail.then(async () => {
          check(); owner(agent, entry, fused);
          if (table.get(keyOf(childId))) throw Error('The reserved profile child already has an instruction binding.');
          if (table.size >= MAX_ROWS) throw Error('Profile instruction storage reached its 512-record bound; no child was started.');
          await table.put(keyOf(childId), row);
          // A late cancellation leaves this committed reservation intact. It
          // is not evidence that native activation accepted the proposed id.
          return row.snapshotSha256;
        });
        tail = write.catch(() => {}); return write;
      })();
      return observe(work);
    },
    applyChild(agent, descriptor, decision, { signal, step, check = () => {} }) {
      const work = (async () => {
        const fused = AbortSignal.any([shutdown.signal, signal]);
        const validate = () => {
          fused.throwIfAborted(); check();
          const current = ctx.get('agents')?.get(agent.id);
          if (closed || keyFor(current) !== keyFor(agent) || native(current?.session) !== native(agent.session)
            || native(ctx.get('sessions')?.get(agent.id)) !== native(agent.session)
            || ctx.get('omaa').product(agent.session)?.id !== 'zcode') throw Error('The profile child instruction owner changed.');
        };
        validate(); await ready; validate();
        const value = table.get(keyOf(agent.id));
        if (!value) throw Error('The durable native instruction snapshot is missing; child rediscovery is forbidden.');
        const row = checkedRow(value);
        if (row.childId !== agent.id || row.provider !== descriptor.provider || row.parentSessionId !== agent.session.header.parentSession
          || row.parentWorkspace !== agent.session.header.cwd || row.personaSha256 !== sha(descriptor.persona)
          || descriptor.label !== 'ZCode Profile · ' + row.profileName.slice(0, 160))
          throw Error('The native child descriptor and durable instruction snapshot disagree.');
        const isNativeInstruction = message => message.source?.kind === 'agent-instructions';
        for (const message of [...agent.inbox.nextStep].filter(isNativeInstruction)) { validate(); agent.inbox.remove(message.id); }
        if (decision.kind === 'reject') return decision;
        const messages = decision.messages.filter(message => !isNativeInstruction(message));
        const own = message => message.source?.kind === SOURCE && message.source.childId === agent.id;
        const expected = row.messages.flatMap(message => message.content);
        const currentSurface = agent.session.deriveMessages();
        if (currentSurface.some(isNativeInstruction))
          throw Error('The snapshot child already has visible rediscovered native instructions; its history was not rewritten.');
        const visible = [...currentSurface, ...messages].filter(own);
        for (const message of visible) if (message.source.snapshotSha256 !== row.snapshotSha256
          || message.source.parentSessionId !== row.parentSessionId || message.source.sourceCursor !== row.sourceCursor
          || !isDeepStrictEqual(message.source.sourceMessageIds, row.messages.map(message => message.id))
          || !isDeepStrictEqual(message.content, expected)) throw Error('A visible profile instruction snapshot has inconsistent content.');
        validate();
        if (!visible.length && expected.length && !(step === 1 && messages.length === 0)) messages.push(createUserMessage({
          content: structuredClone(expected), source: { kind: SOURCE, form: 'instructions', childId: row.childId,
            parentSessionId: row.parentSessionId, sourceCursor: row.sourceCursor, snapshotSha256: row.snapshotSha256,
            sourceMessageIds: row.messages.map(message => message.id) },
        }));
        return { ...decision, messages };
      })();
      return observe(work);
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(Error('Profile instruction snapshot scope disposed.'));
      const failures = [], teardown = [];
      for (const dispose of disposers.splice(0).reverse()) try { teardown.push(Promise.resolve(dispose())); } catch (error) { failures.push(error); }
      closing = (async () => {
        const results = await Promise.allSettled([ready, ...teardown]);
        for (const result of results.slice(1)) if (result.status === 'rejected') failures.push(result.reason);
        while (pending.size) await Promise.allSettled([...pending]);
        await tail;
        if (domain) try { await closeDomain(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, 'Profile instruction storage cleanup failed.');
      })();
      return closing;
    },
  };
  try {
    disposers.push(ctx.on('agent/created', ({ agent, source }) => {
      const key = keyFor(agent);
      if (key) lifetimes.set(key, { key, session: native(agent.session), preset: ctx.get('omaa').product(agent.session)?.preset,
        lifecycle: randomUUID(), createdSource: source, firstRequestSeen: false, disposed: false });
    }, { global: true }));
    disposers.push(ctx.on('agent/disposed', ({ agent }) => { const entry = lifetimes.get(keyFor(agent)); if (entry) entry.disposed = true; }, { global: true }));
    disposers.push(ctx.on('agent/request', (info, next) => {
      const entry = lifetimes.get(keyFor(info.agent));
      if (entry && !entry.firstRequestSeen) entry.requestSignal = info.signal;
      return next();
    }, { global: true }));
    disposers.push(ctx.on('llm/stream', (options, next) => {
      if (isAgentLoopRequest(options)) {
        const agent = typeof options.sessionId === 'string' && ctx.get('agents')?.get(options.sessionId);
        const entry = agent && lifetimes.get(keyFor(agent));
        if (entry && !entry.firstRequestSeen) {
          entry.firstRequestSeen = true;
          try {
            // Lifecycle + actual native request signal + synchronous derived
            // surface are the proof; the public LOOP marker is not sufficient.
            entry.preset = ctx.get('omaa').product(entry.session)?.preset;
            if (entry.requestSignal !== options.signal || agent.status !== 'running')
              throw Error('The LOOP request has no matching native Agent request admission.');
            owner(agent, entry, options.signal);
            if (entry.session.header.origin === 'subagent') throw Error('Profile snapshots require a main-session parent.');
            const seq = entry.session.seq, generation = entry.session.surface.contentGeneration;
            if (!Number.isSafeInteger(seq) || seq < 1 || seq > MAX_SOURCE_EVENTS
              || !Number.isSafeInteger(generation) || generation < 0
              || !isDeepStrictEqual(options.messages, entry.session.deriveMessages())
              || entry.session.seq !== seq || entry.session.surface.contentGeneration !== generation)
              throw Error('The actual LOOP request no longer matches its synchronous native surface cut.');
            const messages = instructionMessages(options.messages);
            entry.capture = freeze({ parentHeaderSha256: sha(entry.session.header), lifecycle: entry.lifecycle,
              createdSource: entry.createdSource, sourceCursor: seq - 1, contentGeneration: generation,
              requestMessageIdsSha256: sha(options.messages.map(message => message.id)), capturedAt: Date.now(),
              messages, instructionsSha256: sha(messages) });
            if (Buffer.byteLength(canonical(entry.capture)) > ROW_BYTES) throw Error('The received instruction snapshot exceeds its full-record budget.');
          } catch (error) { entry.capture = undefined; entry.failure = error; }
        }
      }
      return next();
    }, { global: true }));
    disposers.push(ctx.provide(SERVICE, service));
    ctx.effect(function* () {
      // Claim the exact listener/service effects into one ordered group.
      // Root fiber teardown otherwise starts them as concurrent siblings.
      for (const dispose of disposers) yield dispose;
      return () => service.close();
    });
  } catch (error) {
    void service.close().catch(() => {}); throw error;
  }
  return service;
}
