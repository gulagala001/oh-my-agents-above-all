import React, { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseArtifactPresetSpec } from '../../lib/zcode-artifact-ui-spec.mjs';
import { applyArtifactItems } from '../../lib/zcode-artifact-ui-apply.mjs';
import { ZCodeArtifactChart } from './zcode-artifact-chart.jsx';
import { ZCodeWorkflowGraph } from './zcode-workflow-graph.jsx';
import css from './zcode-workflows.css';

const presetKinds = new Set(['chart', 'table', 'metrics', 'board']);
const terminalStatuses = new Set(['completed', 'complete', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'interrupted', 'killed', 'error']);
const statusLabel = value => ({ running: '运行中', submitted: '已提交', pending: '等待中', queued: '等待中', completed: '已完成', complete: '已完成', succeeded: '已完成', failed: '失败', cancelled: '已取消', canceled: '已取消', interrupted: '已中断', killed: '已中断' })[value] || value || '未知状态';
const heading = (label, unit) => unit ? `${label} (${unit})` : label;
const emptyState = () => ({ sessionId: undefined, runs: [], runId: '', detail: null, artifactId: '', items: [], cursor: 0, loading: false, stopping: false, stopRequested: false, error: '' });
const endpoint = (name, params) => `omaa/api/${name}?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`;
const artifactOrder = artifacts => [...artifacts].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));

// Native run storage is authoritative. Reads are singleflight, with one pending reread;
// changing selection invalidates responses even if a transport ignores abort.
export function createZCodeWorkflowsController(settings, sidebarRight, request = fetch) {
  let state = emptyState(), disposed = false, visible = false, generation = 0, controller, flight, pending = false, timer, requestedSelection = '';
  const listeners = new Set();
  const mountedId = () => sidebarRight?.mounted?.getSnapshot ? sidebarRight.mounted.getSnapshot() : settings.getSnapshot().sessionId;
  const currentId = () => {
    const current = settings.getSnapshot();
    return current.data?.product?.id === 'zcode' && (!current.agentPreset || current.agentPreset === 'omaa-zcode') && current.sessionId === mountedId() ? current.sessionId : undefined;
  };
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const valid = (id, ticket) => !disposed && visible && currentId() === id && generation === ticket;
  const read = async (name, params, signal) => {
    const response = await request(endpoint(name, params), { credentials: 'same-origin', signal });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    if (value.sessionId !== params.session || (params.run && value.runId !== params.run) || (params.id && value.id !== params.id)) throw new Error('工作流响应与当前选择不一致，请刷新。');
    return value;
  };
  const stopTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const live = () => Boolean(settings.getSnapshot().data?.running || state.runs.some(run => !terminalStatuses.has(run.status)));
  const refresh = () => {
    stopTimer();
    if (disposed || !visible || !currentId()) return Promise.resolve();
    if (flight) { pending = true; return flight; }
    const id = currentId(), ticket = generation;
    controller = new AbortController(); const signal = controller.signal;
    emit({ loading: true, error: '' });
    flight = (async () => {
      try {
        const catalog = await read('zcode-workflows', { session: id }, signal);
        if (!valid(id, ticket)) return;
        const runs = Array.isArray(catalog.runs) ? catalog.runs : [];
        if (requestedSelection && !runs.some(run => run.runId === requestedSelection)) {
          emit({ runs, runId: '', detail: null, artifactId: '', items: [], cursor: 0, error: '请求的工作流不在本会话中。' });
          return;
        }
        const runId = runs.some(run => run.runId === state.runId) ? state.runId : runs[0]?.runId || '';
        requestedSelection = '';
        if (runId !== state.runId) emit({ runs, runId, detail: null, artifactId: '', items: [], cursor: 0 });
        else emit({ runs });
        if (!runId) return;
        const detail = await read('zcode-workflow', { session: id, run: runId }, signal);
        if (!valid(id, ticket) || state.runId !== runId) return;
        const artifacts = artifactOrder(Array.isArray(detail.artifacts) ? detail.artifacts : []);
        const artifactId = artifacts.some(artifact => artifact.id === state.artifactId) ? state.artifactId : artifacts[0]?.id || '';
        const settled = terminalStatuses.has(detail.status) ? { stopping: false, stopRequested: false } : {};
        if (artifactId !== state.artifactId) emit({ detail, artifactId, items: [], cursor: 0, ...settled });
        else emit({ detail, ...settled });
        const artifact = artifacts.find(value => value.id === artifactId);
        if (!artifact || !presetKinds.has(artifact.kind)) return;
        let cursor = state.cursor, items = state.items;
        // Drain every page, including the final report after settlement. A run
        // revision is never used to skip this read: terminal reports can race it.
        for (;;) {
          const page = await read('zcode-artifact-data', { session: id, run: runId, id: artifactId, after: cursor, limit: 200 }, signal);
          if (!valid(id, ticket) || state.runId !== runId || state.artifactId !== artifactId) return;
          const byIdentity = new Map(items.map(entry => [`${entry.sequence}:${entry.siteId}:${entry.ordinal}`, entry]));
          for (const entry of page.items || []) byIdentity.set(`${entry.sequence}:${entry.siteId}:${entry.ordinal}`, entry);
          items = [...byIdentity.values()].sort((a, b) => a.sequence - b.sequence);
          const nextCursor = Number(page.cursor);
          if (!Number.isSafeInteger(nextCursor) || nextCursor < cursor || (page.hasMore && nextCursor === cursor)) throw new Error('产物分页游标没有前进，请刷新。');
          cursor = nextCursor;
          emit({ items, cursor });
          if (!page.hasMore) break;
        }
      } catch (error) {
        if (valid(id, ticket) && !signal.aborted) emit({ error: error.message });
      } finally {
        if (valid(id, ticket)) emit({ loading: false });
      }
    })().finally(() => {
      flight = undefined;
      if (disposed || !visible || !currentId()) return;
      if (pending) { pending = false; return refresh(); }
      else if (live()) timer = setTimeout(() => { timer = undefined; void refresh(); }, 2000);
    });
    return flight;
  };
  let wasRunning = false;
  const sync = () => {
    const id = currentId(), running = Boolean(settings.getSnapshot().data?.running);
    if (id !== state.sessionId) {
      ++generation; controller?.abort(); stopTimer(); pending = false; requestedSelection = '';
      emit({ ...emptyState(), sessionId: id });
      if (visible && id) void refresh();
    } else if (visible && id && wasRunning !== running) void refresh();
    wasRunning = running;
  };
  const offSettings = settings.subscribe(sync), offMounted = sidebarRight?.mounted?.subscribe?.(sync);
  sync();
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    refresh,
    setVisible(value) {
      if (visible === Boolean(value)) return;
      visible = Boolean(value); ++generation; controller?.abort(); stopTimer(); pending = false;
      if (visible) { sync(); void refresh(); }
      else emit({ loading: false });
    },
    selectRun(runId, { requested = false } = {}) {
      if (!currentId() || typeof runId !== 'string' || !runId || (!requested && !state.runs.some(run => run.runId === runId))) return;
      requestedSelection = requested ? runId : '';
      if (state.runId === runId && state.detail) return;
      ++generation; controller?.abort();
      emit({ runId, detail: null, artifactId: '', items: [], cursor: 0, error: '', loading: false, stopping: false, stopRequested: false });
      void refresh();
    },
    selectArtifact(artifactId) {
      if (!currentId() || !state.detail?.artifacts.some(artifact => artifact.id === artifactId) || state.artifactId === artifactId) return;
      ++generation; controller?.abort();
      emit({ artifactId, items: [], cursor: 0, error: '', loading: false });
      void refresh();
    },
    async stop() {
      const id = currentId(), runId = state.runId;
      if (!id || !state.detail || terminalStatuses.has(state.detail.status) || state.stopping || state.stopRequested) return;
      const stillSelected = () => !disposed && currentId() === id && state.runId === runId;
      emit({ stopping: true, error: '' });
      try {
        const response = await request(endpoint('zcode-workflow', { session: id, run: runId }), { credentials: 'same-origin', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        if (value.requested !== true) throw new Error('停止请求未被接受，请刷新运行状态。');
        if (stillSelected()) { emit({ stopping: false, stopRequested: true }); void refresh(); }
      } catch (error) { if (stillSelected()) emit({ stopping: false, error: error.message }); }
    },
    dispose() { disposed = true; ++generation; pending = false; controller?.abort(); stopTimer(); offSettings(); offMounted?.(); listeners.clear(); },
  };
}

function PresetEmpty() { return <p className="omaa-zcode-empty" data-testid="artifact-preset-empty">等待 report 数据…</p>; }

// The three leaf layouts below adapt the fixed upstream renderers to DSH CSS;
// all field interpretation, keyed upsert and latest-value logic stays upstream.
const PresetDashboard = memo(function PresetDashboard({ artifact, items }) {
  const spec = useMemo(() => parseArtifactPresetSpec(artifact.kind, artifact.spec), [artifact.kind, artifact.spec]);
  const model = useMemo(() => spec ? applyArtifactItems(artifact.kind, spec, items) : undefined, [artifact.kind, spec, items]);
  if (!model) return <p role="alert" className="omaa-error">产物定义不完整，无法渲染此看板。</p>;
  if (model.kind === 'chart') return <ZCodeArtifactChart spec={spec} items={items}/>;
  if (model.kind === 'table') {
    if (!model.rows.length) return <PresetEmpty/>;
    return <div data-testid="artifact-table"><p className="omaa-zcode-help" data-testid="artifact-table-count">{model.rows.length} 行{model.rows.length > 200 ? ' · 预览前 200 行' : ''}</p><div className="omaa-zcode-table-scroll"><table><thead><tr>{model.columns.map((column, index) => <th scope="col" key={`${column.field}:${index}`}>{heading(column.label, column.unit)}</th>)}</tr></thead><tbody>{model.rows.slice(0, 200).map(row => <tr className="omaa-zcode-reveal" data-testid="artifact-table-row" key={row.id}>{row.cells.map((cell, index) => <td key={index} title={cell}>{cell}</td>)}</tr>)}</tbody></table></div></div>;
  }
  if (model.kind === 'metrics') {
    if (!model.metrics.some(tile => tile.value !== undefined)) return <PresetEmpty/>;
    return <div className="omaa-zcode-metrics" data-testid="artifact-metrics">{model.metrics.map((tile, index) => <div className="omaa-zcode-metric" data-testid="artifact-metric-tile" data-metric-field={tile.field} key={`${tile.field}:${index}`}><span title={tile.label}>{tile.label}</span><div><strong className="omaa-zcode-reveal" key={`${tile.field}:${tile.sequence ?? 'none'}`} data-testid="artifact-metric-value" title={tile.value ?? '—'}>{tile.value ?? '—'}</strong>{tile.unit && tile.value !== undefined && <small>{tile.unit}</small>}</div></div>)}</div>;
  }
  if (!model.cardCount) return <PresetEmpty/>;
  return <div data-testid="artifact-board"><p className="omaa-zcode-help">{model.cardCount} 张卡片</p><div className="omaa-zcode-board">{model.columns.map(column => <section className="omaa-zcode-board-column" key={column.id} data-column-id={column.id} data-testid="artifact-board-column"><header><h4>{column.other ? '其他' : column.id}</h4><small>{column.cards.length}</small></header>{column.cards.map(card => <div className="omaa-zcode-board-card omaa-zcode-reveal" key={card.id} data-card-id={card.id} data-testid="artifact-board-card"><strong title={card.title}>{card.title}</strong>{card.details.length > 0 && <dl>{card.details.map((detail, index) => <div key={index}><dt>{detail.label}</dt><dd title={detail.value}>{detail.value}</dd></div>)}</dl>}</div>)}</section>)}</div></div>;
});

function ArtifactContent({ settings, sidebarRight, sessionId, runId, artifact, version }) {
  const [state, setState] = useState({ loading: false, error: '' });
  const lifecycle = useRef({ active: true, controller: undefined });
  useEffect(() => {
    lifecycle.current.active = true; setState({ loading: false, error: '' });
    return () => { lifecycle.current.active = false; lifecycle.current.controller?.abort(); };
  }, [sessionId, runId, artifact.id, version.version]);
  const open = async () => {
    if (state.loading) return;
    const expectedId = artifact.id, expectedVersion = version.version;
    const active = () => lifecycle.current.active && settings.getSnapshot().sessionId === sessionId && settings.getSnapshot().data?.product?.id === 'zcode' && (!sidebarRight?.mounted || sidebarRight.mounted.getSnapshot() === sessionId);
    if (!active()) return;
    setState({ loading: true, error: '' });
    const controller = new AbortController(); lifecycle.current.controller = controller;
    try {
      const response = await fetch(endpoint('zcode-artifact-preview', { session: sessionId, run: runId, id: expectedId, version: expectedVersion }), { credentials: 'same-origin', signal: controller.signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
      if (!active()) return;
      if (value.sessionId !== sessionId || value.runId !== runId || value.id !== expectedId || value.version !== expectedVersion || typeof value.resource !== 'string' || !value.resource.startsWith('dsh-resource://')) throw new Error('预览引用与所选产物版本不一致，请刷新。');
      await sidebarRight.openResource(value.resource);
      if (active()) setState({ loading: false, error: '' });
    } catch (error) { if (active()) setState({ loading: false, error: error.message }); }
  };
  return <div className="omaa-zcode-native-preview"><button type="button" disabled={state.loading} onClick={() => { void open(); }}>{state.loading ? '正在打开…' : '打开原生预览'}</button><p className="omaa-zcode-help">预览此发布版本的内容。</p>{state.error && <p role="alert" className="omaa-error">{state.error}</p>}</div>;
}

function ArtifactDetail({ settings, sidebarRight, sessionId, runId, artifact, items }) {
  const [selectedVersion, setVersion] = useState('latest');
  useEffect(() => { setVersion('latest'); }, [sessionId, runId, artifact.id]);
  const versions = [...(artifact.versions?.length ? artifact.versions : [artifact])].sort((a, b) => b.version - a.version);
  const version = selectedVersion === 'latest' ? versions[0] : versions.find(value => String(value.version) === selectedVersion) || versions[0];
  const preset = presetKinds.has(artifact.kind);
  const download = endpoint('zcode-artifact-content', { session: sessionId, run: runId, id: artifact.id, version: version.version, download: 1 });
  return <article className="omaa-zcode-artifact" aria-label={artifact.title || artifact.id}>
    <header><div><h4>{artifact.title || artifact.spec?.title || artifact.id}{artifact.primary && <small className="omaa-zcode-primary">主要产物</small>}</h4><p className="omaa-zcode-help">{artifact.kind}{!preset && ` · v${version.version}`}{Number.isFinite(version.bytes) && ` · ${version.bytes.toLocaleString()} B`}</p></div>{!preset && <a className="omaa-zcode-button" href={download} download>下载</a>}</header>
    {(artifact.description || artifact.spec?.description) && <p className="omaa-zcode-help">{artifact.description || artifact.spec?.description}</p>}
    {!preset && versions.length > 1 && <label className="omaa-zcode-version">版本<select aria-label="产物版本" value={selectedVersion} onChange={event => setVersion(event.target.value)}><option value="latest">最新版本 · v{versions[0].version}</option>{versions.map(value => <option key={value.version} value={value.version}>v{value.version}{value.publishedAt ? ` · ${new Date(value.publishedAt).toLocaleString()}` : ''}</option>)}</select></label>}
    {version.sourcePath && <p className="omaa-zcode-help omaa-zcode-path" title={version.sourcePath}>{version.sourcePath}</p>}
    {preset ? <PresetDashboard artifact={artifact} items={items}/> : <ArtifactContent key={`${sessionId}:${runId}:${artifact.id}:${version.version}`} {...{ settings, sidebarRight, sessionId, runId, artifact, version }}/>}
  </article>;
}

export function ZCodeWorkflows({ settings, sidebarRight, visible = true, requestedRunId, onOpenActor, onOpenWorkspace }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const controller = useMemo(() => createZCodeWorkflowsController(settings, sidebarRight), [settings, sidebarRight]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const enabled = current.data?.product?.id === 'zcode' && (!current.agentPreset || current.agentPreset === 'omaa-zcode');
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (enabled && visible && current.sessionId && typeof requestedRunId === 'string' && requestedRunId) controller.selectRun(requestedRunId, { requested: true });
  }, [controller, current.sessionId, enabled, visible, requestedRunId]);
  useEffect(() => { controller.setVisible(visible && enabled); }, [controller, visible, enabled]);
  const graphRegion = useRef(null), artifactRegion = useRef(null), recordsRegion = useRef(null);
  if (!enabled || !visible || state.sessionId !== current.sessionId) return null;
  const detail = state.detail?.sessionId === current.sessionId && state.detail?.runId === state.runId ? state.detail : null;
  const artifacts = artifactOrder(detail?.artifacts || []), artifact = artifacts.find(value => value.id === state.artifactId);
  const relatedRuns = detail ? [['resumedFrom', '← 前次运行'], ['supersededBy', '后续运行 →']].flatMap(([field, label]) => {
    const run = state.runs.find(value => value.runId === detail[field] && value.runId !== state.runId);
    return run ? [{ field, label, run }] : [];
  }) : [];
  const navigateRegion = ref => { ref.current?.scrollIntoView({ block: 'start' }); ref.current?.focus({ preventScroll: true }); };
  const artifactKeys = event => {
    const buttons = [...event.currentTarget.querySelectorAll('button')], index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus(); buttons[next]?.click();
  };
  return <section className="omaa-zcode-workflows" aria-busy={state.loading || undefined} aria-label="ZCode 工作流产物">
    <style>{css}</style><header className="omaa-zcode-toolbar"><h3>工作流</h3><button type="button" onClick={() => { void controller.refresh(); }} disabled={state.loading}>刷新</button></header>
    {state.loading && <p className="omaa-zcode-help" role="status">正在读取工作流…</p>}
    {state.error && <p role="alert" className="omaa-error">{state.error}</p>}
    {!state.runs.length && !state.loading && !state.error && <p className="omaa-zcode-empty">本会话还没有工作流运行。</p>}
    {state.runs.length > 0 && <label className="omaa-zcode-run-select">运行<select aria-label="工作流运行" value={state.runId} onChange={event => controller.selectRun(event.target.value)}>{state.runs.map(run => <option key={run.runId} value={run.runId}>{run.name || '未命名工作流'} · {statusLabel(run.status)}{run.startedAt ? ` · ${new Date(run.startedAt).toLocaleString()}` : ''}</option>)}</select></label>}
    {detail && <>{relatedRuns.length > 0 && <nav className="omaa-zcode-run-lineage" aria-label="工作流修订运行">{relatedRuns.map(({ field, label, run }) => <button type="button" key={field} title={run.name || '未命名工作流'} onClick={() => controller.selectRun(run.runId)}>{label}</button>)}</nav>}<div className="omaa-zcode-run-status"><span className="omaa-zcode-status" data-status={detail.status}>{statusLabel(detail.status)}</span>{detail.phase && <span>{typeof detail.phase === 'string' ? detail.phase : detail.phase.name || detail.phase.id || ''}</span>}<small>{detail.artifacts.length} 个产物 · {detail.reportCount ?? detail.reports?.length ?? 0} 条报告</small>{!terminalStatuses.has(detail.status) && <button type="button" disabled={state.stopping || state.stopRequested} onClick={() => { void controller.stop(); }}>{state.stopping ? '正在请求停止…' : state.stopRequested ? '停止已请求' : '停止运行'}</button>}</div>
      {detail.error && <p className="omaa-error" role="alert">{typeof detail.error === 'string' ? detail.error : detail.error.message || detail.error.reason || JSON.stringify(detail.error)}</p>}
      <nav className="omaa-zcode-section-nav" aria-label="工作台导航">{detail.displayGraph && <button type="button" onClick={() => navigateRegion(graphRegion)}>图与阶段</button>}<button type="button" onClick={() => navigateRegion(artifactRegion)}>产物 · {artifacts.length}</button>{(detail.graph || detail.causalityGraph || detail.reports?.length > 0) && <button type="button" onClick={() => navigateRegion(recordsRegion)}>源码与记录</button>}</nav>
      {detail.displayGraph && <div ref={graphRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="工作流图与阶段"><ZCodeWorkflowGraph graph={detail.displayGraph} run={detail.runtime}
        onOpenActor={onOpenActor} onOpenWorkspace={onOpenWorkspace}/></div>}
      <div ref={artifactRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="发布产物">{artifacts.length > 0 ? <><nav className="omaa-zcode-artifact-tabs" aria-label="工作流产物" onKeyDown={artifactKeys}>{artifacts.map(value => <button type="button" key={value.id} aria-current={state.artifactId === value.id ? 'page' : undefined} onClick={() => controller.selectArtifact(value.id)}>{value.primary && <span aria-hidden="true">★ </span>}<span>{value.title || value.spec?.title || value.id}</span><small>{value.kind}</small></button>)}</nav>{artifact && <ArtifactDetail key={`${current.sessionId}:${state.runId}:${artifact.id}`} settings={settings} sidebarRight={sidebarRight} sessionId={current.sessionId} runId={state.runId} artifact={artifact} items={state.items}/>}</> : <p className="omaa-zcode-empty">此运行尚未发布产物。</p>}</div>
      <div ref={recordsRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="工作流源码与记录">{(detail.graph || detail.causalityGraph) && <details className="omaa-zcode-graph"><summary>编译图</summary>{detail.graph && <pre className="omaa-zcode-text">{JSON.stringify(detail.graph, null, 2)}</pre>}{detail.causalityGraph && <details><summary>因果图</summary><pre className="omaa-zcode-text">{JSON.stringify(detail.causalityGraph, null, 2)}</pre></details>}</details>}
      {detail.reports?.length > 0 && <details className="omaa-zcode-reports"><summary>报告记录 · {detail.reports.length}</summary>{detail.reports.map((report, index) => <div className="omaa-zcode-report" key={`${report.sequence}:${report.siteId}:${report.ordinal}:${index}`}><small>#{report.sequence}{report.artifactId ? ` · ${report.artifactId}` : ''}</small><pre className="omaa-zcode-text">{typeof report.item === 'string' ? report.item : JSON.stringify(report.item, null, 2)}</pre></div>)}</details>}
      </div>
    </>}
  </section>;
}
