import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream-3.15.1');
const sourceRoot = join(snapshots, 'apps/zcode-cli/packages/dynamic-workflow/src');
const pureModule = /^\.\/(compiler|analysis|schema|lowering|facade)\//;

// Same stdlib reference closure as the fixed upstream generate-libs.mjs. The
// generated module is virtual: never write into immutable official snapshots.
async function embeddedLibs() {
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('typescript/package.json');
  const { version } = JSON.parse(await readFile(packageFile, 'utf8'));
  if (version !== '5.9.3') throw new Error('ZCode compiler requires fixed typescript@5.9.3');
  const directory = join(dirname(packageFile), 'lib'), libs = {}, seen = new Set(), queue = ['lib.es2022.d.ts'];
  const reference = /\/\/\/\s*<reference\s+lib\s*=\s*["']([^"']+)["']\s*\/>/g;
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const text = await readFile(join(directory, name), 'utf8');
    libs[name] = text;
    reference.lastIndex = 0;
    let match;
    while ((match = reference.exec(text)) !== null) queue.push('lib.' + match[1] + '.d.ts');
  }
  const entries = Object.keys(libs).sort().map(name => JSON.stringify(name) + ': ' + JSON.stringify(libs[name])).join(',\n');
  return { count: seen.size, contents: 'export const TS_LIB_VERSION = ' + JSON.stringify(version) + ';\nexport const TS_LIBS = {\n' + entries + '\n};' };
}

function adaptAnalysis(source) {
  if (createHash('sha256').update(source).digest('hex') !== '2321a47ca2c9b84036c89e157bb6b369fb6ef572dd6d7f10dbe2900471f9282a') {
    throw new Error('Fixed ZCode analysis source changed');
  }
  const file = ts.createSourceFile('analyze.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'analyzeWorkflowScript');
  const declaration = declarations[0], first = declaration?.body?.statements[0];
  if (file.parseDiagnostics.length || declarations.length !== 1 || declaration.parameters.length !== 1
    || declaration.parameters[0].getText(file) !== 'scriptText: string' || declaration.type?.getText(file) !== 'AnalyzeResult'
    || !first || first.getText(file) !== 'const workflow = createWorkflowProgram(scriptText);') {
    throw new Error('Fixed ZCode analysis entry changed');
  }
  // Keep the complete original analysis body. Only its Program construction moves
  // to the caller so schema synthesis and lowering can use that same invocation.
  const body = source.slice(first.end, declaration.body.end - 1);
  const replacement = 'export function analyzeWorkflowScript(scriptText: string): AnalyzeResult {\n'
    + '  return analyzeWorkflowProgram(createWorkflowProgram(scriptText));\n}\n'
    + 'export function analyzeWorkflowProgram(workflow: ReturnType<typeof createWorkflowProgram>): AnalyzeResult {' + body + '}';
  return source.slice(0, declaration.getStart(file)) + replacement + source.slice(declaration.end);
}

export async function buildZCodeWorkflowCompiler() {
  const manifest = JSON.parse(await readFile(join(snapshots, 'source.json'), 'utf8'));
  if (manifest.commit !== 'aac4755666d09fdcd70272fcf063c077a639015f') throw new Error('Unexpected ZCode compiler source commit');
  for (const row of manifest.files) {
    const bytes = await readFile(join(snapshots, row.path));
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('Fixed ZCode 3.15.1 compiler source changed: ' + row.path);
  }
  const original = await readFile(join(sourceRoot, 'index.ts'), 'utf8');
  const file = ts.createSourceFile('index.ts', original, ts.ScriptTarget.Latest, true);
  // Keep the real public export names/signatures; omit the original engine barrel.
  const declarations = file.statements.filter(statement => ts.isExportDeclaration(statement)
    && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && pureModule.test(statement.moduleSpecifier.text));
  if (!declarations.length) throw new Error('Fixed ZCode pure compiler exports were not found');
  const entry = declarations.map(statement => statement.getText(file)).join('\n')
    + '\nexport { SchemaEmitter, SchemaRejection } from "./schema/emit.js";'
    + '\nexport { resolveSymbol, isFacadeDeclared } from "./analysis/sites.js";'
    + '\nexport { valueFunctionOfSymbol } from "./facade/registry.js";'
    + '\nexport { projectSiteGraph } from "./analysis/graph.js";'
    + '\nexport { projectCausalityGraph } from "./analysis/causality-graph.js";'
    + '\nexport { analyzeWorkflowProgram } from "./analysis/analyze.js";';
  const stdlib = await embeddedLibs(), output = join(root, 'lib/zcode-workflow-compiler.mjs');
  await mkdir(dirname(output), { recursive: true });
  const result = await build({
    stdin: { contents: entry, sourcefile: 'zcode-compiler-entry.ts', resolveDir: sourceRoot, loader: 'ts' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['typescript'],
    metafile: true, write: false,
    banner: { js: '// Derived from fixed Apache-2.0 ZCode compiler/analysis/schema/lowering sources; see THIRD_PARTY_NOTICES.md.' },
    plugins: [{ name: 'zcode-pure-compiler', setup(builder) {
      builder.onLoad({ filter: /analyze[.]ts$/ }, async args => {
        if (args.path !== join(sourceRoot, 'analysis/analyze.ts')) throw new Error('Unexpected ZCode analysis input');
        return { contents: adaptAnalysis(await readFile(args.path, 'utf8')), loader: 'ts' };
      });
      builder.onResolve({ filter: /libs\.generated\.js$/ }, args => {
        if (args.importer !== join(sourceRoot, 'compiler/compile.ts')) throw new Error('Unexpected embedded stdlib importer');
        return { path: 'typescript-es2022', namespace: 'zcode-stdlib' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'zcode-stdlib' }, () => ({ contents: stdlib.contents, loader: 'js' }));
      builder.onResolve({ filter: /^[^./]/ }, args => {
        if (args.path === 'typescript') return { path: 'typescript', external: true };
        throw new Error('Unexpected ZCode compiler runtime dependency: ' + args.path);
      });
      builder.onResolve({ filter: /^\./ }, args => {
        const target = resolve(args.resolveDir, args.path).replace(/\.js$/, '.ts');
        const module = relative(sourceRoot, target).replaceAll('\\', '/');
        if (!/^(compiler|analysis|schema|lowering|facade)\//.test(module) && module !== 'engine/hash.ts') {
          throw new Error('Non-pure ZCode compiler dependency: ' + module);
        }
      });
    } }],
  });
  const fileOutput = result.outputFiles.find(file => file.path === output);
  if (!fileOutput) throw new Error('ZCode compiler bundle was not emitted');
  const validator = await readFile(join(sourceRoot, 'schema/validate.ts'), 'utf8');
  if (createHash('sha256').update(validator).digest('hex') !== '915fd213e12d521ed585f061aa04e9c4777c6813457fcdf54d6da3acd2c4ec12') throw new Error('Fixed ZCode validator source changed');
  const validation = await build({
    stdin: { contents: validator, sourcefile: 'schema/validate.ts', resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false, metafile: true,
    banner: { js: '// Derived from fixed Apache-2.0 ZCode schema validator; see THIRD_PARTY_NOTICES.md.' },
  });
  if (Object.keys(validation.metafile.inputs).length !== 1) throw new Error('ZCode validator gained runtime dependencies');
  await writeFile(output, fileOutput.contents);
  await writeFile(join(root, 'lib/zcode-workflow-validate.mjs'), validation.outputFiles[0].contents);
  await buildAskProtocol();
  return { output, stdlibFiles: stdlib.count, exports: Object.values(result.metafile.outputs)[0].exports };
}

// Keep the fixed scheduler's schema normalization, repair and nudge decisions.
// Only its small pure seam is used; DSH continues to own every actual turn.
async function buildAskProtocol() {
  const app = join(snapshots, 'apps/zcode-cli/packages/bootstrap/src/app');
  const manifest = JSON.parse(await readFile(join(root, 'src/presets/zcode/sources/build-inputs.json'), 'utf8'));
  const paths = [join(sourceRoot, 'engine/scheduler-submit.ts'), join(sourceRoot, 'engine/types.ts'),
    join(sourceRoot, 'engine/errors.ts'), join(app, 'workflow-driver-helpers.ts'), join(app, 'workflow-ask-epilogue.ts')];
  const sources = new Map();
  for (const path of paths) {
    const bytes = await readFile(path), row = manifest.files.find(row => row.file === relative(root, path));
    if (!row || row.bytes !== bytes.length || row.sha256 !== createHash('sha256').update(bytes).digest('hex')
      || row.gitBlobSha1 !== createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'))
      throw Error('Fixed ZCode ask source changed: ' + path);
    sources.set(path, bytes.toString('utf8'));
  }
  const selectConstants = (path, names) => {
    const file = ts.createSourceFile(path, sources.get(path), ts.ScriptTarget.Latest, true);
    const nodes = file.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.length === 1 && names.includes(node.declarationList.declarations[0].name.getText(file)));
    if (nodes.length !== names.length) throw Error('Fixed ZCode ask constants changed.');
    return nodes.map(node => node.getText(file)).join('\n');
  };
  const constants = selectConstants(paths[1], ['REPAIR_ATTEMPTS', 'NUDGE_ATTEMPTS']);
  const nudge = selectConstants(paths[3], ['NUDGE_PROMPT']);
  const result = await build({
    stdin: { contents: `export * from './engine/scheduler-submit.js';\nexport * from './engine/errors.js';\n${constants}\n${nudge}\n`
      + `export { qualityEpilogue } from ${JSON.stringify(paths[4])};`, resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', target: 'node22', format: 'esm', write: false,
    banner: { js: '// Fixed ZCode 3.15.1 ask protocol (Apache-2.0). See build-inputs.json and THIRD_PARTY_NOTICES.md.' },
    plugins: [{ name: 'zcode-ask-seam', setup(builder) {
      builder.onResolve({ filter: /^\.\/types\.js$/ }, args => {
        if (args.importer !== paths[0]) throw Error('Unexpected ZCode ask type importer.');
        return { path: 'ask-types', namespace: 'zcode-ask' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'zcode-ask' }, () => ({ contents: constants
        + `\nexport { WorkflowError } from ${JSON.stringify(paths[2])};`, loader: 'ts', resolveDir: sourceRoot }));
      builder.onLoad({ filter: /\.ts$/ }, args => {
        if (!sources.has(args.path)) throw Error('Unexpected ZCode ask dependency: ' + args.path);
        return { contents: sources.get(args.path), loader: 'ts' };
      });
    } }],
  });
  await writeFile(join(root, 'lib/zcode-ask-protocol.mjs'), result.outputFiles[0].contents);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeWorkflowCompiler();
  process.stdout.write('Built ZCode workflow compiler: ' + result.exports.length + ' exports, ' + result.stdlibFiles + ' embedded TypeScript libs\n');
}
