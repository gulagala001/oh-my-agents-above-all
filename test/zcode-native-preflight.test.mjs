import test from 'node:test';
import assert from 'node:assert/strict';
import { installedHost, toolReply, textReply } from './fixtures/installed-host.mjs';
import { launchChromium } from './fixtures/browser.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');

// Actual DSH/Cordis/FS/storage/HTTP/UI, scripted localhost model receipts only.
// This deliberately never admits a PTC program: full execution acceptance is
// separately reported blocked when the cloud host has no usable sandbox.
test('isolated native ZCode saves and reads definitions, rejects invalid code before execution, and loads the application', { timeout: 60000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  await f.install(); await f.boot();
  const registered = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  async function callTool(name, args, skill = false) {
    const plan = [...(skill ? [{ name: 'skill', args: { name: 'zcode-workflows' } }] : []), { name, args }];
    f.replyWith(request => {
      if (!request.tools?.length) return textReply('Offline preflight title');
      const next = plan.shift(); return next ? toolReply(next.name, next.args) : textReply('Offline preflight finished.');
    });
    const snapshot = await f.prompt(sessionId, 'Explicit offline preflight: ' + name);
    assert.equal(plan.length, 0);
    const call = snapshot.records.findLast(row => row.event?.type === 'tool/call' && row.event.data.name === name)?.event;
    const result = snapshot.records.find(row => row.event?.type === 'tool/result' && row.event.data.message?.toolCallId === call?.data.callId)?.event;
    assert(result, 'native tool must return: ' + name);
    assert.equal(result.data.message.isError, false, textOf(result.data.message));
    return JSON.parse(textOf(result.data.message));
  }
  const saved = await callTool('save_workflow', { name: 'offline-preflight', scope: 'project', description: 'Synthetic offline definition', facade: 'zcode', script: 'return args;' }, true);
  assert.equal(saved.ok, true); assert.equal(saved.overwritten, false);
  const listed = await callTool('list_saved_workflows', { scope: 'project' });
  assert(listed.workflows.some(row => row.name === 'offline-preflight'));
  const loaded = await callTool('read_saved_workflow', { name: 'offline-preflight', scope: 'project' });
  assert.equal(loaded.script, '// @omaa-workflow-facade: zcode\nreturn args;'); assert.match(loaded.sourceSha256, /^[a-f0-9]{64}$/);
  const invalid = await callTool('create_workflow', { script: 'const broken: = ;', run_in_background: false });
  assert.equal(invalid.ok, false); assert(invalid.diagnostics.length > 0); assert.equal(invalid.runId, undefined);
  const unknownModel = await callTool('create_workflow', { script: 'return 1;', subagent_model: 'missing-offline-provider/no-model', run_in_background: false });
  assert.equal(unknownModel.ok, false); assert(unknownModel.diagnostics.some(row => row.code === 9011)); assert.equal(unknownModel.runId, undefined);
  // Native automatic titling can finish after the first mocked turn.
  await f.rpc('session/rename', { sessionId, title: 'ZCode offline preflight' });
  const browser = await launchChromium({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies(f.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: f.origin }; }));
  await page.goto(f.origin);
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/, exact: true });
  await welcome.click(); await welcome.waitFor({ state: 'hidden' });
  try {
    await page.getByText('ZCode offline preflight', { exact: true }).first().click({ timeout: 10000 });
    await page.getByText('Offline preflight finished.', { exact: true }).first().waitFor({ timeout: 10000 });
  } catch (error) {
    throw new Error(error.message + '\n' + JSON.stringify({ pageErrors: errors, body: (await page.locator('body').innerText()).slice(-6000) }));
  }
  assert.deepEqual(errors, []); assert.deepEqual(f.errors, []);
  assert.equal(f.evidence.isolation.safeEnvironment, true);
});
