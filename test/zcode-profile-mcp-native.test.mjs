import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { installedHost, toolReply, textReply, until } from './fixtures/installed-host.mjs';
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const results = page => page.records.filter(row => row.event?.type === 'tool/result').map(row => row.event.data.message);

test('profile model and owned MCP grants survive native cold continuation without extra connections', { timeout: 120000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['zcode'] });
  const profiles = join(f.workspace, 'profiles'), audit = join(f.root, 'mcp.jsonl');
  await mkdir(profiles, { recursive: true });
  await mkdir(join(f.workspace, '.zcode/skills/review-only'), { recursive: true });
  await writeFile(join(f.workspace, '.zcode/skills/review-only/SKILL.md'), '---\nname: review-only\ndescription: Selected fixture skill\n---\nSELECTED_SKILL_BODY\n');
  await writeFile(join(f.workspace, 'input.txt'), 'NATIVE_READ_RESULT');
  await writeFile(join(f.workspace, 'AGENTS.md'), 'PARENT_INSTRUCTIONS');
  for (const name of ['reader', 'planner']) await writeFile(join(profiles, name + '.md'), `---\nname: ${name}\ndescription: Selected MCP profile\nmodel: fixture/profile-model\nthoughtLevel: high\ntools: Read, mcp__notes__*\ndisallowedTools: mcp__notes__private_note\nskills: review-only\nmcpServers: [notes]\n${name === 'planner' ? 'permissionMode: plan' : 'injectAgentsMd: false'}\n---\nMCP_PROFILE_${name} {literal}\n`);
  await writeFile(join(profiles, 'inherited.md'), '---\nname: inherited\ndescription: Inherit owned MCP\ntools: *\ndisallowedTools: mcp__notes__private_note, mcp__other__private_note\ninjectAgentsMd: false\n---\nMCP_PROFILE_inherited\n');
  await writeFile(join(profiles, 'empty.md'), '---\nname: empty\ndescription: No MCP\ntools: Read\nmcpServers: []\ninjectAgentsMd: false\n---\nMCP_PROFILE_empty\n');
  await writeFile(join(profiles, 'missing.md'), '---\nname: missing\ndescription: Missing owned server\nmcpServers: [unknown]\n---\nMISSING_MUST_NOT_RUN\n');
  await f.install();
  const patch = join(f.home, 'profiles/omaa-fixture/cordis.patch.yml');
  const rows = [{ insert: ['notes', 'other'].map(serverName => ({ id: 'fixture-mcp-' + serverName,
    name: 'oh-my-agents-above-all/zcode-owned-mcp-client', config: { transport: 'stdio', serverName, command: process.execPath,
      args: [fileURLToPath(new URL('./fixtures/profile-mcp-server.mjs', import.meta.url)), audit, serverName] } })) }];
  rows[0].insert.push({ id: 'fixture-mcp-rogue', name: new URL('../node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js', import.meta.url).href,
    config: { ...rows[0].insert[0].config, serverName: 'rogue', args: [...rows[0].insert[0].config.args.slice(0, -1), 'rogue'] } });
  await writeFile(patch, JSON.stringify(rows));
  const settingsPath = join(f.home, 'settings.yaml'), settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  settings['llm-pi-ai'].providers.fixture.models.push({ ...settings['llm-pi-ai'].providers.fixture.models[0], id: 'profile-model', name: 'Pinned profile model', reasoningEfforts: { high: 'high' } });
  await writeFile(settingsPath, JSON.stringify(settings));
  await f.boot();
  const registered = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  assert.equal((await f.api(sessionId, { agentProfileDirectory: { root: profiles } })).status, 200);
  const connectionCount = async () => (await readFile(audit, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(row => row.kind === 'start' && row.server === 'notes').length;
  const initialConnections = await connectionCount();
  let nextCall, phase = 'initial';
  const counts = new Map(), observed = [];
  f.replyWith(request => {
    if (!request.tools?.length) {
      if (JSON.stringify(request.messages).includes('MCP_PROFILE_')) throw Error('Child has no tools: ' + JSON.stringify(request));
      return textReply('Synthetic fixture title');
    }
    const system = request.messages.filter(message => ['system', 'developer'].includes(message.role)).map(textOf).join('\n');
    const child = system.match(/MCP_PROFILE_(reader|planner|empty|inherited)/)?.[1];
    if (!child) { const call = nextCall; nextCall = undefined; return call ? toolReply(call.name, call.args) : textReply('PARENT_DONE'); }
    const names = request.tools.map(tool => tool.function.name);
    assert(!system.includes('SERVER_INSTRUCTION_rogue'));
    assert(!names.some(name => ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(name)));
    if (child !== 'inherited') assert(!system.includes('SERVER_INSTRUCTION_other'));
    if (child === 'empty') assert(!system.includes('SERVER_INSTRUCTION_notes'));
    assert(!names.includes('mcp__rogue__read_note') && !names.includes('mcp__notes__private_note'));
    assert.equal(names.includes('mcp__other__read_note'), child === 'inherited');
    if (['reader', 'planner'].includes(child)) {
      assert.equal(request.model, 'profile-model');
      assert.equal(request.reasoning_effort, 'high');
      assert.match(system, /\{literal\}/);
      assert(names.includes('mcp__notes__read_note') && names.includes('read') && names.includes('skill'), JSON.stringify(names));
    } else if (child === 'empty') assert(!names.some(name => name.startsWith('mcp__')));
    observed.push({ child, phase, model: request.model, effort: request.reasoning_effort, tools: names });
    const key = child + ':' + phase, n = counts.get(key) ?? 0; counts.set(key, n + 1);
    if (n === 0) return toolReply(['empty', 'inherited'].includes(child) ? 'mcp__notes__read_note' : 'skill', ['empty', 'inherited'].includes(child) ? {} : { name: 'review-only' });
    if (n === 1) return toolReply('read', { file_path: join(f.workspace, 'input.txt') });
    if (n === 2) return toolReply('mcp__notes__read_note', {});
    if (n === 3) return toolReply('mcp__notes__private_note', {});
    if (n === 4) return toolReply('mcp__other__read_note', {});
    if (n === 5) return toolReply('mcp__rogue__read_note', {});
    if (n === 6) return toolReply('read_mcp_resource', { server: 'rogue', uri: 'fixture://private' });
    return textReply('PROFILE_RESULT_' + child + '_' + phase);
  });
  const call = async (name, args) => {
    nextCall = { name, args };
    const page = await f.prompt(sessionId, 'Execute the next profile fixture operation.', { timeout: 45000 });
    assert.equal(nextCall, undefined); return results(page).at(-1);
  };
  const childPage = async childSessionId => {
    const projections = await f.rpc('session/projections', { sessionId: childSessionId });
    return f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 150 });
  };
  const children = [];
  const discovery = await call('zcode_agent', {});
  assert(!discovery.isError, textOf(discovery));
  assert.match(textOf(discovery), /mcpServers/);
  for (const profile of ['reader', 'planner', 'empty', 'inherited']) {
    const result = await call('zcode_agent', { profile, prompt: 'Read the selected skill, file and MCP note.' });
    assert(!result.isError, textOf(result) + '\n' + JSON.stringify(f.errors));
    const receipt = JSON.parse(result.content[0].text); children.push({ profile, id: receipt.subagentId });
    const page = await childPage(receipt.subagentId), replies = results(page);
    assert(replies.some(row => !row.isError && textOf(row).includes('NATIVE_READ_RESULT')), JSON.stringify({profile, replies, observed}));
    if (['reader', 'planner'].includes(profile)) {
      assert(replies.some(row => !row.isError && textOf(row).includes('SELECTED_SKILL_BODY')));
      if (profile === 'reader') assert(replies.some(row => !row.isError && textOf(row).includes('MCP_RESULT_notes_read_note')));
      // Native Plan may refuse MCP; borrowing must never bypass that guard.
    }
    assert(replies.filter(row => row.isError).length >= (profile === 'inherited' ? 1 : 2));
    assert.equal(page.records.filter(row => row.event?.type === 'plugin:omaa/zcode/profile-mcp-admission').length, 1);
    if (profile === 'planner') assert(page.records.some(row => row.event?.type === 'plan/mode' && row.event.data.active));
  }
  assert((await call('zcode_agent', { profile: 'missing', prompt: 'Must not run.' })).isError);
  assert(!(await call('mcp__other__read_note', {})).isError, 'child teardown must not close the parent connection');
  assert.equal(await connectionCount(), initialConnections, 'child work must not open new connections');
  await f.crash(); await f.boot(); phase = 'cold';
  // Native startup/HMR owns any connection preparation; children must add none.
  await until(async () => (await connectionCount()) > initialConnections);
  const coldConnections = await connectionCount();
  for (const { id, profile } of children) {
    assert(!(await call('send_message', { agent_id: id, message: 'COLD_MCP_CONTINUE' })).isError);
    await until(async () => JSON.stringify(await childPage(id)).includes('PROFILE_RESULT_' + profile + '_cold'), 30000);
  }
  const lines = (await readFile(audit, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(await connectionCount(), coldConnections, 'cold child restoration must borrow the existing parent connection');
  assert(!lines.some(row => row.kind === 'call' && row.tool === 'private_note'));
  await f.crash();
  // Native configuration may migrate legacy settings into this patch. Keep
  // those provider entries when changing the one fixture server declaration.
  const currentPatch = load(await readFile(patch, 'utf8'));
  let changed = false;
  const update = value => {
    if (!value || typeof value !== 'object') return;
    if (value.id === 'fixture-mcp-notes') { value.config.toolCallTimeoutMs = 12345; changed = true; }
    else for (const child of Object.values(value)) update(child);
  };
  update(currentPatch); assert(changed); await writeFile(patch, JSON.stringify(currentPatch));
  await f.boot(); phase = 'drift';
  const rejected = await call('send_message', { agent_id: children[0].id, message: 'MUST_NOT_REBIND_CHANGED_DECLARATION' });
  assert(rejected.isError, textOf(rejected));
  assert(!observed.some(row => row.phase === 'drift'));
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_PROFILE_MCP_EVIDENCE) await writeFile(process.env.OMAA_PROFILE_MCP_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), host: f.evidence.version,
    children, observed, checks: ['native profile model route and effort', 'owned stdio MCP calls', 'native file and selected skill coexistence', 'denied tools and servers', 'empty MCP selection', 'plan gate retained', 'parent connection retained', 'cold continuation with frozen grant', 'changed declaration refused'], externalModelCalls: 0 }, null, 2) + '\n');
});
