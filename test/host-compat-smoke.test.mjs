import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

test('packed host smoke retains five presets, native tools, modes and shared SDK', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true });
  await f.install(); await f.boot();
  const installed = await f.installedEvidence();
  assert.equal(installed.nativeHostDetection.version, process.env.OMAA_TEST_HOST_VERSION);
  for (const [name, sdk] of Object.entries(installed.sdk)) {
    assert.equal(sdk.hostVersion, sdk.pluginVersion, name);
    assert.equal(sdk.hostPath, sdk.pluginPath, name);
    assert.equal(sdk.hostModule, sdk.pluginModule, name);
  }
  assert.deepEqual(await f.exemptions(), {});
  const checks = [];
  for (const product of products) {
    const { sessionId } = await f.create(product.preset);
    assert.equal((await f.api(sessionId)).value.omdAvailable, false);
    let step = 0;
    f.replyWith(request => {
      if (!request.tools?.length) return textReply('fixture title');
      if (step++ === 0) return toolReply('write', { file_path: product.id + '.txt', content: product.id + '_NATIVE' });
      if (step === 2) return toolReply('read', { file_path: product.id + '.txt' });
      return textReply('native cycle complete');
    });
    const from = f.requests.length;
    const page = await f.prompt(sessionId, 'HOST_COMPAT_SMOKE_' + product.id);
    assert.equal(await f.readWorkspace(product.id + '.txt'), product.id + '_NATIVE');
    assert(JSON.stringify(page.records).includes(product.id + '_NATIVE'));
    const request = f.requests.slice(from).find(value => value.tools?.length);
    const tools = request.tools.map(value => value.function.name);
    for (const name of ['read', 'write', 'edit', 'bash']) assert(tools.includes(name), name);
    if (product.id !== 'pi') {
      assert(tools.includes('workflow'));
      for (const mode of ['ask', 'plan', 'default']) assert.equal((await f.api(sessionId, { mode })).value.mode, mode);
    }
    checks.push({ product: product.id, sessionId, tools, nativeReadWrite: true });
  }
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_SMOKE_REPORT) await writeFile(process.env.OMAA_SMOKE_REPORT, JSON.stringify({ passed: true,
    host: f.evidence.version, artifact: { path: f.evidence.artifact.path, sha256: f.evidence.artifact.sha256 }, installed, checks,
    scope: 'Official CLI, packed OMAA, owned profile, localhost scripted model; no GUI/desktop/OMD claim.' }, null, 2) + '\n');
});
