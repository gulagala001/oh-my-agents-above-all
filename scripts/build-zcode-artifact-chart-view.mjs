import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'packages/ui/src/app-shell/workflow-artifacts/presets/ArtifactChartView.tsx';
const SOURCE_SHA256 = '13e8da1a2d359fff9b252434c7eb29cb414b30b5b2b85cd5f671adef229c47c6';
const SOURCE_BLOB = 'ef7071c517935418627d85d3041e4230da68e711';
const SOURCE_BYTES = 12907;
const SOURCE_315_COMMIT = 'aac4755666d09fdcd70272fcf063c077a639015f';
const OUTPUT = join(ROOT, 'src/client/zcode-artifact-chart-view.jsx');
const imports = [
  'react', 'recharts', '@/app-shell/workflow-artifacts/presets/apply.js',
  '@/app-shell/workflow-artifacts/presets/palette.js', '@/app-shell/workflow-artifacts/presets/parts.js',
  '@/components/lib/utils.js', '@/components/ui/chart.js',
].sort();
const fail = message => { throw Error('Fixed artifact chart view: ' + message); };
const identifier = (node, name) => ts.isIdentifier(node) && node.text === name;
const exactNames = (nodes, names) => nodes.length === names.length && nodes.every((node, index) => identifier(node, names[index]));

function adaptModelPort(source) {
  const parsed = ts.createSourceFile(SOURCE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) fail('source parse failed');
  const functions = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'ArtifactChartView');
  if (functions.length !== 1) fail('view declaration changed');
  const view = functions[0];
  if (!view.body || view.parameters.length !== 1 || !view.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) fail('view surface changed');
  const parameter = view.parameters[0];
  if (!ts.isObjectBindingPattern(parameter.name) || !parameter.type || !ts.isTypeLiteralNode(parameter.type) ||
    !exactNames(parameter.name.elements.map(element => element.name), ['spec', 'items', 'compact', 'labels', 'className'])) fail('view props changed');
  const itemType = parameter.type.members.filter(member => ts.isPropertySignature(member) && identifier(member.name, 'items'));
  if (itemType.length !== 1 || parameter.type.members.length !== 5) fail('view prop types changed');
  const models = view.body.statements.filter(statement => ts.isVariableStatement(statement))
    .flatMap(statement => statement.declarationList.declarations).filter(declaration => identifier(declaration.name, 'model'));
  if (models.length !== 1 || !models[0].initializer || !ts.isCallExpression(models[0].initializer)) fail('model memo changed');
  const memo = models[0].initializer;
  if (!identifier(memo.expression, 'useMemo') || memo.arguments.length !== 2 || !ts.isArrowFunction(memo.arguments[0]) ||
    !ts.isBlock(memo.arguments[0].body) || !ts.isArrayLiteralExpression(memo.arguments[1]) ||
    !exactNames(memo.arguments[1].elements, ['spec', 'items'])) fail('model memo arguments changed');
  const first = memo.arguments[0].body.statements[0];
  if (!ts.isVariableStatement(first) || first.declarationList.declarations.length !== 1) fail('model fold declaration changed');
  const built = first.declarationList.declarations[0], call = built.initializer;
  if (!identifier(built.name, 'built') || !call || !ts.isCallExpression(call) || !identifier(call.expression, 'applyArtifactItems') ||
    call.arguments.length !== 3 || !ts.isStringLiteral(call.arguments[0]) || call.arguments[0].text !== 'chart' ||
    !exactNames(call.arguments.slice(1), ['spec', 'items'])) fail('original model fold changed');

  // Four exact AST edits, all within this one view's props/model memo. Every
  // plot, legend, tooltip, palette rule and fallback fold stays original source.
  const edits = [
    { start: parameter.name.elements[1].end, end: parameter.name.elements[1].end, text: ',\n  nativeModel' },
    { start: itemType[0].end, end: itemType[0].end, text: '\n  nativeModel?: ChartModel;' },
    { start: call.getStart(parsed), end: call.end, text: 'nativeModel ?? ' + call.getText(parsed) },
    { start: memo.arguments[1].elements[1].end, end: memo.arguments[1].elements[1].end, text: ', nativeModel' },
  ].sort((left, right) => right.start - left.start);
  let adapted = source;
  for (const edit of edits) adapted = adapted.slice(0, edit.start) + edit.text + adapted.slice(edit.end);
  const check = ts.createSourceFile('adapted-chart.tsx', adapted, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (check.parseDiagnostics.length) fail('adapted port parse failed');
  return adapted;
}

function validateRuntime(source) {
  const parsed = ts.createSourceFile('zcode-artifact-chart-view.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  if (parsed.parseDiagnostics.length) fail('generated JSX parse failed');
  const actualImports = [], exports = [];
  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) fail('invalid runtime import');
      actualImports.push(statement.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) fail('runtime export changed');
      exports.push(...statement.exportClause.elements.map(element => element.name.text));
    }
  }
  if (JSON.stringify(actualImports.sort()) !== JSON.stringify(imports) ||
    JSON.stringify(exports.sort()) !== JSON.stringify(['ArtifactChartView', 'chartPlotPropsEqual', 'default'])) fail('runtime surface changed: ' + JSON.stringify({ imports: actualImports, exports }));
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || identifier(node.expression, 'require'))) fail('dynamic runtime dependency');
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

export async function buildZCodeArtifactChartView({ check = false } = {}) {
  const manifest = JSON.parse(await readFile(join(ROOT, 'src/presets/zcode/sources/source.json'), 'utf8'));
  const rows = manifest.files.filter(row => row.path === SOURCE);
  if (rows.length !== 1 || rows[0].file !== 'sources/upstream/' + SOURCE || rows[0].sha256 !== SOURCE_SHA256 ||
    rows[0].bytes !== SOURCE_BYTES || rows[0].gitBlobSha1 !== SOURCE_BLOB) fail('main manifest source pin changed');
  const bytes = await readFile(join(ROOT, 'src/presets/zcode', rows[0].file));
  const blob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (bytes.length !== SOURCE_BYTES || createHash('sha256').update(bytes).digest('hex') !== SOURCE_SHA256 || blob !== SOURCE_BLOB) fail('source bytes changed');
  // The pinned 3.15.1 GitHub file has this same blob: the retained 3.14.3
  // snapshot is byte-identical. Keep raw source immutable; adapt only this port.
  const adapted = adaptModelPort(bytes.toString('utf8'));
  const generated = await transform(adapted, { loader: 'tsx', jsx: 'preserve', format: 'esm', target: 'es2022' });
  validateRuntime(generated.code);
  const code = '// Derived from pinned Apache-2.0 ArtifactChartView; see THIRD_PARTY_NOTICES.md.\n'
    + `// Source SHA-256 ${SOURCE_SHA256}; byte-identical at ZCode 3.15.1 ${SOURCE_315_COMMIT}.\n`
    + '// Native port: optional nativeModel; all original plot/legend/tooltip and fallback fold preserved.\n' + generated.code;
  if (check) {
    if (await readFile(OUTPUT, 'utf8') !== code) fail('generated view is stale');
  } else await writeFile(OUTPUT, code);
  return { output: OUTPUT, sourceSha256: SOURCE_SHA256, sourceGitBlobSha1: SOURCE_BLOB,
    source315Commit: SOURCE_315_COMMIT, sha256: createHash('sha256').update(code).digest('hex'), bytes: Buffer.byteLength(code) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await buildZCodeArtifactChartView({ check: process.argv.includes('--check') }));
