export function checkedConcurrency(value) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw Error('max_concurrency must be a positive safe integer.');
  return value;
}

// Per-run live asks only. Native continuable capacity and per-Actor FIFO keep
// their own authority; changing this cap never cancels accepted child tasks.
export function createAskConcurrency(signal, maximum) {
  checkedConcurrency(maximum);
  let cap = maximum ?? Infinity, active = 0;
  const waiting = [];
  function drain() {
    while (waiting.length && active < cap && !signal.aborted) {
      const entry = waiting.shift(); entry.detach(); active++;
      let released = false;
      entry.resolve(() => { if (!released) { released = true; active--; drain(); } });
    }
  }
  return {
    acquire() {
      signal.throwIfAborted();
      const result = Promise.withResolvers();
      const entry = { ...result, detach: () => signal.removeEventListener('abort', abort) };
      const abort = () => { const at = waiting.indexOf(entry); if (at !== -1) waiting.splice(at, 1); entry.detach(); result.reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true }); waiting.push(entry); drain();
      return result.promise;
    },
    retune(value) { checkedConcurrency(value); cap = value ?? Infinity; drain(); },
  };
}
