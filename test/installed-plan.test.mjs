import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const probe = (fixture, marker, from = 0) => fixture.requests.slice(from).filter(payload => payload.tools?.length && JSON.stringify(payload.messages).includes(marker));
const waitIdle = (fixture, id) => until(async () => !(await fixture.api(id)).value.running);
const missing = file => assert.rejects(readFile(file), { code: 'ENOENT' });

test('native browser plan review and questions settle real DSH tools without premature writes', { timeout: 180000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const created = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-cursor' });
  const id = created.sessionId;
  await f.prompt(id, 'Initialize the native browser fixture without changing files.');
  await f.rpc('session/rename', { sessionId: id, title: 'Native plan approval fixture' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  t.after(async () => { if (!t.passed && !page.isClosed()) { t.diagnostic((await page.locator('body').innerText()).slice(-3500)); t.diagnostic(JSON.stringify(errors)); } });
  t.after(() => browser.close());
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.waitFor({ state: 'visible' }); await welcome.click();
  await page.getByText('Native plan approval fixture', { exact: true }).first().click();
  await page.locator('html[data-omaa-theme="cursor-cli"]').waitFor();

  await t.test('Request changes keeps Plan read-only, then Approve permits the next actual write', async () => {
    assert.equal((await f.api(id, { mode: 'ask' })).status, 200);
    let phase = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (phase++ === 0) return toolReply('enter_plan_mode', {});
      if (phase === 2) return toolReply('exit_plan_mode', { plan: '# Review before implementation\n\nWrite only after this plan is approved.' });
      if (phase === 3) return toolReply('write', { file_path: 'keep-planning-blocked.txt', content: 'must not exist' });
      return textReply('Planning was retained and the attempted write was rejected.');
    });
    const declinedFrom = f.requests.length;
    await f.send(id, 'PLAN_KEEP_NATIVE');
    const review = page.locator('[data-plan-review-key]');
    await review.getByRole('button', { name: /^(Approve|同意执行)$/, exact: true }).waitFor();
    assert.equal((await f.api(id)).value.running, true); assert.equal((await f.api(id)).value.mode, 'plan');
    await missing(join(f.workspace, 'keep-planning-blocked.txt'));
    assert.equal(probe(f, 'PLAN_KEEP_NATIVE', declinedFrom).length, 2, 'Ask-to-Plan entry precedes review; review must then pause the tool');
    await review.getByRole('button', { name: /^(Request changes|要求修改)$/, exact: true }).click();
    await waitIdle(f, id);
    assert.equal((await f.api(id)).value.mode, 'plan'); await missing(join(f.workspace, 'keep-planning-blocked.txt'));
    assert(probe(f, 'PLAN_KEEP_NATIVE', declinedFrom).some(payload => JSON.stringify(payload.messages).includes('switch to default mode')), 'kept plan must reject a real write dispatch');

    phase = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (phase++ === 0) return toolReply('exit_plan_mode', { plan: '# Approved implementation\n\nCreate approved-native.txt after approval.' });
      if (phase === 2) return toolReply('write', { file_path: 'approved-native.txt', content: 'NATIVE_PLAN_APPROVED' });
      return textReply('Approved native implementation completed.');
    });
    const approvedFrom = f.requests.length;
    await f.send(id, 'PLAN_APPROVE_NATIVE');
    await review.getByRole('button', { name: /^(Approve|同意执行)$/, exact: true }).waitFor();
    await missing(join(f.workspace, 'approved-native.txt'));
    assert.equal((await f.api(id)).value.mode, 'plan');
    await review.getByRole('button', { name: /^(Approve|同意执行)$/, exact: true }).click();
    await waitIdle(f, id);
    assert.equal((await f.api(id)).value.mode, 'default');
    assert.equal(await f.readWorkspace('approved-native.txt'), 'NATIVE_PLAN_APPROVED');
    const requests = probe(f, 'PLAN_APPROVE_NATIVE', approvedFrom);
    assert(requests[1].messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('Plan approved')), 'model must receive the actual approval result before implementation');
    const snapshot = await f.snapshot(id), planEvents = snapshot.records.map(record => record.event).filter(event => event?.type === 'plan/mode');
    assert(planEvents.some(event => event.data.active === true)); assert.equal(planEvents.at(-1).data.active, false);
    f.replyWith();
  });

  await t.test('native question UI holds the tool and sends the selected answer into the resumed model request', async () => {
    let phase = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (phase++ === 0) return toolReply('ask_user_question', { questions: [{ id: 'accent', question: 'Choose the accent for this fixture?', options: [{ label: 'Blue', description: 'Use blue.' }, { label: 'Green', description: 'Use green.' }] }] });
      if (phase === 2) return toolReply('write', { file_path: 'answered-native.txt', content: 'ANSWER_GREEN' });
      return textReply('Selected answer was received and implementation completed.');
    });
    const from = f.requests.length;
    await f.send(id, 'QUESTION_NATIVE_WAIT');
    const question = page.locator('[data-question-key]').filter({ hasText: 'Choose the accent for this fixture?' });
    await question.getByRole('radio', { name: 'Green', exact: true }).waitFor();
    assert.equal((await f.api(id)).value.running, true); await missing(join(f.workspace, 'answered-native.txt'));
    assert.equal(probe(f, 'QUESTION_NATIVE_WAIT', from).length, 1);
    await question.getByRole('radio', { name: 'Green', exact: true }).click();
    await question.getByRole('button', { name: /^(Submit|提交)$/, exact: true }).click();
    await waitIdle(f, id);
    assert.equal(await f.readWorkspace('answered-native.txt'), 'ANSWER_GREEN');
    const requests = probe(f, 'QUESTION_NATIVE_WAIT', from);
    assert(requests[1].messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('Green')), 'next model request must contain the actual selected answer');
    f.replyWith();
  });
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
});
