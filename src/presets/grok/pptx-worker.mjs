import { parentPort, workerData } from 'node:worker_threads';
import { extractPptxText } from './pptx-codec.mjs';
import { paginateDocumentText } from './document-text.mjs';

try {
  const raw = extractPptxText(new Uint8Array(workerData.bytes));
  const { offset, limit, expectedHash } = workerData;
  parentPort.postMessage({ value: await paginateDocumentText(raw, offset, limit, expectedHash, new AbortController().signal) });
} catch (error) { parentPort.postMessage({ error: error.message }); }
