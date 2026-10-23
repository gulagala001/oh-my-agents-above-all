import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = 'src/presets/zcode/sources/upstream-3.15.1/packages/services/src/session/automationCron.ts';
export async function buildZCodeCalendarRule() {
  const manifest = JSON.parse(await readFile(root + 'src/presets/zcode/sources/build-inputs.json', 'utf8'));
  const row = manifest.files.find(value => value.file === file), source = await readFile(root + file, 'utf8');
  const data = Buffer.from(source);
  if (!row || row.sha256 !== createHash('sha256').update(data).digest('hex')
    || row.gitBlobSha1 !== createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex')
    || !row.url.includes('/aac4755666d09fdcd70272fcf063c077a639015f/')) throw Error('Fixed calendar source provenance changed.');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = ['atTime', 'firstWeekdayOfMonth', 'computeScheduleRuleNextRunAt', 'parseCronFields', 'buildIntervalScheduleRule'];
  const functions = names.map(name => {
    const found = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (found.length !== 1 || !found[0].body) throw Error('Fixed calendar function missing: ' + name);
    return found[0];
  });
  // A second output preserves every original local Date operation. Its Date
  // binding belongs to one explicit zone; the process timezone is never changed.
  const printer = ts.createPrinter();
  const raw = functions.map(node => printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name,
      node.typeParameters, node.parameters, node.type, node.body), ast)).join('\n');
  const zoned = ts.transpileModule('export function bindCalendarDate(Date) {\n' + raw
    + '\nreturn { buildIntervalScheduleRule, computeScheduleRuleNextRunAt };\n}',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  if (zoned.diagnostics?.length) throw Error('Zoned calendar source transpilation failed.');
  await writeFile(root + 'lib/zcode-zoned-calendar-rule.mjs',
    '// Fixed ZCode 3.15.1 Apache-2.0 pure rules; original Date operations use a per-zone binding.\n' + zoned.outputText);
  const getters = new Set(['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes']);
  const transformer = context => {
    const visit = node => {
      if (ts.isPropertyAccessExpression(node) && getters.has(node.name.text))
        return context.factory.updatePropertyAccessExpression(node, ts.visitNode(node.expression, visit), 'getUTC' + node.name.text.slice(3));
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['setDate', 'setMinutes'].includes(node.expression.name.text))
        return context.factory.updateCallExpression(node,
          context.factory.updatePropertyAccessExpression(node.expression, ts.visitNode(node.expression.expression, visit), node.expression.name.text === 'setDate' ? 'setUTCDate' : 'setUTCMinutes'),
          node.typeArguments, ts.visitNodes(node.arguments, visit));
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && node.arguments?.length > 1)
        return context.factory.updateNewExpression(node, node.expression, undefined, [context.factory.createCallExpression(
          context.factory.createPropertyAccessExpression(context.factory.createIdentifier('Date'), 'UTC'), undefined,
          ts.visitNodes(node.arguments, visit))]);
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  };
  const transformed = ts.transform(ast, [transformer]);
  try {
    const printer = ts.createPrinter();
    const selected = transformed.transformed[0].statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
    const text = selected.map(node => printer.printNode(ts.EmitHint.Unspecified, node, transformed.transformed[0])).join('\n');
    const result = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
    if (result.diagnostics?.length) throw Error('Calendar source transpilation failed.');
    await writeFile(root + 'lib/zcode-calendar-rule.mjs', '// Fixed ZCode 3.15.1 Apache-2.0 pure rules; local date operations adapted to UTC.\n' + result.outputText);
  } finally { transformed.dispose(); }
  await buildCalendarTemporal();
}

async function buildCalendarTemporal() {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@js-temporal/polyfill');
  const temporalRoot = dirname(dirname(entry));
  const jsbiEntry = createRequire(entry).resolve('jsbi');
  const jsbiRoot = dirname(dirname(jsbiEntry));
  const evidence = JSON.parse(await readFile(root + 'src/presets/zcode/sources/temporal.json', 'utf8'));
  for (const row of evidence.installedBuildInputs) {
    const base = row.package === '@js-temporal/polyfill' ? temporalRoot : row.package === 'jsbi' ? jsbiRoot : null;
    if (!base) throw Error('Unknown calendar dependency evidence.');
    const data = await readFile(join(base, row.path));
    if (data.length !== row.bytes || createHash('sha256').update(data).digest('hex') !== row.sha256)
      throw Error('Pinned calendar dependency changed: ' + row.package + '/' + row.path);
  }
  if (JSON.parse(await readFile(join(temporalRoot, 'package.json'), 'utf8')).version !== '0.5.1'
    || JSON.parse(await readFile(join(jsbiRoot, 'package.json'), 'utf8')).version !== '4.3.2')
    throw Error('Calendar dependency version changed.');
  await build({ stdin: { contents: 'export { Temporal } from ' + JSON.stringify(entry) + ';', resolveDir: root, sourcefile: 'zcode-temporal-entry.mjs' },
    outfile: root + 'lib/zcode-temporal.mjs', bundle: true, format: 'esm', platform: 'node', target: 'es2022', legalComments: 'inline',
    banner: { js: '// Temporal polyfill 0.5.1 (ISC) + JSBI 4.3.2 (Apache-2.0); exact notices: src/presets/zcode/licenses/.' } });
}
