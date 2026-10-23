// Small synthetic inputs with independent expected text/pixels, not real files.
export function textPdf(pages = ['GROK PDF FIRST PAGE', 'GROK PDF SECOND PAGE']) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const text of pages) {
    const page = objects.length + 1, stream = `BT /F1 14 Tf 32 180 Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`;
    kids.push(`${page} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 240] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let output = '%PDF-1.4\n', offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output);
}
export function redBmp(width = 128, height = 128) {
  const stride = Math.ceil(width * 3 / 4) * 4, output = Buffer.alloc(54 + stride * height);
  output.write('BM'); output.writeUInt32LE(output.length, 2); output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14); output.writeInt32LE(width, 18); output.writeInt32LE(height, 22);
  output.writeUInt16LE(1, 26); output.writeUInt16LE(24, 28); output.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) output[54 + y * stride + x * 3 + 2] = 255;
  return output;
}
export function pngIco(png) {
  const out = Buffer.alloc(22 + png.length); out.writeUInt16LE(1, 2); out.writeUInt16LE(1, 4);
  out[6] = 128; out[7] = 128; out.writeUInt16LE(1, 10); out.writeUInt16LE(32, 12);
  out.writeUInt32LE(png.length, 14); out.writeUInt32LE(22, 18); png.copy(out, 22); return out;
}
export function textPptx() {
  const files = {
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>GROK PPTX 幻灯片</a:t></a:r></a:p></p:cSld></p:sld>',
    'ppt/notesSlides/notesSlide1.xml': '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>GROK 演讲备注</a:t></a:r></a:p></p:cSld></p:notes>',
  };
  const local = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = Buffer.from(name), bytes = Buffer.from(text); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(bytes.length, 18); h.writeUInt32LE(bytes.length, 22); h.writeUInt16LE(path.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(bytes.length, 20); c.writeUInt32LE(bytes.length, 24); c.writeUInt16LE(path.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, path, bytes); central.push(c, path); offset += h.length + path.length + bytes.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
