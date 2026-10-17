import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { savedWorkflowResult, supportedSavedWorkflowResult, savedWorkflowRunKind, savedWorkflowDefinition, savedWorkflowDraft, savedWorkflowArgs, assertSavedWorkflowSession, submitSavedWorkflowRequest } from './zcode-saved-workflow-state.mjs';
import css from './zcode-saved-workflow.css';

const labels = { save_workflow: '保存工作流', list_saved_workflows: '保存的工作流', read_saved_workflow: '工作流定义', run_saved_workflow: '运行保存的工作流' };
const statusLabels = new Map(Object.entries({ backgrounded: '已启动后台任务', running: '运行中', submitted: '已提交', completed: '已完成', killed: '已中断', cancelled: '已取消' }));
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
  const identity = JSON.stringify([callId, phase, toolName, textOf(block)]);
  const lifetime = useRef({ alive: false, revision: 0, busy: false });
  const renderRevision = lifetime.current.revision;
  const [draft, setDraft] = useState({}), [actionState, setActionState] = useState({ error: '', sent: false, busy: false });
  useEffect(() => {
    lifetime.current.alive = true; ++lifetime.current.revision; lifetime.current.busy = false;
    setDraft(definition ? savedWorkflowDraft(definition) : {}); setActionState({ error: '', sent: false, busy: false });
    const context = () => {
      const next = settings.getSnapshot();
      return JSON.stringify([next.sessionId, next.agentPreset, next.data?.product?.id, sidebarRight.mounted.getSnapshot()]);
    };
    let signature = context();
    const sync = () => {
      const next = context();
      if (next === signature) return;
      signature = next; ++lifetime.current.revision; lifetime.current.busy = false;
      setActionState({ error: '', sent: false, busy: false });
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
    let args, argsJson;
    if (action === 'run') {
      const checked = savedWorkflowArgs(definition, draft);
      if (!checked.ok) { setActionState({ error: checked.errors.join('\n'), sent: false, busy: false }); return; }
      args = checked.args; argsJson = checked.argsJson;
    }
    life.busy = true; setActionState({ error: '', sent: false, busy: true });
    try {
      await submitSavedWorkflowRequest({ settings, sessions, sidebarRight, sessionId, alive }, action, { ...target, ...(action === 'run' ? { args, argsJson } : {}) });
      if (alive() && settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId) setActionState({ error: '', sent: true, busy: false });
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
  const status = phase === 'preparing' ? '准备中' : phase === 'start' ? '执行中' : failed ? '失败' : !supported ? '原始结果' : statusLabels.get(runStatus) || runStatus || '已完成';
  return <div className="omaa-saved-workflow" data-phase={phase} data-error={failed || undefined} aria-busy={actionState.busy || undefined}>
    <style>{css}</style><header>
      <button type="button" className="omaa-saved-title" aria-expanded={expanded} onClick={toggle}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span><span>{labels[toolName]}{typeof value?.name === 'string' ? ` · ${value.name}` : ''}</span><small>{status}</small></button>
      {runId && <button type="button" onClick={openRun} disabled={current.sessionId !== sessionId || mounted !== sessionId}>查看运行与产物</button>}
      {inspect && <button type="button" onClick={inspect}>检查</button>}
    </header>
    {actionState.busy && <p role="status" className="omaa-saved-notice">正在发送请求…</p>}
    {actionState.error && <div role="alert" className="omaa-saved-notice omaa-saved-error"><pre>{actionState.error}</pre></div>}
    {actionState.sent && <p role="status" className="omaa-saved-notice">请求已发送到当前会话，工具执行结果将显示在对话中。</p>}
    {expanded && <div className="omaa-saved-body">
      {phase !== 'result' ? <section role="status">{phase === 'preparing' ? '正在准备工具参数…' : '等待实际工具结果…'}</section> : failed ? <section className="omaa-saved-error"><pre>{textOf(block)}</pre></section> : !supported ? <section><small>原始工具结果</small><pre>{textOf(block) || '工具未返回内容。'}</pre></section> : <>
        {toolName === 'list_saved_workflows' && Array.isArray(value?.workflows) && <section>
          {value.workflows.length === 0 && <p>没有保存的工作流。</p>}
          {value.workflows.map((row, index) => <div className="omaa-saved-row" key={`${row.scope}:${row.name}:${index}`}><div><strong>{row.name}</strong> <small>{scopeLabel(row.scope)}</small><p>{row.description}</p>{row.whenToUse && <p>{row.whenToUse}</p>}<small className="omaa-saved-source">{row.path}</small></div><button type="button" disabled={busy} onClick={() => { void send('read', row); }}>读取定义</button></div>)}
        </section>}
        {Array.isArray(value?.invalid) && value.invalid.length > 0 && <section><h4>无法读取的定义</h4>{value.invalid.map((row, index) => <div className="omaa-saved-row" key={index}><div><small className="omaa-saved-source">{row.path}</small><p className="omaa-saved-error">{row.reason}</p></div></div>)}</section>}
        {typeof value?.name === 'string' && <section><strong>{value.name}</strong> <small>{scopeLabel(value.scope)}</small>{value.description && <p>{value.description}</p>}{value.whenToUse && <p>{value.whenToUse}</p>}<small className="omaa-saved-source">{value.path}</small>{value.facade && <small>接口：{value.facade === 'zcode' ? 'ZCode Actor' : value.facade === 'native' ? '原生 JavaScript' : value.facade}</small>}{value.shadowing && <p>{value.shadowing === 'hides_global' ? '此项目定义覆盖同名全局定义。' : value.shadowing === 'hidden_by_project' ? '此全局定义被同名项目定义覆盖。' : value.shadowing}</p>}</section>}
        {definition && <section><h4>运行参数</h4>{Object.entries(definition.args || {}).map(([name, spec]) => <div className="omaa-saved-parameter" key={name}><div><strong>{name}</strong> <small>{spec.type}{spec.required === true ? ' · 必填' : ' · 可选'}</small>{spec.description && <p>{spec.description}</p>}{spec.default !== undefined && <small>默认值：{displayValue(spec.default)}</small>}</div><div><label><input type="checkbox" checked={draft[name]?.include ?? false} disabled={busy} onChange={event => update(name, { include: event.target.checked })}/> 传入 {name}</label>{spec.type === 'boolean' ? <select aria-label={`参数 ${name}`} value={draft[name]?.text ?? 'false'} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}><option value="false">false</option><option value="true">true</option></select> : spec.type === 'json' ? <textarea aria-label={`参数 ${name}`} rows={3} value={draft[name]?.text ?? ''} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}/> : <input type="text" inputMode={spec.type === 'number' ? 'decimal' : undefined} aria-label={`参数 ${name}`} value={draft[name]?.text ?? ''} disabled={busy || !draft[name]?.include} onChange={event => update(name, { text: event.target.value })}/>}</div></div>)}
          <small>未勾选的参数不传入；有默认值时由当前保存定义提供。运行请求会重新读取定义。</small><div className="omaa-saved-actions"><button type="button" disabled={busy || !runnable} onClick={() => { void send('run', definition); }}>发送运行请求</button><button type="button" disabled={busy} onClick={() => { void send('read', definition); }}>重新读取定义</button></div>{available && !runnable && <small>请在执行模式运行工作流。</small>}
        </section>}
        {toolName === 'read_saved_workflow' && !definition && <section><p className="omaa-saved-error">此结果缺少有效的定义信息，请重新读取工作流。</p></section>}
        {toolName === 'save_workflow' && value?.ok === true && <section><button type="button" disabled={busy} onClick={() => { void send('read', value); }}>读取已保存定义</button></section>}
        {toolName === 'run_saved_workflow' && value?.result && <section><h4>实际运行结果</h4><pre>{JSON.stringify(value.result, null, 2)}</pre></section>}
        <details><summary>原始工具结果</summary><pre>{textOf(block) || '工具未返回内容。'}</pre></details>
      </>}
    </div>}
  </div>;
}
