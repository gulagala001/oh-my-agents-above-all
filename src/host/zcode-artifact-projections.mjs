import { createHash } from 'node:crypto';
import { canonicalJson, REPORT_CAPS } from '../../lib/zcode-artifact-shared.mjs';
import { artifactFieldLabel, chartSeriesFields, parseArtifactPresetSpec } from '../../lib/zcode-artifact-ui-spec.mjs';

// Incremental companion projection of the retained Apache-2.0 preset apply.ts:
// metrics: last present field; table/board: whole-member keyed replacement with
// first-occurrence ordering; chart: global numeric/category mode, first eligible
// baseline and all-series extrema. Native reports remain authority.
// Display values follow the retained 3.15.1 workflow-artifacts.ts field contract.
const FORMAT = 'omaa.zcode.artifact-projection';
const MEMBER_FORMAT = 'omaa.zcode.artifact-projection-member';
const VERSION = 1;
const MAX_FIELD_BYTES = 4096;
// Reserve room for the native endpoint's outer session/run/artifact wrapper.
const MAX_PAGE_BYTES = 4 * 1024 * 1024 - 4096;
const MAX_VISIBLE = 200;
const kinds = new Set(['metrics', 'table', 'board', 'chart']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const hash = value => createHash('sha256').update(value).digest('hex');
const sizeOf = value => {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : Buffer.byteLength(serialized);
};
const fail = () => { throw Error('Native artifact projection ownership or shape is invalid.'); };
const hasValue = value => value !== undefined && value !== null;
const finite = value => typeof value === 'number' && Number.isFinite(value);
// Exact retained apply.ts numeric conversion, before display-value truncation.
function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

// Same field traversal and formatting as retained presets/apply.ts: arrays use
// Number(segment), absent paths return undefined, and JSON objects keep order.
function readField(item, path) {
  let cursor = item;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return undefined;
      cursor = cursor[index];
    } else {
      if (typeof cursor !== 'object') return undefined;
      cursor = cursor[segment];
    }
  }
  return cursor;
}
function formatValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (['number', 'boolean', 'bigint'].includes(typeof value)) return String(value);
  try { return JSON.stringify(value) ?? ''; } catch { return String(value); }
}
function boundedValue(raw) {
  if (raw === undefined || sizeOf(raw) <= MAX_FIELD_BYTES) return { raw, truncated: false };
  let text = formatValue(raw).slice(0, 1000) + '…';
  // Escaped controls and multi-byte characters must fit the serialized bound,
  // not merely a character count. Keep the whole source report untouched.
  while (sizeOf(text) > MAX_FIELD_BYTES) text = text.slice(0, -2) + '…';
  return { raw: text, truncated: true };
}
function displayValue(raw) {
  const bounded = boundedValue(raw);
  let value = formatValue(bounded.raw), truncated = bounded.truncated;
  if (sizeOf(value) > MAX_FIELD_BYTES) {
    value = value.slice(0, 1000) + '…'; truncated = true;
    while (sizeOf(value) > MAX_FIELD_BYTES) value = value.slice(0, -2) + '…';
  }
  return { value, truncated };
}
const fieldModel = field => ({ field: field.field, label: artifactFieldLabel(field), ...(field.unit ? { unit: field.unit } : {}) });
const displayId = id => sizeOf(id) <= MAX_FIELD_BYTES ? id : 'sha256:' + hash(id);
const descriptor = artifact => {
  const spec = parseArtifactPresetSpec(artifact.kind, artifact.spec);
  if (!kinds.has(artifact.kind) || !spec) fail();
  return { spec, specHash: hash(canonicalJson(spec)) };
};
const owned = (value, format, sessionId, runId, artifact, specHash) => {
  if (!object(value) || value.format !== format || value.version !== VERSION || value.sessionId !== sessionId ||
    value.runId !== runId || value.artifactId !== artifact.id || value.kind !== artifact.kind || value.specHash !== specHash) fail();
  return value;
};
const validRef = ref => {
  if (!object(ref) || !integer(ref.bytes, 1)) fail();
  if (ref.format === 'omaa.zcode.json' && ref.version === 2 && object(ref.root)) return;
  if (typeof ref.attachmentId !== 'string' || !ref.attachmentId || typeof ref.name !== 'string') fail();
};
const chartRootChecked = (root, spec) => {
  const fields = chartSeriesFields(spec);
  if (!Array.isArray(root.points) || root.points.length > root.totalItems || typeof root.numericX !== 'boolean' ||
    !Array.isArray(root.seriesExtrema) || root.seriesExtrema.length !== fields.length) fail();
  let sequence = 0, numericX = true, minimum, maximum;
  for (const point of root.points) {
    if (!object(point) || Object.keys(point).length !== 3 || !integer(point.sequence, sequence + 1) ||
      point.sequence > root.throughSequence || point.numericX !== null && !finite(point.numericX)) fail();
    validRef(point.memberRef); sequence = point.sequence;
    if (point.numericX === null) numericX = false;
    else {
      minimum = minimum === undefined ? point.numericX : Math.min(minimum, point.numericX);
      maximum = maximum === undefined ? point.numericX : Math.max(maximum, point.numericX);
    }
  }
  if (root.numericX !== numericX) fail();
  if (minimum === undefined ? root.numericExtent !== null :
    !object(root.numericExtent) || Object.keys(root.numericExtent).length !== 2 || root.numericExtent.min !== minimum || root.numericExtent.max !== maximum) fail();
  for (const extent of root.seriesExtrema) {
    if (extent === null) continue;
    if (!object(extent) || Object.keys(extent).length !== 3 || !finite(extent.min) || !finite(extent.max) ||
      extent.min > extent.max || !integer(extent.count, 1) || extent.count > root.points.length || spec.scale === 'log' && extent.min <= 0) fail();
  }
  if (root.baseline !== null && (!spec.baseline || !object(root.baseline) || Object.keys(root.baseline).length !== 2 ||
    !finite(root.baseline.value) || spec.scale === 'log' && root.baseline.value <= 0 ||
    !integer(root.baseline.sequence, 1) || !root.points.some(point => point.sequence === root.baseline.sequence))) fail();
  return root;
};
const rootChecked = (root, sessionId, runId, artifact, spec, specHash) => {
  owned(root, FORMAT, sessionId, runId, artifact, specHash);
  if (!integer(root.revision, 1) || !integer(root.totalItems, 1) || root.totalItems > REPORT_CAPS.maxItemsPerRun ||
    root.revision !== root.totalItems || !integer(root.throughSequence, root.totalItems) ||
    root.throughSequence !== artifact.projectionSequence || root.totalItems !== artifact.projectionCount) fail();
  if (artifact.kind === 'chart') return chartRootChecked(root, spec);
  if (artifact.kind === 'metrics') {
    if (!Array.isArray(root.metrics) || root.metrics.length !== spec.metrics.length) fail();
    for (const tile of root.metrics) {
      if (tile === null) continue;
      if (!object(tile) || Object.keys(tile).length !== 3 || !integer(tile.sequence, 1) || tile.sequence > root.throughSequence ||
        typeof tile.value !== 'string' || sizeOf(tile.value) > MAX_FIELD_BYTES || typeof tile.truncated !== 'boolean') fail();
    }
    return root;
  }
  if (!Array.isArray(root.rows) || root.rows.length > root.totalItems || !object(root.index)) fail();
  const seen = new Set(); let firstSequence = 0;
  for (let position = 0; position < root.rows.length; position++) {
    const row = root.rows[position];
    if (!object(row) || !/^[a-f0-9]{64}$/.test(row.identityHash) || !/^[a-f0-9]{64}$/.test(row.viewIdHash) ||
      !integer(row.firstSequence, 1) || row.firstSequence <= firstSequence ||
      !integer(row.sequence, row.firstSequence) || row.sequence > root.throughSequence) fail();
    validRef(row.memberRef); validRef(row.identityRef);
    const identity = canonicalJson(row.identityRef);
    if (seen.has(identity)) fail();
    seen.add(identity); firstSequence = row.firstSequence;
    const bucket = root.index['id_' + row.identityHash];
    if (!Array.isArray(bucket) || !bucket.includes(position)) fail();
    if (artifact.kind === 'board' && (!integer(row.column) || row.column > spec.columns.length)) fail();
  }
  let indexed = 0;
  for (const [key, bucket] of Object.entries(root.index)) {
    if (!/^id_[a-f0-9]{64}$/.test(key) || !Array.isArray(bucket) || !bucket.length) fail();
    const positions = new Set();
    for (const position of bucket) {
      if (!integer(position) || position >= root.rows.length || positions.has(position) || key !== 'id_' + root.rows[position].identityHash) fail();
      positions.add(position); indexed++;
    }
  }
  if (indexed !== root.rows.length) fail();
  if (artifact.kind === 'board') {
    if (!Array.isArray(root.columnCounts) || root.columnCounts.length !== spec.columns.length + 1 || root.columnCounts.some(count => !integer(count))) fail();
    const counts = Array(root.columnCounts.length).fill(0);
    for (const row of root.rows) counts[row.column]++;
    if (counts.some((count, index) => count !== root.columnCounts[index])) fail();
  }
  return root;
};

export async function updateArtifactProjection({ store, record, artifact, report, item, signal }) {
  if (!kinds.has(artifact.kind)) return null;
  signal?.throwIfAborted();
  const { spec, specHash } = descriptor(artifact);
  const priorCount = record.reports.filter(row => row.artifactId === artifact.id && row.sequence < report.sequence).length;
  // Old runs have no full-history projection. Do not label a fold of their new
  // suffix as full-run state, or read/drain old payloads during an ordinary write.
  if (!artifact.projectionRef && priorCount) return null;
  let root;
  if (artifact.projectionRef) {
    validRef(artifact.projectionRef);
    root = rootChecked(await store.readItem(artifact.projectionRef, signal), record.sessionId, record.runId, artifact, spec, specHash);
    if (root.totalItems !== priorCount || root.throughSequence >= report.sequence) fail();
  } else {
    root = { format: FORMAT, version: VERSION, sessionId: record.sessionId, runId: record.runId,
      artifactId: artifact.id, kind: artifact.kind, specHash, revision: 0, totalItems: 0, throughSequence: 0,
      ...(artifact.kind === 'chart' ? { points: [], numericX: true, numericExtent: null,
        seriesExtrema: chartSeriesFields(spec).map(() => null), baseline: null } :
        artifact.kind === 'metrics' ? { metrics: spec.metrics.map(() => null) } : { rows: [], index: {},
        ...(artifact.kind === 'board' ? { columnCounts: Array(spec.columns.length + 1).fill(0) } : {}) }) };
  }
  signal?.throwIfAborted();
  if (artifact.kind === 'chart') {
    const rawX = readField(item, spec.x.field);
    // Missing x excludes the whole point AND its baseline, exactly as apply.ts.
    if (hasValue(rawX)) {
      const numericX = toFiniteNumber(rawX), xLabel = displayValue(rawX);
      const values = chartSeriesFields(spec).map((field, index) => {
        const value = toFiniteNumber(readField(item, field.field));
        if (value === undefined || spec.scale === 'log' && value <= 0) return null;
        const previous = root.seriesExtrema[index];
        root.seriesExtrema[index] = { min: previous === null ? value : Math.min(previous.min, value),
          max: previous === null ? value : Math.max(previous.max, value), count: (previous?.count ?? 0) + 1 };
        return value;
      });
      if (root.baseline === null && spec.baseline) {
        const value = toFiniteNumber(readField(item, spec.baseline.field));
        if (value !== undefined && !(spec.scale === 'log' && value <= 0)) root.baseline = { value, sequence: report.sequence };
      }
      if (numericX === undefined) root.numericX = false;
      else root.numericExtent = { min: root.numericExtent === null ? numericX : Math.min(root.numericExtent.min, numericX),
        max: root.numericExtent === null ? numericX : Math.max(root.numericExtent.max, numericX) };
      const position = root.points.length;
      const memberRef = await store.saveItem({ format: MEMBER_FORMAT, version: VERSION, sessionId: record.sessionId, runId: record.runId,
        artifactId: artifact.id, kind: artifact.kind, specHash, position, sequence: report.sequence,
        truncatedFields: Number(xLabel.truncated), model: { sequence: report.sequence, xLabel: xLabel.value, values } });
      signal?.throwIfAborted();
      // Old members contain no positional x. A later categorical point changes
      // the global mode without rewriting or rehydrating any earlier member.
      root.points.push({ sequence: report.sequence, numericX: numericX ?? null, memberRef });
    }
  } else if (artifact.kind === 'metrics') {
    spec.metrics.forEach((field, index) => {
      const raw = readField(item, field.field);
      if (!hasValue(raw)) return;
      root.metrics[index] = { ...displayValue(raw), sequence: report.sequence };
    });
  } else {
    const key = artifact.kind === 'table' && !spec.key ? undefined : readField(item, spec.key);
    if (artifact.kind === 'table' || hasValue(key)) {
      const id = hasValue(key) ? formatValue(key) : `${report.siteId}@${report.ordinal}`;
      const identityHash = hash(id), bucketKey = 'id_' + identityHash, bucket = root.index[bucketKey] ?? [];
      let position;
      for (const index of bucket) {
        const existing = await store.readItem(root.rows[index].identityRef, signal);
        if (typeof existing !== 'string' || hash(existing) !== identityHash) fail();
        if (existing === id) { position = index; break; }
      }
      if (position === undefined) position = root.rows.length;
      let model, column, truncatedFields = 0;
      if (artifact.kind === 'table') {
        model = { id: displayId(id), sequence: report.sequence, cells: spec.columns.map(field => {
          const display = displayValue(readField(item, field.field));
          truncatedFields += Number(display.truncated); return display.value;
        }) };
      } else {
        const status = formatValue(readField(item, spec.status));
        column = spec.columns.lastIndexOf(status);
        if (column < 0) column = spec.columns.length;
        const title = spec.cardTitle ? readField(item, spec.cardTitle) : undefined;
        const titleDisplay = displayValue(hasValue(title) ? title : id), statusDisplay = displayValue(status);
        truncatedFields = Number(titleDisplay.truncated) + Number(statusDisplay.truncated);
        model = { id: displayId(id), sequence: report.sequence, title: titleDisplay.value,
          status: statusDisplay.value, details: (spec.detail ?? []).map(field => {
            const display = displayValue(readField(item, field.field)); truncatedFields += Number(display.truncated);
            return { label: artifactFieldLabel(field), value: display.value, ...(field.unit ? { unit: field.unit } : {}) };
          }) };
      }
      const previous = root.rows[position];
      const identityRef = previous?.identityRef ?? await store.saveItem(id);
      // Position never changes on upsert. Use this independent key for React:
      // a bounded display ID must not alias an actual user-provided key string.
      model.stableKey = 'projection:' + position;
      const memberRef = await store.saveItem({ format: MEMBER_FORMAT, version: VERSION, sessionId: record.sessionId, runId: record.runId,
        artifactId: artifact.id, kind: artifact.kind, specHash, position, sequence: report.sequence, identityHash, identityRef,
        truncatedFields, identityDisplayBounded: displayId(id) !== id, model });
      signal?.throwIfAborted();
      if (!previous) { bucket.push(position); root.index[bucketKey] = bucket; }
      else if (artifact.kind === 'board') root.columnCounts[previous.column]--;
      root.rows[position] = { identityHash, identityRef, viewIdHash: hash(model.id), firstSequence: previous?.firstSequence ?? report.sequence,
        sequence: report.sequence, memberRef,
        ...(artifact.kind === 'board' ? { column } : {}) };
      if (artifact.kind === 'board') root.columnCounts[column]++;
    }
  }
  root.revision++; root.totalItems++; root.throughSequence = report.sequence;
  const ref = await store.saveItem(root, artifact.projectionRef);
  signal?.throwIfAborted();
  // This draft is published only with its owning report and journal settlement.
  artifact.projectionRef = ref; artifact.projectionCount = root.totalItems; artifact.projectionSequence = root.throughSequence;
  return ref;
}

async function readChartProjection({ store, sessionId, runId, artifact, spec, specHash, root, base, after, limit, signal }) {
  const fields = chartSeriesFields(spec);
  const numeric = root.points.length > 0 && root.numericX;
  const series = fields.map((field, index) => ({ key: `y${index}`, ...fieldModel(field), colorIndex: index }));
  const ordered = root.points.map((point, position) => ({ ...point, position }));
  // Sorting reference metadata does not hydrate or persist every point. Ties use
  // report sequence, just as the retained fold; category order remains arrival.
  if (numeric) ordered.sort((left, right) => {
    const delta = left.numericX - right.numericX;
    return delta !== 0 ? delta : left.sequence - right.sequence;
  });
  let yMin, yMax;
  for (const extent of root.seriesExtrema) {
    if (extent === null) continue;
    yMin = yMin === undefined ? extent.min : Math.min(yMin, extent.min);
    yMax = yMax === undefined ? extent.max : Math.max(yMax, extent.max);
  }
  // The original domain includes every y series, even series the six-color
  // palette later omits. It also includes x positions whose y values are empty.
  const domain = root.points.length > 0 && yMin !== undefined ? {
    xMin: numeric ? root.numericExtent.min : 0,
    xMax: numeric ? root.numericExtent.max : root.points.length - 1, yMin, yMax } : undefined;
  const baseline = root.baseline === null ? undefined : { value: root.baseline.value,
    label: artifactFieldLabel(spec.baseline), ...(spec.baseline.unit ? { unit: spec.baseline.unit } : {}) };
  const summary = { pointCount: root.points.length, xMode: numeric ? 'numeric' : 'category',
    ...(root.baseline === null ? {} : { baselineSequence: root.baseline.sequence }),
    seriesExtrema: root.seriesExtrema.map((extent, index) => ({ key: `y${index}`, field: fields[index].field,
      count: extent?.count ?? 0, ...(extent === null ? {} : { min: extent.min, max: extent.max }) })) };
  const points = []; let cursor = Math.min(after, ordered.length), truncatedFields = 0;
  const resultOf = values => ({ ...base, totalPoints: root.points.length, model: { kind: 'chart', type: spec.type ?? 'line',
    scale: spec.scale ?? 'linear', series, points: values, x: { label: artifactFieldLabel(spec.x),
      ...(spec.x.unit ? { unit: spec.x.unit } : {}), numeric }, ...(baseline ? { baseline } : {}), ...(domain ? { domain } : {}) },
    summary, truncatedFields, identityDisplaysBounded: 0, cursor, hasMore: cursor < ordered.length });
  while (cursor < ordered.length && points.length < limit) {
    signal?.throwIfAborted();
    const entry = ordered[cursor];
    const member = owned(await store.readItem(entry.memberRef, signal), MEMBER_FORMAT, sessionId, runId, artifact, specHash);
    if (member.position !== entry.position || member.sequence !== entry.sequence || !integer(member.truncatedFields) || member.truncatedFields > 1 ||
      !object(member.model) || Object.keys(member.model).length !== 3 || member.model.sequence !== entry.sequence ||
      typeof member.model.xLabel !== 'string' || sizeOf(member.model.xLabel) > MAX_FIELD_BYTES ||
      !Array.isArray(member.model.values) || member.model.values.length !== fields.length) fail();
    const point = { sequence: entry.sequence, x: numeric ? entry.numericX : entry.position, xLabel: member.model.xLabel };
    member.model.values.forEach((value, index) => {
      if (value !== null && (!finite(value) || spec.scale === 'log' && value <= 0 || root.seriesExtrema[index] === null ||
        value < root.seriesExtrema[index].min || value > root.seriesExtrema[index].max)) fail();
      point[`y${index}`] = value;
    });
    const next = [...points, point];
    cursor++; truncatedFields += member.truncatedFields;
    if (sizeOf(resultOf(next)) > MAX_PAGE_BYTES) {
      cursor--; truncatedFields -= member.truncatedFields;
      if (!points.length) fail();
      break;
    }
    points.push(point);
  }
  const result = resultOf(points);
  if (sizeOf(result) > MAX_PAGE_BYTES) fail();
  return result;
}

export async function readArtifactProjection({ store, sessionId, runId, artifact, after = 0, limit = MAX_VISIBLE, signal }) {
  if (!kinds.has(artifact.kind) || !artifact.projectionRef) return null;
  if (!integer(after) || !integer(limit, 1) || limit > MAX_VISIBLE) throw Error('Native aggregate pagination is invalid.');
  const { spec, specHash } = descriptor(artifact);
  validRef(artifact.projectionRef);
  const root = rootChecked(await store.readItem(artifact.projectionRef, signal), sessionId, runId, artifact, spec, specHash);
  const base = { scope: 'full-run', kind: artifact.kind, revision: root.revision, totalItems: root.totalItems,
    fieldValueMaxBytes: MAX_FIELD_BYTES };
  if (artifact.kind === 'chart') return readChartProjection({ store, sessionId, runId, artifact, spec, specHash, root, base, after, limit, signal });
  if (artifact.kind === 'metrics') {
    const metrics = spec.metrics.map((field, index) => ({ ...fieldModel(field), ...(root.metrics[index] ?? {}) }));
    const result = { ...base, model: { kind: 'metrics', metrics }, summary: { metricCount: metrics.length },
      truncatedFields: metrics.filter(metric => metric.truncated).length, identityDisplaysBounded: 0, cursor: 0, hasMore: false };
    if (sizeOf(result) > MAX_PAGE_BYTES) fail();
    return result;
  }
  const visible = [], start = Math.min(after, root.rows.length);
  let truncatedFields = 0, identityDisplaysBounded = 0;
  let cursor = start;
  const modelOf = members => artifact.kind === 'table' ? { kind: 'table', columns: spec.columns.map(fieldModel), rows: members } : {
    kind: 'board', cardCount: root.rows.length, columns: [
      ...spec.columns.map((id, column) => ({ id, other: false, count: root.columnCounts[column], cards: members.filter(member => member.column === column).map(member => member.model) })),
      ...(root.columnCounts.at(-1) ? [{ id: '__other__', other: true, count: root.columnCounts.at(-1),
        cards: members.filter(member => member.column === spec.columns.length).map(member => member.model) }] : []) ] };
  const summary = artifact.kind === 'table' ? { rowCount: root.rows.length } : { cardCount: root.rows.length,
    columns: [...spec.columns.map((id, column) => ({ id, other: false, count: root.columnCounts[column] })),
      ...(root.columnCounts.at(-1) ? [{ id: '__other__', other: true, count: root.columnCounts.at(-1) }] : [])] };
  const resultOf = members => ({ ...base, ...(artifact.kind === 'table' ? { totalRows: root.rows.length } : { cardCount: root.rows.length }),
    model: modelOf(members), summary, truncatedFields, identityDisplaysBounded, cursor, hasMore: cursor < root.rows.length });
  while (cursor < root.rows.length && visible.length < limit) {
    signal?.throwIfAborted();
    const row = root.rows[cursor];
    const member = owned(await store.readItem(row.memberRef, signal), MEMBER_FORMAT, sessionId, runId, artifact, specHash);
    if (member.position !== cursor || member.sequence !== row.sequence || member.identityHash !== row.identityHash ||
      canonicalJson(member.identityRef) !== canonicalJson(row.identityRef) || !integer(member.truncatedFields) ||
      typeof member.identityDisplayBounded !== 'boolean' || !object(member.model) || typeof member.model.id !== 'string' ||
      sizeOf(member.model.id) > MAX_FIELD_BYTES || hash(member.model.id) !== row.viewIdHash || member.model.sequence !== row.sequence) fail();
    const model = member.model;
    if (model.stableKey !== 'projection:' + cursor) fail();
    if (artifact.kind === 'table') {
      if (Object.keys(model).length !== 4 || !Array.isArray(model.cells) || model.cells.length !== spec.columns.length ||
        model.cells.some(cell => typeof cell !== 'string' || sizeOf(cell) > MAX_FIELD_BYTES) || member.truncatedFields > spec.columns.length) fail();
    } else if (Object.keys(model).length !== 6 || typeof model.title !== 'string' || typeof model.status !== 'string' ||
      sizeOf(model.title) > MAX_FIELD_BYTES || sizeOf(model.status) > MAX_FIELD_BYTES ||
      !Array.isArray(model.details) || model.details.length !== (spec.detail ?? []).length || member.truncatedFields > (spec.detail ?? []).length + 2 ||
      model.details.some((detail, index) => !object(detail) || typeof detail.value !== 'string' || sizeOf(detail.value) > MAX_FIELD_BYTES ||
        detail.label !== artifactFieldLabel(spec.detail[index]) || detail.unit !== spec.detail[index].unit ||
        Object.keys(detail).length !== (spec.detail[index].unit ? 3 : 2))) fail();
    const entry = artifact.kind === 'table' ? model : { column: row.column, model };
    const next = [...visible, entry];
    cursor++; truncatedFields += member.truncatedFields; identityDisplaysBounded += Number(member.identityDisplayBounded);
    if (sizeOf(resultOf(next)) > MAX_PAGE_BYTES) {
      cursor--; truncatedFields -= member.truncatedFields; identityDisplaysBounded -= Number(member.identityDisplayBounded);
      if (!visible.length) fail();
      break;
    }
    visible.push(entry);
  }
  return resultOf(visible);
}
