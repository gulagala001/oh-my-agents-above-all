import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installedHost, fixtureEnvironment, until, textReply, toolReply } from './fixtures/installed-host.mjs';
import { products } from '../src/shared/products.mjs';

const modelText = payload => payload.messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : message.content.map(part => part.text ?? '').join('\n')).join('\n');
const toolsOf = payload => new Set(payload.tools?.map(tool => tool.function.name) ?? []);
const markerRequest = (fixture, marker, after = 0) => fixture.requests.slice(after).find(payload => payload.tools?.length && JSON.stringify(payload.messages).includes(marker));
// Dynamic source text (e.g. Grok scratch_dir) must use the installed host's
// isolated environment, not the test runner's HOME or temporary directory.
function expectedPrompt(f, id, tools) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync } from 'node:fs';
    const { url, tools, ...context } = JSON.parse(readFileSync(0, 'utf8'));
    const { buildPrompt } = await import(url);
    process.stdout.write(buildPrompt({ ...context, tools: new Set(tools) }));
  `], { input: JSON.stringify({ url: new URL('../src/presets/' + id + '/prompt.mjs', import.meta.url).href,
    tools: [...tools], cwd: f.workspace, platform: process.platform }),
    env: fixtureEnvironment(f.home, f.evidence.isolation.safeEnvironment), encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
}


test('packed presets run on original DSH, preserve native tool/session lifecycle and mode guards', { timeout: 300000 }, async t => {
  const f = await installedHost(t);
  await mkdir(join(f.home, 'skills', 'native-fixture'), { recursive: true });
  await writeFile(join(f.home, 'skills', 'native-fixture', 'SKILL.md'), '---\nname: native-fixture\ndescription: Native OMAA integration fixture instructions\n---\nNATIVE_SKILL_CONTENT: preserve the fixture instruction.\n');
  await f.boot();
  const stock = await f.create('standard');
  // An unmodified host may keep a literal stock default in its composition.
  // Use the native model selector before making any pre-install request.
  assert.deepEqual((await f.rpc('session/selectModel', { sessionId: stock.sessionId, provider: 'fixture', model: 'fixture' })).selected,
    { provider: 'fixture', model: 'fixture' });
  await f.prompt(stock.sessionId, 'STOCK_BEFORE_INSTALL');
  const stockBefore = markerRequest(f, 'STOCK_BEFORE_INSTALL');
  assert(stockBefore); assert(!modelText(stockBefore).includes('Pi Coding Agent preset'));
  t.diagnostic('Stock provider tools: ' + [...toolsOf(stockBefore)].join(', '));
  await f.stop();
  const packed = await f.install();
  assert(packed.files.some(file => file.path === 'src/presets/grok/sources/crates/codegen/xai-grok-agent/templates/prompt.md'));
  assert(packed.files.some(file => file.path === 'src/presets/pi/sources/packages/coding-agent/src/core/system-prompt.ts'));
  assert(!packed.files.some(file => /(?:AGENTS|PROMPT_MAINTENANCE|COMPUTER_USE_HANDOFF)\.md$/.test(file.path)));
  await f.boot();
  const sessions = {};
  for (const product of products) {
    const created = await f.create(product.preset); sessions[product.id] = created.sessionId;
    const preferences = await f.api(created.sessionId);
    assert.equal(preferences.status, 200); assert.equal(preferences.value.product.id, product.id);
    assert.equal(preferences.value.enhancement, false); assert.equal(preferences.value.enhancementActive, false);
    const marker = 'PRESET_PROBE_' + product.id, from = f.requests.length;
    await f.prompt(created.sessionId, marker);
    const payload = markerRequest(f, marker, from); assert(payload, product.id + ' never reached loopback model');
    const tools = toolsOf(payload);
    const complete = expectedPrompt(f, product.id, tools);
    assert(modelText(payload).includes(complete), product.id + ' complete adapted source prompt missing from actual provider payload');
    for (const name of ['read', 'write', 'edit', process.platform === 'win32' ? 'pwsh' : 'bash']) assert(tools.has(name), product.id + ': missing ' + name + '; provider tools: ' + [...tools].join(', '));
    if (product.id === 'pi') {
      assert.deepEqual([...tools].sort(), ['read', 'write', 'edit', 'read_image', 'skill', process.platform === 'win32' ? 'pwsh' : 'bash',
        ...toolsOf(stockBefore).has('working_directory') ? ['working_directory'] : []].sort(), 'Pi keeps its core tools and the same host image, skill and directory capabilities');
      assert.equal((await f.api(created.sessionId, { mode: 'plan' })).status, 400);
    } else for (const name of ['todo_write', 'ask_user_question', 'enter_plan_mode', 'exit_plan_mode']) assert(tools.has(name), product.id + ': ' + name);
  }
  const pi = sessions.pi;
  let phase = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    if (phase++ === 0) return toolReply('write', { file_path: 'native-cycle.txt', content: 'NATIVE_DSH_SENTINEL' });
    if (phase === 2) return toolReply('read', { file_path: 'native-cycle.txt' });
    return textReply('Native read/write cycle completed.');
  });
  const native = await f.prompt(pi, 'NATIVE_READ_WRITE');
  assert.equal(await f.readWorkspace('native-cycle.txt'), 'NATIVE_DSH_SENTINEL');
  assert(JSON.stringify(native.records).includes('NATIVE_DSH_SENTINEL'), 'native tool result was not persisted');
  assert(markerRequest(f, 'NATIVE_READ_WRITE').tools);
  let skillPhase = 0;
  f.replyWith(payload => payload.tools?.length && skillPhase++ === 0 ? toolReply('skill', { name: 'native-fixture' }) : textReply('Native skill loaded.'));
  const skillResult = await f.prompt(pi, 'NATIVE_SKILL_LOAD');
  assert(JSON.stringify(skillResult.records).includes('NATIVE_SKILL_CONTENT'), 'Pi must load the actual native skill body');
  f.replyWith();

  const grok = sessions.grok;
  for (const mode of ['ask', 'plan']) {
    assert.equal((await f.api(grok, { mode })).status, 200);
    let attempted = 0;
    f.replyWith(payload => {
      if (!payload.tools?.length) return;
      if (attempted++ === 0) return toolReply('write', { file_path: mode + '-blocked.txt', content: 'must-not-write' });
      if (attempted === 2) return toolReply(process.platform === 'win32' ? 'pwsh' : 'bash', { description: 'Exercise the read-only command guard', command: `node -e "require('fs').writeFileSync('${mode}-command-blocked.txt','must-not-write')"` });
      return textReply('Guard inspected.');
    });
    const blocked = await f.prompt(grok, mode.toUpperCase() + '_GUARD');
    await assert.rejects(readFile(join(f.workspace, mode + '-blocked.txt')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(f.workspace, mode + '-command-blocked.txt')), { code: 'ENOENT' });
    assert.match(JSON.stringify(blocked.records), /permits reading|switch to default/);
    f.replyWith();
  }
  const planned = await f.api(grok); assert.equal(planned.status, 200, JSON.stringify(planned)); assert.equal(planned.value.mode, 'plan');
  const planSnapshot = await f.snapshot(grok);
  assert(JSON.stringify(planSnapshot.records).includes('plan/mode'), 'plan mode not in native journal');
  const journalCursor = planSnapshot.projections.asOfSeq;
  await f.stop(); await f.boot();
  const restored = await f.api(grok); assert.equal(restored.status, 200, JSON.stringify(restored)); assert.equal(restored.value.mode, 'plan'); assert.equal(restored.value.enhancement, false);
  const recovered = await f.snapshot(grok); assert(recovered.projections.asOfSeq >= journalCursor);
  await f.api(grok, { mode: 'default' });
  const from = f.requests.length;
  await f.prompt(grok, 'COLD_RESTORE_CONTINUE');
  assert(markerRequest(f, 'COLD_RESTORE_CONTINUE', from), 'cold resumed session did not return to native model loop');

  const release = f.holdNextReply(), heldFrom = f.requests.length;
  await f.send(pi, 'STOP_NATIVE_STREAM');
  await until(() => markerRequest(f, 'STOP_NATIVE_STREAM', heldFrom));
  assert.equal((await f.api(pi)).value.running, true);
  await f.rpc('session/cancel', { sessionId: pi });
  release();
  await until(async () => !(await f.api(pi)).value.running);
  const stopped = await f.snapshot(pi);
  assert.equal(stopped.records.findLast(record => record.event?.type === 'turn/end')?.event.data.reason.kind, 'aborted', 'stop must commit an aborted native turn');
  await f.prompt(pi, 'AFTER_NATIVE_STOP');
  const ordinaryFrom = f.requests.length;
  await f.prompt(stock.sessionId, 'STOCK_AFTER_INSTALL');
  const stockAfter = markerRequest(f, 'STOCK_AFTER_INSTALL', ordinaryFrom); assert(stockAfter);
  const stockBeforeText = modelText(stockBefore), stockAfterText = modelText(stockAfter);
  assert.equal(stockAfterText.split('\n\n')[0], stockBeforeText.split('\n\n')[0], 'ordinary DSH identity was changed by OMAA installation');
  const sectionHeadings = text => text.split('\n').filter(line => /^#{1,3} |^<[\w:-]+>/.test(line));
  assert.deepEqual(sectionHeadings(stockAfterText), sectionHeadings(stockBeforeText), 'ordinary DSH core sections changed');
  for (const product of products) {
    assert(!stockAfterText.includes(expectedPrompt(f, product.id, toolsOf(stockAfter))), 'ordinary DSH acquired an OMAA product persona');
  }
  assert.deepEqual([...toolsOf(stockAfter)].sort(), [...toolsOf(stockBefore)].sort(), 'ordinary DSH tools changed');
  assert.deepEqual(f.errors, []);
  await f.stop(); await f.uninstall(); await f.boot();
  const uninstalledFrom = f.requests.length;
  await f.prompt(stock.sessionId, 'STOCK_AFTER_UNINSTALL');
  const afterUninstall = markerRequest(f, 'STOCK_AFTER_UNINSTALL', uninstalledFrom);
  assert.deepEqual([...toolsOf(afterUninstall)].sort(), [...toolsOf(stockBefore)].sort(), 'uninstall must restore native tools');
  assert.equal(modelText(afterUninstall).split('\n\n')[0], stockBeforeText.split('\n\n')[0], 'uninstall must restore native identity');
  assert(!modelText(afterUninstall).includes('Pi Coding Agent preset'));
  if (process.env.OMAA_PRESETS_EVIDENCE) await writeFile(process.env.OMAA_PRESETS_EVIDENCE, JSON.stringify({
    at: new Date().toISOString(), host: f.evidence.version, artifactSha256: f.evidence.artifact?.sha256,
    checked: ['native stock model selection', 'five complete prompts and native tools', 'native skill loading', 'Ask/Plan write and command guards', 'cold mode restore', 'stop and continue', 'stock identity/tools preserved after install/uninstall'],
    stockTools: [...toolsOf(stockBefore)].sort(),
  }, null, 2) + '\n');
});
