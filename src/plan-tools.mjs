export const inject = ['planMode', 'tools'];
export function apply(ctx) {
  ctx.tools.register({ name: 'enter_plan_mode', description: 'Enter plan mode to research and design an implementation before presenting it for review. This changes the logged session mode; implementation begins only after leaving plan mode.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute(_args, { agent }) { const status = ctx.planMode.set(agent, true); return `Plan mode ${status}; continue research in the next step.`; },
  });
}
