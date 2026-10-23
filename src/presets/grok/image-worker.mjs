import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { ImageMagick, initializeImageMagick, MagickFormat, MagickReadSettings, MagickImageInfo, ResourceLimits, ConfigurationFiles } from '@imagemagick/magick-wasm';

try {
  const bytes = Buffer.from(workerData.bytes);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw Error('Image exceeds the 50 MiB input limit.');
  const bmp = bytes[0] === 0x42 && bytes[1] === 0x4d;
  const ico = bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) > 0;
  if (!bmp && !ico) throw Error('Bundled image decoder accepts only BMP or ICO bytes.');
  // All coder I/O stays in Emscripten memory. No host filesystem is mounted.
  // Force the detected coder; disable delegates/filters and every other coder
  // except PNG, which can occur inside ICO and is our sole output format.
  const config = ConfigurationFiles.default;
  config.policy.data = '<policymap><policy domain="delegate" rights="none" pattern="*"/>'
    + '<policy domain="filter" rights="none" pattern="*"/>'
    + '<policy domain="coder" rights="none" pattern="*"/>'
    + '<policy domain="coder" rights="read|write" pattern="{BMP,BMP2,BMP3,ICO,ICON,PNG}"/></policymap>';
  await initializeImageMagick(await readFile(new URL('./grok-magick.wasm', import.meta.url)), config);
  ResourceLimits.memory = 256n * 1024n * 1024n;
  ResourceLimits.disk = 0n; ResourceLimits.area = 16_000_000n;
  ResourceLimits.width = 16_000_000n; ResourceLimits.height = 16_000_000n;
  ResourceLimits.maxMemoryRequest = 256n * 1024n * 1024n;
  ResourceLimits.maxProfileSize = 1024n * 1024n;
  ResourceLimits.time = 60n;
  const settings = new MagickReadSettings({ format: bmp ? MagickFormat.Bmp : MagickFormat.Ico, frameIndex: 0, frameCount: 1 });
  const validate = image => {
    if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1
      || image.width * image.height > 16_000_000) throw Error('BMP/ICO exceeds the 16000000-pixel decode limit.');
  };
  // Ping before allocation, then validate actual decoded dimensions again.
  const info = new MagickImageInfo(); info.read(bytes, settings); validate(info);
  const value = ImageMagick.read(bytes, settings, image => {
    validate(image); image.strip(); image.depth = 8;
    return image.write(MagickFormat.Png, data => {
      if (!data.length || data.length > 80 * 1024 * 1024) throw Error('Decoded PNG exceeds the output limit.');
      return Uint8Array.from(data);
    });
  });
  parentPort.postMessage({ value }, [value.buffer]);
} catch (error) {
  parentPort.postMessage({ error: String(error?.message ?? 'Image conversion failed.').slice(0, 1024) });
}
