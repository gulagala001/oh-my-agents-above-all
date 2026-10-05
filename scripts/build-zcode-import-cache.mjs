import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream');
const engine = 'apps/zcode-cli/packages/dynamic-workflow/src/engine/';
const sharedImport = './zcode-artifact-shared.mjs';
const digests = {
  'imported-cache.ts': '775a419c91870ad59015f73567490309663ea1a93ff3f787519a591e15bb5604',
  'engine.ts': 'f558bccaef46114ce5477b449e76d91f33ad8635419104a569763b90617b3d74',
  'hash.ts': '9b96aac60af892ee7bea42bf685f714a637535569afe8a1231040568df83c427',
};
const expectedExports = ['ImportedActorState', 'ImportedWorldQueue', 'canonicalJson',
  'importedAskRecord', 'inputHash', 'matchImportedActor', 'normalizePersona'].sort();

function parse(source, name, kind = ts.ScriptKind.TS) {
  const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind);
  if (parsed.parseDiagnostics.length) throw new Error('Invalid fixed import-cache source: ' + name);
  return parsed;
}

function declaration(parsed, name) {
  const matches = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && statement.name?.text === name);
  if (matches.length !== 1 || !matches[0].body
    || matches[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
    throw new Error('Fixed pure declaration missing: ' + name);
  }
  return matches[0];
}

// Only rewrite the original runtime import's module token. All class and
// function bodies remain the complete upstream declarations.
function adaptCache(source) {
  const parsed = parse(source, 'imported-cache.ts');
  const imports = parsed.statements.filter(ts.isImportDeclaration);
  if (imports.length !== 2) throw new Error('Unexpected fixed import-cache imports');
  const hash = imports.find(statement => statement.moduleSpecifier.text === './hash.js');
  const types = imports.find(statement => statement.moduleSpecifier.text === './types.js');
  if (!hash || hash.importClause?.isTypeOnly || hash.importClause?.name
    || !hash.importClause?.namedBindings || !ts.isNamedImports(hash.importClause.namedBindings)
    || hash.importClause.namedBindings.elements.length !== 1
    || hash.importClause.namedBindings.elements[0].name.text !== 'canonicalJson'
    || hash.importClause.namedBindings.elements[0].propertyName
    || !types?.importClause?.isTypeOnly) {
    throw new Error('Unexpected fixed import-cache dependency surface');
  }
  return source.slice(0, hash.moduleSpecifier.getStart(parsed)) + JSON.stringify(sharedImport)
    + source.slice(hash.moduleSpecifier.end);
}

function runtimeSurface(source) {
  const parsed = parse(source, 'zcode-import-cache.mjs', ts.ScriptKind.JS);
  const exports = [], dependencies = [];
  for (const statement of parsed.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier) {
      if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== sharedImport) {
        throw new Error('Unexpected import-cache runtime dependency');
      }
      dependencies.push(statement.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      exports.push(...statement.exportClause.elements.map(element => element.name.text));
    }
    if (ts.isClassDeclaration(statement) && statement.name?.text !== 'ImportedActorState'
      && statement.name?.text !== 'ImportedWorldQueue') throw new Error('Unexpected import-cache runtime class');
  }
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      throw new Error('Unexpected dynamic import-cache dependency');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (dependencies.length !== 2 || JSON.stringify(exports.sort()) !== JSON.stringify(expectedExports)) {
    throw new Error('Unexpected import-cache runtime export surface');
  }
  return exports;
}

export async function buildZCodeImportCache() {
  // Read and validate every input before writing. engine.ts is only an opaque
  // fixed snapshot: its imports and WorkflowEngine implementation never enter
  // the generated module; AST extraction selects only normalizePersona.
  const inputs = await Promise.all(Object.entries(digests).map(async ([name, digest]) => {
    const bytes = await readFile(join(snapshots, engine + name));
    if (createHash('sha256').update(bytes).digest('hex') !== digest) {
      throw new Error('Fixed import-cache SHA-256 mismatch: ' + name);
    }
    return [name, bytes.toString('utf8')];
  }));
  const originals = Object.fromEntries(inputs);
  const shared = parse(await readFile(join(root, 'lib/zcode-artifact-shared.mjs'), 'utf8'), 'artifact-shared.mjs', ts.ScriptKind.JS);
  const originalHash = parse((await transform(originals['hash.ts'], {
    loader: 'ts', format: 'esm', target: 'es2022',
  })).code, 'hash.mjs', ts.ScriptKind.JS);
  for (const name of ['canonicalJson', 'fnv1a', 'inputHash']) {
    if (declaration(originalHash, name).getText(originalHash) !== declaration(shared, name).getText(shared)) {
      throw new Error('Shared artifact hash differs from fixed source: ' + name);
    }
  }
  const parsedEngine = parse(originals['engine.ts'], 'engine.ts');
  const persona = declaration(parsedEngine, 'normalizePersona');
  const source = adaptCache(originals['imported-cache.ts']) + '\n'
    + persona.getFullText(parsedEngine) + '\nexport { normalizePersona };\n'
    + 'export { canonicalJson, inputHash } from ' + JSON.stringify(sharedImport) + ';\n';
  const result = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const exports = runtimeSurface(result.code);
  const output = join(root, 'lib/zcode-import-cache.mjs');
  await mkdir(join(root, 'lib'), { recursive: true });
  await writeFile(output, '// Derived from fixed Apache-2.0 ZCode import-cache sources at 29628c9; see THIRD_PARTY_NOTICES.md.\n' + result.code);
  return { outputs: [output], exports: { [output]: exports } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeImportCache();
  process.stdout.write('Built ZCode import-cache modules: ' + result.outputs.length + ' derived files\n');
}
