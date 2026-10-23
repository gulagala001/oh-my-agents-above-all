import { pdfError, runPdfCodec } from './pdf-codec.mjs';
import { readPdfTextPages } from './pdf-text.mjs';

// Fixed 3.15.1 read-pdf contract: implicit <=20 MiB/10 pages, explicit
// <=100 MiB/20 contiguous pages. Native adaptation renders both branches as
// images by default: fixed DSH dispatch projects every file to handle text,
// never native PDF input. Explicit text extraction is a native extension.
const MiB = 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Fixed image-budget.ts: ceil(base64EncodedLength * .125) <= 25000.
// This is the original byte-based estimate, not native provider token usage.
const maxImageBase64 = Math.min(5 * MiB, Math.floor(25_000 / 0.125));
const fitsImageBudget = bytes => 4 * Math.ceil(bytes / 3) <= maxImageBase64;

function pageRange(value) {
  if (value === undefined) return;
  if (typeof value !== 'string') throw pdfError('PDF_INVALID_PAGES', 'pages must be a contiguous one-based range, such as "3" or "1-5".');
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!match) throw pdfError('PDF_INVALID_PAGES', 'Use a finite contiguous page range, such as "3" or "1-5"; comma lists and open ranges are not accepted.');
  const first = Number(match[1]), last = Number(match[2] ?? match[1]);
  if (!positive(first) || !positive(last) || last < first) throw pdfError('PDF_INVALID_PAGES', 'PDF pages are positive safe integers in ascending order.');
  if (last - first + 1 > 20) throw pdfError('PDF_PAGE_RANGE_TOO_LARGE', 'At most 20 pages can be requested at once.');
  return { first, last };
}

function imageBounds(attachments) {
  const limits = attachments?.imageLimits;
  if (!limits || !['maxImageBytes', 'maxMessageImageBytes', 'maxImagesPerMessage', 'maxImagePixels', 'maxImageDimension'].every(key => positive(limits[key]))
    || !Array.isArray(limits.mediaTypes) || !limits.mediaTypes.includes('image/jpeg'))
    throw pdfError('PDF_CONFIGURATION_ERROR', 'Native JPEG attachment admission and finite image/message limits are required.');
  // Conservative square bound also caps unusually shaped pages before decode.
  const side = Math.min(2000, limits.maxImageDimension, Math.floor(Math.sqrt(limits.maxImagePixels)));
  if (side < 1) throw pdfError('PDF_CONFIGURATION_ERROR', 'Native PDF image dimension limits are invalid.');
  return { limits, side, bytes: Math.min(3.75 * MiB, Math.floor(maxImageBase64 / 4) * 3, limits.maxImageBytes), pixels: Math.min(4_000_000, limits.maxImagePixels) };
}

async function encodePage(sharp, input, bounds, check) {
  if (!input.subarray(0, 8).equals(png)) throw pdfError('PDF_PROCESS_FAILED', 'PDF renderer did not produce PNG page data.');
  check();
  const metadata = await sharp(input, { limitInputPixels: bounds.pixels, animated: false }).metadata();
  check();
  if (metadata.format !== 'png' || !positive(metadata.width) || !positive(metadata.height)
    || metadata.width > bounds.side || metadata.height > bounds.side || metadata.width * metadata.height > bounds.pixels)
    throw pdfError('PDF_OUTPUT_LIMIT', 'Rendered PDF page exceeds the admitted image dimensions.');
  // This is a native Sharp adaptation, not a claim of identical upstream
  // ImageProcessorPort pixels, token estimates, or compression strategy.
  const sides = [...new Set([bounds.side, ...[0.75, 0.5, 0.25].map(scale => Math.max(1, Math.round(bounds.side * scale))),
    ...[1000, 800, 600, 400, 300, 200].map(side => Math.min(side, bounds.side))])];
  for (let index = 0; index < sides.length; index++) {
    const side = sides[index];
    const qualities = index < 4 ? [80, 60, 40, 20] : [20];
    for (const quality of qualities) {
      check();
      const data = await sharp(input, { limitInputPixels: bounds.pixels, animated: false })
        .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' })
        .jpeg({ quality }).toBuffer();
      check();
      if (data.length <= bounds.bytes && fitsImageBudget(data.length)) return data;
    }
  }
  throw pdfError('PDF_OUTPUT_LIMIT', 'A PDF page could not fit native/upstream image byte bounds; no partial page is returned.');
}

export function installReadPdfTool(ctx) {
  const lifetime = new AbortController(), calls = new Set();
  let closed = false;
  ctx.on('agent/disposed', ({ agent }) => {
    for (const call of calls) if (call.agent?.id === agent.id) call.control.abort(pdfError('PDF_CANCELLED', 'PDF owner was disposed.'));
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (!['sandbox/mode', 'plan/mode'].includes(event.type)) return;
    for (const call of calls) if (call.agent?.id === session.id) call.control.abort(pdfError('PDF_CANCELLED', 'PDF owner policy or working mode changed.'));
  }, { global: true });
  ctx.on('omaa/preferences-updated', session => {
    for (const call of calls) if (call.agent?.id === session.id) { try { call.check(); } catch {} }
  }, { global: true });
  ctx.effect(() => async () => {
    closed = true; lifetime.abort(pdfError('PDF_CANCELLED', 'ZCode PDF tool scope disposed.'));
    const outcomes = await Promise.allSettled([...calls].map(call => call.done));
    const cleanupFailures = outcomes.filter(value => value.status === 'rejected' && value.reason?.code === 'OMAA_ZCODE_PDF_CLEANUP_FAILED');
    if (cleanupFailures.length) throw new AggregateError(cleanupFailures.map(value => value.reason), 'PDF tool disposal did not prove process cleanup.');
  }, 'ZCode PDF conversion lifetime');

  ctx.tools.register({ name: 'read_pdf', timeoutMs: 150_000,
    description: 'Read a PDF as actual page images (format="images", default) or extracted text (format="text", explicit native extension) using existing Poppler commands under full native read-only confinement. Takes file_path and optional contiguous one-based pages ("3", "1-5"); at most 20 explicit pages/100 MiB, or 10 implicit pages/20 MiB. Images require image input on the effective route and obey the original 25000-token byte estimate (.125 times base64 length: at most 150000 raw JPEG bytes); this is not actual provider token usage. Native image limits may be lower. Text requires existing pdftotext, admits at most 8 MiB of extracted text and returns a numbered UTF-8 byte window (limit 4–24000, default 24000); every nonzero offset requires the previous textSha256 as text_sha256. Keep format/pages fixed; a changed complete formatted text refuses continuation. JSON text responses are bounded at 256000 bytes. DSH projects file attachments to handles, never native PDF input. Extraction, pixels and attachment normalization may differ from original ZCode. No installation, shell, escalation or unconfined fallback. Total conversion work budget is 120s; cleanup is awaited. Stored images may survive a later failure: no attachment rollback or proof of model consumption.',
    parameters: { type: 'object', properties: { file_path: { type: 'string', minLength: 1, maxLength: 8192 },
      pages: { type: 'string', description: 'Finite contiguous one-based range, maximum 20 pages.' },
      format: { type: 'string', enum: ['images', 'text'], description: 'Default images. Text explicitly extracts real PDF text for text-only routes; it is not native PDF file input.' },
      offset: { type: 'integer', minimum: 0, description: 'Text-only UTF-8 byte cursor from nextOffset; default 0.' },
      limit: { type: 'integer', minimum: 4, maximum: 24000, description: 'Text-only content byte window; default 24000. JSON escaping/metadata is additional.' },
      text_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Previous textSha256; required for every nonzero text offset.' },
    }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, result) => [
      { type: 'text', text: JSON.stringify(result) }, ...(result.type === 'parts' ? result.pages.map(page => ({ type: 'image', attachment: page.image })) : []),
    ] },
    execute(args, exec) {
      const control = new AbortController(), deadline = new AbortController(), agent = exec.agent;
      const timer = setTimeout(() => deadline.abort(pdfError('PDF_TIMEOUT', 'PDF conversion exceeded its 120s work budget; native process cleanup is awaited.')), 120_000);
      timer.unref();
      const signal = AbortSignal.any([exec.signal, lifetime.signal, control.signal, deadline.signal]);
      const call = { agent, control, done: undefined, check: () => {} };
      // Register before the first asynchronous step so scope disposal includes
      // a currently admitted operation, including non-cancellable saveImage.
      calls.add(call);
      call.done = Promise.resolve().then(async () => {
        if (!object(args) || Object.keys(args).some(key => !['file_path', 'pages', 'format', 'offset', 'limit', 'text_sha256'].includes(key))
          || typeof args.file_path !== 'string' || !args.file_path.trim() || args.file_path.length > 8192 || args.file_path.includes('\0') || !/\.pdf$/i.test(args.file_path))
          throw pdfError('PDF_INVALID', 'read_pdf accepts a nonempty .pdf file_path without NUL bytes and its declared pages/format/text-pagination parameters only.');
        const range = pageRange(args.pages);
        const format = args.format === undefined ? 'images' : args.format;
        if (!['images', 'text'].includes(format)) throw pdfError('PDF_INVALID', 'format must be images or text.');
        if (format === 'images' && ['offset', 'limit', 'text_sha256'].some(key => args[key] !== undefined))
          throw pdfError('PDF_INVALID', 'Image reads use pages, not text byte pagination.');
        const pagination = { offset: args.offset === undefined ? 0 : args.offset, limit: args.limit === undefined ? 24000 : args.limit, expectedHash: args.text_sha256 };
        if (!Number.isSafeInteger(pagination.offset) || pagination.offset < 0 || !Number.isSafeInteger(pagination.limit)
          || pagination.limit < 4 || pagination.limit > 24000 || pagination.expectedHash !== undefined
            && (typeof pagination.expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(pagination.expectedHash))
          || pagination.offset > 0 && pagination.expectedHash === undefined)
          throw pdfError('PDF_INVALID', 'Invalid text pagination: use offset>=0, limit 4–24000 and the previous text_sha256 for every nonzero offset.');
        const owner = agent?.session, product = owner && ctx.omaa?.product(owner);
        const llm = ctx.get('llm'), attachments = ctx.get('attachments'), fs = ctx.get('fs'), policies = ctx.get('sandboxPolicy');
        const runtime = ctx.get('subprocess'), sandbox = ctx.get('sandbox');
        if (!agent || !owner || product?.id !== 'zcode' || !llm || format === 'images' && !attachments || !fs || !policies || !runtime || !sandbox || !ctx.workingDirectory)
          throw pdfError('PDF_CONFIGURATION_ERROR', 'PDF reading requires a live native owner, filesystem and standing confinement services; image output additionally requires native attachments.');
        const policy = JSON.stringify(policies.resolve({ session: agent.session }));
        const effectiveRoute = () => {
          const header = owner.requestHeader()?.config;
          return { provider: header?.provider ?? agent.options.provider, model: header?.model ?? agent.options.model };
        };
        const route = effectiveRoute();
        const mode = ctx.omaa.modeFor(owner, agent);
        call.check = () => {
          try {
            signal.throwIfAborted();
            const current = ctx.agents.get(agent.id), now = effectiveRoute();
            if (closed || current !== agent || agent.session !== owner || ctx.get('sessions')?.get(agent.id) !== owner
              || ctx.omaa.product(owner)?.id !== 'zcode' || ctx.omaa.product(owner)?.preset !== product.preset
              || JSON.stringify(policies.resolve({ session: owner })) !== policy || ctx.omaa.modeFor(owner, agent) !== mode
              || now.provider !== route.provider || now.model !== route.model
              || typeof route.provider !== 'string' || !route.provider || typeof route.model !== 'string' || !route.model
            )
              throw pdfError('PDF_OWNER_CHANGED', 'PDF owner, current model route, mode or standing policy changed; no result is delivered.');
          } catch (error) { control.abort(error); throw error; }
        };
        const check = call.check, work = { ...exec, signal };
        check();
        const bounds = format === 'images' ? imageBounds(attachments) : undefined;
        if (format === 'images') {
          const model = await llm.resolveModelInfo(route.provider, route.model, signal);
          check();
          if (!model || model.provider !== route.provider || model.id !== route.model || !model.inputModalities?.includes('image'))
            throw pdfError('PDF_PAGES_IMAGES_UNSUPPORTED', 'The actual current native model route does not advertise image input; explicitly select format="text" for extraction.');
        }
        const cwd = await ctx.workingDirectory.ensure(agent, signal); check();
        const target = await fs.resolve(args.file_path, { cwd, signal }); check();
        const stat = await fs.stat(target, signal); check();
        if (!stat) { ctx.emit('fs/observed', target, { kind: 'absent' }, exec); throw pdfError('PDF_IO_ERROR', 'PDF file not found.'); }
        if (stat.type !== 'file') throw pdfError('PDF_IO_ERROR', 'PDF source must be a regular file.');
        const maxInput = (range ? 100 : 20) * MiB;
        const bytes = Buffer.from(await fs.readBytes(target, signal, maxInput)); check();
        if (!bytes.length || bytes.length > maxInput) throw pdfError('PDF_TOO_LARGE', 'PDF source is empty or exceeds the selected input byte limit.');
        if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw pdfError('PDF_INVALID', 'Source does not have the PDF magic header.');
        const info = await runPdfCodec(ctx, work, 'pdfinfo', ['-'], bytes, 64 * 1024, check);
        const counts = [...info.toString('utf8').matchAll(/^Pages:[ \t]+(\d+)[ \t]*\r?$/gm)];
        if (counts.length !== 1 || !positive(Number(counts[0][1]))) throw pdfError('PDF_PROCESS_FAILED', 'PDF page count was not uniquely established by the real converter.');
        const count = Number(counts[0][1]);
        if (!range && count > 10) throw pdfError('PDF_TOO_MANY_PAGES', 'PDF has more than 10 pages; specify a contiguous pages range of at most 20.');
        const first = range?.first ?? 1, last = range?.last ?? count;
        if (last > count) throw pdfError('PDF_PAGE_OUT_OF_RANGE', 'Requested PDF pages exceed the actual document page count.');
        if (format === 'text') {
          const text = await readPdfTextPages(ctx, work, bytes, first, last, pagination, check);
          const result = { type: 'text', filePath: target.displayPath, originalSize: bytes.length, totalPages: count,
            firstPage: first, lastPage: last, delivery: 'native-extracted-text', extractor: 'confined-poppler-pdftotext',
            paginationScope: 'complete-numbered-extracted-text', ...text };
          if (Buffer.byteLength(JSON.stringify(result)) > 256000) throw pdfError('PDF_OUTPUT_LIMIT', 'PDF text response exceeds its native 256000-byte JSON budget; request a smaller limit.');
          check(); ctx.emit('fs/observed', target, { kind: 'present', version: stat.version }, exec);
          check(); return result;
        }
        if (last - first + 1 > bounds.limits.maxImagesPerMessage) throw pdfError('PDF_OUTPUT_LIMIT', 'Requested PDF pages exceed the native message image-count limit; request fewer pages.');
        const sharp = (await import('sharp')).default; check();
        const prepared = []; let encodedBytes = 0;
        for (let page = first; page <= last; page++) {
          // Poppler 25.03.0 (Debian source utils/pdftoppm.cc): absent output
          // root selects binary stdout; '-' selects fd://0. One page per call
          // avoids concatenated image streams, without converter-owned files.
          const rendered = await runPdfCodec(ctx, work, 'pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-scale-to', String(bounds.side), '-png', '-'], bytes, 16 * MiB, check);
          const data = await encodePage(sharp, rendered, bounds, check);
          encodedBytes += data.length;
          if (encodedBytes > bounds.limits.maxMessageImageBytes) throw pdfError('PDF_OUTPUT_LIMIT', 'PDF images exceed the native message byte limit; request fewer pages.');
          prepared.push({ page, data });
        }
        const result = { type: 'parts', filePath: target.displayPath, numParts: prepared.length, originalSize: bytes.length,
          totalPages: count, delivery: 'native-page-image-attachments', renderer: 'confined-poppler-sharp', pages: [] };
        let storedBytes = 0;
        for (const page of prepared) {
          check();
          const ref = await attachments.saveImage({ data: page.data, mediaType: 'image/jpeg', name: `page-${page.page}.jpg` });
          check(); storedBytes += ref.bytes;
          if (typeof ref.attachmentId !== 'string' || !ref.attachmentId || ref.mediaType !== 'image/jpeg' || !positive(ref.bytes)
            || ref.bytes > bounds.bytes || !fitsImageBudget(ref.bytes) || storedBytes > bounds.limits.maxMessageImageBytes
            || !positive(ref.width) || !positive(ref.height) || ref.width > bounds.side || ref.height > bounds.side || ref.width * ref.height > bounds.pixels)
            throw pdfError('PDF_OUTPUT_LIMIT', 'Native normalized PDF attachment exceeds the admitted JPEG/image/message limits. Stored attachments are not rolled back.');
          result.pages.push({ pageNumber: page.page, image: { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height } });
          if (Buffer.byteLength(JSON.stringify(result)) > 24000) throw pdfError('PDF_OUTPUT_LIMIT', 'PDF image metadata exceeds the native 24000-byte response budget. Stored attachments are not rolled back.');
        }
        check();
        // Native read observation is not an atomic lease/version of bytes.
        ctx.emit('fs/observed', target, { kind: 'present', version: stat.version }, exec);
        check(); return result;
      }).finally(() => { clearTimeout(timer); calls.delete(call); });
      return call.done;
    },
  });
}
