import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root=new URL('../src/client/themes/sources/pi/',import.meta.url);
const hash=data=>createHash('sha256').update(data).digest('hex');
export async function extractPiTheme({write=false}={}) {
 const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
 const sources=new Map();
 for(const source of provenance.sources){if(!/^(?:LICENSE|upstream\/[A-Za-z0-9.-]+)$/.test(source.snapshot))throw new Error('Invalid Pi snapshot path');const data=await readFile(new URL(source.snapshot,root));if(hash(data)!==source.sha256)throw new Error('Pi source hash mismatch: '+source.path);sources.set(source.snapshot,data.toString('utf8'));}
 // Use the pinned upstream's own conversion, including its MIT color-math notice.
 const result=await build({stdin:{contents:sources.get('upstream/colors.ts.txt'),loader:'ts',resolveDir:fileURLToPath(root)},write:false,bundle:true,format:'esm',platform:'node',plugins:[{name:'pinned-pi-color-math',setup(builder){builder.onResolve({filter:/^\.\/oklab\.ts$/},()=>({path:'oklab',namespace:'pi-source'}));builder.onLoad({filter:/.*/,namespace:'pi-source'},()=>({contents:sources.get('upstream/oklab.ts.txt'),loader:'ts'}));}}]});
 const {parseColor,colorToHex}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const variants={};
 for(const variant of ['dark','light']){
  const snapshot='upstream/'+variant+'.json',raw=sources.get(snapshot),json=JSON.parse(raw),vars=json.vars??{};
  function resolve(value,seen=new Set()){if(typeof value==='number'||value===''||value.startsWith('#')||/^ok(?:hsl|lch)\(/.test(value))return value;if(seen.has(value)||!Object.hasOwn(vars,value))throw new Error('Invalid Pi variable '+value);seen.add(value);return resolve(vars[value],seen);}
  function entry(name,value){const resolved=resolve(value);if(resolved==='')throw new Error('Terminal default requires live context; cannot invent browser color');return {rawName:name,rawValue:value,resolvedValue:resolved,browserValue:colorToHex(parseColor(resolved)),sourceLine:raw.split('\n').findIndex(line=>line.includes(JSON.stringify(name)+':'))+1};}
  const palette=Object.fromEntries(Object.entries(json.colors).map(([name,value])=>[name,entry(name,value)]));
  for(const [name,value]of Object.entries(json.export??{}))palette['export.'+name]={...entry(name,value),rawName:'export.'+name,scope:'html-export-only'};
  variants[variant]={nativeName:json.name,appearance:json.appearance,snapshot,sourceSha256:hash(Buffer.from(raw)),vars:json.vars,palette};
 }
 const extracted={schemaVersion:1,product:'pi',status:'source-verified',source:{repository:provenance.repository,version:provenance.version,commit:provenance.commit,license:provenance.license,licenseFile:'LICENSE',provenance:'provenance.json'},conversion:{implementation:'Pinned packages/tui/src/colors.ts + oklab.ts',algorithm:'Upstream parseColor then colorToHex; truecolor sRGB rounded to 8-bit hex',terminal256ColorQuantization:'not applied to browser; native truecolor and indexed rendering differ'},nativeSelection:{default:'system',defaultIsDynamic:true,evidence:'upstream/theme-controller.ts.txt; upstream/system-theme.ts.txt',builtInFixedThemes:['dark','light'],terminalDefaultBackground:{dark:'#000000',light:'#ffffff',scope:'fallback only, actual terminal colors may differ',evidence:'upstream/theme.ts.txt lines 216-219'}},variants};
 if(write)await writeFile(new URL('palette.json',root),JSON.stringify(extracted,null,2)+'\n');return extracted;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await extractPiTheme({write:true});
