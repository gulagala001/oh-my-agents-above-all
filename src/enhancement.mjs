export const inject = ['omaa', 'tools', 'systemPrompt'];
export function apply(ctx) {
  ctx.inject(['trisoulX'], async scope => {
    if (typeof scope.trisoulX.installOmaaEnhancement !== 'function') return;
    const enhanced = new Set(['codegraph_index', 'computer_use', 'computer_use_reset']);
    const isEnhanced = name => enhanced.has(name) || name.startsWith('mcp__codegraph__');
    scope.tools.guard(exec => isEnhanced(exec.name) && !scope.omaa.enhancementEnabled(exec.agent.session) ? 'OMD enhancement is disabled for this session.' : undefined);
    scope.on('system-prompt/assemble', async (_initial, context, next) => {
      const assembly = await next();
      if (context.agent && scope.omaa.enhancementEnabled(context.agent.session)) return assembly;
      return { ...assembly, tools: assembly.tools.filter(tool => !isEnhanced(tool.name)),
        sections: assembly.sections.filter(section => section.name !== 'trisoul-x:codegraph') };
    });
    for (const name of await scope.trisoulX.installOmaaEnhancement(scope)) enhanced.add(name);
  });
}
