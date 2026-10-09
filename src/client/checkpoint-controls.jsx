import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import css from './checkpoint-controls.css';
import { assertCheckpointSession, findCheckpointIssues, openCheckpointFile, openCheckpointReview } from './checkpoint-navigation.mjs';

export function CheckpointControls({ settings, sidebarRight, sessions, visible = true }) {
  const session = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const id = session.sessionId, enabled = session.data?.product?.id === 'cursor';
  const [state, setState] = useState({ data: null, error: '', busy: false, loading: false });
  const [turn, setTurn] = useState();
  const [reload, setReload] = useState(0);
  const ticket = useRef(0);
  const api = async (query = '', patch, signal) => {
    const response = await fetch(`omaa/api/checkpoints?session=${encodeURIComponent(id)}${query}`, {
      credentials: 'same-origin', signal,
      ...(patch ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) } : {}),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  };
  useEffect(() => {
    setState({ data: null, error: '', busy: false, loading: false }); setTurn(undefined);
  }, [id, enabled]);
  useEffect(() => {
    const controller = new AbortController(), revision = ++ticket.current;
    const reading = enabled && visible && !session.data?.running;
    setState(previous => ({ ...previous, loading: reading, ...(reading ? { error: '' } : {}) }));
    if (reading) {
      api('', undefined, controller.signal).then(data => {
        if (!controller.signal.aborted && ticket.current === revision && settings.getSnapshot().sessionId === id) {
          setState({ data, error: '', busy: false, loading: false });
          setTurn(previous => data.checkpoints.some(row => row.turn === previous) ? previous : data.checkpoints.at(-1)?.turn);
        }
      }).catch(error => { if (!controller.signal.aborted && ticket.current === revision && settings.getSnapshot().sessionId === id) setState(previous => ({ ...previous, loading: false, error: error.message })); });
    }
    return () => { controller.abort(); ++ticket.current; };
  }, [id, enabled, visible, session.data?.running, reload]);
  if (!enabled || !visible) return null;
  const data = state.data?.sessionId === id ? state.data : null;
  const selected = data?.checkpoints.find(row => row.turn === turn);
  const readingBusy = state.busy || state.loading;
  const busy = readingBusy || Boolean(session.data?.running);
  const stale = session.loading || session.saving || Boolean(session.error);
  const canRestore = !busy && !stale && !session.data?.pendingMode && session.data?.mode === 'default';
  const cannotFindIssues = busy || stale || session.data?.pendingMode || session.data?.mode === 'plan';
  const act = async operation => {
    try { assertCheckpointSession(settings, id, sidebarRight); }
    catch (error) { if (settings.getSnapshot().sessionId === id) setState(previous => ({ ...previous, error: error.message })); return; }
    const revision = ++ticket.current;
    setState(previous => ({ ...previous, busy: true, error: '', result: undefined }));
    try {
      const result = await operation();
      if (settings.getSnapshot().sessionId === id && ticket.current === revision) setState(previous => ({ ...previous, ...result, busy: false }));
    } catch (error) {
      if (settings.getSnapshot().sessionId === id && ticket.current === revision) setState(previous => ({ ...previous, busy: false, error: error.message }));
    }
  };
  const restore = paths => act(async () => {
    const current = settings.getSnapshot();
    if (current.loading || current.saving || current.error || current.data?.pendingMode || current.data?.mode !== 'default') throw Error('请在设置已确认的执行模式下恢复文件。');
    const result = await api('', { turn, paths });
    assertCheckpointSession(settings, id, sidebarRight);
    const data = await api();
    return { data, result, error: result.ok ? '' : result.conflicts.map(item => `${item.path}: ${item.message}`).join('\n') };
  });
  const navigate = operation => {
    try { operation(); }
    catch (error) { if (settings.getSnapshot().sessionId === id) setState(previous => ({ ...previous, error: error.message })); }
  };
  const findIssues = path => act(async () => {
    await findCheckpointIssues(settings, sessions, sidebarRight, id, selected, path);
    return {};
  });
  return <section className="omaa-checkpoints" aria-busy={busy || undefined} aria-label="Cursor 文件检查点">
    <style>{css}</style>
    <header><h3>文件改动</h3><button type="button" disabled={busy || session.loading || session.saving}
      onClick={() => setReload(previous => previous + 1)}>{state.loading ? '正在读取…' : '刷新检查点'}</button></header>
    <p className="omaa-help">恢复会将选中文件还原到该回合修改前，保留对话。文件已被再次修改时会拒绝覆盖。</p>
    {session.data?.running && data?.checkpoints.length > 0 && <p className="omaa-help">运行中可查看已加载回合和当前文件；恢复和问题检查需先停止。</p>}
    <label>检查点 <select aria-label="文件检查点" value={turn ?? ''} disabled={readingBusy || !data?.checkpoints.length}
      onChange={event => { setTurn(Number(event.target.value)); setState(previous => ({ ...previous, error: '', result: undefined })); }}>
      {!data?.checkpoints.length && <option value="">{session.data?.running ? '运行中，停止后加载检查点' : state.error ? '读取失败，请刷新' : !data ? '正在加载检查点…' : '暂无文件改动'}</option>}
      {data?.checkpoints.slice().reverse().map(row => <option key={row.turn} value={row.turn}>回合 {row.turn}</option>)}
    </select></label>
    {selected?.files.map(file => <div className="omaa-checkpoint-file" key={file.path}>
      <code>{file.path}</code>
      {(file.restored ? file.before : file.after)?.kind !== 'absent' && <button type="button" disabled={readingBusy} onClick={() => navigate(() => openCheckpointFile(settings, sidebarRight, id, file))}>预览当前文件</button>}
      <button type="button" disabled={cannotFindIssues} onClick={() => findIssues(file.path)}>查找此文件问题</button>
      <button type="button" disabled={!canRestore || !file.restorable || file.restored} onClick={() => restore([file.path])}>{file.restored ? '已恢复' : '恢复文件'}</button>
      {!file.restorable && <small>此文件无法精确恢复</small>}
    </div>)}
    {selected?.files.length > 0 && <div className="omaa-checkpoint-review">
      <button type="button" disabled={cannotFindIssues} onClick={() => findIssues()}>查找本回合问题</button>
      <p className="omaa-help">进入只读问答模式检查变更；检查完成后，切回执行模式可继续修复。</p>
    </div>}
    {selected?.reviewAvailable && selected.summary.files.length > 0 && <div className="omaa-checkpoint-review">
      <button type="button" disabled={readingBusy} onClick={() => navigate(() => openCheckpointReview(settings, sidebarRight, id, selected))}>审阅本回合 {selected.summary.files.length} 个文件</button>
      <p className="omaa-help">比较记录的是该回合修改前后；文件预览显示当前内容。</p>
      <details><summary>选择比较文件</summary>
        {selected.summary.files.map((file, index) => <button className="omaa-review-file" type="button" key={index} disabled={readingBusy} onClick={() => navigate(() => openCheckpointReview(settings, sidebarRight, id, selected, index))}>{file.display || file.path}</button>)}
      </details>
    </div>}
    {selected && !selected.reviewAvailable && <p className="omaa-help">该回合的宿主比较已不可用；仍可恢复已保存的文本文件。</p>}
    {selected?.captureLimitReached && <p className="omaa-help">本回合超过捕获上限，部分文件无法恢复。</p>}
    {selected?.files.some(file => file.restorable && !file.restored) && <button type="button" disabled={!canRestore} onClick={() => restore(selected.files.filter(file => file.restorable && !file.restored).map(file => file.path))}>恢复本回合可恢复文件</button>}
    {state.result && <p role="status">{state.result.ok ? `已恢复 ${state.result.restored.length} 个文件。` : state.result.partial ? '仅部分文件已恢复，请查看冲突。' : '未恢复文件，请查看冲突。'}</p>}
    {state.error && <p role="alert" className="omaa-error">{state.error}</p>}
  </section>;
}
