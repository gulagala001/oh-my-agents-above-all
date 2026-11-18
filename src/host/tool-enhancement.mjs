const nativeTeamCommunication = new Set(['send_message', 'interrupt_agent', 'list_agents', 'wait_agent']);
const piDelegation = new Set(['workflow', 'subagent', 'subagent_fork', ...nativeTeamCommunication, 'job_list', 'job_output', 'job_kill']);

export function toolNeedsEnhancement(ctx, product, name, agent) {
  const enhanced = name === 'codegraph_index' || name.startsWith('mcp__codegraph__')
    || name === 'computer_use' || name === 'computer_use_reset' || product === 'pi' && piDelegation.has(name);
  return enhanced && !(nativeTeamCommunication.has(name) && agent && ctx.get('agentTeams')?.tryMembership?.(agent));
}
