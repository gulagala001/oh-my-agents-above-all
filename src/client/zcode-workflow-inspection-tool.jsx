import React, { useEffect, useRef, useState } from 'react';
import { WorkflowToolFrame, resultText, argumentReader, argumentText } from './zcode-workflow-tool.jsx';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const statuses = new Map(Object.entries({ completed: '已完成', errored: '失败', pending: '待运行', running: '运行中', stopped: '已停止' }));
const integer = value => Number.isSafeInteger(value) && value >= 0;
function checkedRun(value) {
  return object(value) && typeof value.runId === 'string' && uuid.test(value.runId)
    && typeof value.label === 'string' && statuses.has(value.status) && value.ownedByThisSession === true
    && Number.isFinite(value.createdAt) && integer(value.revision) && value.revision > 0
    && ['artifactCount', 'reportCount'].every(key => value[key] === undefined || integer(value[key]));
}
export function workflowInspectionResult(block, toolName) {
  const maximum = toolName === 'list_workflow_runs' ? 24_000 : 400_000;
  for (const part of block?.content || []) {
    if (part?.type !== 'text' || typeof part.text !== 'string' || new TextEncoder().encode(part.text).length > maximum) continue;
    try {
      const value = JSON.parse(part.text);
      if (toolName === 'list_workflow_runs') {
        if (object(value) && value.scope === 'owner-session' && value.ordering === 'startedAt-desc'
          && Array.isArray(value.runs) && value.runs.length <= 50 && value.runs.every(checkedRun)
          && value.count === value.runs.length && typeof value.truncated === 'boolean') return value;
      } else if (object(value) && value.ok === false && value.code === 'run_not_found' && typeof value.response === 'string') return value;
      else if (checkedRun(value) && value.ok === true && value.scope === 'owner-session' && Number.isFinite(value.generatedAt)) return value;
    } catch {}
  }
}
const text = value => typeof value === 'string' ? value : undefined;
const json = value => JSON.stringify(value, null, 2);
function cleanupDiagnostics(error) {
  if (!object(error) || !Array.isArray(error.cleanupFailures) || !error.cleanupFailures.length) return;
  const rows = error.cleanupFailures.slice(0, 9);
  let content = json(rows), truncated = error.cleanupFailuresTruncated === true || error.cleanupFailures.length > rows.length;
  const encode = new TextEncoder();
  if (encode.encode(content).length > 8192) {
    // The server bounds its compact DTO to 8 KiB. Pretty-printing and older
    // retained results must not turn that into an unbounded display.
    content = content.slice(0, 8192);
    while (encode.encode(content).length > 8192) content = content.slice(0, Math.floor(content.length * 0.9));
    truncated = true;
  }
  return { content, truncated };
}

function RunRow({ run, open, busy }) {
  return <div style={{ padding: '5px 0', overflowWrap: 'anywhere' }}>
    <strong>{run.label || '未命名工作流'}</strong> <small>{statuses.get(run.status)}</small>
    <div><small>{new Date(run.createdAt).toLocaleString()}</small></div><div><code>{run.runId}</code></div>
    <div><small>修订 {run.revision}{run.artifactCount !== undefined ? ` · ${run.artifactCount} 个产物` : ''}{run.reportCount !== undefined ? ` · ${run.reportCount} 条报告` : ''}</small></div>
    {open && <button type="button" className="omaa-zcode-tool-artifacts" disabled={busy} onClick={() => { void open(run.runId); }}>查看工作流</button>}
  </div>;
}

/** Native owner-session snapshots; displayed counters keep their stored scope. */
export function ZCodeWorkflowInspectionTool({ phase, block, toolName, useDisclosure, inspect, openArtifacts, callId, sessionId }) {
  const { expanded, toggle } = useDisclosure();
  const value = phase === 'result' ? workflowInspectionResult(block, toolName) : undefined;
  const failed = phase === 'result' && (Boolean(block.isError || block.error) || value?.ok === false);
  const list = toolName === 'list_workflow_runs';
  const cleanup = cleanupDiagnostics(value?.error);
  const identity = JSON.stringify([sessionId, callId, toolName, phase, resultText(block)]);
  const life = useRef({ alive: false, generation: 0, busy: false });
  const [opening, setOpening] = useState(false), [actionError, setActionError] = useState('');
  useEffect(() => {
    const state = life.current; state.alive = true; state.identity = identity; ++state.generation; state.busy = false;
    setOpening(false); setActionError('');
    return () => { state.alive = false; ++state.generation; state.busy = false; };
  }, [identity]);
  const open = typeof openArtifacts === 'function' ? async runId => {
    const state = life.current, rows = list ? value?.runs : value?.ok === true ? [value] : [];
    if (!state.alive || state.identity !== identity || state.busy || !rows?.some(row => row.runId === runId && checkedRun(row))) return;
    const generation = state.generation;
    const alive = () => state.alive && state.generation === generation && state.identity === identity;
    state.busy = true; setOpening(true); setActionError('');
    try { await openArtifacts(runId); }
    catch (error) { if (alive()) setActionError(error.message); }
    finally { if (alive()) { state.busy = false; setOpening(false); } }
  } : undefined;
  const args = argumentReader(block, phase);
  return <WorkflowToolFrame {...{ phase, failed, expanded, toggle, inspect, actionError }} busy={opening}
    title={list ? '工作流运行列表' : '工作流运行快照'}
    status={phase === 'preparing' ? '准备查询' : phase === 'start' ? '读取中' : failed ? '查询失败' : value ? '已读取' : '原始结果'}
    input={expanded ? argumentText(block, phase, args) : ''}>
    {!value || failed ? <section><pre className={failed ? 'omaa-zcode-tool-error' : undefined}>{value?.response || resultText(block) || '工具未返回内容。'}</pre></section> : <>
      {list ? <section><small>本会话 · 按开始时间倒序 · {value.count} 条</small>
        {value.runs.length ? value.runs.map(run => <RunRow key={run.runId} {...{ run, open }} busy={opening}/>) : <p>没有符合筛选条件的运行。</p>}
        {value.truncated && <p><small>结果已截断；完整记录可在本会话工作台查看。</small></p>}
      </section> : <>
        <section><RunRow run={value} {...{ open }} busy={opening}/><small>读取时间：{new Date(value.generatedAt).toLocaleString()}</small>
          {text(value.currentPhase) && <p>当前阶段：{value.currentPhase}</p>}
          {value.possiblyInterrupted === true && <p><small>记录标注此运行可能已中断。</small></p>}
          {object(value.error) && <pre className="omaa-zcode-tool-error">{[text(value.error.name), text(value.error.code), text(value.error.message)].filter(Boolean).join('\n')}</pre>}
        </section>
        {cleanup && <section aria-label="清理失败诊断"><h4>清理失败</h4>
          <p>以下清理失败与主要运行错误分别保留；资源清理未被确认成功。</p>
          <pre className="omaa-zcode-tool-error">{cleanup.content}</pre>
          {cleanup.truncated && <small>清理诊断已截断。</small>}
        </section>}
        {object(value.runtime) && <section><details><summary>运行观察</summary><small>{value.runtimeScope === 'bounded-display-observations' ? '有界显示观察；计数不代表完整 journal 用量。' : '工具实际返回的运行观察。'}</small><pre>{json(value.runtime)}</pre></details></section>}
        {Array.isArray(value.artifacts) && <section><h4>已发布产物 · {value.artifacts.length}</h4>{value.artifacts.map((artifact, index) => <div key={index}><pre>{json(artifact)}</pre></div>)}</section>}
        {Array.isArray(value.holes) && <section><h4>留白记录</h4><pre>{json(value.holes)}</pre></section>}
        {object(value.reports) && <section><h4>报告快照</h4><pre>{json(value.reports)}</pre></section>}
        {object(value.result) && <section><h4>顶层返回值</h4><pre>{json(value.result)}</pre></section>}
        {object(value.graph) && <section><details><summary>编译图</summary><pre>{json(value.graph)}</pre></details></section>}
        {value.truncated === true && <section><small>此快照已截断{Array.isArray(value.omittedSections) ? `：${value.omittedSections.filter(item => typeof item === 'string').join('、')}` : ''}；请查看工作台或重新读取所需部分。</small></section>}
      </>}
      <section><details><summary>原始工具结果</summary><pre>{resultText(block)}</pre></details></section>
    </>}
  </WorkflowToolFrame>;
}
