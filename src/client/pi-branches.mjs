function requirePi(settings, id, idle = false) {
  const state = settings.getSnapshot();
  if (state.sessionId !== id || state.data?.product?.id !== 'pi') throw new Error('会话已切换，请重新打开分支。');
  if (idle && (state.loading || state.saving || state.error)) throw new Error('请先读取并确认当前会话设置，再创建分支。');
  if (idle && state.data.running) throw new Error('请先停止当前运行，再创建分支。');
}

export function branchTreeRows(branches) {
  const byId = new Map(branches.map(branch => [branch.sessionId, branch])), rows = [], visited = new Set();
  const children = new Map();
  for (const branch of branches) {
    const parent = byId.has(branch.parentSessionId) && branch.parentSessionId !== branch.sessionId ? branch.parentSessionId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(branch);
  }
  const walk = root => {
    const pending = [{ branch: root, depth: 0 }];
    while (pending.length) {
      const { branch, depth } = pending.pop();
      if (visited.has(branch.sessionId)) continue;
      visited.add(branch.sessionId); rows.push({ ...branch, depth });
      for (const child of (children.get(branch.sessionId) || []).slice().reverse()) pending.push({ branch: child, depth: depth + 1 });
    }
  };
  for (const branch of children.get(null) || []) walk(branch);
  // Incomplete parent catalogs and corrupt cycles remain navigable without
  // inventing relationships or recursing indefinitely.
  for (const branch of branches) if (!visited.has(branch.sessionId)) walk(branch);
  return rows;
}

export function createPiBranches(settings, uiWorkspace, sessions, request = fetch) {
  let state = { sessionId: settings.getSnapshot().sessionId, data: null, loading: false, saving: false, error: '' };
  let generation = 0, readController, productId = settings.getSnapshot().data?.product?.id;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const api = async (id, body, signal) => {
    const response = await request(`omaa/api/pi-branches?session=${encodeURIComponent(id)}`, { credentials: 'same-origin', signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  };
  const off = settings.subscribe(() => {
    const current = settings.getSnapshot(), id = current.sessionId, product = current.data?.product?.id;
    if (id === state.sessionId && product === productId) return;
    productId = product;
    readController?.abort(); ++generation;
    emit({ sessionId: id, data: null, loading: false, saving: false, error: '' });
  });
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    async refresh() {
      const id = settings.getSnapshot().sessionId; requirePi(settings, id);
      if (state.saving) return;
      readController?.abort(); readController = new AbortController(); const signal = readController.signal, version = ++generation;
      emit({ sessionId: id, loading: true, error: '' });
      try {
        const data = await api(id, undefined, signal);
        if (!signal.aborted && version === generation && settings.getSnapshot().sessionId === id) emit({ data, loading: false });
      } catch (error) { if (!signal.aborted && version === generation && settings.getSnapshot().sessionId === id) emit({ loading: false, error: error.message }); }
    },
    open(sessionId, expectedId = state.sessionId) {
      requirePi(settings, expectedId);
      if (state.sessionId !== expectedId || !state.data?.branches.some(branch => branch.sessionId === sessionId)) throw new Error('该分支已不在当前分支列表，请刷新。');
      uiWorkspace.openSession(sessionId);
    },
    async fork({ atSeq, withSummary = false } = {}, expectedId = state.sessionId) {
      requirePi(settings, expectedId, true);
      if (state.sessionId !== expectedId || state.loading || state.saving || !state.data?.canFork) throw new Error('当前回合尚不能分叉，请刷新或等待运行结束。');
      if (atSeq !== undefined && !state.data.points.some(point => point.seq === atSeq)) throw new Error('所选回合已不可用，请刷新。');
      const version = ++generation, head = state.data.head;
      emit({ saving: true, error: '' });
      try {
        const result = await api(expectedId, { head, ...(atSeq === undefined ? {} : { atSeq }), withSummary: Boolean(withSummary) });
        if (version !== generation || settings.getSnapshot().sessionId !== expectedId) return result;
        await sessions.refresh();
        if (version !== generation || settings.getSnapshot().sessionId !== expectedId) return result;
        emit({ saving: false, result }); uiWorkspace.openSession(result.sessionId);
        return result;
      } catch (error) {
        if (version === generation && settings.getSnapshot().sessionId === expectedId) emit({ saving: false, error: error.message });
        throw error;
      }
    },
    dispose() { readController?.abort(); ++generation; off(); listeners.clear(); },
  };
}
