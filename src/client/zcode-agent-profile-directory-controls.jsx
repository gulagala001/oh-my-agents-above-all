import { Button, Input } from './ui.jsx';
import React, { useEffect, useState } from 'react';

export function ZCodeAgentProfileDirectoryControls({ settings, state, disabled }) {
  const selected = state.data?.agentProfileDirectory, selectionKey = JSON.stringify(selected ?? null);
  const [root, setRoot] = useState(selected?.root ?? ''), [error, setError] = useState('');
  useEffect(() => { setRoot(selected?.root ?? ''); setError(''); }, [selectionKey]);
  const save = async clear => {
    const sessionId = state.sessionId, value = root;
    setError('');
    if (!clear && (!value || value.length > 4096 || value.includes('\0')
      || !(value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)))) {
      setError('请填写已有 Agent 目录的绝对路径（最多 4096 字符，不含 NUL）。'); return;
    }
    try { await settings.update({ agentProfileDirectory: clear ? null : { root: value } }, sessionId); }
    catch (failure) { if (settings.getSnapshot().sessionId === sessionId) setError(failure.message); }
  };
  return <fieldset className="omaa-form-group" disabled={disabled} aria-label="ZCode 全局 Agent 目录">
    <legend>全局 Agent 目录</legend>
    <p className="omaa-help">读取已有的全局 Agent 定义；当前项目 .zcode/agents 中的同名定义优先。</p>
    {selected && <p className="omaa-help">已保存目录：{selected.root}<br/>绑定工作区：{selected.workspacePath}</p>}
    <label className="omaa-field"><span>已有 Agent 目录</span><Input type="text" maxLength={4096}
      aria-label="全局 Agent 目录路径" value={root} onChange={event => setRoot(event.target.value)}/></label>
    <p className="omaa-help">选择执行环境中实际保存 Agent Markdown 文件的目录。此设置仅绑定当前主会话，不创建或修改定义，不授予额外文件权限，也不传给子会话。启用后可用 zcode_agent 查看可用定义及未支持字段说明。</p>
    {error && <p role="alert" className="omaa-error">{error}</p>}
    <div className="omaa-actions">
      <Button type="button" variant="primary" disabled={!root.trim() || root === selected?.root} onClick={() => { void save(false); }}>保存目录</Button>
      <Button type="button" disabled={!selected} onClick={() => { void save(true); }}>断开目录</Button>
    </div>
  </fieldset>;
}
