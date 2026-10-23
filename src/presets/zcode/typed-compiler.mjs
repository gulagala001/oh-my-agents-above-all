import { analyzeWorkflowProgram, createWorkflowProgram, collectSites, synthesizeAskSchemas, buildAskSpecs, lowerWorkflow, collectWorldRunCommands, collectSitePhases, collectPhaseNames, collectDiagnostics, SNIPPET_FACADE_DTS } from '../../../lib/zcode-workflow-compiler.mjs';
import { boundCausalityGraph, createWorkflowPhaseAlongside } from '../../../lib/zcode-run-projection.mjs';

import { validateWorkflowSource } from './workflow-source.mjs';
export { ZCODE_FACADE_MARKER } from './workflow-source.mjs';
const MAX_BYTES = 256 * 1024;
const hostDiagnostics = diagnostics => diagnostics.map(item => item.code === 9003 ? { ...item, message: item.message.replace(
  "the script's command set is shown to the user at confirmation and only those commands are executable.",
  "only the script's declared commands are executable under the session's native permissions.") } : item);

export function prepareTypedWorkflow(script) {
  validateWorkflowSource(script);
  const program = createWorkflowProgram(script), analysis = analyzeWorkflowProgram(program);
  if (!analysis.ok) return { ok: false, diagnostics: hostDiagnostics(analysis.diagnostics) };
  const sites = collectSites(program), schemas = synthesizeAskSchemas(program, sites), worldRun = collectWorldRunCommands(program, sites);
  if (schemas.diagnostics.length || worldRun.diagnostics.length) return { ok: false, diagnostics: hostDiagnostics([...schemas.diagnostics, ...worldRun.diagnostics]) };
  return { ok: true, script, diagnostics: [], sites, modelReferences: analysis.modelReferences, askSpecs: buildAskSpecs(sites, schemas.schemas),
    sitePhases: collectSitePhases(analysis.core), ...collectPhaseNames(analysis.flow), phaseAlongside: createWorkflowPhaseAlongside(analysis.flow),
    lowered: lowerWorkflow(program, sites), declaredRunCommands: new Set(worldRun.commands), graph: analysis.graph,
    causalityGraph: analysis.causality, displayGraph: analysis.causality ? boundCausalityGraph(analysis.causality, analysis.flow, analysis.handoff) : undefined };
}

// Same fixed 3.15.1 scratch-facade pipeline as the original snippet service.
// OMAA retains its existing bounded native compiler admission (256 KiB).
export function prepareTypedSnippet(script) {
  if (typeof script !== 'string' || !script.length || Buffer.byteLength(script) > MAX_BYTES)
    throw Error('Snippet source must be non-empty text of at most 256 KiB.');
  const program = createWorkflowProgram(script, { facadeDts: SNIPPET_FACADE_DTS });
  const diagnostics = collectDiagnostics(program.program);
  if (diagnostics.length) return { ok: false, diagnostics: hostDiagnostics(diagnostics) };
  const sites = collectSites(program), commands = collectWorldRunCommands(program, sites);
  if (commands.diagnostics.length) return { ok: false, diagnostics: hostDiagnostics(commands.diagnostics) };
  if (sites.actors.length || sites.asks.length || sites.reports.length || sites.artifacts.length || sites.phases.length || sites.holes.length)
    throw Error('The scratch facade admitted a persistent workflow operation.');
  return { ok: true, script, diagnostics: [], sites, lowered: lowerWorkflow(program, sites),
    declaredRunCommands: new Set(commands.commands) };
}
