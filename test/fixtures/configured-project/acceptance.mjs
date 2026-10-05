import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const env = Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
const deepFreeze = value => { if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value; };

export async function checkProject(cwd) {
  const checks=[];
  const check=async(name,fn)=>{try{await fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.code??error.name??'failure'});}};
  let parseCsv,importTasks;
  await check('public modules load',async()=>{({parseCsv}=await import(pathToFileURL(path.join(cwd,'src/csv.mjs'))));({importTasks}=await import(pathToFileURL(path.join(cwd,'src/tasks.mjs'))));assert.equal(typeof parseCsv,'function');assert.equal(typeof importTasks,'function');});
  if(!parseCsv||!importTasks)return checks;
  const input=()=>[{id:'b',title:'Original b',done:false,priority:'low',meta:{owner:'fixture'}},{id:'a',title:'Original a',done:false}];
  const text='title,status,id,priority\n"Updated, b",done,b,\nNew,todo,c,high\n';
  const expectedTasks=[{id:'b',title:'Updated, b',done:true,priority:'low',meta:{owner:'fixture'}},{id:'a',title:'Original a',done:false},{id:'c',title:'New',done:false,priority:'high'}];
  await check('BOM CRLF quoted commas escaped quotes and multiline CSV',()=>{
    assert.deepEqual(parseCsv('\uFEFFid,title,status,priority\r\nu1,"A, ""quoted"" title",done,high\r\nu2,"Two\r\nlines",todo,\r\n'),[['id','title','status','priority'],['u1','A, "quoted" title','done','high'],['u2','Two\nlines','todo','']]);
    assert.deepEqual(parseCsv('id,title,status\n\nx,Title,todo\n\n'),[['id','title','status'],['x','Title','todo']]);
  });
  for(const dryRun of [false,true])await check('pure upsert preview '+(dryRun?'dry-run':'normal'),()=>{
    const original=input(),before=structuredClone(original);deepFreeze(original);const result=importTasks(original,text,{dryRun});
    assert.deepEqual(original,before);assert.equal(result.added,1);assert.equal(result.updated,1);
    assert.deepEqual(result.tasks,expectedTasks);
  });
  await check('trim required fields and default priority',()=>{const result=importTasks([],'id,title,status\n x , New title , todo \n');assert.deepEqual(result.tasks,[{id:'x',title:'New title',done:false,priority:'normal'}]);assert.equal(result.added,1);assert.equal(result.updated,0);});
  const failures=[
    ['missing header','id,title\nx,Title\n','INVALID_HEADER',1],
    ['duplicate header','id,title,status,id\nx,Title,todo,x\n','INVALID_HEADER',1],
    ['unknown header','id,title,status,other\nx,Title,todo,x\n','INVALID_HEADER',1],
    ['duplicate id','id,title,status\nb,Changed,done\nb,Duplicate,todo\n','DUPLICATE_ID',3],
    ['bad status','id,title,status\nb,Changed,done\nx,Bad,invalid\n','INVALID_ROW',3],
    ['bad priority','id,title,status,priority\nb,Changed,done,high\nx,Bad,todo,urgent\n','INVALID_ROW',3],
    ['blank id','id,title,status\n,Blank,todo\n','INVALID_ROW',2],
    ['blank title','id,title,status\nx, ,todo\n','INVALID_ROW',2],
    ['column count','id,title,status\nx,Title,todo,extra\n','INVALID_ROW',2],
    ['logical record row','id,title,status\nb,"Two\nlines",done\nx,Bad,invalid\n','INVALID_ROW',3],
  ];
  for(const[name,csv,code,row]of failures)await check(name+' atomically rejects',()=>{const original=input(),before=structuredClone(original);assert.throws(()=>importTasks(original,csv),error=>error.code===code&&error.row===row);assert.deepEqual(original,before);});
  await check('malformed quotes rejected',()=>{assert.throws(()=>parseCsv('id,title,status\nx,"Unclosed,todo'),e=>e.code==='INVALID_CSV');assert.throws(()=>parseCsv('id,title,status\nx,bad"quote,todo'),e=>e.code==='INVALID_CSV');});
  const scratch=await fs.mkdtemp(path.join(cwd,'.acceptance-'));
  try {
    const tasksFile=path.join(scratch,'tasks.json'),csvFile=path.join(scratch,'import.csv'),bytes=JSON.stringify(input())+'\n';
    await fs.writeFile(tasksFile,bytes);await fs.writeFile(csvFile,text);
    await check('CLI dry-run preserves exact original bytes',async()=>{const result=await exec(process.execPath,['src/cli.mjs',tasksFile,csvFile,'--dry-run'],{cwd,env,timeout:20000});const preview=JSON.parse(result.stdout);assert.deepEqual(preview,{tasks:expectedTasks,added:1,updated:1});assert.equal(await fs.readFile(tasksFile,'utf8'),bytes);});
    await check('CLI normal import persists actual result',async()=>{await fs.writeFile(tasksFile,bytes);const result=await exec(process.execPath,['src/cli.mjs',tasksFile,csvFile],{cwd,env,timeout:20000});const preview=JSON.parse(result.stdout);assert.deepEqual(preview,{tasks:expectedTasks,added:1,updated:1});assert.deepEqual(JSON.parse(await fs.readFile(tasksFile,'utf8')),expectedTasks);});
    await check('CLI invalid import rejects without writing bytes',async()=>{await fs.writeFile(tasksFile,bytes);await fs.writeFile(csvFile,'id,title,status\nb,Changed,done\nx,Bad,invalid\n');let failure;try{await exec(process.execPath,['src/cli.mjs',tasksFile,csvFile],{cwd,env,timeout:20000});}catch(error){failure=error;}assert.ok(failure&&failure.code!==0);assert.deepEqual(JSON.parse(failure.stderr),{code:'INVALID_ROW',row:3});assert.equal(await fs.readFile(tasksFile,'utf8'),bytes);});
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
  await check('original and model-added tests pass',async()=>{await exec(process.execPath,['--test'],{cwd,env,timeout:30000,maxBuffer:1024*1024});});
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const checks=await checkProject(path.resolve(process.argv[2]));
  console.log(JSON.stringify(checks));
  if(checks.some(check=>!check.passed))process.exitCode=1;
}
