import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUpdates } from '../src/updates.mjs';

const hostVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines.dsh;
const otherHost = hostVersion === '0.2.1-rc.2' ? '0.2.1-rc.1' : '0.2.1-rc.2';
const version = `${hostVersion}.omaa.0.15.3`, omdVersion = `${hostVersion}.omd.0.18.0`;
const sha256 = 'a'.repeat(64), sourceCommit = 'b'.repeat(40);
function fixture({ wrongCommit = false, patch = '0.18.0', currentPatch = '0.18.0', invalid = '', extras = [], pages = null } = {}) {
  const target = `${hostVersion}.omd.${patch}`, current = `${hostVersion}.omd.${currentPatch}`;
  const owner = 'gulagala001/', omaaRepo = owner + 'oh-my-agents-above-all', omdRepo = owner + 'oh-my-dsh';
  function release(repo, version, names) {
    const tag = `v${version}`;
    return { draft: false, published_at: '2026-10-17T12:00:00Z', tag_name: tag,
      html_url: `https://github.com/${repo}/releases/tag/${tag}`,
      assets: names.map(name => ({ name, state: 'uploaded', browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}` })) };
  }
  const name = `oh-my-agents-above-all-${version}.tgz`, omdName = `trisoul_x-${target}.tgz`;
  const omaa = release(omaaRepo, version, [name, name + '.sha256', name + '.metadata.json']);
  const omd = release(omdRepo, target, [omdName, 'SHA256SUMS', 'metadata.json']);
  const releaseRows = [omd, ...extras.map(({ version, draft = false }) => ({ ...release(omdRepo, version, []), draft }))];
  const records = new Map([
    [`https://api.github.com/repos/${omaaRepo}/releases?per_page=30`, [omaa]],
    [omaa.assets[2].browser_download_url, { name: 'oh-my-agents-above-all', version, hostVersion, filename: name, sha256 }],
    [omd.assets[2].browser_download_url, { schema: 1, name: 'trisoul_x', version: target,
      hostVersion: invalid === 'host' ? otherHost : hostVersion, file: omdName, sha256, sourceCommit }],
    [omd.assets[1].browser_download_url, `${invalid === 'checksum' ? 'c'.repeat(64) : sha256}  ${omdName}\n`],
    [`https://api.github.com/repos/${omdRepo}/git/ref/tags/v${target}`, { object: { type: 'commit', sha: wrongCommit ? 'c'.repeat(40) : sourceCommit } }],
  ]);
  if (invalid === 'asset') omd.assets.shift();
  const bundles = [{ name: 'oh-my-agents-above-all', version, installed: true, enabled: true },
    { name: 'trisoul_x', version: current, installed: true, enabled: false }];
  const calls = [], requests = [];
  const updates = createUpdates({ currentVersion: version, hostVersion, getOmdVersion: () => current,
    getManager: () => ({ listBundles: async () => bundles.map(row => ({ ...row })),
      installBundle: async (url, options) => {
        calls.push({ url, options }); bundles[1].version = target;
        return { application: 'restart-required', bundle: 'trisoul_x' };
      } }),
    fetchImpl: async url => {
      requests.push(url);
      if (url.startsWith(`https://api.github.com/repos/${omdRepo}/releases?`)) {
        const page = Number(new URL(url).searchParams.get('page'));
        return new Response(JSON.stringify(pages ? pages[page - 1] ?? [] : releaseRows));
      }
      assert.ok(records.has(url), `Unexpected URL ${url}`); const value = records.get(url);
      return new Response(typeof value === 'string' ? value : JSON.stringify(value));
    } });
  return { updates, calls, requests, releaseRows, omaa, omd };
}
test('current host resolves OMD independently of OMAA release attachments', async t => {
  const { updates, calls, omaa, omd } = fixture(); t.after(() => updates.close());
  // Unused legacy OMD attachments cannot block the official source.
  omaa.assets.push({ name: `trisoul_x-${omdVersion}.tgz` }, { name: `trisoul_x-${hostVersion}.omd.0.17.99.tgz` });
  const result = await updates.check(true);
  assert.equal(result.error, '');
  assert.equal(result.latestVersion, version);
  assert.equal(result.latestOmdVersion, omdVersion);
  assert.equal(updates.omdVersionSnapshot().status, 'current');
  assert.equal(updates.omdVersionSnapshot().releaseNotesUrl, omd.html_url);
  assert.equal(calls.length, 0, 'checking never installs');
});
test('latest compatible patch uses numeric order and only updates OMD through its native transaction', async t => {
  const { updates, calls, omd } = fixture({ patch: '0.18.7', extras: [
    { version: `${hostVersion}.omd.0.18.6` }, { version: `${hostVersion}.omd.0.18.1` },
    { version: `${otherHost}.omd.0.18.17` }, { version: `${hostVersion}.omd.0.19.0` },
    { version: `${hostVersion}.omd.1.17.0` }, { version: `${hostVersion}.omd.0.17.99` },
    { version: `${hostVersion}.omd.0.18.8`, draft: true },
  ] }); t.after(() => updates.close());
  const result = await updates.omdVersionCheck(true);
  assert.equal(result.error, null); assert.equal(result.status, 'update');
  assert.equal(result.latestVersion, `${hostVersion}.omd.0.18.7`);
  assert.equal((await updates.omdUpdateStatus()).available, true);
  await updates.start('omd', result.latestVersion);
  assert.equal(updates.snapshot().phase, 'restart-required');
  assert.equal(calls.length, 1); assert.equal(calls[0].url, omd.assets[0].browser_download_url);
  assert.equal(calls[0].options.enabled, false);
});
test('invalid newest official patch blocks updates instead of falling back to an older package', async t => {
  for (const [options, error] of [
    [{ wrongCommit: true }, /tag 与来源提交不一致/], [{ invalid: 'host' }, /元数据与目标包不一致/],
    [{ invalid: 'checksum' }, /checksum 与元数据不一致/], [{ invalid: 'asset' }, /缺少匹配附件/],
  ]) {
    const { updates, calls } = fixture({ ...options, patch: '0.18.1', extras: [{ version: omdVersion }] });
    t.after(() => updates.close());
    const result = await updates.check(true);
    assert.match(result.error, error); assert.equal(result.latestVersion, null);
    await updates.start('omd', `${hostVersion}.omd.0.18.1`);
    assert.equal(calls.length, 0);
  }
});
test('patch selection refuses downgrades and rechecks a changed target before installation', async t => {
  const ahead = fixture({ currentPatch: '0.18.2', patch: '0.18.1' }); t.after(() => ahead.updates.close());
  await ahead.updates.check(true);
  assert.equal(ahead.updates.omdVersionSnapshot().status, 'ahead');
  assert.equal((await ahead.updates.omdUpdateStatus()).available, false);
  await ahead.updates.start('omd', `${hostVersion}.omd.0.18.1`);
  assert.equal(ahead.calls.length, 0);
  const changed = fixture({ patch: '0.18.1' }); t.after(() => changed.updates.close());
  await changed.updates.check(true);
  changed.releaseRows.length = 0;
  await changed.updates.start('omd', `${hostVersion}.omd.0.18.1`);
  assert.equal(changed.calls.length, 0);
  assert.match(changed.updates.snapshot().error, /尚未找到/);
});
test('official discovery completes pagination and reports an incomplete bounded scan', async t => {
  const baseline = fixture(); t.after(() => baseline.updates.close());
  const fullPage = Array.from({ length: 30 }, () => ({ draft: true }));
  const paged = fixture({ pages: [fullPage, [baseline.omd]] }); t.after(() => paged.updates.close());
  assert.equal((await paged.updates.omdVersionCheck(true)).status, 'current');
  assert.ok(paged.requests.some(url => url.endsWith('&page=2')));
  const incomplete = fixture({ pages: Array(5).fill(fullPage) }); t.after(() => incomplete.updates.close());
  assert.match((await incomplete.updates.check(true)).error, /尚未确认最新兼容版本/);
  assert.equal(incomplete.requests.filter(url => url.includes('&page=')).length, 5);
});
