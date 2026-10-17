import { validateWorkflowSource } from './workflow-source.mjs';
export { ZCODE_FACADE_MARKER } from './workflow-source.mjs';

export async function prepareTypedWorkflow(script, signal) {
  validateWorkflowSource(script);
  signal?.throwIfAborted();
  const compiler = await import('./typed-compiler.mjs');
  signal?.throwIfAborted();
  return compiler.prepareTypedWorkflow(script);
}
