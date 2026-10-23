// Test-only access to the official per-session setter. Loaded exclusively in
// the owned fixture profile; no deployment default or approval setter is used.
export const inject = ['omaa', 'webServer', 'connection', 'sessions', 'sandboxPolicy', 'approval'];

export async function apply(ctx, config) {
  const { setSandboxMode } = await import(config.policyModule);
  const snapshot = session => ({
    sandbox: ctx.sandboxPolicy.resolve({ session }).mode,
    approval: ctx.approval.overrideOf(session) ?? ctx.approval.config.policy,
  });
  const defaults = () => ({ sandbox: ctx.sandboxPolicy.defaultMode, approval: ctx.approval.config.policy });
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/omaa-fixture/session-policy', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let input;
      if (req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw Error('Fixture policy request too large'); }
        input = JSON.parse(body);
        if (!['read-only', 'workspace-write', 'danger-full-access'].includes(input.mode)) throw Error('Unsupported fixture session sandbox mode');
      } else input = { sessionId: new URL(req.url, 'http://localhost').searchParams.get('session') };
      const session = ctx.sessions.get(input.sessionId);
      if (!session || session.header.cwd !== config.workspace || ctx.omaa.product(session)?.id !== 'zcode')
        throw Error('Policy target must be a ZCode session in the owned fixture workspace');
      const before = snapshot(session), globalBefore = defaults(), events = session.snapshotEvents();
      const eventCountBefore = events.length, approvalEventsBefore = events.filter(event => event.type === 'approval/policy').length;
      if (req.method === 'POST' && before.sandbox !== input.mode) setSandboxMode(session, input.mode);
      const after = snapshot(session), globalAfter = defaults(), current = session.snapshotEvents();
      const approvalEventsAfter = current.filter(event => event.type === 'approval/policy').length;
      if (after.approval !== before.approval || approvalEventsBefore !== approvalEventsAfter
        || JSON.stringify(globalBefore) !== JSON.stringify(globalAfter)) throw Error('Fixture approval or deployment defaults changed unexpectedly');
      const value = { sessionId: session.id, before, after, globalBefore, globalAfter,
        approvalEventsBefore, approvalEventsAfter, appendedEventTypes: current.slice(eventCountBefore).map(event => event.type) };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
