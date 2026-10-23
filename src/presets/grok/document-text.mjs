import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

export const MAX_DOCUMENT_TEXT_BYTES = 8 * 1024 * 1024;

// Number/hash the complete admitted text, but retain only this page plus a
// UTF-8 lookahead. No complete formatted copy or persistent refs are stored.
export async function paginateDocumentText(text, offset, limit, expectedHash, signal) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 4 || limit > 24000)
    throw Error('Invalid document pagination bounds.');
  if (expectedHash !== undefined && (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)))
    throw Error('text_sha256 must be the previous result textSha256.');
  if (offset > 0 && expectedHash === undefined) throw Error('A continuation offset requires the previous result textSha256.');
  signal.throwIfAborted();
  if (Buffer.byteLength(text) > MAX_DOCUMENT_TEXT_BYTES) throw Error('Extracted document text exceeds the 8 MiB adapter limit.');
  const hash = createHash('sha256'), selected = [];
  let start = 0, totalBytes = 0, totalLines = 0;
  for (;;) {
    const next = text.indexOf('\n', start), line = text.slice(start, next < 0 ? undefined : next);
    const piece = Buffer.from(`${totalLines ? '\n' : ''}${++totalLines}→${line}`);
    hash.update(piece);
    if (offset >= totalBytes && offset < totalBytes + piece.length && (piece[offset - totalBytes] & 0xc0) === 0x80)
      throw Error('Invalid UTF-8 document byte cursor.');
    const first = Math.max(0, offset - totalBytes), last = Math.min(piece.length, offset + limit + 4 - totalBytes);
    if (last > first) selected.push(Buffer.from(piece.subarray(first, last)));
    totalBytes += piece.length;
    if (next < 0) break;
    start = next + 1;
    if (totalLines % 4096 === 0) { await setImmediate(undefined, { signal }); signal.throwIfAborted(); }
  }
  signal.throwIfAborted();
  const textSha256 = hash.digest('hex');
  if (expectedHash !== undefined && expectedHash !== textSha256) throw Error('Document text changed; restart at offset 0.');
  if (offset > totalBytes) throw Error('Document byte cursor exceeds the complete formatted text.');
  const page = Buffer.concat(selected);
  let length = Math.min(limit, page.length);
  while (length < page.length && (page[length] & 0xc0) === 0x80) length--;
  if (!length && offset < totalBytes) throw Error('limit cannot hold the next complete UTF-8 character.');
  const end = offset + length;
  return { content: page.subarray(0, length).toString('utf8'), totalLines, totalBytes, textSha256, offset, nextOffset: end < totalBytes ? end : null };
}
