import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream/apps/zcode-cli/packages');
const banner = '// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.\n';

function replaceImport(source, from, to) {
  const literal = JSON.stringify(from);
  if (!source.includes(literal)) throw new Error('Fixed world-read import was not found: ' + from);
  return source.replaceAll(literal, JSON.stringify(to));
}

// Named original declarations only: no NodeFs adapter, IO walker, Worker or
// injected storage/execution implementation enters this generated module.
const fsHelperFunctions = [
  'createGlobMatcher', 'normalizeGlobPattern', 'globPatternToRegExp', 'escapeRegExp', 'toPosixRelative',
  'createRipgrepSearchPlan', 'addRipgrepContextArgs', 'addRipgrepGlobArgs', 'splitRipgrepGlobPatterns',
  'addRipgrepTypeArgs', 'fileTypeGlobPatterns', 'normalizeFileType',
  'parseRipgrepJsonOutput', 'parseRipgrepCountOutput', 'finishTextSearchResult', 'splitOutputLines',
  'parseRipgrepJsonEvent', 'createTextResultFilter', 'resolveRipgrepOutputPath', 'stripTrailingLineEnding',
  'createOnlyMatchingEntries', 'toRipgrepFileSystemError', 'compileSearchRegex', 'applyHeadLimit', 'matchesFileType',
];
const fsHelperConstants = ['VCS_DIRECTORIES_TO_EXCLUDE', 'DEFAULT_GREP_HEAD_LIMIT', 'TYPE_EXTENSION_MAP'];
async function buildFileSystemHelpers(outputRoot) {
  const original = await readFile(join(snapshots, 'adapters/src/fs/index.ts'), 'utf8');
  const parsed = ts.createSourceFile('zcode-fs-original.ts', original, ts.ScriptTarget.Latest, true);
  const wanted = new Set([...fsHelperFunctions, ...fsHelperConstants]), found = new Set(), declarations = [];
  for (const statement of parsed.statements) {
    const names = ts.isFunctionDeclaration(statement) && statement.name ? [statement.name.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(declaration => ts.isIdentifier(declaration.name) ? declaration.name.text : '') : [];
    if (!names.some(name => wanted.has(name))) continue;
    if (names.some(name => !wanted.has(name))) throw new Error('Mixed pure/IO declaration in the fixed FS helper source');
    if (ts.isFunctionDeclaration(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) throw new Error('Unexpected async IO helper');
    names.forEach(name => found.add(name));
    declarations.push(statement.getFullText(parsed));
  }
  for (const name of wanted) if (!found.has(name)) throw new Error('Fixed filesystem helper was not found: ' + name);
  const header = 'import { basename, dirname, extname, isAbsolute, join, normalize, relative, sep } from "node:path";\n'
    + 'import { createFileSystemError } from "./zcode-fs-contracts.mjs";\n';
  const source = header + declarations.join('\n') + '\nexport { ' + [...wanted].join(', ') + ' };\nexport * from "./zcode-text-metadata.mjs";';
  const outputs = [];
  for (const [input, output, adapt] of [
    ['contracts/src/interfaces/file-system.port.ts', 'zcode-fs-contracts.mjs', value => value],
    ['adapters/src/fs/text-metadata.ts', 'zcode-text-metadata.mjs', value => replaceImport(value, '@zcode/contracts', './zcode-fs-contracts.mjs')],
  ]) {
    const generated = await transform(adapt(await readFile(join(snapshots, input), 'utf8')), { loader: 'ts', format: 'esm', target: 'es2022' });
    const target = join(outputRoot, output);
    await writeFile(target, banner + generated.code);
    outputs.push(target);
  }
  const generated = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const target = join(outputRoot, 'zcode-fs-helpers.mjs');
  await writeFile(target, banner + generated.code);
  outputs.push(target);
  return outputs;
}

export async function buildZCodeWorldReads() {
  const outputRoot = join(root, 'lib');
  await mkdir(outputRoot, { recursive: true });
  // The only engine-folder code is the pure error class. Its imports are type
  // only and disappear; both generated readers share one class identity.
  const sharedPath = join(outputRoot, 'zcode-world-shared.mjs');
  const shared = await build({
    stdin: { contents: 'export { WORLD_READ_CAPS } from "./facade/world-read-caps.js";\nexport { WorkflowError } from "./engine/errors.js";',
      sourcefile: 'zcode-world-shared.ts', resolveDir: join(snapshots, 'dynamic-workflow/src'), loader: 'ts' },
    outfile: sharedPath, bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false, metafile: true,
    banner: { js: banner.trimEnd() },
    plugins: [{ name: 'pure-world-error', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const target = resolve(args.resolveDir, args.path).replace(/\.js$/, '.ts');
        if (![join(snapshots, 'dynamic-workflow/src/facade/world-read-caps.ts'), join(snapshots, 'dynamic-workflow/src/engine/errors.ts')].includes(target)) {
          throw new Error('Unexpected world-read runtime dependency: ' + args.path);
        }
      });
    } }],
  });
  const sharedOutput = shared.outputFiles.find(file => file.path === sharedPath);
  if (!sharedOutput) throw new Error('Pure WorkflowError module was not generated');
  await writeFile(sharedPath, sharedOutput.contents);

  const outputs = [sharedPath];
  for (const [input, output] of [
    ['workflow-git-world-read.ts', 'zcode-git-world-read.mjs'],
    ['workflow-world-read.ts', 'zcode-world-read.mjs'],
  ]) {
    let source = await readFile(join(snapshots, 'bootstrap/src/app', input), 'utf8');
    source = replaceImport(source, '@zcode/dynamic-workflow', './zcode-world-shared.mjs');
    if (input === 'workflow-world-read.ts') source = replaceImport(source, './workflow-git-world-read.js', './zcode-git-world-read.mjs');
    const generated = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
    const target = join(outputRoot, output);
    await writeFile(target, banner + generated.code);
    outputs.push(target);
  }
  outputs.push(...await buildFileSystemHelpers(outputRoot));
  return { outputs, sharedExports: Object.values(shared.metafile.outputs)[0].exports };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeWorldReads();
  process.stdout.write('Built ZCode world-read modules: ' + result.outputs.length + ' pure derived files\n');
}
