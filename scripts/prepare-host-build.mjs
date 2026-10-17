import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignedVersion, buildHost, splitReleaseVersion } from '../src/host/compatibility.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [version, output] = process.argv.slice(2);
if (!version || !output) throw new Error('Usage: node scripts/prepare-host-build.mjs HOST OUTPUT');
const host = buildHost(version), target = resolve(output);
const allowed = resolve(source, '../.local/host-compat-20261015');
if (dirname(target) !== allowed || !basename(target).startsWith('omaa-')) throw new Error('Host build output must be an owned omaa-* directory.');
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const feature = splitReleaseVersion(manifest.version).feature.join('.');
// A new build directory never overwrites another build or installed profile.
await mkdir(target);
const excluded = new Set(['node_modules', '.codegraph', '.git', '.cache', 'work', 'dist']);
for (const name of ['src', 'scripts', 'test', 'lib', 'docs', 'compat', 'README.md', 'LICENSE', 'NOTICE', 'LICENSING.md', 'THIRD_PARTY_NOTICES.md', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  await cp(join(source, name), join(target, name), { recursive: true, filter: path => !excluded.has(basename(path)) });
}
for (const field of ['devDependencies', 'peerDependencies']) for (const name of Object.keys(manifest[field])) {
  if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) manifest[field][name] = version;
  if (name === '@deepseek-ai/cordis-plugin-loader') manifest[field][name] = host.loaderVersion;
}
manifest.devDependencies['@deepseek-ai/cordis-plugin-group'] = host.groupVersion;
manifest.devDependencies['@deepseek-ai/cordis'] = host.cordisVersion;
manifest.devDependencies['@deepseek-ai/schemastery'] = host.schemasteryVersion;
manifest.version = alignedVersion(version, 'omaa', feature);
manifest.engines.dsh = version;
await writeFile(join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
const { parse, stringify } = await import('yaml');
const workspacePath = join(target, 'pnpm-workspace.yaml'), workspace = parse(await readFile(workspacePath, 'utf8'));
const suffix = host.cordisVersion.slice('4.0.5'.length), modern = version !== '0.2.0-rc.2';
const pick = (stable, current) => modern ? current + suffix : stable;
workspace.overrides = { ...workspace.overrides,
  '@deepseek-ai/cordis': host.cordisVersion, '@deepseek-ai/schemastery': host.schemasteryVersion,
  '@deepseek-ai/cosmokit': pick('1.8.5', '1.8.6'),
  '@deepseek-ai/cordis-plugin-group': host.groupVersion, '@deepseek-ai/cordis-plugin-loader': host.loaderVersion,
  '@deepseek-ai/cordis-plugin-hmr': pick('1.0.19', '1.0.20'),
  '@deepseek-ai/cordis-plugin-include': pick('1.0.9', '1.0.10'),
  '@deepseek-ai/cordis-plugin-logger-console': pick('1.0.4', '1.0.5'),
  '@deepseek-ai/cordis-plugin-timer': pick('1.1.6', '1.1.7'),
};
await writeFile(workspacePath, stringify(workspace, { lineWidth: 0 }));
const policy = JSON.parse(await readFile(join(source, 'src/host/compatibility.json'), 'utf8'));
policy.hostRange = version; policy.loaderRange = host.loaderVersion;
await writeFile(join(target, 'src/host/compatibility.json'), JSON.stringify(policy, null, 2) + '\n');
console.log(JSON.stringify({ source, target, version: manifest.version, host }, null, 2));
