import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Retain the real rc.2 renderer rather than maintaining a second diff layout.
// The source excerpt is immutable; only gutter interaction and CSS ownership
// are adapted. Neither the build nor importing the component mounts a style.
export async function buildCursorDiff() {
  const base = new URL('../src/client/sources/dsh-rc2/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('source.json', base), 'utf8'));
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (createHash('sha256').update(await readFile(new URL(name, base))).digest('hex') !== hash)
      throw Error('Pinned DSH review source changed: ' + name);
  }
  let source = await readFile(new URL('FileDiff.js.txt', base), 'utf8');
  const styleStart = source.indexOf('\t\tconst tagId$3 = '), styleEnd = source.indexOf('\t\tvar FileDiff_module_css_default');
  if (styleStart < 0 || styleEnd < styleStart) throw Error('DSH FileDiff CSS boundary changed');
  source = source.slice(0, styleStart) + source.slice(styleEnd);
  const numbers = [
    ['cell?.no', 'side === "left" ? "old" : "new"'],
    ['row.left?.no', '"old"'], ['row.right?.no', '"new"'],
    ['row.old', '"old"'], ['row.new', '"new"'],
  ];
  for (const [line, side] of numbers) {
    const pattern = new RegExp('\\(0, react_jsx_runtime\\.jsx\\)\\("span", \\{(\\s*className: FileDiff_module_css_default.number,\\s*)children: ' + line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\?\\? ""');
    if (!pattern.test(source)) throw Error('DSH FileDiff line-number binding changed: ' + line);
    source = source.replace(pattern, `(0, react_jsx_runtime.jsx)(ReviewLineNumber, {$1side: ${side}, line: ${line}, children: ${line} ?? ""`);
  }
  for (const [original, replacement] of [
    ['children: hunk.header', 'children: (0, react_jsx_runtime.jsx)(ReviewHunkHeader, { index: position, actions: side === "right", children: hunk.header })'],
    ['children: hunkHeader(hunk)', 'children: (0, react_jsx_runtime.jsx)(ReviewHunkHeader, { index: position, actions: true, children: hunkHeader(hunk) })'],
  ]) {
    if (source.split(original).length !== 2) throw Error('DSH FileDiff hunk binding changed: ' + original);
    source = source.replace(original, replacement);
  }
  const prelude = `// Derived from pinned MIT DSH rc.2 FileDiff; see src/client/sources/dsh-rc2/source.json.
import * as react from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import * as _deepseek_ai_dsh_client_ui_primitives from '@deepseek-ai/dsh-client-ui-primitives';
export const ReviewLineContext = react.createContext({});
function ReviewHunkHeader({ index, actions, children }) {
  const { renderHunkActions } = react.useContext(ReviewLineContext);
  return react_jsx_runtime.jsxs(react.Fragment, { children: [children, actions && renderHunkActions &&
    react_jsx_runtime.jsx('span', { className: 'omaa-review-hunk-actions', 'data-review-hunk-actions': index, children: renderHunkActions(index) })] });
}
function ReviewLineNumber({ line, side, children, ...props }) {
  const { onSelect, selected, counts, disabled } = react.useContext(ReviewLineContext);
  if (!line) return react_jsx_runtime.jsx('span', { ...props, children });
  const count = counts?.[side + ':' + line] ?? 0;
  return react_jsx_runtime.jsx('button', { ...props, type: 'button', disabled,
    'data-review-line': line, 'data-review-side': side,
    'data-review-commented': count || undefined,
    'aria-pressed': selected?.side === side && selected?.line === line,
    'aria-label': (side === 'old' ? '评论原文件第 ' : '评论新文件第 ') + line + ' 行' + (count ? '，' + count + ' 条批注' : ''),
    onClick: () => onSelect?.({ side, line }), children });
}
`;
  await writeFile(new URL('../lib/cursor-native-diff.mjs', import.meta.url), prelude + source + '\nexport { FileDiff, css$3 as diffCss };\n');
}
