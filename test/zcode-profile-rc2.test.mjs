import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, toolReply, textReply } from './fixtures/installed-host.mjs';

const textOf = message => typeof message?.content === 'string' ? message.content
  : (message?.content ?? []).map(part => part.text ?? '').join('\n');

test('rc.2 profiles use literal personas and scoped tool restrictions with explicit project memory', { timeout: 60000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  const profiles = join(f.workspace, 'profiles'), memory = join(f.workspace, 'memory');
  await mkdir(profiles); await mkdir(memory);
  await writeFile(join(memory, 'MEMORY.md'), '# Workspace\nPROJECT_MEMORY_MARKER\n');
  await writeFile(join(f.workspace, 'input.txt'), 'PROFILE_FILE_MARKER\n');
  await writeFile(join(profiles, 'reviewer.md'), '---\nname: reviewer\ndescription: Synthetic restricted reader\ntools: Read\ninjectAgentsMd: false\n---\nLITERAL_PROFILE_PERSONA {unexpanded}\n');
  await writeFile(join(profiles, 'default-reader.md'), '---\nname: default-reader\ndescription: Synthetic reader with inherited instruction snapshot\ntools: Read\n---\nLITERAL_PROFILE_PERSONA {unexpanded}\n');
  await f.install(); await f.boot();
  const registered = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId } = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'omaa-zcode' });
  for (const patch of [{ projectMemory: { root: memory } }, { agentProfileDirectory: { root: profiles } }]) {
    const saved = await f.api(sessionId, patch);
    assert.equal(saved.status, 200, JSON.stringify(saved.value));
  }
  let childRequests = 0, sawMemory = false;
  const calls = [
    { name: 'zcode_agent', args: {} },
    { name: 'zcode_agent', args: { profile: 'reviewer', prompt: 'PROFILE_CHILD read input.txt, then reply PROFILE_RESULT.' } },
    { name: 'zcode_agent', args: { profile: 'default-reader', prompt: 'PROFILE_CHILD reply PROFILE_RESULT after inspecting the inherited instructions.' } },
  ];
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Synthetic profile title');
    const child = request.messages.some(message => message.role === 'user' && textOf(message).includes('PROFILE_CHILD'));
    if (child) {
      const system = request.messages.filter(message => message.role === 'system').map(textOf).join('\n');
      assert.match(system, /LITERAL_PROFILE_PERSONA \{unexpanded\}/);
      assert(!request.tools.some(tool => ['write', 'edit'].includes(tool.function?.name)));
      return childRequests++ === 0 ? toolReply('read', { file_path: join(f.workspace, 'input.txt') }) : textReply('PROFILE_RESULT');
    }
    sawMemory ||= request.messages.some(message => textOf(message).includes('PROJECT_MEMORY_MARKER'));
    const call = calls.shift();
    return call ? toolReply(call.name, call.args) : textReply('Profile integration complete.');
  });
  const snapshot = await f.prompt(sessionId, 'Use the synthetic reviewer profile to read the fixture file.', { timeout: 45000 });
  const results = snapshot.records.filter(row => row.event?.type === 'tool/result').map(row => row.event.data.message);
  assert.equal(calls.length, 0);
  assert(results.length >= 2);
  assert(results.every(message => !message.isError), results.map(textOf).join('\n'));
  assert(results.some(message => textOf(message).includes('PROFILE_RESULT')));
  assert(childRequests >= 2);
  assert(sawMemory);
  assert.deepEqual(f.errors, []);
});
