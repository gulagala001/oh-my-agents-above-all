import { randomUUID } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 128 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

// Full native message views and end notifications must not be truncated.
// Fragment transport bytes only; callbacks receive the same JSON.
export function* encodeFrames(value, { compress = false } = {}) {
  const text = JSON.stringify(value), bytes = Buffer.byteLength(text);
  if (bytes > MAX_MESSAGE_BYTES) throw Error('Pi extension message exceeds 128 MiB');
  if (bytes + 1 <= MAX_FRAME_BYTES) { yield text + '\n'; return; }
  const raw = Buffer.from(text), sampleBytes = 16 * 1024;
  // Independent probes avoid compressing an encoded attachment in full.
  const samples = [raw.subarray(0, sampleBytes), raw.subarray(Math.floor(bytes / 2), Math.floor(bytes / 2) + sampleBytes), raw.subarray(-sampleBytes)];
  const compressible = compress && samples.every(sample => deflateSync(sample, { level: 1 }).length < sample.length * 0.6);
  const compressed = compressible ? deflateSync(raw, { level: 1 }) : raw;
  const packed = compressed !== raw && compressed.length < bytes * 0.75, body = packed ? compressed : raw;
  const id = randomUUID(), parts = Math.ceil(body.length / CHUNK_BYTES);
  yield JSON.stringify({ type: 'wire/start', id, bytes, parts, ...(packed ? { encoding: 'deflate', encodedBytes: body.length } : {}) }) + '\n';
  for (let index = 0; index < parts; index++) yield JSON.stringify({ type: 'wire/chunk', id, index,
    data: body.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString('base64') }) + '\n';
  yield JSON.stringify({ type: 'wire/end', id }) + '\n';
}

export function frameDecoder() {
  const packets = new Map(); let reserved = 0;
  return {
    clear() { packets.clear(); reserved = 0; },
    accept(frame) {
      if (!frame || typeof frame !== 'object' || Array.isArray(frame) || !String(frame.type).startsWith('wire/')) return frame;
      if (typeof frame.id !== 'string' || !frame.id || frame.id.length > 128) throw Error('Invalid Pi wire transfer identity');
      if (frame.type === 'wire/start') {
        const encodedBytes = frame.encoding === undefined ? frame.bytes : frame.encodedBytes;
        if (frame.encoding !== undefined && frame.encoding !== 'deflate') throw Error('Invalid Pi wire encoding');
        if (!Number.isSafeInteger(encodedBytes) || encodedBytes <= 0 || encodedBytes > frame.bytes) throw Error('Invalid Pi encoded size');
        if (packets.has(frame.id) || packets.size >= 64 || !Number.isSafeInteger(frame.bytes) || frame.bytes <= 0
          || frame.bytes > MAX_MESSAGE_BYTES || frame.parts !== Math.ceil(encodedBytes / CHUNK_BYTES)
          || reserved + frame.bytes > MAX_MESSAGE_BYTES) throw Error('Invalid or excessive Pi wire transfer');
        reserved += frame.bytes; packets.set(frame.id, { bytes: frame.bytes, parts: frame.parts, encodedBytes, encoding: frame.encoding, chunks: [], received: 0 }); return null;
      }
      const packet = packets.get(frame.id);
      if (!packet) throw Error('Unknown Pi wire transfer');
      if (frame.type === 'wire/chunk') {
        if (frame.index !== packet.chunks.length || frame.index >= packet.parts || typeof frame.data !== 'string'
          || frame.data.length > Math.ceil(CHUNK_BYTES / 3) * 4) throw Error('Invalid Pi wire chunk');
        const part = Buffer.from(frame.data, 'base64'), expected = Math.min(CHUNK_BYTES, packet.encodedBytes - packet.received);
        if (part.length !== expected || part.toString('base64') !== frame.data) throw Error('Invalid Pi wire bytes');
        packet.chunks.push(part); packet.received += part.length; return null;
      }
      if (frame.type !== 'wire/end' || packet.received !== packet.encodedBytes || packet.chunks.length !== packet.parts) throw Error('Incomplete Pi wire transfer');
      packets.delete(frame.id); reserved -= packet.bytes;
      let body = Buffer.concat(packet.chunks, packet.encodedBytes);
      if (packet.encoding === 'deflate') {
        const decoded = inflateSync(body, { maxOutputLength: packet.bytes, info: true });
        if (decoded.engine.bytesWritten !== packet.encodedBytes) throw Error('Invalid Pi compressed bytes');
        body = decoded.buffer;
      }
      if (body.length !== packet.bytes) throw Error('Invalid Pi decoded size');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    },
  };
}
