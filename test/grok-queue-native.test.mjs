import test from 'node:test';
import assert from 'node:assert/strict';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';
import { queueOrder } from '../src/shared/grok-queue.mjs';

test('Grok native queue edits, reorders, cold-restores and sends now through the real dock and agent', { timeout: 120000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['grok', 'pi'] });
  await f.install(); await f.boot();
  const workspace = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: workspace.workspace.workspaceId, agentPreset: 'omaa-grok' });
  await f.rpc('session/rename', { sessionId, title: 'Grok queue flow' });
  const request = async (id = sessionId, body) => {
    const response = await fetch(f.origin + '/omaa-grok/api/queue?session=' + id, {
      headers: { cookie: f.cookie, 'content-type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, value: await response.json() };
  };
  const rows = async () => (await request()).value.lanes['next-turn'];
  const action = (row, kind, extra = {}) => request(sessionId, { itemId: row.id, target: row.target, expected: row.revision, kind, ...extra });
  const release = f.holdNextReply();
  await f.send(sessionId, 'QUEUE_RUNNING');
  await until(() => f.requests.some(value => JSON.stringify(value.messages).includes('QUEUE_RUNNING')));
  await f.send(sessionId, 'QUEUE_A');
  await f.rpc('session/prompt', { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [
    { type: 'text', text: 'QUEUE_B' },
    { type: 'image', mediaType: 'image/png', name: 'one-pixel.png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==' },
  ] });
  await f.send(sessionId, 'QUEUE_C');
  let list = await rows();
  assert.equal((await action(list[1], 'up', { order: queueOrder(list) })).status, 200);
  assert.equal((await action(list[0], 'up', { order: queueOrder(list) })).status, 409);
  list = await rows(); assert.match(JSON.stringify(list[0].content), /QUEUE_B/);
  const original = list[0];
  const image = original.content.find(part => part.type === 'image'); assert(image?.attachment);
  assert.equal((await action(original, 'edit', { text: 'QUEUE_B_UPDATED' })).status, 200);
  assert.deepEqual((await rows())[0].content.find(part => part.type === 'image'), image);
  assert.equal((await action(original, 'edit', { text: 'STALE_OVERWRITE' })).status, 409);
  const pi = await f.create('omaa-pi');
  assert.equal((await request(pi.sessionId)).status, 403);
  await f.crash(); release(); await f.boot();
  list = await rows(); assert.equal(list.length, 3); assert.match(JSON.stringify(list[0].content), /QUEUE_B_UPDATED/);
  await f.rpc('session/rename', { sessionId, title: 'Grok queue flow' });

  const browser = await launchChromium({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { if (!page.isClosed()) { t.diagnostic(JSON.stringify(errors)); t.diagnostic((await page.locator('body').innerText()).slice(-2500)); } });
  await page.context().addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.click(); await welcome.waitFor({ state: 'hidden' });
  await page.getByText('Grok queue flow', { exact: true }).first().click();
  const dock = page.locator('[data-grok-queue]');
  await dock.waitFor({ timeout: 15000 });
  await dock.locator('button[aria-expanded]').click();
  await dock.getByRole('button', { name: /编辑.*消息|Edit queued message/ }).first().click();
  const editor = dock.locator('textarea,input,[contenteditable=true]').first();
  await editor.fill('QUEUE_B_FROM_UI');
  await dock.getByRole('button', { name: /保存.*消息|Save queued message/ }).click();
  await until(async () => JSON.stringify((await rows())[0].content).includes('QUEUE_B_FROM_UI'), 4000).catch(async error => {
    throw Error(error.message + '\n' + JSON.stringify(await rows()) + '\n' + await page.locator('body').innerText() + '\n' + JSON.stringify(errors));
  });
  await dock.locator('li').filter({ hasText: 'QUEUE_B_FROM_UI' }).getByRole('button', { name: '下移消息', exact: true }).click();
  await until(async () => JSON.stringify((await rows())[0].content).includes('QUEUE_A'));

  let wrote = false;
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('queue');
    const user = payload.messages.filter(message => message.role === 'user' && /QUEUE_[ABC]/.test(JSON.stringify(message))).at(-1);
    if (!wrote && JSON.stringify(user).includes('QUEUE_C')) {
      wrote = true; return toolReply('write', { file_path: 'queue-result.txt', content: 'QUEUE_C_EXECUTED' });
    }
    return textReply('Queue task completed.');
  });
  await dock.locator('li').filter({ hasText: 'QUEUE_C' }).getByRole('button', { name: '立即发送（停止当前回合）', exact: true }).click();
  await until(async () => await f.readWorkspace('queue-result.txt').catch(() => '') === 'QUEUE_C_EXECUTED', 5000).catch(async error => {
    throw Error(error.message + '\n' + JSON.stringify({ wrote, events: (await f.snapshot(sessionId)).records.slice(-12), requests: f.requests.slice(-4).map(r => ({ tools: r.tools?.map(t=>t.function.name), messages: r.messages.slice(-4) })) }));
  });
  await until(async () => !(await f.api(sessionId)).value.running && (await rows()).length === 0);
  const events = (await f.snapshot(sessionId)).records.map(row => row.event).filter(Boolean);
  const delivered = events.filter(event => event.type === 'user/message').map(event => event.data.content).filter(content => /QUEUE_[ABC]/.test(JSON.stringify(content)));
  assert.equal(delivered.length, 3);
  assert.match(JSON.stringify(delivered[0]), /QUEUE_C/);
  assert.match(JSON.stringify(delivered[1]), /QUEUE_A/);
  assert.match(JSON.stringify(delivered[2]), /QUEUE_B_FROM_UI/);
  assert.deepEqual(delivered[2].find(part => part.type === 'image'), image);

  let asked = false, resumed = false;
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('queue');
    if (!asked) { asked = true; return toolReply('ask_user_question', { questions: [{ id: 'continue', question: 'QUEUE_WAIT_DECISION?', options: [{ label: 'Continue' }, { label: 'Pause' }] }] }); }
    if (!resumed && payload.messages.some(message => message.role === 'user' && JSON.stringify(message).includes('WAIT_NOW'))) {
      resumed = true; return toolReply('write', { file_path: 'queue-resumed.txt', content: 'WAIT_NOW_EXECUTED' });
    }
    return textReply('Queue resumed.');
  });
  await f.send(sessionId, 'QUEUE_WAIT_START');
  await page.getByText('QUEUE_WAIT_DECISION?', { exact: true }).waitFor();
  await f.send(sessionId, 'WAIT_KEEP'); await f.send(sessionId, 'WAIT_NOW');
  await dock.getByText('等待你的回复或权限决定；排队消息会保留。立即发送会取消当前回合。', { exact: true }).waitFor();
  const collapsed = dock.locator('button[aria-expanded=false]'); if (await collapsed.count()) await collapsed.click();
  await dock.locator('li').filter({ hasText: 'WAIT_NOW' }).getByRole('button', { name: '立即发送（停止当前回合）', exact: true }).click();
  await until(async () => await f.readWorkspace('queue-resumed.txt').catch(() => '') === 'WAIT_NOW_EXECUTED');
  await until(async () => !(await f.api(sessionId)).value.running && (await rows()).length === 0);
  const resumedEvents = (await f.snapshot(sessionId)).records.map(row => row.event).filter(Boolean);
  assert(resumedEvents.some(event => event.type === 'turn/end' && event.data.reason?.kind === 'aborted'));
  assert.equal(resumedEvents.filter(event => event.type === 'user/message' && JSON.stringify(event.data.content).includes('WAIT_KEEP')).length, 1);
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
});
