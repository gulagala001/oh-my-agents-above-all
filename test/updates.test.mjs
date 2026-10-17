import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createUpdates } from '../src/updates.mjs';
import { validationHosts as currentValidationHosts, alignedVersion, splitReleaseVersion } from '../src/host/compatibility.mjs';

const validationHosts = currentValidationHosts.filter(row => !row.validationPending);
let archiveRoot, createArchivedUpdates;
before(async () => {
  // Historical pair tests use their own complete policy. The pending a2 build
  // must not admit old SDKs or invent a reviewed a2 OMD release baseline.
  archiveRoot = await mkdtemp(join(tmpdir(), 'omaa-update-archive-'));
  await mkdir(join(archiveRoot, 'src/host'), { recursive: true });
  for (const path of ['src/updates.mjs', 'src/host/compatibility.mjs']) await cp(new URL('../' + path, import.meta.url), join(archiveRoot, path));
  await writeFile(join(archiveRoot, 'src/host/compatibility.json'), JSON.stringify({ hostRange: '>=0.2.0-rc.2 <=0.2.1-alpha.1', loaderRange: '>=1.0.5 <=1.0.6-alpha.1', validationHosts }));
  await writeFile(join(archiveRoot, 'package.json'), JSON.stringify({ type: 'module', version: '0.2.1-alpha.1.omaa.0.14.1' }));
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(archiveRoot, 'node_modules'), 'dir');
  ({ createUpdates: createArchivedUpdates } = await import(pathToFileURL(join(archiveRoot, 'src/updates.mjs')).href));
});
after(async () => { if (archiveRoot) await rm(archiveRoot, { recursive: true, force: true }); });

test('the pending a2 SDK build rejects old hosts before any update request or native installation', () => {
  for (const hostVersion of ['0.2.0-rc.2', '0.2.1-alpha.1']) assert.throws(() => createUpdates({ hostVersion,
    fetchImpl: () => { throw Error('Unexpected network request'); }, getManager: () => { throw Error('Unexpected native installation'); } }), /兼容范围/);
});

const repo = 'gulagala001/oh-my-agents-above-all';
const host = '0.2.0-rc.2', tag = 'v0.2.1-alpha.1.omaa.0.3.0';
const versions = { omaa: `${host}.omaa.0.3.0`, omd: `${host}.omd.0.7.2` };
const names = { omaa: 'oh-my-agents-above-all', omd: 'trisoul_x' };
function fixture({ partialFailure = false, metadataHost = host, draft = false, missingOmd = false,
  currentVersion = `${host}.omaa.0.2.1`, runtimeHost, releaseTag = tag, laterUnpaired = false } = {}) {
  const metadata = new Map(), calls = [];
  const release = { tag_name: releaseTag, draft, prerelease: true, published_at: '2026-10-06T00:00:00Z',
    html_url: `https://github.com/${repo}/releases/tag/${releaseTag}`, assets: [] };
  for (const product of ['omaa', 'omd']) {
    if (product === 'omd' && missingOmd) continue;
    const filename = `${names[product]}-${versions[product]}.tgz`;
    const url = `https://github.com/${repo}/releases/download/${releaseTag}/${filename}`;
    for (const suffix of ['', '.metadata.json', '.sha256']) release.assets.push({ name: filename + suffix, browser_download_url: url + suffix, state: 'uploaded' });
    metadata.set(url + '.metadata.json', { name: names[product], version: versions[product], hostVersion: metadataHost, filename, sha256: 'a'.repeat(64),
      ...(product === 'omd' ? { baseVersion: `${host}.omd.0.6.1`, sourceCommit: 'd29b75c98a0f6575af5880497c4d970125eeedf2', nativeHostFactories: 'preserved', overlaySha256: 'b'.repeat(64) } : {}) });
  }
  const bundles = [
    { name: names.omaa, version: currentVersion, installed: true, enabled: true },
    { name: names.omd, version: `${host}.omd.0.7.1`, installed: true, enabled: false },
  ];
  let running = false;
  const manager = { async listBundles() { return bundles.map(row => ({ ...row })); },
    async installBundle(url, options) {
      const product = url.includes('/trisoul_x-') ? 'omd' : 'omaa'; calls.push({ product, url, options });
      if (partialFailure && product === 'omaa') return { application: 'failed', error: { message: 'native failure' } };
      bundles.find(row => row.name === names[product]).version = versions[product];
      return { application: 'restart-required', bundle: names[product] };
    },
  };
  const service = createArchivedUpdates({ currentVersion: bundles[0].version, ...(runtimeHost ? { hostVersion: runtimeHost } : {}), getOmdVersion: () => `${host}.omd.0.7.1`, getManager: () => manager,
    isRunning: () => running, fetchImpl: async url => {
      const unpaired = { ...release, tag_name: 'v0.2.2-alpha.1.omaa.0.4.0', html_url: `https://github.com/${repo}/releases/tag/v0.2.2-alpha.1.omaa.0.4.0`, assets: [] };
      const value = url.includes('/releases?') ? [release, ...(laterUnpaired ? [unpaired] : [])] : metadata.get(url);
      return new Response(JSON.stringify(value), { status: value ? 200 : 404 });
    } });
  return { service, calls, setRunning: value => { running = value; } };
}

test('public prerelease pair uses native transactions, guards host/draft/pair, and keeps partial success visible', async t => {
  const good = fixture(); t.after(() => good.service.close());
  await good.service.check(true);
  assert.equal(good.calls.length, 0, 'checking never installs');
  assert.equal((await good.service.status()).latestVersion, versions.omaa, 'alpha main tag selects rc.2 asset');
  assert.equal(good.service.omdVersionSnapshot().latestVersion, versions.omd);
  good.setRunning(true);
  assert.equal((await good.service.status()).available, false);
  await good.service.start('omaa', versions.omaa);
  assert.equal(good.calls.length, 0, 'running agent blocks installation');
  good.setRunning(false);
  await good.service.start('omd', versions.omd);
  assert.deepEqual(good.calls.map(row => row.product), ['omd', 'omaa']);
  assert.deepEqual(good.calls.map(row => row.options.enabled), [false, true]);
  assert(good.calls.every(row => row.url.startsWith(`https://github.com/${repo}/releases/download/${tag}/`) && row.options.requestId));
  const completed = await good.service.status();
  assert.equal(completed.phase, 'restart-required'); assert.equal(completed.restartRequired, true);
  assert.equal(completed.currentVersion, `${host}.omaa.0.2.1`, 'running version is preserved until restart');
  assert.equal(completed.available, false);

  for (const badOptions of [{ metadataHost: '0.2.1-alpha.1' }, { draft: true }, { missingOmd: true }]) {
    const bad = fixture(badOptions); t.after(() => bad.service.close());
    await bad.service.check(true);
    assert((await bad.service.status()).error);
    await bad.service.start('omaa', versions.omaa);
    assert.equal(bad.calls.length, 0);
  }
  const partial = fixture({ partialFailure: true }); t.after(() => partial.service.close());
  await partial.service.start('omaa', versions.omaa);
  const failed = await partial.service.status();
  assert.equal(failed.phase, 'failed'); assert.equal(failed.restartRequired, true);
  assert.deepEqual(failed.installed, [{ product: 'omd', version: versions.omd }]);
  assert.match(failed.error, /native failure/);
});

test('source package uses the actual native host for updates across release prefixes', async t => {
  const f = fixture({ currentVersion: '0.2.1-alpha.1.omaa.0.2.1', runtimeHost: host,
    releaseTag: 'v0.2.2-alpha.1.omaa.0.3.0', laterUnpaired: true });
  t.after(() => f.service.close());
  await f.service.check(true);
  const state = await f.service.status();
  assert.equal(state.error, ''); assert.equal(state.hostVersion, host);
  assert.equal(state.latestVersion, versions.omaa);
  assert.equal(state.releaseTag, 'v0.2.2-alpha.1.omaa.0.3.0', 'latest unpaired main release does not erase the host-compatible pair');
  await f.service.start('omaa', versions.omaa);
  assert.deepEqual(f.calls.map(row => row.product), ['omd', 'omaa']);
  assert(f.calls.every(row => row.url.includes(host)), 'a source prefix never selects the wrong native host artifact');
});

test('updating OMD cannot combine a newer installed OMAA with an older release pair', async t => {
  const f = fixture({ currentVersion: `${host}.omaa.0.4.0` });
  t.after(() => f.service.close());
  await f.service.check(true);
  assert.equal((await f.service.status()).available, false);
  assert.match((await f.service.status()).blockedReason, /OMAA 高于/);
  await f.service.start('omd', versions.omd);
  assert.equal((await f.service.status()).phase, 'failed');
  assert.match((await f.service.status()).error, /不会降级或混装/);
  assert.equal(f.calls.length, 0, 'neither member of an incompatible pair is installed');
});

test('current OMAA pair accepts each reviewed host source and rejects commit drift', async t => {
  const source = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const feature = splitReleaseVersion(source.version, 'omaa').feature.join('.');
  for (const row of validationHosts) {
    const rule = JSON.parse(readFileSync(new URL('../compat/omd/' + row.omdVariant + '.json', import.meta.url)));
    const baseline = row.omdBaselines.find(item => item.version === rule.baseVersion);
    assert(baseline, 'current pair must have a reviewed runtime source');
    for (const drift of [false, true]) {
      const releaseTag = 'v' + source.version, metadata = new Map();
      const release = { tag_name: releaseTag, draft: false, prerelease: true, published_at: '2026-10-08T00:00:00Z',
        html_url: `https://github.com/${repo}/releases/tag/${releaseTag}`, assets: [] };
      for (const product of ['omaa', 'omd']) {
        const version = product === 'omaa' ? alignedVersion(row.version, 'omaa', feature) : baseline.version;
        const filename = `${names[product]}-${version}.tgz`, url = `https://github.com/${repo}/releases/download/${releaseTag}/${filename}`;
        for (const suffix of ['', '.metadata.json', '.sha256']) release.assets.push({ name: filename + suffix, browser_download_url: url + suffix, state: 'uploaded' });
        metadata.set(url + '.metadata.json', { name: names[product], version, hostVersion: row.version, filename, sha256: 'a'.repeat(64),
          ...(product === 'omd' ? { baseVersion: baseline.version, sourceCommit: drift ? 'f'.repeat(40) : baseline.commit,
            nativeHostFactories: 'preserved', overlaySha256: 'b'.repeat(64) } : {}) });
      }
      const service = createArchivedUpdates({ currentVersion: alignedVersion(row.version, 'omaa', '0.13.0'), hostVersion: row.version,
        getManager: () => ({ listBundles: async () => [{ name: names.omaa, version: alignedVersion(row.version, 'omaa', '0.13.0'), installed: true, enabled: true }] }),
        fetchImpl: async url => new Response(JSON.stringify(url.includes('/releases?') ? [release] : metadata.get(url)), { status: 200 }) });
      t.after(() => service.close());
      await service.check(true);
      const state = service.snapshot();
      if (drift) { assert.match(state.error, /来源尚未受支持/); assert.equal(state.latestVersion, null); }
      else { assert.equal(state.error, ''); assert.equal(state.latestVersion, alignedVersion(row.version, 'omaa', feature));
        assert.equal(state.latestOmdVersion, baseline.version); assert.equal(state.hostVersion, row.version); }
    }
  }
});
