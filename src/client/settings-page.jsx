import React, { useState, useSyncExternalStore } from 'react';
import { Button, Switch, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { PresetControls } from './preset-controls.jsx';
import { Updates } from './updates.jsx';
import { PiExtensions } from './pi-extensions.jsx';
import { products } from '../shared/products.mjs';
import css from './settings-page.css';
import controlsCss from './preset-controls.css';
import updatesCss from './updates.css';

const hints = {
  codex: '连续编码、Git 审阅与代码行反馈。',
  grok: '计划执行、后台监控与定时任务。',
  cursor: '项目规则、变更审阅与文件检查点。',
  pi: '精简编码工具、会话分支与本地扩展。',
  zcode: '工作流编排、角色协作与产物查看。',
};

function Group({ title, children }) {
  return <section className="omaa-set-group"><h3>{title}</h3><div className="omaa-set-card">{children}</div></section>;
}
function SettingsFold({ title, children }) {
  const [visited, setVisited] = useState(false);
  return <details className="omaa-set-fold" onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary><span>{title}</span><IconChevronDownOutlineRegular/></summary>
    {visited && <div className="omaa-set-fold-body">{children}</div>}
  </details>;
}

export function SettingsPage({ activation }) {
  const state = useSyncExternalStore(activation.subscribe, activation.getSnapshot);
  const enabled = state.data?.enabled ?? [], runtime = state.runtime;
  const disabled = !state.data || state.loading || state.saving;
  return <div className="omaa-settings-page">
    <style>{css + '\n' + controlsCss + '\n' + updatesCss}</style>
    <div className="omaa-set-body">
      <Group title="代理预设">
        {products.map(product => {
          const pending = state.pending?.id === product.id;
          return <div className="omaa-set-row" key={product.id}>
            <div className="omaa-set-line">
              <div className="omaa-set-copy"><strong>{product.name}</strong><small>{hints[product.id]}</small></div>
              <div className="omaa-set-control"><Switch label={`启用 ${product.name}`} disabled={disabled}
                checked={pending ? state.pending.enabled : enabled.includes(product.id)}
                onChange={value => { void activation.select(product.id, value); }}/></div>
            </div>
            {pending && <div className="omaa-set-status" role="status">{state.pending.enabled ? '正在开启…' : '正在关闭…'}</div>}
          </div>;
        })}
      </Group>
      <p className="omaa-set-hint">默认全部关闭。开启后在新会话中选择，不改变默认预设；关闭保留历史和个人设置。</p>
      <div className="omaa-set-footer">
        <span role="status">{state.loading ? '正在读取…' : enabled.length ? `已开启 ${enabled.length} 个预设` : '未开启预设，保持 DSH 原有体验'}</span>
        <Button type="button" size="sm" variant="ghost" disabled={state.loading || state.saving}
          onClick={() => { void activation.refresh(); }}>刷新</Button>
      </div>
      {state.error && <div role="alert" className="omaa-set-status omaa-set-error">{state.error}</div>}
      <Group title="更多设置">
        {runtime && <SettingsFold title="当前会话"><PresetControls {...runtime}/></SettingsFold>}
        {runtime && enabled.includes('pi') && <SettingsFold title="Pi 本地扩展"><PiExtensions settings={runtime.settings} embedded/></SettingsFold>}
        <SettingsFold title="版本与更新"><Updates embedded/></SettingsFold>
      </Group>
    </div>
  </div>;
}
