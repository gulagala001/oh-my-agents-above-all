import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';

export const product = Object.freeze({
  id: 'grok', name: 'Grok Build',
  sourceCommit: '2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8',
});

const template = readFileSync(new URL('./sources/crates/codegen/xai-grok-agent/templates/prompt.md', import.meta.url), 'utf8');
const childTemplate = readFileSync(new URL('./sources/crates/codegen/xai-grok-agent/templates/subagent_prompt.md', import.meta.url), 'utf8');

// Render only the if/elif/else and variable constructs present in this fixed source.
// Fail closed on new template syntax so an upstream update cannot leak placeholders.
function renderTemplate(text, values) {
  const keyPattern = /^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/;
  const checkedKey = key => {
    key = key.trim();
    if (!keyPattern.test(key)) throw new Error(`Unsupported Grok template expression: ${key}`);
    return key;
  };
  const get = key => values[checkedKey(key)] ?? '';
  const defined = key => Object.hasOwn(values, key) || Object.keys(values).some(value => value.startsWith(key + '.'));
  const termValue = term => {
    term = term.trim();
    if (term.startsWith('not ')) return !termValue(term.slice(4));
    const equality = term.match(/^([A-Za-z_][A-Za-z_0-9.]*)\s*==\s*("(?:[^"\\]|\\.)*")$/);
    if (equality) return get(equality[1]) === JSON.parse(equality[2]);
    if (term.endsWith(' is defined')) return defined(checkedKey(term.slice(0, -11)));
    return Boolean(get(term));
  };
  const condition = expression => expression.split(' or ').map(group => group.split(' and ').map(termValue).every(Boolean)).some(Boolean);
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

export function buildPrompt({ tools = new Set(), cwd, platform, mode = 'default', child = false } = {}) {
  const active = new Set(tools);
  const execute = active.has('bash') ? 'bash' : active.has('pwsh') ? 'pwsh' : '';
  const values = {
    system_prompt_label: 'Grok Build',
    is_non_interactive: false,
    memory_v2_enabled: false,
    memory_enabled: false,
    include_browser_verification: false,
    system_reminders_enabled: false,
    scratch_dir: `${tmpdir().replace(/[\\/]$/, '')}${sep}`,
    'tools.by_kind.task': active.has('subagent') ? 'subagent' : '',
    'tools.by_kind.execute': execute,
    'tools.by_kind.monitor': active.has('monitor') ? 'monitor' : '',
    'tools.by_kind.read': active.has('read') ? 'read' : '',
    'tools.by_kind.edit': active.has('edit') ? 'edit' : '',
    'tools.by_kind.search': active.has('grep') ? 'grep' : '',
    os_name: platform ?? process.platform,
    working_directory: cwd ?? '',
  };
  let prompt = renderTemplate(child ? childTemplate : template, values)
    .replace('You are Grok Build released by xAI.', 'You are Grok Build, a coding assistant operating inside DSH.')
    .replace('an interactive CLI tool', 'an interactive coding assistant')
    .replace("the user's request, denoted within the <user_query> tag", "the user's request in the current conversation")
    .replace(/\n<user_guide>[\s\S]*?<\/user_guide>/, '');
  if (child) prompt = prompt.replace(/^Shell:[ \t]*\n/gm, '').replace(/^Current Date:[ \t]*\n/gm, '').replace(/^Workspace Path:[ \t]*\n/gm, '');
  if (execute) {
    const original = child ? `For long-running commands, use \`background: true\` in ${execute}, then continue independent work.`
      : `- Run a long-lived command you own (a build, test suite, or server) as a background command in \`${execute}\`, then continue independent work.`;
    const adapted = active.has('job_output')
      ? `- Run a long-lived command you own (a build, test suite, or server) in \`${execute}\`. If the tool returns a background job, continue independent work and use \`job_output\` to collect its actual result.`
      : `- Run a long-lived command you own (a build, test suite, or server) in \`${execute}\` and wait for its actual result.`;
    prompt = prompt.replace(original, adapted);
  }
  const usage = [];
  if (child) {
    usage.push('Complete the delegated task and follow the native subagent instructions for delivering its result. Use only the recipient identities supplied by the native host; do not guess a parent id. A background command receipt is not proof that the assigned work is complete.');
    if (active.has('subagent')) usage.push('Delegate only work within the assigned scope. Native depth, capacity and permissions decide whether another child can start; tool availability is not approval to broaden the assignment.');
  }
  if (active.has('read')) usage.push('Use `read` to read a file. The `file_path` parameter can be a relative path in the workspace or an absolute path. Follow the returned line numbers and continuation information.');
  if (active.has('read_document')) usage.push('Use `read_document` for PPTX slide text and speaker notes, or PDF pages as images. PPTX and PDF text return numbered text with a bounded UTF-8 byte cursor: follow `nextOffset` until null and pass its paired `textSha256` as `text_sha256` with every nonzero offset, keeping the file/format/pages unchanged. Complete extracted text is admitted up to 8 MiB; each page content is at most 24000 UTF-8 bytes, with JSON metadata/escaping additional. A changed text refuses continuation. PDF uses `pages` such as "1-5,8", defaulting to all only for documents of at most 10 pages; request at most 20 explicit pages, subject to native image limits and an image-capable model. For PDF text, set `format:"text"`; this requires existing pdfinfo/pdftotext through full read-only native confinement. Text admission is limited to 8 MiB and Poppler extraction can differ from the original engine. Missing tools or confinement fail explicitly; do not widen permissions or install a backend. Use `read` for ordinary text, including notebook JSON.');
  if (active.has('read_image')) usage.push('Use `read_image` to examine an image visually.');
  if (active.has('read_grok_image')) usage.push('Use `read_grok_image` for Grok conversation compression of PNG/JPEG/WebP/GIF/TIFF/BMP/ICO. GIF/TIFF/ICO use the first frame/page, with small-image PNG upscaling where bounded. The output has the Grok 768 KiB base64, 1048576 pixel and 2000-pixel side caps plus stricter native limits. BMP/ICO require existing ImageMagick and full read-only native confinement; no install or unconfined fallback. Host normalization and the alternate codec can change encoded bytes; no original image-rs fidelity is implied.');
  if (active.has('edit')) {
    usage.push('Use `edit` to replace an exact string in a file.');
    if (active.has('read')) usage.push('`read` prefixes each line with a line number. That prefix is not part of the file: match only the file content, with its exact indentation.');
    usage.push('`old_string` must match exactly one place in the file. If it appears more than once, add surrounding lines to make it unique, or set `replace_all` to change every occurrence (handy for renaming an identifier).');
  }
  if (active.has('write')) usage.push('Use `write` with `file_path` and `content` to create a new file or replace its complete contents.');
  if (active.has('grep')) usage.push('Use `grep` to search file contents with regular expressions (ripgrep). Full regex syntax, so escape literal special characters: `functionCall\\(`, or `interface\\{\\}` to find interface{} in Go.');
  if (active.has('glob')) usage.push('Use `glob` to find files by name or path pattern.');
  if (active.has('todo_write')) usage.push('Use `todo_write` to create and manage a structured task list. Every call replaces the entire current list: submit all current items, including unchanged items, with their actual `content` and `status`. The native statuses are `pending`, `in_progress`, and `completed`; mark completed only when the work is done. Do not pass original Grok todo ids, merge flags, or a cancelled status, and do not relabel cancelled work as completed. The user sees this list live — it is your primary way to show progress.\n\nUse for any task with 3+ steps. Skip for trivial single-step work.');
  if (active.has('ask_user_question')) usage.push('Use `ask_user_question` to ask the user one or more multiple-choice questions. Put your recommended option first and append "(Recommended)" to its label.');
  if (active.has('enter_plan_mode') && active.has('exit_plan_mode')) {
    usage.push('Use `enter_plan_mode` when a task has ambiguity about the right approach or when the user asks you to write a plan. This tool enables a read-only plan mode where you explore the codebase and create an implementation plan for the user.');
    usage.push('Use `exit_plan_mode` only in plan mode. Present your complete plan in the `plan` parameter as markdown starting with a # heading. The user may approve it or keep planning; follow the actual tool result.');
  }
  if (execute) usage.push(`Each \`${execute}\` call starts a new shell. Use its actual \`description\`, \`command\`, \`timeoutMs\`, and \`workdir\` parameters. Use the tool result to determine whether the command completed or returned a background job.`);
  if (active.has('subagent')) usage.push('Use `subagent` to start an independently managed native child and keep its returned child agent id. Follow its current schema and native result-delivery instructions. Its child agent id is distinct from background job ids; use registered native child controls and result delivery.');
  if (active.has('send_message')) usage.push('Use `send_message` with the actual native `agent_id` to steer a direct continuable child or deliver a result to your direct parent, as permitted by the host. Follow its registered schema and the supplied recipient identities.');
  if (active.has('interrupt_agent')) usage.push('Use `interrupt_agent` for the actual child agent id when its current work should stop. It requests an interruption and returns without waiting; it is not proof of completed cancellation. Descendants can remain running.');
  if (active.has('list_agents')) usage.push('Use `list_agents` to inspect native child status; follow its current schema and distinguish running work from delivered results.');
  if (active.has('job_output')) usage.push('Use `job_output` with one actual `job_id` to collect a background job\'s output. Set `wait: true` to wait; a positive `timeout_ms` alone does not wait. A timed-out wait leaves the job running. Child agent ids use native child result delivery and controls, not this job-output tool.');
  if (active.has('job_list')) usage.push('Use `job_list` to inspect background jobs.');
  if (active.has('job_kill')) usage.push('Use `job_kill` with an actual background `job_id` to request cancellation of a job you own when it is no longer needed. This is not a child-agent interrupt tool; a cancellation request is not proof that the job has stopped.');
  if (usage.length) prompt += `\n\n<tool_usage>\n${usage.map(text => `- ${text}`).join('\n')}\n</tool_usage>`;
  return prompt;
}

const summaryTemplate = readFileSync(new URL('./sources/crates/common/xai-grok-compaction/src/code_compaction/templates/full_replace_summary_prompt.txt', import.meta.url), 'utf8');

export function buildCompactionPrompt() {
  return summaryTemplate
    .replace('{user_context_section}', '')
    .replace("The successor will see the user's original query plus this summary.", 'The successor will see the retained conversation plus this summary.')
    .replace('marked with <conversation_summary> tags or a "This session is being continued" preamble',
      'marked with <conversation_summary> or <compacted-summary> tags, a "This session is being continued" preamble, or the native "This is an automatically generated checkpoint condensing an earlier span of the conversation" preamble')
    .replace('You already have the full conversation in your context window.', 'Use only the conversation supplied in this summarization request.');
}
