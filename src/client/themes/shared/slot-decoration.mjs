import { createElement } from 'react';

// Standalone copy of OpenCU's entry-preserving decorator protocol.
const decoration = Symbol.for('opencu.slot-decoration.v1');
const componentDecoration = Symbol.for('opencu.slot-component-decoration.v1');
const refreshEntry = Symbol.for('opencu.slot-refresh.v1');
const unwrapInactive = component => {
  while (component?.[componentDecoration]?.active === false) component = component[componentDecoration].previous;
  return component;
};

// Slot children are exclusive declarations, and renderSlot authority belongs
// to the declaring entry. Preserve that entry instead of registering a shadow.
// The fixed host exposes writable StoredEntry.component but no update API;
// a synchronous, non-winning registration/disposal publishes the public slot
// version without touching its declaration ledger or renderer private fields.
export function decorateSlotComponent(slots, name, accepts, decorate) {
  const installed = new Map();
  let reconciling = false, dirty = false, stopped = false;
  function publish() {
    const entries = slots.entries(name), original = entries.find(entry => accepts(entry.options.key));
    if (!original) return;
    // Fiber disposal has already deactivated the plugin receiver. Publish the
    // synchronous refresh through the live root; no effect survives this call.
    const publisher = slots.ctx?.fiber?.uid === null ? slots.ctx.root.get('slots') : slots;
    if (!publisher || publisher.ctx?.fiber?.uid === null) return;
    const priority = Math.max(...entries.map(entry => entry.options.priority ?? 0)) + 1;
    if (!Number.isFinite(priority)) throw new Error('Cannot publish slot decoration at a finite non-winning priority');
    const Probe = () => null;
    Probe[refreshEntry] = true;
    publisher.register({ name, key: original.options.key, priority }, Probe)();
  }
  function release(entry, state) {
    state.active = false;
    if (entry.component !== state.wrapper) return false;
    entry.component = unwrapInactive(state.previous);
    return true;
  }
  function reconcile() {
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entries(name), live = new Set(entries);
        for (const [entry, state] of installed) if (!live.has(entry)) {
          installed.delete(entry); release(entry, state);
        }
        let changed = false;
        for (const entry of entries) {
          if (!accepts(entry.options.key) || entry.component?.[refreshEntry] || installed.has(entry)) continue;
          const previous = entry.component, component = decorate(entry);
          const state = { previous, active: true, wrapper: null };
          function Decorated(props) { return createElement(state.active ? component : previous, props); }
          state.wrapper = Decorated; Decorated[componentDecoration] = state;
          // Older plugins identify their own shadow entry through this tag.
          // Retain it so they never mistake an in-place wrapper for a new owner.
          if (previous?.[decoration]) Decorated[decoration] = previous[decoration];
          entry.component = Decorated; installed.set(entry, state); changed = true;
        }
        if (changed) publish();
      } while (dirty && !stopped);
    } finally { reconciling = false; }
  }
  const unsubscribe = slots.subscribe(name, reconcile); reconcile();
  return () => {
    if (stopped) return;
    stopped = true; unsubscribe();
    let changed = false;
    for (const [entry, state] of [...installed].reverse()) changed = release(entry, state) || changed;
    installed.clear();
    if (changed) publish();
  };
}
