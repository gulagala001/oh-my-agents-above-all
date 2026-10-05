import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';
const exec = promisify(execFile);
const valueText = message => (message?.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');

test('installed ZCode uses a real workflow child and cold native session context; Git reads stay confined', { timeout: 90000 }, async t => {
  const f = await installedHost(t); await f.install(); await f.boot();
  const prior = await f.create('omaa-pi'); await f.prompt(prior.sessionId, 'KNOWN_PRIOR_DECISION: preserve native session and use the existing configured model.');
  const zcode = await f.create('omaa-zcode');
  const script = 'phase("Inspect"); const result = await agent("WORKFLOW_CHILD_SENTINEL", { schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } }); if (result === null) throw new Error("Child did not finish"); return result;';
  const workflow = { script, meta: { name: 'native-zcode-workflow', description: 'Verify the real native workflow child result', phases: [{ title: 'Inspect' }] }, run_in_background: false };
  let stage = 0;
  f.replyWith(payload => payload.tools?.length && stage++ === 0 ? toolReply('workflow', workflow) : textReply('Load the workflow skill first.'));
  let result = await f.prompt(zcode.sessionId, 'Use a workflow for this delegated task.');
  assert.match(JSON.stringify(result.records), /Load the zcode-workflows skill/);
  stage = 0;
  f.replyWith(payload => payload.tools?.length && stage++ === 0 ? toolReply('skill', { name: 'zcode-workflows' }) : textReply('The actual host facade is loaded.'));
  result = await f.prompt(zcode.sessionId, 'Load the available ZCode workflow skill.');
  assert.match(JSON.stringify(result.records), /schema-checked|agent\(prompt|plain JavaScript/);
  stage = 0;
  f.replyWith(payload => {
    if (!payload.tools?.length) return;
    if (payload.tools.some(tool => tool.function.name === 'structured_output')) return toolReply('structured_output', { value: 'REAL_NATIVE_CHILD_RESULT' });
    if (stage++ === 0) return toolReply('workflow', workflow);
    return textReply('Native workflow completed.');
  });
  result = await f.prompt(zcode.sessionId, 'Use the workflow now and return its actual child result.');
  const events = result.records.map(r => r.event).filter(Boolean);
  assert(events.some(e => e.type === 'tool-workflow/run-end'), 'the native workflow engine must settle');
  assert(events.some(e => e.type === 'tool/result' && !e.data.message?.isError && JSON.stringify(e.data).includes('REAL_NATIVE_CHILD_RESULT')), JSON.stringify({ lifecycle: events.filter(e => e.type.startsWith('tool-workflow/') || e.type === 'tool/result').map(e => ({ type: e.type, data: e.data })), calls: f.requests.slice(-5).map(p => ({ tools: p.tools?.map(t => t.function.name), lastUser: p.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content.slice(-150) : '').slice(-1) })) }));
  f.replyWith(); await f.stop(); await f.boot();
  const before = (await f.snapshot(prior.sessionId)).projections.asOfSeq;
  stage = 0; const from = f.requests.length;
  f.replyWith(payload => {
    if (!payload.tools?.length) return textReply('KNOWN_PRIOR_DECISION: native session and existing configured model.');
    if (stage++ === 0) return toolReply('read_session_context', { sessionId: prior.sessionId, query: 'existing configured model', strategy: 'handoff' });
    return textReply('Read native context without changing its source session.');
  });
  result = await f.prompt(zcode.sessionId, 'Continue from prior session ' + prior.sessionId + ', retaining its model decision.');
  assert(JSON.stringify(result.records).includes('KNOWN_PRIOR_DECISION'), JSON.stringify(result.records.filter(r => r.event?.type === 'tool/result').slice(-1)));
  assert(f.requests.slice(from).some(p => !p.tools?.length && JSON.stringify(p.messages).includes('KNOWN_PRIOR_DECISION')), 'the configured native model must receive only the selected prior-session material');
  assert.equal((await f.snapshot(prior.sessionId)).projections.asOfSeq, before, 'reading prior context must not append or activate its task');

  // A repository clean filter runs inside the host read-only sandbox even when
  // the caller's default mode grants writes. It cannot write outside the cwd.
  f.replyWith(); const git = (...args) => exec('git', ['-C', f.workspace, ...args]);
  await git('init', '-b', 'main'); await git('config', 'user.name', 'OMAA fixture'); await git('config', 'user.email', 'fixture@invalid.example');
  await writeFile(path.join(f.workspace, '.gitattributes'), 'probe.txt filter=review\n'); await writeFile(path.join(f.workspace, 'probe.txt'), 'before\n');
  await git('add', '--', '.gitattributes', 'probe.txt'); await git('commit', '-m', 'baseline');
  const marker = path.join(f.root, 'must-not-be-written.txt'), filter = path.join(f.workspace, 'filter.cjs');
  await writeFile(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'forbidden');process.stdin.pipe(process.stdout);`);
  await git('config', 'filter.review.clean', `${process.execPath} ${filter}`); await git('config', 'filter.review.required', 'true'); await writeFile(path.join(f.workspace, 'probe.txt'), 'after\n');
  const codex = await f.create('omaa-codex');
  const response = await fetch(f.origin + '/omaa/api/git-review?session=' + encodeURIComponent(codex.sessionId), { headers: { cookie: f.cookie } });
  assert.equal(response.status, 400); await assert.rejects(access(marker), { code: 'ENOENT' });
  assert.deepEqual(f.errors, []);
});
