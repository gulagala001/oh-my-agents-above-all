import { Worker } from 'node:worker_threads';
import { withConversionCleanup } from './conversion-cleanup.mjs';
import { conversionError } from './conversion-errors.mjs';

// Only bytes already admitted by native fs cross this boundary. Workers get
// neither caller paths nor process/sandbox services, and load fixed local WASM.
// Each invocation owns its worker through exit, including timeout/cancellation.
export async function runBundledCodec(kind, bytes, options, signal) {
  signal.throwIfAborted();
  if (!['pdf-text', 'image'].includes(kind)) throw Error('Unknown bundled conversion.');
  if (!bytes?.byteLength || bytes.byteLength > 50 * 1024 * 1024) throw Error('Conversion input exceeds the 50 MiB limit.');
  const input = Uint8Array.from(bytes);
  const worker = new Worker(new URL(`../../../lib/grok-${kind}-worker.mjs`, import.meta.url), {
    workerData: { bytes: input.buffer, ...options }, transferList: [input.buffer],
    resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    // Inherited eval/test hooks are not part of a conversion worker.
    execArgv: [],
  });
  let timer, abort;
  return withConversionCleanup(signal, async () => await new Promise((resolve, reject) => {
    abort = () => reject(signal.reason ?? Error('Conversion cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => reject(conversionError('OMAA_GROK_CONVERSION_TIMEOUT',
      'Bundled conversion exceeded its 60s work budget; worker termination is awaited.')), 60_000);
    timer.unref();
    worker.once('message', result => result.error
      ? reject(conversionError('OMAA_GROK_CONVERSION_FAILED', result.error)) : resolve(result.value));
    worker.once('error', reject);
    worker.once('exit', code => reject(Error(`Conversion worker ended without a result (exit ${code}).`)));
    if (signal.aborted) abort();
  }), async () => {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    await worker.terminate();
  }, 'Bundled conversion worker');
}
