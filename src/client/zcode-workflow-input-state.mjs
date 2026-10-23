// Public native ISession snapshots and the pinned inbox projection own input
// admission. Running=false alone does not exclude an accepted queued prompt.
export function assertWorkflowInputIdle(session) {
  const snapshot = session.getSnapshot();
  if (snapshot.openState !== 'open' || snapshot.openError) throw Error('当前会话尚未成功加载，请刷新后重试。');
  if (snapshot.removed || snapshot.running || snapshot.pendingSubmissions?.length || snapshot.awaitingFirstTurn)
    throw Error('当前会话已有输入等待执行，请等待结束后再发送工作流请求。');
  const inbox = session.projections?.faceOf?.('inbox')?.getSnapshot();
  if (!inbox || !['next-turn', 'next-step'].every(key => Array.isArray(inbox[key])))
    throw Error('无法确认当前会话输入状态，请刷新后重试。');
  if (['next-turn', 'next-step'].some(key => inbox[key].some(message => message?.source?.kind === 'user')))
    throw Error('当前会话已有用户请求在队列中，请等待结束后再发送工作流请求。');
}
