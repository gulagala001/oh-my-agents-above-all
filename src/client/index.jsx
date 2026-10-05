import React from 'react';
import { createSessionSettings, PresetControls } from './preset-controls.jsx';
import { CheckpointControls } from './checkpoint-controls.jsx';
import { GitReview } from './git-review.jsx';
import { PiBranches } from './pi-branches.jsx';
import { applyThemes } from './themes/index.jsx';
import controlsCss from './preset-controls.css';
import { Updates } from './updates.jsx';
import updatesCss from './updates.css';

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'theme', 'configForms', 'sessions', 'uiWorkspace'];

export function apply(ctx) {
  let settings;
  ctx.effect(() => { settings = createSessionSettings(ctx); return () => settings.dispose(); });
  const getThemeRuntime = applyThemes(ctx, settings);
  const openPanel = () => ctx.sidebarRight.openTab('omaa-preset');
  const Controls = () => <PresetControls {...{ settings, getThemeRuntime }}/>
  function PanelControls(props) {
    const { tab } = props.useTabInfo();
    return <><PresetControls {...{ settings, getThemeRuntime }} visible={tab.visible}/><CheckpointControls settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><GitReview settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><PiBranches settings={settings} uiWorkspace={ctx.uiWorkspace} sessions={ctx.sessions} visible={tab.visible}/></>;
  }
  const Chip = () => <PresetControls {...{ settings, getThemeRuntime, openPanel }} compact/>
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.omaaControls = ''; tag.textContent = controlsCss + '\n' + updatesCss;
    document.head.append(tag); return () => tag.remove();
  });
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omaa-presets', order: 17, label: () => 'Oh My Agents Above All' }, Controls));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omaa-updates', order: 18, label: () => 'OMAA 更新' }, Updates));
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'omaa-preset-chip', order: 75 }, Chip));
  const panelId = 'omaa/omaa-preset';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: panelId, kind: 'omaa-preset', title: () => '预设设置', guide: [] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: panelId }, PanelControls));
}
