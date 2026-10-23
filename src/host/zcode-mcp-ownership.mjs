import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { scopeOf, scopeChainOf } from '@deepseek-ai/dsh-scope';

const original = value => value?.[symbols.original] ?? value;
const copy = value => JSON.parse(JSON.stringify(value));
const message = error => { try { return String(error?.message ?? error).slice(0, 1024); } catch { return 'MCP ownership observation failed.'; } };
const MAX_OWNERS = 128, MAX_TOOLS = 256, MAX_SERVER_BYTES = 256 * 1024, MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const names = (value, limit = MAX_TOOLS) => Array.isArray(value) && value.length <= limit
  && value.every(name => typeof name === 'string' && name.length > 0 && name.length <= 64)
  && new Set(value).size === value.length;

// This schema describes an adapter-owned startup observation. It deliberately
// has no raw MCP name, live connection status, or claim of inventory completeness.
export const OWNED_MCP_SNAPSHOT_VERSION = 1;
export function installZCodeMcpOwnership(ctx) {
  const layers = new Map(), tombstones = new WeakMap(), activeRecords = new Set(), pending = new Set(), leases = new Set(), borrows = new Set();
  const globalKey = original(ctx.root), diagnostics = [];
  let closed = false, closePromise, unprovide;
  const track = work => {
    const result = Promise.resolve(work); pending.add(result);
    result.then(() => pending.delete(result), () => pending.delete(result)); return result;
  };
  const checkParent = parent => {
    const current = parent && ctx.agents.get(parent.id), key = parent?.ctx && scopeOf(parent.ctx);
    if (closed || !key || !current || scopeOf(current.ctx) !== key
      || original(current.session) !== original(parent.session) || original(ctx.sessions.get(parent.id)) !== original(parent.session)
      || ctx.get('omaa').product(parent.session)?.id !== 'zcode') throw Error('The exact live ZCode parent is unavailable.');
    return key;
  };
  const selected = parent => {
    const key = checkParent(parent), result = new Map();
    // Global first, then outer ancestors, then the exact parent layer.
    for (const layer of [undefined, ...scopeChainOf(key).reverse()]) {
      for (const [name, record] of tombstones.get(layer ?? globalKey) ?? []) result.set(name, record);
      for (const [name, record] of layers.get(layer) ?? []) result.set(name, record);
    }
    return result;
  };
  const snapshotFor = async (parent, serverNames) => {
    if (!names(serverNames, 64)) throw Error('Owned MCP server names must be an explicit unique list.');
    const visible = selected(parent), records = serverNames.map(name => {
      const record = visible.get(name);
      if (!record) throw Error('MCP server has no explicit owned composition: ' + name);
      return record;
    });
    await Promise.all(records.map(record => record.ready));
    const latest = selected(parent);
    if (records.some(record => latest.get(record.serverName) !== record)) throw Error('Owned MCP composition changed during startup capture.');
    return { records, snapshot: {
      version: OWNED_MCP_SNAPSHOT_VERSION, inventoryComplete: false,
      semantics: 'explicit owned-native composition; immutable initial startup outcome; native public tool names; live connection health is not inferred',
      statuses: Object.fromEntries(records.map(record => [record.serverName, {
        startupStatus: record.startup.status, disposed: record.closed,
        ...(record.startup.error ? { error: record.startup.error } : {}), toolCount: record.initialToolCount ?? record.initialTools.length,
      }])),
      tools: records.flatMap(record => record.initialTools.map(tool => copy(tool))),
    } };
  };
  const service = {
    diagnostics() { return copy(diagnostics); },
    reserve(context, serverName, registry) {
      if (closed || !/^[A-Za-z0-9_-]{1,32}$/.test(serverName) || typeof registry?.get !== 'function')
        throw Error('Owned MCP composition requires an available host, explicit native server name and exact original registry.');
      if (activeRecords.size >= MAX_OWNERS) throw Error('Owned MCP composition budget exhausted (128 active owners).');
      const key = scopeOf(context);
      let layer = layers.get(key);
      if (!layer) layers.set(key, layer = new Map());
      if (layer.get(serverName) && !layer.get(serverName).closed) throw Error('Owned MCP server name is already reserved in this scope.');
      let resolve;
      const record = { serverName, key, registry, closed: false, currentMetadataBytes: 0, startupMetadataBytes: 0, definitions: new Map(), borrows: new Set(), closePromise: undefined, initialTools: [], startup: undefined,
        ready: new Promise(done => { resolve = done; }) };
      layer.set(serverName, record); activeRecords.add(record);
      const descriptor = definition => {
        const value = { serverName, name: definition.name, description: definition.description ?? '',
          parameters: definition.parameters, outputSchema: definition.output.schema };
        if (!value.parameters || value.outputSchema === undefined) throw Error('Owned MCP descriptor lacks a native schema.');
        const json = JSON.stringify(value), bytes = Buffer.byteLength(json);
        if (bytes > MAX_SERVER_BYTES) throw Error('Owned MCP descriptor exceeds the 256 KiB server metadata budget.');
        return { value: JSON.parse(json), bytes };
      };
      const settle = (status, error) => {
        if (record.startup) return;
        // Build and validate all descriptors before publishing a terminal
        // outcome. Any extraction failure settles failed and ALWAYS wakes ready.
        let tools = [], bytes = 0;
        if (status === 'connected') {
          try {
            if (record.definitions.size > MAX_TOOLS) throw Error('Owned MCP startup exceeds 256 tools.');
            tools = [...record.definitions.values()].map(entry => {
              const data = descriptor(entry.definition); bytes += data.bytes; return data.value;
            });
            const otherBytes = [...activeRecords].reduce((total, value) => total + (value === record ? 0 : value.startupMetadataBytes), 0);
            if (bytes > MAX_SERVER_BYTES || bytes + otherBytes > MAX_TOTAL_BYTES)
              throw Error('Owned MCP startup metadata budget exhausted (256 KiB/server, 4 MiB/host).');
          } catch (cause) { status = 'failed'; error = cause; tools = []; bytes = 0; }
        }
        record.initialTools = tools; record.initialToolCount = tools.length; record.startupMetadataBytes = bytes;
        record.startup = Object.freeze({ status, ...(error === undefined ? {} : { error: message(error) }) });
        resolve();
        if (status === 'failed' && error !== undefined) return error;
      };
      const lease = {
        register(definition, register) {
          if (closed || record.closed) throw Error('Owned MCP registration scope is closed.');
          const data = descriptor(definition);
          const otherBytes = [...activeRecords].reduce((total, value) => total + value.currentMetadataBytes, 0);
          if (record.definitions.size >= MAX_TOOLS || record.currentMetadataBytes + data.bytes > MAX_SERVER_BYTES
            || otherBytes + data.bytes > MAX_TOTAL_BYTES) throw Error('Owned MCP tool-generation metadata budget exhausted.');
          const entry = { definition, bytes: data.bytes, token: Symbol('owned-mcp-generation') };
          // The original traced registry owns validation, policy and effects.
          // Only successful registrations acquire provenance in this catalogue.
          const dispose = register(definition);
          record.definitions.set(definition.name, entry); record.currentMetadataBytes += entry.bytes;
          let disposed = false;
          return () => {
            if (disposed) return;
            disposed = true;
            if (record.definitions.get(definition.name) === entry) { record.definitions.delete(definition.name); record.currentMetadataBytes -= entry.bytes; }
            return dispose();
          };
        },
        startupSucceeded() { const error = settle('connected'); if (error) throw error; },
        startupFailed(error) { settle('failed', error); },
        close() {
          if (record.closePromise) return record.closePromise;
          record.closed = true; record.definitions.clear(); record.currentMetadataBytes = 0;
          settle('unresolved', Error('Owned composition closed before startup settled.'));
          leases.delete(lease); activeRecords.delete(record);
          if (layer.get(serverName) === record) { layer.delete(serverName); if (!layer.size) layers.delete(key); }
          const tombstone = { serverName, closed: true, startup: record.startup, initialTools: [],
            initialToolCount: record.initialToolCount, ready: Promise.resolve() };
          const tombstoneKey = key ?? globalKey;
          let retired = tombstones.get(tombstoneKey);
          if (!retired) tombstones.set(tombstoneKey, retired = new Map());
          retired.delete(serverName); retired.set(serverName, tombstone);
          while (retired.size > 16) retired.delete(retired.keys().next().value);
          diagnostics.push({ serverName, startupStatus: record.startup.status, error: record.startup.error,
            toolCount: record.initialToolCount, disposed: true });
          if (diagnostics.length > 64) diagnostics.shift();
          record.initialTools = []; record.startupMetadataBytes = 0;
          return record.closePromise = (async () => {
            const results = await Promise.allSettled([...record.borrows].map(closeBorrow => closeBorrow()));
            const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
            if (errors.length) throw new AggregateError(errors, 'Owned MCP borrowed calls failed to drain.');
          })();
        },
      };
      leases.add(lease); return lease;
    },
    async snapshot(parent, serverNames) {
      return track(snapshotFor(parent, serverNames).then(value => copy(value.snapshot)));
    },
    // Explicit narrow subset, not profile inheritance: every inherited tool
    // is masked except the selected owned names. Unknown/arbitrary MCP tools
    // therefore cannot leak through an incomplete ownership inventory.
    async borrowOwnedOnly(parent, child, { serverNames, toolNames } = {}) {
      return track((async () => {
        if (!names(toolNames)) throw Error('Borrowing requires an explicit unique native-public tool-name allowlist.');
        const captured = await snapshotFor(parent, serverNames), parentKey = checkParent(parent);
        if (captured.records.some(record => record.closed || record.startup.status !== 'connected'))
          throw Error('An explicitly selected owned MCP server did not have a successful live-owner startup.');
        const childKey = child?.ctx && scopeOf(child.ctx), session = original(child?.session), parentSession = original(parent.session);
        const checkChild = exec => {
          checkParent(parent);
          const live = child && ctx.agents.get(child.id);
          if (closed || stopped || !childKey || !live || scopeOf(live.ctx) !== childKey || original(live.session) !== session
            || original(ctx.sessions.get(child.id)) !== session || session.header.origin !== 'subagent'
            || session.header.parentSession !== parent.id || session.header.cwd !== parentSession.header.cwd
            || ctx.get('omaa').product(session)?.id !== 'zcode' || scopeOf(parent.ctx) !== parentKey
            || exec && ((!exec.agent?.ctx || scopeOf(exec.agent.ctx) !== childKey) || original(exec.agent?.session) !== session))
            throw Error('Borrowed MCP execution requires its exact live direct child and original parent.');
          exec?.signal.throwIfAborted();
        };
        let stopped = false, closing;
        const disposers = [], filters = [], calls = new Set(), controls = new Set(), definitions = new Map();
        const initial = new Map(captured.records.flatMap(record => record.initialTools.map(tool => [tool.name, { record, tool }])));
        for (const name of toolNames) if (!initial.has(name)) throw Error('Tool is absent from the selected owned startup snapshot: ' + name);
        const closeBorrow = () => closing ??= (async () => {
          stopped = true;
          for (const control of controls) control.abort(Error('Borrowed MCP child access closed.'));
          const errors = [];
          for (const result of await Promise.allSettled(disposers.splice(0).map(dispose => Promise.resolve().then(() => dispose()))))
            if (result.status === 'rejected') errors.push(result.reason);
          while (calls.size) await Promise.allSettled([...calls]);
          borrows.delete(closeBorrow);
          for (const record of captured.records) record.borrows.delete(closeBorrow);
          if (errors.length) throw new AggregateError(errors, 'Borrowed MCP child registration cleanup failed.');
        })();
        try {
          checkChild();
          const registry = child.ctx.tools;
          const visible = new Set(registry.schemas(childKey).map(tool => tool.name));
          if (toolNames.some(name => !visible.has(name))) throw Error('Borrowing cannot add a tool absent from the child’s current native authority.');
          filters.push(registry.restrict({ allow: toolNames }));
          filters.push(registry.guard(exec => {
            if (stopped || closed) return 'Borrowed MCP child access is closed.';
            // The reserved PTC transport retains its native mode contract;
            // each SDK sub-dispatch still passes this capability guard.
            if (exec.name === 'run_code') return;
            if (!toolNames.includes(exec.name) || original(registry.get(exec.name, childKey)) !== original(definitions.get(exec.name)))
              return 'This explicit owned-MCP-only child grant denies every other tool registration.';
          }));
          for (const name of toolNames) {
            const { record, tool } = initial.get(name), executions = new WeakMap();
            const boundEntry = record.definitions.get(name);
            const resolve = exec => {
              checkChild(exec);
              const entry = record.definitions.get(name);
              if (record.closed || !entry || entry !== boundEntry || original(record.registry.get(name, parentKey)) !== original(entry.definition))
                throw Error('The exact borrowed parent MCP registration generation changed, disappeared or was shadowed; explicit rebinding is required.');
              if (entry.definition.description !== tool.description || !isDeepStrictEqual(copy(entry.definition.parameters), tool.parameters)
                || !isDeepStrictEqual(copy(entry.definition.output.schema), tool.outputSchema))
                throw Error('The parent MCP schema changed after the frozen startup snapshot; a new explicit borrow is required.');
              return entry.definition;
            };
            const currentDefinition = record.definitions.get(name)?.definition;
            if (!currentDefinition) throw Error('The native MCP generation disappeared during child preparation.');
            // Fixed native createMcpToolDefinition returns a plain object.
            // Keep its entire definition, including any safety/presentation
            // fields; only the borrowed boundary methods are replaced below.
            const definition = {
              ...currentDefinition,
              name, description: tool.description, parameters: copy(tool.parameters),
              output: { ...record.definitions.get(name)?.definition.output, schema: copy(tool.outputSchema) },
              execute(args, exec) {
                const active = resolve(exec), control = new AbortController(); controls.add(control);
                const innerExec = { ...exec, signal: AbortSignal.any([exec.signal, control.signal]),
                  deferContext: exec.deferContext.bind(exec), concludeTurn: exec.concludeTurn.bind(exec) };
                executions.set(exec, { active, innerExec });
                const work = Promise.resolve().then(() => { checkChild(exec); innerExec.signal.throwIfAborted(); return active.execute(args, innerExec); });
                calls.add(work);
                const done = () => { calls.delete(work); controls.delete(control); };
                work.then(done, done); return work;
              },
              projectContent(exec, result) { const entry = executions.get(exec); return entry?.active.projectContent?.(entry.innerExec, result); },
              finalizeContent(exec, result) {
                const entry = executions.get(exec); executions.delete(exec); return entry?.active.finalizeContent?.(entry.innerExec, result);
              },
            };
            if (typeof definition.output.render !== 'function') throw Error('The current native MCP output renderer is unavailable.');
            definitions.set(name, definition); disposers.push(registry.register(definition));
          }
          borrows.add(closeBorrow);
          for (const record of captured.records) record.borrows.add(closeBorrow);
          // This child close only removes child registrations. The native
          // client plugin and its reconnect/transport lifecycle remain parent-owned.
          child.ctx.effect(function* () {
            for (const dispose of [...disposers, ...filters]) yield dispose;
            return async () => {
              const errors = [];
              try { await closeBorrow(); } catch (error) { errors.push(error); }
              for (const result of await Promise.allSettled(filters.splice(0).map(dispose => Promise.resolve().then(() => dispose()))))
                if (result.status === 'rejected') errors.push(result.reason);
              if (errors.length) throw new AggregateError(errors, 'Borrowed MCP child scope cleanup failed.');
            };
          });
          checkChild();
          return { snapshot: copy(captured.snapshot), close: closeBorrow };
        } catch (error) {
          const errors = [error];
          try { await closeBorrow(); } catch (cleanup) { errors.push(cleanup); }
          for (const result of await Promise.allSettled(filters.splice(0).map(dispose => Promise.resolve().then(() => dispose()))))
            if (result.status === 'rejected') errors.push(result.reason);
          if (errors.length > 1) throw new AggregateError(errors, 'Owned MCP child preparation failed and its cleanup was not confirmed.');
          throw error;
        }
      })());
    },
  };
  const close = () => closePromise ??= (async () => {
    closed = true;
    const errors = [];
    for (const result of await Promise.allSettled([...leases].map(lease => lease.close())))
      if (result.status === 'rejected') errors.push(result.reason);
    for (const result of await Promise.allSettled([...borrows].map(closeBorrow => closeBorrow())))
      if (result.status === 'rejected') errors.push(result.reason);
    while (pending.size) await Promise.allSettled([...pending]);
    try { await unprovide?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Owned MCP ownership service cleanup failed.');
  })();
  try {
    unprovide = ctx.provide('omaaZCodeMcpOwnership', service);
    ctx.effect(function* () { yield unprovide; return close; });
    return service;
  } catch (error) { void close().catch(() => {}); throw error; }
}
