import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { themePacks } from './themes/packs.mjs';
import { productForPreset } from '../shared/products.mjs';
import { ZCodeAgentProfileDirectoryControls } from './zcode-agent-profile-directory-controls.jsx';
import { ZCodeAgentMemoryControls } from './zcode-agent-memory-controls.jsx';

const modes = [['default', '执行'], ['plan', '计划'], ['ask', '问答']];
const modeLabel = mode => modes.find(([id]) => id === mode)?.[1] ?? '执行';
const enhancementWorkModes = [['off', '普通'], ['ultra', 'Ultra']];
const enhancementWorkSubmodes = [['workflow', 'Workflow'], ['team', 'Agent Team'], ['free', '自由']];
const workSubmodeOf = data => data?.enhancementWorkSubmode === 'team' && data.enhancementTeamAvailable !== true ? 'free' : enhancementWorkSubmodes.some(([id]) => id === data?.enhancementWorkSubmode) ? data.enhancementWorkSubmode : 'free';
const workLabel = (mode, submode) => mode === 'ultra' ? `Ultra · ${enhancementWorkSubmodes.find(([id]) => id === submode)?.[1] ?? '自由'}` : '普通';
const workModeOf = data => data?.enhancement && enhancementWorkModes.some(([id]) => id === data.enhancementWorkMode) ? data.enhancementWorkMode : 'off';
const workModeAvailable = data => data?.omdAvailable === true && data.enhancementWorkModeAvailable === true;

export function createSessionSettings(ctx, request = fetch, enabled) {
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
    if (disposed || !sessionId || enabled && !enabled.includes(productForPreset(state.agentPreset)?.id)) return;
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
    const product = productForPreset(agentPreset);
    if (!sessionId || enabled && (!product || !enabled.includes(product.id))) {
      controller?.abort(); ++revision; signature = ''; refreshAfterSave = false;
      if (state.data || state.loading || state.saving || state.error) {
        state = { ...state, data: null, loading: false, saving: false, pendingPatch: undefined, error: '' }; emit();
      }
      return;
    }
    const nextSignature = JSON.stringify([sessionId, row?.running, row?.projectionValues?.agentPreset,
      row?.projectionValues?.plan, row?.projectionValues?.omdUltracode, row?.projectionValues?.omdWorkModes, row?.projectionValues?.modelSelection]);
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
      if (Object.hasOwn(patch, 'projectMemory') && (state.data.product.id !== 'zcode' || state.data.mode !== 'default'
        || state.data.pendingMode || Object.keys(patch).some(key => key !== 'projectMemory')))
        throw new Error('请在空闲的 ZCode 执行模式单独保存项目记忆配置。');
      if (Object.hasOwn(patch, 'agentProfileDirectory') && (state.data.product.id !== 'zcode' || state.data.mode !== 'default'
        || state.data.pendingMode || !state.data.agentProfileDirectoryAvailable || Object.keys(patch).some(key => key !== 'agentProfileDirectory')))
        throw new Error('请在空闲的 ZCode 主会话执行模式单独保存 Agent 目录。');
      if (Object.hasOwn(patch, 'agentMemory') && (state.data.product.id !== 'zcode' || state.data.mode !== 'default'
        || state.data.pendingMode || !state.data.agentMemoryAvailable || Object.keys(patch).some(key => key !== 'agentMemory')))
        throw new Error('请在空闲的 ZCode 主会话执行模式单独保存 Agent 记忆。');
      if (Object.hasOwn(patch, 'enhancementWorkMode') || Object.hasOwn(patch, 'enhancementWorkSubmode')) {
        if (Object.hasOwn(patch, 'enhancementWorkMode') && !enhancementWorkModes.some(([id]) => id === patch.enhancementWorkMode)) throw new Error('请选择普通或 Ultra 工作方式。');
        if (Object.hasOwn(patch, 'enhancementWorkSubmode') && !enhancementWorkSubmodes.some(([id]) => id === patch.enhancementWorkSubmode)) throw new Error('请选择 Workflow、Agent Team 或自由子模式。');
        if (patch.enhancementWorkSubmode === 'team' && state.data.enhancementTeamAvailable !== true) throw new Error('请先在 DSH 中开启 Agent Team，再选择此子模式。');
        if (!workModeAvailable(state.data)) throw new Error('当前 OMD 尚未提供兼容的 Ultra 工作方式。');
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
        throw error;
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

function ZCodeProjectMemoryControls({ settings, state, disabled }) {
  const selected = state.data?.projectMemory;
  const selectionKey = JSON.stringify(selected ?? null);
  const [root, setRoot] = useState(selected?.root ?? ''), [error, setError] = useState('');
  useEffect(() => { setRoot(selected?.root ?? ''); setError(''); }, [selectionKey]);
  const save = async clear => {
    const sessionId = state.sessionId, value = root;
    setError('');
    if (!clear && (!value || value.length > 4096 || value.includes('\0')
      || !(value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)))) {
      setError('请填写已有记忆目录的绝对路径（最多 4096 字符，不含 NUL）。'); return;
    }
    try { await settings.update({ projectMemory: clear ? null : { root: value } }, sessionId); }
    catch (failure) { if (settings.getSnapshot().sessionId === sessionId) setError(failure.message); }
  };
  return <fieldset disabled={disabled} aria-label="ZCode 项目记忆">
    <legend>项目记忆</legend>
    <p className="omaa-help">{selected ? '本会话已启用默认 MEMORY.md 索引读取。' : '未启用；不会猜测或创建记忆目录。'}</p>
    <p className="omaa-help">工作区：{state.data?.workspacePath || '当前会话没有工作区，无法启用。'}</p>
    {selected && <p className="omaa-help">已保存目录：{selected.root}<br/>绑定工作区：{selected.workspacePath}</p>}
    <label className="omaa-setting-row"><span>已有记忆目录</span><input type="text" aria-label="项目记忆目录" maxLength={4096}
      value={root} onChange={event => setRoot(event.target.value)}/></label>
    <p className="omaa-help">填写执行环境中已有目录的绝对路径，保存后才生效。此选择仅绑定当前会话工作区，不授予额外文件权限，不创建目录或记忆文件，不自动调用模型抽取。维护仍使用原生 write/edit 工具及其权限与审批；问答和计划模式不自动写记忆。</p>
    {error && <p role="alert" className="omaa-error">{error}</p>}
    <button type="button" disabled={!state.data?.workspacePath || !root.trim() || root === selected?.root} onClick={() => { void save(false); }}>保存并启用项目记忆</button>
    <button type="button" disabled={!selected} onClick={() => { void save(true); }}>关闭项目记忆</button>
    {(state.data?.mode !== 'default' || state.data?.pendingMode) && <p className="omaa-help">请先进入空闲的执行模式，再配置项目记忆。</p>}
  </fieldset>;
}

function ZCodeOutputStyleControls({ settings, state, disabled }) {
  const selected = state.data?.outputStyle;
  const selectionKey = JSON.stringify(selected ?? null);
  const [draft, setDraft] = useState({ name: '', prompt: '', keep: 'unset' });
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft({ name: selected?.name ?? '', prompt: selected?.prompt ?? '',
      keep: selected?.keepCodingInstructions === undefined ? 'unset' : String(selected.keepCodingInstructions) });
    setError('');
  }, [selectionKey]);
  const save = async clear => {
    const sessionId = state.sessionId;
    setError('');
    if (!clear && (!draft.name.trim() || !draft.prompt.trim())) { setError('请填写输出风格名称和提示内容。'); return; }
    const outputStyle = clear ? null : { name: draft.name.trim(), prompt: draft.prompt,
      ...(draft.keep === 'unset' ? {} : { keepCodingInstructions: draft.keep === 'true' }) };
    try {
      await settings.update({ outputStyle }, sessionId);
      if (clear && settings.getSnapshot().sessionId === sessionId) setDraft({ name: '', prompt: '', keep: 'unset' });
    }
    catch (failure) { if (settings.getSnapshot().sessionId === sessionId) setError(failure.message); }
  };
  return <fieldset disabled={disabled} aria-label="ZCode 输出风格">
    <legend>输出风格</legend>
    <p className="omaa-help">{selected ? `本会话已选择：${selected.name}` : '未选择输出风格，沿用原有提示。'} 此选择只作用于当前会话。</p>
    <label className="omaa-setting-row"><span>名称</span><input type="text" aria-label="输出风格名称" maxLength={128}
      value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
    <label><span>提示内容</span><textarea aria-label="输出风格提示内容" rows={6} maxLength={16384}
      value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.target.value })}/></label>
    <label className="omaa-setting-row"><span>保留编码指令标志</span><select aria-label="保留编码指令标志" value={draft.keep}
      onChange={event => setDraft({ ...draft, keep: event.target.value })}>
      <option value="unset">未指定</option><option value="true">是</option><option value="false">否</option></select></label>
    <p className="omaa-help">名称最多 128 字符，提示最多 16384 字符（OMAA 本地限制，按 UTF-16 计数）。可选标志随选择保存；当前公开提示构建器不会据此切换编码指令。</p>
    {error && <p role="alert" className="omaa-error">{error}</p>}
    <button type="button" onClick={() => { void save(false); }}>保存输出风格</button>
    <button type="button" onClick={() => { void save(true); }}>清除输出风格</button>
  </fieldset>;
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
  const enhancementWorkSubmode = state.pendingPatch?.enhancementWorkSubmode ?? workSubmodeOf(data);
  const activeWorkMode = workModeAvailable(data) && data.enhancementWorkModeActive === true
    ? workLabel(data.enhancementWorkModeCurrent ?? workModeOf(data), data.enhancementWorkSubmodeCurrent ?? workSubmodeOf(data)) : '';
  const compactProduct = product ?? productForPreset(state.agentPreset);
  const compactName = compactProduct?.id === 'pi' ? 'Pi' : compactProduct?.id === 'grok' ? 'Grok' : compactProduct?.name;
  const phase = state.saving ? 'saving' : state.loading ? 'loading' : state.error ? 'error' : data?.running ? 'running' : data?.pendingMode ? 'pending' : 'ready';
  const phaseLabel = { error: '读取失败', saving: '保存中', loading: '读取中', running: '执行中', pending: '待确认' }[phase];
  const compactStatus = phaseLabel || (product ? (data.mode !== 'default' ? modeLabel(data.mode) : activeWorkMode || (data.enhancementActive ? 'OMD' : '')) : '');
  if (compact) return compactProduct ? <button type="button" className="omaa-preset-chip" aria-label={`${compactProduct.name} 预设设置`}
    data-state={phase} aria-busy={state.loading || state.saving || undefined}
    title={`${compactProduct.name} · ${phaseLabel || modeLabel(data?.mode)}${state.error ? ' · 点击重新读取' : activeWorkMode ? ' · OMD ' + activeWorkMode : data?.enhancementActive ? ' · OMD 增强' : ''}`}
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
  const guidance = { codex: '围绕对话实现与审阅代码；行级反馈会发送到当前会话。', grok: '监控与定时任务沿用 DSH 原生后台任务，进度与结果保留在对话中。', cursor: '计划、问答与执行共用对话；文件检查点在下方审阅与恢复。', pi: '保持 Pi 的紧凑执行流程；模型、终端工具与停止操作使用 DSH 原生控制。', zcode: '对话发起工作流；图、Actor、脚本、产物与保存定义在工作台中查看。' };
  return <section className="omaa-preset-controls" data-product={product?.id} data-state={phase} aria-busy={state.loading || state.saving || undefined} aria-label="Oh My Agents Above All 预设设置">
    <header><div className="omaa-preset-heading"><h2>{product?.name ?? 'Oh My Agents Above All'}</h2>{product && <span className="omaa-session-state" data-state={phase}>{phaseLabel || '本会话'}</span>}</div><p>{product ? (data.running ? '正在执行 · 使用对话中的停止按钮，停止后可调整设置。' : guidance[product.id]) : '在新会话中选择 Codex、Grok Build、Cursor、Pi 或 ZCode 预设。'}</p></header>
    {state.loading && <p role="status" className="omaa-help">正在读取会话设置…</p>}
    {state.saving && <p role="status" className="omaa-help">正在保存会话设置…</p>}
    {(!state.loading && state.error || localError || appearanceState.error) && <p role="alert" className="omaa-error">{!state.loading && state.error || localError || appearanceState.error}</p>}
    {product && <>
      {product.id === 'pi' ? <div className="omaa-setting-row"><span>工作模式</span><span className="omaa-setting-value">执行（Pi 默认模式）</span></div>
        : <label className="omaa-setting-row"><span>工作模式</span><select aria-label="工作模式" value={state.pendingPatch?.mode ?? data.mode} disabled={disabled || data.pendingMode}
          onChange={event => change({ mode: event.target.value })}>{modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {data.pendingMode && <p role="status" className="omaa-help">模式切换等待处理，请在宿主提示中继续。</p>}
      <label className="omaa-setting-row"><span>会话主题</span><select aria-label="会话主题" value={state.pendingPatch?.theme ?? data.theme} disabled={disabled} onChange={event => change({ theme: event.target.value })}>
        <option value="product">跟随当前预设</option><option value="host">DSH 默认外观</option><option value="omd" disabled={!data.omdAvailable}>OMD 当前外观</option>
        {themePacks.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
      {(data.theme === 'cursor-cli' || data.theme === 'product' && product.id === 'cursor') && <p className="omaa-help">参考 Cursor IDE / Agents Window 的 Agent 对话布局；明暗颜色沿用当前 DSH，并非官方固定配色。</p>}
      {product.id === 'zcode' && <ZCodeOutputStyleControls key={state.sessionId} settings={settings} state={state} disabled={disabled}/>}
      {product.id === 'zcode' && <ZCodeProjectMemoryControls key={`memory:${state.sessionId}`} settings={settings} state={state}
        disabled={disabled || data.mode !== 'default' || data.pendingMode || !data.projectMemoryAvailable}/>}
      {product.id === 'zcode' && <ZCodeAgentProfileDirectoryControls key={`agents:${state.sessionId}`} settings={settings} state={state}
        disabled={disabled || data.mode !== 'default' || data.pendingMode || !data.agentProfileDirectoryAvailable}/>}
      {product.id === 'zcode' && <ZCodeAgentMemoryControls key={`agent-memory:${state.sessionId}`} settings={settings} state={state}
        disabled={disabled || data.mode !== 'default' || data.pendingMode || !data.agentMemoryAvailable}/>}
      <label className="omaa-setting-row"><span>OMD 增强</span><input type="checkbox" role="switch" aria-label="OMD 增强" checked={state.pendingPatch?.enhancement ?? Boolean(data.enhancement)} disabled={disabled || !data.omdAvailable}
        onChange={event => change({ enhancement: event.target.checked })}/></label>
      <p className="omaa-help">{data.omdIncompatible ? '当前 OMD 版本缺少兼容接口，请升级兼容 OMD 或使用独立 DSH profile。' : !data.omdAvailable ? 'OMD 增强暂未就绪。请确认已安装并启用 Oh My DSH，再检查状态。' : data.enhancementActive ? 'OMD 增强已启用。' : 'OMD 增强关闭。'}</p>
      {!data.omdAvailable && <button type="button" className="omaa-retry" disabled={state.loading || state.saving} onClick={() => { void settings.refresh(); }}>检查增强状态</button>}
      <div className="omaa-enhancement-work-mode">
        <label className="omaa-setting-row"><span>增强工作方式</span><select aria-label="增强工作方式" value={enhancementWorkMode}
          disabled={disabled || !workModeAvailable(data) || data.mode !== 'default' || data.pendingMode}
          onChange={event => change({ enhancementWorkMode: event.target.value })}>
          {enhancementWorkModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {enhancementWorkMode === 'ultra' && <label className="omaa-setting-row"><span>Ultra 子模式</span><select aria-label="Ultra 子模式" value={enhancementWorkSubmode}
          disabled={disabled || !workModeAvailable(data) || data.mode !== 'default' || data.pendingMode}
          onChange={event => change({ enhancementWorkMode: 'ultra', enhancementWorkSubmode: event.target.value })}>
          {enhancementWorkSubmodes.filter(([value]) => value !== 'team' || data.enhancementTeamAvailable === true).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
        <p className="omaa-help">Ultra 会同时开启增强。Workflow 使用工作流，自由按任务选择协作方式。Agent Team 由 DSH 原生开关和界面管理，未开启时隐藏此选项。</p>
        {!workModeAvailable(data) ? <p className="omaa-help">当前 OMD 尚未提供兼容的 Ultra 工作方式。</p>
          : data.mode !== 'default' || data.pendingMode ? <p className="omaa-help">进入执行模式后可切换增强工作方式。</p>
          : data.enhancementWorkModePending ? <p role="status" className="omaa-help">{workLabel(enhancementWorkMode, enhancementWorkSubmode)} 已保存，下一轮生效。当前为{activeWorkMode || '普通'}。</p>
          : enhancementWorkMode !== 'off' && <p role="status" className="omaa-help">{activeWorkMode ? `${activeWorkMode} 已启用。` : `${workLabel(enhancementWorkMode, enhancementWorkSubmode)} 已选择，当前尚未启用。`}</p>}
      </div>
    </>}
    <label className="omaa-setting-row"><span>明暗模式</span><select aria-label="明暗模式" value={runtime.getAppearance()} disabled={appearanceState.appearanceSaving} onChange={appearance}>
      <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
    {state.error && <button type="button" className="omaa-retry" disabled={state.loading || state.saving} onClick={() => { void settings.refresh(); }}>重新读取</button>}
  </section>;
}
