import { loadProjectAgentProfiles } from './agent-profiles.mjs';
import { actorPersona, startActivation } from '../../host/subagents.mjs';
import { randomUUID } from 'node:crypto';
import { PROFILE_INSTRUCTIONS_PROVIDER_PREFIX } from './profile-instructions.mjs';
import { prepareZCodeProfileMemory } from './profile-memory.mjs';
import { PROFILE_PLAN_SNAPSHOT_PREFIX, PROFILE_PLAN_NO_AGENTS_PREFIX } from './profile-permissions.mjs';
import { PROFILE_SKILL_PROVIDERS, PROFILE_SKILL_PRESET } from './profile-skill-policy.mjs';

const PROVIDER_PREFIX = 'omaa-zcode-profile-', LABEL = 'ZCode Profile · ';
const PROFILE_PERMISSION_GUIDANCE = 'permissionMode:default inherits native parent authority; permissionMode:plan commits native logged plan mode and durable admission before first work. Plan guidance does not replace the native sandbox or approvals. Missing initialization proof on resume is refused; later native user mode changes are preserved. Nonempty skills admits at most 128 exact local native names after source, owner and declaration checks. Its cold catalog, model tool and user slash reads use the same frozen allowlist; source drift is refused. Qualified/plugin/official aliases are not inferred. Omitted skills or [] retains the ordinary profile path. mcpServers selects existing owned native MCP servers (omission inherits the owned catalog; an empty list denies MCP); tools accepts exact native public names or mcp/server wildcard selectors. Startup declarations and schemas are frozen for cold continuation; children never own the connection. Explicit model/thoughtLevel selects an advertised native route, retained in the native descriptor on restart. ';
const NO_AGENTS_PROVIDER_PREFIX = PROVIDER_PREFIX + 'no-agents-';
const aliases = { Read: 'read', Write: 'write', Edit: 'edit', Glob: 'glob', Grep: 'grep', Bash: 'bash',
  WebSearch: 'web_search', WebFetch: 'web_fetch', Skill: 'skill', TodoWrite: 'todo_write', TodoRead: 'todo_read',
  RespondToCoordinator: 'respond_to_coordinator', EnterPlanMode: 'enter_plan_mode', ExitPlanMode: 'exit_plan_mode', Agent: 'subagent', Task: 'subagent' };
const forbidden = ['enter_plan_mode', 'exit_plan_mode', 'subagent', 'zcode_agent'];
const unknown = cause => Object.assign(Error('Native profile delegation acceptance or settlement is unknown. Do not automatically retry; inspect the native child catalog and conversation. Cause: ' + String(cause?.message ?? cause).slice(0, 512),
  { cause }), { code: 'uncertain_effect' });
function renderProfileOutput(value) {
  const { output, ...metadata } = value;
  return [{ type: 'text', text: JSON.stringify(metadata) }, ...(output ?? [])];
}

function toolFilter(ctx, agent, profile, mcpSnapshot) {
  const visible = new Set(ctx.tools.schemas(agent).map(tool => tool.name));
  const map = (name, denying = false) => {
    const mapped = aliases[name] ?? (mcpSnapshot?.tools.some(tool => tool.name === name) ? name : undefined);
    if (!mapped || !visible.has(mapped)) throw Error('Profile tool ' + JSON.stringify(name) + ' has no exact visible native mapping.');
    if (!denying && ['subagent', 'zcode_agent'].includes(mapped)) throw Error('The fixed original child runtime disables its SubagentPort, so its explicit Agent/Task rule does not provide working recursive delegation. This adapter does not enable a separate nested extension.');
    return mapped;
  };
  // The original appends its coordinator control tool after profile-local
  // filtering; only the parent's global disallowlist can remove it. Preserve
  // that path only when the exact native parent scope authorizes the tool.
  const coordinator = 'respond_to_coordinator', coordinatorVisible = visible.has(coordinator);
  const expand = names => names.flatMap(name => {
    if (!mcpSnapshot || !(name === 'mcp' || name === 'mcp__*' || /^mcp__[A-Za-z0-9_-]+__\*$/.test(name))) return [name];
    const server = name === 'mcp' || name === 'mcp__*' ? undefined : name.slice(5, -3);
    const matches = mcpSnapshot.tools.filter(tool => server === undefined || tool.serverName === server).map(tool => tool.name);
    if (server !== undefined && !Object.hasOwn(mcpSnapshot.statuses, server)) throw Error('Profile MCP selector is outside its selected owned servers: ' + name);
    return matches;
  });
  const profileDeny = expand(profile.disallowedTools ?? []).filter(name => name !== 'RespondToCoordinator').map(name => map(name, true));
  const deny = [...new Set([...forbidden.filter(name => visible.has(name)), ...profileDeny,
    // Native generic MCP-resource tools are separate server-wide dispatchers;
    // the original borrowed port grants tool calls, not those side channels.
    ...(mcpSnapshot ? ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].filter(name => visible.has(name)) : [])])];
  const inherited = !profile.tools?.length || profile.tools.includes('*');
  if (!inherited && profile.tools.some(name => ['subagent', 'zcode_agent'].includes(aliases[name])))
    throw Error('The fixed original child runtime has subagents.enabled:false and no injected SubagentPort; explicit Agent/Task rules are not a working recursive capability. No nested native extension was enabled.');
  // Original global disallow rules may remove the control channel. Retain
  // that restriction when this native parent scope does not expose it.
  const allow = inherited ? undefined : [...new Set([...expand([...profile.tools, ...(profile.skills?.length && !profile.disallowedTools?.includes('Skill') ? ['Skill'] : [])]).map(name => map(name)), ...(coordinatorVisible ? [coordinator] : [])])].filter(name => !deny.includes(name));
  // The native MCP client reserves mcp__ names. Server identity comes only
  // from owned descriptors, never by splitting that public name.
  const boundedAllow = mcpSnapshot ? (allow ?? [...visible]).filter(name => !deny.includes(name)
    && (!name.startsWith('mcp__') || mcpSnapshot.tools.some(tool => tool.name === name))) : allow;
  return { ...(boundedAllow === undefined ? {} : { allow: boundedAllow }), deny };
}

async function liveProfileDescriptor(ctx, agent, signal) {
  const session = agent?.session;
  if (!agent || !session || session.header.origin !== 'subagent' || ctx.get('omaa').product(session)?.id !== 'zcode') return;
  const preset = ctx.get('omaa').product(session)?.preset;
  const check = () => {
    signal?.throwIfAborted();
    if (ctx.get('agents')?.get(agent.id) !== agent || ctx.get('sessions')?.get(agent.id) !== session
      || ctx.get('omaa').product(session)?.id !== 'zcode' || ctx.get('omaa').product(session)?.preset !== preset)
      throw Error('The native profile child changed during prompt preparation.');
  };
  check();
  const query = ctx.get('sessionQuery');
  if (!query?.observeSession) throw Error('Native profile descriptor observation is unavailable.');
  const observation = await query.observeSession(agent.id, { signal, projectionMode: 'none' });
  try {
    check();
    if (observation.source !== 'live' || observation.header !== session.header) throw Error('Profile prompt preparation requires this exact live Session observation.');
    const own = observation.events.slice(observation.inheritedEventCount);
    const nativeDescriptor = own.find(event => event.type === 'subagent/descriptor')?.data;
    const descriptor = nativeDescriptor && { ...nativeDescriptor, persona: actorPersona(own) };
    if (typeof descriptor?.provider !== 'string' || !descriptor.provider.startsWith(PROVIDER_PREFIX)) return;
    if (descriptor.mode !== 'continuable' || !descriptor.label?.startsWith(LABEL) || typeof descriptor.persona !== 'string')
      throw Error('The durable native profile descriptor is incomplete.');
    return { descriptor, check };
  } finally { observation[Symbol.dispose](); }
}

// Install once in the OMAA root scope, not in a launcher's lifetime. Native
// coldResume reconstructs from the durable descriptor without dispatching its
// old provider. This hook performs no authority change: it only preserves the
// descriptor's literal persona when that old child next assembles a prompt.
// No systemPrompt service is required here; the global assembly event carries
// the real live Agent and its own cancellation signal.
export function installLiteralZCodeProfilePersona(ctx) {
  return ctx.effect(() => {
    ctx.on('system-prompt/assemble', async (_initial, context, next) => {
      const assembly = await next(), profile = await liveProfileDescriptor(ctx, context.agent, context.signal);
      if (!profile) return assembly;
      const { descriptor, check } = profile;
      let replaced = false;
      const sections = assembly.sections.map(section => {
        if (section.name !== 'deployment:persona-prefix') return section;
        replaced = true; return { ...section, text: descriptor.persona, interpolate: false };
      });
      if (!replaced) throw Error('The native profile literal persona section is unavailable.');
      check(); return { ...assembly, sections };
    }, { global: true });
    ctx.on('agent/pre-step', async ({ agent, signal, step }, next) => {
      // Prepend makes this wrapper outermost relative to the fixed native
      // instruction plugin's ordinary listener. Its after-next filter runs
      // after native compose() and before the loop commits step messages.
      const decision = await next(), profile = await liveProfileDescriptor(ctx, agent, signal);
      if (!profile) return decision;
      if (profile.descriptor.provider.startsWith(PROFILE_INSTRUCTIONS_PROVIDER_PREFIX)) {
        const snapshots = ctx.get('omaaZcodeProfileInstructions');
        if (!snapshots?.applyChild) throw Error('Native profile instruction snapshot storage is unavailable; child rediscovery is forbidden.');
        return snapshots.applyChild(agent, profile.descriptor, decision, { signal, step, check: profile.check });
      }
      if (!profile.descriptor.provider.startsWith(NO_AGENTS_PROVIDER_PREFIX)) return decision;
      const isInstruction = message => message.source?.kind === 'agent-instructions';
      profile.check();
      for (const message of [...agent.inbox.nextStep].filter(isInstruction)) {
        profile.check(); agent.inbox.remove(message.id); profile.check();
      }
      // A rejected/no-step proposal can retain pending native instructions;
      // clear those too, without manufacturing entry or changing old history.
      if (decision.kind === 'reject') return decision;
      profile.check();
      return { ...decision, messages: decision.messages.filter(message => !isInstruction(message)) };
    }, { global: true, prepend: true });
  });
}

// A distinct durable provider identity authenticates literal profile sections
// after cold activation. The native spawn backend retains all lifecycle,
// authorization, tool restriction, descendant and delivery responsibilities.
export function installZCodeProfileDelegation(ctx) {
  return ctx.effect(() => {
    const spawn = ctx.subagents.getProvider('spawn');
    if (!spawn?.prepareContinuable || typeof ctx.subagents.startActivation !== 'function'
      || !ctx.get('sessionQuery')?.observeSession)
      throw Error('Native profile delegation requires an available continuable spawn provider, literal assembly observation and tool restrictions.');
    const shutdown = new AbortController();
    const instanceId = randomUUID(), providerName = PROVIDER_PREFIX + instanceId;
    const noAgentsProviderName = NO_AGENTS_PROVIDER_PREFIX + instanceId;
    const snapshotProviderName = PROFILE_INSTRUCTIONS_PROVIDER_PREFIX + instanceId;
    const planSnapshotProviderName = PROFILE_PLAN_SNAPSHOT_PREFIX + instanceId;
    const planNoAgentsProviderName = PROFILE_PLAN_NO_AGENTS_PREFIX + instanceId;
    // The shipped spawn backend is a class: its preparation method lives on
    // the prototype and is absent from object spread. Delegate explicitly,
    // preserving the backend receiver and the manager-owned local lifecycle.
    const provider = { name: providerName, capabilities: spawn.capabilities,
      inheritsParentContext: spawn.inheritsParentContext,
      ...(spawn.agentRouteDefaults === undefined ? {} : { agentRouteDefaults: spawn.agentRouteDefaults }),
      prepareContinuable(request) { return spawn.prepareContinuable(request); } };
    const unregister = ctx.subagents.registerProvider(provider);
    const noAgentsProvider = { ...provider, name: noAgentsProviderName };
    const unregisterNoAgents = ctx.subagents.registerProvider(noAgentsProvider);
    const snapshotProvider = { ...provider, name: snapshotProviderName };
    const unregisterSnapshot = ctx.subagents.registerProvider(snapshotProvider);
    const planSnapshotProvider = { ...provider, name: planSnapshotProviderName };
    const planNoAgentsProvider = { ...provider, name: planNoAgentsProviderName };
    const unregisterPlanSnapshot = ctx.subagents.registerProvider(planSnapshotProvider);
    const unregisterPlanNoAgents = ctx.subagents.registerProvider(planNoAgentsProvider);
    const skillProviderNames = PROFILE_SKILL_PROVIDERS.map(prefix => prefix + instanceId);
    const skillProviders = skillProviderNames.map(name => ({ ...provider, name }));
    const unregisterSkills = skillProviders.map(value => ctx.subagents.registerProvider(value));
    const mcpProviders = [snapshotProviderName, noAgentsProviderName, planSnapshotProviderName, planNoAgentsProviderName, ...skillProviderNames]
      .map(name => ({ ...provider, name: name.replace(instanceId, 'mcp-' + instanceId) }));
    const unregisterMcp = mcpProviders.map(value => ctx.subagents.registerProvider(value));
    const registrations = [unregister, unregisterNoAgents, unregisterSnapshot, unregisterPlanSnapshot, unregisterPlanNoAgents, ...unregisterSkills, ...unregisterMcp];
    const calls = new Set(), activations = new Set(), disposals = new WeakMap();
    let closing = false;
    const disposeActivation = activation => {
      let work = disposals.get(activation);
      if (!work) {
        work = Promise.resolve().then(() => activation.dispose()).then(() => { activations.delete(activation); });
        disposals.set(activation, work);
      }
      return work;
    };
    registrations.push(ctx.on('session/event', (session, event) => {
      if (!['sandbox/mode', 'plan/mode', 'approval/policy', 'permission/preset', 'agent-preset/selected'].includes(event.type)) return;
      for (const call of calls) if (!call.published && call.session === session)
        call.control.abort(Error('Profile delegation standing permissions or working mode changed before publication.'));
    }, { global: true }));
    registrations.push(ctx.on('omaa/preferences-updated', session => {
      for (const call of calls) if (!call.published && call.session === session)
        call.control.abort(Error('Profile delegation preferences changed before publication.'));
    }, { global: true }));
    registrations.push(ctx.on('agent/disposed', ({ agent }) => {
      for (const call of calls) if (!call.published && call.agent === agent) call.control.abort(Error('Profile delegation owner was disposed before publication.'));
    }, { global: true }));
    const receipts = new Map();
    async function foregroundResult(activation, receipt, exec, session, preset) {
      // Publication captures native authority. Only caller/lifecycle
      // cancellation owns this wait; later mode/preferences events do not
      // invent a second dynamic revocation contract for accepted work.
      const signal = AbortSignal.any([exec.signal, shutdown.signal]);
      const cancelled = Promise.withResolvers();
      void cancelled.promise.catch(() => {});
      const abort = () => cancelled.reject(signal.reason ?? Error('Foreground profile delegation was cancelled.'));
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        const result = await Promise.race([activation.result, cancelled.promise]);
        if (!result || typeof result.stopReason !== 'string' || !result.stopReason || !Array.isArray(result.output))
          throw unknown(Error('Native profile activation returned an unsupported terminal result.'));
        // A known terminal fact survives output bounds, cleanup failure and
        // late tool cancellation; none permits retrying the completed task.
        const terminal = { ...receipt, status: result.stopReason === 'completed' ? 'completed' : 'stopped', stopReason: result.stopReason };
        receipts.set(exec.token, terminal);
        // The public tool renderer accepts native ContentBlock[]. Attachment
        // refs are immutable content-addressed data, not session-owned bytes:
        // pass the exact native refs through, without inventing a copy, path,
        // upload or JSON-text substitute for an image/file presentation.
        if (result.output.some(block => !['text', 'image', 'file'].includes(block?.type)
          || block.type === 'text' && typeof block.text !== 'string'
          || block.type !== 'text' && (!block.attachment || typeof block.attachment !== 'object'))) {
          receipts.set(exec.token, { ...terminal, outputOmitted: 'Native output contains unsupported blocks; inspect the child conversation.' });
          throw Object.assign(Error('Native profile work has ended with unsupported result blocks. Inspect the child conversation and do not retry.'), { code: 'result_delivery_failed' });
        }
        const value = { ...terminal, output: structuredClone(result.output),
          ...(typeof result.diagnostic === 'string' ? { diagnostic: result.diagnostic } : {}) };
        if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 100_000) {
          receipts.set(exec.token, { ...terminal, outputOmitted: 'Native result exceeds the 100000-byte response bound; inspect the child conversation.' });
          throw Object.assign(Error('Native profile work has ended, but its output exceeds the response bound. Inspect its child conversation; do not retry.'), { code: 'result_delivery_failed' });
        }
        receipts.set(exec.token, value);
        await disposeActivation(activation);
        signal.throwIfAborted();
        if (ctx.get('agents')?.get(exec.agent.id) !== exec.agent || ctx.get('sessions')?.get(exec.agent.id) !== session
          || ctx.get('omaa').product(session)?.preset !== preset) throw Error('The profile caller changed before its known terminal result could be returned. Do not retry.');
        if (result.stopReason !== 'completed') throw Object.assign(Error('Native profile work ended with stop reason ' + result.stopReason + '; its output may be partial. Do not automatically retry.'), { code: 'subagent_task_failed' });
        return value;
      } catch (error) {
        const known = receipts.get(exec.token);
        receipts.set(exec.token, { ...known, ...(signal.aborted ? { cancellation: 'requested' } : {}),
          ...(known?.stopReason === undefined ? { settlement: 'unknown' } : {}) });
        try {
          await disposeActivation(activation);
          receipts.set(exec.token, { ...receipts.get(exec.token), cleanup: 'disposed' });
        } catch (cleanup) {
          receipts.set(exec.token, { ...receipts.get(exec.token), cleanup: 'unknown' });
          const cause = new AggregateError([error, cleanup], 'Foreground native profile cleanup failed.');
          throw known?.stopReason === undefined ? unknown(cause) : Object.assign(Error('Native profile work has a known terminal result, but cleanup or result delivery failed. Inspect the child conversation; do not retry.', { cause }), { code: 'uncertain_effect' });
        }
        throw known?.stopReason === undefined ? unknown(error) : error;
      } finally { signal.removeEventListener('abort', abort); }
    }
    registrations.push(ctx.tools.register({
      name: 'zcode_agent',
      description: PROFILE_PERMISSION_GUIDANCE + 'Run a named Agent profile from this main session’s explicitly selected existing profile directory, if configured, then the immutable workspace .zcode/agents directory with project overrides. No automatic global/plugin roots or inferred built-ins; children do not inherit the selected directory. Profile memory requires the separate explicit Agent-memory configuration; otherwise it is disabled without prompt or tool enhancement. Discovery reports its configured effectiveEnabled state, with filesystem and index validation at launch. Enabled memory is frozen into the literal launch persona before instruction reservation and remains subject to parent tool authority and profile deny rules. injectAgentsMd:false blocks new native AGENTS instruction-content injection, without disabling filesystem discovery or rewriting old history; true or omission freezes the actual first native LOOP request instruction text of this proven parent Agent lifetime and suppresses newly rediscovered instruction content; raw original file metadata is not reconstructed and native filesystem discovery still runs. Missing capture or durable proof is refused. Each snapshot admits 64 KiB text/128 KiB full JSON and storage retains at most 512 bindings; overflow is refused without truncation. Explicit nested Agent/Task rules are refused: the fixed original child runtime disables its SubagentPort, and no separate nested extension is enabled. Omit profile and prompt to list supported profiles and diagnostics. Foreground is the default: wait for the native terminal result and return text and durable image/file references within a 100000-byte result bound. Native services own attachment presentation and byte loading. run_in_background:true or profile background:true instead returns native acceptance immediately and delivers the eventual result through the native parent channel. Acceptance is not completion or parent consumption. Default mode only. Never automatically retry unknown acceptance or failed result delivery.',
      parameters: { type: 'object', properties: { profile: { type: 'string', minLength: 1, maxLength: 200 },
        prompt: { type: 'string', minLength: 1, maxLength: 20_000 }, run_in_background: { type: 'boolean' } }, additionalProperties: false },
      output: { schema: { type: 'object' }, render: (_args, value) => renderProfileOutput(value) },
      // Fixed native ToolDefinition: omitted timeoutMs means no deadline.
      // Zero is invalid; do not manufacture a long timeout to imitate none.
      finalizeContent(exec, result) {
        const receipt = receipts.get(exec.token); receipts.delete(exec.token);
        return receipt && result.isError ? [...result.content, { type: 'text', text: 'Native profile delegation receipt. Do not automatically retry. Acceptance is not completion or parent consumption.' },
          ...renderProfileOutput(receipt)] : undefined;
      },
      async execute(args, exec) {
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !['profile', 'prompt', 'run_in_background'].includes(key))
          || (args.profile === undefined) !== (args.prompt === undefined)
          || args.run_in_background !== undefined && (typeof args.run_in_background !== 'boolean' || args.profile === undefined)
          || args.profile !== undefined && (typeof args.profile !== 'string' || !args.profile.length || args.profile.length > 200
            || typeof args.prompt !== 'string' || !args.prompt.length || args.prompt.length > 20_000)) throw Error('Supply both a profile name and bounded prompt, or neither to list profiles.');
        const agent = exec.agent, session = agent?.session, preset = ctx.get('omaa').product(session)?.preset;
        const control = new AbortController(), done = Promise.withResolvers();
        const call = { agent, session, control, done: done.promise };
        const signal = AbortSignal.any([exec.signal, shutdown.signal, control.signal]);
        calls.add(call);
        try {
        const check = () => {
          signal.throwIfAborted();
          if (closing || !agent || ctx.get('agents')?.get(agent.id) !== agent || ctx.get('sessions')?.get(agent.id) !== session
            || ctx.get('omaa').product(session)?.id !== 'zcode' || ctx.get('omaa').product(session)?.preset !== preset
            || ctx.get('omaa').modeFor(session, agent) !== 'default' || ctx.subagents.getProvider(providerName) !== provider
            || ctx.subagents.getProvider(noAgentsProviderName) !== noAgentsProvider
            || ctx.subagents.getProvider(snapshotProviderName) !== snapshotProvider
            || ctx.subagents.getProvider(planSnapshotProviderName) !== planSnapshotProvider
            || ctx.subagents.getProvider(planNoAgentsProviderName) !== planNoAgentsProvider
            || mcpProviders.some(value => ctx.subagents.getProvider(value.name) !== value)
            || skillProviders.some(value => ctx.subagents.getProvider(value.name) !== value)
            || ctx.subagents.getProvider('spawn') !== spawn)
            throw Error('Profile delegation requires the exact live ZCode owner in default mode and its original native provider.');
        };
        check();
        const loaded = await loadProjectAgentProfiles(ctx, agent, signal, { check }); check();
        if (args.profile === undefined) {
          const memory = ctx.get('omaa').preferences(session).agentMemory;
          const memoryEnabled = Boolean(memory && session.header.origin !== 'subagent' && memory.workspacePath === session.header.cwd);
          const result = { scope: loaded.scope, profiles: loaded.profiles.map(profile => ({ name: profile.name, description: profile.description, source: profile.source,
            effectiveEnabled: Boolean(profile.memory && memoryEnabled),
            ...(profile.memory === undefined ? {} : { memoryScope: profile.memory, memoryValidation: memoryEnabled ? 'at-launch' : 'disabled' }),
            ...(profile.background === undefined ? {} : { background: profile.background }),
            ...(profile.permissionMode === undefined ? {} : { permissionMode: profile.permissionMode }),
            ...(profile.injectAgentsMd === undefined ? {} : { injectAgentsMd: profile.injectAgentsMd }),
            ...(profile.skills === undefined ? {} : { skills: [...profile.skills], skillValidation: profile.skills.length ? 'at-launch-native-local-provenance' : 'unrestricted' }),
            ...(profile.mcpServers === undefined ? {} : { mcpServers: [...profile.mcpServers], mcpValidation: 'at-launch-owned-native-snapshot' }),
            ...(profile.color === undefined ? {} : { color: profile.color }), ...(profile.modelSelection === undefined ? {} : { modelSelection: profile.modelSelection }) })), diagnostics: loaded.diagnostics };
          if (Buffer.byteLength(JSON.stringify(result)) > 100_000) throw Error('Profile discovery exceeds the 100000-byte response bound.');
          return result;
        }
        const selectedProfile = loaded.profiles.find(item => item.name === args.profile);
        if (!selectedProfile) throw Error('No supported project profile has this exact name. List profiles to inspect diagnostics.');
        const memory = await prepareZCodeProfileMemory(ctx, agent, selectedProfile, signal, { check }); check();
        const profile = memory.profile;
        const skills = ctx.get('omaaZcodeProfileSkills');
        const skillTicket = profile.skills?.length ? await (async () => {
          if (!skills?.prepare || !skills.reserve) throw Error('The owned cold/live profile skill boundary is unavailable.');
          const ticket = await skills.prepare(exec, profile, signal, { check }); check();
          if (!ticket) throw Error('The explicit nonempty profile skill allowlist has no owned admission ticket.');
          return ticket;
        })() : undefined;
        const memoryReceipt = { effectiveEnabled: memory.enabled,
          ...(profile.memory === undefined ? {} : { memoryScope: profile.memory }) };
        const background = args.run_in_background === true || profile.background === true;
        let selectedProviderName = skillTicket ? skillProviderNames[profile.permissionMode === 'plan'
          ? profile.injectAgentsMd === false ? 3 : 2 : profile.injectAgentsMd === false ? 1 : 0] : profile.permissionMode === 'plan'
          ? profile.injectAgentsMd === false ? planNoAgentsProviderName : planSnapshotProviderName
          : profile.injectAgentsMd === false ? noAgentsProviderName : snapshotProviderName;
        if (!background && typeof ctx.subagents.startActivation !== 'function')
          throw Error('Foreground profiles require native caller-delivery activations; the legacy continuation fallback cannot prove exclusive result delivery.');
        const mcp = ctx.get('omaaZcodeProfileMcp');
        const mcpTicket = await (async () => {
          if (!mcp?.prepare || !mcp.reserve) throw Error('The profile MCP admission boundary is unavailable.');
          const ticket = await mcp.prepare(agent, profile.mcpServers, signal); check(); return ticket;
        })();
        if (mcpTicket) selectedProviderName = selectedProviderName.replace(instanceId, 'mcp-' + instanceId);
        const filter = toolFilter(ctx, agent, profile, mcpTicket?.snapshot), selection = profile.modelSelection;
        let agentOptions;
        if (selection) {
          const llm = ctx.get('llm');
          if (!spawn.capabilities.agentOptions || !llm?.resolveModelInfo || !llm.resolveCallConfig || !llm.listModels) throw Error('Native exact child model metadata or route preflight is unavailable.');
          const catalog = await llm.listModels(selection.providerId); check();
          if (!catalog.some(model => model.provider === selection.providerId && model.id === selection.modelId))
            throw Error('The profile model is not advertised by its exact native provider. No parent-model fallback was used.');
          const metadata = await llm.resolveModelInfo(selection.providerId, selection.modelId, signal); check();
          if (metadata?.provider !== selection.providerId || metadata.id !== selection.modelId) throw Error('Native exact model metadata changed route identity.');
          const effort = selection.options?.reasoningLevel;
          if (effort !== undefined && !metadata.reasoning?.efforts.some(value => value.id === effort)) throw Error('The profile reasoning level is not advertised by its exact native model.');
          agentOptions = { provider: selection.providerId, model: selection.modelId, ...(effort === undefined ? {} : { reasoningEffort: effort }) };
          await llm.resolveCallConfig(agentOptions, signal); check();
        }
        const maxDepth = ctx.subagents.resolveMaxDepth();
        if (maxDepth !== undefined && !spawn.capabilities.depthLimit) throw Error('The native profile provider cannot enforce the current delegation depth.');
        check();
        // Reserve the public native identity before publication. Literal
        // assembly is authenticated by the root hook's durable descriptor,
        // including after a later cold resume or process restart.
        const childId = randomUUID();
        let releasePlan, releaseSkills, releaseMcp, activation;
        try {
          if (mcpTicket) releaseMcp = mcp.reserve(exec, { ticket: mcpTicket, filter, childId, provider: selectedProviderName, persona: profile.systemPrompt }, signal, check);
          if (skillTicket) {
            releaseSkills = await skills.reserve(exec, { ticket: skillTicket, childId, provider: selectedProviderName, persona: profile.systemPrompt }, signal, check);
            check();
          }
          if (profile.injectAgentsMd !== false) {
            const snapshots = ctx.get('omaaZcodeProfileInstructions');
            if (!snapshots?.reserve) throw Error('A verified native parent instruction snapshot service is required for default/true injectAgentsMd.');
            await snapshots.reserve(exec, { childId, provider: selectedProviderName, profileName: profile.name, persona: profile.systemPrompt }, signal, check);
            check();
          }
          if (profile.permissionMode === 'plan') {
            const permissions = ctx.get('omaaZcodeProfilePermissions');
            if (!permissions?.reserve) throw Error('A native profile plan-admission service is required before startup.');
            releasePlan = permissions.reserve(exec, { childId, provider: selectedProviderName, persona: profile.systemPrompt }, signal, check);
          }
          receipts.set(exec.token, { status: 'unknown', profile: profile.name, reservedChildId: childId, ...memoryReceipt });
          try {
            activation = await startActivation(ctx, { provider: selectedProviderName, childId, label: LABEL + profile.name.slice(0, 160), delivery: background ? 'parent' : 'caller', signal,
              request: { parent: agent, cwd: session.header.cwd, prompt: [{ type: 'text', text: args.prompt }],
                ...(skillTicket ? { agentPreset: PROFILE_SKILL_PRESET } : {}),
                persona: profile.systemPrompt, toolFilter: filter, ...(agentOptions === undefined ? {} : { agentOptions }),
                ...(maxDepth === undefined ? {} : { maxDepth }) } });
          } catch (error) { throw unknown(error); }
        } finally { releasePlan?.(); releaseSkills?.(); releaseMcp?.(); }
        // Track the exact returned execution before validating its receipt or
        // checking cancellation. Shutdown cannot lose an accepted late return.
        if (activation && typeof activation.dispose === 'function') activations.add(activation);
        if (activation?.childId !== childId || typeof activation.messageId !== 'string' || !activation.messageId)
          throw unknown(Error('Native profile activation returned no complete acceptance identity.'));
        const receipt = { status: 'accepted', kind: 'activation', subagentId: activation.childId, messageId: activation.messageId, profile: profile.name, background, ...memoryReceipt };
        receipts.set(exec.token, receipt);
        // Parent delivery and teardown remain manager-owned. Observe rejection
        // without converting an already accepted task into a fabricated result.
        // Keep the handle even after result settlement: the native contract
        // preserves a captured result when teardown fails, while dispose()
        // reports that failure. A successful result is not a cleanup receipt.
        void activation.result.catch(error => {
          try { ctx.logger?.warn('Native profile activation settlement failed for ' + activation.childId + ': ' + String(error).slice(0, 512)); }
          catch { /* Diagnostic sinks cannot create a second unhandled rejection. */ }
        });
        try { check(); }
        catch (error) {
          // Publication can race cancellation or owner invalidation. Stop this
          // exact activation, retain its real identity, and never claim that it
          // was not accepted. Disposal does not substitute a terminal result.
          receipts.set(exec.token, { ...receipt, cancellation: 'requested' });
          try { await disposeActivation(activation); receipts.set(exec.token, { ...receipt, cancellation: 'disposed' }); }
          catch (cleanup) {
            receipts.set(exec.token, { ...receipt, cancellation: 'unknown' });
            throw unknown(new AggregateError([error, cleanup], 'Accepted profile activation cleanup failed.'));
          }
          throw error;
        }
        call.published = true;
        return background ? receipt : await foregroundResult(activation, receipt, exec, session, preset);
        } finally { calls.delete(call); done.resolve(); }
      },
    }));
    // One grouped effect owns this ordering. Top-level Cordis scope disposal
    // starts effects concurrently; reverse registration alone cannot await a
    // drain before removing the provider. Explicitly attempt every disposer,
    // including when an activation fails cleanup, then aggregate all failures.
    return async () => {
      closing = true;
      shutdown.abort(Error('The profile delegation scope was disposed.'));
      while (calls.size) await Promise.allSettled([...calls].map(call => call.done));
      const errors = [];
      for (const activation of [...activations]) {
        try { await disposeActivation(activation); } catch (error) { errors.push(error); }
      }
      for (const dispose of registrations.splice(0).reverse()) {
        try { await dispose(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Native profile activations and registrations could not all be disposed.');
    };
  });
}
