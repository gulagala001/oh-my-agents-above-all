import { readFileSync } from 'node:fs';

export const product = Object.freeze({
  id: 'pi', name: 'Pi Coding Agent',
  sourceCommit: 'cd32f7725fdbddbaecdff5b1e68491563394e0ca',
  sourceVersion: 'v1.0.2',
  coreTools: ['read', 'bash', 'edit', 'write'],
});

const source = readFileSync(new URL('./sources/packages/coding-agent/src/core/system-prompt.ts', import.meta.url), 'utf8');
const preamble = source.match(/promptSections\.preamble =\s*"([^"]+)";/)?.[1];
if (!preamble) throw new Error('Pi source preamble was not found');
const docsSource = source.match(/promptSections\.docs = `([\s\S]*?)`;/)?.[1];
if (!docsSource) throw new Error('Pi source documentation section was not found');

const snippets = {
  read: 'Read file contents',
  bash: 'Execute bash commands (ls, grep, find, etc.)',
  pwsh: 'Execute PowerShell commands',
  edit: 'Make precise file edits with exact text replacement',
  write: 'Create or overwrite files',
  read_image: 'Read image files visually',
};

function section(name, content) { return `<${name}>\n${content}\n</${name}>`; }
function escapeContext(text) { return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

export function buildPrompt({ tools = new Set(), cwd, platform, mode = 'default' } = {}) {
  const active = new Set(tools);
  const names = Object.keys(snippets).filter(name => active.has(name));
  const rules = [];
  if (active.has('bash') && active.has('pwsh')) rules.push('Use bash or PowerShell for file operations like listing, searching, and finding files');
  else if (active.has('pwsh')) rules.push('Use PowerShell for file operations like listing, searching, and finding files');
  else if (active.has('bash')) rules.push('Use bash for file operations like ls, rg, find');
  if (active.has('read')) rules.push('Use read to examine files instead of cat or sed.');
  if (active.has('edit')) rules.push(
    'Use edit for precise changes (old_string must match exactly)',
    'When changing multiple separate locations in one file, use separate edit calls with file_path, old_string, and new_string.',
    'Each old_string is matched against the current file. Read the current contents after earlier edits when a later change depends on them. Merge nearby changes into one edit.',
    'Keep old_string as small as possible while still being unique in the file. Do not pad with large unchanged regions.',
  );
  if (active.has('write')) rules.push('Use write only for new files or complete rewrites.');
  if (active.has('read_image')) rules.push('Use read_image to examine images; read returns text file contents.');
  rules.push('Be concise in your responses', 'Show file paths clearly when working with files');

  const sections = [
    preamble.replace('operating inside pi, a coding agent harness', 'operating inside DSH with the Pi Coding Agent preset'),
    section('tools', `${names.length ? names.map(name => `- ${name}: ${snippets[name]}`).join('\n') : '(none)'}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`),
    section('rules', rules.map(rule => `- ${rule}`).join('\n')),
  ];
  // Upstream's installation-owned documentation paths have no equivalent in DSH.
  // Preserve the complete documentation instructions and use fixed official references.
  if (active.has('bash') || active.has('pwsh') || active.has('web_fetch')) {
    const base = `https://raw.githubusercontent.com/earendil-works/pi/${product.sourceCommit}/packages/coding-agent`;
    const docs = docsSource
      .replace('${getReadmePath()}', `${base}/README.md`)
      .replace('${getDocsPath()}', `${base}/docs`)
      .replace('${getExamplesPath()}', `${base}/examples`);
    sections.push(section('docs', `${docs}\n- These are documentation URLs. Fetch them with an available command or web tool when needed.`));
  }
  if (cwd) sections.push(section('cwd', escapeContext(String(cwd).replaceAll('\\', '/'))));
  return sections.join('\n\n');
}

const compactionSource = readFileSync(new URL('./sources/packages/coding-agent/src/core/compaction/compaction.ts', import.meta.url), 'utf8');
const summaryPrompt = compactionSource.match(/const SUMMARIZATION_PROMPT = `([\s\S]*?)`;/)?.[1];
if (!summaryPrompt) throw new Error('Pi source compaction prompt was not found');

export function buildCompactionPrompt() { return summaryPrompt; }
