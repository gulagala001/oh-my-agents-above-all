import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignedVersion, supportsHostVersion, splitReleaseVersion, compareFeatures, validationHosts } from '../src/host/compatibility.mjs';

test('each SDK build admits only its exact host', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const host = manifest.devDependencies['@deepseek-ai/dsh'];
  assert(supportsHostVersion(host));
  for (const version of ['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.0-rc.3', '0.2.0', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.3.0', 'latest', 'v0.2.1-alpha.3']) if (version !== host) assert(!supportsHostVersion(version), version);
  assert.equal(splitReleaseVersion(manifest.version).host, host);
  for (const [name, version] of Object.entries(manifest.peerDependencies)) if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, host, name);
});

test('release syntax accepts new host generations and preserves formal/prerelease prefixes', () => {
  for (const host of ['0.2.0', '0.2.0-rc.2', '0.2.1-alpha.1', '0.2.2-beta.3']) for (const product of ['omaa', 'omd']) {
    const version = alignedVersion(host, product, '1.12.3');
    assert.deepEqual(splitReleaseVersion(version, product), { host, feature: [1n, 12n, 3n] });
  }
  for (const version of ['0.2.0.omaa.1.0.0', '0.2.0-rc.2-omaa.1.0.0', '0.2.0-omaa.01.0.0', 'latest.omaa.1.0.0', '0.2.0-omaa.1.0', '0.2.0-omd.1.0.0']) {
    assert.throws(() => splitReleaseVersion(version));
  }
  assert.equal(compareFeatures('0.2.2-beta.3.omaa.1.12.3', '0.2.0-rc.2.omaa.1.11.9'), 1);
  assert.equal(compareFeatures('0.2.0-rc.2.omaa.1.12.3', '0.2.1-alpha.1.omaa.1.12.3'), 0);
});

test('current integrated OMD rules share the runtime update baseline and retain reviewed history', () => {
  for (const row of validationHosts) {
    if (row.validationPending) {
      assert.equal(row.unpublished, true);
      assert.deepEqual(row.omdBaselines, [], 'a pending build must not invent a reviewed integrated baseline');
      continue;
    }
    const rule = JSON.parse(readFileSync(new URL('../compat/omd/' + row.omdVariant + '.json', import.meta.url), 'utf8'));
    assert.equal(rule.hostVersion, row.version);
    assert.equal(rule.mode, 'integrated-baseline');
    assert.equal(rule.baseVersion, alignedVersion(row.version, 'omd', '0.12.0'));
    assert.equal(rule.sourceTag, null, 'current candidate has no published source tag');
    assert(row.omdBaselines.some(baseline => baseline.version === rule.baseVersion && baseline.commit === rule.sourceCommit));
    for (const version of ['0.6.1', '0.9.0', '0.10.0']) assert(row.omdBaselines.some(baseline => baseline.version === alignedVersion(row.version, 'omd', version)), version + ' history');
    assert.equal(new Set(row.omdBaselines.map(baseline => baseline.version)).size, row.omdBaselines.length);
  }
});
