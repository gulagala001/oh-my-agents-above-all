import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../src/client/themes/sources/', import.meta.url);
const read = file => readFile(new URL(file, root));
const json = async file => JSON.parse(await read(file));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('every source asset has a reproducible content hash for all five confirmed products', async () => {
  const index = await json('index.json');
  assert.deepEqual(index.products, ['codex', 'grok', 'cursor', 'pi', 'zcode']);
  assert.deepEqual(index.excluded, []);
  for (const row of index.assets) {
    assert.ok(!row.path.includes('..'));
    const data = await read(row.path); assert.equal(data.byteLength, row.bytes, row.path); assert.equal(digest(data), row.sha256, row.path);
  }
  assert.ok(index.assets.some(row => row.path === 'pi/provenance.json'));
});

test('Grok canonical colors come from Rust RGB declarations, including actual values over stale comments', async () => {
  const source = await json('grok-build.json');
  assert.equal(source.source.commit, '2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8'); assert.equal(source.source.license, 'Apache-2.0');
  for (const variant of Object.values(source.variants)) {
    const bytes = await read(variant.snapshot), lines = bytes.toString().split('\n'); assert.equal(digest(bytes), variant.sourceSha256);
    assert.equal(Object.keys(variant.roles).length, 58);
    for (const role of Object.values(variant.roles)) {
      assert.match(role.browserValue, /^#[a-f0-9]{6}$/);
      assert.ok(lines[role.sourceLine - 1].trim().startsWith(`${role.rawName}:`), role.rawName);
      if (role.paletteReference) assert.equal(role.browserValue, variant.palette[role.paletteReference].browserValue);
    }
  }
  assert.equal(source.variants.dark.roles.bg_base.browserValue, '#141414');
  assert.equal(source.variants.dark.roles.bg_terminal.browserValue, '#0a0a0a');
  assert.equal(source.variants.dark.roles.text_primary.browserValue, '#e1e1e1');
  assert.equal(source.variants.light.roles.text_primary.browserValue, '#262626');
  assert.equal(source.variants.dark.roles.accent_plan.browserValue, '#ffdb8d');
  assert.equal(source.variants.light.roles.prompt_border.browserValue, '#c8c8cd');
  assert.match((await read(source.source.noticesFile)).toString(), /groknight reuses Tokyo Night accent hexes/);
});

test('ZCode resolves pinned Tailwind references without dropping transparency or Oklab interpolation', async () => {
  const source = await json('zcode.json');
  assert.equal(source.source.commit, '29628c9acdb81b703bbd4080c207a0e7ce5e276e');
  assert.equal(source.nativeSelection.default, 'zaiDark'); assert.equal(source.nativeSelection.light, 'zaiLight'); assert.deepEqual(source.variants.zaiDark.cascade, ['@theme', '.dark', '.theme-zai-dark']);
  assert.equal(digest(await read(source.nativeSelection.snapshot)), source.nativeSelection.sha256);
  assert.equal(source.variants.zaiLight.tokens['--color-background'].browserValue, '#f8f8f8');
  assert.equal(source.variants.zaiDark.tokens['--color-background'].browserValue, '#161616');
  assert.equal(source.variants.zaiDark.tokens['--color-brand'].browserValue, '#ffffff');
  assert.equal(source.dependency.version, '4.2.2'); assert.equal(source.dependency.license, 'MIT');
  assert.equal(digest(await read(source.source.snapshot)), source.source.sha256);
  assert.equal(digest(await read(source.dependency.snapshot)), source.dependency.sha256);
  for (const variant of Object.values(source.variants)) {
    assert.deepEqual(variant.unresolved, []); assert.equal(Object.keys(variant.tokens).length, 144);
    for (const token of Object.values(variant.tokens)) {
      assert.ok(token.rawName.startsWith('--')); assert.ok(token.rawValue); assert.ok(token.sourceLine > 0);
      assert.ok(token.browserValue && !token.browserValue.includes('var('), token.rawName);
      if (token.rawValue.includes('transparent')) assert.ok(token.browserValue.includes('transparent'), token.rawName);
      if (token.rawValue.includes('in oklab')) assert.ok(token.browserValue.includes('in oklab'), token.rawName);
    }
  }
  assert.equal(source.variants.light.tokens['--color-background'].browserValue, 'oklch(98.5% 0 0)');
  assert.equal(source.variants.dark.tokens['--color-background'].browserValue, 'oklch(20.5% 0 0)');
  assert.equal(source.variants.light.tokens['--color-trajectory-user'].browserValue, '#2563eb');
  assert.equal(source.variants.dark.tokens['--color-trajectory-user'].browserValue, '#60a5fa');
  assert.equal(source.variants.light.tokens['--color-background-alt'].browserValue, 'color-mix(in oklab, oklch(97% 0 0) 60%, transparent)');
  assert.equal(source.variants.dark.tokens['--color-markdown-inline-code'].inherited, true);
});

test('Codex asset stays byte-identical to the recorded authorized OMD snapshot', async () => {
  const provenance = await json('codex-desktop.provenance.json'), bytes = await read(provenance.asset), asset = JSON.parse(bytes);
  assert.equal(digest(bytes), provenance.source.sha256);
  assert.equal(provenance.source.sha256, '6aba58372949773c374aee7350446367ae5f3660865afde0d6d79efe275ee4db');
  assert.equal(asset.id, 'codex-desktop'); assert.equal(asset.version, '1.0.1');
  assert.equal(asset.tokens.light.bg, '#ffffff'); assert.equal(asset.tokens.dark.bg, '#181818');
  assert.equal(provenance.source.license, null); assert.match(provenance.source.path, /trisoul_x\/src\/client\/skins\/bundled\/codex-desktop.json$/);
});

test('Cursor public layout references do not masquerade as an exact palette or copied closed-source assets', async () => {
  const source = await json('cursor.json');
  assert.equal(source.runtimeEvidence.version, '2026.10.01-e373342');
  assert.deepEqual(source.variants.light.tokens, {}); assert.deepEqual(source.variants.dark.tokens, {});
  assert.deepEqual(source.publicLayout.observedColors, []); assert.equal(source.publicLayout.pixelDimensions, null);
  assert.equal(source.publicLayout.regions.length, 5); assert.match(source.source.page, /^https:\/\/cursor.com\/cli$/);
  assert.match(source.source.usage, /No proprietary bundle fragments/);
});
