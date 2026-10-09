import React, { useSyncExternalStore } from 'react';
import { createSessionSettings, PresetControls } from './preset-controls.jsx';
import { CheckpointControls } from './checkpoint-controls.jsx';
import { CheckpointReviewChip } from './checkpoint-review-chip.jsx';
import reviewChipCss from './checkpoint-review-chip.css';
import { GitReview } from './git-review.jsx';
import { PiBranches } from './pi-branches.jsx';
import { applyThemes } from './themes/index.jsx';
import controlsCss from './preset-controls.css';
import { SettingsPage } from './settings-page.jsx';
import updatesCss from './updates.css';
import { applyPiExtensionNotices } from './pi-extensions.jsx';
import { applyPiExtensionMessages } from './pi-extension-messages.jsx';
import { ZCodeWorkflows } from './zcode-workflows.jsx';
import { ZCodeWorkflowTool } from './zcode-workflow-tool.jsx';
import { ZCodeSavedWorkflowTool } from './zcode-saved-workflow-tool.jsx';

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'theme', 'configForms', 'sessions', 'uiWorkspace', 'conversation', 'uiConversation'];

export function apply(ctx) {
  let settings;
  ctx.effect(() => { settings = createSessionSettings(ctx); return () => settings.dispose(); });
  applyPiExtensionNotices(ctx, settings);
  applyPiExtensionMessages(ctx);
  const getThemeRuntime = applyThemes(ctx, settings);
  const openPanel = () => ctx.sidebarRight.openTab('omaa-preset');
  const Settings = () => <SettingsPage {...{ settings, getThemeRuntime }}/>
  function PanelControls(props) {
    const { tab } = props.useTabInfo();
    const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
    return <><PresetControls {...{ settings, getThemeRuntime }} visible={tab.visible}/>{current.data?.product?.id === 'zcode' && <button type="button" onClick={() => ctx.sidebarRight.openTab('omaa-zcode-workflows')}>查看工作流产物</button>}<CheckpointControls settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><GitReview settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><PiBranches settings={settings} uiWorkspace={ctx.uiWorkspace} sessions={ctx.sessions} visible={tab.visible}/></>;
  }
  function WorkflowPanel(props) {
    const { tab } = props.useTabInfo();
    return <ZCodeWorkflows settings={settings} sidebarRight={ctx.sidebarRight} visible={tab.visible}
      requestedRunId={typeof tab.navigation?.params?.runId === 'string' ? tab.navigation.params.runId : undefined}
      onOpenActor={actor => {
        const current = settings.getSnapshot();
        if (!current.sessionId || current.data?.product?.id !== 'zcode' || typeof actor.sessionId !== 'string') return;
        ctx.uiWorkspace.openSession({ parentSessionId: current.sessionId, childSessionId: actor.sessionId, mode: 'continuable' });
      }}/>
  }
  const Chip = props => <span className="omaa-composer-chips"><CheckpointReviewChip settings={settings} sidebarRight={ctx.sidebarRight} sessionId={props.sessionId}/><PresetControls {...{ settings, getThemeRuntime, openPanel }} compact/></span>
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.omaaControls = ''; tag.textContent = controlsCss + '\n' + updatesCss + '\n' + reviewChipCss;
    document.head.append(tag); return () => tag.remove();
  });
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omaa-presets', order: 17, label: () => 'Oh My Agents Above All' }, Settings));
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'omaa-preset-chip', order: 75 }, Chip));
  const panelId = 'omaa/omaa-preset';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: panelId, kind: 'omaa-preset', title: () => '预设设置', guide: [] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: panelId }, PanelControls));
  const workflowPanelId = 'omaa/omaa-zcode-workflows';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: workflowPanelId, kind: 'omaa-zcode-workflows', title: () => '工作流产物', guide: [] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: workflowPanelId }, WorkflowPanel));
  for (const key of ['create_workflow', 'amend_workflow']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, priority: 100,
    inject: sessionId => ({ openArtifacts: runId => ctx.sidebarRight.openTabIn(sessionId, 'omaa-zcode-workflows', { params: { runId } }) }),
  }, ZCodeWorkflowTool));
  for (const key of ['save_workflow', 'list_saved_workflows', 'read_saved_workflow', 'run_saved_workflow']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, priority: 100,
    inject: sessionId => ({ sessionId, toolName: key, settings, sessions: ctx.sessions, sidebarRight: ctx.sidebarRight }),
  }, ZCodeSavedWorkflowTool));
}
