import { installPresetQueue } from './host/message-queue.mjs';
import { installSubagentOverrides } from './host/subagents.mjs';
import { currentDirectory } from './host/working-directory.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { products, productForPreset } from './shared/products.mjs';
import { createPreferencesStore, validatePreferences, projectMemoryRootSchema } from './host/preferences.mjs';
import { sendJson, readJson } from './host/http.mjs';
import { createGitReview } from './git-review.mjs';
import { createCursorEditor } from './host/cursor-editor.mjs';
import { createCursorReview } from './presets/cursor/review.mjs';
import { createSessionTransfer } from './host/session-transfer.mjs';
import { nativeHostVersion } from './host/compatibility.mjs';
import { createPiExtensionSettings, piExtensionSessionNames } from './host/pi-extensions.mjs';
import { createZCodeArtifactStore } from './host/zcode-artifacts.mjs';
import { createGrokScheduleRecords } from './host/grok-schedule-records.mjs';
import { createGrokScheduleRuntime } from './presets/grok/schedule-runtime.mjs';
import { installLiteralZCodeProfilePersona } from './presets/zcode/profile-delegation.mjs';
import { installZCodeProfileInstructions } from './presets/zcode/profile-instructions.mjs';
import { installZCodeProfilePermissions } from './presets/zcode/profile-permissions.mjs';
import { installFiniteScheduleGate } from './presets/zcode/finite-schedule-gate.mjs';
import { installCalendarChainGate } from './presets/zcode/calendar-chain-gate.mjs';
import { installZCodeMcpOwnership } from './host/zcode-mcp-ownership.mjs';
import { installZCodeProfileMcp } from './presets/zcode/profile-mcp.mjs';
import { installZCodeProfileSkills } from './presets/zcode/profile-skills.mjs';
import { createWorkflowQuestionNotices } from './presets/zcode/question-notices.mjs';

export const name = 'omaa-runtime';
export const inject = ['agents', 'sessions', 'sessionProjections', 'sessionQuery', 'storageDomain', 'attachments', 'sandboxPolicy'];
export function apply(ctx) {
  return mount(ctx);
}
async function mount(ctx) {
  const hostVersion = nativeHostVersion();
  const store = createPreferencesStore(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa'));
  const presetOf = session => ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset;
  const preferences = session => store.get(session.id);
  const hub = {
    workflowControllers: new Set(),
    workflowFor: agent => agent && [...hub.workflowControllers].find(controller => controller.matches(agent)),
    enhancementScopes: new Set(),
    enhancementAvailable: agent => Boolean(agent && [...hub.enhancementScopes].some(matches => matches(agent))),
    hostVersion,
    workflowQuestionRegistries: new Map(),
    pendingWorkflowQuestions(sessionId, runId) {
      const registry = hub.workflowQuestionRegistries.get(runId);
      const all = registry?.sessionId === sessionId ? registry.questions.pending() : [];
      // Display only live deferreds. Durable pending facts are archival after
      // cancellation/restart and never authorize a resolve operation.
      const pendingQuestions = []; let bytes = 0;
      for (const fact of all) {
        const row = { ...fact, question: fact.question.slice(0, 4096),
          ...(fact.context === undefined ? {} : { context: fact.context.slice(0, 4096) }),
          ...(fact.question.length > 4096 || (fact.context?.length ?? 0) > 4096 ? { truncated: true } : {}) };
        const length = Buffer.byteLength(JSON.stringify(row));
        if (pendingQuestions.length >= 32 || bytes + length > 128 * 1024) break;
        pendingQuestions.push(row); bytes += length;
      }
      return { pendingQuestions, pendingQuestionCount: all.length, pendingQuestionsTruncated: pendingQuestions.length < all.length };
    },
    checkpointDirectory: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa', 'checkpoints'),
    sandboxPolicy: () => ctx.get('sandboxPolicy'),
    shell: () => ctx.get('shell'),
    products, preferences, planController: agent => ctx.get('agentPresets')?.serviceFor(agent, 'planMode') ?? agent?.ctx.get('planMode'), product: session => { const product = productForPreset(presetOf(session)); return product && ctx.get('omaaActivation').available(product.id) ? product : undefined; },
    modeFor(session, agent = ctx.agents.get(session.id)) {
      const plan = agent && hub.planController(agent)?.get(agent);
      const active = plan?.pending ?? plan?.active ?? ctx.sessionProjections.stateOf(session, 'plan')?.active;
      return active ? 'plan' : preferences(session).mode;
    },
    enhancementEnabled: session => Boolean(hub.product(session) && preferences(session).enhancement && hub.enhancementAvailable(ctx.agents.get(session.id)) && typeof ctx.get('omd')?.installOmaaEnhancement === 'function'),
    enhancementWorkModeFor: (session, agent) => hub.enhancementEnabled(session) && hub.workflowFor(agent)?.mode === 'omd' && hub.modeFor(session, agent) === 'default' ? ctx.get('omd')?.omaaWorkMode?.current(session, agent) ?? 'off' : 'off',
    enhancementWorkSubmodeFor: (session, agent) => ctx.get('omd')?.omaaWorkMode?.submode?.(session, agent) ?? 'free',
    async inspect(sessionId) {
      const found = await ctx.get('sessionController')?.resolveAgent(sessionId);
      if (found?.error) throw found.error;
      const agent = found?.agent ?? ctx.agents.get(sessionId), session = agent?.session ?? ctx.sessions.get(sessionId);
      if (!session) throw new Error('会话不存在');
      const product = hub.product(session), plan = agent && hub.planController(agent)?.get(agent);
      const omdIncompatible = Boolean(ctx.get('omd') && typeof ctx.get('omd').installOmaaEnhancement !== 'function');
      const workControl = ctx.get('omd')?.omaaWorkMode;
      const workView = await workControl?.inspect(session, agent);
      const enhancementActive = hub.enhancementEnabled(session);
      const currentWorkMode = enhancementActive ? workView?.currentMode ?? workControl?.current?.(session, agent) ?? workView?.mode ?? 'off' : 'off';
      const workAvailable = hub.workflowFor(agent)?.mode === 'omd' && typeof workControl?.select === 'function' && typeof workControl?.submode === 'function' && Boolean(agent?.ctx.get('tools')?.schemas(agent).find(tool => tool.name === 'workflow')?.parameters?.properties?.resumeFromRunId);
      return { agent, session, value: { ...preferences(session), product: product ?? null, hostVersion,
        workspacePath: session.header.cwd,
        projectMemoryAvailable: product?.id === 'zcode' && session.header.origin !== 'subagent' && Boolean(agent && session.header.cwd),
        agentProfileDirectoryAvailable: product?.id === 'zcode' && session.header.origin !== 'subagent' && Boolean(agent && session.header.cwd),
        agentMemoryAvailable: product?.id === 'zcode' && session.header.origin !== 'subagent' && Boolean(agent && session.header.cwd),
        mode: hub.modeFor(session, agent),
        pendingMode: plan?.pending !== undefined, running: agent?.status === 'running' || Boolean(hub.piExtensions?.states.get(session.id)?.sessionOperation),
        omdAvailable: hub.enhancementAvailable(agent) && typeof ctx.get('omd')?.installOmaaEnhancement === 'function', omdIncompatible,
        enhancementActive, enhancementWorkMode: enhancementActive ? workView?.savedMode ?? 'off' : 'off',
        enhancementWorkSubmode: workView?.submode ?? 'free', enhancementWorkSavedSubmode: workView?.savedSubmode ?? workView?.submode ?? 'free',
        enhancementWorkModeCurrent: currentWorkMode, enhancementWorkSubmodeCurrent: workView?.currentSubmode ?? workControl?.submode?.(session, agent) ?? workView?.submode ?? 'free',
        enhancementWorkModePending: Boolean(enhancementActive && workView?.pending),
        enhancementTeamAvailable: workView?.teamAvailable === true, enhancementWorkModeAvailable: workAvailable, enhancementWorkModeActive: currentWorkMode !== 'off' } };
    },
    async update(sessionId, patch) {
      const { agent, session, value } = await hub.inspect(sessionId);
      const product = hub.product(session);
      if (!product) throw new Error('请选择 OMAA 预设会话');
      if (agent?.status === 'running' || hub.piExtensions?.states.get(session.id)?.sessionOperation) throw new Error('请先停止当前任务，再修改预设设置');
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效的预设设置');
      if (Object.hasOwn(patch, 'outputStyle') && product.id !== 'zcode') throw new Error('输出风格仅适用于 ZCode 预设');
      const directoryKeys = ['projectMemory', 'agentProfileDirectory', 'agentMemory'].filter(key => Object.hasOwn(patch, key));
      if (directoryKeys.length) {
        if (directoryKeys.length !== 1) throw Error('请分别保存每个 ZCode 目录配置。');
        const directoryKey = directoryKeys[0];
        const directoryLabel = { projectMemory: '项目记忆', agentProfileDirectory: '全局 Agent profile 目录', agentMemory: 'Agent 持久记忆' }[directoryKey];
        const directoryPreferenceSnapshot = JSON.stringify(preferences(session));
        const checkDirectoryOwner = () => {
          if (product.id !== 'zcode' || session.header.origin === 'subagent' || !agent
            || ctx.agents.get(sessionId) !== agent || ctx.sessions.get(sessionId) !== session
            || hub.product(session)?.id !== 'zcode' || agent.status !== 'idle'
            || hub.modeFor(session, agent) !== 'default' || hub.planController(agent)?.get(agent)?.pending !== undefined
            || JSON.stringify(preferences(session)) !== directoryPreferenceSnapshot)
            throw Error(directoryLabel + '仅可在当前 ZCode 主会话空闲的执行模式配置。');
        };
        checkDirectoryOwner();
        if (Object.keys(patch).some(key => key !== directoryKey)) throw Error('请单独保存' + directoryLabel + '配置。');
        let selectedDirectory = null;
        if (patch[directoryKey] !== null) {
          const input = patch[directoryKey];
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'root'))
            throw Error('请选择已有目录；工作区由当前会话绑定。');
          const root = projectMemoryRootSchema.parse(input.root), workspacePath = projectMemoryRootSchema.parse(session.header.cwd);
          const fs = agent.ctx.get('fs');
          if (!fs) throw Error('当前会话没有原生文件系统，无法核对目录。');
          const target = await fs.resolve(root, { cwd: workspacePath });
          checkDirectoryOwner();
          if ((await fs.stat(target))?.type !== 'directory') throw Error('所选目录不存在或不是目录；此设置不会创建目录。');
          const canonicalRoot = projectMemoryRootSchema.parse(fs.processPath(target));
          checkDirectoryOwner();
          selectedDirectory = { root: canonicalRoot, workspacePath };
        }
        patch = { [directoryKey]: selectedDirectory };
      }
      const workMode = patch.enhancementWorkMode, workSubmode = patch.enhancementWorkSubmode;
      if (workSubmode !== undefined && !['workflow', 'team', 'free'].includes(workSubmode)) throw new Error('Ultra 子模式无效');
      if (workSubmode === 'team' && !value.enhancementTeamAvailable) throw new Error('请先在 DSH 中开启 Agent Team，再选择此子模式');
      if (workMode !== undefined && !['off', 'ultra'].includes(workMode)) throw new Error('增强工作方式无效');
      if ((workMode === 'ultra' || workSubmode !== undefined && (workMode ?? value.enhancementWorkMode) === 'ultra') && (!value.enhancementWorkModeAvailable || hub.modeFor(session, agent) !== 'default' || patch.mode === 'plan' || patch.mode === 'ask' || patch.enhancement === false)) throw new Error('Ultra 需要兼容 OMD 增强和空闲执行模式');
      const wantedPlan = patch.mode === 'plan';
      if (product.id === 'pi' && patch.mode !== undefined && patch.mode !== 'default') throw new Error('Pi 使用默认编程模式');
      if (patch.enhancement === true && !value.omdAvailable) throw new Error('请安装并启用兼容的 Oh My DSH 后开启增强');
      const previous = preferences(session), { enhancementWorkMode: ignoredWorkMode, enhancementWorkSubmode: ignoredWorkSubmode, ...preferencePatch } = patch;
      const next = validatePreferences(previous, { ...preferencePatch, ...(workMode && workMode !== 'off' ? { enhancement: true } : {}), ...(wantedPlan ? { mode: 'default' } : {}) }, products.map(p => p.theme));
      const controller = patch.mode !== undefined && agent ? hub.planController(agent) : undefined;
      if (wantedPlan && !controller) throw new Error('此预设未启用计划模式');
      store.set(session.id, next);
      try { controller?.set(agent, wantedPlan); }
      catch (error) { store.set(session.id, previous); throw error; }
      const control = ctx.get('omd')?.omaaWorkMode;
      const wantedWorkMode = workMode ?? (patch.enhancement === false ? 'off' : workSubmode !== undefined ? value.enhancementWorkMode : undefined);
      if (wantedWorkMode !== undefined && control && (workSubmode !== undefined || wantedWorkMode !== 'off' || (await control.inspect(session, agent)).savedMode !== 'off')) {
        try { await control.select(sessionId, wantedWorkMode, workSubmode); }
        catch (error) { store.set(session.id, previous); throw error; }
      }
      await ctx.sessions.flush(session);
      ctx.emit('omaa/preferences-updated', session);
      return (await hub.inspect(sessionId)).value;
    },
  };
  const extensionSettings = createPiExtensionSettings(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa'));
  const extensionStates = new Map(), extensionNotices = new Map();
  let noticeId = 0;
  hub.piExtensions = {
    settings: extensionSettings, states: extensionStates,
    notify(agent, text, type = 'info') {
      if (typeof text !== 'string' || text.length > 4096) throw Error('Pi 扩展通知须为不超过 4096 字符的文字');
      const notices = extensionNotices.get(agent.id) ?? [];
      notices.push({ id: ++noticeId, type: ['info', 'warning', 'error'].includes(type) ? type : 'info', text });
      extensionNotices.set(agent.id, notices.slice(-32));
    },
    notices(sessionId, after = 0) {
      if (!Number.isSafeInteger(after) || after < 0) throw Error('通知位置无效');
      const notices = (extensionNotices.get(sessionId) ?? []).filter(n => n.id > after);
      return { enabled: extensionSettings.read().files.length > 0, cursor: Math.max(after, ...notices.map(n => n.id)), notices };
    },
    describe: () => ({ ...extensionSettings.read(), states: [...extensionStates].map(([sessionId, state]) => {
      const session = ctx.agents.get(sessionId)?.session ?? ctx.sessions.get(sessionId);
      const title = session && ctx.sessionProjections.stateOf(session, 'title');
      return { sessionId, ...piExtensionSessionNames({ title, cwd: session?.header.cwd }), ...state.view() };
    }) }),
    async update(files, revision) {
      const agents = ctx.agents.list().filter(agent => hub.product(agent.session)?.id === 'pi');
      if ([...extensionStates.values()].some(state => state.busy()) || agents.some(agent => agent.status === 'running' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length || ctx.get('jobs')?.list(agent.id).some(job => ['running', 'stopping'].includes(job.status)))) throw Error('请先停止 Pi 任务，再更改执行扩展');
      // Validate/CAS before teardown; the next assembly initializes the new set.
      extensionSettings.write(files, revision);
      await Promise.all([...extensionStates.values()].map(state => state.dispose()));
      return hub.piExtensions.describe();
    },
  };
  ctx.on('agent/disposed', ({ agent }) => { extensionNotices.delete(agent.id); }, { global: true });
  const transferSession = createSessionTransfer({ store, hub, workControl: () => ctx.get('omd')?.omaaWorkMode,
    flush: session => ctx.sessions.flush(session) });
  ctx.provide('omaa', hub);
  const gitReview = createGitReview({ execution: session => ({ cwd: currentDirectory(ctx, session), subprocess: ctx.get('subprocess'), sandbox: ctx.get('sandbox'),
    get policy() {
      const policy = hub.sandboxPolicy()?.resolve({ session });
      return policy && { ...policy, ...(hub.modeFor(session) !== 'default' || ctx.agents.get(session.id)?.status === 'running' ? { mode: 'read-only' } : {}) };
    },
  }), writable: session => {
    const policy = hub.sandboxPolicy()?.resolve({ session });
    return Boolean(policy && policy.mode !== 'read-only' && ctx.agents.get(session.id)?.status !== 'running' && hub.modeFor(session) === 'default');
  } });
  const cursorReview = createCursorReview({ directory: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa', 'cursor-reviews'),
    hub, gitReview, controller: () => ctx.get('sessionController'), flush: session => ctx.sessions.flush(session),
    currentDirectory: session => currentDirectory(ctx, session),
    editor: createCursorEditor({ verifyPath: async (path, signal) => {
      const fs = ctx.get('fs');
      const mapped = fs?.processPathFromHostPath(path);
      if (mapped === undefined || fs.processPath(await fs.resolve(mapped, { signal })) !== path) throw Error('文件没有通过宿主权限与本机路径核验。');
    } }) });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'plan/mode' && event.data.active === true && hub.product(session) && preferences(session).mode === 'ask') {
      store.set(session.id, { ...preferences(session), mode: 'default' });
    }
  }, { global: true });
  ctx.inject(['webServer', 'connection'], web => {
    const checkpointRequests = new Set();
    let checkpointScopeClosed = false;
    web.effect(() => () => {
      checkpointScopeClosed = true;
      for (const controller of checkpointRequests) controller.abort(Error('Cursor checkpoint web scope disposed.'));
    });
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/omaa/api', async handler(req, res) {
      const rejected = web.connection.requestRejection(req);
      if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
      try {
        const url = new URL(req.url, 'http://localhost');
        if (!['/omaa/api/pi-extensions', '/omaa/api/pi-extension-notices', '/omaa/api/session', '/omaa/api/session-transfer', '/omaa/api/checkpoints', '/omaa/api/git-review', '/omaa/api/cursor-review', '/omaa/api/pi-branches', '/omaa/api/zcode-workflows', '/omaa/api/zcode-workflow', '/omaa/api/zcode-workflow-source', '/omaa/api/zcode-artifact-data', '/omaa/api/zcode-artifact-aggregate', '/omaa/api/zcode-artifact-content', '/omaa/api/zcode-artifact-preview'].includes(url.pathname)) { sendJson(res, 404, { error: '接口不存在' }); return; }
        if (url.pathname === '/omaa/api/pi-extensions') {
          if (req.method === 'GET') sendJson(res, 200, hub.piExtensions.describe());
          else if (req.method === 'POST') { const data = await readJson(req); sendJson(res, 200, await hub.piExtensions.update(data.files, data.revision)); }
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/pi-extension-notices') {
          if (req.method !== 'GET') { sendJson(res, 405, { error: '不支持此方法' }); return; }
          const { session } = await hub.inspect(url.searchParams.get('session'));
          if (hub.product(session)?.id !== 'pi') throw Error('请选择 Pi 会话');
          sendJson(res, 200, hub.piExtensions.notices(session.id, Number(url.searchParams.get('after') ?? 0))); return;
        }
        if (url.pathname === '/omaa/api/session-transfer') {
          if (req.method !== 'POST') { sendJson(res, 405, { error: '不支持此方法' }); return; }
          sendJson(res, 200, await transferSession(await readJson(req))); return;
        }
        const id = url.searchParams.get('session');
        if (!id) { sendJson(res, 400, { error: '请选择会话' }); return; }
        if (url.pathname.startsWith('/omaa/api/zcode-')) {
          const workflowArtifacts = hub.workflowArtifacts;
          if (!workflowArtifacts) throw Error('请先在设置中启用 ZCode 预设。');
          // Archived reads only inspect domain-owned records and native blobs;
          // they never activate a cold agent or append to its session journal.
          const runId = url.searchParams.get('run'), artifactId = url.searchParams.get('id');
          if (url.pathname === '/omaa/api/zcode-workflow' && req.method === 'POST') {
            const input = await readJson(req);
            if (input.action !== 'stop') throw Error('工作流操作无效');
            sendJson(res, 202, await workflowArtifacts.stop(id, runId)); return;
          }
          if (req.method !== 'GET') { sendJson(res, 405, { error: '不支持此方法' }); return; }
          const number = (key, fallback) => {
            const text = url.searchParams.get(key);
            if (text === null && fallback !== undefined) return fallback;
            if (!/^(0|[1-9]\d*)$/.test(text ?? '')) throw Error('工作流数字参数无效');
            const value = Number(text); if (!Number.isSafeInteger(value)) throw Error('工作流数字参数越界'); return value;
          };
          if (url.pathname === '/omaa/api/zcode-workflows') sendJson(res, 200, workflowArtifacts.list(id));
          else if (url.pathname === '/omaa/api/zcode-workflow') {
            const value = await workflowArtifacts.inspect(id, runId, number('after', 0), number('limit', 200));
            const live = hub.pendingWorkflowQuestions(id, runId);
            sendJson(res, 200, { ...value, ...live,
              ...(value.runtime ? { runtime: { ...value.runtime, pendingQuestions: live.pendingQuestions } } : {}) });
          }
          else if (url.pathname === '/omaa/api/zcode-workflow-source') {
            const cancel = new AbortController();
            res.once('close', () => { if (!res.writableEnded) cancel.abort(); });
            sendJson(res, 200, await workflowArtifacts.source(id, runId, cancel.signal));
          }
          else if (url.pathname === '/omaa/api/zcode-artifact-data') sendJson(res, 200, await workflowArtifacts.data(id, runId, artifactId, number('after', 0), number('limit', 200)));
          else if (url.pathname === '/omaa/api/zcode-artifact-aggregate') {
            const cancel = new AbortController();
            res.once('close', () => { if (!res.writableEnded) cancel.abort(); });
            sendJson(res, 200, await workflowArtifacts.aggregate(id, runId, artifactId, number('after', 0), number('limit', 200), cancel.signal));
          }
          else if (url.pathname === '/omaa/api/zcode-artifact-preview') sendJson(res, 200, await workflowArtifacts.preview(id, runId, artifactId, number('version')));
          else {
            const { entry, bytes } = await workflowArtifacts.content(id, runId, artifactId, number('version'));
            const content = await bytes();
            res.writeHead(200, { 'content-type': entry.contentType || 'application/octet-stream', 'cache-control': 'no-store',
              'x-content-type-options': 'nosniff', 'content-length': content.length,
              'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.ref.name)}` });
            res.end(content);
          }
          return;
        }
        if (url.pathname === '/omaa/api/pi-branches') {
          if (!hub.piBranches) throw new Error('Pi 分支服务尚未启用');
          const cancel = new AbortController();
          res.once('close', () => { if (!res.writableEnded) cancel.abort(); });
          if (req.method === 'GET') sendJson(res, 200, await hub.piBranches.inspect(id, cancel.signal));
          else if (req.method === 'POST') { const body = await readJson(req); sendJson(res, 200, await (body.action === 'navigate' || body.action === 'compact' ? hub.piBranches.navigate(id, body, cancel.signal) : hub.piBranches.fork(id, body, cancel.signal))); }
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/cursor-review') {
          if (req.method === 'GET') {
            const options = Object.fromEntries(['scope', 'ref', 'path', 'revision', 'kind'].filter(key => url.searchParams.has(key)).map(key => [key, url.searchParams.get(key)]));
            if (url.searchParams.has('seq')) options.seq = Number(url.searchParams.get('seq'));
            sendJson(res, 200, await cursorReview.inspect(id, options));
          } else if (req.method === 'POST') {
            if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') { sendJson(res, 415, { error: '需要 JSON 请求。' }); return; }
            const request = await readJson(req);
            if (request.action === 'open-editor') {
              const cancel = new AbortController(); checkpointRequests.add(cancel);
              const close = () => { if (!res.writableEnded) cancel.abort(Error('编辑器请求已断开。')); };
              res.once('close', close);
              try {
                if (checkpointScopeClosed) throw Error('审阅服务已关闭。');
                sendJson(res, 200, await cursorReview.openEditor(id, request, AbortSignal.any([cancel.signal, AbortSignal.timeout(15000)])));
              } finally { checkpointRequests.delete(cancel); res.off('close', close); }
            } else sendJson(res, 200, await cursorReview.update(id, request));
          }
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/git-review') {
          const { session } = await hub.inspect(id);
          if (hub.product(session)?.id !== 'codex') throw new Error('Git 范围审阅仅用于 Codex 预设');
          if (req.method === 'GET') {
            const options = Object.fromEntries(['scope', 'ref', 'path', 'revision'].filter(key => url.searchParams.has(key)).map(key => [key, url.searchParams.get(key)]));
            if (options.scope === 'working') throw Error('此审阅范围仅适用于 Cursor 面板。');
            sendJson(res, 200, await gitReview.inspect(session, options));
          } else if (req.method === 'POST') sendJson(res, 200, await gitReview.change(session, await readJson(req)));
          else sendJson(res, 405, { error: '不支持此方法' });
          return;
        }
        if (url.pathname === '/omaa/api/checkpoints') {
          const controller = new AbortController(), { signal } = controller;
          const abort = () => controller.abort(Error('Cursor checkpoint request disconnected.'));
          const closed = () => { if (!res.writableEnded) abort(); };
          req.once('aborted', abort); res.once('close', closed);
          checkpointRequests.add(controller);
          try {
            if (checkpointScopeClosed || req.aborted || res.destroyed) abort();
            signal.throwIfAborted();
            const { session } = await hub.inspect(id);
            signal.throwIfAborted();
            if (hub.product(session)?.id !== 'cursor' || !hub.checkpoints) throw new Error('文件检查点仅用于 Cursor 预设');
            if (req.method === 'GET') {
              const options = { signal };
              for (const key of ['turn', 'seq', 'index']) if (url.searchParams.has(key)) {
                const text = url.searchParams.get(key);
                if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error('检查点参数无效');
                options[key] = Number(text);
              }
              sendJson(res, 200, await hub.checkpoints.inspect(id, session, options));
            } else if (req.method === 'POST') {
              const input = await readJson(req);
              signal.throwIfAborted();
              sendJson(res, 200, await hub.checkpoints.restore(id, session, { ...input, signal }));
            } else sendJson(res, 405, { error: '不支持此方法' });
          } catch (error) {
            if (req.aborted || res.destroyed) return;
            throw error;
          } finally {
            checkpointRequests.delete(controller);
            req.off('aborted', abort); res.off('close', closed);
          }
          return;
        }
        if (req.method === 'GET') sendJson(res, 200, (await hub.inspect(id)).value);
        else if (req.method === 'POST') sendJson(res, 200, await hub.update(id, await readJson(req)));
        else sendJson(res, 405, { error: '不支持此方法' });
      } catch (error) { sendJson(res, error.statusCode ?? (error.code === 'revision-conflict' ? 409 : 400), { error: error.message, ...(error.code ? { code: error.code } : {}) }); }
    } }));
  });
}

export async function enableProduct(ctx, product) {
  const hub = ctx.get('omaa');
  if (['grok', 'cursor'].includes(product)) installPresetQueue(ctx, hub, product);
  if (product === 'grok') {
    // Optional host services are resolved from the actual parent at use time.
    // Keep the ownership router mounted only while Grok is explicitly enabled.
    let records;
    try {
      records = await createGrokScheduleRecords(ctx);
      const schedules = createGrokScheduleRuntime(ctx, hub, records);
      hub.grokSchedules = schedules;
      ctx.effect(() => async () => {
        if (hub.grokSchedules === schedules) delete hub.grokSchedules;
        await schedules.close();
      });
    } catch {
      await records?.close().catch(() => {});
      ctx.logger.warn('Grok scheduled child ownership is unavailable; creation and adoption are disabled.');
    }
  }
  if (product === 'zcode') {
    const artifacts = await createZCodeArtifactStore(ctx);
    hub.workflowArtifacts = artifacts;
    ctx.effect(() => async () => {
      if (hub.workflowArtifacts === artifacts) delete hub.workflowArtifacts;
      await artifacts.close();
    });
    // Live runs borrow this router even if a typed workflow row is unloaded.
    hub.workflowQuestionNotices = createWorkflowQuestionNotices(ctx);
    installZCodeMcpOwnership(ctx);
    installSubagentOverrides(ctx);
    installZCodeProfileMcp(ctx);
    installZCodeProfileInstructions(ctx);
    installZCodeProfilePermissions(ctx);
    // Both use prepend: skills admission must precede the plan gate.
    installZCodeProfileSkills(ctx);
    installLiteralZCodeProfilePersona(ctx);
    const finiteSchedules = installFiniteScheduleGate(ctx);
    const calendarChains = installCalendarChainGate(ctx);
    await Promise.all([finiteSchedules.ready, calendarChains.ready]);
    await ctx.plugin(await import('./output-limits.mjs'));
    await ctx.plugin(await import('./host/zcode-skill-catalog.mjs'));
  }
}
