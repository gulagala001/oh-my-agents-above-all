import { analyzeWorkflowScript, createWorkflowProgram, collectSites, synthesizeAskSchemas, buildAskSpecs, lowerWorkflow } from '../../../lib/zcode-workflow-compiler.mjs';

export const ZCODE_FACADE_MARKER = '// @omaa-workflow-facade: zcode';
const MAX_BYTES = 256 * 1024;

export function prepareTypedWorkflow(script) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > MAX_BYTES) throw Error('Workflow script must be text of at most 256 KiB.');
  const analysis = analyzeWorkflowScript(script);
  if (!analysis.ok) return { ok: false, diagnostics: analysis.diagnostics };
  const program = createWorkflowProgram(script), sites = collectSites(program), schemas = synthesizeAskSchemas(program, sites);
  const unsupported = [
    ...sites.worldReads.map(site => ({ code: 9005, ...site.loc, line: site.loc.line, column: site.loc.column, message: 'This DSH workflow adapter has not connected the world-read facade. Use an Actor with native working tools for this task.' })),
    ...(analysis.declaredArtifacts?.length ? [{ code: 9005, line: 1, column: 1, message: 'The original artifact registry is not connected to this DSH adapter.' }] : []),
  ];
  if (schemas.diagnostics.length || unsupported.length) return { ok: false, diagnostics: [...schemas.diagnostics, ...unsupported] };
  return { ok: true, diagnostics: [], sites, askSpecs: buildAskSpecs(sites, schemas.schemas),
    lowered: lowerWorkflow(program, sites), graph: analysis.graph, causalityGraph: analysis.causality };
}

