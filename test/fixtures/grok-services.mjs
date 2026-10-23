// Authenticated read-only inspection, mounted only by the owned Grok fixture.
export const inject = ['webServer', 'connection', 'agents', 'sessions', 'omaa', 'sandboxPolicy', 'approval', 'permissionPresets'];
export function apply(ctx, config) {
  const inspect = context => Object.fromEntries(['schedule', 'tools', 'agents', 'sandboxPolicy', 'approval', 'permissionPresets']
    .map(name => { try { return [name, Boolean(context.get(name))]; } catch { return [name, false]; } }));
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/grok-fixture/services', handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('session');
    const agent = ctx.agents.get(sessionId);
    const session = agent?.session ?? ctx.sessions.get(sessionId), context = agent?.ctx ?? ctx;
    if (req.method !== 'GET' || !session || session.header.cwd !== config.workspace || ctx.omaa.product(session)?.id !== 'grok') {
      res.writeHead(400); res.end(); return;
    }
    const value = { root: inspect(ctx), agent: inspect(context),
      tools: agent ? context.get('tools').schemas(agent).map(row => row.name) : [],
      nativeSchedule: Boolean(context.get('schedule')), adapter: Boolean(ctx.omaa.grokSchedules),
      policy: { sandbox: ctx.sandboxPolicy.resolve({ session }), approval: ctx.approval.overrideOf(session) ?? ctx.approval.config.policy,
        permissionPreset: ctx.permissionPresets.current(session) ?? null } };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
  } }));
}
