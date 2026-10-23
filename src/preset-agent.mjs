import { applySharedIdentity, omdIdentityPrompt } from './host/identity.mjs';
import { actorPersona } from './host/subagents.mjs';
import { currentDirectory } from './host/working-directory.mjs';
import { toolNeedsEnhancement } from './host/tool-enhancement.mjs';
import { buildPrompt as codex, buildCompactionPrompt as codexCompact } from './presets/codex/prompt.mjs';
import { buildPrompt as grok, buildCompactionPrompt as grokCompact } from './presets/grok/prompt.mjs';
import { buildPrompt as cursor, buildCompactionPrompt as cursorCompact } from './presets/cursor/prompt.mjs';
import { buildPrompt as pi, buildCompactionPrompt as piCompact } from './presets/pi/prompt.mjs';
import { buildPrompt as zcode, buildCompactionPrompt as zcodeCompact, isZCodeWorkflowActor, buildWorkflowActorPrompt } from './presets/zcode/prompt.mjs';
import { createProjectMemoryAssembler } from './presets/zcode/project-memory.mjs';
import { isCoordinatorChild, isZCodeNativeSessionToolAllowed } from './presets/zcode/native-session-tools.mjs';
import { createProjectSkillsInstaller } from './presets/zcode/project-skills.mjs';
import { PROFILE_SKILL_PRESET } from './presets/zcode/profile-skill-policy.mjs';

export const name = 'omaa-preset';
export const inject = ['omaa', 'systemPrompt', 'tools'];
const builders = { codex, grok, cursor, pi, zcode };
const summaries = { codex: codexCompact, grok: grokCompact, cursor: cursorCompact, pi: piCompact, zcode: zcodeCompact };
const readOnly = new Set(['read', 'read_image', 'glob', 'grep', 'ask_user_question', 'enter_plan_mode', 'exit_plan_mode', 'web_search', 'web_fetch', 'job_list', 'job_output', 'cursor_rule', 'skill', 'read_session_context', 'scheduler_list', 'scheduler_output', 'schedule_list', 'list_saved_workflows', 'read_saved_workflow']);
export function apply(ctx, config) {
  const build = builders[config.product];
  if (!build) throw new Error('Unknown OMAA product: ' + config.product);
  const projectMemory = config.product === 'zcode' ? createProjectMemoryAssembler(ctx) : undefined;
  const projectSkills = config.product === 'zcode' ? createProjectSkillsInstaller(ctx) : undefined;
  ctx.tools.presentAs('native');
  const needsEnhancement = (name, agent) => toolNeedsEnhancement(ctx, config.product, name, agent);
  const modeFor = agent => agent ? ctx.omaa.modeFor(agent.session, agent) : 'default';
  const actorDescriptor = agent => {
    if (config.product !== 'zcode' || agent?.session.header.origin !== 'subagent') return;
    const events = agent.session.snapshotEvents(agent.session.inheritedEventCount);
    const descriptor = events.find(event => event.type === 'subagent/descriptor')?.data;
    return descriptor && { ...descriptor, persona: actorPersona(events) };
  };
  const activeTools = agent => {
    const names = ctx.tools.schemas(agent).map(tool => tool.name);
    const enabled = agent && ctx.omaa.enhancementEnabled(agent.session);
    return new Set(names.filter(name => (enabled || !needsEnhancement(name, agent))
      && (config.product !== 'zcode' || name !== 'respond_to_coordinator' || isCoordinatorChild(ctx, agent))));
  };
  ctx.systemPrompt.section({ name: 'harness:identity', order: -1000, text: '', interpolate: false });
  ctx.systemPrompt.section({ name: 'deployment:persona-prefix', order: 0, interpolate: false,
    text: ({ agent }) => {
      const child = agent?.session.header.origin === 'subagent';
      const text = build({ tools: activeTools(agent), cwd: agent ? currentDirectory(ctx, agent.session) : process.cwd(), platform: process.platform, mode: modeFor(agent), child, workflowActor: isZCodeWorkflowActor(actorDescriptor(agent)), workSubmode: agent ? ctx.omaa.enhancementWorkSubmodeFor(agent.session, agent) : 'free', workMode: agent ? ctx.omaa.enhancementWorkModeFor(agent.session, agent) : 'off', customTools: agent && config.product === 'pi' ? ctx.get('omaaPiExtensions')?.promptTools(agent) : undefined,
        ...(agent && config.product === 'zcode' ? { outputStyle: ctx.omaa.preferences(agent.session).outputStyle } : {}) });
      return applySharedIdentity(text, config.product, omdIdentityPrompt(ctx, agent?.session), { child });
    } });
  ctx.tools.guard(exec => {
    if (needsEnhancement(exec.name, exec.agent) && !ctx.omaa.enhancementEnabled(exec.agent.session)) return 'OMD enhancement is disabled for this session.';
    const mode = modeFor(exec.agent);
    if (mode !== 'default' && ['bash', 'pwsh'].includes(exec.name)) {
      if (ctx.get('shell')?.sandboxMode === undefined) return `${mode} mode requires the host read-only shell executor; use file/search tools until it is available.`;
      if (exec.arguments.sandbox_permissions !== undefined) return `${mode} mode does not allow widening shell permissions; leave this mode before changing files.`;
      return;
    }
    const zcodeRead = config.product === 'zcode' && (['list_workflow_runs', 'get_workflow_run', 'list_models', 'cron_list', 'read_pdf'].includes(exec.name)
      || isZCodeNativeSessionToolAllowed(ctx, exec));
    const grokRead = config.product === 'grok' && ['read_document', 'read_grok_image'].includes(exec.name);
    if (mode !== 'default' && !readOnly.has(exec.name) && !zcodeRead && !grokRead) return `${mode} mode permits reading, searching and questions; switch to default mode before changing files.`;
  });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    if (projectSkills && context.agent) {
      const skills = ctx.get('omaaZcodeProfileSkills');
      if (!skills?.ensureChild && ctx.get('agentPresets')?.composedPreset(context.agent.ctx) === PROFILE_SKILL_PRESET)
        throw Error('Restricted profile skill admission is unavailable.');
      const restricted = await skills?.ensureChild(context.agent, context.signal);
      if (!restricted) await projectSkills.ensureProjectSkills(context.agent, context.signal);
    }
    const assembly = await next();
    if (!context.agent) return assembly;
    if (context.agent.session.header.origin === 'subagent' && config.product !== 'zcode') return assembly;
    const visible = activeTools(context.agent);
    const current = { ...assembly, tools: assembly.tools.filter(tool => visible.has(tool.name)),
      sections: typeof ctx.get('dshPersona')?.promptFor === 'function' ? [...assembly.sections, { name: 'dsh-persona:applied', text: '', interpolate: false }] : assembly.sections };
    const descriptor = actorDescriptor(context.agent);
    if (isZCodeWorkflowActor(descriptor) && typeof descriptor.persona === 'string') {
      // Native child composition owns the literal author persona under this
      // section name. Add the script-reader contract without changing its
      // durable descriptor or interpolating author text on cold activation.
      return { ...current, sections: current.sections.map(section => section.name === 'deployment:persona-prefix' && section.text === descriptor.persona
        ? { ...section, interpolate: false, text: buildWorkflowActorPrompt({ tools: activeTools(context.agent),
          cwd: currentDirectory(ctx, context.agent.session), platform: process.platform, mode: modeFor(context.agent), persona: descriptor.persona,
          outputStyle: ctx.omaa.preferences(context.agent.session).outputStyle }) }
        : section) };
    }
    if (context.agent.session.header.origin === 'subagent') return current;
    return projectMemory ? projectMemory(context, current) : current;
  });
  ctx.inject(['llm', 'sessions'], scope => {
    scope.on('llm/stream', async function* (options, next) {
      const session = options.sessionId && scope.sessions.get(options.sessionId);
      if (options.purpose === 'compaction' && session && ctx.omaa.product(session)?.id === config.product) {
        const instruction = summaries[config.product]?.();
        if (instruction) options.messages = [...options.messages.slice(0, -1), { role: 'user', content: [{ type: 'text', text: instruction }] }];
      }
      yield* next();
    }, { global: true });
  });
}
