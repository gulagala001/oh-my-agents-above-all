import { Button, TextArea, Select, Input, Checkbox } from './ui.jsx';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { savedWorkflowResult, supportedSavedWorkflowResult, savedWorkflowRunKind, savedWorkflowDefinition, savedWorkflowDraft, savedWorkflowArgs, savedWorkflowMetadataDraft, savedWorkflowMetadata, assertSavedWorkflowSession, submitSavedWorkflowRequest, savedWorkflowManagementLocked, subscribeSavedWorkflowManagement } from './zcode-saved-workflow-state.mjs';
import css from './zcode-saved-workflow.css';

const labels = { save_workflow: '保存工作流', list_saved_workflows: '保存的工作流', read_saved_workflow: '工作流定义', run_saved_workflow: '运行保存的工作流', update_saved_workflow: '更新工作流元数据', move_saved_workflow: '移动保存定义', delete_saved_workflow: '删除保存定义' };
const statusLabels = new Map(Object.entries({ backgrounded: '已启动后台任务', running: '运行中', submitted: '已提交', completed: '已完成', killed: '已中断', cancelled: '已取消' }));
const managementStatusLabels = new Map(Object.entries({ completed: '已完成', partial: '部分完成', unknown: '结果未知', refused: '已拒绝' }));
const scopeLabel = scope => ({ project: '项目', global: '全局' })[scope] || scope;
const textOf = block => (Array.isArray(block.content) ? block.content : []).filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') || (typeof block.error?.reason === 'string' ? block.error.reason : typeof block.error?.code === 'string' ? block.error.code : '');
const displayValue = value => JSON.stringify(value);

export function ZCodeSavedWorkflowTool({ phase, block, toolName, sessionId, settings, sessions, sidebarRight, useDisclosure, inspect, callId }) {
  const { expanded, toggle } = useDisclosure();
  const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
  const parsed = phase === 'result' ? savedWorkflowResult(block) : undefined;
  const supported = phase === 'result' && supportedSavedWorkflowResult(toolName, parsed);
  const value = supported ? parsed : undefined;
  const definition = toolName === 'read_saved_workflow' ? savedWorkflowDefinition(value) : undefined;
  const management = ['move_saved_workflow', 'delete_saved_workflow'].includes(toolName);
  const identity = JSON.stringify([callId, phase, toolName, textOf(block)]);
  const lifetime = useRef({ alive: false, revision: 0, busy: false });
  const renderRevision = lifetime.current.revision;
  const [draft, setDraft] = useState({}), [actionState, setActionState] = useState({ error: '', sent: false, busy: false });
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState({ description: '', whenToUse: '', args: '' });
  const managementSubmitted = useSyncExternalStore(listener => subscribeSavedWorkflowManagement(sessions, listener),
    () => savedWorkflowManagementLocked(sessions, sessionId, callId, definition?.sourceSha256));
  useEffect(() => {
    lifetime.current.alive = true; ++lifetime.current.revision; lifetime.current.busy = false;
    setDraft(definition ? savedWorkflowDraft(definition) : {}); setActionState({ error: '', sent: false, busy: false });
    setMetadataDraft(definition ? savedWorkflowMetadataDraft(definition) : { description: '', whenToUse: '', args: '' });
    setDeleteConfirmed(false);
    const context = () => {
      const next = settings.getSnapshot();
      return JSON.stringify([next.sessionId, next.agentPreset, next.data?.product?.id, next.data?.mode, next.data?.pendingMode, sidebarRight.mounted.getSnapshot()]);
    };
    let signature = context();
    const sync = () => {
      const next = context();
      if (next === signature) return;
      signature = next; ++lifetime.current.revision; lifetime.current.busy = false;
      setActionState({ error: '', sent: false, busy: false });
      setDeleteConfirmed(false);
    };
    const offSettings = settings.subscribe(sync), offMounted = sidebarRight.mounted.subscribe(sync);
    return () => { offSettings(); offMounted(); lifetime.current.alive = false; ++lifetime.current.revision; lifetime.current.busy = false; };
  }, [identity, sessionId]);
  const failed = phase === 'result' && (block.isError || block.error || value?.ok === false || value?.result?.ok === false);
  // Native JavaScript workflow runs have their own host lifecycle and are not
  // in the existing ZCode artifact workbench. Only its typed runs can open it.
  const typedRun = value?.facade !== 'native' && savedWorkflowRunKind(value?.result) === 'typed-run';
  const runId = typedRun && typeof value?.result?.runId === 'string' && value.result.runId ? value.result.runId : undefined;
  let available = true, runnable = true;
  try { assertSavedWorkflowSession(settings, sidebarRight, sessionId); } catch { available = false; }
  try { assertSavedWorkflowSession(settings, sidebarRight, sessionId, true); } catch { runnable = false; }
  const busy = actionState.busy || !available;
  const send = async (action, target) => {
    const life = lifetime.current;
    if (!life.alive || life.revision !== renderRevision || life.busy) return;
    const ticket = life.revision;
    const alive = () => life.alive && ticket === life.revision;
    let args, argsJson, metadata;
    if (['move', 'delete', 'update'].includes(action) && savedWorkflowManagementLocked(sessions, sessionId, callId, target?.sourceSha256)) { setActionState({ error: '此快照已尝试管理请求，请核对实际结果并重新读取定义。', sent: false, busy: false }); return; }
    if (action === 'delete' && !deleteConfirmed) { setActionState({ error: '请先勾选确认要删除的定义。', sent: false, busy: false }); return; }
    if (action === 'run') {
      const checked = savedWorkflowArgs(definition, draft);
      if (!checked.ok) { setActionState({ error: checked.errors.join('\n'), sent: false, busy: false }); return; }
      args = checked.args; argsJson = checked.argsJson;
    }
    if (action === 'update') {
      const checked = savedWorkflowMetadata(definition, metadataDraft);
      if (!checked.ok) { setActionState({ error: checked.error, sent: false, busy: false }); return; }
      metadata = checked.metadata;
    }
    life.busy = true; setActionState({ error: '', sent: false, busy: true });
    try {
      await submitSavedWorkflowRequest({ settings, sessions, sidebarRight, sessionId, alive }, action, { ...target, ...(action === 'run' ? { args, argsJson } : {}), ...(action === 'update' ? { metadata } : {}), ...(['move', 'delete', 'update'].includes(action) ? { readCallId: callId } : {}), ...(action === 'delete' ? { deleteConfirmed } : {}) });
      if (alive() && settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId) {
        setActionState({ error: '', sent: true, busy: false });
        if (['move', 'delete'].includes(action)) setDeleteConfirmed(false);
      }
    } catch (error) {
      if (alive() && settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId) setActionState({ error: error.message, sent: false, busy: false });
    } finally { if (alive()) life.busy = false; }
  };
  const openRun = () => {
    if (!lifetime.current.alive || lifetime.current.revision !== renderRevision) return;
    try {
      assertSavedWorkflowSession(settings, sidebarRight, sessionId, false, false);
      sidebarRight.openTabIn(sessionId, 'omaa-zcode-workflows', { params: { runId } });
    } catch (error) { setActionState(previous => ({ ...previous, error: error.message })); }
  };
  const update = (name, patch) => setDraft(previous => ({ ...previous, [name]: { ...previous[name], ...patch } }));
  const runStatus = value?.result?.status ?? (value?.result?.kind === 'background' ? 'backgrounded' : undefined);
  const status = phase === 'preparing' ? '准备中' : phase === 'start' ? '执行中' : management && supported ? managementStatusLabels.get(value.status) : failed ? '失败' : !supported ? '原始结果' : statusLabels.get(runStatus) || runStatus || '已完成';
  const canManage = Boolean(definition?.sourceSha256) && typeof callId === 'string' && Boolean(callId) && runnable && !busy && !managementSubmitted;
  return <div className="omaa-saved-workflow" data-phase={phase} data-error={failed || undefined} aria-busy={actionState.busy || undefined}>
    <style>{css}</style><header>
      <Button type="button" variant="ghost" className="omaa-saved-title" aria-expanded={expanded} onClick={toggle}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span><span>{labels[toolName]}{typeof value?.name === 'string' ? ` · ${value.name}` : ''}</span><small>{status}</small></Button>
      {runId && <Button type="button" onClick={openRun} disabled={current.sessionId !== sessionId || mounted !== sessionId}>查看运行与产物</Button>}
      {inspect && <Button type="button" onClick={inspect}>检查</Button>}
    </header>
    {actionState.busy && <p role="status" className="omaa-saved-notice">正在发送请求…</p>}
    {actionState.error && <div role="alert" className="omaa-saved-notice omaa-saved-error"><pre>{actionState.error}</pre></div>}
    {actionState.sent && <p role="status" className="omaa-saved-notice">宿主已接受请求，实际工具结果将显示在对话中；请求接受不代表操作已完成。</p>}
    {expanded && <div className="omaa-saved-body">
      {phase !== 'result' ? <section role="status">{phase === 'preparing' ? '正在准备工具参数…' : '等待实际工具结果…'}</section> : failed && !management ? <section className="omaa-saved-error"><pre>{textOf(block)}</pre></section> : !supported ? <section><small>原始工具结果</small><pre>{textOf(block) || '工具未返回内容。'}</pre></section> : <>
        {toolName === 'list_saved_workflows' && Array.isArray(value?.workflows) && <section>
          {value.workflows.length === 0 && <p>没有保存的工作流。</p>}
          {value.workflows.map((row, index) => <div className="omaa-saved-row" key={`${row.scope}:${row.name}:${index}`}><div><strong>{row.name}</strong> <small>{scopeLabel(row.scope)}</small><p>{row.description}</p>{row.whenToUse && <p>{row.whenToUse}</p>}<small className="omaa-saved-source">{row.path}</small></div><Button type="button" disabled={busy} onClick={() => { void send('read', row); }}>读取定义</Button></div>)}
        </section>}
        {Array.isArray(value?.invalid) && value.invalid.length > 0 && <section><h4>无法读取的定义</h4>{value.invalid.map((row, index) => <div className="omaa-saved-row" key={index}><div><small className="omaa-saved-source">{row.path}</small><p className="omaa-saved-error">{row.reason}</p></div></div>)}</section>}
        {typeof value?.name === 'string' && <section><strong>{value.name}</strong> <small>{scopeLabel(value.scope)}</small>{value.description && <p>{value.description}</p>}{value.whenToUse && <p>{value.whenToUse}</p>}<small className="omaa-saved-source">{value.path}</small>{value.facade && <small>接口：{value.facade === 'zcode' ? 'ZCode Actor' : value.facade === 'native' ? '原生 JavaScript' : value.facade}</small>}{value.shadowing && <p>{value.shadowing === 'hides_global' ? '此项目定义覆盖同名全局定义。' : value.shadowing === 'hidden_by_project' ? '此全局定义被同名项目定义覆盖。' : value.shadowing}</p>}</section>}
        {definition && <section><details><summary>已读取的定义源码</summary><small>此工具结果中的源码快照。{definition.bodyLineOffset !== undefined ? ` 正文行偏移：${definition.bodyLineOffset}。` : ''}</small><h4>脚本正文</h4><pre>{definition.script}</pre><details><summary>完整定义 · 含 metadata</summary><pre>{definition.source}</pre></details></details></section>}
        {definition && <section><h4>编辑元数据</h4><p><strong>{definition.name}</strong> · {scopeLabel(definition.scope)}</p><small className="omaa-saved-source">{definition.path}</small>
          <p><label>描述<TextArea rows={3} value={metadataDraft.description} disabled={!canManage} onChange={event => setMetadataDraft(previous => ({ ...previous, description: event.target.value }))}/></label></p>
          <p><label>何时使用<TextArea rows={3} value={metadataDraft.whenToUse} disabled={!canManage} onChange={event => setMetadataDraft(previous => ({ ...previous, whenToUse: event.target.value }))}/></label></p>
          <p><label>参数声明（JSON）<TextArea rows={6} value={metadataDraft.args} disabled={!canManage} onChange={event => setMetadataDraft(previous => ({ ...previous, args: event.target.value }))}/></label></p>
          <small>描述必填；何时使用或参数声明留空表示移除。参数声明沿用保存定义格式（type、required、default、description）。完整脚本正文保持不变。</small>
          <div className="omaa-saved-actions"><Button type="button" disabled={!canManage} onClick={() => { void send('update', definition); }}>发送元数据更新请求</Button><Button type="button" disabled={busy} onClick={() => { void send('read', definition); }}>重新读取元数据</Button></div>
          <small>仅使用此原生读取结果的完整源码哈希；冲突或结果未知时先核对并重新读取。请求接受不表示更新已完成。</small>
          {(!definition.sourceSha256 || !(typeof callId === 'string' && callId)) && <p>此读取记录缺少源码哈希或调用标识，请重新读取后编辑。</p>}
          {managementSubmitted && <p>此读取快照已尝试管理请求；请核对实际结果并重新读取。</p>}
          {available && !runnable && <p>请先切换到执行模式，再编辑元数据。</p>}
        </section>}
        {definition && <section><h4>运行参数</h4>{Object.entries(definition.args || {}).map(([name, spec]) => <div className="omaa-saved-parameter" key={name}><div><strong>{name}</strong> <small>{spec.type}{spec.required === true ? ' · 必填' : ' · 可选'}</small>{spec.description && <p>{spec.description}</p>}{spec.default !== undefined && <small>默认值：{displayValue(spec.default)}</small>}</div><div><Checkbox className="omaa-checkbox" label={`传入 ${name}`} checked={draft[name]?.include ?? false} disabled={busy} onChange={include => update(name, { include })}/>{spec.type === 'boolean' ? <Select aria-label={`参数 ${name}`} value={draft[name]?.text ?? 'false'} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}><option value="false">false</option><option value="true">true</option></Select> : spec.type === 'json' ? <TextArea aria-label={`参数 ${name}`} rows={3} value={draft[name]?.text ?? ''} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}/> : <Input type="text" inputMode={spec.type === 'number' ? 'decimal' : undefined} aria-label={`参数 ${name}`} value={draft[name]?.text ?? ''} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}/>}</div></div>)}
          <small>未勾选的参数不传入；有默认值时由当前保存定义提供。运行请求会重新读取定义。</small><div className="omaa-saved-actions"><Button type="button" disabled={busy || !runnable} onClick={() => { void send('run', definition); }}>发送运行请求</Button><Button type="button" disabled={busy} onClick={() => { void send('read', definition); }}>重新读取定义</Button></div>{available && !runnable && <small>请在执行模式运行工作流。</small>}
        </section>}
        {definition && <section><h4>管理此保存定义</h4><p><strong>{definition.name}</strong> · {scopeLabel(definition.scope)}</p><small className="omaa-saved-source">{definition.path}</small>
          {definition.sourceSha256 ? <small className="omaa-saved-source">本次读取 SHA-256：{definition.sourceSha256}</small> : <p>旧读取结果没有源码哈希；请先重新读取定义，再移动或删除。</p>}
          {!(typeof callId === 'string' && callId) && <p>此读取记录缺少原生调用标识，请先重新读取定义。</p>}
          {definition.scope === 'global' && <div className="omaa-saved-actions"><Button type="button" disabled={!canManage} onClick={() => { void send('move', definition); }}>发送移到当前项目请求</Button></div>}
          <small>移动保持同名和完整源码，拒绝覆盖现有项目定义；复制与移除分两步。文件校验与移除之间仍可能发生其他进程的改动。</small>
          <Checkbox className="omaa-checkbox" label="我确认删除上述名称、范围和路径对应的保存定义。" checked={deleteConfirmed} disabled={!canManage} onChange={setDeleteConfirmed}/>
          <small>勾选只记录您的删除选择；文件操作仍受原生权限与审批约束。</small>
          <div className="omaa-saved-actions"><Button type="button" disabled={!canManage || !deleteConfirmed} onClick={() => { void send('delete', definition); }}>发送删除请求</Button><Button type="button" disabled={busy} onClick={() => { void send('read', definition); }}>刷新定义</Button></div>
          {managementSubmitted && <small>此读取快照已锁定，避免重复管理请求。接受状态可能尚未确认；请核对实际结果，并重新读取定义后再操作。</small>}
          {available && !runnable && <small>请先切换到执行模式，再管理保存定义。</small>}
        </section>}
        {management && <section><h4>实际管理结果 · {managementStatusLabels.get(value.status)}</h4><p>阶段：{value.phase}</p>{value.reason !== undefined && <p>原因：{value.reason}</p>}
          {value.sourcePath !== undefined && <small className="omaa-saved-source">来源：{value.sourcePath}</small>}{value.destinationPath !== undefined && <small className="omaa-saved-source">目标：{value.destinationPath}</small>}
          <small className="omaa-saved-source">预期源码 SHA-256：{value.expectedSourceSha256}</small>
          {value.destinationCreated !== undefined && <p>目标已创建：{value.destinationCreated ? '是' : '否'}</p>}{value.sourceRemoved !== undefined && <p>来源已移除：{value.sourceRemoved ? '是' : '否'}</p>}
          <pre>{value.response}</pre>
          {['partial', 'unknown'].includes(value.status) && <p>请核对实际文件和原生任务信息；此卡不会自动重试或回滚。</p>}
          {(value.jobId !== undefined || value.shellCallId !== undefined) && <details><summary>原生任务标识</summary>{value.jobId !== undefined && <p>jobId：<code>{value.jobId}</code></p>}{value.shellCallId !== undefined && <p>shellCallId：<code>{value.shellCallId}</code></p>}</details>}
          <div className="omaa-saved-actions">{value.action === 'move' ? <><Button type="button" disabled={busy} onClick={() => { void send('read', { name: value.name, scope: 'global' }); }}>读取全局定义</Button><Button type="button" disabled={busy} onClick={() => { void send('read', { name: value.name, scope: 'project' }); }}>读取项目定义</Button></> : <Button type="button" disabled={busy} onClick={() => { void send('read', value); }}>重新读取此范围的定义</Button>}</div>
        </section>}
        {toolName === 'read_saved_workflow' && !definition && <section><p className="omaa-saved-error">此结果缺少有效的定义信息，请重新读取工作流。</p></section>}
        {toolName === 'save_workflow' && value?.ok === true && <section><Button type="button" disabled={busy} onClick={() => { void send('read', value); }}>读取已保存定义</Button></section>}
        {toolName === 'update_saved_workflow' && <section><h4>实际元数据更新结果</h4><p>{value.changed ? '元数据已更新。' : '元数据没有变化。'}脚本正文已保留。</p><p>字段：{value.changedFields.join('、')}</p><small className="omaa-saved-source">脚本 SHA-256：{value.scriptHash}</small>{value.reviewedSourceSha256 && <small className="omaa-saved-source">写前核对的完整源码 SHA-256：{value.reviewedSourceSha256}</small>}<pre>{value.response}</pre><Button type="button" disabled={busy} onClick={() => { void send('read', value); }}>重新读取实际定义</Button></section>}
        {toolName === 'run_saved_workflow' && value?.result && <section><h4>实际运行结果</h4><pre>{JSON.stringify(value.result, null, 2)}</pre></section>}
        <details><summary>原始工具结果</summary><pre>{textOf(block) || '工具未返回内容。'}</pre></details>
      </>}
    </div>}
  </div>;
}
