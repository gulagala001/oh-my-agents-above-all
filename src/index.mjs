import { homedir } from 'node:os';
import { join } from 'node:path';
import { products, productForPreset } from './shared/products.mjs';
import { createPreferencesStore, validatePreferences } from './host/preferences.mjs';
import { sendJson, readJson } from './host/http.mjs';
import { createGitReview } from './git-review.mjs';
import { createSessionTransfer } from './host/session-transfer.mjs';
import { interpolate } from '@deepseek-ai/cordis-plugin-loader';

export const name = 'omaa';
export const inject = ['loader', 'agents', 'sessions', 'sessionProjections', 'systemPrompt'];
export function apply(ctx) {
  // Presets load eagerly. A configured OMD must finish its real provider Fiber
  // before working groups choose a workflow implementation, regardless of row
  // order. Keep the OMAA service owned by this plugin, not the dependency scope.
  const configuredOmd = [...ctx.loader.entries()].some(entry => entry.options.name === 'trisoul_x' && !interpolate(ctx, entry.options.disabled ?? false));
  let mounted = false;
  if (configuredOmd) return ctx.inject(['trisoulX'], () => { if (!mounted) { mounted = true; return mount(ctx); } });
  return mount(ctx);
}
function mount(ctx) {
  const store = createPreferencesStore(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa')); 
  const presetOf = session => ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset;
  const preferences = session => store.get(session.id);
  const hub = {
    checkpointDirectory: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa', 'checkpoints'),
    sandboxPolicy: () => ctx.get('sandboxPolicy'),
    products, preferences, planController: agent => ctx.get('agentPresets')?.serviceFor(agent, 'planMode') ?? agent?.ctx.get('planMode'), product: session => productForPreset(presetOf(session)),
    modeFor(session, agent = ctx.agents.get(session.id)) {
      const plan = agent && hub.planController(agent)?.get(agent);
      const active = plan?.pending ?? plan?.active ?? ctx.sessionProjections.stateOf(session, 'plan')?.active;
      return active ? 'plan' : preferences(session).mode;
    },
    enhancementEnabled: session => Boolean(productForPreset(presetOf(session)) && preferences(session).enhancement && typeof ctx.get('trisoulX')?.installOmaaEnhancement === 'function'),
    enhancementWorkModeFor: (session, agent) => hub.enhancementEnabled(session) && hub.modeFor(session, agent) === 'default' ? ctx.get('trisoulX')?.omaaWorkMode?.current(session, agent) ?? 'off' : 'off',
    async inspect(sessionId) {
      const found = await ctx.get('sessionController')?.resolveAgent(sessionId);
      if (found?.error) throw found.error;
      const agent = found?.agent ?? ctx.agents.get(sessionId), session = agent?.session ?? ctx.sessions.get(sessionId);
      if (!session) throw new Error('会话不存在');
      const product = hub.product(session), plan = agent && hub.planController(agent)?.get(agent);
      const omdIncompatible = Boolean(ctx.get('trisoulX') && typeof ctx.get('trisoulX').installOmaaEnhancement !== 'function');
      const workControl = ctx.get('trisoulX')?.omaaWorkMode;
      const workView = workControl?.inspect(session, agent);
      const workAvailable = typeof workControl?.select === 'function' && Boolean(agent?.ctx.get('tools')?.schemas(agent).find(tool => tool.name === 'workflow')?.parameters?.properties?.resumeFromRunId);
      return { agent, session, value: { ...preferences(session), product: product ?? null,
        mode: hub.modeFor(session, agent),
        pendingMode: plan?.pending !== undefined, running: agent?.status === 'running',
        omdAvailable: typeof ctx.get('trisoulX')?.installOmaaEnhancement === 'function', omdIncompatible,
        enhancementActive: hub.enhancementEnabled(session), enhancementWorkMode: hub.enhancementEnabled(session) ? workView?.savedMode ?? 'off' : 'off',
        enhancementWorkModeAvailable: workAvailable, enhancementWorkModeActive: Boolean(hub.enhancementEnabled(session) && workView?.enabled) } };
    },
    async update(sessionId, patch) {
      const { agent, session, value } = await hub.inspect(sessionId);
      const product = hub.product(session);
      if (!product) throw new Error('请选择 OMAA 预设会话');
      if (agent?.status === 'running') throw new Error('请先停止当前任务，再修改预设设置');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效的预设设置');
      const workMode = patch.enhancementWorkMode;
      if (workMode !== undefined && !['off', 'pro', 'ultracode'].includes(workMode)) throw new Error('增强工作方式无效');
      if (workMode !== undefined && workMode !== 'off' && (!value.enhancementWorkModeAvailable || hub.modeFor(session, agent) !== 'default' || patch.mode === 'plan' || patch.mode === 'ask' || patch.enhancement === false)) throw new Error('Pro / Ultra 需要兼容 OMD 工作流和空闲执行模式');
      const wantedPlan = patch.mode === 'plan';
      if (product.id === 'pi' && patch.mode !== undefined && patch.mode !== 'default') throw new Error('Pi 使用默认编程模式');
      if (patch.enhancement === true && typeof ctx.get('trisoulX')?.installOmaaEnhancement !== 'function') throw new Error('请安装并启用 Oh My DSH 后开启增强');
      const previous = preferences(session), { enhancementWorkMode: ignoredWorkMode, ...preferencePatch } = patch;
      const next = validatePreferences(previous, { ...preferencePatch, ...(workMode && workMode !== 'off' ? { enhancement: true } : {}), ...(wantedPlan ? { mode: 'default' } : {}) }, products.map(p => p.theme));
      if (patch.mode !== undefined) {
        const controller = agent && hub.planController(agent);
        if (wantedPlan && !controller) throw new Error('此预设未启用计划模式');
        controller?.set(agent, wantedPlan);
      }
      store.set(session.id, next);
      const control = ctx.get('trisoulX')?.omaaWorkMode;
      const wantedWorkMode = workMode ?? (patch.enhancement === false ? 'off' : undefined);
      if (wantedWorkMode !== undefined && control && (wantedWorkMode !== 'off' || control.inspect(session, agent).savedMode !== 'off')) {
        try { await control.select(sessionId, wantedWorkMode); }
        catch (error) { store.set(session.id, previous); throw error; }
      }
      await ctx.sessions.flush(session);
      return (await hub.inspect(sessionId)).value;
    },
  };
  const transferSession = createSessionTransfer({ store, hub, workControl: () => ctx.get('trisoulX')?.omaaWorkMode,
    flush: session => ctx.sessions.flush(session) });
  ctx.provide('omaa', hub);
  const gitReview = createGitReview({ execution: session => ({ subprocess: ctx.get('subprocess'), sandbox: ctx.get('sandbox'),
    get policy() {
      const policy = hub.sandboxPolicy()?.resolve({ session });
      return policy && { ...policy, ...(hub.modeFor(session) !== 'default' || ctx.agents.get(session.id)?.status === 'running' ? { mode: 'read-only' } : {}) };
    },
  }), writable: session => {
    const policy = hub.sandboxPolicy()?.resolve({ session });
    return Boolean(policy && policy.mode !== 'read-only' && ctx.agents.get(session.id)?.status !== 'running' && hub.modeFor(session) === 'default');
  } });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'plan/mode' && event.data.active === true && hub.product(session) && preferences(session).mode === 'ask') {
      store.set(session.id, { ...preferences(session), mode: 'default' });
    }
  }, { global: true });
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/omaa/api', async handler(req, res) {
      const rejected = web.connection.requestRejection(req);
      if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        if (!['/omaa/api/session', '/omaa/api/session-transfer', '/omaa/api/checkpoints', '/omaa/api/git-review', '/omaa/api/pi-branches'].includes(url.pathname)) { sendJson(res, 404, { error: '接口不存在' }); return; }
        if (url.pathname === '/omaa/api/session-transfer') {
          if (req.method !== 'POST') { sendJson(res, 405, { error: '不支持此方法' }); return; }
          sendJson(res, 200, await transferSession(await readJson(req))); return;
        }
        const id = url.searchParams.get('session');
        if (!id) { sendJson(res, 400, { error: '请选择会话' }); return; }
        if (url.pathname === '/omaa/api/pi-branches') {
          if (!hub.piBranches) throw new Error('Pi 分支服务尚未启用');
          const cancel = new AbortController();
          res.once('close', () => { if (!res.writableEnded) cancel.abort(); });
          if (req.method === 'GET') sendJson(res, 200, await hub.piBranches.inspect(id, cancel.signal));
          else if (req.method === 'POST') sendJson(res, 200, await hub.piBranches.fork(id, await readJson(req), cancel.signal));
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/git-review') {
          const { session } = await hub.inspect(id);
          if (hub.product(session)?.id !== 'codex') throw new Error('Git 范围审阅仅用于 Codex 预设');
          if (req.method === 'GET') {
            const options = Object.fromEntries(['scope', 'ref', 'path', 'revision'].filter(key => url.searchParams.has(key)).map(key => [key, url.searchParams.get(key)]));
            sendJson(res, 200, await gitReview.inspect(session, options));
          } else if (req.method === 'POST') sendJson(res, 200, await gitReview.change(session, await readJson(req)));
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/checkpoints') {
          const { session } = await hub.inspect(id);
          if (hub.product(session)?.id !== 'cursor' || !hub.checkpoints) throw new Error('文件检查点仅用于 Cursor 预设');
          if (req.method === 'GET') {
            const options = {};
            for (const key of ['turn', 'seq', 'index']) if (url.searchParams.has(key)) {
              const text = url.searchParams.get(key);
              if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error('检查点参数无效');
              options[key] = Number(text);
            }
            sendJson(res, 200, await hub.checkpoints.inspect(id, session, options));
          } else if (req.method === 'POST') {
            sendJson(res, 200, await hub.checkpoints.restore(id, session, await readJson(req)));
          } else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (req.method === 'GET') sendJson(res, 200, (await hub.inspect(id)).value);
        else if (req.method === 'POST') sendJson(res, 200, await hub.update(id, await readJson(req)));
        else sendJson(res, 405, { error: '不支持此方法' });
      } catch (error) { sendJson(res, error.code === 'revision-conflict' ? 409 : 400, { error: error.message, ...(error.code ? { code: error.code } : {}) }); }
    } }));
  });
}
