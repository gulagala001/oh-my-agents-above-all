import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { reduceWorkflowRunsState } from '../../lib/zcode-run-projection.mjs';
import { createZCodeRecordCodec } from './zcode-records.mjs';
import { assertRunCache, decodeContinuationRecord } from '../presets/zcode/continuation-records.mjs';
import { readArtifactProjection } from './zcode-artifact-projections.mjs';

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
// Public 3.15.1 WORKFLOW_ARTIFACT_LIMITS.maxPageBytes: 16 MiB / 4.
const REPORT_DATA_PAGE_MAX_BYTES = 4 * 1024 * 1024;
const WORKFLOW_SOURCE_MAX_BYTES = 256 * 1024;

// Domain.open eagerly loads records. Keep only small run summaries there; the
// native content-addressed attachment store owns full metadata and all bytes.
export async function createZCodeArtifactStore(ctx) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'omaa_zcode_workflows', version: 1,
    layout: 'per-record', tables: { runs: domainTable(summarySchema) } }));
  const table = domain.table('runs'), active = new Map(), queues = new Map(), controls = new Map(), lifecycles = new Map();
  const codec = createZCodeRecordCodec(ctx.attachments), indexes = new WeakMap();
  const cold = new Map();
  let closed = false, closing = false, admissionsClosed = false, closingPromise;
  const stopped = new WeakSet(), shutdownFailures = [];
  const requestStop = run => {
    if (stopped.has(run)) return;
    stopped.add(run);
    try { run.stop(); } catch (error) { shutdownFailures.push(error); }
  };
  const stopCommittedDuringClose = (runId, stop) => {
    if (!closing) return;
    const run = lifecycles.get(runId);
    if (run) requestStop(run);
    else {
      // The summary has committed: retain its real identity even if an invalid
      // caller omitted lifecycle registration. Stop it, but do not claim drain.
      requestStop({ stop });
      shutdownFailures.push(Error('Committed workflow has no tracked shutdown lifecycle.'));
    }
  };
  const { bytesOf, readItem: readJson } = codec;
  const summaryIdentity = summary => JSON.stringify([summary.sessionId, summary.runId, summary.revision,
    summary.ref.attachmentId, summary.ref.name, summary.ref.bytes]);
  const freezeRecord = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freezeRecord(child);
      Object.freeze(value);
    }
    return value;
  };
  const cacheCold = (summary, record, index) => {
    // Cache only expanded reference metadata, never hydrated report or task
    // payloads. Keep a private immutable copy so returned drafts cannot alter it.
    const cached = freezeRecord(structuredClone(record));
    indexes.set(cached, index);
    cold.delete(summary.runId);
    cold.set(summary.runId, { identity: summaryIdentity(summary), record: cached });
    while (cold.size > 2) cold.delete(cold.keys().next().value);
    return cached;
  };
  const current = async (sessionId, runId) => {
    const summary = table.get(keyOf(runId));
    if (!summary || summary.sessionId !== sessionId || summary.runId !== runId) throw Error('工作流不属于当前会话');
    const identity = summaryIdentity(summary);
    let record = active.get(runId);
    if (!record) {
      // Authorization above is mandatory even on a cache hit. A revision or
      // native root-ref change makes the old entry ineligible immediately.
      const cached = cold.get(runId);
      if (cached?.identity === identity) {
        cold.delete(runId); cold.set(runId, cached);
        record = cached.record;
      } else {
        const saved = await codec.readRecord(summary.ref, sessionId, runId);
        const latest = table.get(keyOf(runId));
        if (!latest || latest.sessionId !== sessionId || latest.runId !== runId) throw Error('工作流不属于当前会话');
        // A concurrent mutation may have committed while attachments were read.
        // Re-read its root instead of returning or caching the older snapshot.
        if (summaryIdentity(latest) !== identity) return current(sessionId, runId);
        record = saved.record; indexes.set(record, saved.index);
      }
    }
    if (record.runId !== runId || record.sessionId !== sessionId) throw Error('工作流存储归属不符');
    if (record.revision !== summary.revision || !Array.isArray(record.artifacts) || !Array.isArray(record.reports) ||
      record.artifacts.length !== summary.artifactCount || record.reports.length !== summary.reportCount) throw Error('工作流存储摘要不符');
    if (!active.has(runId) && cold.get(runId)?.identity !== identity) record = cacheCold(summary, record, indexes.get(record));
    return record;
  };
  const persist = async (record, previous, signal) => {
    signal?.throwIfAborted();
    if (closed) throw Error('工作流存储已关闭');
    let saved;
    try { saved = await codec.saveRecord(record, previous); }
    catch (error) { if (closing) shutdownFailures.push(error); throw error; }
    const ref = saved.ref;
    signal?.throwIfAborted();
    const { runId, sessionId, name, status, startedAt, completedAt, phase, revision, jobId, resumedFrom, supersededBy } = record;
    const summary = { runId, sessionId, name, status, startedAt, revision, ref,
      artifactCount: record.artifacts.length, reportCount: record.reports.length,
      ...(completedAt === undefined ? {} : { completedAt }), ...(phase === undefined ? {} : { phase }),
      ...(jobId === undefined ? {} : { jobId }), ...(resumedFrom ? { resumedFrom } : {}), ...(supersededBy ? { supersededBy } : {}) };
    try { await table.put(keyOf(runId), summary); }
    catch (error) { if (closing) shutdownFailures.push(error); throw error; }
    // Attachment pages can remain unreachable after failure. The summary put
    // is the sole commit point; publish the new live record only after it succeeds.
    indexes.set(record, saved.index);
    if (active.has(runId)) active.set(runId, record);
    else if (cold.has(runId) || record.status !== 'running') cacheCold(summary, record, saved.index);
    else cold.delete(runId);
  };
  const enqueue = (runId, fn) => {
    keyOf(runId);
    if (closed || admissionsClosed) return Promise.reject(Error('工作流存储已关闭'));
    const work = (queues.get(runId) ?? Promise.resolve()).then(fn);
    const pending = work.catch(() => {}); queues.set(runId, pending);
    pending.finally(() => { if (queues.get(runId) === pending) queues.delete(runId); });
    return work;
  };
  const mutate = (sessionId, runId, fn, { signal } = {}) => enqueue(runId, async () => {
    signal?.throwIfAborted();
    const before = await current(sessionId, runId);
    const draft = structuredClone(before);
    const value = await fn(draft);
    signal?.throwIfAborted();
    if (value === NO_ARTIFACT_CHANGE) return;
    if (draft.runId !== runId || draft.sessionId !== sessionId || draft.revision !== before.revision) throw Error('工作流存储归属或修订无效');
    draft.revision++; await persist(draft, indexes.get(before), signal); return value;
  });
  const reportPage = async (record, artifactId, after, limit) => {
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw Error('报告分页参数无效');
    const pending = record.reports.filter(report => report.artifactId === artifactId && report.sequence > after);
    const items = []; let pageBytes = 0;
    for (const report of pending) {
      if (items.length >= limit) break;
      const bytes = report.ref?.bytes;
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('报告条目字节长度无效');
      // A future larger write allowance cannot create an unreadable cursor.
      // Until an oversized-item reader is explicitly introduced, reject it.
      if (bytes > REPORT_DATA_PAGE_MAX_BYTES) throw Error('报告条目字节长度超出分页范围');
      if (pageBytes + bytes > REPORT_DATA_PAGE_MAX_BYTES) break;
      const { ref, artifactId: ignoredTag, ...row } = report;
      const item = { ...row, item: await readJson(ref, undefined, REPORT_DATA_PAGE_MAX_BYTES) };
      const responseBytes = Buffer.byteLength(JSON.stringify(item)) + (items.length ? 1 : 2);
      if (pageBytes + responseBytes > REPORT_DATA_PAGE_MAX_BYTES) {
        if (!items.length) throw Error('报告条目字节长度超出分页范围');
        break;
      }
      items.push(item); pageBytes += responseBytes;
    }
    return { items, cursor: items.at(-1)?.sequence ?? after, hasMore: pending.length > items.length };
  };
  const boundedHoleFacts = rows => {
    const values = []; let bytes = 0;
    for (const row of rows) {
      const size = Buffer.byteLength(JSON.stringify(row));
      if (values.length >= 200 || bytes + size > REPORT_DATA_PAGE_MAX_BYTES) break;
      values.push(row); bytes += size;
    }
    return values;
  };
  const api = {
    trackRun(runId, result, stop) {
      const run = { result, stop };
      if (closed || admissionsClosed) {
        // start() creates the Promise before registering it. Even a rejected
        // late registration must cancel that actual work and observe rejection.
        result.catch(() => {});
        const failuresBeforeStop = shutdownFailures.length;
        requestStop(run);
        const error = Error('工作流存储已关闭，不能跟踪新运行');
        if (shutdownFailures.length > failuresBeforeStop)
          throw new AggregateError([error, ...shutdownFailures.slice(failuresBeforeStop)], error.message);
        throw error;
      }
      if (lifecycles.has(runId)) {
        result.catch(() => {}); requestStop(run);
        throw Error('工作流已有已跟踪的运行');
      }
      lifecycles.set(runId, run);
      result.finally(() => { if (lifecycles.get(runId) === run) lifecycles.delete(runId); }).catch(() => {});
      // A run can finish preparing while sibling Cordis effects are closing.
      // Cancel that actual lifecycle too; it must not escape the drain snapshot.
      if (closing) requestStop(run);
    },
    begin({ runId, sessionId, name, graph, causalityGraph, displayGraph, jobId, execution, resumedFrom }, stop) {
      if (closing) return Promise.reject(Error('工作流存储正在关闭，不能开始新运行'));
      return enqueue(runId, async () => {
        if (closing) throw Error('工作流存储正在关闭，不能开始新运行');
        if (table.get(keyOf(runId)) !== undefined) throw Error('工作流标识已存在');
        const record = { runId, sessionId, name, status: 'running', startedAt: Date.now(), revision: 1,
          graph, causalityGraph, displayGraph, execution, artifacts: [], reports: [], ...(jobId ? { jobId } : {}), ...(resumedFrom ? { resumedFrom } : {}) };
        await persist(record);
        cold.delete(runId);
        active.set(runId, record); controls.set(runId, stop);
        stopCommittedDuringClose(runId, stop);
      });
    },
    reopen({ sessionId, runId, expectedRevision, jobId, signal }, stop) {
      if (closing) return Promise.reject(Error('工作流存储正在关闭，不能恢复运行'));
      return enqueue(runId, async () => {
        if (closing) throw Error('工作流存储正在关闭，不能恢复运行');
        signal?.throwIfAborted();
        if (active.has(runId) || controls.has(runId)) throw Error('该工作流已在当前宿主运行');
        const before = await current(sessionId, runId);
        if (before.revision !== expectedRevision || before.supersededBy !== undefined
          || !['running', 'failed', 'killed'].includes(before.status)
          || before.execution?.replay?.format !== 'omaa.zcode.replay' || before.execution.replay.version !== 3)
          throw Error('工作流已改变或没有预先保存的重放记录');
        const record = structuredClone(before);
        record.status = 'running'; record.revision++;
        delete record.completedAt; delete record.error; delete record.execution.actorDrainComplete;
        if (jobId === undefined) delete record.jobId; else record.jobId = jobId;
        await persist(record, indexes.get(before), signal);
        cold.delete(runId); active.set(runId, record); controls.set(runId, stop);
        stopCommittedDuringClose(runId, stop);
      });
    },
    mutate,
    record: async (sessionId, runId) => structuredClone(await current(sessionId, runId)),
    async finish(sessionId, runId, outcome) {
      try {
        const outcomeRef = await codec.saveItem({ format: 'omaa.zcode.run-outcome', version: 1,
          outcome, valuePresent: Object.hasOwn(outcome, 'value'), valueIsUndefined: outcome.value === undefined });
        await mutate(sessionId, runId, record => {
          record.status = outcome.error ? outcome.error.kind === 'abort' ? 'killed' : 'failed' : 'completed';
          record.completedAt = Date.now();
          record.outcomeRef = outcomeRef;
          if (outcome.error) record.error = outcome.error;
        });
        const record = active.get(runId), summary = table.get(keyOf(runId));
        if (record && summary?.sessionId === sessionId && record.revision === summary.revision)
          cacheCold(summary, record, indexes.get(record));
      } finally { active.delete(runId); controls.delete(runId); }
    },
    list(sessionId) {
      const runs = [...table.entries()].map(([, value]) => value).filter(value => value.sessionId === sessionId)
        .sort((a, b) => b.startedAt - a.startedAt).map(({ ref, ...row }) => ({ ...row,
          status: row.status === 'running' && !active.has(row.runId) ? 'interrupted' : row.status }));
      return { sessionId, runs };
    },
    async source(sessionId, runId, signal) {
      const record = await current(sessionId, runId), execution = assertRunCache(record, sessionId);
      let script;
      if (execution.version === 1) script = execution.script;
      else {
        const header = decodeContinuationRecord('start-header', await readJson(execution.startHeaderRef, signal, 64 * 1024), { sessionId, runId });
        // A JSON string can escape each source byte to six bytes. Bound the
        // attachment before hydration, then check the exact decoded source.
        const jsonLimit = WORKFLOW_SOURCE_MAX_BYTES * 6 + 2;
        if (header.scriptRef.bytes > jsonLimit) throw Error('工作流源码超出读取范围');
        script = await readJson(header.scriptRef, signal, jsonLimit);
      }
      if (typeof script !== 'string' || Buffer.byteLength(script) > WORKFLOW_SOURCE_MAX_BYTES) throw Error('工作流源码无效或超出读取范围');
      signal?.throwIfAborted();
      return { sessionId, runId, revision: record.revision, script,
        scriptHash: createHash('sha256').update(script, 'utf8').digest('hex') };
    },
    async inspect(sessionId, runId, after = 0, limit = 200) {
      const record = await current(sessionId, runId);
      const artifacts = record.artifacts.map(artifact => {
        const { versions, projectionRef, projectionCount, projectionSequence, ...base } = artifact, last = versions.at(-1);
        const publicVersions = versions.map(({ ref, ...value }) => value);
        return { ...base, ...publicVersions.at(-1), primary: artifact.primary,
          version: last?.version ?? 1, versions: publicVersions,
          itemCount: record.reports.filter(report => report.artifactId === artifact.id).length };
      }).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
      const page = await reportPage(record, undefined, after, limit);
      const openHoles = record.liveHoles ? boundedHoleFacts(record.liveHoles.open) : [];
      const filledHoles = record.liveHoles ? boundedHoleFacts(record.liveHoles.filled.slice(-200)) : [];
      const liveHoles = record.liveHoles && { ...record.liveHoles,
        open: openHoles, filled: filledHoles,
        openCount: record.liveHoles.open.length, filledCount: record.liveHoles.filled.length,
        truncated: openHoles.length < record.liveHoles.open.length || filledHoles.length < record.liveHoles.filled.length };
      const interrupted = record.status === 'running' && !active.has(runId);
      const prospectiveJournal = record.execution?.replay?.format === 'omaa.zcode.replay' && record.execution.replay.version === 3;
      const nativeResume = { candidate: prospectiveJournal && !active.has(runId) && record.supersededBy === undefined
        && (interrupted || ['failed', 'killed'].includes(record.status)), preflightRequired: true,
        ...(prospectiveJournal ? { prospectiveJournalVersion: 3 } : {}) };
      const runtime = interrupted && record.runtime ? reduceWorkflowRunsState({ revision: record.runtimeRevision ?? 0, runs: [record.runtime] },
        { runId, sequence: (record.progressSequence ?? 0) + 1, eventType: 'run-settled', payload: { status: 'stopped', stopReason: 'interrupted' } })?.runs.find(run => run.runId === runId) ?? record.runtime : record.runtime;
      return structuredClone({ sessionId, runId, name: record.name, startedAt: record.startedAt, completedAt: record.completedAt,
        status: record.status === 'running' && !active.has(runId) ? 'interrupted' : record.status,
        revision: record.revision, phase: record.phase, error: record.error, graph: record.graph,
        displayGraph: record.displayGraph, runtime, liveHoles, nativeResume, resumedFrom: record.resumedFrom, supersededBy: record.supersededBy,
        causalityGraph: record.causalityGraph, artifacts, reports: page.items, reportCount: record.reports.length,
        reportsCursor: page.cursor, reportsHasMore: page.hasMore,
        untaggedReportCount: record.reports.filter(report => report.artifactId === undefined).length });
    },
    async data(sessionId, runId, id, after = 0, limit = 200) {
      const record = await current(sessionId, runId);
      const artifact = record.artifacts.find(value => value.id === id);
      if (!artifact || ['file', 'markdown'].includes(artifact.kind)) throw Error('请选择已声明的看板产物');
      return structuredClone({ sessionId, runId, id, ...await reportPage(record, id, after, limit) });
    },
    async aggregate(sessionId, runId, id, after = 0, limit = 200, signal) {
      const record = await current(sessionId, runId), artifact = record.artifacts.find(value => value.id === id);
      if (!artifact || !['chart', 'metrics', 'table', 'board'].includes(artifact.kind)) throw Error('请选择已声明的看板产物');
      const projection = await readArtifactProjection({ store: api, sessionId, runId, artifact, after, limit, signal });
      if (!projection) return { sessionId, runId, id, scope: 'page', reason: 'full-run-projection-unavailable' };
      const reports = record.reports.filter(report => report.artifactId === id);
      if (projection.totalItems !== reports.length || artifact.projectionSequence !== reports.at(-1)?.sequence)
        throw Error('产物汇总与已保存的报告不一致');
      signal?.throwIfAborted();
      return { sessionId, runId, id, ...projection };
    },
    async content(sessionId, runId, id, version) {
      if (!Number.isSafeInteger(version) || version < 1) throw Error('产物版本无效');
      const record = await current(sessionId, runId), artifact = record.artifacts.find(value => value.id === id);
      const entry = artifact?.versions.find(value => value.version === version);
      if (!entry?.ref || !['file', 'markdown'].includes(artifact.kind)) throw Error('产物版本不存在或没有文件内容');
      return { entry: structuredClone(entry), bytes: signal => bytesOf(entry.ref, signal) };
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
      return structuredClone(await current(sessionId, runId));
    },
    saveItem: codec.saveItem,
    readItem: codec.readItem,
    saveContent: (bytes, name, signal) => ctx.attachments.saveFileStream({
      data: (async function* () { yield bytes; })(), name, signal }),
    close() {
      if (closingPromise) return closingPromise;
      closing = true;
      // Cordis disposes sibling effects concurrently. Keep the domain writable
      // until dependent runs have canceled, drained and durably settled.
      closingPromise = Promise.resolve().then(async () => {
        while (lifecycles.size) {
          const running = [...lifecycles.values()];
          for (const run of running) requestStop(run);
          const outcomes = await Promise.allSettled(running.map(run => run.result));
          for (const outcome of outcomes) if (outcome.status === 'rejected') shutdownFailures.push(outcome.reason);
        }
        // No await between the empty-lifecycle observation and closing queue
        // admission. Already-admitted mutations may still finish their writes.
        admissionsClosed = true;
        await Promise.allSettled([...queues.values()]);
        closed = true; cold.clear(); active.clear(); controls.clear();
        try { await domain.close(); } catch (error) { shutdownFailures.push(error); }
        if (shutdownFailures.length) throw new AggregateError(shutdownFailures, 'Native workflow storage shutdown did not fully settle.');
      });
      return closingPromise;
    },
  };
  return api;
}
