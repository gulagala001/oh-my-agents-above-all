import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { finished } from 'node:stream/promises';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { symbols } from '@deepseek-ai/cordis';
import { startGuest } from './extensions/transport.mjs';
import { promptFrameText, renderPromptFrame } from './extension-prompt.mjs';
import { piHistoryEntries, readPiHistory } from './history.mjs';
import { promptOptions } from './prompt.mjs';
import { currentDirectory, ensureDirectory } from '../../host/working-directory.mjs';
import { toolNeedsEnhancement } from '../../host/tool-enhancement.mjs';
import { installPiLoop } from '../../host/pi-loop.mjs';
import { requestToPi, requestFromPi } from './extensions/context.mjs';
import { supportedEvents } from './extensions/pi-api.mjs';

export const name = 'omaa-pi-extensions';
export const inject = ['omaa', 'tools', 'commands', 'fs', 'sandboxPolicy', 'sandbox', 'subprocess'];
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

// Cancellation must be observable even when a provider/pipe does not settle.
// The underlying Promise remains observed and is joined during owned cleanup.
function awaitExecSignal(work, signal) {
  const promise = Promise.resolve(work); promise.catch(() => {});
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

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
export function apply(ctx) {
  const settings = ctx.omaa.piExtensions, states = new Map();
  let closed = false;
  const retiring = new Set();
  // Registry service access can return a traced Agent face. Resolve journal
  // observations by the stable native session identity, not proxy identity.
  const ownerKey = agent => agent?.ctx && scopeOf(agent.ctx);
  const nativeSession = session => session?.[symbols.original] ?? session;
  const stateFor = agent => states.get(ownerKey(agent));
  const sessionState = session => {
    const current = ctx.get('agents')?.get(session.id), state = current && stateFor(current);
    return state?.session === nativeSession(session) ? [current, state] : [];
  };
  const assertOwner = (agent, state, capture) => {
    const current = ctx.get('agents')?.get(state.session.id);
    if (closed || state.revoked || !state.ownerKey || states.get(state.ownerKey) !== state
      || ownerKey(agent) !== state.ownerKey || ownerKey(current) !== state.ownerKey
      || nativeSession(current.session) !== state.session || nativeSession(agent.session) !== state.session
      || capture && (capture.generation !== state.generation || capture.guest !== state.guest))
      throw Error('Pi 扩展的原生会话或加载实例已失效');
  };
  const owns = agent => ctx.omaa.product(agent.session)?.id === 'pi' && agent.session.header.origin !== 'subagent';
  const visible = (agent, state) => {
    const tools = ctx.tools.schemas(agent).filter(tool => !toolNeedsEnhancement(ctx, 'pi', tool.name, agent) || ctx.omaa.enhancementEnabled(agent.session));
    if (!state.active) return tools;
    const known = new Map(tools.map(tool => [tool.name, tool]));
    return [...state.active].flatMap(name => known.has(name) ? [known.get(name)] : []);
  };
  const catalogSnapshot = (agent, state, cwd = currentDirectory(ctx, agent.session)) => {
    const tools = visible(agent, state);
    const model = typeof agent.options?.model === 'string' ? { id: agent.options.model, provider: agent.options.provider } : undefined;
    // Fixed public SessionController.liveProjections uses this same exact live
    // Session projection. Null is a known unset title and survives the wire;
    // an unavailable projection stays absent rather than inventing a name.
    const title = ctx.get('sessionProjections')?.snapshot(agent.session)?.values?.title;
    return { cwd, mode: 'rpc', hasUI: Boolean(ctx.get('userQuestions')),
      isIdle: agent.status === 'idle' && !state.lifecycleRun?.ending, hasPendingMessages: Boolean(agent.inbox.nextTurn.length || agent.inbox.nextStep.length),
      sessionId: agent.session.id, ...(typeof title === 'string' || title === null ? { sessionName: title } : {}),
      activeTools: tools.map(t => t.name), allTools: ctx.tools.schemas(agent).map(t => ({ ...t, label: t.name })),
      commands: ctx.commands.list(agent).map(c => ({ name: c.name, description: c.description ?? '' })), flags: {},
      systemPrompt: state.prompt ?? '', ...(model ? { model } : {}) };
  };
  const snapshot = async (agent, state, signal, cwd) => {
    const catalog = catalogSnapshot(agent, state, cwd);
    const history = await readPiHistory(ctx.get('sessionQuery'), agent.session.id, {
      signal, content: piContent, argumentsFor: (name, args) => piArguments({ name, arguments: args }),
      projections: ctx.get('sessions')?.messageProjections ?? [],
    });
    return { ...catalog, sessionHeader: history.header, sessionCursor: history.cursor,
      sessionEntries: history.entries, sessionBranch: history.branch };
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
  function pendingCustom(agent, delivery) {
    const pending = new Map();
    for (const event of agent.session.snapshotEvents()) {
      if (event.type === 'plugin:omaa/pi-pending-message' && event.data.delivery === delivery) pending.set(event.data.message.id, event.data.message);
      if (event.type === 'user/message') pending.delete(event.data.id);
    }
    return [...pending.values()];
  }
  function flushCustom(agent, state) {
    assertOwner(agent, state);
    for (const message of pendingCustom(agent, 'after-step')) agent.session.append('user/message', message, { surfaceOp: 'append' });
  }
  async function api(method, args, context, signal) {
    if (!context?.agent) throw Error('扩展 API 需要当前原生调用上下文');
    const { agent, state, exec } = context; signal.throwIfAborted();
    if (context.cleanup) {
      if (method !== 'ui.notify') throw Error('扩展关闭通知仅可报告清理信息，不能执行或唤醒任务');
      const text = Array.isArray(args) ? args[0] : args.text ?? args.message;
      ctx.logger.info('Pi extension shutdown: ' + String(text ?? '').slice(0, 4096));
      return;
    }
    assertOwner(agent, state, context); assertPolicy(agent, state);
    if (context.eventName === 'agent_end' && state.lifecycleRun?.endReason?.kind === 'aborted'
      && ['exec', 'executeTool', 'sendUserMessage', 'ui.select', 'ui.confirm', 'ui.input'].includes(method)) throw Error('原生活动已取消，结束通知不能继续执行或唤醒任务');
    if (Array.isArray(args)) {
      const fields = { 'ui.notify': ['text', 'type'], 'ui.select': ['title', 'options', 'dialogOptions'], 'ui.confirm': ['title', 'message', 'dialogOptions'], 'ui.input': ['title', 'placeholder', 'dialogOptions'],
        sendUserMessage: ['content', 'options'], sendMessage: ['message', 'options'], appendEntry: ['customType', 'data'], exec: ['command', 'args', 'options'], executeTool: ['name', 'args', 'options'], setActiveTools: ['names'], syncRegistrations: ['descriptors'] }[method];
      if (!fields) throw Error('未支持 Pi API 参数: ' + method);
      args = Object.fromEntries(fields.map((key, i) => [key, args[i]]));
    }
    if (method === 'syncRegistrations') {
      if (state.status !== 'ready' || state.disposal && context.eventName !== 'session_shutdown') throw Error('扩展注册仅可在当前已加载的回调中更改');
      syncRegistrations(agent, state, args.descriptors);
      const { allTools, activeTools, commands } = catalogSnapshot(agent, state);
      return { allTools, activeTools, commands };
    }
    if (method === 'ui.notify') { settings.notify(agent, args.text ?? args.message, args.type); return; }
    if (method === 'appendEntry') {
      if (typeof args.customType !== 'string' || !args.customType || args.customType.length > 256) throw Error('Pi customType 必须为非空字符串（最多 256 字符）');
      appendPluginRecord(state.session, 'plugin:omaa/pi-entry', { customType: args.customType, ...(args.data === undefined ? {} : { data: args.data }) });
      return snapshot(agent, state, signal);
    }
    if (method === 'sendMessage') {
      const message = args.message, options = args.options ?? {};
      if (!message || typeof message.customType !== 'string' || !message.customType || message.customType.length > 256 || typeof message.display !== 'boolean') throw Error('Pi 自定义消息需要 customType 和 display');
      if (options.triggerTurn !== undefined && typeof options.triggerTurn !== 'boolean'
        || options.deliverAs !== undefined && !['steer', 'followUp', 'nextTurn'].includes(options.deliverAs)) throw Error('Pi 自定义消息投递选项无效');
      const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : await admitContent(message.content ?? [], signal);
      assertOwner(agent, state, context); assertPolicy(agent, state); signal.throwIfAborted();
      const custom = createUserMessage({ content: blocks, source: { kind: 'pi-extension', form: 'context', customType: message.customType,
        display: message.display, ...(message.details === undefined ? {} : { details: message.details }), timestamp: Date.now() } });
      const running = agent.status === 'running';
      const trigger = options.triggerTurn === true || running && options.triggerTurn !== false;
      if (state.lifecycleRun?.endReason?.kind === 'aborted' && trigger) throw Error('已取消的活动不能由自定义消息重新唤醒');
      if (options.deliverAs === 'nextTurn') appendPluginRecord(state.session, 'plugin:omaa/pi-pending-message', { message: custom, delivery: 'next-input' });
      else if (running && !trigger) appendPluginRecord(state.session, 'plugin:omaa/pi-pending-message', { message: custom, delivery: 'after-step' });
      else if (trigger) {
        if (options.deliverAs === 'followUp' || !running) agent.followup(custom); else agent.steer(custom);
      } else agent.session.append('user/message', custom, { surfaceOp: 'append' });
      return;
    }
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
      signal.throwIfAborted(); assertOwner(agent, state, context); assertPolicy(agent, state);
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
      const definition = state.descriptors?.tools.find(tool => tool.name === args.name);
      if (definition?.exposure === 'model-only' || state.active && !state.active.has(args.name)
        || !ctx.tools.get(args.name, agent)) throw Error('Pi executeTool 仅可调用当前已启用的直接工具');
      const result = await ctx.tools.execute({ name: args.name, arguments: nativeArguments(args.name, args.args), agent,
        callId: exec.callId + '/' + (++state.nestedCalls), rootCallId: exec.rootCallId ?? exec.callId, parent: exec.token, signal });
      signal.throwIfAborted(); assertOwner(agent, state, context); assertPolicy(agent, state);
      for (const extra of result.additionalContexts ?? []) exec.deferContext(extra);
      if (result.concludesTurn) exec.concludeTurn();
      return { content: await piContent(result.content, signal), details: result.meta?.piExtension?.details ?? {}, isError: result.isError, ...(!result.isError ? { structuredContent: result.value } : {}) };
    }
    if (method === 'exec') {
      const command = args.command, commandArgs = args.args ?? [], options = args.options ?? {};
      if (typeof command !== 'string' || !command || !Array.isArray(commandArgs) || commandArgs.some(v => typeof v !== 'string')) throw Error('exec 需要程序与字符串参数');
      // Fixed Pi ExecOptions has no input field. Preserve the existing OMAA
      // text-stdin extension; the guest JSON wire cannot preserve Uint8Array.
      if (options.input !== undefined && typeof options.input !== 'string') throw Error('OMAA exec input 扩展仅支持字符串');
      const cwd = currentDirectory(ctx, agent.session);
      if (options.cwd !== undefined && options.cwd !== cwd) throw Error('扩展 exec 的工作目录由当前会话固定');
      const ms = options.timeout ?? 120000; if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 3600000) throw Error('exec timeout 无效');
      const outputStop = new AbortController();
      const fused = AbortSignal.any([signal, AbortSignal.timeout(ms), outputStop.signal]), program = await ctx.subprocess.resolveExecutable(command, undefined, fused);
      const policy = currentPolicy(agent), argv = [program, ...commandArgs];
      const confined = policy.mode === 'danger-full-access' ? { argv } : await ctx.sandbox.confine(argv, policy, fused);
      fused.throwIfAborted(); assertOwner(agent, state, context); assertPolicy(agent, state);
      const child = ctx.subprocess.spawn({ argv: confined.argv, cwd,
        stdio: { stdin: options.input === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal: fused });
      let value, primary, failed = false;
      const tasks = [], failures = [];
      const issue = (stage, error) => { if (!failed || error !== primary) failures.push({ stage, error }); };
      try {
        const collect = async stream => {
          let total = 0; const chunks = [];
          for await (const chunk of stream) {
            total += chunk.length;
            if (total > 256 * 1024) {
              const error = Object.assign(Error('扩展 exec 输出超过 256 KiB'), { code: 'OMAA_PI_EXEC_OUTPUT_LIMIT' });
              outputStop.abort(error); throw error;
            }
            chunks.push(chunk);
          }
          return Buffer.concat(chunks).toString('utf8');
        };
        // Register every native completion before stdin setup or the first await.
        const done = Promise.resolve(child.done), stdout = collect(child.stdout), stderr = collect(child.stderr);
        for (const [stage, work] of [['done', done], ['stdout', stdout], ['stderr', stderr]]) {
          work.catch(() => {}); tasks.push({ stage, work });
        }
        if (options.input !== undefined) {
          if (!child.stdin) throw Error('原生 exec 没有返回请求的 stdin 管道');
          // Observe native Writable completion before end(): an asynchronous
          // EPIPE is a transport failure even when the command exits with 0.
          // Completion proves flushed transport, not child consumption.
          const stdin = finished(child.stdin, { cleanup: true }); stdin.catch(() => {});
          tasks.push({ stage: 'stdin', work: stdin });
          child.stdin.on('error', () => {}); child.stdin.end(options.input);
        }
        const [result, out, err] = await awaitExecSignal(Promise.all(tasks.map(task => task.work)), fused);
        fused.throwIfAborted(); assertOwner(agent, state, context); assertPolicy(agent, state);
        value = { stdout: out, stderr: err, code: result.exitCode ?? 1, killed: Boolean(result.signal || fused.aborted) };
      } catch (error) { failed = true; primary = fused.aborted ? fused.reason : error; }
      finally {
        // Termination, command exit, managed-range emptiness and caller pipes
        // are separate facts. Attempt each even if another cleanup step fails.
        const deadline = AbortSignal.timeout(5000);
        try { child.terminate(); } catch (error) { issue('terminate', error); }
        const range = Promise.resolve().then(() => child.waitForExit(deadline)); range.catch(() => {});
        for (const [stage, pipe] of [['stdin', child.stdin], ['stdout', child.stdout], ['stderr', child.stderr]]) {
          try { pipe?.destroy(); } catch (error) { issue('destroy-' + stage, error); }
        }
        const observed = await Promise.allSettled([
          awaitExecSignal(range, deadline), ...tasks.map(task => awaitExecSignal(task.work, deadline)),
        ]);
        if (observed[0].status === 'rejected') issue('range', observed[0].reason);
        else if (!observed[0].value) issue('range', Error('扩展 exec 进程范围未确认退出'));
        const rangeEmpty = observed[0].status === 'fulfilled' && observed[0].value === true;
        for (let index = 0; index < tasks.length; index++) if (observed[index + 1].status === 'rejected') {
          const error = observed[index + 1].reason, stage = tasks[index].stage;
          // Explicit destruction after a failed body can reject settled pipe
          // readers/writers normally. A proven empty range plus those known
          // shutdown errors is not a failure to reach quiescence. Raw command
          // failures and deadline/unexpected pipe failures remain material.
          const expectedShutdown = failed && rangeEmpty && stage !== 'done'
            && (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.code === 'ERR_STREAM_PREMATURE_CLOSE');
          if (!expectedShutdown) issue(stage, error);
        }
      }
      if (failures.length) {
        const message = failed ? String(primary?.message ?? primary) + '; ' : '';
        throw Object.assign(new AggregateError([...(failed ? [primary] : []), ...failures.map(item => item.error)],
          message + 'Pi exec cleanup/quiescence was not fully confirmed', failed ? { cause: primary } : {}), {
          code: primary?.code ?? 'OMAA_PI_EXEC_CLEANUP_FAILED',
          cleanupFailures: failures.slice(0, 8).map(item => ({ stage: item.stage, name: String(item.error?.name ?? 'Error').slice(0, 96),
            ...(item.error?.code ? { code: String(item.error.code).slice(0, 96) } : {}), message: String(item.error?.message ?? item.error).slice(0, 512) })),
        });
      }
      if (failed) throw primary;
      fused.throwIfAborted(); assertOwner(agent, state, context); assertPolicy(agent, state);
      return value;
    }
    throw Error('尚未适配 Pi API: ' + method);
  }
  function toolRegistration(agent, state, tool) {
    const capture = { generation: state.generation, guest: state.guest };
    return agent.ctx.get('tools').register({ name: tool.name, description: tool.description, parameters: tool.parameters,
      output: { schema: { type: 'object', properties: { content: { type: 'array', items: { type: 'object' } }, details: {}, structuredContent: tool.outputSchema ?? {} }, required: ['content', ...(tool.outputSchema ? ['structuredContent'] : [])], additionalProperties: false },
        render: (_args, value) => content(value.content), presentationMeta: (_args, value) => ({ piExtension: { details: value.details ?? {}, toolName: tool.name } }) },
      async execute(params, exec) {
        assertOwner(agent, state, capture); assertPolicy(agent, state);
        const signal = AbortSignal.any([exec.signal, state.life.signal]); signal.throwIfAborted();
        // A native invocation may already have captured this definition when a
        // later callback replaces it. Keep its original guest callback ID.
        const value = await invoke(agent, state, { kind: 'tool', callbackId: tool.callbackId, callId: exec.callId, params }, signal, exec);
        if (value.isError) throw Error(textOf(value.content) || 'Pi extension tool failed');
        const admitted = await admitContent(value.content, signal);
        assertOwner(agent, state, capture); signal.throwIfAborted();
        return { content: admitted, ...(value.details !== undefined ? { details: value.details } : {}), ...(value.structuredContent !== undefined ? { structuredContent: value.structuredContent } : {}) };
      } });
  }
  function commandRegistration(agent, state, command) {
    const capture = { generation: state.generation, guest: state.guest };
    return agent.ctx.get('commands').register({ name: command.name, description: command.description,
      async handler(input) {
        assertOwner(agent, state, capture);
        await ensure(agent, input.signal);
        assertOwner(agent, state, capture); input.signal?.throwIfAborted();
        const callbackId = state.descriptors?.commands.find(c => c.name === command.name)?.callbackId;
        if (!callbackId) throw Error('Pi 扩展命令已移除，请刷新');
        await invoke(agent, state, { kind: 'command', callbackId, args: input.rawInput.trimStart() }, input.signal);
        return { kind: 'success', text: '/' + command.name };
      } });
  }
  function syncRegistrations(agent, state, descriptors) {
    assertOwner(agent, state);
    if (!descriptors || !Array.isArray(descriptors.tools) || !Array.isArray(descriptors.commands) || !Array.isArray(descriptors.events) || descriptors.tools.length > 128 || descriptors.commands.length > 128 || descriptors.events.some(e => !supportedEvents.has(e))) throw Error('扩展注册内容包含未支持的接口或超过上限');
    const names = new Set(), commandNames = new Set();
    for (const tool of descriptors.tools) {
      if (!tool || typeof tool.name !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(tool.name) || names.has(tool.name) || !state.toolRegistrations.has(tool.name) && ctx.tools.get(tool.name, agent)) throw Error('扩展工具名称无效、重复或与原生工具冲突: ' + tool?.name);
      if (typeof tool.callbackId !== 'string' || !tool.callbackId || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) throw Error('Pi 扩展工具定义无效: ' + tool.name);
      if (tool.prepareArguments || tool.exposure && !['direct', 'model-only'].includes(tool.exposure)) throw Error('尚未适配扩展工具的 prepareArguments/exposure 接口');
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
    const state = { ownerKey: ownerKey(agent), session: nativeSession(agent.session), agent,
      generation: 0, life: new AbortController(), revoked: false,
      status: 'disabled', nestedCalls: 0, calls: 0, inputOrigins: new Map(), toolRegistrations: new Map(), commandRegistrations: new Map(), events: new Set(), guest: null, key: null, policyKey: null,
      forceAdmitted: previous?.force === true,
      busy: () => Boolean(state.loading || state.calls || state.disposal || state.lifecycleRun?.ending),
      view: () => ({ status: state.status, ...(state.error ? { error: state.error } : {}), tools: state.descriptors?.tools.map(t => t.name) ?? [], commands: state.descriptors?.commands.map(c => c.name) ?? [] }),
      async dispose({ shutdownReason } = {}) {
        if (state.disposal) return state.disposal;
        const guest = state.guest, observeShutdown = shutdownReason === 'reload' && guest && !guest.stopped
          && state.status === 'ready' && state.events.has('session_shutdown');
        // Revoke the epoch before any awaited cleanup. Its callbacks may report
        // shutdown information, but cannot retain native effects or admission.
        state.generation++;
        state.life.abort(Error('Pi extension epoch ended'));
        const disposal = Promise.withResolvers(); state.disposal = disposal.promise;
        const failures = [];
        for (const registry of [state.toolRegistrations, state.commandRegistrations]) {
          for (const entry of registry.values()) { try { entry.dispose(); } catch (error) { failures.push(error); } }
          registry.clear();
        }
        state.guest = null; state.key = null; state.active = null; state.events.clear(); state.descriptors = null; state.status = 'disabled';
        state.runStarted = false; state.runOptions = undefined; state.runCatalogEdits = undefined; state.inputOrigins.clear();
        state.lifecycleRun = undefined; state.lifecycleCompletion = undefined;
        void (async () => {
        if (observeShutdown) {
          try { const signal = AbortSignal.timeout(2000);
            const response = await guest.call({ type: 'invoke', kind: 'event', eventName: 'session_shutdown', event: { type: 'session_shutdown', reason: 'reload' }, snapshot: await snapshot(agent, state, signal) },
            { context: { agent, state, eventName: 'session_shutdown', cleanup: true, guest }, signal, timeoutMs: 2000 });
            for (const error of response?.errors ?? []) ctx.logger.warn('Pi extension shutdown: ' + error.error); }
          catch (error) { ctx.logger.warn('Pi extension shutdown: ' + error.message); }
        }
        if (guest) { try { await guest.close(); } catch (error) { failures.push(error); } }
        if (failures.length) throw new AggregateError(failures, 'Pi extension cleanup failed');
        })().then(disposal.resolve, disposal.reject);
        try { await disposal.promise; } finally { state.disposal = null; }
      },
    };
    if (!state.ownerKey) throw Error('Pi 扩展需要真实原生 Agent scope');
    states.set(state.ownerKey, state); settings.states.set(agent.id, state);
    state.restoreLoop = installPiLoop(agent, {
      async afterStep() { flushCustom(agent, state); },
      async request(request, signal) {
        if (!state.guest || !state.events.has('context') && !state.events.has('context_with_system')) return;
        assertOwner(agent, state); assertPolicy(agent, state);
        const head = agent.session.seq;
        const adapted = await requestToPi(request, { piContent, argumentsFor: (name, args) => piArguments({ name, arguments: args }), signal });
        const response = await invoke(agent, state, { kind: 'context', messages: adapted.messages }, signal);
        for (const error of response.errors ?? []) settings.notify(agent, 'Pi 扩展 context：' + error.error, 'error');
        if (isDeepStrictEqual(response.messages, adapted.messages)) return;
        const projected = await requestFromPi(response.messages, { originals: adapted.originals, parts: adapted.parts, request, admitContent, nativeArguments, signal });
        assertOwner(agent, state); assertPolicy(agent, state); signal.throwIfAborted();
        // Inbox writes during a callback are legitimate future input. Context
        // rewrites are request-local; their source surface must remain stable.
        if (agent.session.snapshotEvents(head).some(event => event.surfaceOp)) throw Error('Pi context source changed while its callback was running');
        return projected;
      },
    });
    return state;
  }
  async function ensure(agent, signal) {
    if (closed) throw Error('Pi 扩展宿主已关闭');
    const state = stateFor(agent) ?? makeState(agent);
    assertOwner(agent, state); signal?.throwIfAborted();
    if (state.loading) {
      await state.loading;
      assertOwner(agent, state); signal?.throwIfAborted();
      return state;
    }
    const load = async () => {
      if (state.disposal) await state.disposal;
      assertOwner(agent, state); signal?.throwIfAborted();
      if (state.life.signal.aborted) state.life = new AbortController();
      const preparing = AbortSignal.any([state.life.signal, ...signal ? [signal] : []]);
      const cwd = await ensureDirectory(ctx, agent, preparing);
      assertOwner(agent, state); preparing.throwIfAborted();
      const policy = currentPolicy(agent), configured = settings.settings.read(), versions = [];
      for (const file of configured.files) {
        const target = await ctx.fs.resolve(file, { signal: preparing });
        assertOwner(agent, state); preparing.throwIfAborted();
        const stat = await ctx.fs.stat(target, preparing);
        assertOwner(agent, state); preparing.throwIfAborted();
        if (!stat || stat.type !== 'file' || stat.size > 256 * 1024) throw Error('Pi 扩展文件不存在或超过 256 KiB: ' + file);
        versions.push(stat.version);
      }
      const policyKey = JSON.stringify(policy), key = JSON.stringify([configured, policyKey, versions, cwd]);
      if (JSON.stringify(currentPolicy(agent)) !== policyKey) throw Error('Pi 扩展加载期间权限已变化');
      if (key === state.key && !state.guest?.stopped) return;
      if (state.calls) throw Error('Pi 扩展回调仍在执行，不能在该回调中重新加载扩展');
      await state.dispose({ shutdownReason: 'reload' });
      assertOwner(agent, state); signal?.throwIfAborted();
      state.life = new AbortController();
      const generation = state.generation, fused = AbortSignal.any([state.life.signal, ...signal ? [signal] : []]);
      state.key = key; state.policyKey = policyKey; delete state.error;
      if (!configured.files.length) return;
      state.status = 'loading';
      let guest;
      try {
        guest = await startGuest({ subprocess: ctx.subprocess, sandbox: ctx.sandbox, policy, cwd, signal: fused, api });
        assertOwner(agent, state); fused.throwIfAborted();
        if (state.generation !== generation) throw Error('Pi 扩展加载实例已失效');
        state.guest = guest;
        const capture = { generation, guest };
        const initial = await snapshot(agent, state, fused, cwd);
        assertOwner(agent, state, capture); fused.throwIfAborted(); assertPolicy(agent, state);
        const descriptors = await guest.call({ type: 'load', files: configured.files, snapshot: initial }, { signal: fused, timeoutMs: 30000 });
        assertOwner(agent, state, capture); fused.throwIfAborted(); assertPolicy(agent, state);
        syncRegistrations(agent, state, descriptors);
        state.status = 'ready';
        await notifyEvent(agent, state, 'session_start', {}, fused);
      } catch (error) {
        if (state.generation === generation) await state.dispose();
        else if (guest) await guest.close();
        if (!closed && !state.revoked && stateFor(agent) === state) {
          state.status = 'error'; state.error = error.message; settings.notify(agent, 'Pi 扩展加载失败：' + error.message, 'error');
        }
        throw error;
      }
    };
    // Publish the full preparation transaction before its first await, including
    // directory and file metadata reads. Concurrent callers join this loading.
    const loading = Promise.resolve().then(load); state.loading = loading;
    try { await loading; assertOwner(agent, state); signal?.throwIfAborted(); return state; }
    finally { if (state.loading === loading) state.loading = null; }
  }
  async function invoke(agent, state, call, signal, exec) {
    const guest = state.guest, generation = state.generation, capture = { guest, generation };
    assertOwner(agent, state, capture); assertPolicy(agent, state);
    if (!guest || guest.stopped) throw Error('Pi 扩展进程未运行');
    const fused = AbortSignal.any([state.life.signal, ...signal ? [signal] : []]); fused.throwIfAborted();
    state.calls++;
    try {
      const current = await snapshot(agent, state, fused);
      assertOwner(agent, state, capture); fused.throwIfAborted(); assertPolicy(agent, state);
      const result = await guest.call({ type: 'invoke', ...call, snapshot: current }, { context: { agent, state, exec, eventName: call.eventName, ...capture }, signal: fused });
      assertOwner(agent, state, capture); fused.throwIfAborted();
      return result;
    }
    finally { state.calls--; }
  }
  async function notifyEvent(agent, state, eventName, event, signal) {
    if (!state.events.has(eventName)) return;
    const response = await invoke(agent, state, { kind: 'event', eventName, event: { type: eventName, ...event },
      ...(eventName === 'agent_end' && state.lifecycleRun?.endReason?.kind === 'aborted' ? { callbackAbortReason: state.lifecycleRun.endReason.reason } : {}) }, signal);
    for (const error of response?.errors ?? []) settings.notify(agent, 'Pi 扩展 ' + eventName + '：' + error.error, 'error');
  }
  function loadoutInput(agent, state) {
    const registered = ctx.tools.schemas(agent), declared = visible(agent, state);
    const definitions = new Map((state.descriptors?.tools ?? []).map(tool => [tool.name, tool]));
    const guidelines = promptOptions({ customTools: [...definitions.values()] }).toolGuidelines;
    const describe = tools => tools.map(tool => ({ ...tool, label: definitions.get(tool.name)?.label ?? tool.name }));
    return json({ loadout: { registered: describe(registered), declared: describe(declared),
      callable: describe(declared.filter(tool => definitions.get(tool.name)?.exposure !== 'model-only')),
      metadata: Object.fromEntries(registered.map(tool => [tool.name, {
        exposure: definitions.get(tool.name)?.exposure ?? 'direct',
        ...(definitions.get(tool.name)?.namespace ? { namespace: definitions.get(tool.name).namespace } : {}),
        promptGuidelines: guidelines[tool.name] ?? [],
      }])) },
      hooks: declared.map(tool => definitions.get(tool.name)).filter(tool => tool?.prepareLoadout).map(tool => tool.callbackId) });
  }
  async function prepareLoadout(agent, state, signal) {
    assertOwner(agent, state); signal?.throwIfAborted();
    if (state.guest) assertPolicy(agent, state);
    const input = loadoutInput(agent, state);
    if (!input.hooks.length) return visible(agent, state);
    // Upstream prepares again even for an unchanged catalog: closures may have
    // changed since the preceding request. Never cache callback results.
    const response = await invoke(agent, state, { kind: 'loadout', ...input }, signal);
    assertPolicy(agent, state);
    // Callback-owned registration/API work drains before its result. Refuse
    // stale presentation instead of admitting a different tool set underneath.
    if (!isDeepStrictEqual(loadoutInput(agent, state), input)) throw Error('Pi prepareLoadout 期间工具目录发生变化，请重新组装请求');
    for (const error of response?.errors ?? []) settings.notify(agent, 'Pi 扩展 prepare_loadout ' + error.toolName + '：' + error.error, 'error');
    if (!response || !response.descriptions || typeof response.descriptions !== 'object' || Array.isArray(response.descriptions)
      || Object.values(response.descriptions).some(value => typeof value !== 'string')
      || !Array.isArray(response.hiddenDeclarations) || response.hiddenDeclarations.some(name => typeof name !== 'string')) throw Error('Pi prepareLoadout 响应无效');
    // DSH logs historical declarations. Its current public projection cannot
    // hide the full declaration history while keeping tools active/callable.
    // Never silently interpret hiddenDeclarations as disabling execution.
    if (response.hiddenDeclarations.length) throw Error('Pi hiddenDeclarations 需要可重放的完整工具声明投影；当前公开接口尚未提供');
    return visible(agent, state).map(tool => Object.hasOwn(response.descriptions, tool.name)
      ? { ...tool, description: response.descriptions[tool.name] } : tool);
  }
  async function runMessages(agent, run, signal) {
    const observation = await ctx.get('sessionQuery').observeSession(agent.session.id, { projectionMode: 'none', signal });
    try {
      const events = observation.events.filter(event => event.seq > run.firstSeq && event.seq <= run.endSeq
        && (event.type === 'tool/call' || event.surfaceOp === 'append'));
      return (await piHistoryEntries(events, { content: piContent, signal, argumentsFor: (name, args) => piArguments({ name, arguments: args }) })).flatMap(entry => entry.message ? [entry.message] : []);
    } finally { observation[Symbol.dispose](); }
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
    try { flushCustom(agent, state); run.endSeq = agent.session.snapshotEvents().at(-1)?.seq ?? run.endSeq; await notifyEvent(agent, state, 'agent_end', { messages: await runMessages(agent, run, signal) }, signal); }
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
    const state = stateFor(info.agent);
    if (!state?.guest || state.guest.stopped) return next();
    if (state.lifecycleCompletion) await state.lifecycleCompletion;
    if (state.lifecycleRun?.ending) await finishLifecycle(info.agent, state, info.signal);
    await beginTurn(info.agent, state, info.turn, info.step, info.signal);
    return next();
  });
  const controller = {
    inputMetadata: (agent, id) => stateFor(agent)?.inputOrigins.get(id),
    promptTools(agent) {
      const state = stateFor(agent), allowed = new Set(visible(agent, state ?? {}).map(t => t.name));
      return state?.descriptors?.tools.filter(t => allowed.has(t.name)) ?? [];
    },
    pendingMessages: agent => pendingCustom(agent, 'next-input'),
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
    const tools = await prepareLoadout(context.agent, state, context.signal);
    return { ...assembly, tools, sections: sections.map((section, order) => ({ ...section, order, interpolate: false })) };
  }, { prepend: true });
  ctx.on('agent/status', ({ agent, status }) => {
    const state = stateFor(agent);
    if (state && status === 'running') state.nativeNextStep = 1;
    if (!state || status !== 'idle') return;
    const run = state.lifecycleRun;
    if (!run) { flushCustom(agent, state); state.lifecycleRun = undefined; clearRunPrompt(state); return; }
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
    const state = exec.agent && stateFor(exec.agent);
    if (state?.active && !state.active.has(exec.name) && !exec.parent) return 'Pi extension disabled this model-facing tool.';
    if (state?.guest && JSON.stringify(currentPolicy(exec.agent)) !== state.policyKey) return 'Pi extension permissions changed; reload under current policy.';
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!exec.agent || !owns(exec.agent)) return next();
    const state = stateFor(exec.agent);
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
    const state = stateFor(exec.agent); if (!state?.events.has('tool_result')) return decision;
    const event = { type: 'tool_result', toolName: exec.name, toolCallId: exec.callId, input: piArguments(exec), content: await piContent(result.content, exec.signal),
      isError: result.isError, details: result.meta?.piExtension?.details ?? {} };
    const response = await invoke(exec.agent, state, { kind: 'event', eventName: 'tool_result', event }, exec.signal, exec);
    if (!response || !Object.keys(response).length) return decision;
    if (response.isError !== undefined && response.isError !== event.isError || response.structuredContent !== undefined) throw Error('尚未适配 Pi 工具结果错误/structuredContent 改写');
    if (response.details !== undefined && !isDeepStrictEqual(response.details, event.details)) throw Error('尚未适配 Pi 工具结果 details 改写');
    return response.content ? { kind: 'accept', content: await admitContent(response.content, exec.signal) } : decision;
  });
  const retire = state => {
    if (!state) return Promise.resolve();
    state.revoked = true;
    const disposal = state.dispose();
    const work = (async () => {
      await disposal;
      if (state.loading) await Promise.allSettled([state.loading]);
      state.restoreLoop?.();
    })();
    retiring.add(work);
    void work.catch(error => ctx.logger.warn(error.message)).finally(() => retiring.delete(work));
    return work;
  };
  ctx.on('agent/disposed', ({ agent }) => {
    const state = stateFor(agent); if (!state) return;
    // Revocation is synchronous, before removing the owner lookup or awaiting
    // shutdown. A replacement Agent with the same durable id owns a new scope.
    state.revoked = true; state.life.abort(Error('Pi extension owner disposed'));
    states.delete(state.ownerKey);
    if (settings.states.get(agent.id) === state) settings.states.delete(agent.id);
    void retire(state);
  });
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
      void state.dispose().catch(error => ctx.logger.warn(error.message));
    }
  });
  ctx.effect(() => async () => {
    closed = true;
    const current = [...states.values()];
    for (const state of current) { state.revoked = true; state.life.abort(Error('Pi extension host disposed')); }
    await Promise.allSettled(current.map(retire));
    // A loading guest may return after revocation; its checked catch closes
    // that exact process. Include it before finishing host teardown.
    await Promise.allSettled(current.map(state => state.loading).filter(Boolean));
    while (retiring.size) await Promise.allSettled([...retiring]);
    for (const state of current) if (settings.states.get(state.session.id) === state) settings.states.delete(state.session.id);
    states.clear();
  });
}
