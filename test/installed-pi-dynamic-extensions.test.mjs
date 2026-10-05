import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installedHost, textReply, toolReply } from './fixtures/installed-host.mjs';

test('Pi callback registrations replace native tools and commands with rollback on host rejection', { timeout: 90000 }, async t => {
  const f = await installedHost(t, { piResources: true });
  const extension = join(f.workspace, 'dynamic.ts');
  await writeFile(extension, `export default function(pi) {
    const tool=(name,version,extra={})=>({name,label:name,description:'Dynamic value '+version,
      parameters:{type:'object',properties:{},additionalProperties:false},
      promptGuidelines:['Dynamic guideline '+version],
      async execute(){return {content:[{type:'text',text:'VERSION:'+version}],details:{version}}},...extra});
    let unsubscribe;
    pi.on('session_start',()=>{
      pi.registerTool(tool('dynamic_value',1));
      pi.registerCommand('change_dynamic',{description:'Change dynamic native definitions',handler(){
        pi.registerTool(tool('dynamic_value',2));
        pi.registerTool(tool('dynamic_extra',7));
        unsubscribe=pi.on('input',(event,ctx)=>{ctx.ui.notify('DYNAMIC_INPUT:'+event.text);return {action:'continue'}});
        pi.registerCommand('remove_dynamic_event',{description:'Remove dynamic input subscription',handler(args,ctx){unsubscribe();ctx.ui.notify('EVENT_REMOVED')}});
        pi.registerCommand('reject_dynamic',{description:'Verify native rejected registration',handler(){
          pi.registerTool(tool('dynamic_value',99,{outputSchema:{type:'string',minLength:1}}));
        }});
      }});
    });
  }`);
  await f.install(); await f.boot();
  const configuration = async (patch, path = 'pi-extensions') => {
    const r = await fetch(f.origin + '/omaa/api/' + path, { headers: { cookie: f.cookie, 'content-type': 'application/json' },
      ...(patch ? { method: 'POST', body: JSON.stringify(patch) } : {}) });
    const value = await r.json(); assert.equal(r.status, 200, JSON.stringify(value)); return value;
  };
  const cfg = await configuration(); await configuration({ revision: cfg.revision, files: [extension] });
  const { sessionId } = await f.create('omaa-pi');
  f.replyWith(request => {
    if (!request.tools?.length || request.messages.at(-1)?.role === 'tool') return textReply('Done.');
    const text = request.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : (m.content ?? []).map(p => p.text ?? '').join('\n')).at(-1) ?? '';
    return toolReply(text.includes('EXTRA') ? 'dynamic_extra' : 'dynamic_value', {});
  });
  const version = async (prompt, expected) => {
    const from = f.requests.length, result = await f.prompt(sessionId, prompt);
    assert(result.records.some(r => r.event?.type === 'tool/result' && r.event.data.meta?.piExtension?.details.version === expected), JSON.stringify(result.records.filter(r => r.event?.type === 'tool/result')));
    return f.requests.slice(from);
  };
  const first = await version('INITIAL_VALUE', 1);
  assert(first.some(r => r.tools?.some(t => t.function.name === 'dynamic_value')), 'session_start must register before the first native assembly');
  const command = name => f.call('commands/execute', { agentId: sessionId, line: '/' + name, submittedAttachments: [] });
  await command('change_dynamic');
  const changed = await version('REPLACED_VALUE', 2);
  assert(changed.some(r => r.tools?.some(t => t.function.name === 'dynamic_extra')));
  assert(changed.some(r => JSON.stringify(r.messages).includes('Dynamic guideline 2')));
  let notices = await configuration(undefined, 'pi-extension-notices?session=' + encodeURIComponent(sessionId));
  assert(notices.notices.some(n => n.text === 'DYNAMIC_INPUT:REPLACED_VALUE'));
  await command('remove_dynamic_event');
  await assert.rejects(command('reject_dynamic'), /minLength/);
  // Rejecting the native output schema must restore both host and guest
  // definitions, including the previous callback and subsequent registration.
  await version('AFTER_REJECTED_VALUE', 2);
  await version('NEW_EXTRA', 7);
  notices = await configuration(undefined, 'pi-extension-notices?session=' + encodeURIComponent(sessionId));
  assert(notices.notices.some(n => n.text === 'EVENT_REMOVED'));
  assert(!notices.notices.some(n => n.text === 'DYNAMIC_INPUT:AFTER_REJECTED_VALUE'));
  const states = await configuration();
  assert(states.states.some(row => row.sessionId === sessionId && row.displayTitle && row.displayTitle !== sessionId));
});
