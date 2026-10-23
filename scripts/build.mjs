import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import ts from 'typescript';
import { buildPiPromptHelpers } from './build-pi-prompt-helpers.mjs';
import { buildGrokDocuments } from './build-grok-documents.mjs';

import { buildZCodeWorkflowCompiler } from './build-zcode-compiler.mjs';
import { buildZCodeWorldReads } from './build-zcode-world.mjs';
import { buildZCodeArtifacts } from './build-zcode-artifacts.mjs';
import { buildZCodeImportCache } from './build-zcode-import-cache.mjs';
import { buildZCodeRunProjection } from './build-zcode-run-projection.mjs';
import { buildZCodeGraphUiAssets } from './build-zcode-graph-ui-assets.mjs';
import { buildZCodeArtifactChartView } from './build-zcode-artifact-chart-view.mjs';
import { buildZCodeStreams } from './build-zcode-streams.mjs';
import { buildZCodeProjectMemory } from './build-zcode-memory.mjs';
import { buildZCodeAgentProfiles } from './build-zcode-agent-profiles.mjs';
import { buildZCodeCalendarRule } from './build-zcode-calendar.mjs';

await buildPiPromptHelpers({ write: true });
await buildGrokDocuments();
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(root + 'package.json', 'utf8'));
// Installation adds only the opt-in base. Preset compositions are registered
// by the base after the user's explicit settings choice.
await writeFile(root + 'cordis.patch.yml', JSON.stringify([{ insert: [{ id: 'omaa', name: 'oh-my-agents-above-all' }] }], null, 2) + '\n');
await mkdir(root + 'lib', { recursive: true });
// Keep ZCode's actual ranking, chunk selection and formatting implementation.
// Only the native message/part boundary and unused reference-reminder export
// differ; source stays immutable and the derived runtime is regenerated here.
const sessionSource = await readFile(root + 'src/presets/zcode/sources/upstream-3.15.1/apps/zcode-cli/packages/core/src/session-context/read-session-context.ts', 'utf8');
const sessionAdapter = '../src/presets/zcode/session-material-adapter.mjs';
const adaptedSessionSource = sessionSource
  .replace('"../agent/session-history-hydrator.js"', JSON.stringify(sessionAdapter))
  .replace('"./parts.js"', JSON.stringify(sessionAdapter))
  .replace('"./utils.js"', JSON.stringify(sessionAdapter))
  .replace(/export \{\s*buildReferencedSessionContextReminderBody,\s*extractSessionReferences,\s*\} from "\.\/references.js";\n/, '');
const generatedSession = await transform(adaptedSessionSource, { loader: 'ts', format: 'esm', target: 'es2022' });
await writeFile(root + 'lib/zcode-session-material.mjs', '// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.\n' + generatedSession.code);
// The saved workflow format/argument contract stays derived from its fixed
// upstream source. Only Zod 3's record overload is adapted to host Zod 4.
const savedRoot = root + 'src/presets/zcode/sources/upstream/apps/zcode-cli/packages/';
for (const [input, output, adapt] of [
  ['contracts/src/tools/saved-workflow.ts', 'zcode-saved-contract.mjs', text => text.replace('z.record(SavedWorkflowArgDeclarationSchema)', 'z.record(z.string(), SavedWorkflowArgDeclarationSchema)')],
  ['core/src/tool/handlers/saved-workflows/args.ts', 'zcode-saved-args.mjs', text => text],
  ['core/src/tool/handlers/saved-workflows/frontmatter.ts', 'zcode-saved-codec.mjs', text => text.replace('from "@zcode/contracts"', 'from "./zcode-saved-contract.mjs"')],
  ['core/src/tool/handlers/save-workflow-description.ts', 'zcode-save-description.mjs', text => text.replace('import { DYNAMIC_WORKFLOW_SKILL_NAME } from "@zcode/contracts";', 'const DYNAMIC_WORKFLOW_SKILL_NAME = "zcode-workflows";')],
]) {
  const generated = await transform(adapt(await readFile(savedRoot + input, 'utf8')), { loader: 'ts', format: 'esm', target: 'es2022' });
  await writeFile(root + 'lib/' + output, '// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.\n' + generated.code);
}
await buildZCodeWorkflowCompiler();
await buildZCodeStreams();
await buildZCodeProjectMemory();
await buildZCodeAgentProfiles();
await buildZCodeCalendarRule();
await buildZCodeWorldReads();
await buildZCodeArtifacts();
await buildZCodeImportCache();
await buildZCodeRunProjection();
await buildZCodeGraphUiAssets({ mode: 'check' });
await buildZCodeArtifactChartView();
const graphAliases = JSON.parse(await readFile(root + 'scripts/zcode-graph-ui-aliases.json', 'utf8'));
for (const [key, entry] of Object.entries(manifest.exports)) {
  if (key !== './client' && key !== './package.json') await import(new URL('../' + entry, import.meta.url));
}
await build({ entryPoints: [root + 'src/client/index.jsx'], outfile: root + 'lib/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  alias: Object.fromEntries([
    ['@/ErrorBoundary.js', 'src/client/zcode-artifact-primitives.jsx'],
    ['@/components/lib/utils.js', 'src/presets/zcode/sources/upstream/packages/ui/src/components/lib/utils.ts'],
    ['@/components/ui/chart.js', 'src/presets/zcode/sources/upstream/packages/ui/src/components/ui/chart.tsx'],
    ...['apply', 'spec', 'palette', 'parts'].map(name => ['@/app-shell/workflow-artifacts/presets/' + name + '.js', 'src/presets/zcode/sources/upstream/packages/ui/src/app-shell/workflow-artifacts/presets/' + name + (name === 'parts' ? '.tsx' : '.ts')]),
    ...Object.entries(graphAliases),
  ].map(([name, path]) => [name, root + path])),
  minifySyntax: true, minifyWhitespace: true,
  // Escaped string literals retain dependency text without embedding trailing
  // whitespace/newlines in the generated source's template literals.
  supported: { 'template-literal': false },
  banner: { js: 'window.__ModuleLoader__.load({id:"oh-my-agents-above-all",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'css-text', setup(builder) { builder.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' })); } }],
});
// esbuild uses these property names only as module initializer labels. Keep
// private dependency-store locations out of the distributable bundle.
const clientPath = root + 'lib/client.js';
const client = await readFile(clientPath, 'utf8');
const clientAst = ts.createSourceFile('client.js', client, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (clientAst.parseDiagnostics.length) throw new Error('Cannot normalize an invalid client bundle');
const labelEdits = [];
function normalizeModuleLabels(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(?:__esm|__commonJS)$/.test(node.expression.text)
    && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
    for (const property of node.arguments[0].properties) {
      if (!(ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property)) || !ts.isStringLiteral(property.name)) continue;
      const label = property.name.text, stable = label.replace(/^.*?\/node_modules\//, 'node_modules/');
      if (stable !== label) labelEdits.push([property.name.getStart(clientAst), property.name.end, JSON.stringify(stable)]);
    }
  }
  ts.forEachChild(node, normalizeModuleLabels);
}
normalizeModuleLabels(clientAst);
let publicClient = client;
for (const [start, end, label] of labelEdits.sort((a, b) => b[0] - a[0])) publicClient = publicClient.slice(0, start) + label + publicClient.slice(end);
await writeFile(clientPath, publicClient);
