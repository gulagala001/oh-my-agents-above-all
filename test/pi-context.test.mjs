import test from 'node:test';
import assert from 'node:assert/strict';
import { requestToPi, requestFromPi } from '../src/presets/pi/extensions/context.mjs';

test('context text edits preserve native files and offloaded image identity', async () => {
  const image = { type: 'image', attachment: { id: 'owned-image', mediaType: 'image/png' }, offloaded: true };
  const file = { type: 'file', attachment: { id: 'owned-file' } };
  const request = { tools: [], messages: [{ id: 'user-a', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'original' }, image, file] }] };
  const signal = new AbortController().signal;
  const view = await requestToPi(request, { signal, argumentsFor: (_name, args) => args,
    piContent: async blocks => blocks.map(p => p.type === 'image' ? { type: 'image', data: 'synthetic', mimeType: 'image/png' } : p) });
  view.messages[0].content[0].text = 'changed';
  const result = await requestFromPi(view.messages, { ...view, request, signal, nativeArguments: (_name, args) => args,
    admitContent: async blocks => { assert(blocks.every(p => p.type === 'text'), 'existing attachment must not be re-admitted or un-offloaded'); return blocks; } });
  assert.equal(result.messages[0].content[1], image);
  assert.equal(result.messages[0].content[2], file);
  assert.equal(request.messages[0].content[0].text, 'original');
});

test('unchanged duplicate message bodies keep distinct native identities', async () => {
  const request = { tools: [], messages: ['a', 'b'].map(id => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'same' }] })) };
  const signal = new AbortController().signal;
  const view = await requestToPi(request, { signal, argumentsFor: (_name, args) => args, piContent: async blocks => blocks });
  const result = await requestFromPi(view.messages, { ...view, request, signal, nativeArguments: (_name, args) => args, admitContent: async blocks => blocks });
  assert.deepEqual(result.messages.map(message => message.id), ['a', 'b']);
});
