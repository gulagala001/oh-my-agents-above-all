import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBuildSystemPromptOptions } from '../lib/pi-prompt-helpers.mjs';
import { buildPromptSections, promptOptions } from '../src/presets/pi/prompt.mjs';

const skill = { name: 'example', description: 'Example skill', filePath: '/tmp/example/SKILL.md', baseDir: '/tmp/example', source: 'project' };

test('Pi hidden tool options are cloned and excluded from snippets, rules and skill reader hints', () => {
  const input = { ...promptOptions({ tools: new Set(['read', 'bash', 'edit']), cwd: '/workspace' }), hiddenTools: ['read', 'bash'], skills: [skill] };
  const normalized = normalizeBuildSystemPromptOptions(input);
  assert.deepEqual(normalized.hiddenTools, ['read', 'bash']);
  normalized.hiddenTools.push('edit');
  assert.deepEqual(input.hiddenTools, ['read', 'bash']);
  const sections = buildPromptSections(input);
  assert(!sections.tools.includes('- read:'));
  assert(!sections.tools.includes('- bash:'));
  assert(sections.tools.includes('- edit:'));
  assert(!sections.rules.includes('Use read to examine'));
  assert(!sections.rules.includes('Use bash for file operations'));
  assert(sections.skills.includes("Load a skill's file when the task matches its description."));
  assert(!sections.skills.includes('Use the read tool'));
  assert(!sections.skills.includes('Use bash'));
  assert.deepEqual(input.selectedTools, ['read', 'bash', 'edit'], 'prompt hiding does not edit the actual selected loadout');
});

test('Pi skills use the visible supported reader and selected tool order', () => {
  const ordered = buildPromptSections(promptOptions({ tools: new Set(['bash', 'read']) }));
  assert(ordered.tools.indexOf('- bash:') < ordered.tools.indexOf('- read:'));
  const options = { ...promptOptions({ tools: new Set(['bash', 'read']), cwd: '/workspace' }), hiddenTools: ['read'], skills: [skill] };
  const sections = buildPromptSections(options);
  assert(sections.skills.includes('bash'));
  assert(!sections.skills.includes('read tool'));
  assert(!sections.tools.includes('- read:'));
  assert(sections.tools.includes('- bash:'));
});

test('Pi custom tools only contribute visible snippets and guidelines', () => {
  const sections = buildPromptSections({ ...promptOptions({ tools: new Set(['secret', 'visible']), customTools: [
    { name: 'secret', promptSnippet: 'SECRET_SNIPPET', promptGuidelines: ['SECRET_RULE'] },
    { name: 'visible', promptSnippet: 'VISIBLE_SNIPPET', promptGuidelines: ['VISIBLE_RULE'] },
  ] }), hiddenTools: ['secret'] });
  assert(!Object.values(sections).join('\n').includes('SECRET_'));
  assert(sections.tools.includes('VISIBLE_SNIPPET'));
  assert(sections.rules.includes('VISIBLE_RULE'));
});

test('Pi native frame does not let mutable prompt options hide declared tools', async () => {
  const { promptFrame, renderPromptFrame } = await import('../src/presets/pi/extension-prompt.mjs');
  const frame = promptFrame([{ name: 'deployment:persona-prefix', text: 'old' }], { tools: new Set(['read', 'bash']), cwd: '/workspace', customTools: [], catalog: {} });
  const edited = { ...frame.options, hiddenTools: ['read', 'bash'] };
  const text = renderPromptFrame(frame, edited)[0].text;
  assert(text.includes('- read: Read file contents'));
  assert(text.includes('- bash: Execute bash commands'));
  assert.deepEqual(edited.hiddenTools, ['read', 'bash'], 'rendering does not mutate the guest-owned options');
});

test('Pi search guidance follows the real declared search tools and hides no selected loadout', () => {
  const withSearch = buildPromptSections(promptOptions({ tools: new Set(['grep', 'bash', 'read']) }));
  assert(!withSearch.rules.includes('Use bash for file operations'));
  const hiddenSearch = buildPromptSections(promptOptions({ tools: new Set(['grep', 'bash', 'read']), hiddenTools: ['grep'] }));
  assert(hiddenSearch.rules.includes('Use bash for file operations'));
  assert(!hiddenSearch.tools.includes('- grep:'));
});
