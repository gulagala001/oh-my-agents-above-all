export const name = 'omaa-pi-steering';
export const inject = ['omaa'];

export function apply(ctx, config = {}) {
  const mode = config.mode ?? 'one-at-a-time';
  if (!['one-at-a-time', 'all'].includes(mode)) throw new Error('Pi steering mode must be one-at-a-time or all');
  if (mode === 'all') return;
  const tracked = new WeakMap();
  const prepared = new WeakMap();
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
  const select = (agent, messages) => {
    const ids = idsFor(agent), steering = messages.filter(message => message.source.kind === 'user' && ids.has(message.id));
    const deferred = steering.slice(1), waiting = new Set(deferred.map(message => message.id));
    if (deferred.length) agent.inbox.splice('next-step', 0, 0, deferred);
    for (const message of steering) if (!waiting.has(message.id)) ids.delete(message.id);
    return messages.filter(message => !waiting.has(message.id));
  };
  // The awaited input/assembly boundary and native pre-step must select the
  // same steer. Deferred messages have no extension/template side effects.
  ctx.provide('omaaPiSteering', { select(agent, messages) {
    const selected = select(agent, messages);
    prepared.set(agent, { claimed: new Set(messages.map(m => m.id)), selected: new Set(selected.map(m => m.id)) });
    return selected;
  } });
  ctx.on('agent/pre-step', (info, next) => {
    if (!owns(info.agent)) return next();
    info.signal.throwIfAborted();
    const early = prepared.get(info.agent); prepared.delete(info.agent);
    const messages = early ? info.messages.filter(message => !early.claimed.has(message.id) || early.selected.has(message.id)) : select(info.agent, info.messages);
    info.messages.splice(0, info.messages.length, ...messages);
    return next();
  }, { prepend: true });
}
