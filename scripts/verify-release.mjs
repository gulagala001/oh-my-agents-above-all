#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { hostManifest, omdCompatibility, hasReviewedOmdManifest, omdBuildMode, reviewedPatchBytes, omdModeMetadata, verifyIntegratedOmdPayload } from './host-manifest.mjs';
import { splitReleaseVersion, alignedVersion } from '../src/host/compatibility.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'Usage: node scripts/verify-release.mjs --repo owner/name --tag TAG --assets DIR';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireMatch = (condition, message) => { if (!condition) throw new Error(message); };
function command(program, args, label, maxBuffer = 4 * 1024 * 1024) {
  try { return execFileSync(program, args, { cwd: root, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] }); }
  // Keep gh's response/redirect URLs and credentials out of diagnostic output.
  catch { throw new Error(`${label} failed.`); }
}
function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`Invalid JSON: ${label}`); }
}
async function regularBytes(file) {
  requireMatch((await lstat(file)).isFile(), `Expected a regular file: ${file}`);
  return readFile(file);
}

async function main() {
  const options = {}, args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    requireMatch(['--repo', '--tag', '--assets'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--') && !Object.hasOwn(options, args[i]), usage);
    options[args[i]] = args[i + 1];
  }
  const repo = options['--repo'], tag = options['--tag'];
  requireMatch(typeof repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && typeof tag === 'string' && /^v[0-9A-Za-z.-]+$/.test(tag) && options['--assets'], usage);
  splitReleaseVersion(tag.slice(1), 'omaa');
  const assetsDir = resolve(options['--assets']);
  const api = (endpoint, extra = []) => command('gh', ['api', '--method', 'GET', '-H', 'Accept: application/vnd.github+json', endpoint, ...extra], 'GitHub API request');
  const jsonApi = endpoint => parseJson(api(endpoint), 'GitHub API response');
  const localCommit = command('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], 'Local release tag lookup').toString('utf8').trim();
  const sourceJson = path => parseJson(command('git', ['show', `${localCommit}:${path}`], 'Tagged source lookup'), path);
  const source = sourceJson('package.json');
  requireMatch(tag === `v${source.version}`, 'Release tag differs from the tagged source version.');
  const releaseVersion = splitReleaseVersion(source.version, 'omaa');
  const taggedFiles = command('git', ['ls-tree', '-r', '--name-only', localCommit], 'Tagged file inventory').toString('utf8').trim().split('\n');
  let representatives, taggedPolicy;
  if (taggedFiles.includes('src/host/compatibility.json')) {
    const policy = sourceJson('src/host/compatibility.json');
    taggedPolicy = policy;
    requireMatch(semver.validRange(policy.hostRange) && semver.validRange(policy.loaderRange) && Array.isArray(policy.validationHosts), 'Invalid tagged compatibility policy.');
    representatives = policy.validationHosts;
    for (const row of representatives) requireMatch(semver.valid(row.version) === row.version && semver.satisfies(row.version, policy.hostRange, { includePrerelease: true }) && semver.valid(row.loaderVersion) === row.loaderVersion && semver.satisfies(row.loaderVersion, policy.loaderRange, { includePrerelease: true }), 'Tagged representative is outside its compatibility range.');
  } else {
    requireMatch(Array.isArray(source.files), 'Legacy tag must describe its release file allowlist.');
    // Existing releases precede the shared policy. Derive their inventory only
    // from that tag's reviewed overlays; never borrow today's representatives.
    const legacyScript = command('git', ['show', `${localCommit}:scripts/package.mjs`], 'Tagged legacy packager lookup').toString('utf8');
    const loaderMap = /const loaderVersions\s*=\s*(\{[^}]+\})/.exec(legacyScript)?.[1];
    requireMatch(loaderMap, 'Legacy tag must describe its exact loader versions.');
    const loaders = new Map([...loaderMap.matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)].map(match => [match[1], match[2]]));
    representatives = taggedFiles.filter(path => /^compat\/omd\/[a-z0-9-]+\.json$/.test(path)).map(path => {
      const version = sourceJson(path).hostVersion, loaderVersion = loaders.get(version);
      requireMatch(semver.valid(loaderVersion) === loaderVersion, 'Legacy tag has no exact loader for its validation host.');
      return { version, loaderVersion, omdVariant: path.slice('compat/omd/'.length, -'.json'.length) };
    });
  }
  requireMatch(representatives.length > 0 && new Set(representatives.map(row => row.version)).size === representatives.length, 'Tagged source must describe distinct validation hosts.');
  const rules = representatives.map(row => {
    requireMatch(typeof row.omdVariant === 'string' && /^[a-z0-9-]+$/.test(row.omdVariant) && semver.valid(row.version) === row.version, 'Invalid tagged OMD representative.');
    const rule = sourceJson(`compat/omd/${row.omdVariant}.json`);
    requireMatch(rule.hostVersion === row.version, 'Tagged OMD baseline differs from its validation representative.');
    const mode = omdBuildMode(rule);
    const rulesBytes = command('git', ['show', `${localCommit}:compat/omd/${row.omdVariant}.json`], 'Tagged OMD rules lookup');
    const patchBytes = reviewedPatchBytes(rule, mode === 'overlay' ? command('git', ['show', `${localCommit}:compat/omd/${rule.patch}`], 'Tagged OMD patch lookup') : undefined);
    return { ...rule, loaderVersion: row.loaderVersion, overlaySha256: sha(Buffer.concat([rulesBytes, patchBytes])) };
  });
  requireMatch(rules.some(row => row.hostVersion === releaseVersion.host), 'Tagged OMAA host is absent from compatibility baselines.');
  const packageCount = rules.length * 2, attachmentCount = packageCount * 3;

  let remote = jsonApi(`repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`).object;
  const visited = new Set();
  while (remote?.type === 'tag') {
    requireMatch(/^[a-f0-9]{40}$/.test(remote.sha) && !visited.has(remote.sha) && visited.size < 16, 'Invalid remote annotated tag chain.');
    visited.add(remote.sha);
    remote = jsonApi(`repos/${repo}/git/tags/${remote.sha}`).object;
  }
  requireMatch(remote?.type === 'commit' && remote.sha === localCommit, 'Remote release tag points to a different source commit.');
  // GitHub's by-tag REST endpoint excludes drafts, even for their owner. gh's
  // release resolver supports both drafts and public releases; still validate
  // its destination before retrieving the authoritative numeric-ID record.
  const lookup = parseJson(command('gh', ['release', 'view', tag, '--repo', repo, '--json', 'apiUrl,tagName'], 'Release lookup'), 'Release lookup');
  requireMatch(lookup.tagName === tag && typeof lookup.apiUrl === 'string', 'Release lookup differs from the requested tag.');
  const releasePrefix = `https://api.github.com/repos/${repo}/releases/`;
  requireMatch(lookup.apiUrl.startsWith(releasePrefix) && /^[1-9]\d*$/.test(lookup.apiUrl.slice(releasePrefix.length)), 'Invalid release API destination.');
  const release = jsonApi(lookup.apiUrl.slice('https://api.github.com/'.length));
  requireMatch(release.tag_name === tag && Number.isSafeInteger(release.id), 'Release tag or ID differs from the requested release.');
  const pages = parseJson(api(`repos/${repo}/releases/${release.id}/assets?per_page=100`, ['--paginate', '--slurp']), 'Release asset inventory');
  requireMatch(Array.isArray(pages) && pages.every(Array.isArray), 'Invalid release asset inventory.');
  const remoteAssets = pages.flat(), localNames = (await readdir(assetsDir)).sort();
  requireMatch(localNames.length === attachmentCount && remoteAssets.length === attachmentCount, `Expected exactly ${attachmentCount} local and remote release attachments.`);
  requireMatch(isDeepStrictEqual(remoteAssets.map(asset => asset.name).sort(), localNames), 'Local and remote release attachment inventories differ.');
  const inventory = new Map(remoteAssets.map(asset => [asset.name, asset]));
  requireMatch(inventory.size === attachmentCount, 'Duplicate remote release attachment names.');
  const tarballs = localNames.filter(name => name.endsWith('.tgz'));
  requireMatch(tarballs.length === packageCount, `Expected ${packageCount} release tarballs.`);
  const pairs = new Set(), omdVersions = new Set();
  for (const name of tarballs) {
    requireMatch(localNames.includes(`${name}.sha256`) && localNames.includes(`${name}.metadata.json`), `Missing sidecars: ${name}`);
    const bytes = await regularBytes(join(assetsDir, name));
    const checksum = await regularBytes(join(assetsDir, `${name}.sha256`));
    const metadata = parseJson(await regularBytes(join(assetsDir, `${name}.metadata.json`)), `${name}.metadata.json`);
    requireMatch(metadata && typeof metadata === 'object' && !Array.isArray(metadata), `Invalid metadata object: ${name}`);
    const hash = sha(bytes), rule = rules.find(entry => entry.hostVersion === metadata.hostVersion);
    requireMatch(rule && [source.name, 'trisoul_x'].includes(metadata.name), `Unexpected package or host: ${name}`);
    const pair = `${metadata.name}/${metadata.hostVersion}`;
    requireMatch(!pairs.has(pair), `Duplicate package/host pair: ${name}`);
    pairs.add(pair);
    if (metadata.name === source.name) {
      requireMatch(metadata.loaderVersion === rule.loaderVersion, `OMAA loader differs from tagged source: ${name}`);
      requireMatch(metadata.version === alignedVersion(rule.hostVersion, 'omaa', releaseVersion.feature.join('.')), `Package version differs from tagged source: ${name}`);
    } else {
      requireMatch(metadata.mode === omdModeMetadata(rule).mode, `OMD build mode differs from tagged source: ${name}`);
      const omdRelease = splitReleaseVersion(metadata.version, 'omd');
      requireMatch(omdRelease.host === rule.hostVersion, `Invalid OMD host version: ${name}`);
      omdVersions.add(omdRelease.feature.join('.'));
      for (const key of ['baseVersion', 'sourceTag', 'sourceCommit', 'patchSha256', 'overlaySha256']) requireMatch(metadata[key] === rule[key], `OMD ${key} differs from tagged source: ${name}`);
    }
    const expectedName = `${metadata.name.replace(/^@/, '').replace('/', '-')}-${metadata.version}.tgz`;
    requireMatch(name === expectedName && metadata.filename === name && metadata.sha256 === hash, `Local metadata differs from tarball: ${name}`);
    requireMatch(checksum.toString('utf8') === `${hash}  ${name}\n`, `Local checksum differs from tarball: ${name}`);
    const manifest = parseJson(command('tar', ['-xOf', join(assetsDir, name), 'package/package.json'], 'Archive manifest lookup'), `${name} package manifest`);
    requireMatch(manifest.name === metadata.name && manifest.version === metadata.version && manifest.devDependencies?.['@deepseek-ai/dsh'] === metadata.hostVersion, `Archive package/host differs from metadata: ${name}`);
    if (metadata.name === source.name) {
      // Legacy tags own their historical whitelist; current distributions keep
      // the default releaseFiles contract, including the licensing files.
      const policy = taggedPolicy
        ? { hostRange: taggedPolicy.hostRange, loaderRange: taggedPolicy.loaderRange }
        : { hostRange: rule.hostVersion, loaderRange: rule.loaderVersion, files: source.files };
      requireMatch(isDeepStrictEqual(manifest, hostManifest(source, rule.hostVersion, rule.loaderVersion, policy)), `Archive OMAA manifest differs from complete tagged source/host contract: ${name}`);
    } else {
      requireMatch(hasReviewedOmdManifest(manifest, rule), `Archive OMD manifest differs from the complete reviewed tagged baseline contract: ${name}`);
      requireMatch(metadata.nativeHostFactories === 'preserved', `OMD native preservation metadata differs: ${name}`);
      const compatibility = parseJson(command('tar', ['-xOf', join(assetsDir, name), 'package/omaa-compat.json'], 'Archive compatibility lookup'), `${name} OMD compatibility`);
      requireMatch(isDeepStrictEqual(compatibility, omdCompatibility(metadata, rule, rule.overlaySha256)), `Archive OMD compatibility differs from reviewed tagged source: ${name}`);
      await verifyIntegratedOmdPayload(join(assetsDir, name), rule);
    }
    const tarballAsset = inventory.get(name);
    requireMatch(tarballAsset.state === 'uploaded' && tarballAsset.size === bytes.length && tarballAsset.digest === `sha256:${hash}`, `Remote tarball size or digest differs: ${name}`);
    for (const sidecar of ['sha256', 'metadata.json']) {
      const asset = inventory.get(`${name}.${sidecar}`);
      requireMatch(asset.state === 'uploaded' && Number.isSafeInteger(asset.id) && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 4 * 1024 * 1024, `Invalid remote sidecar: ${name}.${sidecar}`);
      const remoteBytes = command('gh', ['api', '--method', 'GET', '-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/${asset.id}`], 'Release asset download');
      requireMatch(remoteBytes.length === asset.size && asset.digest === `sha256:${sha(remoteBytes)}`, `Remote sidecar size or digest differs: ${name}.${sidecar}`);
      if (sidecar === 'sha256') requireMatch(remoteBytes.equals(checksum), `Remote checksum differs: ${name}`);
      else {
        const remoteMetadata = parseJson(remoteBytes, `${name}.metadata.json (remote)`);
        requireMatch(remoteMetadata && typeof remoteMetadata === 'object' && !Array.isArray(remoteMetadata), `Invalid remote metadata object: ${name}`);
        // Only the top-level packaging timestamp may differ; all source fields remain exact.
        const { createdAt: localCreatedAt, ...localFields } = metadata;
        const { createdAt: remoteCreatedAt, ...remoteFields } = remoteMetadata;
        requireMatch(isDeepStrictEqual(localFields, remoteFields), `Remote metadata differs beyond createdAt: ${name}`);
      }
    }
  }
  requireMatch(pairs.size === packageCount && omdVersions.size === 1, 'Expected paired OMAA/OMD packages for every validation host with one OMD version.');
  console.log(`Verified existing release ${tag}: source commit ${localCommit}, ${attachmentCount} attachments, ${packageCount} identical tarballs and checksums; metadata matches except createdAt.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
