import React, { useState } from 'react';
import { PresetControls } from './preset-controls.jsx';
import { Updates } from './updates.jsx';
import { PiExtensions } from './pi-extensions.jsx';
import css from './settings-page.css';

function SettingsFold({ title, children }) {
  const [visited, setVisited] = useState(false);
  return <details className="omaa-settings-fold" onToggle={event => {
    if (event.currentTarget.open) setVisited(true);
  }}>
    <summary>{title}</summary>
    {visited && children}
  </details>;
}

export function SettingsPage({ settings, getThemeRuntime }) {
  return <div className="omaa-settings-page">
    <style>{css}</style>
    <PresetControls {...{ settings, getThemeRuntime }}/>
    <SettingsFold title="版本与更新"><Updates embedded/></SettingsFold>
    <SettingsFold title="Pi 本地扩展"><PiExtensions settings={settings} embedded/></SettingsFold>
  </div>;
}
