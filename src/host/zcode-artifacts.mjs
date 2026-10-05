import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { reduceWorkflowRunsState } from '../../lib/zcode-run-projection.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keyOf = id => {
  if (!uuid.test(id)) throw Error('工作流标识无效');
  return 'run_' + id.replaceAll('-', '');
};
const fileRef = z.object({ attachmentId: z.string(), name: z.string(), bytes: z.number().int().nonnegative() });
const summarySchema = z.object({ runId: z.string().regex(uuid), sessionId: z.string(), name: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'killed']), startedAt: z.number(), completedAt: z.number().optional(),
  phase: z.string().optional(), revision: z.number().int().positive(), artifactCount: z.number().int().nonnegative(),
  reportCount: z.number().int().nonnegative(), jobId: z.string().optional(), resumedFrom: z.string().optional(),
  supersededBy: z.string().optional(), ref: fileRef });
export const NO_ARTIFACT_CHANGE = Symbol('unchanged artifact declaration');

// Domain.open eagerly loads records. Keep only small run summaries there; the
// native content-addressed attachment store owns full metadata and all bytes.
export async function createZCodeArtifactStore(ctx) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'omaa_zcode_workflows', version: 1,
    layout: 'per-record', tables: { runs: domainTable(summarySchema) } }));
  const table = domain.table('runs'), active = new Map(), queues = new Map(), controls = new Map(), lifecycles = new Map();
  let closed = false;
  const bytesOf = async (ref, signal) => {
    const parts = []; let count = 0;
    for await (const chunk of ctx.attachments.readFileStream(ref, signal)) {
      count += chunk.length;
      if (count > ref.bytes) throw Error('工作流附件长度不符');
      parts.push(chunk);
    }
    // Consume the stream to its end: the native backend checks hash/length there.
    if (count !== ref.bytes) throw Error('工作流附件不完整');
    return Buffer.concat(parts, count);
  };
  const saveJson = value => ctx.attachments.saveFile({ data: Buffer.from(JSON.stringify(value)), name: 'workflow.json' });
  const readJson = async ref => JSON.parse((await bytesOf(ref)).toString('utf8'));
  const current = async (sessionId, runId) => {
    const summary = table.get(keyOf(runId));
    if (!summary || summary.sessionId !== sessionId) throw Error('工作流不属于当前会话');
    const record = active.get(runId) ?? await readJson(summary.ref);
    if (record.runId !== runId || record.sessionId !== sessionId) throw Error('工作流存储归属不符');
    return record;
  };
  const persist = async record => {
    if (closed) throw Error('工作流存储已关闭');
    const ref = await saveJson(record);
    const { runId, sessionId, name, status, startedAt, completedAt, phase, revision, jobId, resumedFrom, supersededBy } = record;
    await table.put(keyOf(runId), { runId, sessionId, name, status, startedAt, revision, ref,
      artifactCount: record.artifacts.length, reportCount: record.reports.length,
      ...(completedAt === undefined ? {} : { completedAt }), ...(phase === undefined ? {} : { phase }),
      ...(jobId === undefined ? {} : { jobId }), ...(resumedFrom ? { resumedFrom } : {}), ...(supersededBy ? { supersededBy } : {}) });
    if (active.has(runId)) active.set(runId, record);
  };
  const mutate = (sessionId, runId, fn) => {
    const work = (queues.get(runId) ?? Promise.resolve()).then(async () => {
      const draft = structuredClone(await current(sessionId, runId));
      const value = await fn(draft);
      if (value === NO_ARTIFACT_CHANGE) return;
      draft.revision++; await persist(draft); return value;
    });
    const pending = work.catch(() => {}); queues.set(runId, pending);
    pending.finally(() => { if (queues.get(runId) === pending) queues.delete(runId); });
    return work;
  };
  const api = {
    trackRun(runId, result, stop) {
      lifecycles.set(runId, { result, stop });
      result.finally(() => lifecycles.delete(runId)).catch(() => {});
    },
    async begin({ runId, sessionId, name, graph, causalityGraph, displayGraph, jobId, execution, resumedFrom }, stop) {
      if (table.get(keyOf(runId)) !== undefined) throw Error('工作流标识已存在');
      const record = { runId, sessionId, name, status: 'running', startedAt: Date.now(), revision: 1,
        graph, causalityGraph, displayGraph, execution, artifacts: [], reports: [], ...(jobId ? { jobId } : {}), ...(resumedFrom ? { resumedFrom } : {}) };
      active.set(runId, record); controls.set(runId, stop);
      try { await persist(record); } catch (error) { active.delete(runId); controls.delete(runId); throw error; }
    },
    mutate,
    record: current,
    async finish(sessionId, runId, outcome) {
      try {
        await mutate(sessionId, runId, record => {
          record.status = outcome.error ? outcome.error.kind === 'abort' ? 'killed' : 'failed' : 'completed';
          record.completedAt = Date.now();
          if (outcome.error) record.error = outcome.error;
        });
      } finally { active.delete(runId); controls.delete(runId); }
    },
    list(sessionId) {
      const runs = [...table.entries()].map(([, value]) => value).filter(value => value.sessionId === sessionId)
        .sort((a, b) => b.startedAt - a.startedAt).map(({ ref, ...row }) => ({ ...row,
          status: row.status === 'running' && !active.has(row.runId) ? 'interrupted' : row.status }));
      return { sessionId, runs };
    },
    async inspect(sessionId, runId) {
      const record = await current(sessionId, runId);
      const artifacts = record.artifacts.map(artifact => {
        const { versions, ...base } = artifact, last = versions.at(-1);
        const publicVersions = versions.map(({ ref, ...value }) => value);
        return { ...base, ...publicVersions.at(-1), primary: artifact.primary,
          version: last?.version ?? 1, versions: publicVersions,
          itemCount: record.reports.filter(report => report.artifactId === artifact.id).length };
      }).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
      const reports = await Promise.all(record.reports.filter(report => report.artifactId === undefined)
        .map(async ({ ref, ...report }) => ({ ...report, item: await readJson(ref) })));
      const interrupted = record.status === 'running' && !active.has(runId);
      const runtime = interrupted && record.runtime ? reduceWorkflowRunsState({ revision: record.runtimeRevision ?? 0, runs: [record.runtime] },
        { runId, sequence: (record.progressSequence ?? 0) + 1, eventType: 'run-settled', payload: { status: 'stopped', stopReason: 'interrupted' } })?.runs.find(run => run.runId === runId) ?? record.runtime : record.runtime;
      return { sessionId, runId, name: record.name, startedAt: record.startedAt, completedAt: record.completedAt,
        status: record.status === 'running' && !active.has(runId) ? 'interrupted' : record.status,
        revision: record.revision, phase: record.phase, error: record.error, graph: record.graph,
        displayGraph: record.displayGraph, runtime, resumedFrom: record.resumedFrom, supersededBy: record.supersededBy,
        causalityGraph: record.causalityGraph, artifacts, reports, reportCount: record.reports.length };
    },
    async data(sessionId, runId, id, after = 0, limit = 200) {
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw Error('报告分页参数无效');
      const record = await current(sessionId, runId);
      const artifact = record.artifacts.find(value => value.id === id);
      if (!artifact || ['file', 'markdown'].includes(artifact.kind)) throw Error('请选择已声明的看板产物');
      const pending = record.reports.filter(report => report.artifactId === id && report.sequence > after);
      const rows = pending.slice(0, limit);
      const items = await Promise.all(rows.map(async ({ ref, artifactId, ...row }) => ({ ...row, item: await readJson(ref) })));
      return { sessionId, runId, id, items, cursor: rows.at(-1)?.sequence ?? after, hasMore: pending.length > rows.length };
    },
    async content(sessionId, runId, id, version) {
      if (!Number.isSafeInteger(version) || version < 1) throw Error('产物版本无效');
      const record = await current(sessionId, runId), artifact = record.artifacts.find(value => value.id === id);
      const entry = artifact?.versions.find(value => value.version === version);
      if (!entry?.ref || !['file', 'markdown'].includes(artifact.kind)) throw Error('产物版本不存在或没有文件内容');
      return { entry, bytes: signal => bytesOf(entry.ref, signal) };
    },
    async preview(sessionId, runId, id, version) {
      const { entry } = await api.content(sessionId, runId, id, version);
      const path = ctx.attachments.fileHostPath(entry.ref);
      if (!path) throw Error('当前宿主没有此产物的原生文件预览入口');
      const encode = value => encodeURIComponent(value).replace(/%3A/gi, ':');
      const resource = `dsh-resource://file/session/${encode(sessionId)}/${path.replaceAll('\\', '/').split('/').map(encode).join('/')}`;
      return { sessionId, runId, id, version, resource };
    },
    async stop(sessionId, runId) {
      await current(sessionId, runId);
      const stop = controls.get(runId); if (!stop) throw Error('该运行已经结束或因重启中断');
      stop(); return { sessionId, runId, requested: true };
    },
    async stopAndWait(sessionId, runId) {
      const record = await current(sessionId, runId);
      const stop = controls.get(runId), run = lifecycles.get(runId);
      if (stop) stop();
      if (run) await run.result;
      else if (record.status === 'running') await api.finish(sessionId, runId,
        { error: { kind: 'abort', name: 'Interrupted', message: 'The native workflow was interrupted before this host activation.' } });
      return current(sessionId, runId);
    },
    saveItem: value => ctx.attachments.saveFile({ data: Buffer.from(JSON.stringify(value)), name: 'report.json' }),
    readItem: (ref, signal) => bytesOf(ref, signal).then(bytes => JSON.parse(bytes.toString('utf8'))),
    saveContent: (bytes, name, signal) => ctx.attachments.saveFileStream({
      data: (async function* () { yield bytes; })(), name, signal }),
    async close() {
      // Cordis disposes sibling effects concurrently. Keep the domain writable
      // until dependent runs have canceled, drained and durably settled.
      const running = [...lifecycles.values()];
      for (const run of running) run.stop();
      await Promise.allSettled(running.map(run => run.result));
      await Promise.allSettled([...queues.values()]); closed = true; await domain.close();
    },
  };
  return api;
}
