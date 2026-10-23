import { randomUUID } from 'node:crypto';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { BlockAssembler, CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { treeRecord } from './tree-state.mjs';
import { buildSessionProjection, convertToLlm, commitBoundary, projectBoundaryRequest } from './boundaries.mjs';
import { prepareCompaction, estimateTokens, collectEntriesForBranchSummary, prepareBranchEntries,
  serializeConversation, computeFileLists, formatFileOperations, SUMMARIZATION_SYSTEM_PROMPT,
  SUMMARIZATION_PROMPT, UPDATE_SUMMARIZATION_PROMPT, TURN_PREFIX_SUMMARIZATION_PROMPT,
  BRANCH_SUMMARY_PROMPT, BRANCH_SUMMARY_PREAMBLE } from '../../../../lib/pi-compaction-helpers.mjs';

const textOf = content => typeof content === 'string' ? content : (content ?? []).filter(p => p.type === 'text').map(p => p.text).join('');
const conflict = () => Object.assign(Error('Pi 会话在操作期间发生变化，请刷新后重试'), { code: 'revision-conflict' });
const validText = (text, limit = 64000) => typeof text === 'string' && text.trim() && text.length <= limit;
export function createPiSessionControl(ctx, { ensure, history, preview, notify, invoke, assertCurrent, adapters }) {
  const active = new Set(), overflow = new WeakSet();
  async function event(agent, state, name, data, signal) {
    if (!state.events.has(name)) return {};
    const value = await invoke(agent, state, { kind: 'event', eventName: name, event: { type: name, ...data } }, signal);
    if (value?.errors?.length) throw Error(value.errors.map(error => error.error).join('; '));
    return value ?? {};
  }
  async function summarize(agent, messages, instructions, signal, maxTokens = 4096) {
    signal.throwIfAborted();
    const config = { provider: agent.options.provider, model: agent.options.model,
      maxTokens: Math.min(maxTokens, agent.options.maxTokens ?? Infinity) };
    if (!config.provider || !config.model) throw Error('Pi 摘要需要已确认的当前模型');
    const call = await ctx.llm.prepareCall(config, signal, (controls, model) => ({ ...controls,
      maxTokens: Math.min(controls.maxTokens, model.defaultMaxTokens > 0 ? model.defaultMaxTokens : Infinity) }));
    const stream = new BlockAssembler(); let sawFinish = false;
    // The original serializer is used, but private native reasoning is not
    // promoted into a second model request.
    const material = convertToLlm(messages).map(message => message.role === 'assistant'
      ? { ...message, content: message.content.filter(part => part.type !== 'thinking') } : message);
    for await (const chunk of call.stream({ ...call.config, sessionId: agent.id, tools: [], signal,
      messages: [{ role: 'system', content: [{ type: 'text', text: SUMMARIZATION_SYSTEM_PROMPT }] },
        { role: 'user', content: [{ type: 'text', text: `<conversation>\n${serializeConversation(material)}\n</conversation>\n\n${instructions}` }] }] })) { if (chunk.type === 'finish') sawFinish = true; stream.push(chunk); }
    signal.throwIfAborted();
    if (!sawFinish || stream.finish?.kind !== 'stop' || stream.blocks().some(part => part.type === 'tool-call')) throw Error('Pi 摘要未完整生成: ' + JSON.stringify(stream.finish));
    const text = textOf(stream.blocks()); if (!validText(text)) throw Error('Pi 摘要为空或超过 64000 字符');
    return text;
  }
  async function operate(agent, signal, action, expectedHead, inCallback = false) {
    if (active.has(agent.id)) throw Error('Pi 树导航或压缩正在进行');
    if (!inCallback && agent.status !== 'idle') throw Error('请先停止当前运行再操作 Pi 会话');
    active.add(agent.id);
    let ownedState;
    const work = async nativeSignal => {
      const fused = AbortSignal.any([signal ?? new AbortController().signal, nativeSignal]);
      try {
        const state = await ensure(agent, fused); assertCurrent(agent, state);
        ownedState = state; state.sessionOperation = true;
        if (expectedHead !== undefined && agent.session.seq !== expectedHead) throw conflict();
        return await action(state, fused);
      } finally { if (ownedState) ownedState.sessionOperation = false; active.delete(agent.id); }
    };
    try { return await (inCallback ? work(signal) : agent.runMaintenance(work)); }
    finally { active.delete(agent.id); }
  }
  async function inspect(agent, signal) {
    const h = await history(agent, signal);
    const depths = new Map(), path = new Set(h.branch.map(entry => entry.id));
    return { head: agent.session.seq, busy: active.has(agent.id), leafId: h.leafId,
      nodes: h.entries.map(entry => {
        const depth = (depths.get(entry.parentId) ?? -1) + 1; depths.set(entry.id, depth);
        const role = entry.message?.role ?? entry.type;
        return { id: entry.id, parentId: entry.parentId, depth, role, active: path.has(entry.id), label: entry.label,
          text: textOf(entry.message?.content ?? entry.content ?? entry.summary ?? entry.customType).slice(0, 180), current: entry.id === h.leafId };
      }) };
  }
  async function navigate(agent, request, signal, inCallback = false) {
    const { targetId, summarize: wantSummary = false, customInstructions, replaceInstructions = false, label } = request;
    if (typeof targetId !== 'string' || typeof wantSummary !== 'boolean' || typeof replaceInstructions !== 'boolean'
      || customInstructions !== undefined && !validText(customInstructions, 16000) || label !== undefined && !validText(label, 256)) throw Error('Pi 树导航参数无效');
    return operate(agent, signal, async (state, signal) => {
      const h = await history(agent, signal), baseHead = agent.session.seq;
      const target = h.entries.find(entry => entry.id === targetId); if (!target) throw Error('Pi 树节点不存在');
      if (targetId === h.leafId) return { cancelled: false, newLeafId: h.leafId };
      const byId = new Map(h.entries.map(entry => [entry.id, entry]));
      const getBranch = fromId => { const path = []; let entry = byId.get(fromId); while (entry) { path.push(entry); entry = byId.get(entry.parentId); } return path.reverse(); };
      const collected = collectEntriesForBranchSummary({ getEntry: id => byId.get(id), getBranch }, h.leafId, targetId);
      const preparation = { targetId, oldLeafId: h.leafId, commonAncestorId: collected.commonAncestorId,
        entriesToSummarize: collected.entries, userWantsSummary: wantSummary, customInstructions, replaceInstructions, label };
      const response = await event(agent, state, 'session_before_tree', { preparation }, signal);
      if (response.cancel) return { cancelled: true };
      const newLeafId = target.type === 'custom_message' || target.message?.role === 'user' || target.message?.role === 'custom' ? target.parentId : target.id;
      const editorText = newLeafId === target.id ? undefined : textOf(target.content ?? target.message?.content);
      // A tree cut must never strand a tool call/result pair at the provider.
      const path = newLeafId === null ? [] : getBranch(newLeafId);
      const balance = new Set();
      for (const message of buildSessionProjection(path).messages) {
        for (const part of message.content ?? []) if (part.type === 'toolCall') balance.add(part.id);
        if (message.role === 'toolResult') balance.delete(message.toolCallId);
      }
      if (balance.size) throw Error('请选择完整工具批次之后的节点');
      let summaryEntry;
      if (wantSummary && (collected.entries.length || response.summary)) {
        let result = response.summary;
        if (!result) {
          const prepared = prepareBranchEntries(collected.entries, 100000);
          const custom = response.customInstructions ?? customInstructions;
          const instructions = (response.replaceInstructions ?? replaceInstructions) && custom ? custom : BRANCH_SUMMARY_PROMPT + (custom ? '\n\nAdditional focus: ' + custom : '');
          const files = computeFileLists(prepared.fileOps);
          result = { summary: BRANCH_SUMMARY_PREAMBLE + await summarize(agent, prepared.messages, instructions, signal) + formatFileOperations(files.readFiles, files.modifiedFiles), details: files };
        }
        if (!validText(result.summary)) throw Error('Pi 分支摘要无效');
        summaryEntry = { type: 'branch_summary', id: randomUUID(), parentId: newLeafId, timestamp: new Date().toISOString(),
          fromId: h.leafId, summary: result.summary, ...(result.details === undefined ? {} : { details: result.details }), ...(result.usage === undefined ? {} : { usage: result.usage }), fromHook: Boolean(response.summary) };
      }
      signal.throwIfAborted(); assertCurrent(agent, state); if (agent.session.seq !== baseHead) throw conflict();
      // One authoritative record includes the selected leaf and summary. A
      // reader cannot observe the switch without the accepted summary.
      const data = { leafId: newLeafId, ...(summaryEntry ? { summaryEntry } : {}),
        ...(response.label ?? label ? { labelTarget: summaryEntry?.id ?? targetId, label: response.label ?? label } : {}) };
      const request = { messages: agent.session.deriveMessages(), tools: ctx.tools.schemas(agent), toolHistory: agent.session.toolHistory() };
      await projectBoundaryRequest(request, [...agent.session.snapshotEvents(), { type: treeRecord, data, seq: baseHead + 1, time: Date.now() }], adapters(signal));
      signal.throwIfAborted(); assertCurrent(agent, state); if (agent.session.seq !== baseHead) throw conflict();
      appendPluginRecord(agent.session, treeRecord, data);
      await ctx.sessions.flush(agent.session);
      const result = { cancelled: false, oldLeafId: h.leafId, newLeafId: summaryEntry?.id ?? newLeafId, summaryEntry,
        ...(editorText === undefined ? {} : { editorText }), ...(summaryEntry ? { fromExtension: Boolean(response.summary) } : {}) };
      await notify(agent, state, 'session_tree', result, signal);
      return result;
    }, request.head, inCallback);
  }
  async function compact(agent, request = {}, signal, inCallback = false) {
    const reason = request.reason ?? 'manual', willRetry = reason === 'overflow'; let fromExtension = false;
    if (!['manual', 'threshold', 'overflow'].includes(reason) || request.customInstructions !== undefined && !validText(request.customInstructions, 16000)) throw Error('Pi 压缩参数无效');
    return operate(agent, signal, async (state, signal) => {
      try {
        const h = await history(agent, signal), baseHead = agent.session.seq;
        const configured = await ctx.get('omaaPiResources').compactionSettings(agent, signal);
        if (reason !== 'manual' && !configured.enabled) return null;
        const preparation = prepareCompaction(h.branch, { ...configured, keepRecentTokens: reason === 'threshold' ? configured.keepRecentTokens : 0 });
        if (!preparation) return null;
        const result = await event(agent, state, 'session_before_compact', { preparation: { ...preparation, fileOps: Object.fromEntries(Object.entries(preparation.fileOps).map(([key, set]) => [key, [...set]])) }, branchEntries: h.branch,
          customInstructions: request.customInstructions, reason, willRetry }, signal);
        if (result.cancel) throw Object.assign(Error('Pi 压缩已由扩展取消'), { name: 'AbortError' });
        let compact = result.compaction; fromExtension = Boolean(compact);
        if (!compact) {
          const focus = request.customInstructions ? '\n\nAdditional focus: ' + request.customInstructions : '';
          let summary = preparation.previousSummary ?? 'No prior history.';
          if (preparation.messagesToSummarize.length) summary = await summarize(agent, preparation.messagesToSummarize,
            (preparation.previousSummary ? `Previous summary:\n${preparation.previousSummary}\n\n${UPDATE_SUMMARIZATION_PROMPT}` : SUMMARIZATION_PROMPT) + focus, signal);
          if (preparation.turnPrefixMessages.length) summary += '\n\n---\n\n**Turn Context (split turn):**\n\n'
            + await summarize(agent, preparation.turnPrefixMessages, TURN_PREFIX_SUMMARIZATION_PROMPT + focus, signal);
          const files = computeFileLists(preparation.fileOps);
          compact = { summary: summary + formatFileOperations(files.readFiles, files.modifiedFiles), firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore, details: files };
        }
        if (!validText(compact.summary) || !h.branch.some(entry => entry.id === compact.firstKeptEntryId)
          || !Number.isFinite(compact.tokensBefore) || compact.tokensBefore < 0) throw Error('Pi 扩展压缩结果无效');
        const final = await preview(agent, state, [{ type: 'compaction', ...compact }], 'session_before_compact', signal);
        const entry = final.prepared.additions[0]; entry.fromHook = fromExtension; entry.tokensBefore = compact.tokensBefore;
        signal.throwIfAborted(); assertCurrent(agent, state); if (agent.session.seq !== baseHead) throw conflict();
        commitBoundary(agent.session, final.prepared, 'session_before_compact');
        await ctx.sessions.flush(agent.session);
        await notify(agent, state, 'session_compact', { compactionEntry: entry, fromExtension, reason, willRetry }, signal);
        return { ...compact, estimatedTokensAfter: final.projection.messages.reduce((sum, message) => sum + estimateTokens(message), 0), entryId: entry.id };
      } catch (error) {
        if (!signal.aborted) await notify(agent, state, 'session_compact_failed', { reason, willRetry, fromExtension,
          aborted: error.name === 'AbortError', errorMessage: error.message }, signal);
        throw error;
      }
    }, request.head, inCallback);
  }
  // These hooks replace only Pi's native compaction backend. They use Pi's
  // effective projection, including boundary edits, instead of pricing old raw history.
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    if (ctx.omaa.product(agent.session)?.id === 'pi' && !active.has(agent.id)) {
      const state = await ensure(agent, signal), view = await preview(agent, state, [], 'compaction', signal);
      const tokens = view.projection.messages.reduce((sum, message) => sum + estimateTokens(message), 0);
      const info = await ctx.llm.resolveModelInfo(agent.options.provider, agent.options.model, signal);
      const configured = await ctx.get('omaaPiResources').compactionSettings(agent, signal);
      if (configured.enabled && info.context?.contextWindow && tokens > info.context.contextWindow - Math.max(configured.reserveTokens, agent.options.maxTokens ?? info.defaultMaxTokens ?? 0))
        try { await compact(agent, { reason: 'threshold' }, signal, true); }
        catch (error) { signal.throwIfAborted(); ctx.logger.warn('Pi auto-compaction: ' + error.message); }
    }
    return next();
  });
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    if (ctx.omaa.product(agent.session)?.id !== 'pi' || failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || overflow.has(agent) || signal.aborted) return next();
    overflow.add(agent);
    try { if (await compact(agent, { reason: 'overflow' }, signal, true)) return { kind: 'retry' }; }
    catch (error) { signal.throwIfAborted(); ctx.logger.warn('Pi overflow compaction: ' + error.message); }
    return next();
  });
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') overflow.delete(agent); });
  ctx.on('session/event', (session, event) => { if (event.type === 'assistant/message') { const agent = ctx.get('agents')?.get(session.id); if (agent) overflow.delete(agent); } });
  return { inspect, navigate, compact, busy: agent => active.has(agent.id) };
}
