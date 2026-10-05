import { readFileSync } from 'node:fs'

const original = readFileSync(new URL('./sources/cursor-agent-sample.md', import.meta.url), 'utf8')

export const product = Object.freeze({
  id: 'cursor',
  name: 'Cursor',
  source: 'asgeirtj/system_prompts_leaks',
  sourceCommit: '38499c52b4c3f290e40843cb9514df84d9d23d4c',
  promptSource: 'Cursor/cursor.md',
  officialPrompt: false,
})

function replaceExact(text, before, after) {
  if (!text.includes(before)) throw new Error(`Cursor source changed: ${before.slice(0, 70)}`)
  return text.replace(before, after)
}

function replaceBlock(text, tag, body) {
  const opening = `\`<${tag}>\``
  const closing = `\`</${tag}>\``
  const start = text.indexOf(opening)
  const end = text.indexOf(closing, start)
  if (start < 0 || end < 0) throw new Error(`Cursor source block changed: ${tag}`)
  return text.slice(0, start) + (body ? `${opening}\n\n${body}\n\n${closing}` : '') + text.slice(end + closing.length)
}

export function buildPrompt({ tools = new Set(), cwd, platform, mode = 'default' } = {}) {
  const has = name => tools.has(name)
  const shell = platform === 'win32' && has('pwsh') ? 'pwsh' : has('bash') ? 'bash' : has('pwsh') ? 'pwsh' : undefined
  let prompt = replaceExact(original,
    'You are an AI coding assistant, powered by {model_name}.',
    'You are an AI coding assistant, powered by the model selected for this session.')
  prompt = replaceExact(prompt, 'You operate in Cursor.', 'You use the Cursor coding-agent preset in the shared workspace.')
  prompt = replaceExact(prompt,
    'You are a coding agent in the Cursor IDE that helps the USER with software engineering tasks.',
    'You are a coding agent that helps the USER with software engineering tasks.')
  prompt = replaceExact(prompt,
    'Each time the USER sends a message, we may automatically attach information about their current state, such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, linter errors, and more. This information is provided in case it is helpful to the task.',
    'Each time the USER sends a message, the host may attach workspace information or files. This information is provided in case it is helpful to the task. Use only the state actually provided, and inspect the relevant files when more context is needed.')
  prompt = replaceExact(prompt,
    "Your main goal is to follow the USER's instructions, which are denoted by the `<user_query>` tag.",
    "Your main goal is to follow the USER's instructions in their messages.")
  prompt = replaceExact(prompt,
    'Never use tools like Shell or code comments as means to communicate with the user during the session.',
    'Never use shell operations or code comments as means to communicate with the user during the session.')
  prompt = replaceBlock(prompt, 'system-communication',
    '- The host may attach additional context to user messages. Use it when relevant to the task; avoid narrating internal context labels.\n- Users may reference context like files and folders. Resolve these references against the supplied workspace and attachments.\n- You should continue working regardless of a timestamp included in context.')
  const fileTools = ['read', 'write', 'edit', 'glob', 'grep'].filter(has)
  prompt = replaceExact(prompt,
    '2. Use specialized tools instead of terminal commands when possible, as this provides a better user experience. For file operations, use dedicated tools: don\'t use cat/head/tail to read files, don\'t use sed/awk to edit files, don\'t use cat with heredoc or echo redirection to create files. Reserve terminal commands exclusively for actual system commands and terminal operations that require shell execution. NEVER use echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.',
    `2. Use specialized tools instead of terminal commands when possible, as this provides a better user experience. ${fileTools.length ? `For file operations, use the available dedicated tools (${fileTools.map(name => `\`${name}\``).join(', ')}); use shell operations only for capabilities they do not provide.` : 'Use the actual available tools for file operations; when only shell execution is available, use it carefully to inspect and modify files.'} NEVER use echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.`)
  prompt = replaceExact(prompt,
    '1. You MUST use the Read tool at least once before editing.',
    has('read') ? '1. You MUST use the `read` tool at least once before editing existing code.' : '1. You MUST inspect the relevant existing code with an available tool before editing.')
  const citingStart = prompt.indexOf('## METHOD 2: MARKDOWN CODE BLOCKS')
  const citingEnd = prompt.indexOf('## Critical Formatting Rules for Both Methods', citingStart)
  if (citingStart < 0 || citingEnd < 0) throw new Error('Cursor citation source changed')
  const markdownExamples = prompt.slice(citingStart, citingEnd).replace('## METHOD 2: MARKDOWN CODE BLOCKS', '## MARKDOWN CODE BLOCKS')
  prompt = replaceBlock(prompt, 'citing_code',
    'When citing existing code, use a Markdown link to the actual file and its verified line number, using the host’s supported file-link format. Do not invent line numbers. If showing code is useful, use a standard fenced block with the language tag.\n\n'
    + markdownExamples.trim()
    + '\n\nNever include line numbers in code content. Never indent triple backticks. Always add a newline before code fences. Show actual code when citing a code block; you may truncate long sections with a clear comment.')
  prompt = replaceBlock(prompt, 'terminal_files_information', has('job_list') || has('job_output')
    ? `${has('job_list') ? 'Use `job_list` to check your running and finished background jobs before starting a dev server or other long-running command that should not be duplicated. ' : ''}${has('job_output') ? 'Use `job_output` to inspect output and status using the actual job id returned by the tool that started the work. A timed-out wait leaves the job running; use the actual waiting parameters from the current schema.' : ''}`
    : '')
  prompt = replaceBlock(prompt, 'task_management', has('todo_write')
    ? 'You have access to the `todo_write` tool to help you manage and plan tasks. Use this tool whenever you are working on a complex task, and skip it if the task is simple or would only require 1-2 steps. Follow the actual task item and status schema.\n\nIMPORTANT: Make sure you do not end your turn before you have checked the task list against the actual completed work. Keep blocked, cancelled, and unfinished work accurate; do not mark work completed merely to close the list.'
    : '')
  prompt = replaceBlock(prompt, 'mcp_file_system',
    'Use the connected tools actually registered for this session. Check each tool’s current description and parameter schema before calling it. Do not infer resource access, authentication, or a descriptor filesystem from a tool name. Follow the user’s existing authorization and the host’s access boundaries.')
  prompt = replaceBlock(prompt, 'mode_selection',
    `The current interaction mode is ${mode === 'plan' ? 'Plan' : mode === 'ask' ? 'Ask' : 'Agent'}. ${mode === 'plan' ? 'Research the codebase, ask necessary clarifying questions, and produce a reviewable implementation plan before writing any code. Respect the host’s read-only restrictions and wait for an explicit transition to implementation.' : mode === 'ask' ? 'Explore the codebase and answer the user’s question without modifying project files or running mutating commands. Respect the host’s read-only restrictions.' : 'Complete the user’s authorized coding task using the available tools. For a large or ambiguous task with meaningful trade-offs, first research the relevant code and discuss the approach when decisive information is missing. Simple changes can proceed directly.'} Reassess when the goal changes or you are stuck; follow the host’s actual mode controls.${has('enter_plan_mode') && mode !== 'plan' ? ' When the user asks for a plan, use `enter_plan_mode` to enter the host’s actual planning state before proceeding.' : ''}${has('exit_plan_mode') && mode === 'plan' ? ' When the plan is ready, use `exit_plan_mode` according to its actual schema to request the host’s review and implementation transition; do not implement while that transition is pending.' : ''}`)
  const toolStart = prompt.indexOf('## Available Tools')
  const toolEnd = prompt.indexOf('## Git Operations', toolStart)
  if (toolStart < 0 || toolEnd < 0) throw new Error('Cursor tool source boundaries changed')
  const descriptions = []
  if (shell) descriptions.push(`### ${shell}\nExecute a given command using the current tool schema. Use it for terminal operations like git, npm, docker, etc. Prefer specialized tools for supported file operations. Check the working directory and quote paths containing spaces. Set the working directory explicitly when needed; do not assume directory or environment changes persist between calls. Check the schema before using timeout, background, or permission parameters. Independent reads can use native parallel tool calls; keep dependent commands sequential.`)
  if (has('glob')) descriptions.push('### glob\nSearch for files matching a glob pattern. Use the current schema for path and pattern fields.')
  if (has('grep')) descriptions.push('### grep\nSearch file content using the current tool’s regex and filtering capabilities. Use exact symbols or error strings when they are known.')
  if (has('read')) descriptions.push('### read\nRead a file from the local filesystem. Use the actual schema to select the path and optional range; treat line-number annotations as metadata.')
  if (has('read_image')) descriptions.push('### read_image\nInspect an image file using the tool’s supported formats and current schema when visual evidence is needed.')
  if (has('write')) descriptions.push('### write\nWrite a file to the local filesystem. Inspect existing content before replacing a file; prefer a precise edit when only part of an existing file changes.')
  if (has('edit')) descriptions.push('### edit\nPerform precise changes to an existing file. Follow the actual match and replacement schema, and inspect any ambiguous-match error before retrying.')
  if (has('todo_write')) descriptions.push('### todo_write\nCreate and manage a structured task list for complex work. Track progress using the current item and status schema.')
  if (has('web_search')) descriptions.push('### web_search\nSearch the web for current information and supporting sources. Use the actual query schema and cite the relevant source URLs.')
  if (has('web_fetch')) descriptions.push('### web_fetch\nFetch content from a specified URL. Read the actual page before relying on it as evidence.')
  if (has('ask_user_question')) descriptions.push('### ask_user_question\nAsk structured questions using the actual current schema. Ask when decisive information is missing or a preference materially improves the result. Follow the tool’s waiting behavior; do not assume it is an asynchronous interface.')
  if (has('subagent')) descriptions.push('### subagent\nLaunch an available subagent for independent, scoped work when the benefit is clear and user or project instructions allow it. Use only the actual configured role and model fields; do not assume Cursor-specific agent types. Assign file ownership for changes and tell the worker to preserve other agents’ edits.')
  if (has('job_list')) descriptions.push('### job_list\nList your background jobs with their actual ids and statuses before duplicating a long-running process.')
  if (has('job_output')) descriptions.push('### job_output\nRead output and status for the actual background job id. Check whether the job finished rather than treating a wait timeout as completion.')
  if (has('job_kill')) descriptions.push('### job_kill\nRequest cancellation of a running background job using its actual id. Inspect the returned state before claiming cancellation completed.')
  if (has('enter_plan_mode')) descriptions.push('### enter_plan_mode\nEnter the host’s actual planning state using the current schema. Mode changes take effect through the host, not through a textual claim.')
  if (has('exit_plan_mode')) descriptions.push('### exit_plan_mode\nSubmit the plan for review and the host’s implementation transition according to the current schema. Wait for the actual transition before modifying project code.')
  prompt = prompt.slice(0, toolStart)
    + (descriptions.length ? `## Available Tools\n\n${descriptions.join('\n\n')}\n\n` : '')
    + prompt.slice(toolEnd)
  prompt = replaceExact(prompt,
    'Always pass commit messages via HEREDOC.',
    'Pass commit messages with correct shell quoting or a file when necessary; preserve intentional newlines and avoid command substitution.')
  prompt = replaceExact(prompt,
    'Use the gh command for ALL GitHub-related tasks.',
    'Use the actual connected GitHub tools when suitable, or the available shell and configured gh CLI when needed. Follow their current schemas and the user’s authorization.')
  prompt = replaceExact(prompt,
    "When users ask to perform tasks, check if any available skills can help. Skills provide specialized capabilities and domain knowledge. To use a skill, read the skill file at the provided absolute path, then follow the instructions within. Skills are loaded dynamically based on the user's installed skill set.",
    'When the host provides a skill catalog, check if any available skills can help. Skills provide specialized capabilities and domain knowledge. To use a skill, read the skill file at the provided location with an available tool, then follow the instructions within. Use only the actual supplied skill catalog.')
  prompt = replaceExact(prompt,
    '## Agent Transcripts  \nAgent transcripts (past chats) are stored as JSONL files and can be referenced by UUID.',
    '## Agent Transcripts  \nUse past conversation context only when the host provides it or an actual history tool is available and the task calls for it. Do not infer a local transcript path or identifier from the product name.')
  if (cwd) prompt += `\nThe session working directory is ${JSON.stringify(String(cwd))}. Follow applicable AGENTS.md instructions for the files you touch.\n`
  return prompt
}

export function buildCompactionPrompt() {
  return undefined
}
