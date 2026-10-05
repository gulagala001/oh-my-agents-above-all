import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdates } from '../src/updates.mjs';

const repo = 'gulagala001/oh-my-agents-above-all';
const host = '0.2.0-rc.2', tag = 'v0.2.1-alpha.1.omaa.0.3.0';
const versions = { omaa: `${host}.omaa.0.3.0`, omd: `${host}.omd.0.7.2` };
const names = { omaa: 'oh-my-agents-above-all', omd: 'trisoul_x' };
function fixture({ partialFailure = false, metadataHost = host, draft = false, missingOmd = false } = {}) {
  const metadata = new Map(), calls = [];
  const release = { tag_name: tag, draft, prerelease: true, published_at: '2026-10-06T00:00:00Z',
    html_url: `https://github.com/${repo}/releases/tag/${tag}`, assets: [] };
  for (const product of ['omaa', 'omd']) {
    if (product === 'omd' && missingOmd) continue;
    const filename = `${names[product]}-${versions[product]}.tgz`;
    const url = `https://github.com/${repo}/releases/download/${tag}/${filename}`;
    for (const suffix of ['', '.metadata.json', '.sha256']) release.assets.push({ name: filename + suffix, browser_download_url: url + suffix, state: 'uploaded' });
    metadata.set(url + '.metadata.json', { name: names[product], version: versions[product], hostVersion: metadataHost, filename, sha256: 'a'.repeat(64),
      ...(product === 'omd' ? { baseVersion: `${host}.omd.0.6.1`, sourceCommit: 'd29b75c98a0f6575af5880497c4d970125eeedf2', nativeHostFactories: 'preserved', overlaySha256: 'b'.repeat(64) } : {}) });
  }
  const bundles = [
    { name: names.omaa, version: `${host}.omaa.0.2.1`, installed: true, enabled: true },
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
  const service = createUpdates({ currentVersion: bundles[0].version, getOmdVersion: () => `${host}.omd.0.7.1`, getManager: () => manager,
    isRunning: () => running, fetchImpl: async url => {
      const value = url.includes('/releases?') ? [release] : metadata.get(url);
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
