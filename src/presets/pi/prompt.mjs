import { readFileSync } from 'node:fs';
import { normalizeBuildSystemPromptOptions, formatSkillsForPrompt } from '../../../lib/pi-prompt-helpers.mjs';

export const product = Object.freeze({
  id: 'pi', name: 'Pi Coding Agent',
  sourceCommit: 'abe508e1b89912adde45528136c3221eb69acdd7',
  sourceVersion: 'v1.1.0',
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
const guidelines = {
  read: ['Use read to examine files instead of cat or sed.'],
  edit: ['Use edit for precise changes (old_string must match exactly)',
    'When changing multiple separate locations in one file, use separate edit calls with file_path, old_string, and new_string.',
    'Each old_string is matched against the current file. Read the current contents after earlier edits when a later change depends on them. Merge nearby changes into one edit.',
    'Keep old_string as small as possible while still being unique in the file. Do not pad with large unchanged regions.'],
  write: ['Use write only for new files or complete rewrites.'],
  read_image: ['Use read_image to examine images; read returns text file contents.'],
};

function section(name, content) { return `<${name}>\n${content}\n</${name}>`; }
function escapeContext(text) { return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

export function promptOptions({ tools = new Set(), cwd, customTools = [], hiddenTools = [] } = {}) {
  return normalizeBuildSystemPromptOptions({ cwd, selectedTools: [...tools],
    hiddenTools,
    toolSnippets: { ...snippets, ...Object.fromEntries(customTools.filter(t => t.promptSnippet).map(t => [t.name, t.promptSnippet])) },
    toolGuidelines: { ...guidelines, ...Object.fromEntries(customTools.map(t => [t.name, t.promptGuidelines ?? []])) },
  });
}

export function buildPromptSections(input) {
  const options = normalizeBuildSystemPromptOptions(input);
  const declaredTools = options.selectedTools.filter(name => !options.hiddenTools.includes(name));
  const active = new Set(declaredTools);
  const toolSnippets = options.toolSnippets;
  const names = declaredTools.filter(name => toolSnippets[name]);
  const rules = [];
  if (!['grep', 'glob', 'find', 'ls'].some(name => active.has(name))) {
    if (active.has('bash') && active.has('pwsh')) rules.push('Use bash or PowerShell for file operations like listing, searching, and finding files');
    else if (active.has('pwsh')) rules.push('Use PowerShell for file operations like listing, searching, and finding files');
    else if (active.has('bash')) rules.push('Use bash for file operations like ls, rg, find');
  }
  for (const name of declaredTools) for (const rule of options.toolGuidelines[name] ?? []) {
    const normalized = rule.trim(); if (normalized && !rules.includes(normalized)) rules.push(normalized);
  }
  for (const rule of options.promptGuidelines) {
    const normalized = rule.trim(); if (normalized && !rules.includes(normalized)) rules.push(normalized);
  }
  rules.push('Be concise in your responses', 'Show file paths clearly when working with files');

  const sections = options.customPrompt ? { preamble: options.customPrompt } : {
    preamble: preamble.replace('operating inside pi, a coding agent harness', 'operating inside DSH with the Pi Coding Agent preset'),
    tools: section('tools', `${names.length ? names.map(name => `- ${name}: ${toolSnippets[name]}`).join('\n') : '(none)'}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.`),
    rules: section('rules', rules.map(rule => `- ${rule}`).join('\n')),
  };
  // Upstream's installation-owned documentation paths have no equivalent in DSH.
  // Preserve the complete documentation instructions and use fixed official references.
  if (!options.customPrompt && (active.has('bash') || active.has('pwsh') || active.has('web_fetch'))) {
    const base = `https://raw.githubusercontent.com/earendil-works/pi/${product.sourceCommit}/packages/coding-agent`;
    const docs = docsSource
      .replace('${getReadmePath()}', `${base}/README.md`)
      .replace('${getDocsPath()}', `${base}/docs`)
      .replace('${getExamplesPath()}', `${base}/examples`);
    sections.docs = section('docs', `${docs}\n- These are documentation URLs. Fetch them with an available command or web tool when needed.`);
  }
  if (options.appendSystemPrompt) sections.addendum = section('addendum', options.appendSystemPrompt);
  if (options.contextFiles.length) sections.project_context = section('project_context', 'Project-specific instructions and guidelines:\n' + options.contextFiles.map(file => '<project_instructions path="' + escapeContext(file.path).replaceAll('"', '&quot;') + '">\n' + file.content + '\n</project_instructions>').join('\n'));
  const readers = ['read', 'bash'];
  const skillFileReadTool = readers.find(tool => active.has(tool))
    ?? (readers.some(tool => options.selectedTools.includes(tool)) ? 'indirect' : undefined);
  if (skillFileReadTool && options.skills.length) {
    const text = formatSkillsForPrompt(options.skills, skillFileReadTool).trim();
    if (text) sections.skills = section('skills', text);
  }
  if (options.cwd) sections.cwd = section('cwd', escapeContext(String(options.cwd).replaceAll('\\', '/')));
  for (const [name, text] of Object.entries(options.sections)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name) || name === 'preamble') throw Error('Invalid system prompt section name: ' + name);
    if (text) sections[name] = section(name, text);
  }
  return sections;
}

export function buildPrompt(input = {}) { return Object.values(buildPromptSections(promptOptions(input))).join('\n\n'); }

const compactionSource = readFileSync(new URL('./sources/packages/coding-agent/src/core/compaction/compaction.ts', import.meta.url), 'utf8');
const summaryPrompt = compactionSource.match(/const SUMMARIZATION_PROMPT = `([\s\S]*?)`;/)?.[1];
if (!summaryPrompt) throw new Error('Pi source compaction prompt was not found');

export function buildCompactionPrompt() { return summaryPrompt; }
