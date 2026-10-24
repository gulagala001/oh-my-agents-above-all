import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './fixtures/client-build.mjs';
import { chromium } from 'playwright';

test('composer preset controls hide child scopes and reject stale session navigation', async t => {
  const bundle = await build({ stdin: { contents: `
    export { ComposerChips } from './src/client/composer-chips.jsx';
    export { default as React } from 'react';
    export { createRoot } from 'react-dom/client';
    export { flushSync } from 'react-dom';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'composerFixture', target: 'es2022' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(); await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const { React, createRoot, flushSync, ComposerChips } = composerFixture;
    let state = { sessionId: 'parent', data: { product: { id: 'pi', name: 'Pi' }, mode: 'default' } }, mounted = 'parent';
    const listeners = new Set(), mountedListeners = new Set(), opened = [];
    const settings = { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const sidebarRight = { mounted: { getSnapshot: () => mounted, subscribe: fn => { mountedListeners.add(fn); return () => mountedListeners.delete(fn); } }, openTabIn: (...args) => opened.push(args) };
    const appearance = {};
    const runtime = { getSnapshot: () => appearance, subscribe: () => () => {} };
    const root = createRoot(document.getElementById('app'));
    const render = id => flushSync(() => root.render(React.createElement(ComposerChips, { settings, sidebarRight, sessionId: id, getThemeRuntime: () => runtime })));
    const button = () => document.querySelector('.omaa-preset-chip');
    const result = {};
    render('child'); result.childHidden = !button();
    render('grandchild'); result.descendantHidden = !button();
    render(undefined); result.missingScopeHidden = !button();
    render('parent'); result.mainShown = Boolean(button());
    const staleClick = Object.entries(button()).find(([key]) => key.startsWith('__reactProps$'))[1].onClick;
    flushSync(() => button().click());
    mounted = 'other'; flushSync(() => { for (const fn of mountedListeners) fn(); });
    result.mountMismatchHidden = !button(); staleClick();
    mounted = 'parent'; state = { ...state, sessionId: 'other' };
    flushSync(() => { for (const fn of listeners) fn(); for (const fn of mountedListeners) fn(); });
    result.settingsMismatchHidden = !button(); staleClick();
    result.opened = opened;
    root.unmount(); result.listeners = listeners.size + mountedListeners.size;
    return result;
  });
  for (const flag of ['childHidden', 'descendantHidden', 'missingScopeHidden', 'mainShown', 'mountMismatchHidden', 'settingsMismatchHidden']) assert.equal(result[flag], true, flag);
  assert.deepEqual(result.opened, [['parent', 'omaa-preset']]);
  assert.equal(result.listeners, 0);
});
