export function createPresetActivationClient(request = fetch, onSaved = () => {}) {
  let state = { data: null, loading: false, saving: false, error: '', runtime: null };
  let closed = false, ticket = 0, controller;
  const listeners = new Set();
  const emit = patch => { if (!closed) { state = { ...state, ...patch }; for (const fn of listeners) fn(); } };
  async function call(patch, signal) {
    const response = await request('omaa-base/api/presets', { credentials: 'same-origin', signal,
      ...(patch ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    if (!Array.isArray(data.enabled) || !Array.isArray(data.products) || !Number.isSafeInteger(data.revision)) throw Error('预设状态无效。');
    return data;
  }
  const api = {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => state,
    setRuntime: runtime => emit({ runtime }),
    runtimeError: error => emit({ error: error.message }),
    async refresh() {
      if (closed || state.saving) return;
      const current = ++ticket;
      controller?.abort(); controller = new AbortController();
      emit({ loading: true });
      try {
        const data = await call(undefined, controller.signal);
        if (!closed && current === ticket) emit({ data, loading: false, error: data.error || '' });
      } catch (error) { if (!closed && current === ticket) emit({ loading: false, error: error.message }); }
    },
    async select(id, enabled) {
      if (closed || state.loading || state.saving || !state.data) return;
      const current = ++ticket, previous = state.data;
      controller?.abort();
      emit({ saving: true, pending: { id, enabled }, error: '' });
      try {
        const selection = previous.enabled.filter(value => value !== id);
        if (enabled) selection.push(id);
        const data = await call({ enabled: selection, revision: previous.revision });
        if (!closed && current === ticket) {
          emit({ data, saving: false, pending: undefined, error: data.error || '' });
          onSaved();
        }
      } catch (error) {
        if (!closed && current === ticket) {
          // Reload after rejection; do not display an unaccepted optimistic value.
          try { const data = await call(); if (current === ticket) emit({ data }); } catch {}
          emit({ saving: false, pending: undefined, error: error.message });
        }
      }
    },
    dispose() { closed = true; ++ticket; controller?.abort(); listeners.clear(); },
  };
  return api;
}
