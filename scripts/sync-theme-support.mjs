import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv[2]) throw new Error('Usage: node scripts/sync-theme-support.mjs /path/to/oh-my-dsh');
const sourceRoot = resolve(process.argv[2]);
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  ['src/client/skins/format.mjs', 'format.mjs'], ['src/client/skins/mapping.mjs', 'mapping.mjs'], ['src/client/skins/adapter.css', 'adapter.css'],
  ['src/client/skins/codex-desktop/layout.css', 'codex-layout.css'],
  ['src/client/skins/codex-desktop/integration.jsx', 'codex-integration.jsx'],
  ['vendor/opencu/src/client/slot-decoration.mjs', 'slot-decoration.mjs'],
];
await mkdir(root + 'src/client/themes/shared', { recursive: true });
const snapshots = [];
for (const [source, target] of files) {
  let contents = await readFile(sourceRoot + '/' + source);
  const sourceSha256 = createHash('sha256').update(contents).digest('hex');
  if (target === 'codex-integration.jsx') contents = Buffer.from(contents.toString().replace("'#opencu/src/client/slot-decoration.mjs'", "'./slot-decoration.mjs'").replace("id: 'omd-codex-geometry'", "id: 'omaa-codex-geometry'"));
  await writeFile(root + 'src/client/themes/shared/' + target, contents);
  snapshots.push({ source, path: target, sourceSha256, sha256: createHash('sha256').update(contents).digest('hex'),
    ...(target === 'codex-integration.jsx' ? { adaptation: 'Only local slot helper import and the OMAA registration id differ.' } : {}) });
}
await writeFile(root + 'src/client/themes/shared/provenance.json', JSON.stringify({ source: 'Oh My DSH', repository: 'https://github.com/gulagala001/oh-my-dsh', snapshots }, null, 2) + '\n');
// The coordination contract has one source; OMD's standalone build carries an exact copy.
await writeFile(sourceRoot + '/src/client/skins/coordinator.mjs', await readFile(root + 'src/client/themes/coordinator.mjs'));
