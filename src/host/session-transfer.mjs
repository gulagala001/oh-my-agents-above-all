const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const started = session => session.snapshotEvents().some(event => event.type === 'user/message' || event.type === 'turn/start');

// A projectless draft is admitted into a new native Session. Copy only the
// preset's private preferences; native permissions/model selection stay owned
// by the host. The receipt permits retries without overwriting later UI edits.
export function createSessionTransfer({ store, hub, workControl, flush }) {
  const pending = new Map();
  return async function transfer(request) {
    const { sourceSessionId, targetSessionId, requestId } = request ?? {};
    if ([sourceSessionId, targetSessionId, requestId].some(value => typeof value !== 'string' || !value || value.length > 200)
      || sourceSessionId === targetSessionId) throw new Error('无效的草稿会话迁移');
    const previous = pending.get(targetSessionId) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      const [source, target] = await Promise.all([hub.inspect(sourceSessionId), hub.inspect(targetSessionId)]);
      const product = hub.product(source.session);
      if (!product) return { copied: false, handledWorkMode: false };
      if (hub.product(target.session)?.id !== product.id) throw new Error('目标会话预设不同，草稿已保留');
      if (target.agent?.status === 'running' || started(target.session)) {
        throw new Error('目标会话必须是尚未发送的空闲草稿');
      }
      const desired = store.get(sourceSessionId), before = store.get(targetSessionId), existed = store.has(targetSessionId);
      const receipt = store.transfer(targetSessionId);
      if (existed && !(receipt?.sourceSessionId === sourceSessionId && receipt?.requestId === requestId && same(receipt.preferences, before))) {
        throw new Error('目标会话设置已独立修改，草稿已保留');
      }
      const control = workControl(), sourceWork = control?.inspect(source.session, source.agent);
      const desiredMode = desired.enhancement ? sourceWork?.savedMode ?? 'off' : 'off';
      const desiredSubmode = (desiredMode === 'off' ? sourceWork?.savedSubmode : sourceWork?.submode) ?? sourceWork?.submode ?? 'free';
      const oldWork = control?.inspect(target.session, target.agent), oldMode = oldWork?.savedMode ?? 'off';
      const oldSubmode = oldWork?.savedSubmode ?? oldWork?.submode ?? 'free';
      const wantedPlan = hub.modeFor(source.session, source.agent) === 'plan';
      const plan = hub.planController(target.agent), planBefore = plan?.get(target.agent);
      const oldPlan = planBefore?.pending ?? planBefore?.active ?? false;
      if (wantedPlan && !plan) throw new Error('目标会话没有原生计划模式');
      try {
        // Enable the compatible workflow before selecting Ultra. The saved
        // Ask/Plan mode is restored only after its native mode has transferred.
        store.set(targetSessionId, { ...desired, mode: 'default' });
        if (oldPlan && desiredMode !== 'off') plan.set(target.agent, false);
        if (control && (desiredMode !== 'off' || oldMode !== 'off' || desiredSubmode !== oldSubmode)) await control.select(targetSessionId, desiredMode, desiredSubmode);
        store.set(targetSessionId, desired);
        plan?.set(target.agent, wantedPlan);
        await flush(target.session);
        store.saveTransfer(targetSessionId, { sourceSessionId, requestId, preferences: desired });
        return { copied: true, handledWorkMode: true };
      } catch (error) {
        try {
          // Compensation adds normal native mode changes; it never rewrites a
          // Session journal or hides an already-issued host operation.
          store.set(targetSessionId, { ...before, enhancement: true, mode: 'default' });
          const currentWork = control?.inspect(target.session, target.agent);
          if (control && (currentWork.savedMode !== oldMode || (currentWork.savedSubmode ?? currentWork.submode ?? 'free') !== oldSubmode)) {
            // Restore unavailable Team memory while off; enabling then uses the
            // host's effective submode without overwriting that saved choice.
            if (oldMode !== 'off' && oldSubmode === 'team' && oldWork.teamAvailable !== true) {
              await control.select(targetSessionId, 'off', oldSubmode);
              await control.select(targetSessionId, oldMode);
            } else await control.select(targetSessionId, oldMode, oldSubmode);
          }
          plan?.set(target.agent, oldPlan);
          await flush(target.session);
        } catch (rollbackError) {
          error.message += `；恢复目标设置失败：${rollbackError.message}`;
        } finally {
          if (existed) store.set(targetSessionId, before); else store.remove(targetSessionId);
          if (receipt) store.saveTransfer(targetSessionId, receipt);
        }
        throw error;
      }
    });
    pending.set(targetSessionId, work);
    try { return await work; }
    finally { if (pending.get(targetSessionId) === work) pending.delete(targetSessionId); }
  };
}
