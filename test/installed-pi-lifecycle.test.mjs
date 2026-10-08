import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, until, textReply, toolReply } from './fixtures/installed-host.mjs';

const texts = request => request.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string'
  ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')).join('\n');
const system = request => request.messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string'
  ? message.content : message.content.map(part => part.text ?? '').join('\n')).join('\n');

test('Pi lifecycle callbacks await native activity, isolate fresh prompts, preserve complete messages and respect cancellation', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { piResources: true });
  await writeFile(join(f.workspace, 'allowed.txt'), 'TOOL_LIFECYCLE_RESULT');
  const extension = join(f.workspace, 'lifecycle.ts'), trace = join(f.workspace, 'trace.jsonl');
  await writeFile(extension, `import {appendFile,access} from 'node:fs/promises';
  export default function(pi){let before=0,ends=0;
   const log=async value=>appendFile(${JSON.stringify(trace)},JSON.stringify(value)+'\\n');
   pi.on('before_agent_start',event=>{before++;return{systemPrompt:'LIFECYCLE_FORCE_'+before};});
   pi.on('agent_start',async(event,ctx)=>{await log({type:'start-first',before,prompt:ctx.getSystemPrompt()});if(before===1)throw Error('EXPECTED_START_NOTIFICATION_ERROR');});
   pi.on('agent_start',async(event,ctx)=>{await log({type:'start-second',before,idle:ctx.isIdle()});});
   pi.on('turn_start',async event=>{await log({type:'turn',index:event.turnIndex,timestamp:event.timestamp});
    pi.registerTool({name:'lifecycle_turn_ready',description:'Tool registered before the native request',parameters:{type:'object',properties:{}},
     async execute(){return{content:[{type:'text',text:'READY'}],details:{}};}});
    pi.setActiveTools(['read','lifecycle_turn_ready']);
   });
   pi.on('agent_end',async(event,ctx)=>{const number=++ends;const text=event.messages.flatMap(m=>m.content.filter(p=>p.type==='text').map(p=>p.text)).join('\\n');
    await log({type:'end',number,before,aborted:ctx.signal.aborted,idle:ctx.isIdle(),messages:event.messages.map(m=>({role:m.role,
     toolCallId:m.toolCallId,toolName:m.toolName,content:m.content.map(p=>p.type==='text'?{type:'text',length:p.text.length,start:p.text.slice(0,100),end:p.text.slice(-100)}:p)}))});
    if(number===1){await log({type:'maintenance-wait'});while(true){try{await access(${JSON.stringify(join(f.workspace,'release-end'))});break;}catch{}await new Promise(r=>setTimeout(r,5));}pi.sendUserMessage('END_WITH_HUMAN');}
    if(text.includes('CONTINUE_ONLY')&&!text.includes('END_ONLY'))pi.sendUserMessage('END_ONLY');
    if(ctx.signal.aborted)pi.sendUserMessage('FORBIDDEN_AFTER_CANCEL');
   });
   pi.on('agent_end',async()=>{await log({type:'end-second-handler',ends});});
  }`);
  await f.install(); await f.boot();
  const configure = async patch => {
    const response = await fetch(f.origin + '/omaa/api/pi-extensions', { headers: { cookie: f.cookie, 'content-type': 'application/json' },
      ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const cfg = await configure(); await configure({ revision: cfg.value.revision, files: [extension] });
  const { sessionId } = await f.create('omaa-pi');
  const rows = async () => { try { return (await readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
  let sentTool = false;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('Lifecycle fixture');
    if (!sentTool) { sentTool = true; return toolReply('read', {file_path:'allowed.txt'}); }
    if (texts(request).includes('LONG_NATIVE_FRAME')) return textReply('LONG_BEGIN'+'汉字'.repeat(550000)+'LONG_END');
    return textReply('Native lifecycle completed.');
  });
  await f.send(sessionId,'FIRST_LIFECYCLE');
  await until(async () => (await rows()).some(row => row.type==='maintenance-wait'));
  const blocked = await configure({revision:(await configure()).value.revision,files:[]});
  assert.notEqual(blocked.status,200,'maintenance callback must retain native configuration ownership');
  await f.send(sessionId,'HUMAN_DURING_END');
  await writeFile(join(f.workspace,'release-end'),'go');
  await until(async () => (await rows()).filter(row=>row.type==='end-second-handler').length===2);
  let evidence=await rows();const native=f.requests.filter(request=>request.tools?.length);
  assert.equal(native.length,4,'first tool/final and the two separately queued human/end inputs');
  assert(system(native[0]).startsWith('LIFECYCLE_FORCE_1'));
  assert(native[0].tools.some(tool=>tool.function.name==='lifecycle_turn_ready'),'turn_start registry must enter the actual first request');
  assert(system(native[2]).startsWith('LIFECYCLE_FORCE_2'),'new human input releases an end callback continuation override');
  assert(system(native[3]).startsWith('LIFECYCLE_FORCE_2'));
  assert(texts(native[3]).includes('END_WITH_HUMAN'));
  assert.deepEqual(evidence.filter(row=>row.type==='turn').map(row=>row.index),[0,1,0,1]);
  assert.equal(evidence.filter(row=>row.type==='start-second').length,2,'notification errors must continue to later handlers');
  const ends=evidence.filter(row=>row.type==='end');
  assert(!ends[1].messages.some(message=>message.content.some(part=>part.start?.includes('FIRST_LIFECYCLE'))),'end messages belong to this activity only');
  assert(ends[0].messages.some(message=>message.role==='toolResult' && message.toolName==='read'));

  const continuationFrom=f.requests.length;
  await f.send(sessionId,'CONTINUE_ONLY');
  await until(async () => (await rows()).filter(row=>row.type==='end-second-handler').length===4);
  const continued=f.requests.slice(continuationFrom).filter(request=>request.tools?.length);
  assert.equal(continued.length,2);
  assert(continued.every(request=>system(request).startsWith('LIFECYCLE_FORCE_3')),'end-generated input preserves the accepted prompt');
  assert(texts(continued[1]).includes('END_ONLY'));

  await f.send(sessionId,'LONG_NATIVE_FRAME');
  await until(async () => (await rows()).filter(row=>row.type==='end-second-handler').length===5);
  evidence=await rows();const long=evidence.findLast(row=>row.type==='end').messages.flatMap(message=>message.content).find(part=>part.start?.startsWith('LONG_BEGIN'));
  assert(long.length>1000000 && long.end.endsWith('LONG_END'),'large multilingual end message must reach the guest without truncation');

  const from=f.requests.length,release=f.holdNextReply();
  await f.send(sessionId,'CANCEL_LIFECYCLE');
  await until(()=>f.requests.slice(from).some(request=>request.tools?.length));
  await f.rpc('session/cancel',{sessionId});release();
  await until(async () => (await rows()).filter(row=>row.type==='end-second-handler').length===6);
  const canceled=(await rows()).findLast(row=>row.type==='end');assert.equal(canceled.aborted,true);
  assert(!f.requests.slice(from).some(request=>texts(request).includes('FORBIDDEN_AFTER_CANCEL')));
  const status=await configure();assert.equal(status.value.states.find(row=>row.sessionId===sessionId).status,'ready');
  await writeFile(process.env.OMAA_PI_LIFECYCLE_EVIDENCE ?? '.cache/pi-lifecycle-native-evidence.json',JSON.stringify({at:new Date().toISOString(),host:f.evidence.version,artifactSha256:f.evidence.artifact?.sha256,rows:await rows(),
    requests:f.requests.filter(request=>request.tools?.length).map(request=>({system:system(request),user: texts(request).slice(-120),tools:request.tools.map(tool=>tool.function.name)})),
    checked:['awaited lifecycle order/turn indices','first-request startup tool registry','fresh human vs end-only prompt lifetime','full >2 MiB multilingual guest frame','cancel notification retains aborted signal and cannot resume']},null,2)+'\n');
});
