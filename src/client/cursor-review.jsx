import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { FileDiff, ReviewLineContext, diffCss } from '../../lib/cursor-native-diff.mjs';
import { cursorReviewScopes } from '../shared/cursor-review.mjs';
import { assertCursorReview, cursorReviewFor, cursorReviewed, submitCursorReview } from './cursor-review-state.mjs';
import { checkpointFileAddress } from './checkpoint-navigation.mjs';
import css from './cursor-review.css';

const copy = { 'diff.loading': '正在读取文件比较…', 'diff.missing': '原比较已不可用，批注仍保留。', 'diff.error': '读取比较失败。',
  'diff.binary': '二进制文件不能显示文本比较。', 'diff.oversized': '文件超过比较显示上限。', 'diff.created': '新增文件', 'diff.deleted': '删除文件',
  'diff.unchanged': '没有文本行改动。', 'diff.coarse': '宿主提供了整文件比较。', 'diff.truncated': '仅显示前 5000 行，请缩小比较范围。', 'presented.retry': '重新读取' };
const translate = key => copy[key] ?? key;
const statusLabels = { draft: '待发送', submitted: '已发送', resolved: '已解决' };
const coordinate = target => `${target.path} · ${target.side === 'old' ? '原' : '新'}文件第 ${target.line} 行`;

export function CursorReview({ settings, sidebarRight, visible = true, navigation }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const store = useMemo(() => cursorReviewFor(settings), [settings]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const id = current.sessionId, enabled = current.data?.product?.id === 'cursor';
  const [editor, setEditor] = useState(null), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const [split, setSplit] = useState(true), [wrap, setWrap] = useState(false), [refText, setRefText] = useState('');
  const [filter, setFilter] = useState('open');
  const navigated = useRef();
  useEffect(() => { setEditor(null); setError(''); setRefText(''); setSending(false); navigated.current = undefined; }, [id, enabled]);
  useEffect(() => {
    if (!enabled || !visible) return;
    const params = navigation?.params;
    const freshNavigation = navigation && navigated.current !== navigation.revision;
    if (freshNavigation) navigated.current = navigation.revision;
    if (freshNavigation && params?.scope === 'turn' && Number.isSafeInteger(params.seq)) void store.open({ scope: 'turn', seq: params.seq, path: params.path });
    else if (!current.data?.running) void store.open({ ...store.getSnapshot().options, path: store.getSnapshot().detail?.diff?.path });
    void store.metadata(); void store.refreshNotes();
  }, [store, enabled, visible, id, current.data?.running, navigation?.revision]);
  if (!enabled || !visible || state.sessionId !== id) return null;
  const { summary, detail, notes } = state, diff = detail?.diff, scope = state.options.scope;
  const busy = state.reading || state.writing || state.notesLoading || sending;
  const canSubmit = !busy && !current.loading && !current.saving && !current.error && !current.data.running && !current.data.pendingMode && current.data.mode !== 'plan';
  const comments = notes?.comments ?? [], pending = comments.filter(item => item.status === 'draft');
  const viewComments = comments.filter(item => item.status !== 'resolved' && item.target.revision === summary?.revision && item.target.path === diff?.path);
  const counts = Object.fromEntries(viewComments.map(item => [item.target.side + ':' + item.target.line,
    viewComments.filter(other => other.target.side === item.target.side && other.target.line === item.target.line).length]));
  const act = async operation => {
    setError('');
    try { assertCursorReview(settings, id); await operation(); }
    catch (error) { if (settings.getSnapshot().sessionId === id) setError(error.message); }
  };
  const saveEditor = async () => {
    assertCursorReview(settings, id);
    if (!editor?.note.trim()) { setEditor(null); return; }
    await store.update({ action: 'save-comment', id: editor.id, target: editor.target, note: editor.note });
    assertCursorReview(settings, id); setEditor(null);
  };
  const selectLine = point => act(async () => {
    await saveEditor(); assertCursorReview(settings, id);
    setEditor({ target: { scope, root: summary.root, revision: summary.revision, path: diff.path,
      ...(summary.ref ? { ref: summary.ref } : {}), ...(scope === 'turn' ? { seq: summary.seq } : {}), ...point }, note: '' });
  });
  const changeScope = value => act(async () => {
    await saveEditor(); setRefText('');
    if (value === 'turn') {
      const turn = state.turns.at(-1); if (!turn) throw Error('还没有可审阅的会话回合。');
      await store.open({ scope: value, seq: turn.seq });
    } else await store.open({ scope: value });
  });
  const selectFile = path => act(async () => { await saveEditor(); await store.select(path); });
  const submit = (action, extra) => act(async () => {
    await saveEditor(); setSending(true);
    try { await submitCursorReview(settings, store, action, extra, id); }
    finally { if (settings.getSnapshot().sessionId === id) setSending(false); }
  });
  const openFile = () => act(() => {
    if (sidebarRight.mounted.getSnapshot() !== id) throw Error('会话已切换。');
    sidebarRight.openResourceIn(id, checkpointFileAddress(id, summary.root.replace(/[\\/]$/, '') + '/' + diff.path));
  });
  const showComment = item => act(async () => {
    await saveEditor();
    if (item.status === 'draft') setEditor({ id: item.id, target: item.target, note: item.note });
    await store.open(item.target);
  });
  const filtered = comments.filter(item => filter === 'all' || filter === 'resolved' ? filter === 'all' || item.status === 'resolved' : item.status !== 'resolved');
  return <section className="omaa-cursor-review" aria-label="Cursor 代码审阅" aria-busy={busy || undefined}>
    <style>{diffCss + '\n' + css}</style>
    <header className="omaa-cr-header"><div><h2>代码审阅</h2><small>{state.currentBranch || '当前会话'}</small></div>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(async () => { await saveEditor(); await Promise.all([store.open({ ...state.options, path: diff?.path }), store.metadata(), store.refreshNotes()]); })}>刷新</Button>
    </header>
    <div className="omaa-cr-scope"><label>比较范围<select aria-label="Cursor 比较范围" value={scope} disabled={busy} onChange={event => changeScope(event.target.value)}>
      {Object.entries(cursorReviewScopes).map(([key, label]) => <option key={key} value={key} disabled={key === 'turn' && !state.turns.length}>{label}</option>)}
    </select></label>
    {scope === 'turn' && <label>回合<select aria-label="审阅回合" value={state.options.seq ?? ''} disabled={busy} onChange={event => act(async () => { await saveEditor(); await store.open({ scope, seq: Number(event.target.value) }); })}>
      {state.turns.slice().reverse().map(turn => <option key={turn.seq} value={turn.seq}>回合 {turn.turn} · {turn.files} 个文件</option>)}
    </select></label>}
    {['branch', 'commit'].includes(scope) && <form onSubmit={event => { event.preventDefault(); void act(async () => { await saveEditor(); await store.open({ scope, ref: refText || state.options.ref }); }); }}>
      <label>{scope === 'branch' ? '基准分支' : '提交'}<input aria-label="Cursor 比较引用" list="omaa-cursor-refs" placeholder={state.options.ref || (scope === 'branch' ? 'main' : 'HEAD')} value={refText} onChange={event => setRefText(event.target.value)} disabled={busy}/></label>
      <datalist id="omaa-cursor-refs">{state.refs.map(ref => <option key={ref} value={ref}/>)}</datalist><Button size="sm" type="submit" disabled={busy}>比较</Button>
    </form>}
    </div>
    <p className="omaa-cr-hint">{scope === 'working' ? 'HEAD 与当前文件比较，包含暂存、未暂存和未跟踪文件。' : scope === 'branch' ? '基准分支的共同祖先与 HEAD 比较；未提交内容在「全部未提交」中审阅。' : scope === 'turn' ? '记录的是该回合修改前后的内容；当前文件可能已经变化。' : '比较保留原始版本与行位置；批注不会自动发送。'}</p>
    {summary && <div className="omaa-cr-overview"><span>{summary.total} 个文件 · +{summary.added} −{summary.deleted}</span><span>{summary.files.filter(file => cursorReviewed(notes, summary, file.path)).length} / {summary.files.length} 已阅</span>
      <Button size="sm" variant="ghost" disabled={!canSubmit || !summary.files.length} onClick={() => submit('find-issues', { view: { ...state.options, revision: summary.revision } })}>查找范围问题</Button>
    </div>}
    {summary && summary.total > summary.files.length && <p role="status" className="omaa-cr-hint">仅列出前 {summary.files.length} 个文件，请缩小范围；没有将未显示的文件标为已阅。</p>}
    {state.reading && <p role="status" className="omaa-cr-hint">正在读取实际比较…</p>}
    {summary && !summary.files.length && <p className="omaa-cr-empty">此范围没有改动。</p>}
    {summary?.files.length > 0 && <div className="omaa-cr-layout">
      <nav className="omaa-cr-files" aria-label="审阅文件">{summary.files.map(file => <button type="button" key={file.path} disabled={busy} onClick={() => selectFile(file.path)} aria-current={diff?.path === file.path ? 'true' : undefined} title={file.path}>
        <span className="omaa-cr-file-name">{cursorReviewed(notes, summary, file.path) ? '✓ ' : ''}{file.path}</span><small>+{file.added} −{file.deleted}</small>
      </button>)}</nav>
      <div className="omaa-cr-content">{diff && <>
        <div className="omaa-cr-file-head"><strong title={diff.path}>{diff.path}</strong><div>
          <Button size="sm" variant="ghost" disabled={busy || diff.after === false} onClick={openFile}>当前文件</Button>
          <Button size="sm" variant="ghost" aria-pressed={split} onClick={() => setSplit(!split)}>{split ? '并排' : '统一'}</Button>
          <Button size="sm" variant="ghost" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>折行</Button>
        </div></div>
        <ReviewLineContext.Provider value={{ onSelect: selectLine, counts, selected: editor?.target?.revision === summary.revision && editor.target.path === diff.path ? editor.target : null, disabled: busy || !notes }}>
          <div className="omaa-cr-diff"><FileDiff state={diff} split={split} wrap={wrap} t={translate} retry={() => selectFile(diff.path)}/></div>
        </ReviewLineContext.Provider>
        <div className="omaa-cr-file-actions"><Button size="sm" variant="ghost" disabled={busy || !notes} onClick={() => act(() => store.update({ action: 'mark-reviewed', view: { ...state.options, revision: summary.revision }, path: diff.path, reviewed: !cursorReviewed(notes, summary, diff.path) }))}>{cursorReviewed(notes, summary, diff.path) ? '取消已阅' : '标为已阅'}</Button>
          <Button size="sm" variant="ghost" disabled={!canSubmit} onClick={() => submit('find-issues', { view: { ...state.options, revision: summary.revision }, path: diff.path })}>查找此文件问题</Button>
        </div>
      </>}</div>
    </div>}
    {editor && <form className="omaa-cr-editor" onSubmit={event => { event.preventDefault(); void act(saveEditor); }}>
      <label>{coordinate(editor.target)}<small>{cursorReviewScopes[editor.target.scope]}{editor.target.ref ? ` · ${editor.target.ref}` : ''}</small>
        <textarea autoFocus aria-label="Cursor 行级批注" value={editor.note} disabled={state.writing || sending} onChange={event => setEditor({ ...editor, note: event.target.value })} placeholder="指出具体问题或需要修改的内容…"/>
      </label><div><Button size="sm" type="submit" disabled={busy || !editor.note.trim()}>保存批注</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditor(null)}>取消编辑</Button></div>
    </form>}
    <section className="omaa-cr-comments" aria-label="Cursor 批注记录"><header><h3>批注 <small>{comments.length}</small></h3><select aria-label="批注状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="open">未解决</option><option value="all">全部记录</option><option value="resolved">已解决</option></select></header>
      <p className="omaa-cr-hint">批注保存在本机会话中，重开仍可继续；「已发送」表示宿主已接纳，解决状态由你确认。</p>
      {filtered.map(item => <article key={item.id} className="omaa-cr-comment" data-status={item.status}>
        <header><button type="button" disabled={busy} onClick={() => showComment(item)}>{coordinate(item.target)}</button><small>{statusLabels[item.status]}</small></header>
        <small>{cursorReviewScopes[item.target.scope]}{item.target.ref ? ` · ${item.target.ref}` : ''}{item.target.revision !== summary?.revision ? ' · 原比较版本' : ''}</small><p>{item.note}</p>
        <div>{item.status === 'draft' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => showComment(item)}>编辑</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => store.update({ action: item.status === 'resolved' ? 'reopen-comment' : 'resolve-comment', id: item.id }))}>{item.status === 'resolved' ? '重新打开' : '标为解决'}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => store.update({ action: 'delete-comment', id: item.id }))}>删除</Button>
        </div>
      </article>)}
      {!filtered.length && <p className="omaa-cr-empty">{state.notesLoading ? '正在读取本地批注…' : '点击比较中的行号添加批注。'}</p>}
      {(pending.length > 0 || notes?.delivery) && <div className="omaa-cr-submit"><span>{pending.length} 条待发送</span><Button size="sm" disabled={!canSubmit} onClick={() => submit(notes?.delivery?.kind === 'issues' ? 'find-issues' : 'submit')}>{notes?.delivery ? '重试原请求' : sending ? '正在提交…' : '批量反馈并继续修改'}</Button></div>}
    </section>
    {current.data.running && <p className="omaa-cr-hint">任务运行中。停止后可提交反馈或开始新的问题检查。</p>}
    {(error || state.error) && <div role="alert" className="omaa-cr-error">{error || state.error}</div>}
  </section>;
}
