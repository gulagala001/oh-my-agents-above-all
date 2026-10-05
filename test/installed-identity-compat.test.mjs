import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installedHost } from './fixtures/installed-host.mjs';
const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const artifact = process.env.OMAA_TEST_OMD_PACKAGE || [join(root, 'dist/trisoul_x-0.2.1-alpha.1.omd.0.8.0.tgz'), join(root, 'dist/0.3.0/trisoul_x-0.2.1-alpha.1.omd.0.8.0.tgz')].find(existsSync);
const systemTexts = request => request.messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : message.content.map(part => part.text || '').join('\n'));

test('OMD identity edits reach installed OMAA requests with enhancement off, including an existing session', { timeout: 90000 }, async t => {
  if (!artifact) { t.skip('Build the alpha compatibility package or set OMAA_TEST_OMD_PACKAGE.'); return; }
  const f = await installedHost(t);
  await run(process.execPath, [join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'plugin', '--profile', 'omaa-fixture', 'add', 'file:' + artifact], { cwd: root, env: { ...process.env, DSH_HOME: f.home }, timeout: 60000 });
  await f.install(); await f.boot();
  const settings = async patch => {
    const r = await fetch(f.origin + '/trisoul-x/api/settings', { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    assert.equal(r.status, 200, await r.text());
  };
  const identity = 'You are USER_IDENTITY_SENTINEL.\nKeep {{raw_identity}} and $& literal.';
  await settings({ identityPrompt: identity });
  const session = await f.create('omaa-codex'); assert.equal((await f.api(session.sessionId)).value.enhancementActive, false);
  let from = f.requests.length; await f.prompt(session.sessionId, 'FIRST_IDENTITY_REQUEST');
  let request = f.requests.slice(from).find(row => row.tools?.length); assert(request);
  assert(systemTexts(request)[0].startsWith(identity), systemTexts(request)[0].slice(0, 500));
  assert(systemTexts(request).join('\n').includes('You and the user share one workspace'));
  const changed = 'You are UPDATED_USER_IDENTITY.'; await settings({ identityPrompt: changed });
  from = f.requests.length; await f.prompt(session.sessionId, 'EXISTING_SESSION_IDENTITY_REQUEST');
  request = f.requests.slice(from).find(row => row.tools?.length); assert(systemTexts(request)[0].startsWith(changed), systemTexts(request)[0].slice(0, 500));
  await settings({ identityPreset: 'off' });
  from = f.requests.length; await f.prompt(session.sessionId, 'OFF_IDENTITY_REQUEST');
  request = f.requests.slice(from).find(row => row.tools?.length);
  assert(systemTexts(request)[0].startsWith('You and the user share one workspace'));
  assert(!systemTexts(request)[0].includes(changed));
});
