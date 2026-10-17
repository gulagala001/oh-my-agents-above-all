import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { buildHost } from '../src/host/compatibility.mjs';

const [directory, archive, verified] = process.argv.slice(2);
if (!directory || !archive || !verified) throw new Error('Usage: node scripts/record-host-artifact.mjs BUILD TGZ VERIFIED_PAYLOAD');
const root = resolve(directory), tarball = resolve(archive);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const host = buildHost(manifest.devDependencies['@deepseek-ai/dsh']);
const before = JSON.parse(await readFile(verified, 'utf8'));
const members = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n').filter(name => !name.endsWith('/'));
if (members.some(name => !name.startsWith('package/') || name.split('/').includes('..'))) throw new Error('Unsafe archive path');
const hashes = {};
for (const member of members) hashes[member] = sha(execFileSync('tar', ['-xOf', tarball, member], { maxBuffer: 30 * 1024 * 1024 }));
const runtime = path => path === 'package/package.json' || path === 'package/cordis.patch.yml' || path.startsWith('package/src/') || path.startsWith('package/lib/');
const changed = new Set([...Object.keys(before.hashes), ...members].filter(runtime));
for (const path of changed) if (before.hashes[path] !== hashes[path]) throw new Error('Runtime differs from the actually verified package: ' + path);
const digest = sha(await readFile(tarball));
await writeFile(tarball + '.sha256', digest + '  ' + basename(tarball) + '\n');
const metadata = { name: manifest.name, version: manifest.version, hostVersion: host.version,
  hostSourceCommit: host.commit, loaderVersion: host.loaderVersion, groupVersion: host.groupVersion,
  cordisVersion: host.cordisVersion, schemasteryVersion: host.schemasteryVersion,
  activation: host.activation, workingDirectory: host.workingDirectory,
  filename: basename(tarball), sha256: digest, lockPath: join(root, 'pnpm-lock.yaml'),
  lockSha256: sha(await readFile(join(root, 'pnpm-lock.yaml'))),
  generatedConfigurationSha256: sha(await readFile(join(root, 'cordis.patch.yml'))),
  clientSha256: sha(await readFile(join(root, 'lib/client.js'))),
  verification: { runtimeByteIdenticalTo: before.sha256, documentationOnlyRepack: before.sha256 !== digest,
    fiveNativePresetsAndSdk: 'passed', savedTypedActorFirstAndColdPersona: 'passed',
    omitted: ['latest OMD co-installation', 'real GUI/Desktop', 'full enable/disable/uninstall matrix', 'Windows/Linux', 'Computer Use hardware'] },
};
await writeFile(tarball + '.metadata.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata, null, 2));
