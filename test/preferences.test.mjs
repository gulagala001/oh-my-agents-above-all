import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreferencesStore, defaults } from '../src/host/preferences.mjs';

test('independent host stores preserve other sessions and observe saved changes after restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omaa-preferences-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const one = createPreferencesStore(directory), two = createPreferencesStore(directory);
  one.set('session/one', { ...defaults, mode: 'ask' });
  two.set('session/two', { ...defaults, enhancement: true });
  assert.equal(two.get('session/one').mode, 'ask');
  assert.equal(one.get('session/two').enhancement, true);
  const cold = createPreferencesStore(directory);
  assert.equal(cold.get('session/one').mode, 'ask'); assert.equal(cold.get('session/two').enhancement, true);
  assert.deepEqual(cold.get('unknown'), defaults);
  await assert.rejects(readFile(join(directory, 'preferences.json')), { code: 'ENOENT' });
  assert((await readdir(join(directory, 'preferences'))).every(name => /^[a-f0-9]{64}\.json$/.test(name)));
  assert.throws(() => one.set('session/one', { ...defaults, mode: 'plan' }));
  assert.equal(cold.get('session/one').mode, 'ask');
});
