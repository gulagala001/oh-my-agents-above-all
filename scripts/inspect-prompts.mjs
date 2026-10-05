import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { products } from '../src/shared/products.mjs';

// Review output only. Runtime assembly always uses the actual scoped DSH schemas.
const tools = ['read', 'write', 'edit', 'read_image', 'skill', 'glob', 'grep', 'bash', 'todo_write',
  'ask_user_question', 'web_search', 'web_fetch', 'job_list', 'job_output', 'job_kill',
  'enter_plan_mode', 'exit_plan_mode', 'subagent', 'send_message', 'interrupt_agent', 'list_agents', 'present', 'workflow'];
const directory = fileURLToPath(new URL('../.cache/prompt-review/', import.meta.url));
await mkdir(directory, { recursive: true });
const records = [];
for (const product of products) {
  const module = await import(`../src/presets/${product.id}/prompt.mjs`);
  const selected = product.id === 'pi' ? ['read', 'write', 'edit', 'read_image', 'skill', 'bash'] : [...tools,
    ...(product.id === 'grok' ? ['monitor', 'scheduler_create', 'scheduler_list', 'scheduler_delete'] : []),
    ...(product.id === 'cursor' ? ['cursor_rule'] : []), ...(product.id === 'zcode' ? ['read_session_context'] : [])];
  const prompt = module.buildPrompt({ tools: new Set(selected), platform: 'darwin', mode: 'default' });
  const summary = module.buildCompactionPrompt();
  await writeFile(directory + product.id + '.md', prompt);
  if (summary) await writeFile(directory + product.id + '-compact.md', summary);
  records.push({ product: product.id, tools: selected, platform: 'darwin', mode: 'default',
    promptBytes: Buffer.byteLength(prompt), promptSha256: createHash('sha256').update(prompt).digest('hex'),
    summary: summary ? { bytes: Buffer.byteLength(summary), sha256: createHash('sha256').update(summary).digest('hex') } : 'native DSH fallback' });
}
await writeFile(directory + 'render.json', JSON.stringify(records, null, 2) + '\n');
console.log('Rendered five prompt packs for review in .cache/prompt-review.');
