// Derived from fixed ZCode 3.15.1 aac4755666d09fdcd70272fcf063c077a639015f (Apache-2.0). See THIRD_PARTY_NOTICES.md.

// src/presets/zcode/sources/upstream-3.15.1/packages/shared/src/subagent-profile-frontmatter.ts
function splitMarkdownFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/u, "");
  if (!normalized.startsWith("---")) {
    return { body: normalized };
  }
  const lines = normalized.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return { body: normalized };
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) return { body: normalized };
  return {
    frontmatter: lines.slice(1, endIndex).join("\n"),
    body: lines.slice(endIndex + 1).join("\n")
  };
}
function parseAgentFrontmatter(frontmatter) {
  const { bareValueKeys, invalidNestedListKeys, values } = parseLooseFrontmatter(frontmatter);
  if (bareValueKeys.has("tools")) {
    delete values.tools;
  }
  return {
    mcpServers: parseMcpServerNames(
      values.mcpServers,
      Object.prototype.hasOwnProperty.call(values, "mcpServers"),
      bareValueKeys.has("mcpServers"),
      invalidNestedListKeys.has("mcpServers")
    ),
    values
  };
}
function parseLooseFrontmatter(frontmatter) {
  const bareValueKeys = /* @__PURE__ */ new Set();
  const invalidNestedListKeys = /* @__PURE__ */ new Set();
  const values = {};
  const lines = frontmatter.split(/\r?\n/u);
  let pendingListKey;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const listMatch = line.match(/^\s*-\s+(.*)$/u);
    if (listMatch && pendingListKey) {
      bareValueKeys.delete(pendingListKey);
      const rawListItem = listMatch[1] ?? "";
      if (pendingListKey === "mcpServers" && isUnquotedMappingValue(rawListItem)) {
        invalidNestedListKeys.add(pendingListKey);
      }
      const existing = Array.isArray(values[pendingListKey]) ? values[pendingListKey] : [];
      values[pendingListKey] = [
        ...existing,
        pendingListKey === "mcpServers" ? parseMcpServerListItem(rawListItem) : parseScalarValue(rawListItem)
      ];
      continue;
    }
    if (pendingListKey && /^\s+/u.test(rawLine)) {
      invalidNestedListKeys.add(pendingListKey);
      pendingListKey = void 0;
      continue;
    }
    pendingListKey = void 0;
    const keyValue = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (!keyValue) continue;
    const key = keyValue[1];
    const rawValue = keyValue[2] ?? "";
    if (rawValue.trim() === "") {
      values[key] = [];
      bareValueKeys.add(key);
      pendingListKey = key;
      continue;
    }
    if (key === "mcpServers" && hasUnquotedInlineMappingItem(rawValue)) {
      invalidNestedListKeys.add(key);
    }
    values[key] = parseScalarValue(rawValue, key === "mcpServers");
  }
  return { bareValueKeys, invalidNestedListKeys, values };
}
function parseMcpServerNames(value, isConfigured, hasBareValue, hasInvalidNestedValue) {
  if (!isConfigured) return void 0;
  if (!Array.isArray(value) || hasBareValue || hasInvalidNestedValue) return null;
  const names = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const name = item.trim();
    if (name.length === 0) return null;
    names.push(name);
  }
  return names;
}
function hasUnquotedInlineMappingItem(rawValue) {
  const value = stripInlineComment(rawValue.trim());
  if (!value.startsWith("[") || !value.endsWith("]")) return false;
  return splitTopLevelList(value.slice(1, -1), true).some(isUnquotedMappingValue);
}
function isUnquotedMappingValue(rawValue) {
  const value = stripInlineComment(rawValue.trim());
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return false;
  }
  return value.startsWith("{") && value.endsWith("}") || /^[^:]+:(?:\s|$)/u.test(value);
}
function parseMcpServerListItem(rawValue) {
  const value = stripInlineComment(rawValue.trim());
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return unquoteScalar(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) return null;
  if (/^(?:null|~)$/iu.test(value)) return null;
  if (/^(?:true|false)$/iu.test(value)) return value.toLowerCase() === "true";
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
    return Number(value);
  }
  return value;
}
function parseScalarValue(rawValue, parseInlineItemScalars = false) {
  const value = stripInlineComment(rawValue.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/u.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitTopLevelList(
      value.slice(1, -1),
      parseInlineItemScalars,
      parseInlineItemScalars
    ).map(
      (item) => parseInlineItemScalars ? parseMcpServerListItem(item) : unquoteScalar(stripInlineComment(item.trim()))
    );
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return unquoteScalar(value);
}
function stripInlineComment(value) {
  let quote;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? void 0 : quote ?? char;
    }
    if (!quote && char === "#" && /\s/u.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}
function unquoteScalar(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function splitTopLevelList(value, trackContainerDepth = false, preserveEmptyItems = false) {
  const items = [];
  let current = "";
  let quote;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (const char of value) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (quote === char) {
      quote = void 0;
      current += char;
      continue;
    }
    if (!quote && char === "(") parenDepth += 1;
    if (!quote && char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (!quote && trackContainerDepth && char === "{") braceDepth += 1;
    if (!quote && trackContainerDepth && char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (!quote && trackContainerDepth && char === "[") bracketDepth += 1;
    if (!quote && trackContainerDepth && char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (!quote && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && char === ",") {
      if (current.trim() || preserveEmptyItems) items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

// src/presets/zcode/sources/upstream-3.15.1/packages/shared/src/custom-model-value.ts
var CUSTOM_MODEL_VALUE_PREFIX = "custom:";
function safeDecodeUriComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function decodeCustomModelValue(value) {
  if (!value.startsWith(CUSTOM_MODEL_VALUE_PREFIX)) {
    return null;
  }
  const body = value.slice(CUSTOM_MODEL_VALUE_PREFIX.length);
  const separatorIndex = body.indexOf(":");
  if (separatorIndex < 0) {
    return {
      providerId: safeDecodeUriComponent(body)
    };
  }
  const legacyParts = body.split(":");
  if (legacyParts.length >= 3 && legacyParts[0] === "builtin") {
    return {
      providerId: `${legacyParts[0]}:${legacyParts[1]}`,
      modelName: safeDecodeUriComponent(legacyParts.slice(2).join(":"))
    };
  }
  const encodedProviderId = body.slice(0, separatorIndex);
  const encodedModelName = body.slice(separatorIndex + 1);
  return {
    providerId: safeDecodeUriComponent(encodedProviderId),
    modelName: safeDecodeUriComponent(encodedModelName)
  };
}

// src/presets/zcode/sources/upstream-3.15.1/packages/shared/src/model-selection.ts
import { z } from "zod";
var modelSelectionSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  options: z.object({
    reasoningLevel: z.string().trim().min(1).optional()
  }).strict().optional()
}).strict();
var ZCODE_MODEL_REASONING_SEPARATOR = "$";
function parseModelPickerValue(value) {
  const normalized = value.trim();
  const providerSeparatorIndex = normalized.indexOf("/");
  if (providerSeparatorIndex <= 0) {
    throw new Error(`\u6A21\u578B\u9009\u62E9\u7F3A\u5C11 Provider: ${normalized}`);
  }
  const providerId = normalized.slice(0, providerSeparatorIndex);
  const rawModelId = normalized.slice(providerSeparatorIndex + 1);
  const reasoningSeparatorIndex = rawModelId.indexOf(ZCODE_MODEL_REASONING_SEPARATOR);
  if (reasoningSeparatorIndex <= 0 || reasoningSeparatorIndex >= rawModelId.length - 1) {
    return modelSelectionSchema.parse({ providerId, modelId: rawModelId });
  }
  return modelSelectionSchema.parse({
    providerId,
    modelId: rawModelId.slice(0, reasoningSeparatorIndex),
    options: { reasoningLevel: rawModelId.slice(reasoningSeparatorIndex + 1) }
  });
}

// src/presets/zcode/sources/upstream-3.15.1/packages/shared/src/subagent-markdown-selection.ts
var INHERIT_NAMES = /* @__PURE__ */ new Set(["inherit", "main", "sonnet", "opus", "haiku"]);
function parseSubagentMarkdownSelection(frontmatter) {
  if (typeof frontmatter.model !== "string") return void 0;
  const value = frontmatter.model.trim();
  if (!value || INHERIT_NAMES.has(value)) return void 0;
  let selection;
  const custom = decodeCustomModelValue(value);
  if (custom) {
    if (!custom.providerId.trim() || !custom.modelName?.trim()) return void 0;
    selection = { providerId: custom.providerId.trim(), modelId: custom.modelName.trim() };
  } else {
    try {
      selection = parseModelPickerValue(value);
    } catch {
      return void 0;
    }
  }
  const reasoningLevel = typeof frontmatter.thoughtLevel === "string" ? frontmatter.thoughtLevel.trim() : "";
  return reasoningLevel ? { ...selection, options: { reasoningLevel } } : selection;
}

// src/presets/zcode/sources/upstream-3.15.1/packages/shared/src/subagent-profile-parser.ts
var VALID_COLORS = /* @__PURE__ */ new Set([
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan"
]);
var VALID_PERMISSION_MODES = /* @__PURE__ */ new Set([
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan"
]);
var VALID_MEMORY_SCOPES = /* @__PURE__ */ new Set(["user", "project", "local"]);
function parseAgentProfileFromMarkdown(input) {
  const parsed = splitMarkdownFrontmatter(input.content);
  if (!parsed.frontmatter) {
    return {
      diagnostic: {
        code: "agent_missing_frontmatter",
        message: `Agent Markdown must include frontmatter: ${input.path ?? "<inline>"}`,
        path: input.path
      }
    };
  }
  const { mcpServers, values: frontmatter } = parseAgentFrontmatter(parsed.frontmatter);
  const name = scalarString(frontmatter.name);
  const description = scalarString(frontmatter.description)?.replace(/\\n/gu, "\n");
  if (!name) {
    return missingRequiredDiagnostic("name", input.path);
  }
  if (!description) {
    return missingRequiredDiagnostic("description", input.path);
  }
  const modelSelection = parseSubagentMarkdownSelection(frontmatter);
  const color = normalizeColor(scalarString(frontmatter.color));
  const parsedPermissionMode = normalizePermissionMode(scalarString(frontmatter.permissionMode));
  const permissionMode = input.source === "project" ? void 0 : parsedPermissionMode;
  const maxTurns = normalizePositiveInteger(frontmatter.maxTurns);
  const memory = parseAgentMemoryScope(frontmatter.memory);
  const memoryDiagnostic = frontmatter.memory !== void 0 && memory === void 0 ? {
    code: "agent_invalid_memory_scope",
    message: `Agent frontmatter memory must be user, project, or local: ${input.path ?? "<inline>"}`,
    path: input.path
  } : void 0;
  if (mcpServers === null) {
    return {
      diagnostic: {
        code: "agent_invalid_mcp_servers",
        message: `Agent frontmatter mcpServers must be a list of parent server names: ${input.path ?? "<inline>"}`,
        path: input.path
      }
    };
  }
  return {
    ...memoryDiagnostic ? { diagnostic: memoryDiagnostic } : {},
    profile: {
      name,
      description,
      source: input.source,
      systemPrompt: parsed.body.trim(),
      ...input.path ? { path: input.path } : {},
      ...modelSelection ? { modelSelection } : {},
      ...color ? { color } : {},
      ...permissionMode ? { permissionMode } : {},
      ...maxTurns ? { maxTurns } : {},
      ...memory ? { memory } : {},
      ...optionalList("tools", frontmatter.tools),
      ...optionalList("disallowedTools", frontmatter.disallowedTools),
      ...optionalList("skills", frontmatter.skills),
      ...optionalBoolean("background", frontmatter.background),
      ...optionalBoolean("injectAgentsMd", frontmatter.injectAgentsMd),
      ...mcpServers === void 0 ? {} : { mcpServers }
    }
  };
}
function parseAgentMemoryScope(value) {
  return typeof value === "string" && VALID_MEMORY_SCOPES.has(value) ? value : void 0;
}
function missingRequiredDiagnostic(field, path) {
  return {
    diagnostic: {
      code: "agent_missing_required_frontmatter",
      message: `Agent frontmatter must include ${field}: ${path ?? "<inline>"}`,
      path
    }
  };
}
function parseToolList(value) {
  if (Array.isArray(value)) {
    return normalizeToolNames(normalizeStringList(value));
  }
  if (typeof value !== "string") return void 0;
  const result = [];
  let current = "";
  let parenDepth = 0;
  for (const char of value) {
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (parenDepth === 0 && (char === "," || /\s/u.test(char))) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return normalizeToolNames(result);
}
function optionalList(key, value) {
  const list = key === "skills" ? normalizeStringList(value) : parseToolList(value);
  if (list && list.length > 0) return { [key]: list };
  if (key === "tools" && Array.isArray(value)) {
    return { tools: [] };
  }
  return {};
}
function optionalBoolean(key, value) {
  if (typeof value === "boolean") return { [key]: value };
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return { [key]: true };
    if (value.toLowerCase() === "false") return { [key]: false };
  }
  return {};
}
function normalizeStringList(value) {
  if (Array.isArray(value)) {
    const list2 = value.filter(
      (item) => typeof item === "string" && item.length > 0
    );
    return list2.length > 0 ? list2 : void 0;
  }
  if (typeof value !== "string") return void 0;
  const list = value.split(/[,\s]+/u).map((item) => item.trim()).filter(Boolean);
  return list.length > 0 ? list : void 0;
}
function scalarString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeColor(value) {
  if (!value) return void 0;
  return VALID_COLORS.has(value) ? value : void 0;
}
function normalizePermissionMode(value) {
  if (!value) return void 0;
  return VALID_PERMISSION_MODES.has(value) ? value : void 0;
}
function normalizePositiveInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/u.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : void 0;
  }
  return void 0;
}
function normalizeToolNames(values) {
  if (!values) return void 0;
  const names = values.map(toolNameFromSpec).filter((item) => item.length > 0);
  return names.length > 0 ? names : void 0;
}
function toolNameFromSpec(value) {
  const trimmed = value.trim();
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex < 0) return trimmed;
  return trimmed.slice(0, parenIndex).trim();
}
export {
  parseAgentProfileFromMarkdown
};
