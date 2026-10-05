import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { fileURLToPath } from 'node:url';
import { installSavedWorkflowTools } from './saved-workflows.mjs';

export const name = 'omaa-zcode-workflow';
export const inject = ['skills', 'tools', 'fs'];
export const workflowGuidance = `# Dynamic workflows
Create and run a dynamic workflow: a JavaScript script that orchestrates multiple model-driven subagents with plain control flow (loops, conditionals, fan-out) and schema-checked intermediate results. The script is syntax checked by the host runtime and runs under the selected permission mode. Start it in the background when the work can continue independently; you are notified with its final result when it settles. Runtime errors come back as diagnostics.

When to use:
- The user explicitly asks for a workflow — "use a workflow", "with a workflow", "使用 workflow", "用工作流", or any phrasing that names workflow/工作流 as the means: the workflow tool is mandatory. Do not substitute the subagent tool, do not do the work inline yourself, and do not judge the task too small for a workflow — the user chose the tool, and that choice is theirs. Size only decides how many subagents the script gets, never whether it is written.
- Without such an explicit request, do not start a workflow: delegate with subagent or do the work yourself, even for multi-step or multi-subagent tasks.

Before writing or revising a script, load the \`zcode-workflows\` skill with the skill tool: it carries the host facade, authoring rules, and result contract. A workflow call is refused until that skill has been loaded in this session.

Use the actual workflow schema: supply the plain JavaScript body in script and the name, description and phases in meta. A workflow saved in a file is read with read; submit its body through the same workflow tool. Keep reusable scripts in a user-requested project file using write or edit. To revise a running workflow, stop its actual job before submitting a revised script; preserve useful completed results and report the new run identity. Follow the user's existing authorization and the host permission mode.`;

export function workflowGuidanceFor(mode = 'off', tools = new Set()) {
  let guidance = workflowGuidance;
  if (tools.has('create_workflow')) {
    guidance = guidance.replace('Create and run a dynamic workflow: a JavaScript script that orchestrates multiple model-driven subagents with plain control flow (loops, conditionals, fan-out) and schema-checked intermediate results.',
      'Create and run a dynamic workflow with create_workflow: a TypeScript script using the ZCode Actor facade, plain control flow (loops, conditionals, fan-out) and schema-checked intermediate results. agent(name, persona?) creates an Actor; await actor.ask<T>(instructions) reuses that Actor\'s native child context and executes its tasks FIFO.');
    guidance = guidance.replace('Use the actual workflow schema: supply the plain JavaScript body in script and the name, description and phases in meta.',
      'Use the actual create_workflow schema: supply the TypeScript body in script, or use path or saved as the sole source. Put phase boundaries in phase(title). The host typechecks and lowers the script before execution. The workflow tool remains available for the native JavaScript facade described by the skill; do not mix those two agent APIs.');
  }
  if (['list_saved_workflows', 'read_saved_workflow', 'save_workflow', 'run_saved_workflow'].every(name => tools.has(name))) {
    guidance = guidance.replace('A workflow saved in a file is read with read; submit its body through the same workflow tool. Keep reusable scripts in a user-requested project file using write or edit.',
      'Check list_saved_workflows before writing a workflow from scratch. Use run_saved_workflow to run a fitting saved definition by name through its recorded facade; pass actual JSON arguments matching its declarations. Project definitions shadow global definitions unless scope is specified. Use read_saved_workflow or read to inspect a definition before revising it. Save only when the user asks or agrees: save_workflow stores the body and metadata in the selected project or global .zcode/workflows directory; choose facade="zcode" for TypeScript Actors or the default facade="native" for JavaScript, and pass script or script_path, never both.');
  }
  if (!['pro', 'ultracode'].includes(mode)) return guidance;
  return guidance.replace('- Without such an explicit request, do not start a workflow: delegate with subagent or do the work yourself, even for multi-step or multi-subagent tasks.',
    `- ${mode === 'pro' ? 'Pro' : 'Ultracode'} is enabled for this session and is the user's standing choice to use workflows for substantive work. Follow its workflow authoring reference; solo only on conversational or trivial turns. This standing choice supplies the explicit workflow authorization.`);
}

export function apply(ctx) {
  installSavedWorkflowTools(ctx);
  let provider;
  ctx.skills.registerProvider(control => (provider = new FileSystemSkillProvider(ctx, control, { providerName: 'omaa-zcode', includeDefaultRoots: false,
    customSkillDirs: [fileURLToPath(new URL('./skills/', import.meta.url))], watch: false })));
  ctx.effect(() => () => provider?.dispose(), 'ZCode workflow skill');
  ctx.tools.guard(exec => {
    if (!['workflow', 'create_workflow', 'save_workflow', 'run_saved_workflow'].includes(exec.name)) return;
    const events = exec.agent.session.snapshotEvents();
    const calls = new Set(events.filter(event => {
      if (event.type !== 'tool/call' || event.data.name !== 'skill') return false;
      try { const args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments; return args?.name === 'zcode-workflows'; } catch { return false; }
    }).map(event => event.data.callId));
    if (!events.some(event => event.type === 'tool/result' && calls.has(event.data.message?.toolCallId) && !event.data.message?.isError)) return 'Load the zcode-workflows skill before submitting a workflow script.';
  });
}
