export const name = 'omaa-working-policy';
export const inject = ['omaa'];

export function apply(ctx) {
  const baseline = () => ctx.omaa.sandboxPolicy();
  if (!baseline()) throw new Error('OMAA requires the host sandbox policy service');
  ctx.provide('sandboxPolicy', {
    get defaultMode() { return baseline().defaultMode; },
    get workspaceRoot() { return baseline().workspaceRoot; },
    overrideOf: session => baseline().overrideOf(session),
    resolve(request = {}) {
      const policy = baseline().resolve(request);
      if (request.session && ctx.omaa.product(request.session) && ctx.omaa.modeFor(request.session) !== 'default') {
        return { ...policy, mode: 'read-only' };
      }
      return policy;
    },
  });
}
