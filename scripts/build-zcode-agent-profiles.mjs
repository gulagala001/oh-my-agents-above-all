import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = join(root, 'src/presets/zcode/sources/upstream-3.15.1/packages/shared/src');
const blobs = {
  'subagent-profile-parser.ts': 'e5935050d98074fb84cd6ffccf3869d275fb718e',
  'subagent-profile-frontmatter.ts': '1786cb3814b9db4454507038434858c4205067a1',
  'subagent-markdown-selection.ts': '2ce8b55305f559b3a6d99553bef00bbf5aef401f',
  'custom-model-value.ts': '47e8582242ea138e2af3197053f6bacf5432c058',
  'model-selection.ts': '5f46f4c929ff0d0f63f8cdf1e8cfbf3eab84a522',
};

export async function buildZCodeAgentProfiles() {
  const sources = new Map();
  for (const [name, expected] of Object.entries(blobs)) {
    const bytes = await readFile(join(sourceRoot, name));
    if (createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== expected)
      throw Error('Fixed aac475 ZCode profile source changed: ' + name);
    sources.set(name, bytes.toString('utf8'));
  }
  const name = 'subagent-markdown-selection.ts', original = sources.get(name);
  const ast = ts.createSourceFile(name, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // Only the original parser closure: exclude writer/migration code and its
  // unrelated account/provider migrations. Retain function bodies verbatim.
  const selected = ast.statements.filter(node => ts.isImportDeclaration(node)
    ? ['./custom-model-value.js', './model-selection.js'].includes(node.moduleSpecifier.text)
    : ts.isFunctionDeclaration(node) ? node.name?.text === 'parseSubagentMarkdownSelection'
      : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'INHERIT_NAMES'));
  if (selected.length !== 4) throw Error('Unexpected fixed profile parser closure.');
  sources.set(name, selected.map(node => node.getText(ast)).join('\n'));
  const result = await build({ stdin: { contents: `export { parseAgentProfileFromMarkdown } from ${JSON.stringify(join(sourceRoot, 'subagent-profile-parser.ts'))};`,
    sourcefile: 'zcode-agent-profile-port.ts', resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', target: 'node22', format: 'esm', write: false, external: ['zod'],
    banner: { js: '// Derived from fixed ZCode 3.15.1 aac4755666d09fdcd70272fcf063c077a639015f (Apache-2.0). See THIRD_PARTY_NOTICES.md.' },
    plugins: [{ name: 'fixed-profile-parser', setup(builder) {
      builder.onLoad({ filter: /[/\\](?:subagent-profile-parser|subagent-profile-frontmatter|subagent-markdown-selection|custom-model-value|model-selection)\.ts$/ }, args => {
        const name = args.path.split(/[/\\]/u).at(-1);
        if (args.path !== join(sourceRoot, name) || !sources.has(name)) return;
        return { contents: sources.get(name), loader: 'ts', resolveDir: sourceRoot };
      });
    } }],
  });
  await writeFile(join(root, 'lib/zcode-agent-profile-parser.mjs'), result.outputFiles[0].text);
}
