import { interpolate } from '@deepseek-ai/cordis-plugin-loader';

export const name = 'omaa-workflow-controller';
export const inject = ['loader', 'tools', 'systemPrompt', 'omaa', 'agents', 'subagents', 'ptcRuntime', 'sandboxPolicy'];

export async function scopeBinding(ctx) {
  const entry = [...ctx.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-workflow-ptc');
  const { scopeOf, scopeChainOf } = await entry.parent.tree.import('@deepseek-ai/dsh-scope');
  const revision = scopeOf(ctx);
  return { scope: revision, matches: agent => scopeChainOf(scopeOf(agent.ctx)).includes(revision) };
}

// Optional engines are child Fibers, rather than ordinary preset entries:
// failure of an enhancement cannot mark the base preset composition broken.
export async function apply(ctx, config) {
  const tree = ctx.fiber.entry.parent.tree;
  const { scope: revision, matches: owned } = await scopeBinding(ctx);
  let branch, bridge = ctx.get('trisoulX'), active = true, pending = false, draining;
  let replacing, failedTarget;
  const controller = { matches: owned, mode: 'native' };
  const hub = ctx.omaa;
  ctx.effect(() => {
    hub.workflowControllers.add(controller);
    return async () => {
      active = false;
      hub.workflowControllers.delete(controller);
      await branch?.owner.dispose();
    };
  });
  const liveAgents = () => ctx.agents.list().filter(owned);
  const target = () => {
    const provider = ctx.subagents.getProvider('omd-workflow');
    if (typeof bridge?.omaaWorkflowComposition !== 'function' || !provider
      || failedTarget?.bridge === bridge && failedTarget?.provider === provider) return { mode: 'native' };
    return { mode: 'omd', bridge, provider };
  };
  const same = (a, b) => a.mode === b.mode && a.bridge === b.bridge && a.provider === b.provider;
  const busyJobs = () => liveAgents().some(agent => ctx.get('jobs')?.list(agent.id).some(job => job.kind === 'workflow' && ['running', 'stopping'].includes(job.status)));

  async function mount(wanted) {
    const rows = wanted.mode === 'omd' ? wanted.bridge.omaaWorkflowComposition().filter(row => !row.disabled) : config.native;
    const owner = ctx.plugin({ name: 'omaa-workflow-branch', async apply(scope) {
      for (const row of rows) {
        const module = await tree.import(row.name);
        const fiber = scope.plugin(module.default ?? module, interpolate(scope, row.config ?? {}));
        await fiber;
        if (row === rows[0] && !scope.get('workflowEngine')) throw new Error('Workflow engine did not become available');
      }
    } });
    try {
      await owner;
      const engine = owner.ctx.get('workflowEngine');
      const schemas = ctx.tools.schemas(revision).filter(tool => tool.name === 'workflow');
      if (!engine || schemas.length !== 1 || wanted.mode === 'omd' && !schemas[0].parameters?.properties?.resumeFromRunId) {
        throw new Error('Workflow branch did not become available');
      }
      return { ...wanted, owner, engine };
    } catch (error) { await owner.dispose(); throw error; }
  }

  async function waitJobs() {
    if (!busyJobs()) return;
    await new Promise(resolve => {
      const jobs = ctx.get('jobs');
      const remove = jobs?.events.subscribe({ owners: 'scope' }, check);
      const dispose = ctx.effect(() => () => { remove?.(); resolve(); });
      function check() { if (!active || !busyJobs()) { remove?.(); dispose(); resolve(); } }
      check();
    });
  }

  async function replace(wanted) {
    // whenIdle includes Pi maintenance. Reserve all announced agents without
    // yielding between reservations; queued input wakes after we release them.
    for (;;) {
      await Promise.all(liveAgents().map(agent => agent.whenIdle()));
      await waitJobs();
      if (!active || !same(wanted, target())) return;
      const gate = Promise.withResolvers(), holds = [];
      let reserved = true;
      replacing = Promise.withResolvers();
      try {
        for (const agent of liveAgents()) holds.push(agent.runMaintenance(async () => gate.promise));
      } catch { reserved = false; }
      if (!reserved || busyJobs()) {
        replacing.resolve(); replacing = undefined;
        gate.resolve(); await Promise.allSettled(holds); continue;
      }
      try {
        controller.mode = 'changing';
        while (active) {
          await branch.owner.dispose();
          if (!active) return;
          const latest = target();
          try { branch = await mount(latest); }
          catch (error) {
            if (latest.mode !== 'omd') throw error;
            failedTarget = latest;
            ctx.logger.warn('OMD workflow unavailable; retaining native OMAA workflow: %s', error);
            branch = await mount({ mode: 'native' });
          }
          // A provider may disappear while imports/apply are awaiting. Keep
          // the same reservations until the installed branch is still current.
          if (same(branch, target())) { controller.mode = branch.mode; break; }
        }
      } finally {
        replacing.resolve(); replacing = undefined;
        gate.resolve(); await Promise.allSettled(holds);
      }
      return;
    }
  }

  function schedule() {
    pending = true;
    if (draining || !active) return;
    draining = (async () => {
      while (active && pending) {
        pending = false;
        const wanted = target();
        if (!same(branch, wanted)) await replace(wanted);
      }
    })().catch(error => ctx.logger.error(error)).finally(() => { draining = undefined; if (pending && active) schedule(); });
  }

  branch = await mount({ mode: 'native' });
  ctx.on('agent/created', async ({ agent }) => {
    if (!owned(agent)) return;
    // Gate only the actual replacement. Waiting for a busy parent while its
    // child is still being published would deadlock the native spawn path.
    await replacing?.promise;
  }, { global: true, prepend: true });
  ctx.inject(['trisoulX'], scope => {
    const current = scope.trisoulX;
    bridge = current; failedTarget = undefined; schedule();
    return () => { if (bridge === current) { bridge = undefined; failedTarget = undefined; schedule(); } };
  });
  for (const event of ['subagent/provider-added', 'subagent/provider-removed']) ctx.on(event, () => { failedTarget = undefined; schedule(); }, { global: true });
  schedule();
  await draining;
}
