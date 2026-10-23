import { applyPresetQueues } from './preset-queue.jsx';
import React, { useSyncExternalStore } from 'react';
import { createSessionSettings, PresetControls } from './preset-controls.jsx';
import { CheckpointControls } from './checkpoint-controls.jsx';
import { ComposerChips } from './composer-chips.jsx';
import reviewChipCss from './checkpoint-review-chip.css';
import { GitReview } from './git-review.jsx';
import { CursorReview } from './cursor-review.jsx';
import { disposeCursorReview } from './cursor-review-state.mjs';
import { PiBranches } from './pi-branches.jsx';
import { applyThemes } from './themes/index.jsx';
import controlsCss from './preset-controls.css';
import updatesCss from './updates.css';
import { applyPiExtensionNotices } from './pi-extensions.jsx';
import { applyPiExtensionMessages } from './pi-extension-messages.jsx';
import { ZCodeWorkflows } from './zcode-workflows.jsx';
import { ZCodeWorkflowTool } from './zcode-workflow-tool.jsx';
import { ZCodeWorkflowInspectionTool } from './zcode-workflow-inspection-tool.jsx';
import { ZCodeWorkflowSnippetTool } from './zcode-workflow-snippet-tool.jsx';
import { ZCodeSavedWorkflowTool } from './zcode-saved-workflow-tool.jsx';
import { assertSavedWorkflowSession } from './zcode-saved-workflow-state.mjs';
import workbenchCss from './workbench.css';

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'theme', 'configForms', 'sessions', 'uiWorkspace', 'conversation', 'uiConversation'];

export function apply(ctx, { enabled, ready }) {
  let settings;
  ctx.effect(() => { settings = createSessionSettings(ctx, fetch, enabled); return () => { disposeCursorReview(settings); settings.dispose(); }; });
  if (enabled.some(product => ['grok', 'cursor'].includes(product))) applyPresetQueues(ctx, enabled);
  if (enabled.includes('pi')) { applyPiExtensionNotices(ctx, settings); applyPiExtensionMessages(ctx); }
  const getThemeRuntime = applyThemes(ctx, settings);
  ready({ settings, getThemeRuntime });
  ctx.effect(() => () => ready(null));
  function PanelControls(props) {
    const { tab } = props.useTabInfo();
    const current = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
    return <div className="omaa-workbench" data-product={current.data?.product?.id}><PresetControls {...{ settings, getThemeRuntime }} visible={tab.visible}/>{current.data?.product?.id === 'cursor' && <div className="omaa-workbench-link"><button type="button" onClick={() => ctx.sidebarRight.openTabIn(current.sessionId, 'omaa-cursor-review')}>打开代码审阅</button><p className="omaa-help">工作区、分支与回合比较，保存批注并继续修改。</p></div>}{current.data?.product?.id === 'zcode' && <div className="omaa-workbench-link"><button type="button" onClick={() => ctx.sidebarRight.openTab('omaa-zcode-workflows')}>查看工作流产物</button><p className="omaa-help">图与阶段、Actor、脚本、运行报告和发布产物。</p></div>}<CheckpointControls settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><GitReview settings={settings} sidebarRight={ctx.sidebarRight} sessions={ctx.sessions} visible={tab.visible}/><PiBranches settings={settings} uiWorkspace={ctx.uiWorkspace} sessions={ctx.sessions} visible={tab.visible}/></div>;
  }
  function WorkflowPanel(props) {
    const { tab } = props.useTabInfo();
    return <ZCodeWorkflows settings={settings} sessions={ctx.sessions} sidebarRight={ctx.sidebarRight} visible={tab.visible}
      requestedRunId={typeof tab.navigation?.params?.runId === 'string' ? tab.navigation.params.runId : undefined}
      onOpenActor={actor => {
        const current = settings.getSnapshot();
        if (!current.sessionId || current.data?.product?.id !== 'zcode' || typeof actor.sessionId !== 'string') return;
        ctx.uiWorkspace.openSession({ parentSessionId: current.sessionId, childSessionId: actor.sessionId, mode: 'continuable' });
      }}/>
  }
  const Chip = props => <ComposerChips {...{ settings, getThemeRuntime }} sidebarRight={ctx.sidebarRight} sessionId={props.sessionId}/>
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.omaaControls = ''; tag.textContent = controlsCss + '\n' + updatesCss + '\n' + reviewChipCss + '\n' + workbenchCss;
    document.head.append(tag); return () => tag.remove();
  });
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'omaa-preset-chip', order: 75 }, Chip));
  const panelId = 'omaa/omaa-preset';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: panelId, kind: 'omaa-preset', title: () => '预设设置', guide: [] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: panelId }, PanelControls));
  if (enabled.includes('cursor')) {
    const cursorPanelId = 'omaa/omaa-cursor-review';
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: cursorPanelId, kind: 'omaa-cursor-review', title: () => 'Cursor 审阅', guide: [] }));
    function CursorPanel(props) {
      const { tab } = props.useTabInfo();
      return <CursorReview settings={settings} sidebarRight={ctx.sidebarRight} visible={tab.visible} navigation={tab.navigation}/>;
    }
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: cursorPanelId }, CursorPanel));
  }
  if (!enabled.includes('zcode')) return;
  const workflowPanelId = 'omaa/omaa-zcode-workflows';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: workflowPanelId, kind: 'omaa-zcode-workflows', title: () => '工作流产物', guide: [] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: workflowPanelId }, WorkflowPanel));
  for (const key of ['create_workflow', 'amend_workflow', 'fill_workflow', 'resume_workflow']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, priority: 100,
    inject: sessionId => ({ toolName: key, openArtifacts: runId => {
      assertSavedWorkflowSession(settings, ctx.sidebarRight, sessionId, false, false);
      return ctx.sidebarRight.openTabIn(sessionId, 'omaa-zcode-workflows', { params: { runId } });
    } }),
  }, ZCodeWorkflowTool));
  for (const key of ['list_workflow_runs', 'get_workflow_run']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, priority: 100,
    inject: sessionId => ({ sessionId, toolName: key, openArtifacts: runId => {
      assertSavedWorkflowSession(settings, ctx.sidebarRight, sessionId, false, false);
      return ctx.sidebarRight.openTabIn(sessionId, 'omaa-zcode-workflows', { params: { runId } });
    } }),
  }, ZCodeWorkflowInspectionTool));
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'eval_workflow_snippet', priority: 100 }, ZCodeWorkflowSnippetTool));
  for (const key of ['save_workflow', 'list_saved_workflows', 'read_saved_workflow', 'run_saved_workflow', 'update_saved_workflow', 'move_saved_workflow', 'delete_saved_workflow']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, priority: 100,
    inject: sessionId => ({ sessionId, toolName: key, settings, sessions: ctx.sessions, sidebarRight: ctx.sidebarRight }),
  }, ZCodeSavedWorkflowTool));
}
