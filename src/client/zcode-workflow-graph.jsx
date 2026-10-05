import React, { useCallback, useMemo, useRef, useState } from 'react';
import { WorkflowTimeline } from '../presets/zcode/sources/upstream/packages/ui/src/components/workflow-timeline/WorkflowTimeline.tsx';
import { buildWorkflowTimeline } from '../presets/zcode/sources/upstream/packages/ui/src/components/workflow-timeline/timeline-model.ts';
import { WorkflowRunPhaseList } from '../presets/zcode/sources/upstream/packages/ui/src/app-shell/WorkflowRunPhaseList.tsx';
import { ZCodeGraphIntlProvider } from './zcode-workflow-graph-intl.jsx';
import css from './zcode-workflow-graph.css';

const NO_QUESTIONS = [];

class GraphBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(previous) {
    if (this.state.error && (previous.graph !== this.props.graph || previous.runId !== this.props.runId)) this.setState({ error: null });
  }
  render() {
    return this.state.error ? <div role="alert" className="omaa-error"><p>工作流图无法显示：{this.state.error.message || String(this.state.error)}</p><button type="button" onClick={() => this.setState({ error: null })}>重新加载工作流图</button></div> : this.props.children;
  }
}

function GraphBody({ graph, run, onOpenActor, onOpenWorkspace }) {
  const model = useMemo(() => buildWorkflowTimeline(graph, run), [graph, run]);
  const [landing, setLanding] = useState();
  const landingOrdinal = useRef(0);
  const selectStation = useCallback(station => {
    setLanding({ phaseId: station.id, key: `${station.id}@${++landingOrdinal.current}` });
  }, []);
  // The Timeline and phase list use the same native slot identity. Session IDs
  // are supplied only by the actual actor projection, never derived in the UI.
  const openPill = useCallback(pill => {
    if (!pill.slot || !onOpenActor) return;
    onOpenActor({ siteId: pill.slot.siteId, ordinal: pill.slot.ordinal,
      ...(pill.instance?.sessionId ? { sessionId: pill.instance.sessionId } : {}),
      ...(pill.runtimeName ? { name: pill.runtimeName } : {}),
      status: pill.status === 'running' ? 'running' : pill.status === 'done' || pill.status === 'failed' ? 'completed' : 'waiting' });
  }, [onOpenActor]);
  const openWorkspace = useCallback(pill => {
    if (pill.workspace) onOpenWorkspace?.(pill.workspace.phaseId);
  }, [onOpenWorkspace]);
  return <><WorkflowTimeline model={model} className="py-1" onSelectStation={selectStation} onOpenMore={selectStation}
    {...(onOpenActor ? { onOpenPill: openPill } : {})} {...(onOpenWorkspace ? { onOpenWorkspace: openWorkspace } : {})}/>
    <div className="omaa-zcode-phase-pane"><WorkflowRunPhaseList graph={graph} model={model} run={run} pendingQuestions={run?.pendingQuestions ?? NO_QUESTIONS}
      landing={landing} {...(onOpenActor ? { onOpenActor } : {})} {...(onOpenWorkspace ? { onOpenWorkspace } : {})}/></div></>;
}

export function ZCodeWorkflowGraph({ graph, run, onOpenActor, onOpenWorkspace, locale }) {
  if (!graph || !Array.isArray(graph.steps) || !graph.steps.length) return null;
  return <section className="omaa-zcode-workflow-graph" aria-label="ZCode workflow graph"><style>{css}</style>
    <ZCodeGraphIntlProvider locale={locale}><GraphBoundary graph={graph} runId={run?.runId}>
      <GraphBody key={run?.runId || 'static'} {...{ graph, run, onOpenActor, onOpenWorkspace }}/>
    </GraphBoundary></ZCodeGraphIntlProvider>
  </section>;
}
