import { themePacks, productThemes } from './packs.mjs';
import { validateSkin, compileSkinCss } from './shared/format.mjs';
import { hostTokens, tokenCss } from './shared/mapping.mjs';
import { appearanceCoordinator } from './coordinator.mjs';

export function hasLegacyAppearance(surface, coordinator) {
  return !coordinator.hasProvider('omd') && Boolean(surface.querySelector('style[data-plugin="trisoul_x"], style[data-omd-skin-style], style[data-omd-custom-style]')
    || surface.documentElement.classList.contains('trisoul-shell'));
}

export function createThemeRuntime(ctx, settings, adapterCss, layouts = {}, responsiveCss = '', surface = document) {
  const packs = new Map(themePacks.map(pack => [pack.id, pack.inheritsHost
    ? { skin: pack, css: '' }
    : { skin: validateSkin(pack, CSS.supports.bind(CSS)), css: compileSkinCss(pack.css, pack.id) }]));
  const listeners = new Set();
  const coordinator = appearanceCoordinator(surface), observer = coordinator.observeForeground('omaa');
  let disposed = false, releaseCurrent, selection;
  let state = { active: false, skins: [...packs.values()].map(value => value.skin), selected: 'default', error: '', appearanceSaving: false };
  const emit = () => { state = { ...state }; for (const fn of listeners) fn(); };
  const legacyAppearance = () => Boolean(selection && hasLegacyAppearance(surface, coordinator));
  let blocked = legacyAppearance(), omdCoordinated = coordinator.hasProvider('omd');
  const unregister = coordinator.register({ id: 'omaa', priority: 10,
    select: foreground => {
      const id = selection?.id, current = settings.getSnapshot();
      if (legacyAppearance() || !selection || foreground.sessionId !== current.sessionId || !id || id === 'omd') return null;
      if (id !== 'host' && !packs.has(id)) return null;
      return { key: id, id };
    },
    mount: selection => {
      const item = packs.get(selection.id);
      state = { ...state, active: Boolean(item), selected: item?.skin.id ?? 'default', error: '' }; emit();
      if (!item) return () => { state = { ...state, active: false, selected: 'default' }; emit(); };
      const root = surface.documentElement, previousClass = root.classList.contains('omd');
      const names = ['omaaTheme', 'omdSkin', 'omdLayout', 'omdColors', 'appearance'];
      const previous = Object.fromEntries(names.map(name => [name, root.dataset[name]]));
      root.classList.add('omd'); root.dataset.omaaTheme = item.skin.id; root.dataset.omdSkin = item.skin.id;
      root.dataset.omdColors = ''; root.dataset.appearance = ctx.theme.getTheme().active.colorScheme;
      if (item.skin.layout) root.dataset.omdLayout = item.skin.layout; else delete root.dataset.omdLayout;
      const style = surface.createElement('style'); style.dataset.omaaThemeStyle = item.skin.id;
      style.textContent = tokenCss(item.skin) + '\n' + adapterCss + '\n' + responsiveCss + '\n' + item.css
        + (item.skin.layout ? '\n' + (layouts[item.skin.layout] || '') : '');
      surface.head.append(style);
      // Writing inherited aliases back to --dsw-* would create a CSS cycle.
      const disposeTokens = item.skin.inheritsHost ? undefined : ctx.theme.overrideTokens('omaa/theme', hostTokens(item.skin));
      let released = false;
      releaseCurrent = () => {
        if (released) return; released = true;
        state = { ...state, active: false, selected: 'default' };
        disposeTokens?.(); style.remove();
        if (!previousClass) root.classList.remove('omd');
        for (const name of names) {
          if (previous[name] === undefined) delete root.dataset[name]; else root.dataset[name] = previous[name];
        }
        emit();
      };
      return releaseCurrent;
    },
  });
  const sync = () => {
    if (disposed) return;
    const current = settings.getSnapshot();
    if (current.data?.product) {
      const { product, theme } = current.data;
      selection = { id: theme === 'product' ? productThemes[product.id] : theme, preset: product.preset, productId: product.id };
    } else if (!(current.data === null && current.loading && current.sessionId && current.agentPreset && current.agentPreset === selection?.preset)) {
      selection = undefined;
    }
    // Only the renderer selection crosses an ID transition. Session settings
    // remain empty and unwritable until the target API has confirmed them.
    blocked = legacyAppearance();
    state = { ...state, error: blocked ? '当前 OMD 版本未提供共享外观接口，已暂停主题接管并保留原有外观。请更新 Oh My DSH。' : '' }; emit();
    observer.set({ sessionId: current.sessionId || null, mode: selection?.productId ?? null });
    coordinator.invalidate();
  };
  const offSettings = settings.subscribe(sync); sync();
  const offCoordinator = coordinator.subscribe(() => {
    const present = coordinator.hasProvider('omd');
    if (!disposed && (legacyAppearance() !== blocked || present !== omdCoordinated)) {
      omdCoordinated = present; sync();
    }
  });
  const Observer = surface.defaultView?.MutationObserver;
  const oldStyleObserver = Observer ? new Observer(() => {
    if (!disposed && legacyAppearance() !== blocked) sync();
  }) : undefined;
  oldStyleObserver?.observe(surface.head, { childList: true });
  oldStyleObserver?.observe(surface.documentElement, { attributes: true, attributeFilter: ['class'] });
  const offTheme = ctx.on('theme/change', snapshot => {
    if (state.active) surface.documentElement.dataset.appearance = snapshot.active.colorScheme;
    emit();
  });
  return {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => state,
    getAppearance: () => ctx.theme.getTheme().preference,
    async setAppearance(value) {
      if (disposed) throw new Error('外观设置已关闭，请重新打开。');
      if (state.appearanceSaving) throw new Error('正在保存明暗模式，请稍候。');
      state = { ...state, appearanceSaving: true }; emit();
      try {
        const form = ctx.configForms.get('ui-theme');
        if (form.getSnapshot().mode === 'memory') return await ctx.theme.setTheme(value);
        if (!await form.set('preference', value)) throw new Error('明暗模式未保存，请重试。');
      } finally {
        if (!disposed) { state = { ...state, appearanceSaving: false }; emit(); }
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      offSettings(); offTheme(); offCoordinator(); oldStyleObserver?.disconnect(); unregister(); observer.dispose(); releaseCurrent?.(); listeners.clear();
    },
  };
}
