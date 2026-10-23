import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

const text = request => JSON.stringify(request.messages);
test('Pi boundary drafts, continuations and live message events run on the native loop and survive recovery', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  const extension = join(f.workspace, 'boundaries.ts'), trace = join(f.workspace, 'trace.jsonl');
  await writeFile(join(f.workspace, 'readme.txt'), 'NATIVE_TOOL_CONTENT');
  await writeFile(extension, `import {appendFile} from 'node:fs/promises';
export default function(pi){
 const log=value=>appendFile(${JSON.stringify(trace)},JSON.stringify(value)+'\\n');
 let mode='',turns=0,settles=0,finalId;
 pi.on('before_agent_start',e=>{mode=e.prompt;turns=0;settles=0;});
 for(const name of ['agent_start','agent_end','message_start','message_update','message_end','agent_settled','tool_execution_start','tool_execution_update','tool_execution_end'])pi.on(name,async(e,ctx)=>{
   await log({type:e.type,role:e.message?.role,delta:e.assistantMessageEvent?.delta,aborted:e.aborted,signalAborted:ctx.signal.aborted,durationMs:e.durationMs,toolName:e.toolName,partial:e.partialResult});
 });
 pi.registerTool({name:'boundary_tool',description:'Read a native file and report progress',parameters:{type:'object',properties:{}},async execute(id,args,signal,onUpdate,ctx){onUpdate({content:[{type:'text',text:'READING_NATIVE_FILE'}]});return await ctx.executeTool('read',{path:'readme.txt'});}});
 pi.on('turn_end',async(e,ctx)=>{
   turns++;finalId=e.messageEntryId;
   await log({type:'turn_end',index:e.turnIndex,id:e.messageEntryId,toolIds:e.toolResultEntryIds,roles:e.context.contextMessages.map(m=>m.role)});
   if(mode==='MAIN'&&turns===1)return{entries:[...e.entries,{type:'custom',customType:'boundary-state',data:{ready:true}},
     {type:'custom_message',customType:'after-tool',content:'BOUNDARY_AFTER_TOOL',display:true}],continue:true};
   if(mode==='MAIN'&&turns===2)return{entries:[{type:'context_edit',targetId:e.messageEntryId,replacement:null},
     {type:'custom_message',customType:'repair',content:'TURN_REPAIR',display:false}],continue:true};
   if(mode==='INVALID')return{entries:[{type:'custom',customType:'must-not-save'},{type:'context_edit',targetId:'missing',replacement:null}],continue:true};
 });
 pi.on('turn_end',async(e)=>{if(mode==='MAIN'&&e.turnIndex===0){
   if(!e.context.contextMessages.some(m=>m.customType==='after-tool')||!e.context.canContinue||!e.continue)throw Error('missing serial preview');
   await log({type:'preview-seen'});
 }});
 pi.on('agent_before_settle',async(e)=>{
   settles++;await log({type:'before_settle',settles,mode});
   if(mode==='CANCEL'){await log({type:'cancel-ready'});await new Promise(r=>setTimeout(r,30000));return{entries:[{type:'custom_message',customType:'cancelled-draft',content:'FORBIDDEN',display:true}],continue:true};}
   if(mode==='MAIN'&&settles===1)return{entries:[{type:'context_edit',targetId:finalId,replacement:{content:[{type:'text',text:'EDITED_FINAL'}]}},
     {type:'compaction',summary:'BOUNDARY_COMPACTION',firstKeptEntryId:finalId},
     {type:'custom_message',customType:'settle',content:'SETTLE_CONTINUATION',display:false}],continue:true};
 });
 pi.registerCommand('boundary_state',{description:'Read saved boundary state',async handler(args,ctx){
   const entries=ctx.sessionManager.getEntries();
   if(!entries.some(e=>e.type==='custom'&&e.customType==='boundary-state'&&e.data.ready))throw Error('missing cold custom state');
   if(!entries.some(e=>e.type==='compaction'))throw Error('missing cold compaction');
   await log({type:'cold-read',entries:entries.length});
 }});
}`);
  await f.install(); await f.boot();
  const headers = { cookie: f.cookie, 'content-type': 'application/json' };
  const config = await fetch(f.origin + '/omaa/api/pi-extensions', { headers }).then(r => r.json());
  assert.equal((await fetch(f.origin + '/omaa/api/pi-extensions', { method: 'POST', headers, body: JSON.stringify({ revision: config.revision, files: [extension] }) })).status, 200);
  const { sessionId } = await f.create('omaa-pi');
  const rows = async () => (await readFile(trace, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
  let calls = 0;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Auxiliary fixture');
    calls++;
    return calls === 1 ? toolReply('boundary_tool', {}) : textReply('NATIVE_FINAL_' + calls);
  });
  await f.send(sessionId, 'MAIN');
  await until(async () => (await rows()).some(row => row.type === 'agent_settled'));
  assert.equal(calls, 4, JSON.stringify(await rows()));
  const records = (await f.snapshot(sessionId)).records.filter(row => row.event).map(row => row.event);
  const requests = f.requests.filter(r => r.tools?.length);
  assert(text(requests[1]).includes('BOUNDARY_AFTER_TOOL'));
  assert(text(requests[2]).includes('TURN_REPAIR'));
  assert(!text(requests[2]).includes('NATIVE_FINAL_2'), 'context omission must reach the next actual request');
  assert(text(requests[3]).includes('BOUNDARY_COMPACTION') && text(requests[3]).includes('EDITED_FINAL') && text(requests[3]).includes('SETTLE_CONTINUATION'));
  assert(!text(requests[3]).includes('NATIVE_TOOL_CONTENT'));
  assert(records.some(e => e.type === 'assistant/message' && JSON.stringify(e.data).includes('NATIVE_FINAL_2')), 'raw assistant record retained');
  assert.equal(records.filter(e => e.type === 'plugin:omaa/pi-boundary').length, 3);
  const events = await rows();
  assert(events.some(e => e.type === 'preview-seen'));
  assert(events.some(e => e.type === 'message_update' && e.delta?.includes('NATIVE_FINAL_')));
  assert(events.some(e => e.type === 'message_end' && e.role === 'toolResult'));
  assert(events.some(e => e.type === 'tool_execution_update' && JSON.stringify(e.partial).includes('READING_NATIVE_FILE')));
  assert(events.some(e => e.type === 'tool_execution_end' && e.toolName === 'read' && Number.isFinite(e.durationMs)));
  assert(records.some(e => e.type === 'user/message' && e.data.source?.customType === 'after-tool' && e.data.source.display === true));
  assert.equal(events.filter(e => e.type === 'agent_settled').length, 1, 'continuation cannot publish premature settled');
  await f.stop(); await f.boot();
  await f.call('commands/execute', { agentId: sessionId, line: '/boundary_state', submittedAttachments: [] });
  assert((await rows()).some(e => e.type === 'cold-read'));
  await mkdir(join(f.workspace, '.pi'), { recursive: true });
  await writeFile(join(f.workspace, '.pi', 'SYSTEM.md'), 'BOUNDARY_NEW_SYSTEM');
  await f.prompt(sessionId, 'COLD_NEXT');
  await until(async () => (await rows()).filter(e => e.type === 'agent_settled').length >= 2).catch(async error => { t.diagnostic(JSON.stringify(await rows())); t.diagnostic(JSON.stringify((await f.snapshot(sessionId)).records.slice(-12))); throw error; });
  assert(text(f.requests.filter(r => r.tools?.length).at(-1)).includes('BOUNDARY_COMPACTION'));
  assert(text(f.requests.filter(r => r.tools?.length).at(-1)).includes('BOUNDARY_NEW_SYSTEM'));
  assert(!text(f.requests.filter(r => r.tools?.length).at(-1)).includes('NATIVE_TOOL_CONTENT'));
  assert.equal((await f.snapshot(sessionId)).records.filter(r => r.event?.type === 'user/message' && r.event.data.source?.customType === 'after-tool').length, 1);
  const invalid = await f.create('omaa-pi');
  await f.prompt(invalid.sessionId, 'INVALID');
  const invalidRecords = (await f.snapshot(invalid.sessionId)).records;
  assert(!invalidRecords.some(r => r.event?.type === 'plugin:omaa/pi-boundary'), 'invalid final batch must not commit earlier drafts');
  const cancelled = await f.create('omaa-pi');
  await f.send(cancelled.sessionId, 'CANCEL');
  await until(async () => (await rows()).some(e => e.type === 'cancel-ready'));
  assert.equal((await f.api(cancelled.sessionId)).value.running, true, 'native Stop remains available during settlement');
  const beforeCancel = calls;
  await f.rpc('session/cancel', { sessionId: cancelled.sessionId });
  await until(async () => (await rows()).some(e => e.type === 'agent_settled' && e.aborted === true));
  assert.equal(calls, beforeCancel);
  assert(!(await f.snapshot(cancelled.sessionId)).records.some(r => r.event?.type === 'plugin:omaa/pi-boundary'));
  if (process.env.OMAA_PI_BOUNDARY_EVIDENCE) await writeFile(process.env.OMAA_PI_BOUNDARY_EVIDENCE, JSON.stringify({ host: f.evidence.version, providerRequests: f.requests.length,
    mainRequests: calls, externalModels: 0, checks: ['native tool batch', 'serial draft preview', 'turn_end continuation', 'context omission', 'content replacement', 'compaction', 'before_settle continuation', 'stream events', 'single final settlement', 'raw journal retained', 'cold state and projection', 'invalid batch no commit', 'cancellation no commit or wake'] }, null, 2));
});
