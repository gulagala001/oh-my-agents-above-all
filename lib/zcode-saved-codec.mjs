// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { SavedWorkflowMetaSchema } from "./zcode-saved-contract.mjs";
const SAVED_WORKFLOW_SENTINEL = "/* zcode-workflow";
const SAVED_WORKFLOW_TERMINATOR = "*/";
function serializeSavedWorkflow(meta, script) {
  const body = { description: meta.description };
  if (meta.whenToUse !== void 0) body.whenToUse = meta.whenToUse;
  if (meta.args !== void 0) body.args = meta.args;
  return `${SAVED_WORKFLOW_SENTINEL}
${stringifyYaml(body)}${SAVED_WORKFLOW_TERMINATOR}
${script}`;
}
function parseSavedWorkflow(source) {
  const lines = source.split("\n");
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  if (start >= lines.length || lines[start].trim() !== SAVED_WORKFLOW_SENTINEL) {
    return {
      ok: false,
      reason: "missing_frontmatter",
      detail: `file does not start with the \`${SAVED_WORKFLOW_SENTINEL}\` metadata block`
    };
  }
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== SAVED_WORKFLOW_TERMINATOR) end += 1;
  if (end >= lines.length) {
    return {
      ok: false,
      reason: "unterminated_frontmatter",
      detail: `metadata block is never closed with \`${SAVED_WORKFLOW_TERMINATOR}\``
    };
  }
  const bodyText = lines.slice(start + 1, end).join("\n");
  const script = lines.slice(end + 1).join("\n");
  let body;
  try {
    body = parseYaml(bodyText);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_yaml",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
  const parsed = SavedWorkflowMetaSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_metadata",
      detail: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
    };
  }
  return { ok: true, meta: parsed.data, script, bodyLineOffset: end + 1 };
}
export {
  SAVED_WORKFLOW_SENTINEL,
  parseSavedWorkflow,
  serializeSavedWorkflow
};
