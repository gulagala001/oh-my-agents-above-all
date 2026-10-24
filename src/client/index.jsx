import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPresetActivationClient } from './preset-activation.mjs';
import uiCss from './ui.css';
import { SettingsPage } from './settings-page.jsx';
import { decorateSlotComponent } from './themes/shared/slot-decoration.mjs';

export const inject = ['slots'];

export function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.omaaUi = ''; tag.textContent = uiCss;
    document.head.append(tag); return () => tag.remove();
  });
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('omaa-presets') : undefined;
  const activation = createPresetActivationClient(fetch, () => channel?.postMessage('changed'));
  if (channel) channel.onmessage = () => { void activation.refresh(); };
  let closed = false, signature = '', runtime, tail = Promise.resolve();
  const sync = () => {
    const enabled = activation.getSnapshot().data?.enabled ?? [];
    const next = JSON.stringify(enabled);
    if (next === signature) return;
    signature = next;
    tail = tail.then(async () => {
      if (runtime) { await runtime.dispose(); runtime = undefined; }
      if (closed || !enabled.length || signature !== next) return;
      const features = await import('./runtime.jsx');
      if (closed || signature !== next) return;
      runtime = ctx.plugin({ name: 'omaa-client-runtime', inject: features.inject,
        apply: scope => features.apply(scope, { enabled, ready: activation.setRuntime }) });
      await runtime;
    }).catch(activation.runtimeError);
  };
  const Page = () => <SettingsPage activation={activation}/>;
  // The native hero reads its roster only on mount/settings changes. Refresh
  // through its own public load action after an accepted OMAA choice; never
  // overwrite the host default, staged choice or selection implementation.
  ctx.slots.inject('conversation.hero.agentPreset', () => decorateSlotComponent(ctx.slots, 'conversation.hero.agentPreset', () => true, entry => {
    const Original = entry.component;
    return function PresetRoster(props) {
      const { data } = useSyncExternalStore(activation.subscribe, activation.getSnapshot);
      const revision = data?.revision, previous = useRef(revision);
      useEffect(() => {
        const changed = previous.current !== undefined && previous.current !== revision;
        previous.current = revision;
        if (changed && typeof props.load === 'function') void props.load().catch(activation.runtimeError);
      }, [revision, props.load]);
      return <Original {...props}/>;
    };
  }));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omaa-presets', order: 17,
    label: () => 'OMAA' }, Page));
  ctx.effect(() => {
    const off = activation.subscribe(sync), refresh = () => { void activation.refresh(); };
    window.addEventListener('focus', refresh);
    refresh();
    return async () => {
      closed = true; off(); window.removeEventListener('focus', refresh);
      channel?.close(); await tail; await runtime?.dispose(); activation.dispose();
    };
  });
}
