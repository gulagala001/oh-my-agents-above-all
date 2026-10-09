import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { installedHost, until } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

test('five native product chips lock settings while running and recover after actual Stop and cold reload', { timeout: 180000, skip: !process.env.OMAA_TEST_HOST_PACKAGE && 'Explicit frozen host-matching package is required for native frontend acceptance.' }, async t => {
  assert(process.env.OMAA_TEST_HOST_PACKAGE, 'Frozen host-matching OMAA package required');
  const directory = resolve(process.env.OMAA_RUNNING_EVIDENCE_DIR || 'work/rea-upgrade/frontend-015/native-running'); await mkdir(directory, { recursive: true });
  let f, browser, page, release, verified = false; const checks = [], errors = [];
  t.after(async () => {
    release?.();
    if (page && !page.isClosed()) await page.screenshot({ path: join(directory, verified ? 'final.png' : 'failure.png') });
    await browser?.close(); await writeFile(join(directory, 'verification.json'), JSON.stringify({ verified, fixture: f?.evidence, checks, errors }, null, 2) + '\n');
  });
  f = await installedHost(t, { safeEnvironment: true });
  t.after(async () => { await assert.rejects(access(f.root), { code: 'ENOENT' }); assert(f.evidence.cleanup.stopReceipts.every(row => !row.forced)); await writeFile(join(directory, 'cleanup.json'), JSON.stringify(f.evidence.cleanup, null, 2) + '\n'); });
  if (process.env.OMAA_TEST_HOST_PACKAGE_SHA256) assert.equal(f.evidence.artifact.sha256, process.env.OMAA_TEST_HOST_PACKAGE_SHA256);
  await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace }), ids = {};
  for (const product of products) {
    const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: product.preset }); ids[product.id] = sessionId;
    await f.prompt(sessionId, `Owned initial ${product.id}`); await f.rpc('session/rename', { sessionId, title: `Running ${product.name}` });
  }
  browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain','--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0,at), value: value.slice(at+1), url: f.origin }; }));
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(f.origin); await page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }).click();
  for (const product of products) {
    const sessionId = ids[product.id];
    await page.getByText(`Running ${product.name}`, { exact: true }).first().click();
    const chip = page.getByRole('button', { name: `${product.name} 预设设置`, exact: true }); await chip.click();
    const panel = page.getByRole('region', { name: 'Oh My Agents Above All 预设设置', exact: true });
    await until(async () => await panel.getByLabel('会话主题', { exact: true }).isEnabled());
    const before = (await f.snapshot(sessionId)).projections.asOfSeq;
    release = f.holdNextReply(); await f.send(sessionId, `Owned running state ${product.id}`);
    await until(async () => (await f.api(sessionId)).value.running === true);
    await page.waitForFunction(() => document.querySelector('.omaa-preset-chip')?.dataset.state === 'running');
    assert.equal(await panel.getByLabel('会话主题', { exact: true }).isDisabled(), true);
    if (product.id !== 'pi') assert.equal(await panel.getByLabel('工作模式', { exact: true }).isDisabled(), true);
    await page.screenshot({ path: join(directory, `${product.id}-running.png`) });
    await page.getByRole('button', { name: /^(Stop generating|停止生成)$/, exact: true }).click(); release(); release = undefined;
    await until(async () => !(await f.api(sessionId)).value.running);
    await until(async () => await panel.getByLabel('会话主题', { exact: true }).isEnabled());
    assert.equal(await chip.getAttribute('data-state'), 'ready');
    const stopped = await f.snapshot(sessionId), end = stopped.records.findLast(row => row.event?.type === 'turn/end' && row.event.seq > before)?.event;
    assert(end, product.id + ': native turn settlement exists');
    await page.reload(); await page.locator(`html[data-omaa-theme="${product.theme}"]`).waitFor();
    await page.getByRole('button', { name: `${product.name} 预设设置`, exact: true }).click();
    await until(async () => await panel.getByLabel('会话主题', { exact: true }).isEnabled());
    assert.equal(await page.locator('.omaa-preset-chip').getAttribute('data-state'), 'ready');
    checks.push({ product: product.id, nativeStop: true, runningGuard: true, settledTurn: end.data, coldReload: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []); verified = true;
});
