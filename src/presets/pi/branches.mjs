import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BlockAssembler } from '@deepseek-ai/dsh-llm';

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
// Adapt only native message/part boundaries. Pi's serialized transcript, 2000
// character tool-result limit, newest-first budget and separate file lists are
// retained; hidden native reasoning is not added to the summary request.
function branchMaterial(events) {
  const parts = [], read = new Set(), modified = new Set();
  for (const event of events) {
    if (event.type === 'user/message' && event.data?.source?.kind === 'user') parts.push('[User]: ' + textOf(event.data.content));
    else if (event.type === 'assistant/message') parts.push('[Assistant]: ' + textOf(event.data?.content));
    else if (event.type === 'tool/call') {
      const { name, arguments: args = {} } = event.data;
      parts.push(`[Assistant tool calls]: ${name}(${Object.entries(args).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')})`);
      const path = args.file_path;
      if (typeof path === 'string') {
        if (name === 'read' || name === 'read_image') read.add(path);
        else if (name === 'write' || name === 'edit') modified.add(path);
      }
    } else if (event.type === 'tool/result') {
      const text = textOf(event.data.message?.content);
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
    try { value = JSON.parse(readFileSync(fileFor(id), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
    if (value.version !== 1 || typeof value.text !== 'string' || value.text.length > 60000) throw new Error('Pi 分支上下文资料无效');
    return value.text;
  };
  const saveContext = (id, text) => {
    if (!text) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = fileFor(id), temporary = file + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temporary, JSON.stringify({ version: 1, text }), { mode: 0o600, flag: 'wx' }); renameSync(temporary, file); }
    finally { rmSync(temporary, { force: true }); }
  };
  // Native variables are substituted once: braces in user material remain
  // literal rather than becoming another template reference or assembly error.
  ctx.systemPrompt.variable('omaa_pi_branch_summary', ({ agent }) => agent ? readContext(agent.session.id) : '');
  ctx.systemPrompt.context({ name: 'omaa:pi-branch-summary', order: 300, text: '{{omaa_pi_branch_summary}}' });
  const locks = new Set();
  async function current(id, signal) {
    const { agent, session, value } = await ctx.omaa.inspect(id);
    if (value.product?.id !== 'pi') throw new Error('分支导航仅用于 Pi 预设');
    return { agent, session, value, observation: await ctx.sessionController.inspect(id, signal) };
  }
  const service = {
    async inspect(id, signal) {
      const { observation, value } = await current(id, signal);
      const { items } = await ctx.sessionController.list({}, signal);
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
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['head', 'atSeq', 'withSummary'].includes(key)) || !Number.isSafeInteger(request.head) || typeof request.withSummary !== 'boolean' || (request.atSeq !== undefined && (!Number.isSafeInteger(request.atSeq) || request.atSeq < 0))) throw new Error('分支参数无效');
      if (locks.has(id)) throw new Error('当前分支正在创建，请稍后再试');
      locks.add(id);
      try {
        const { agent, observation, value } = await current(id, signal);
        if (value.running) throw new Error('请先停止当前任务再分叉');
        if (headOf(observation.events) !== request.head) throw conflict();
        const points = pointsOf(observation.events), boundary = request.atSeq ?? points.at(-1)?.seq;
        if (boundary === undefined || !points.some(point => point.seq === boundary)) throw new Error('请选择已完成回合的位置');
        const inherited = readContext(id);
        let summary = '';
        const material = branchMaterial(observation.events.filter(event => event.seq > boundary));
        if (request.withSummary && material.text) {
          const target = agent.session.requestHeader()?.config ?? agent.options;
          const assembler = new BlockAssembler();
          const summarySignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(180000)]);
          for await (const chunk of ctx.llm.stream({ provider: target.provider, model: target.model, sessionId: id, tools: [], maxTokens: 8192, signal: summarySignal,
            messages: [{ role: 'system', content: [{ type: 'text', text: summarySystem }] }, { role: 'user', content: [{ type: 'text', text: `<conversation>\n${material.text}\n</conversation>\n\n${branchPrompt}` }] }] })) assembler.push(chunk);
          summarySignal.throwIfAborted();
          if (['error', 'aborted', 'max-tokens'].includes(assembler.finish?.kind)) throw new Error('摘要未完整生成，未创建分支');
          summary = textOf(assembler.blocks()).trim();
          if (!summary || summary.length > 32000) throw new Error('摘要为空或超过范围，未创建分支');
          summary = preamble + summary + material.files;
        }
        signal?.throwIfAborted();
        const latest = await current(id, signal);
        if (latest.value.running || headOf(latest.observation.events) !== request.head) throw conflict();
        const text = [inherited, summary].filter(Boolean).join('\n\n');
        if (text.length > 60000) throw new Error('分支摘要上下文已达上限，请先压缩当前会话或关闭新增摘要');
        // The native fork owns seed closure, model selection, journal and parent
        // identity. Only a bounded derived context capsule is stored by OMAA.
        const fork = await ctx.sessionController.fork({ sessionId: id, atSeq: boundary });
        try { saveContext(fork.sessionId, text); }
        catch { throw new Error(`新分支 ${fork.sessionId} 已创建，但摘要保存失败；可从分支列表打开。`); }
        return { sessionId: fork.sessionId, parentSessionId: id, summaryIncluded: Boolean(summary) };
      } finally { locks.delete(id); }
    },
  };
  ctx.effect(() => { ctx.omaa.piBranches = service; return () => { if (ctx.omaa.piBranches === service) delete ctx.omaa.piBranches; }; });
}
