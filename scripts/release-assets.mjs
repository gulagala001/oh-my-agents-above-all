#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hostManifest, omdCompatibility, hasReviewedOmdManifest, omdBuildMode, reviewedPatchBytes, omdModeMetadata, verifyIntegratedOmdPayload } from './host-manifest.mjs';
import { validationHosts, splitReleaseVersion, alignedVersion } from '../src/host/compatibility.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'Usage: node scripts/release-assets.mjs --omd-version 0.9.0 [--packages DIR] [--out DIR]';
const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--packages', '--out', '--omd-version'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) throw new Error(usage);
  options[args[i]] = args[i + 1];
}
const packages = resolve(root, options['--packages'] ?? 'dist');
const out = resolve(root, options['--out'] ?? 'dist/release-assets');
const omdVersion = options['--omd-version'];
if (!omdVersion || !/^\d+\.\d+\.\d+$/.test(omdVersion)) throw new Error(usage);
const [omdMajor, omdMinor] = omdVersion.split('.').map(Number);
if (omdMajor === 0 && omdMinor < 7) throw new Error('The OMAA bridge requires OMD 0.7.0 or newer.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const source = await json(join(root, 'package.json'));
const release = splitReleaseVersion(source.version, 'omaa');

function filename(name, version) {
  if (typeof name !== 'string' || !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(name) || typeof version !== 'string' || !/^[0-9A-Za-z.-]+$/.test(version)) throw new Error('Unsafe package name or version.');
  const value = `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
  if (basename(value) !== value) throw new Error('Unsafe package filename.');
  return value;
}
async function regularBytes(file) {
  if (!(await lstat(file)).isFile()) throw new Error(`Expected regular file: ${file}`);
  return readFile(file);
}

const expected = [], hosts = new Set(), baselines = new Map();
for (const { version: expectedHost, loaderVersion, omdVariant: variant } of validationHosts) {
  const rules = await json(join(root, 'compat', 'omd', `${variant}.json`));
  const hostVersion = rules.hostVersion;
  if (typeof hostVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(hostVersion) || hosts.has(hostVersion) || hostVersion !== expectedHost) throw new Error(`Invalid or duplicate hostVersion in ${variant}.json`);
  hosts.add(hostVersion);
  baselines.set(hostVersion, rules);
  expected.push({ name: source.name, version: alignedVersion(hostVersion, 'omaa', release.feature.join('.')), hostVersion, loaderVersion });
  const mode = omdBuildMode(rules);
  const rulesBytes = await readFile(join(root, 'compat', 'omd', `${variant}.json`));
  const patchBytes = reviewedPatchBytes(rules, mode === 'overlay' ? await readFile(join(root, 'compat', 'omd', rules.patch)) : undefined);
  if (mode === 'integrated-baseline' && alignedVersion(hostVersion, 'omd', omdVersion) !== rules.baseVersion) throw new Error('Integrated OMD output version must equal the reviewed official baseline version.');
  expected.push({ ...omdModeMetadata(rules), name: 'trisoul_x', version: alignedVersion(hostVersion, 'omd', omdVersion), hostVersion, ...Object.fromEntries(['baseVersion', 'sourceTag', 'sourceCommit', 'patchSha256'].map(key => [key, rules[key]])), overlaySha256: sha(Buffer.concat([rulesBytes, patchBytes])), nativeHostFactories: 'preserved' });
}
if (!hosts.has(release.host)) throw new Error('Current OMAA host is absent from compatibility manifests.');

// Validate every source before creating the output directory or copying files.
const attachments = new Map(), releases = [];
for (const entry of expected) {
  const name = filename(entry.name, entry.version), tarball = join(packages, name);
  const bytes = await regularBytes(tarball);
  const checksumBytes = await regularBytes(`${tarball}.sha256`);
  const metadataBytes = await regularBytes(`${tarball}.metadata.json`);
  const hash = sha(bytes), metadata = JSON.parse(metadataBytes.toString('utf8'));
  const checksum = checksumBytes.toString('utf8').trim().match(/^([a-f0-9]{64}) {2}([^\r\n]+)$/);
  if (!checksum || checksum[1] !== hash || checksum[2] !== name) throw new Error(`Checksum mismatch: ${name}`);
  for (const [key, value] of Object.entries({ ...entry, filename: name, sha256: hash })) {
    if (metadata[key] !== value) throw new Error(`Metadata ${key} mismatch: ${name}`);
  }
  // Read the archive manifest directly; no extraction directory or shell interpolation.
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  if (manifest.name !== entry.name || manifest.version !== entry.version || manifest.devDependencies?.['@deepseek-ai/dsh'] !== entry.hostVersion) throw new Error(`Archive package/host mismatch: ${name}`);
  if (entry.name === source.name) {
    if (!isDeepStrictEqual(manifest, hostManifest(source, entry.hostVersion, entry.loaderVersion))) throw new Error(`Archive OMAA manifest differs from the complete source/host contract: ${name}`);
  } else {
    const rule = baselines.get(entry.hostVersion);
    if (metadata.mode !== omdModeMetadata(rule).mode) throw new Error(`OMD build mode differs from reviewed source: ${name}`);
    if (!hasReviewedOmdManifest(manifest, rule)) throw new Error(`Archive OMD manifest differs from the complete reviewed baseline contract: ${name}`);
    const compatibility = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/omaa-compat.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (!isDeepStrictEqual(compatibility, omdCompatibility(metadata, rule, entry.overlaySha256))) throw new Error(`Archive OMD compatibility differs from reviewed source: ${name}`);
    await verifyIntegratedOmdPayload(tarball, rule);
  }
  attachments.set(name, bytes);
  attachments.set(`${name}.sha256`, checksumBytes);
  attachments.set(`${name}.metadata.json`, metadataBytes);
  releases.push({ ...entry, filename: name, sha256: hash });
}

let existing = [];
try {
  if (!(await lstat(out)).isDirectory()) throw new Error(`Expected output directory: ${out}`);
  existing = await readdir(out);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const name of existing) {
  if (!attachments.has(name)) throw new Error(`Output contains an unrelated attachment: ${name}`);
  if (!(await regularBytes(join(out, name))).equals(attachments.get(name))) throw new Error(`Refusing to overwrite different content: ${name}`);
}
await mkdir(out, { recursive: true });
for (const [name, bytes] of attachments) {
  if (existing.includes(name)) continue;
  // Exclusive creation also protects against another preparation writing here.
  try { await writeFile(join(out, name), bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await regularBytes(join(out, name))).equals(bytes)) throw error;
  }
}
console.log(JSON.stringify({ out, attachmentCount: attachments.size, packages: releases }));
