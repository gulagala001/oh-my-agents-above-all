import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import provenance from '../src/client/themes/shared/provenance.json' with { type: 'json' };
import { themePacks, productThemes } from '../src/client/themes/packs.mjs';
import { validateSkin } from '../src/client/themes/shared/format.mjs';
import { hostTokens } from '../src/client/themes/shared/mapping.mjs';

test('shared OMD theme support is a pinned snapshot including real Codex geometry', async () => {
  for (const row of provenance.snapshots) {
    const content = await readFile(new URL('../src/client/themes/shared/' + row.path, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), row.sha256, row.path);
  }
  assert.ok(provenance.snapshots.some(row => row.path === 'codex-integration.jsx'));
});

test('source-derived packs satisfy the importer contract and supply both host color schemes', () => {
  for (const pack of themePacks) {
    if (pack.inheritsHost) continue;
    const validated = validateSkin(pack);
    for (const [key, pair] of Object.entries(hostTokens(validated))) {
      assert.equal(typeof pair.light, 'string', pack.id + ':' + key);
      assert.equal(typeof pair.dark, 'string', pack.id + ':' + key);
    }
  }
  assert.equal(productThemes.codex, 'codex-desktop');
  assert.equal(productThemes.pi, 'pi-coding-agent');
  assert.equal(productThemes.cursor, 'cursor-cli');
});

test('Cursor has an explicit inherited fifth theme without promoting unmeasured RGB or creating alias cycles', () => {
  assert.equal(themePacks.length, 5);
  assert.equal(new Set(themePacks.map(pack => pack.id)).size, 5);
  const cursor = themePacks.find(pack => pack.id === productThemes.cursor);
  assert.match(cursor.name, /Agent 对话/u);
  assert.equal(cursor.layout, 'cursor-agent');
  assert.notEqual(cursor.tokens.common['font-ui'], cursor.tokens.common['font-mono'], 'desktop Agent controls use proportional text');
  assert.equal(cursor.provenance.source, 'sources/cursor/agent-window.json');
  assert.equal(cursor.inheritsHost, true);
  assert.equal(cursor.provenance.fixedProductPalette, false);
  for (const mode of ['light', 'dark']) {
    for (const [role, value] of Object.entries(cursor.tokens[mode])) {
      assert.match(value, /^var\(--dsw-alias-[a-z0-9-]+\)$/u, role);
      assert.ok(!value.includes('--omd-'), role);
    }
  }
  assert.deepEqual(cursor.tokens.light, cursor.tokens.dark, 'current host mode owns inherited colors');
  for (const id of Object.values(productThemes)) assert.ok(themePacks.some(pack => pack.id === id));
});
