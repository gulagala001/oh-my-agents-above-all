// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.
import { z } from "zod";
const SAVED_WORKFLOW_FILE_EXTENSION = ".dwf.ts";
const SAVED_WORKFLOW_PROJECT_DIR = ".zcode/workflows";
const WORKFLOW_DRAFTS_DIR = ".zcode/workflow-drafts";
const SAVED_WORKFLOW_GLOBAL_DIR = ".zcode/workflows";
const SAVED_WORKFLOW_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const SAVED_WORKFLOW_MAX_NAME_CHARS = 64;
const SAVED_WORKFLOW_SCOPES = ["project", "global"];
const SavedWorkflowScopeSchema = z.enum(SAVED_WORKFLOW_SCOPES);
const SAVED_WORKFLOW_SHADOWING = ["hides_global", "hidden_by_project"];
const SavedWorkflowShadowingSchema = z.enum(SAVED_WORKFLOW_SHADOWING);
const SAVED_WORKFLOW_ARG_TYPES = ["string", "number", "boolean", "json"];
const SavedWorkflowArgTypeSchema = z.enum(SAVED_WORKFLOW_ARG_TYPES);
const SavedWorkflowArgDeclarationSchema = z.object({
  type: SavedWorkflowArgTypeSchema.describe(
    'Value type. "json" accepts any JSON value without further checking.'
  ),
  description: z.string().optional().describe("What this argument means, for whoever calls the workflow later."),
  required: z.boolean().optional().describe("When true the workflow cannot run without this argument."),
  // `default` 刻意是 unknown 而不是按 `type` 判别的联合：默认值的类型正确性由
  // validateWorkflowArgs 在**应用默认值之后**与传入值走同一条校验，一处规则而不是两处。
  default: z.unknown().optional().describe("Value used when the caller omits this argument.")
}).strict();
const SavedWorkflowArgsDeclarationSchema = z.record(z.string(), SavedWorkflowArgDeclarationSchema);
const SavedWorkflowMetaSchema = z.object({
  description: z.string().min(1),
  whenToUse: z.string().min(1).optional(),
  args: SavedWorkflowArgsDeclarationSchema.optional()
}).strict();
const SavedWorkflowEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  args: SavedWorkflowArgsDeclarationSchema.optional(),
  scope: SavedWorkflowScopeSchema,
  path: z.string().min(1)
}).strict();
const SavedWorkflowInvalidEntrySchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1)
}).strict();
function isValidSavedWorkflowName(name) {
  if (name.length === 0 || name.length > SAVED_WORKFLOW_MAX_NAME_CHARS) return false;
  if (!SAVED_WORKFLOW_NAME_PATTERN.test(name)) return false;
  return name.replaceAll(".", "").length > 0;
}
export {
  SAVED_WORKFLOW_ARG_TYPES,
  SAVED_WORKFLOW_FILE_EXTENSION,
  SAVED_WORKFLOW_GLOBAL_DIR,
  SAVED_WORKFLOW_MAX_NAME_CHARS,
  SAVED_WORKFLOW_NAME_PATTERN,
  SAVED_WORKFLOW_PROJECT_DIR,
  SAVED_WORKFLOW_SCOPES,
  SAVED_WORKFLOW_SHADOWING,
  SavedWorkflowArgDeclarationSchema,
  SavedWorkflowArgTypeSchema,
  SavedWorkflowArgsDeclarationSchema,
  SavedWorkflowEntrySchema,
  SavedWorkflowInvalidEntrySchema,
  SavedWorkflowMetaSchema,
  SavedWorkflowScopeSchema,
  SavedWorkflowShadowingSchema,
  WORKFLOW_DRAFTS_DIR,
  isValidSavedWorkflowName
};
