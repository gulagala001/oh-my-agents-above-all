export const name = 'omaa-pi-steering';
export const inject = ['omaa'];

export function apply(ctx, config = {}) {
  const mode = config.mode ?? 'one-at-a-time';
  if (!['one-at-a-time', 'all'].includes(mode)) throw new Error('Pi steering mode must be one-at-a-time or all');
  if (mode === 'all') return;
  const tracked = new WeakMap();
  const owns = agent => ctx.omaa.product(agent.session)?.id === 'pi';
  const idsFor = agent => {
    let ids = tracked.get(agent);
    if (!ids) { ids = new Set(agent.inbox.nextStep.filter(message => message.source.kind === 'user').map(message => message.id)); tracked.set(agent, ids); }
    return ids;
  };
  ctx.on('agent/created', ({ agent }) => { if (owns(agent)) idsFor(agent); });
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (!owns(agent) || message.source.kind !== 'user') return;
    const ids = idsFor(agent);
    if (agent.inbox.nextStep.some(pending => pending.id === message.id)) ids.add(message.id);
    else ids.delete(message.id);
  });
  ctx.on('agent/inbox/discarded', ({ agent, message }) => tracked.get(agent)?.delete(message.id));
  ctx.on('agent/pre-step', (info, next) => {
    if (!owns(info.agent)) return next();
    info.signal.throwIfAborted();
    const ids = idsFor(info.agent), steering = info.messages.filter(message => message.source.kind === 'user' && ids.has(message.id));
    const deferred = steering.slice(1), waiting = new Set(deferred.map(message => message.id));
    // DSH's documented pre-step payload has a mutable messages array. Filter
    // synchronously before the native skill/template hooks inspect it, then
    // reinsert the original identified messages with the public Inbox API.
    // This preserves native history and cancellation after this boundary.
    if (deferred.length) {
      info.messages.splice(0, info.messages.length, ...info.messages.filter(message => !waiting.has(message.id)));
      info.agent.inbox.splice('next-step', 0, 0, deferred);
    }
    for (const message of steering) if (!waiting.has(message.id)) ids.delete(message.id);
    return next();
  }, { prepend: true });
}
