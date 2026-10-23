import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildZCodeStreams() {
  const snapshots = root + 'src/presets/zcode/sources/upstream-3.15.1/';
  const manifest = JSON.parse(await readFile(snapshots + 'stream-source.json', 'utf8'));
  if (manifest.commit !== 'aac4755666d09fdcd70272fcf063c077a639015f') throw Error('Unexpected stream source commit');
  const row = manifest.files[0], bytes = await readFile(snapshots + row.path);
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error('Fixed stream source changed');
  const source = bytes.toString('utf8'), parsed = ts.createSourceFile(row.path, source, ts.ScriptTarget.Latest, true);
  const declarations = parsed.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const declaration = declarations.find(node => ts.isIdentifier(node.name) && node.name.text === 'CELL_STREAMS_BOOTSTRAP');
  const init = declaration?.initializer;
  if (parsed.parseDiagnostics.length || declarations.length !== 1 || !init || !ts.isTaggedTemplateExpression(init)
    || init.tag.getText(parsed) !== 'String.raw' || !ts.isNoSubstitutionTemplateLiteral(init.template)) throw Error('Unexpected stream bootstrap declaration');
  // Retain raw escapes exactly; no function body or queue algorithm is rewritten.
  const body = source.slice(init.template.getStart(parsed) + 1, init.template.end - 1);
  const script = ts.createSourceFile('stream-bootstrap.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (script.parseDiagnostics.length) throw Error('Stream bootstrap syntax is invalid');
  await writeFile(root + 'lib/zcode-streams.mjs', '// Exact public ZCode 3.15.1 stream bootstrap; see source manifest and THIRD_PARTY_NOTICES.md.\n'
    + 'export const ZCODE_CELL_STREAMS_BOOTSTRAP = ' + JSON.stringify(body) + ';\n');
}
