// Owned native-host fixture: compare against actual Schedule edits/cancellation,
// with no synthetic task store, delivery, receipt or model execution.
export const inject = ['webServer', 'connection', 'schedule', 'sessions', 'storageDomain'];
export async function apply(ctx, config) {
  const { withGrokScheduleTransaction } = await import(config.transactionModule);
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/omaa-fixture/grok-transaction', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    try {
      let text = ''; for await (const part of req) { text += part; if (text.length > 4096) throw Error('Oversize fixture request'); }
      const input = JSON.parse(text), session = ctx.sessions.get(input.sessionId);
      if (req.method !== 'POST' || session?.header.cwd !== config.workspace) throw Error('Owned session required');
      if (input.action === 'owner') {
        const records = ctx.storageDomain.get('omaa_grok_schedules');
        const row = [...records.table('tasks').entries()].map(([, value]) => value).find(value => value.id === input.id);
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(row ?? null));
        return;
      }
      if (!['conflict', 'cancel'].includes(input.action)) throw Error('Unknown fixture action');
      const service = ctx.schedule;
      const expected = (await service.catalog()).find(row => row.id === input.id && row.sessionId === session.id);
      if (!expected) throw Error('Actual schedule required');
      const gate = Promise.withResolvers(), queued = service.serialize(() => gate.promise);
      const { sessionId: _session, status: _status, lastDelivery: _delivery, ...record } = expected;
      let changed;
      if (input.action === 'conflict') changed = service.update({ sessionId: session.id, id: input.id, expected: record, prompt: 'EXTERNAL_NATIVE_EDIT' });
      let callbackRan = false;
      const control = new AbortController();
      const transaction = withGrokScheduleTransaction(service, { sessionId: session.id, id: input.id, expected, signal: control.signal }, async current => {
        callbackRan = true; return current.remove();
      }).then(value => ({ value }), error => ({ code: error.code, error: error.message }));
      if (input.action === 'cancel') control.abort(Error('Owned queued cancellation'));
      gate.resolve(); await queued; const update = await changed, result = await transaction;
      const current = (await service.catalog()).find(row => row.id === input.id);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ callbackRan, result, update, current }));
    } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
