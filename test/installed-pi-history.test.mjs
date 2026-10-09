import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

test('Pi extension sees full native message history, immutable clones, real images and cold restoration', { timeout: 180000 }, async t => {
  const f = await installedHost(t, { safeEnvironment: true, piResources: true });
  const extension = join(f.workspace, 'history.ts'), report = join(f.workspace, 'history.json');
  const first = 'HISTORY_BEGIN_' + '完整原话😀'.repeat(900) + '_HISTORY_END';
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
  await writeFile(extension, `import{writeFile}from'node:fs/promises';export default function(pi){
    pi.registerTool({name:'history_image',description:'Return a fixture image through native admission',parameters:{type:'object',properties:{}},
      async execute(){return{content:[{type:'image',data:${JSON.stringify(image)},mimeType:'image/png'}],details:{owned:'NATIVE_HISTORY_IMAGE'}};}});
    pi.on('before_agent_start',async(event,ctx)=>{if(!event.prompt.includes('HISTORY_CHECK'))return;
      const entries=ctx.sessionManager.getEntries(),branch=ctx.sessionManager.getBranch();
      const earliest=entries.find(e=>e.message.content.some(p=>p.type==='text'&&p.text.startsWith('HISTORY_BEGIN_')));
      if(earliest)earliest.message.content.find(p=>p.type==='text').text='GUEST_MUTATION';
      await writeFile(${JSON.stringify(report)},JSON.stringify({count:entries.length,branchCount:branch.length,
        original:ctx.sessionManager.getEntries().find(e=>e.message.content.some(p=>p.type==='text'&&p.text.startsWith('HISTORY_BEGIN_')))?.message.content[0].text,
        imageResult:entries.find(e=>e.message.role==='toolResult'&&e.message.toolName==='history_image')?.message,
        call:entries.flatMap(e=>e.message.content).find(p=>p.type==='toolCall'&&p.name==='history_image')}));
    });};`);
  await f.install(); await f.boot();
  const settings = await fetch(f.origin + '/omaa/api/pi-extensions', { headers: { cookie: f.cookie } }).then(response => response.json());
  const configured = await fetch(f.origin + '/omaa/api/pi-extensions', { method: 'POST',
    headers: { cookie: f.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ revision: settings.revision, files: [extension] }) });
  assert.equal(configured.status, 200);
  const { sessionId } = await f.create('omaa-pi');
  let imageSent = false;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('fixture');
    const user = JSON.stringify(request.messages);
    if (user.includes('CREATE_HISTORY_IMAGE') && !imageSent) { imageSent = true; return toolReply('history_image', {}); }
    return textReply('HISTORY_NATIVE_COMPLETED');
  });
  await f.prompt(sessionId, first);
  for (let i = 0; i < 51; i++) await f.prompt(sessionId, 'NATIVE_HISTORY_' + i);
  await f.prompt(sessionId, 'CREATE_HISTORY_IMAGE');
  await f.prompt(sessionId, 'HISTORY_CHECK');
  const observed = JSON.parse(await readFile(report, 'utf8'));
  const directory = process.env.OMAA_PI_HISTORY_EVIDENCE_DIR ?? 'work/rea-upgrade/pi-boundaries';
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'history-installed-observation.json'), JSON.stringify({ observed,
    native: (await f.snapshot(sessionId)).records.filter(row => ['tool/call', 'tool/result'].includes(row.event?.type)) }, null, 2) + '\n');
  assert(observed.count > 100); assert(observed.branchCount > 100);
  assert.equal(observed.original, first, 'getters clone full text and cannot mutate native history');
  assert.equal(observed.imageResult.isError, false, 'image passes native admission before history mapping');
  assert.equal(observed.imageResult.details.owned, 'NATIVE_HISTORY_IMAGE');
  assert.equal(observed.imageResult.content[0].data, image);
  assert.equal(observed.imageResult.content[0].mimeType, 'image/png');
  assert.equal(observed.call.id, observed.imageResult.toolCallId);
  assert.equal(observed.call.argumentsRaw, '{}');
  await f.stop(); await f.boot();
  await f.prompt(sessionId, 'HISTORY_CHECK_AFTER_RESTART');
  const cold = JSON.parse(await readFile(report, 'utf8'));
  assert.equal(cold.original, first); assert.equal(cold.imageResult.content[0].data, image); assert(cold.count > observed.count);
  await writeFile(join(directory, 'history-installed-evidence.json'), JSON.stringify({ host: f.evidence.version,
    platform: f.evidence.platform, arch: f.evidence.arch, sessionId, observed, cold, providerRequests: f.requests.length,
    limits: 'Isolated native host and local protocol provider; complete supported DSH message view, not every Pi JSONL entry or editable context API.' }, null, 2) + '\n');
});
