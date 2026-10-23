import { createHash } from 'node:crypto';
import * as nativeMcp from '@deepseek-ai/dsh-mcp-client';

// Explicit opt-in composition only. This plugin owns ONE native MCP instance;
// it never discovers/replaces another instance or opens an extra connection.
export const name = 'omaa-zcode-owned-mcp-client';
export const inject = ['tools', 'omaaZCodeMcpOwnership'];
export const Config = nativeMcp.Config;

export async function apply(ctx, config) {
  const registry = ctx.tools, ownership = ctx.omaaZCodeMcpOwnership;
  // Persist only the digest, never server credentials or process environment.
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const declarationSha256 = createHash('sha256').update(JSON.stringify(canonical(config))).digest('hex');
  const lease = ownership.reserve(ctx, config.serverName, registry, declarationSha256);
  let unprovide, closing;
  const close = () => closing ??= (async () => {
    // This catalogue close revokes borrowed access. Native apply's own
    // connection effect remains the sole transport/reconnect lifecycle owner.
    const errors = [];
    try { await lease.close(); } catch (error) { errors.push(error); }
    try { await unprovide?.(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Owned native MCP wrapper cleanup failed.');
  })();
  try {
    const inner = ctx.isolate('tools');
    const register = definition => lease.register(definition, value => registry.register(value));
    // Forward every other operation through its original traced receiver;
    // object spread would discard the native registry's prototype methods.
    const facade = new Proxy(Object.create(null), {
      get(_target, key) {
        if (key === 'register') return register;
        const value = Reflect.get(registry, key, registry);
        return typeof value === 'function' ? value.bind(registry) : value;
      },
    });
    unprovide = inner.provide('tools', facade);
    ctx.effect(function* () { yield unprovide; return close; });
    // A successful await now proves connect + initial tool synchronization,
    // including a successfully connected server advertising zero tools.
    // Startup failure rejects this explicitly opted-in instance, is recorded
    // as failed, and lets Cordis drain native apply's own registered effects.
    await nativeMcp.apply(inner, { ...config, failOnStartupError: true });
    lease.startupSucceeded();
  } catch (error) {
    lease.startupFailed(error);
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Owned MCP startup failed and its cleanup was not confirmed.'); }
    throw error;
  }
}
