import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { branchTreeRows, createPiBranches } from './pi-branches.mjs';
import css from './pi-branches.css';

export function PiBranches({ settings, uiWorkspace, sessions, visible = true }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const controller = useMemo(() => createPiBranches(settings, uiWorkspace, sessions), [settings, uiWorkspace, sessions]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [point, setPoint] = useState(''), [withSummary, setWithSummary] = useState(false), [error, setError] = useState('');
  const id = current.sessionId, enabled = current.data?.product?.id === 'pi';
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { setPoint(''); setWithSummary(false); setError(''); }, [id, enabled]);
  useEffect(() => {
    if (enabled && visible) controller.refresh().catch(error => { if (settings.getSnapshot().sessionId === id && settings.getSnapshot().data?.product?.id === 'pi') setError(error.message); });
  }, [controller, id, enabled, visible, current.data?.running]);
  if (!enabled || !visible) return null;
  const data = state.sessionId === id && state.data?.sessionId === id ? state.data : null;
  const busy = state.loading || state.saving, canFork = !busy && !current.loading && !current.saving && !current.error && !current.data.running && data?.canFork;
  const run = operation => { setError(''); Promise.resolve().then(operation).catch(error => { if (settings.getSnapshot().sessionId === id) setError(error.message); }); };
  return <section className="omaa-pi-branches" aria-label="Pi 分支导航">
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
    <form onSubmit={event => { event.preventDefault(); run(() => controller.fork({ ...(point === '' ? {} : { atSeq: Number(point) }), withSummary }, id)); }}>
      <label>分叉位置 <select aria-label="Pi 分叉位置" value={point} disabled={!canFork} onChange={event => setPoint(event.target.value)}>
        <option value="">当前已完成位置</option>
        {data?.points.slice().reverse().map(value => <option value={value.seq} key={value.seq}>{value.label || `回合 ${value.turn}`}</option>)}
      </select></label>
      <label className="omaa-pi-branch-summary"><input type="checkbox" aria-label="分叉时附带离开分支摘要" checked={withSummary} disabled={!canFork} onChange={event => setWithSummary(event.target.checked)}/><span>附带离开分支摘要<small>仅勾选后在分叉时生成，使用当前模型。</small></span></label>
      <button type="submit" disabled={!canFork}>{state.saving ? withSummary ? '正在摘要并创建分支…' : '正在创建分支…' : '创建并打开新分支'}</button>
      {current.data.running && <p className="omaa-pi-branch-help">停止运行后可以从已完成回合分叉；已有分支仍可打开。</p>}
      {!current.data.running && data && !data.canFork && <p className="omaa-pi-branch-help">当前没有可分叉的已完成回合。</p>}
    </form>
    {(state.error || error) && <p className="omaa-error" role="alert">{state.error || error}</p>}
  </section>;
}
