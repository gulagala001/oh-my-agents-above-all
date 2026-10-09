import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const bundle = await build({ stdin: { resolveDir: root, contents: `
  export { GitReview } from './src/client/git-review.jsx';
  export { default as React } from 'react';
  export { createRoot } from 'react-dom/client';
` }, bundle: true, write: false, format: 'iife', globalName: 'reviewFixture', platform: 'browser',
  plugins: [{ name: 'css-text', setup(b) { b.onLoad({ filter: /\.css$/ }, async () => ({ contents: 'export default ""', loader: 'js' })); } }],
});

test('Codex explains only the native non-Git failure and retains exact expandable diagnostics', { timeout: 30000 }, async t => {
  const evidence = resolve(process.env.OMAA_GIT_ERROR_EVIDENCE_DIR || 'work/rea-upgrade/frontend-015/git-error/component');
  await mkdir(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  t.after(async () => { if (!page.isClosed()) { await page.screenshot({ path: resolve(evidence, 'final.png') }); await writeFile(resolve(evidence, 'body.txt'), await page.locator('body').innerText()); } });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="app"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const native = 'fatal: not a git repository (or any of the parent directories): .git';
  await page.evaluate(native => {
    const { React, createRoot, GitReview } = reviewFixture;
    let failure = { error: native, code: 'GIT_FAILED' };
    window.setReviewResponse = value => { failure = value; };
    window.reviewRequests = [];
    window.fetch = async (url, options) => { window.reviewRequests.push({ url, method: options.method || 'GET' }); return new Response(JSON.stringify(failure), { status: failure.error ? 400 : 200 }); };
    const state = { sessionId: 'synthetic-codex', data: { product: { id: 'codex' }, mode: 'default', running: false } };
    const settings = { getSnapshot: () => state, subscribe: () => () => {} };
    createRoot(document.getElementById('app')).render(React.createElement(GitReview, { settings, sidebarRight: {}, sessions: {} }));
  }, native);
  const region = page.getByRole('region', { name: 'Codex Git 审阅' });
  await region.getByText('当前目录不属于 Git 仓库；选择仓库后审阅。', { exact: true }).waitFor({ timeout: 3000 });
  const details = region.locator('details'); assert.equal(await details.getAttribute('open'), null);
  await details.getByText('原始 Git 诊断', { exact: true }).click();
  assert.equal(await details.locator('pre').innerText(), native);
  assert.equal(await region.getByRole('button', { name: /暂存|撤回/ }).count(), 0);
  for (const failure of [
    { error: 'fatal: ambiguous argument HEAD: unknown revision', code: 'GIT_FAILED' },
    { error: native, code: 'permission-denied' },
    { error: 'request failed before Git: ' + native, code: 'GIT_FAILED' },
  ]) {
    await page.evaluate(value => setReviewResponse(value), failure); await region.getByRole('button', { name: '刷新', exact: true }).click();
    await region.getByRole('alert').filter({ hasText: failure.error }).waitFor();
    assert.equal(await details.count(), 0, 'Other failures keep the original error presentation');
  }
  await page.evaluate(() => setReviewResponse({ sessionId: 'synthetic-codex', scope: 'unstaged', revision: 'now-valid', root: '/synthetic/repo', total: 0, added: 0, deleted: 0, files: [] }));
  await region.getByRole('button', { name: '刷新', exact: true }).click(); await region.getByText('此范围没有改动。', { exact: true }).waitFor();
  assert.equal(await region.getByRole('alert').count(), 0);
  assert.deepEqual(await page.evaluate(() => reviewRequests.map(row => row.method)), ['GET','GET','GET','GET','GET']);
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'verification.json'), JSON.stringify({ verified: true, scope: 'Synthetic CFT component; Native is verified separately', originalDiagnosticExact: true, unrelatedErrorsUnchanged: true, refreshedSuccessClearsError: true, errors }, null, 2) + '\n');
});
