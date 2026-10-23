import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { classifyNativeFailure } from '../grok/conversion-errors.mjs';

export function pdfError(code, message, cause) {
  const error = new HarnessError(message, 'OMAA_ZCODE_' + code);
  if (cause !== undefined) error.cause = cause;
  return error;
}

async function cleanupAll(actions) {
  const errors = [];
  for (const action of actions) {
    try { await action(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'PDF process cleanup failures');
}

async function boundedCleanup(work) {
  let timer;
  // Observe a late rejection even after reporting the non-quiescent boundary.
  const pending = Promise.resolve(work); pending.catch(() => {});
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('PDF outcome/pipe cleanup did not settle within 10s.')), 10_000);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
}

function waitForSignal(work, signal) {
  const pending = Promise.resolve(work); pending.catch(() => {});
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const clear = () => signal.removeEventListener('abort', abort);
    const abort = () => { clear(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { clear(); resolve(value); }, error => { clear(); reject(error); });
  });
}

// Read-only conversion only: never a shell, caller filename, installer, policy
// escalation or unconfined fallback. The public provider owns the process range.
export async function runPdfCodec(ctx, exec, command, args, input, maxOutput, check) {
  if (!['pdfinfo', 'pdftoppm', 'pdftotext'].includes(command)) throw Error('Unsupported PDF codec.');
  const runtime = ctx.get('subprocess'), sandbox = ctx.get('sandbox'), policies = ctx.get('sandboxPolicy');
  if (!runtime || !sandbox || !policies) throw pdfError('PDF_CONFIGURATION_ERROR', 'PDF pages require native subprocess, sandbox and sandboxPolicy services.');
  check();
  const policy = { ...policies.resolve({ session: exec.agent.session }), mode: 'read-only' };
  const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
  check();
  let executable;
  try { executable = await runtime.resolveExecutable(command, { LC_ALL: 'C' }, exec.signal); }
  catch (error) {
    check();
    if (error?.name === 'SubprocessExecutableNotFoundError') throw pdfError('PDF_CONFIGURATION_ERROR', `Existing ${command} is unavailable; no installation or alternate unconfined retry was attempted.`, error);
    throw error;
  }
  check();
  const confined = await sandbox.confine([executable, ...args], policy, exec.signal);
  check();
  if (confined.enforcement !== 'full') throw pdfError('PDF_CONFIGURATION_ERROR', 'PDF conversion requires full read-only confinement; no unconfined fallback is permitted.');
  const control = new AbortController(), signal = AbortSignal.any([exec.signal, control.signal]);
  let handle, tasks = [], range;
  let value, failure, failed = false;
  try {
    check();
    handle = runtime.spawn({ argv: confined.argv, cwd, graceMs: 1000, signal, env: { LC_ALL: 'C' },
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 16384 } } });
    // Observe range and outcome independently. Terminate descendants as soon as
    // the command ends; a surviving inherited pipe cannot hide range failure.
    range = Promise.resolve(handle.waitForExit(signal)).then(empty => { if (!empty) { signal.throwIfAborted(); throw Error('PDF process range did not settle.'); } });
    range.catch(() => {});
    const done = Promise.resolve(handle.done).finally(() => handle.terminate());
    done.catch(() => {});
    if (!handle.stdin || !handle.stdout) throw Error('Native PDF converter did not expose binary pipes.');
    const collect = async () => {
      const chunks = []; let size = 0;
      for await (const chunk of handle.stdout) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > maxOutput) {
          const error = pdfError('PDF_OUTPUT_LIMIT', 'PDF converter output exceeded its explicit byte limit; no partial page was accepted.');
          control.abort(error); throw error;
        }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks, size);
    };
    tasks = [pipeline(Readable.from([input]), handle.stdin, { signal }), collect(), done, range];
    let result, output, transportFailure, transportFailed = false;
    try { [, output, result] = await waitForSignal(Promise.all(tasks), signal); }
    catch (error) {
      signal.throwIfAborted(); check();
      transportFailed = true; transportFailure = error;
      // EPIPE must not hide an actual runner failure or denial. The owning
      // request deadline still bounds this real process-outcome observation.
      result = await waitForSignal(done, signal);
      signal.throwIfAborted(); check();
    }
    if (result.exitCode !== 0 || result.signal) {
      const captured = handle.collected.stderr?.readFrom(0);
      const kind = classifyNativeFailure(result.exitCode, captured, confined);
      if (kind === 'runner') throw pdfError('PDF_CONFIGURATION_ERROR', 'The selected read-only confinement runner failed; no PDF output was accepted.');
      if (kind === 'denied') throw pdfError('PDF_PERMISSION_DENIED', 'Native confinement denied PDF conversion; no escalation or unconfined fallback was attempted.');
      // Do not reflect untrusted raw stderr or infer corruption from a failed
      // process. Only a complete, known Poppler password diagnostic is mapped.
      if (!captured?.lossy && /^Command Line Error: Incorrect password\b/m.test(captured?.text ?? ''))
        throw pdfError('PDF_PASSWORD_PROTECTED', 'PDF is password-protected; provide an unprotected version.');
      throw pdfError('PDF_PROCESS_FAILED', `Native ${command} failed; no PDF output was accepted.`);
    }
    if (transportFailed) throw pdfError('PDF_PROCESS_FAILED', 'Native PDF binary transport or range observation failed; no partial output was accepted.', transportFailure);
    signal.throwIfAborted(); check(); value = output;
  } catch (error) { failed = true; failure = signal.aborted ? signal.reason : error; }
  try {
    if (handle) await cleanupAll([
      () => handle.terminate(),
      () => { handle.stdin?.destroy(); },
      () => { handle.stdout?.destroy(); },
      async () => {
        // A cleanup timeout is an explicit non-quiescent failure, never proof
        // that a process was stopped. All original promises stay observed.
        const timeout = AbortSignal.timeout(10_000);
        const empty = await handle.waitForExit(timeout);
        if (!empty) throw Error('PDF managed process range is not proven empty after cleanup.');
      },
      async () => {
        const outcomes = await boundedCleanup(Promise.allSettled([handle.done, ...tasks]));
        const rejected = outcomes.filter(outcome => outcome.status === 'rejected');
        // IO rejection after our own abort/destroy is expected; provider done
        // rejection is independently material even when the body also failed.
        if (outcomes[0].status === 'rejected') throw outcomes[0].reason;
        if (!failed && rejected.length) throw new AggregateError(rejected.map(outcome => outcome.reason));
      },
    ]);
  } catch (error) {
    throw pdfError('PDF_CLEANUP_FAILED', 'PDF conversion cleanup failed; no successful result is delivered.', failed ? new AggregateError([failure, error]) : error);
  }
  if (failed) throw failure;
  check(); return value;
}
