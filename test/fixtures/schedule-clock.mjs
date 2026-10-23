// Owned-host test clock only. Native Schedule timers, storage, inbox delivery
// and model requests remain real. No messages or receipts are synthesized here.
import { readFileSync, writeFileSync } from 'node:fs';
export const inject = ['webServer', 'connection', 'schedule', 'sessions'];
export async function apply(ctx, config) {
  ctx.on('approval/request', (request, next) => request.agent.session.header.cwd === config.workspace
    && ['cron_create', 'cron_update', 'cron_delete'].includes(request.toolName) ? 'allowed-once' : next(), { global: true, prepend: true });
  if (!config.clockFile) return;
  const realNow = Date.now;
  let started = realNow(), epoch = Date.parse(readFileSync(config.clockFile, 'utf8'));
  if (!Number.isSafeInteger(epoch)) throw Error('Invalid owned test clock');
  Date.now = () => epoch + realNow() - started;
  ctx.effect(() => () => { Date.now = realNow; });
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/omaa-fixture/schedule-clock', async handler(req, res) {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    try {
      let body = ''; for await (const part of req) { body += part; if (body.length > 2048) throw Error('Clock input too large'); }
      const input = JSON.parse(body), target = Date.parse(input.at), session = ctx.sessions.get(input.sessionId);
      if (!session || session.header.cwd !== config.workspace || !Number.isSafeInteger(target) || target < Date.now()) throw Error('Clock requires owned session and forward time');
      epoch = target; started = realNow(); writeFileSync(config.clockFile, new Date(epoch).toISOString());
      // A real public mutation wakes the real Schedule drive at the new clock.
      const tick = await ctx.schedule.create(session.id, { after_seconds: 31536000, title: 'Owned clock wake', prompt: 'Never due during this test' });
      await ctx.schedule.delete({ sessionId: session.id, id: tick.id });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ now: Date.now() }));
    } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  } }));
}
