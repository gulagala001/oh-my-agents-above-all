import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream-3.15.1');
const engine = 'apps/zcode-cli/packages/dynamic-workflow/src/engine/';
const sharedImport = './zcode-artifact-shared.mjs';
const personaImport = './zcode-persona.mjs';
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
  if (imports.length !== 3) throw new Error('Unexpected fixed import-cache imports');
  const hash = imports.find(statement => statement.moduleSpecifier.text === './hash.js');
  const types = imports.find(statement => statement.moduleSpecifier.text === './types.js');
  const persona = imports.find(statement => statement.moduleSpecifier.text === './persona.js');
  if (!hash || hash.importClause?.isTypeOnly || hash.importClause?.name
    || !hash.importClause?.namedBindings || !ts.isNamedImports(hash.importClause.namedBindings)
    || hash.importClause.namedBindings.elements.length !== 1
    || hash.importClause.namedBindings.elements[0].name.text !== 'canonicalJson'
    || hash.importClause.namedBindings.elements[0].propertyName
    || !types?.importClause?.isTypeOnly || persona?.importClause?.isTypeOnly
    || !persona?.importClause?.namedBindings || !ts.isNamedImports(persona.importClause.namedBindings)
    || persona.importClause.namedBindings.elements.length !== 1
    || persona.importClause.namedBindings.elements[0].name.text !== 'personaIdentity') {
    throw new Error('Unexpected fixed import-cache dependency surface');
  }
  const edits = [[hash, sharedImport], [persona, personaImport]].map(([statement, target]) => ({
    start: statement.moduleSpecifier.getStart(parsed), end: statement.moduleSpecifier.end, target,
  })).sort((a, b) => b.start - a.start);
  for (const edit of edits) source = source.slice(0, edit.start) + JSON.stringify(edit.target) + source.slice(edit.end);
  return source;
}

function runtimeSurface(source, expected = expectedExports, expectedDependencies = [sharedImport, personaImport, personaImport, sharedImport]) {
  const parsed = parse(source, 'zcode-import-cache.mjs', ts.ScriptKind.JS);
  const exports = [], dependencies = [];
  for (const statement of parsed.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier) {
      if (!ts.isStringLiteral(statement.moduleSpecifier) || !expectedDependencies.includes(statement.moduleSpecifier.text)) {
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
  if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies) || JSON.stringify(exports.sort()) !== JSON.stringify(expected)) {
    throw new Error('Unexpected import-cache runtime export surface');
  }
  return exports;
}

export async function buildZCodeImportCache() {
  const manifest = JSON.parse(await readFile(join(snapshots, 'import-cache-source.json'), 'utf8'));
  if (manifest.commit !== 'aac4755666d09fdcd70272fcf063c077a639015f') throw new Error('Unexpected import-cache source commit');
  const inputs = await Promise.all(manifest.files.map(async row => {
    const bytes = await readFile(join(snapshots, row.path));
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      throw new Error('Fixed import-cache SHA-256 mismatch: ' + row.path);
    }
    return [row.path.slice(engine.length), bytes.toString('utf8')];
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
  const persona = await transform(originals['persona.ts'], { loader: 'ts', format: 'esm', target: 'es2022' });
  runtimeSurface(persona.code, ['normalizePersona', 'personaIdentity'], []);
  const source = adaptCache(originals['imported-cache.ts']) + '\n'
    + 'export { normalizePersona } from ' + JSON.stringify(personaImport) + ';\n'
    + 'export { canonicalJson, inputHash } from ' + JSON.stringify(sharedImport) + ';\n';
  const result = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const exports = runtimeSurface(result.code);
  const output = join(root, 'lib/zcode-import-cache.mjs');
  const personaOutput = join(root, 'lib/zcode-persona.mjs');
  await mkdir(join(root, 'lib'), { recursive: true });
  const banner = '// Derived from fixed Apache-2.0 ZCode 3.15.1 sources at aac4755; see THIRD_PARTY_NOTICES.md.\n';
  await writeFile(personaOutput, banner + persona.code);
  await writeFile(output, banner + result.code);
  return { outputs: [output, personaOutput], exports: { [output]: exports } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildZCodeImportCache();
  process.stdout.write('Built ZCode import-cache modules: ' + result.outputs.length + ' derived files\n');
}
