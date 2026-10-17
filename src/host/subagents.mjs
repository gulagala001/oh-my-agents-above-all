import { randomUUID } from 'node:crypto';
import * as sessionSdk from '@deepseek-ai/dsh-session';

const personaRecord = 'plugin:omaa/zcode-actor-persona';
export function actorPersona(events) {
  const descriptor = events.find(event => event.type === 'subagent/descriptor')?.data;
  const record = events.find(event => event.type === personaRecord && event.ignorable === true)?.data;
  return typeof record?.persona === 'string' ? record.persona : descriptor?.persona;
}

// Native managers retain admission, descendants, delivery and cold activation.
// alpha.3 removed creation-time persona; an owned, ignorable record restores it
// through the same literal prompt hook on the first request and cold resume.
export async function startActivation(ctx, spec) {
  if (typeof ctx.subagents.startActivation === 'function') {
    const { persona, toolFilter, ...request } = spec.request;
    if (toolFilter !== undefined) throw new Error('This host requires an independent preset for child tool restrictions.');
    if (persona === undefined) return ctx.subagents.startActivation({ ...spec, request });
    if (typeof sessionSdk.appendPluginRecord !== 'function') throw new Error('The host cannot persist an Actor persona.');
    const childId = spec.childId ?? randomUUID();
    const remove = ctx.on('agent/created', ({ agent }) => {
      if (agent.id === childId && agent.session.header.parentSession === request.parent.id) {
        sessionSdk.appendPluginRecord(agent.session, personaRecord, { persona });
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
