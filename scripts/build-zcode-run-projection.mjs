import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'src/presets/zcode/sources/upstream-3.15.1');
const COMMIT = 'aac4755666d09fdcd70272fcf063c077a639015f';
const caps = 'apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts';
function constants(source,predicate){const parsed=ts.createSourceFile('fixed.ts',source,ts.ScriptTarget.Latest,true);return parsed.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&predicate(d.name.text))).map(s=>s.getFullText(parsed)).join('\n');}
function phaseHelpers(source){const parsed=ts.createSourceFile('fixed.ts',source,ts.ScriptTarget.Latest,true);const names=new Set(['namedPhases','createWorkflowPhaseNames','createWorkflowPhaseAlongside']);return parsed.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name&&names.has(s.name.text)).map(s=>s.getFullText(parsed)).join('\n');}
export async function buildZCodeRunProjection(){
 // Both halves of this pure closure now come from the same pinned release.
 // No legacy shared reducer or graph bounds may be selected through fallback.
 const manifests = await Promise.all(['graph-source.json', 'graph-projection315-source.json']
   .map(name => readFile(join(snapshots, name), 'utf8').then(JSON.parse)));
 const approved = new Map();
 for (const manifest of manifests) {
   if (manifest.commit !== COMMIT) throw Error('Unexpected graph projection source commit');
   for (const row of manifest.files) {
     if (!/^[A-Za-z0-9_./-]+\.ts$/.test(row.path) || row.path.split('/').includes('..') ||
       !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error('Invalid graph projection source identity');
     const file = join(snapshots, row.path);
     if (approved.has(file) && approved.get(file) !== row.sha256) throw Error('Conflicting graph source identity: ' + row.path);
     approved.set(file, row.sha256);
   }
 }
 for (const [file, hash] of approved) {
   const bytes = await readFile(file);
   if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Fixed graph source changed: ' + file);
 }
 const result=await build({absWorkingDir:root,stdin:{contents:'export {boundCausalityGraph} from "./apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts";\nexport {reduceWorkflowRunsState} from "./packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts";\nexport {createWorkflowPhaseNames,createWorkflowPhaseAlongside} from "./apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts";',resolveDir:snapshots,sourcefile:'zcode-run-projection.ts',loader:'ts'},outfile:join(root,'lib/zcode-run-projection.mjs'),bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['zod'],write:false,metafile:true,banner:{js:'// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.'},plugins:[{name:'fixed-pure-graph',setup(b){
 b.onResolve({filter:/^@zcode\//},args=>{if(args.path==='@zcode/contracts')return{path:join(snapshots,caps)};if(args.path==='@zcode/dynamic-workflow/projections')return{path:join(snapshots,'apps/zcode-cli/packages/dynamic-workflow/src/projections.ts')};throw Error('Unexpected graph package import: '+args.path);});
 b.onResolve({filter:/^\./},args=>{const path=resolve(args.resolveDir,args.path.replace(/\.js$/,'.ts'));if(!approved.has(path))throw Error('Unexpected graph runtime dependency: '+args.path);return{path};});
 b.onLoad({filter:/\.ts$/},async args=>{const file=args.path.slice(snapshots.length+1),source=await readFile(args.path,'utf8');return{contents:file===caps?constants(source,n=>n.startsWith('CREATE_WORKFLOW_GRAPH_MAX_'))+'\n'+phaseHelpers(source):source,loader:'ts',resolveDir:dirname(args.path)};});
 }}]});
 const output = result.outputFiles[0];
 const exports = Object.values(result.metafile.outputs)[0].exports.sort();
 if (!output || JSON.stringify(exports) !== JSON.stringify(['boundCausalityGraph', 'createWorkflowPhaseAlongside', 'createWorkflowPhaseNames', 'reduceWorkflowRunsState'])) throw Error('Graph projection export surface changed');
 for (const item of Object.values(result.metafile.outputs)[0].imports)
   if (item.path !== 'zod' || !item.external) throw Error('Unexpected graph projection external dependency: ' + item.path);
 const runtimeInputs = Object.keys(result.metafile.inputs).filter(file => resolve(root, file) !== join(snapshots, 'zcode-run-projection.ts'));
 for (const file of runtimeInputs) if (!approved.has(resolve(root, file))) throw Error('Unapproved graph projection runtime input: ' + file);
 await writeFile(output.path, output.contents);
 return { exports, inputs: runtimeInputs.length, verifiedInputs: approved.size };

}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildZCodeRunProjection());
