import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = join(root, 'src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src');
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

export async function buildZCodeWorkflowCompiler() {
  const original = await readFile(join(sourceRoot, 'index.ts'), 'utf8');
  const file = ts.createSourceFile('index.ts', original, ts.ScriptTarget.Latest, true);
  // Keep the real public export names/signatures; omit the original engine barrel.
  const declarations = file.statements.filter(statement => ts.isExportDeclaration(statement)
    && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && pureModule.test(statement.moduleSpecifier.text));
  if (!declarations.length) throw new Error('Fixed ZCode pure compiler exports were not found');
  const entry = declarations.map(statement => statement.getText(file)).join('\n')
    + '\nexport { SchemaEmitter, SchemaRejection } from "./schema/emit.js";'
    + '\nexport { projectSiteGraph } from "./analysis/graph.js";'
    + '\nexport { projectCausalityGraph } from "./analysis/causality-graph.js";';
  const stdlib = await embeddedLibs(), output = join(root, 'lib/zcode-workflow-compiler.mjs');
  await mkdir(dirname(output), { recursive: true });
  const result = await build({
    stdin: { contents: entry, sourcefile: 'zcode-compiler-entry.ts', resolveDir: sourceRoot, loader: 'ts' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['typescript'],
    metafile: true, write: false,
    banner: { js: '// Derived from fixed Apache-2.0 ZCode compiler/analysis/schema/lowering sources; see THIRD_PARTY_NOTICES.md.' },
    plugins: [{ name: 'zcode-pure-compiler', setup(builder) {
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
  await writeFile(output, fileOutput.contents);
  return { output, stdlibFiles: stdlib.count, exports: Object.values(result.metafile.outputs)[0].exports };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeWorkflowCompiler();
  process.stdout.write('Built ZCode workflow compiler: ' + result.exports.length + ' exports, ' + result.stdlibFiles + ' embedded TypeScript libs\n');
}
