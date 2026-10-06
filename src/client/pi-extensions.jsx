import React, { useCallback, useEffect, useRef, useState } from 'react';
import css from './pi-extensions.css';

const endpoint = 'omaa/api/pi-extensions';
const statusLabels = { ready: '已加载', loaded: '已加载', enabled: '已启用', disabled: '已停用', error: '加载失败', loading: '正在加载', pending: '等待加载' };
const pathsOf = text => [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
const namesOf = value => Array.isArray(value) ? value.join('、') : String(value);
const labelText = value => typeof value === 'string' ? value.trim() : '';
const sessionNameOf = row => {
  const title = labelText(row.title) || labelText(row.displayTitle);
  if (title && title !== row.sessionId) return title;
  const cwd = labelText(row.cwd);
  const separators = /^(?:[a-z]:[\\/]|\\\\)/i.test(cwd) ? /[\\/]+/ : /\/+/;
  return cwd.split(separators).filter(Boolean).at(-1) || cwd || '未命名 Pi 会话';
};

async function configuration(signal, patch) {
  const response = await fetch(endpoint, { credentials: 'same-origin', signal,
    ...(patch === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  if (!Array.isArray(value.files) || !value.files.every(file => typeof file === 'string') || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('扩展配置响应无效，请重新读取。');
  return value;
}

export function PiExtensions({ settings, embedded = false } = {}) {
  const [state, setState] = useState({ data: null, loading: false, saving: false, error: '', message: '' });
  const [text, setText] = useState('');
  const lifetime = useRef({ alive: false, revision: 0, controller: undefined, busy: false, dirty: false });
  const load = useCallback(async () => {
    const current = lifetime.current;
    if (!current.alive || current.busy) return;
    current.controller?.abort(); current.controller = new AbortController(); current.busy = true;
    const revision = ++current.revision;
    setState(previous => ({ ...previous, loading: true, error: '', message: '' }));
    try {
      const data = await configuration(current.controller.signal);
      if (!current.alive || current.revision !== revision) return;
      if (!current.dirty) setText(data.files.join('\n'));
      setState({ data, loading: false, saving: false, error: '', message: '' });
    } catch (error) {
      if (current.alive && current.revision === revision) setState(previous => ({ ...previous, loading: false, error: error.message }));
    } finally { if (current.revision === revision) current.busy = false; }
  }, []);
  useEffect(() => {
    const current = lifetime.current; current.alive = true; void load();
    return () => { current.alive = false; ++current.revision; current.controller?.abort(); current.busy = false; };
  }, [load]);
  const save = async files => {
    const current = lifetime.current;
    if (!current.alive || current.busy || !state.data) return;
    current.controller?.abort(); current.controller = new AbortController(); current.busy = true;
    const revision = ++current.revision;
    setState(previous => ({ ...previous, saving: true, error: '', message: '' }));
    try {
      const data = await configuration(current.controller.signal, { files, revision: state.data.revision });
      if (!current.alive || current.revision !== revision) return;
      current.dirty = false; setText(data.files.join('\n'));
      setState({ data, loading: false, saving: false, error: '', message: data.files.length ? '指定扩展配置已保存。' : '全部指定扩展已停用。' });
      // Reuse the existing settings signal to recheck a paused notice reader.
      // No extra event bus or persisted client configuration is needed.
      if (settings) void settings.refresh();
    } catch (error) {
      if (current.alive && current.revision === revision) setState(previous => ({ ...previous, saving: false, error: error.message }));
    } finally { if (current.revision === revision) current.busy = false; }
  };
  const busy = state.loading || state.saving;
  return <section className="omaa-pi-extensions" aria-label="Pi 扩展设置">
    <style>{css}</style>
    <header>{!embedded && <h2>Pi 本地扩展</h2>}<button type="button" disabled={busy} onClick={() => { void load(); }}>重新读取</button></header>
    <p>每行填写一个本地 TS / JS 文件的绝对路径。仅加载你明确保存的扩展，不自动执行项目中发现的文件。</p>
    <p className="omaa-pi-extension-help">应用于 Pi 会话，后续请求加载指定文件；更改或清空列表会释放旧扩展。</p>
    <p className="omaa-pi-extension-help">扩展沿用当前 DSH 文件权限；原生工具调用继续使用宿主批准流程。运行中的 Pi 任务会拒绝切换扩展，请先停止后再保存。</p>
    <label>指定扩展文件<textarea aria-label="Pi 扩展文件路径" rows={5} spellCheck={false} value={text} disabled={busy || !state.data}
      placeholder={'/absolute/path/to/extension.ts\n/absolute/path/to/extension.js'} onChange={event => {
        lifetime.current.dirty = true; setText(event.target.value);
        setState(previous => ({ ...previous, message: '' }));
      }}/></label>
    <div className="omaa-pi-extension-actions">
      <button type="button" disabled={busy || !state.data} onClick={() => { void save(pathsOf(text)); }}>保存并启用指定扩展</button>
      <button type="button" disabled={busy || !state.data || !state.data.files.length && !text.trim()} onClick={() => { void save([]); }}>清空并停用</button>
    </div>
    {busy && <p role="status">{state.saving ? '正在保存扩展配置…' : '正在读取扩展配置…'}</p>}
    {state.message && <p role="status">{state.message}</p>}
    {state.error && <p role="alert" className="omaa-pi-extension-error">{state.error}</p>}
    {state.data && <p className="omaa-pi-extension-help">已保存 {state.data.files.length} 个扩展文件。重新读取会保留尚未保存的输入。</p>}
    {state.data?.states?.length > 0 && <ul className="omaa-pi-extension-states" aria-label="Pi 会话扩展状态">
      {state.data.states.map(row => <li key={row.sessionId}>
        <div><span className="omaa-pi-extension-session-name" title={[labelText(row.cwd), `会话 ID：${row.sessionId}`].filter(Boolean).join('\n')}>{sessionNameOf(row)}</span><span>{statusLabels[row.status] || row.status}</span></div>
        {row.error && <p className="omaa-pi-extension-error">{row.error}</p>}
        {row.tools !== undefined && <small>工具：{namesOf(row.tools) || '无'}</small>}
        {row.commands !== undefined && <small>命令：{namesOf(row.commands) || '无'}</small>}
      </li>)}
    </ul>}
  </section>;
}

export function applyPiExtensionNotices(ctx, settings) {
  ctx.effect(() => {
    const delivered = new Map();
    let disposed = false, activeId, controller, timer, generation = 0, paused = false, enabled = false;
    const active = id => !disposed && settings.getSnapshot().sessionId === id && settings.getSnapshot().data?.product?.id === 'pi';
    const cancel = () => { clearTimeout(timer); timer = undefined; controller?.abort(); ++generation; };
    const poll = async (id, version) => {
      if (!active(id) || generation !== version) return;
      const entry = delivered.get(id) ?? { cursor: 0, ids: new Set() }; delivered.set(id, entry);
      controller = new AbortController();
      try {
        const response = await fetch(`omaa/api/pi-extension-notices?${new URLSearchParams({ session: id, after: String(entry.cursor) })}`, {
          credentials: 'same-origin', signal: controller.signal,
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        if (!active(id) || generation !== version) return;
        enabled = value.enabled === true;
        const actx = ctx.sessions.binding(id)?.ctx;
        const input = actx?.get('conversation')?.input ?? ctx.get('conversation')?.input;
        if (!actx || !input) return;
        const shell = input.for(actx);
        for (const notice of value.notices ?? []) {
          if (!active(id) || generation !== version) return;
          if (notice.id === undefined || entry.ids.has(notice.id) || typeof notice.text !== 'string') continue;
          shell.notify(notice.type === 'error' ? 'error' : 'info', notice.type === 'warning' ? `扩展警告：${notice.text}` : notice.text);
          entry.ids.add(notice.id);
        }
        if (Number.isSafeInteger(value.cursor) && value.cursor >= entry.cursor) entry.cursor = value.cursor;
        if (!enabled) paused = true;
      } catch {
        // Transport failures are not extension-generated conversation notices.
        // Once enabled, retry on the same bounded foreground polling cadence.
        if (active(id) && generation === version && !enabled) paused = true;
      } finally {
        if (active(id) && generation === version && enabled && !paused) timer = setTimeout(() => { void poll(id, version); }, 1500);
      }
    };
    const sync = () => {
      const current = settings.getSnapshot();
      const id = current.data?.product?.id === 'pi' ? current.sessionId : undefined;
      if (id !== activeId) {
        cancel(); activeId = id; paused = false; enabled = false;
        if (id) void poll(id, generation);
      } else if (id && paused && !current.loading && !current.saving) {
        cancel(); paused = false; enabled = false; void poll(id, generation);
      }
    };
    const off = settings.subscribe(sync); sync();
    return () => { disposed = true; cancel(); off(); delivered.clear(); };
  });
}
