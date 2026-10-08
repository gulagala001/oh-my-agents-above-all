import { applySharedIdentity, omdIdentityPrompt } from './host/identity.mjs';
import { buildPrompt as codex, buildCompactionPrompt as codexCompact } from './presets/codex/prompt.mjs';
import { buildPrompt as grok, buildCompactionPrompt as grokCompact } from './presets/grok/prompt.mjs';
import { buildPrompt as cursor, buildCompactionPrompt as cursorCompact } from './presets/cursor/prompt.mjs';
import { buildPrompt as pi, buildCompactionPrompt as piCompact } from './presets/pi/prompt.mjs';
import { buildPrompt as zcode, buildCompactionPrompt as zcodeCompact } from './presets/zcode/prompt.mjs';

export const name = 'omaa-preset';
export const inject = ['omaa', 'systemPrompt', 'tools'];
const builders = { codex, grok, cursor, pi, zcode };
const summaries = { codex: codexCompact, grok: grokCompact, cursor: cursorCompact, pi: piCompact, zcode: zcodeCompact };
const readOnly = new Set(['read', 'read_image', 'glob', 'grep', 'ask_user_question', 'enter_plan_mode', 'exit_plan_mode', 'web_search', 'web_fetch', 'job_list', 'job_output', 'cursor_rule', 'skill', 'read_session_context', 'scheduler_list', 'schedule_list', 'list_saved_workflows', 'read_saved_workflow']);
export function apply(ctx, config) {
  const build = builders[config.product];
  if (!build) throw new Error('Unknown OMAA product: ' + config.product);
  if (ctx.get('trisoulX') && typeof ctx.get('trisoulX').installOmaaEnhancement !== 'function') throw new Error('此 Oh My DSH 版本缺少 OMAA 兼容接口。请安装与当前 DSH 匹配的兼容 OMD，或使用没有旧 OMD 的独立 DSH profile。');
  ctx.tools.presentAs('native');
  const piDelegation = new Set(['workflow', 'subagent', 'send_message', 'interrupt_agent', 'list_agents', 'job_list', 'job_output', 'job_kill']);
  const enhancedTool = name => name === 'codegraph_index' || name.startsWith('mcp__codegraph__') || name === 'computer_use' || name === 'computer_use_reset' || config.product === 'pi' && piDelegation.has(name);
  const modeFor = agent => agent ? ctx.omaa.modeFor(agent.session, agent) : 'default';
  const activeTools = agent => {
    const names = ctx.tools.schemas(agent).map(tool => tool.name);
    const enabled = agent && ctx.omaa.enhancementEnabled(agent.session);
    return new Set(names.filter(name => enabled || !enhancedTool(name)));
  };
  ctx.systemPrompt.section({ name: 'harness:identity', order: -1000, text: '', interpolate: false });
  ctx.systemPrompt.section({ name: 'deployment:persona-prefix', order: 0, interpolate: false,
    text: ({ agent }) => {
      const child = agent?.session.header.origin === 'subagent';
      const text = build({ tools: activeTools(agent), cwd: agent?.session.header.cwd ?? process.cwd(), platform: process.platform, mode: modeFor(agent), child, workMode: agent ? ctx.omaa.enhancementWorkModeFor(agent.session, agent) : 'off', customTools: agent && config.product === 'pi' ? ctx.get('omaaPiExtensions')?.promptTools(agent) : undefined });
      return applySharedIdentity(text, config.product, omdIdentityPrompt(ctx), { child });
    } });
  ctx.tools.guard(exec => {
    if (enhancedTool(exec.name) && !ctx.omaa.enhancementEnabled(exec.agent.session)) return 'OMD enhancement is disabled for this session.';
    const mode = modeFor(exec.agent);
    if (mode !== 'default' && ['bash', 'pwsh'].includes(exec.name)) {
      if (ctx.get('shell')?.sandboxMode === undefined) return `${mode} mode requires the host read-only shell executor; use file/search tools until it is available.`;
      if (exec.arguments.sandbox_permissions !== undefined) return `${mode} mode does not allow widening shell permissions; leave this mode before changing files.`;
      return;
    }
    if (mode !== 'default' && !readOnly.has(exec.name)) return `${mode} mode permits reading, searching and questions; switch to default mode before changing files.`;
  });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next();
    if (!context.agent || context.agent.session.header.origin === 'subagent') return assembly;
    const visible = activeTools(context.agent);
    return { ...assembly, tools: assembly.tools.filter(tool => visible.has(tool.name)) };
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
