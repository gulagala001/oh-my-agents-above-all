import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, access, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const examples = join(repo, 'src/presets/pi/sources/upstream/packages/coding-agent/examples/extensions');
const allText = request => request.messages.map(m => typeof m.content === 'string' ? m.content : (m.content ?? []).map(p => p.text ?? '').join('\n')).join('\n');

test('original Pi extension factories run inside native DSH tools, input and command lifecycles', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { piResources: true });
  const custom = join(f.workspace, 'native-command.ts');
  const outside = join(repo, '.cache', 'pi-owned-probe-' + randomUUID() + '.txt');
  t.after(() => rm(outside, { force: true }));
  await writeFile(custom, `export default function(pi) {
    pi.registerCommand('extension-command', {description:'Fixture native command', async handler(args,ctx) {ctx.ui.notify('COMMAND:'+args);}});
    pi.registerTool({name:'nested_read',label:'Read through native tool',description:'Nested native read',promptSnippet:'Read through the original native tool',promptGuidelines:['Use nested_read for this fixture.'],parameters:{type:'object',properties:{},additionalProperties:false},
      async execute(id,params,signal,onUpdate,ctx){const result=await ctx.executeTool('read',{path:'allowed.txt'});return {content:result.content,details:{nested:!result.isError}};}});
    pi.registerTool({name:'policy_probe',label:'Owned fixture probe',description:'Write only an owned fixture path',parameters:{type:'object',properties:{},additionalProperties:false},
      async execute(){const fs=await import('node:fs');let denied=false;try{fs.writeFileSync(${JSON.stringify(outside)},'owned-fixture');}catch(error){denied=true;}return {content:[{type:'text',text:'probe completed'}],details:{denied}};}});
    pi.registerTool({name:'extension_image',label:'Native attachment fixture',description:'Return a one pixel test image',parameters:{type:'object',properties:{},additionalProperties:false},
      async execute(){return {content:[{type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='}],details:{image:true}};}});
  }`);
  await writeFile(join(f.workspace, 'allowed.txt'), 'NATIVE_NESTED_READ_SENTINEL');
  await f.install(); await f.boot();
  const configuration = async (patch, path = 'pi-extensions') => {
    const r = await fetch(f.origin + '/omaa/api/' + path, { headers: { cookie: f.cookie, 'content-type': 'application/json' }, ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
  };
  const cfg = await configuration();
  await configuration({ revision: cfg.revision, files: ['hello.ts', 'protected-paths.ts', 'input-transform.ts'].map(n => join(examples, n)).concat(custom) });
  const { sessionId } = await f.create('omaa-pi');
  let servedKey;
  f.replyWith(request => {
    if (!request.tools?.length) return textReply('No secondary model task.');
    if (request.messages.at(-1)?.role === 'tool') return textReply('Native extension completed.');
    const text = allText(request);
    if (!request.tools.some(t => t.function.name === 'hello')) return textReply('Native preset without Pi extensions.');
    const marker = ['CALL_PROTECTED_WRITE', 'CALL_NESTED_READ', 'CALL_HELLO', 'CALL_POLICY_PROBE', 'CALL_EXTENSION_IMAGE'].sort((a, b) => text.lastIndexOf(b) - text.lastIndexOf(a))[0];
    const key = marker + ':' + request.messages.findLastIndex(m => m.role === 'user' && JSON.stringify(m.content).includes(marker));
    if (key === servedKey) return textReply('Native extension completed.');
    servedKey = key;
    if (text.includes(marker) && marker === 'CALL_PROTECTED_WRITE') return toolReply('write', { file_path: '.env', content: 'MUST_NOT_WRITE' });
    if (text.includes(marker) && marker === 'CALL_NESTED_READ') return toolReply('nested_read', {});
    if (text.includes(marker) && marker === 'CALL_POLICY_PROBE') return toolReply('policy_probe', {});
    if (text.includes(marker) && marker === 'CALL_EXTENSION_IMAGE') return toolReply('extension_image', {});
    return toolReply('hello', { name: 'DSH' });
  });
  let from = f.requests.length;
  const greeting = await f.prompt(sessionId, 'CALL_HELLO');
  assert(f.requests.slice(from).some(r => r.tools?.some(t => t.function.name === 'hello')));
  assert(f.requests.slice(from).some(r => allText(r).includes('Use nested_read for this fixture.')));
  assert(greeting.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.greeted === 'DSH'), JSON.stringify(greeting.records.filter(r => r.event?.type === 'tool/result')));
  const blocked = await f.prompt(sessionId, 'CALL_PROTECTED_WRITE');
  assert(blocked.records.some(r => r.event?.type === 'tool/result' && JSON.stringify(r.event.data).includes('is protected')));
  await assert.rejects(access(join(f.workspace, '.env')));
  // Native nested execution remains reentrant with the extension's tool_call
  // callback. It uses the original parent token/agent/permissions.
  const nested = await f.prompt(sessionId, 'CALL_NESTED_READ');
  assert(nested.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.nested === true), JSON.stringify(nested.records.filter(r => r.event?.type === 'tool/result')));
  const image = await f.prompt(sessionId, 'CALL_EXTENSION_IMAGE');
  assert(image.records.some(r => r.event?.type === 'tool/result' && r.event.data.message.content.some(p => p.type === 'image' && p.attachment)), JSON.stringify(image.records.filter(r => r.event?.type === 'tool/result')));
  from = f.requests.length;
  await f.prompt(sessionId, '?quick Say hello');
  assert(f.requests.slice(from).some(r => allText(r).includes('Respond briefly in 1-2 sentences: Say hello')));
  from = f.requests.length;
  await f.prompt(sessionId, 'ping');
  assert.equal(f.requests.length, from, 'handled input must not request a model');
  const notices = await configuration(undefined, 'pi-extension-notices?session=' + encodeURIComponent(sessionId));
  assert(notices.notices.some(n => n.text === 'pong'));
  // Command/run + command/done are native records, never a fake model input.
  from = f.requests.length;
  const result = await f.call('commands/execute', { agentId: sessionId, line: '/extension-command native-args', submittedAttachments: [] });
  assert(result);
  assert.equal(f.requests.length, from);
  const commandNotices = await configuration(undefined, 'pi-extension-notices?session=' + encodeURIComponent(sessionId));
  assert(commandNotices.notices.some(n => n.text === 'COMMAND:native-args'));
  const permission = line => f.call('commands/execute', { agentId: sessionId, line, submittedAttachments: [] });
  await permission('/permission danger-full-access');
  let probe = await f.prompt(sessionId, 'CALL_POLICY_PROBE');
  assert(probe.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.denied === false));
  await access(outside); await rm(outside);
  await permission('/permission workspace-write');
  probe = await f.prompt(sessionId, 'CALL_POLICY_PROBE');
  assert(probe.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.denied === true));
  await assert.rejects(access(outside));
  await f.stop(); await f.boot();
  const resumed = await f.prompt(sessionId, 'COLD_CALL_HELLO');
  assert(resumed.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.greeted === 'DSH'));
  from = f.requests.length; const codex = await f.create('omaa-codex'); await f.prompt(codex.sessionId, 'ORDINARY_CODEX');
  assert(f.requests.slice(from).filter(r => r.tools?.length).every(r => !r.tools.some(t => t.function.name === 'hello')), 'Pi tools must not leak across native scopes');
  const saved = await configuration(); await configuration({ files: [], revision: saved.revision });
  from = f.requests.length; await f.prompt(sessionId, 'PI_AFTER_DISABLE');
  assert(f.requests.slice(from).filter(r => r.tools?.length).every(r => !r.tools.some(t => t.function.name === 'hello')));
});
