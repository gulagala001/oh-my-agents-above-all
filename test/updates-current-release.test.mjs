import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdates } from '../src/updates.mjs';

const hostVersion = '0.2.1-rc.2', version = `${hostVersion}.omaa.0.15.3`, omdVersion = `${hostVersion}.omd.0.17.3`;
const sha256 = 'a'.repeat(64), sourceCommit = 'b'.repeat(40);
function fixture(wrongCommit = false) {
  const owner = 'gulagala001/', omaaRepo = owner + 'oh-my-agents-above-all', omdRepo = owner + 'oh-my-dsh';
  function release(repo, version, names) {
    const tag = `v${version}`;
    return { draft: false, published_at: '2026-10-17T12:00:00Z', tag_name: tag,
      html_url: `https://github.com/${repo}/releases/tag/${tag}`,
      assets: names.map(name => ({ name, state: 'uploaded', browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}` })) };
  }
  const name = `oh-my-agents-above-all-${version}.tgz`, omdName = `trisoul_x-${omdVersion}.tgz`;
  const omaa = release(omaaRepo, version, [name, name + '.sha256', name + '.metadata.json']);
  const omd = release(omdRepo, omdVersion, [omdName, 'SHA256SUMS', 'metadata.json']);
  const records = new Map([
    [`https://api.github.com/repos/${omaaRepo}/releases?per_page=30`, [omaa]],
    [omaa.assets[2].browser_download_url, { name: 'oh-my-agents-above-all', version, hostVersion, filename: name, sha256 }],
    [`https://api.github.com/repos/${omdRepo}/releases/tags/v${omdVersion}`, omd],
    [omd.assets[2].browser_download_url, { schema: 1, name: 'trisoul_x', version: omdVersion, hostVersion, file: omdName, sha256, sourceCommit }],
    [omd.assets[1].browser_download_url, `${sha256}  ${omdName}\n`],
    [`https://api.github.com/repos/${omdRepo}/git/ref/tags/v${omdVersion}`, { object: { type: 'commit', sha: wrongCommit ? 'c'.repeat(40) : sourceCommit } }],
  ]);
  return createUpdates({ currentVersion: version, hostVersion, getOmdVersion: () => omdVersion,
    getManager: () => ({ listBundles: async () => [{ name: 'oh-my-agents-above-all', version, installed: true }, { name: 'trisoul_x', version: omdVersion, installed: true }] }),
    fetchImpl: async url => { assert.ok(records.has(url), `Unexpected URL ${url}`); const value = records.get(url); return new Response(typeof value === 'string' ? value : JSON.stringify(value)); } });
}
test('current host resolves OMD from its fixed official release', async () => {
  const updates = fixture();
  const result = await updates.check(true);
  assert.equal(result.error, '');
  assert.equal(result.latestVersion, version);
  assert.equal(result.latestOmdVersion, omdVersion);
  updates.close();
});
test('current host rejects OMD metadata whose source differs from its tag', async () => {
  const updates = fixture(true);
  const result = await updates.check(true);
  assert.match(result.error, /tag 与来源提交不一致/);
  assert.equal(result.latestVersion, null);
  updates.close();
});
