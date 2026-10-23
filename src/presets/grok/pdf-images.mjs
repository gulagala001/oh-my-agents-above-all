import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cleanupAll, withConversionCleanup } from './conversion-cleanup.mjs';
import { readPrivatePng } from './document-files.mjs';
import { conversionError } from './conversion-errors.mjs';

// Port of fixed read_file/pdf.rs parse_page_range; count comes from the real
// renderer, never from a filename, guessed catalogue or model response.
export function parsePdfPages(spec, count) {
  const selected = new Set();
  const number = value => {
    if (!/^\+?\d+$/.test(value)) throw Error(`invalid page number: '${value}'`);
    const n = Number(value); if (!Number.isSafeInteger(n)) throw Error(`invalid page number: '${value}'`);
    return n;
  };
  for (const raw of spec.split(',')) {
    const part = raw.trim(); if (!part) continue;
    const dash = part.indexOf('-');
    const first = number((dash < 0 ? part : part.slice(0, dash)).trim());
    if (first < 1 || first > count) throw Error(`page ${first} out of range (document has ${count} pages)`);
    const tail = dash < 0 ? undefined : part.slice(dash + 1).trim();
    const last = dash < 0 ? first : tail === '' ? count : number(tail);
    if (first > last) throw Error(`invalid page range: ${first}-${last} (start must be ≤ end)`);
    for (let p = first; p <= Math.min(last, count); p++) {
      selected.add(p);
      if (selected.size > 20) throw Error('requested more than 20 pages, maximum is 20 per call');
    }
  }
  if (!selected.size) throw Error('no pages specified');
  return [...selected].sort((a, b) => a - b);
}

export async function readPdfImages(ctx, exec, bytes, pages, displayPath) {
  const attachments = ctx.get('attachments'), llm = ctx.get('llm');
  if (!attachments || !llm) throw Error('PDF images require native attachments and a resolvable image-capable model route.');
  const limits = attachments.imageLimits;
  if (!limits.mediaTypes.includes('image/jpeg') || limits.maxImagesPerMessage < 1)
    throw Error('This deployment does not accept PDF JPEG image output.');
  const routed = exec.agent?.session.requestHeader()?.config;
  const provider = routed?.provider ?? exec.agent?.options.provider, model = routed?.model ?? exec.agent?.options.model;
  if (!provider || !model) throw Error('The calling model route could not be resolved for PDF image output.');
  const active = await llm.resolveModelInfo(provider, model, exec.signal);
  if (!active.inputModalities?.includes('image')) throw Error('The current model does not declare image input.');
  exec.signal.throwIfAborted();
  const deadline = new AbortController(), signal = AbortSignal.any([exec.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(conversionError('OMAA_GROK_CONVERSION_TIMEOUT', 'PDF processing exceeded its 60s work budget; converter disposal is awaited.')), 60_000); timer.unref();
  let directory, converter;
  return withConversionCleanup(signal, async () => {
    // Existing installed/locked public packages; no process command, installer,
    // model call or module-private renderer entry is used by this adapter.
    const [{ createConverter }, sharpModule] = await Promise.all([import('@deepseek-ai/libreoffice-kit'), import('sharp')]);
    signal.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), 'omaa-grok-pdf-'));
    const input = join(directory, 'input.pdf');
    await writeFile(input, bytes, { flag: 'wx', mode: 0o600, signal });
    converter = await createConverter({ fontMetadataCacheDirectory: false, timeoutMs: 60_000,
      maxInputBytes: 50 * 1024 * 1024, maxOutputBytes: 200 * 1024 * 1024 });
    // Factory creation has no cancellation argument. Await it, then dispose on
    // cancellation; never abandon a late-created converter or claim a hard
    // caller deadline over that initialization boundary.
    signal.throwIfAborted();
    const maxPixels = Math.min(16777216, limits.maxImagePixels), maxDimension = Math.min(8192, limits.maxImageDimension);
    const render = (outputDir, selection, maxPages) => converter.renderImages({ inputPath: input, outputDir,
      pages: selection, dpi: 150, maxPages, maxPixels, maxDimension }, signal);
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const verifyManifest = manifest => {
      if (!Number.isSafeInteger(manifest.pageCount) || manifest.pageCount < 1 || manifest.schemaVersion !== 1 || manifest.source !== 'saved'
        || manifest.dpi !== 150 || manifest.rasterEngine !== 'pdfium' || manifest.sourceSha256 !== sourceHash || !Array.isArray(manifest.images))
        throw Error('PDF renderer did not return a verified saved-source page manifest.');
    };
    let result, probedCount;
    if (pages !== undefined && pages !== null) {
      const probe = await render(join(directory, 'probe'), [1], 1);
      signal.throwIfAborted(); verifyManifest(probe);
      if (probe.images.length !== 1 || probe.images[0].page !== 1) throw Error('PDF renderer did not return the requested page-count probe.');
      probedCount = probe.pageCount;
      const selected = parsePdfPages(pages, probe.pageCount);
      if (selected.length > limits.maxImagesPerMessage) throw Error('Requested PDF pages exceed the native message image-count limit.');
      result = selected.length === 1 && selected[0] === 1 ? probe : await render(join(directory, 'pages'), selected, 20);
    } else result = await render(join(directory, 'pages'), 'all', Math.min(10, limits.maxImagesPerMessage));
    signal.throwIfAborted();
    verifyManifest(result);
    if (probedCount !== undefined && result.pageCount !== probedCount) throw Error('PDF page count changed after its saved-source probe.');
    if ((pages === undefined || pages === null) && result.pageCount > Math.min(10, limits.maxImagesPerMessage))
      throw Error('PDF exceeds the implicit page/native image-count limit; specify pages.');
    const expected = pages === undefined || pages === null
      ? Array.from({ length: result.pageCount }, (_, i) => i + 1) : parsePdfPages(pages, result.pageCount);
    if (expected.length > 20 || expected.length !== result.images.length
      || result.images.some((image, i) => image.page !== expected[i])) throw Error('PDF renderer page selection did not match the requested pages.');
    const encoded = []; let total = 0;
    for (const image of result.images) {
      const png = await readPrivatePng(directory, image, signal);
      const jpeg = await sharpModule.default(png, { limitInputPixels: maxPixels }).jpeg({ quality: 85 }).toBuffer();
      signal.throwIfAborted(); total += jpeg.length;
      if (jpeg.length > limits.maxImageBytes || total > limits.maxMessageImageBytes)
        throw Error('Rendered PDF pages exceed native image byte limits; request fewer pages.');
      encoded.push({ page: image.page, data: jpeg });
    }
    const images = []; let storedBytes = 0;
    for (const image of encoded) {
      signal.throwIfAborted();
      const ref = await attachments.saveImage({ data: image.data, mediaType: 'image/jpeg', name: `page-${image.page}.jpg` });
      signal.throwIfAborted();
      storedBytes += ref.bytes;
      if (ref.mediaType !== 'image/jpeg' || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1
        || ref.bytes > limits.maxImageBytes || storedBytes > limits.maxMessageImageBytes
        || !Number.isSafeInteger(ref.width) || !Number.isSafeInteger(ref.height) || ref.width < 1 || ref.height < 1
        || ref.width > maxDimension || ref.height > maxDimension || ref.width * ref.height > maxPixels)
        throw Error('Native normalized PDF attachments exceeded the accepted JPEG/message limits.');
      images.push({ page: image.page, image: { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes,
        width: ref.width, height: ref.height, ...(ref.name === undefined ? {} : { name: ref.name }),
        ...(ref.originalDimensions === undefined ? {} : { originalDimensions: { ...ref.originalDimensions } }) } });
    }
    return { kind: 'images', path: displayPath, totalPages: result.pageCount, fileBytes: bytes.byteLength, images };
  }, async () => {
    clearTimeout(timer);
    await cleanupAll([() => converter?.dispose(), async () => { if (directory) await rm(directory, { recursive: true, force: true }); }]);
  }, 'PDF image conversion');
}
