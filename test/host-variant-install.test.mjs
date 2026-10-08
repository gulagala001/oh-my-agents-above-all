import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { installedHost, packageEvidence } from './fixtures/installed-host.mjs';

// The source tarball receives the full matrix; this separately checks the
// host-aligned distribution through the same native installer and resolver.
test('host variant installs and resolves the actual native SDK', { timeout: 180000 }, async t => {
  if (process.env.OMAA_HOST_VARIANT_INSTALL !== '1') { t.skip('Set OMAA_HOST_VARIANT_INSTALL=1 with explicit host CLI, version and variant tarball.'); return; }
  for (const key of ['OMAA_HOST_CLI', 'OMAA_HOST_VERSION', 'OMAA_HOST_PACKAGE']) assert(process.env[key]?.trim(), key + ' is required');
  const artifact = await packageEvidence(process.env.OMAA_HOST_PACKAGE);
  const f = await installedHost(t, { cliPath: resolve(process.env.OMAA_HOST_CLI), packagePath: artifact.path, expectedHostVersion: process.env.OMAA_HOST_VERSION, safeEnvironment: true });
  await f.install();
  const installed = await f.installedEvidence(artifact.name);
  assert.equal(installed.manifest.version, artifact.version);
  assert.equal(installed.nativeHostDetection.available, true);
  assert.equal(installed.nativeHostDetection.version, process.env.OMAA_HOST_VERSION);
  assert.deepEqual(installed.linkedRoots, []);
  for (const [name, sdk] of Object.entries(installed.sdk)) {
    assert.equal(sdk.pluginPath, sdk.hostPath, name);
    assert.equal(sdk.pluginModule, sdk.hostModule, name);
    assert.equal(sdk.pluginVersion, sdk.hostVersion, name);
    assert.equal(sdk.routingScope, 'installation', name);
  }
  assert.deepEqual(await f.exemptions(), {});
  await f.boot(); const session = await f.create('omaa-codex');
  assert.equal((await f.api(session.sessionId)).status, 200);
  await f.prompt(session.sessionId, 'HOST_VARIANT_NATIVE_INSTALL');
  assert(f.requests.some(row => row.tools?.length));
  await f.stop(); await f.uninstall(); await f.boot();
  const stock = await f.create('standard'); await f.prompt(stock.sessionId, 'HOST_VARIANT_AFTER_UNINSTALL');
  assert.equal((await fetch(f.origin + '/omaa/api/session?session=' + stock.sessionId, { headers: { cookie: f.cookie } })).status, 404);
  await f.stop(); assert.deepEqual(f.errors, []);
  if (process.env.OMAA_HOST_VARIANT_REPORT) {
    const path = resolve(process.env.OMAA_HOST_VARIANT_REPORT); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ schema: 1, status: 'passed', host: f.evidence, packageVersion: artifact.version, packSha256: artifact.sha256, sdk: installed.sdk, nativeInstall: true, nativeBoot: true, nativeUninstall: true }, null, 2) + '\n');
  }
});
