import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { runBundledCodec } from '../src/presets/grok/codec-worker-client.mjs';
import { textPdf, redBmp, pngIco } from './fixtures/grok-documents.mjs';

const signal = () => new AbortController().signal;
test('bundled PDFium extracts selected pages with stable byte cursors and rejects changed text', async () => {
  const bytes = textPdf();
  const first = await runBundledCodec('pdf-text', bytes, { pages: '2', offset: 0, limit: 24 }, signal());
  const rest = await runBundledCodec('pdf-text', bytes, { pages: '2', offset: first.nextOffset, limit: 24000, expectedHash: first.textSha256 }, signal());
  assert.match(first.content + rest.content, /GROK PDF SECOND PAGE/);
  assert.doesNotMatch(first.content + rest.content, /FIRST PAGE/); assert.equal(rest.nextOffset, null);
  await assert.rejects(runBundledCodec('pdf-text', textPdf(['changed', 'changed']), { pages: '2', offset: first.nextOffset, limit: 24000, expectedHash: first.textSha256 }, signal()), /text changed/);
  await assert.rejects(runBundledCodec('pdf-text', textPdf(Array(11).fill('page')), { offset: 0, limit: 24000 }, signal()), /more than 10 pages/);
  await assert.rejects(runBundledCodec('pdf-text', bytes, { pages: '3', offset: 0, limit: 24000 }, signal()), /out of range/);
});
test('bundled ImageMagick decodes real BMP and PNG-backed ICO without external commands', async () => {
  const png = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  for (const bytes of [redBmp(), pngIco(png)]) {
    const output = Buffer.from(await runBundledCodec('image', bytes, {}, signal()));
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 128); assert.equal(info.height, 128);
    assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  }
  const oversized = redBmp(1, 1); oversized.writeInt32LE(100000, 18); oversized.writeInt32LE(100000, 22);
  await assert.rejects(runBundledCodec('image', oversized, {}, signal()));
});
test('in-flight conversion cancellation waits for the owned worker to exit', async () => {
  const abort = new AbortController();
  const pending = runBundledCodec('pdf-text', textPdf(), { offset: 0, limit: 24000 }, abort.signal);
  abort.abort(Error('cancel-owned-converter'));
  await assert.rejects(pending, /cancel-owned-converter/);
  assert.match((await runBundledCodec('pdf-text', textPdf(), { offset: 0, limit: 24000 }, signal())).content, /FIRST PAGE/);
});
