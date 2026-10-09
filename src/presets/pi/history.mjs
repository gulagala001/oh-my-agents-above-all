import { foldSurface } from '@deepseek-ai/dsh-session';

// This is a read-only DSH message view, not another Pi SessionManager or tree.
export async function piHistoryEntries(events, { content, argumentsFor, selected, projectedMessages, signal }) {
  const entries = [], calls = new Map(), bySeq = new Map(events.map(event => [event.seq, event]));
  for (const event of events) if (event.type === 'tool/call') {
    const matches = calls.get(event.data.callId) ?? [];
    matches.push(event); calls.set(event.data.callId, matches);
  }
  const linkedDispatch = (event, source) => {
    const pending = [event], seen = new Set();
    while (pending.length) {
      const result = pending.pop();
      if (seen.has(result.seq)) continue;
      seen.add(result.seq);
      for (const seq of result.sourceEventSeqs ?? []) {
        const prior = bySeq.get(seq);
        if (!prior || prior.seq >= result.seq) continue;
        if (prior.type === 'tool/call' && prior.data.callId === source.toolCallId) return prior;
        const message = prior.data.message;
        if (prior.type === 'tool/result' && message?.toolCallId === source.toolCallId
          && message.id === source.id) pending.push(prior);
      }
    }
  };
  const ordered = selected ? selected.map(seq => bySeq.get(seq)) : events;
  for (const event of ordered) {
    signal?.throwIfAborted();
    if (!['user/message', 'assistant/message', 'tool/result'].includes(event.type)) continue;
    const source = projectedMessages?.get(event.seq) ?? event.data.message ?? event.data;
    const blocks = [];
    for (const part of source.content ?? []) {
      if (part.type === 'text' || part.type === 'image') blocks.push(...(await content([part], signal)).map(value => ({ ...part, ...value })));
      else if (part.type === 'reasoning') blocks.push({ ...part, type: 'thinking', thinking: part.text });
      else if (part.type === 'tool-call') {
        let args = part.arguments;
        try { args = JSON.parse(args); } catch {}
        if (args && typeof args === 'object' && !Array.isArray(args)) args = argumentsFor(part.name, args);
        blocks.push({ ...part, type: 'toolCall', arguments: args,
          ...(typeof part.arguments === 'string' ? { argumentsRaw: part.arguments } : {}) });
      } else blocks.push(structuredClone(part));
    }
    const timestamp = event.time;
    let message;
    if (event.type === 'user/message') message = source.source?.kind === 'pi-extension'
      ? { role: 'custom', customType: source.source.customType, display: source.source.display, details: source.source.details,
        content: blocks, timestamp: source.source.timestamp ?? timestamp }
      : { role: 'user', content: blocks, timestamp };
    else if (event.type === 'tool/result') {
      const linked = linkedDispatch(event, source);
      const call = linked ?? calls.get(source.toolCallId)?.findLast(call => call.seq < event.seq);
      message = { role: 'toolResult', toolCallId: source.toolCallId,
        toolName: event.data.name ?? call?.data.name, content: blocks, isError: Boolean(source.isError),
        details: event.data.meta?.piExtension?.details ?? {}, timestamp };
    }
    else {
      const response = source.source?.replayState?.response;
      const finish = event.data.stream?.findLast(item => item.chunk?.type === 'finish')?.chunk.reason;
      const usage = event.data.usage;
      message = { role: 'assistant', content: blocks, timestamp,
        api: response?.kind === 'pi-ai' ? response.api : 'dsh', provider: source.source?.provider, model: source.source?.model,
        stopReason: response?.kind === 'pi-ai' ? response.stopReason
          : ({ 'tool-calls': 'toolUse', 'max-tokens': 'length', error: 'error', aborted: 'aborted', completed: 'stop' })[finish?.kind],
        ...(usage ? { usage: { ...usage, input: usage.inputTokens, output: usage.outputTokens, totalTokens: usage.totalTokens } } : {}) };
    }
    entries.push({ type: 'message', id: String(event.seq), parentId: entries.at(-1)?.id ?? null,
      timestamp: new Date(event.time).toISOString(), message });
  }
  return entries;
}

export async function readPiHistory(query, sessionId, { projections = [], ...options }) {
  if (!query?.observeSession) throw Error('The native read-only session query service is unavailable.');
  const observation = await query.observeSession(sessionId, { projectionMode: 'none', signal: options.signal });
  try {
    const events = observation.events, surface = foldSurface(events, projections);
    // Raw and projected views often reference the same immutable image. Share
    // only this observation's conversion, never another session or later cut.
    const images = new Map();
    const content = (blocks, signal) => {
      if (blocks.length !== 1 || blocks[0].type !== 'image') return options.content(blocks, signal);
      const key = JSON.stringify(blocks[0]);
      if (!images.has(key)) images.set(key, options.content(blocks, signal));
      return images.get(key);
    };
    const adapted = { ...options, content };
    const entries = await piHistoryEntries(events, adapted);
    const branch = await piHistoryEntries(events, { ...adapted, selected: surface.nodes, projectedMessages: surface.projectedMessages });
    options.signal?.throwIfAborted();
    return { entries, branch, header: { ...observation.header }, cursor: observation.cursor };
  } finally { observation[Symbol.dispose](); }
}
