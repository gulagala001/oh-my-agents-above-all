import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import { parsePdfPages } from './pdf-pages.mjs';
import { MAX_DOCUMENT_TEXT_BYTES, paginateDocumentText } from './document-text.mjs';

let library, document;
try {
  const bytes = new Uint8Array(workerData.bytes);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw Error('PDF exceeds the 50 MiB input limit.');
  library = await PDFiumLibrary.init({ wasmBinary: await readFile(new URL('./grok-pdfium.wasm', import.meta.url)) });
  document = await library.loadDocument(bytes);
  const count = document.getPageCount();
  if (!Number.isSafeInteger(count) || count < 1) throw Error('PDF has no readable pages.');
  const { pages, offset, limit, expectedHash } = workerData;
  if (pages == null && count > 10) throw Error('PDF has more than 10 pages; specify at most 20 pages.');
  const selected = pages == null ? Array.from({ length: count }, (_, i) => i + 1) : parsePdfPages(pages, count);
  const chunks = []; let total = 0;
  for (const number of selected) {
    const page = document.getPage(number - 1);
    try {
      const text = `--- Page ${number} ---\n${page.getText().replace(/\r\n?/g, '\n')}`;
      total += Buffer.byteLength(text) + (chunks.length ? 1 : 0);
      if (total > MAX_DOCUMENT_TEXT_BYTES) throw Error('Extracted PDF text exceeds the 8 MiB limit; select fewer pages.');
      chunks.push(text);
    } finally { page.close(); }
  }
  const value = await paginateDocumentText(chunks.join('\n'), offset, limit, expectedHash, new AbortController().signal);
  document.destroy(); document = undefined; library.destroy(); library = undefined;
  parentPort.postMessage({ value });
} catch (error) {
  parentPort.postMessage({ error: String(error?.message ?? 'PDF text conversion failed.').slice(0, 1024) });
} finally { document?.destroy(); library?.destroy(); }
