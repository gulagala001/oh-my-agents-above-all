import { randomUUID } from 'node:crypto';

// Only the native write tool publishes definition bytes. This middleware narrows
// its existing policy decision; it never supplies filesystem authority itself.
export function createSavedWorkflowWrites(ctx, permissions) {
  const pending = new Map();
  let closed = false;
  ctx.effect(() => {
    ctx.on('fs/write-intent', async (target, actor, next) => {
      const guard = pending.get(actor?.callId);
      if (!guard) return next();
      if (actor.agent !== guard.agent || actor.name !== 'write' || actor.parent !== guard.parent
        || target.targetKey !== guard.targetKey) throw Error('Saved workflow write identity changed.');
      const current = await next();
      guard.permission.check();
      guard.signal.throwIfAborted();
      if (closed || pending.get(actor.callId) !== guard || guard.admitted || ctx.omaa.modeFor(guard.agent.session) !== 'default')
        throw Error('Saved workflow write is no longer accepting a mutation.');
      if (current !== undefined && (current.kind !== guard.intent.kind
        || (current.kind === 'replaceIfVersion' && current.version !== guard.intent.version)))
        throw Error('Saved workflow observation changed; read the definition again.');
      guard.admitted = true;
      return guard.intent;
    }, { global: true, prepend: true });
    return async () => {
      closed = true;
      const running = [...pending.values()];
      for (const guard of running) guard.control.abort(Error('Saved workflow write scope disposed.'));
      // Keep guards until native calls settle, including delayed intent callbacks.
      await Promise.allSettled(running.map(guard => guard.work));
    };
  }, 'Guarded saved workflow writes');
  return {
    async write({ exec, target, intent, content, signal: callerSignal }) {
      exec.signal.throwIfAborted();
      if (closed || ctx.omaa.modeFor(exec.agent.session) !== 'default') throw Error('Change saved workflows only in default working mode.');
      if (!ctx.tools.get('write', exec.agent)) throw Error('The native write tool is unavailable.');
      if (!['createIfAbsent', 'replaceIfVersion'].includes(intent.kind)) throw Error('Unsupported saved workflow write intent.');
      const permission = permissions.enter(exec, callerSignal);
      const callId = randomUUID(), control = new AbortController(), signal = AbortSignal.any([permission.signal, control.signal]);
      const guard = { agent: exec.agent, parent: exec.token, targetKey: target.targetKey, intent,
        signal, control, permission, admitted: false };
      pending.set(callId, guard);
      try {
        // Pin the reviewed physical path rather than re-following a scope alias.
        permission.check();
        guard.work = ctx.tools.execute({ name: 'write', arguments: { file_path: ctx.fs.processPath(target), content },
          agent: exec.agent, callId, rootCallId: exec.rootCallId, parent: exec.token, signal });
        const result = await guard.work;
        let interrupted = signal.aborted;
        try { permission.check(); } catch { interrupted = true; }
        return { result, admitted: guard.admitted, callId, interrupted };
      } finally { pending.delete(callId); permission.dispose(); }
    },
  };
}

export function savedWorkflowNativeFailure(result) {
  return Object.assign(Error(result.error?.message ?? (result.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n')),
    typeof result.error?.info?.code === 'string' ? { code: result.error.info.code } : {});
}
