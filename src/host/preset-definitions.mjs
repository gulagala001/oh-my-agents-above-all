import { products } from '../shared/products.mjs';
import { PROFILE_SKILL_PRESET, profileSkillPresetPlugins } from '../presets/zcode/profile-skill-policy.mjs';
import { buildHost, nativeHostVersion } from './compatibility.mjs';

const nativeActivations = buildHost(nativeHostVersion()).activation === 'activation';
const row = (id, name, config, extra = {}) => ({ id, name, ...extra, ...(config ? { config } : {}) });
const planSection = 'You are in plan mode. Research the workspace and ask questions without changing project files. Use the available read-only shell for research commands; its file restrictions cannot be widened in this mode. Produce a complete implementation plan. When ready, call exit_plan_mode alone with the complete plan Markdown, starting with a # heading. Implement only after the user approves the plan or selects the default mode. Follow the current tool schemas and runtime policy.';
const composition = product => [
  row('agent-instructions', '@deepseek-ai/dsh-agent-instructions', { maxBytes: 65536 }),
  row('tool-fs', '@deepseek-ai/dsh-tool-fs'),
  row('tool-bash', '@deepseek-ai/dsh-tool-bash', { promoteOnTimeout: product.id !== 'pi' }, { disabled: process.platform === 'win32' }),
  row('tool-pwsh', '@deepseek-ai/dsh-tool-pwsh', { promoteOnTimeout: product.id !== 'pi' }, { disabled: process.platform !== 'win32' }),
  row('skill-filesystem', '@deepseek-ai/dsh-skill-filesystem'),
  row('tool-skill', '@deepseek-ai/dsh-tool-skill'),
  ...product.id === 'pi' ? [row('tool-jobs', '@deepseek-ai/dsh-tool-jobs')] : [],
  ...product.id === 'pi' ? [] : [
    row('tool-fs-search', '@deepseek-ai/dsh-tool-fs-search', { sampleOverCapGlobResults: false }),
    row('tool-todo', '@deepseek-ai/dsh-tool-todo', { allowParallelInProgress: true }),
    row('tool-jobs', '@deepseek-ai/dsh-tool-jobs'),
    row('tool-ask-user', '@deepseek-ai/dsh-tool-ask-user'),
    row('tool-web', '@deepseek-ai/dsh-tool-web', { fetch: true }),
    row('tool-present', '@deepseek-ai/dsh-tool-present'),
  ],
    row('delegation', 'cordis:group', [
      row('workflow-ptc', '@deepseek-ai/dsh-workflow-ptc'),
      row('tool-workflow', '@deepseek-ai/dsh-tool-workflow'),
      row('tool-subagent-control', '@deepseek-ai/dsh-tool-subagent-control'),
      row('tool-subagent-list-agents', '@deepseek-ai/dsh-tool-subagent-control/list-agents'),
      row('tool-subagent', '@deepseek-ai/dsh-tool-subagent', { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true,
        ...nativeActivations ? {} : { backgroundMode: 'continuable' } }),
    ], { group: true, isolate: { workflowEngine: true } }),
  ...product.id === 'pi' ? [] : [
    row('planning', 'cordis:group', [row('plan-mode', '@deepseek-ai/dsh-plan-mode', { section: planSection }), row('product-plan-tools', 'oh-my-agents-above-all/plan-tools')], { group: true, isolate: { planMode: true } }),
  ],
  ...product.id === 'pi' ? [] : [row('compaction', 'cordis:group', [
    row('compaction-basic', '@deepseek-ai/dsh-compaction-basic', { headroomTokens: 8192, maxTokens: 8192 }),
    row('command-compact', '@deepseek-ai/dsh-command-compact'),
  ], { group: true, isolate: { compaction: true } })],
  ...product.id === 'pi' ? [row('pi-extensions', 'oh-my-agents-above-all/pi-extensions'), row('pi-resources', 'oh-my-agents-above-all/pi-resources'), row('pi-steering', 'oh-my-agents-above-all/pi-steering'), row('pi-branches', 'oh-my-agents-above-all/pi-branches')] : [],
  ...product.id === 'grok' ? [row('grok-documents', 'oh-my-agents-above-all/grok-documents'), row('grok-monitor', 'oh-my-agents-above-all/grok-monitor'), row('grok-scheduler', 'oh-my-agents-above-all/grok-scheduler')] : [],
  ...product.id === 'zcode' ? [row('zcode-session-context', 'oh-my-agents-above-all/zcode-session-context'), row('zcode-workflow', 'oh-my-agents-above-all/zcode-workflow'), row('zcode-scheduler', 'oh-my-agents-above-all/zcode-scheduler'),
    row('zcode-typed-workflow', 'cordis:group', [row('ptc-runtime', '@deepseek-ai/dsh-ptc-runtime-node'), row('zcode-actor-workflow', 'oh-my-agents-above-all/zcode-typed-workflow')], { group: true, isolate: { ptcRuntime: true } })] : [],
  ...product.id === 'cursor' ? [row('cursor-rules', 'oh-my-agents-above-all/cursor-rules'), row('cursor-checkpoints', 'oh-my-agents-above-all/checkpoints')] : [],
  row('omaa-preset', 'oh-my-agents-above-all/agent', { product: product.id }),
  row('omaa-enhancement', 'oh-my-agents-above-all/enhancement'),
];
export const presetDefinitions = products.map((product, index) => ({
  id: product.preset, name: product.name + ' · OMAA', description: product.name + ' 深度预设 · DSH 模型', order: 20 + index,
  plugins: [row('working', 'cordis:group', [
    row('working-policy', 'oh-my-agents-above-all/working-policy'),
    ...product.id === 'grok' ? [row('grok-monitor-shell', 'oh-my-agents-above-all/grok-monitor-shell')] : [],
    row('working-tools', 'oh-my-agents-above-all/working-tools', composition(product), { group: true }),
  ], { group: true, isolate: { sandboxPolicy: true, ...product.id === 'grok' ? { shell: true, omaaGrokMonitorShell: true } : {}, ...product.id === 'pi' ? { omaaPiExtensions: true, omaaPiResources: true, omaaPiSteering: true } : {} } })],
}));

const zcodeDefinition = presetDefinitions.find(definition => definition.id === 'omaa-zcode');
presetDefinitions.push({ id: PROFILE_SKILL_PRESET, name: 'ZCode · 受限本地技能',
  description: '仅供已核准的 ZCode Agent profile 子会话使用。', order: 25,
  plugins: profileSkillPresetPlugins(zcodeDefinition.plugins) });
