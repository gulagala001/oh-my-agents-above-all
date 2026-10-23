import { AsyncLocalStorage } from 'node:async_hooks';
import { Type } from 'typebox';
import { PiReadonlyTree } from '../../../../lib/pi-session-projection.mjs';
import { currentSystem } from './context.mjs';

export { Type };
export const callbackContext = new AsyncLocalStorage();
export const supportedEvents = new Set(['input', 'before_agent_start', 'agent_start', 'turn_start', 'turn_end', 'agent_end', 'agent_before_settle', 'agent_settled', 'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end', 'tool_call', 'tool_result', 'session_start', 'session_shutdown', 'context', 'context_with_system', 'session_before_compact', 'session_compact', 'session_compact_failed', 'session_before_tree', 'session_tree']);

// Pure helpers from Pi cd32f77 extensions/types.ts and ai/typebox-helpers.ts.
export const defineTool = tool => tool;
export const isToolCallEventType = (toolName, event) => event.toolName === toolName;
export const isBashToolResult = event => event.toolName === 'bash';
export const isPowerShellToolResult = event => event.toolName === 'powershell';
export const isReadToolResult = event => event.toolName === 'read';
export const isEditToolResult = event => event.toolName === 'edit';
export const isWriteToolResult = event => event.toolName === 'write';
export const isGrepToolResult = event => event.toolName === 'grep';
export const isFindToolResult = event => event.toolName === 'find';
export const isLsToolResult = event => event.toolName === 'ls';
export function StringEnum(values, options) {
  return Type.Unsafe({ type: 'string', enum: values, ...(options?.description && { description: options.description }),
    ...(options?.default && { default: options.default }) });
}
export const codingAgentShim = { defineTool, isToolCallEventType, isBashToolResult, isPowerShellToolResult,
  isReadToolResult, isEditToolResult, isWriteToolResult, isGrepToolResult, isFindToolResult, isLsToolResult };
export const aiShim = { Type, StringEnum, getCurrentSystemMessage: currentSystem };

const unsupported = name => { throw new Error('Unsupported Pi extension API: ' + name); };
const clone = value => value === undefined ? undefined : structuredClone(value);
function live(runtime, invokeOnly = true) {
  if (!runtime.active) throw new Error('Pi extension runtime is stale after reload or shutdown');
  const context = callbackContext.getStore();
  if (!context || context.runtime !== runtime || context.finished) throw new Error('Pi extension API requires its active host callback');
  context.controller.signal.throwIfAborted();
  if (invokeOnly && context.phase !== 'invoke') throw new Error('Pi extension runtime not initialized: action methods cannot run during loading');
  return context;
}
function snapshot(runtime, key) {
  const context = live(runtime, false);
  if (!Object.hasOwn(context.snapshot, key)) throw new Error('Pi extension snapshot does not provide ' + key);
  return context.snapshot[key];
}
const sessionName = runtime => snapshot(runtime, 'sessionName') ?? undefined;
function optionsFor(context, options) {
  if (!options) return undefined;
  if (options.signal !== undefined && options.signal !== context.controller.signal) unsupported('custom operation AbortSignal');
  const { signal: _signal, ...rest } = options;
  if (typeof rest.onUpdate === 'function') unsupported('executeTool onUpdate');
  return rest;
}
function request(runtime, method, args, voidAction = false) {
  const context = live(runtime);
  return runtime.request(context, method, args, voidAction);
}
function proxyMethods(target, prefix) {
  return new Proxy(target, { get(object, key, receiver) {
    if (Reflect.has(object, key) || typeof key === 'symbol') return Reflect.get(object, key, receiver);
    return unsupported(prefix + '.' + key);
  } });
}

export function createCallbackContext(runtime) {
  const ui = proxyMethods({
    notify(message, type = 'info') { request(runtime, 'ui.notify', [message, type], true); },
    select(title, choices, options) {
      const context = live(runtime); return request(runtime, 'ui.select', [title, choices, optionsFor(context, options)]);
    },
    confirm(title, message, options) {
      const context = live(runtime); return request(runtime, 'ui.confirm', [title, message, optionsFor(context, options)]);
    },
    input(title, placeholder, options) {
      const context = live(runtime); return request(runtime, 'ui.input', [title, placeholder, optionsFor(context, options)]);
    },
  }, 'ctx.ui');
  const sessionManager = proxyMethods({
    ...Object.fromEntries(['getBranch', 'getLeafId', 'getLeafEntry', 'getEntry', 'getChildren', 'getLabel', 'getTree'].map(name => [name, (...args) => {
      if (name === 'getBranch' && args[0] === undefined) return clone(snapshot(runtime, 'sessionBranch'));
      const reader = new PiReadonlyTree(snapshot(runtime, 'sessionEntries'), snapshot(runtime, 'sessionLeafId'));
      return clone(reader[name](...args));
    }])),
    getEntries: () => clone(snapshot(runtime, 'sessionEntries')),
    getSessionId: () => snapshot(runtime, 'sessionId'),
    getSessionName: () => sessionName(runtime),
    getCwd: () => snapshot(runtime, 'cwd'),
  }, 'ctx.sessionManager');
  const context = {
    get cwd() { return snapshot(runtime, 'cwd'); },
    get mode() { const mode = live(runtime, false).snapshot.mode ?? 'print'; if (!['print', 'rpc', 'json'].includes(mode)) unsupported('TUI mode'); return mode; },
    get hasUI() { return Boolean(live(runtime, false).snapshot.hasUI); },
    get ui() { live(runtime); return ui; },
    get signal() { const current = live(runtime); return current.notificationSignal ?? current.controller.signal; },
    get sessionManager() { live(runtime); return sessionManager; },
    get tools() { return clone(snapshot(runtime, 'allTools')); },
    get model() { return clone(live(runtime, false).snapshot.model); },
    isIdle: () => snapshot(runtime, 'isIdle'),
    isProjectTrusted() {
      const context = live(runtime);
      if (typeof context.snapshot.isProjectTrusted !== 'boolean') unsupported('ctx.isProjectTrusted');
      return context.snapshot.isProjectTrusted;
    },
    hasPendingMessages: () => snapshot(runtime, 'hasPendingMessages'),
    getSystemPrompt: () => { const context = live(runtime); return context.renderSystemPrompt ? context.renderSystemPrompt() : snapshot(runtime, 'systemPrompt'); },
    compact(options = {}) {
      const { onComplete, onError, ...rest } = options;
      const current = live(runtime), work = request(runtime, 'compact', [rest]).then(async ack => {
        Object.assign(current.snapshot, ack.snapshot); await onComplete?.(ack.result); return ack.result;
      }, async error => { if (onError) await onError(error); else throw error; });
      current.pending.add(work);
      work.then(() => current.pending.delete(work), error => { current.voidErrors.push(error); current.pending.delete(work); });
      return work;
    },
    async navigateTree(targetId, options = {}) {
      const current = live(runtime); if (current.kind !== 'command') unsupported('ctx.navigateTree outside command callback');
      const ack = await request(runtime, 'navigateTree', [targetId, options]); Object.assign(current.snapshot, ack.snapshot); return ack.result;
    },
    async executeTool(name, params, options) {
      const current = live(runtime);
      if (current.kind !== 'tool') unsupported('ctx.executeTool outside tool callback');
      await runtime.waitForRegistrations(current);
      return request(runtime, 'executeTool', [name, params, optionsFor(current, options)]);
    },
  };
  return proxyMethods(context, 'ctx');
}

export function createPiAPI(runtime, extension) {
  const register = () => live(runtime, false);
  const change = (context, apply) => {
    if (context.phase === 'load') apply(extension);
    else runtime.refreshRegistrations(context, extension, apply);
  };
  return proxyMethods({
    on(eventName, handler) {
      const context = register();
      if (!supportedEvents.has(eventName)) unsupported('event ' + eventName);
      if (typeof handler !== 'function') throw new Error('Pi event handler must be a function');
      if (extension.handlerCount >= 256) throw new Error('Pi extension exceeds 256 event handlers');
      const registration = { handler };
      change(context, current => {
        const handlers = current.events.get(eventName) ?? [];
        handlers.push(registration); current.events.set(eventName, handlers); current.handlerCount++;
      });
      return () => {
        const current = register();
        if (!extension.events.get(eventName)?.includes(registration)) return;
        change(current, state => {
          const handlers = state.events.get(eventName), index = handlers?.indexOf(registration) ?? -1;
          if (index < 0) return;
          handlers.splice(index, 1); state.handlerCount--;
          if (!handlers.length) state.events.delete(eventName);
        });
      };
    },
    registerTool(definition) {
      const context = register();
      if (!definition || typeof definition.name !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(definition.name)
        || typeof definition.description !== 'string' || typeof definition.execute !== 'function'
        || definition.prepareLoadout !== undefined && typeof definition.prepareLoadout !== 'function'
        || !definition.parameters || typeof definition.parameters !== 'object' || Array.isArray(definition.parameters)) throw new Error('Invalid Pi tool definition');
      if (!extension.tools.has(definition.name) && extension.tools.size >= 128) throw new Error('Pi extension exceeds 128 tools');
      const callbackId = runtime.callbackId('tool');
      change(context, current => current.tools.set(definition.name, { definition, callbackId }));
    },
    registerCommand(name, definition) {
      const context = register();
      if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{0,127}$/.test(name) || typeof definition?.handler !== 'function'
        || typeof definition.description !== 'string') throw new Error('Invalid Pi command definition');
      if (!extension.commands.has(name) && extension.commands.size >= 128) throw new Error('Pi extension exceeds 128 commands');
      const command = { ...definition, name, callbackId: runtime.callbackId('command') };
      change(context, current => current.commands.set(name, command));
    },
    getActiveTools: () => clone(snapshot(runtime, 'activeTools')),
    setActiveTools(names) {
      const context = live(runtime);
      if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) throw new Error('Pi setActiveTools requires string names');
      const known = new Set(snapshot(runtime, 'allTools').map(tool => tool.name));
      const next = [...new Set(names.filter(name => known.has(name)))];
      runtime.afterRegistrations(context, 'setActiveTools', [names]);
      context.snapshot.activeTools = next;
      context.activeToolsOverride = { names: next, known };
      if (context.registrationBase) context.registrationBase.activeTools = next;
    },
    getAllTools: () => clone(snapshot(runtime, 'allTools')),
    getCommands: () => clone(snapshot(runtime, 'commands')),
    getSessionName: () => sessionName(runtime),
    getSettings: () => clone(snapshot(runtime, 'settings')),
    exec(command, args = [], options) {
      const context = live(runtime);
      if (typeof command !== 'string' || !command || !Array.isArray(args) || !args.every(arg => typeof arg === 'string')) throw new Error('Pi exec requires a command and string argv');
      return request(runtime, 'exec', [command, args, optionsFor(context, options)]);
    },
    sendUserMessage(content, options) { request(runtime, 'sendUserMessage', [content, options], true); },
    sendMessage(message, options) { request(runtime, 'sendMessage', [message, options], true); },
    appendEntry(customType, data) {
      const context = live(runtime);
      return request(runtime, 'appendEntry', [customType, data], true).then(value => {
        if (value?.sessionCursor >= (context.snapshot.sessionCursor ?? -1)) for (const key of ['sessionCursor', 'sessionEntries', 'sessionBranch']) context.snapshot[key] = value[key];
      });
    },
  }, 'pi');
}
