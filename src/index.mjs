import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPresetActivation } from './host/preset-activation.mjs';
import { createUpdates } from './updates.mjs';
import { nativeHostVersion } from './host/compatibility.mjs';
import { sendJson, readJson } from './host/http.mjs';

export const name = 'omaa';
export const inject = ['agentPresets', 'agents', 'sessionProjections'];

export async function apply(ctx) {
  const activation = createPresetActivation(ctx, join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa'));
  ctx.provide('omaaActivation', activation);
  const updates = createUpdates({ hostVersion: nativeHostVersion(), getManager: () => ctx.get('pluginManager'),
    getOmdVersion: () => ctx.get('omd')?.omaaInstalledVersion,
    isRunning: () => [...(ctx.get('omaa')?.piExtensions?.states?.values() ?? [])].some(state => state.busy()) || ctx.agents.list().some(agent => agent.status === 'running' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length)
      || [undefined, ...ctx.agents.list().map(agent => agent.id)].some(owner => ctx.get('jobs')?.list(owner).some(job => ['running', 'stopping'].includes(job.status))) });
  ctx.effect(() => () => updates.close());
  ctx.on('plugin-manager/install-state', progress => updates.progress(progress), { global: true });
  ctx.effect(() => () => activation.close());
  ctx.on('agent/request', ({ agent }, next) => {
    activation.assertSession(agent.session);
    return next();
  }, { global: true, prepend: true });
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/omaa-base/api', async handler(req, res) {
      const rejected = web.connection.requestRejection(req);
      if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/omaa-base/api/updates') {
          if (req.method === 'GET') { await updates.check(url.searchParams.get('refresh') === '1'); sendJson(res, 200, await updates.status()); }
          else if (req.method === 'POST') {
            const input = await readJson(req);
            if (input.action !== 'install') throw Error('更新操作无效');
            void updates.start(input.target, input.version); sendJson(res, 202, await updates.status());
          } else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname !== '/omaa-base/api/presets') {
          sendJson(res, 404, { error: '接口不存在' }); return;
        }
        if (req.method === 'GET') sendJson(res, 200, activation.inspect());
        else if (req.method === 'POST') sendJson(res, 200, await activation.update(await readJson(req)));
        else sendJson(res, 405, { error: '不支持此方法' });
      } catch (error) {
        sendJson(res, error.code === 'revision-conflict' ? 409 : 400, { error: error.message });
      }
    } }));
  });
  await activation.start();
}
