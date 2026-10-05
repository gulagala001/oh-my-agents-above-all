// DSH 0.2.1-alpha.1 address contracts: ui-deliverables/changes.ts and
// util-workspace-path/file-address.ts (MIT). These are resource addresses,
// claimed by the native sidebar registry, never browser navigation URLs.
export function checkpointReviewAddress(sessionId, checkpoint) {
  if (!checkpoint?.reviewAvailable || !Number.isSafeInteger(checkpoint.seq) ||
      !Number.isSafeInteger(checkpoint.turn) || checkpoint.turn < 1) throw new Error('该回合的宿主比较已不可用。');
  return `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/${checkpoint.seq}/${checkpoint.turn}`;
}

export function checkpointFileAddress(sessionId, path) {
  const encode = segment => encodeURIComponent(segment).replace(/%3A/gi, ':');
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  return `dsh-resource://file/session/${encode(sessionId)}/${normalized.split('/').map(encode).join('/')}`;
}

export function assertCheckpointSession(settings, sessionId, sidebarRight, idle = true) {
  const current = settings.getSnapshot();
  if (current.sessionId !== sessionId || current.data?.product?.id !== 'cursor' ||
      (sidebarRight && sidebarRight.mounted.getSnapshot() !== sessionId)) throw new Error('会话已切换，请在当前会话重新操作。');
  if (idle && current.data.running) throw new Error('请先停止当前运行，再恢复或开始问题检查。');
}

export function openCheckpointReview(settings, sidebarRight, sessionId, checkpoint, index = 0) {
  assertCheckpointSession(settings, sessionId, sidebarRight, false);
  if (!Number.isSafeInteger(index) || !checkpoint?.summary?.files?.[index]) throw new Error('该文件的宿主比较已不可用。');
  sidebarRight.openResourceIn(sessionId, checkpointReviewAddress(sessionId, checkpoint), { params: { index } });
}

export function openCheckpointFile(settings, sidebarRight, sessionId, file) {
  assertCheckpointSession(settings, sessionId, sidebarRight, false);
  // A restored new file is absent again; avoid offering a misleading preview.
  if ((file.restored ? file.before : file.after)?.kind === 'absent') throw new Error('该文件当前已删除，仍可查看回合比较。');
  sidebarRight.openResourceIn(sessionId, checkpointFileAddress(sessionId, file.path));
}

export async function findCheckpointIssues(settings, sessions, sidebarRight, sessionId, checkpoint, path) {
  assertCheckpointSession(settings, sessionId, sidebarRight);
  const before = settings.getSnapshot();
  if (before.loading || before.saving || before.error || before.data.pendingMode || before.data.mode === 'plan') throw new Error('请先结束计划模式或等待设置保存，再查找问题。');
  const files = (checkpoint?.files ?? []).map(file => file.path);
  if (!Number.isSafeInteger(checkpoint?.turn) || !Number.isSafeInteger(checkpoint?.seq) || !files.length || (path !== undefined && !files.includes(path))) throw new Error('请选择实际记录的文件改动。');
  const paths = path === undefined ? files : [path];
  if (paths.length > 64 || paths.some(value => typeof value !== 'string') || JSON.stringify(paths).length > 12000) throw new Error('此检查点的文件范围过大，请逐个文件检查。');
  if (before.data.mode !== 'ask') await settings.update({ mode: 'ask' }, sessionId);
  assertCheckpointSession(settings, sessionId, sidebarRight);
  const current = settings.getSnapshot();
  if (current.saving || current.data.mode !== 'ask' || current.data.pendingMode) throw new Error(current.error || '只读模式尚未生效，未开始检查。');
  return sessions.using(sessionId, { source: 'omaa-find-issues' }, async reference => {
    const { session } = await reference.ready;
    assertCheckpointSession(settings, sessionId, sidebarRight);
    if (session.getSnapshot().running || settings.getSnapshot().data.mode !== 'ask') throw new Error('会话状态已改变，未开始检查。');
    const text = `Find issues in the file changes recorded for turn ${checkpoint.turn} (native event ${checkpoint.seq}). Inspect the current files and the relevant native conversation/tool evidence; the files may have changed since that turn.\nFiles: ${JSON.stringify(paths)}\n\nPerform a read-only code review. Identify concrete correctness bugs or regressions introduced by the changes, check relevant surrounding code and available tests when useful, and report actionable findings with file/line references. Do not edit files or implement fixes. If no supported issues are found, say so and mention any material check you could not perform.`;
    const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
      if (!result.ok) throw new Error(result.error?.message || '宿主未接受问题检查。');
      return result;
    } catch (error) { submission.abandon(); throw error; }
  });
}
