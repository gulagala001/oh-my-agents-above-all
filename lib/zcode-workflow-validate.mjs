// Derived from fixed Apache-2.0 ZCode schema validator; see THIRD_PARTY_NOTICES.md.

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/validate.ts
function validate(schema, value) {
  const violations = [];
  check(schema, value, "$", schema, violations);
  return violations;
}
function formatViolation(violation) {
  return `${violation.path}: expected ${violation.expected}, got ${violation.got}`;
}
function formatViolations(violations) {
  return violations.map(formatViolation).join("\n");
}
function check(schema, value, path, root, out) {
  if (schema.$ref !== void 0) {
    const resolved = resolveRef(root, schema.$ref);
    if (resolved === void 0) {
      out.push({ expected: `schema ${schema.$ref}`, got: "unresolved $ref", path });
      return;
    }
    check(resolved, value, path, root, out);
    return;
  }
  if ("const" in schema) {
    if (!deepEqual(value, schema.const)) {
      out.push({ expected: describeValue(schema.const), got: describeValue(value), path });
    }
    return;
  }
  if (schema.enum !== void 0) {
    if (!schema.enum.some((candidate) => deepEqual(value, candidate))) {
      out.push({ expected: `one of ${schema.enum.map((v) => describeValue(v)).join(", ")}`, got: describeValue(value), path });
    }
    return;
  }
  if (schema.anyOf !== void 0) {
    const matched = schema.anyOf.some((branch) => {
      const trial = [];
      check(branch, value, path, root, trial);
      return trial.length === 0;
    });
    if (!matched) {
      out.push({ expected: `one of ${schema.anyOf.length} variants`, got: describeValue(value), path });
    }
    return;
  }
  if (schema.type !== void 0 && !typeMatches(schema.type, value)) {
    out.push({ expected: typeName(schema.type), got: describeValue(value), path });
    return;
  }
  if (schema.type === "object") checkObject(schema, value, path, root, out);
  if (schema.type === "array") checkArray(schema, value, path, root, out);
  if (typeof value === "string") checkString(schema, value, path, out);
  if (typeof value === "number") checkNumber(schema, value, path, out);
}
function checkObject(schema, value, path, root, out) {
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      out.push({ expected: "present", got: "missing", path: `${path}.${key}` });
    }
  }
  const properties = schema.properties ?? {};
  for (const [key, propValue] of Object.entries(value)) {
    const propSchema = properties[key];
    if (propSchema !== void 0) {
      check(propSchema, propValue, `${path}.${key}`, root, out);
      continue;
    }
    const additional = schema.additionalProperties;
    if (additional === false) {
      out.push({ expected: "no additional property", got: describeValue(propValue), path: `${path}.${key}` });
    } else if (additional !== void 0 && additional !== true) {
      check(additional, propValue, `${path}.${key}`, root, out);
    }
  }
}
function checkArray(schema, value, path, root, out) {
  if (schema.minItems !== void 0 && value.length < schema.minItems) {
    out.push({ expected: `at least ${schema.minItems} items`, got: `array(${value.length})`, path });
  }
  if (schema.maxItems !== void 0 && value.length > schema.maxItems) {
    out.push({ expected: `at most ${schema.maxItems} items`, got: `array(${value.length})`, path });
  }
  if (schema.prefixItems !== void 0) {
    schema.prefixItems.forEach((itemSchema, index) => {
      if (index < value.length) check(itemSchema, value[index], `${path}[${index}]`, root, out);
    });
    if (schema.items !== void 0) {
      for (let index = schema.prefixItems.length; index < value.length; index += 1) {
        check(schema.items, value[index], `${path}[${index}]`, root, out);
      }
    }
    return;
  }
  if (schema.items !== void 0) {
    value.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, root, out));
  }
}
function checkString(schema, value, path, out) {
  if (schema.minLength !== void 0 && value.length < schema.minLength) {
    out.push({ expected: `string length >= ${schema.minLength}`, got: `length ${value.length}`, path });
  }
  if (schema.maxLength !== void 0 && value.length > schema.maxLength) {
    out.push({ expected: `string length <= ${schema.maxLength}`, got: `length ${value.length}`, path });
  }
  if (schema.pattern !== void 0 && !new RegExp(schema.pattern).test(value)) {
    out.push({ expected: `match /${schema.pattern}/`, got: describeValue(value), path });
  }
}
function checkNumber(schema, value, path, out) {
  if (schema.type === "integer" && !Number.isInteger(value)) {
    out.push({ expected: "integer", got: `number ${value}`, path });
  }
  if (schema.minimum !== void 0 && value < schema.minimum) {
    out.push({ expected: `>= ${schema.minimum}`, got: `number ${value}`, path });
  }
  if (schema.maximum !== void 0 && value > schema.maximum) {
    out.push({ expected: `<= ${schema.maximum}`, got: `number ${value}`, path });
  }
  if (schema.exclusiveMinimum !== void 0 && value <= schema.exclusiveMinimum) {
    out.push({ expected: `> ${schema.exclusiveMinimum}`, got: `number ${value}`, path });
  }
  if (schema.exclusiveMaximum !== void 0 && value >= schema.exclusiveMaximum) {
    out.push({ expected: `< ${schema.exclusiveMaximum}`, got: `number ${value}`, path });
  }
}
function typeMatches(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => matchesOne(candidate, value));
}
function matchesOne(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
function typeName(type) {
  return Array.isArray(type) ? type.join(" | ") : type;
}
function resolveRef(root, ref) {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (match === null) return void 0;
  return root.$defs?.[match[1]];
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
    );
  }
  return false;
}
function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  switch (typeof value) {
    case "string": {
      const shown = value.length > 20 ? `${value.slice(0, 20)}\u2026` : value;
      return `string ${JSON.stringify(shown)}`;
    }
    case "number":
      return `number ${value}`;
    case "boolean":
      return `boolean ${value}`;
    case "object":
      return "object";
    case "undefined":
      return "undefined";
    default:
      return typeof value;
  }
}
export {
  formatViolation,
  formatViolations,
  validate
};
