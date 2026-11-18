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
  let branch, bridge = ctx.get('omd'), active = true, pending = false, draining;
  let replacing, failedTarget, deferredTarget, waiting;
  const owners = new Set(), retiring = new Map();
  const retire = owner => {
    if (!owners.has(owner)) return;
    let cleanup = retiring.get(owner);
    if (!cleanup) {
      cleanup = Promise.resolve().then(() => owner.dispose()).then(() => {
        owners.delete(owner); retiring.delete(owner);
      }, error => { retiring.set(owner, null); throw error; });
      retiring.set(owner, cleanup);
    }
    return cleanup;
  };
  const controller = { matches: owned, mode: 'native', error: null,
    get transition() {
      const wanted = target();
      if (deferredTarget && deferredTarget.bridge === bridge && deferredTarget.provider === ctx.subagents.getProvider('omd-workflow')) return { deferred: true, target: 'omd' };
      if (waiting && same(waiting.target, wanted)) return { target: wanted.mode, agents: liveAgents().filter(agent => agent.status === 'running').length, jobs: activeJobs().length,
        canDefer: branch?.mode === 'native' && wanted.mode === 'omd' };
      return null;
    },
    defer() {
      if (!controller.transition?.canDefer) throw Error('切换已开始或目标已变化，不能取消等待。');
      deferredTarget = waiting.target; schedule();
    },
    async retry() {
      if (!active) throw Error('工作流组件已停止');
      deferredTarget = undefined; failedTarget = undefined;
      await schedule();
      if (controller.mode === 'failed') throw Error(controller.error);
    } };
  const hub = ctx.omaa;
  ctx.effect(() => {
    hub.workflowControllers.add(controller);
    return async () => {
      active = false; waiting?.cancel.abort();
      controller.mode = 'closed';
      hub.workflowControllers.delete(controller);
      const results = await Promise.allSettled([...owners].map(retire));
      await draining;
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Workflow backend cleanup failed');
    };
  });
  const liveAgents = () => ctx.agents.list().filter(owned);
  const target = () => {
    const provider = ctx.subagents.getProvider('omd-workflow');
    if (typeof bridge?.omaaWorkflowComposition !== 'function' || !provider
      || deferredTarget?.bridge === bridge && deferredTarget?.provider === provider
      || failedTarget?.bridge === bridge && failedTarget?.provider === provider) return { mode: 'native' };
    return { mode: 'omd', bridge, provider };
  };
  const same = (a, b) => a?.mode === b.mode && a?.bridge === b.bridge && a?.provider === b.provider;
  const activeJobs = () => liveAgents().flatMap(agent => (ctx.get('jobs')?.list(agent.id) ?? []).filter(job => job.kind === 'workflow' && ['running', 'stopping'].includes(job.status)));
  const busyJobs = () => activeJobs().length > 0;

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
    owners.add(owner);
    try {
      await owner;
      if (!active) throw Error('工作流组件已停止');
      const engine = owner.ctx.get('workflowEngine');
      const schemas = ctx.tools.schemas(revision).filter(tool => tool.name === 'workflow');
      if (!engine || schemas.length !== 1 || wanted.mode === 'omd' && !schemas[0].parameters?.properties?.resumeFromRunId) {
        throw new Error('Workflow branch did not become available');
      }
      return { ...wanted, owner, engine };
    } catch (error) { await retire(owner); throw error; }
  }

  async function waitJobs(signal) {
    if (signal.aborted || !busyJobs()) return;
    await new Promise(resolve => {
      const jobs = ctx.get('jobs');
      const remove = jobs?.events.subscribe({ owners: 'scope' }, check);
      signal.addEventListener('abort', check, { once: true });
      function check() { if (signal.aborted || !active || !busyJobs()) { signal.removeEventListener('abort', check); remove?.(); resolve(); } }
      check();
    });
  }

  async function replace(wanted) {
    // whenIdle includes Pi maintenance. Reserve all announced agents without
    // yielding between reservations; queued input wakes after we release them.
    for (;;) {
      const cancel = new AbortController(); waiting = { target: wanted, cancel };
      try {
        const cancelled = new Promise(resolve => cancel.signal.addEventListener('abort', resolve, { once: true }));
        await Promise.race([Promise.all(liveAgents().map(agent => agent.whenIdle())), cancelled]);
        await waitJobs(cancel.signal);
        if (cancel.signal.aborted) return;
      } finally { waiting = undefined; cancel.abort(); }
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
        controller.error = null;
        while (active) {
          for (const owner of [...retiring.keys()]) await retire(owner);
          await retire(branch?.owner); branch = undefined;
          if (!active) return;
          const latest = target();
          try { branch = await mount(latest); }
          catch (error) {
            if (!active || latest.mode !== 'omd' || retiring.size) throw error;
            failedTarget = latest; controller.error = error.message;
            ctx.logger.warn('OMD workflow unavailable; retaining native OMAA workflow: %s', error);
            branch = await mount({ mode: 'native' });
          }
          // A provider may disappear while imports/apply are awaiting. Keep
          // the same reservations until the installed branch is still current.
          if (active && same(branch, target())) { controller.mode = branch.mode; break; }
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
    if (waiting && !same(waiting.target, target())) waiting.cancel.abort();
    if (draining || !active) return draining;
    draining = (async () => {
      while (active && pending) {
        pending = false;
        const wanted = target();
        if (controller.mode === 'failed' || !same(branch, wanted)) await replace(wanted);
      }
    })().catch(error => {
      if (active) { controller.mode = 'failed'; controller.error = error.message; }
      ctx.logger.error(error);
    }).finally(() => { draining = undefined; if (pending && active) schedule(); });
    return draining;
  }

  branch = await mount({ mode: 'native' });
  ctx.on('agent/created', async ({ agent }) => {
    if (!owned(agent)) return;
    // Gate only the actual replacement. Waiting for a busy parent while its
    // child is still being published would deadlock the native spawn path.
    await replacing?.promise;
  }, { global: true, prepend: true });
  ctx.inject(['omd'], scope => {
    const current = scope.omd;
    bridge = current; failedTarget = undefined; schedule();
    return () => { if (bridge === current) { bridge = undefined; failedTarget = undefined; schedule(); } };
  });
  for (const event of ['subagent/provider-added', 'subagent/provider-removed']) ctx.on(event, () => { failedTarget = undefined; schedule(); }, { global: true });
  ctx.on('app-boot/config-reload', () => { if (failedTarget || controller.mode === 'failed') { failedTarget = undefined; schedule(); } }, { global: true });
  schedule();
  await draining;
}
