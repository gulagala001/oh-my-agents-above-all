import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import semver from 'semver';
import { buildPiPromptHelpers } from './build-pi-prompt-helpers.mjs';

import { products } from '../src/shared/products.mjs';
import { buildZCodeWorkflowCompiler } from './build-zcode-compiler.mjs';
import { buildZCodeWorldReads } from './build-zcode-world.mjs';
import { buildZCodeArtifacts } from './build-zcode-artifacts.mjs';
import { buildZCodeImportCache } from './build-zcode-import-cache.mjs';
import { buildZCodeRunProjection } from './build-zcode-run-projection.mjs';
import { buildZCodeGraphUiAssets } from './build-zcode-graph-ui-assets.mjs';

await buildPiPromptHelpers();
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(root + 'package.json', 'utf8'));
const nativeActivations = semver.gte(manifest.devDependencies['@deepseek-ai/dsh'], '0.2.1-alpha.2');
const row = (id, name, config, extra = {}) => ({ id, name, ...extra, ...(config ? { config } : {}) });
const planSection = 'You are in plan mode. Research the workspace and ask questions without changing project files. Use the available read-only shell for research commands; its file restrictions cannot be widened in this mode. Produce a complete implementation plan. When ready, call exit_plan_mode alone with the complete plan Markdown, starting with a # heading. Implement only after the user approves the plan or selects the default mode. Follow the current tool schemas and runtime policy.';
const composition = product => [
  row('agent-instructions', '@deepseek-ai/dsh-agent-instructions', { maxBytes: 65536 }),
  row('tool-fs', '@deepseek-ai/dsh-tool-fs'),
  row('tool-bash', '@deepseek-ai/dsh-tool-bash', { promoteOnTimeout: product.id !== 'pi' }, { disabled: 'WINDOWS_DISABLED' }),
  row('tool-pwsh', '@deepseek-ai/dsh-tool-pwsh', { promoteOnTimeout: product.id !== 'pi' }, { disabled: 'UNIX_DISABLED' }),
  row('skill-filesystem', '@deepseek-ai/dsh-skill-filesystem'),
  row('tool-skill', '@deepseek-ai/dsh-tool-skill'),
  ...product.id === 'pi' ? [row('tool-jobs', '@deepseek-ai/dsh-tool-jobs')] : [],
  ...product.id === 'pi' ? [] : [
    row('tool-fs-search', '@deepseek-ai/dsh-tool-fs-search', { sampleOverCapGlobResults: false }),
    row('tool-todo', '@deepseek-ai/dsh-tool-todo', { allowParallelInProgress: true }),
    row('tool-jobs', '@deepseek-ai/dsh-tool-jobs'),
    row('tool-ask-user', '@deepseek-ai/dsh-tool-ask-user'),
    row('tool-web', '@deepseek-ai/dsh-tool-web', { fetch: true }),
    row('tool-present', '@deepseek-ai/dsh-tool-present'),
  ],
    row('delegation', 'cordis:group', [
      row('workflow-ptc', '@deepseek-ai/dsh-workflow-ptc'),
      row('tool-workflow', '@deepseek-ai/dsh-tool-workflow'),
      row('tool-subagent-control', '@deepseek-ai/dsh-tool-subagent-control'),
      row('tool-subagent-list-agents', '@deepseek-ai/dsh-tool-subagent-control/list-agents'),
      row('tool-subagent', '@deepseek-ai/dsh-tool-subagent', { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true,
        ...nativeActivations ? {} : { backgroundMode: 'continuable' } }),
    ], { group: true, isolate: { workflowEngine: true } }),
  ...product.id === 'pi' ? [] : [
    row('planning', 'cordis:group', [row('plan-mode', '@deepseek-ai/dsh-plan-mode', { section: planSection }), row('product-plan-tools', 'oh-my-agents-above-all/plan-tools')], { group: true, isolate: { planMode: true } }),
  ],
  row('compaction', 'cordis:group', [
    row('compaction-basic', '@deepseek-ai/dsh-compaction-basic', { headroomTokens: 8192, maxTokens: 8192 }),
    row('command-compact', '@deepseek-ai/dsh-command-compact'),
  ], { group: true, isolate: { compaction: true } }),
  ...product.id === 'pi' ? [row('pi-extensions', 'oh-my-agents-above-all/pi-extensions'), row('pi-resources', 'oh-my-agents-above-all/pi-resources'), row('pi-steering', 'oh-my-agents-above-all/pi-steering'), row('pi-branches', 'oh-my-agents-above-all/pi-branches')] : [],
  ...product.id === 'grok' ? [row('grok-monitor', 'oh-my-agents-above-all/grok-monitor'), row('grok-scheduler', 'oh-my-agents-above-all/grok-scheduler')] : [],
  ...product.id === 'zcode' ? [row('zcode-session-context', 'oh-my-agents-above-all/zcode-session-context'), row('zcode-workflow', 'oh-my-agents-above-all/zcode-workflow'),
    row('zcode-typed-workflow', 'cordis:group', [row('ptc-runtime', '@deepseek-ai/dsh-ptc-runtime-node'), row('zcode-actor-workflow', 'oh-my-agents-above-all/zcode-typed-workflow')], { group: true, isolate: { ptcRuntime: true } })] : [],
  ...product.id === 'cursor' ? [row('cursor-rules', 'oh-my-agents-above-all/cursor-rules'), row('cursor-checkpoints', 'oh-my-agents-above-all/checkpoints')] : [],
  row('omaa-preset', 'oh-my-agents-above-all/agent', { product: product.id }),
  row('omaa-enhancement', 'oh-my-agents-above-all/enhancement'),
];
const patch = [{ insert: [row('omaa', 'oh-my-agents-above-all'), ...products.map((product, index) => row('preset-' + product.preset, '@deepseek-ai/dsh-agent-preset', {
  id: product.preset, name: product.name + ' · OMAA', description: product.name + ' 深度预设 · DSH 模型', order: 20 + index,
  plugins: [row('working', 'cordis:group', [
    row('working-policy', 'oh-my-agents-above-all/working-policy'),
    row('working-tools', 'oh-my-agents-above-all/working-tools', composition(product), { group: true }),
  ], { group: true, isolate: { sandboxPolicy: true, ...product.id === 'pi' ? { omaaPiExtensions: true, omaaPiResources: true, omaaPiSteering: true } : {} } })],
}))] }];
// JSON is a YAML subset; only the platform expressions need Cordis' JS tag.
const yaml = JSON.stringify(patch, null, 2).replaceAll('"WINDOWS_DISABLED"', '!!js process.platform === \'win32\'').replaceAll('"UNIX_DISABLED"', '!!js process.platform !== \'win32\'');
await writeFile(root + 'cordis.patch.yml', yaml + '\n');
await mkdir(root + 'lib', { recursive: true });
// Keep ZCode's actual ranking, chunk selection and formatting implementation.
// Only the native message/part boundary and unused reference-reminder export
// differ; source stays immutable and the derived runtime is regenerated here.
const sessionSource = await readFile(root + 'src/presets/zcode/sources/upstream/apps/zcode-cli/packages/core/src/session-context/read-session-context.ts', 'utf8');
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
await buildZCodeWorldReads();
await buildZCodeArtifacts();
await buildZCodeImportCache();
await buildZCodeRunProjection();
await buildZCodeGraphUiAssets({ mode: 'check' });
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
