export const ZCODE_FACADE_MARKER = '// @omaa-workflow-facade: zcode';
const MAX_BYTES = 256 * 1024;

export function validateWorkflowSource(script) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > MAX_BYTES) throw Error('Workflow script must be text of at most 256 KiB.');
}
