import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Keep the actual rc.2 queue renderer, attachment previews, InlineEditor,
// pending-admission rows, native tooltip and layout. Adapt only shared preset queue actions.
export async function buildGrokQueue() {
  const root = new URL('../src/client/sources/grok-queue/', import.meta.url);
  const meta = JSON.parse(await readFile(new URL('source.json', root), 'utf8'));
  let source = await readFile(new URL(meta.snapshot, root), 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== meta.sha256) throw Error('Grok queue source hash mismatch');
  if (createHash('sha256').update(await readFile(new URL('LICENSE', root))).digest('hex') !== meta.licenseSha256) throw Error('Grok queue license hash mismatch');
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Grok queue adaptation is ambiguous: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  const cssStart = source.indexOf('\t\tconst tagId$6 =');
  const cssEnd = source.indexOf('\t\tvar QueueDock_module_css_default');
  source = source.slice(0, cssStart) + source.slice(cssEnd);
  replace('function QueueDock({ useSession, useProjection, updateQueue, notify, loadImage, renderFactorySlot, t })',
    'function QueueDock({ useSession, useProjection, updateQueue, notify, loadImage, renderFactorySlot, t, renderActions, canSteer })');
  replace('if (!content.every((block) => block.type === "text")) return null;',
    'if (!content.every((block) => ["text", "image", "file"].includes(block.type))) return null;');
  replace('return content.map((block) => block.text).join("");',
    'return content.filter((block) => block.type === "text").map((block) => block.text).join("");');
  replace('await updateQueue(itemId, action);',
    'await updateQueue(itemId, action, action.kind === "edit" ? editing?.expected : queue.find(row => row.id === itemId));');
  replace('} catch {\n\t\t\t\t\tnotify("error", failure);',
    '} catch (error) {\n\t\t\t\t\tnotify("error", error.message || failure);');
  replace('id: row.id,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ttext',
    'id: row.id, expected: row,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ttext');
  replace('id: row.id,\n\t\t\t\t\t\t\t\t\t\t\t\ttext',
    '...editing, id: row.id,\n\t\t\t\t\t\t\t\t\t\t\t\ttext');
  replace('queueMutable && (0, react_jsx_runtime.jsx)("div", {',
    'queueMutable && row.source.kind === "user" && (0, react_jsx_runtime.jsx)("div", {');
  replace('] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [',
    '] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [renderActions(row, busy, applyAction),');
  source = source.replaceAll('disabled: !running,', 'disabled: !running || !canSteer(row),')
    .replaceAll('disabled: busy !== null || !running,', 'disabled: busy !== null || !running || !canSteer(row),')
    .replaceAll('_7yHdaG_', 'omaaGrokQueue_');
  const imports = 'import * as react from "react";\nimport * as react_jsx_runtime from "react/jsx-runtime";\nimport * as _deepseek_ai_dsh_client_ui_primitives from "@deepseek-ai/dsh-client-ui-primitives";\n';
  await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
  await writeFile(new URL('../lib/grok-queue.mjs', import.meta.url),
    '// Derived from fixed MIT DSH QueueDock; see src/client/sources/grok-queue/source.json.\n' + imports + source + '\nexport { QueueDock, css$6 as queueCss };\n');
}
