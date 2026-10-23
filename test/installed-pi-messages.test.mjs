import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

test('Pi custom messages and entries persist through native queues, tools and cold restart', { timeout: 60000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  const extension = join(f.workspace, 'messages.ts');
  await writeFile(extension, `export default function(pi){
    pi.registerCommand('queue_note',{description:'Queue a note for the next input',async handler(args,ctx){
      pi.sendMessage({customType:'next-note',content:'COLD_NEXT_NOTE',display:false},{deliverAs:'nextTurn'});
      await pi.appendEntry('saved-state',{count:7});
      if(!ctx.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='saved-state'&&e.data.count===7))throw Error('Entry ACK was not projected');
    }});
    pi.registerCommand('note_now',{description:'Append a visible idle note',handler(){pi.sendMessage({customType:'visible-note',content:'VISIBLE_IDLE_NOTE',display:true});}});
    pi.registerCommand('note_wake',{description:'Run a new task from a note',handler(){pi.sendMessage({customType:'wake-note',content:'WAKE_NOTE',display:true},{triggerTurn:true});}});
    pi.registerTool({name:'note_tool',description:'Append notes after a tool result',parameters:{type:'object',properties:{}},async execute(id,args,signal,onUpdate,ctx){
      const prior=ctx.sessionManager.getBranch().find(e=>e.type==='custom'&&e.customType==='saved-state');
      if(prior?.data.count!==7)throw Error('Cold state missing');
      pi.sendMessage({customType:'deferred-note',content:'AFTER_TOOL_NOTE',display:false},{triggerTurn:false});
      await pi.appendEntry('tool-state',{count:8});
      return{content:[{type:'text',text:'REAL_TOOL_RESULT'}],details:{}};
    }});
  }`);
  await f.install(); await f.boot();
  const config = await fetch(f.origin + '/omaa/api/pi-extensions', { headers: { cookie: f.cookie } }).then(r => r.json());
  assert.equal((await fetch(f.origin + '/omaa/api/pi-extensions', { method: 'POST', headers: { cookie: f.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ revision: config.revision, files: [extension] }) })).status, 200);
  const { sessionId } = await f.create('omaa-pi');
  const command = name => f.call('commands/execute', { agentId: sessionId, line: '/' + name, submittedAttachments: [] });
  await command('queue_note');
  assert.equal(f.requests.length, 0);
  await f.stop(); await f.boot();
  let tool = false;
  f.replyWith(request => {
    if (request.tools?.length && !tool) { tool = true; return toolReply('note_tool', {}); }
    return textReply('MESSAGE_NATIVE_DONE');
  });
  const result = await f.prompt(sessionId, 'CONSUME_NEXT_NOTE');
  const events = result.records.filter(row => row.event).map(row => row.event);
  const note = events.find(event => event.type === 'user/message' && event.data.source?.customType === 'deferred-note');
  const toolResult = events.find(event => event.type === 'tool/result');
  assert(toolResult && !toolResult.data.message.isError, JSON.stringify(toolResult));
  assert(note.seq > toolResult.seq, 'custom notes cannot split a native tool call/result pair');
  assert.equal(note.data.source.display, false);
  assert(f.requests.some(request => JSON.stringify(request.messages).includes('COLD_NEXT_NOTE')));
  assert(f.requests.some(request => JSON.stringify(request.messages).includes('AFTER_TOOL_NOTE')));
  assert(events.some(event => event.type === 'plugin:omaa/pi-entry' && event.data.customType === 'tool-state'));
  await f.prompt(sessionId, 'SECOND_INPUT');
  const after = await f.snapshot(sessionId);
  assert.equal(after.records.filter(row => row.event?.type === 'user/message' && row.event.data.source?.customType === 'next-note').length, 1);
  const before = f.requests.length;
  await command('note_now');
  assert.equal(f.requests.length, before, 'idle display-only append cannot wake the model');
  assert((await f.snapshot(sessionId)).records.some(row => row.event?.type === 'user/message' && row.event.data.source?.display === true));
  await command('note_wake');
  await until(() => f.requests.length > before);
  await until(async () => (await f.snapshot(sessionId)).records.filter(row => row.event?.type === 'turn/end').length >= 3);
  const evidence = { at: new Date().toISOString(), host: f.evidence.version, providerRequests: f.requests.length, externalModels: 0,
    checks: ['custom entry ACK and readback', 'custom state cold recovery', 'nextTurn cold queue consumed once', 'after-tool message pairing', 'hidden model context', 'idle visible append without wake', 'explicit triggerTurn native wake'] };
  if (process.env.OMAA_PI_MESSAGES_EVIDENCE) await writeFile(process.env.OMAA_PI_MESSAGES_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
});
