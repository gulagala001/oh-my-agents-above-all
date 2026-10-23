import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildGrokCodecs } from './build-grok-codecs.mjs';

export async function buildGrokDocuments() {
  await buildGrokCodecs();
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await build({ entryPoints: [root + 'src/presets/grok/pptx-worker.mjs'], outfile: root + 'lib/grok-pptx-worker.mjs',
    bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    banner: { js: '// Grok fixed PPTX behavioral port; saxes ISC and xmlchars MIT notices: src/presets/grok/licenses/.' },
  });
  for (const [name, version] of [['saxes', '6.0.0'], ['xmlchars', '2.2.0']]) {
    const files = Object.keys(result.metafile.inputs).filter(p => p.includes('/node_modules/' + name + '/'));
    if (!files.length) throw Error('Missing expected bundled XML dependency: ' + name);
    const base = files[0].slice(0, files[0].indexOf('/node_modules/' + name + '/') + ('/node_modules/' + name).length);
    if (JSON.parse(await readFile(resolve(root, base, 'package.json'), 'utf8')).version !== version)
      throw Error('Unexpected XML dependency version: ' + name);
  }
}
