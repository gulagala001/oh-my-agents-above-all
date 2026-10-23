import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { withConversionCleanup } from './conversion-cleanup.mjs';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxPngBytes = 80 * 1024 * 1024;
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
};

// Only for converter-owned outputs, never caller paths. The manifest is not
// a license to follow a link, read a device, or trust an unbounded file size.
export async function readPrivatePng(directory, image, signal) {
  signal.throwIfAborted();
  if (typeof image.path !== 'string' || !isAbsolute(image.path)
    || !Number.isSafeInteger(image.byteLength) || image.byteLength < 8 || image.byteLength > maxPngBytes)
    throw Error('PDF renderer returned an invalid bounded PNG file manifest.');
  const root = await realpath(directory);
  if (!inside(resolve(directory), image.path) || !inside(root, await realpath(image.path)))
    throw Error('PDF renderer returned an output outside its private directory.');
  const before = await lstat(image.path);
  if (!before.isFile() || before.size !== image.byteLength) throw Error('PDF output is not the declared regular PNG file.');
  signal.throwIfAborted();
  const file = await open(image.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  return withConversionCleanup(signal, async () => {
    const actual = await file.stat();
    if (!actual.isFile() || actual.size !== image.byteLength || actual.dev !== before.dev || actual.ino !== before.ino)
      throw Error('PDF output changed before its bounded read.');
    const chunks = []; let size = 0;
    for (;;) {
      signal.throwIfAborted();
      const buffer = Buffer.allocUnsafe(Math.min(65536, image.byteLength + 1 - size));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, size);
      signal.throwIfAborted();
      if (!bytesRead) break;
      size += bytesRead;
      if (size > image.byteLength) throw Error('PDF output grew beyond its declared byte limit.');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    if (size !== image.byteLength) throw Error('PDF output was truncated during its read.');
    const bytes = Buffer.concat(chunks, size);
    if (!bytes.subarray(0, 8).equals(pngSignature)) throw Error('PDF renderer output is not PNG data.');
    return bytes;
  }, () => file.close(), 'PDF output read');
}
