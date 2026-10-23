import { createHash } from 'node:crypto';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { homedir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { Context, symbols } from '@deepseek-ai/cordis';
import { createScope, scopeOf, scopeParentOf } from '@deepseek-ai/dsh-scope';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include';
import { actorPersona } from '../../host/subagents.mjs';
import { load } from 'js-yaml';
import { z } from 'zod';
import { expandProjectSkillDirectory, parseProjectSkill } from './project-skill-parser.mjs';
import { PROFILE_SKILL_PRESET, PROFILE_SKILL_ADMISSION, PROFILE_SKILL_ROUTING_KEY, PROFILE_SKILL_PRESET_PREFIX, PROFILE_SKILL_SOURCE_EVENTS,
  claimsProfileSkills, isProfileSkillProvider, profileSkillPresetPlugins } from './profile-skill-policy.mjs';

export const name = 'omaa-zcode-profile-skill-view';
export const inject = ['omaaZcodeProfileSkills'];
const SERVICE = 'omaaZcodeProfileSkills', LOCAL_PROVIDER = 'omaa-zcode-project-skills';
const MAX_SKILLS = 128, MAX_BYTES = 256 * 1024, MAX_DECLARATION = 1024 * 1024, MAX_PENDING = 128;
const native = value => value?.[symbols.original] ?? value;
const key = agent => agent?.ctx && scopeOf(agent.ctx);
const validName = name => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 200;
const presetClaim = value => typeof value === 'string' && value.startsWith(PROFILE_SKILL_PRESET_PREFIX);
const routingProjection = {
  key: PROFILE_SKILL_ROUTING_KEY, stateSchema: z.boolean(), stateVersion: 1,
  init: header => presetClaim(header.agentPreset),
  apply: (state, event) => state || event.type === PROFILE_SKILL_ADMISSION
    || event.type === 'subagent/descriptor' && isProfileSkillProvider(event.data?.provider)
    || event.type === 'agent-preset/selected' && presetClaim(event.data?.agentPreset),
  wire: { viewSchema: z.boolean(), view: value => value },
};
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw Error('Profile skill admission requires complete lossless JSON facts.');
}
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');
const bytesSha = value => createHash('sha256').update(value).digest('hex');
function summary(definition) {
  const { content, metadata, ...value } = definition;
  return structuredClone(value);
}
function cleanDefinition(value) {
  if (!value || !validName(value.name) || typeof value.description !== 'string' || typeof value.content !== 'string'
    || value.provider !== LOCAL_PROVIDER || !['user-zcode', 'user-agents', 'project-zcode', 'project-agents'].includes(value.source)
    || typeof value.path !== 'string' || !isAbsolute(value.path) || value.resourceBase?.kind !== 'directory'
    || typeof value.resourceBase.path !== 'string' || !isAbsolute(value.resourceBase.path)
    || typeof value.invocation?.modelInvocable !== 'boolean' || typeof value.invocation?.userInvocable !== 'boolean'
    || value.whenToUse !== undefined && typeof value.whenToUse !== 'string')
    throw Error('Only exact native local filesystem skill identities are supported; plugin, qualified and official aliases were not inferred.');
  return { name: value.name, description: value.description, content: value.content,
    path: value.path, source: value.source, provider: value.provider,
    invocation: { modelInvocable: value.invocation.modelInvocable, userInvocable: value.invocation.userInvocable },
    resourceBase: { kind: 'directory', path: value.resourceBase.path },
    ...(value.whenToUse === undefined ? {} : { whenToUse: value.whenToUse }),
    ...(value.metadata === undefined ? {} : { metadata: structuredClone(value.metadata) }) };
}

// This is a complete service boundary, not another additive provider. Native
// registrations retain their actual lifecycle in a private registry, while
// all read surfaces use only the child's authenticated frozen local view.
export async function apply(ctx) {
  const service = ctx.get(SERVICE), identity = native(service);
  if (!identity?.attachPort) throw Error('The root profile skill admission service is unavailable.');
  const realm = ctx[Context.isolate].skills;
  if (typeof realm !== 'symbol' || realm === ctx.root[Context.isolate].skills)
    throw Error('The profile skill view must own an explicitly isolated skills realm.');
  // Keep the registration registry outside this preset mount: the public
  // serviceForMount() resolves the first mount-owned service of this name.
  // A second hidden `skills` implementation in this mount would be ambiguous.
  const registrations = await service.openRegistrations();
  const registry = registrations.registry;
  let closed = false, builtinRegistered = false;
  const port = {
    registerProvider(create) {
      if (closed || builtinRegistered || typeof create !== 'function') throw Error('The restricted view admits only its single known builtin provider lifecycle.');
      builtinRegistered = true;
      try {
        // The unchanged workflow module registers this builtin even when its
        // Skill is not selected. Preserve its native abort/disposer lifecycle,
        // but never invoke its catalog/body methods. The native effect belongs
        // to the private registry, not the original caller's scope layer.
        return registry.registerProvider(control => {
          const provider = create(control);
          if (provider?.name !== 'omaa-zcode') throw Error('Unknown providers cannot enter a restricted profile skill view.');
          return provider;
        });
      } catch (error) { builtinRegistered = false; throw error; }
    },
    register() { throw Error('Runtime skill contributions cannot extend the admitted restricted local view.'); },
    snapshot(options = {}) {
      if (closed || native(ctx.get(SERVICE)) !== identity) throw Error('Profile skill view lifetime changed.');
      return service.readView(port, options, false);
    },
    async list(options = {}) { return (await port.snapshot(options)).skills; },
    async get(name, options = {}) {
      if (!validName(name)) throw Error('An exact native kebab-case skill name is required.');
      if (closed || native(ctx.get(SERVICE)) !== identity) throw Error('Profile skill view lifetime changed.');
      return service.readView(port, options, name);
    },
  };
  const disposers = [];
  try {
    disposers.push(service.attachPort(port, scopeOf(ctx)));
    disposers.push(ctx.provide('skills', port));
    ctx.effect(function* () {
      for (const dispose of disposers) yield dispose;
      return async () => {
        closed = true;
        const failures = [];
        for (const dispose of disposers.splice(0).reverse()) try { await dispose(); } catch (error) { failures.push(error); }
        try { await registrations.close(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, 'Profile skill view disposal failed.');
      };
    });
  } catch (error) {
    closed = true;
    const failures = [error];
    for (const dispose of disposers.reverse()) try { await dispose(); } catch (failure) { failures.push(failure); }
    try { await registrations.close(); } catch (failure) { failures.push(failure); }
    throw failures.length === 1 ? error : new AggregateError(failures, 'Profile skill view initialization and cleanup failed.', { cause: error });
  }
}

function checkedBinding(value) {
  const fields = ['version', 'childId', 'parentSessionId', 'workspace', 'provider', 'profileName', 'personaSha256',
    'headerSha256', 'descriptorSha256', 'descriptorSeq', 'basePreset', 'baseSha256', 'derivedSha256', 'skills', 'bindingSha256'];
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field)) || value.version !== 1 || value.basePreset !== 'omaa-zcode'
    || !isProfileSkillProvider(value.provider) || !Number.isSafeInteger(value.descriptorSeq) || value.descriptorSeq < 0
    || ['childId', 'parentSessionId', 'workspace', 'profileName'].some(field => typeof value[field] !== 'string' || !value[field] || value[field].length > 4096)
    || value.profileName.length > 200 || value.childId.length > 512 || value.parentSessionId.length > 512
    || ['personaSha256', 'headerSha256', 'descriptorSha256', 'baseSha256', 'derivedSha256', 'bindingSha256']
      .some(field => !/^[a-f0-9]{64}$/.test(value[field]))
    || !Array.isArray(value.skills) || !value.skills.length || value.skills.length > MAX_SKILLS
    || Buffer.byteLength(canonical(value)) > MAX_BYTES)
    throw Error('The restricted profile has no complete bounded skill admission.');
  const { bindingSha256, ...body } = value;
  if (sha(body) !== bindingSha256) throw Error('The restricted profile skill admission hash disagrees.');
  const names = new Set();
  for (const selected of value.skills) {
    if (!selected || Object.keys(selected).sort().join(',') !== 'definition,lexicalPath,rawBytes,rawSha256,rootPath'
      || !isDeepStrictEqual(cleanDefinition(selected.definition), selected.definition)
      || names.has(selected.definition.name) || !/^[a-f0-9]{64}$/.test(selected.rawSha256)
      || !Number.isSafeInteger(selected.rawBytes) || selected.rawBytes < 0 || selected.rawBytes > 100000
      || !isAbsolute(selected.lexicalPath) || !isAbsolute(selected.rootPath))
      throw Error('The admitted local skill identity or source proof is inconsistent.');
    names.add(selected.definition.name);
  }
  return value;
}

/** Install once in the root after the plan created guard, so prepend runs first.
 * The static derived preset must be registered by the host's declaration,
 * rather than restored through a second activation loop or secret YAML log.
 */
export function installZCodeProfileSkills(ctx) {
  const reservations = new Map(), tickets = new WeakMap(), ports = new Map(), pending = new Set(), disposers = [], registrationStores = new Set();
  const shutdown = new AbortController();
  let closed = false, closing;
  const track = work => {
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {}); return work;
  };
  const checkOpen = signal => { signal?.throwIfAborted(); shutdown.signal.throwIfAborted(); if (closed) throw Error('Profile skills are closing.'); };
  const owner = (agent, signal, requireZCode = true) => {
    checkOpen(signal);
    const current = agent && ctx.get('agents')?.get(agent.id);
    if (!key(agent) || key(current) !== key(agent) || native(current?.session) !== native(agent.session)
      || native(ctx.get('sessions')?.get(agent.id)) !== native(agent.session)
      || requireZCode && ctx.get('omaa').product(agent.session)?.id !== 'zcode') throw Error('The exact native profile skill owner changed.');
  };
  function selectedPreset(agent) {
    const composed = ctx.get('agentPresets')?.composedPreset(agent.ctx);
    const projected = ctx.get('sessionProjections')?.stateOf(native(agent.session), 'agentPreset') ?? agent.session.header.agentPreset ?? undefined;
    if (composed !== projected) throw Error('The actual native preset composition and durable selection disagree.');
    return composed;
  }
  function routingClaim(agent) {
    const value = ctx.get('sessionProjections')?.stateOf(native(agent.session), PROFILE_SKILL_ROUTING_KEY);
    if (typeof value !== 'boolean') throw Error('The native complete-cut profile skill routing projection is unavailable.');
    return value;
  }
  function boundView(agent, port, generation, signal) {
    owner(agent, signal);
    if (selectedPreset(agent) !== PROFILE_SKILL_PRESET || !generation || ports.get(port) !== generation
      || scopeParentOf(key(agent)) !== generation || native(ctx.get('agentPresets').serviceFor(agent, 'skills')) !== port)
      throw Error('The restricted child changed its exact selected owned skill composition.');
  }
  async function declarations(signal, parent, expected, action) {
    checkOpen(signal);
    const presets = ctx.get('agentPresets');
    if (!presets?.acquireScope || !presets.readDocument || !presets.serviceFor) throw Error('Public retained preset declarations are unavailable.');
    const leases = [], scopes = [];
    let primary;
    try {
      const base = await presets.acquireScope('omaa-zcode'); leases.push(base); checkOpen(signal);
      const derived = await presets.acquireScope(PROFILE_SKILL_PRESET); leases.push(derived); checkOpen(signal);
      const validParent = () => {
        if (parent) {
          owner(parent, signal);
          if (selectedPreset(parent) !== 'omaa-zcode' || scopeParentOf(key(parent)) !== base.key)
            throw Error('Restricted local skills require the current exact native omaa-zcode parent generation.');
        }
      };
      validParent();
      const baseDoc = await presets.readDocument('omaa-zcode'), derivedDoc = await presets.readDocument(PROFILE_SKILL_PRESET);
      checkOpen(signal); validParent();
      if (baseDoc.agentPreset !== 'omaa-zcode' || derivedDoc.agentPreset !== PROFILE_SKILL_PRESET
        || typeof baseDoc.content !== 'string' || typeof derivedDoc.content !== 'string'
        || Buffer.byteLength(baseDoc.content) > MAX_DECLARATION || Buffer.byteLength(derivedDoc.content) > MAX_DECLARATION)
        throw Error('A complete bounded base and derived preset declaration is required.');
      const basePlugins = load(baseDoc.content, { schema: entryListSchema }), derivedPlugins = load(derivedDoc.content, { schema: entryListSchema });
      if (!isDeepStrictEqual(profileSkillPresetPlugins(basePlugins), derivedPlugins))
        throw Error('The restricted preset is not the exact owned skill-isolation recipe of this base declaration.');
      const identity = { baseSha256: sha(baseDoc.content), derivedSha256: sha(derivedDoc.content) };
      if (expected && (expected.baseSha256 !== identity.baseSha256 || expected.derivedSha256 !== identity.derivedSha256))
        throw Error('The restricted profile preset declaration changed; no current/global catalog fallback was used.');
      const verify = async () => {
        checkOpen(signal); validParent();
        for (const [id, lease] of [['omaa-zcode', base], [PROFILE_SKILL_PRESET, derived]]) {
          const current = await presets.acquireScope(id);
          try { if (current.key !== lease.key) throw Error('The retained preset generation changed during the restricted skill operation.'); }
          finally { await current[Symbol.asyncDispose](); }
          checkOpen(signal); validParent();
        }
        const currentBase = await presets.readDocument('omaa-zcode'), currentDerived = await presets.readDocument(PROFILE_SKILL_PRESET);
        if (sha(currentBase.content) !== identity.baseSha256 || sha(currentDerived.content) !== identity.derivedSha256)
          throw Error('The preset declaration changed during the restricted skill operation.');
        checkOpen(signal); validParent();
      };
      await verify();
      // A cold catalog owns a temporary routed scope for the complete callback;
      // it borrows the exact leased composition without activating an Agent.
      const scope = createScope(ctx, {}, { parent: derived.key }); scopes.push(scope);
      const port = native(presets.serviceFor({ ctx: scope.ctx }, 'skills'));
      if (!port || ports.get(port) !== derived.key) throw Error('The derived preset has no current owned complete skill view.');
      const result = await action({ ...identity, base, derived, port, verify });
      await verify();
      return result;
    } catch (error) { primary = error; throw error; }
    finally {
      const failures = [];
      for (const scope of scopes.reverse()) try { await scope.dispose(); } catch (error) { failures.push(error); }
      for (const lease of leases.reverse()) try { await lease[Symbol.asyncDispose](); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError([...(primary ? [primary] : []), ...failures], 'Restricted skill scope cleanup failed.', { cause: primary });
    }
  }
  async function localSource(agent, definition, signal, expected) {
    owner(agent, signal);
    const fs = agent.ctx.get('fs');
    if (!fs) throw Error('The native authorized skill filesystem is unavailable.');
    const workspace = agent.session.header.cwd;
    const [scope, source] = definition.source.split('-');
    let lexicalRoot;
    if (scope === 'user') {
      const mapped = fs.processPathFromHostPath?.(join(homedir(), '.' + source, 'skills'));
      if (typeof mapped !== 'string' || !isAbsolute(mapped)) throw Error('The selected user skill root has no explicit native host-path mapping.');
      lexicalRoot = normalize(mapped);
    } else {
      const base = await fs.resolve(workspace, { signal }); owner(agent, signal);
      const file = await fs.resolve(definition.path, { signal }); owner(agent, signal);
      if (!fs.contains(base, file)) throw Error('A selected project skill escaped the immutable workspace.');
      const marker = sep + join('.' + source, 'skills');
      const at = definition.path.lastIndexOf(marker + sep);
      if (at < 0) throw Error('The selected local skill has no matching actual project root.');
      lexicalRoot = definition.path.slice(0, at + marker.length);
    }
    const root = await fs.resolve(lexicalRoot, { signal }); owner(agent, signal);
    if (fs.processPath(root) !== lexicalRoot || expected && expected.rootPath !== lexicalRoot)
      throw Error('The selected skill root changed its canonical identity.');
    const lexicalPath = join(definition.resourceBase.path, 'SKILL.md');
    if (expected && expected.lexicalPath !== lexicalPath) throw Error('The selected skill source path changed.');
    const target = await fs.resolve(lexicalPath, { signal }); owner(agent, signal);
    if (!fs.contains(root, target) || fs.processPath(target) !== definition.path)
      throw Error('The selected skill source escaped or changed its canonical identity.');
    const directory = await fs.resolve(definition.resourceBase.path, { signal }); owner(agent, signal);
    if (!fs.contains(root, directory) || fs.processPath(directory) !== definition.resourceBase.path)
      throw Error('The selected skill resource directory changed.');
    const before = await fs.stat(target, signal); owner(agent, signal);
    if (!before || before.type !== 'file' || typeof before.version !== 'string' || !Number.isSafeInteger(before.size)
      || before.size < 0 || before.size > 100000) throw Error('Selected skill input is not a bounded versioned regular file.');
    const bytes = await fs.readBytes(target, signal, Math.max(1, before.size)); owner(agent, signal);
    const after = await fs.stat(target, signal); owner(agent, signal);
    const current = await fs.resolve(lexicalPath, { signal }); owner(agent, signal);
    const currentRoot = await fs.resolve(lexicalRoot, { signal }); owner(agent, signal);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== before.size || after?.version !== before.version
      || after?.type !== 'file' || after.size !== before.size || fs.processPath(current) !== definition.path
      || !fs.contains(currentRoot, current) || fs.processPath(currentRoot) !== lexicalRoot)
      throw Error('The selected skill changed during its native bounded read.');
    const rawSha256 = bytesSha(bytes);
    if (expected && (expected.rawSha256 !== rawSha256 || expected.rawBytes !== bytes.byteLength))
      throw Error('The admitted skill source changed; its frozen body was not silently replaced.');
    const parsed = parseProjectSkill(new TextDecoder('utf-8', { fatal: true }).decode(bytes), lexicalPath);
    if (!parsed) throw Error('The selected native filesystem skill no longer parses.');
    const reproduced = cleanDefinition({ ...parsed, content: expandProjectSkillDirectory(parsed.content, definition.resourceBase.path),
      path: definition.path, resourceBase: definition.resourceBase, source: definition.source, provider: LOCAL_PROVIDER });
    if (!isDeepStrictEqual(reproduced, definition)) throw Error('The selected native definition is not reproduced by its exact local source.');
    return { definition, lexicalPath, rootPath: lexicalRoot, rawSha256, rawBytes: bytes.byteLength };
  }
  function inspectObservation(observation) {
    if (!Array.isArray(observation.events) || observation.events.length > PROFILE_SKILL_SOURCE_EVENTS
      || !Number.isSafeInteger(observation.inheritedEventCount) || observation.inheritedEventCount < 0
      || observation.inheritedEventCount > observation.events.length
      || observation.cursor !== observation.events.length - 1
      || observation.events.some((event, index) => event.seq !== index)) throw Error('The restricted skill transcript has no bounded complete source cut.');
    const own = observation.events.slice(observation.inheritedEventCount);
    const descriptors = own.filter(event => event.type === 'subagent/descriptor');
    if (descriptors.length !== 1 || !isProfileSkillProvider(descriptors[0].data?.provider)
      || descriptors[0].data.mode !== 'continuable' || typeof actorPersona(own) !== 'string')
      throw Error('The restricted child has no unique own native profile descriptor.');
    return { own, descriptor: descriptors[0], persona: actorPersona(own) };
  }
  function admitted(observation) {
    const proof = inspectObservation(observation), descriptor = proof.descriptor.data;
    const records = proof.own.flatMap(event => {
      const record = pluginRecordOf(event);
      return record?.type === PROFILE_SKILL_ADMISSION ? [{ value: record.data, event }] : [];
    });
    if (records.length !== 1) throw Error('The restricted child has no unique durable skill admission.');
    const row = checkedBinding(records[0].value), header = observation.header;
    const preset = observation.projections?.values.agentPreset ?? header.agentPreset;
    if (header.id !== row.childId || header.origin !== 'subagent' || header.parentSession !== row.parentSessionId
      || header.cwd !== row.workspace || sha(header) !== row.headerSha256 || preset !== PROFILE_SKILL_PRESET
      || descriptor.provider !== row.provider || sha(proof.persona) !== row.personaSha256
      || descriptor.label !== 'ZCode Profile · ' + row.profileName.slice(0, 160)
      || sha(descriptor) !== row.descriptorSha256 || row.descriptorSeq !== proof.descriptor.seq
      || records[0].event.seq <= proof.descriptor.seq
      || proof.own.findLast(event => event.seq < records[0].event.seq && event.type === 'agent-preset/selected')?.data?.agentPreset !== PROFILE_SKILL_PRESET
      || proof.own.some(event => event.seq < records[0].event.seq && ['turn/start', 'request/header'].includes(event.type)))
      throw Error('The restricted skill admission does not authenticate this exact child before its first work.');
    return row;
  }
  async function readAgent(agent, signal, allowOrdinary = false) {
    owner(agent, signal, !allowOrdinary);
    if (agent.session.seq > PROFILE_SKILL_SOURCE_EVENTS) throw Error('Restricted skill verification exceeds its event bound.');
    const observation = await ctx.get('sessionQuery').observeSession(agent.id, { signal });
    try {
      owner(agent, signal, !allowOrdinary);
      if (observation.source !== 'live' || native(observation.header) !== native(agent.session).header
        || observation.cursor !== agent.session.seq - 1 || observation.events.length !== agent.session.seq)
        throw Error('The restricted skill lookup lost its exact live Session cut.');
      // A durable routing claim survives blank-session preset reselection,
      // including a switch to another product. It can never become an
      // ordinary/global lookup just because its current preset changed.
      if (allowOrdinary && !claimsProfileSkills(observation)) return undefined;
      owner(agent, signal);
      return admitted(observation);
    } finally { observation[Symbol.dispose](); }
  }
  const service = {
    openRegistrations() {
      const work = (async () => {
        checkOpen();
        if (registrationStores.size >= MAX_PENDING) throw Error('Profile skill registrations exceed the native 128-retained-view bound.');
        const privateCtx = ctx.isolate('skills');
        const fiber = privateCtx.plugin(SkillRegistry);
        let closingStore;
        const store = { registry: undefined,
          close() {
            return closingStore ??= Promise.resolve().then(() => fiber.dispose()).then(() => { registrationStores.delete(store); });
          } };
        registrationStores.add(store);
        try {
          await fiber.await(); checkOpen();
          store.registry = privateCtx.get('skills');
          if (!store.registry?.register || !store.registry.registerProvider) throw Error('The native isolated registration registry did not initialize.');
          return store;
        } catch (error) {
          try { await store.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native skill registration initialization and cleanup failed.', { cause: error }); }
          throw error;
        }
      })();
      return track(work);
    },
    attachPort(port, generation) {
      checkOpen();
      if (!generation || ports.has(port)) throw Error('The owned skill view has no unique native preset generation.');
      ports.set(port, generation);
      return () => { if (ports.get(port) === generation) ports.delete(port); };
    },
    prepare(exec, profile, callerSignal, { check = () => {} } = {}) {
      const work = (async () => {
        const signal = AbortSignal.any([callerSignal, shutdown.signal]), parent = exec.agent;
        owner(parent, signal); check();
        if (profile.skills === undefined || Array.isArray(profile.skills) && profile.skills.length === 0) return undefined;
        if (!Array.isArray(profile.skills) || profile.skills.length > MAX_SKILLS || profile.skills.some(name => !validName(name))
          || new Set(profile.skills).size !== profile.skills.length)
          throw Error('Restricted profiles require at most 128 distinct exact native local skill names; qualified/plugin identities are not guessed.');
        if (typeof profile.name !== 'string' || !profile.name || profile.name.length > 200)
          throw Error('The restricted profile has no bounded exact profile name.');
        if (!ctx.get('omaaZcodeSkillCatalogBoundary')?.assertAvailable)
          throw Error('The owned session skill catalog boundary is unavailable.');
        ctx.get('omaaZcodeSkillCatalogBoundary').assertAvailable();
        return declarations(signal, parent, undefined, async declaration => {
          const registry = ctx.get('agentPresets').serviceFor(parent, 'skills') ?? parent.ctx.get('skills');
          if (!registry?.snapshot || !registry.get) throw Error('The exact parent native skill registry is unavailable.');
          const cwd = await ctx.get('workingDirectory').ensure(parent, signal); owner(parent, signal); check();
          const options = { scope: parent, cwd, signal }, snapshot = await registry.snapshot(options);
          owner(parent, signal); check();
          if (!snapshot || snapshot.complete !== true || !Array.isArray(snapshot.skills) || snapshot.skills.length > 2048)
            throw Error('The parent has no complete bounded native skill observation.');
          const skills = [];
          let rawBytes = 0;
          for (const name of profile.skills) {
            const matches = snapshot.skills.filter(skill => skill.name === name);
            if (matches.length !== 1) throw Error('The requested profile skill has no unique exact native winner: ' + name);
            const definition = cleanDefinition(await registry.get(name, options)); owner(parent, signal); check();
            if (!isDeepStrictEqual(summary(definition), matches[0]))
              throw Error('The selected native skill changed between catalog and body admission.');
            if (definition.name !== name) throw Error('The native skill loader changed the requested identity.');
            // Reserve actual complete input bytes before further selected reads.
            // This is a native bounded admission, not the original full catalog.
            const selected = await localSource(parent, definition, signal);
            rawBytes += Math.max(1, selected.rawBytes);
            if (rawBytes > MAX_BYTES || Buffer.byteLength(canonical([...skills, selected])) > MAX_BYTES - 8192)
              throw Error('The selected local skill snapshot exceeds its native 256KiB admission; it was not truncated.');
            skills.push(selected); owner(parent, signal); check();
          }
          await declaration.verify(); owner(parent, signal); check();
          const ticket = Object.freeze({ restricted: true });
          tickets.set(ticket, { parent, parentKey: key(parent), session: native(parent.session), profileName: profile.name,
            workspace: parent.session.header.cwd, baseSha256: declaration.baseSha256, derivedSha256: declaration.derivedSha256,
            skills: structuredClone(skills), used: false });
          return ticket;
        });
      })();
      return track(work);
    },
    reserve(exec, { ticket, childId, provider, persona }, callerSignal, check = () => {}) {
      const work = (async () => {
        const entry = tickets.get(ticket), parent = exec.agent, signal = AbortSignal.any([callerSignal, shutdown.signal]);
        owner(parent, signal); check();
        if (!entry || entry.used || entry.parentKey !== key(parent) || native(parent.session) !== entry.session
          || typeof childId !== 'string' || !childId || childId.length > 512
          || !isProfileSkillProvider(provider) || typeof persona !== 'string' || reservations.has(childId)
          || reservations.size >= MAX_PENDING)
          throw Error('The restricted profile launch has no unique owned prepared skill ticket.');
        entry.used = true;
        await declarations(signal, parent, entry, async declaration => {
          for (const selected of entry.skills) {
            await localSource(parent, selected.definition, signal, selected); owner(parent, signal); check();
          }
          await declaration.verify(); owner(parent, signal); check();
          if (parent.session.header.cwd !== entry.workspace) throw Error('The restricted profile launch workspace changed.');
        });
        // No awaits follow insertion: any declaration/lease cleanup failure
        // leaves no unreachable reservation or shutdown wait behind.
        owner(parent, signal); check();
        if (reservations.has(childId) || reservations.size >= MAX_PENDING) throw Error('The profile skill reservation slot changed.');
        const done = Promise.withResolvers();
        const reservation = { ...entry, provider, personaSha256: sha(persona), signal, check,
          entered: false, done: done.promise };
        reservations.set(childId, reservation);
        // Cancellation cannot remove the guard for an actual late creation.
        // The launcher releases only after native startup has settled.
        return () => { if (reservations.get(childId) === reservation) reservations.delete(childId); done.resolve(); };
      })();
      return track(work);
    },
    ensureChild(agent, callerSignal) {
      const work = (async () => {
        owner(agent, callerSignal, false);
        if (!routingClaim(agent)) return false;
        const signal = AbortSignal.any([callerSignal, shutdown.signal]);
        const row = await readAgent(agent, signal, true);
        if (!row) return false;
        let selected;
        await declarations(signal, undefined, row, async declaration => {
          selected = declaration;
          boundView(agent, declaration.port, declaration.derived.key, signal);
        });
        boundView(agent, selected.port, selected.derived.key, signal);
        return true;
      })();
      return track(work);
    },
    readView(port, options, requestedName) {
      const work = (async () => {
        const agent = options.scope, signal = AbortSignal.any([shutdown.signal, ...(options.signal ? [options.signal] : [])]);
        owner(agent, signal);
        if (!ports.has(port) || selectedPreset(agent) !== PROFILE_SKILL_PRESET
          || native(ctx.get('agentPresets').serviceFor(agent, 'skills')) !== port)
          throw Error('A restricted skill read needs the exact real native child scope and owned view.');
        const row = await readAgent(agent, signal);
        const generation = ports.get(port);
        const result = await declarations(signal, undefined, row, async declaration => {
          if (declaration.port !== port) throw Error('The restricted skill read changed its owned view.');
          boundView(agent, port, declaration.derived.key, signal);
          if (requestedName !== false) {
            const selected = row.skills.find(item => item.definition.name === requestedName);
            if (!selected) return undefined;
            await localSource(agent, selected.definition, signal, selected); boundView(agent, port, declaration.derived.key, signal);
            return structuredClone(selected.definition);
          }
          return { skills: row.skills.map(item => summary(item.definition)), complete: true };
        });
        boundView(agent, port, generation, signal);
        return result;
      })();
      return track(work);
    },
    listCatalog({ observation, liveAgent, signal: callerSignal }) {
      const work = (async () => {
        const signal = AbortSignal.any([shutdown.signal, callerSignal]); checkOpen(signal);
        const row = admitted(observation);
        if (liveAgent) owner(liveAgent, signal);
        return declarations(signal, undefined, row, async declaration => {
          if (liveAgent && (native(liveAgent.session).header !== native(observation.header)
            || scopeParentOf(key(liveAgent)) !== declaration.derived.key
            || native(ctx.get('agentPresets').serviceFor(liveAgent, 'skills')) !== declaration.port))
            throw Error('The live catalog lost its exact restricted child composition.');
          return { skills: row.skills.filter(item => item.definition.invocation.userInvocable).map(({ definition }) => ({
            name: definition.name, path: definition.path, description: definition.description,
            ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
            modelInvocable: definition.invocation.modelInvocable,
          })) };
        });
      })();
      return track(work);
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(Error('Profile skill admission was disposed.'));
      closing = (async () => {
        while (reservations.size) await Promise.allSettled([...reservations.values()].map(value => value.done));
        while (pending.size) await Promise.allSettled([...pending]);
        const failures = [];
        for (const store of [...registrationStores]) try { await store.close(); } catch (error) { failures.push(error); }
        for (const dispose of disposers.splice(0).reverse()) try { await dispose(); } catch (error) { failures.push(error); }
        ports.clear();
        if (failures.length) throw new AggregateError(failures, 'Profile skill admission disposal failed.');
      })();
      return closing;
    },
  };
  async function created({ agent, source, signal: callerSignal }) {
    const signal = AbortSignal.any([shutdown.signal, ...(callerSignal ? [callerSignal] : [])]);
    checkOpen(signal);
    const reserved = reservations.get(agent.id);
    if (!reserved && !routingClaim(agent)) return;
    if (agent.session.seq > PROFILE_SKILL_SOURCE_EVENTS) throw Error('Restricted profile creation exceeds its source bound.');
    const observation = await ctx.get('sessionQuery').observeSession(agent.id, { signal });
    let proof;
    try {
      owner(agent, signal, false);
      if (observation.source !== 'live' || native(observation.header) !== native(agent.session).header
        || observation.cursor !== agent.session.seq - 1 || observation.events.length !== agent.session.seq)
        throw Error('Restricted profile creation lost its exact live source cut.');
      // Identify ordinary children without granting authority to a marker.
      if (!reserved && !claimsProfileSkills(observation)) return;
      owner(agent, signal);
      if (['resume', 'clear', 'compact'].includes(source)) {
        const row = admitted(observation);
        await declarations(signal, undefined, row, async declaration => {
          owner(agent, signal);
          if (scopeParentOf(key(agent)) !== declaration.derived.key
            || native(ctx.get('agentPresets').serviceFor(agent, 'skills')) !== declaration.port)
            throw Error('Cold profile skills have no exact current owned composition; no fallback was used.');
        });
        return;
      }
      proof = inspectObservation(observation);
    } finally { observation[Symbol.dispose](); }
    if (source !== 'startup' || !reserved || reserved.entered) throw Error('A fresh restricted child needs its unique live launch reservation.');
    reserved.entered = true;
    const descriptor = proof.descriptor.data;
    const validate = () => {
      owner(agent, signal); owner(reserved.parent, reserved.signal); reserved.check();
      if (reservations.get(agent.id) !== reserved || key(reserved.parent) !== reserved.parentKey
        || native(reserved.parent.session) !== reserved.session || agent.session.header.origin !== 'subagent'
        || agent.session.header.parentSession !== reserved.parent.id || agent.session.header.cwd !== reserved.workspace
        || descriptor.provider !== reserved.provider || sha(proof.persona) !== reserved.personaSha256
        || descriptor.label !== 'ZCode Profile · ' + reserved.profileName.slice(0, 160)
        || !ctx.get('agents').isOwnedBy(agent.id, reserved.parent)) throw Error('The restricted child does not match its exact live launch reservation.');
    };
    validate();
    if (proof.own.some(event => ['turn/start', 'request/header', PROFILE_SKILL_ADMISSION].includes(event.type)))
      throw Error('Restricted child work or admission already exists before the skill startup gate.');
    await declarations(signal, reserved.parent, reserved, async declaration => {
      validate();
      // rc.2 can select the composition before child publication. Switching
      // inside agent/created leaves already-captured old-preset listeners in
      // the creation dispatch and can duplicate per-agent tool installers.
      if (selectedPreset(agent) !== PROFILE_SKILL_PRESET || scopeParentOf(key(agent)) !== declaration.derived.key
        || native(ctx.get('agentPresets').serviceFor(agent, 'skills')) !== declaration.port)
        throw Error('The restricted child did not select its exact owned skill composition.');
      const body = { version: 1, childId: agent.id, parentSessionId: reserved.parent.id, workspace: reserved.workspace,
        provider: descriptor.provider, profileName: reserved.profileName, personaSha256: reserved.personaSha256,
        headerSha256: sha(native(agent.session).header), descriptorSha256: sha(descriptor), descriptorSeq: proof.descriptor.seq,
        basePreset: 'omaa-zcode', baseSha256: reserved.baseSha256, derivedSha256: reserved.derivedSha256,
        skills: structuredClone(reserved.skills) };
      const row = checkedBinding({ ...body, bindingSha256: sha(body) });
      validate(); appendPluginRecord(native(agent.session), PROFILE_SKILL_ADMISSION, row); validate();
      if (await ctx.get('sessions').flush(native(agent.session)) !== true)
        throw Error('The restricted profile skill admission has no durable flush acknowledgement.');
      validate(); await declaration.verify();
    });
  }
  try {
    const projections = ctx.get('sessionProjections');
    if (!projections?.register) throw Error('The native skill routing projection registry is unavailable.');
    disposers.push(projections.register(routingProjection));
    // Register this prepend listener AFTER the plan gate so it runs first.
    disposers.push(ctx.on('agent/created', info => track(created(info)), { global: true, prepend: true }));
    disposers.push(ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      // Check every native child before inner skill middleware. A selected
      // restricted descriptor cannot escape by switching products while blank.
      if (routingClaim(agent)) await service.ensureChild(agent, signal);
      return next();
    }, { global: true, prepend: true }));
    disposers.push(ctx.provide(SERVICE, service));
    ctx.effect(function* () {
      for (const dispose of disposers) yield dispose;
      return () => service.close();
    });
  } catch (error) { void service.close().catch(() => {}); throw error; }
  return service;
}
