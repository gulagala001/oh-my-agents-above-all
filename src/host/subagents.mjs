import { randomUUID } from 'node:crypto';
import * as sessionSdk from '@deepseek-ai/dsh-session';

const personaRecord = 'plugin:omaa/zcode-actor-persona';
export function actorPersona(events) {
  const descriptor = events.find(event => event.type === 'subagent/descriptor')?.data;
  const record = events.find(event => event.type === personaRecord && event.ignorable === true)?.data;
  return typeof record?.persona === 'string' ? record.persona : descriptor?.persona;
}

// rc.2 keeps the native child lifecycle and exposes restrictions on the child
// scope. Persist the optional override beside the persona so cold activation
// applies the same restriction before accepting any work.
export function installSubagentOverrides(ctx) {
  return ctx.on('agent/created', ({ agent }) => {
    if (agent.session.header.origin !== 'subagent') return;
    const events = agent.session.snapshotEvents(agent.session.inheritedEventCount);
    const record = events.find(event => event.type === personaRecord && event.ignorable === true)?.data;
    if (record?.toolFilter !== undefined) {
      const filter = checkedToolFilter(record.toolFilter);
      const tools = agent.ctx.get('tools');
      // Some parent capabilities (notably delegation) are absent in children.
      // Native restrict() rejects unknown names; retain the full rule in a
      // scoped guard so a later registration cannot escape the durable deny.
      const available = Object.fromEntries(Object.entries(filter).map(([key, values]) => [key, values.filter(name => name !== 'run_code' && tools.get(name, agent))]));
      if (available.allow !== undefined || available.deny?.length) tools.restrict(available);
      tools.guard(exec => {
        if (exec.name === 'run_code') return; // Native PTC checks every end capability.
        if (filter.deny?.includes(exec.name) || filter.allow && !filter.allow.includes(exec.name))
          return 'This tool is outside the child profile restriction.';
      });
    }
  }, { global: true, prepend: true });
}

function checkedToolFilter(filter) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)
    || !Object.keys(filter).length || Object.keys(filter).some(key => !['allow', 'deny'].includes(key))
    || Object.values(filter).some(names => !Array.isArray(names) || names.some(name => typeof name !== 'string' || !name)))
    throw Error('A child tool restriction requires explicit allow or deny tool names.');
  return structuredClone(filter);
}

// Native managers retain admission, descendants, delivery and cold activation.
// alpha.3 removed creation-time persona; an owned, ignorable record restores it
// through the same literal prompt hook on the first request and cold resume.
export async function startActivation(ctx, spec) {
  const originalRequest = spec.request;
  const agentOptions = originalRequest && ctx.get('omaaOutputLimits')?.inheritOptions(originalRequest.parent, originalRequest.agentOptions);
  if (agentOptions !== undefined && agentOptions !== originalRequest.agentOptions) spec = { ...spec, request: { ...originalRequest, agentOptions } };
  if (typeof ctx.subagents.startActivation === 'function') {
    const { persona, toolFilter, ...request } = spec.request;
    const restriction = toolFilter === undefined ? undefined : checkedToolFilter(toolFilter);
    if (persona === undefined && restriction === undefined) return ctx.subagents.startActivation({ ...spec, request });
    if (typeof sessionSdk.appendPluginRecord !== 'function') throw new Error('The host cannot persist an Actor persona.');
    const childId = spec.childId ?? randomUUID();
    const remove = ctx.on('agent/created', ({ agent }) => {
      if (agent.id === childId && agent.session.header.parentSession === request.parent.id) {
        sessionSdk.appendPluginRecord(agent.session, personaRecord, {
          ...(persona === undefined ? {} : { persona }),
          ...(restriction === undefined ? {} : { toolFilter: restriction }),
        });
      }
    }, { global: true, prepend: true });
    try { return await ctx.subagents.startActivation({ ...spec, childId, request }); }
    finally { remove(); }
  }
  const { delivery: _delivery, request: original, ...continuable } = spec;
  const { cwd: _cwd, ...request } = original;
  return ctx.subagents.startContinuable({ ...continuable, request });
}
export const drainChildren = (ctx, parent, ids) => typeof ctx.subagents.drainChildren === 'function'
  ? ctx.subagents.drainChildren(parent, ids) : ctx.subagents.drainContinuableChildren(parent, ids);
