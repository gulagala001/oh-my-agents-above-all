// Fixed aac4755 TodoRead / RespondToCoordinator cores over native DSH state
// and adjacency. No second todo store, parent routing input or final-result
// substitution. Native todo items have no priority; do not manufacture one.
const TODO_BYTES = 100_000;
const statuses = new Set(['pending', 'in_progress', 'completed']);
const continuation = 'Continue the current task unless the coordinator explicitly changed or ended it. This response is not the final task result.';
const emptyInput = { type: 'object', properties: {}, additionalProperties: false };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactOwner(ctx, agent) {
  return Boolean(agent && ctx.get('agents')?.get(agent.id) === agent
    && ctx.get('sessions')?.get(agent.id) === agent.session && ctx.omaa.product(agent.session)?.id === 'zcode');
}

/** Candidate visibility only; native sendMessage still authorizes residency. */
export function isCoordinatorChild(ctx, agent) {
  if (!exactOwner(ctx, agent) || agent.session.header.origin !== 'subagent') return false;
  const parentId = agent.session.header.parentSession;
  if (typeof parentId !== 'string' || !parentId || parentId === agent.id) return false;
  const parent = ctx.get('agents')?.get(parentId);
  return Boolean(parent && ctx.get('sessions')?.get(parentId) === parent.session);
}

/** Permit these exact session-local operations in Ask/Plan, never send_message. */
export function isZCodeNativeSessionToolAllowed(ctx, exec) {
  if (exec.signal?.aborted || !exactOwner(ctx, exec.agent)) return false;
  return exec.name === 'todo_read' || exec.name === 'respond_to_coordinator' && isCoordinatorChild(ctx, exec.agent);
}

function ownerSnapshot(ctx, exec, coordinator = false) {
  exec.signal.throwIfAborted();
  if (!exactOwner(ctx, exec.agent) || coordinator && !isCoordinatorChild(ctx, exec.agent))
    throw Error('This tool requires its exact live ZCode owner and, for a coordinator response, a live direct parent.');
  const agent = exec.agent, session = agent.session, product = ctx.omaa.product(session);
  const mode = ctx.omaa.modeFor(session, agent), preset = product.preset;
  const parentId = coordinator ? session.header.parentSession : undefined;
  const parent = coordinator ? ctx.get('agents').get(parentId) : undefined;
  return {
    agent, parentId,
    check() {
      exec.signal.throwIfAborted();
      if (!exactOwner(ctx, agent) || agent.session !== session || ctx.omaa.product(session)?.preset !== preset
        || ctx.omaa.modeFor(session, agent) !== mode || coordinator && (session.header.parentSession !== parentId
          || ctx.get('agents')?.get(parentId) !== parent || ctx.get('sessions')?.get(parentId) !== parent.session))
        throw Error('The native session-tool owner, preset, mode or direct parent changed during the call.');
    },
  };
}

function coordinatorInput(args) {
  if (!object(args) || Object.keys(args).some(key => !['summary', 'message'].includes(key))
    || typeof args.summary !== 'string' || args.summary.length < 1 || args.summary.length > 200
    || typeof args.message !== 'string' || args.message.length < 1 || args.message.length > 20_000)
    throw Error('Provide summary (1–200 characters) and message (1–20000 characters), without a recipient field.');
}

export function installZCodeNativeSessionTools(ctx) {
  // Native register() owns exact-layer duplicate checks. A global or inherited
  // definition may legitimately be shadowed by this preset's scoped tools.
  ctx.tools.register({
    name: 'todo_read',
    description: 'Read this Agent session’s actual native todo projection. Native todo_write replaces the whole list; turn/start resets it to null, while turn/end keeps it visible. Null means no current native list, not a recovered persistent checklist. Items have content/status and no priority. This reads no other session or archived list.',
    parameters: emptyInput,
    output: {
      schema: { type: 'object', properties: { todos: { oneOf: [{ type: 'null' }, { type: 'array', items: {
        type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: [...statuses] } },
        required: ['content', 'status'], additionalProperties: false,
      } }] } }, required: ['todos'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: 'Native todo projection (reset at turn/start):\n' + JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!object(args) || Object.keys(args).length) throw Error('todo_read accepts an empty object.');
      const owner = ownerSnapshot(ctx, exec);
      const projections = ctx.get('sessionProjections');
      if (!projections?.stateOf) throw Error('The native session projection service is unavailable.');
      const value = projections.stateOf(owner.agent.session, 'todos');
      if (value !== null && (!Array.isArray(value) || value.some(item => !object(item)
        || Object.keys(item).some(key => !['content', 'status'].includes(key))
        || typeof item.content !== 'string' || !statuses.has(item.status))))
        throw Error('The native todo projection is unavailable or has an unsupported shape.');
      const result = { todos: structuredClone(value) };
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > TODO_BYTES)
        throw Error('The native todo list exceeds the 100000-byte response bound; no partial list was returned.');
      owner.check();
      return result;
    },
  });

  const receipts = new Map();
  ctx.tools.register({
    name: 'respond_to_coordinator',
    description: 'Queue a concise response or progress update for your own direct parent coordinator. Available only to a live resident continuable child; native authorization decides. Supply summary and message, never a recipient. A queued receipt confirms inbox admission, not that the parent processed it. If acceptance is unknown, do not automatically resend. ' + continuation,
    parameters: { type: 'object', properties: {
      summary: { type: 'string', minLength: 1, maxLength: 200 }, message: { type: 'string', minLength: 1, maxLength: 20_000 },
    }, required: ['summary', 'message'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { status: { type: 'string', const: 'queued' }, messageId: { type: 'string' },
        parentSessionId: { type: 'string' }, message: { type: 'string' } },
      required: ['status', 'messageId', 'parentSessionId', 'message'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    // The native registry can replace a body success on late cancellation or
    // post-execute rejection. Preserve the physical receipt as an extra fact,
    // while keeping that authoritative isError and its original content.
    finalizeContent(exec, result) {
      const receipt = receipts.get(exec.token); receipts.delete(exec.token);
      if (!receipt || !result.isError) return undefined;
      return [...result.content, { type: 'text', text: 'Native coordinator response receipt: ' + JSON.stringify(receipt)
        + '. Do not automatically resend. ' + continuation }];
    },
    async execute(args, exec) {
      coordinatorInput(args);
      const owner = ownerSnapshot(ctx, exec, true);
      if (typeof ctx.get('subagents')?.sendMessage !== 'function') throw Error('Native adjacent-Agent messaging is unavailable.');
      owner.check();
      receipts.set(exec.token, { status: 'unknown', parentSessionId: owner.parentId });
      let messageId;
      try {
        messageId = await ctx.get('subagents').sendMessage(owner.agent, owner.parentId,
          [{ type: 'text', text: args.summary + '\n\n' + args.message }], { signal: exec.signal });
      } catch (error) {
        // No returned id proves neither admission nor non-admission. In
        // particular, cancellation is never a safe automatic-retry receipt.
        throw Object.assign(Error('Native coordinator response acceptance is unknown. Do not automatically resend; inspect the parent conversation before continuing.',
          { cause: error }), { code: 'uncertain_effect' });
      }
      if (typeof messageId !== 'string' || !messageId)
        throw Object.assign(Error('Native coordinator response returned no valid acceptance id. Do not automatically resend.'), { code: 'uncertain_effect' });
      const result = { status: 'queued', messageId, parentSessionId: owner.parentId,
        message: 'The native parent inbox accepted this response. ' + continuation };
      receipts.set(exec.token, result);
      try { owner.check(); }
      catch (error) {
        throw Object.assign(Error('The coordinator response was queued, but its caller state changed before returning the receipt. Do not resend.',
          { cause: error }), { code: 'uncertain_effect' });
      }
      return result;
    },
  });
}
