import { Worker } from 'node:worker_threads';
import { readPdfImages } from './pdf-images.mjs';
import { registerConversationImage } from './image-read.mjs';
import { readPdfText } from './pdf-text.mjs';
import { cleanupAll, withConversionCleanup } from './conversion-cleanup.mjs';
import { conversionError } from './conversion-errors.mjs';

export const name = 'omaa-grok-documents';
export const inject = ['tools', 'fs', 'workingDirectory'];
const maxInput = 50 * 1024 * 1024;

async function readPptx(bytes, offset, limit, expectedHash, signal) {
  signal.throwIfAborted();
  const owned = Uint8Array.from(bytes);
  const worker = new Worker(new URL('../../../lib/grok-pptx-worker.mjs', import.meta.url), {
    workerData: { bytes: owned.buffer, offset, limit, expectedHash }, transferList: [owned.buffer],
    resourceLimits: { maxOldGenerationSizeMb: 384 },
  });
  let timer, abort;
  return withConversionCleanup(signal, async () => {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason ?? Error('PPTX read cancelled.'));
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(conversionError('OMAA_GROK_CONVERSION_TIMEOUT', 'PPTX processing exceeded its 60s work budget; worker termination is awaited.')), 60_000);
      timer.unref();
      worker.once('message', result => result.error ? reject(Error(result.error)) : resolve(result.value));
      worker.once('error', reject);
      worker.once('exit', code => reject(Error(`PPTX worker ended without a result (exit ${code}).`)));
      if (signal.aborted) abort();
    });
  }, async () => {
    clearTimeout(timer);
    await cleanupAll([() => signal.removeEventListener('abort', abort), () => worker.terminate()]);
  }, 'PPTX worker');
}

export function apply(ctx) {
  const imageSchema = { type: 'object', properties: { attachmentId: { type: 'string' }, mediaType: { type: 'string' }, bytes: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' }, name: { type: 'string' }, originalDimensions: { type: 'object', properties: { width: { type: 'integer' }, height: { type: 'integer' } }, required: ['width', 'height'] } }, required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'], additionalProperties: false };
  registerConversationImage(ctx, imageSchema);
  ctx.tools.register({ name: 'read_document', description: 'Read PPTX slide text and notes, or PDF pages as images or text. Text has an 8 MiB admission cap and bounded UTF-8 byte pagination; every nonzero offset requires the previous textSha256 as text_sha256. PDF defaults to images at 150 DPI; at most 10 implicit or 20 explicit pages, subject to native limits. PDF text requires existing pdfinfo/pdftotext and full read-only native confinement, with an 8 MiB text limit. Alternate engines can change extraction/rendering. Use native read for ordinary text and notebooks.',
    parameters: { type: 'object', properties: {
      file_path: { type: 'string', minLength: 1 },
      offset: { type: 'integer', minimum: 0, description: 'PPTX/PDF text UTF-8 byte cursor from nextOffset; default 0.' },
      limit: { type: 'integer', minimum: 4, maximum: 24000, description: 'Maximum UTF-8 bytes in content per page; default 24000. JSON metadata/escaping is additional.' },
      text_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Previous result textSha256; required with offset > 0. Keep the same file/format/pages. A changed complete text refuses continuation.' },
      pages: { type: ['string', 'null'], description: 'PDF one-based page ranges, e.g. 1-5,8 or 4-. Omitted/null: all, at most 10 pages. Ignored for PPTX.' },
      format: { type: ['string', 'null'], enum: ['image', 'text', null], description: 'PDF image (default) or text (requires existing confined Poppler commands). Ignored for PPTX.' },
    }, required: ['file_path'], additionalProperties: false },
    output: { schema: { oneOf: [
      { type: 'object', properties: { kind: { type: 'string', const: 'text' }, path: { type: 'string' }, content: { type: 'string' }, totalLines: { type: 'integer' }, totalBytes: { type: 'integer' }, textSha256: { type: 'string' }, offset: { type: 'integer' }, nextOffset: { oneOf: [{ type: 'integer' }, { type: 'null' }] } }, required: ['kind', 'path', 'content', 'totalLines', 'totalBytes', 'textSha256', 'offset', 'nextOffset'], additionalProperties: false },
      { type: 'object', properties: { kind: { type: 'string', const: 'images' }, path: { type: 'string' }, totalPages: { type: 'integer' }, fileBytes: { type: 'integer' }, images: { type: 'array', items: { type: 'object', properties: { page: { type: 'integer' }, image: imageSchema }, required: ['page', 'image'], additionalProperties: false } } }, required: ['kind', 'path', 'totalPages', 'fileBytes', 'images'], additionalProperties: false },
    ] }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }, ...(result.kind === 'images' ? result.images.map(item => ({ type: 'image', attachment: item.image })) : [])] },
    async execute(args, exec) {
      if (typeof args.file_path !== 'string' || !args.file_path.trim() || args.file_path.includes('\0') || !/\.(pptx|pdf)$/i.test(args.file_path)) throw Error('read_document accepts .pptx and .pdf file paths without NUL bytes.');
      const pdf = /\.pdf$/i.test(args.file_path);
      if (pdf && ![undefined, null, 'image', 'text'].includes(args.format)) throw Error('PDF format must be image or text.');
      if (pdf && args.pages !== undefined && args.pages !== null && typeof args.pages !== 'string') throw Error('PDF pages must be a range string.');
      if (pdf && args.format !== 'text' && (args.offset !== undefined || args.limit !== undefined || args.text_sha256 !== undefined)) throw Error('PDF images use pages, not text byte pagination.');
      const offset = args.offset ?? 0, limit = args.limit ?? 24000;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 4 || limit > 24000) throw Error('Invalid document pagination bounds.');
      if (args.text_sha256 !== undefined && (typeof args.text_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.text_sha256))) throw Error('text_sha256 must be the previous result textSha256.');
      if (offset > 0 && args.text_sha256 === undefined) throw Error('A continuation offset requires the previous result textSha256.');
      const cwd = exec.agent ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : undefined;
      const target = await ctx.fs.resolve(args.file_path, { ...(cwd === undefined ? {} : { cwd }), signal: exec.signal });
      const info = await ctx.fs.stat(target, exec.signal);
      if (!info) { ctx.emit('fs/observed', target, { kind: 'absent' }, exec); throw Error('Document not found.'); }
      if (info.type !== 'file') throw Error('Document must be a regular file.');
      const bytes = await ctx.fs.readBytes(target, exec.signal, maxInput);
      exec.signal.throwIfAborted();
      if (!bytes.byteLength || bytes.byteLength > maxInput) throw Error('Document is empty or exceeds the 50 MiB input limit.');
      const result = pdf ? args.format === 'text'
        ? { kind: 'text', path: target.displayPath, ...await readPdfText(ctx, exec, bytes, args.pages, { offset, limit, expectedHash: args.text_sha256 }) }
        : await readPdfImages(ctx, exec, bytes, args.pages, target.displayPath)
        : { kind: 'text', path: target.displayPath, ...await readPptx(bytes, offset, limit, args.text_sha256, exec.signal) };
      exec.signal.throwIfAborted();
      // Match ordinary native read observation, without claiming a later stat
      // is an atomic lease of the bytes already read.
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec);
      return result;
    },
  });
}
