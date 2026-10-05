import { createJiti } from 'jiti';
import * as typebox from 'typebox';
import * as typeboxValue from 'typebox/value';
import * as typeboxCompile from 'typebox/compile';
import * as legacyTypebox from '@sinclair/typebox';
import * as legacyTypeboxValue from '@sinclair/typebox/value';
import * as legacyTypeboxCompiler from '@sinclair/typebox/compiler';
import { format } from 'node:util';
import path from 'node:path';
import { callbackContext, codingAgentShim, aiShim, createPiAPI, createCallbackContext, supportedEvents } from './pi-api.mjs';

// Fixed upstream's pure argument validator; no Pi provider or agent runtime.
const validatorImporter = createJiti(import.meta.url, { fsCache: false, moduleCache: false, tryNative: false,
  virtualModules: { 'typebox/value': typeboxValue, 'typebox/compile': typeboxCompile } });
const { validateToolArguments } = await validatorImporter.import('./validation.ts');

const MAX_JSON_BYTES = 2 * 1024 * 1024, MAX_FILES = 32, MAX_CALLBACKS = 64;
const writeProtocol = process.stdout.write.bind(process.stdout);
// Also redirect node:console's named methods, which retain the original
// Console instance rather than looking up globalThis.console at call time.
console._stdout = process.stderr;
console._stderr = process.stderr;
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'dir']) console[method] = (...args) => process.stderr.write(format(...args).slice(0, 65536) + '\n');
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 || Number.isSafeInteger(id) && id >= 0;
const errorText = error => String(error?.message ?? error).slice(0, 4096);
function send(frame) {
  const line = JSON.stringify(frame);
  if (Buffer.byteLength(line) > MAX_JSON_BYTES) throw new Error('Pi extension protocol output exceeds 2 MiB');
  writeProtocol(line + '\n');
}
const pendingAPI = new Map(), active = new Map();
let generation = 0, apiCounter = 0, callbackCounter = 0, runtime, loading = false;

function apiRequest(context, method, args, voidAction) {
  context.controller.signal.throwIfAborted();
  if (pendingAPI.size >= 256) throw new Error('Pi extension exceeds 256 pending API calls');
  const id = 'api:' + ++apiCounter;
  const deferred = Promise.withResolvers();
  const promise = deferred.promise;
  const cleanup = () => { pendingAPI.delete(id); context.pending.delete(promise); context.controller.signal.removeEventListener('abort', abort); };
  const abort = () => deferred.reject(context.controller.signal.reason ?? new Error('Pi extension callback canceled'));
  pendingAPI.set(id, { ...deferred, context }); context.pending.add(promise);
  context.controller.signal.addEventListener('abort', abort, { once: true });
  promise.then(cleanup, error => { if (voidAction) context.voidErrors.push(error); cleanup(); });
  try { send({ type: 'api', id, requestId: context.id, method, args }); }
  catch (error) { deferred.reject(error); throw error; }
  return promise;
}
async function drain(context) {
  while (context.pending.size) await Promise.allSettled([...context.pending]);
  context.controller.signal.throwIfAborted();
  if (context.voidErrors.length) throw context.voidErrors[0];
}
function newRuntime() {
  return { active: true, generation: ++generation, extensions: [], callbacks: new Map(), request: apiRequest,
    callbackId: kind => kind + ':' + generation + ':' + ++callbackCounter };
}
function descriptor(definition, callbackId) {
  const result = { name: definition.name, label: definition.label ?? definition.name, description: definition.description,
    parameters: JSON.parse(JSON.stringify(definition.parameters)), callbackId,
    prepareArguments: definition.prepareArguments !== undefined, prepareLoadout: definition.prepareLoadout !== undefined };
  for (const key of ['promptSnippet', 'promptGuidelines', 'exposure', 'namespace', 'annotations', 'defaultActive', 'executionMode', 'outputSchema']) {
    if (definition[key] !== undefined) result[key] = JSON.parse(JSON.stringify(definition[key]));
  }
  return result;
}
async function load(frame, context) {
  if (loading || [...active.values()].some(item => item !== context)) throw new Error('Cannot reload Pi extensions while callbacks are active');
  if (!Array.isArray(frame.files) || frame.files.length > MAX_FILES || !frame.files.every(file => typeof file === 'string' && path.isAbsolute(file) && file.length <= 4096)) throw new Error('Pi extension load requires at most 32 absolute file paths');
  loading = true;
  const candidate = newRuntime(); context.runtime = candidate;
  const virtualModules = {
    typebox, 'typebox/value': typeboxValue, 'typebox/compile': typeboxCompile,
    '@sinclair/typebox': legacyTypebox, '@sinclair/typebox/value': legacyTypeboxValue, '@sinclair/typebox/compiler': legacyTypeboxCompiler,
    '@earendil-works/pi-coding-agent': codingAgentShim, '@mariozechner/pi-coding-agent': codingAgentShim,
    '@earendil-works/pi-ai': aiShim, '@mariozechner/pi-ai': aiShim,
  };
  const importer = createJiti(import.meta.url, { fsCache: false, moduleCache: false, tryNative: false, virtualModules });
  try {
    for (const file of [...new Set(frame.files)]) {
      context.controller.signal.throwIfAborted();
      const factory = await importer.import(file, { default: true });
      if (typeof factory !== 'function') throw new Error('Pi extension must export a default factory: ' + file);
      const extension = { file, tools: new Map(), commands: new Map(), events: new Map(), handlerCount: 0 };
      await factory(createPiAPI(candidate, extension));
      context.controller.signal.throwIfAborted();
      candidate.extensions.push(extension);
    }
    const tools = new Map(), commands = new Map(), events = new Set();
    for (const extension of candidate.extensions) {
      for (const [name, tool] of extension.tools) if (!tools.has(name)) {
        tools.set(name, descriptor(tool.definition, tool.callbackId));
        candidate.callbacks.set(tool.callbackId, { kind: 'tool', definition: tool.definition });
      }
      for (const [name, command] of extension.commands) if (!commands.has(name)) {
        commands.set(name, { name, description: command.description, callbackId: command.callbackId });
        candidate.callbacks.set(command.callbackId, { kind: 'command', definition: command });
      }
      for (const eventName of extension.events.keys()) events.add(eventName);
    }
    const value = { tools: [...tools.values()], commands: [...commands.values()], events: [...events] };
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_JSON_BYTES - 1024) throw new Error('Pi extension registration exceeds its protocol budget');
    if (runtime) runtime.active = false;
    runtime = candidate;
    return value;
  } catch (error) { candidate.active = false; throw error; }
  finally { loading = false; }
}
async function dispatchEvent(frame, context) {
  const eventName = frame.eventName;
  if (!supportedEvents.has(eventName)) throw new Error('Unsupported Pi extension event: ' + eventName);
  const handlers = context.runtime.extensions.flatMap(extension => (extension.events.get(eventName) ?? []).slice());
  const event = { ...(frame.event ?? {}), type: eventName };
  const ctx = createCallbackContext(context.runtime);
  if (eventName === 'input') {
    const originalText = event.text, originalImages = event.images;
    for (const { handler } of handlers) {
      context.controller.signal.throwIfAborted();
      const result = await handler(event, ctx);
      if (result?.action === 'handled') return { action: 'handled' };
      if (result?.action === 'transform') {
        if (typeof result.text !== 'string') throw new Error('Pi input transform requires text');
        event.text = result.text; if (result.images !== undefined) event.images = result.images;
      } else if (result?.action !== undefined && result.action !== 'continue') throw new Error('Invalid Pi input event result');
    }
    return event.text !== originalText || event.images !== originalImages
      ? { action: 'transform', text: event.text, ...(event.images === undefined ? {} : { images: event.images }) } : { action: 'continue' };
  }
  if (eventName === 'tool_call') {
    if (!event.input || typeof event.input !== 'object' || Array.isArray(event.input)) throw new Error('Pi tool_call requires input');
    let decision;
    for (const { handler } of handlers) {
      context.controller.signal.throwIfAborted(); decision = await handler(event, ctx) ?? decision;
      if (decision?.block) return { ...decision, input: event.input };
    }
    return { ...(decision ?? {}), input: event.input };
  }
  if (eventName === 'tool_result') {
    let modified = false;
    for (const { handler } of handlers) {
      const result = await handler(event, ctx); if (!result) continue;
      if (result.content !== undefined && result.structuredContent === undefined) delete event.structuredContent;
      for (const key of ['content', 'details', 'structuredContent', 'isError', 'usage']) if (result[key] !== undefined) { event[key] = result[key]; modified = true; }
    }
    if (!modified) return undefined;
    return Object.fromEntries(['content', 'details', 'structuredContent', 'isError', 'usage'].filter(key => event[key] !== undefined).map(key => [key, event[key]]));
  }
  for (const { handler } of handlers) { context.controller.signal.throwIfAborted(); await handler(event, ctx); }
}
async function invoke(frame, context) {
  if (loading || !runtime?.active) throw new Error('Pi extensions are not loaded');
  context.runtime = runtime; context.kind = frame.kind;
  const ctx = createCallbackContext(runtime);
  if (frame.kind === 'event') return dispatchEvent(frame, context);
  const callback = runtime.callbacks.get(frame.callbackId);
  if (!callback || callback.kind !== frame.kind) throw new Error('Unknown Pi extension callback');
  if (frame.kind === 'command') return callback.definition.handler(frame.args ?? '', ctx);
  if (frame.kind !== 'tool') throw new Error('Invalid Pi extension invocation kind');
  if (typeof frame.callId !== 'string' || !frame.callId || frame.callId.length > 512) throw new Error('Pi tool invocation requires callId');
  if (callback.definition.prepareArguments !== undefined || callback.definition.prepareLoadout !== undefined) throw new Error('Unsupported Pi extension tool prepareArguments/prepareLoadout');
  const params = validateToolArguments(callback.definition, { name: callback.definition.name, arguments: frame.params });
  const onUpdate = value => { context.controller.signal.throwIfAborted(); send({ type: 'update', requestId: context.id, value }); };
  return callback.definition.execute(frame.callId, params, context.controller.signal, onUpdate, ctx);
}
async function processRequest(frame) {
  if (!validId(frame.id)) throw new Error('Pi extension protocol requires an id');
  if (active.has(frame.id)) { send({ type: 'result', id: frame.id, error: 'Duplicate active Pi extension request id' }); return; }
  if (active.size >= MAX_CALLBACKS) { send({ type: 'result', id: frame.id, error: 'Pi extension exceeds 64 active callbacks' }); return; }
  if (frame.snapshot !== undefined && (!frame.snapshot || typeof frame.snapshot !== 'object' || Array.isArray(frame.snapshot))) {
    send({ type: 'result', id: frame.id, error: 'Invalid Pi extension context snapshot' }); return;
  }
  const context = { id: frame.id, phase: frame.type, snapshot: frame.snapshot ?? {}, controller: new AbortController(),
    pending: new Set(), voidErrors: [], finished: false };
  active.set(frame.id, context);
  try {
    const value = await callbackContext.run(context, () => frame.type === 'load' ? load(frame, context) : invoke(frame, context));
    await drain(context);
    send({ type: 'result', id: frame.id, ...(value === undefined ? {} : { value }) });
  } catch (error) {
    // Still wait for callback-owned host work before publishing its failure.
    await drain(context).catch(() => {});
    send({ type: 'result', id: frame.id, error: errorText(error) });
  } finally { context.finished = true; active.delete(frame.id); }
}
function dispatch(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error('Invalid Pi extension protocol frame');
  if (frame.type === 'api-result') {
    const pending = pendingAPI.get(frame.id); if (!pending) return;
    if (frame.error !== undefined) pending.reject(new Error(String(frame.error))); else pending.resolve(frame.value);
  } else if (frame.type === 'cancel') active.get(frame.id)?.controller.abort(new Error('Pi extension callback canceled'));
  else if (frame.type === 'load' || frame.type === 'invoke') void processRequest(frame).catch(error => {
    console.error('Pi extension protocol failure: ' + errorText(error)); process.exitCode = 1; process.stdin.destroy();
  });
  else throw new Error('Unsupported Pi extension protocol frame: ' + frame.type);
}
let input = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  try {
    input = Buffer.concat([input, chunk]);
    let newline;
    while ((newline = input.indexOf(10)) !== -1) {
      if (newline > MAX_JSON_BYTES) throw new Error('Pi extension protocol input exceeds 2 MiB');
      const line = input.subarray(0, newline); input = input.subarray(newline + 1);
      if (line.length) dispatch(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
    }
    if (input.length > MAX_JSON_BYTES) throw new Error('Pi extension protocol input exceeds 2 MiB');
  } catch (error) { console.error(errorText(error)); process.exitCode = 1; process.stdin.destroy(); }
});
function shutdown() {
  if (runtime) runtime.active = false;
  for (const context of active.values()) context.controller.abort(new Error('Pi extension guest stdin closed'));
  for (const pending of pendingAPI.values()) pending.reject(new Error('Pi extension guest stdin closed'));
  process.exit(process.exitCode || 0);
}
process.stdin.once('end', shutdown);
process.stdin.once('close', shutdown);
