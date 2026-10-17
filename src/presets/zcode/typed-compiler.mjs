import { analyzeWorkflowProgram, createWorkflowProgram, collectSites, synthesizeAskSchemas, buildAskSpecs, lowerWorkflow, collectWorldRunCommands } from '../../../lib/zcode-workflow-compiler.mjs';
import { boundCausalityGraph } from '../../../lib/zcode-run-projection.mjs';
import { validateWorkflowSource } from './workflow-source.mjs';
export { ZCODE_FACADE_MARKER } from './workflow-source.mjs';
const hostDiagnostics = diagnostics => diagnostics.map(item => item.code === 9003 ? { ...item, message: item.message.replace(
  "the script's command set is shown to the user at confirmation and only those commands are executable.",
  "only the script's declared commands are executable under the session's native permissions.") } : item);

export function prepareTypedWorkflow(script) {
  validateWorkflowSource(script);
  const program = createWorkflowProgram(script), analysis = analyzeWorkflowProgram(program);
  if (!analysis.ok) return { ok: false, diagnostics: hostDiagnostics(analysis.diagnostics) };
  const sites = collectSites(program), schemas = synthesizeAskSchemas(program, sites), worldRun = collectWorldRunCommands(program, sites);
  if (schemas.diagnostics.length || worldRun.diagnostics.length) return { ok: false, diagnostics: hostDiagnostics([...schemas.diagnostics, ...worldRun.diagnostics]) };
  return { ok: true, script, diagnostics: [], sites, askSpecs: buildAskSpecs(sites, schemas.schemas),
    lowered: lowerWorkflow(program, sites), declaredRunCommands: new Set(worldRun.commands), graph: analysis.graph,
    causalityGraph: analysis.causality, displayGraph: analysis.causality ? boundCausalityGraph(analysis.causality, analysis.flow, analysis.handoff) : undefined };
}
