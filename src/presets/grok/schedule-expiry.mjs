const MAX_NODE_TIMEOUT = 2_147_483_647;

// The owner supplies saved deadlines and owns every authoritative effect. This
// driver provides wake-ups only; it creates no native delivery or history facts.
export function createGrokScheduleExpiry(ctx, { list, expire }) {
  if (typeof list !== 'function' || typeof expire !== 'function') throw Error('Grok expiry requires explicit owner callbacks.');
  let timer, running, controller, closed = false, listFailed = false, notification = 0;
  const attempted = new Set();
  const warn = error => {
    try { ctx.logger?.warn?.('Grok schedule expiry: ' + String(error?.message ?? error).slice(0, 512)); }
    catch { /* Observer failure cannot create another expiry attempt. */ }
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const snapshot = () => {
    const rows = list();
    if (!Array.isArray(rows)) throw Error('Grok expiry list must synchronously return saved owner deadlines.');
    const ids = new Set();
    return rows.map(row => {
      if (typeof row?.id !== 'string' || !row.id || ids.has(row.id)
        || typeof row.expiresAt !== 'string') throw Error('Grok expiry owner deadline identity is invalid.');
      ids.add(row.id);
      const at = Date.parse(row.expiresAt);
      if (!Number.isFinite(at) || new Date(at).toISOString() !== row.expiresAt) throw Error('Grok expiry requires a saved canonical UTC deadline.');
      return { id: row.id, at };
    });
  };
  const arm = () => {
    clearTimer();
    if (closed || running || listFailed) return;
    let rows;
    try { rows = snapshot().filter(row => !attempted.has(row.id)); }
    catch (error) { listFailed = true; warn(error); return; }
    if (!rows.length) return;
    const at = rows.reduce((earliest, row) => Math.min(earliest, row.at), Infinity);
    timer = setTimeout(drive, Math.min(MAX_NODE_TIMEOUT, Math.max(0, at - Date.now())));
    timer.unref();
  };
  function drive() {
    timer = undefined;
    if (closed || running) return;
    const control = new AbortController();
    controller = control;
    running = Promise.resolve().then(async () => {
      const due = snapshot().filter(row => row.at <= Date.now() && !attempted.has(row.id));
      for (const row of due) {
        if (closed || control.signal.aborted) break;
        if (row.at > Date.now()) continue; // A clock rollback retains its future wake.
        const before = notification;
        try { await expire(row.id, control.signal); }
        catch (error) { if (!closed) warn(error); }
        // Only an actual later notify permits another attempt, including when a
        // callback resolves but leaves its due record eligible. No busy retry.
        // A rollback while the owner awaited storage must not latch a future
        // deadline. Re-arm that saved deadline rather than require a new event.
        if (before === notification && row.at <= Date.now()) attempted.add(row.id);
      }
    }).catch(error => {
      if (!closed) { listFailed = true; warn(error); }
    }).finally(() => {
      running = undefined;
      controller = undefined;
      arm();
    });
  }
  const notify = () => {
    if (closed) return;
    notification++;
    attempted.clear();
    listFailed = false;
    arm();
  };
  const close = () => {
    closed = true;
    clearTimer();
    controller?.abort(Error('Grok schedule expiry driver closed.'));
    return running ?? Promise.resolve();
  };
  notify();
  return { notify, close };
}
