import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import * as base from '../src/index.mjs';

test('base update service exists without enabled presets and is replaced on re-enable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omaa-update-base-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  const ctx = new Context();
  t.after(async () => {
    await ctx.fiber.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  ctx.provide('agents', { list: () => [] });
  ctx.provide('agentPresets', { defaultId: 'native' });
  ctx.provide('sessionProjections', { stateOf: () => undefined });
  const first = ctx.plugin(base); await first;
  const updates = ctx.get('omaaUpdates');
  assert.equal(typeof updates?.omdVersionCheck, 'function');
  assert.equal(ctx.get('omaa'), undefined, 'checking updates must not load the preset runtime');
  assert.deepEqual(ctx.get('omaaActivation').inspect().enabled, []);
  await first.dispose();
  assert.equal(ctx.get('omaaUpdates'), undefined);
  await assert.rejects(updates.check(), /更新服务已停止/);
  const second = ctx.plugin(base); await second;
  assert.notEqual(ctx.get('omaaUpdates'), updates);
  assert.equal(typeof ctx.get('omaaUpdates').omdVersionCheck, 'function');
  await second.dispose();
});
