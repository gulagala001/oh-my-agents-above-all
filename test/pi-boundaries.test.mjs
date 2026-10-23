import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBoundaryRequest, boundaryRecord } from '../src/presets/pi/extensions/boundaries.mjs';

const adapters = { signal: new AbortController().signal, piContent: async blocks => blocks.map(block => block.type === 'image'
  ? { type: 'image', data: 'eA==', mimeType: 'image/png' } : block), argumentsFor: (_name, args) => args, nativeArguments: (_name, args) => args,
  admitContent: async blocks => { assert(blocks.every(block => block.type === 'text'), 'retained native image cannot be re-admitted'); return blocks; } };
const system = { id: 'system', role: 'system', content: [{ type: 'text', text: 'SYSTEM' }], source: { kind: 'system-prompt' } };
const record = (seq, entries) => ({ type: boundaryRecord, seq, time: 1, data: { entries, messages: [] } });
const native = (seq, message) => ({ type: message.role === 'system' ? 'system/message' : 'user/message', seq, time: 1, surfaceOp: 'append',
  data: message.role === 'system' ? { message } : message });

test('boundary custom messages retain native identities and offloaded attachments', async () => {
  const image = { type: 'image', attachment: { id: 'owned-image', mediaType: 'image/png' }, offloaded: true };
  const note = { id: 'native-note', role: 'user', content: [image], source: { kind: 'pi-extension', customType: 'note', display: false, piBoundaryEntryId: 'draft' } };
  const events = [native(0, system), record(1, [{ id: 'draft', type: 'custom_message', customType: 'note', display: false,
    timestamp: new Date(1).toISOString(), content: [{ type: 'image', data: 'eA==', mimeType: 'image/png' }] }]), native(2, note)];
  const result = await projectBoundaryRequest({ messages: [system, note], tools: [] }, events, adapters);
  assert.equal(result.request.messages[1].id, note.id);
  assert.equal(result.request.messages[1].content[0], image);
});

test('a later native checkpoint does not resurrect absorbed Pi draft context', async () => {
  const checkpoint = { id: 'checkpoint', role: 'user', content: [{ type: 'text', text: 'NATIVE_CHECKPOINT' }], source: { kind: 'compact-checkpoint' } };
  const events = [native(0, system), record(1, [
    { id: 'old', type: 'custom_message', customType: 'old', display: false, content: 'OLD_ABSORBED_NOTE', timestamp: new Date(1).toISOString() },
    { id: 'old-summary', type: 'compaction', summary: 'OLD_ABSORBED_SUMMARY', firstKeptEntryId: 'old-summary', timestamp: new Date(1).toISOString() },
    { id: 'state', type: 'custom', customType: 'saved', data: 3, timestamp: new Date(1).toISOString() },
  ]), native(4, checkpoint)];
  const result = await projectBoundaryRequest({ messages: [system, checkpoint], tools: [] }, events, adapters);
  assert(!JSON.stringify(result.request.messages).includes('OLD_ABSORBED'));
  assert(JSON.stringify(result.request.messages).includes('NATIVE_CHECKPOINT'));
  assert(result.projection.entries.some(entry => entry.sourceEntry.id === 'state'));
});
