import { executeArtifactPublish } from '../../../lib/zcode-artifact-publish.mjs';
import { validateArtifactSpec } from '../../../lib/zcode-artifact-spec.mjs';
import { primaryConflict, primaryConflictMessage } from '../../../lib/zcode-artifact-primary.mjs';
import { ARTIFACT_CAPS, REPORT_CAPS, WorkflowError, canonicalJson, refToString } from '../../../lib/zcode-artifact-shared.mjs';
import { createFileSystemError } from '../../../lib/zcode-fs-contracts.mjs';
import { NO_ARTIFACT_CHANGE } from '../../host/zcode-artifacts.mjs';

export function createArtifacts({ ctx, parent, prepared, runId, store, signal, check, fatal, actor }) {
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
  return {
    publish({ siteId, op, arguments: wrapped }) {
      const instance = instanceFor(siteId);
      const work = publishing.then(async () => {
        check();
        if (sites.get(siteId) !== op || !['file', 'markdown'].includes(op)) throw failure('DriverError', 'Invalid compiled content artifact site.');
        const args = argumentsOf(wrapped), [id, payload, opts] = args;
        if (typeof id !== 'string' || !id) throw failure('DriverError', `artifact.${op}: id must be a non-empty string (at ${refToString(instance)}).`);
        if (typeof payload !== 'string') throw failure('DriverError', `artifact.${op}: ${op === 'file' ? 'path' : 'content'} must be a string (at ${refToString(instance)}).`);
        if (opts?.primary !== undefined && typeof opts.primary !== 'boolean') throw failure('DriverError', `artifact.${op}: opts.primary must be a boolean (at ${refToString(instance)}).`);
        const record = await store.record(parent.id, runId);
        {
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
          const value = await executeArtifactPublish({ cwd: parent.session.header.cwd, parentSessionId: parent.id,
            artifactStore: { writeToolResultArtifact: write, writeToolResultBinaryArtifact: write },
            fileSystemPort: { async readBinaryFile({ path, maxBytes }) {
              check(); const cwd = parent.session.header.cwd;
              const root = await ctx.fs.resolve(cwd, { cwd, signal }), target = await ctx.fs.resolve(path, { cwd, signal });
              if (!ctx.fs.contains(root, target)) throw failure('ArtifactPathOutsideWorkspace', 'Artifact source resolves outside the native workspace.');
              const info = await ctx.fs.stat(target, signal);
              if (!info || info.type !== 'file') throw createFileSystemError({ code: !info ? 'not_found' : info.type === 'directory' ? 'is_directory' : 'not_file', path, message: 'Source is not a regular file' });
              if (info.size > maxBytes) throw createFileSystemError({ code: 'too_large', path, message: 'Source exceeds the artifact byte cap' });
              const content = await ctx.fs.readBytes(target, signal, maxBytes); check();
              ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, actor);
              return { path, content, bytesRead: content.length, sizeBytes: info.size, truncated: false };
            } } }, request);
          return store.mutate(parent.id, runId, committed => {
            check(); const current = admit(committed, id, op, opts?.primary === true, instance);
            const artifact = current ?? { id, kind: op, versions: [] };
            if (!current) committed.artifacts.push(artifact);
            artifact.primary = Boolean(artifact.primary || opts?.primary === true);
            artifact.versions.push({ ...value, ref, provenance, ...artifact.primary ? { primary: true } : {} });
            return { id, version };
          });
        }
      });
      publishing = work.catch(() => {});
      return track(work.then(value => ({ ok: true, value }), error => ({ ok: false, error: { name: error.name, code: error.code ?? 'DriverError', message: error.message } })));
    },
    async declare({ siteId, op, arguments: wrapped }) {
      try {
        check();
        if (sites.get(siteId) !== op || !['chart', 'table', 'metrics', 'board'].includes(op)) throw failure('DriverError', 'Invalid compiled preset artifact site.');
        const instance = instanceFor(siteId), [id, spec] = argumentsOf(wrapped);
        if (typeof id !== 'string' || !id) throw failure('DriverError', `artifact.${op}: id must be a non-empty string.`);
        const problem = validateArtifactSpec(op, spec);
        if (problem) throw failure('ArtifactSpecInvalid', problem);
        await store.mutate(parent.id, runId, record => {
          check(); const known = admit(record, id, op, spec.primary === true, instance);
          if (known) {
            if (canonicalJson(known.spec) !== canonicalJson(spec)) throw failure('ArtifactRedeclared', `Artifact "${id}" has already been declared with a different spec.`);
            return NO_ARTIFACT_CHANGE;
          }
          record.artifacts.push({ id, kind: op, spec, primary: spec.primary === true,
            versions: [{ id, kind: op, version: 1, spec,
              ...(spec.title === undefined ? {} : { title: spec.title }), ...(spec.description === undefined ? {} : { description: spec.description }),
              ...(spec.primary ? { primary: true } : {}) }] });
        });
      } catch (error) { if (!signal.aborted) fatal(error); throw error; }
    },
    async report({ siteId, serialized, artifactId }) {
      try {
        check();
        if (!reportSites.has(siteId) || typeof serialized !== 'string') throw failure('DriverError', 'A report must contain a JSON-serializable value at a compiled report site.');
        const instance = instanceFor(siteId), item = JSON.parse(serialized);
        await store.mutate(parent.id, runId, async record => {
          check();
          if (artifactId !== undefined && !record.artifacts.some(value => value.id === artifactId && !['file', 'markdown'].includes(value.kind))) throw failure('ArtifactUndeclared', `report() tag "${artifactId}" is not a declared preset artifact. Declare it before tagging reports.`);
          if (record.reports.length >= REPORT_CAPS.maxItemsPerRun || Buffer.byteLength(serialized) > REPORT_CAPS.maxItemSerializedBytes) throw failure('ReportCapExceeded', 'Report exceeded the original ZCode report budget.');
          const ref = await store.saveItem(item); check();
          record.reports.push({ sequence: record.reports.length + 1, siteId, ordinal: instance.ordinal, ref,
            ...(artifactId === undefined ? {} : { artifactId }) });
        });
        return item;
      } catch (error) { if (!signal.aborted) fatal(error); throw error; }
    },
    async close() { await Promise.allSettled([...pending]); },
  };
}
