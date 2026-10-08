import { createHash } from 'node:crypto';
import { HOST_RANGE, LOADER_RANGE, splitReleaseVersion, alignedVersion } from '../src/host/compatibility.mjs';

export const releaseFiles = ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'NOTICE', 'LICENSING.md'];

// Build and verify the same complete manifest contract. Keep all source fields,
// including exports and bundle registration, unless the host transform owns it.
export function hostManifest(source, hostVersion, loaderVersion, { hostRange = HOST_RANGE, loaderRange = LOADER_RANGE } = {}) {
  const release = splitReleaseVersion(source.version, 'omaa'), manifest = structuredClone(source);
  manifest.version = alignedVersion(hostVersion, 'omaa', release.feature.join('.'));
  manifest.files = [...releaseFiles];
  for (const field of ['devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) manifest[field][name] = field === 'peerDependencies' ? hostRange : hostVersion;
      else if (name === '@deepseek-ai/cordis-plugin-loader') manifest[field][name] = field === 'peerDependencies' ? loaderRange : loaderVersion;
    }
  }
  return manifest;
}

export function omdCompatibility(metadata, rule, overlaySha256) {
  return { schema: 1, version: metadata.version, hostVersion: rule.hostVersion, baseVersion: rule.baseVersion,
    sourceCommit: rule.sourceCommit, overlaySha256, patchSha256: rule.patchSha256, nativeHostFactories: 'preserved' };
}


export function hasReviewedOmdManifest(manifest, rule) {
  if (!Array.isArray(manifest.files) || manifest.files.at(-1) !== 'omaa-compat.json'
    || manifest.files.filter(file => file === 'omaa-compat.json').length !== 1) return false;
  const baseline = structuredClone(manifest);
  baseline.version = rule.baseVersion;
  baseline.files.pop();
  const bytes = JSON.stringify(baseline, null, 2) + '\n';
  return createHash('sha256').update(bytes).digest('hex') === rule.basePackageSha256;
}
