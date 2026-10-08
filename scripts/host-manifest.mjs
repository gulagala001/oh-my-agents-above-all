import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOST_RANGE, LOADER_RANGE, splitReleaseVersion, alignedVersion } from '../src/host/compatibility.mjs';

export const releaseFiles = ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'NOTICE', 'LICENSING.md'];

function validateFileAllowlist(files) {
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length
    || files.some(file => typeof file !== 'string' || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file)
      || file.split('/').some(part => part === '.' || part === '..'))) throw new Error('Invalid release file allowlist.');
}

// Build and verify the complete source contract, including exports and bundle registration.
export function hostManifest(source, hostVersion, loaderVersion, { hostRange = HOST_RANGE, loaderRange = LOADER_RANGE, files = releaseFiles } = {}) {
  validateFileAllowlist(files);
  const release = splitReleaseVersion(source.version, 'omaa'), manifest = structuredClone(source);
  manifest.version = alignedVersion(hostVersion, 'omaa', release.feature.join('.'));
  manifest.files = [...files];
  for (const field of ['devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) manifest[field][name] = field === 'peerDependencies' ? hostRange : hostVersion;
      else if (name === '@deepseek-ai/cordis-plugin-loader') manifest[field][name] = field === 'peerDependencies' ? loaderRange : loaderVersion;
    }
  }
  return manifest;
}

export const emptyPatchSha256 = createHash('sha256').update(Buffer.alloc(0)).digest('hex');
const legacyOmdFiles = ['src', 'lib', 'presets', 'cordis.patch.yml', 'README.md', 'CONTRIBUTING.md', 'scripts', 'THIRD_PARTY_NOTICES.md', 'docs', 'vendor', 'release-manifest.json', 'CHANGELOG.md'];

export function omdBuildMode(rule) {
  const mode = rule.mode === undefined ? 'overlay' : rule.mode;
  if (!['overlay', 'integrated-baseline'].includes(mode)) throw new Error('Unknown reviewed OMD build mode.');
  if (mode === 'integrated-baseline') {
    const emptyObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
    if (rule.patch !== null || rule.patchSha256 !== emptyPatchSha256
      || !emptyObject(rule.additions) || !emptyObject(rule.patchedFiles)) throw new Error('Integrated OMD baseline must explicitly declare an empty patch and no overlay files.');
    validateFileAllowlist(rule.packageFiles);
    if (rule.packageFiles.includes('omaa-compat.json')) throw new Error('Official OMD baseline cannot own the paired compatibility metadata file.');
  } else if (!/^[a-z0-9-]+\.patch$/.test(rule.patch)) throw new Error('Invalid OMD overlay patch path.');
  return mode;
}

export function omdPackageFiles(rule) {
  return omdBuildMode(rule) === 'integrated-baseline' ? [...rule.packageFiles] : [...legacyOmdFiles];
}

export function reviewedPatchBytes(rule, bytes) {
  const mode = omdBuildMode(rule), patch = mode === 'integrated-baseline' ? Buffer.alloc(0) : bytes;
  if (!Buffer.isBuffer(patch) || (mode === 'integrated-baseline' && bytes?.length)
    || createHash('sha256').update(patch).digest('hex') !== rule.patchSha256) throw new Error('Reviewed OMD patch hash mismatch.');
  return patch;
}

export function omdModeMetadata(rule) {
  omdBuildMode(rule);
  return rule.mode === undefined ? {} : { mode: rule.mode };
}

export function omdCompatibility(metadata, rule, overlaySha256) {
  return { schema: 1, version: metadata.version, hostVersion: rule.hostVersion, baseVersion: rule.baseVersion,
    sourceCommit: rule.sourceCommit, overlaySha256, patchSha256: rule.patchSha256, nativeHostFactories: 'preserved', ...omdModeMetadata(rule) };
}


export function hasReviewedOmdManifest(manifest, rule) {
  if (omdBuildMode(rule) === 'integrated-baseline' && manifest.version !== rule.baseVersion) return false;
  if (!Array.isArray(manifest.files) || manifest.files.at(-1) !== 'omaa-compat.json'
    || manifest.files.filter(file => file === 'omaa-compat.json').length !== 1) return false;
  const baseline = structuredClone(manifest);
  baseline.version = rule.baseVersion;
  baseline.files.pop();
  const bytes = JSON.stringify(baseline, null, 2) + '\n';
  return createHash('sha256').update(bytes).digest('hex') === rule.basePackageSha256;
}

// Sidecar hashes prove the archive is self-consistent. Integrated releases must
// also match every byte of the independently reviewed official payload.
export async function verifyIntegratedOmdPayload(tarball, rule) {
  if (omdBuildMode(rule) !== 'integrated-baseline') return;
  const safe = name => typeof name === 'string' && name.length && !/[\x00-\x1f\x7f\\]/.test(name)
    && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..');
  const required = new Set([...Object.keys(rule.files ?? {}), 'package.json', 'omaa-compat.json']);
  const optional = rule.optionalPackagingFiles ?? {}, allowed = new Set([...required, ...Object.keys(optional)]);
  if (!rule.files || !Object.keys(rule.files).length || [...allowed].some(name => !safe(name))) throw new Error('Invalid integrated reviewed payload inventory.');
  for (const [name, hash] of Object.entries({ ...rule.files, ...optional })) if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid integrated reviewed payload hash: ' + name);
  const list = args => execFileSync('tar', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } }).trimEnd().split('\n');
  const members = list(['-tzf', tarball]), details = list(['-tvzf', tarball]);
  if (members.length !== details.length) throw new Error('Integrated archive member listings differ.');
  const inventory = new Set(), seen = new Set();
  for (let i = 0; i < members.length; i++) {
    const member = members[i].replace(/\/$/, ''), type = details[i][0];
    if (!safe(member) || (member !== 'package' && !member.startsWith('package/')) || seen.has(member) || !['-', 'd'].includes(type)) throw new Error('Unsafe or duplicate integrated archive member: ' + members[i]);
    seen.add(member);
    const relative = member === 'package' ? '' : member.slice(8);
    if (type === 'd') {
      if (relative && ![...allowed].some(name => name.startsWith(relative + '/'))) throw new Error('Unexpected integrated archive directory: ' + relative);
    } else {
      if (!allowed.has(relative)) throw new Error('Unexpected integrated archive file: ' + relative);
      inventory.add(relative);
    }
  }
  const missing = [...required].filter(name => !inventory.has(name));
  if (missing.length) throw new Error('Integrated archive is missing reviewed files: ' + missing.slice(0, 12).join(', '));
  const temporary = await mkdtemp(join(tmpdir(), 'omaa-integrated-verify-'));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', temporary], { stdio: 'pipe' });
    for (const [name, expected] of Object.entries({ ...rule.files, ...optional })) {
      if (!inventory.has(name)) continue;
      const actual = createHash('sha256').update(await readFile(join(temporary, 'package', name))).digest('hex');
      if (actual !== expected) throw new Error('Integrated archive differs from reviewed payload: ' + name);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
