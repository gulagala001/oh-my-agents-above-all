import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { assertGitSession, createGitReviewState, gitReviewErrorHint, reviewDraftsFor, reviewHunkRows, sendReviewFeedback, sendReviewFeedbackBatch } from './git-review-state.mjs';
import { checkpointFileAddress, checkpointReviewAddress } from './checkpoint-navigation.mjs';
import css from './git-review.css';

const labels = { stage: '暂存', unstage: '取消暂存', revert: '撤回改动' };
const scopes = { unstaged: 'Unstaged · 工作树', staged: 'Staged · 暂存区', commit: 'Commit · 提交', branch: 'Branch · 分支' };

export function GitReview({ settings, sidebarRight, sessions, visible = true }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const store = useMemo(() => createGitReviewState(settings), [settings]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const enabled = current.data?.product?.id === 'codex', id = current.sessionId;
  const drafts = useMemo(() => reviewDraftsFor(settings), [settings]);
  const draftState = useSyncExternalStore(drafts.subscribe, () => drafts.getSnapshot(id));
  const { target, note = '', key: editingKey } = draftState.editor ?? {};
  const [reference, setReference] = useState('');
  const [error, setError] = useState(''), [sending, setSending] = useState(false), [wrap, setWrap] = useState(false);
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => { setError(''); setSending(false); setReference(''); }, [id, enabled]);
  useEffect(() => {
    if (enabled && visible && !current.data?.running) store.read().catch(error => { if (settings.getSnapshot().sessionId === id && settings.getSnapshot().data?.product?.id === 'codex') setError(error.message); });
  }, [store, id, enabled, visible, current.data?.running]);
  if (!enabled || !visible) return null;
  const summary = state.sessionId === id ? state.summary : null, diff = state.diff?.diff;
  const busy = state.loading || state.saving || sending || draftState.sending;
  const diagnostic = state.error || error, errorHint = state.error && gitReviewErrorHint(state.errorCode, state.error);
  const canWrite = !busy && !current.loading && !current.saving && !current.error && !current.data.running && !current.data.pendingMode && current.data.mode === 'default';
  const run = operation => { setError(''); Promise.resolve().then(operation).catch(error => { if (settings.getSnapshot().sessionId === id) setError(error.message); }); };
  const navigate = operation => run(() => { assertGitSession(settings, id); if (sidebarRight.mounted.getSnapshot() !== id) throw new Error('会话已切换。'); operation(); });
  const saveEditor = (close = true) => {
    if (!target || !note.trim()) return null;
    let key = editingKey;
    if (key) drafts.update(id, key, target, note);
    else key = drafts.add(id, target, note);
    const item = drafts.getSnapshot(id).items.find(item => item.key === key);
    drafts.setEditor(id, close ? null : { target, note, key });
    return item;
  };
  const chooseScope = scope => {
    if (scope === 'last-turn') return navigate(() => sidebarRight.openResourceIn(id, checkpointReviewAddress(id, { ...summary.lastTurn, reviewAvailable: true })));
    run(() => { saveEditor(); setReference(''); return store.read(scope, ''); });
  };
  const chooseFile = path => run(() => { saveEditor(); return store.read(state.scope, state.ref, path); });
  const mutate = (path, action, hunk) => run(() => store.mutate(path, action, hunk));
  const selectLine = (row, side) => run(() => {
    saveEditor();
    drafts.setEditor(id, { target: { scope: summary.scope, ref: summary.ref, revision: summary.revision, path: diff.path, side, line: row[side] }, note: '' });
  });
  const feedback = () => run(async () => {
    const item = saveEditor(false);
    setSending(true);
    try {
      await sendReviewFeedback(settings, sessions, id, target, note);
      drafts.removeAccepted(id, item);
    } finally { if (settings.getSnapshot().sessionId === id) setSending(false); }
  });
  const editDraft = item => run(() => {
    if (editingKey === item.key) return;
    saveEditor();
    const latest = drafts.getSnapshot(id).items.find(value => value.key === item.key);
    if (latest) drafts.setEditor(id, { target: latest.target, note: latest.note, key: latest.key });
  });
  const deleteDraft = item => run(() => {
    drafts.remove(id, item.key);
    if (editingKey === item.key) drafts.setEditor(id, null);
  });
  const submitDrafts = () => run(async () => {
    if (drafts.getSnapshot(id).sending) throw new Error('这批反馈正在提交，请等待宿主接受。');
    saveEditor(false);
    await drafts.submit(id, items => sendReviewFeedbackBatch(settings, sessions, id, items));
  });
  return <section className="omaa-git-review" aria-busy={busy || undefined} aria-label="Codex Git 审阅">
    <style>{css}</style>
    <header><h3>代码审阅</h3><button type="button" disabled={busy} onClick={() => run(() => store.read())}>刷新</button></header>
    <label className="omaa-git-scope">比较范围 <select aria-label="Git 比较范围" value={state.scope} disabled={busy} onChange={event => chooseScope(event.target.value)}>
      {Object.entries(scopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      <option value="last-turn" disabled={!summary?.lastTurn}>Last turn · 上回合</option>
    </select></label>
    {['commit', 'branch'].includes(state.scope) && <form onSubmit={event => { event.preventDefault(); run(() => store.read(state.scope, reference)); }}>
      <input aria-label={state.scope === 'commit' ? '比较提交' : '比较基准分支'} placeholder={state.scope === 'commit' ? '提交 SHA / ref' : '基准分支 / ref'} value={reference} onChange={event => setReference(event.target.value)} disabled={busy}/>
      <button disabled={busy} type="submit">加载比较</button>
    </form>}
    {state.loading && <p role="status">正在读取实际 Git 比较…</p>}
    {summary && <>
      <p className="omaa-git-caption">{summary.total} 个文件 · <span className="omaa-git-added">+{summary.added}</span> <span className="omaa-git-deleted">−{summary.deleted}</span>{summary.ref ? ` · ${summary.ref}` : ''}</p>
      {!summary.files.length && <p>此范围没有改动。</p>}
      <div className="omaa-git-files">{summary.files.map(file => <div className="omaa-git-file" key={file.path}>
        <button type="button" className="omaa-git-path" title={file.path} aria-current={diff?.path === file.path ? 'true' : undefined} disabled={busy} onClick={() => chooseFile(file.path)}>{file.display || file.path}</button>
        <span className="omaa-git-counts">+{file.added} −{file.deleted}</span>
        {(file.actions || []).map(action => <button type="button" key={action} disabled={!canWrite} onClick={() => mutate(file.path, action)}>{labels[action]}</button>)}
      </div>)}</div>
    </>}
    {diff && <div className="omaa-git-diff" data-omaa-git-diff={diff.path}>
      <header><strong>{diff.display || diff.path}</strong>
        <button type="button" disabled={busy} onClick={() => navigate(() => sidebarRight.openResourceIn(id, checkpointFileAddress(id, `${summary.root.replace(/\/$/, '')}/${diff.path}`)))}>当前文件</button>
        <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>折行</button>
      </header>
      {diff.kind !== 'text' ? <p>{diff.kind === 'binary' ? '二进制文件不能显示文本比较。' : '文件超过比较显示上限。'}</p> : <>
        <p className="omaa-git-caption">左列为原文件行号，右列为新文件行号；点击行号添加修改意见。</p>
        {diff.coarse && <p className="omaa-git-caption">宿主提供了整文件比较。</p>}
        {diff.hunks.map((hunk, index) => <div key={index} className="omaa-git-hunk">
          <div className="omaa-git-hunk-header"><code>@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</code>
            {(state.diff.hunkActions?.[index] || []).map(action => <button type="button" key={action} disabled={!canWrite} onClick={() => mutate(diff.path, action, index)}>{labels[action]}此块</button>)}
          </div>
          <div className={`omaa-git-lines${wrap ? ' omaa-git-wrap' : ''}`}>
            {reviewHunkRows(hunk).map((row, at) => <div key={at} className={`omaa-git-line omaa-git-${row.kind}`}>
              {['old', 'new'].map(side => <button type="button" key={side} className="omaa-git-line-number" title={row[side] ? `评论${side === 'old' ? '原' : '新'}文件第 ${row[side]} 行` : undefined}
                aria-label={row[side] ? `评论${side === 'old' ? '原' : '新'}文件第 ${row[side]} 行` : '此侧无行'} disabled={!canWrite || !row[side]} onClick={() => selectLine(row, side)}>{row[side] ?? ''}</button>)}
              <code>{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}{row.text}</code>
            </div>)}
          </div>
        </div>)}
        {!diff.hunks.length && <p>没有文本行差异。</p>}
      </>}
    </div>}
    {target && <form className="omaa-git-feedback" onSubmit={event => { event.preventDefault(); feedback(); }}>
      <label>{target.path} · {target.side === 'old' ? '原' : '新'}文件第 {target.line} 行
        <small className="omaa-git-caption">{scopes[target.scope]}{target.ref ? ` · ${target.ref}` : ''} · revision {target.revision.slice(0, 12)}</small>
        <textarea aria-label="行级审阅反馈" value={note} onChange={event => {
          try { drafts.setEditor(id, { target, note: event.target.value, key: editingKey }); }
          catch (error) { setError(error.message); }
        }} disabled={busy}/>
      </label>
      <button type="button" disabled={!canWrite || !note.trim()} onClick={() => run(() => saveEditor())}>{editingKey ? '保存草稿修改' : '加入反馈草稿'}</button>
      <button type="submit" disabled={!canWrite || !note.trim()}>发送反馈并继续修改</button>
      <button type="button" disabled={busy} onClick={() => run(() => drafts.setEditor(id, null))}>取消</button>
    </form>}
    {draftState.items.length > 0 && <section className="omaa-git-drafts" aria-label="待提交反馈草稿">
      <h4>待提交反馈 · {draftState.items.length} / 50</h4>
      <p className="omaa-git-caption">切换文件或比较范围会保留草稿。批量提交会包含当前编辑的意见；只有宿主接受后才清理。草稿仅保留在当前应用内存。</p>
      {draftState.items.map((item, index) => <article className="omaa-git-draft" key={item.key}>
        <strong>{index + 1}. {item.target.path} · {item.target.side === 'old' ? '原' : '新'}文件第 {item.target.line} 行</strong>
        <small>{scopes[item.target.scope]}{item.target.ref ? ` · ${item.target.ref}` : ''} · revision {item.target.revision.slice(0, 12)}</small>
        <p>{item.note}</p>
        <button type="button" disabled={busy} aria-label={`编辑反馈 ${index + 1}`} onClick={() => editDraft(item)}>编辑</button>
        <button type="button" disabled={busy} aria-label={`删除反馈 ${index + 1}`} onClick={() => deleteDraft(item)}>删除</button>
      </article>)}
      <button type="button" disabled={!canWrite} onClick={submitDrafts}>{draftState.sending ? '正在提交反馈…' : '批量发送并继续修改'}</button>
    </section>}
    {!canWrite && !busy && <p className="omaa-git-caption">暂存、撤回和反馈发送仅在停止运行的执行模式下可用。</p>}
    {diagnostic && (errorHint ? <div role="alert" className="omaa-error omaa-git-error">
      <p>{errorHint}</p>
      <details><summary>原始 Git 诊断</summary><pre>{diagnostic}</pre></details>
    </div> : <p role="alert" className="omaa-error">{diagnostic}</p>)}
  </section>;
}
