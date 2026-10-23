import { executeArtifactPublish } from '../../../lib/zcode-artifact-publish.mjs';
import { currentDirectory, executionDirectories } from '../../host/working-directory.mjs';
import { validateArtifactSpec } from '../../../lib/zcode-artifact-spec.mjs';
import { primaryConflict, primaryConflictMessage } from '../../../lib/zcode-artifact-primary.mjs';
import { ARTIFACT_CAPS, REPORT_CAPS, WorkflowError, canonicalJson, refToString } from '../../../lib/zcode-artifact-shared.mjs';
import { createFileSystemError } from '../../../lib/zcode-fs-contracts.mjs';
import { updateArtifactProjection } from '../../host/zcode-artifact-projections.mjs';

// Durable content pages, bounded readers and page-scoped views now admit the
// official budget. Keep this export for native consumers of the prior adapter.
export const NATIVE_REPORT_LIMITS = Object.freeze({ ...REPORT_CAPS });

export function createArtifacts({ ctx, parent, prepared, runId, store, signal, check, fatal, actor, directories, journal }) {
  let cwd = currentDirectory(ctx, parent.session), workspaceRoot = parent.session.header.cwd;
  const directoryReady = (directories ?? executionDirectories(ctx, parent, signal)).then(value => { cwd = value.cwd; workspaceRoot = value.workspaceRoot; });
  void directoryReady.catch(() => {});
  const sites = new Map(prepared.sites.artifacts.map(site => [site.id, site.op]));
  const reportSites = new Set(prepared.sites.reports.map(site => site.id));
  const ordinals = new Map(), pending = new Set(); let publishing = Promise.resolve();
  const instanceFor = siteId => { const ordinal = ordinals.get(siteId) ?? 0; ordinals.set(siteId, ordinal + 1); return { siteId, ordinal }; };
  const failure = (code, message) => new WorkflowError(code, message);
  const stateFor = record => ({ artifacts: new Map(record.artifacts.map(value => [value.id, value])) });
  function admit(record, id, kind, primary, instance) {
    const known = record.artifacts.find(value => value.id === id);
    if (known && known.kind !== kind) throw failure('ArtifactKindMismatch', `Artifact "${id}" is already ${known.kind}, not ${kind} (at ${refToString(instance)}).`);
    if (!known && record.artifacts.length >= ARTIFACT_CAPS.maxArtifactsPerRun) throw failure('ArtifactCapExceeded', `This run already has ${ARTIFACT_CAPS.maxArtifactsPerRun} artifact IDs.`);
    const holder = primaryConflict(stateFor(record), id, primary);
    if (holder) throw failure('ArtifactPrimaryConflict', primaryConflictMessage(id, holder, 'choose one primary artifact', instance));
    return known;
  }
  function argumentsOf(wrapped) {
    if (!Array.isArray(wrapped)) throw failure('DriverError', 'Invalid compiled artifact argument transport.');
    return wrapped.map(value => {
      if (value?.omitted === true && Object.keys(value).length === 1) return undefined;
      if (value && Object.hasOwn(value, 'value') && Object.keys(value).length === 1) return value.value;
      throw failure('DriverError', 'Invalid compiled artifact argument transport.');
    });
  }
  const track = call => { pending.add(call); call.finally(() => pending.delete(call)).catch(() => {}); return call; };
  const runAtomic = (meta, prepare, commit) => {
    const port = typeof journal === 'function' ? journal() : journal;
    if (port) {
      if (typeof port.runAtomic !== 'function') throw failure('DriverError', 'Native artifact replay journal has no authoritative transaction binding.');
      return port.runAtomic(meta, prepare, commit);
    }
    // Legacy executions retain their original direct-write binding. A native
    // v3 journal owns ordinal allocation when attached before first dispatch.
    const instance = instanceFor(meta.siteId);
    return Promise.resolve().then(() => prepare({ instance })).then(value =>
      store.mutate(parent.id, runId, record => commit(record, value, instance), { signal }));
  };
  return {
    updatePrepared(next) {
      prepared = next; sites.clear(); reportSites.clear();
      for (const site of prepared.sites.artifacts) sites.set(site.id, site.op);
      for (const site of prepared.sites.reports) reportSites.add(site.id);
    },
    publish({ siteId, op, arguments: wrapped }) {
      const work = publishing.then(async () => {
        check();
        if (sites.get(siteId) !== op || !['file', 'markdown'].includes(op)) throw failure('DriverError', 'Invalid compiled content artifact site.');
        const args = argumentsOf(wrapped), [id, payload, opts] = args;
        return runAtomic({ siteId, kind: 'artifact', args: { op, arguments: wrapped }, claimsSettlement: true }, async ({ instance }) => {
          check();
          if (typeof id !== 'string' || !id) throw failure('DriverError', `artifact.${op}: id must be a non-empty string (at ${refToString(instance)}).`);
          if (typeof payload !== 'string') throw failure('DriverError', `artifact.${op}: ${op === 'file' ? 'path' : 'content'} must be a string (at ${refToString(instance)}).`);
          if (opts?.primary !== undefined && typeof opts.primary !== 'boolean') throw failure('DriverError', `artifact.${op}: opts.primary must be a boolean (at ${refToString(instance)}).`);
          const record = await store.record(parent.id, runId);
          check(); const known = admit(record, id, op, opts?.primary === true, instance);
          const version = (known?.versions.length ?? 0) + 1;
          if (version > ARTIFACT_CAPS.maxVersionsPerArtifact) throw failure('ArtifactVersionCapExceeded', `Artifact "${id}" already has ${ARTIFACT_CAPS.maxVersionsPerArtifact} successful versions.`);
          let ref, provenance;
          const write = async request => {
            check(); provenance = { toolCallId: request.toolCallId, toolName: request.toolName, retention: request.retention };
            const data = typeof request.content === 'string' ? Buffer.from(request.content, 'utf8') : request.content;
            ref = await store.saveContent(data, `${id}.${op === 'markdown' ? 'md' : request.extension ?? 'bin'}`, signal);
            check(); return { bytes: ref.bytes, uri: `omaa-artifact://${encodeURIComponent(parent.id)}/${runId}/${encodeURIComponent(request.toolCallId)}` };
          };
          const request = { runId, siteId, ordinal: instance.ordinal, id, op, version, opts,
            ...(op === 'file' ? { path: payload } : { content: payload }) };
          if (op === 'file') { await directoryReady; check(); }
          const value = await executeArtifactPublish({ cwd, workspaceRoot, parentSessionId: parent.id,
            artifactStore: { writeToolResultArtifact: write, writeToolResultBinaryArtifact: write },
            fileSystemPort: { async readBinaryFile({ path, maxBytes }) {
              check();
              const root = await ctx.fs.resolve(workspaceRoot, { signal }), target = await ctx.fs.resolve(path, { cwd, signal });
              if (!ctx.fs.contains(root, target)) throw failure('ArtifactPathOutsideWorkspace', 'Artifact source resolves outside the native workspace.');
              const info = await ctx.fs.stat(target, signal);
              if (!info || info.type !== 'file') throw createFileSystemError({ code: !info ? 'not_found' : info.type === 'directory' ? 'is_directory' : 'not_file', path, message: 'Source is not a regular file' });
              if (!Number.isSafeInteger(info.size) || info.size < 0 || info.version === undefined)
                throw failure('DriverError', 'Artifact source has no complete native file snapshot.');
              if (info.size > maxBytes) throw createFileSystemError({ code: 'too_large', path, message: 'Source exceeds the artifact byte cap' });
              const content = await ctx.fs.readBytes(target, signal, maxBytes); check();
              const after = await ctx.fs.stat(target, signal); check();
              if (!after || after.type !== 'file' || after.version !== info.version || after.size !== info.size
                || !(content instanceof Uint8Array) || content.byteLength !== after.size || content.byteLength > maxBytes)
                throw failure('DriverError', 'Artifact source changed or could not be read completely; read it again before publication.');
              ctx.emit('fs/observed', target, { kind: 'present', version: after.version }, actor);
              return { path, content, bytesRead: content.byteLength, sizeBytes: after.size, truncated: false };
            } } }, request);
          // Preparation creates immutable bytes and a candidate descriptor.
          // Publication happens only in the journal's authoritative commit.
          return { value, ref, provenance, version };
        }, (committed, candidate, instance) => {
          check(); const current = admit(committed, id, op, opts?.primary === true, instance);
          const { value, ref, provenance, version } = candidate;
          const nextVersion = (current?.versions.length ?? 0) + 1;
          if (nextVersion > ARTIFACT_CAPS.maxVersionsPerArtifact) throw failure('ArtifactVersionCapExceeded', `Artifact "${id}" already has ${ARTIFACT_CAPS.maxVersionsPerArtifact} successful versions.`);
          if (nextVersion !== version) throw failure('DriverError', 'Artifact publication version changed before its authoritative commit.');
          const artifact = current ?? { id, kind: op, versions: [] };
          if (!current) committed.artifacts.push(artifact);
          artifact.primary = Boolean(artifact.primary || opts?.primary === true);
          artifact.versions.push({ ...value, ref, provenance, ...artifact.primary ? { primary: true } : {} });
          return { id, version };
        });
      });
      publishing = work.catch(() => {});
      return track(work.then(value => ({ ok: true, value }), error => ({ ok: false, error: { name: error.name, code: error.code ?? 'DriverError', message: error.message } })));
    },
    declare({ siteId, op, arguments: wrapped }) {
      const work = (async () => { try {
        check();
        if (sites.get(siteId) !== op || !['chart', 'table', 'metrics', 'board'].includes(op)) throw failure('DriverError', 'Invalid compiled preset artifact site.');
        const [id, spec] = argumentsOf(wrapped);
        await runAtomic({ siteId, kind: 'artifact', args: { op, arguments: wrapped }, claimsSettlement: false }, () => {
          check();
          if (typeof id !== 'string' || !id) throw failure('DriverError', `artifact.${op}: id must be a non-empty string.`);
          const problem = validateArtifactSpec(op, spec);
          if (problem) throw failure('ArtifactSpecInvalid', problem);
          return { id, spec };
        }, (record, value, instance) => {
          const { id, spec } = value;
          check(); const known = admit(record, id, op, spec.primary === true, instance);
          if (known) {
            if (canonicalJson(known.spec) !== canonicalJson(spec)) throw failure('ArtifactRedeclared', `Artifact "${id}" has already been declared with a different spec.`);
            // An identical redeclaration still settles its distinct journal
            // node; it publishes no additional artifact row or version.
            return;
          }
          record.artifacts.push({ id, kind: op, spec, primary: spec.primary === true,
            versions: [{ id, kind: op, version: 1, spec,
              ...(spec.title === undefined ? {} : { title: spec.title }), ...(spec.description === undefined ? {} : { description: spec.description }),
              ...(spec.primary ? { primary: true } : {}) }] });
        });
      } catch (error) { if (!signal.aborted) fatal(error); throw error; } })();
      return track(work);
    },
    report({ siteId, serialized, artifactId }, { onReceipt } = {}) {
      const work = (async () => { try {
        check();
        if (!reportSites.has(siteId) || typeof serialized !== 'string') throw failure('DriverError', 'A report must contain a JSON-serializable value at a compiled report site.');
        // Reject before both JSON hydration and replay input canonicalization.
        const serializedBytes = Buffer.byteLength(serialized);
        if (serializedBytes > REPORT_CAPS.maxItemSerializedBytes) throw failure('ReportCapExceeded', 'Report exceeded the ZCode 3.15.1 report budget.');
        let prepared = false;
        const item = await runAtomic({ siteId, kind: 'report', args: { op: 'report', serialized,
          ...(artifactId === undefined ? {} : { artifactId }) }, claimsSettlement: false }, async () => {
          prepared = true;
          check();
          const item = JSON.parse(serialized);
          const ref = await store.saveItem(item); check();
          return { item, serializedBytes, ref };
        }, async (record, value, instance) => {
          check();
          const { item, serializedBytes, ref } = value;
          if (artifactId !== undefined && !record.artifacts.some(value => value.id === artifactId && !['file', 'markdown'].includes(value.kind))) throw failure('ArtifactUndeclared', `report() tag "${artifactId}" is not a declared preset artifact. Declare it before tagging reports.`);
          const usedBytes = record.reportBytes ?? record.reports.reduce((total, row) => total + row.ref.bytes, 0);
          if (!Number.isSafeInteger(usedBytes) || usedBytes < 0) throw failure('DriverError', 'Stored report byte count is invalid.');
          if (record.reports.length >= REPORT_CAPS.maxItemsPerRun || serializedBytes > REPORT_CAPS.maxItemSerializedBytes
            || usedBytes + serializedBytes > REPORT_CAPS.maxBytesPerRun) throw failure('ReportCapExceeded', 'Report exceeded the ZCode 3.15.1 report budget.');
          record.reportBytes = usedBytes + serializedBytes;
          const report = { sequence: record.reports.length + 1, siteId, ordinal: instance.ordinal, ref,
            ...(artifactId === undefined ? {} : { artifactId }) };
          record.reports.push(report);
          if (artifactId !== undefined) await updateArtifactProjection({ store, record,
            artifact: record.artifacts.find(artifact => artifact.id === artifactId), report, item, signal });
          check();
          // This is also the terminal journal result. On replay the original
          // item is hydrated for the caller's preview without repeating any
          // report metadata, sequence allocation or quota consumption.
          return item;
        });
        onReceipt?.({ cached: !prepared });
        return item;
      } catch (error) { if (!signal.aborted) fatal(error); throw error; } })();
      return track(work);
    },
    async close() { await Promise.allSettled([...pending]); },
  };
}
