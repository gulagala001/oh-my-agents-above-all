import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply, until } from './fixtures/installed-host.mjs';

test('Pi edits each real request before freeze, keeps history, tools, image pairs and cancellation', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, sourceLinked: true });
  const extension = join(f.workspace, 'context.ts'), trace = join(f.workspace, 'context.jsonl');
  await writeFile(join(f.workspace, 'read.txt'), 'ORIGINAL_TOOL_TEXT');
  await writeFile(extension, `import {appendFile,access} from 'node:fs/promises';
    import {getCurrentSystemMessage} from '@earendil-works/pi-ai';
    export default function(pi){let calls=0,mode='';
      pi.registerTool({name:'context_image',description:'Return a native image',parameters:{type:'object',properties:{}},async execute(){return {content:[{type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='}],details:{}};}});
      const log=value=>appendFile(${JSON.stringify(trace)},JSON.stringify(value)+'\\n');
      pi.on('before_agent_start',event=>{mode=event.prompt;});
      pi.on('context',async(event,ctx)=>{
        calls++;await log({type:'context',calls,mode,hasSystem:event.messages.some(m=>m.role==='system')});
        if(mode.includes('CANCEL_CONTEXT')){await log({type:'holding'});while(true){await new Promise(r=>setTimeout(r,10));if(ctx.signal.aborted)throw ctx.signal.reason;}}
        if(mode.includes('ORPHAN')) return {messages:event.messages.filter(m=>m.role!=='toolResult')};
        if(mode.includes('NOOP'))return;
        for(const m of event.messages)if(m.role==='user')for(const p of m.content)if(p.type==='text')p.text=p.text.replace('PRIVATE_INPUT','REQUEST_ONLY');
        if(mode.includes('PRUNE'))return {messages:event.messages.filter(m=>m.role==='user').slice(-1)};
      });
      pi.on('context',event=>{if(mode.includes('THROW'))throw Error('EXPECTED_CONTEXT_ERROR');});
      pi.on('context_with_system',async(event,ctx)=>{
        if(mode.includes('NOOP'))return;
        const head=getCurrentSystemMessage(event.messages);
        await log({type:'system',calls,tools:head?.toolsAdded?.map(t=>t.name),hasRewritten:JSON.stringify(event.messages).includes('REQUEST_ONLY')});
        if(mode.includes('DROP_SYSTEM'))return{messages:event.messages.filter(m=>m.role!=='system')};
        if(head){head.content='CONTEXT_SYSTEM_'+calls;head.sections={fixture:'SECTION_'+calls};
          head.toolsAdded=head.toolsAdded.filter(t=>t.name==='read'||mode.includes('IMAGE')&&t.name==='context_image');
          event.messages.splice(0,event.messages.length,head,...event.messages.filter(m=>m.role!=='system'));}
      });
    }`);
  await f.install(); await f.boot();
  const configure = async patch => {
    const r = await fetch(f.origin + '/omaa/api/pi-extensions', { headers: { cookie: f.cookie, 'content-type': 'application/json' },
      ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
  };
  const cfg = await configure(); await configure({ revision: cfg.revision, files: [extension] });
  const { sessionId } = await f.create('omaa-pi');
  const native = () => f.requests.filter(request => JSON.stringify(request.messages).includes('CONTEXT_SYSTEM_'));
  let read = false, image = false;
  f.replyWith(request => {
    if (request.tools?.some(t=>t.function.name==='context_image') && JSON.stringify(request.messages).includes('IMAGE') && !image) {image=true; return toolReply('context_image',{});}
    if (JSON.stringify(request.messages).includes('CONTEXT_SYSTEM_') && !read) { read = true; return toolReply('read', { file_path: 'read.txt' }); }
    return textReply('CONTEXT_NATIVE_DONE');
  });
  const first = await f.prompt(sessionId, 'PRIVATE_INPUT');
  assert.equal(native().length, 2, 'context must run for both tool and final requests');
  assert(native().every(request => request.tools.length === 1 && request.tools[0].function.name === 'read'));
  assert(native().every(request => JSON.stringify(request.messages).includes('REQUEST_ONLY') && !JSON.stringify(request.messages).includes('PRIVATE_INPUT')));
  assert(JSON.stringify(native()[0]).includes('SECTION_1'));
  assert(JSON.stringify(native()[1]).includes('SECTION_2'));
  assert(native()[1].messages.some(message => message.role === 'tool' && JSON.stringify(message).includes('ORIGINAL_TOOL_TEXT')));
  assert(first.records.some(row => row.event?.type === 'user/message' && JSON.stringify(row.event.data).includes('PRIVATE_INPUT')));
  assert(!first.records.some(row => row.event?.type === 'user/message' && JSON.stringify(row.event.data).includes('REQUEST_ONLY')));
  await f.prompt(sessionId, 'PRUNE_THROW_PRIVATE_INPUT');
  assert(!JSON.stringify(native().at(-1).messages).includes('ORIGINAL_TOOL_TEXT'));
  assert(JSON.stringify(native().at(-1).messages).includes('REQUEST_ONLY'));
  const imageFrom = f.requests.length;
  await f.prompt(sessionId, 'IMAGE_PRIVATE_INPUT');
  assert(f.requests.slice(imageFrom).some(request => JSON.stringify(request.messages).includes('data:image/png;base64,')), 'native attachment bytes survive rewritten tool-result history');
  const from = f.requests.length;
  await f.prompt(sessionId, 'NOOP');
  const unchanged = f.requests.slice(from).find(request => JSON.stringify(request.messages).includes('NOOP'));
  assert(unchanged.tools.length > 1, 'context tool changes must not persist into the next request');
  assert(JSON.stringify(unchanged.messages).includes('PRIVATE_INPUT'), 'request-local edits never replace native history');
  await f.stop(); await f.boot();
  const coldFrom = f.requests.length;
  await f.prompt(sessionId, 'NOOP_COLD');
  assert(f.requests.slice(coldFrom).some(request => JSON.stringify(request.messages).includes('PRIVATE_INPUT')));
  await f.prompt(sessionId, 'DROP_SYSTEM');
  const dropped = f.requests.at(-1);
  assert(!dropped.messages.some(message => message.role === 'system'));
  assert(!dropped.tools?.length, 'full-transcript hook owns removal of prompt and initial tools');
  const rows = async () => (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
  const cancelFrom = f.requests.length;
  await f.send(sessionId, 'CANCEL_CONTEXT');
  await until(async () => (await rows()).some(row => row.type === 'holding'));
  await f.rpc('session/cancel', { sessionId });
  await until(async () => (await f.snapshot(sessionId)).records.some(row => row.event?.type === 'turn/end' && row.event.data.reason?.kind === 'aborted'));
  assert.equal(f.requests.length, cancelFrom, 'cancel during context must prevent provider dispatch');
  const orphanFrom = f.requests.length;
  await assert.rejects(f.prompt(sessionId, 'ORPHAN'), /tool call\/result batch|omitted a tool result/);
  assert.equal(f.requests.length, orphanFrom, 'a broken tool pair must fail before dispatch');
  const evidence = { at: new Date().toISOString(), host: f.evidence.version, providerRequests: f.requests.length, externalModels: 0,
    checks: ['per-request callback order', 'actual system and section rewrite', 'actual tool declaration filtering', 'native tool result pairing and real image attachment',
      'pruning restores system/tools', 'callback failure isolation', 'original journal retained', 'cold recovery', 'full-system removal', 'cancellation before dispatch', 'orphan result rejection'] };
  if (process.env.OMAA_PI_CONTEXT_EVIDENCE) await writeFile(process.env.OMAA_PI_CONTEXT_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
});
