// Keep compatibility at the public lifecycle boundary; the native manager
// remains responsible for admission, descendants, delivery and cold activation.
export function startActivation(ctx, spec) {
  if (typeof ctx.subagents.startActivation === 'function') return ctx.subagents.startActivation(spec);
  const { delivery: _delivery, ...continuable } = spec;
  return ctx.subagents.startContinuable(continuable);
}
export const drainChildren = (ctx, parent, ids) => typeof ctx.subagents.drainChildren === 'function'
  ? ctx.subagents.drainChildren(parent, ids) : ctx.subagents.drainContinuableChildren(parent, ids);
