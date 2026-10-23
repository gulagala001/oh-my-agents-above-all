import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';
import { textPdf, textPptx, redBmp, pngIco } from './fixtures/grok-documents.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
test('Grok documents deliver real converted text and images through native tools and survive cold recovery', { timeout: 150000 }, async t => {
  const f = await installedHost(t, { enabledPresets: ['grok'], safeEnvironment: true, sourceLinked: true });
  await f.install();
  const image = () => sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } });
  const png = await image().png().toBuffer();
  const inputs = { 'source.pdf': textPdf(), 'source.pptx': textPptx(), 'red.bmp': redBmp(), 'red.ico': pngIco(png), 'red.png': png };
  for (const format of ['jpeg', 'webp', 'gif', 'tiff']) inputs['red.' + format] = await image()[format]().toBuffer();
  for (const [path, bytes] of Object.entries(inputs)) await writeFile(join(f.workspace, path), bytes);
  await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-grok' });
  let next; const received = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Grok conversion fixture');
    received.push(request);
    if (next) { const task = next; next = undefined; return toolReply(task.name, task.args); }
    return textReply('Converted content received.');
  });
  const call = async (name, args) => {
    await until(async () => !(await f.api(sessionId)).value.running);
    const before = (await f.snapshot(sessionId)).projections.asOfSeq;
    next = { name, args }; await f.prompt(sessionId, 'Please use ' + name + ' for ' + JSON.stringify(args), { timeout: 60000 });
    const snapshot = await f.snapshot(sessionId);
    const result = snapshot.records.findLast(row => row.event?.type === 'tool/result' && row.event.seq > before)?.event.data.message;
    assert(result, 'Expected actual native tool result');
    return { text: textOf(result), error: result.isError, message: result, value: result.isError ? undefined : JSON.parse(result.content.find(part => part.type === 'text').text) };
  };
  const pdf = await call('read_document', { file_path: 'source.pdf', format: 'text', pages: '2', limit: 24 });
  assert(!pdf.error, pdf.text); assert.equal(pdf.value.kind, 'text'); assert(pdf.value.nextOffset > 0);
  const rest = await call('read_document', { file_path: 'source.pdf', format: 'text', pages: '2', offset: pdf.value.nextOffset, text_sha256: pdf.value.textSha256 });
  assert(!rest.error, rest.text); assert.match(pdf.value.content + rest.value.content, /GROK PDF SECOND PAGE/);
  assert.doesNotMatch(pdf.value.content + rest.value.content, /FIRST PAGE/);
  const pptx = await call('read_document', { file_path: 'source.pptx' });
  assert(!pptx.error, pptx.text); assert.match(pptx.value.content, /GROK PPTX 幻灯片/); assert.match(pptx.value.content, /GROK 演讲备注/);
  const refs = [];
  for (const file_path of Object.keys(inputs).filter(name => name.startsWith('red.'))) {
    const result = await call('read_grok_image', { file_path }); assert(!result.error, result.text);
    assert.equal(result.message.content.filter(part => part.type === 'image').length, 1);
    const ref = result.value.image; assert(ref.attachmentId); assert(ref.bytes <= 589824); assert(ref.width * ref.height <= 1048576);
    refs.push({ path: file_path, ...ref });
  }
  const rendered = await call('read_document', { file_path: 'source.pdf', pages: '2,1' });
  assert(!rendered.error, rendered.text); assert.equal(rendered.value.totalPages, 2);
  assert.deepEqual(rendered.value.images.map(row => row.page), [1, 2]);
  assert.equal(rendered.message.content.filter(part => part.type === 'image').length, 2);
  const receivedImages = received.flatMap(request => request.messages.flatMap(message => Array.isArray(message.content)
    ? message.content.filter(part => part.type === 'image_url').map(part => part.image_url.url) : []));
  assert(receivedImages.length >= 9, 'The actual provider must receive attachment data from all image paths');
  const jpg = receivedImages.find(url => url.startsWith('data:image/jpeg;base64,')); assert(jpg);
  assert.equal((await sharp(Buffer.from(jpg.split(',')[1], 'base64')).metadata()).format, 'jpeg');
  await f.stop(); await f.boot();
  const cold = await call('read_document', { file_path: 'source.pdf', format: 'text', pages: '2', offset: pdf.value.nextOffset, text_sha256: pdf.value.textSha256 });
  assert(!cold.error, cold.text); assert.equal(cold.value.content, rest.value.content);
  assert(received.at(-1).messages.some(message => JSON.stringify(message).includes('data:image/')), 'Cold recovered attachments reach the provider again');
  const mismatch = await call('read_document', { file_path: 'source.pdf', format: 'text', pages: '2', offset: pdf.value.nextOffset, text_sha256: '0'.repeat(64) });
  assert(mismatch.error); assert.match(mismatch.text, /text changed/);
  for (const [path, bytes] of Object.entries(inputs)) assert.deepEqual(await readFile(join(f.workspace, path)), bytes);
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_GROK_DOCUMENT_RESULT) await writeFile(process.env.OMAA_GROK_DOCUMENT_RESULT, JSON.stringify({
    host: f.evidence.version, sourceLinked: true, inputBytesUnchanged: true, pdfText: pdf.value.content + rest.value.content,
    pptx: pptx.value.content, imageTypes: refs.map(row => row.path), pdfImagePages: rendered.value.images.map(row => row.page),
    coldPagination: true, coldAttachments: true, staleCursorRejected: true, providerRequests: f.requests.length,
    externalModelCalls: 0, realModelQualityVerified: false, nativeErrors: f.errors,
  }, null, 2) + '\n');
});
