import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const text = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(part => part.text ?? '').join('\n');
const system = request => request.messages.filter(message => message.role === 'system').map(text).join('\n');
const user = request => request.messages.filter(message => message.role === 'user').map(text).join('\n');

test('Pi awaited input and chained start hooks share a native run, retain custom metadata and reset at idle', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { piResources: true });
  await mkdir(join(f.workspace, '.pi/prompts'), { recursive: true });
  await writeFile(join(f.workspace, '.pi/prompts/expand.md'), 'EXPANDED_NATIVE $1');
  await writeFile(join(f.workspace, 'allowed.txt'), 'NATIVE_HOOK_READ');
  const extension = join(f.workspace, 'start-hooks.ts');
  await writeFile(extension, `export default function(pi) {
    let starts = 0;
    pi.on('input', async (event, ctx) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      ctx.ui.notify('INPUT:' + event.text);
      if (event.text === 'HANDLED_INPUT') return {action:'handled'};
      if (event.text === 'INPUT_ERROR') throw Error('EXPECTED_INPUT_ERROR');
      if (event.text === 'RAW_START') return {action:'transform',text:'/expand seed'};
    });
    pi.on('before_agent_start', async (event, ctx) => {
      starts++; await new Promise(resolve => setTimeout(resolve, 5));
      if (ctx.getSystemPrompt() !== event.systemPrompt) throw Error('snapshot differs');
      event.systemPromptOptions.promptGuidelines.push('HOOK_RULE {{literal}} $&');
      event.systemPromptOptions.sections.start_fixture = 'HOOK_SECTION {{literal}} $&';
      if (event.prompt === 'EDIT_LOADOUT' || event.prompt === 'REPLACE_LOADOUT') {
        pi.registerTool({name:'hook_added',label:'Start hook tool',description:'Return a hook fixture marker',promptSnippet:event.prompt === 'REPLACE_LOADOUT' ? 'REPLACED_TOOL_SNIPPET' : 'HOOK_TOOL_SNIPPET',parameters:{type:'object',properties:{},additionalProperties:false},
          async execute(){return {content:[{type:'text',text:'HOOK_TOOL_EXECUTED'}],details:{}};}});
        event.systemPromptOptions.selectedTools = ['hook_added'];
      }
      if (event.prompt === 'SET_LOADOUT') pi.setActiveTools(['read']);
      if (event.prompt === 'HIDE_PROMPT_TOOL') event.systemPromptOptions.hiddenTools = ['read'];
      return {message:{customType:'start-a',display:false,content:'START_A:'+event.prompt,details:{starts}},
        ...(event.prompt.startsWith('FORCE_RUN') ? {systemPrompt:'FORCED_FIRST {{literal}} $&'} : {})};
    });
    pi.on('before_agent_start', async (event, ctx) => {
      if (ctx.getSystemPrompt() !== event.systemPrompt) throw Error('chain differs');
      const expected = event.prompt.startsWith('FORCE_RUN') ? 'FORCED_FIRST' : 'HOOK_RULE';
      if (!event.systemPrompt.includes(expected)) throw Error('earlier hook missing');
      ctx.ui.notify('START:'+starts+':'+event.prompt);
      return {message:{customType:'start-b',display:true,content:'START_B:'+event.prompt,details:{chain:true}},
        ...(event.prompt.startsWith('FORCE_RUN') ? {systemPrompt:event.prompt === 'FORCE_RUN_SECOND' ? 'FORCED_SECOND {{literal}} $&' : 'FORCED_FINAL {{literal}} $&'} : {})};
    });
    pi.on('before_agent_start', async event => { if(event.prompt === 'FORCE_RUN') throw Error('EXPECTED_START_ERROR'); });
    pi.on('before_agent_start', async (event, ctx) => { ctx.ui.notify('AFTER_ERROR:'+event.prompt); });
    pi.registerCommand('extension-input', {description:'Send literal extension input', async handler(args) {
      pi.sendUserMessage('/expand ' + args);
    }});
  }`);
  await f.install(); await f.boot();
  const configuration = async patch => {
    const r = await fetch(f.origin + '/omaa/api/pi-extensions', { headers: { cookie: f.cookie, 'content-type': 'application/json' }, ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    assert.equal(r.status, 200); return r.json();
  };
  const cfg = await configuration(); await configuration({ revision: cfg.revision, files: [extension] });
  const { sessionId } = await f.create('omaa-pi');
  let toolSent = false;
  f.replyWith(request => request.tools?.length && !toolSent ? (toolSent = true, toolReply('read', { file_path: 'allowed.txt' })) : textReply('Native hook task completed.'));
  const release = f.holdNextReply(), from = f.requests.length;
  await f.send(sessionId, 'RAW_START');
  await until(() => f.requests.slice(from).some(request => request.tools?.length));
  const first = f.requests.slice(from).find(request => request.tools?.length);
  assert(system(first).includes('HOOK_RULE {{literal}} $&'));
  assert(system(first).includes('<start_fixture>\nHOOK_SECTION {{literal}} $&\n</start_fixture>'));
  assert(user(first).includes('EXPANDED_NATIVE seed'));
  assert(user(first).includes('START_A:EXPANDED_NATIVE seed'));
  await f.send(sessionId, 'STEER_FIRST', 'steer'); await f.send(sessionId, 'STEER_SECOND', 'steer'); await f.send(sessionId, 'QUEUED_FOLLOWUP');
  release();
  await until(async () => !(await f.api(sessionId)).value.running && f.requests.slice(from).some(request => user(request).includes('QUEUED_FOLLOWUP')));
  const nativeRequests = f.requests.slice(from).filter(request => request.tools?.length);
  const steerFirst = nativeRequests.findIndex(request => user(request).includes('STEER_FIRST'));
  const steerSecond = nativeRequests.findIndex(request => user(request).includes('STEER_SECOND'));
  assert(steerFirst > 0 && steerSecond > steerFirst);
  assert(!user(nativeRequests[steerFirst]).includes('STEER_SECOND'));
  let snapshot = await f.snapshot(sessionId);
  const custom = snapshot.records.filter(record => record.event?.type === 'user/message' && record.event.data.source?.kind === 'pi-extension');
  assert.equal(custom.length, 2, 'one start dispatch for tool steps, typed steers and queued follow-up');
  assert.deepEqual(custom.map(record => record.event.data.source.customType), ['start-a', 'start-b']);
  assert.equal(custom[0].event.data.source.display, false); assert.deepEqual(custom[0].event.data.source.details, { starts: 1 });

  const forcedFrom = f.requests.length;
  await f.prompt(sessionId, 'FORCE_RUN');
  const forced = f.requests.slice(forcedFrom).find(request => request.tools?.length);
  assert.equal(system(forced), 'FORCED_FINAL {{literal}} $&');
  assert(user(forced).includes('START_B:FORCE_RUN'));
  const notices = await (await fetch(f.origin + '/omaa/api/pi-extension-notices?session=' + encodeURIComponent(sessionId), { headers: { cookie: f.cookie } })).json();
  assert(notices.notices.some(notice => notice.text.includes('EXPECTED_START_ERROR')));
  assert(notices.notices.some(notice => notice.text === 'AFTER_ERROR:FORCE_RUN'));
  assert(notices.notices.some(notice => notice.text === 'START:1:EXPANDED_NATIVE seed'));
  assert(!notices.notices.some(notice => notice.text.startsWith('START:') && notice.text.includes('STEER_')));
  const secondForceFrom = f.requests.length;
  await f.prompt(sessionId, 'FORCE_RUN_SECOND');
  assert.equal(system(f.requests.slice(secondForceFrom).find(request => request.tools?.length)), 'FORCED_SECOND {{literal}} $&');

  const resetFrom = f.requests.length;
  await f.prompt(sessionId, 'RESET_NEW_RUN');
  assert(f.requests.slice(resetFrom).filter(request => request.tools?.length).every(request => !system(request).includes('FORCED_FINAL')));
  const handledFrom = f.requests.length; await f.prompt(sessionId, 'HANDLED_INPUT');
  assert.equal(f.requests.length, handledFrom);
  const inputErrorFrom = f.requests.length; await f.prompt(sessionId, 'INPUT_ERROR');
  assert(f.requests.slice(inputErrorFrom).some(request => user(request).includes('START_A:INPUT_ERROR')));
  const literalFrom = f.requests.length;
  await f.call('commands/execute', { agentId: sessionId, line: '/extension-input literal', submittedAttachments: [] });
  await until(() => f.requests.slice(literalFrom).some(request => user(request).includes('START_A:/expand literal')));
  await until(async () => !(await f.api(sessionId)).value.running);
  assert(f.requests.slice(literalFrom).filter(request => request.tools?.length).every(request => !user(request).includes('EXPANDED_NATIVE literal')));

  let addedToolSent = false;
  f.replyWith(request => request.tools?.length && !addedToolSent ? (addedToolSent = true, toolReply('hook_added', {})) : textReply('Native hook tool completed.'));
  const toolFrom = f.requests.length; await f.prompt(sessionId, 'EDIT_LOADOUT');
  const toolRequest = f.requests.slice(toolFrom).find(request => request.tools?.length);
  assert.deepEqual(toolRequest.tools.map(tool => tool.function.name), ['hook_added']);
  assert(system(toolRequest).includes('HOOK_TOOL_SNIPPET'));
  assert(f.requests.slice(toolFrom).some(request => request.messages.some(message => message.role === 'tool' && text(message).includes('HOOK_TOOL_EXECUTED'))));
  f.replyWith();
  const replaceFrom = f.requests.length; await f.prompt(sessionId, 'REPLACE_LOADOUT');
  const replaceRequest = f.requests.slice(replaceFrom).find(request => request.tools?.length);
  assert(system(replaceRequest).includes('REPLACED_TOOL_SNIPPET')); assert(!system(replaceRequest).includes('HOOK_TOOL_SNIPPET'));
  const setFrom = f.requests.length; await f.prompt(sessionId, 'SET_LOADOUT');
  const setRequest = f.requests.slice(setFrom).find(request => request.tools?.length);
  assert.deepEqual(setRequest.tools.map(tool => tool.function.name), ['read']);
  assert(system(setRequest).includes('- read: Read file contents'));
  assert(!system(setRequest).includes('- hook_added:'));

  const hiddenFrom = f.requests.length; await f.prompt(sessionId, 'HIDE_PROMPT_TOOL');
  const hiddenRequest = f.requests.slice(hiddenFrom).find(request => request.tools?.length);
  assert.deepEqual(hiddenRequest.tools.map(tool => tool.function.name), ['read']);
  assert(system(hiddenRequest).includes('- read: Read file contents'), 'prompt hiding alone cannot contradict actual native declarations');
  assert(system(hiddenRequest).includes('Use read to examine files instead of cat or sed.'));

  const coldRelease = f.holdNextReply(), heldFrom = f.requests.length;
  await f.send(sessionId, 'COLD_QUEUE_BOUNDARY');
  await until(() => f.requests.slice(heldFrom).some(request => request.tools?.length));
  await f.call('commands/execute', { agentId: sessionId, line: '/extension-input cold-literal', submittedAttachments: [] });
  const queued = (await f.snapshot(sessionId)).projections.values.inbox?.['next-turn']?.find(message => text(message).includes('/expand cold-literal'));
  assert(queued); assert.equal(queued.source.pi.input.expandPromptTemplates, false); assert.equal(queued.source.pi.input.source, 'extension');
  // Native JSONL batches live events for 200 ms. Fault injection must follow
  // its durability window rather than treating the in-memory RPC view as disk.
  await delay(300);
  await f.crash(); coldRelease(); const coldQueueFrom = f.requests.length; await f.boot();
  await f.prompt(sessionId, 'COLD_NEW_RUN');
  await until(async () => !(await f.api(sessionId)).value.running && f.requests.slice(coldQueueFrom).some(request => user(request).includes('COLD_NEW_RUN')));
  assert(f.requests.slice(coldQueueFrom).some(request => user(request).includes('/expand cold-literal')));
  assert(f.requests.slice(coldQueueFrom).every(request => !user(request).includes('EXPANDED_NATIVE cold-literal')));
  const coldSnapshot = await f.snapshot(sessionId);
  const coldStarts = coldSnapshot.records.filter(record => record.event?.type === 'user/message'
    && record.event.data.source?.customType === 'start-a' && text(record.event.data) === 'START_A:COLD_NEW_RUN');
  assert.equal(coldStarts.length, 1, 'cold recovery must admit the human input once');
  assert.equal(coldStarts[0].event.data.source.details.starts, 1, 'the recovered guest starts a fresh counter');

  snapshot = await f.prompt(sessionId, 'COLD_IDLE_START');
  assert(f.requests.slice(coldQueueFrom).filter(request => request.tools?.length).every(request => !system(request).includes('FORCED_FINAL')));
  const idleStarts = snapshot.records.filter(record => record.event?.type === 'user/message'
    && record.event.seq > coldSnapshot.projections.asOfSeq && record.event.data.source?.customType === 'start-a'
    && text(record.event.data) === 'START_A:COLD_IDLE_START');
  assert.equal(idleStarts.length, 1, 'the next idle input starts exactly once');
  assert.equal(idleStarts[0].event.data.source.details.starts, 2, 'the same recovered guest increments after its first cold start');
  if (process.env.OMAA_PI_START_EVIDENCE) await writeFile(process.env.OMAA_PI_START_EVIDENCE, JSON.stringify({
    at: new Date().toISOString(), host: f.evidence.version, artifactSha256: f.evidence.artifact?.sha256,
    fixture: 'native DSH / scripted provider / owned local extension',
    requests: f.requests, nativeRecords: snapshot.records, queuedInput: queued,
    checked: ['awaited input then template','chained options and literal forced heads','dynamic tool add/replace/loadout','prompt hiddenTools cannot contradict native declarations','one-at-a-time steer and shared follow-up run','handled has no model','durable queued literal after fault/cold recovery','fresh idle hook after recovery'],
  },null,2)+'\n',{mode:0o600});
  assert.deepEqual(f.errors, []);
});
