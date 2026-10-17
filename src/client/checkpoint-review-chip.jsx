import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { assertCheckpointSession, openCheckpointReview } from './checkpoint-navigation.mjs';

// This entry belongs to the composer's session slot. The sidebar's mounted
// value is the host's on-screen conversation, even when its pane is closed.
export function CheckpointReviewChip({ settings, sidebarRight, sessionId }) {
  const session = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
  const id = session.sessionId;
  const enabled = Boolean(id && id === sessionId && id === mounted && session.data?.product?.id === 'cursor');
  const confirmed = enabled && !session.loading && !session.saving && !session.error && !session.data.running && !session.data.pendingMode;
  const [state, setState] = useState({ sessionId: undefined, checkpoint: null, loading: false, error: '' });
  const [reload, setReload] = useState(0);
  const ticket = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), revision = ++ticket.current;
    setState({ sessionId: id, checkpoint: null, loading: confirmed, error: '' });
    if (confirmed) {
      const current = () => {
        const next = settings.getSnapshot();
        return !controller.signal.aborted && ticket.current === revision && next.sessionId === id &&
          sidebarRight.mounted.getSnapshot() === id && next.data?.product?.id === 'cursor' &&
          !next.loading && !next.saving && !next.error && !next.data.running && !next.data.pendingMode;
      };
      fetch(`omaa/api/checkpoints?session=${encodeURIComponent(id)}`, { credentials: 'same-origin', signal: controller.signal })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
          if (data.sessionId !== id || !Array.isArray(data.checkpoints)) throw new Error('改动记录与当前会话不匹配，请重新读取。');
          const checkpoint = data.checkpoints.filter(row => row?.reviewAvailable === true && Number.isSafeInteger(row.turn) && row.turn > 0 &&
            Number.isSafeInteger(row.seq) && row.seq >= 0 && Array.isArray(row.summary?.files) && row.summary.files.length > 0)
            .sort((a, b) => b.turn - a.turn || b.seq - a.seq)[0] ?? null;
          if (current()) setState({ sessionId: id, checkpoint, loading: false, error: '' });
        }).catch(error => { if (current()) setState({ sessionId: id, checkpoint: null, loading: false, error: error.message }); });
    }
    return () => { controller.abort(); ++ticket.current; };
  }, [settings, sidebarRight, id, sessionId, confirmed, reload]);
  if (!confirmed || state.sessionId !== id) return null;
  if (state.loading) return <span className="omaa-checkpoint-chip-status" role="status">读取改动…</span>;
  if (state.error) return <button type="button" className="omaa-checkpoint-review-chip omaa-checkpoint-chip-retry"
    title={state.error} aria-label={`${state.unavailable ? '审阅暂不可用' : '改动读取失败'}：${state.error} 重新读取`}
    onClick={() => setReload(value => value + 1)}>{state.unavailable ? '审阅暂不可用' : '改动读取失败'} · 重试</button>;
  const checkpoint = state.checkpoint;
  if (!checkpoint) return null;
  const label = `回合 ${checkpoint.turn} 改动 · ${checkpoint.summary.files.length} 个文件`;
  const open = () => {
    try {
      assertCheckpointSession(settings, id, sidebarRight);
      const current = settings.getSnapshot();
      if (id !== sessionId || current.loading || current.saving || current.error || current.data.pendingMode) throw new Error('会话状态尚未确认，请重新读取改动。');
      openCheckpointReview(settings, sidebarRight, id, checkpoint);
    } catch (error) {
      if (settings.getSnapshot().sessionId === id && sidebarRight.mounted.getSnapshot() === id) {
        setState({ sessionId: id, checkpoint: null, loading: false, error: error.message, unavailable: true });
      }
    }
  };
  return <button type="button" className="omaa-checkpoint-review-chip" aria-label={label}
    title={`${label}；查看该回合记录的原生比较`} onClick={open}>{label}</button>;
}
