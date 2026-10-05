import * as fs from 'node:fs/promises';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

function decodeFrames(bytes) {
  let offset=0,text='';
  while(offset<bytes.length){const result=zstdDecompressSync(bytes.subarray(offset),{info:true});if(!result.engine.bytesWritten)throw new Error('Native journal frame made no progress');offset+=result.engine.bytesWritten;text+=result.buffer.toString('utf8');}
  return text;
}
export async function captureNativeSessions({home,destination,sessions,route}) {
  const protectedValues=[route.apiKey,route.baseUrl,new URL(route.baseUrl).origin].filter(Boolean);
  const metadata={sessions:[],rejected:[]};
  const walk=async directory=>{let result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Snapshot refuses symbolic links');if(entry.isDirectory())result.push(...await walk(file));else if(entry.isFile())result.push(file);}return result;};
  const root=path.join(home,'sessions');
  let files;try{files=await walk(root);}catch(error){if(error.code==='ENOENT')return metadata;throw error;}
  for(const session of sessions){
    const selected=[];
    for(const file of files.filter(file=>path.basename(path.dirname(file))===session.sessionId&&path.basename(file)==='session.v4.jsonl.zstd')){
      const bytes=await fs.readFile(file);let text;
      try{text=decodeFrames(bytes);}catch{metadata.rejected.push({product:session.product,reason:'journal-decode-failed'});continue;}
      let header;try{header=JSON.parse(text.split('\n')[0]);}catch{metadata.rejected.push({product:session.product,reason:'invalid-native-header'});continue;}
      if(header.id!==session.sessionId||header.cwd!==session.cwd){metadata.rejected.push({product:session.product,reason:'native-identity-mismatch'});continue;}
      if(protectedValues.some(secret=>text.includes(secret))){metadata.rejected.push({product:session.product,reason:'protected-route-data-in-journal'});continue;}
      selected.push({file,bytes,text});
    }
    if(!selected.length){if(!metadata.rejected.some(entry=>entry.product===session.product))metadata.rejected.push({product:session.product,reason:'native-journal-not-found'});continue;}
    const projectFiles=await walk(session.cwd);let sensitive=false;
    for(const file of projectFiles){const bytes=await fs.readFile(file);if(protectedValues.some(secret=>bytes.includes(Buffer.from(secret)))){sensitive=true;break;}}
    if(sensitive){metadata.rejected.push({product:session.product,reason:'protected-route-data-in-workspace'});continue;}
    for(const{file,bytes,text}of selected){const target=path.join(destination,'sessions',path.relative(root,file));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);const transcript=path.join(destination,'transcripts',session.product+'.jsonl');await fs.mkdir(path.dirname(transcript),{recursive:true});await fs.writeFile(transcript,text);}
    await fs.cp(session.cwd,path.join(destination,'workspaces',session.product),{recursive:true,filter:source=>!source.endsWith('session.lock')});
    metadata.sessions.push({product:session.product,sessionId:session.sessionId,cwd:session.cwd});
  }
  await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');
  return metadata;
}
