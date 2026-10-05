import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { themePacks } from './themes/packs.mjs';
import { productForPreset } from '../shared/products.mjs';

const modes = [['default', '执行'], ['plan', '计划'], ['ask', '问答']];
const modeLabel = mode => modes.find(([id]) => id === mode)?.[1] ?? '执行';
const enhancementWorkModes = [['off', '普通'], ['pro', 'Pro'], ['ultracode', 'Ultra']];
const workModeOf = data => data?.enhancement && enhancementWorkModes.some(([id]) => id === data.enhancementWorkMode) ? data.enhancementWorkMode : 'off';
const workModeAvailable = data => data?.omdAvailable === true && data.enhancementWorkModeAvailable === true;

export function createSessionSettings(ctx, request = fetch) {
  const listeners = new Set();
  let disposed = false, controller, revision = 0, signature = '', queued = false, refreshAfterSave = false;
  let state = { sessionId: undefined, agentPreset: undefined, data: null, loading: false, saving: false, error: '' };
  const emit = () => { state = { ...state }; for (const fn of listeners) fn(); };
  const api = async (sessionId, patch, signal) => {
    const response = await request(`omaa/api/session?session=${encodeURIComponent(sessionId)}`, {
      credentials: 'same-origin', signal,
      ...(patch === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
    });
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || `HTTP ${response.status}`);
    return next;
  };
  const rowOf = id => ctx.sessions.list.getSnapshot().byId[id];
  const withLiveGuards = (data, id) => {
    const row = rowOf(id);
    // Wire plan.pending means "a change is waiting". The API has already
    // normalized the controller's desired true/false into pendingMode.
    return { ...data, running: Boolean(data.running || row?.running),
      pendingMode: Boolean(data.pendingMode || row?.projectionValues?.plan?.pending) };
  };
  const refresh = async () => {
    const sessionId = state.sessionId;
    if (disposed || !sessionId) return;
    if (state.saving) { refreshAfterSave = true; return; }
    controller?.abort(); controller = new AbortController();
    const ticket = ++revision, signal = controller.signal;
    state = { ...state, loading: true }; emit();
    try {
      const data = await api(sessionId, undefined, signal);
      if (!disposed && state.sessionId === sessionId && revision === ticket) {
        state = { ...state, data: withLiveGuards(data, sessionId), loading: false, error: '' }; emit();
      }
    } catch (error) {
      if (!disposed && !signal.aborted && state.sessionId === sessionId && revision === ticket) {
        state = { ...state, loading: false, error: error.message }; emit();
      }
    }
  };
  const scheduleRefresh = () => {
    if (queued || disposed) return; queued = true;
    queueMicrotask(() => { queued = false; if (!disposed) void refresh(); });
  };
  const sync = () => {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    const row = sessionId ? rowOf(sessionId) : undefined;
    const agentPreset = row?.projectionValues?.agentPreset;
    if (sessionId !== state.sessionId) {
      controller?.abort(); ++revision; signature = ''; refreshAfterSave = false;
      state = { sessionId, agentPreset, data: null, loading: Boolean(sessionId), saving: false, error: '' }; emit();
    } else if (agentPreset !== state.agentPreset) {
      const changedProduct = typeof agentPreset === 'string' && state.data?.product && agentPreset !== state.data.product.preset;
      if (changedProduct) { controller?.abort(); ++revision; refreshAfterSave = false; }
      state = { ...state, agentPreset, ...(changedProduct ? { data: null, loading: true, saving: false, pendingPatch: undefined, error: '' } : {}) }; emit();
    }
    if (!sessionId) return;
    const nextSignature = JSON.stringify([sessionId, row?.running, row?.projectionValues?.agentPreset,
      row?.projectionValues?.plan, row?.projectionValues?.omdUltracode, row?.projectionValues?.modelSelection]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    if (state.data && typeof row?.running === 'boolean' && state.data.running !== row.running) {
      state = { ...state, data: { ...state.data, running: row.running } }; emit();
    }
    if (state.data && row?.projectionValues?.plan?.pending === true && !state.data.pendingMode) {
      state = { ...state, data: { ...state.data, pendingMode: true } }; emit();
    }
    scheduleRefresh();
  };
  const offMounted = ctx.sidebarRight.mounted.subscribe(sync), offList = ctx.sessions.list.subscribe(sync);
  sync();
  return {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => state,
    refresh,
    async update(patch, expectedSessionId = state.sessionId) {
      if (disposed || !state.sessionId || expectedSessionId !== state.sessionId) throw new Error('当前会话已切换，请重新操作。');
      if (!state.data?.product) throw new Error('请选择 OMAA 预设会话。');
      if (state.saving) throw new Error('正在保存会话设置，请稍候。');
      if (state.loading || state.error) throw new Error('请先重新读取会话设置，再修改。');
      if (state.data.running) throw new Error('请先停止当前任务，再修改预设设置。');
      if (Object.hasOwn(patch, 'mode') && state.data.pendingMode) throw new Error('当前模式切换等待处理，请先在宿主提示中继续。');
      if (Object.hasOwn(patch, 'enhancementWorkMode')) {
        if (!enhancementWorkModes.some(([id]) => id === patch.enhancementWorkMode)) throw new Error('请选择普通、Pro 或 Ultra 工作方式。');
        if (!workModeAvailable(state.data)) throw new Error('当前 OMD 尚未提供兼容的 Pro / Ultra 工作方式。');
        if (state.data.mode !== 'default' || state.data.pendingMode) throw new Error('请先进入执行模式，再切换增强工作方式。');
      }
      const sessionId = state.sessionId, ticket = ++revision;
      controller?.abort();
      state = { ...state, saving: true, pendingPatch: { ...patch }, error: '' }; emit();
      try {
        const data = await api(sessionId, patch);
        if (!disposed && state.sessionId === sessionId && revision === ticket) {
          state = { ...state, data: withLiveGuards(data, sessionId), saving: false, pendingPatch: undefined, loading: false }; emit();
        }
      } catch (error) {
        if (!disposed && state.sessionId === sessionId && revision === ticket) {
          state = { ...state, saving: false, pendingPatch: undefined, error: error.message }; emit();
        }
      } finally {
        if (!disposed && state.sessionId === sessionId && revision === ticket && refreshAfterSave) {
          refreshAfterSave = false; scheduleRefresh();
        }
      }
    },
    dispose() {
      if (disposed) return; disposed = true; ++revision; controller?.abort(); offMounted(); offList(); listeners.clear();
    },
  };
}

export function PresetControls({ settings, getThemeRuntime, compact = false, visible = true, openPanel }) {
  const state = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const runtime = getThemeRuntime();
  const appearanceState = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [localError, setLocalError] = useState('');
  useEffect(() => { setLocalError(''); }, [state.sessionId]);
  useEffect(() => {
    if (!compact && visible && state.sessionId) void settings.refresh();
  }, [settings, state.sessionId, compact, visible]);
  const data = state.data, product = data?.product;
  const enhancementWorkMode = state.pendingPatch?.enhancementWorkMode ?? workModeOf(data);
  const activeWorkMode = workModeAvailable(data) && data.enhancementWorkModeActive === true && enhancementWorkMode !== 'off'
    ? enhancementWorkModes.find(([id]) => id === workModeOf(data))?.[1] : '';
  const compactProduct = product ?? (state.loading ? productForPreset(state.agentPreset) : undefined);
  const compactName = compactProduct?.id === 'pi' ? 'Pi' : compactProduct?.id === 'grok' ? 'Grok' : compactProduct?.name;
  const compactStatus = product ? (data.mode !== 'default' ? modeLabel(data.mode) : activeWorkMode || (data.enhancementActive ? 'OMD' : '')) : '';
  if (compact) return compactProduct ? <button type="button" className="omaa-preset-chip" aria-label={`${compactProduct.name} 预设设置`}
    title={product ? `${product.name} · ${modeLabel(data.mode)}${activeWorkMode ? ' · OMD ' + activeWorkMode : data.enhancementActive ? ' · OMD 增强' : ''}` : `${compactProduct.name} · 正在读取会话设置…`}
    onClick={openPanel}><span className="omaa-preset-chip-name">{compactName}</span>{compactStatus && <small>{compactStatus}</small>}<span className="omaa-preset-chip-chevron" aria-hidden="true">⌄</span></button> : null;
  const disabled = !product || state.loading || state.saving || Boolean(state.error || data?.running);
  const change = patch => { setLocalError(''); void settings.update(patch, state.sessionId).catch(error => {
    if (settings.getSnapshot().sessionId === state.sessionId) setLocalError(error.message);
  }); };
  const appearance = async event => {
    const sessionId = state.sessionId;
    setLocalError('');
    try { await runtime.setAppearance(event.target.value); if (settings.getSnapshot().sessionId === sessionId) setLocalError(''); }
    catch (error) { if (settings.getSnapshot().sessionId === sessionId) setLocalError(error.message); }
  };
  return <section className="omaa-preset-controls" aria-label="Oh My Agents Above All 预设设置">
    <header><h2>{product?.name ?? 'Oh My Agents Above All'}</h2><p>{product ? (data.running ? '正在执行 · 停止后可调整本会话设置' : '本会话设置') : '在新会话中选择 Codex、Grok Build、Cursor、Pi 或 ZCode 预设。'}</p></header>
    {state.loading && <p role="status" className="omaa-help">正在读取会话设置…</p>}
    {state.saving && <p role="status" className="omaa-help">正在保存会话设置…</p>}
    {(state.error || localError || appearanceState.error) && <p role="alert" className="omaa-error">{state.error || localError || appearanceState.error}</p>}
    {product && <>
      <label className="omaa-setting-row"><span>工作模式</span><select aria-label="工作模式" value={state.pendingPatch?.mode ?? data.mode} disabled={disabled || product.id === 'pi' || data.pendingMode}
        onChange={event => change({ mode: event.target.value })}>{(product.id === 'pi' ? modes.slice(0, 1) : modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {data.pendingMode && <p role="status" className="omaa-help">模式切换等待处理，请在宿主提示中继续。</p>}
      <label className="omaa-setting-row"><span>会话主题</span><select aria-label="会话主题" value={state.pendingPatch?.theme ?? data.theme} disabled={disabled} onChange={event => change({ theme: event.target.value })}>
        <option value="product">跟随当前预设</option><option value="host">DSH 默认外观</option><option value="omd" disabled={!data.omdAvailable}>OMD 当前外观</option>
        {themePacks.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
      {(data.theme === 'cursor-cli' || data.theme === 'product' && product.id === 'cursor') && <p className="omaa-help">参考 Cursor IDE / Agents Window 的 Agent 对话布局；明暗颜色沿用当前 DSH，并非官方固定配色。</p>}
      <label className="omaa-setting-row"><span>OMD 增强</span><input type="checkbox" role="switch" aria-label="OMD 增强" checked={state.pendingPatch?.enhancement ?? Boolean(data.enhancement)} disabled={disabled || !data.omdAvailable}
        onChange={event => change({ enhancement: event.target.checked })}/></label>
      <p className="omaa-help">{data.omdIncompatible ? '当前 OMD 版本缺少兼容接口，请升级兼容 OMD 或使用独立 DSH profile。' : !data.omdAvailable ? '安装并启用 Oh My DSH 后可开启增强。' : data.enhancementActive ? 'OMD 增强已启用。' : 'OMD 增强关闭。'}</p>
      <div className="omaa-enhancement-work-mode">
        <label className="omaa-setting-row"><span>增强工作方式</span><select aria-label="增强工作方式" value={enhancementWorkMode}
          disabled={disabled || !workModeAvailable(data) || data.mode !== 'default' || data.pendingMode}
          onChange={event => change({ enhancementWorkMode: event.target.value })}>
          {enhancementWorkModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <p className="omaa-help">普通增强使用基础工具；Pro 偏重实现与精炼，Ultra 保留更全面的编排。选择 Pro 或 Ultra 会同时开启增强。</p>
        {!workModeAvailable(data) ? <p className="omaa-help">当前 OMD 尚未提供兼容的 Pro / Ultra 工作方式。</p>
          : data.mode !== 'default' || data.pendingMode ? <p className="omaa-help">进入执行模式后可切换增强工作方式。</p>
          : enhancementWorkMode !== 'off' && <p role="status" className="omaa-help">{activeWorkMode ? `${activeWorkMode} 已启用。` : `${enhancementWorkModes.find(([id]) => id === enhancementWorkMode)?.[1]} 已选择，当前尚未启用。`}</p>}
      </div>
    </>}
    <label className="omaa-setting-row"><span>明暗模式</span><select aria-label="明暗模式" value={runtime.getAppearance()} disabled={appearanceState.appearanceSaving} onChange={appearance}>
      <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
    {state.error && <button type="button" className="omaa-retry" disabled={state.loading || state.saving} onClick={() => { void settings.refresh(); }}>重新读取</button>}
  </section>;
}
