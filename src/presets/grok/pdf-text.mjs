import { runNativeCodec } from './native-codec.mjs';
import { parsePdfPages } from './pdf-images.mjs';
import { MAX_DOCUMENT_TEXT_BYTES, paginateDocumentText } from './document-text.mjs';
import { conversionError } from './conversion-errors.mjs';

export async function readPdfText(ctx, exec, bytes, pages, pagination) {
  const deadline = new AbortController(), signal = AbortSignal.any([exec.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(conversionError('OMAA_GROK_CONVERSION_TIMEOUT', 'PDF text extraction exceeded its 60s work budget; cleanup is awaited.')), 60_000); timer.unref();
  const call = { ...exec, signal };
  try {
    const info = (await runNativeCodec(ctx, call, 'pdfinfo', ['-'], bytes, 65536)).toString('utf8');
    // pdfinfo also prints untrusted metadata. Never let a duplicate metadata
    // line masquerade as the authoritative page-count field.
    const matches = [...info.matchAll(/^Pages:[ \t]+(\d+)[ \t]*\r?$/gm)];
    const count = matches.length === 1 ? Number(matches[0][1]) : undefined;
    if (!Number.isSafeInteger(count) || count < 1) throw Error('PDF page count could not be read from the real converter.');
    if ((pages === undefined || pages === null) && count > 10) throw Error('PDF has more than 10 pages; specify at most 20 pages.');
    const selected = pages === undefined || pages === null ? Array.from({ length: count }, (_, i) => i + 1) : parsePdfPages(pages, count);
    const chunks = []; let total = 0;
    for (const page of selected) {
      const raw = await runNativeCodec(ctx, call, 'pdftotext', ['-f', String(page), '-l', String(page), '-enc', 'UTF-8', '-eol', 'unix', '-nopgbrk', '-', '-'], bytes, MAX_DOCUMENT_TEXT_BYTES);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      const part = `--- Page ${page} ---\n${text}`; total += Buffer.byteLength(part) + (chunks.length ? 1 : 0);
      if (total > MAX_DOCUMENT_TEXT_BYTES) throw Error('Extracted PDF text exceeds the 8 MiB adapter limit; select fewer pages.');
      chunks.push(part);
    }
    signal.throwIfAborted();
    return await paginateDocumentText(chunks.join('\n'), pagination.offset, pagination.limit, pagination.expectedHash, signal);
  } catch (error) {
    if (error?.code === 'OMAA_GROK_CONVERSION_CLEANUP_FAILED') throw error;
    signal.throwIfAborted(); throw error;
  }
  finally { clearTimeout(timer); }
}
