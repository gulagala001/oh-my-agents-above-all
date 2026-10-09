import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildPrompt as codex } from '../src/presets/codex/prompt.mjs';
import { buildPrompt as pi } from '../src/presets/pi/prompt.mjs';
import { buildPiPromptHelpers } from '../scripts/build-pi-prompt-helpers.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const read = file => readFile(new URL('../' + file, import.meta.url));
const manifests = [
  ['codex', 'src/presets/codex/sources/source.json', 'rust-v0.162.0', 'c1382380de69521303b416720a52f42d51af6248'],
  ['pi', 'src/presets/pi/source.json', 'v1.1.0', 'abe508e1b89912adde45528136c3221eb69acdd7'],
];

for (const [product, file, tag, commit] of manifests) test(`${product} fixed stable sources retain exact bytes, SHA and revision URLs`, async () => {
  const manifest = JSON.parse(await read(file));
  assert.equal(manifest.commit, commit);
  assert.equal(manifest.tag, tag);
  for (const source of manifest.files) {
    const bytes = await read(`src/presets/${product}/` + (source.file ?? source.snapshot));
    assert.equal(digest(bytes), source.sha256, source.path ?? source.file);
    assert.equal(bytes.length, source.bytes);
    assert(source.url.includes('/' + commit + '/'));
  }
  assert((await read(`src/presets/${product}/sources/LICENSE`)).length > 1000);
});

test('Codex stable profile extraction and reviewed adaptation match their original source', async () => {
  const models = JSON.parse(await read('src/presets/codex/sources/models.json'));
  const profile = models.models.find(model => model.slug === 'gpt-6-astra').model_messages;
  assert.deepEqual(JSON.parse(await read('src/presets/codex/sources/model-messages.json')), profile);
  for (const field of ['instructions_template', 'persistent_instructions']) assert.equal((await read('src/presets/codex/sources/' + field + '.md')).toString(), profile[field]);
  const adaptation = JSON.parse(await read('src/presets/codex/adaptation.json'));
  assert.equal(digest(await read('src/presets/codex/' + adaptation.source)), adaptation.sourceSha256);
  assert.equal(digest(codex({ ...adaptation.reviewConfiguration, tools: new Set(adaptation.reviewConfiguration.tools) })), adaptation.renderedSha256);
});

test('Codex active prompt preserves explicit messaging authorization and actual native capabilities', () => {
  for (const tools of [new Set(), new Set(['read', 'write', 'bash', 'ask_user_question', 'subagent'])]) for (const mode of ['default', 'ask', 'plan']) {
    const text = codex({ tools, mode, platform: 'darwin' });
    assert(text.includes('unless given explicit instructions to do so, or instructed to do so as part of an explicitly-invoked skill or plugin.'));
    assert(text.includes('name and link the skill or plugin in the final answer.'));
    assert(!text.includes('name and link the skill or plugin in the final channel.'));
    assert(!text.includes('functions.exec'));
    assert(!text.includes('functions.request_user_input_async'));
    assert.equal(text.includes('- Use `ask_user_question` for short questions'), tools.has('ask_user_question'));
    assert.equal(text.includes('- Use `subagent` only when'), tools.has('subagent'));
    assert.equal(text.includes('The current mode is '), mode !== 'default');
  }
  const windows = codex({ tools: new Set(['pwsh']), platform: 'win32' });
  assert(windows.includes('- Use `pwsh` for terminal commands.'));
  assert(!windows.includes('- Use `bash` for terminal commands.'));
});

test('Pi generated helper closure stays reproducible and its actual tool branches remain bounded', async () => {
  await buildPiPromptHelpers();
  const source = JSON.parse(await read('src/presets/pi/source.json'));
  assert.equal(digest(await read('src/presets/pi/prompt.mjs')), source.adaptedPrompt.sha256);
  assert.equal(digest(await read('lib/pi-prompt-helpers.mjs')), source.beforeAgentStartAdapter.pureHelpers.sha256);
  const frame = source.beforeAgentStartAdapter.modules.find(module => module.module === 'extension-prompt.mjs');
  assert.equal(digest(await read('src/presets/pi/extension-prompt.mjs')), frame.sha256);
  const helper = (await read('lib/pi-prompt-helpers.mjs')).toString();
  assert(!/^import /m.test(helper));
  assert(helper.includes('abe508e1b89912adde45528136c3221eb69acdd7'));
  const empty = pi();
  assert(empty.includes('(none)'));
  assert(!empty.includes('<docs>'));
  const windows = pi({ tools: new Set(['read', 'pwsh']), platform: 'win32' });
  assert(windows.includes('Use PowerShell for file operations'));
  assert(!windows.includes('- bash:'));
  assert(windows.includes('/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent'));
  const extras = pi({ tools: new Set(['read', 'todo_write', 'subagent']) });
  assert(!extras.includes('- todo_write:'));
  assert(!extras.includes('- subagent:'));
});
