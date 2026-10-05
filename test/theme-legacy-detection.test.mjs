import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLegacyAppearance } from '../src/client/themes/runtime.mjs';

test('legacy OMD detection uses actual style ownership rather than unavailable enhancer metadata', () => {
  let style = false, shell = false, provider = false;
  const surface = { querySelector: () => style ? {} : null, documentElement: { classList: { contains: () => shell } } };
  const coordinator = { hasProvider: id => id === 'omd' && provider };
  assert.equal(hasLegacyAppearance(surface, coordinator), false, 'independent OMAA is allowed');
  style = true;
  assert.equal(hasLegacyAppearance(surface, coordinator), true, 'old OMD styles without coordinator block takeover');
  provider = true;
  assert.equal(hasLegacyAppearance(surface, coordinator), false, 'compatible OMD coordinates despite its live styles');
  provider = false; style = false; shell = true;
  assert.equal(hasLegacyAppearance(surface, coordinator), true, 'old shell marker also identifies legacy ownership');
});
