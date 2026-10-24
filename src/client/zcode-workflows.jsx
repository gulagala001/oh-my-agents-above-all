import { Button, TextArea, Select } from './ui.jsx';
import React, { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseArtifactPresetSpec } from '../../lib/zcode-artifact-ui-spec.mjs';
import { applyArtifactItems } from '../../lib/zcode-artifact-ui-apply.mjs';
import { ZCodeArtifactChart } from './zcode-artifact-chart.jsx';
import { ZCodeWorkflowGraph } from './zcode-workflow-graph.jsx';
import { assertSavedWorkflowSession } from './zcode-saved-workflow-state.mjs';
import { submitLiveHoleRequest, submitWorkflowResumeRequest, submitWorkflowQuestionAnswer, readWorkflowSourceResponse } from './zcode-workflow-request-state.mjs';
import css from './zcode-workflows.css';

const presetKinds = new Set(['chart', 'table', 'metrics', 'board']);
const terminalStatuses = new Set(['completed', 'complete', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'interrupted', 'killed', 'error']);
const statusLabel = value => ({ running: '运行中', submitted: '已提交', pending: '等待中', queued: '等待中', completed: '已完成', complete: '已完成', succeeded: '已完成', failed: '失败', cancelled: '已取消', canceled: '已取消', interrupted: '已中断', killed: '已中断' })[value] || value || '未知状态';
const heading = (label, unit) => unit ? `${label} (${unit})` : label;
const itemPageState = () => ({ items: [], aggregate: null, itemScope: 'page', cursor: 0, hasMore: false,
  itemAfter: 0, itemBack: [], aggregateAfter: 0, aggregateBack: [] });
const reportPageState = () => ({ reportAfter: 0, reportBack: [] });
const emptyState = () => ({ sessionId: undefined, runs: [], runId: '', detail: null, artifactId: '', ...itemPageState(), ...reportPageState(), loading: false, stopping: false, stopRequested: false, error: '' });
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
          emit({ runs, runId: '', detail: null, artifactId: '', ...itemPageState(), ...reportPageState(), error: '请求的工作流不在本会话中。' });
          return;
        }
        const runId = runs.some(run => run.runId === state.runId) ? state.runId : runs[0]?.runId || '';
        requestedSelection = '';
        if (runId !== state.runId) emit({ runs, runId, detail: null, artifactId: '', ...itemPageState(), ...reportPageState() });
        else emit({ runs });
        if (!runId) return;
        const detail = await read('zcode-workflow', { session: id, run: runId, after: state.reportAfter, limit: 200 }, signal);
        if (!valid(id, ticket) || state.runId !== runId) return;
        const artifacts = artifactOrder(Array.isArray(detail.artifacts) ? detail.artifacts : []);
        const artifactId = artifacts.some(artifact => artifact.id === state.artifactId) ? state.artifactId : artifacts[0]?.id || '';
        const settled = terminalStatuses.has(detail.status) ? { stopping: false, stopRequested: false } : {};
        if (artifactId !== state.artifactId) emit({ detail, artifactId, ...itemPageState(), ...settled });
        else emit({ detail, ...settled });
        const artifact = artifacts.find(value => value.id === artifactId);
        if (!artifact || !presetKinds.has(artifact.kind)) return;
        // Retain only the selected bounded page. Refresh replaces that page,
        // including final reports after settlement; it never drains a 1-GiB run.
        {
          // Aggregate positions and raw report sequences are different cursor
          // domains. Preserve each independently even if the read scope changes.
          const after = state.aggregateAfter;
          const aggregate = await read('zcode-artifact-aggregate', { session: id, run: runId, id: artifactId, after, limit: 200 }, signal);
          if (!valid(id, ticket) || state.runId !== runId || state.artifactId !== artifactId) return;
          if (aggregate.scope === 'full-run') {
            if (aggregate.kind !== artifact.kind || aggregate.model?.kind !== artifact.kind || !Number.isSafeInteger(aggregate.cursor)
              || aggregate.cursor < after || aggregate.hasMore && aggregate.cursor === after) throw new Error('产物汇总分页与所选看板不一致，请刷新。');
            emit({ aggregate, itemScope: 'full-run', items: [], cursor: aggregate.cursor, hasMore: Boolean(aggregate.hasMore) }); return;
          }
          if (aggregate.scope !== 'page') throw new Error('产物汇总范围无效，请刷新。');
        }
        const after = state.itemAfter;
        const page = await read('zcode-artifact-data', { session: id, run: runId, id: artifactId, after, limit: 200 }, signal);
        if (!valid(id, ticket) || state.runId !== runId || state.artifactId !== artifactId) return;
        const cursor = Number(page.cursor);
        if (!Number.isSafeInteger(cursor) || cursor < after || (page.hasMore && cursor === after)) throw new Error('产物分页游标没有前进，请刷新。');
        emit({ aggregate: null, itemScope: 'page', items: page.items || [], cursor, hasMore: Boolean(page.hasMore) });
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
    isSelected: (sessionId, runId) => !disposed && visible && currentId() === sessionId && state.sessionId === sessionId && state.runId === runId,
    isOpenHole: (sessionId, runId, siteId, ordinal) => !disposed && visible && currentId() === sessionId
      && state.sessionId === sessionId && state.runId === runId && state.detail?.status === 'running'
      && state.detail.liveHoles?.open.some(hole => hole.siteId === siteId && hole.ordinal === ordinal),
    isResumeCandidate: (sessionId, runId) => !disposed && visible && currentId() === sessionId && state.sessionId === sessionId
      && state.runId === runId && state.detail?.nativeResume?.candidate === true,
    isPendingQuestion: (sessionId, runId, qid) => !disposed && visible && currentId() === sessionId && state.sessionId === sessionId
      && state.runId === runId && state.detail?.pendingQuestions?.some(question => question.qid === qid),
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
      emit({ runId, detail: null, artifactId: '', ...itemPageState(), ...reportPageState(), error: '', loading: false, stopping: false, stopRequested: false });
      void refresh();
    },
    selectArtifact(artifactId) {
      if (!currentId() || !state.detail?.artifacts.some(artifact => artifact.id === artifactId) || state.artifactId === artifactId) return;
      ++generation; controller?.abort();
      emit({ artifactId, ...itemPageState(), error: '', loading: false });
      void refresh();
    },
    nextItems() {
      const full = state.itemScope === 'full-run', after = full ? state.aggregateAfter : state.itemAfter;
      if (!currentId() || state.loading || !state.hasMore || state.cursor <= after) return;
      ++generation; controller?.abort();
      emit({ ...(full ? { aggregateBack: [...state.aggregateBack, after], aggregateAfter: state.cursor }
        : { itemBack: [...state.itemBack, after], itemAfter: state.cursor }),
        items: [], aggregate: null, cursor: state.cursor, hasMore: false });
      void refresh();
    },
    previousItems() {
      const full = state.itemScope === 'full-run', back = full ? state.aggregateBack : state.itemBack;
      if (!currentId() || state.loading || !back.length) return;
      ++generation; controller?.abort();
      emit({ ...(full ? { aggregateAfter: back.at(-1), aggregateBack: back.slice(0, -1) }
        : { itemAfter: back.at(-1), itemBack: back.slice(0, -1) }), items: [], aggregate: null, hasMore: false });
      void refresh();
    },
    nextReports() {
      const cursor = state.detail?.reportsCursor;
      if (!currentId() || state.loading || !state.detail?.reportsHasMore || !Number.isSafeInteger(cursor) || cursor <= state.reportAfter) return;
      ++generation; controller?.abort();
      emit({ reportBack: [...state.reportBack, state.reportAfter], reportAfter: cursor, detail: null });
      void refresh();
    },
    previousReports() {
      if (!currentId() || state.loading || !state.reportBack.length) return;
      ++generation; controller?.abort();
      emit({ reportAfter: state.reportBack.at(-1), reportBack: state.reportBack.slice(0, -1), detail: null });
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
const PresetDashboard = memo(function PresetDashboard({ artifact, items, aggregate }) {
  const spec = useMemo(() => parseArtifactPresetSpec(artifact.kind, artifact.spec), [artifact.kind, artifact.spec]);
  const model = useMemo(() => aggregate?.scope === 'full-run' ? aggregate.model
    : spec ? applyArtifactItems(artifact.kind, spec, items) : undefined, [artifact.kind, spec, items, aggregate]);
  if (!model) return <p role="alert" className="omaa-error">产物定义不完整，无法渲染此看板。</p>;
  if (model.kind === 'chart') return <ZCodeArtifactChart spec={spec} items={items} aggregate={aggregate}/>;
  if (model.kind === 'table') {
    if (!model.rows.length) return <PresetEmpty/>;
    return <div data-testid="artifact-table"><p className="omaa-zcode-help" data-testid="artifact-table-count">{aggregate?.totalRows ?? model.rows.length} 行 · 本页 {Math.min(200, model.rows.length)} 行</p><div className="omaa-zcode-table-scroll"><table><thead><tr>{model.columns.map((column, index) => <th scope="col" key={`${column.field}:${index}`}>{heading(column.label, column.unit)}</th>)}</tr></thead><tbody>{model.rows.slice(0, 200).map(row => <tr className="omaa-zcode-reveal" data-testid="artifact-table-row" key={row.stableKey ?? row.id}>{row.cells.map((cell, index) => <td key={index} title={cell}>{cell}</td>)}</tr>)}</tbody></table></div></div>;
  }
  if (model.kind === 'metrics') {
    if (!model.metrics.some(tile => tile.value !== undefined)) return <PresetEmpty/>;
    return <div className="omaa-zcode-metrics" data-testid="artifact-metrics">{model.metrics.map((tile, index) => <div className="omaa-zcode-metric" data-testid="artifact-metric-tile" data-metric-field={tile.field} key={`${tile.field}:${index}`}><span title={tile.label}>{tile.label}</span><div><strong className="omaa-zcode-reveal" key={`${tile.field}:${tile.sequence ?? 'none'}`} data-testid="artifact-metric-value" title={tile.value ?? '—'}>{tile.value ?? '—'}</strong>{tile.unit && tile.value !== undefined && <small>{tile.unit}</small>}</div></div>)}</div>;
  }
  if (!model.cardCount) return <PresetEmpty/>;
  return <div data-testid="artifact-board"><p className="omaa-zcode-help">{model.cardCount} 张卡片 · 本页 {model.columns.reduce((count, column) => count + column.cards.length, 0)} 张</p><div className="omaa-zcode-board">{model.columns.map((column, columnIndex) => <section className="omaa-zcode-board-column" key={`${columnIndex}:${column.other}:${column.id}`} data-column-id={column.id} data-testid="artifact-board-column"><header><h4>{column.other ? '其他' : column.id}</h4><small>{column.count ?? column.cards.length}</small></header>{column.cards.map(card => <div className="omaa-zcode-board-card omaa-zcode-reveal" key={card.stableKey ?? card.id} data-card-id={card.id} data-testid="artifact-board-card"><strong title={card.title}>{card.title}</strong>{card.details.length > 0 && <dl>{card.details.map((detail, index) => <div key={index}><dt>{detail.label}</dt><dd title={detail.value}>{detail.value}</dd></div>)}</dl>}</div>)}</section>)}</div></div>;
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
  return <div className="omaa-zcode-native-preview"><Button type="button" disabled={state.loading} onClick={() => { void open(); }}>{state.loading ? '正在打开…' : '打开原生预览'}</Button><p className="omaa-zcode-help">预览此发布版本的内容。</p>{state.error && <p role="alert" className="omaa-error">{state.error}</p>}</div>;
}

function PageControls({ page, count, total, more, loading, previous, next, label = '报告分页' }) {
  return <nav className="omaa-zcode-pages" aria-label={label}>
    <Button type="button" disabled={loading || page === 1} onClick={previous}>上一页</Button>
    <span>第 {page} 页 · 本页 {count} 条{Number.isSafeInteger(total) ? ` / 共 ${total} 条` : ''}</span>
    <Button type="button" disabled={loading || !more} onClick={next}>下一页</Button>
  </nav>;
}

function ArtifactDetail({ settings, sidebarRight, sessionId, runId, artifact, items, pageOnly, aggregate }) {
  const [selectedVersion, setVersion] = useState('latest');
  useEffect(() => { setVersion('latest'); }, [sessionId, runId, artifact.id]);
  const versions = [...(artifact.versions?.length ? artifact.versions : [artifact])].sort((a, b) => b.version - a.version);
  const version = selectedVersion === 'latest' ? versions[0] : versions.find(value => String(value.version) === selectedVersion) || versions[0];
  const preset = presetKinds.has(artifact.kind);
  const download = endpoint('zcode-artifact-content', { session: sessionId, run: runId, id: artifact.id, version: version.version, download: 1 });
  return <article className="omaa-zcode-artifact" aria-label={artifact.title || artifact.id}>
    <header><div><h4>{artifact.title || artifact.spec?.title || artifact.id}{artifact.primary && <small className="omaa-zcode-primary">主要产物</small>}</h4><p className="omaa-zcode-help">{artifact.kind}{!preset && ` · v${version.version}`}{Number.isFinite(version.bytes) && ` · ${version.bytes.toLocaleString()} B`}</p></div>{!preset && <a className="omaa-zcode-button" href={download} download>下载</a>}</header>
    {(artifact.description || artifact.spec?.description) && <p className="omaa-zcode-help">{artifact.description || artifact.spec?.description}</p>}
    {preset && pageOnly && <p className="omaa-zcode-help" role="status">图表与统计仅汇总当前页报告。翻页可查看其他报告；完整数据仍保留。</p>}
    {aggregate?.scope === 'full-run' && <p className="omaa-zcode-help" role="status">按全部 {aggregate.totalItems} 条报告汇总；显示有界数据窗口。{Boolean(aggregate.truncatedFields || aggregate.identityDisplaysBounded) && '超长显示字段已缩短，原始报告完整保留。'}</p>}
    {!preset && versions.length > 1 && <label className="omaa-zcode-version">版本<Select aria-label="产物版本" value={selectedVersion} onChange={event => setVersion(event.target.value)}><option value="latest">最新版本 · v{versions[0].version}</option>{versions.map(value => <option key={value.version} value={value.version}>v{value.version}{value.publishedAt ? ` · ${new Date(value.publishedAt).toLocaleString()}` : ''}</option>)}</Select></label>}
    {version.sourcePath && <p className="omaa-zcode-help omaa-zcode-path" title={version.sourcePath}>{version.sourcePath}</p>}
    {preset ? <PresetDashboard artifact={artifact} items={items} aggregate={aggregate}/> : <ArtifactContent key={`${sessionId}:${runId}:${artifact.id}:${version.version}`} {...{ settings, sidebarRight, sessionId, runId, artifact, version }}/>}
  </article>;
}

function LiveHoleRequest({ settings, sessions, sidebarRight, controller, sessionId, runId, hole, running }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [body, setBody] = useState(''), [action, setAction] = useState({ busy: false, sent: false, error: '' });
  const lifetime = useRef({ alive: false, busy: false, revision: 0 });
  useEffect(() => {
    const life = lifetime.current; life.alive = true; ++life.revision;
    return () => { life.alive = false; ++life.revision; };
  }, [sessionId, runId, hole.siteId, hole.ordinal]);
  const available = Boolean(sessions && running && current.sessionId === sessionId && current.data?.mode === 'default'
    && !current.loading && !current.saving && !current.error && !current.data.pendingMode && !current.data.running);
  const send = async () => {
    const life = lifetime.current;
    if (!life.alive || life.busy || action.sent) return;
    const ticket = life.revision;
    const alive = () => life.alive && life.revision === ticket && controller.isOpenHole(sessionId, runId, hole.siteId, hole.ordinal);
    life.busy = true; setAction({ busy: true, sent: false, error: '' });
    try {
      await submitLiveHoleRequest({ settings, sessions, sidebarRight, sessionId, alive }, { runId, siteId: hole.siteId, body });
      if (alive()) setAction({ busy: false, sent: true, error: '' });
    } catch (error) { if (life.alive && life.revision === ticket) setAction({ busy: false, sent: false, error: error.message }); }
    finally { life.busy = false; }
  };
  return <div className="omaa-zcode-hole-request">
    <strong>{hole.name}</strong>{hole.phaseName && <small> · {hole.phaseName}</small>}
    <p className="omaa-zcode-hole-id"><code>{hole.siteId}</code><small> · 第 {hole.ordinal} 次到达</small></p>
    {hole.prompt && <p>{hole.prompt}</p>}
    {running && <><label>TypeScript 函数体语句<TextArea rows={4} maxLength={256 * 1024} placeholder="return value;" value={body}
      disabled={!available || action.busy || action.sent} onChange={event => { setBody(event.target.value); setAction({ busy: false, sent: false, error: '' }); }}/></label>
      <Button type="button" disabled={!available || action.busy || action.sent || !body.trim()} onClick={() => { void send(); }}>{action.busy ? '正在发送…' : action.sent ? '请求已接受' : '发送补全请求'}</Button>
      <p className="omaa-zcode-help">填写函数体内的语句。请求交给当前会话；实际补全结果由 fill_workflow 返回。</p>
      {!available && !action.sent && <p className="omaa-zcode-help">请在执行模式且当前会话空闲时发送。</p>}
      {action.sent && <p role="status" className="omaa-zcode-help">补全请求已接受，等待工作流工具的实际结果。</p>}
      {action.sent && <Button type="button" disabled={!available || action.busy} onClick={() => setAction({ busy: false, sent: false, error: '' })}>编辑后重新请求</Button>}
    </>}
    {action.error && <p role="alert" className="omaa-error">{action.error}</p>}
  </div>;
}

function WorkflowRequest({ settings, sessions, sidebarRight, controller, sessionId, runId, question }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [answer, setAnswer] = useState(''), [action, setAction] = useState({ busy: false, sent: false, error: '' });
  const lifetime = useRef({ alive: false, busy: false, revision: 0 });
  useEffect(() => {
    const life = lifetime.current; life.alive = true; ++life.revision;
    return () => { life.alive = false; ++life.revision; };
  }, [sessionId, runId, question?.qid]);
  const available = Boolean(sessions && current.sessionId === sessionId && current.data?.mode === 'default'
    && !current.loading && !current.saving && !current.error && !current.data.pendingMode && !current.data.running);
  const send = async () => {
    const life = lifetime.current;
    if (!life.alive || life.busy || action.sent) return;
    const ticket = life.revision;
    const alive = () => life.alive && life.revision === ticket && (question
      ? controller.isPendingQuestion(sessionId, runId, question.qid) : controller.isResumeCandidate(sessionId, runId));
    life.busy = true; setAction({ busy: true, sent: false, error: '' });
    try {
      const context = { settings, sessions, sidebarRight, sessionId, alive };
      if (question) await submitWorkflowQuestionAnswer(context, { questionId: question.qid, answer });
      else await submitWorkflowResumeRequest(context, { runId });
      if (alive()) setAction({ busy: false, sent: true, error: '' });
    } catch (error) { if (life.alive && life.revision === ticket) setAction({ busy: false, sent: false, error: error.message }); }
    finally { life.busy = false; }
  };
  return <div className="omaa-zcode-hole-request">
    {question && <><strong>{question.actorName || question.actor}</strong><p>{question.question}</p>
      {question.context && <details><summary>提问上下文</summary><pre className="omaa-zcode-text">{question.context}</pre></details>}
      {question.truncated && <p className="omaa-zcode-help">提问显示已缩短；原始事实仍保留。</p>}
      <label>回答<TextArea rows={3} maxLength={256 * 1024} value={answer} disabled={!available || action.busy || action.sent}
        onChange={event => setAnswer(event.target.value)}/></label></>}
    <Button type="button" disabled={!available || action.busy || action.sent || Boolean(question && !answer)} onClick={() => { void send(); }}>
      {action.busy ? '正在发送…' : action.sent ? '请求已接受' : question ? '发送回答请求' : '发送续跑请求'}</Button>
    <p className="omaa-zcode-help">{question ? '回答交给当前会话调用 resolve_workflow_question；实际结果由工具返回。'
      : '此运行有预先保存的 v3 记录。实际续跑仍须通过源码、模型、目录、回执与外部影响预检。'}</p>
    {!available && <p className="omaa-zcode-help">请在执行模式且当前会话空闲时发送。</p>}
    {action.sent && <><p role="status" className="omaa-zcode-help">请求已接受，等待实际工具结果。</p>
      <Button type="button" disabled={!available || action.busy} onClick={() => setAction({ busy: false, sent: false, error: '' })}>编辑后重新请求</Button></>}
    {action.error && <p role="alert" className="omaa-error">{action.error}</p>}
  </div>;
}

function WorkflowSource({ settings, sidebarRight, controller, sessionId, runId, revision }) {
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const [expanded, setExpanded] = useState(false), [reload, setReload] = useState(0);
  const [state, setState] = useState({ loading: false, value: null, error: '' });
  const lifetime = useRef(0);
  useEffect(() => {
    const ticket = ++lifetime.current, abort = new AbortController();
    const active = () => lifetime.current === ticket && !abort.signal.aborted && controller.isSelected(sessionId, runId);
    if (!expanded) { setState({ loading: false, value: null, error: '' }); return () => { ++lifetime.current; abort.abort(); }; }
    setState({ loading: true, value: null, error: '' });
    void (async () => {
      try {
        assertSavedWorkflowSession(settings, sidebarRight, sessionId, false, false);
        if (!active()) return;
        const response = await fetch(endpoint('zcode-workflow-source', { session: sessionId, run: runId }), { credentials: 'same-origin', signal: abort.signal });
        const value = await readWorkflowSourceResponse(response, { sessionId, runId });
        if (!active()) return;
        assertSavedWorkflowSession(settings, sidebarRight, sessionId, false, false);
        setState({ loading: false, value, error: '' });
      } catch (error) { if (active()) setState({ loading: false, value: null, error: error.message }); }
    })();
    return () => { ++lifetime.current; abort.abort(); };
  }, [expanded, reload, revision, settings, sidebarRight, controller, sessionId, runId, current.loading, current.saving, current.error, current.data?.pendingMode]);
  return <details className="omaa-zcode-source" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>工作流源码</summary>
    {expanded && <>{state.loading && <p role="status" className="omaa-zcode-help">正在读取归档源码…</p>}
      {state.error && <p role="alert" className="omaa-error">{state.error}</p>}
      <Button type="button" disabled={state.loading} onClick={() => setReload(value => value + 1)}>重新读取源码</Button>
      {state.value && <><p className="omaa-zcode-help">源码快照 · 修订 {state.value.revision}</p><p className="omaa-zcode-source-hash">SHA-256 · <code>{state.value.scriptHash}</code></p><pre className="omaa-zcode-text">{state.value.script}</pre></>}
    </>}
  </details>;
}

export function ZCodeWorkflows({ settings, sessions, sidebarRight, visible = true, requestedRunId, onOpenActor, onOpenWorkspace }) {
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
  const itemBack = state.itemScope === 'full-run' ? state.aggregateBack : state.itemBack;
  const aggregateCount = state.aggregate?.kind === 'chart' ? state.aggregate.model.points.length
    : state.aggregate?.kind === 'table' ? state.aggregate.model.rows.length
      : state.aggregate?.kind === 'board' ? state.aggregate.model.columns.reduce((count, column) => count + column.cards.length, 0) : 0;
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
    <style>{css}</style><header className="omaa-zcode-toolbar"><h3>工作流</h3><Button type="button" onClick={() => { void controller.refresh(); }} disabled={state.loading}>刷新</Button></header>
    {state.loading && <p className="omaa-zcode-help" role="status">正在读取工作流…</p>}
    {state.error && <p role="alert" className="omaa-error">{state.error}</p>}
    {!state.runs.length && !state.loading && !state.error && <p className="omaa-zcode-empty">本会话还没有工作流运行。</p>}
    {state.runs.length > 0 && <label className="omaa-zcode-run-select">运行<Select aria-label="工作流运行" value={state.runId} onChange={event => controller.selectRun(event.target.value)}>{state.runs.map(run => <option key={run.runId} value={run.runId}>{run.name || '未命名工作流'} · {statusLabel(run.status)}{run.startedAt ? ` · ${new Date(run.startedAt).toLocaleString()}` : ''}</option>)}</Select></label>}
    {detail && <>{relatedRuns.length > 0 && <nav className="omaa-zcode-run-lineage" aria-label="工作流修订运行">{relatedRuns.map(({ field, label, run }) => <Button type="button" key={field} title={run.name || '未命名工作流'} onClick={() => controller.selectRun(run.runId)}>{label}</Button>)}</nav>}<div className="omaa-zcode-run-status"><span className="omaa-zcode-status" data-status={detail.status}>{statusLabel(detail.status)}</span>{detail.phase && <span>{typeof detail.phase === 'string' ? detail.phase : detail.phase.name || detail.phase.id || ''}</span>}<small>{detail.artifacts.length} 个产物 · {detail.reportCount ?? detail.reports?.length ?? 0} 条报告</small>{!terminalStatuses.has(detail.status) && <Button type="button" disabled={state.stopping || state.stopRequested} onClick={() => { void controller.stop(); }}>{state.stopping ? '正在请求停止…' : state.stopRequested ? '停止已请求' : '停止运行'}</Button>}</div>
      {detail.error && <p className="omaa-error" role="alert">{typeof detail.error === 'string' ? detail.error : detail.error.message || detail.error.reason || JSON.stringify(detail.error)}</p>}
      {detail.nativeResume?.candidate === true && <WorkflowRequest key={`resume:${current.sessionId}:${state.runId}`}
        {...{ settings, sessions, sidebarRight, controller }} sessionId={current.sessionId} runId={state.runId}/>}
      {detail.pendingQuestionCount > 0 && <aside className="omaa-zcode-live-holes" aria-label="Actor 等待回答">
        <h4>Actor 等待回答 · {detail.pendingQuestionCount}</h4>
        {detail.pendingQuestions.map(question => <WorkflowRequest key={question.qid} {...{ settings, sessions, sidebarRight, controller, question }}
          sessionId={current.sessionId} runId={state.runId}/>)}
        {detail.pendingQuestionsTruncated && <p className="omaa-zcode-help">这里只显示部分提问，其他等待者仍保留。</p>}
      </aside>}
      {detail.liveHoles?.openCount > 0 && <aside className="omaa-zcode-live-holes" aria-label={terminalStatuses.has(detail.status) ? '未完成的留白记录' : '等待补全的留白'}>
        <h4>{terminalStatuses.has(detail.status) ? '未完成的留白' : '等待补全'} · {detail.liveHoles.openCount} 个留白</h4>
        {detail.liveHoles.open.map(hole => <LiveHoleRequest key={`${current.sessionId}:${state.runId}:${hole.siteId}:${hole.ordinal}`}
          {...{ settings, sessions, sidebarRight, controller, hole }} sessionId={current.sessionId} runId={state.runId} running={detail.status === 'running'}/>)}
        {detail.liveHoles.truncated && <p className="omaa-zcode-help">这里只显示部分留白，其他留白仍然保留。</p>}
      </aside>}
      <nav className="omaa-zcode-section-nav" aria-label="工作台导航">{detail.displayGraph && <Button type="button" onClick={() => navigateRegion(graphRegion)}>图与阶段</Button>}<Button type="button" onClick={() => navigateRegion(artifactRegion)}>产物 · {artifacts.length}</Button><Button type="button" onClick={() => navigateRegion(recordsRegion)}>源码与记录</Button></nav>
      {detail.displayGraph && <div ref={graphRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="工作流图与阶段"><ZCodeWorkflowGraph graph={detail.displayGraph} run={detail.runtime}
        onOpenActor={onOpenActor} onOpenWorkspace={onOpenWorkspace}/></div>}
      <div ref={artifactRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="发布产物">{artifacts.length > 0 ? <><nav className="omaa-zcode-artifact-tabs" aria-label="工作流产物" onKeyDown={artifactKeys}>{artifacts.map(value => <Button type="button" key={value.id} aria-current={state.artifactId === value.id ? 'page' : undefined} onClick={() => controller.selectArtifact(value.id)}>{value.primary && <span aria-hidden="true">★ </span>}<span>{value.title || value.spec?.title || value.id}</span><small>{value.kind}</small></Button>)}</nav>{artifact && <><ArtifactDetail key={`${current.sessionId}:${state.runId}:${artifact.id}`} settings={settings} sidebarRight={sidebarRight} sessionId={current.sessionId} runId={state.runId} artifact={artifact} items={state.items} aggregate={state.aggregate} pageOnly={!state.aggregate && (state.hasMore || state.itemBack.length > 0)}/>{presetKinds.has(artifact.kind) && state.aggregate?.kind !== 'metrics' && <PageControls label={state.itemScope === 'full-run' ? '汇总分页' : '报告分页'} page={itemBack.length + 1} count={state.aggregate ? aggregateCount : state.items.length} total={state.aggregate?.totalRows ?? state.aggregate?.cardCount ?? state.aggregate?.totalPoints ?? artifact.itemCount} more={state.hasMore} loading={state.loading} previous={() => controller.previousItems()} next={() => controller.nextItems()}/>}</>}</> : <p className="omaa-zcode-empty">此运行尚未发布产物。</p>}</div>
      <div ref={recordsRegion} tabIndex={-1} className="omaa-zcode-region" aria-label="工作流源码与记录"><WorkflowSource key={`${current.sessionId}:${state.runId}`}
        {...{ settings, sidebarRight, controller }} sessionId={current.sessionId} runId={state.runId} revision={detail.liveHoles?.scriptHash ?? detail.revision}/>
        {(detail.graph || detail.causalityGraph) && <details className="omaa-zcode-graph"><summary>编译图</summary>{detail.graph && <pre className="omaa-zcode-text">{JSON.stringify(detail.graph, null, 2)}</pre>}{detail.causalityGraph && <details><summary>因果图</summary><pre className="omaa-zcode-text">{JSON.stringify(detail.causalityGraph, null, 2)}</pre></details>}</details>}
      {detail.reports?.length > 0 && <details className="omaa-zcode-reports"><summary>报告记录 · {detail.untaggedReportCount ?? detail.reports.length}</summary><PageControls page={state.reportBack.length + 1} count={detail.reports.length} total={detail.untaggedReportCount} more={detail.reportsHasMore} loading={state.loading} previous={() => controller.previousReports()} next={() => controller.nextReports()}/>{detail.reports.map((report, index) => <div className="omaa-zcode-report" key={`${report.sequence}:${report.siteId}:${report.ordinal}:${index}`}><small>#{report.sequence}{report.artifactId ? ` · ${report.artifactId}` : ''}</small><pre className="omaa-zcode-text">{typeof report.item === 'string' ? report.item : JSON.stringify(report.item, null, 2)}</pre></div>)}</details>}
      </div>
    </>}
  </section>;
}
