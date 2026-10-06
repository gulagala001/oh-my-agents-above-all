import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { startGuest } from './extensions/transport.mjs';
import { promptFrameText, renderPromptFrame } from './extension-prompt.mjs';

export const name = 'omaa-pi-extensions';
export const inject = ['omaa', 'tools', 'commands', 'fs', 'sandboxPolicy', 'sandbox', 'subprocess'];
const supportedEvents = new Set(['session_start', 'session_shutdown', 'input', 'before_agent_start', 'agent_start', 'turn_start', 'agent_end', 'tool_call', 'tool_result']);
const textOf = blocks => (blocks ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const json = value => JSON.parse(JSON.stringify(value));
const catalogEdits = (before, after) => ({
  changed: Object.fromEntries(Object.entries(after).filter(([name, value]) => !isDeepStrictEqual(value, before[name]))),
  removed: Object.keys(before).filter(name => !Object.hasOwn(after, name)),
});
const applyCatalogEdits = (fresh, edits) => {
  const value = { ...fresh, ...edits?.changed };
  for (const name of edits?.removed ?? []) delete value[name];
  return value;
};
const delegation = new Set(['workflow', 'subagent', 'send_message', 'interrupt_agent', 'list_agents', 'job_list', 'job_output', 'job_kill']);
const enhanced = name => delegation.has(name) || name === 'codegraph_index' || name.startsWith('mcp__codegraph__') || ['computer_use', 'computer_use_reset'].includes(name);

function piArguments(exec) {
  const input = json(exec.arguments);
  if (['read', 'write', 'edit', 'read_image'].includes(exec.name) && input.file_path !== undefined) { input.path = input.file_path; delete input.file_path; }
  if (exec.name === 'edit' && input.old_string !== undefined) {
    input.edits = [{ oldText: input.old_string, newText: input.new_string }]; delete input.old_string; delete input.new_string;
  }
  return input;
}
function nativeArguments(name, input) {
  const args = json(input);
  if (['read', 'write', 'edit', 'read_image'].includes(name) && args.path !== undefined) { args.file_path = args.path; delete args.path; }
  if (name === 'edit' && args.edits) {
    if (!Array.isArray(args.edits) || args.edits.length !== 1) throw Error('当前 DSH edit 接口仅支持一次精确替换');
    args.old_string = args.edits[0].oldText; args.new_string = args.edits[0].newText; delete args.edits;
  }
  return args;
}
function content(blocks) {
  if (!Array.isArray(blocks) || blocks.some(p => p?.type === 'text' ? typeof p.text !== 'string' : p?.type !== 'image' || !p.attachment)) throw Error('Pi 扩展结果须为文字或已入账的原生图片');
  return blocks.map(p => p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', attachment: p.attachment });
}
function nativeBranch(agent) {
  const entries = [], calls = new Map();
  for (const event of agent.session.snapshotEvents()) {
    let message;
    if (event.type === 'tool/call') { calls.set(event.data.callId, event.data.name); continue; }
    const sourceMessage = event.data.message ?? event.data;
    if (event.type === 'user/message') message = sourceMessage.source?.kind === 'pi-extension'
      ? { role: 'custom', content: sourceMessage.content ?? [], customType: sourceMessage.source.customType,
        display: sourceMessage.source.display, details: sourceMessage.source.details, timestamp: sourceMessage.source.timestamp }
      : { role: 'user', content: sourceMessage.content ?? [] };
    else if (event.type === 'assistant/message') message = { role: 'assistant', content: (sourceMessage.content ?? []).filter(p => p.type !== 'reasoning') };
    else if (event.type === 'tool/result') message = { role: 'toolResult', toolCallId: sourceMessage.toolCallId,
      toolName: event.data.name ?? calls.get(sourceMessage.toolCallId), content: sourceMessage.content ?? [], isError: Boolean(sourceMessage.isError), details: event.data.meta?.piExtension?.details ?? {} };
    if (message) entries.push({ type: 'message', id: String(event.seq), parentId: entries.at(-1)?.id ?? null, timestamp: new Date(event.time ?? 0).toISOString(), message });
  }
  // A bounded read-only projection, never another session manager/journal.
  return entries.slice(-100).map(entry => ({ ...entry, message: { ...entry.message, content: entry.message.content.filter(p => p.type === 'text').map(p => ({ ...p, text: p.text.slice(0, 4000) })) } }));
}

export function apply(ctx) {
  const settings = ctx.omaa.piExtensions, states = new Map();
  // Registry service access can return a traced Agent face. Resolve journal
  // observations by the stable native session identity, not proxy identity.
  const sessionState = session => [...states].find(([agent]) => agent.session.id === session.id) ?? [];
  const owns = agent => ctx.omaa.product(agent.session)?.id === 'pi' && agent.session.header.origin !== 'subagent';
  const visible = (agent, state) => ctx.tools.schemas(agent).filter(tool => (!enhanced(tool.name) || ctx.omaa.enhancementEnabled(agent.session)) && (!state.active || state.active.has(tool.name)));
  const snapshot = (agent, state) => {
    const tools = visible(agent, state), branch = nativeBranch(agent);
    const model = typeof agent.options?.model === 'string' ? { id: agent.options.model, provider: agent.options.provider } : undefined;
    return { cwd: agent.session.header.cwd, mode: 'rpc', hasUI: Boolean(ctx.get('userQuestions')),
      isIdle: agent.status === 'idle' && !state.lifecycleRun?.ending, hasPendingMessages: Boolean(agent.inbox.nextTurn.length || agent.inbox.nextStep.length),
      sessionId: agent.session.id, sessionHeader: { ...agent.session.header }, sessionBranch: branch, sessionEntries: branch,
      activeTools: tools.map(t => t.name), allTools: ctx.tools.schemas(agent).map(t => ({ ...t, label: t.name })),
      commands: ctx.commands.list(agent).map(c => ({ name: c.name, description: c.description ?? '' })), flags: {},
      systemPrompt: state.prompt ?? '', ...(model ? { model } : {}) };
  };
  const currentPolicy = agent => ctx.sandboxPolicy.resolve({ session: agent.session });
  const assertPolicy = (agent, state) => {
    if (JSON.stringify(currentPolicy(agent)) !== state.policyKey) throw Error('会话权限已变化，扩展须在新权限下重新加载');
  };
  const piContent = async (blocks, signal) => Promise.all(blocks.map(async part => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type !== 'image') throw Error('该原生内容类型没有 Pi 工具结果表示');
    const image = await ctx.get('attachments')?.readImage(part.attachment, signal);
    if (!image) throw Error('宿主图片服务不可用');
    return { type: 'image', data: Buffer.from(image.data).toString('base64'), mimeType: image.ref.mediaType };
  }));
  async function admitContent(blocks, signal) {
    if (!Array.isArray(blocks) || blocks.some(p => p?.type === 'text' ? typeof p.text !== 'string' : p?.type !== 'image' || typeof p.data !== 'string' || typeof p.mimeType !== 'string')) throw Error('Pi content 必须是 text 或含 data/mimeType 的 image');
    signal?.throwIfAborted();
    if (blocks.every(p => p.type === 'text')) return content(blocks);
    const store = ctx.get('attachments'); if (!store) throw Error('宿主图片服务不可用');
    const result = await store.admitPromptContent(blocks.map(p => p.type === 'text' ? p : { type: 'image', mediaType: p.mimeType, data: p.data }));
    signal?.throwIfAborted(); return result;
  }
  async function api(method, args, context, signal) {
    if (!context?.agent) throw Error('扩展 API 需要当前原生调用上下文');
    const { agent, state, exec } = context; signal.throwIfAborted(); assertPolicy(agent, state);
    if (context.eventName === 'agent_end' && state.lifecycleRun?.endReason?.kind === 'aborted'
      && ['exec', 'executeTool', 'sendUserMessage', 'ui.select', 'ui.confirm', 'ui.input'].includes(method)) throw Error('原生活动已取消，结束通知不能继续执行或唤醒任务');
    if (Array.isArray(args)) {
      const fields = { 'ui.notify': ['text', 'type'], 'ui.select': ['title', 'options', 'dialogOptions'], 'ui.confirm': ['title', 'message', 'dialogOptions'], 'ui.input': ['title', 'placeholder', 'dialogOptions'],
        sendUserMessage: ['content', 'options'], exec: ['command', 'args', 'options'], executeTool: ['name', 'args', 'options'], setActiveTools: ['names'], syncRegistrations: ['descriptors'] }[method];
      if (!fields) throw Error('未支持 Pi API 参数: ' + method);
      args = Object.fromEntries(fields.map((key, i) => [key, args[i]]));
    }
    if (method === 'syncRegistrations') {
      if (state.status !== 'ready' || state.disposal && context.eventName !== 'session_shutdown') throw Error('扩展注册仅可在当前已加载的回调中更改');
      syncRegistrations(agent, state, args.descriptors);
      const { allTools, activeTools, commands } = snapshot(agent, state);
      return { allTools, activeTools, commands };
    }
    if (method === 'ui.notify') { settings.notify(agent, args.text ?? args.message, args.type); return; }
    if (['ui.select', 'ui.confirm', 'ui.input'].includes(method)) {
      const questions = ctx.get('userQuestions'); if (!questions) throw Error('宿主问答不可用');
      const timeout = args.dialogOptions?.timeout;
      if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)) throw Error('Pi 对话框 timeout 无效');
      const deadline = timeout === undefined ? undefined : AbortSignal.timeout(timeout);
      const dialogSignal = deadline ? AbortSignal.any([signal, deadline]) : signal;
      const id = randomUUID();
      const options = method === 'ui.select' ? args.options.map(label => ({ label })) : method === 'ui.confirm' ? [{ label: 'Yes' }, { label: 'No' }] : undefined;
      let result;
      try { result = await questions.ask({ agent, signal: dialogSignal, questions: [{ id, question: args.title, ...(args.message || args.placeholder ? { detail: args.message ?? args.placeholder } : {}), ...(options ? { options } : {}) }] }); }
      catch (error) { if (deadline?.aborted && !signal.aborted) return method === 'ui.confirm' ? false : undefined; throw error; }
      const answer = result.answers.find(a => a.id === id); if (!answer) return undefined;
      if (method === 'ui.confirm') return answer.selected.includes('Yes');
      return answer.custom ?? answer.selected[0];
    }
    if (method === 'sendUserMessage') {
      const options = args.options ?? {};
      if (options.expandPromptTemplates !== undefined && typeof options.expandPromptTemplates !== 'boolean') throw Error('Pi expandPromptTemplates 必须为布尔值');
      if (options.deliverAs !== undefined && !['steer', 'followUp'].includes(options.deliverAs)) throw Error('无效的 Pi 输入投递方式');
      const blocks = typeof args.content === 'string' ? [{ type: 'text', text: args.content }] : await admitContent(args.content, signal);
      const streaming = agent.status === 'running' || Boolean(state.lifecycleRun?.ending);
      const input = { source: 'extension', expandPromptTemplates: options.expandPromptTemplates ?? false,
        streaming, ...(streaming ? { streamingBehavior: options.deliverAs ?? 'followUp' } : {}) };
      const message = createUserMessage({ content: blocks, source: { kind: 'user', pi: { input } } });
      state.inputOrigins.set(message.id, input);
      if (options.deliverAs === 'steer') agent.steer(message);
      else if (!options.deliverAs || options.deliverAs === 'followUp') agent.followup(message);
      else throw Error('无效的 Pi 输入投递方式');
      return;
    }
    if (method === 'setActiveTools') {
      if (!Array.isArray(args.names) || args.names.some(n => typeof n !== 'string')) throw Error('工具名单无效');
      const known = new Set(ctx.tools.schemas(agent).map(t => t.name)); state.active = new Set(args.names.filter(n => known.has(n))); return;
    }
    if (method === 'executeTool') {
      if (!exec) throw Error('executeTool 仅能在原生工具回调内调用');
      const result = await ctx.tools.execute({ name: args.name, arguments: nativeArguments(args.name, args.args), agent,
        callId: exec.callId + '/' + (++state.nestedCalls), rootCallId: exec.rootCallId ?? exec.callId, parent: exec.token, signal });
      for (const extra of result.additionalContexts ?? []) exec.deferContext(extra);
      if (result.concludesTurn) exec.concludeTurn();
      return { content: await piContent(result.content, signal), details: result.meta?.piExtension?.details ?? {}, isError: result.isError, ...(!result.isError ? { structuredContent: result.value } : {}) };
    }
    if (method === 'exec') {
      const command = args.command, commandArgs = args.args ?? [], options = args.options ?? {};
      if (typeof command !== 'string' || !command || !Array.isArray(commandArgs) || commandArgs.some(v => typeof v !== 'string')) throw Error('exec 需要程序与字符串参数');
      if (options.cwd !== undefined && options.cwd !== agent.session.header.cwd) throw Error('扩展 exec 的工作目录由当前会话固定');
      const ms = options.timeout ?? 120000; if (!Number.isFinite(ms) || ms <= 0 || ms > 3600000) throw Error('exec timeout 无效');
      const fused = AbortSignal.any([signal, AbortSignal.timeout(ms)]), program = await ctx.subprocess.resolveExecutable(command, undefined, fused);
      const policy = currentPolicy(agent), argv = [program, ...commandArgs];
      const confined = policy.mode === 'danger-full-access' ? { argv } : await ctx.sandbox.confine(argv, policy, fused);
      assertPolicy(agent, state);
      const child = ctx.subprocess.spawn({ argv: confined.argv, cwd: agent.session.header.cwd, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal: fused });
      child.stdin?.on('error', () => {}); child.stdin?.end(options.input);
      const collect = async stream => { let total = 0; const chunks = []; for await (const chunk of stream) { total += chunk.length; if (total > 256 * 1024) { child.terminate(); throw Error('扩展 exec 输出超过 256 KiB'); } chunks.push(chunk); } return Buffer.concat(chunks).toString('utf8'); };
      try { const [result, stdout, stderr] = await Promise.all([child.done, collect(child.stdout), collect(child.stderr)]); return { stdout, stderr, code: result.exitCode ?? 1, killed: Boolean(result.signal || fused.aborted) }; }
      finally { child.terminate(); if (!await child.waitForExit(AbortSignal.timeout(5000))) throw Error('扩展 exec 进程未完成退出'); }
    }
    throw Error('尚未适配 Pi API: ' + method);
  }
  function toolRegistration(agent, state, tool) {
    return agent.ctx.get('tools').register({ name: tool.name, description: tool.description, parameters: tool.parameters,
      output: { schema: { type: 'object', properties: { content: { type: 'array', items: { type: 'object' } }, details: {}, structuredContent: tool.outputSchema ?? {} }, required: ['content', ...(tool.outputSchema ? ['structuredContent'] : [])], additionalProperties: false },
        render: (_args, value) => content(value.content), presentationMeta: (_args, value) => ({ piExtension: { details: value.details ?? {}, toolName: tool.name } }) },
      async execute(params, exec) {
        assertPolicy(agent, state);
        // A native invocation may already have captured this definition when a
        // later callback replaces it. Keep its original guest callback ID.
        const value = await invoke(agent, state, { kind: 'tool', callbackId: tool.callbackId, callId: exec.callId, params }, exec.signal, exec);
        if (value.isError) throw Error(textOf(value.content) || 'Pi extension tool failed');
        const admitted = await admitContent(value.content, exec.signal);
        return { content: admitted, ...(value.details !== undefined ? { details: value.details } : {}), ...(value.structuredContent !== undefined ? { structuredContent: value.structuredContent } : {}) };
      } });
  }
  function commandRegistration(agent, state, command) {
    return agent.ctx.get('commands').register({ name: command.name, description: command.description,
      async handler(input) {
        await ensure(agent, input.signal);
        const callbackId = state.descriptors?.commands.find(c => c.name === command.name)?.callbackId;
        if (!callbackId) throw Error('Pi 扩展命令已移除，请刷新');
        await invoke(agent, state, { kind: 'command', callbackId, args: input.rawInput.trimStart() }, input.signal);
        return { kind: 'success', text: '/' + command.name };
      } });
  }
  function syncRegistrations(agent, state, descriptors) {
    if (!descriptors || !Array.isArray(descriptors.tools) || !Array.isArray(descriptors.commands) || !Array.isArray(descriptors.events) || descriptors.tools.length > 128 || descriptors.commands.length > 128 || descriptors.events.some(e => !supportedEvents.has(e))) throw Error('扩展注册内容包含未支持的接口或超过上限');
    const names = new Set(), commandNames = new Set();
    for (const tool of descriptors.tools) {
      if (!tool || typeof tool.name !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(tool.name) || names.has(tool.name) || !state.toolRegistrations.has(tool.name) && ctx.tools.get(tool.name, agent)) throw Error('扩展工具名称无效、重复或与原生工具冲突: ' + tool?.name);
      if (typeof tool.callbackId !== 'string' || !tool.callbackId || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) throw Error('Pi 扩展工具定义无效: ' + tool.name);
      if (tool.prepareArguments || tool.prepareLoadout || tool.exposure && !['direct', 'model-only'].includes(tool.exposure)) throw Error('尚未适配扩展工具的 prepare/exposure 接口');
      if (tool.constrainedSampling !== undefined || tool.renderShell !== undefined) throw Error('尚未适配扩展工具的 constrainedSampling/renderShell 接口');
      if (tool.promptSnippet !== undefined && typeof tool.promptSnippet !== 'string' || tool.promptGuidelines !== undefined && (!Array.isArray(tool.promptGuidelines) || tool.promptGuidelines.length > 64 || tool.promptGuidelines.some(rule => typeof rule !== 'string'))) throw Error('Pi 扩展工具的 promptSnippet/promptGuidelines 无效');
      names.add(tool.name);
    }
    const nativeCommands = new Set(ctx.commands.list(agent).map(c => c.name));
    for (const command of descriptors.commands) {
      if (!command || typeof command.name !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(command.name) || commandNames.has(command.name) || !state.commandRegistrations.has(command.name) && nativeCommands.has(command.name)) throw Error('扩展命令名称无效、重复或与原生命令冲突: ' + command?.name);
      if (typeof command.callbackId !== 'string' || !command.callbackId || typeof command.description !== 'string' || !command.description.trim()) throw Error('Pi 扩展命令定义无效: ' + command.name);
      commandNames.add(command.name);
    }
    const changes = [], additions = [];
    for (const [kind, registry, definitions] of [['tool', state.toolRegistrations, descriptors.tools], ['command', state.commandRegistrations, descriptors.commands]]) {
      const next = new Map(definitions.map(d => [d.name, d]));
      for (const [name, registration] of registry) if (!isDeepStrictEqual(registration.descriptor, next.get(name))) changes.push({ kind, registry, name, registration });
      for (const descriptor of definitions) if (!isDeepStrictEqual(registry.get(descriptor.name)?.descriptor, descriptor)) additions.push({ kind, registry, descriptor });
    }
    const register = (kind, definition) => kind === 'tool' ? toolRegistration(agent, state, definition) : commandRegistration(agent, state, definition);
    const installed = [];
    // Native scoped registries forbid same-name duplicates. Replace in one
    // synchronous transaction, without yielding a partly changed registry.
    try {
      for (const change of changes) change.registration.dispose();
      for (const addition of additions) installed.push({ ...addition, dispose: register(addition.kind, addition.descriptor) });
    } catch (error) {
      for (const item of installed.reverse()) item.dispose();
      for (const change of changes) change.registration.dispose = register(change.kind, change.registration.descriptor);
      throw error;
    }
    const previouslyActivated = new Set((state.descriptors?.tools ?? []).filter(t => t.defaultActive !== false).map(t => t.name));
    for (const change of changes) change.registry.delete(change.name);
    for (const item of installed) item.registry.set(item.descriptor.name, { descriptor: item.descriptor, dispose: item.dispose });
    const known = new Set(ctx.tools.schemas(agent).map(t => t.name));
    if (state.active) {
      state.active = new Set([...state.active].filter(name => known.has(name)));
      for (const tool of descriptors.tools) if (tool.defaultActive !== false && !previouslyActivated.has(tool.name)) state.active.add(tool.name);
    } else if (descriptors.tools.some(t => t.defaultActive === false)) {
      const inactive = new Set(descriptors.tools.filter(t => t.defaultActive === false).map(t => t.name));
      state.active = new Set([...known].filter(name => !inactive.has(name)));
    }
    state.descriptors = descriptors; state.events = new Set(descriptors.events);
  }
  function makeState(agent) {
    const previous = agent.session.snapshotEvents().findLast(event => event.type === 'user/message' && event.data.source?.pi?.runPrompt)?.data.source.pi.runPrompt;
    const state = { status: 'disabled', nestedCalls: 0, calls: 0, inputOrigins: new Map(), toolRegistrations: new Map(), commandRegistrations: new Map(), events: new Set(), guest: null, key: null, policyKey: null,
      forceAdmitted: previous?.force === true,
      busy: () => Boolean(state.loading || state.calls || state.disposal || state.lifecycleRun?.ending),
      view: () => ({ status: state.status, ...(state.error ? { error: state.error } : {}), tools: state.descriptors?.tools.map(t => t.name) ?? [], commands: state.descriptors?.commands.map(c => c.name) ?? [] }),
      async dispose({ shutdown = true } = {}) {
        if (state.disposal) return state.disposal;
        const disposal = Promise.withResolvers(); state.disposal = disposal.promise;
        void (async () => {
        const guest = state.guest;
        if (shutdown && guest && !guest.stopped && state.status === 'ready' && state.events.has('session_shutdown')) {
          try { const response = await guest.call({ type: 'invoke', kind: 'event', eventName: 'session_shutdown', event: { type: 'session_shutdown' }, snapshot: snapshot(agent, state) },
            { context: { agent, state, eventName: 'session_shutdown' }, signal: AbortSignal.timeout(2000), timeoutMs: 2000 });
            for (const error of response?.errors ?? []) ctx.logger.warn('Pi extension shutdown: ' + error.error); }
          catch (error) { ctx.logger.warn('Pi extension shutdown: ' + error.message); }
        }
        for (const registry of [state.toolRegistrations, state.commandRegistrations]) { for (const entry of registry.values()) entry.dispose(); registry.clear(); }
        state.guest = null; state.key = null; state.active = null; state.events.clear(); state.descriptors = null; state.status = 'disabled';
        state.runStarted = false; state.runOptions = undefined; state.runCatalogEdits = undefined; state.inputOrigins.clear();
        state.lifecycleRun = undefined; state.lifecycleCompletion = undefined;
        if (guest) await guest.close();
        })().then(disposal.resolve, disposal.reject);
        try { await disposal.promise; } finally { state.disposal = null; }
      },
    };
    states.set(agent, state); settings.states.set(agent.id, state); return state;
  }
  async function ensure(agent, signal) {
    let state = states.get(agent) ?? makeState(agent);
    if (state.disposal) await state.disposal;
    if (state.loading) { await state.loading; return state; }
    const policy = currentPolicy(agent), configured = settings.settings.read();
    const versions = [];
    for (const file of configured.files) {
      const target = await ctx.fs.resolve(file, { signal }), stat = await ctx.fs.stat(target, signal);
      if (!stat || stat.type !== 'file' || stat.size > 256 * 1024) throw Error('Pi 扩展文件不存在或超过 256 KiB: ' + file);
      versions.push(stat.version);
    }
    const policyKey = JSON.stringify(policy), key = JSON.stringify([configured, policyKey, versions]);
    if (key === state.key && !state.guest?.stopped) return state;
    const load = async () => {
      await state.dispose(); state.key = key; state.policyKey = policyKey; delete state.error;
      if (!configured.files.length) return;
      state.status = 'loading';
      try {
        state.guest = await startGuest({ subprocess: ctx.subprocess, sandbox: ctx.sandbox, policy, cwd: agent.session.header.cwd, signal, api });
        const descriptors = await state.guest.call({ type: 'load', files: configured.files, snapshot: snapshot(agent, state) }, { signal, timeoutMs: 30000 });
        syncRegistrations(agent, state, descriptors);
        state.status = 'ready';
        await notifyEvent(agent, state, 'session_start', {}, signal);
      } catch (error) { await state.dispose(); state.status = 'error'; state.error = error.message; settings.notify(agent, 'Pi 扩展加载失败：' + error.message, 'error'); throw error; }
    };
    state.loading = load();
    try { await state.loading; return state; } finally { state.loading = null; }
  }
  async function invoke(agent, state, call, signal, exec) {
    if (!state.guest || state.guest.stopped) throw Error('Pi 扩展进程未运行');
    assertPolicy(agent, state);
    state.calls++;
    try { return await state.guest.call({ type: 'invoke', ...call, snapshot: snapshot(agent, state) }, { context: { agent, state, exec, eventName: call.eventName }, signal }); }
    finally { state.calls--; }
  }
  async function notifyEvent(agent, state, eventName, event, signal) {
    if (!state.events.has(eventName)) return;
    const response = await invoke(agent, state, { kind: 'event', eventName, event: { type: eventName, ...event },
      ...(eventName === 'agent_end' && state.lifecycleRun?.endReason?.kind === 'aborted' ? { callbackAbortReason: state.lifecycleRun.endReason.reason } : {}) }, signal);
    for (const error of response?.errors ?? []) settings.notify(agent, 'Pi 扩展 ' + eventName + '：' + error.error, 'error');
  }
  async function runMessages(agent, run, signal) {
    const calls = new Map(), messages = [];
    for (const event of agent.session.snapshotEvents(run.firstSeq + 1)) {
      if (event.seq > run.endSeq) break;
      if (event.type === 'tool/call') { calls.set(event.data.callId, event.data.name); continue; }
      if (event.surfaceOp !== 'append' || !['user/message', 'assistant/message', 'tool/result'].includes(event.type)) continue;
      const source = event.data.message ?? event.data;
      const blocks = [];
      for (const part of source.content ?? []) {
        if (part.type === 'text' || part.type === 'image') blocks.push(...(await piContent([part], signal)).map(value => ({ ...part, ...value })));
        else if (part.type === 'reasoning') blocks.push({ ...part, type: 'thinking', thinking: part.text });
        else if (part.type === 'tool-call') {
          let argumentsValue = part.arguments;
          try { argumentsValue = JSON.parse(argumentsValue); } catch {}
          if (argumentsValue && typeof argumentsValue === 'object' && !Array.isArray(argumentsValue)) argumentsValue = piArguments({ name: part.name, arguments: argumentsValue });
          blocks.push({ ...part, type: 'toolCall', arguments: argumentsValue });
        } else blocks.push(json(part)); // Preserve native-only attachments/blocks.
      }
      const timestamp = event.time;
      if (event.type === 'user/message') messages.push(source.source?.kind === 'pi-extension'
        ? { role: 'custom', customType: source.source.customType, display: source.source.display, details: source.source.details, content: blocks, timestamp: source.source.timestamp ?? timestamp }
        : { role: 'user', content: blocks, timestamp });
      else if (event.type === 'tool/result') messages.push({ role: 'toolResult', toolCallId: source.toolCallId,
        toolName: event.data.name ?? calls.get(source.toolCallId), content: blocks, isError: Boolean(source.isError),
        details: event.data.meta?.piExtension?.details ?? {}, timestamp });
      else {
        const response = source.source?.replayState?.response;
        const finish = event.data.stream?.findLast(item => item.chunk?.type === 'finish')?.chunk.reason;
        const usage = event.data.usage;
        messages.push({ role: 'assistant', content: blocks, timestamp,
          api: response?.kind === 'pi-ai' ? response.api : 'dsh', provider: source.source?.provider, model: source.source?.model,
          stopReason: response?.kind === 'pi-ai' ? response.stopReason : ({ 'tool-calls': 'toolUse', 'max-tokens': 'length', error: 'error', aborted: 'aborted', completed: 'stop' })[finish?.kind],
          ...(usage ? { usage: { ...usage, input: usage.inputTokens, output: usage.outputTokens, totalTokens: usage.totalTokens } } : {}) });
      }
    }
    return messages;
  }
  const clearRunPrompt = state => { state.runStarted = false; state.runOptions = undefined; state.runCatalogEdits = undefined; };
  async function beginLifecycle(agent, state, signal) {
    const run = state.lifecycleRun ??= { firstSeq: state.pendingLifecycleSeq ?? -1, turnIndex: 0, lastStep: null };
    if (!run.started) { run.started = true; await notifyEvent(agent, state, 'agent_start', {}, signal); }
    return run;
  }
  async function beginTurn(agent, state, turn, step, signal) {
    const run = await beginLifecycle(agent, state, signal), key = turn + ':' + step;
    run.activitySignal = signal;
    if (key !== run.lastStep) {
      run.lastStep = key;
      await notifyEvent(agent, state, 'turn_start', { turnIndex: run.turnIndex++, timestamp: Date.now() }, signal);
    }
  }
  async function finishLifecycle(agent, state, signal) {
    const run = state.lifecycleRun;
    if (!run?.ending) return;
    try { await notifyEvent(agent, state, 'agent_end', { messages: await runMessages(agent, run, signal) }, signal); }
    finally {
      if (state.lifecycleRun === run) {
        state.lifecycleRun = undefined;
        // Messages supplied by an end callback continue the accepted activity's
        // prompt. A quiet end releases its override for the next human input.
        if (!agent.inbox.nextTurn.length && !agent.inbox.nextStep.length) clearRunPrompt(state);
      }
    }
  }
  ctx.on('agent/request', async (info, next) => {
    if (!owns(info.agent)) return next();
    const state = states.get(info.agent);
    if (!state?.guest || state.guest.stopped) return next();
    if (state.lifecycleCompletion) await state.lifecycleCompletion;
    if (state.lifecycleRun?.ending) await finishLifecycle(info.agent, state, info.signal);
    await beginTurn(info.agent, state, info.turn, info.step, info.signal);
    return next();
  });
  const controller = {
    inputMetadata: (agent, id) => states.get(agent)?.inputOrigins.get(id),
    promptTools(agent) {
      const state = states.get(agent), allowed = new Set(visible(agent, state ?? {}).map(t => t.name));
      return state?.descriptors?.tools.filter(t => allowed.has(t.name)) ?? [];
    },
    async input(agent, messages, signal) {
      if (!owns(agent)) return messages;
      const state = await ensure(agent, signal);
      if (!state.events.has('input')) { for (const message of messages) state.inputOrigins.delete(message.id); return messages; }
      const result = [];
      for (const message of messages) {
        if (message.role !== 'user' || message.source?.kind !== 'user') { result.push(message); continue; }
        const original = textOf(message.content);
        const images = await piContent(message.content.filter(p => p.type === 'image'), signal);
        const origin = state.inputOrigins.get(message.id) ?? message.source?.pi?.input ?? { source: 'interactive' }; state.inputOrigins.delete(message.id);
        const { expandPromptTemplates: _expand, streaming: _streaming, ...eventOrigin } = origin;
        const response = state.events.has('input') ? await invoke(agent, state, { kind: 'event', eventName: 'input', event: { type: 'input', text: original, ...eventOrigin, ...(images.length ? { images } : {}) } }, signal) : undefined;
        for (const error of response?.errors ?? []) settings.notify(agent, 'Pi 扩展 input：' + error.error, 'error');
        if (response?.action === 'handled') continue;
        if (response?.action === 'transform') {
          if (typeof response.text !== 'string' || response.text.length > 256 * 1024) throw Error('Pi 输入转换文字无效');
          // Keep native image/file attachments, id, source and input boundary.
          const index = message.content.findIndex(p => p.type === 'text');
          const blocks = message.content.filter(p => p.type !== 'text');
          blocks.splice(index < 0 ? 0 : Math.min(index, blocks.length), 0, { type: 'text', text: response.text });
          const changedImages = response.images !== undefined && !isDeepStrictEqual(response.images, images);
          const rewritten = changedImages ? [...blocks.filter(p => p.type !== 'image'), ...await admitContent(response.images, signal)] : blocks;
          result.push({ ...message, content: rewritten });
        } else result.push(message);
      }
      return result;
    },
  };
  ctx.provide('omaaPiExtensions', controller);
  ctx.on('agent/created', async ({ agent, signal }) => { if (owns(agent)) await ensure(agent, signal); });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    if (!context.agent || !owns(context.agent)) return next();
    const state = await ensure(context.agent, context.signal);
    if (state.lifecycleCompletion) await state.lifecycleCompletion;
    if (state.lifecycleRun?.ending) await finishLifecycle(context.agent, state, context.signal);
    // A queued input can be handled without a provider request. Its current
    // native signal still owns cancellation until the activity becomes idle.
    if (context.signal && state.lifecycleRun) state.lifecycleRun.activitySignal = context.signal;
    const resources = ctx.get('omaaPiResources');
    const boundary = await resources.prepare(context.agent, context.signal, () => {
      state.prompt = promptFrameText(resources.frame(context.agent, _initial, visible(context.agent, state)));
    });
    // An end callback may keep a continuation prompt while maintenance parks
    // a newly typed human input. Its explicit new-run origin releases that
    // override before the next before_agent_start, even with other queued work.
    if (boundary.startsRun) clearRunPrompt(state);
    const assembly = await next();
    let frame = resources.frame(context.agent, assembly, visible(context.agent, state));
    state.prompt = promptFrameText(frame);
    if (!state.runStarted && boundary.users.length) {
      state.runStarted = true;
      if (boundary.startsRun && state.events.has('before_agent_start')) {
        const prompt = boundary.users.map(message => textOf(message.content)).join('\n');
        const images = await piContent(boundary.users.flatMap(message => message.content.filter(part => part.type === 'image')), context.signal);
        const response = await invoke(context.agent, state, { kind: 'event', eventName: 'before_agent_start',
          event: { type: 'before_agent_start', prompt, ...(images.length ? { images } : {}) }, promptFrame: frame }, context.signal);
        const options = response.systemPromptOptions;
        if (!Array.isArray(options.selectedTools) || options.selectedTools.some(name => typeof name !== 'string')) throw Error('Pi selectedTools 必须是工具名称列表');
        if (!isDeepStrictEqual(options.selectedTools, frame.options.selectedTools)) {
          const known = new Set(ctx.tools.schemas(context.agent).map(tool => tool.name));
          state.active = new Set(options.selectedTools.filter(name => known.has(name)));
        }
        state.runOptions = options;
        state.runCatalogEdits = { snippets: catalogEdits(frame.options.toolSnippets, options.toolSnippets),
          guidelines: catalogEdits(frame.options.toolGuidelines, options.toolGuidelines) };
        for (const error of response.errors ?? []) settings.notify(context.agent, 'Pi 扩展 before_agent_start：' + error.error, 'error');
        for (const message of response.messages ?? []) {
          if (typeof message.customType !== 'string' || typeof message.display !== 'boolean') throw Error('Pi 自定义消息需要 customType 和 display');
          const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : await admitContent(message.content ?? [], context.signal);
          boundary.customMessages.push(createUserMessage({ content: blocks,
            source: { kind: 'pi-extension', form: 'context', customType: message.customType, display: message.display,
              ...(message.details === undefined ? {} : { details: message.details }), timestamp: Date.now() } }));
        }
      }
    }
    frame = resources.frame(context.agent, assembly, visible(context.agent, state));
    if (state.runOptions) state.runOptions = { ...state.runOptions, selectedTools: frame.options.selectedTools,
      toolSnippets: applyCatalogEdits(frame.options.toolSnippets, state.runCatalogEdits?.snippets),
      toolGuidelines: applyCatalogEdits(frame.options.toolGuidelines, state.runCatalogEdits?.guidelines) };
    if (context.signal && (boundary.messages.length || state.lifecycleRun && state.nativeResponseHasTools && !boundary.handled)) {
      state.prompt = renderPromptFrame(frame, state.runOptions ?? frame.options).map(section => section.text).filter(Boolean).join('\n\n');
      await beginTurn(context.agent, state, state.nativeTurn, state.nativeNextStep, context.signal);
      // Startup callbacks can change the active registry before the first
      // request: rebuild from the host's current schemas and catalog.
      frame = resources.frame(context.agent, assembly, visible(context.agent, state));
      if (state.runOptions) state.runOptions = { ...state.runOptions, selectedTools: frame.options.selectedTools,
        toolSnippets: applyCatalogEdits(frame.options.toolSnippets, state.runCatalogEdits?.snippets),
        toolGuidelines: applyCatalogEdits(frame.options.toolGuidelines, state.runCatalogEdits?.guidelines) };
    }
    // A Pi run spans native tool steps and queued follow-up turns. The next
    // idle->prompt run starts from fresh resources, never the previous override.
    const sections = renderPromptFrame(frame, state.runOptions ?? frame.options);
    const force = state.runOptions?.forceSystemPrompt !== undefined;
    boundary.startsRequestSeries = force !== state.forceAdmitted || force && boundary.startsRun;
    if (boundary.users.length && (boundary.startsRun || boundary.startsRequestSeries)) boundary.messages = boundary.messages.map(message => message.source?.kind === 'user'
      ? { ...message, source: { ...message.source, pi: { ...message.source.pi, runPrompt: { force } } } } : message);
    state.pendingForce = force;
    state.prompt = sections.map(section => section.text).filter(Boolean).join('\n\n');
    return { ...assembly, tools: visible(context.agent, state), sections: sections.map((section, order) => ({ ...section, order, interpolate: false })) };
  });
  ctx.on('agent/status', ({ agent, status }) => {
    const state = states.get(agent);
    if (state && status === 'running') state.nativeNextStep = 1;
    if (!state || status !== 'idle') return;
    const run = state.lifecycleRun;
    if (!run || !state.events.has('agent_end')) { state.lifecycleRun = undefined; clearRunPrompt(state); return; }
    // Cancellation can land after the durable completed turn/end but before
    // this idle emit. The actual loop signal is authoritative in that window.
    if (run.activitySignal?.aborted) {
      const cause = run.activitySignal.reason;
      run.endReason = { kind: 'aborted', reason: { kind: cause.kind,
        ...(cause.kind === 'hook' ? { reason: cause.reason } : {}) } };
    }
    if (run.endReason?.kind === 'aborted' && run.endReason.reason?.kind === 'disposed') {
      state.lifecycleRun = undefined; clearRunPrompt(state); return;
    }
    run.ending = true; run.endSeq = run.terminalSeq ?? agent.session.snapshotEvents().at(-1)?.seq ?? run.firstSeq;
    // Idle is an emit observation. Reserve maintenance synchronously so native
    // whenIdle/teardown follows this asynchronous end callback and parks wakes.
    // If another idle listener already woke, the next assembly drains it.
    try {
      const completion = agent.runMaintenance(signal => finishLifecycle(agent, state, signal));
      state.lifecycleCompletion = completion;
      completion.catch(error => { if (state.guest) settings.notify(agent, 'Pi 扩展 agent_end：' + error.message, 'error'); })
        .finally(() => { if (state.lifecycleCompletion === completion) state.lifecycleCompletion = undefined; });
    } catch (error) { if (agent.status === 'idle') settings.notify(agent, 'Pi 扩展 agent_end：' + error.message, 'error'); }
  });
  ctx.tools.guard(exec => {
    const state = exec.agent && states.get(exec.agent);
    if (state?.active && !state.active.has(exec.name) && !exec.parent) return 'Pi extension disabled this model-facing tool.';
    if (state?.guest && JSON.stringify(currentPolicy(exec.agent)) !== state.policyKey) return 'Pi extension permissions changed; reload under current policy.';
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!exec.agent || !owns(exec.agent)) return next();
    const state = states.get(exec.agent);
    if (!state?.guest) return next();
    assertPolicy(exec.agent, state);
    if (!state.events.has('tool_call')) return next();
    const input = piArguments(exec), event = { type: 'tool_call', toolName: exec.name, toolCallId: exec.callId, input };
    const response = await invoke(exec.agent, state, { kind: 'event', eventName: 'tool_call', event }, exec.signal, exec);
    if (response?.input && !isDeepStrictEqual(response.input, input)) return { kind: 'deny', reason: 'Pi extension changed tool input; native DSH arguments are already logged and immutable.' };
    if (response?.terminate) return { kind: 'deny', reason: 'Pi terminate-batch semantics are not supported by this native dispatch.' };
    if (response?.block) return { kind: 'deny', reason: response.reason || 'Blocked by Pi extension' };
    return next();
  });
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (!exec.agent || !owns(exec.agent)) return decision;
    const state = states.get(exec.agent); if (!state?.events.has('tool_result')) return decision;
    const event = { type: 'tool_result', toolName: exec.name, toolCallId: exec.callId, input: piArguments(exec), content: await piContent(result.content, exec.signal),
      isError: result.isError, details: result.meta?.piExtension?.details ?? {} };
    const response = await invoke(exec.agent, state, { kind: 'event', eventName: 'tool_result', event }, exec.signal, exec);
    if (!response || !Object.keys(response).length) return decision;
    if (response.isError !== undefined && response.isError !== event.isError || response.structuredContent !== undefined) throw Error('尚未适配 Pi 工具结果错误/structuredContent 改写');
    if (response.details !== undefined && !isDeepStrictEqual(response.details, event.details)) throw Error('尚未适配 Pi 工具结果 details 改写');
    return response.content ? { kind: 'accept', content: await admitContent(response.content, exec.signal) } : decision;
  });
  ctx.on('agent/disposed', ({ agent }) => { const state = states.get(agent); states.delete(agent); if (settings.states.get(agent.id) === state) settings.states.delete(agent.id); if (state) void state.dispose().catch(error => ctx.logger.warn(error.message)); });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      const [, state] = sessionState(session);
      if (state) { state.pendingLifecycleSeq = event.seq; state.nativeTurn = event.data.turn; state.nativeNextStep = 1; }
    }
    if (event.type === 'step/start') {
      const [, state] = sessionState(session);
      if (state) state.nativeNextStep = event.data.step + 1;
    }
    if (event.type === 'turn/end') {
      const [, state] = sessionState(session);
      if (state) {
        state.nativeResponseHasTools = false;
        if (state.lifecycleRun) { state.lifecycleRun.endReason = event.data.reason; state.lifecycleRun.terminalSeq = event.seq; }
      }
    }
    if (event.type === 'assistant/message') {
      const [, state] = sessionState(session);
      if (state) state.nativeResponseHasTools = event.data.message.content.some(part => part.type === 'tool-call');
    }
    if (event.type === 'user/message' && event.data.source?.pi?.runPrompt || event.type === 'request/header') {
      const [, state] = sessionState(session);
      if (state && state.pendingForce !== undefined) state.forceAdmitted = state.pendingForce;
    }
    if (event.type !== 'sandbox/mode') return;
    const [agent, state] = sessionState(session);
    if (state?.guest && JSON.stringify(currentPolicy(agent)) !== state.policyKey) {
      // Revoke the old process range immediately; no callback may retain a
      // wider policy after the native mode event. Next assembly re-confines.
      void state.guest.close().catch(error => ctx.logger.warn(error.message));
      void state.dispose({ shutdown: false }).catch(error => ctx.logger.warn(error.message));
    }
  });
  ctx.effect(() => async () => { await Promise.all([...states.values()].map(state => state.dispose())); states.clear(); });
}
