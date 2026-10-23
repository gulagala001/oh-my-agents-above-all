import { reduceWorkflowRunsState } from '../../../lib/zcode-run-projection.mjs';
import { NO_ARTIFACT_CHANGE } from '../../host/zcode-artifacts.mjs';

// These are native execution observations, folded with the original bounded
// display reducer. This projection is not an execution or replay journal.
export function foldNativeRunFact(record, runId, eventType, payload = {}, actorSessionId) {
  const sequence = (record.progressSequence ?? 0) + 1;
  const next = reduceWorkflowRunsState(record.runtime ? { revision: record.runtimeRevision ?? 0, runs: [record.runtime] } : undefined,
    { runId, sequence, eventType, payload, ...(actorSessionId ? { actorSessionId } : {}) });
  if (!next) return false;
  record.progressSequence = sequence; record.runtimeRevision = next.revision;
  record.runtime = next.runs.find(run => run.runId === runId);
  return true;
}
export function createRunProgress({ store, parent, runId, signal, stopReason }) {
  const ordinals = new Map(), actors = new Map(), phases = new Map();
  let currentPhase, tail = Promise.resolve();
  const emit = (eventType, payload = {}, actorSessionId) => {
    const work = tail.then(() => store.mutate(parent.id, runId, record => {
      if (!foldNativeRunFact(record, runId, eventType, payload, actorSessionId)) return NO_ARTIFACT_CHANGE;
    }));
    tail = work.catch(() => {}); return work;
  };
  return {
    emit,
    start: async prepared => {
      await emit('run-started');
      await emit('run-launched', { phaseNames: [...prepared.phaseNames], holes: [...prepared.holes],
        ...(prepared.phaseAlongside === undefined ? {} : { phaseAlongside: prepared.phaseAlongside }) });
    },
    async phase(name) {
      if (typeof name !== 'string') throw Error('Phase title must be text.');
      name = name.trim(); if (!name) return;
      currentPhase = name;
      const ordinal = (phases.get(name) ?? 0) + 1; phases.set(name, ordinal);
      await emit('phase-entered', { name, ordinal });
    },
    actor(reference, childId) {
      let actor = actors.get(reference.handle);
      if (!actor) {
        actor = { ref: { siteId: reference.siteId, ordinal: reference.ordinal }, childId, name: reference.name,
          phaseName: reference.phaseName ?? undefined };
        actors.set(reference.handle, actor);
      }
      return actor;
    },
    async created(reference, childId) {
      const actor = this.actor(reference, childId);
      if (actor.announced) return;
      await emit('actor-created', { actor: actor.ref, name: actor.name,
        ...(actor.phaseName === undefined ? {} : { phaseName: actor.phaseName }) });
      actor.announced = true;
    },
    async node(siteId, kind, { actor, phaseName = currentPhase, instructions } = {}) {
      const ordinal = (ordinals.get(siteId) ?? 0) + 1; ordinals.set(siteId, ordinal);
      const payload = { instance: { siteId, ordinal }, kind,
        ...(phaseName === undefined ? {} : { phaseName }),
        ...(actor ? { actor: actor.ref, actorName: actor.name, actorPhaseName: actor.phaseName } : {}),
        ...(instructions === undefined ? {} : { instructionsHead: instructions.slice(0, 240) }) };
      // Allocation is not session materialization. Actor session identity is
      // attached only after the native manager accepts the child.
      if (actor && !actor.announced) {
        await emit('actor-created', { actor: actor.ref, name: actor.name,
          ...(actor.phaseName === undefined ? {} : { phaseName: actor.phaseName }) });
        actor.announced = true;
      }
      await emit('node-queued', payload);
      return {
        ref: payload.instance,
        dispatched: () => emit('node-dispatched', payload, actor?.ready ? actor.childId : undefined),
        async materialized() {
          if (!actor || actor.ready) return;
          // 3.15.1 records the real child transcript on dispatched nodes. The
          // earlier dispatch lacked a session ID until native acceptance.
          await emit('node-dispatched', payload, actor.childId);
          actor.ready = true;
        },
        progress: (turn, toolCalls, lastTool) => emit('node-progress', { instance: payload.instance,
          ...(turn === undefined ? {} : { turn }), ...(toolCalls === undefined ? {} : { toolCalls }),
          ...(lastTool === undefined ? {} : { lastTool }) }),
        settled: (error, { cached = false, sourceSessionId } = {}) => emit('node-settled', { ...payload, ...(cached ? { cached: true } : {}),
          ...(cached && sourceSessionId ? { sourceSessionId } : {}), outcome: error ? signal?.aborted ? 'cancelled' : 'failed' : 'ok',
          ...(error ? { error: String(error.message ?? error) } : {}) }, actor?.ready ? actor.childId : undefined),
      };
    },
    finish: outcome => emit('run-settled', { status: outcome.error ? outcome.error.kind === 'abort' ? 'stopped' : 'errored' : 'completed',
      ...(outcome.error ? { error: outcome.error,
        ...(outcome.error.kind === 'abort' && stopReason?.() ? { stopReason: stopReason() } : {}) } : {}) }),
    flush: () => tail,
  };
}
