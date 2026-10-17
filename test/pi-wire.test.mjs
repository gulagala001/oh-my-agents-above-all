import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { encodeFrames, frameDecoder, MAX_MESSAGE_BYTES } from '../src/presets/pi/extensions/wire.mjs';

const frames = (value, compress) => [...encodeFrames(value, { compress })].map(line => JSON.parse(line));
const decode = input => { const decoder = frameDecoder(); let result; for (const frame of input) { const value = decoder.accept(frame); if (value !== null) result = value; } return result; };

test('compression is negotiated and preserves complete Unicode callback data', () => {
  const message = { type: 'invoke', snapshot: { sessionEntries: [{ message: { content: [{ type: 'text', text: '原文🙂/完整\n'.repeat(180000) }] } }] } };
  const old = frames(message), packed = frames(message, true);
  assert.equal(old[0].encoding, undefined); assert.equal(packed[0].encoding, 'deflate');
  assert.ok(packed[0].encodedBytes < packed[0].bytes / 4);
  assert.deepEqual(decode(old), message); assert.deepEqual(decode(packed), message);
  assert.deepEqual(frames({ type: 'result', value: 'short' }, true), [{ type: 'result', value: 'short' }]);
});

test('encoded attachments fall back to the original frames without truncation', () => {
  const data = Array.from({ length: 50000 }, (_, i) => createHash('sha256').update(String(i)).digest('base64')).join('');
  const message = { type: 'result', value: { data } }, input = frames(message, true);
  assert.equal(input[0].encoding, undefined); assert.deepEqual(decode(input), message);
});

function transfer(raw, { bytes = raw.length, encoding = 'deflate', id = 'fixture' } = {}) {
  const body = encoding === 'deflate' ? deflateSync(raw) : raw, size = 256 * 1024;
  const output = [{ type: 'wire/start', id, bytes, parts: Math.ceil(body.length / size), encoding, encodedBytes: body.length }];
  for (let i = 0; i < body.length; i += size) output.push({ type: 'wire/chunk', id, index: i / size, data: body.subarray(i, i + size).toString('base64') });
  output.push({ type: 'wire/end', id }); return output;
}

test('compressed transfers retain decoded budgets, ordering and strict payload validation', () => {
  const raw = Buffer.from(JSON.stringify({ type: 'result', value: 'payload'.repeat(1000) }));
  assert.throws(() => decode(transfer(raw, { bytes: 100 })), /larger than|Invalid Pi encoded size/);
  assert.throws(() => decode(transfer(raw, { bytes: raw.length + 1 })), /decoded size/);
  assert.throws(() => decode(transfer(Buffer.from('invalid json'.repeat(100)))), /JSON|Unexpected token/);
  assert.throws(() => decode(transfer(Buffer.alloc(2000, 255))), /encoded data|encoding/);
  const input = transfer(raw);
  const trailing = Buffer.concat([deflateSync(raw), Buffer.from('trailing')]);
  assert.throws(() => decode([{ ...input[0], encodedBytes: trailing.length },
    { ...input[1], data: trailing.toString('base64') }, input.at(-1)]), /compressed bytes/);
  assert.throws(() => decode([{ ...input[0], encoding: 'gzip' }]), /encoding/);
  assert.throws(() => decode([{ ...input[0], encodedBytes: -1 }]), /encoded size/);
  assert.throws(() => decode([{ ...input[0], bytes: MAX_MESSAGE_BYTES + 1 }]), /excessive/);
  assert.throws(() => decode([input[0], { ...input[1], index: 1 }]), /chunk/);
  assert.throws(() => decode([input[0], { ...input[1], data: ' ' + input[1].data }]), /bytes/);
  assert.throws(() => decode([input[0], input.at(-1)]), /Incomplete/);
  const decoder = frameDecoder();
  decoder.accept({ ...input[0], bytes: MAX_MESSAGE_BYTES });
  assert.throws(() => decoder.accept({ ...input[0], id: 'other' }), /excessive/);
  decoder.clear(); assert.equal(decoder.accept(input[0]), null);
  for (const frame of input.slice(1)) decoder.accept(frame);
});

test('interleaved transfers stay independent and failed end decoding releases reservation', () => {
  const a = transfer(Buffer.from(JSON.stringify({ type: 'result', value: 'A'.repeat(2000) })), { id: 'a' });
  const b = transfer(Buffer.from(JSON.stringify({ type: 'result', value: 'B'.repeat(3000) })), { id: 'b' });
  const decoder = frameDecoder(); decoder.accept(a[0]); decoder.accept(b[0]);
  for (const frame of a.slice(1, -1)) decoder.accept(frame);
  for (const frame of b.slice(1, -1)) decoder.accept(frame);
  assert.equal(decoder.accept(b.at(-1)).value, 'B'.repeat(3000)); assert.equal(decoder.accept(a.at(-1)).value, 'A'.repeat(2000));
  const bad = transfer(Buffer.from('not json'.repeat(200)), { id: 'retry' });
  for (const frame of bad.slice(0, -1)) decoder.accept(frame);
  assert.throws(() => decoder.accept(bad.at(-1)), /JSON|Unexpected token/);
  assert.equal(decoder.accept(bad[0]), null); decoder.clear();
});
