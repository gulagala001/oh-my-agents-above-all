import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
const native = createRequire(realpathSync(process.env.SEARCH_TEST_HOST ?? createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')));
const { Context } = await import(native.resolve('@deepseek-ai/cordis'));
const { ToolRuntime } = await import(native.resolve('@deepseek-ai/dsh-tools'));
const { createScope } = await import(native.resolve('@deepseek-ai/dsh-scope'));
const { installZCodeNativeSessionTools } = await import(process.env.ZCODE_SESSION_TOOLS_MODULE ?? '../src/presets/zcode/native-session-tools.mjs');

test('ZCode session tools coexist with global and ancestor names and retire only their own registrations', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  ctx.provide('systemPrompt', { tools() {} });
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  const names = ['todo_read', 'respond_to_coordinator'];
  const globals = names.map(name => ({ name, description: 'third party ' + name,
    parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: () => 'third party' }));
  for (const tool of globals) ctx.tools.register(tool);
  const parent = {}, child = {}, sibling = {};
  parent.ctx = createScope(ctx, parent).ctx;
  child.ctx = createScope(parent.ctx, child, { parent }).ctx;
  sibling.ctx = createScope(ctx, sibling).ctx;
  const first = parent.ctx.inject(['tools'], installZCodeNativeSessionTools); await first;
  const definitions = names.map(name => ctx.tools.get(name, parent));
  for (const [index, name] of names.entries()) {
    assert.notEqual(definitions[index], globals[index]);
    assert.equal(ctx.tools.get(name), globals[index]); assert.equal(ctx.tools.get(name, sibling), globals[index]);
    assert.equal(ctx.tools.get(name, child), definitions[index]);
  }
  const second = child.ctx.inject(['tools'], installZCodeNativeSessionTools); await second;
  for (const [index, name] of names.entries()) assert.notEqual(ctx.tools.get(name, child), definitions[index]);
  await second.dispose();
  for (const [index, name] of names.entries()) assert.equal(ctx.tools.get(name, child), definitions[index]);
  const duplicate = parent.ctx.inject(['tools'], installZCodeNativeSessionTools);
  await assert.rejects(Promise.resolve(duplicate), /already registered in this scope/);
  await duplicate.dispose();
  for (const [index, name] of names.entries()) assert.equal(ctx.tools.get(name, parent), definitions[index]);
  await first.dispose();
  for (const [index, name] of names.entries()) assert.equal(ctx.tools.get(name, parent), globals[index]);
});
