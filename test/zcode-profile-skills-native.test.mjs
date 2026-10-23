import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, toolReply, textReply, until } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content
  : (message?.content ?? []).map(part => part.text ?? '').join('\n');
const toolResults = snapshot => snapshot.records.filter(row => row.event?.type === 'tool/result').map(row => row.event.data.message);

test('ZCode restricted profile skills load, deny unselected bodies and cold-resume with the same native composition', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true, enabledPresets: ['zcode'] });
  const profiles = join(f.workspace, 'profiles');
  await mkdir(profiles);
  await writeFile(join(f.workspace, 'input.txt'), 'PROFILE_FILE_MARKER\n');
  await writeFile(join(f.workspace, 'AGENTS.md'), 'PROFILE_PARENT_INSTRUCTION\n');
  for (const name of ['review-only', 'unselected']) {
    await mkdir(join(f.workspace, '.zcode/skills', name), { recursive: true });
    await writeFile(join(f.workspace, '.zcode/skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture ${name}\n---\nBODY_${name}\n`);
  }
  for (const [name, extra] of [['reader', 'injectAgentsMd: false'], ['planner', 'permissionMode: plan']])
    await writeFile(join(profiles, name + '.md'), `---\nname: ${name}\ndescription: Restricted ${name}\ntools: Read, Skill\nskills: review-only\n${extra}\n---\nLITERAL_PROFILE_${name} {unexpanded}\n`);
  await f.install(); await f.boot();
  const registered = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  assert.equal((await f.api(sessionId, { agentProfileDirectory: { root: profiles } })).status, 200);
  let nextCall, phase = 'initial';
  const counts = new Map(), observed = [];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Profile fixture title');
    const system = request.messages.filter(message => message.role === 'system').map(textOf).join('\n');
    const child = system.match(/LITERAL_PROFILE_(reader|planner)/)?.[1];
    if (!child) { const call = nextCall; nextCall = undefined; return call ? toolReply(call.name, call.args) : textReply('PARENT_DONE'); }
    assert.match(system, /\{unexpanded\}/);
    assert(!request.tools.some(tool => ['write', 'edit', 'subagent', 'zcode_agent'].includes(tool.function.name)), JSON.stringify(request.tools));
    assert(!JSON.stringify(request.messages).includes('BODY_unselected'));
    observed.push({ child, phase, tools: request.tools.map(tool => tool.function.name) });
    const key = child + ':' + phase, count = counts.get(key) ?? 0; counts.set(key, count + 1);
    if (count === 0) return toolReply('skill', { name: 'review-only' });
    if (phase === 'drift') return textReply('DRIFT_REFUSED');
    if (count === 1) return toolReply('skill', { name: 'unselected' });
    if (count === 2) return toolReply('read', { file_path: join(f.workspace, 'input.txt') });
    if (count === 3) return toolReply('subagent', { description: 'Denied nested work', prompt: 'MUST_NOT_RUN' });
    return textReply('PROFILE_RESULT_' + child + '_' + phase);
  });
  const call = async (name, args) => {
    nextCall = { name, args };
    const result = await f.prompt(sessionId, 'Execute the requested profile fixture operation.', { timeout: 35000 });
    assert.equal(nextCall, undefined);
    return toolResults(result).at(-1);
  };
  const childSnapshot = async childSessionId => {
    const projections = await f.rpc('session/projections', { sessionId: childSessionId });
    const page = await f.rpc('session/page', { address: { kind: 'subagent', parentSessionId: sessionId, childSessionId, mode: 'continuable' }, throughSeq: projections.asOfSeq, maxMessages: 100 });
    return { ...page, projections };
  };
  const children = [];
  for (const profile of ['reader', 'planner']) {
    const result = await call('zcode_agent', { profile, prompt: 'Read the selected skill and input file.' });
    assert(!result.isError, textOf(result) + '\n' + JSON.stringify(f.errors));
    const receipt = JSON.parse(result.content[0].text); children.push(receipt.subagentId);
    const child = await childSnapshot(receipt.subagentId), results = toolResults(child);
    assert(results.some(row => !row.isError && textOf(row).includes('BODY_review-only')));
    assert(results.some(row => row.isError && /unknown|no longer|unavailable/.test(textOf(row))));
    assert(results.some(row => !row.isError && textOf(row).includes('PROFILE_FILE_MARKER')));
    assert(results.some(row => row.isError && (profile === 'planner' ? /plan mode permits/ : /outside the child profile restriction/).test(textOf(row))), results.map(textOf).join('\n'));
    const events = child.records.map(row => row.event).filter(Boolean);
    assert.equal(events.filter(event => event.type === 'plugin:omaa/zcode/profile-skills-admission').length, 1);
    assert.equal(events.find(event => event.type === 'agent-preset/selected').data.agentPreset, 'omaa-zcode-profile-skills-local');
    if (profile === 'planner') {
      assert(events.some(event => event.type === 'plan/mode' && event.data.active === true));
      assert(JSON.stringify(events).includes('PROFILE_PARENT_INSTRUCTION'));
    }
  }
  await f.crash(); await f.boot(); phase = 'cold';
  for (const childId of children) {
    const before = await childSnapshot(childId);
    assert.deepEqual((await f.rpc('skills/list', { sessionId: childId })).skills.map(skill => skill.name), ['review-only']);
    assert.equal((await childSnapshot(childId)).projections.asOfSeq, before.projections.asOfSeq, 'cold catalog must remain a read-only observation');
    const result = await call('send_message', { agent_id: childId, message: 'COLD_PROFILE_CONTINUE' });
    assert(!result.isError, textOf(result));
    await until(async () => JSON.stringify((await childSnapshot(childId)).records).includes('PROFILE_RESULT_' + (childId === children[0] ? 'reader' : 'planner') + '_cold'));
  }
  phase = 'drift';
  await writeFile(join(f.workspace, '.zcode/skills/review-only/SKILL.md'), '---\nname: review-only\ndescription: Changed\n---\nCHANGED_BODY_MUST_NOT_LOAD\n');
  const delivered = await call('send_message', { agent_id: children[0], message: 'CHECK_SOURCE_DRIFT' });
  assert(!delivered.isError, textOf(delivered));
  await until(async () => JSON.stringify((await childSnapshot(children[0])).records).includes('DRIFT_REFUSED'));
  const final = await childSnapshot(children[0]);
  assert(toolResults(final).at(-1).isError);
  assert.match(textOf(toolResults(final).at(-1)), /source changed|frozen body/);
  assert.equal(await readFile(join(f.workspace, 'input.txt'), 'utf8'), 'PROFILE_FILE_MARKER\n');
  assert.deepEqual(f.errors, []);
  if (process.env.OMAA_PROFILE_EVIDENCE) await writeFile(process.env.OMAA_PROFILE_EVIDENCE, JSON.stringify({ at: new Date().toISOString(), host: f.evidence.version, children, observed,
    checks: ['native selected-skill load and read', 'unselected skill refusal', 'literal persona and denied child-local delegation', 'native plan and parent instructions', 'cold catalog without activation', 'cold native send_message continuation', 'source drift refusal'], externalModelCalls: 0 }, null, 2) + '\n');
});
