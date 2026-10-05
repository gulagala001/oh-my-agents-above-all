import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { transform } from 'esbuild';

/**
 * Rebuild the source-derived graph CSS/messages and the explicit DSH Intl bridge.
 * Raw snapshots are always read-only. This module performs no work when imported.
 * Tailwind 4.2.2 and PostCSS 8.5.6 are build tools only; neither ships in client code.
 *
 * CLI (default is read-only verification):
 *   node scripts/build-zcode-graph-ui-assets.mjs --check
 *   node scripts/build-zcode-graph-ui-assets.mjs --write
 *   node scripts/build-zcode-graph-ui-assets.mjs --output-dir /tmp/graph-ui-review
 *
 * With an isolated build-only runtime, without changing project dependencies:
 *   npm install --prefix /tmp/graph-css-tools --no-save --package-lock=false tailwindcss@4.2.2 postcss@8.5.6
 *   node scripts/build-zcode-graph-ui-assets.mjs --check --css-runtime /tmp/graph-css-tools
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SNAPSHOTS = path.join(ROOT, 'src/presets/zcode/sources/upstream');
const SOURCE_METADATA = path.join(ROOT, 'src/presets/zcode/sources/source.json');
const CLIENT = path.join(ROOT, 'src/client');
const COMMIT = '29628c9acdb81b703bbd4080c207a0e7ce5e276e';
const UI_PREFIX = 'packages/ui/src/';
const WRAPPER = '.omaa-zcode-workflow-graph';
const ENTRIES = ['components/workflow-timeline/WorkflowTimeline.tsx', 'components/workflow-timeline/timeline-model.ts', 'app-shell/WorkflowRunPhaseList.tsx'];
const PINS = [
  {
    "path": "packages/ui/src/app-shell/WorkflowRunPhaseList.tsx",
    "sha256": "b863e2b928cee8dfe0a189d65988605fd07df8e738573b7bb3efb12804bbf077"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunQuestionRow.tsx",
    "sha256": "5abd3d11c607edd3e96690af0d893d1741eff92c7ec1e6ff47b592ae4aae014e"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunSpineParts.tsx",
    "sha256": "0b71b06652008fb279ea771c02b0225ac8322a860aa46098604855f3b0ee4128"
  },
  {
    "path": "packages/ui/src/app-shell/workflowRunQuestions.ts",
    "sha256": "4b4cc5a4e0615d1abd65047dd6229009534a8a00471dcdac330b902c2b22ea59"
  },
  {
    "path": "packages/ui/src/app-shell/workflowRunSpine.ts",
    "sha256": "b82d80a5c982bd184018243fc8aaf444f8203f881ed7bdc9380efbcaea165b08"
  },
  {
    "path": "packages/ui/src/components/lib/utils.ts",
    "sha256": "b083c2359de5f521e00ead8c39b8c8b68934d0e052b1c83384660614198b810d"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/instance-phases.ts",
    "sha256": "b85490e0259dc453edfde9ecee27a0fc8df9e86ffa8656e8b026a4fab4fe30f4"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/lane-name.ts",
    "sha256": "4e994a887c2873025108379d0ae0d33deedc44658e6bd6832c7b0b252cfb3b5a"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/name-pattern.ts",
    "sha256": "905a4e15940bc14eaad7bf103a43c75e37033eb4f1f7e8e668d68afa62403a14"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/participant-model.ts",
    "sha256": "2a7e8a37799b751d0530a6bd3d1787171c8e754023c87d6a00af1d4736239ef1"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/phase-model.ts",
    "sha256": "74361d3a9d7f491c72264d9443150331941d798a07627586dc1a0c8104897672"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/phase-name.ts",
    "sha256": "c3568ad3a1d7c2a7aa4f11b24a6bd3eddb33bbe48457218a89b20bc1a5c2cf4e"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/run-status-presentation.ts",
    "sha256": "d831877dbaec88fe7250f95fdde97e8ea354693c6bc1b573b7108477e307946b"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/run-status.ts",
    "sha256": "ff151e56c52e02202c1b5a24d6531a2af173aa1f749db4ef5301eba65c32d330"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/types.ts",
    "sha256": "a169905fc0124020d9941429a95639b0b80bc68b4066e6c17faa8a99a720da24"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowAgentFace.tsx",
    "sha256": "0d3b1db8ae17cc9f0e5daba64fcc068476602040924a6286514dc29d236d013a"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowAgentPill.tsx",
    "sha256": "ccb40ac5c8b663beee63e0b36328568a6b8da330f1d991c036db32ceada00435"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowMarchLight.tsx",
    "sha256": "1461d599fd47d4ea890a0f0008ec9035d7fa6699c3c7bbbb3c798b01b3e0077d"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowMoreRow.tsx",
    "sha256": "c91917433f68fd0da9924da409d10598d82db5ed5220c43589d37c23e23cf6b4"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowRoll.tsx",
    "sha256": "26dde7267510ac0cbd3603fa51bfa0fb660c42d82f640396614f94c070da122b"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowRosterParts.tsx",
    "sha256": "35a3087060d8555496f4deb37ee3fd10217051b01c2531a4270ba3d9a4bab8d5"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowStationMeta.tsx",
    "sha256": "73c9369cb680c66f2333f75ea6f929df6876094a598eed83c2d199fa6f907c73"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimeline.tsx",
    "sha256": "22366a579fc2c9f97364d968b9fda4aa0f4d9116630ed4118ff3a1098424354a"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineArcs.tsx",
    "sha256": "42aad2056dffa122713f878a757a98f0ae91a259632fd24fc49e1896d76d5ee9"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineLedge.tsx",
    "sha256": "a0b9c45055cad11ed76adab02b238472d5484671f9b819d3bbb34f55d1ed3320"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineStation.tsx",
    "sha256": "e425b079c940e4e46ea1fce131c2c2243a1f0f3be035c3d13b6b8096b0ad87ad"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineTracks.tsx",
    "sha256": "0118e2745bf3e10d6ec8108a8aec2aa39450ee97e7c6705db005a0223e958d60"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/roster-model.ts",
    "sha256": "2c04955724943f96ab3453d4db8b422e98861cc3e84ff80a8f5ca99ee107a896"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/station-observation.ts",
    "sha256": "34f18519e054accec31ff3ed530a725760efdea3ad6b5e181bdd9113e9aa3e6e"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-bands.ts",
    "sha256": "122906855baec6f35110e651f85b004570e5df9e05be07afeaf091870e3aae8c"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-cache.ts",
    "sha256": "d5ac15bfdca35de05ddc29d97a5fb7bd275d3aad345c84641ee3c0b56ef34d19"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-geometry.ts",
    "sha256": "696a831096a4c654377ace113904cc8143590079f3c813be6f86d7a76e32dd71"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-ledge.ts",
    "sha256": "7097dd6656c821b8775f03653c0eaaa2b2af571af388de86f95d237acab3169d"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-model.ts",
    "sha256": "afa73c15ac0133f1607693976b92fc5300fb8bbbe90acd190d34f8088114af3e"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/use-timeline-viewport.ts",
    "sha256": "ae988ec2729c2f783ea39e3d69431f0db026650e92b5742ffa9dd261d0fcf543"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/use-typewriter.ts",
    "sha256": "315176c8333aca3239cfdd2776251fcc8b078816cd8140cba9386a2d980fc71c"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/workflow-face-motion.ts",
    "sha256": "292c2cad70f9c1a67f7f295da887d665295b489f70f77714b9998479930d947a"
  },
  {
    "path": "packages/ui/src/i18n/locales/en-US.ts",
    "sha256": "ca1ea1321e3de199f7e09864784020041265d2096b56221e352d0742468af1d9"
  },
  {
    "path": "packages/ui/src/i18n/locales/zh-CN.ts",
    "sha256": "7fb2202f7179a24fcbb2b1bc6f820da621fa205f7f6faa4ccd53120734ca9fc6"
  },
  {
    "path": "packages/ui/src/styles.css",
    "sha256": "22d5b58e44cdebdbe7154c418ee05fef6dde689e384f0dd590d4057739487be7"
  }
];

// Reviewed DSH bridge: structural resets precede source utilities; colors follow
// them again so raw theme declarations cannot overwrite host appearance tokens.
const HOST_CSS = `.omaa-zcode-workflow-graph{box-sizing:border-box;min-width:0;width:100%;font-family:inherit;--ui-font-size:14px;--color-foreground:var(--dsw-alias-label-primary);--color-foreground-subtle:var(--dsw-alias-label-secondary);--color-foreground-subtlest:var(--dsw-alias-label-tertiary);--color-foreground-inverse:var(--dsw-alias-bg-base);--color-surface:var(--dsw-alias-bg-layer-1);--color-surface-hover:var(--dsw-alias-interactive-bg-hover);--color-background:var(--dsw-alias-bg-base);--color-border:var(--dsw-alias-border-l2);--color-border-hover:var(--dsw-alias-border-l3);--color-ring:var(--dsw-alias-brand-primary);--color-warning:var(--dsw-alias-state-warn-primary);--color-success:var(--dsw-alias-state-success-primary);--color-destructive:var(--dsw-alias-state-error-primary);--color-workflow-trace:var(--dsw-alias-border-l2);--color-workflow-trace-strong:var(--dsw-alias-label-tertiary);--color-interaction-confirmation-surface:var(--dsw-alias-bg-layer-1);--color-interaction-confirmation-foreground:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary);} .omaa-zcode-workflow-graph *,.omaa-zcode-workflow-graph ::before,.omaa-zcode-workflow-graph ::after{box-sizing:border-box;border-width:0;border-style:solid;} .omaa-zcode-workflow-graph button{margin:0;padding:0;background:transparent;color:inherit;font:inherit;cursor:pointer;} .omaa-zcode-workflow-graph svg{display:block;vertical-align:middle;} .omaa-zcode-workflow-graph h4,.omaa-zcode-workflow-graph p{margin:0;font-size:inherit;font-weight:inherit;} .omaa-zcode-workflow-graph .omaa-zcode-phase-pane{display:flex;flex-direction:column;min-height:0;max-height:480px;margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2);overflow:hidden;}
`;
const CSS_HEADER = '/* Generated from fixed Apache-2.0 ZCode 29628c9 workflow UI CSS and its exact 37-source Tailwind 4.2.2 utility candidates. Host mapping and scope only; see THIRD_PARTY_NOTICES.md. */\n';

// Keep this host seam visible and reviewable. It mirrors only the original
// formatMessage contract consumed by this graph; DSH still owns language settings.
const INTL_BRIDGE = `import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { zcodeGraphMessages } from './zcode-workflow-graph-messages.mjs';

const GraphIntl = createContext(null);
const hostLocale = () => typeof document === 'undefined' ? 'zh-CN' : document.documentElement.lang || 'zh-CN';
const subscribeLocale = listener => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
};
const normalizeLocale = locale => /^en(?:-|$)/i.test(locale || '') ? 'en-US' : 'zh-CN';
const instance = locale => ({
  // Same public formatting contract and replacement policy as the original
  // ZCode IntlProvider. Locale settings and service ownership stay with DSH.
  formatMessage({ id }, values) {
    let text = zcodeGraphMessages[locale][id] ?? id;
    if (values) for (const [key, value] of Object.entries(values)) text = text.replaceAll(\`{\${key}}\`, String(value));
    return text;
  },
});

export function ZCodeGraphIntlProvider({ children, locale }) {
  const existing = useSyncExternalStore(subscribeLocale, hostLocale, () => 'zh-CN');
  const language = normalizeLocale(locale || existing);
  const value = useMemo(() => ({ locale: language, intl: instance(language) }), [language]);
  return <GraphIntl.Provider value={value}>{children}</GraphIntl.Provider>;
}

export function useZCodeIntl() {
  const value = useContext(GraphIntl);
  if (!value) throw new Error('ZCode workflow graph requires its locale provider.');
  return value;
}
`;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function verifiedSources() {
  const metadata = JSON.parse(await readFile(SOURCE_METADATA, 'utf8'));
  if (metadata.commit !== COMMIT) throw new Error(`ZCode graph source must be fixed at ${COMMIT}.`);
  const manifest = new Map(metadata.files.map(entry => [entry.path, entry]));
  const sources = new Map();
  for (const pin of PINS) {
    const entry = manifest.get(pin.path);
    if (!entry || entry.sha256 !== pin.sha256) throw new Error(`Source manifest differs from fixed graph pin: ${pin.path}`);
    const bytes = await readFile(path.join(SNAPSHOTS, pin.path));
    if (sha256(bytes) !== pin.sha256 || bytes.length !== entry.bytes) throw new Error(`Raw source hash/size mismatch: ${pin.path}`);
    sources.set(pin.path, bytes.toString('utf8'));
  }
  return sources;
}

function runtimeClosure(sources) {
  const visited = new Set(), pending = ENTRIES.map(entry => UI_PREFIX + entry);
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    const text = sources.get(file);
    if (text === undefined) throw new Error(`Runtime graph dependency is not a verified snapshot: ${file}`);
    visited.add(file);
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of parsed.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
      } else if (node.isTypeOnly) continue;
      const name = node.moduleSpecifier.text;
      if (name === '@/i18n/IntlProvider.js') continue; // reviewed bridge above
      if (!name.startsWith('.') && !name.startsWith('@/')) continue; // normal React/icon/class utilities
      const target = name.startsWith('@/') ? UI_PREFIX + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      const resolved = [target, target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx')].find(candidate => sources.has(candidate));
      if (!resolved) throw new Error(`Unpinned runtime import ${name} in ${file}`);
      pending.push(resolved);
    }
  }
  if (visited.size !== 37) throw new Error(`The fixed graph runtime closure must contain 37 files; got ${visited.size}.`);
  return [...visited].sort();
}

function sourceVocabulary(files, sources) {
  const candidates = new Set(), exactMessages = new Set(), messagePrefixes = new Set();
  const messageKey = /^(chat\.toolCall\.workflow\.|sidePane\.time\.)/;
  for (const file of files) {
    const parsed = ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true);
    const walk = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const token of node.text.split(/\s+/)) if (token) candidates.add(token);
        if (ts.isStringLiteral(node) && messageKey.test(node.text)) exactMessages.add(node.text);
      }
      if (ts.isTemplateExpression(node) && messageKey.test(node.head.text)) messagePrefixes.add(node.head.text);
      ts.forEachChild(node, walk);
    };
    walk(parsed);
  }
  return { candidates, exactMessages, messagePrefixes };
}

function messageAsset(sources, { exactMessages, messagePrefixes }) {
  const dictionaries = {};
  for (const locale of ['zh-CN', 'en-US']) {
    const file = UI_PREFIX + `i18n/locales/${locale}.ts`;
    const parsed = ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true);
    const dictionary = {};
    const walk = node => {
      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) {
        const key = node.name.text;
        if (exactMessages.has(key) || [...messagePrefixes].some(prefix => key.startsWith(prefix))) dictionary[key] = node.initializer.text;
      }
      ts.forEachChild(node, walk);
    };
    walk(parsed);
    dictionaries[locale] = dictionary;
  }
  return '// Derived from fixed Apache-2.0 ZCode 29628c9 locale entries; see THIRD_PARTY_NOTICES.md.\nexport const zcodeGraphMessages = ' + JSON.stringify(dictionaries, null, 2) + ';\n';
}

function buildRuntime(runtimePath) {
  const request = runtimePath ? createRequire(path.resolve(runtimePath, 'package.json')) : createRequire(import.meta.url);
  for (const [name, expected] of [['tailwindcss', '4.2.2'], ['postcss', '8.5.6']]) {
    let manifest;
    try { manifest = request(`${name}/package.json`); }
    catch { throw new Error(`Missing build-only ${name}@${expected}. Install it as a devDependency or pass --css-runtime with an isolated install; see this script's CLI documentation.`); }
    if (manifest.version !== expected) throw new Error(`Use build-only ${name}@${expected}; found ${manifest.version}.`);
  }
  return { tailwind: request('tailwindcss'), postcss: request('postcss'), themePath: request.resolve('tailwindcss/theme.css') };
}

function scopeRules(tree) {
  tree.walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
      if (parent.type === 'rule' && parent.selector.includes(WRAPPER)) return;
    }
    if (rule.selector.includes(WRAPPER)) return;
    rule.selector = rule.selector === ':root, :host' ? WRAPPER : rule.selectors.map(selector => `${WRAPPER} ${selector}`).join(', ');
  });
}

function isolateAnimationNames(tree) {
  const names = new Map();
  tree.walkAtRules(/keyframes$/, rule => {
    const name = rule.params;
    const replacement = `omaa-zcode-graph-${name}`;
    names.set(name, replacement); rule.params = replacement;
  });
  tree.walkDecls(declaration => {
    for (const [name, replacement] of names) {
      // A bare animation name is renamed; var(--wf-beat) and blink-time remain
      // original public motion inputs, including JS-written duration properties.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      declaration.value = declaration.value.replace(new RegExp(`(?<![-\\w])${escaped}(?![-\\w])`, 'g'), replacement);
    }
  });
}

async function cssAsset(sources, candidates, runtimePath) {
  const { tailwind, postcss, themePath } = buildRuntime(runtimePath);
  const source = postcss.parse(sources.get(UI_PREFIX + 'styles.css'));
  const theme = source.nodes.find(node => node.type === 'atrule' && node.name === 'theme');
  const first = source.nodes.findIndex(node => node.type === 'rule' && node.selector === '.wf-rail-march::after');
  const last = source.nodes.findIndex((node, index) => index > first && node.type === 'comment' && node.text.includes('Mention 图标'));
  if (!theme || first < 0 || last < 0) throw new Error('The fixed source theme/workflow style boundaries are missing.');
  const compiled = await tailwind.compile(await readFile(themePath, 'utf8') + theme.toString() + `${WRAPPER}{@tailwind utilities;}`);
  const utility = postcss.parse(compiled.build([...candidates]));
  const workflow = postcss.root({ nodes: source.nodes.slice(first, last).map(node => node.clone()) });
  scopeRules(utility); scopeRules(workflow);
  isolateAnimationNames(utility); isolateAnimationNames(workflow);
  const styles = (utility.toString() + '\n' + workflow.toString()).replaceAll('--tw-', '--omaa-zcode-graph-tw-');
  const trailingHostColors = HOST_CSS.slice(0, HOST_CSS.indexOf(` ${WRAPPER} *`));
  const transformed = await transform(HOST_CSS + styles + '\n' + trailingHostColors, { loader: 'css', target: 'es2022' });
  return CSS_HEADER + transformed.code;
}

export async function generateZCodeGraphUiAssets({ runtimePath } = {}) {
  const sources = await verifiedSources();
  const files = runtimeClosure(sources);
  const vocabulary = sourceVocabulary(files, sources);
  return new Map([
    ['zcode-workflow-graph.css', await cssAsset(sources, vocabulary.candidates, runtimePath)],
    ['zcode-workflow-graph-messages.mjs', messageAsset(sources, vocabulary)],
    ['zcode-workflow-graph-intl.jsx', INTL_BRIDGE],
  ]);
}

export async function buildZCodeGraphUiAssets({ mode = 'check', outputDir = CLIENT, runtimePath } = {}) {
  if (mode !== 'check' && mode !== 'write') throw new Error('Graph asset mode must be check or write.');
  const assets = await generateZCodeGraphUiAssets({ runtimePath });
  if (mode === 'write') await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const [name, text] of assets) {
    const target = path.resolve(outputDir, name);
    if (mode === 'write') await writeFile(target, text);
    else {
      const existing = await readFile(target, 'utf8');
      if (existing !== text) throw new Error(`Generated graph asset differs: ${target}. Generate with --output-dir for review before --write.`);
    }
    results.push({ path: target, bytes: Buffer.byteLength(text), sha256: sha256(text) });
  }
  return results;
}

async function main(args) {
  let mode = 'check', outputDir = CLIENT, runtimePath;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check') mode = 'check';
    else if (arg === '--write') mode = 'write';
    else if (arg === '--output-dir') { outputDir = args[++index]; mode = 'write'; if (!outputDir) throw new Error('--output-dir requires a directory.'); }
    else if (arg === '--css-runtime') { runtimePath = args[++index]; if (!runtimePath) throw new Error('--css-runtime requires an install directory.'); }
    else if (arg === '--help') { console.log('Usage: node scripts/build-zcode-graph-ui-assets.mjs [--check | --write | --output-dir DIR] [--css-runtime DIR]\nDefault: read-only --check. CSS build tools: tailwindcss@4.2.2 and postcss@8.5.6, dev-only or isolated install.'); return; }
    else throw new Error(`Unknown option: ${arg}`);
  }
  const results = await buildZCodeGraphUiAssets({ mode, outputDir, runtimePath });
  console.log(`Graph assets ${mode === 'check' ? 'verified' : 'generated'} from fixed ${COMMIT.slice(0, 7)} (${PINS.length} raw sources, 37 runtime files).`);
  for (const result of results) console.log(`${result.bytes} B ${result.sha256} ${result.path}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
