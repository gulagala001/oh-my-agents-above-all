import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uleb = value => {
  const bytes = [];
  do { const digit = value % 128; value = Math.floor(value / 128); bytes.push(digit | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
};
// V8's worker heap limit excludes WASM linear memory. Lower only the pinned
// modules' declared maximum; preserve initial pages and all instructions.
// Reject a changed memory representation instead of guessing a new encoding.
export function boundWasmMemory(bytes, pages = 8192) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) throw Error('Invalid WASM header.');
  let at = 8, memory = false;
  const chunks = [bytes.subarray(0, 8)];
  const read = () => {
    let value = 0, shift = 0;
    for (;;) {
      if (at >= bytes.length || shift > 28) throw Error('Invalid WASM integer.');
      const byte = bytes[at++]; value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
  };
  while (at < bytes.length) {
    const begin = at, id = bytes[at++], size = read(), end = at + size;
    if (end > bytes.length) throw Error('Truncated WASM section.');
    if (id === 5) {
      if (memory || read() !== 1 || read() !== 1) throw Error('Expected one unshared 32-bit WASM memory with a maximum.');
      const initial = read(), maximum = read();
      if (at !== end || initial > pages || maximum < pages) throw Error('Pinned WASM memory limits changed.');
      const section = Buffer.concat([uleb(1), uleb(1), uleb(initial), uleb(pages)]);
      chunks.push(Buffer.from([5]), uleb(section.length), section); memory = true;
    } else chunks.push(bytes.subarray(begin, end));
    at = end;
  }
  const result = Buffer.concat(chunks);
  if (!memory || !WebAssembly.validate(result)) throw Error('Bounded WASM module is invalid.');
  return result;
}

export async function buildGrokCodecs() {
  const manifest = JSON.parse(await readFile(root + 'src/presets/grok/codec-sources.json', 'utf8'));
  await mkdir(root + 'lib', { recursive: true });
  for (const row of manifest.engines) {
    const base = dirname(dirname(require.resolve(row.package)));
    const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
    if (pkg.name !== row.package || pkg.version !== row.version) throw Error('Grok codec version mismatch: ' + row.package);
    for (const item of row.files) {
      const bytes = await readFile(join(base, item.path));
      if (bytes.length !== item.bytes || sha(bytes) !== item.sha256) throw Error('Grok codec input changed: ' + item.path);
      if (item.notice && sha(await readFile(root + item.notice)) !== item.sha256) throw Error('Grok codec notice mismatch.');
    }
    const wasm = boundWasmMemory(await readFile(join(base, row.wasm)), manifest.memoryMaxPages);
    await writeFile(root + 'lib/' + row.output, wasm);
    await build({ absWorkingDir: root, entryPoints: ['src/presets/grok/' + row.worker], outfile: root + 'lib/grok-' + row.worker,
      bundle: true, platform: 'node', format: 'esm', target: 'node22',
      banner: { js: '// Bundled codec; versions, original hashes, licenses and memory-limit adaptation: src/presets/grok/codec-sources.json' },
    });
  }
  for (const item of manifest.notices ?? []) if (sha(await readFile(root + item.path)) !== item.sha256)
    throw Error('Grok codec attribution changed: ' + item.path);
}
