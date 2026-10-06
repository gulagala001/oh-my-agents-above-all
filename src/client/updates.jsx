import React, { useEffect, useRef, useState } from 'react';

async function requestUpdate(input, signal) {
  const response = await fetch('omaa/api/updates' + (input === true ? '?refresh=1' : ''),
    typeof input === 'object' ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }
      : { credentials: 'same-origin', cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `更新服务不可用（HTTP ${response.status}）`);
  return data;
}
export function Updates({ embedded = false } = {}) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const lifetime = useRef(null), timer = useRef(null), active = useRef(false), requestBusy = useRef(false);
  const load = async (input = false) => {
    if (!active.current || requestBusy.current) return;
    requestBusy.current = true;
    setPending(true); setError('');
    try {
      const value = await requestUpdate(input, lifetime.current.signal);
      if (!active.current) return;
      setData(value);
      clearTimeout(timer.current);
      if (['checking', 'installing', 'applying'].includes(value.phase)) timer.current = setTimeout(() => void load(), 1500);
    } catch (failure) {
      if (active.current && !lifetime.current.signal.aborted) setError(failure.message);
    } finally { requestBusy.current = false; if (active.current) setPending(false); }
  };
  useEffect(() => {
    lifetime.current = new AbortController(); active.current = true;
    void load();
    return () => { active.current = false; lifetime.current.abort(); clearTimeout(timer.current); };
  }, []);
  const busy = pending || ['checking', 'installing', 'applying'].includes(data?.phase);
  const action = (target, version) => void load({ action: 'install', target, version });
  const restart = data?.restartRequired || data?.phase === 'restart-required';
  const hint = data?.phase === 'installing' || data?.phase === 'applying' ? '正在通过原生插件管理安装配对更新…'
    : data?.phase === 'checking' ? '正在确认已发布的配对附件…'
      : restart ? '已安装的包需要重启当前 DSH 后生效；正在运行的版本不会热替换。'
        : data?.blockedReason || (data?.updateAvailable || data?.omdUpdateAvailable ? '更新当前宿主的配对附件，保留模型、API 和 profile；完成后重启 DSH。' : data?.checkedAt ? '已是当前 DSH 对应的最新发行。' : '检查公开 GitHub 发行，不会自动安装。');
  return <section className="omaa-preset-controls omaa-updates">
    <header>{!embedded && <h2>OMAA 更新</h2>}<p>沿用原生插件安装流程，保留当前 DSH 宿主与配置。</p></header>
    {data && <><p>运行版本：<code>{data.currentVersion}</code></p>{data.omdInstalled && <p>兼容 OMD：<code>{data.currentOmdVersion}</code></p>}
      {data.updateAvailable && <p>可用 OMAA：<code>{data.latestVersion}</code></p>}
      {data.omdUpdateAvailable && <p>可用兼容 OMD：<code>{data.latestOmdVersion}</code></p>}</>}
    <p className="omaa-help" role="status">{hint}</p>
    {data?.installed?.length > 0 && <p className="omaa-help">已安装：{data.installed.map(row => row.version).join('、')}</p>}
    {(error || data?.error) && <p className="omaa-error" role="alert">{error || data.error}</p>}
    <div className="omaa-update-actions">
      <button type="button" className="omaa-retry" disabled={busy} onClick={() => void load(true)}>{busy ? '处理中…' : '检查更新'}</button>
      {data?.updateAvailable && <button type="button" className="omaa-retry" disabled={busy || !data.available || restart} onClick={() => action('omaa', data.latestVersion)}>更新 OMAA{data.omdUpdateAvailable ? ' 与兼容 OMD' : ''}</button>}
      {!data?.updateAvailable && data?.omdUpdateAvailable && <button type="button" className="omaa-retry" disabled={busy || !data.available || restart} onClick={() => action('omd', data.latestOmdVersion)}>更新兼容 OMD</button>}
      <a href={data?.releaseNotesUrl || 'https://github.com/gulagala001/oh-my-agents-above-all/releases'} target="_blank" rel="noopener noreferrer">发行说明 ↗</a>
    </div>
  </section>;
}
