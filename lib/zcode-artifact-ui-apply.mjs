// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
import {
  artifactFieldLabel,
  chartSeriesFields
} from "./zcode-artifact-ui-spec.mjs";
const BOARD_OTHER_COLUMN_ID = "__other__";
function readArtifactField(item, path) {
  const segments = path.split(".");
  let cursor = item;
  for (const segment of segments) {
    if (cursor === null || cursor === void 0) {
      return void 0;
    }
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return void 0;
      }
      cursor = cursor[index];
      continue;
    }
    if (typeof cursor !== "object") {
      return void 0;
    }
    cursor = cursor[segment];
  }
  return cursor;
}
function hasValue(value) {
  return value !== void 0 && value !== null;
}
function toFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : void 0;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
}
function formatArtifactValue(value) {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}
function seriesKey(index) {
  return `y${index}`;
}
function applyChart(spec, items) {
  const fields = chartSeriesFields(spec);
  const series = fields.map((field, index) => ({
    key: seriesKey(index),
    field: field.field,
    label: artifactFieldLabel(field),
    ...field.unit ? { unit: field.unit } : {},
    colorIndex: index
  }));
  const raws = [];
  let baseline;
  for (const entry of items) {
    const rawX = readArtifactField(entry.item, spec.x.field);
    if (!hasValue(rawX)) {
      continue;
    }
    const values = fields.map((field) => {
      const value = toFiniteNumber(readArtifactField(entry.item, field.field));
      if (value === void 0) {
        return void 0;
      }
      return spec.scale === "log" && value <= 0 ? void 0 : value;
    });
    raws.push({ sequence: entry.sequence, x: rawX, values });
    if (spec.baseline && !baseline) {
      const raw = readArtifactField(entry.item, spec.baseline.field);
      const value = toFiniteNumber(raw);
      if (value !== void 0 && !(spec.scale === "log" && value <= 0)) {
        baseline = {
          value,
          label: artifactFieldLabel(spec.baseline),
          ...spec.baseline.unit ? { unit: spec.baseline.unit } : {}
        };
      }
    }
  }
  const numericX = raws.length > 0 && raws.every((raw) => toFiniteNumber(raw.x) !== void 0);
  const ordered = numericX ? [...raws].sort((left, right) => {
    const delta = toFiniteNumber(left.x) - toFiniteNumber(right.x);
    return delta !== 0 ? delta : left.sequence - right.sequence;
  }) : raws;
  const points = ordered.map((raw, index) => {
    const x = numericX ? toFiniteNumber(raw.x) : index;
    const point = {
      sequence: raw.sequence,
      x,
      xLabel: formatArtifactValue(raw.x)
    };
    raw.values.forEach((value, seriesIndex) => {
      point[seriesKey(seriesIndex)] = value ?? null;
    });
    return point;
  });
  const yValues = ordered.flatMap(
    (raw) => raw.values.filter((value) => value !== void 0)
  );
  const domain = points.length > 0 && yValues.length > 0 ? {
    xMin: Math.min(...points.map((point) => point.x)),
    xMax: Math.max(...points.map((point) => point.x)),
    yMin: Math.min(...yValues),
    yMax: Math.max(...yValues)
  } : void 0;
  return {
    kind: "chart",
    type: spec.type ?? "line",
    scale: spec.scale ?? "linear",
    series,
    points,
    x: {
      label: artifactFieldLabel(spec.x),
      ...spec.x.unit ? { unit: spec.x.unit } : {},
      numeric: numericX
    },
    ...baseline ? { baseline } : {},
    ...domain ? { domain } : {}
  };
}
function applyTable(spec, items) {
  const columns = spec.columns.map((column) => ({
    field: column.field,
    label: artifactFieldLabel(column),
    ...column.unit ? { unit: column.unit } : {}
  }));
  const byId = /* @__PURE__ */ new Map();
  for (const entry of items) {
    const keyValue = spec.key ? readArtifactField(entry.item, spec.key) : void 0;
    const id = hasValue(keyValue) ? formatArtifactValue(keyValue) : `${entry.siteId}@${entry.ordinal}`;
    byId.set(id, {
      id,
      sequence: entry.sequence,
      cells: columns.map(
        (column) => formatArtifactValue(readArtifactField(entry.item, column.field))
      )
    });
  }
  return { kind: "table", columns, rows: [...byId.values()] };
}
function applyMetrics(spec, items) {
  const metrics = spec.metrics.map((metric) => ({
    field: metric.field,
    label: artifactFieldLabel(metric),
    ...metric.unit ? { unit: metric.unit } : {}
  }));
  for (const entry of items) {
    metrics.forEach((tile, index) => {
      const raw = readArtifactField(entry.item, tile.field);
      if (!hasValue(raw)) {
        return;
      }
      metrics[index] = {
        ...tile,
        value: formatArtifactValue(raw),
        raw,
        sequence: entry.sequence
      };
    });
  }
  return { kind: "metrics", metrics };
}
function applyBoard(spec, items) {
  const detail = spec.detail ?? [];
  const byId = /* @__PURE__ */ new Map();
  for (const entry of items) {
    const keyValue = readArtifactField(entry.item, spec.key);
    if (!hasValue(keyValue)) {
      continue;
    }
    const id = formatArtifactValue(keyValue);
    const status = formatArtifactValue(readArtifactField(entry.item, spec.status));
    const titleRaw = spec.cardTitle ? readArtifactField(entry.item, spec.cardTitle) : void 0;
    byId.set(id, {
      id,
      sequence: entry.sequence,
      title: hasValue(titleRaw) ? formatArtifactValue(titleRaw) : id,
      status,
      details: detail.map((field) => ({
        label: artifactFieldLabel(field),
        value: formatArtifactValue(readArtifactField(entry.item, field.field)),
        ...field.unit ? { unit: field.unit } : {}
      }))
    });
  }
  const columns = spec.columns.map((column) => ({
    id: column,
    other: false,
    cards: []
  }));
  const listed = new Map(columns.map((column) => [column.id, column]));
  const other = { id: BOARD_OTHER_COLUMN_ID, other: true, cards: [] };
  for (const card of byId.values()) {
    (listed.get(card.status) ?? other).cards.push(card);
  }
  return {
    kind: "board",
    // 「其他」永远在末尾，且只在真有卡时出现——空列会让本来就窄的侧板更挤。
    columns: other.cards.length > 0 ? [...columns, other] : columns,
    cardCount: byId.size
  };
}
function applyArtifactItems(kind, spec, items) {
  switch (kind) {
    case "chart":
      return applyChart(spec, items);
    case "table":
      return applyTable(spec, items);
    case "metrics":
      return applyMetrics(spec, items);
    case "board":
      return applyBoard(spec, items);
  }
}
export {
  applyArtifactItems
};
