import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { branchTreeRows, createPiBranches } from './pi-branches.mjs';
import css from './pi-branches.css';

export function PiBranches({ settings, uiWorkspace, sessions, visible = true }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const controller = useMemo(() => createPiBranches(settings, uiWorkspace, sessions), [settings, uiWorkspace, sessions]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [point, setPoint] = useState(''), [withSummary, setWithSummary] = useState(false), [error, setError] = useState('');
  const [node, setNode] = useState(''), [summary, setSummary] = useState(false), [draft, setDraft] = useState('');
  useEffect(() => { setDraft(state.editorText ?? ''); }, [state.editorText]);
  const id = current.sessionId, enabled = current.data?.product?.id === 'pi';
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { setPoint(''); setWithSummary(false); setError(''); setNode(''); setDraft(''); }, [id, enabled]);
  useEffect(() => {
    if (enabled && visible) controller.refresh().catch(error => { if (settings.getSnapshot().sessionId === id && settings.getSnapshot().data?.product?.id === 'pi') setError(error.message); });
  }, [controller, id, enabled, visible, current.data?.running]);
  if (!enabled || !visible) return null;
  const data = state.sessionId === id && state.data?.sessionId === id ? state.data : null;
  const busy = state.loading || state.saving || current.loading || current.saving, canFork = !busy && !state.result?.sessionId && !current.loading && !current.saving && !current.error && !current.data.running && data?.canFork;
  const selectedPoint = point !== '' && data?.points.some(value => String(value.seq) === point) ? point : '';
  const run = operation => { setError(''); Promise.resolve().then(operation).catch(error => { if (settings.getSnapshot().sessionId === id) setError(error.message); }); };
  return <section className="omaa-pi-branches" aria-busy={busy || undefined} aria-label="Pi 分支导航">
    <style>{css}</style>
    <header><h3>分支树</h3><button type="button" disabled={busy} onClick={() => run(() => controller.refresh())}>刷新分支</button></header>
    <p className="omaa-pi-branch-help">每条分支是一个原生 DSH 会话，共享工作目录；切换分支不会还原文件。</p>
    {state.loading && <p role="status">正在读取分支…</p>}
    {data && <ul className="omaa-pi-branch-tree" aria-label="已有分支">{branchTreeRows(data.branches).map(branch => <li key={branch.sessionId} style={{ '--branch-indent': Math.min(branch.depth, 8) }}>
      <button type="button" disabled={state.saving || branch.current} aria-current={branch.current ? 'page' : undefined} title={branch.cwd}
        onClick={() => run(() => controller.open(branch.sessionId, id))}>
        <span aria-hidden="true">{branch.depth ? '↳' : '•'}</span><span>{branch.title || '未命名分支'}</span>
        {branch.current && <small>当前</small>}{branch.running && <small>运行中</small>}
      </button>
    </li>)}</ul>}
    {state.result?.sessionId && <p role="status">分支已创建。<button type="button" disabled={busy}
      onClick={() => run(() => controller.open(state.result.sessionId, id))}>打开已创建分支</button></p>}
    <form onSubmit={event => { event.preventDefault(); run(() => controller.fork({ ...(selectedPoint === '' ? {} : { atSeq: Number(selectedPoint) }), withSummary }, id)); }}>
      <label>分叉位置 <select aria-label="Pi 分叉位置" value={selectedPoint} disabled={!canFork} onChange={event => setPoint(event.target.value)}>
        <option value="">当前已完成位置</option>
        {data?.points.slice().reverse().map(value => <option value={value.seq} key={value.seq}>{value.label || `回合 ${value.turn}`}</option>)}
      </select></label>
      <label className="omaa-pi-branch-summary"><input type="checkbox" aria-label="分叉时附带离开分支摘要" checked={withSummary} disabled={!canFork} onChange={event => setWithSummary(event.target.checked)}/><span>附带离开分支摘要<small>仅勾选后在分叉时生成，使用当前模型。</small></span></label>
      <button type="submit" disabled={!canFork}>{state.saving ? withSummary ? '正在摘要并创建分支…' : '正在创建分支…' : '创建并打开新分支'}</button>
      {current.data.running && <p className="omaa-pi-branch-help">停止运行后可以从已完成回合分叉；已有分支仍可打开。</p>}
      {!current.data.running && data && !data.canFork && <p className="omaa-pi-branch-help">当前没有可分叉的已完成回合。</p>}
    </form>
    {state.treeSaving && <button type="button" onClick={() => controller.cancelTree()}>取消树导航或压缩</button>}
    {data?.tree && <form aria-label="Pi 当前会话树" onSubmit={event => { event.preventDefault(); run(() => controller.treeAction('navigate', { targetId: node, summarize: summary }, id)); }}>
      <h3>当前会话历史树</h3>
      <p className="omaa-pi-branch-help">下一条输入从所选节点继续。主对话保留按时间排列的原始记录；下方标示当前上下文路径。文件不回滚。</p>
      <label>历史节点 <select aria-label="Pi 历史节点" value={node} disabled={busy || current.data.running} onChange={event => setNode(event.target.value)}>
        <option value="">选择节点</option>
        {data.tree.nodes.map(value => <option key={value.id} value={value.id}>{'　'.repeat(Math.min(5, value.depth))}{value.current ? '● ' : ''}{value.label || `${value.role} · ${value.text}`}</option>)}
      </select></label>
      <label className="omaa-pi-branch-summary"><input type="checkbox" aria-label="切换历史节点时生成离开摘要" checked={summary} disabled={busy || current.data.running} onChange={event => setSummary(event.target.checked)}/>附带离开摘要</label>
      <button type="submit" disabled={!node || busy || current.data.running}>切换到历史节点</button>{' '}
      <button type="button" disabled={busy || current.data.running} onClick={() => run(() => controller.treeAction('compact', {}, id))}>压缩当前分支</button>
      {state.treeResult && !state.treeResult.cancelled && <p role="status">{state.treeResult.empty ? '当前没有可压缩的历史。' : state.treeResult.newLeafId !== undefined ? '已切换历史节点；下一条输入从此处分支。' : '当前分支已压缩。'}</p>}
    </form>}
    {data?.tree && <details><summary>当前上下文路径</summary><ol aria-label="Pi 当前上下文路径">{data.tree.nodes.filter(node => node.active).map(node => <li key={node.id}><strong>{node.label || node.role}</strong> {node.text}</li>)}</ol></details>}
    {state.editorText && <form aria-label="Pi 历史输入" onSubmit={event => { event.preventDefault(); run(() => controller.submitTreeText(draft, id)); }}>
      <label>编辑历史输入 <textarea aria-label="编辑 Pi 历史输入" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy}/></label>
      <button type="submit" disabled={busy || !draft.trim() || current.data.running}>从此处发送</button>
    </form>}
    {(state.error || error) && <p className="omaa-error" role="alert">{state.error || error}</p>}
  </section>;
}
