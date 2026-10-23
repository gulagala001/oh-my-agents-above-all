import { runBundledCodec } from './codec-worker-client.mjs';

export async function readPdfText(_ctx, exec, bytes, pages, pagination) {
  return runBundledCodec('pdf-text', bytes, { pages, ...pagination }, exec.signal);
}
