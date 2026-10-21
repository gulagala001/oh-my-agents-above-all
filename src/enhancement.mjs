import { scopeBinding } from './workflow-controller.mjs';
export const inject = ['loader', 'omaa', 'tools', 'systemPrompt'];
export function apply(ctx) {
  ctx.inject(['omd'], async scope => {
    if (typeof scope.omd.installOmaaEnhancement !== 'function') return;
    let ready = false;
    const owner = scope.plugin({ name: 'omaa-optional-enhancement', async apply(scope) {
    const enhanced = new Set(['codegraph_index', 'computer_use', 'computer_use_reset']);
    const isEnhanced = name => enhanced.has(name) || name.startsWith('mcp__codegraph__');
    scope.tools.guard(exec => isEnhanced(exec.name) && !scope.omaa.enhancementEnabled(exec.agent.session) ? 'OMD enhancement is disabled for this session.' : undefined);
    scope.on('system-prompt/assemble', async (_initial, context, next) => {
      const assembly = await next();
      if (context.agent && scope.omaa.enhancementEnabled(context.agent.session)) return assembly;
      return { ...assembly, tools: assembly.tools.filter(tool => !isEnhanced(tool.name)),
        sections: assembly.sections.filter(section => section.name !== 'oh-my-dsh:codegraph') };
    });
    for (const name of await scope.omd.installOmaaEnhancement(scope)) enhanced.add(name);
    const { matches } = await scopeBinding(scope);
    const hub = scope.omaa;
    scope.effect(() => { hub.enhancementScopes.add(matches); return () => hub.enhancementScopes.delete(matches); });
    ready = true;
    } });
    try {
      await owner;
      if (!ready) throw new Error('Optional OMD enhancement did not become available');
    } catch (error) {
      await owner.dispose();
      ctx.logger.warn('Optional OMD enhancement unavailable; base OMAA presets remain active: %s', error);
    }
  });
}
