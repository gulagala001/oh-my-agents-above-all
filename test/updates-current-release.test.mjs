import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUpdates } from '../src/updates.mjs';

const hostVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines.dsh;
const otherHost = hostVersion === '0.2.1-rc.2' ? '0.2.1-rc.1' : '0.2.1-rc.2';
const version = `${hostVersion}.omaa.0.15.3`, omdVersion = `${hostVersion}.omd.0.100.0`;
const sha256 = 'a'.repeat(64), sourceCommit = 'b'.repeat(40);
function fixture({ wrongCommit = false, patch = '0.100.0', currentPatch = '0.100.0', invalid = '', extras = [], pages = null, omaaPages = null } = {}) {
  const target = `${hostVersion}.omd.${patch}`, current = `${hostVersion}.omd.${currentPatch}`;
  const owner = 'gulagala001/', omaaRepo = owner + 'oh-my-agents-above-all', omdRepo = owner + 'oh-my-dsh';
  function release(repo, version, names) {
    const tag = `v${version}`;
    return { draft: false, published_at: '2026-10-17T12:00:00Z', tag_name: tag,
      html_url: `https://github.com/${repo}/releases/tag/${tag}`,
      assets: names.map(name => ({ name, state: 'uploaded', browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${name}` })) };
  }
  const name = `oh-my-agents-above-all-${version}.tgz`, omdName = `oh-my-dsh-${target}.tgz`;
  const omaa = release(omaaRepo, version, [name, name + '.sha256', name + '.metadata.json']);
  const omd = release(omdRepo, target, [omdName, 'SHA256SUMS', 'metadata.json']);
  const releaseRows = [omd, ...extras.map(({ version, draft = false }) => ({ ...release(omdRepo, version, []), draft }))];
  const records = new Map([
    [`https://api.github.com/repos/${omaaRepo}/releases?per_page=100`, [omaa]],
    [omaa.assets[2].browser_download_url, { name: 'oh-my-agents-above-all', version, hostVersion, filename: name, sha256 }],
    [omd.assets[2].browser_download_url, { schema: 1, name: 'oh-my-dsh', version: target,
      hostVersion: invalid === 'host' ? otherHost : hostVersion, file: omdName, sha256, sourceCommit }],
    [omd.assets[1].browser_download_url, `${invalid === 'checksum' ? 'c'.repeat(64) : sha256}  ${omdName}\n`],
    [`https://api.github.com/repos/${omdRepo}/git/ref/tags/v${target}`, { object: { type: 'commit', sha: wrongCommit ? 'c'.repeat(40) : sourceCommit } }],
  ]);
  if (invalid === 'asset') omd.assets.shift();
  const bundles = [{ name: 'oh-my-agents-above-all', version, installed: true, enabled: true },
    { name: 'oh-my-dsh', version: current, installed: true, enabled: false }];
  const calls = [], requests = [];
  const updates = createUpdates({ currentVersion: version, hostVersion, getOmdVersion: () => current,
    getManager: () => ({ listBundles: async () => bundles.map(row => ({ ...row })),
      installBundle: async (url, options) => {
        calls.push({ url, options }); bundles[1].version = target;
        return { application: 'restart-required', bundle: 'oh-my-dsh' };
      } }),
    fetchImpl: async url => {
      requests.push(url);
      if (url.startsWith(`https://api.github.com/repos/${omdRepo}/releases?`)) {
        const page = Number(new URL(url).searchParams.get('page') || 1);
        return new Response(JSON.stringify(pages ? pages[page - 1] ?? [] : releaseRows));
      }
      if (omaaPages && url.startsWith(`https://api.github.com/repos/${omaaRepo}/releases?`)) {
        const page = Number(new URL(url).searchParams.get('page') || 1);
        return new Response(JSON.stringify(omaaPages[page - 1] ?? []));
      }
      assert.ok(records.has(url), `Unexpected URL ${url}`); const value = records.get(url);
      return new Response(typeof value === 'string' ? value : JSON.stringify(value));
    } });
  return { updates, calls, requests, releaseRows, omaa, omd };
}
test('current host resolves OMD independently of OMAA release attachments', async t => {
  const { updates, calls, omaa, omd } = fixture(); t.after(() => updates.close());
  // Unused legacy OMD attachments cannot block the official source.
  omaa.assets.push({ name: `oh-my-dsh-${omdVersion}.tgz` }, { name: `oh-my-dsh-${hostVersion}.omd.0.17.99.tgz` });
  const result = await updates.check(true);
  assert.equal(result.error, '');
  assert.equal(result.latestVersion, version);
  assert.equal(result.latestOmdVersion, omdVersion);
  assert.equal(updates.omdVersionSnapshot().status, 'current');
  assert.equal(updates.omdVersionSnapshot().releaseNotesUrl, omd.html_url);
  assert.equal(calls.length, 0, 'checking never installs');
});
test('latest compatible patch uses numeric order and only updates OMD through its native transaction', async t => {
  const { updates, calls, omd } = fixture({ patch: '0.100.7', extras: [
    { version: `${hostVersion}.omd.0.100.6` }, { version: `${hostVersion}.omd.0.100.1` },
    { version: `${otherHost}.omd.9.100.17` }, { version: `${hostVersion}.omd.0.99.99` },
    { version: `${hostVersion}.omd.0.17.99` },
    { version: `${hostVersion}.omd.0.100.8`, draft: true },
  ] }); t.after(() => updates.close());
  const result = await updates.omdVersionCheck(true);
  assert.equal(result.error, null); assert.equal(result.status, 'update');
  assert.equal(result.latestVersion, `${hostVersion}.omd.0.100.7`);
  assert.equal((await updates.omdUpdateStatus()).available, true);
  await updates.start('omd', result.latestVersion);
  assert.equal(updates.snapshot().phase, 'restart-required');
  assert.equal(calls.length, 1); assert.equal(calls[0].url, omd.assets[0].browser_download_url);
  assert.equal(calls[0].options.enabled, false);
});
test('future feature and major releases need no updater allowlist change', async t => {
  for (const patch of ['0.102.0', '0.103.11', '0.999.0', '3.7.2']) {
    const { updates, omd, calls } = fixture({ patch, currentPatch: '0.101.2', extras: [
      { version: `${hostVersion}.omd.0.101.99` }, { version: `${otherHost}.omd.9.999.99` },
      { version: `${hostVersion}.omd.9.999.99`, draft: true },
    ] });
    t.after(() => updates.close());
    const result = await updates.omdVersionCheck(true);
    assert.equal(result.error, null);
    assert.equal(result.latestVersion, `${hostVersion}.omd.${patch}`);
    await updates.start('omd', result.latestVersion);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, omd.assets[0].browser_download_url);
  }
});
test('invalid newest official patch blocks updates instead of falling back to an older package', async t => {
  for (const [options, error] of [
    [{ wrongCommit: true }, /tag 与来源提交不一致/], [{ invalid: 'host' }, /元数据与目标包不一致/],
    [{ invalid: 'checksum' }, /checksum 与元数据不一致/], [{ invalid: 'asset' }, /缺少匹配附件/],
  ]) {
    const { updates, calls } = fixture({ ...options, patch: '0.100.1', extras: [{ version: omdVersion }] });
    t.after(() => updates.close());
    const result = await updates.check(true);
    assert.match(result.error, error); assert.equal(result.latestVersion, null);
    await updates.start('omd', `${hostVersion}.omd.0.100.1`);
    assert.equal(calls.length, 0);
  }
});
test('patch selection refuses downgrades and rechecks a changed target before installation', async t => {
  const ahead = fixture({ currentPatch: '0.100.2', patch: '0.100.1' }); t.after(() => ahead.updates.close());
  await ahead.updates.check(true);
  assert.equal(ahead.updates.omdVersionSnapshot().status, 'ahead');
  assert.equal((await ahead.updates.omdUpdateStatus()).available, false);
  await ahead.updates.start('omd', `${hostVersion}.omd.0.100.1`);
  assert.equal(ahead.calls.length, 0);
  const changed = fixture({ patch: '0.100.1' }); t.after(() => changed.updates.close());
  await changed.updates.check(true);
  changed.releaseRows.length = 0;
  await changed.updates.start('omd', `${hostVersion}.omd.0.100.1`);
  assert.equal(changed.calls.length, 0);
  assert.match(changed.updates.snapshot().error, /尚未找到/);
});
test('both product histories finish all pages beyond the former scan bound', async t => {
  const baseline = fixture(); t.after(() => baseline.updates.close());
  const pages = Array.from({ length: 6 }, (_, page) => Array.from({ length: 100 }, (_, row) => ({
    draft: true, tag_name: `draft-${page}-${row}`,
  })));
  const paged = fixture({ pages: [...pages, [baseline.omd]], omaaPages: [...pages, [baseline.omaa]] });
  t.after(() => paged.updates.close());
  const result = await paged.updates.check(true);
  assert.equal(result.error, '');
  assert.equal(result.latestVersion, version);
  assert.equal(paged.updates.omdVersionSnapshot().status, 'current');
  for (const repo of ['oh-my-dsh', 'oh-my-agents-above-all']) {
    assert.equal(paged.requests.filter(url => url.includes(`/${repo}/releases?`)).length, 7);
  }
  for (const key of ['pages', 'omaaPages']) {
    const repeated = fixture({ [key]: [pages[0], pages[0]] });
    t.after(() => repeated.updates.close());
    assert.match((await repeated.updates.check(true)).error, /分页重复.*尚未确认最新兼容版本/);
    assert.equal(repeated.calls.length, 0);
  }
});
test('newest same-host OMAA release missing its package cannot silently fall back', async t => {
  const baseline = fixture(); t.after(() => baseline.updates.close());
  const next = `${hostVersion}.omaa.2.0.0`;
  const broken = { ...baseline.omaa, tag_name: `v${next}`, assets: [],
    html_url: `https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v${next}` };
  const { updates, calls } = fixture({ omaaPages: [[broken, baseline.omaa]] });
  t.after(() => updates.close());
  const result = await updates.check(true);
  assert.match(result.error, /缺少匹配附件/);
  assert.equal(result.latestVersion, null);
  assert.equal(calls.length, 0);
});
