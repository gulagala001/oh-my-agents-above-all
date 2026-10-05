import { readFileSync } from 'node:fs'

const original = readFileSync(new URL('./sources/instructions_template.md', import.meta.url), 'utf8')

export const product = Object.freeze({
  id: 'codex',
  name: 'Codex',
  source: 'openai/codex',
  sourceCommit: '3d2ee51ca2d5db578f328aa75e20aa22c0197c9a',
  promptSource: 'models-manager/models.json → gpt-6-astra.model_messages.instructions_template',
})

function replaceExact(text, before, after) {
  if (!text.includes(before)) throw new Error(`Codex source changed: ${before.slice(0, 70)}`)
  return text.replace(before, after)
}

export function buildPrompt({ tools = new Set(), cwd, platform, mode = 'default' } = {}) {
  const has = name => tools.has(name)
  const shell = platform === 'win32' && has('pwsh') ? 'pwsh' : has('bash') ? 'bash' : has('pwsh') ? 'pwsh' : undefined
  let prompt = replaceExact(original,
    'You are Codex, an agent based on GPT-6.',
    'You are Codex, a coding agent using the model selected for this session.')
  prompt = replaceExact(prompt,
    'You have two channels for staying in conversation with the user:\n- You share updates in the `commentary` channel.\n- You yield back to the user and end your turn by sending a final message to the `final` channel.',
    'You share progress updates in assistant messages while working. You yield back to the user and end your turn by sending a final answer. Follow the host message format; do not write channel labels into the response.')
  prompt = prompt.replaceAll('`commentary` channel', 'progress messages').replaceAll('`final` channel', 'final answer')
  prompt = replaceExact(prompt,
    'When available, you can use the `functions.request_user_input_async` tool',
    has('ask_user_question') ? 'When available, you can use the `ask_user_question` tool' : 'You can use direct conversation')
  if (!has('ask_user_question')) {
    prompt = replaceExact(prompt,
      'because the tool only supports text input.',
      'through a text-only question interface.')
  }
  prompt = replaceExact(prompt,
    'For optional clarification, give the user reasonable opportunity to reply - for example, 60 seconds for a simple multi-choice question and longer for complex and bundled questions — before proceeding with a stated assumption.',
    'For optional clarification, use the actual question interface and continue with best judgment if it returns no answer. Ask directly when decisive information is required. Do not treat an elapsed timer as an answer.')
  prompt = replaceExact(prompt,
    '- When you search for text or files, you reach first for `rg` or `rg --files`; they are much faster than alternatives like `grep`. If `rg` is unavailable, you use the next best tool without fuss.',
    has('grep') || has('glob')
      ? `- When you search for text or files, you reach first for ${[has('grep') && '`grep` for text', has('glob') && '`glob` for paths'].filter(Boolean).join(' and ')}. If a specialized search tool is unavailable, use the next best available tool without fuss.`
      : '- When you search for text or files using the shell, you reach first for `rg` or `rg --files`; they are much faster than alternatives like `grep`. If `rg` is unavailable, use the next best available tool without fuss.')
  prompt = replaceExact(prompt,
    '- Batch independent searches and reads in one functions.exec using await Promise.allSettled([...]); inspect every result. Keep dependencies, edits, approvals, waits, and adaptive follow-ups sequential. Avoid unnecessary output.',
    '- Batch independent searches and reads using the host’s native tool-call format; inspect every result. Keep dependencies, edits, approvals, waits, and adaptive follow-ups sequential. Avoid unnecessary output.')
  prompt = replaceExact(prompt,
    '- When calling `functions.exec`, parallelize independent tool calls by awaiting Promises. Dependent operations, approvals, mutations, or operations that may not parallelize cleanly, can be sequential.',
    '- When the host permits parallel tool calls, parallelize independent reads. Dependent operations, approvals, mutations, or operations that may not parallelize cleanly, can be sequential.')
  prompt = replaceExact(prompt,
    'text for exec_command calls',
    shell ? `text for ${shell} calls` : 'text for shell calls')
  prompt = replaceExact(prompt,
    'passed to the `cmd` argument',
    'passed to the shell command argument')
  const skillsStart = prompt.indexOf('Open and read the skill according to its location:')
  const skillsEnd = prompt.indexOf('\n# Apps (Connectors)', skillsStart)
  if (skillsStart < 0 || skillsEnd < 0) throw new Error('Codex skill source boundaries changed')
  prompt = prompt.slice(0, skillsStart)
    + 'Open and read the skill according to its supplied location using an available file or resource tool. Follow referenced resources only when needed; resolve relative filesystem paths against the skill directory. Avoid re-reading skills when possible. Use only the skill catalog and resource access actually supplied in this session.\n'
    + prompt.slice(skillsEnd)
  const appsStart = prompt.indexOf('# Apps (Connectors)')
  const pluginsStart = prompt.indexOf('\n# Plugins', appsStart)
  if (appsStart < 0 || pluginsStart < 0) throw new Error('Codex app source boundaries changed')
  prompt = prompt.slice(0, appsStart)
    + '# Apps (Connectors)\n\nConnected tools can be used when the user explicitly requests them or the task clearly calls for them. Call only tools actually registered for this session and follow their current schemas and access boundaries.\n'
    + prompt.slice(pluginsStart)
  prompt = replaceExact(prompt,
    '- MCP naming: Plugin-provided MCP tools keep standard MCP identifiers such as mcp__server__tool; use tool provenance to tell which plugin they come from.',
    '- Tool naming: Use the actual registered tool name and schema; use supplied provenance to tell which plugin a tool comes from.')
  const capabilities = []
  if (has('read')) capabilities.push('- Use `read` to inspect existing text files before editing them; use its actual path and range schema.')
  if (has('read_image')) capabilities.push('- Use `read_image` to inspect available image files when visual evidence is needed.')
  if (has('edit')) capabilities.push('- Use `edit` for precise existing-file changes, following its current schema and match semantics.')
  if (has('write')) capabilities.push('- Use `write` when creating or replacing a complete file is necessary; inspect existing content before overwriting it.')
  if (shell) capabilities.push(`- Use \`${shell}\` for terminal commands. Set the working directory using the actual tool schema; do not assume directory or environment changes persist between calls. Check the current schema before supplying timeout, background, or permission parameters.`)
  if (has('job_list')) capabilities.push('- Use `job_list` to check your existing background jobs before duplicating a long-running command.')
  if (has('job_output')) capabilities.push('- Use `job_output` with the actual job id returned by the starting tool to collect background output and status. A timed-out wait leaves the job running; wait only as allowed by the current schema.')
  if (has('job_kill')) capabilities.push('- Use `job_kill` with the actual job id to request cancellation; inspect the reported state before declaring that work stopped.')
  if (has('todo_write')) capabilities.push('- Use `todo_write` to track meaningful steps and progress for complex work. Skip it for simple work; reconcile task status with actual completed work before ending the turn. Follow the tool’s actual item/status schema.')
  if (has('ask_user_question')) capabilities.push('- Use `ask_user_question` for short questions when decisive information is missing or a preference materially improves the result. Follow the current schema and waiting behavior; no asynchronous execution or timeout behavior is implied by its name.')
  if (has('web_search')) capabilities.push('- Use `web_search` to look up current or uncertain external information and cite the supporting source.')
  if (has('web_fetch')) capabilities.push('- Use `web_fetch` to read a referenced page rather than relying on a search snippet.')
  if (has('subagent')) capabilities.push('- Use `subagent` only when independent work has a clear benefit and current user or project instructions permit delegation. Give a scoped responsibility and report the evidence returned; use the current schema rather than assuming Codex agent roles.')
  if (capabilities.length) prompt += `\n# Tools and task execution\n\n${capabilities.join('\n')}\n`
  if (cwd) prompt += `\nThe session working directory is ${JSON.stringify(String(cwd))}. Follow applicable AGENTS.md instructions for the files you touch.\n`
  if (mode === 'plan' || mode === 'ask') prompt += `\nThe current mode is ${mode === 'plan' ? 'Plan' : 'Ask'}. Research and ${mode === 'plan' ? 'produce a reviewable implementation plan' : 'answer the user’s question'} without changing project files or running mutating commands. Follow the host’s actual mode restrictions.\n`
  return prompt
}

export function buildCompactionPrompt() {
  return readFileSync(new URL('./sources/compact.md', import.meta.url), 'utf8')
}
