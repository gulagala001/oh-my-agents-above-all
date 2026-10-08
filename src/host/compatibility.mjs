import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import semver from 'semver';

// API generations currently covered by the native regression representatives.
// Expand these bounds only after reviewing and running the changed host APIs.
const policy = JSON.parse(readFileSync(new URL('./compatibility.json', import.meta.url), 'utf8'));
export const HOST_RANGE = policy.hostRange;
export const LOADER_RANGE = policy.loaderRange;
export const validationHosts = policy.validationHosts;
export const supportsHostVersion = version => typeof version === 'string'
  && semver.valid(version) === version && semver.satisfies(version, HOST_RANGE, { includePrerelease: true });

export function splitReleaseVersion(version, product = 'omaa') {
  const match = typeof version === 'string' && /^(.+)([.-])(omaa|omd)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match || match[3] !== product || semver.valid(match[1]) !== match[1]
    || match[2] !== (semver.prerelease(match[1]) ? '.' : '-')) throw new Error('发行版本或 DSH 宿主格式无效');
  return { host: match[1], feature: match.slice(4).map(BigInt) };
}

export function alignedVersion(host, product, feature) {
  if (semver.valid(host) !== host || !['omaa', 'omd'].includes(product)
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(feature)) throw new Error('宿主或产品版本格式无效');
  return `${host}${semver.prerelease(host) ? '.' : '-'}${product}.${feature}`;
}

export function compareFeatures(left, right, product = 'omaa') {
  const a = splitReleaseVersion(left, product).feature, b = splitReleaseVersion(right, product).feature;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

export function nativeHostVersion() {
  // Resolve through the running host's native runtime map. The source package
  // prefix describes its release origin, not the SDK selected by this host.
  const path = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/package.json');
  const { version } = JSON.parse(readFileSync(path, 'utf8'));
  if (!supportsHostVersion(version)) throw new Error(`DSH ${version} 尚不在当前兼容范围 ${HOST_RANGE} 内`);
  return version;
}
