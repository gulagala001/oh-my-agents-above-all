import React from 'react';
import { WorkflowToolFrame, resultText, argumentReader, argumentText } from './zcode-workflow-tool.jsx';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function workflowSnippetPresentation(block) {
  const raw = block?.meta;
  const value = object(raw?.presentationMeta) ? raw.presentationMeta : raw;
  if (!object(value) || value.kind !== 'eval_workflow_snippet' || typeof value.ok !== 'boolean'
    || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0
    || !Array.isArray(value.diagnostics) || !value.diagnostics.every(row => object(row)
      && Number.isSafeInteger(row.code) && Number.isSafeInteger(row.line) && row.line >= 1
      && Number.isSafeInteger(row.column) && row.column >= 1 && typeof row.message === 'string')
    || !Array.isArray(value.logs) || value.logs.length > 100 || !value.logs.every(row => typeof row === 'string' && row.length <= 2048)
    || !['diagnosticsTruncated', 'logsTruncated'].every(key => value[key] === undefined || typeof value[key] === 'boolean')) return;
  return value;
}

/** Status is supplied by bounded native metadata, never parsed from prose. */
export function ZCodeWorkflowSnippetTool({ phase, block, useDisclosure, inspect }) {
  const { expanded, toggle } = useDisclosure();
  const value = phase === 'result' ? workflowSnippetPresentation(block) : undefined;
  const failed = phase === 'result' && (Boolean(block.isError || block.error) || value?.ok === false);
  const args = argumentReader(block, phase);
  return <WorkflowToolFrame {...{ phase, failed, expanded, toggle, inspect }} title="工作流片段求值"
    status={phase === 'preparing' ? '准备片段' : phase === 'start' ? '求值中' : block.isError || block.error ? '工具失败' : value ? value.ok ? '已完成' : value.diagnostics.length ? '编译未通过' : '执行失败' : '原始结果'}
    input={expanded ? argumentText(block, phase, args) : ''}>
    {value && <>
      <section><small>实际耗时：{value.durationMs} ms</small></section>
      {(value.diagnostics.length > 0 || value.diagnosticsTruncated === true) && <section><h4>编译诊断</h4><pre className="omaa-zcode-tool-error">{value.diagnostics.map(row => `${row.line}:${row.column} TS${row.code}: ${row.message}`).join('\n')}</pre>{value.diagnosticsTruncated === true && <small>诊断显示已截断。</small>}</section>}
      {(value.logs.length > 0 || value.logsTruncated === true) && <section><h4>日志</h4><pre>{value.logs.join('\n')}</pre>{value.logsTruncated === true && <small>日志显示已截断。</small>}</section>}
    </>}
    <section><small>工具响应</small><pre className={failed ? 'omaa-zcode-tool-error' : undefined}>{resultText(block) || '工具未返回内容。'}</pre></section>
  </WorkflowToolFrame>;
}
