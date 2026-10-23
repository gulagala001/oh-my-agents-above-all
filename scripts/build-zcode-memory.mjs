import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const zcodeRoot = 'src/presets/zcode/sources/upstream-3.15.1/';
const memorySource = 'src/presets/zcode/sources/upstream-3.15.1/apps/zcode-cli/packages/core/src/context/sections/memory.ts';
const formatter = zcodeRoot + 'apps/zcode-cli/packages/core/src/memory/index-content.ts';
const profilePrompt = zcodeRoot + 'apps/zcode-cli/packages/core/src/subagent/persistent-memory-prompt.ts';
const lexerRoot = join(root, 'src/presets/zcode/sources/marked-16.4.2');

export async function buildZCodeProjectMemory() {
  for (const name of ['build-inputs.json']) {
    const manifest = JSON.parse(await readFile(join(root, 'src/presets/zcode/sources', name), 'utf8'));
    for (const row of manifest.files) {
      const data = await readFile(join(root, row.file));
      const sha256 = createHash('sha256').update(data).digest('hex');
      const blob = createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
      if (data.length !== row.bytes || sha256 !== row.sha256 || blob !== row.gitBlobSha1)
        throw Error('Fixed project-memory source changed: ' + row.file);
    }
  }
  const source = await readFile(join(root, memorySource), 'utf8');
  const provenance = JSON.parse(await readFile(join(root, 'src/presets/zcode/sources/source.json'), 'utf8'));
  const row = provenance.files.find(item => item.file === memorySource.slice('src/presets/zcode/'.length));
  if (!row || row.sha256 !== createHash('sha256').update(source).digest('hex')
    || !row.url.includes('/aac4755666d09fdcd70272fcf063c077a639015f/'))
    throw Error('Fixed 3.15.1 memory guidance provenance changed.');
  const ast = ts.createSourceFile(memorySource, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildMemoryContent');
  if (functions.length !== 1 || !functions[0].body || functions[0].modifiers?.length)
    throw Error('The fixed private memory content function no longer has the expected shape.');
  // Export only the original pure content builder. Token estimation and the
  // original runtime/provider configuration are deliberately outside this port.
  const result = await build({ stdin: { contents: `export { formatProjectMemoryIndexContent } from ${JSON.stringify(join(root, formatter))};\nexport { buildPersistentAgentMemoryPrompt } from ${JSON.stringify(join(root, profilePrompt))};\nexport ${functions[0].getText(ast)}\n`,
    resolveDir: root, sourcefile: 'zcode-project-memory-port.ts', loader: 'ts' },
    bundle: true, platform: 'node', target: 'node22', format: 'esm', write: false,
    banner: { js: '// Derived from fixed ZCode 3.15.1 (Apache-2.0) and marked 16.4.2 lexer (MIT). See THIRD_PARTY_NOTICES.md.' },
    plugins: [{ name: 'fixed-memory-lexer', setup(builder) {
      builder.onResolve({ filter: /^marked$/ }, () => ({ path: 'fixed-marked-lexer', namespace: 'memory-lexer' }));
      builder.onLoad({ filter: /.*/, namespace: 'memory-lexer' }, () => ({
        contents: `export { _Lexer as Lexer } from ${JSON.stringify(join(lexerRoot, 'src/Lexer.ts'))};`, loader: 'js', resolveDir: root,
      }));
    } }],
  });
  await writeFile(join(root, 'lib/zcode-project-memory.mjs'), result.outputFiles[0].text);
}
