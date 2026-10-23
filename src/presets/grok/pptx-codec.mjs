// Derived behavioral port of fixed Grok read_file/pptx.rs (Apache-2.0).
// ZIP container admission is OMAA code; no archive paths are extracted to disk.
import { inflateRawSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import { NAME_RE } from 'xmlchars/xml/1.0/ed5.js';
import { MAX_DOCUMENT_TEXT_BYTES } from './document-text.mjs';

export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_XML_BYTES = 64 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
};
function zipIndex(input) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const bounds = (offset, size) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length)
      throw Error('Invalid PPTX ZIP bounds.');
  };
  const u16 = offset => { bounds(offset, 2); return bytes.readUInt16LE(offset); };
  const u32 = offset => { bounds(offset, 4); return bytes.readUInt32LE(offset); };
  const u64 = offset => {
    bounds(offset, 8); const n = bytes.readBigUInt64LE(offset);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('PPTX ZIP64 field exceeds safe bounds.');
    return Number(n);
  };
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--)
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
  if (end < 0 || end < bytes.length - 65557) throw Error('Invalid PPTX ZIP end record.');
  if (u16(end + 4) || u16(end + 6)) throw Error('Multi-volume PPTX ZIP is unsupported.');
  let count = u16(end + 10), size = u32(end + 12), start = u32(end + 16), directoryBound = end;
  if (u16(end + 8) !== count) throw Error('Inconsistent PPTX ZIP entry count.');
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff || end >= 20 && u32(end - 20) === 0x07064b50) {
    if (end < 20 || u32(end - 20) !== 0x07064b50 || u32(end - 16) || u32(end - 4) !== 1)
      throw Error('Invalid PPTX ZIP64 locator.');
    const z = u64(end - 12); bounds(z, 56);
    const recordSize = u64(z + 4);
    if (recordSize < 44) throw Error('Invalid PPTX ZIP64 end-record length.');
    bounds(z, 12 + recordSize);
    if (z + 12 + recordSize !== end - 20) throw Error('Invalid PPTX ZIP64 end-record extent.');
    if (u32(z) !== 0x06064b50 || u32(z + 16) || u32(z + 20) || u64(z + 24) !== u64(z + 32))
      throw Error('Invalid PPTX ZIP64 directory.');
    const count64 = u64(z + 32), size64 = u64(z + 40), start64 = u64(z + 48);
    if (count !== 0xffff && count !== count64 || size !== 0xffffffff && size !== size64 || start !== 0xffffffff && start !== start64)
      throw Error('Inconsistent PPTX ZIP64/classic directory fields.');
    count = count64; size = size64; start = start64;
    directoryBound = z;
  }
  bounds(start, size);
  if (start + size > directoryBound || count > Math.floor(size / 46)) throw Error('Invalid PPTX central directory size.');
  const files = new Map(); let at = start;
  for (let n = 0; n < count; n++) {
    bounds(at, 46);
    if (u32(at) !== 0x02014b50) throw Error('Invalid PPTX central directory entry.');
    const flags = u16(at + 8), method = u16(at + 10), checksum = u32(at + 16);
    let compressed = u32(at + 20), expanded = u32(at + 24), offset = u32(at + 42), disk = u16(at + 34);
    const nameLength = u16(at + 28), extraLength = u16(at + 30), commentLength = u16(at + 32);
    const next = at + 46 + nameLength + extraLength + commentLength;
    bounds(at, next - at);
    if (next > start + size || disk !== 0 && disk !== 0xffff) throw Error('Invalid PPTX ZIP entry extent.');
    if ([compressed, expanded, offset].includes(0xffffffff) || disk === 0xffff) {
      let found = false;
      for (let p = at + 46 + nameLength, stop = p + extraLength; p + 4 <= stop;) {
        const id = u16(p), length = u16(p + 2); p += 4;
        if (p + length > stop) throw Error('Invalid PPTX ZIP extra data.');
        if (id === 1) {
          let field = p;
          const read = () => { if (field + 8 > p + length) throw Error('Missing PPTX ZIP64 field.'); const v = u64(field); field += 8; return v; };
          if (expanded === 0xffffffff) expanded = read();
          if (compressed === 0xffffffff) compressed = read();
          if (offset === 0xffffffff) offset = read();
          if (disk === 0xffff) { if (field + 4 > p + length) throw Error('Missing PPTX ZIP64 disk field.'); disk = u32(field); }
          found = true; break;
        }
        p += length;
      }
      if (!found) throw Error('Missing PPTX ZIP64 extra data.');
    }
    if (disk !== 0) throw Error('Multi-volume PPTX ZIP entry is unsupported.');
    // Only ASCII OOXML part names are selected below; unrelated legacy names
    // need no guessed codepage conversion or filesystem interpretation.
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    const name = flags & 0x800 ? new TextDecoder('utf-8', { fatal: true }).decode(nameBytes) : nameBytes.toString('latin1');
    files.set(name, { flags, method, checksum, compressed, expanded, offset, nameBytes });
    at = next;
  }
  // A bounded optional central-directory digital-signature record may follow
  // the entries. No unparsed bytes may alias ZIP64/locator/end metadata.
  if (at !== start + size) {
    if (start + size - at < 6 || u32(at) !== 0x05054b50 || at + 6 + u16(at + 4) !== start + size)
      throw Error('Unexpected PPTX central-directory trailing data.');
  }
  const read = name => {
    const file = files.get(name); if (!file) return undefined;
    if (file.expanded >= MAX_XML_BYTES) throw Error(`${name} exceeds the decompressed size limit`);
    if (file.flags & 1 || ![0, 8].includes(file.method)) throw Error(`Unsupported encrypted/compressed PPTX entry: ${name}`);
    const p = file.offset; bounds(p, 30);
    if (u32(p) !== 0x04034b50 || u16(p + 8) !== file.method || u16(p + 6) & 1)
      throw Error(`Invalid PPTX local header: ${name}`);
    const length = u16(p + 26), extra = u16(p + 28), dataAt = p + 30 + length + extra;
    bounds(p + 30, length + extra); bounds(dataAt, file.compressed);
    if (dataAt + file.compressed > start || !bytes.subarray(p + 30, p + 30 + length).equals(file.nameBytes))
      throw Error(`Invalid PPTX entry location: ${name}`);
    const packed = bytes.subarray(dataAt, dataAt + file.compressed);
    const data = file.method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_XML_BYTES });
    if (data.length >= MAX_XML_BYTES || data.length !== file.expanded || crc32(data) !== file.checksum)
      throw Error(`PPTX entry length/CRC check failed: ${name}`);
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  };
  return { files, read };
}

export function extractDrawingMlText(xml) {
  const parser = new SaxesParser({ xmlns: false, defaultXMLVersion: '1.0', forceXMLVersion: true });
  const predefined = Object.assign(Object.create(null), { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
  // Public ENTITIES table: predefined/numeric refs resolve normally; unknown
  // valid names remain visible, exactly as the fixed quick-xml helper does.
  parser.ENTITIES = new Proxy(predefined, { get: (map, name) => typeof name === 'string' && NAME_RE.test(name) ? map[name] ?? `&${name};` : undefined });
  let text = '', inRun = false;
  const local = tag => tag.name.slice(tag.name.lastIndexOf(':') + 1);
  parser.on('opentag', tag => { if (!tag.isSelfClosing && local(tag) === 't') inRun = true; });
  parser.on('text', value => { if (inRun) text += value; });
  // Fixed source ignores CData/Empty events, rather than treating them as runs.
  parser.on('closetag', tag => {
    if (tag.isSelfClosing) return;
    if (local(tag) === 't') inRun = false;
    else if (local(tag) === 'p' && text && !text.endsWith('\n')) text += '\n';
  });
  parser.on('error', error => { throw error; });
  parser.write(xml).close();
  return text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
}

export function extractPptxText(bytes) {
  if (bytes.byteLength > MAX_INPUT_BYTES) throw Error('PPTX exceeds the 50 MiB input limit.');
  const archive = zipIndex(bytes);
  const numbers = [...archive.files.keys()].flatMap(name => {
    const match = /^ppt\/slides\/slide(\+?\d+)\.xml$/.exec(name);
    if (!match) return [];
    const n = Number(match[1]); return Number.isSafeInteger(n) && n <= 0xffffffff ? [n] : [];
  }).sort((a, b) => a - b);
  if (!numbers.length) throw Error('No slides found in PPTX');
  const slides = []; let textBytes = 0;
  for (const number of numbers) {
    const xml = archive.read(`ppt/slides/slide${number}.xml`);
    if (xml === undefined) throw Error(`Failed to read slide ${number}`);
    const text = extractDrawingMlText(xml);
    let notes = '';
    try { const value = archive.read(`ppt/notesSlides/notesSlide${number}.xml`); if (value !== undefined) notes = extractDrawingMlText(value); } catch { /* Fixed source ignores optional note failures. */ }
    const slide = `--- Slide ${number} ---\n${text}` + (notes ? `\n\nSpeaker Notes:\n${notes}` : '');
    textBytes += Buffer.byteLength(slide) + (slides.length ? 2 : 0);
    if (textBytes > MAX_DOCUMENT_TEXT_BYTES) throw Error('Extracted PPTX text exceeds the 8 MiB adapter limit.');
    slides.push(slide);
  }
  return slides.join('\n\n');
}
