import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { startGuest } from './extensions/transport.mjs';

export const name = 'omaa-pi-extensions';
export const inject = ['omaa', 'tools', 'commands', 'fs', 'sandboxPolicy', 'sandbox', 'subprocess'];
const supportedEvents = new Set(['session_start', 'session_shutdown', 'input', 'tool_call', 'tool_result']);
const textOf = blocks => (blocks ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const json = value => JSON.parse(JSON.stringify(value));
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
    if (event.type === 'user/message') message = { role: 'user', content: sourceMessage.content ?? [] };
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
  const owns = agent => ctx.omaa.product(agent.session)?.id === 'pi' && agent.session.header.origin !== 'subagent';
  const visible = (agent, state) => ctx.tools.schemas(agent).filter(tool => (!enhanced(tool.name) || ctx.omaa.enhancementEnabled(agent.session)) && (!state.active || state.active.has(tool.name)));
  const snapshot = (agent, state) => {
    const tools = visible(agent, state), branch = nativeBranch(agent);
    const model = typeof agent.options?.model === 'string' ? { id: agent.options.model, provider: agent.options.provider } : undefined;
    return { cwd: agent.session.header.cwd, mode: 'rpc', hasUI: Boolean(ctx.get('userQuestions')),
      isIdle: agent.status === 'idle', hasPendingMessages: Boolean(agent.inbox.nextTurn.length || agent.inbox.nextStep.length),
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
      if (options.expandPromptTemplates) throw Error('扩展 sendUserMessage 的命令/技能分派尚未适配');
      const blocks = typeof args.content === 'string' ? [{ type: 'text', text: args.content }] : await admitContent(args.content, signal);
      const message = createUserMessage({ content: blocks, source: { kind: 'user' } });
      state.inputOrigins.set(message.id, { source: 'extension', ...(agent.status === 'running' ? { streamingBehavior: options.deliverAs ?? 'followUp' } : {}) });
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
    const state = { status: 'disabled', nestedCalls: 0, calls: 0, inputOrigins: new Map(), toolRegistrations: new Map(), commandRegistrations: new Map(), events: new Set(), guest: null, key: null, policyKey: null,
      busy: () => Boolean(state.loading || state.calls || state.disposal),
      view: () => ({ status: state.status, ...(state.error ? { error: state.error } : {}), tools: state.descriptors?.tools.map(t => t.name) ?? [], commands: state.descriptors?.commands.map(c => c.name) ?? [] }),
      async dispose({ shutdown = true } = {}) {
        if (state.disposal) return state.disposal;
        const disposal = Promise.withResolvers(); state.disposal = disposal.promise;
        void (async () => {
        const guest = state.guest;
        if (shutdown && guest && !guest.stopped && state.status === 'ready' && state.events.has('session_shutdown')) {
          try { await guest.call({ type: 'invoke', kind: 'event', eventName: 'session_shutdown', event: { type: 'session_shutdown' }, snapshot: snapshot(agent, state) },
            { context: { agent, state, eventName: 'session_shutdown' }, signal: AbortSignal.timeout(2000), timeoutMs: 2000 }); }
          catch (error) { ctx.logger.warn('Pi extension shutdown: ' + error.message); }
        }
        for (const registry of [state.toolRegistrations, state.commandRegistrations]) { for (const entry of registry.values()) entry.dispose(); registry.clear(); }
        state.guest = null; state.key = null; state.active = null; state.events.clear(); state.descriptors = null; state.status = 'disabled';
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
        if (state.events.has('session_start')) await invoke(agent, state, { kind: 'event', eventName: 'session_start', event: { type: 'session_start' } }, signal);
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
  const controller = {
    promptTools(agent) {
      const state = states.get(agent), allowed = new Set(visible(agent, state ?? {}).map(t => t.name));
      return state?.descriptors?.tools.filter(t => allowed.has(t.name)) ?? [];
    },
    async input(agent, messages, signal) {
      if (!owns(agent)) return messages;
      const state = await ensure(agent, signal); if (!state.events.has('input')) return messages;
      const result = [];
      for (const message of messages) {
        if (message.role !== 'user' || message.source?.kind !== 'user') { result.push(message); continue; }
        const original = textOf(message.content);
        const images = await piContent(message.content.filter(p => p.type === 'image'), signal);
        const origin = state.inputOrigins.get(message.id) ?? { source: 'interactive' }; state.inputOrigins.delete(message.id);
        const response = await invoke(agent, state, { kind: 'event', eventName: 'input', event: { type: 'input', text: original, ...origin, ...(images.length ? { images } : {}) } }, signal);
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
    const assembly = await next();
    const allowed = new Set(visible(context.agent, state).map(t => t.name));
    state.prompt = assembly.sections.map(s => s.text).filter(Boolean).join('\n\n');
    return { ...assembly, tools: assembly.tools.filter(tool => allowed.has(tool.name)) };
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
    if (event.type !== 'sandbox/mode') return;
    const agent = ctx.agents.get(session.id), state = agent && states.get(agent);
    if (state?.guest && JSON.stringify(currentPolicy(agent)) !== state.policyKey) {
      // Revoke the old process range immediately; no callback may retain a
      // wider policy after the native mode event. Next assembly re-confines.
      void state.guest.close().catch(error => ctx.logger.warn(error.message));
      void state.dispose({ shutdown: false }).catch(error => ctx.logger.warn(error.message));
    }
  });
  ctx.effect(() => async () => { await Promise.all([...states.values()].map(state => state.dispose())); states.clear(); });
}
