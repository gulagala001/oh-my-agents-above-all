import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream');
const cli = 'apps/zcode-cli/packages/';
const engine = cli + 'dynamic-workflow/src/engine/';
const facade = cli + 'dynamic-workflow/src/facade/';
const presets = 'packages/ui/src/app-shell/workflow-artifacts/presets/';
const banner = '// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.\n';

// This allowlist pins exactly the reviewed files. No engine barrel, scheduler,
// NodeFs implementation, provider or account source is loaded by this builder.
const digests = {
  [facade + 'artifact-caps.ts']: '2370e966732e519248a89c73c40cad8bcd0d9c15d5a029d1cb309922e395b7ae',
  [facade + 'report-caps.ts']: '8cde4b9fc763cd5263582800e5fc38259c128f061f581ae9e2840bee459a1a54',
  [engine + 'hash.ts']: '9b96aac60af892ee7bea42bf685f714a637535569afe8a1231040568df83c427',
  [cli + 'bootstrap/src/app/workflow-artifact-publish.ts']: 'ad1f946f6d126296af3e3b402e90fb46da1755a502bd32a7d0c67130dfffdb63',
  [engine + 'artifact-spec.ts']: 'ab16b674bbcd7e6ea0e49b9bc8af66e87cb76a099971b1d217fc304e31b1fa8e',
  [engine + 'engine-artifacts-primary.ts']: '1987bf40f7e6808172886dbbc086dd2ce970ccd2345916b3c887788cf4a53ec8',
  [engine + 'types.ts']: '9f254e041ca748342b7e891971cfcb9a6d59feda7e160b1368d6e7f5835708b1',
  [presets + 'spec.ts']: 'f1c186a4d47f9b2b4075d87f8e93d10d556a874d0c368e7ec0b8c79335f68369',
  [presets + 'apply.ts']: '8e79182be516d50793de31d7654a4d150d2f31d403d104202111138611eb1070',
  [presets + 'palette.ts']: '3d33cc78767282fbb4d81ffbf154802c37b33e4c65fa635d570602eab2eae4f4',
};

async function original(path) {
  if (!Object.hasOwn(digests, path)) throw new Error('Unreviewed artifact source: ' + path);
  const bytes = await readFile(join(snapshots, path));
  if (createHash('sha256').update(bytes).digest('hex') !== digests[path]) {
    throw new Error('Fixed artifact source SHA-256 mismatch: ' + path);
  }
  return bytes.toString('utf8');
}

// Change only import specifier tokens; never rewrite a function body or constant.
function adaptImports(source, mappings) {
  const parsed = ts.createSourceFile('artifact-original.ts', source, ts.ScriptTarget.Latest, true);
  const found = new Set(), edits = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const from = statement.moduleSpecifier.text;
    if (!Object.hasOwn(mappings, from)) continue;
    found.add(from);
    edits.push({ start: statement.moduleSpecifier.getStart(parsed), end: statement.moduleSpecifier.end,
      text: JSON.stringify(mappings[from]) });
  }
  for (const from of Object.keys(mappings)) {
    if (!found.has(from)) throw new Error('Fixed artifact import was not found: ' + from);
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

// types.ts has many unrelated engine declarations. Extract exactly this original
// pure formatter; type-only names vanish during transpilation.
function extractRefToString(source) {
  const parsed = ts.createSourceFile('artifact-types-original.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'refToString');
  if (declarations.length !== 1 || !declarations[0].body
    || declarations[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
    throw new Error('Fixed pure refToString declaration was not found');
  }
  return declarations[0].getFullText(parsed);
}

function runtimeSurface(source, allowedImports) {
  const parsed = ts.createSourceFile('artifact-generated.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const allowed = new Set(allowedImports), exports = [];
  for (const statement of parsed.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier) {
      if (!ts.isStringLiteral(statement.moduleSpecifier) || !allowed.has(statement.moduleSpecifier.text)) {
        throw new Error('Unexpected artifact runtime dependency: ' + statement.moduleSpecifier.getText(parsed));
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      exports.push(...statement.exportClause.elements.map(element => element.name.text));
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      throw new Error('Unexpected artifact dynamic runtime dependency');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return exports.sort();
}

export async function buildZCodeArtifacts() {
  const outputRoot = join(root, 'lib');
  const sharedImport = './zcode-artifact-shared.mjs';
  const shared = 'export { WorkflowError } from "./zcode-world-shared.mjs";\n'
    + await original(facade + 'artifact-caps.ts') + '\n'
    + await original(facade + 'report-caps.ts') + '\n'
    + await original(engine + 'hash.ts') + '\n'
    + extractRefToString(await original(engine + 'types.ts'));
  const modules = [
    {
      name: 'shared', source: shared, imports: ['./zcode-world-shared.mjs'],
      exports: ['ARTIFACT_CAPS', 'ARTIFACT_ID_PATTERN', 'REPORT_CAPS', 'WorkflowError', 'canonicalJson', 'fnv1a', 'inputHash', 'refToString'],
    },
    {
      name: 'publish',
      source: adaptImports(await original(cli + 'bootstrap/src/app/workflow-artifact-publish.ts'), {
        '@zcode/contracts': './zcode-fs-contracts.mjs',
        '@zcode/dynamic-workflow': sharedImport,
        './workflow-world-read.js': './zcode-world-read.mjs',
      }),
      imports: ['node:fs/promises', 'node:path', './zcode-fs-contracts.mjs', sharedImport, './zcode-world-read.mjs'],
      exports: ['executeArtifactPublish'],
    },
    {
      name: 'spec', source: adaptImports(await original(engine + 'artifact-spec.ts'), {
        '../facade/artifact-caps.js': sharedImport, './hash.js': sharedImport,
      }), imports: [sharedImport], exports: ['validateArtifactSpec'],
    },
    {
      name: 'primary', source: adaptImports(await original(engine + 'engine-artifacts-primary.ts'), {
        './types.js': sharedImport,
      }), imports: [sharedImport], exports: ['primaryArtifactId', 'primaryConflict', 'primaryConflictMessage'],
    },
    {
      name: 'ui-spec', source: await original(presets + 'spec.ts'), imports: [],
      exports: ['parseArtifactPresetSpec', 'chartSeriesFields', 'artifactFieldLabel'],
    },
    {
      name: 'ui-apply', source: adaptImports(await original(presets + 'apply.ts'), {
        '@/app-shell/workflow-artifacts/presets/spec.js': './zcode-artifact-ui-spec.mjs',
      }), imports: ['./zcode-artifact-ui-spec.mjs'], exports: ['applyArtifactItems'],
    },
    {
      name: 'palette', source: await original(presets + 'palette.ts'), imports: [],
      exports: ['ARTIFACT_CHART_MAX_SERIES', 'artifactSeriesColorVar', 'artifactSeriesDash', 'artifactSeriesSymbol'],
    },
  ];
  // Validate every output before touching generated files, so a refused source
  // or dependency never leaves a partially adapted set on disk.
  const generated = [];
  for (const module of modules) {
    const result = await transform(module.source, { loader: 'ts', format: 'esm', target: 'es2022' });
    const exports = runtimeSurface(result.code, module.imports);
    if (JSON.stringify(exports) !== JSON.stringify([...module.exports].sort())) {
      throw new Error('Unexpected artifact export surface: ' + module.name);
    }
    generated.push({ output: join(outputRoot, 'zcode-artifact-' + module.name + '.mjs'),
      code: banner + result.code, exports });
  }
  await mkdir(outputRoot, { recursive: true });
  for (const file of generated) await writeFile(file.output, file.code);
  return { outputs: generated.map(file => file.output),
    exports: Object.fromEntries(generated.map(file => [file.output, file.exports])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeArtifacts();
  process.stdout.write('Built ZCode artifact modules: ' + result.outputs.length + ' derived files\n');
}
