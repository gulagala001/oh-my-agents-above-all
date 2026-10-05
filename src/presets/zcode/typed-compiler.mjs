import { analyzeWorkflowScript, createWorkflowProgram, collectSites, synthesizeAskSchemas, buildAskSpecs, lowerWorkflow, collectWorldRunCommands } from '../../../lib/zcode-workflow-compiler.mjs';
import { boundCausalityGraph } from '../../../lib/zcode-run-projection.mjs';

export const ZCODE_FACADE_MARKER = '// @omaa-workflow-facade: zcode';
const MAX_BYTES = 256 * 1024;
const hostDiagnostics = diagnostics => diagnostics.map(item => item.code === 9003 ? { ...item, message: item.message.replace(
  "the script's command set is shown to the user at confirmation and only those commands are executable.",
  "only the script's declared commands are executable under the session's native permissions.") } : item);

export function prepareTypedWorkflow(script) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > MAX_BYTES) throw Error('Workflow script must be text of at most 256 KiB.');
  const analysis = analyzeWorkflowScript(script);
  if (!analysis.ok) return { ok: false, diagnostics: hostDiagnostics(analysis.diagnostics) };
  const program = createWorkflowProgram(script), sites = collectSites(program), schemas = synthesizeAskSchemas(program, sites), worldRun = collectWorldRunCommands(program, sites);
  if (schemas.diagnostics.length || worldRun.diagnostics.length) return { ok: false, diagnostics: hostDiagnostics([...schemas.diagnostics, ...worldRun.diagnostics]) };
  return { ok: true, diagnostics: [], sites, askSpecs: buildAskSpecs(sites, schemas.schemas),
    lowered: lowerWorkflow(program, sites), declaredRunCommands: new Set(worldRun.commands), graph: analysis.graph,
    causalityGraph: analysis.causality, displayGraph: analysis.causality ? boundCausalityGraph(analysis.causality, analysis.flow, analysis.handoff) : undefined };
}
