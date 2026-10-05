import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkProject } from './acceptance.mjs';
const exec=promisify(execFile),env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
export async function checkReport(cwd){
  const checks=await checkProject(cwd),check=async(name,fn)=>{try{await fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.code??error.name});}};
  const scratch=await fs.mkdtemp(path.join(cwd,'.report-acceptance-'));
  const tasks=path.join(scratch,'tasks.json'),csv=path.join(scratch,'data.csv'),report=path.join(scratch,'report.json');
  const original='[{"id":"a","title":"Old","done":false,"priority":"low"}]\n';
  const valid='id,title,status,priority\na,Updated,done,\nb,New,todo,high\n';
  try{
    for(const dryRun of [false,true])for(const reportFirst of [false,true])await check('report matches full stdout '+(dryRun?'dry-run':'normal')+(reportFirst?' report-first':''),async()=>{
      await fs.writeFile(tasks,original);await fs.writeFile(csv,valid);await fs.writeFile(report,'OLD REPORT\n');
      const flags=dryRun?(reportFirst?['--report',report,'--dry-run']:['--dry-run','--report',report]):['--report',report];
      const output=await exec(process.execPath,['src/cli.mjs',tasks,csv,...flags],{cwd,env,timeout:20000});
      const expected={tasks:[{id:'a',title:'Updated',done:true,priority:'low'},{id:'b',title:'New',done:false,priority:'high'}],added:1,updated:1};
      assert.deepEqual(JSON.parse(output.stdout),expected);assert.deepEqual(JSON.parse(await fs.readFile(report,'utf8')),expected);
      if(dryRun)assert.equal(await fs.readFile(tasks,'utf8'),original);else assert.deepEqual(JSON.parse(await fs.readFile(tasks,'utf8')),expected.tasks);
    });
    for(const dryRun of [false,true])await check('validation error preserves tasks and report '+(dryRun?'dry-run':'normal'),async()=>{
      await fs.writeFile(tasks,original);await fs.writeFile(report,'ORIGINAL REPORT BYTES\n');await fs.writeFile(csv,'id,title,status\na,Changed,done\nb,Bad,invalid\n');
      let failure;try{await exec(process.execPath,['src/cli.mjs',tasks,csv,...dryRun?['--dry-run']:[],'--report',report],{cwd,env,timeout:20000});}catch(error){failure=error;}
      assert.ok(failure);assert.deepEqual(JSON.parse(failure.stderr),{code:'INVALID_ROW',row:3});assert.equal(await fs.readFile(tasks,'utf8'),original);assert.equal(await fs.readFile(report,'utf8'),'ORIGINAL REPORT BYTES\n');
    });
    await check('validation error does not create an absent report',async()=>{
      await fs.rm(report);await fs.writeFile(tasks,original);let failure;try{await exec(process.execPath,['src/cli.mjs',tasks,csv,'--report',report],{cwd,env,timeout:20000});}catch(error){failure=error;}assert.ok(failure);await assert.rejects(fs.stat(report),{code:'ENOENT'});assert.equal(await fs.readFile(tasks,'utf8'),original);
    });
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
  return checks;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){const checks=await checkReport(path.resolve(process.argv[2]));console.log(JSON.stringify(checks));if(checks.some(c=>!c.passed))process.exitCode=1;}
