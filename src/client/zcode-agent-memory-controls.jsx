import { Button, Input } from './ui.jsx';
import React, { useEffect, useState } from 'react';

export function ZCodeAgentMemoryControls({ settings, state, disabled }) {
  const selected = state.data?.agentMemory, selectionKey = JSON.stringify(selected ?? null);
  const [root, setRoot] = useState(selected?.root ?? ''), [error, setError] = useState('');
  useEffect(() => { setRoot(selected?.root ?? ''); setError(''); }, [selectionKey]);
  const save = async clear => {
    const sessionId = state.sessionId, value = root;
    setError('');
    if (!clear && (!value || value.length > 4096 || value.includes('\0')
      || !(value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)))) {
      setError('请填写已有存储根目录的绝对路径（最多 4096 字符，不含 NUL）。'); return;
    }
    try { await settings.update({ agentMemory: clear ? null : { root: value } }, sessionId); }
    catch (failure) { if (settings.getSnapshot().sessionId === sessionId) setError(failure.message); }
  };
  return <fieldset className="omaa-form-group" disabled={disabled} aria-label="ZCode Agent 持久记忆">
    <legend>Agent 持久记忆</legend>
    <p className="omaa-help">{selected ? '已启用此主会话新建 profile 子代理的记忆。' : '未启用；profile 中的 memory 字段不启用记忆读写指导。'}</p>
    <label className="omaa-field"><span>已有存储根目录</span><Input type="text" maxLength={4096}
      aria-label="Agent 记忆存储根目录" value={root} onChange={event => setRoot(event.target.value)}/></label>
    {selected && <p className="omaa-help">已保存目录：{selected.root}<br/>绑定工作区：{selected.workspacePath}</p>}
    <p className="omaa-help">用户范围使用所选目录下的 agent-memory/名称；项目和本地范围分别使用工作区的 .zcode/agent-memory/名称、.zcode/agent-memory-local/名称。名称按原规则替换特殊字符。仅在新建子代理时读取 MEMORY.md；文件维护使用原生 write/edit 及已有权限和审批。此设置不创建目录或文件、不启动自动抽取，也不改变已有子代理的快照。</p>
    {error && <p role="alert" className="omaa-error">{error}</p>}
    <div className="omaa-actions">
      <Button type="button" variant="primary" disabled={!root.trim() || root === selected?.root} onClick={() => { void save(false); }}>保存并启用 Agent 记忆</Button>
      <Button type="button" disabled={!selected} onClick={() => { void save(true); }}>关闭新子代理记忆</Button>
    </div>
  </fieldset>;
}
