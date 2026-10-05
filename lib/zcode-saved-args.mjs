// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.
function validateWorkflowArgs(declaration, provided) {
  const declared = declaration ?? {};
  const given = provided ?? {};
  const errors = [];
  const args = {};
  const declaredNames = Object.keys(declared);
  for (const key of Object.keys(given)) {
    if (declared[key] !== void 0) continue;
    errors.push(
      declaredNames.length === 0 ? `unknown argument '${key}': this workflow declares no arguments` : `unknown argument '${key}' (declared: ${declaredNames.join(", ")})`
    );
  }
  for (const [key, spec] of Object.entries(declared)) {
    const supplied = given[key];
    if (supplied === void 0) {
      if (spec.default !== void 0) {
        const failure2 = typeMismatch(key, spec, spec.default, "default value");
        if (failure2 === void 0) args[key] = spec.default;
        else errors.push(failure2);
        continue;
      }
      if (spec.required === true) errors.push(`missing required argument '${key}'`);
      continue;
    }
    const failure = typeMismatch(key, spec, supplied, "value");
    if (failure === void 0) args[key] = supplied;
    else errors.push(failure);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, args };
}
function typeMismatch(key, spec, value, what) {
  const describe = (expected) => `argument '${key}': expected ${expected}, got ${describeValue(value)} (${what})`;
  switch (spec.type) {
    case "string":
      return typeof value === "string" ? void 0 : describe("a string");
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? void 0 : describe("a finite number");
    case "boolean":
      return typeof value === "boolean" ? void 0 : describe("a boolean");
    case "json":
      return void 0;
  }
}
function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
export {
  validateWorkflowArgs
};
