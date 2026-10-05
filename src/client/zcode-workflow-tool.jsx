import React, { useEffect, useState } from 'react';

const css = `.omaa-zcode-tool{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary);min-width:0}.omaa-zcode-tool-head{display:flex;align-items:center;gap:7px;min-width:0}.omaa-zcode-tool button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;border-radius:5px;padding:3px 5px}.omaa-zcode-tool button:hover{background:var(--dsw-alias-interactive-bg-hover)}.omaa-zcode-tool button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.omaa-zcode-tool-title{display:flex;align-items:center;gap:7px;min-width:0;flex:1;text-align:left}.omaa-zcode-tool-title>span:nth-child(2){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.omaa-zcode-tool small{font-size:11px;color:var(--dsw-alias-label-tertiary)}.omaa-zcode-tool[data-error] .omaa-zcode-tool-status,.omaa-zcode-tool .omaa-zcode-tool-error{color:var(--dsw-alias-state-error-primary)}.omaa-zcode-tool .omaa-zcode-tool-artifacts{color:var(--dsw-alias-brand-primary);font-size:11px;white-space:nowrap}.omaa-zcode-tool-body{margin:4px 0 4px 4px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-markdown-code-block);overflow:hidden}.omaa-zcode-tool-body section{padding:9px 12px}.omaa-zcode-tool-body section+section{border-top:1px solid var(--dsw-alias-border-l2)}.omaa-zcode-tool-body pre{margin:5px 0 0;max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 ui-monospace,monospace}.omaa-zcode-tool-inspect{font-size:11px!important}`;

function resultText(block) {
  const parts = (block.content || []).map(value => value.type === 'text' ? value.text : JSON.stringify(value, null, 2));
  if (!parts.length && block.error) parts.push(`${block.error.name}: ${block.error.code}${block.error.reason ? '\n' + block.error.reason : ''}`);
  return parts.join('\n');
}

export function workflowToolResult(block) {
  const meta = block?.meta && typeof block.meta === 'object' ? block.meta.presentationMeta || block.meta : {};
  let value;
  for (const content of block?.content || []) {
    if (content.type !== 'text') continue;
    try { const parsed = JSON.parse(content.text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { value = parsed; if (typeof parsed.runId === 'string') break; } } catch {}
  }
  return { runId: typeof meta.runId === 'string' ? meta.runId : typeof value?.runId === 'string' ? value.runId : undefined,
    status: typeof meta.status === 'string' ? meta.status : typeof value?.status === 'string' ? value.status : undefined,
    value };
}

function argumentText(block, phase) {
  if (phase === 'start') return block.argsRaw;
  if (phase === 'result' && block.call?.argsRaw) return block.call.argsRaw;
  // A preparing PartialArguments instance grows in place. Read its fields
  // during this render, never memoize it by object identity.
  const values = {};
  for (const key of block.args?.keys?.() || []) {
    const value = block.args.text(key) ?? block.args.value(key);
    if (value !== undefined) values[key] = value;
  }
  return Object.keys(values).length ? JSON.stringify(values, null, 2) : '';
}

/** Registered only at tool.call.toolview/key:create_workflow. */
export function ZCodeWorkflowTool({ phase, block, useDisclosure, inspect, openArtifacts, callId }) {
  const { expanded, toggle } = useDisclosure();
  const [actionError, setActionError] = useState('');
  const result = phase === 'result' ? workflowToolResult(block) : {};
  const failed = phase === 'result' && (block.isError || result.value?.ok === false || result.status === 'failed');
  const stopped = phase === 'result' && (block.error?.code === 'interrupted' || result.value?.error?.kind === 'abort' || result.status === 'killed' || result.status === 'cancelled');
  const status = phase === 'preparing' ? '准备中' : phase === 'start' ? '执行中' : stopped ? '已中断' : failed ? '失败' : ({ backgrounded: '已启动后台任务', running: '运行中', submitted: '已提交', completed: '已完成', failed: '失败', cancelled: '已取消', killed: '已中断' })[result.status] || '已完成';
  const name = block.args?.textPrefix?.('name', 100) || block.args?.value?.('saved')?.name || block.args?.textPrefix?.('path', 100) || 'ZCode 工作流';
  const output = phase === 'result' ? resultText(block) : '';
  const input = expanded ? argumentText(block, phase) : '';
  useEffect(() => { setActionError(''); }, [callId, result.runId]);
  const open = async () => { setActionError(''); try { await openArtifacts(result.runId); } catch (error) { setActionError(error.message); } };
  return <div className="omaa-zcode-tool" data-phase={phase} data-error={failed || undefined}>
    <style>{css}</style><div className="omaa-zcode-tool-head">
      <button type="button" className="omaa-zcode-tool-title" aria-expanded={expanded} onClick={toggle}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span><span>{name}</span><small className="omaa-zcode-tool-status">{status}</small></button>
      {result.runId && typeof openArtifacts === 'function' && <button type="button" className="omaa-zcode-tool-artifacts" onClick={() => { void open(); }}>查看产物</button>}
      {typeof inspect === 'function' && <button type="button" className="omaa-zcode-tool-inspect" onClick={inspect} aria-label="检查工作流工具调用">检查</button>}
    </div>
    {actionError && <p role="alert" className="omaa-zcode-tool-error">{actionError}</p>}
    {expanded && <div className="omaa-zcode-tool-body"><section><small>{phase === 'preparing' ? '输入参数 · 尚未完成' : '输入参数'}</small><pre>{input || (phase === 'preparing' ? '等待参数…' : '当前记录中没有输入参数。')}</pre></section>
      {phase === 'result' && <section><small>工具结果</small><pre className={failed ? 'omaa-zcode-tool-error' : undefined}>{output || '工具未返回内容。'}</pre></section>}
      {phase === 'start' && <section role="status"><small>工作流工具正在执行，等待实际结果。</small></section>}
    </div>}
  </div>;
}
