import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--host-version')) {
  throw new Error('Usage: node scripts/package.mjs [--host-version 0.2.0-rc.2|0.2.1-alpha.1]');
}
const suffix = source.version.match(/\.omaa\.\d+\.\d+\.\d+$/)?.[0];
if (!suffix) throw new Error(`Unsupported OMAA version: ${source.version}`);
const hostVersion = args[1] ?? source.version.slice(0, -suffix.length);
const loaderVersions = { '0.2.0-rc.2': '1.0.5', '0.2.1-alpha.1': '1.0.6-alpha.1' };
if (!Object.hasOwn(loaderVersions, hostVersion)) throw new Error(`Unsupported host version: ${hostVersion}`);

const cache = join(root, '.cache');
const dist = join(root, 'dist');
await mkdir(cache, { recursive: true });
await mkdir(dist, { recursive: true });
const staging = await mkdtemp(join(cache, `package-${hostVersion}-`));
const files = ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md'];
const localNames = new Set([
  'AGENTS.md', 'CLAUDE.md', 'AI_README.md', 'COMPUTER_USE_HANDOFF.md',
  'COMPUTER_USE_BASELINE.md', 'WINDOWS_HANDOFF.md', 'PROMPT_MAINTENANCE.md',
  'PROMPT_CHANGES.md', '.cache', 'test', 'node_modules', '.git',
]);
for (const file of files) {
  await cp(join(root, file), join(staging, file), {
    recursive: true,
    filter: (path) => !localNames.has(basename(path)),
  });
}

const manifest = structuredClone(source);
manifest.version = `${hostVersion}${suffix}`;
manifest.files = files;
for (const field of ['devDependencies', 'peerDependencies']) {
  for (const name of Object.keys(manifest[field] ?? {})) {
    if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
      manifest[field][name] = hostVersion;
    } else if (name === '@deepseek-ai/cordis-plugin-loader') {
      manifest[field][name] = loaderVersions[hostVersion];
    }
  }
}
await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dist], {
  cwd: staging, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
}));
const filename = packed[0].filename;
const tarball = join(dist, filename);
const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
await writeFile(`${tarball}.sha256`, `${sha256}  ${filename}\n`);
const metadata = {
  name: manifest.name, version: manifest.version, hostVersion,
  loaderVersion: loaderVersions[hostVersion], filename, sha256,
  createdAt: new Date().toISOString(),
};
await writeFile(`${tarball}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ ...metadata, tarball, staging }, null, 2));
