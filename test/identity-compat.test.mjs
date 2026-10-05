import test from 'node:test';
import assert from 'node:assert/strict';
import { applySharedIdentity, omdIdentityPrompt } from '../src/host/identity.mjs';

const value = 'You are the user’s chosen assistant.\nKeep {{user_literal}} and $& verbatim.';
test('five preset identities use the shared OMD value literally and retain their behavior bodies', async () => {
  for (const product of ['codex', 'grok', 'cursor', 'pi', 'zcode']) {
    const { buildPrompt } = await import('../src/presets/' + product + '/prompt.mjs');
    const text = buildPrompt({ tools: new Set(['read']), cwd: '/tmp/work', platform: 'darwin' });
    const off = applySharedIdentity(text, product, '');
    assert.equal(applySharedIdentity(text, product, value), value + '\n\n' + off);
    assert.equal(applySharedIdentity(text, product, undefined), text);
    assert.equal(applySharedIdentity(text, product, value, { child: true }), text);
    assert(off.includes(product === 'zcode' ? 'IMPORTANT:' : product === 'codex' ? 'You and the user share' : product === 'grok' ? '<dangerous_actions>' : product === 'cursor' ? 'You use the Cursor' : '<tools>'));
  }
  assert.equal(applySharedIdentity('USER_SYSTEM {{raw}}', 'pi', value, { userSystem: true }), value + '\n\nUSER_SYSTEM {{raw}}');
  const ctx = config => ({ get: () => ({ config: () => config }) });
  assert.equal(omdIdentityPrompt({ get: () => undefined }), undefined);
  assert.equal(omdIdentityPrompt(ctx({ identityPrompt: value })), value);
  assert.equal(omdIdentityPrompt(ctx({ identityPreset: 'off', identityPrompt: value })), '');
  assert.equal(omdIdentityPrompt({ get: () => ({ omaaIdentityPrompt: () => value, config: () => ({ identityPrompt: 'stale' }) }) }), value);
});
