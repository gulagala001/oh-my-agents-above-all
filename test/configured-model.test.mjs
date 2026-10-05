import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { installedHost } from './fixtures/installed-host.mjs';
import { loadConfiguredRoute } from './fixtures/configured-route.mjs';
import { products } from '../src/shared/products.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = 'export function clamp(value, lower, upper) { return Math.min(lower, Math.max(upper, value)); }\n';
const unchangedTest = 'import assert from "node:assert/strict"; import {clamp} from "./math.mjs"; assert.equal(clamp(5,0,10),5); assert.equal(clamp(-2,0,10),0); assert.equal(clamp(20,0,10),10); console.log("CLAMP_TEST_PASSED");\n';
function executionProof(events) {
  const command = event => { try { const args=typeof event.data.arguments==='string'?JSON.parse(event.data.arguments):event.data.arguments;return args?.command??''; }catch{return '';} };
  const executions=new Set(events.filter(e=>e.type==='tool/call'&&['bash','pwsh'].includes(e.data.name)&&/\bnode\s+(?:\.\/)?test\.mjs\b/.test(command(e))).map(e=>e.data.callId));
  return events.some(e=>e.type==='tool/result'&&executions.has(e.data.message?.toolCallId)&&!e.data.message.isError&&JSON.stringify(e.data.message.content??[]).includes('CLAMP_TEST_PASSED'));
}

test('native tool execution proof matches message.toolCallId and excludes test-source reads/errors', () => {
  const call={type:'tool/call',data:{callId:'native-shell',name:'bash',arguments:JSON.stringify({command:'node test.mjs'})}};
  const result={type:'tool/result',data:{message:{role:'tool',toolCallId:'native-shell',content:[{type:'text',text:'CLAMP_TEST_PASSED'}],isError:false}}};
  assert.ok(executionProof([call,result]));
  assert.ok(!executionProof([{type:'tool/call',data:{callId:'read',name:'read',arguments:{file_path:'test.mjs'}}},{...result,data:{message:{...result.data.message,toolCallId:'read'}}}]));
  assert.ok(!executionProof([call,{...result,data:{message:{...result.data.message,isError:true}}}]));
  assert.ok(!executionProof([call,{...result,data:{message:{...result.data.message,toolCallId:'orphan'}}}]));
});

test('configured route loader parses inert JS YAML and preserves native provider/model settings', async t => {
  const home=await mkdtemp(join(tmpdir(),'omaa-configured-route-'));t.after(()=>rm(home,{recursive:true,force:true}));
  await mkdir(join(home,'profiles','fixture'),{recursive:true});
  await writeFile(join(home,'profiles','fixture','cordis.patch.yml'), '- name: "@deepseek-ai/dsh-llm-pi-ai"\n  config:\n    unused: !!js "globalThis.OMAA_YAML_EXECUTED = true"\n    providers:\n      opencode-zen:\n        api: openai-completions\n        baseURL: http://127.0.0.1:1/v1\n        apiKeyEnv: DUMMY_KEY\n        compat:\n          supportsDeveloperRole: false\n        models:\n          - id: space-bunny-free\n            name: Fixture free route\n            contextWindow: 123456\n            maxTokens: 4096\n');
  await writeFile(join(home,'.credentials.yaml'),'version: 1\nrefs:\n  DUMMY_KEY: dummy-local-test-only\n');
  const route=await loadConfiguredRoute({home,profile:'fixture'});
  assert.equal(route.providerId,'opencode-zen');assert.equal(route.model,'space-bunny-free');assert.equal(route.modelDefinition.name,'Fixture free route');assert.equal(route.contextWindow,123456);assert.equal(route.compat.supportsDeveloperRole,false);assert.equal(globalThis.OMAA_YAML_EXECUTED,undefined);
  await assert.rejects(loadConfiguredRoute({home,profile:'../outside'}),/invalid profile/);
  await assert.rejects(loadConfiguredRoute({home,profile:'fixture',model:'missing'}),/model unavailable/);
});

test('five presets finish an actual coding task with the authorized configured free DSH route', { skip: !process.env.OMAA_CONFIGURED_DSH_HOME, timeout: 360000 }, async t => {
  const route = await loadConfiguredRoute();
  const settingsPath=join(process.env.OMAA_CONFIGURED_DSH_HOME,'profiles',process.env.OMAA_CONFIGURED_PROFILE??'trisoul-x','cordis.patch.yml');
  const credentialPath=join(process.env.OMAA_CONFIGURED_DSH_HOME,'.credentials.yaml');
  const originalHashes=[hash(await readFile(settingsPath)),hash(await readFile(credentialPath))];
  const selected=process.env.OMAA_CONFIGURED_PRODUCTS?.split(',').filter(Boolean) ?? products.map(p=>p.id);
  assert.ok(selected.length&&selected.every(id=>products.some(p=>p.id===id)),'Unknown requested product selection');
  const reports=[];
  t.after(async()=>{
    const unchanged=hash(await readFile(settingsPath))===originalHashes[0]&&hash(await readFile(credentialPath))===originalHashes[1];
    await mkdir('.cache',{recursive:true});
    let previous;try{previous=JSON.parse(await readFile('.cache/configured-model-results.json','utf8'));}catch{}
    const compatible=previous?.provider===route.providerId&&previous?.model===route.model;
    const retained=compatible?(previous.results??[]).filter(report=>!selected.includes(report.product)):[];
    const runs=compatible?(previous.runs??[]):[];
    runs.push({at:new Date().toISOString(),products:selected,results:reports});
    await writeFile('.cache/configured-model-results.json',JSON.stringify({provider:route.providerId,model:route.model,configurationUnchanged:unchanged,results:[...retained,...reports],runs},null,2)+'\n');
    assert.ok(unchanged,'Authorized source configuration changed during isolated verification');
  });
  const f=await installedHost(t,{liveSettings:route});await f.install();await f.boot();
  await Promise.all(products.filter(product=>selected.includes(product.id)).map(async product=>{
    const started=Date.now(),report={product:product.id,provider:route.providerId,model:route.model,task:'clamp correction and unchanged test execution',passed:false,checks:{},tools:[]};reports.push(report);
    let sessionId;
    try {
      const directory=join(f.workspace,product.id);await mkdir(directory);
      await writeFile(join(directory,'math.mjs'),original);await writeFile(join(directory,'test.mjs'),unchangedTest);
      const created=await f.rpc('session/create',{cwd:directory,agentPreset:product.preset});
      sessionId=created.sessionId;
      const result=await f.prompt(sessionId,'这是一个小修复：读取当前目录 math.mjs 和 test.mjs，修正 clamp 的错误，执行 node test.mjs 验证，再说明结果。只修改 math.mjs，不修改测试。直接完成，无需计划模式或询问。',{timeout:300000});
      const events=result.records.filter(r=>r.event).map(r=>r.event);
      report.tools=[...new Set(events.filter(e=>e.type==='tool/call').map(e=>e.data.name))];
      report.checks.corrected=(await readFile(join(directory,'math.mjs'),'utf8'))!==original;
      report.checks.testUnchanged=(await readFile(join(directory,'test.mjs'),'utf8'))===unchangedTest;
      report.checks.nativeEdit=events.some(e=>e.type==='tool/call'&&['edit','write'].includes(e.data.name));
      report.checks.executed=executionProof(events);
      const header=events.findLast(e=>e.type==='request/header');
      report.checks.nativeRoute=header?.data.header.config.provider===route.providerId&&header?.data.header.config.model===route.model;
      report.passed=Object.values(report.checks).every(Boolean);
      if(!report.passed)report.failure='task-verification';
    }catch(error){
      report.failure=error.message?.includes('timed out')?'timeout':'native-task-or-route';
      if(sessionId)try{const snapshot=await f.snapshot(sessionId);const events=snapshot.records.filter(r=>r.event).map(r=>r.event);report.tools=[...new Set(events.filter(e=>e.type==='tool/call').map(e=>e.data.name))];report.lastEventTypes=events.slice(-8).map(e=>e.type);}catch{report.snapshotAvailable=false;}
    }
    finally{report.elapsedMs=Date.now()-started;}
  }));
  assert.ok(reports.every(report=>report.passed),JSON.stringify(reports.map(({product,passed,checks,failure})=>({product,passed,checks,failure}))));
});
