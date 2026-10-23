import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cleanupAll, withConversionCleanup } from './conversion-cleanup.mjs';
import { classifyNativeFailure, conversionError } from './conversion-errors.mjs';

async function boundedSettlement(work) {
  const pending = Promise.resolve(work); pending.catch(() => {});
  let timer;
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Native converter pipe/outcome cleanup did not settle within 10s.')), 10_000);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
}

// Public provider seams only. Bytes already admitted by native fs go through
// binary pipes; no shell interpolation, caller paths, install or raw spawn.
export async function runNativeCodec(ctx, exec, command, args, input, maxOutput) {
  if (!['pdfinfo', 'pdftotext', 'magick'].includes(command)) throw Error('Unsupported native codec.');
  const runtime = ctx.get('subprocess'), sandbox = ctx.get('sandbox'), policies = ctx.get('sandboxPolicy');
  if (!runtime || !sandbox || !policies) throw conversionError('OMAA_GROK_CONVERSION_UNAVAILABLE', 'Native conversion requires public subprocess, sandbox and sandboxPolicy services.');
  const abort = new AbortController(), signal = AbortSignal.any([exec.signal, abort.signal]);
  const timer = setTimeout(() => abort.abort(conversionError('OMAA_GROK_CONVERSION_TIMEOUT', 'Native document/image conversion exceeded its 60s work budget; cleanup is awaited.')), 60_000); timer.unref();
  let handle, tasks = [], failed = false;
  let onAbort;
  const cancellation = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  cancellation.catch(() => {});
  const run = async () => {
    signal.throwIfAborted();
    const policy = { ...policies.resolve(exec.agent ? { session: exec.agent.session } : {}), mode: 'read-only' };
    const cwd = exec.agent ? await ctx.workingDirectory.ensure(exec.agent, signal) : policy.workspaceRoot;
    signal.throwIfAborted();
    let executable;
    try { executable = await runtime.resolveExecutable(command, { LC_ALL: 'C' }, signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error?.name === 'SubprocessExecutableNotFoundError') throw conversionError('OMAA_GROK_CONVERSION_UNAVAILABLE', `Existing ${command} executable is unavailable in this execution world; conversion was not started. No install or alternate unconfined retry is supported.`, error);
      throw error;
    }
    signal.throwIfAborted();
    let confined;
    try { confined = await sandbox.confine([executable, ...args], policy, signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error?.code === 'SANDBOX_UNAVAILABLE') throw conversionError('SANDBOX_UNAVAILABLE', 'Required read-only confinement is unavailable; conversion was not accepted. No permission escalation or unconfined fallback is supported.', error);
      throw error;
    }
    if (confined.enforcement !== 'full') throw conversionError('SANDBOX_UNAVAILABLE', 'Native conversion requires full read-only file confinement; no unconfined fallback is allowed.');
    signal.throwIfAborted();
    handle = runtime.spawn({ argv: confined.argv, cwd, graceMs: 1000, signal, env: { LC_ALL: 'C' },
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 16384 } } });
    // Outcome, managed range and caller-owned pipes are separate observations.
    // A completed command must not leave descendants holding its raw stdout.
    const done = Promise.resolve(handle.done).finally(() => handle.terminate());
    const range = Promise.resolve(handle.waitForExit(signal)).then(empty => {
      if (!empty) { signal.throwIfAborted(); throw Error('Native converter process range did not settle.'); }
    });
    done.catch(() => {}); range.catch(() => {});
    tasks = [done, range];
    if (!handle.stdin || !handle.stdout) throw Error('Native converter did not expose binary input/output pipes.');
    const collect = async () => {
      const chunks = []; let size = 0;
      for await (const chunk of handle.stdout) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > maxOutput) { const error = conversionError('OMAA_GROK_CONVERSION_OUTPUT_LIMIT', 'Native converter output exceeded its explicit byte limit; no partial output was accepted.'); abort.abort(error); throw error; }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks, size);
    };
    tasks = [pipeline(Readable.from([input]), handle.stdin, { signal }), collect(), done, range];
    let output, result, transportFailure, transportFailed = false;
    try { [, output, result] = await Promise.race([Promise.all(tasks), cancellation]); }
    catch (error) {
      signal.throwIfAborted();
      // A runner may close stdin before all input is written. Wait for its
      // real outcome (under the same deadline) so EPIPE cannot hide positive
      // runner/denial evidence. A successful exit cannot redeem partial IO.
      transportFailure = error; transportFailed = true;
      try { result = await Promise.race([done, cancellation]); }
      catch (outcomeError) {
        signal.throwIfAborted();
        throw conversionError('OMAA_GROK_CONVERSION_FAILED', 'Native converter transport or process infrastructure failed; no output was accepted.', new AggregateError([error, outcomeError]));
      }
    }
    signal.throwIfAborted();
    if (result.exitCode !== 0 || result.signal) {
      const diagnostic = handle.collected.stderr?.readFrom(0);
      const kind = classifyNativeFailure(result.exitCode, diagnostic, confined);
      if (kind === 'runner') throw conversionError('SANDBOX_UNAVAILABLE', 'The selected read-only confinement runner reported a startup failure; no conversion result was accepted.');
      if (kind === 'denied') throw conversionError('OMAA_GROK_CONVERSION_DENIED', '[sandbox: file access denied under read-only mode] Conversion was denied; no permission escalation or alternate unconfined retry is supported.');
      throw conversionError('OMAA_GROK_CONVERSION_FAILED', `Native ${command} conversion failed; no result was accepted.`);
    }
    if (transportFailed) throw conversionError('OMAA_GROK_CONVERSION_FAILED', 'Native converter binary transport failed; no partial output was accepted.', transportFailure);
    return output;
  };
  return withConversionCleanup(signal, async () => {
    // Remains live after stdin, done or range have already settled. Raw pipe
    // EOF is not guaranteed by the provider's managed-range cancellation seam.
    try { return await Promise.race([run(), cancellation]); }
    catch (error) { failed = true; throw error; }
  }, async () => {
    clearTimeout(timer);
    try { if (handle) {
      await cleanupAll([
        () => handle.terminate(),
        () => { handle.stdin?.destroy(); },
        () => { handle.stdout?.destroy(); },
        async () => { if (!await handle.waitForExit(AbortSignal.timeout(10_000))) throw Error('Native converter process range is not proven empty after cleanup.'); },
        async () => {
          const outcomes = await boundedSettlement(Promise.allSettled([handle.done, ...tasks]));
          // A provider outcome failure is material even after cancellation;
          // pipe rejections caused by our abort/destroy are expected on failure.
          if (outcomes[0].status === 'rejected') throw outcomes[0].reason;
          const rejected = outcomes.filter(outcome => outcome.status === 'rejected');
          if (!failed && rejected.length) throw new AggregateError(rejected.map(outcome => outcome.reason));
        },
      ]);
    } } finally { signal.removeEventListener('abort', onAbort); }
  }, 'Native conversion');
}

export async function transcodeNativeImage(ctx, exec, bytes) {
  const bmp = bytes[0] === 0x42 && bytes[1] === 0x4d;
  const ico = bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) > 0;
  if (!bmp && !ico) return bytes;
  // These are literal forced coders and one frame, never a user filename.
  const source = (bmp ? 'BMP' : 'ICO') + ':-[0]';
  const limits = ['-limit', 'memory', '256MiB', '-limit', 'map', '0', '-limit', 'disk', '0', '-limit', 'thread', '1'];
  const header = await runNativeCodec(ctx, exec, 'magick', ['identify', ...limits, '-ping', '-format', '%w %h', source], bytes, 128);
  const match = /^(\d+) (\d+)$/.exec(header.toString('ascii'));
  if (!match) throw Error('ImageMagick did not return a bounded single-frame dimension header.');
  const width = Number(match[1]), height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 16_000_000)
    throw Error('BMP/ICO exceeds the 16000000-pixel transcode decode limit.');
  const png = await runNativeCodec(ctx, exec, 'magick', [...limits, source, '-strip', '-depth', '8', 'PNG:-'], bytes, 80 * 1024 * 1024);
  // The existing Sharp path checks the actual decoded PNG dimensions, then
  // performs the original small-side transcode upscale and compression caps.
  return png;
}
