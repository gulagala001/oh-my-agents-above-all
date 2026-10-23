import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { products, productForPreset } from '../shared/products.mjs';

const known = new Set(products.map(product => product.id));
export function validateEnabledPresets(enabled) {
  if (!Array.isArray(enabled) || enabled.length > products.length
    || enabled.some(id => !known.has(id)) || new Set(enabled).size !== enabled.length)
    throw Error('请选择有效且不重复的 OMAA 预设。');
  return products.filter(product => enabled.includes(product.id)).map(product => product.id);
}

export function createPresetActivation(ctx, directory) {
  const file = join(directory, 'presets.json');
  const read = () => {
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value || Object.keys(value).some(key => !['enabled', 'revision'].includes(key))
        || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('预设启用设置无效。');
      return { enabled: validateEnabledPresets(value.enabled), revision: value.revision };
    } catch (error) { if (error.code === 'ENOENT') return { enabled: [], revision: 0 }; throw error; }
  };
  let saved = read(), selected = new Set(), changing = new Set(), closed = false, error = '';
  let runtime, runtimeModule, definitions, tail = Promise.resolve();
  const mounts = new Map();
  const productOf = session => productForPreset(ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset);
  const busy = removed => removed.has('pi') && [...(ctx.get('omaa')?.piExtensions?.states?.values() ?? [])].some(state => state.busy()) || ctx.agents.list().some(agent => {
    if (!removed.has(productOf(agent.session)?.id)) return false;
    return agent.status === 'running' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length
      || ctx.get('jobs')?.list(agent.id).some(job => ['running', 'stopping'].includes(job.status));
  });
  async function mount(id) {
    if (!runtime) {
      runtimeModule = await import('../runtime.mjs');
      runtime = ctx.plugin(runtimeModule);
      await runtime;
      ctx.fiber.assertActive();
      definitions ??= (await import('./preset-definitions.mjs')).presetDefinitions;
    }
    const support = ctx.plugin({ name: 'omaa-support-' + id, inject: [...runtimeModule.inject, 'omaa'],
      apply: scope => runtimeModule.enableProduct(scope, id) });
    const unregister = [];
    try {
      await support;
      for (const definition of definitions.filter(value => productForPreset(value.id)?.id === id))
        unregister.push(await ctx.agentPresets.register(definition));
      mounts.set(id, { support, unregister });
    } catch (failure) {
      for (const dispose of unregister.reverse()) await dispose();
      await support.dispose();
      throw failure;
    }
  }
  async function unmount(id) {
    const value = mounts.get(id);
    if (!value) return;
    for (const dispose of value.unregister) await dispose();
    await value.support.dispose();
    mounts.delete(id);
  }
  async function reconcile(enabled) {
    const next = new Set(enabled);
    selected = next;
    for (const id of [...mounts.keys()]) if (!next.has(id)) await unmount(id);
    for (const id of enabled) if (!mounts.has(id)) await mount(id);
    if (!mounts.size && runtime) { await runtime.dispose(); runtime = undefined; }
  }
  const api = {
    available: id => selected.has(id) && !closed,
    enabled: id => selected.has(id) && !changing.has(id) && !closed,
    assertSession(session) {
      const product = productOf(session);
      if (product && !api.enabled(product.id)) throw Error(`请先在设置 → OMAA 中启用 ${product.name}。会话历史与设置已保留。`);
    },
    inspect: () => ({ ...saved, enabled: [...selected], products,
      error: error || (productForPreset(ctx.agentPresets.defaultId) && !selected.has(productForPreset(ctx.agentPresets.defaultId).id)
        ? 'DSH 当前默认预设尚未开启，请在此开启，或到「Agent 预设」更改默认。' : '') }),
    async start() {
      try { await reconcile(saved.enabled); }
      catch (failure) {
        error = '预设启动失败：' + failure.message;
        await reconcile([]);
        ctx.logger.warn(error);
      }
    },
    update(input) {
      const work = tail.then(async () => {
        if (closed) throw Error('OMAA 基座已停用。');
        if (!input || Object.keys(input).some(key => !['enabled', 'revision'].includes(key))) throw Error('预设设置无效。');
        const enabled = validateEnabledPresets(input.enabled), disk = read();
        if (input.revision !== saved.revision || disk.revision !== saved.revision
          || JSON.stringify(disk.enabled) !== JSON.stringify(saved.enabled))
          throw Object.assign(Error('预设设置已变化，请重新读取后操作。'), { code: 'revision-conflict' });
        if (saved.revision === Number.MAX_SAFE_INTEGER) throw Error('预设设置修订号已达上限。');
        const previous = [...selected], removed = new Set(previous.filter(id => !enabled.includes(id)));
        if (removed.has(productForPreset(ctx.agentPresets.defaultId)?.id))
          throw Error('此预设是 DSH 当前默认预设，请先到「Agent 预设」选择其他默认预设，再关闭。');
        if (busy(removed)) throw Error('相关预设仍有运行中或排队的任务，请停止并等待任务结束后再关闭。');
        // Fence old retained Agent compositions before any asynchronous teardown.
        changing = new Set([...removed, ...enabled.filter(id => !selected.has(id))]);
        try {
          await reconcile(enabled);
          for (const id of enabled) {
            const preset = await ctx.agentPresets.resolve(products.find(product => product.id === id).preset);
            if (preset.broken) throw Error(preset.broken);
          }
          if (JSON.stringify(read()) !== JSON.stringify(saved)) throw Object.assign(Error('预设设置已变化，请重新读取后操作。'), { code: 'revision-conflict' });
          const next = { enabled, revision: saved.revision + 1 };
          mkdirSync(directory, { recursive: true, mode: 0o700 });
          const temporary = file + '.' + randomUUID() + '.tmp';
          try { writeFileSync(temporary, JSON.stringify(next) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, file); }
          finally { rmSync(temporary, { force: true }); }
          saved = next; error = '';
        } catch (failure) {
          try { await reconcile(previous); }
          catch (rollback) { error = '恢复预设状态失败：' + rollback.message; throw new AggregateError([failure, rollback], error); }
          throw failure;
        } finally { changing = new Set(); }
        return api.inspect();
      });
      tail = work.catch(() => {});
      return work;
    },
    async close() {
      closed = true;
      await tail;
      await reconcile([]);
    },
  };
  return api;
}
