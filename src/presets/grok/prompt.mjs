import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';

export const product = Object.freeze({
  id: 'grok', name: 'Grok Build',
  sourceCommit: '2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8',
});

const template = readFileSync(new URL('./sources/crates/codegen/xai-grok-agent/templates/prompt.md', import.meta.url), 'utf8');

// Render only the if/elif/else and variable constructs present in this fixed source.
// Fail closed on new template syntax so an upstream update cannot leak placeholders.
function renderTemplate(text, values) {
  const get = key => values[key.trim()] ?? '';
  const condition = expression => expression.split(' or ').some(group => group.split(' and ').every(term => {
    term = term.trim();
    return term.startsWith('not ') ? !get(term.slice(4)) : Boolean(get(term));
  }));
  const stack = [];
  let visible = true;
  let output = '';
  const chunks = text.split(/(\$\{%[\s\S]*?%\}|\$\{\{[\s\S]*?\}\})/g);
  for (let chunk of chunks) {
    if (chunk.startsWith('${%')) {
      const statement = chunk.slice(3, -2).replace(/^-|-$|^\s+|\s+$/g, '').trim();
      if (statement.startsWith('if ')) {
        const matches = condition(statement.slice(3));
        stack.push({ parent: visible, matched: matches });
        visible = visible && matches;
      } else if (statement.startsWith('elif ')) {
        const frame = stack.at(-1);
        if (!frame) throw new Error('Grok template elif without if');
        const matches = !frame.matched && condition(statement.slice(5));
        frame.matched ||= matches;
        visible = frame.parent && matches;
      } else if (statement === 'else') {
        const frame = stack.at(-1);
        if (!frame) throw new Error('Grok template else without if');
        visible = frame.parent && !frame.matched;
        frame.matched = true;
      } else if (statement === 'endif') {
        const frame = stack.pop();
        if (!frame) throw new Error('Grok template endif without if');
        visible = frame.parent;
      } else throw new Error(`Unsupported Grok template statement: ${statement}`);
    } else if (visible) {
      output += chunk.startsWith('${{') ? String(get(chunk.slice(3, -2))) : chunk;
    }
  }
  if (stack.length) throw new Error('Unclosed Grok template if');
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildPrompt({ tools = new Set(), cwd, platform, mode = 'default' } = {}) {
  const active = new Set(tools);
  const execute = active.has('bash') ? 'bash' : active.has('pwsh') ? 'pwsh' : '';
  const values = {
    system_prompt_label: 'Grok Build',
    is_non_interactive: false,
    memory_v2_enabled: false,
    include_browser_verification: false,
    system_reminders_enabled: false,
    scratch_dir: `${tmpdir().replace(/[\\/]$/, '')}${sep}`,
    'tools.by_kind.task': active.has('subagent') ? 'subagent' : '',
    'tools.by_kind.execute': execute,
    'tools.by_kind.monitor': active.has('monitor') ? 'monitor' : '',
  };
  let prompt = renderTemplate(template, values)
    .replace('You are Grok Build released by xAI.', 'You are Grok Build, a coding assistant operating inside DSH.')
    .replace('an interactive CLI tool', 'an interactive coding assistant')
    .replace("the user's request, denoted within the <user_query> tag", "the user's request in the current conversation")
    .replace(/\n<user_guide>[\s\S]*?<\/user_guide>/, '');
  if (execute) {
    const original = `- Run a long-lived command you own (a build, test suite, or server) as a background command in \`${execute}\`, then continue independent work.`;
    const adapted = active.has('job_output')
      ? `- Run a long-lived command you own (a build, test suite, or server) in \`${execute}\`. If the tool returns a background job, continue independent work and use \`job_output\` to collect its actual result.`
      : `- Run a long-lived command you own (a build, test suite, or server) in \`${execute}\` and wait for its actual result.`;
    prompt = prompt.replace(original, adapted);
  }
  const usage = [];
  if (active.has('read')) usage.push('Use `read` to read a file. The `file_path` parameter can be a relative path in the workspace or an absolute path. Follow the returned line numbers and continuation information.');
  if (active.has('read_image')) usage.push('Use `read_image` to examine an image visually.');
  if (active.has('edit')) {
    usage.push('Use `edit` to replace an exact string in a file.');
    if (active.has('read')) usage.push('`read` prefixes each line with a line number. That prefix is not part of the file: match only the file content, with its exact indentation.');
    usage.push('`old_string` must match exactly one place in the file. If it appears more than once, add surrounding lines to make it unique, or set `replace_all` to change every occurrence (handy for renaming an identifier).');
  }
  if (active.has('write')) usage.push('Use `write` with `file_path` and `content` to create a new file or replace its complete contents.');
  if (active.has('grep')) usage.push('Use `grep` to search file contents with regular expressions (ripgrep). Full regex syntax, so escape literal special characters: `functionCall\\(`, or `interface\\{\\}` to find interface{} in Go.');
  if (active.has('glob')) usage.push('Use `glob` to find files by name or path pattern.');
  if (active.has('todo_write')) usage.push('Use `todo_write` to create and manage a structured task list. The user sees this list live — it is your primary way to show progress.\n\nUse for any task with 3+ steps. Skip for trivial single-step work.');
  if (active.has('ask_user_question')) usage.push('Use `ask_user_question` to ask the user one or more multiple-choice questions. Put your recommended option first and append "(Recommended)" to its label.');
  if (active.has('enter_plan_mode') && active.has('exit_plan_mode')) {
    usage.push('Use `enter_plan_mode` when a task has ambiguity about the right approach or when the user asks you to write a plan. This tool enables a read-only plan mode where you explore the codebase and create an implementation plan for the user.');
    usage.push('Use `exit_plan_mode` only in plan mode. Present your complete plan in the `plan` parameter as markdown starting with a # heading. The user may approve it or keep planning; follow the actual tool result.');
  }
  if (execute) usage.push(`Each \`${execute}\` call starts a new shell. Use its actual \`description\`, \`command\`, \`timeoutMs\`, and \`workdir\` parameters. Use the tool result to determine whether the command completed or returned a background job.`);
  if (active.has('job_output')) usage.push('Use `job_output` to collect output from a background job.');
  if (active.has('job_list')) usage.push('Use `job_list` to inspect background jobs.');
  if (active.has('job_kill')) usage.push('Use `job_kill` to stop a background job you own when it is no longer needed.');
  if (usage.length) prompt += `\n\n<tool_usage>\n${usage.map(text => `- ${text}`).join('\n')}\n</tool_usage>`;
  return prompt;
}

const summaryTemplate = readFileSync(new URL('./sources/crates/common/xai-grok-compaction/src/code_compaction/templates/full_replace_summary_prompt.txt', import.meta.url), 'utf8');

export function buildCompactionPrompt() {
  return summaryTemplate
    .replace('{user_context_section}', '')
    .replace("The successor will see the user's original query plus this summary.", 'The successor will see the retained conversation plus this summary.')
    .replace('You already have the full conversation in your context window.', 'Use only the conversation supplied in this summarization request.');
}
