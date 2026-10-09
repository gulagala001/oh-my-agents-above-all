export function assertGitSession(settings, id, write = false) {
  const state = settings.getSnapshot();
  if (state.sessionId !== id || state.data?.product?.id !== 'codex') throw new Error('会话已切换，请重新打开审阅。');
  if (write && (state.loading || state.saving || state.error || state.data.running || state.data.mode !== 'default' || state.data.pendingMode)) throw new Error('请在停止运行的执行模式下操作。');
}

export function createGitReviewState(settings, request = fetch) {
  let state = { sessionId: settings.getSnapshot().sessionId, scope: 'unstaged', ref: '', summary: null, diff: null, loading: false, saving: false, error: '', errorCode: '' };
  let generation = 0, controller, productId = settings.getSnapshot().data?.product?.id;
  const listeners = new Set(), emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const api = async (id, query, body, signal) => {
    const response = await request(`omaa/api/git-review?${new URLSearchParams({ session: id, ...query })}`, {
      credentials: 'same-origin', signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error || `HTTP ${response.status}`); error.code = value.code; throw error; }
    return value;
  };
  const read = async (scope = state.scope, ref = state.ref, path) => {
    const id = settings.getSnapshot().sessionId;
    assertGitSession(settings, id);
    if (state.saving) throw new Error('文件操作尚未完成。');
    controller?.abort(); controller = new AbortController(); const signal = controller.signal, revision = ++generation;
    emit({ sessionId: id, scope, ref, loading: true, error: '', errorCode: '', ...(path ? { diff: null } : { summary: null, diff: null }) });
    try {
      const value = await api(id, { scope, ...(ref ? { ref } : {}), ...(path ? { path, revision: state.summary.revision } : {}) }, undefined, signal);
      if (signal.aborted || revision !== generation || settings.getSnapshot().sessionId !== id) return;
      emit({ loading: false, ...(path ? { diff: value } : { summary: value }) });
    } catch (error) { if (!signal.aborted && revision === generation && settings.getSnapshot().sessionId === id) emit({ loading: false, error: error.message, errorCode: error.code || '' }); }
  };
  const unsubscribe = settings.subscribe(() => {
    const current = settings.getSnapshot(), id = current.sessionId, product = current.data?.product?.id;
    if (id !== state.sessionId || product !== productId) {
      productId = product; controller?.abort(); ++generation;
      emit({ sessionId: id, scope: 'unstaged', ref: '', summary: null, diff: null, loading: false, saving: false, error: '', errorCode: '' });
    }
  });
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    async mutate(path, action, hunk) {
      const id = state.sessionId; assertGitSession(settings, id, true);
      if (state.loading || state.saving || !state.summary) throw new Error('请等待当前审阅读取完成。');
      const allowed = hunk === undefined ? state.summary.files.find(file => file.path === path)?.actions : state.diff?.hunkActions?.[hunk];
      if (!allowed?.includes(action) || (hunk !== undefined && state.diff?.diff?.path !== path)) throw new Error('此比较不支持该文件操作。');
      const revision = ++generation, summary = state.summary;
      emit({ saving: true, error: '', errorCode: '' });
      try {
        const result = await api(id, {}, { scope: summary.scope, ...(summary.ref ? { ref: summary.ref } : {}), revision: summary.revision, path, action, ...(hunk === undefined ? {} : { hunk }) });
        if (revision === generation && settings.getSnapshot().sessionId === id) emit({ summary: result.summary, diff: null, saving: false });
        return result;
      } catch (error) {
        if (revision === generation && settings.getSnapshot().sessionId === id) emit({ saving: false, error: error.message, errorCode: error.code || '', ...(error.code === 'revision-conflict' ? { summary: null, diff: null } : {}) });
        throw error;
      }
    },
    dispose() { controller?.abort(); ++generation; unsubscribe(); listeners.clear(); },
  };
}

export function gitReviewErrorHint(code, message) {
  // Match the native Git diagnostic, not arbitrary transport or Git failures.
  if (code === 'GIT_FAILED' && /^fatal: not a git repository(?: \(or any of the parent directories\))?(?::|$)/.test(message)) {
    return '当前目录不属于 Git 仓库；选择仓库后审阅。';
  }
  return null;
}

export function reviewHunkRows(hunk) {
  let old = hunk.oldStart, next = hunk.newStart;
  return hunk.lines.filter(line => /^[ +\-]/.test(line)).map(line => ({
    kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context', text: line.slice(1),
    old: line[0] === '+' ? undefined : old++, new: line[0] === '-' ? undefined : next++,
  }));
}

const MAX_FEEDBACK = 50, MAX_NOTE_BYTES = 4000, MAX_TOTAL_BYTES = 60000;
const bytes = text => new TextEncoder().encode(text).byteLength;
const draftsBySettings = new WeakMap();
const emptyDrafts = Object.freeze({ items: Object.freeze([]), sending: false, editor: null });

function feedbackValue(target, note) {
  if (typeof note !== 'string' || !note.trim()) throw new Error('请填写此行的修改意见。');
  if (bytes(note) > MAX_NOTE_BYTES) throw new Error('单条反馈最多 4000 字节，请缩短修改意见。');
  if (!target || !['unstaged', 'staged', 'commit', 'branch'].includes(target.scope) ||
      typeof target.revision !== 'string' || !target.revision || target.revision.length > 256 ||
      typeof target.path !== 'string' || !target.path || target.path.length > 4096 ||
      (target.ref !== undefined && (typeof target.ref !== 'string' || target.ref.length > 1024)) ||
      !['old', 'new'].includes(target.side) || !Number.isSafeInteger(target.line) || target.line < 1) throw new Error('反馈缺少确切比较位置。');
  return { target: Object.freeze({ scope: target.scope, ...(target.ref === undefined ? {} : { ref: target.ref }), revision: target.revision, path: target.path, side: target.side, line: target.line }), note };
}

function boundedFeedback(values) {
  if (!values.length || values.length > MAX_FEEDBACK) throw new Error('请提交 1 至 50 条审阅反馈。');
  if (bytes(JSON.stringify(values)) > MAX_TOTAL_BYTES) throw new Error('反馈草稿总量超过 60000 字节，请删减后发送。');
  return values;
}

// Ephemeral UI drafts share the existing settings lifetime. They are never a
// Session event, a model queue, localStorage, or an independent journal.
export function reviewDraftsFor(settings) {
  if (draftsBySettings.has(settings)) return draftsBySettings.get(settings);
  const states = new Map(), listeners = new Set(); let serial = 0;
  const getSnapshot = id => states.get(id) ?? emptyDrafts;
  const publish = (id, patch) => {
    states.set(id, Object.freeze({ ...getSnapshot(id), ...patch }));
    for (const listener of listeners) listener();
  };
  const put = (id, items) => { boundedFeedback(items); publish(id, { items: Object.freeze(items) }); };
  const drafts = {
    getSnapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setEditor(id, editor) {
      assertGitSession(settings, id);
      if (!editor) { publish(id, { editor: null }); return; }
      if (typeof editor.note !== 'string' || bytes(editor.note) > MAX_NOTE_BYTES) throw new Error('单条反馈最多 4000 字节，请缩短修改意见。');
      const target = feedbackValue(editor.target, 'draft').target;
      publish(id, { editor: Object.freeze({ target, note: editor.note, key: editor.key ?? null }) });
    },
    add(id, target, note) {
      assertGitSession(settings, id);
      const value = feedbackValue(target, note), key = String(++serial);
      put(id, [...getSnapshot(id).items, Object.freeze({ ...value, key, version: 1 })]);
      return key;
    },
    update(id, key, target, note) {
      assertGitSession(settings, id);
      const old = getSnapshot(id).items.find(item => item.key === key);
      if (!old) throw new Error('该反馈草稿已删除。');
      const value = feedbackValue(target, note);
      put(id, getSnapshot(id).items.map(item => item.key === key ? Object.freeze({ ...value, key, version: old.version + 1 }) : item));
    },
    remove(id, key) {
      assertGitSession(settings, id);
      publish(id, { items: Object.freeze(getSnapshot(id).items.filter(item => item.key !== key)) });
    },
    async submit(id, operation) {
      assertGitSession(settings, id, true);
      if (getSnapshot(id).sending) throw new Error('这批反馈正在提交，请等待宿主接受。');
      const sent = boundedFeedback([...getSnapshot(id).items]);
      publish(id, { sending: true });
      try {
        const result = await operation(sent);
        if (!result?.ok || result.value?.accepted !== true) throw new Error('宿主未接受审阅反馈。');
        const versions = new Map(sent.map(item => [item.key, item.version]));
        // Clear only accepted snapshots, even if another Session is now open.
        const editor = getSnapshot(id).editor;
        const acceptedEditor = editor && sent.some(item => item.key === editor.key && item.note === editor.note && JSON.stringify(item.target) === JSON.stringify(editor.target));
        publish(id, { items: Object.freeze(getSnapshot(id).items.filter(item => versions.get(item.key) !== item.version)), sending: false, ...(acceptedEditor ? { editor: null } : {}) });
        return result;
      } catch (error) { publish(id, { sending: false }); throw error; }
    },
    removeAccepted(id, item) {
      if (!item) return;
      const editor = getSnapshot(id).editor;
      const acceptedEditor = editor?.key === item.key && editor.note === item.note && JSON.stringify(editor.target) === JSON.stringify(item.target);
      publish(id, { items: Object.freeze(getSnapshot(id).items.filter(value => value.key !== item.key || value.version !== item.version)), ...(acceptedEditor ? { editor: null } : {}) });
    },
  };
  draftsBySettings.set(settings, drafts); return drafts;
}

async function submitReviewText(settings, sessions, id, text) {
  assertGitSession(settings, id, true);
  return sessions.using(id, { source: 'omaa-review' }, async reference => {
    const { session } = await reference.ready;
    assertGitSession(settings, id, true);
    if (session.getSnapshot().running) throw new Error('当前会话已经开始运行，请停止后再发送反馈。');
    const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
      if (!result.ok || result.value?.accepted !== true) throw new Error(result.error?.message || '宿主未接受审阅反馈。');
      return result;
    } catch (error) { submission.abandon(); throw error; }
  });
}

export async function sendReviewFeedback(settings, sessions, id, target, note) {
  const value = feedbackValue(target, note); boundedFeedback([value]);
  const text = `Please address this code review feedback. Inspect the current file before editing; the review identifies a specific comparison revision.\n${JSON.stringify(value.target)}\n\n${value.note}`;
  return submitReviewText(settings, sessions, id, text);
}

export async function sendReviewFeedbackBatch(settings, sessions, id, items) {
  const values = boundedFeedback(items.map(item => feedbackValue(item.target, item.note)));
  const text = `Please address these ${values.length} code review comments together. Each comment identifies its original comparison scope and revision; inspect the current files before editing.\n\n` +
    values.map((value, index) => `${index + 1}. ${JSON.stringify(value.target)}\n${value.note}`).join('\n\n');
  return submitReviewText(settings, sessions, id, text);
}
