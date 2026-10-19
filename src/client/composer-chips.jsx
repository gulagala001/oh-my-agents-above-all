import React, { useSyncExternalStore } from 'react';
import { PresetControls } from './preset-controls.jsx';
import { CheckpointReviewChip } from './checkpoint-review-chip.jsx';

export function ComposerChips({ settings, sidebarRight, sessionId, getThemeRuntime }) {
  const session = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const mounted = useSyncExternalStore(sidebarRight.mounted.subscribe, sidebarRight.mounted.getSnapshot);
  // Child composers share the mounted parent's settings store. Only the
  // matching main composer can expose or open those session settings.
  if (!sessionId || session.sessionId !== sessionId || mounted !== sessionId) return null;
  const openPanel = () => {
    if (settings.getSnapshot().sessionId === sessionId && sidebarRight.mounted.getSnapshot() === sessionId) {
      sidebarRight.openTabIn(sessionId, 'omaa-preset');
    }
  };
  return <span className="omaa-composer-chips"><CheckpointReviewChip {...{ settings, sidebarRight, sessionId }}/><PresetControls {...{ settings, getThemeRuntime, openPanel }} compact/></span>;
}
