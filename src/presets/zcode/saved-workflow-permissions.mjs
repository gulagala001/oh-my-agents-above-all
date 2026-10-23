// Native tools capture a standing policy before asynchronous preparation. Keep
// adapter-owned cancellation alive across those waits; never upgrade that policy.
export function createSavedWorkflowPermissions(ctx) {
  const scopes = new Set();
  let closed = false;
  const policyKey = agent => {
    if (!ctx.sandboxPolicy?.resolve) throw Error('Native standing sandbox policy is unavailable.');
    return JSON.stringify(ctx.sandboxPolicy.resolve({ session: agent.session }));
  };
  ctx.effect(() => {
    ctx.on('session/event', (session, event) => {
      if (!['sandbox/mode', 'plan/mode'].includes(event.type)) return;
      for (const scope of scopes) if (scope.agent.id === session.id)
        scope.control.abort(Error('Saved workflow permissions or working mode changed.'));
    }, { global: true });
    ctx.on('omaa/preferences-updated', session => {
      for (const scope of scopes) if (scope.agent.id === session.id) {
        try { scope.check(); } catch {}
      }
    }, { global: true });
    ctx.on('agent/disposed', ({ agent }) => {
      for (const scope of scopes) if (scope.agent === agent)
        scope.control.abort(Error('Saved workflow parent was disposed.'));
    }, { global: true });
    return () => {
      closed = true;
      for (const scope of scopes) scope.control.abort(Error('Saved workflow permission scope disposed.'));
    };
  }, 'Saved workflow permission cancellation');
  return {
    enter(exec, extraSignal) {
      const agent = exec.agent, control = new AbortController();
      const key = policyKey(agent);
      const signal = AbortSignal.any([exec.signal, control.signal, ...(extraSignal ? [extraSignal] : [])]);
      const scope = { agent, control, signal,
        check() {
          try {
            signal.throwIfAborted();
            if (closed || ctx.agents.get(agent.id) !== agent || ctx.omaa.modeFor(agent.session) !== 'default' || policyKey(agent) !== key)
              throw Error('Saved workflow parent, mode or standing permissions changed.');
          } catch (error) { control.abort(error); throw error; }
        },
        dispose() { scopes.delete(scope); },
      };
      scope.check(); scopes.add(scope);
      return scope;
    },
  };
}
