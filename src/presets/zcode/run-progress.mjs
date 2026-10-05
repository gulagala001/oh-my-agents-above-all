import { reduceWorkflowRunsState } from '../../../lib/zcode-run-projection.mjs';
import { NO_ARTIFACT_CHANGE } from '../../host/zcode-artifacts.mjs';

// These are native execution observations, folded with the original bounded
// display reducer. This projection is not an execution or replay journal.
export function createRunProgress({ store, parent, runId, signal, stopReason }) {
  const ordinals = new Map(), actors = new Map(), phases = new Map();
  let currentPhase, tail = Promise.resolve();
  const emit = (eventType, payload = {}, actorSessionId) => {
    const work = tail.then(() => store.mutate(parent.id, runId, record => {
      const sequence = (record.progressSequence ?? 0) + 1;
      const next = reduceWorkflowRunsState(record.runtime ? { revision: record.runtimeRevision ?? 0, runs: [record.runtime] } : undefined,
        { runId, sequence, eventType, payload, ...(actorSessionId ? { actorSessionId } : {}) });
      if (!next) return NO_ARTIFACT_CHANGE;
      record.progressSequence = sequence; record.runtimeRevision = next.revision;
      record.runtime = next.runs.find(run => run.runId === runId);
    }));
    tail = work.catch(() => {}); return work;
  };
  return {
    emit,
    start: () => emit('run-started'),
    async phase(name) {
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
          await emit('actor-created', { actor: actor.ref, name: actor.name,
            ...(actor.phaseName === undefined ? {} : { phaseName: actor.phaseName }) }, actor.childId);
          actor.ready = true;
        },
        progress: (turn, toolCalls, lastTool) => emit('node-progress', { instance: payload.instance, turn, toolCalls,
          ...(lastTool === undefined ? {} : { lastTool }) }),
        settled: (error) => emit('node-settled', { ...payload, outcome: error ? signal?.aborted ? 'cancelled' : 'failed' : 'ok',
          ...(error ? { error: String(error.message ?? error) } : {}) }, actor?.ready ? actor.childId : undefined),
      };
    },
    finish: outcome => emit('run-settled', { status: outcome.error ? outcome.error.kind === 'abort' ? 'stopped' : 'errored' : 'completed',
      ...(outcome.error ? { error: outcome.error,
        ...(outcome.error.kind === 'abort' && stopReason?.() ? { stopReason: stopReason() } : {}) } : {}) }),
    flush: () => tail,
  };
}
