import { MAX_DOCUMENT_TEXT_BYTES, paginateDocumentText } from '../grok/document-text.mjs';
import { pdfError, runPdfCodec } from './pdf-codec.mjs';

// Explicit native text adaptation. Fixed DSH projects files to handles, never
// native PDF inputs; Poppler extraction makes actual content available even to
// text-only routes without claiming original PDF-input or layout equivalence.
export async function readPdfTextPages(ctx, exec, bytes, first, last, pagination, check) {
  const parts = []; let total = 0;
  for (let page = first; page <= last; page++) {
    check();
    const raw = await runPdfCodec(ctx, exec, 'pdftotext', ['-f', String(page), '-l', String(page),
      '-enc', 'UTF-8', '-eol', 'unix', '-nopgbrk', '-', '-'], bytes, MAX_DOCUMENT_TEXT_BYTES, check);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch (error) { throw pdfError('PDF_PROCESS_FAILED', 'PDF text extraction did not produce valid UTF-8.', error); }
    const part = `--- Page ${page} ---\n${text}`;
    total += Buffer.byteLength(part) + (parts.length ? 1 : 0);
    if (total > MAX_DOCUMENT_TEXT_BYTES) throw pdfError('PDF_OUTPUT_LIMIT', 'Extracted PDF text exceeds the native 8 MiB admission limit; select fewer pages.');
    parts.push(part);
  }
  check();
  const result = await paginateDocumentText(parts.join('\n'), pagination.offset, pagination.limit, pagination.expectedHash, exec.signal);
  check(); return result;
}
