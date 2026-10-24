import { Button } from './ui.jsx';
import React, { useSyncExternalStore } from 'react';
import { PresetControls } from './preset-controls.jsx';
import { CheckpointReviewChip } from './checkpoint-review-chip.jsx';

export function ComposerChips({ settings, sidebarRight, sessionId, getThemeRuntime }) {
  const session = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
  // Child composers share the mounted parent's settings store. Only the
  // matching main composer can expose or open those session settings.
  if (!session.data?.product || !sessionId || session.sessionId !== sessionId || mounted !== sessionId) return null;
  const openPanel = () => {
    if (settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId) {
      sidebarRight.openTabIn(sessionId, 'omaa-preset');
    }
  };
  return <span className="omaa-composer-chips"><CheckpointReviewChip {...{ settings, sidebarRight, sessionId }}/>{session.data.product.id === 'cursor' && <Button type="button" variant="ghost" className="omaa-checkpoint-review-chip" aria-label="打开 Cursor 代码审阅" onClick={() => {
    if (settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId && settings.getSnapshot().data?.product?.id === 'cursor') sidebarRight.openTabIn(sessionId, 'omaa-cursor-review');
  }}>代码审阅</Button>}<PresetControls {...{ settings, getThemeRuntime, openPanel }} compact/></span>;
}
