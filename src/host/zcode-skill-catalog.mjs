import { symbols } from '@deepseek-ai/cordis';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { SessionQueryError } from '@deepseek-ai/dsh-session-query';
import { claimsProfileSkills } from '../presets/zcode/profile-skill-policy.mjs';

export const name = 'omaa-zcode-skill-catalog';
export const inject = ['sessionSkillCatalog', 'agents', 'sessionQuery', 'omaaZcodeProfileSkills'];
const SERVICE = 'sessionSkillCatalog', BOUNDARY = 'omaaZcodeSkillCatalogBoundary';
const MAX_PROFILE_EVENTS = 100000, MAX_PROFILE_BYTES = 100000, MAX_PROFILE_SKILLS = 128;
const original = value => value?.[symbols.original] ?? value;
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

// Install only while ZCode is enabled. Keep the native service, namespace and
// Remote metadata; remove the one owned method adapter on teardown. This avoids
// changing the host SessionController composition merely by installing OMAA.
export function installZCodeSkillCatalog(ctx) {
  const nativeCatalog = ctx.get(SERVICE), nativeIdentity = original(nativeCatalog);
  if (typeof nativeCatalog?.list !== 'function' || nativeIdentity?.typertRemote?.service !== nativeIdentity
    || nativeIdentity.typertRemote.serviceKey !== SERVICE || nativeIdentity.typertRemote.namespace !== 'skills')
    throw Error('The skill catalog adapter requires the actual native catalog.');
  const descriptor = Object.getOwnPropertyDescriptor(nativeIdentity, 'list');
  const nativeList = nativeCatalog.list.bind(nativeCatalog);
  const shutdown = new AbortController(), pending = new Set(), disposers = [];
  let closed = false, closing, adaptedList;
  const check = signal => {
    signal?.throwIfAborted(); shutdown.signal.throwIfAborted();
    if (closed || original(ctx.get(SERVICE)) !== nativeIdentity || nativeIdentity.list !== adaptedList)
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
        const value = await nativeList(request, signal);
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
  adaptedList = (request, signal) => {
    const work = read(request, signal);
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {});
    return work;
  };
  const boundary = { available() { try { check(); return true; } catch { return false; } }, assertAvailable: () => check() };
  try {
    Object.defineProperty(nativeIdentity, 'list', { configurable: true, writable: true, value: adaptedList });
    disposers.push(() => {
      if (nativeIdentity.list !== adaptedList) return;
      if (descriptor) Object.defineProperty(nativeIdentity, 'list', descriptor);
      else delete nativeIdentity.list;
    });
    disposers.push(ctx.provide(BOUNDARY, boundary));
    ctx.effect(function* () {
      for (const dispose of disposers) yield dispose;
      return close;
    });
  } catch (error) { void close().catch(() => {}); throw error; }
  return boundary;
}

export function apply(ctx) { installZCodeSkillCatalog(ctx); }
