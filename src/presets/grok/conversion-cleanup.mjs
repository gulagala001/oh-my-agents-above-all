import { HarnessError } from '@deepseek-ai/dsh-llm';

// Keep the operation failure and cleanup failure as separate facts. A caller
// abort during awaited cleanup must never turn into a late success receipt.
export async function withConversionCleanup(signal, body, cleanup, label) {
  let result, failure, failed = false;
  try { result = await body(); }
  catch (error) { failed = true; failure = signal.aborted && error?.code !== 'OMAA_GROK_CONVERSION_CLEANUP_FAILED' ? signal.reason : error; }
  try { await cleanup(); }
  catch (error) {
    const combined = new HarnessError(`${label} cleanup failed${failed ? ' after the operation also failed' : ''}; no successful output was accepted.`, 'OMAA_GROK_CONVERSION_CLEANUP_FAILED');
    combined.cause = failed ? new AggregateError([failure, error], 'Operation and cleanup failures') : error;
    throw combined;
  }
  if (failed) throw failure;
  signal.throwIfAborted();
  return result;
}

export async function cleanupAll(actions) {
  const errors = [];
  for (const action of actions) {
    try { await action(); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Conversion cleanup did not fully settle.');
}
