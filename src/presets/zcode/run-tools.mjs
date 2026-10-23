// Native inspection bindings. Public handler/contracts: ZCode 3.15.1
// aac4755666d09fdcd70272fcf063c077a639015f, core/src/tool/handlers/
// {list-workflow-runs,get-workflow-run}.ts and contracts/src/tools/ equivalents.
// This adapter keeps the existing owner-session authorization and actual stored
// timestamps. It does not claim the original cross-session project query.
import { readRunSettings } from './run-cache.mjs';
import { workflowLogView } from './run-logs.mjs';

const LIST_BYTES = 24_000, DETAIL_BYTES = 400_000;
const statuses = ['completed', 'errored', 'pending', 'running', 'stopped'];
const sections = ['runtime', 'graph', 'artifacts', 'reports', 'result', 'holes'];
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clip = (value, length = 2048) => typeof value === 'string' ? value.slice(0, length) : undefined;
const copyFields = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, structuredClone(value[key])]));
const life = status => status === 'failed' ? 'errored' : ['killed', 'interrupted'].includes(status) ? 'stopped' : status;
const limitOf = (value, fallback = 20) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('limit must be a finite number.');
  return Math.min(50, Math.max(1, Math.trunc(value)));
};
const jsonOutput = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  presentationMeta: (_args, value) => typeof value.runId === 'string' ? { runId: value.runId } : {} };
function storeFor(ctx) {
  const store = ctx.omaa?.workflowArtifacts;
  if (!store?.list || !store.record || !store.readItem) throw Error('workflow_introspection_unavailable: native workflow storage is unavailable.');
  return store;
}
function summary(row) {
  const result = { runId: row.runId, label: clip(row.name, 512), status: life(row.status), nativeStatus: row.status,
    createdAt: row.startedAt, revision: row.revision, ownedByThisSession: true,
    ...copyFields(row, ['completedAt', 'artifactCount', 'reportCount', 'resumedFrom', 'supersededBy', 'jobId']) };
  if (row.name?.length > 512) result.labelTruncated = true;
  if (row.status === 'interrupted') { result.stopReason = 'interrupted'; result.possiblyInterrupted = true; }
  return result;
}
function omit(output, section) {
  output.truncated = true;
  output.omittedSections ??= [];
  if (!output.omittedSections.includes(section)) output.omittedSections.push(section);
}
function add(output, key, value) {
  output[key] = value;
  // Reserve space for omission flags and pagination receipts added later.
  if (bytes(output) <= DETAIL_BYTES - 2048) return true;
  delete output[key]; omit(output, key); return false;
}
function rowsWithin(output, key, rows, maximum) {
  output[key] = [];
  for (const row of rows.slice(0, maximum)) {
    output[key].push(row);
    if (bytes(output) > DETAIL_BYTES - 2048) { output[key].pop(); break; }
  }
  if (output[key].length < rows.length) {
    output[key + 'Count'] = rows.length;
    omit(output, key);
  }
}
function artifactRows(record) {
  const counts = new Map();
  for (const report of record.reports) if (report.artifactId !== undefined) counts.set(report.artifactId, (counts.get(report.artifactId) ?? 0) + 1);
  return record.artifacts.map(artifact => {
    const last = artifact.versions?.at(-1);
    const title = last?.title ?? artifact.title ?? artifact.id;
    return { id: artifact.id, kind: artifact.kind, title: clip(title, 512), ...(title?.length > 512 ? { titleTruncated: true } : {}),
      ...copyFields(last, ['version', 'bytes', 'contentType']), itemCount: counts.get(artifact.id) ?? 0,
      ...(artifact.primary ? { primary: true } : {}), ...copyFields(last, ['sourcePath']) };
  }).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
}
function runtimeView(runtime) {
  if (!runtime) return undefined;
  // Reports/results and storage locators are separate opt-in sections. Preserve
  // only actual display observations; they are not whole-journal usage facts.
  return copyFields(runtime, ['status', 'currentPhase', 'phases', 'actors', 'nodes', 'usage', 'concurrency',
    'maxConcurrency', 'concurrencyCeiling', 'stopReason', 'truncated']);
}
function cleanupView(rows) {
  if (!Array.isArray(rows)) return {};
  const failures = rows.slice(0, 9).map(value => {
    let remaining = 8;
    const describe = (row, depth = 0) => {
      remaining--;
      if (!object(row)) return { name: 'Error', message: 'Invalid saved cleanup diagnostic', truncated: true };
      const result = {};
      for (const [key, limit] of [['name', 96], ['code', 96], ['message', 512]]) {
        if (typeof row[key] === 'string') {
          result[key] = clip(row[key], limit);
          if (row[key].length > limit) result.truncated = true;
        }
      }
      if (row.truncated === true) result.truncated = true;
      if (Array.isArray(row.causes)) {
        for (const cause of row.causes) {
          if (depth >= 2 || remaining === 0) { result.truncated = true; break; }
          (result.causes ??= []).push(describe(cause, depth + 1));
        }
      }
      return result;
    };
    return { ...describe(value), ...(typeof value?.stage === 'string' ? { stage: clip(value.stage, 32) } : {}) };
  });
  // Keep a summary for every stage before spending the remaining 8 KiB on
  // nested causes. JSON byte size includes control-character escaping.
  const summaries = failures.map(row => {
    const summary = { truncated: true };
    for (const [key, budget] of [['stage', 128], ['name', 128], ['code', 128], ['message', 256]]) {
      if (typeof row[key] !== 'string') continue;
      let value = row[key];
      while (bytes(value) > budget) value = value.slice(0, Math.floor(value.length / 2));
      summary[key] = value;
    }
    return summary;
  });
  for (let index = 0; index < failures.length; index++) {
    const summary = summaries[index]; summaries[index] = failures[index];
    if (bytes({ cleanupFailures: summaries, cleanupFailuresTruncated: true }) > 8192) summaries[index] = summary;
  }
  return { cleanupFailures: summaries,
    ...(rows.length > 9 || summaries.some((row, index) => row !== failures[index]) ? { cleanupFailuresTruncated: true } : {}) };
}
async function snapshot(store, sessionId, runId, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const record = await store.record(sessionId, runId);
    const row = store.list(sessionId).runs.find(value => value.runId === runId);
    signal.throwIfAborted();
    if (row?.revision === record.revision) return { record, row };
  }
  throw Error('The workflow changed while its snapshot was read; request a new snapshot.');
}
async function settingsView(store, parent, record, output, signal) {
  if (record.execution === undefined) return;
  const overBudget = Error('Archived workflow settings exceed the tool read budget.');
  let remaining = DETAIL_BYTES - 2048 - bytes(output);
  const boundedStore = { async readItem(ref, readSignal) {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(ref?.bytes) || ref.bytes < 0) throw Error('Invalid archived workflow settings size.');
    if (ref.bytes > remaining) throw overBudget;
    const maximum = remaining; remaining -= ref.bytes;
    return store.readItem(ref, readSignal, maximum);
  } };
  let settings;
  try { settings = await readRunSettings({ store: boundedStore, parent, record, signal }); }
  catch (error) { if (error !== overBudget) throw error; omit(output, 'settings'); return; }
  signal.throwIfAborted();
  if (settings.maxConcurrency !== undefined) {
    if (!Number.isSafeInteger(settings.maxConcurrency) || settings.maxConcurrency < 1) throw Error('Invalid archived workflow concurrency cap.');
    // The public native service does not expose its current capacity. This is
    // the recorded additional run cap, never a guessed effective total/default.
    if (add(output, 'maxConcurrency', settings.maxConcurrency)) output.maxConcurrencyScope = 'additional-run-cap';
  }
  if (settings.subagentModel !== undefined) add(output, 'subagentModel', settings.subagentModel.canonical);
  if (settings.modelBindings !== undefined) {
    if (!object(settings.modelBindings)) throw Error('Invalid archived workflow model bindings.');
    const entries = [];
    for (const [literal, binding] of Object.entries(settings.modelBindings)) {
      if (!literal || !object(binding) || Object.keys(binding).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))
        || ![binding.provider, binding.model].every(value => typeof value === 'string' && value.length > 0 && value === value.trim())
        || binding.reasoningEffort !== undefined && (typeof binding.reasoningEffort !== 'string' || !binding.reasoningEffort || binding.reasoningEffort !== binding.reasoningEffort.trim()))
        throw Error('Invalid archived workflow model binding.');
      entries.push([literal, `${binding.provider}/${binding.model}${binding.reasoningEffort === undefined ? '' : '$' + binding.reasoningEffort}`]);
    }
    if (entries.length) add(output, 'modelBindings', Object.fromEntries(entries));
  }
}
async function reportPage(store, record, output, args, signal) {
  const after = args.after ?? 0, limit = limitOf(args.limit);
  if (!Number.isSafeInteger(after) || after < 0) throw Error('after must be a nonnegative integer.');
  if (args.artifact_id !== undefined && !record.artifacts.some(artifact => artifact.id === args.artifact_id && !['file', 'markdown'].includes(artifact.kind)))
    throw Error('artifact_id must name a declared dashboard artifact of this run.');
  const pending = record.reports.filter(row => row.artifactId === args.artifact_id && row.sequence > after);
  const page = { items: [], cursor: after, hasMore: false, totalCount: record.reports.filter(row => row.artifactId === args.artifact_id).length };
  output.reports = page;
  for (const row of pending) {
    signal.throwIfAborted();
    if (page.items.length >= limit) break;
    if (!Number.isSafeInteger(row.sequence) || row.sequence <= page.cursor || !Number.isSafeInteger(row.ref?.bytes) || row.ref.bytes < 0)
      throw Error('The saved report page has invalid sequence or size metadata.');
    const remaining = DETAIL_BYTES - 2048 - bytes(output);
    if (row.ref.bytes + 256 > remaining) {
      page.blockedItem = { sequence: row.sequence, bytes: row.ref.bytes, reason: 'tool_response_budget' };
      break;
    }
    const item = await store.readItem(row.ref, signal, remaining);
    const candidate = { ...copyFields(row, ['sequence', 'siteId', 'ordinal']), item };
    page.items.push(candidate);
    if (bytes(output) > DETAIL_BYTES - 2048) {
      page.items.pop(); page.blockedItem = { sequence: row.sequence, reason: 'tool_response_budget' }; break;
    }
    page.cursor = row.sequence;
  }
  page.hasMore = pending.length > page.items.length;
  if (page.blockedItem) {
    omit(output, 'reports');
    page.response = 'The next report cannot fit this tool response. Its cursor was not skipped; read it in the workflow artifact panel.';
  }
}
async function resultView(store, record, output, signal) {
  if (record.status !== 'completed') { output.result = { available: false, reason: 'run_not_completed' }; return; }
  if (!record.outcomeRef) { output.result = { available: false, reason: 'legacy_outcome_not_saved' }; return; }
  const remaining = DETAIL_BYTES - 2048 - bytes(output);
  if (!Number.isSafeInteger(record.outcomeRef.bytes) || record.outcomeRef.bytes < 0) throw Error('Invalid saved workflow outcome size.');
  if (record.outcomeRef.bytes > remaining) {
    output.result = { available: true, omitted: true, reason: 'tool_response_budget' }; omit(output, 'result'); return;
  }
  const saved = await store.readItem(record.outcomeRef, signal, remaining);
  if (!object(saved) || saved.format !== 'omaa.zcode.run-outcome' || saved.version !== 1 || !object(saved.outcome)
    || typeof saved.valuePresent !== 'boolean' || typeof saved.valueIsUndefined !== 'boolean'
    || saved.outcome.error !== undefined || saved.valueIsUndefined !== (saved.outcome.value === undefined)
    || !saved.valuePresent && Object.hasOwn(saved.outcome, 'value')
    || saved.valuePresent && !saved.valueIsUndefined && !Object.hasOwn(saved.outcome, 'value')) throw Error('Invalid saved workflow outcome.');
  const result = { available: true, valuePresent: saved.valuePresent, valueIsUndefined: saved.valueIsUndefined,
    ...(saved.valuePresent && !saved.valueIsUndefined ? { value: saved.outcome.value } : {}) };
  if (!add(output, 'result', result)) output.result = { available: true, omitted: true, reason: 'tool_response_budget' };
}

export function installRunInspectionTools(ctx) {
  ctx.tools.register({ name: 'list_workflow_runs',
    description: 'List saved native ZCode runs owned by THIS session, including cold history. These are past executions, not reusable workflow definitions. Results are ordered by actual start time, newest first, capped at 50 rows and 24000 JSON bytes. This native scope does not enumerate other sessions in the project. Use get_workflow_run for an immediate bounded snapshot; use job_output when waiting for a live job.',
    parameters: { type: 'object', properties: { limit: { type: 'number', default: 20, description: 'Finite values are truncated and clamped to 1–50.' },
      statuses: { type: 'array', items: { type: 'string', enum: statuses } } }, additionalProperties: false }, output: jsonOutput,
    execute(args, exec) {
      exec.signal.throwIfAborted();
      const store = storeFor(ctx), limit = limitOf(args.limit);
      if (args.statuses !== undefined && (!Array.isArray(args.statuses) || args.statuses.some(status => !statuses.includes(status)))) throw Error('Invalid workflow lifecycle status filter.');
      const source = store.list(exec.agent.id).runs.filter(row => args.statuses === undefined || args.statuses.includes(life(row.status)));
      const output = { scope: 'owner-session', ordering: 'startedAt-desc', runs: [], count: 0, truncated: false };
      for (const row of source.slice(0, limit)) {
        output.runs.push(summary(row)); output.count = output.runs.length;
        if (bytes(output) > LIST_BYTES) { output.runs.pop(); output.count = output.runs.length; break; }
      }
      output.truncated = source.length > output.runs.length;
      exec.signal.throwIfAborted(); return output;
    },
  });
  ctx.tools.register({ name: 'get_workflow_run',
    description: 'Read an immediate snapshot of one native ZCode run owned by THIS session; never waits, activates, modifies or resumes it. Includes verified archived model selections and any explicit additional run concurrency cap; missing/default settings are not guessed. Settings attachment reads are bounded; omittedSections names settings when they exceed the read budget. Native logTail stores at most 40 entries of 1024 characters within a 64 KiB JSON storage budget, with coverage and truncation counts; sequence is a native log ordinal and at is its durable commit-admission time. Old runs without this format explicitly report unavailable, not an empty history. Default sections are runtime observations, published artifact titles and hole facts. Include graph, reports or result explicitly to read them. Runtime counters describe the bounded display projection, not complete journal usage; missing timestamps and health are not invented. Report cursors cover one selected tag (omit artifact_id for untagged reports) and never skip an oversized item. Saved top-level result is hydrated only when requested and within the 400000-byte JSON response budget. Refer to published artifacts by title; use the artifact panel for their content.',
    parameters: { type: 'object', properties: { run_id: { type: 'string', minLength: 1 },
      include: { type: 'array', items: { type: 'string', enum: sections } },
      after: { type: 'integer', minimum: 0 }, limit: { type: 'number', default: 20, description: 'Report rows; finite values are truncated and clamped to 1–50.' },
      artifact_id: { type: 'string', minLength: 1 } }, required: ['run_id'], additionalProperties: false }, output: jsonOutput,
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (typeof args.run_id !== 'string' || !args.run_id) throw Error('run_id must identify an existing workflow run.');
      const include = args.include ?? ['runtime', 'artifacts', 'holes'];
      if (!Array.isArray(include) || include.some(section => !sections.includes(section))) throw Error('Invalid workflow inspection section.');
      const store = storeFor(ctx), row = store.list(exec.agent.id).runs.find(value => value.runId === args.run_id);
      if (!row) return { ok: false, code: 'run_not_found', response: 'No workflow run with this ID belongs to the current session.' };
      const { record, row: captured } = await snapshot(store, exec.agent.id, args.run_id, exec.signal);
      const output = { ok: true, scope: 'owner-session', ...summary({ ...record, status: captured.status,
        artifactCount: record.artifacts.length, reportCount: record.reports.length }), generatedAt: Date.now(),
        ...(record.phase === undefined ? {} : { currentPhase: clip(record.phase, 128) }),
        ...(record.phase?.length > 128 ? { currentPhaseTruncated: true } : {}),
        // Native PTC failures carry kind/message, without an Error name. Keep
        // that absence rather than returning undefined through the JSON tool.
        ...(record.error === undefined ? {} : { error: { ...(typeof record.error.name === 'string' ? { name: clip(record.error.name, 128) } : {}), code: clip(record.error.code ?? record.error.kind, 128), message: clip(record.error.message, 4096),
          ...cleanupView(record.error.cleanupFailures),
          ...([record.error.name, record.error.code ?? record.error.kind].some(value => value?.length > 128) || record.error.message?.length > 4096 ? { truncated: true } : {}) } }) };
      await settingsView(store, exec.agent, record, output, exec.signal);
      const logs = workflowLogView(record);
      for (const [key, value] of Object.entries(logs)) if (key !== 'logTail') output[key] = value;
      if (logs.logTail !== undefined) add(output, 'logTail', logs.logTail);
      if (include.includes('runtime')) {
        const runtime = runtimeView(record.runtime);
        // Pending questions require their actual live registry. A persisted
        // reducer row alone cannot restore a dead deferred after a restart.
        const live = ctx.omaa.pendingWorkflowQuestions(exec.agent.id, args.run_id);
        if (runtime) { runtime.pendingQuestions = live.pendingQuestions; add(output, 'runtime', runtime); }
        add(output, 'pendingQuestions', live.pendingQuestions);
        output.pendingQuestionCount = live.pendingQuestionCount;
        if (live.pendingQuestionsTruncated) omit(output, 'pendingQuestions');
        output.runtimeScope = 'bounded-display-observations';
      }
      if (include.includes('graph')) add(output, 'graph', copyFields(record, ['graph', 'causalityGraph', 'displayGraph']));
      if (include.includes('artifacts')) rowsWithin(output, 'artifacts', artifactRows(record), 32);
      if (include.includes('holes') && record.liveHoles) {
        const open = record.liveHoles.open ?? [], filled = record.liveHoles.filled ?? [];
        const waiting = captured.status === 'running';
        rowsWithin(output, 'holes', [...open.map(hole => ({ ...copyFields(hole, ['siteId', 'name', 'type', 'ordinal', 'since', 'prompt', 'phaseName']), state: waiting ? 'waiting' : 'unfinished' })),
          ...filled.map(hole => ({ ...copyFields(hole, ['siteId', 'filledAt', 'filledBy']), state: 'filled' }))], 32);
      }
      if (include.includes('reports')) await reportPage(store, record, output, args, exec.signal);
      if (include.includes('result')) await resultView(store, record, output, exec.signal);
      exec.signal.throwIfAborted();
      if (bytes(output) > DETAIL_BYTES) throw Error('Workflow inspection response exceeded its bounded output contract.');
      return output;
    },
  });
}
