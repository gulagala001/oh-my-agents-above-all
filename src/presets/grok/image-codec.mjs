// Behavioral port of fixed Grok read_file/image.rs, util/image_compress.rs
// and xai-grok-image/src/lib.rs (Apache-2.0). Sharp replaces image-rs;
// codec/filter bytes and decoder admission are not claimed equivalent.
const rawCap = 768 * 1024 * 3 / 4;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}
function sniff(bytes) {
  if (bytes.subarray(0, 8).equals(pngSignature)) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'gif';
  if (['49492a00', '4d4d002a'].includes(bytes.subarray(0, 4).toString('hex'))) return 'tiff';
  throw Error('Grok image conversion could not identify supported image bytes.');
}
function structurallyComplete(format, bytes) {
  if (format === 'webp') return bytes.length >= 12 && bytes.readUInt32LE(4) + 8 <= bytes.length;
  if (format === 'png') {
    for (let at = 8; at + 8 <= bytes.length;) {
      const end = at + 8 + bytes.readUInt32BE(at);
      if (end + 4 > bytes.length || crc32(bytes.subarray(at + 4, end)) !== bytes.readUInt32BE(end)) return false;
      if (bytes.toString('ascii', at + 4, at + 8) === 'IEND') return true;
      at = end + 4;
    }
    return false;
  }
  if (format !== 'jpeg') return false;
  let at = 2;
  const segment = () => {
    if (at + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(at);
    if (length < 2 || at + length > bytes.length) return false;
    at += length; return true;
  };
  while (at < bytes.length) {
    while (at < bytes.length && bytes[at] !== 255) at++;
    while (bytes[at] === 255) at++;
    if (at >= bytes.length) return false;
    const marker = bytes[at++];
    if (marker === 217) return true;
    if (marker === 0 || marker === 1 || marker >= 208 && marker <= 215) continue;
    if (!segment()) return false;
    if (marker === 218) {
      for (;;) {
        while (at < bytes.length && bytes[at] !== 255) at++;
        const next = bytes[at + 1];
        if (next === undefined) return false;
        if (next === 0 || next >= 208 && next <= 215) at += 2;
        else if (next === 255) at++;
        else break;
      }
    }
  }
  return false;
}

export async function encodeConversationImage(input, sharp, limits, signal, transcoded = false) {
  let bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let format = sniff(bytes);
  const transcode = format === 'gif' || format === 'tiff' || transcoded;
  const decodePixels = transcode ? 16_000_000 : 178_956_970;
  const options = { page: 0, pages: 1, autoOrient: false, ignoreIcc: true, failOn: 'warning', limitInputPixels: decodePixels };
  const metadata = await sharp(bytes, options).metadata(); signal.throwIfAborted();
  let width = metadata.width, height = metadata.height;
  if (metadata.format !== format || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width * height > decodePixels) throw Error('Image dimensions/format exceed the bounded decoder contract.');
  if (transcode) {
    const shortest = Math.min(width, height);
    if (shortest < 128) {
      const scale = Math.fround(128 / Math.fround(shortest));
      const w = Math.max(128, Math.round(Math.fround(Math.fround(width) * scale)));
      const h = Math.max(128, Math.round(Math.fround(Math.fround(height) * scale)));
      if (w * h <= 16_000_000) { width = w; height = h; }
    }
    bytes = await sharp(bytes, options).resize({ width, height, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    signal.throwIfAborted(); format = 'png';
  }
  const maxBytes = Math.min(rawCap, limits.maxImageBytes, limits.maxMessageImageBytes);
  const maxPixels = Math.min(1_048_576, limits.maxImagePixels), maxDimension = Math.min(2000, limits.maxImageDimension);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxPixels) || maxPixels < 1
    || !Number.isSafeInteger(maxDimension) || maxDimension < 1) throw Error('Invalid native image limits.');
  if (bytes.length <= maxBytes && width <= maxDimension && height <= maxDimension && width * height <= maxPixels
    && limits.mediaTypes.includes('image/' + format) && structurallyComplete(format, bytes))
    return { data: bytes, mediaType: 'image/' + format };
  const originalLong = Math.max(width, height), originalShort = Math.min(width, height);
  let side = Math.min(maxDimension, originalLong);
  const dimensions = target => [Math.max(1, Math.round(width * (target / originalLong))), Math.max(1, Math.round(height * (target / originalLong)))];
  if (width * height > maxPixels) {
    let areaSide = Math.max(1, Math.floor(originalLong * Math.sqrt(maxPixels / (originalLong * originalShort))));
    while (areaSide > 1 && dimensions(areaSide).reduce((a, b) => a * b) > maxPixels) areaSide--;
    side = Math.min(side, areaSide);
  }
  for (;;) {
    signal.throwIfAborted();
    const [w, h] = dimensions(side);
    const pipeline = () => {
      const image = sharp(bytes, { ...options, limitInputPixels: decodePixels });
      return side < originalLong ? image.resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' }) : image;
    };
    const candidate = async (mediaType, quality) => {
      if (!limits.mediaTypes.includes(mediaType)) return undefined;
      try {
        const image = pipeline();
        const data = await (quality === undefined ? image.png() : image.jpeg({ quality })).toBuffer();
        signal.throwIfAborted(); return data.length <= maxBytes ? { data, mediaType } : undefined;
      } catch (error) { signal.throwIfAborted(); return undefined; }
    };
    const png = await candidate('image/png'); let jpeg;
    for (const quality of [85, 70, 50, 40]) { jpeg = await candidate('image/jpeg', quality); if (jpeg) break; }
    const best = png && jpeg ? png.data.length <= jpeg.data.length ? png : jpeg : png ?? jpeg;
    if (best) return best;
    if (side <= 128) throw Error('Image cannot fit the Grok conversation/native image payload limits.');
    side = Math.floor(side * 3 / 4);
  }
}
