import { createHash } from 'node:crypto';
import { SavedWorkflowMetaSchema, isValidSavedWorkflowName } from '../../../lib/zcode-saved-contract.mjs';
import { parseSavedWorkflow, serializeSavedWorkflow } from '../../../lib/zcode-saved-codec.mjs';

import { savedWorkflowNativeFailure } from './saved-workflow-writes.mjs';
import { readSavedWorkflowSnapshot } from './saved-workflow-management.mjs';

const MAX_BYTES = 256 * 1024;
const fields = ['description', 'whenToUse', 'args'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

// Rewrite only metadata. The retained parser splits on LF without trimming or
// normalizing the script, so its body preserves CRLF and all trailing bytes of
// valid UTF-8 source. Validate the round trip before any native write begins.
export function buildSavedWorkflowMetadataUpdate(source, patch) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_BYTES) throw Error('Saved workflow source exceeds the native 256 KiB bound.');
  if (!object(patch) || !Object.keys(patch).length || Object.keys(patch).some(key => !fields.includes(key)))
    throw Error('Provide a nonempty metadata patch containing description, whenToUse or args.');
  const parsed = parseSavedWorkflow(source);
  if (!parsed.ok) throw Error('Cannot edit invalid saved workflow metadata: ' + parsed.reason + ': ' + parsed.detail);
  const value = { ...parsed.meta };
  for (const field of fields) {
    if (!Object.hasOwn(patch, field)) continue;
    if (field !== 'description' && patch[field] === null) delete value[field];
    else value[field] = patch[field];
  }
  const meta = SavedWorkflowMetaSchema.parse(value), content = serializeSavedWorkflow(meta, parsed.script);
  if (Buffer.byteLength(content) > MAX_BYTES) throw Error('Updated saved workflow exceeds the native 256 KiB bound.');
  const checked = parseSavedWorkflow(content);
  if (!checked.ok || checked.script !== parsed.script) throw Error('Metadata rewrite changed the saved workflow body.');
  return { content, meta, scriptHash: hash(parsed.script), changedFields: Object.keys(patch), changed: content !== source };
}

export function installSavedWorkflowMetadataTool(ctx, { storeFor, jsonOutput, writes }) {
  return ctx.effect(() => {
    const metadata = {
      type: 'object', properties: {
        description: { type: 'string', description: 'Nonempty description. Omit to keep the current value.' },
        whenToUse: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Nonempty guidance, or null to remove it.' },
        args: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
          description: 'Saved argument declarations, validated with the original SavedWorkflowMetaSchema; null removes them.' },
      }, additionalProperties: false,
    };
    ctx.tools.register({ name: 'update_saved_workflow',
      description: 'Update only the metadata of an EXISTING saved workflow in the explicitly selected scope. Omitted fields keep their current values; null removes whenToUse or args. The actual UTF-8 script body is preserved, including line endings and trailing whitespace. When editing a reviewed definition, pass its full sourceSha256 as expected_source_sha256; a changed definition is refused before writing. The current definition is re-read; its exact native version guards the existing write tool, retaining its approval, sandbox, observation and cancellation pipeline. Concurrent native observation/version changes refuse the write. Moving or deleting a definition is a separate operation. Native atomic publication is not a cross-process filesystem compare-and-swap guarantee.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Existing name: 1–64 letters, digits, dots, dashes or underscores.' },
        scope: { type: 'string', enum: ['project', 'global'] }, metadata,
        expected_source_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Optional full source-byte SHA256 from the reviewed read_saved_workflow result. Refuse if the current definition differs.' } },
        required: ['name', 'scope', 'metadata'], additionalProperties: false }, output: jsonOutput,
      async execute(args, exec) {
        exec.signal.throwIfAborted();
        if (!object(args) || Object.keys(args).some(key => !['name', 'scope', 'metadata', 'expected_source_sha256'].includes(key))
          || typeof args.name !== 'string' || !isValidSavedWorkflowName(args.name) || !['project', 'global'].includes(args.scope))
          throw Error('Select an existing saved workflow name and an explicit project or global scope.');
        if (args.expected_source_sha256 !== undefined && (typeof args.expected_source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.expected_source_sha256)))
          throw Error('Expected source SHA256 must be the full digest of the reviewed definition.');
        if (ctx.omaa.modeFor(exec.agent.session) !== 'default') throw Error('Edit saved workflow metadata only in the default working mode.');
        if (!ctx.tools.get('write', exec.agent)) throw Error('The native write tool is unavailable; the definition was not changed.');
        const saved = await storeFor(exec).load(args.name, args.scope);
        // Refuse lossy decoding instead of re-saving replacement characters for
        // invalid UTF-8. Recheck the real version after this bounded byte read.
        const { source, sourceSha256 } = await readSavedWorkflowSnapshot(ctx, exec, saved);
        if (args.expected_source_sha256 !== undefined && args.expected_source_sha256 !== sourceSha256)
          throw Error('Saved workflow changed since review; read its current source before editing metadata.');
        const update = buildSavedWorkflowMetadataUpdate(source, args.metadata);
        exec.signal.throwIfAborted();
        if (ctx.omaa.modeFor(exec.agent.session) !== 'default') throw Error('Saved workflow metadata scope or mode changed.');
        const summary = { name: saved.name, scope: saved.scope, path: saved.path, scriptHash: update.scriptHash,
          bodyPreserved: true, reviewedSourceSha256: sourceSha256, changedFields: update.changedFields };
        if (!update.changed) return { ok: true, ...summary, changed: false, response: 'Saved workflow metadata is already unchanged.' };
        const { result, admitted, interrupted } = await writes.write({ exec, target: saved.target,
          intent: { kind: 'replaceIfVersion', version: saved.version }, content: update.content });
        if (result.isError) throw savedWorkflowNativeFailure(result);
        if (interrupted) throw Error('Saved workflow write was interrupted; re-read before deciding its outcome.');
        if (!admitted || result.value?.operation !== 'update') throw Error('Native write did not confirm the guarded metadata replacement; inspect the definition before retrying.');
        return { ok: true, ...summary, changed: true, response: 'Updated saved workflow metadata; its script body was preserved.' };
      },
    });
  }, 'Saved workflow metadata registration');
}
