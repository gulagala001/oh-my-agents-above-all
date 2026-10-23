import { Context, symbols } from '@deepseek-ai/cordis';
import { bindTypertRemote, Remote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { SessionQueryError } from '@deepseek-ai/dsh-session-query';
import { claimsProfileSkills } from '../presets/zcode/profile-skill-policy.mjs';

export const name = 'omaa-zcode-skill-catalog';
export const inject = ['sessionSkillCatalog', 'agents', 'sessionQuery', 'omaaZcodeProfileSkills'];
const SERVICE = 'sessionSkillCatalog', BOUNDARY = 'omaaZcodeSkillCatalogBoundary';
const MAX_PROFILE_EVENTS = 100000, MAX_PROFILE_BYTES = 100000, MAX_PROFILE_SKILLS = 128;
const original = value => value?.[symbols.original] ?? value;
const initializers = [];

// Use the actual public Remote decorator and its standard initializer
// protocol, as compiled decorators do. No native prototype or descriptor is
// copied or mutated; this class owns its own exported method metadata.
class OwnedSkillCatalog {
  constructor(ctx, list) {
    this.ctx = ctx;
    this.read = list;
    this.typertRemote = bindTypertRemote(this, SERVICE, { namespace: 'skills' });
    for (const initialize of initializers) initialize.call(this);
  }
  async list(request, signal) { return this.read(request, signal); }
}
Remote(OwnedSkillCatalog.prototype.list, {
  kind: 'method', name: 'list', static: false, private: false,
  access: { has: target => 'list' in target, get: target => target.list },
  addInitializer(initialize) { initializers.push(initialize); },
});

function validateProfileResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).join(',') !== 'skills' || !Array.isArray(value.skills)
    || value.skills.length > MAX_PROFILE_SKILLS || value.skills.some(skill => !skill
      || typeof skill !== 'object' || Array.isArray(skill)
      || Object.keys(skill).some(key => !['name', 'path', 'description', 'whenToUse', 'modelInvocable'].includes(key))
      || typeof skill.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)
      || typeof skill.description !== 'string' || typeof skill.modelInvocable !== 'boolean'
      || skill.path !== undefined && typeof skill.path !== 'string'
      || skill.whenToUse !== undefined && typeof skill.whenToUse !== 'string')
    || new Set(value.skills.map(skill => skill.name)).size !== value.skills.length
    || Buffer.byteLength(JSON.stringify(value)) > MAX_PROFILE_BYTES)
    throw new RemoteError('gateway/internal', 'The restricted profile skill catalog has no complete bounded native response.', {});
  return value;
}

/**
 * Compose this entry in the SAME named sessionSkillCatalog isolate as the
 * native SessionController. It borrows that real native catalog and provides
 * the sole root skills/list service. The native controller and generated
 * protocol stay intact. Ordinary sessions delegate without changing their
 * existing native fallback semantics; restricted profile claims never do.
 */
export function installZCodeSkillCatalog(ctx) {
  const nativeCatalog = ctx.get(SERVICE), nativeIdentity = original(nativeCatalog);
  const rootRealm = ctx.root[Context.isolate][SERVICE];
  if (typeof rootRealm !== 'symbol' || ctx[Context.isolate][SERVICE] === rootRealm
    || typeof nativeCatalog?.list !== 'function' || nativeIdentity?.typertRemote?.service !== nativeIdentity
    || nativeIdentity.typertRemote.serviceKey !== SERVICE || nativeIdentity.typertRemote.namespace !== 'skills')
    throw Error('The skill catalog adapter requires the actual native catalog in its explicit shared isolate.');
  // Context.isolate and Context.isolate's exported map are public APIs. Only
  // this service label changes; registrations keep this plugin's own fiber.
  const publicCtx = ctx.isolate(SERVICE, rootRealm);
  if (publicCtx.get(SERVICE) !== undefined) throw Error('The root skill catalog is already owned; no second endpoint was registered.');
  const shutdown = new AbortController(), pending = new Set(), disposers = [];
  let closed = false, closing, catalog;
  const check = signal => {
    signal?.throwIfAborted(); shutdown.signal.throwIfAborted();
    if (closed || original(ctx.get(SERVICE)) !== nativeIdentity || original(publicCtx.get(SERVICE)) !== catalog)
      throw Error('The owned or native skill catalog lifetime changed.');
  };
  async function read(request, callerSignal) {
    if (!request || typeof request !== 'object' || Array.isArray(request)
      || Object.keys(request).join(',') !== 'sessionId' || typeof request.sessionId !== 'string' || !request.sessionId)
      throw new RemoteError('gateway/bad-request', 'The skill catalog requires exactly one sessionId.', {});
    if (!(callerSignal instanceof AbortSignal))
      throw new RemoteError('gateway/bad-request', 'The skill catalog requires the real caller cancellation signal.', {});
    const signal = AbortSignal.any([callerSignal, shutdown.signal]);
    check(signal);
    let observation;
    try {
      observation = await ctx.get('sessionQuery').observeSession(request.sessionId, { signal });
      check(signal);
      if (observation.header.id !== request.sessionId)
        throw new RemoteError('gateway/internal', 'The skill catalog observation changed Session identity.', {});
      if (!claimsProfileSkills(observation)) {
        // Keep the original service receiver and actual native request. No
        // hand-built ordinary catalog or replacement global registry is used.
        const value = await nativeCatalog.list(request, signal);
        check(signal);
        // The real native delegate makes its own observation. A blank Session
        // can select a restricted preset while that read awaits providers;
        // never release an ordinary/global result into that newly bound view.
        const current = await ctx.get('sessionQuery').observeSession(request.sessionId, { signal });
        try {
          check(signal);
          if (current.header.id !== request.sessionId || claimsProfileSkills(current))
            throw new RemoteError('gateway/internal', 'The Session acquired restricted profile skills during catalog discovery; the ordinary result was withheld.', {});
        } finally { current[Symbol.dispose](); }
        return value;
      }
      if (observation.events.length > MAX_PROFILE_EVENTS)
        throw new RemoteError('gateway/internal', 'The restricted profile exceeds its 100000-event catalog verification bound.', {});
      const service = ctx.get('omaaZcodeProfileSkills');
      if (!service?.listCatalog)
        throw new RemoteError('gateway/internal', 'Restricted profile skill admission is unavailable; global fallback is forbidden.', {});
      const value = await service.listCatalog({ observation, liveAgent: ctx.get('agents').get(request.sessionId), signal });
      check(signal);
      if (original(ctx.get('omaaZcodeProfileSkills')) !== original(service))
        throw new RemoteError('gateway/internal', 'The restricted profile skill owner changed during discovery.', {});
      return validateProfileResult(value);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND')
        throw new RemoteError('session/not-found', 'The requested skill catalog Session was not found.', { sessionId: request.sessionId });
      throw error;
    } finally { observation?.[Symbol.dispose](); }
  }
  function close() {
    if (closing) return closing;
    const done = Promise.withResolvers(); closing = done.promise;
    closed = true; shutdown.abort(Error('The owned skill catalog scope closed.'));
    void (async () => {
      while (pending.size) await Promise.allSettled([...pending]);
      const errors = [];
      for (const dispose of disposers.splice(0).reverse()) try { await dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Owned skill catalog cleanup failed.');
    })().then(done.resolve, done.reject);
    return closing;
  }
  catalog = new OwnedSkillCatalog(publicCtx, (request, signal) => {
    const work = read(request, signal);
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {});
    return work;
  });
  const boundary = { available() { try { check(); return true; } catch { return false; } }, assertAvailable: () => check() };
  try {
    disposers.push(publicCtx.provide(SERVICE, catalog));
    disposers.push(publicCtx.provide(BOUNDARY, boundary));
    ctx.effect(function* () {
      for (const dispose of disposers) yield dispose;
      return close;
    });
  } catch (error) { void close().catch(() => {}); throw error; }
  return boundary;
}

export function apply(ctx) { installZCodeSkillCatalog(ctx); }
