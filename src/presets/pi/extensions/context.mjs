import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const text = content => typeof content === 'string' ? content : (content ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
const copy = value => JSON.parse(JSON.stringify(value));

export { getCurrentSystemMessage as currentSystem } from '../../../../lib/pi-context-helpers.mjs';
import { collapseSystemMessages, getSystemMessageText } from '../../../../lib/pi-context-helpers.mjs';

export async function requestToPi(request, { piContent, argumentsFor, signal }) {
  const originals = new Map(), parts = new Map(), messages = [], names = new Map();
  const updates = new Map((request.toolHistory?.updates ?? []).map(item => [item.messageId, item.additions]));
  let firstSystem = true;
  for (const native of request.messages) {
    signal.throwIfAborted();
    let message;
    if (native.role === 'system' || native.role === 'developer') {
      const additions = updates.get(native.id) ?? request.tools;
      message = { role: 'system', content: text(native.content), timestamp: 0,
        ...(firstSystem ? { toolsAdded: copy(request.toolHistory?.tools ?? request.tools) } : {}) };
      const added = native.content.filter(p => p.type === 'tool-addition').map(part => additions.find(tool => tool.name === part.toolName));
      if (added.some(tool => !tool)) throw Error('Pi context cannot resolve a historical tool declaration');
      if (added.length) message.toolsAdded = [...message.toolsAdded ?? [], ...copy(added)];
      const removed = native.content.filter(p => p.type === 'tool-removal').map(part => ({ name: part.toolName }));
      if (removed.length) message.toolsRemoved = removed;
      firstSystem = false;
    } else {
      const content = [];
      for (const part of native.content) {
        if (part.type === 'text' || part.type === 'image') {
          for (const converted of await piContent([part], signal)) {
            const value = { ...part, ...converted };
            parts.set(JSON.stringify(value), part); content.push(value);
          }
        }
        else if (part.type === 'reasoning') content.push({ ...part, type: 'thinking', thinking: part.text });
        else if (part.type === 'tool-call') {
          let args; try { args = JSON.parse(part.arguments); } catch { args = part.arguments; }
          names.set(part.id, part.name);
          content.push({ type: 'toolCall', id: part.id, name: part.name,
            arguments: args && typeof args === 'object' && !Array.isArray(args) ? argumentsFor(part.name, args) : args, argumentsRaw: part.arguments });
        } else { const value = copy(part); parts.set(JSON.stringify(value), part); content.push(value); }
      }
      message = { role: native.role === 'tool' ? 'toolResult' : native.source?.kind === 'pi-extension' ? 'custom' : native.role, content, timestamp: 0 };
      if (message.role === 'toolResult') Object.assign(message, { toolCallId: native.toolCallId, toolName: names.get(native.toolCallId), isError: Boolean(native.isError), details: {} });
      if (message.role === 'custom') Object.assign(message, { customType: native.source.customType, display: native.source.display, details: native.source.details });
      if (message.role === 'assistant') Object.assign(message, { api: native.source?.replayState?.response?.api ?? 'dsh',
        provider: native.source?.provider, model: native.source?.model,
        stopReason: native.content.some(p => p.type === 'tool-call') ? 'toolUse' : 'stop' });
    }
    message = copy(message);
    const key = JSON.stringify(message), matches = originals.get(key) ?? [];
    matches.push(native); originals.set(key, matches);
    messages.push(message);
  }
  return { messages, originals, parts };
}

export async function requestFromPi(messages, { originals, parts: originalParts = new Map(), request, admitContent, nativeArguments, signal }) {
  if (!Array.isArray(messages) || messages.length > 100000) throw Error('Pi context must return a bounded message array');
  if (messages.some(message => message?.role === 'system' && message.sections)) {
    for (const message of messages) if (message.sections && (typeof message.sections !== 'object' || Array.isArray(message.sections) || Object.values(message.sections).some(value => value !== null && typeof value !== 'string'))) throw Error('Invalid Pi system sections');
    messages = collapseSystemMessages({ messages }).messages;
  }
  const result = [], tools = new Map(), updates = [], initialTools = [];
  const available = new Set(request.tools.map(tool => tool.name));
  const calls = new Map(), used = new Map();
  let firstSystem = true;
  for (const message of messages) {
    signal.throwIfAborted();
    if (!message || !['system', 'user', 'custom', 'assistant', 'toolResult'].includes(message.role)) throw Error('Unsupported Pi context message role');
    if (calls.size && message.role !== 'toolResult') throw Error('Pi context inserted a message inside a tool call/result batch');
    const key = JSON.stringify(message), count = used.get(key) ?? 0;
    const original = originals.get(key)?.[count]; used.set(key, count + 1);
    if (message.role === 'system') {
      if (typeof message.content !== 'string' && (!Array.isArray(message.content) || message.content.some(p => p.type !== 'text' || typeof p.text !== 'string')))
        throw Error('Pi system content must be text');
      const additions = message.toolsAdded ?? [], removals = message.toolsRemoved ?? [];
      if (!Array.isArray(additions) || !Array.isArray(removals)) throw Error('Pi system tool declarations must be arrays');
      for (const tool of removals) tools.delete(typeof tool === 'string' ? tool : tool?.name);
      for (const tool of additions) {
        // Historical definitions can survive a later removal; unknown names
        // never gain execution capability from a context-only declaration.
        if (!tool || typeof tool.name !== 'string' || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) throw Error('Invalid Pi tool declaration');
        tools.set(tool.name, copy({ name: tool.name, description: tool.description, parameters: tool.parameters }));
      }
      const id = original?.id ?? randomUUID(), content = [{ type: 'text', text: getSystemMessageText(message) }];
      if (firstSystem) initialTools.push(...additions.map(t => copy({ name: t.name, description: t.description, parameters: t.parameters })));
      else {
        content.push(...additions.map(tool => ({ type: 'tool-addition', toolName: tool.name })),
          ...removals.map(tool => ({ type: 'tool-removal', toolName: typeof tool === 'string' ? tool : tool.name })));
        if (additions.length) updates.push({ messageId: id, additions: copy(additions) });
      }
      result.push({ id, role: firstSystem ? 'system' : 'developer', content,
        source: firstSystem ? { kind: 'system-prompt' } : { kind: 'tool-registry' } });
      firstSystem = false;
      continue;
    }
    const parts = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
    if (!Array.isArray(parts)) throw Error('Pi context message content must be text or blocks');
    const content = [];
    for (const part of parts) {
      const retained = originalParts.get(JSON.stringify(part));
      if (retained) content.push(retained);
      else if (part.type === 'text' || part.type === 'image') content.push(...await admitContent([part], signal));
      else if (part.type === 'thinking' && message.role === 'assistant' && typeof part.thinking === 'string') {
        const { thinking, type: _type, ...rest } = part;
        content.push({ ...rest, type: 'reasoning', text: thinking });
      } else if (part.type === 'toolCall' && message.role === 'assistant' && typeof part.id === 'string' && typeof part.name === 'string') {
        if (calls.has(part.id)) throw Error('Pi context has duplicate tool call IDs');
        const args = nativeArguments(part.name, part.arguments);
        let raw = JSON.stringify(args);
        if (typeof part.argumentsRaw === 'string') {
          try { if (isDeepStrictEqual(JSON.parse(part.argumentsRaw), args)) raw = part.argumentsRaw; } catch { if (original) raw = part.argumentsRaw; }
        }
        content.push({ type: 'tool-call', id: part.id, name: part.name, arguments: raw });
        calls.set(part.id, part.name);
      } else if (original) content.push(copy(part));
      else throw Error('Pi context cannot construct this native content type');
    }
    const role = message.role === 'custom' ? 'user' : message.role === 'toolResult' ? 'tool' : message.role;
    if (role === 'tool') {
      if (!calls.has(message.toolCallId)) throw Error('Pi context has an orphan tool result');
      calls.delete(message.toolCallId);
    }
    if (original) result.push(original);
    else result.push({ id: randomUUID(), role, content,
      ...(role === 'tool' ? { toolCallId: message.toolCallId, isError: Boolean(message.isError), source: { kind: 'tool', callId: message.toolCallId } }
        : role === 'assistant' ? { source: { kind: 'model', provider: message.provider ?? '', model: message.model ?? '' } }
        : { source: { kind: 'pi-extension', form: 'context', customType: message.customType ?? 'context', display: false } }) });
  }
  if (calls.size) throw Error('Pi context omitted a tool result without its call');
  if ([...tools.keys()].some(name => !available.has(name))) throw Error('Pi context cannot enable tools outside the active native loadout');
  const projected = { messages: result, tools: [...tools.values()], toolHistory: { tools: initialTools, updates } };
  // Keep native references/signatures/caches when both callbacks were no-ops.
  return isDeepStrictEqual(projected, request) ? undefined : projected;
}
