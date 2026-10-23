import { cursorReviewOptions } from '../shared/cursor-review.mjs';

export function assertCursorReview(settings, id) {
  const current = settings.getSnapshot();
  if (!id || current.sessionId !== id || current.data?.product?.id !== 'cursor') throw Error('会话已切换，请重新打开 Cursor 审阅。');
  return current;
}
const initial = id => ({ sessionId: id, options: { scope: 'working' }, summary: null, detail: null, notes: null,
  editors: [], openingEditor: false, editorResult: null, refs: [], currentBranch: '', turns: [], reading: false, writing: false, notesLoading: false, error: '' });
const instances = new WeakMap();

export function createCursorReviewState(settings, request = fetch) {
  let state = initial(settings.getSnapshot().sessionId), generation = 0, reader, notesReader, editorRequest, disposed = false;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const owns = (id, ticket) => !disposed && generation === ticket && settings.getSnapshot().sessionId === id && settings.getSnapshot().data?.product?.id === 'cursor';
  async function api(id, query = {}, body, signal) {
    const params = new URLSearchParams({ session: id });
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
    const response = await request(`omaa/api/cursor-review?${params}`, { credentials: 'same-origin', signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw Object.assign(Error(value.error || `HTTP ${response.status}`), { code: value.code });
    return value;
  }
  async function refreshNotes() {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    notesReader?.abort(); notesReader = new AbortController(); const signal = notesReader.signal;
    emit({ notesLoading: true });
    try {
      const notes = await api(id, { kind: 'notes' }, undefined, signal);
      if (!signal.aborted && owns(id, ticket)) emit({ notes, notesLoading: false });
    } catch (error) { if (!signal.aborted && owns(id, ticket)) emit({ notesLoading: false, error: error.message }); }
  }
  async function open(input = state.options) {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    reader?.abort(); reader = new AbortController(); const signal = reader.signal;
    const options = cursorReviewOptions(input);
    const requestedPath = options.path; delete options.path; delete options.revision;
    emit({ options, reading: true, summary: null, detail: null, error: '' });
    try {
      const summary = await api(id, options, undefined, signal);
      if (signal.aborted || !owns(id, ticket)) return;
      const file = summary.files.find(file => file.path === requestedPath) ?? summary.files[0];
      emit({ summary, options: { ...options, ...(summary.ref ? { ref: summary.ref } : {}) } });
      const detail = file && await api(id, { ...options, path: file.path, revision: summary.revision }, undefined, signal);
      if (!signal.aborted && owns(id, ticket)) emit({ detail: detail ?? null, reading: false });
    } catch (error) { if (!signal.aborted && owns(id, ticket)) emit({ reading: false, error: error.message, ...(error.code === 'revision-conflict' ? { summary: null, detail: null } : {}) }); }
  }
  async function select(path) {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    if (!state.summary?.files.some(file => file.path === path)) throw Error('请选择当前比较中的文件。');
    reader?.abort(); reader = new AbortController(); const signal = reader.signal;
    emit({ reading: true, detail: null, error: '' });
    try {
      const detail = await api(id, { ...state.options, path, revision: state.summary.revision }, undefined, signal);
      if (!signal.aborted && owns(id, ticket)) emit({ detail, reading: false });
    } catch (error) { if (!signal.aborted && owns(id, ticket)) emit({ reading: false, error: error.message, ...(error.code === 'revision-conflict' ? { summary: null } : {}) }); }
  }
  async function metadata() {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    const results = await Promise.allSettled([api(id, { kind: 'references' }), api(id, { kind: 'turns' }), api(id, { kind: 'editors' })]);
    if (!owns(id, ticket)) return;
    emit({ editors: results[2].status === 'fulfilled' ? results[2].value.editors : [], refs: results[0].status === 'fulfilled' ? results[0].value.refs : [],
      currentBranch: results[0].status === 'fulfilled' ? results[0].value.current : '',
      turns: results[1].status === 'fulfilled' ? results[1].value.turns : [] });
  }
  async function openEditor(input) {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    if (state.openingEditor) throw Error('正在请求编辑器定位，请稍候。');
    editorRequest = new AbortController(); const signal = editorRequest.signal;
    emit({ openingEditor: true, editorResult: null, error: '' });
    try {
      const result = await api(id, {}, { ...input, action: 'open-editor' }, signal);
      if (owns(id, ticket)) emit({ openingEditor: false, editorResult: result });
      return result;
    } catch (error) {
      if (owns(id, ticket)) emit({ openingEditor: false, error: error.message });
      throw error;
    }
  }
  async function update(patch) {
    const id = state.sessionId, ticket = generation; assertCursorReview(settings, id);
    if (state.writing || state.notesLoading || !state.notes) throw Error('请等待批注加载或保存完成。');
    emit({ writing: true, error: '' });
    try {
      const notes = await api(id, {}, { ...patch, revision: state.notes.revision });
      if (owns(id, ticket)) emit({ notes, writing: false });
      return notes;
    } catch (error) {
      if (owns(id, ticket)) { emit({ writing: false, error: error.message }); await refreshNotes(); }
      throw error;
    }
  }
  const off = settings.subscribe(() => {
    const current = settings.getSnapshot();
    if (current.sessionId === state.sessionId && (current.data?.product?.id === 'cursor' || current.loading)) return;
    ++generation; reader?.abort(); notesReader?.abort(); editorRequest?.abort(); emit(initial(current.sessionId));
  });
  return { getSnapshot: () => state, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    open, select, metadata, refreshNotes, update, openEditor,
    dispose() { disposed = true; ++generation; off(); reader?.abort(); notesReader?.abort(); editorRequest?.abort(); listeners.clear(); } };
}

export function cursorReviewFor(settings) {
  if (!instances.has(settings)) instances.set(settings, createCursorReviewState(settings));
  return instances.get(settings);
}
export function disposeCursorReview(settings) { instances.get(settings)?.dispose(); instances.delete(settings); }

export async function submitCursorReview(settings, store, action, extra = {}, expectedId = store.getSnapshot().sessionId) {
  const id = expectedId, current = assertCursorReview(settings, id);
  if (store.getSnapshot().sessionId !== id) throw Error('会话已切换，未发送审阅请求。');
  if (current.loading || current.saving || current.error || current.data.running || current.data.pendingMode || current.data.mode === 'plan') throw Error('请先停止任务并结束计划模式，再提交审阅。');
  const mode = action === 'find-issues' ? 'ask' : 'default';
  if (current.data.mode !== mode) await settings.update({ mode }, id);
  const confirmed = assertCursorReview(settings, id);
  if (confirmed.loading || confirmed.saving || confirmed.error || confirmed.data.mode !== mode || confirmed.data.pendingMode || confirmed.data.running) throw Error('会话模式尚未确认，未发送审阅请求。');
  return store.update({ action, ...extra });
}

export function cursorReviewed(notes, summary, path) {
  return Boolean(summary && notes?.reviewed.some(item => item.root === summary.root && item.scope === summary.scope && item.revision === summary.revision && item.path === path));
}
