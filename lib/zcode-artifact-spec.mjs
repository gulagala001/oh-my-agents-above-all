// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
import { ARTIFACT_CAPS } from "./zcode-artifact-shared.mjs";
import { canonicalJson } from "./zcode-artifact-shared.mjs";
function validateArtifactSpec(op, spec) {
  if (!isPlainObject(spec)) return `${op} spec must be an object literal, got ${describe(spec)}`;
  const common = checkOptions(spec);
  if (common !== void 0) return common;
  const shape = checkShape(op, spec);
  if (shape !== void 0) return shape;
  const bytes = utf8ByteLength(canonicalJson(spec));
  if (bytes > ARTIFACT_CAPS.maxSpecSerializedBytes) {
    return `${op} spec is ${bytes} bytes serialized, over the ${ARTIFACT_CAPS.maxSpecSerializedBytes}-byte limit`;
  }
  return void 0;
}
function checkShape(op, spec) {
  if (op === "chart") {
    const x = checkField(spec.x, "x");
    if (x !== void 0) return x;
    const y = spec.y;
    if (Array.isArray(y)) {
      if (y.length === 0) return "chart spec y is an empty array; give it at least one series";
      for (const [index, entry] of y.entries()) {
        const problem = checkField(entry, `y[${index}]`);
        if (problem !== void 0) return problem;
      }
    } else {
      const problem = checkField(y, "y");
      if (problem !== void 0) return problem;
    }
    if (spec.type !== void 0 && !["line", "bar", "scatter"].includes(String(spec.type))) {
      return `chart spec type must be "line", "bar" or "scatter", got ${describe(spec.type)}`;
    }
    if (spec.scale !== void 0 && !["linear", "log"].includes(String(spec.scale))) {
      return `chart spec scale must be "linear" or "log", got ${describe(spec.scale)}`;
    }
    if (spec.baseline !== void 0) return checkField(spec.baseline, "baseline");
    return void 0;
  }
  if (op === "table") {
    const columns = checkFieldList(spec.columns, "columns");
    if (columns !== void 0) return columns;
    if (spec.key !== void 0 && !isNonEmptyString(spec.key)) {
      return "table spec key must be a non-empty string (the field that identifies a row)";
    }
    return void 0;
  }
  if (op === "metrics") return checkFieldList(spec.metrics, "metrics");
  if (!isNonEmptyString(spec.key)) return "board spec key must be a non-empty string (the field that identifies a card)";
  if (!isNonEmptyString(spec.status)) {
    return "board spec status must be a non-empty string (the field that picks a card's column)";
  }
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) {
    return "board spec columns must be a non-empty array of strings (the column order)";
  }
  for (const [index, column] of spec.columns.entries()) {
    if (!isNonEmptyString(column)) return `board spec columns[${index}] must be a non-empty string`;
  }
  if (spec.cardTitle !== void 0 && !isNonEmptyString(spec.cardTitle)) {
    return "board spec cardTitle must be a non-empty string (the field used as the card title)";
  }
  if (spec.detail !== void 0) return checkFieldList(spec.detail, "detail");
  return void 0;
}
function checkOptions(spec) {
  if (spec.title !== void 0) {
    if (typeof spec.title !== "string") return `spec title must be a string, got ${describe(spec.title)}`;
    if (spec.title.length > ARTIFACT_CAPS.maxTitleLength) {
      return `spec title is ${spec.title.length} characters, over the ${ARTIFACT_CAPS.maxTitleLength} limit`;
    }
  }
  if (spec.description !== void 0) {
    if (typeof spec.description !== "string") {
      return `spec description must be a string, got ${describe(spec.description)}`;
    }
    if (spec.description.length > ARTIFACT_CAPS.maxDescriptionLength) {
      return `spec description is ${spec.description.length} characters, over the ${ARTIFACT_CAPS.maxDescriptionLength} limit`;
    }
  }
  if (spec.primary !== void 0 && typeof spec.primary !== "boolean") {
    return `spec primary must be a boolean, got ${describe(spec.primary)}`;
  }
  return void 0;
}
function checkFieldList(value, where) {
  if (!Array.isArray(value) || value.length === 0) {
    return `spec ${where} must be a non-empty array of fields ({ field: "\u2026" })`;
  }
  for (const [index, entry] of value.entries()) {
    const problem = checkField(entry, `${where}[${index}]`);
    if (problem !== void 0) return problem;
  }
  return void 0;
}
function checkField(value, where) {
  if (!isPlainObject(value)) return `spec ${where} must be { field: "\u2026" }, got ${describe(value)}`;
  if (!isNonEmptyString(value.field)) {
    return `spec ${where}.field must be a non-empty string (a dot path into the item, e.g. "timing.after")`;
  }
  for (const key of ["label", "unit"]) {
    if (value[key] !== void 0 && typeof value[key] !== "string") {
      return `spec ${where}.${key} must be a string, got ${describe(value[key])}`;
    }
  }
  return void 0;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array (${value.length} items)`;
  if (typeof value === "object") return "object";
  if (typeof value === "string") return JSON.stringify(value.slice(0, 40));
  return String(value);
}
function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}
export {
  validateArtifactSpec
};
