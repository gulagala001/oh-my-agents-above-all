import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

test('session controls preserve authoritative settings through native transitions and saves', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `
    export { createSessionSettings, PresetControls } from './src/client/preset-controls.jsx';
    export { createThemeRuntime } from './src/client/themes/runtime.mjs';
    export { appearanceCoordinator } from './src/client/themes/coordinator.mjs';
    export { default as React } from 'react';
    export { createRoot } from 'react-dom/client';
    export { flushSync } from 'react-dom';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'transitionFixture', target: 'es2022' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  await page.addStyleTag({ content: await readFile(new URL('../src/client/preset-controls.css', import.meta.url), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { createSessionSettings, createThemeRuntime, appearanceCoordinator, React, createRoot, flushSync, PresetControls } = transitionFixture;
    const source = initial => {
      let state = initial; const listeners = new Set();
      return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { state = next; flushSync(() => { for (const fn of listeners) fn(); }); } };
    };
    const mounted = source('draft'), list = source({ byId: { draft: { running: false } } }), calls = [];
    const request = (url, options) => new Promise(resolve => calls.push({ url, options,
      resolve: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status })) }));
    const settings = createSessionSettings({ sidebarRight: { mounted }, sessions: { list } }, request);
    const theme = { getTheme: () => ({ active: { colorScheme: 'light' }, preference: 'system' }), overrideTokens: () => () => {} };
    const appearanceRequests = [];
    const form = { getSnapshot: () => ({ mode: 'file' }), set: () => new Promise(resolve => appearanceRequests.push(resolve)) };
    const runtime = createThemeRuntime({ theme, on: () => () => {}, configForms: { get: () => form } }, settings, '');
    const root = createRoot(document.getElementById('app'));
    flushSync(() => root.render(React.createElement(PresetControls, { settings, getThemeRuntime: () => runtime, compact: true })));
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const until = async predicate => {
      for (let i = 0; i < 200; i++) { if (predicate()) return; await tick(); }
      throw new Error('target settings did not settle');
    };
    const value = extra => ({ product: { id: 'codex', name: 'Codex', preset: 'omaa-codex' }, mode: 'default', theme: 'product', running: false, ...extra });
    const snapshot = () => ({ theme: document.documentElement.dataset.omaaTheme ?? null,
      styles: document.querySelectorAll('style[data-omaa-theme-style]').length,
      data: settings.getSnapshot().data, loading: settings.getSnapshot().loading,
      chip: document.querySelector('.omaa-preset-chip-name')?.textContent ?? null,
      key: appearanceCoordinator(document).getSnapshot().key });
    const stages = {};
    try {
      await tick(); calls.at(-1).resolve(value()); await until(() => settings.getSnapshot().data); await tick();
      const originalStyle = document.querySelector('style[data-omaa-theme-style]');
      list.set({ byId: { draft: { running: false }, formal: { running: false, projectionValues: { agentPreset: 'omaa-codex' } } } });
      mounted.set('formal'); stages.pending = snapshot();
      stages.sameRenderer = originalStyle === document.querySelector('style[data-omaa-theme-style]');
      try { await settings.update({ enhancement: true }); stages.pendingWrite = 'accepted'; }
      catch (error) { stages.pendingWrite = error.message; }
      await tick(); calls.at(-1).resolve(value({ theme: 'host' })); await until(() => !settings.getSnapshot().loading); await tick(); stages.confirmed = snapshot();
      // Repeat from a confirmed theme. Failed reads and targets that lack the
      // exact native preset must relinquish appearance immediately.
      for (const [name, preset] of [['failed', 'omaa-codex'], ['missing', undefined], ['native', 'default'], ['different', 'omaa-cursor'], ['unmounted', null]]) {
        const current = settings.refresh(); await tick(); calls.at(-1).resolve(value()); await current; await tick();
        list.set({ byId: { [name]: { running: false, projectionValues: { agentPreset: preset } } } });
        mounted.set(preset === null ? undefined : name); await tick();
        if (name === 'failed') { calls.at(-1).resolve({ error: '读取失败' }, 500); await until(() => !settings.getSnapshot().loading); await tick(); }
        stages[name] = snapshot();
      }
      list.set({ byId: { editing: { running: false, projectionValues: { agentPreset: 'omaa-codex' } } } });
      mounted.set('editing'); await tick(); calls.at(-1).resolve(value()); await until(() => !settings.getSnapshot().loading);
      document.getElementById('app').style.width = '230px';
      flushSync(() => root.render(React.createElement(React.Fragment, null,
        React.createElement(PresetControls, { settings, getThemeRuntime: () => runtime, compact: true }),
        React.createElement(PresetControls, { settings, getThemeRuntime: () => runtime, visible: false }))));
      const panel = document.querySelector('.omaa-preset-controls'), mode = panel.querySelector('select[aria-label="工作模式"]');
      stages.narrow = { viewport: innerWidth, overflow: panel.scrollWidth > panel.clientWidth,
        rowDirection: getComputedStyle(mode.closest('label')).flexDirection };
      flushSync(() => { mode.value = 'ask'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
      stages.saving = { mode: mode.value, disabled: mode.disabled, feedback: panel.textContent.includes('正在保存会话设置') };
      try { await settings.update({ theme: 'host' }); stages.busyWrite = 'accepted'; } catch (error) { stages.busyWrite = error.message; }
      await tick(); const posting = calls.at(-1);
      list.set({ byId: { editing: { running: true, projectionValues: { agentPreset: 'omaa-codex', plan: { active: false, pending: true } } } } });
      await tick(); posting.resolve(value({ mode: 'ask', running: false, pendingMode: false }));
      await until(() => calls.at(-1) !== posting);
      stages.afterSave = { running: settings.getSnapshot().data.running, pending: settings.getSnapshot().data.pendingMode,
        refreshed: calls.at(-1).options.method === undefined, modeDisabled: mode.disabled };
      calls.at(-1).resolve(value({ mode: 'ask', running: true, pendingMode: true }));
      await until(() => !settings.getSnapshot().loading);
      list.set({ byId: { editing: { running: false, projectionValues: { agentPreset: 'omaa-codex', plan: { active: false, pending: false } } } } });
      await tick(); calls.at(-1).resolve(value({ pendingMode: true })); await until(() => !settings.getSnapshot().loading); await tick();
      stages.pendingExitDisabled = mode.disabled;
      try { await settings.update({ mode: 'ask' }); stages.pendingExitWrite = 'accepted'; } catch (error) { stages.pendingExitWrite = error.message; }
      const settledExit = settings.refresh(); await tick(); calls.at(-1).resolve(value()); await settledExit;
      const latePost = settings.update({ theme: 'host' }); await tick(); const old = calls.at(-1);
      list.set({ byId: { editing: { running: false, projectionValues: { agentPreset: 'omaa-cursor' } } } });
      stages.changedPreset = snapshot(); await tick();
      calls.at(-1).resolve(value({ product: { id: 'cursor', name: 'Cursor', preset: 'omaa-cursor' } }));
      await until(() => !settings.getSnapshot().loading);
      old.resolve(value({ theme: 'host' })); await latePost;
      stages.afterLateSave = snapshot();
      const failedRead = settings.refresh(); await tick(); calls.at(-1).resolve({ error: '读取失败' }, 500); await failedRead; await tick();
      stages.failedReadDisabled = [...panel.querySelectorAll('select:not([aria-label="明暗模式"]),input')].every(control => control.disabled);
      try { await settings.update({ theme: 'host' }); stages.staleWrite = 'accepted'; } catch (error) { stages.staleWrite = error.message; }
      const appearanceSave = runtime.setAppearance('dark');
      try { await runtime.setAppearance('light'); stages.appearanceBusy = 'accepted'; } catch (error) { stages.appearanceBusy = error.message; }
      appearanceRequests.at(-1)(false);
      try { await appearanceSave; } catch (error) { stages.appearanceFailure = error.message; }
      stages.appearanceReleased = !runtime.getSnapshot().appearanceSaving;
      return stages;
    } finally { root.unmount(); runtime.dispose(); settings.dispose(); }
  });
  assert.equal(result.pending.data, null);
  assert.equal(result.pending.loading, true);
  assert.equal(result.pending.theme, 'codex-desktop');
  assert.equal(result.pending.chip, 'Codex');
  assert.equal(result.sameRenderer, true);
  assert.match(result.pendingWrite, /请选择/);
  assert.equal(result.confirmed.data.theme, 'host');
  assert.equal(result.confirmed.styles, 0);
  assert.equal(result.confirmed.key, 'host');
  for (const name of ['failed', 'missing', 'native', 'different', 'unmounted']) {
    assert.equal(result[name].theme, null, name);
    assert.equal(result[name].styles, 0, name);
    assert.equal(result[name].data, null, name);
  }
  assert.equal(result.different.chip, 'Cursor', 'loading chip uses target product, never the old product');
  assert(result.narrow.viewport > 420, 'wide viewport contains a narrow sidebar');
  assert.equal(result.narrow.overflow, false);
  assert.equal(result.narrow.rowDirection, 'column');
  assert.deepEqual(result.saving, { mode: 'ask', disabled: true, feedback: true });
  assert.match(result.busyWrite, /正在保存/);
  assert.deepEqual(result.afterSave, { running: true, pending: true, refreshed: true, modeDisabled: true });
  assert.equal(result.pendingExitDisabled, true, 'API pendingMode protects a pending exit even when native wire has no pending command');
  assert.match(result.pendingExitWrite, /等待处理/);
  assert.equal(result.changedPreset.data, null);
  assert.equal(result.changedPreset.theme, null);
  assert.equal(result.afterLateSave.data.product.id, 'cursor');
  assert.equal(result.afterLateSave.data.theme, 'product');
  assert.equal(result.failedReadDisabled, true);
  assert.match(result.staleWrite, /重新读取/);
  assert.match(result.appearanceBusy, /正在保存/);
  assert.match(result.appearanceFailure, /未保存/);
  assert.equal(result.appearanceReleased, true);
});
