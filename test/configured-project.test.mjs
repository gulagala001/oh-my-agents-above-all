import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedHost } from './fixtures/installed-host.mjs';
import { loadConfiguredRoute } from './fixtures/configured-route.mjs';
import { products } from '../src/shared/products.mjs';
import { captureNativeSessions } from './fixtures/configured-project/snapshot.mjs';
import { tmpdir } from 'node:os';
import { zstdCompressSync } from 'node:zlib';
const exec=promisify(execFile), seed=fileURLToPath(new URL('./fixtures/configured-project/project/',import.meta.url));
const checker=fileURLToPath(new URL('./fixtures/configured-project/acceptance.mjs',import.meta.url));
const hash=text=>createHash('sha256').update(text).digest('hex');
const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
async function files(root,relative=''){const entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});let result=[];for(const e of entries){const name=path.join(relative,e.name);if(e.isDirectory())result.push(...await files(root,name));else if(e.isFile())result.push(name);}return result;}
async function grade(cwd){try{const result=await exec(process.execPath,[checker,cwd],{cwd,env,timeout:90000,maxBuffer:1024*1024});return JSON.parse(result.stdout);}catch(error){try{return JSON.parse(error.stdout);}catch{return[{name:'external acceptance process',passed:false,error:'grader-process-failed'}];}}}
const task='请完成这个多文件任务工程的 README.md 全部需求。先阅读 AGENTS.md、README 和现有 src/test，实际运行 npm test 观察已有原子性缺陷，再修复并实现 CSV、priority、纯 upsert 和 CLI --dry-run。必须保留现有测试/材料，新增自己的有意义测试，最终实际运行原有与新增测试。只改 AGENTS 允许的文件；不安装依赖、不联网、不提交。目标和错误码/逻辑record行号已在 README 全部写明，不需要猜测。直接完成；若你仍需用户的决定才可继续，明确报告那个阻碍。';
function nativeSummary(events){const calls=new Map(events.filter(e=>e.type==='tool/call').map(e=>[e.data.callId,e.data]));return events.filter(e=>e.type==='tool/result').map(e=>{const call=calls.get(e.data.message?.toolCallId),text=JSON.stringify(e.data.message?.content??[]);return{name:call?.name??'unknown',callId:e.data.message?.toolCallId,isError:e.data.message?.isError===true,testFailure:/not ok|fail["\\: ]+[1-9]|AssertionError/.test(text),testSuccess:/pass["\\: ]+[1-9]|tests passed|test passed/i.test(text)};});}
const taskTimeout=Number(process.env.OMAA_CONFIGURED_PROJECT_TIMEOUT_MS??300000);
if(!Number.isSafeInteger(taskTimeout)||taskTimeout<1000||taskTimeout>900000)throw new Error('Invalid configured project task timeout');

test('external project acceptance rejects the unchanged known-bug baseline',async()=>{const checks=await grade(seed);assert.ok(checks.some(check=>check.name==='bad status atomically rejects'&&!check.passed));assert.ok(checks.some(check=>check.name==='CLI dry-run preserves exact original bytes'&&!check.passed));});

test('cold snapshot verifies multi-frame journals and never copies credentials or protected route data',async t=>{
  const root=await fs.mkdtemp(path.join(tmpdir(),'omaa-project-snapshot-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const home=path.join(root,'home'),cwd=path.join(root,'workspace'),sessionId='session-fixture',log=path.join(home,'sessions','project',sessionId,'session.v4.jsonl.zstd');await fs.mkdir(path.dirname(log),{recursive:true});await fs.mkdir(cwd);await fs.writeFile(path.join(cwd,'source.mjs'),'export const value = 1;\n');await fs.writeFile(path.join(home,'.credentials.yaml'),'not copied');
  const header=JSON.stringify({type:'session',version:4,id:sessionId,cwd})+'\n',route={apiKey:'dummy-protected-credential',baseUrl:'https://invalid.example/v1'};
  const journal=extra=>Buffer.concat([zstdCompressSync(Buffer.from(header)),zstdCompressSync(Buffer.from(JSON.stringify({type:'event',value:extra})+'\n'))]);
  await fs.writeFile(log,journal('safe'));const destination=path.join(root,'captured');const result=await captureNativeSessions({home,destination,sessions:[{product:'fixture',sessionId,cwd}],route});assert.equal(result.sessions.length,1);assert.deepEqual(result.rejected,[]);await assert.rejects(fs.stat(path.join(destination,'.credentials.yaml')),{code:'ENOENT'});
  await fs.writeFile(log,journal(route.apiKey));const denied=await captureNativeSessions({home,destination:path.join(root,'denied'),sessions:[{product:'fixture',sessionId,cwd}],route});assert.equal(denied.sessions.length,0);assert.equal(denied.rejected[0].reason,'protected-route-data-in-journal');await assert.rejects(fs.stat(path.join(root,'denied/sessions')),{code:'ENOENT'});
});

test('five configured free-model presets complete the same multi-file task project', {skip:!process.env.OMAA_CONFIGURED_DSH_HOME||Boolean(process.env.OMAA_CONFIGURED_PROJECT_RESUME),timeout:taskTimeout+180000},async t=>{
  const route=await loadConfiguredRoute(),selected=process.env.OMAA_CONFIGURED_PROJECT_PRODUCTS?.split(',').filter(Boolean)??products.map(p=>p.id);
  assert.ok(selected.length&&selected.every(id=>products.some(p=>p.id===id)));
  const runId=new Date().toISOString().replace(/[:.]/g,'-'),evidence=path.resolve('.cache/configured-project',runId);await fs.mkdir(evidence,{recursive:true});
  await fs.copyFile(checker,path.join(evidence,'acceptance.mjs'));
  const redact=text=>[route.apiKey,route.baseUrl,new URL(route.baseUrl).origin].sort((a,b)=>b.length-a.length).reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),String(text));
  const originalPaths=[path.join(process.env.OMAA_CONFIGURED_DSH_HOME,'profiles',process.env.OMAA_CONFIGURED_PROFILE??'trisoul-x','cordis.patch.yml'),path.join(process.env.OMAA_CONFIGURED_DSH_HOME,'.credentials.yaml')];
  const originalHashes=await Promise.all(originalPaths.map(async p=>hash(await fs.readFile(p))));
  let f;const reports=[];
  // This hook must precede installedHost's cleanup hook. Stop our host, capture
  // complete native journals and workspaces, then let the fixture remove credentials.
  t.after(async()=>{if(f){await f.stop();const snapshot=await captureNativeSessions({home:f.home,destination:path.join(evidence,'native'),sessions:reports.filter(r=>r.sessionId).map(r=>({product:r.product,sessionId:r.sessionId,cwd:r.cwd})),route});await fs.writeFile(path.join(evidence,'snapshot-result.json'),JSON.stringify(snapshot,null,2)+'\n');}const unchanged=(await Promise.all(originalPaths.map(async p=>hash(await fs.readFile(p))))).every((value,i)=>value===originalHashes[i]);await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify({provider:route.providerId,model:route.model,configurationUnchanged:unchanged,results:reports},null,2)+'\n');t.diagnostic('Project evidence: '+evidence);assert.ok(unchanged);});
  f=await installedHost(t,{liveSettings:route});
  await f.install();await f.boot();
  await Promise.all(products.filter(product=>selected.includes(product.id)).map(async product=>{
    const started=Date.now(),directory=path.join(f.workspace,product.id);await fs.cp(seed,directory,{recursive:true});
    const frozen=(await files(seed)).filter(file=>!file.startsWith('src'+path.sep)),hashes=new Map(await Promise.all(frozen.map(async file=>[file,hash(await fs.readFile(path.join(seed,file)))])));
    const report={product:product.id,passed:false,checks:[],native:[]};reports.push(report);let sessionId,observed;
    try{const created=await f.rpc('session/create',{cwd:directory,agentPreset:product.preset});sessionId=created.sessionId;report.sessionId=sessionId;report.cwd=directory;
      const result=await f.prompt(sessionId,task,{timeout:taskTimeout});observed=result;const events=result.records.filter(r=>r.event).map(r=>r.event);report.native=nativeSummary(events);report.endReasons=events.filter(e=>e.type==='turn/end').map(e=>e.data.reason?.kind??'unknown');
      const header=events.findLast(e=>e.type==='request/header');report.checks.push({name:'native DSH configured route',passed:header?.data.header.config.provider===route.providerId&&header?.data.header.config.model===route.model});
    }catch(error){report.failure=error.message?.includes('timed out')?'timeout':'native-task-or-route';if(sessionId){
      // Quiesce our own native session before reading/grading mutable workspace files.
      try{await f.rpc('session/cancel',{sessionId});const end=Date.now()+20000;while(Date.now()<end){if(!(await f.api(sessionId)).value.running){report.cancelledBeforeGrade=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}if(!report.cancelledBeforeGrade){await f.stop();report.hostStoppedBeforeGrade=true;}}catch{await f.stop();report.hostStoppedBeforeGrade=true;}
      try{const snapshot=await f.snapshot(sessionId);observed=snapshot;const events=snapshot.records.filter(r=>r.event).map(r=>r.event);report.native=nativeSummary(events);report.lastEventTypes=events.slice(-8).map(e=>e.type);report.endReasons=events.filter(e=>e.type==='turn/end').map(e=>e.data.reason?.kind??'unknown');}catch{report.snapshotAvailable=false;}
    }}
    try{
      report.checks.push(...await grade(directory));
      let preserved=true;for(const[file,digest]of hashes)if(hash(await fs.readFile(path.join(directory,file)))!==digest)preserved=false;
      report.checks.push({name:'original AGENTS README package tests fixtures preserved',passed:preserved});
      const added=(await files(directory)).filter(file=>file.startsWith('test'+path.sep)&&file.endsWith('.test.mjs')&&!hashes.has(file));
      report.checks.push({name:'model added its own tests',passed:added.length>0});
      report.checks.push({name:'actual native test execution',passed:report.native.some(r=>['bash','pwsh'].includes(r.name)&&r.testSuccess&&!r.testFailure&&!r.isError)});
      report.checks.push({name:'actual baseline failure observed',passed:report.native.some(r=>['bash','pwsh'].includes(r.name)&&r.testFailure)});
    }catch{report.checks.push({name:'workspace acceptance',passed:false,error:'workspace-read-failed'});}
    report.passed=!report.failure&&report.checks.every(check=>check.passed);report.elapsedMs=Date.now()-started;
    const output=path.join(evidence,product.id);await fs.mkdir(output);for(const file of await files(directory)){if(!file.startsWith('src'+path.sep)&&!file.startsWith('test'+path.sep))continue;const source=path.join(directory,file),stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)continue;const target=path.join(output,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,redact(await fs.readFile(source,'utf8')));}
    if(observed){const raw=JSON.stringify(observed,null,2);report.diagnosticsRedacted=redact(raw)!==raw;await fs.writeFile(path.join(output,'native-view.json'),redact(raw)+'\n');}
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
  }));
  assert.ok(reports.every(report=>report.passed),JSON.stringify(reports.map(r=>({product:r.product,passed:r.passed,failure:r.failure,failed:r.checks.filter(c=>!c.passed).map(c=>c.name)}))));
});

const resumeSource=process.env.OMAA_CONFIGURED_PROJECT_RESUME;
test('the same cold ZCode session compacts natively and implements the appended report requirement', {skip:!process.env.OMAA_CONFIGURED_DSH_HOME||!resumeSource,timeout:taskTimeout+360000},async t=>{
  const source=path.resolve(resumeSource),manifest=JSON.parse(await fs.readFile(path.join(source,'native/manifest.json'),'utf8'));
  const saved=manifest.sessions.find(s=>s.product==='zcode');assert.ok(saved&&!manifest.rejected?.length,'An authoritative safe ZCode snapshot is required');
  const relative=path.relative(tmpdir(),saved.cwd);assert.match(relative,/^omaa-installed-[A-Za-z0-9]+[\\/]workspace[\\/]zcode$/,'Only our removed temporary workspace may be recreated');
  const restoredRoot=path.resolve(saved.cwd,'../..');await assert.rejects(fs.stat(restoredRoot),{code:'ENOENT'});
  const route=await loadConfiguredRoute(),evidence=path.resolve('.cache/configured-project',new Date().toISOString().replace(/[:.]/g,'-')+'-cold-report');await fs.mkdir(evidence,{recursive:true});
  const reportChecker=fileURLToPath(new URL('./fixtures/configured-project/report-acceptance.mjs',import.meta.url));await fs.copyFile(reportChecker,path.join(evidence,'report-acceptance.mjs'));await fs.copyFile(checker,path.join(evidence,'acceptance.mjs'));
  const redact=text=>[route.apiKey,route.baseUrl,new URL(route.baseUrl).origin].sort((a,b)=>b.length-a.length).reduce((v,k)=>v.replaceAll(k,'[redacted]'),String(text));
  const originalPaths=[path.join(process.env.OMAA_CONFIGURED_DSH_HOME,'profiles',process.env.OMAA_CONFIGURED_PROFILE??'trisoul-x','cordis.patch.yml'),path.join(process.env.OMAA_CONFIGURED_DSH_HOME,'.credentials.yaml')],digests=await Promise.all(originalPaths.map(async p=>hash(await fs.readFile(p))));
  const report={product:'zcode',sessionId:saved.sessionId,cwd:saved.cwd,passed:false,checks:[],native:[]};let f;
  t.after(async()=>{
    try{if(f){await f.stop();const result=await captureNativeSessions({home:f.home,destination:path.join(evidence,'native'),sessions:[saved],route});await fs.writeFile(path.join(evidence,'snapshot-result.json'),JSON.stringify(result,null,2)+'\n');}}
    finally{const unchanged=(await Promise.all(originalPaths.map(async p=>hash(await fs.readFile(p))))).every((v,i)=>v===digests[i]);await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify({provider:route.providerId,model:route.model,configurationUnchanged:unchanged,sourceSnapshot:source,results:[report]},null,2)+'\n');await fs.rm(restoredRoot,{recursive:true,force:true});t.diagnostic('Cold project evidence: '+evidence);assert.ok(unchanged);}
  });
  await fs.mkdir(path.dirname(saved.cwd),{recursive:true});await fs.cp(path.join(source,'native/workspaces/zcode'),saved.cwd,{recursive:true});
  const frozen=(await files(saved.cwd)).filter(file=>!file.startsWith('src'+path.sep)),beforeHashes=new Map(await Promise.all(frozen.map(async file=>[file,hash(await fs.readFile(path.join(saved.cwd,file)))])));
  f=await installedHost(t,{liveSettings:route});await f.install();await fs.cp(path.join(source,'native/sessions'),path.join(f.home,'sessions'),{recursive:true});await f.boot();
  const fullSnapshot=async()=>{const p=await f.rpc('session/projections',{sessionId:saved.sessionId});return f.rpc('session/page',{address:{kind:'session',sessionId:saved.sessionId},throughSeq:p.asOfSeq,maxMessages:10000});};
  const restored=await f.api(saved.sessionId);assert.equal(restored.status,200);assert.equal(restored.value.product.id,'zcode');assert.equal(restored.value.running,false);
  report.checks.push({name:'native controller cold resumed original session',passed:true});
  const before=await fullSnapshot(),beforeEvents=before.records.map(r=>r.event).filter(Boolean),system=beforeEvents.find(e=>e.type==='system/message');assert.ok(system);
  const compact=await f.call('commands/execute',{agentId:saved.sessionId,line:'/compact',submittedAttachments:[]});assert.match(JSON.stringify(compact),/Compacted/);
  const after=await fullSnapshot(),afterEvents=after.records.map(r=>r.event).filter(Boolean),start=afterEvents.findLast(e=>e.type==='compaction/start'),summary=afterEvents.findLast(e=>e.type==='compaction/summary'),end=afterEvents.findLast(e=>e.type==='compaction/end');
  assert.ok(start&&summary&&end);assert.equal(start.data.compactionId,summary.data.compactionId);assert.equal(end.data.compactionId,summary.data.compactionId);assert.ok(!end.data.error);assert.ok(summary.data.shadowedSeqs.length);assert.ok(!summary.data.shadowedSeqs.includes(system.seq));assert.equal(start.data.turn,null);
  const turns=events=>events.filter(e=>['turn/start','turn/end'].includes(e.type)).map(e=>[e.seq,e.type,e.data.turn]);assert.deepEqual(turns(afterEvents),turns(beforeEvents));
  const pairs=events=>events.filter(e=>['tool/call','tool/result'].includes(e.type)).map(e=>[e.seq,e.type,e.type==='tool/call'?e.data.callId:e.data.message.toolCallId]);assert.deepEqual(pairs(afterEvents),pairs(beforeEvents));
  report.checks.push({name:'native compact lifecycle original system and tool pairs preserved',passed:true});
  await fs.writeFile(path.join(evidence,'compaction-view.json'),redact(JSON.stringify(after,null,2))+'\n');
  const followup='在刚才工程基础上追加一个需求：CLI 支持 --report <path>，可与 --dry-run 一起用，这两个选项顺序任意。normal 和 dry-run 都把 stdout 同一个完整 preview JSON（tasks、added、updated）写入 report 路径；dry-run 仍不能改 tasks 原文件。CSV/header/row 校验失败时 tasks 和已存在 report 的原始字节都必须不变；report 尚不存在则失败时不能创建它。保留 README 原全部公开合同、原有全部测试和材料，不修改冻结 README/AGENTS/package/既有测试，只改 source 和新增自己的报告测试。请真实运行已有及新增测试，直接完成，不安装依赖/不联网/不提交。';
  let observed;const started=Date.now();
  try{await f.prompt(saved.sessionId,followup,{timeout:taskTimeout});observed=await fullSnapshot();}
  catch(error){report.failure=error.message?.includes('timed out')?'timeout':'native-task-or-route';await f.rpc('session/cancel',{sessionId:saved.sessionId});const deadline=Date.now()+20000;while(Date.now()<deadline){if(!(await f.api(saved.sessionId)).value.running){report.cancelledBeforeGrade=true;break;}await new Promise(r=>setTimeout(r,100));}if(!report.cancelledBeforeGrade){await f.stop();report.hostStoppedBeforeGrade=true;}try{observed=await fullSnapshot();}catch{}}
  if(observed){const events=observed.records.map(r=>r.event).filter(Boolean);report.native=nativeSummary(events);report.endReasons=events.filter(e=>e.type==='turn/end').map(e=>e.data.reason?.kind??'unknown');await fs.writeFile(path.join(evidence,'native-view.json'),redact(JSON.stringify(observed,null,2))+'\n');}
  try{const result=await exec(process.execPath,[reportChecker,saved.cwd],{cwd:saved.cwd,env,timeout:90000,maxBuffer:1024*1024});report.checks.push(...JSON.parse(result.stdout));}catch(error){try{report.checks.push(...JSON.parse(error.stdout));}catch{report.checks.push({name:'report external grader',passed:false,error:'grader-process-failed'});}}
  let preserved=true;for(const[file,digest]of beforeHashes)if(hash(await fs.readFile(path.join(saved.cwd,file)))!==digest)preserved=false;
  report.checks.push({name:'all previous tests and frozen materials preserved',passed:preserved});
  report.checks.push({name:'new report tests added',passed:(await files(saved.cwd)).some(file=>file.startsWith('test'+path.sep)&&file.endsWith('.test.mjs')&&!beforeHashes.has(file))});
  report.passed=!report.failure&&report.checks.every(c=>c.passed);report.elapsedMs=Date.now()-started;
  assert.ok(report.passed,JSON.stringify({failure:report.failure,failed:report.checks.filter(c=>!c.passed).map(c=>c.name)}));
});
