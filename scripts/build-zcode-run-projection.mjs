import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url)),snapshots=join(root,'src/presets/zcode/sources/upstream');
const inputs={
  "apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts": "809bc346e4591f12e40e6762be74d5a1dc269ceacac7028cc845e31592af7ebc",
  "apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts": "26928094a669c6f6383c4b49cb9672c9e123c41f1f281b9e2e47a0c2254020e3",
  "apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-fold.ts": "6c646e75884f6bc364c48220c936d5121d00b91276252d11d2547f966d97b84c",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/actor-graph.ts": "a9a3b95712698982c5760fa9faadc345798b430470f4034a52639ef160bb1830",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph-lanes.ts": "34999bfbe0c10983adf3d62cd9989cf6a288456d03d6530e3e82668f754d7846",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph-types.ts": "c6d344a82078a79c42ae943fe0e41efc0d2f8cc2990e07df5045a388429bf737",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph.ts": "2a33c592a31acf449e3f9316bf0fff1f40ad18d31a53533c7217c9e71c8520ad",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-reduce.ts": "e8c99c4beb9eaadea4f9fcd31c82ccf66489a51d021da3a61ebcfa10584b2d2f",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/constants.ts": "dec44bb45653f784f9e285c26fcf45fbd9f165dde9254b8a6ba91f1317d4b453",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/core-json.ts": "8d96ca2a85a322d51b28ca4149447b343d83b4284b63b2c5494fb5b7b28d0d54",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/core.ts": "8b04dcc2add5bc8bffebe37a04411d3f3b299a295cc2b1d339af3c0a581b7e2c",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-graph.ts": "21d83fb13165fe81cf003514fc7b50bab0869e9e1076217e2ca8837b6dfbc307",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-phase.ts": "aba7efd91f949193de7243f4696267b991f300009cc8f4908d006168ac609824",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-strands.ts": "65cfd236348f5adf8c6d5e71190b98abf972c62abce3832252476121bdda696a",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-tree.ts": "fdb7ac7b27134382980f0e4728926996c7c6872aff123ab32a19b77bf93d9d85",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/graph.ts": "2b3911bb86d6c846c033ded1cfa51c3dfce7a509099bb113a7ae6269b0a0725c",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/handoff-graph.ts": "a38d2e5cbbc060c74fb2c07cc6512d35836ff504f0bf6f0e31b2fc51022d7583",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/mermaid.ts": "84e45ef26d2e1c7b2546568c1e13a61d0d80a8c9e3cb8a8eccc05197da2e4275",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/phase-graph.ts": "7100d103dbd1afbd68bebc33e215ef8e873dd282c342ef5163ef2f9082dabb89",
  "apps/zcode-cli/packages/dynamic-workflow/src/analysis/serialize.ts": "cc07cdfef6bbaab2f922bb6d0a358e1d71f81512d6643d3f7d95ec2d85a7e93d",
  "apps/zcode-cli/packages/dynamic-workflow/src/projections.ts": "7c31b47d8c243368511cea0542c600c90b4d98e09eb0e87571756dcf5ddca26d",
  "packages/shared/src/zcode-media-policy.ts": "47ccb08304cf2a24f4795dc6ded2ef5712d1ee1bad5c8bffb4d6081dc86dcde1",
  "packages/shared/src/zcode-protocol-v4/core.ts": "97750a7bab0a7580c1d27c8e0155981786fdbfa07373d46c77829f25eb407a39",
  "packages/shared/src/zcode-protocol-v4/workflow-artifact.ts": "a21519ac5e3077572aba32c9354548aa7910eead77b587dadcc4535788f8e2ab",
  "packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts": "97496947c0e043fcc3e5ca62acad5f75481f239b7c295100c57bc714b8fa270d",
  "packages/shared/src/zcode-protocol-v4/workflow-observation-display.ts": "4b21c1e4cbd10ca616c6a590cf1a44dab773a4458a2ec3e8bafee43dbc3466f5",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-actor-status.ts": "2e025ef7b089436977714bb9670d189506edf14eddfa66367b640e038ffda4cb",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-artifacts.ts": "de8e08048c7a30603f976ddaf32ac7d5b67bee7d513bcd29237d308c9905d8af",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-caps.ts": "4390a16c51fa3e1cc03f901925eeb3384ca8c0c46043a4aa4751dd9c1a08c501",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-concurrency.ts": "7527a60899badf7bacf1119a5300cdb6584525ab1a83b5bfce283962992ea4ae",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-delta.ts": "882683df6ecdbc73735ec265619a4efdbbbcc4c7e073fcc0c268f1afdc31b42a",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-entries.ts": "900fddddaaa73f70f849a03035561db3e5b01e1b5ceb4296a6d4f1d0dc3df066",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-eviction.ts": "e7ad54692fa91667955ad2ac589c07b1cec8e0dd25094d5faf1a94503b079c7a",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-lineage.ts": "032257d84ea448a4a7f027ea5fd104e05f362a6fed9ed7e21ced2151aa887df3",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-node-progress.ts": "2d56d1582fabc564ad9b087eafeef72a2c5fbd6cad16414b4d1051008f811ca1",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-phases.ts": "cdf68ca8274f35adc36e52318804fec3dac59a9c5a542da57d4f218de203d0df",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts": "6c46bfbadf27d45978295d2a5d892767e228f1d917333a0a8ee2775568688eb4",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-started.ts": "489134b81d8a6f6a868555360342ffa8eda708526df50b8a54e89fbbbc7de94f",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-tables.ts": "32e9d97cceddc365537317adf3d581f8a901d37cd7601a30d65bef9441bf08c1",
  "packages/shared/src/zcode-protocol-v4/workflow-runs-unlisted.ts": "a009f66d9c775f4e5aa7599f43ceb77330fc9bd9ef7d489a6fc75ca8857372a9",
  "packages/shared/src/zcode-protocol-v4/workflow-runs.ts": "ac3a8e0216379741b998a210fdb6d2a23813fe144be84e304c8c68af4a24cd7b"
};
const caps="apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts",limits="packages/shared/src/zcode-protocol-v4/workflow-runs.ts";
function constants(source,predicate){const parsed=ts.createSourceFile('fixed.ts',source,ts.ScriptTarget.Latest,true);return parsed.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&predicate(d.name.text))).map(s=>s.getFullText(parsed)).join('\n');}
export async function buildZCodeRunProjection(){
 for(const[file,hash]of Object.entries(inputs)){const bytes=await readFile(join(snapshots,file));if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Fixed graph source changed: '+file);}
 const result=await build({stdin:{contents:'export {boundCausalityGraph} from "./apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts";\nexport {reduceWorkflowRunsState} from "./packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts";',resolveDir:snapshots,sourcefile:'zcode-run-projection.ts',loader:'ts'},outfile:join(root,'lib/zcode-run-projection.mjs'),bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['zod'],write:false,metafile:true,banner:{js:'// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.'},plugins:[{name:'fixed-pure-graph',setup(b){
 b.onResolve({filter:/^@zcode\//},args=>{if(args.path==='@zcode/contracts')return{path:join(snapshots,caps)};if(args.path==='@zcode/dynamic-workflow/projections')return{path:join(snapshots,'apps/zcode-cli/packages/dynamic-workflow/src/projections.ts')};throw Error('Unexpected graph package import: '+args.path);});
 b.onResolve({filter:/^\./},args=>{const path=resolve(args.resolveDir,args.path.replace(/\.js$/,'.ts'));if(!Object.hasOwn(inputs,path.slice(snapshots.length+1)))throw Error('Unexpected graph runtime dependency: '+args.path);return{path};});
 b.onLoad({filter:/\.ts$/},async args=>{const file=args.path.slice(snapshots.length+1),source=await readFile(args.path,'utf8');return{contents:file===caps?constants(source,n=>n.startsWith('CREATE_WORKFLOW_GRAPH_MAX_')):source,loader:'ts',resolveDir:dirname(args.path)};});
 }}]});
 const output=result.outputFiles[0];if(!output)throw Error('Graph projection output missing');await writeFile(output.path,output.contents);return{exports:Object.values(result.metafile.outputs)[0].exports,inputs:Object.keys(inputs).length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildZCodeRunProjection());
