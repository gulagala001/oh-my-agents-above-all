import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadCursorRules, apply, inject } from '../src/cursor-rules.mjs';
async function fixture(t) { const cwd = await fs.mkdtemp(path.join(tmpdir(), 'omaa-cursor-rules-')); t.after(() => fs.rm(cwd, { recursive: true, force: true })); return cwd; }
async function rule(cwd, name, header, content = name) { const file = path.join(cwd, '.cursor/rules', name + '.mdc'); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '---\n' + header + '\n---\n' + content); return file; }
function host() { const hooks = new Map(), tools = new Map(), sections = [], warnings = []; const ctx = { tools: { register: tool => tools.set(tool.name, tool) }, systemPrompt: { section: section => sections.push(section) }, on: (name, handler) => hooks.set(name, handler), logger: { warn: value => warnings.push(value) } }; apply(ctx); return { hooks, tools, section: sections[0], warnings, async assemble(agent, messages = []) { for (const message of messages) hooks.get('agent/inbox/claimed')({agent,message}); const initial = { sections: [{name:'existing',text:'retain'}, {name:sections[0].name,text:sections[0].text({agent}),interpolate:false}], contexts: [], tools: [] }; return hooks.get('system-prompt/assemble')(initial,{agent},async()=>initial); } }; }

test('official field precedence, glob files, description-only catalog and explicit manual', async t => {
  const cwd = await fixture(t);
  await rule(cwd, 'always', 'alwaysApply: true\nglobs: nope/**\ndescription: ignored', '{{ literal }}');
  await rule(cwd, 'typed', 'alwaysApply: false\nglobs: src/**/*.ts, src/**/*.tsx\ndescription: not agent requested');
  await rule(cwd, 'choose', 'description: Backend conventions\nalwaysApply: false', 'PRIVATE_BODY');
  await rule(cwd, 'manual', 'alwaysApply: false');
  const result = await loadCursorRules({ cwd, paths: ['src/a.ts'] });
  assert.deepEqual(result.automatic.map(r => [r.name, r.reason]), [['always','alwaysApply'],['typed','glob']]);
  assert.equal(result.automatic[0].content, '{{ literal }}'); assert.deepEqual(result.available, [{ name: 'choose', description: 'Backend conventions' }]);
  assert.ok(!JSON.stringify(result.available).includes('PRIVATE_BODY'));
  assert.ok((await loadCursorRules({ cwd, requested: ['@manual.mdc'] })).automatic.some(r => r.name === 'manual' && r.reason === 'requested'));
  assert.ok(!(await loadCursorRules({ cwd, paths: ['a.ts'] })).automatic.some(r => r.name === 'typed'));
});

test('nested rule names, YAML arrays/block descriptions, root legacy, empty metadata and ignored markdown', async t => {
  const cwd = await fixture(t);
  await rule(cwd, 'nested/style', 'globs: ["src/{a,b}.ts", "**/*.css"]\ndescription: >-\n  Multiple line\n  description');
  await rule(cwd, 'empty', '');
  await fs.writeFile(path.join(cwd, '.cursorrules'), 'legacy pure text');
  await fs.writeFile(path.join(cwd, '.cursor/rules/ignored.md'), 'not a rule');
  const result = await loadCursorRules({ cwd, paths: ['src/b.ts'], requested: ['empty'] });
  assert.deepEqual(result.automatic.map(r => r.name), ['.cursorrules','empty','nested/style']);
  assert.equal(result.automatic[0].content, 'legacy pure text');
});

test('step reload observes modifications and selected names must be discovered/unambiguous', async t => {
  const cwd = await fixture(t); const file = await rule(cwd, 'choice', 'description: Pick me', 'v1');
  assert.equal((await loadCursorRules({ cwd, requested: ['choice'] })).automatic[0].content, 'v1');
  await fs.writeFile(file, '---\ndescription: Pick me\n---\nv2');
  assert.equal((await loadCursorRules({ cwd, requested: ['choice.mdc'] })).automatic[0].content, 'v2');
  await assert.rejects(loadCursorRules({ cwd, requested: ['missing'] }), /rule not found/);
  await rule(cwd, 'a/shared', ''); await rule(cwd, 'b/shared', '');
  await assert.rejects(loadCursorRules({ cwd, requested: ['shared'] }), /ambiguous/);
  await assert.rejects(loadCursorRules({ cwd, requested: ['../outside'] }), /invalid requested/);
});

test('workspace escape/symlink/hardlink and byte/discovery budgets are rejected', async t => {
  const cwd = await fixture(t), outside = await fixture(t);
  await rule(cwd, 'paths', 'globs: **/*.ts');
  await fs.writeFile(path.join(outside, 'a.ts'), 'not read');
  await fs.symlink(outside, path.join(cwd, 'outside'));
  assert.deepEqual((await loadCursorRules({ cwd, paths: ['../a.ts', path.join(outside,'a.ts'), 'outside/a.ts'] })).automatic, []);
  await fs.symlink(path.join(outside,'a.ts'), path.join(cwd,'.cursor/rules/link.mdc'));
  await assert.rejects(loadCursorRules({ cwd }), /symbolic link/); await fs.unlink(path.join(cwd,'.cursor/rules/link.mdc'));
  await fs.link(path.join(outside,'a.ts'), path.join(cwd,'.cursor/rules/hard.mdc'));
  await assert.rejects(loadCursorRules({ cwd }), /unlinked file/); await fs.unlink(path.join(cwd,'.cursor/rules/hard.mdc'));
  await rule(cwd, 'large', 'alwaysApply: true', 'x'.repeat(33 * 1024));
  await assert.rejects(loadCursorRules({ cwd }), /file budget/);
});

test('symlinked .cursor directory and malformed metadata fail explicitly', async t => {
  const cwd = await fixture(t), outside = await fixture(t); await fs.mkdir(path.join(outside,'rules')); await fs.symlink(outside,path.join(cwd,'.cursor'));
  await assert.rejects(loadCursorRules({ cwd }), /symbolic link/); await fs.unlink(path.join(cwd,'.cursor'));
  for (const header of ['alwaysApply: "true"','description: [nested]','globs: [false]','alwaysApply: true\nalwaysApply: false','globs: ../outside/**']) {
    await rule(cwd, 'bad', header); await assert.rejects(loadCursorRules({ cwd }), /Cursor rules:/);
  }
});

test('plugin loads literal scope rules from real tool results, manual mentions and next-step requests', async t => {
  const cwd = await fixture(t), agent = { session: { header: { cwd } } }, other = { session: { header: { cwd } } }, h = host();
  assert.deepEqual(inject, ['tools','systemPrompt']); assert.equal(h.section.interpolate,false);
  await rule(cwd,'always','alwaysApply: true','{{not_interpolated}}'); await rule(cwd,'file','globs: src/**'); await rule(cwd,'choose','description: API rules','CHOSEN_SECRET_BODY'); await rule(cwd,'manual','');
  const step = messages => h.assemble(agent,messages);
  await step([]); assert.ok(h.section.text({agent}).includes('{{not_interpolated}}')); assert.ok(!h.section.text({agent}).includes('CHOSEN_SECRET_BODY')); assert.equal(h.section.text({agent:other}),'');
  assert.throws(()=>h.tools.get('cursor_rule').execute({name:'unknown'},{agent}),/not found/);
  const response=h.tools.get('cursor_rule').execute({name:'choose'},{agent}); assert.ok(response.includes('next step')); assert.ok(!response.includes('CHOSEN_SECRET_BODY')); assert.ok(!h.section.text({agent}).includes('CHOSEN_SECRET_BODY'));
  h.hooks.get('tools/result')({agent,name:'read',arguments:{file_path:path.join(cwd,'src/file.ts')}},{isError:false});
  await step([{source:{kind:'user'},content:[{type:'text',text:'Use @manual.'},{type:'file',attachment:{name:'src/fake.ts',attachmentId:'opaque',bytes:5}}]}]);
  assert.ok(h.section.text({agent}).includes('CHOSEN_SECRET_BODY')); assert.ok(h.section.text({agent}).includes('file (glob)'));
  // Punctuation following @manual is not part of the rule name.
  assert.ok(h.section.text({agent}).includes('manual (requested)'));
  await rule(cwd,'always','alwaysApply: true','UPDATED'); await step([]); assert.ok(h.section.text({agent}).includes('UPDATED'));
});

test('plugin does not infer workspace paths from opaque upload labels and reports invalid rule failures', async t => {
  const cwd=await fixture(t),agent={session:{header:{cwd}}},h=host(); await rule(cwd,'scoped','globs: **/*.ts');
  const step=messages=>h.assemble(agent,messages);
  await step([{source:{kind:'user'},content:[{type:'file',attachment:{name:'src/upload.ts',attachmentId:'opaque'}}]}]); assert.ok(!h.section.text({agent}).includes('scoped (glob)'));
  await rule(cwd,'invalid','alwaysApply: 7'); await step([]); assert.ok(h.section.text({agent}).includes('were not applied')); assert.equal(h.warnings.length,1); assert.throws(()=>h.tools.get('cursor_rule').execute({name:'scoped'},{agent}),/catalog has not loaded/);
});

test('file count and aggregate selected context are bounded', async t => {
  const cwd = await fixture(t);
  for (let i=0;i<129;i++) await rule(cwd, 'rule-'+i, '');
  await assert.rejects(loadCursorRules({cwd}), /discovery exceeds budget/);
  await fs.rm(path.join(cwd,'.cursor/rules'),{recursive:true});
  for (let i=0;i<3;i++) await rule(cwd, 'large-'+i, 'alwaysApply: true', 'x'.repeat(24*1024));
  await assert.rejects(loadCursorRules({cwd}), /context budget/);
});

test('manual rule bodies are not injected from assistant mentions or failed file results', async t => {
  const cwd=await fixture(t),agent={session:{header:{cwd}}},h=host();
  await rule(cwd,'manual','','MANUAL_BODY'); await rule(cwd,'typed','globs: **/*.ts');
  h.hooks.get('tools/result')({agent,name:'read',arguments:{file_path:'a.ts'}},{isError:true});
  await h.assemble(agent,[{source:{kind:'assistant'},content:[{type:'text',text:'@manual'}]}]);
  assert.ok(!h.section.text({agent}).includes('MANUAL_BODY')); assert.ok(!h.section.text({agent}).includes('typed (glob)'));
});

test('DSH assemble-before-pre-step sees first-request always/manual and next-request read glob', async t => {
  const cwd=await fixture(t),agent={session:{header:{cwd}}},h=host();
  await rule(cwd,'always','alwaysApply: true','FIRST_REQUEST_ALWAYS {{literal}}');
  await rule(cwd,'manual','','FIRST_REQUEST_MANUAL');
  await rule(cwd,'typed','globs: src/**/*.ts','READ_NEXT_REQUEST_GLOB');
  const preStep = assembly => assembly; // Host pre-step consumes the already assembled request.
  const first=preStep(await h.assemble(agent,[{source:{kind:'user'},content:[{type:'text',text:'Use @manual'}]}]));
  const section=assembly=>assembly.sections.find(s=>s.name==='omaa:cursor-rules');
  assert.ok(section(first).text.includes('FIRST_REQUEST_ALWAYS {{literal}}'));
  assert.ok(section(first).text.includes('FIRST_REQUEST_MANUAL'));
  assert.ok(!section(first).text.includes('READ_NEXT_REQUEST_GLOB'));
  assert.equal(section(first).interpolate,false); assert.equal(first.sections[0].text,'retain');
  h.hooks.get('tools/result')({agent,name:'read',arguments:{file_path:'src/read.ts'}},{isError:false});
  const second=preStep(await h.assemble(agent));
  assert.ok(section(second).text.includes('READ_NEXT_REQUEST_GLOB'));
  await rule(cwd,'always','alwaysApply: true','CHANGED_FOR_THIS_REQUEST');
  assert.ok(section(await h.assemble(agent)).text.includes('CHANGED_FOR_THIS_REQUEST'));
});
