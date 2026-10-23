import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BlockAssembler } from '@deepseek-ai/dsh-llm';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { symbols } from '@deepseek-ai/cordis';
import { readPiHistory } from './history.mjs';

export const name = 'omaa-pi-branches';
export const inject = ['omaa', 'sessionController', 'systemPrompt', 'llm'];
const source = readFileSync(new URL('./sources/packages/coding-agent/src/core/compaction/branch-summarization.ts', import.meta.url), 'utf8');
const utils = readFileSync(new URL('./sources/packages/coding-agent/src/core/compaction/utils.ts', import.meta.url), 'utf8');
const constant = (text, key) => {
  const value = text.match(new RegExp(`(?:const|export const) ${key} = \x60([\\s\\S]*?)\x60;`))?.[1];
  if (!value) throw new Error(`Pi source ${key} was not found`);
  return value;
};
export const branchPrompt = constant(source, 'BRANCH_SUMMARY_PROMPT');
const preamble = constant(source, 'BRANCH_SUMMARY_PREAMBLE');
const summarySystem = constant(utils, 'SUMMARIZATION_SYSTEM_PROMPT');
const textOf = content => (content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
const headOf = events => events.at(-1)?.seq ?? -1;
const conflict = () => Object.assign(new Error('会话已发生变化，请刷新分支后重试'), { code: 'revision-conflict' });

function pointsOf(events) {
  let turn = 0, label = '';
  const points = [];
  for (const event of events) {
    if (event.type === 'turn/start') { turn++; label = ''; }
    if (event.type === 'user/message' && event.data?.source?.kind === 'user') label ||= textOf(event.data.content).replace(/\s+/g, ' ').slice(0, 80);
    if (event.type === 'turn/end' && event.data.reason?.kind === 'completed') points.push({ seq: event.seq, turn, label: `回合 ${turn}${label ? ' · ' + label : ''}` });
  }
  return points.slice(-200);
}
// Serialize the effective native surface through the shared Pi history view.
// The 100000-character admission bound is native adaptation, not Pi's token
// estimator. Hidden native reasoning is not added to the summary request.
function branchMaterial(entries) {
  const parts = [], read = new Set(), modified = new Set();
  for (const { message } of entries) {
    // Pi converts custom messages to user input regardless of display:false.
    if (message.role === 'user' || message.role === 'custom') parts.push('[User]: ' + textOf(message.content));
    else if (message.role === 'assistant') {
      const text = textOf(message.content);
      if (text) parts.push('[Assistant]: ' + text);
      const calls = [];
      for (const call of message.content.filter(part => part.type === 'toolCall')) {
        const args = call.arguments;
        calls.push(`${call.name}(${args && typeof args === 'object' && !Array.isArray(args)
          ? Object.entries(args).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')
          : call.argumentsRaw ?? JSON.stringify(args)})`);
        const path = args?.path ?? args?.file_path;
        if (typeof path === 'string') {
          if (call.name === 'read' || call.name === 'read_image') read.add(path);
          else if (call.name === 'write' || call.name === 'edit') modified.add(path);
        }
      }
      if (calls.length) parts.push('[Assistant tool calls]: ' + calls.join('; '));
    } else if (message.role === 'toolResult') {
      const text = textOf(message.content);
      parts.push('[Tool result]: ' + (text.length > 2000 ? text.slice(0, 2000) + `\n\n[... ${text.length - 2000} more characters truncated]` : text));
    }
  }
  const selected = []; let length = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (length + parts[i].length > 100000) break;
    selected.unshift(parts[i]); length += parts[i].length;
  }
  const files = [];
  const readFiles = [...read].filter(path => !modified.has(path)).sort();
  if (readFiles.length) files.push(`<read-files>\n${readFiles.join('\n')}\n</read-files>`);
  if (modified.size) files.push(`<modified-files>\n${[...modified].sort().join('\n')}\n</modified-files>`);
  return { text: selected.join('\n\n'), files: files.length ? '\n\n' + files.join('\n\n') : '' };
}

export function apply(ctx) {
  const directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'omaa', 'pi-branch-context');
  const fileFor = id => join(directory, createHash('sha256').update(id).digest('hex') + '.json');
  const readContext = id => {
    let value;
    let descriptor, primary, failed = false;
    try {
      descriptor = openSync(fileFor(id), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = fstatSync(descriptor), limit = 1024 * 1024;
      if (!before.isFile() || before.size > limit) throw Error('Pi 分支上下文须为不超过 1 MiB 的普通文件');
      const buffer = Buffer.alloc(limit + 1); let length = 0;
      while (length < buffer.length) { const received = readSync(descriptor, buffer, length, buffer.length - length, null); if (!received) break; length += received; }
      if (length > limit) throw Error('Pi 分支上下文超过 1 MiB');
      const after = fstatSync(descriptor);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== before.size) throw Error('Pi 分支上下文读取期间发生变化');
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
    } catch (error) { failed = true; primary = error; }
    if (descriptor !== undefined) try { closeSync(descriptor); }
    catch (cleanup) { throw new AggregateError(failed ? [primary, cleanup] : [cleanup], 'Pi 分支上下文读取或关闭失败', failed ? { cause: primary } : {}); }
    if (failed) { if (primary?.code === 'ENOENT') return ''; throw primary; }
    if (!value || value.version !== 1 || typeof value.text !== 'string' || value.text.length > 60000) throw new Error('Pi 分支上下文资料无效');
    return value.text;
  };
  const saveContext = (id, text) => {
    if (!text) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = fileFor(id), temporary = file + '.' + randomUUID() + '.tmp';
    let created = false, descriptor;
    try {
      descriptor = openSync(temporary, 'wx', 0o600); created = true;
      try { writeFileSync(descriptor, JSON.stringify({ version: 1, text })); } finally { closeSync(descriptor); descriptor = undefined; }
      renameSync(temporary, file);
      created = false; // The confirmed rename consumed the temporary path.
    } finally { if (created) rmSync(temporary, { force: true }); }
  };
  // Native variables are substituted once: braces in user material remain
  // literal rather than becoming another template reference or assembly error.
  ctx.systemPrompt.variable('omaa_pi_branch_summary', ({ agent }) => agent ? readContext(agent.session.id) : '');
  ctx.systemPrompt.context({ name: 'omaa:pi-branch-summary', order: 300, text: '{{omaa_pi_branch_summary}}' });
  const locks = new Set();
  const requests = new Set();
  const lifetime = new AbortController();
  let closed = false;
  const scoped = signal => AbortSignal.any([signal ?? new AbortController().signal, lifetime.signal]);
  const nativeSession = session => session?.[symbols.original] ?? session;
  const ownerKey = agent => agent?.ctx && scopeOf(agent.ctx);
  const identity = id => {
    const agent = ctx.get('agents')?.get(id);
    return { session: nativeSession(ctx.get('sessions')?.get(id)), agent, scope: ownerKey(agent) };
  };
  const sameOwner = (id, owner) => {
    const current = identity(id);
    return current.session === owner.session && current.scope === owner.scope
      && Boolean(current.agent) === Boolean(owner.agent)
      && (!current.agent || Boolean(current.scope) && nativeSession(current.agent.session) === current.session);
  };
  const assertOwner = (id, owner, signal) => {
    signal.throwIfAborted();
    if (closed || !sameOwner(id, owner)) throw conflict();
    if (owner.session && ctx.omaa.product(owner.session)?.id !== 'pi') throw conflict();
  };
  const revoke = (id, message) => {
    for (const request of requests) if (request.id === id) request.control.abort(Error(message));
  };
  ctx.on('agent/disposed', ({ agent }) => revoke(agent.id, 'Pi branch parent agent disposed.'), { global: true });
  ctx.on('session/disposed', session => revoke(session.id, 'Pi branch source Session disposed.'), { global: true });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'agent-preset/selected') revoke(session.id, 'Pi branch source preset changed.');
  }, { global: true });
  async function current(id, signal) {
    signal.throwIfAborted();
    const owner = identity(id), observation = await ctx.sessionController.inspect(id, signal);
    assertOwner(id, owner, signal);
    const selected = observation.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset
      ?? observation.meta.agentPreset;
    if (selected !== 'omaa-pi' || observation.meta.origin === 'subagent') throw new Error('分支导航仅用于 Pi 普通会话');
    return { ...owner, owner, observation, value: { running: owner.agent?.status === 'running'
      || Boolean(owner.agent?.inbox.nextTurn.length || owner.agent?.inbox.nextStep.length) } };
  }
  const service = {
    async inspect(id, signal) {
      signal = scoped(signal);
      const { observation, value, owner } = await current(id, signal);
      const { items } = await ctx.sessionController.list({}, signal);
      assertOwner(id, owner, signal);
      const rows = new Map(items.filter(row => row.origin !== 'subagent' && row.cwd === observation.meta.cwd).map(row => [row.sessionId, row]));
      let root = id; const seen = new Set();
      while (rows.get(root)?.parentSessionId && rows.has(rows.get(root).parentSessionId) && !seen.has(root)) { seen.add(root); root = rows.get(root).parentSessionId; }
      const family = new Set([root]);
      for (let i = 0; i < rows.size; i++) {
        let changed = false;
        for (const row of rows.values()) if (family.has(row.parentSessionId) && !family.has(row.sessionId)) { family.add(row.sessionId); changed = true; }
        if (!changed) break;
      }
      const branches = [...rows.values()].filter(row => family.has(row.sessionId) && (!row.projections?.values.agentPreset || row.projections.values.agentPreset === 'omaa-pi')).map(row => ({
        sessionId: row.sessionId, ...(row.parentSessionId ? { parentSessionId: row.parentSessionId } : {}),
        title: row.projections?.values.title || (row.sessionId === id ? '当前分支' : row.sessionId), cwd: row.cwd, running: row.running, current: row.sessionId === id,
      }));
      const points = pointsOf(observation.events);
      return { sessionId: id, head: headOf(observation.events), branches, points, canFork: !value.running && points.length > 0 };
    },
    async fork(id, request, signal) {
      const control = new AbortController();
      signal = AbortSignal.any([scoped(signal), control.signal]);
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['head', 'atSeq', 'withSummary'].includes(key)) || !Number.isSafeInteger(request.head) || typeof request.withSummary !== 'boolean' || (request.atSeq !== undefined && (!Number.isSafeInteger(request.atSeq) || request.atSeq < 0))) throw new Error('分支参数无效');
      if (locks.has(id)) throw new Error('当前分支正在创建，请稍后再试');
      locks.add(id);
      const pending = { id, control }; requests.add(pending);
      try {
        const initial = await current(id, signal), { agent, observation, value, owner } = initial;
        if (value.running) throw new Error('请先停止当前任务再分叉');
        if (headOf(observation.events) !== request.head) throw conflict();
        const points = pointsOf(observation.events), boundary = request.atSeq ?? points.at(-1)?.seq;
        if (boundary === undefined || !points.some(point => point.seq === boundary)) throw new Error('请选择已完成回合的位置');
        const inherited = readContext(id);
        let summary = '';
        let material;
        if (request.withSummary) {
          const history = await readPiHistory(ctx.get('sessionQuery'), id, {
            signal, projections: ctx.get('sessions')?.messageProjections ?? [],
            // Summary serialization is text-only; no attachment hydration.
            content: async blocks => blocks.filter(part => part.type === 'text').map(part => ({ type: 'text', text: part.text })),
            argumentsFor: (_name, args) => args,
          });
          assertOwner(id, owner, signal);
          if (history.cursor !== request.head || !isDeepStrictEqual(history.header, observation.meta)) throw conflict();
          material = branchMaterial(history.branch.filter(entry => Number(entry.id) > boundary));
        }
        if (material?.text) {
          if (!agent || nativeSession(agent.session) !== owner.session) throw Error('附带摘要需要已加载的原生会话及已确认模型；本次未激活冷会话。');
          const currentRoute = agent.options, logged = agent.session.requestHeader()?.config;
          // A persisted request header belongs to the Session history. A cold
          // resident Agent starts from its own route, which can already differ.
          if (typeof currentRoute?.provider !== 'string' || !currentRoute.provider || typeof currentRoute?.model !== 'string' || !currentRoute.model)
            throw Error('当前原生模型选择不可确认，未生成摘要。');
          if (logged && (logged.provider !== currentRoute.provider || logged.model !== currentRoute.model))
            throw Error('当前代理模型与历史请求不同，未借用旧请求生成摘要。');
          const target = logged ?? currentRoute;
          const caps = [4096, target.maxTokens];
          if (agent.options.provider === target.provider && agent.options.model === target.model) caps.push(agent.options.maxTokens);
          for (const cap of caps) if (cap !== undefined && (!Number.isSafeInteger(cap) || cap <= 0)) throw Error('原生会话输出上限无效，未生成摘要。');
          const assembler = new BlockAssembler();
          const summarySignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(180000)]);
          const config = { provider: target.provider, model: target.model, maxTokens: Math.min(...caps.filter(cap => cap !== undefined)) };
          // The public adapter exposes a configured default output cap, not
          // Pi's hard model.maxTokens. Honor a known positive cap without
          // inventing one or racing a separately resolved adapter generation.
          const prepared = await ctx.llm.prepareCall(config, summarySignal,
            (controls, model) => ({ ...controls, maxTokens: Math.min(controls.maxTokens,
              Number.isSafeInteger(model.defaultMaxTokens) && model.defaultMaxTokens > 0 ? model.defaultMaxTokens : Infinity) }));
          assertOwner(id, owner, summarySignal);
          for await (const chunk of prepared.stream({ ...prepared.config, sessionId: id, tools: [], signal: summarySignal,
            messages: [{ role: 'system', content: [{ type: 'text', text: summarySystem }] }, { role: 'user', content: [{ type: 'text', text: `<conversation>\n${material.text}\n</conversation>\n\n${branchPrompt}` }] }] })) assembler.push(chunk);
          summarySignal.throwIfAborted();
          if (assembler.finish?.kind !== 'completed' || assembler.blocks().some(part => part.type === 'tool-call')) throw new Error('摘要未完整生成，未创建分支');
          summary = textOf(assembler.blocks()).trim();
          if (!summary || summary.length > 32000) throw new Error('摘要为空或超过范围，未创建分支');
          summary = preamble + summary + material.files;
        }
        signal?.throwIfAborted();
        const latest = await current(id, signal);
        assertOwner(id, owner, signal);
        if (latest.value.running || headOf(latest.observation.events) !== request.head) throw conflict();
        const text = [inherited, summary].filter(Boolean).join('\n\n');
        if (text.length > 60000) throw new Error('分支摘要上下文已达上限，请先压缩当前会话或关闭新增摘要');
        // The native fork owns seed closure, model selection, journal and parent
        // identity. Only a bounded derived context capsule is stored by OMAA.
        assertOwner(id, owner, signal);
        let fork;
        try { fork = await ctx.sessionController.fork({ sessionId: id, atSeq: boundary }); }
        catch (error) {
          if (error?.code === 'session/workspace-attach-failed' && typeof error.details?.sessionId === 'string' && error.details.sessionId)
            return { sessionId: error.details.sessionId, parentSessionId: id, forkConfirmed: true, partial: true,
              summaryIncluded: false, contextIncluded: false, workspaceAttached: false,
              message: '原生分支已创建，但工作区绑定未完成；请检查已创建分支，勿重复创建。' };
          return { parentSessionId: id, forkConfirmed: false, forkOutcome: 'unknown', partial: true,
            summaryIncluded: false, message: '原生分支创建未获确认，结果可能未知；请检查原生会话列表，勿重复创建。' };
        }
        if (typeof fork?.sessionId !== 'string' || !fork.sessionId) return { parentSessionId: id, forkConfirmed: false,
          forkOutcome: 'unknown', partial: true, summaryIncluded: false, message: '原生分支没有有效确认 ID；勿重复创建。' };
        const result = { sessionId: fork.sessionId, parentSessionId: id, forkConfirmed: true, summaryIncluded: false, contextIncluded: false };
        // Public fork has no signal/CAS argument. Preserve a real returned ID
        // after late cancellation; never report that a committed fork vanished.
        try { assertOwner(id, owner, signal); }
        catch { return { ...result, partial: true, interrupted: true, message: '原生分支已创建，随后请求或归属改变；摘要未保存，勿重复创建。' }; }
        try { saveContext(fork.sessionId, text); }
        catch { return { ...result, partial: true, summaryStatus: 'unconfirmed', message: '原生分支已创建，但摘要上下文保存未获确认；勿重复创建。' }; }
        return { ...result, summaryIncluded: Boolean(summary), contextIncluded: Boolean(text) };
      } finally { requests.delete(pending); locks.delete(id); }
    },
  };
  ctx.effect(() => { ctx.omaa.piBranches = service; return () => {
    closed = true; lifetime.abort(Error('Pi branch service disposed.'));
    if (ctx.omaa.piBranches === service) delete ctx.omaa.piBranches;
  }; });
}
