// The DSH journal is authoritative. Navigation appends a leaf selection; it
// never deletes a message or rewrites another branch's parentage.
export const treeRecord = 'plugin:omaa/pi-tree';
export function indexPiTree(events) {
  const nodes = new Map(), labels = new Map(); let leafId = null;
  for (const event of events) {
    if (event.type === treeRecord) {
      const target = event.data.leafId;
      if (target !== null && !nodes.has(target)) throw Error('Pi tree journal references a missing leaf');
      leafId = target;
      if (event.data.summaryEntry) { const entry = event.data.summaryEntry; nodes.set(entry.id, { id: entry.id, parentId: leafId, seq: event.seq }); leafId = entry.id; }
      if (event.data.labelTarget) labels.set(event.data.labelTarget, event.data.label);
    } else if (event.type === 'plugin:omaa/pi-boundary') {
      for (const entry of event.data.entries) { nodes.set(entry.id, { id: entry.id, parentId: leafId, seq: event.seq }); leafId = entry.id; }
    } else if (event.type === 'plugin:omaa/pi-entry' || ['user/message', 'assistant/message', 'tool/result'].includes(event.type)) {
      const message = event.data.message ?? event.data;
      if (message.source?.piBoundaryEntryId || message.source?.piContinuation) continue;
      const id = String(event.seq); nodes.set(id, { id, parentId: leafId, seq: event.seq }); leafId = id;
    }
  }
  const branch = (fromId = leafId) => {
    const result = []; let current = fromId;
    while (current !== null) {
      const node = nodes.get(current); if (!node) throw Error('Pi tree branch references a missing entry');
      result.push(node); current = node.parentId;
    }
    return result.reverse();
  };
  return { nodes, labels, leafId, branch };
}
export function treeHistory(events, entries) {
  const tree = indexPiTree(events), byId = new Map(entries.map(entry => [entry.id, entry]));
  const all = [...tree.nodes.values()].map(node => ({ ...byId.get(node.id), id: node.id, parentId: node.parentId,
    ...(tree.labels.has(node.id) ? { label: tree.labels.get(node.id) } : {}) }));
  const map = new Map(all.map(entry => [entry.id, entry]));
  return { entries: all, branch: tree.branch().map(node => map.get(node.id)), leafId: tree.leafId };
}
export function selectTreeRequest(request, events) {
  if (!events.some(event => event.type === treeRecord)) return { request, events };
  const tree = indexPiTree(events), selected = new Set(tree.branch().map(node => node.id));
  const current = new Map(request.messages.map(message => [message.id, message]));
  const chosen = events.flatMap(event => {
    if (event.type === treeRecord && event.data.summaryEntry && selected.has(event.data.summaryEntry.id))
      return [{ ...event, type: 'plugin:omaa/pi-boundary', data: { entries: [event.data.summaryEntry], messages: [] } }];
    if (event.type === 'plugin:omaa/pi-boundary') {
      const entries = event.data.entries.filter(entry => selected.has(entry.id));
      return entries.length ? [{ ...event, data: { ...event.data, entries } }] : [];
    }
    const message = event.data.message ?? event.data;
    return selected.has(String(event.seq)) || message.source?.piBoundaryEntryId && selected.has(message.source.piBoundaryEntryId) ? [event] : [];
  });
  const system = request.messages.filter(message => message.role === 'system');
  const messages = chosen.flatMap(event => {
    if (!['user/message', 'assistant/message', 'tool/result'].includes(event.type)) return [];
    const source = event.data.message ?? event.data;
    return [current.get(source.id) ?? { ...source, role: event.type === 'assistant/message' ? 'assistant' : event.type === 'tool/result' ? 'tool' : 'user' }];
  });
  return { request: { ...request, messages: [...system, ...messages], toolHistory: { tools: request.tools, updates: [] } }, events: chosen };
}

