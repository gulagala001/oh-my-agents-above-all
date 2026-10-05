// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
const CHART_TYPES = ["line", "bar", "scatter"];
const CHART_SCALES = ["linear", "log"];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function parseField(value) {
  const shorthand = readNonEmptyString(value);
  if (shorthand) {
    return { field: shorthand };
  }
  if (!isRecord(value)) {
    return void 0;
  }
  const field = readNonEmptyString(value.field);
  if (!field) {
    return void 0;
  }
  const label = readNonEmptyString(value.label);
  const unit = readNonEmptyString(value.unit);
  return { field, ...label ? { label } : {}, ...unit ? { unit } : {} };
}
function parseFieldList(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const fields = value.map(parseField).filter((field) => field !== void 0);
  return fields.length > 0 ? fields : void 0;
}
function parseOptions(spec) {
  const title = readNonEmptyString(spec.title);
  const description = readNonEmptyString(spec.description);
  return { ...title ? { title } : {}, ...description ? { description } : {} };
}
function parseChartSpec(spec) {
  const x = parseField(spec.x);
  if (!x) {
    return void 0;
  }
  const single = Array.isArray(spec.y) ? void 0 : parseField(spec.y);
  const y = Array.isArray(spec.y) ? parseFieldList(spec.y) : single ? [single] : void 0;
  if (!y) {
    return void 0;
  }
  const type = CHART_TYPES.find((candidate) => candidate === spec.type) ?? "line";
  const scale = CHART_SCALES.find((candidate) => candidate === spec.scale) ?? "linear";
  const baseline = parseField(spec.baseline);
  return {
    ...parseOptions(spec),
    type,
    x,
    y,
    scale,
    ...baseline ? { baseline } : {}
  };
}
function parseTableSpec(spec) {
  const columns = parseFieldList(spec.columns);
  if (!columns) {
    return void 0;
  }
  const key = readNonEmptyString(spec.key);
  return { ...parseOptions(spec), columns, ...key ? { key } : {} };
}
function parseMetricsSpec(spec) {
  const metrics = parseFieldList(spec.metrics);
  if (!metrics) {
    return void 0;
  }
  return { ...parseOptions(spec), metrics };
}
function parseBoardSpec(spec) {
  const key = readNonEmptyString(spec.key);
  const status = readNonEmptyString(spec.status);
  if (!key || !status) {
    return void 0;
  }
  if (!Array.isArray(spec.columns)) {
    return void 0;
  }
  const columns = spec.columns.map(readNonEmptyString).filter((column) => column !== void 0);
  if (columns.length === 0) {
    return void 0;
  }
  const cardTitle = readNonEmptyString(spec.cardTitle);
  const detail = parseFieldList(spec.detail);
  return {
    ...parseOptions(spec),
    key,
    status,
    columns,
    ...cardTitle ? { cardTitle } : {},
    ...detail ? { detail } : {}
  };
}
function parseArtifactPresetSpec(kind, spec) {
  if (!isRecord(spec)) {
    return void 0;
  }
  switch (kind) {
    case "chart":
      return parseChartSpec(spec);
    case "table":
      return parseTableSpec(spec);
    case "metrics":
      return parseMetricsSpec(spec);
    case "board":
      return parseBoardSpec(spec);
    default:
      return void 0;
  }
}
function chartSeriesFields(spec) {
  return Array.isArray(spec.y) ? spec.y : [spec.y];
}
function artifactFieldLabel(field) {
  return field.label ?? field.field;
}
export {
  artifactFieldLabel,
  chartSeriesFields,
  parseArtifactPresetSpec
};
