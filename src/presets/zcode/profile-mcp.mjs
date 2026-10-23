import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
import { actorPersona, actorToolFilter } from '../../host/subagents.mjs';

const RECORD = 'plugin:omaa/zcode/profile-mcp-admission';
const native = value => value?.[symbols.original] ?? value;
const claims = provider => typeof provider === 'string' && /^omaa-zcode-profile-(?:snapshot-agents|no-agents)-(?:plan-)?(?:skills-)?mcp-/.test(provider);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MAX_BYTES = 512 * 1024;

// A profile borrows the parent's native client. Persist only public schemas and
// a declaration digest; no endpoint, credential, transport or second connection.
// Native descriptor/lineage and the durable restriction bind cold re-admission.
export function installZCodeProfileMcp(ctx) {
  const reservations = new Map(), tickets = new WeakSet(), admissions = new WeakMap(), pending = new Set(), disposers = [];
  const shutdown = new AbortController();
  let closed = false, closing;
  const owner = (agent, signal) => {
    signal.throwIfAborted(); shutdown.signal.throwIfAborted();
    const live = agent && ctx.get('agents')?.get(agent.id);
    if (closed || !live || scopeOf(live.ctx) !== scopeOf(agent.ctx) || native(live.session) !== native(agent.session)
      || native(ctx.get('sessions')?.get(agent.id)) !== native(agent.session) || ctx.omaa.product(agent.session)?.id !== 'zcode')
      throw Error('The profile MCP owner is no longer the exact live ZCode Agent.');
  };
  const snapshot = async (parent, names, signal) => {
    owner(parent, signal);
    const value = await ctx.omaaZCodeMcpOwnership.snapshot(parent, names);
    owner(parent, signal);
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES - 8192
      || Object.values(value.statuses).some(status => status.disposed || status.startupStatus !== 'connected'
        || !/^[a-f0-9]{64}$/.test(status.declarationSha256)))
      throw Error('Selected profile MCP servers require bounded, successfully started owned declarations.');
    return value;
  };
  const service = {
    async prepare(parent, serverNames, signal) {
      serverNames ??= ctx.omaaZCodeMcpOwnership.serverNames(parent);
      const ticket = { parent: native(parent), session: native(parent.session), serverNames: [...serverNames],
        snapshot: await snapshot(parent, serverNames, signal) };
      tickets.add(ticket); return ticket;
    },
    reserve(exec, { ticket, filter, childId, provider, persona }, signal, check) {
      owner(exec.agent, signal); check();
      if (!tickets.has(ticket) || ticket.parent !== native(exec.agent) || ticket.session !== native(exec.agent.session)
        || !claims(provider) || reservations.has(childId) || reservations.size >= 128 || !Array.isArray(filter.allow))
        throw Error('The profile MCP launch has no unique owned admission ticket.');
      tickets.delete(ticket);
      const done = Promise.withResolvers();
      const reservation = { ticket, filter: structuredClone(filter), provider, personaSha256: sha(persona), signal, check, done, entered: false };
      reservations.set(childId, reservation);
      return () => { if (reservations.get(childId) === reservation) reservations.delete(childId); done.resolve(); };
    },
    close() {
      if (closing) return closing;
      closed = true; shutdown.abort(Error('Profile MCP admission closed.'));
      return closing = (async () => {
        while (reservations.size) await Promise.allSettled([...reservations.values()].map(value => value.done.promise));
        while (pending.size) await Promise.allSettled([...pending]);
        const errors = [];
        for (const dispose of disposers.splice(0).reverse()) try { await dispose(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Profile MCP admission cleanup failed.');
      })();
    },
  };
  async function created({ agent, source, signal }) {
    if (agent.session.header.origin !== 'subagent') return;
    const events = agent.session.snapshotEvents(agent.session.inheritedEventCount);
    const descriptors = events.filter(event => event.type === 'subagent/descriptor');
    const descriptor = descriptors[0]?.data;
    if (!claims(descriptor?.provider)) {
      if (reservations.has(agent.id)) throw Error('Reserved MCP child has no matching descriptor.');
      return;
    }
    const fused = AbortSignal.any([shutdown.signal, ...(signal ? [signal] : [])]);
    owner(agent, fused);
    const parent = ctx.agents.get(agent.session.header.parentSession);
    owner(parent, fused);
    if (descriptors.length !== 1 || descriptor.mode !== 'continuable' || !descriptor.label?.startsWith('ZCode Profile · ')
      || agent.session.header.cwd !== parent.session.header.cwd || !ctx.agents.isOwnedBy(agent.id, parent)
      || events.length > 100000) throw Error('MCP child lineage or its own descriptor cannot be proven.');
    const filter = actorToolFilter(events), personaSha256 = sha(actorPersona(events));
    const proofIdentity = { version: 1, childId: agent.id, parentSessionId: parent.id, workspace: agent.session.header.cwd,
      provider: descriptor.provider, descriptorSha256: sha(descriptor), descriptorSeq: descriptors[0].seq, personaSha256, filter };
    const proofs = events.flatMap(event => { const record = pluginRecordOf(event); return record?.type === RECORD ? [{ event, value: record.data }] : []; });
    const reservation = reservations.get(agent.id);
    let proof;
    if (source === 'startup') {
      if (!reservation || reservation.entered || proofs.length || events.some(event => ['turn/start', 'request/header'].includes(event.type)))
        throw Error('Fresh MCP child requires a unique reservation before any work.');
      reservation.entered = true;
      reservation.check(); reservation.signal.throwIfAborted();
      if (reservation.ticket.parent !== native(parent) || reservation.ticket.session !== native(parent.session)
        || reservation.provider !== descriptor.provider || reservation.personaSha256 !== personaSha256 || !isDeepStrictEqual(reservation.filter, filter))
        throw Error('The native MCP child disagrees with its reserved profile.');
      proof = { ...proofIdentity, serverNames: reservation.ticket.serverNames, snapshot: reservation.ticket.snapshot };
    } else if (['resume', 'clear', 'compact'].includes(source)) {
      if (proofs.length !== 1) throw Error('The MCP profile cannot resume without its unique durable admission.');
      const { event, value } = proofs[0];
      const { serverNames, snapshot: captured, ...identity } = value ?? {};
      if (!isDeepStrictEqual(identity, proofIdentity) || !Array.isArray(serverNames) || !captured
        || event.seq <= descriptors[0].seq || events.some(row => row.seq < event.seq && ['turn/start', 'request/header'].includes(row.type)))
        throw Error('The frozen profile MCP admission no longer matches its native descriptor and restriction.');
      proof = value;
    } else throw Error('Unknown profile MCP creation source.');
    if (Buffer.byteLength(JSON.stringify(proof)) > MAX_BYTES || !Array.isArray(filter?.allow))
      throw Error('The frozen profile MCP proof exceeds its bound or lacks an explicit tool filter.');
    const current = await snapshot(parent, proof.serverNames, fused);
    owner(agent, fused);
    if (!isDeepStrictEqual(current, proof.snapshot)) throw Error('The owned MCP declaration or startup schemas changed; profile continuation is refused.');
    const selected = new Set(proof.snapshot.tools.map(tool => tool.name));
    const toolNames = filter.allow.filter(name => selected.has(name));
    const nativeToolNames = filter.allow.filter(name => !name.startsWith('mcp__'));
    if (filter.allow.length !== toolNames.length + nativeToolNames.length) throw Error('Profile restriction refers to unproven MCP tools.');
    const borrowed = await ctx.omaaZCodeMcpOwnership.borrowOwnedOnly(parent, agent, {
      serverNames: proof.serverNames, toolNames, nativeToolNames, expectedSnapshot: proof.snapshot,
    });
    try {
      owner(parent, fused); owner(agent, fused);
      if (source === 'startup') {
        reservation.check(); reservation.signal.throwIfAborted();
        appendPluginRecord(native(agent.session), RECORD, proof);
        if (await agent.ctx.sessions.flush(native(agent.session)) !== true) throw Error('Profile MCP admission has no durable flush acknowledgement.');
        reservation.check(); reservation.signal.throwIfAborted();
      }
      owner(agent, fused);
      admissions.set(native(agent), { parent, serverNames: new Set(proof.serverNames) });
      agent.ctx.effect(() => () => admissions.delete(native(agent)));
    } catch (error) { await borrowed.close(); throw error; }
  }
  const track = work => { pending.add(work); work.then(() => pending.delete(work), () => pending.delete(work)); return work; };
  disposers.push(ctx.on('agent/created', info => track(created(info)), { global: true, prepend: true }));
  disposers.push(ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const assembly = await next(), agent = context.agent;
    const admission = agent && admissions.get(native(agent));
    if (!admission) return assembly;
    owner(agent, context.signal); owner(admission.parent, context.signal);
    // Native server instructions follow their declared server scope too.
    // Never carry an unselected/global server's instructions into this child.
    return { ...assembly, sections: assembly.sections.filter(section => !section.name.startsWith('mcp:')
      || admission.serverNames.has(section.name.slice(4))) };
  }, { global: true }));
  disposers.push(ctx.provide('omaaZcodeProfileMcp', service));
  ctx.effect(function* () { for (const dispose of disposers) yield dispose; return () => service.close(); });
  return service;
}
