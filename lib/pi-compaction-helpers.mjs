// Pure functions from the pinned Pi compaction sources.
/*
MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// lib/pi-session-projection.mjs
function createBranchSummaryMessage(summary, fromId, timestamp) {
  return {
    role: "branchSummary",
    summary,
    fromId,
    timestamp: new Date(timestamp).getTime()
  };
}
function createCompactionSummaryMessage(summary, tokensBefore, timestamp) {
  return {
    role: "compactionSummary",
    summary,
    tokensBefore,
    timestamp: new Date(timestamp).getTime()
  };
}
function createCustomMessage(customType, content, display, details, timestamp) {
  return {
    role: "custom",
    customType,
    content,
    display,
    details,
    timestamp: new Date(timestamp).getTime()
  };
}
function buildEntryIndex(entries, byId) {
  if (byId) return byId;
  const index = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    index.set(entry.id, entry);
  }
  return index;
}
function buildSessionPath(entries, leafId, byId) {
  const index = buildEntryIndex(entries, byId);
  let leaf;
  if (leafId === null) {
    return [];
  }
  if (leafId) {
    leaf = index.get(leafId);
  }
  leaf ??= entries[entries.length - 1];
  if (!leaf) {
    return [];
  }
  const path = [];
  let current = leaf;
  while (current) {
    path.push(current);
    current = current.parentId ? index.get(current.parentId) : void 0;
  }
  path.reverse();
  return path;
}
function getSessionContextSettings(path) {
  let thinkingLevel = "off";
  let model = null;
  for (const entry of path) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel;
    } else if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      model = { provider: entry.message.provider, modelId: entry.message.model };
    }
  }
  return { thinkingLevel, model };
}
function sessionEntryToContextMessages(entry) {
  if (entry.type === "message") {
    const message = entry.message;
    if (message.role === "system" && message.content == null) return [{ ...message, content: "" }];
    if ((message.role === "user" || message.role === "assistant" || message.role === "toolResult") && message.content == null) {
      return [{ ...message, content: [] }];
    }
    return [message];
  }
  if (entry.type === "custom_message") {
    return [
      createCustomMessage(entry.customType, entry.content ?? [], entry.display, entry.details, entry.timestamp)
    ];
  }
  if (entry.type === "branch_summary" && entry.summary) {
    return [createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp)];
  }
  if (entry.type === "compaction") {
    const summary = createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
    return entry.systemMessage ? [entry.systemMessage, summary] : [summary];
  }
  return [];
}
function buildContextEntries(entries, leafId, byId) {
  const path = buildSessionPath(entries, leafId, byId);
  let compaction = null;
  for (const entry of path) {
    if (entry.type === "compaction") {
      compaction = entry;
    }
  }
  if (!compaction) {
    return path;
  }
  const compactionIdx = path.findIndex((entry) => entry.id === compaction.id);
  if (compactionIdx < 0) {
    return path;
  }
  const contextEntries = [compaction];
  let foundFirstKept = false;
  for (let i = 0; i < compactionIdx; i++) {
    const entry = path[i];
    if (entry.id === compaction.firstKeptEntryId) {
      foundFirstKept = true;
    }
    if (foundFirstKept && !(entry.type === "message" && entry.message.role === "system")) {
      contextEntries.push(entry);
    }
  }
  contextEntries.push(...path.slice(compactionIdx + 1));
  return contextEntries;
}
function projectContextEntry(entry, edit) {
  const messages = sessionEntryToContextMessages(entry);
  if (!edit) return messages;
  const replacement = edit.replacement;
  if (replacement === null) return [];
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "toolResult" && message.role !== "custom") {
      return message;
    }
    const content = (message.role === "assistant" || message.role === "toolResult") && typeof replacement.content === "string" ? [{ type: "text", text: replacement.content }] : replacement.content;
    return { ...message, content };
  });
}
function buildSessionProjection(entries, leafId, byId) {
  const path = buildSessionPath(entries, leafId, byId);
  const { thinkingLevel, model } = getSessionContextSettings(path);
  const contextEntries = buildContextEntries(entries, leafId, byId);
  const edits = /* @__PURE__ */ new Map();
  for (const entry of contextEntries) {
    if (entry.type === "context_edit") edits.set(entry.targetId, entry);
  }
  const projectedEntries = contextEntries.map(
    (sourceEntry, index) => ({
      sourceEntry,
      // buildContextEntries() may retain an older compaction entry because its
      // raw ID lies inside the newest retained range. Only the newest compaction
      // at index zero contributes a checkpoint and summary.
      messages: sourceEntry.type === "compaction" && index > 0 ? [] : projectContextEntry(sourceEntry, edits.get(sourceEntry.id))
    })
  );
  return {
    entries: projectedEntries,
    messages: projectedEntries.flatMap((entry) => entry.messages),
    thinkingLevel,
    model
  };
}

// src/presets/pi/sources/npm-pi-ai/utils/text.js
function contentText(content, separator = "\n") {
  if (typeof content === "string")
    return content;
  return content.filter((block) => block.type === "text").map((block) => block.text).join(separator);
}

// lib/pi-context-helpers.mjs
function contentText2(content, separator = "\n") {
  if (typeof content === "string")
    return content;
  return content.filter((block) => block.type === "text").map((block) => block.text).join(separator);
}
function isSystemMessage(message) {
  return message.role === "system";
}
function getCurrentTools(messages) {
  const tools = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (!isSystemMessage(message))
      continue;
    for (const tool of message.toolsRemoved ?? [])
      tools.delete(tool.name);
    for (const tool of message.toolsAdded ?? [])
      tools.set(tool.name, tool);
  }
  return [...tools.values()];
}
function getCurrentSystemMessage(messages) {
  const content = [];
  const sections = /* @__PURE__ */ new Map();
  let timestamp;
  for (const message of messages) {
    if (!isSystemMessage(message))
      continue;
    timestamp ??= message.timestamp;
    const text = contentText2(message.content);
    if (text.length > 0)
      content.push(text);
    for (const [name, value] of Object.entries(message.sections ?? {})) {
      if (value === null)
        sections.delete(name);
      else
        sections.set(name, value);
    }
  }
  const tools = getCurrentTools(messages);
  if (timestamp === void 0 && tools.length === 0)
    return void 0;
  return {
    role: "system",
    content: content.join("\n\n"),
    ...sections.size > 0 ? { sections: Object.fromEntries(sections) } : {},
    ...tools.length > 0 ? { toolsAdded: tools } : {},
    timestamp: timestamp ?? 0
  };
}

// pi-pure:pi-pure-utils
function createFileOps() {
  return {
    read: /* @__PURE__ */ new Set(),
    written: /* @__PURE__ */ new Set(),
    edited: /* @__PURE__ */ new Set()
  };
}
function extractFileOpsFromMessage(message, fileOps) {
  if (message.role === "toolResult") {
    for (const call of message.nestedCalls?.calls ?? []) addFileOp(call.name, call.arguments, fileOps);
    return;
  }
  if (message.role !== "assistant") return;
  if (!("content" in message) || !Array.isArray(message.content)) return;
  for (const block of message.content) {
    if (typeof block !== "object" || block === null) continue;
    if (!("type" in block) || block.type !== "toolCall") continue;
    if (!("arguments" in block) || !("name" in block)) continue;
    addFileOp(block.name, block.arguments, fileOps);
  }
}
function addFileOp(toolName, args, fileOps) {
  const path = typeof args?.path === "string" ? args.path : void 0;
  if (!path) return;
  switch (toolName) {
    case "read":
      fileOps.read.add(path);
      break;
    case "write":
      fileOps.written.add(path);
      break;
    case "edit":
      fileOps.edited.add(path);
      break;
  }
}
function computeFileLists2(fileOps) {
  const modified = /* @__PURE__ */ new Set([...fileOps.edited, ...fileOps.written]);
  const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles: readOnly, modifiedFiles };
}
function formatFileOperations2(readFiles, modifiedFiles) {
  const sections = [];
  if (readFiles.length > 0) {
    sections.push(`<read-files>
${readFiles.join("\n")}
</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>
${modifiedFiles.join("\n")}
</modified-files>`);
  }
  if (sections.length === 0) return "";
  return `

${sections.join("\n\n")}`;
}
var TOOL_RESULT_MAX_CHARS = 2e3;
function truncateForSummary(text, maxChars) {
  if (text.length <= maxChars) return text;
  const truncatedChars = text.length - maxChars;
  return `${text.slice(0, maxChars)}

[... ${truncatedChars} more characters truncated]`;
}
function serializeConversation2(messages) {
  const parts = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      const content = contentText(msg.content, "");
      if (content) parts.push(`[User]: ${content}`);
    } else if (msg.role === "assistant") {
      const thinkingParts = [];
      const toolCalls = [];
      for (const block of msg.content) {
        if (block.type === "thinking") {
          thinkingParts.push(block.thinking);
        } else if (block.type === "toolCall") {
          const args = block.arguments;
          const argsStr = Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
          toolCalls.push(`${block.name}(${argsStr})`);
        }
      }
      if (thinkingParts.length > 0) {
        parts.push(`[Assistant thinking]: ${thinkingParts.join("\n")}`);
      }
      if (msg.content.some((block) => block.type === "text")) {
        parts.push(`[Assistant]: ${contentText(msg.content)}`);
      }
      if (toolCalls.length > 0) {
        parts.push(`[Assistant tool calls]: ${toolCalls.join("; ")}`);
      }
    } else if (msg.role === "toolResult") {
      const content = contentText(msg.content, "");
      if (content) {
        parts.push(`[Tool result]: ${truncateForSummary(content, TOOL_RESULT_MAX_CHARS)}`);
      }
    }
  }
  return parts.join("\n\n");
}
var SUMMARIZATION_SYSTEM_PROMPT2 = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

// pi-pure:pi-pure-compaction
function extractFileOperations(messages, entries, prevCompactionIndex) {
  const fileOps = createFileOps();
  if (prevCompactionIndex >= 0) {
    const prevCompaction = entries[prevCompactionIndex];
    if (!prevCompaction.fromHook && prevCompaction.details) {
      const details = prevCompaction.details;
      if (Array.isArray(details.readFiles)) {
        for (const f of details.readFiles) fileOps.read.add(f);
      }
      if (Array.isArray(details.modifiedFiles)) {
        for (const f of details.modifiedFiles) fileOps.edited.add(f);
      }
    }
  }
  for (const msg of messages) {
    extractFileOpsFromMessage(msg, fileOps);
  }
  return fileOps;
}
function getMessagesFromProjectedEntryForCompaction(entry) {
  if (entry.sourceEntry.type === "compaction") return [];
  return entry.messages.filter((message) => message.role !== "system");
}
function calculateContextTokens(usage) {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
function getAssistantUsage(msg) {
  if (msg.role === "assistant" && "usage" in msg) {
    const assistantMsg = msg;
    if (assistantMsg.stopReason !== "aborted" && assistantMsg.stopReason !== "error" && assistantMsg.usage && calculateContextTokens(assistantMsg.usage) > 0) {
      return assistantMsg.usage;
    }
  }
  return void 0;
}
function getLastAssistantUsageInfo(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = getAssistantUsage(messages[i]);
    if (usage) return { usage, index: i };
  }
  return void 0;
}
function estimateContextTokens(messages) {
  const usageInfo = getLastAssistantUsageInfo(messages);
  if (!usageInfo) {
    let estimated = 0;
    for (const message of messages) {
      estimated += estimateTokens(message);
    }
    return {
      tokens: estimated,
      usageTokens: 0,
      trailingTokens: estimated,
      lastUsageIndex: null
    };
  }
  const usageTokens = calculateContextTokens(usageInfo.usage);
  let trailingTokens = 0;
  for (let i = usageInfo.index + 1; i < messages.length; i++) {
    trailingTokens += estimateTokens(messages[i]);
  }
  return {
    tokens: usageTokens + trailingTokens,
    usageTokens,
    trailingTokens,
    lastUsageIndex: usageInfo.index
  };
}
function estimateProjectedContextTokens(projection, branchEntries) {
  const estimate = estimateContextTokens(projection.messages);
  if (estimate.lastUsageIndex !== null) {
    let projectedMessageIndex = 0;
    let usageEntryId;
    for (const entry of projection.entries) {
      const nextMessageIndex = projectedMessageIndex + entry.messages.length;
      if (estimate.lastUsageIndex < nextMessageIndex) {
        usageEntryId = entry.sourceEntry.id;
        break;
      }
      projectedMessageIndex = nextMessageIndex;
    }
    const usageEntryIndex = usageEntryId ? branchEntries.findIndex((entry) => entry.id === usageEntryId) : -1;
    let latestInvalidatingEntryIndex = -1;
    for (let i = branchEntries.length - 1; i >= 0; i--) {
      const entry = branchEntries[i];
      if (entry.type === "context_edit" || entry.type === "compaction") {
        latestInvalidatingEntryIndex = i;
        break;
      }
    }
    if (usageEntryIndex > latestInvalidatingEntryIndex) return estimate;
  }
  const currentSystem = getCurrentSystemMessage(projection.messages);
  let tokens = currentSystem ? estimateTokens(currentSystem) : 0;
  for (const message of projection.messages) {
    if (message.role !== "system") tokens += estimateTokens(message);
  }
  return { tokens, usageTokens: 0, trailingTokens: tokens, lastUsageIndex: null };
}
var ESTIMATED_IMAGE_CHARS = 4800;
function estimateTextAndImageContentChars(content) {
  if (typeof content === "string") {
    return content.length;
  }
  let chars = 0;
  for (const block of content) {
    if (block.type === "text" && block.text) {
      chars += block.text.length;
    } else if (block.type === "image") {
      chars += ESTIMATED_IMAGE_CHARS;
    }
  }
  return chars;
}
function estimateTokens(message) {
  let chars = 0;
  switch (message.role) {
    case "system": {
      const system = message;
      chars = estimateTextAndImageContentChars(system.content);
      if (system.sections) {
        for (const section of Object.values(system.sections)) {
          if (section) chars += section.length;
        }
      }
      if (system.toolsAdded) chars += JSON.stringify(system.toolsAdded).length;
      return Math.ceil(chars / 4);
    }
    case "user": {
      chars = estimateTextAndImageContentChars(
        message.content
      );
      return Math.ceil(chars / 4);
    }
    case "assistant": {
      const assistant = message;
      for (const block of assistant.content) {
        if (block.type === "text") {
          chars += block.text.length;
        } else if (block.type === "thinking") {
          chars += block.thinking.length;
        } else if (block.type === "toolCall") {
          chars += block.name.length + JSON.stringify(block.arguments).length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case "custom":
    case "toolResult": {
      chars = estimateTextAndImageContentChars(message.content);
      return Math.ceil(chars / 4);
    }
    case "bashExecution": {
      chars = message.command.length + message.output.length;
      return Math.ceil(chars / 4);
    }
    case "branchSummary":
    case "compactionSummary": {
      chars = message.summary.length;
      return Math.ceil(chars / 4);
    }
  }
  return 0;
}
function isCutPointMessage(message) {
  switch (message.role) {
    case "user":
    case "assistant":
    case "bashExecution":
    case "custom":
    case "branchSummary":
    case "compactionSummary":
      return true;
    case "toolResult":
      return false;
  }
  return false;
}
function isTurnStartMessage(message) {
  switch (message.role) {
    case "user":
    case "bashExecution":
    case "custom":
    case "branchSummary":
    case "compactionSummary":
      return true;
    case "assistant":
    case "toolResult":
      return false;
  }
  return false;
}
var SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;
var UPDATE_SUMMARIZATION_INSTRUCTIONS = `Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;
var UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

${UPDATE_SUMMARIZATION_INSTRUCTIONS}`;
function isProjectedTurnStart(entry) {
  if (entry.sourceEntry.type === "compaction") return false;
  return entry.messages.some(isTurnStartMessage);
}
function findProjectedTurnStartIndex(entries, entryIndex, startIndex) {
  for (let i = entryIndex; i >= startIndex; i--) {
    if (isProjectedTurnStart(entries[i])) return i;
  }
  return -1;
}
function findProjectedCutPoint(entries, startIndex, endIndex, keepRecentTokens) {
  const cutPoints = [];
  for (let i = startIndex; i < endIndex; i++) {
    const entry = entries[i];
    if (entry.sourceEntry.type !== "compaction" && entry.messages.some(isCutPointMessage)) cutPoints.push(i);
  }
  if (cutPoints.length === 0) {
    return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
  }
  let accumulatedTokens = 0;
  let exceededBudget = false;
  let cutIndex = cutPoints[0];
  for (let i = endIndex - 1; i >= startIndex; i--) {
    const messageTokens = entries[i].messages.reduce((sum, message) => sum + estimateTokens(message), 0);
    if (messageTokens === 0) continue;
    accumulatedTokens += messageTokens;
    if (accumulatedTokens >= keepRecentTokens) {
      exceededBudget = true;
      cutIndex = cutPoints.find((candidate) => candidate >= i) ?? cutPoints[cutPoints.length - 1];
      break;
    }
  }
  const suffix = entries.slice(cutIndex + 1, endIndex);
  const isIntrinsicallyVisible = (entry) => entry.sourceEntry.type !== "context_edit" && sessionEntryToContextMessages(entry.sourceEntry).length > 0;
  const isOmitted = (entry) => isIntrinsicallyVisible(entry) && entry.messages.length === 0;
  const omittedSuffixIds = new Set(suffix.filter(isOmitted).map((entry) => entry.sourceEntry.id));
  const hasExternalReplacement = suffix.some(
    (entry) => entry.sourceEntry.type === "context_edit" && entry.sourceEntry.replacement !== null && !omittedSuffixIds.has(entry.sourceEntry.targetId)
  );
  const isRecoveryOmissionSuffix = exceededBudget && !hasExternalReplacement && suffix.some(
    (entry) => entry.sourceEntry.type === "message" && entry.sourceEntry.message.role === "assistant" && isOmitted(entry)
  ) && suffix.every(
    (entry) => entry.sourceEntry.type !== "compaction" && (!isIntrinsicallyVisible(entry) || isOmitted(entry))
  );
  if (isRecoveryOmissionSuffix) cutIndex++;
  while (cutIndex > startIndex) {
    const previous = entries[cutIndex - 1];
    if (previous.sourceEntry.type === "compaction" || previous.messages.length > 0) break;
    cutIndex--;
  }
  const startsTurn = isProjectedTurnStart(entries[cutIndex]);
  const turnStartIndex = startsTurn ? -1 : findProjectedTurnStartIndex(entries, cutIndex, startIndex);
  return {
    firstKeptEntryIndex: cutIndex,
    turnStartIndex,
    isSplitTurn: !startsTurn && turnStartIndex !== -1
  };
}
function prepareCompaction(pathEntries, settings) {
  if (pathEntries.length > 0 && pathEntries[pathEntries.length - 1].type === "compaction") {
    return void 0;
  }
  const projection = buildSessionProjection(pathEntries);
  const projectedEntries = projection.entries;
  const sourceEntries = projectedEntries.map((entry) => entry.sourceEntry);
  const prevCompactionIndex = projectedEntries.findIndex(
    (entry) => entry.sourceEntry.type === "compaction" && entry.messages.length > 0
  );
  let previousSummary;
  let boundaryStart = 0;
  if (prevCompactionIndex >= 0) {
    previousSummary = projectedEntries[prevCompactionIndex].sourceEntry.summary;
    boundaryStart = prevCompactionIndex + 1;
  }
  const boundaryEnd = projectedEntries.length;
  const tokensBefore = estimateProjectedContextTokens(projection, pathEntries).tokens;
  const cutPoint = findProjectedCutPoint(projectedEntries, boundaryStart, boundaryEnd, settings.keepRecentTokens);
  const firstKeptEntry = projectedEntries[cutPoint.firstKeptEntryIndex]?.sourceEntry;
  if (!firstKeptEntry?.id) return void 0;
  const firstKeptEntryId = firstKeptEntry.id;
  const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
  const messagesToSummarize = projectedEntries.slice(boundaryStart, historyEnd).flatMap(getMessagesFromProjectedEntryForCompaction);
  const turnPrefixMessages = cutPoint.isSplitTurn ? projectedEntries.slice(cutPoint.turnStartIndex, cutPoint.firstKeptEntryIndex).flatMap(getMessagesFromProjectedEntryForCompaction) : [];
  if (messagesToSummarize.length === 0 && turnPrefixMessages.length === 0) return void 0;
  const fileOps = extractFileOperations(messagesToSummarize, sourceEntries, prevCompactionIndex);
  if (cutPoint.isSplitTurn) {
    for (const msg of turnPrefixMessages) {
      extractFileOpsFromMessage(msg, fileOps);
    }
  }
  return {
    firstKeptEntryId,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn: cutPoint.isSplitTurn,
    tokensBefore,
    previousSummary,
    fileOps,
    settings
  };
}
var TURN_PREFIX_SUMMARIZATION_PROMPT = `The messages above are earlier context from an ongoing conversation. Later messages are stored separately and do not need to be reconstructed.

Create a concise checkpoint of the user's request and the progress shown above. This checkpoint will be placed before the later messages so the conversation can continue with the necessary context.

## Original Request
[What did the user ask for?]

## Progress So Far
- [Key decisions and work completed in these messages]

## Context Needed to Continue
- [Information from these messages needed to understand the later work]

Only summarize information explicitly present above. Do not infer or recreate later messages.`;

// pi-pure:pi-pure-branch
function collectEntriesForBranchSummary(session, oldLeafId, targetId) {
  if (!oldLeafId) {
    return { entries: [], commonAncestorId: null };
  }
  const oldPath = new Set(session.getBranch(oldLeafId).map((e) => e.id));
  const targetPath = session.getBranch(targetId);
  let commonAncestorId = null;
  for (let i = targetPath.length - 1; i >= 0; i--) {
    if (oldPath.has(targetPath[i].id)) {
      commonAncestorId = targetPath[i].id;
      break;
    }
  }
  const entries = [];
  let current = oldLeafId;
  while (current && current !== commonAncestorId) {
    const entry = session.getEntry(current);
    if (!entry) break;
    entries.push(entry);
    current = entry.parentId;
  }
  entries.reverse();
  return { entries, commonAncestorId };
}
function getMessageFromEntry(entry) {
  switch (entry.type) {
    case "message":
      if (entry.message.role === "toolResult") return void 0;
      return entry.message;
    case "custom_message":
      return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);
    case "branch_summary":
      return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);
    case "compaction":
      return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
    // These don't contribute to conversation content
    case "thinking_level_change":
    case "model_change":
    case "custom":
    case "label":
    case "session_info":
      return void 0;
  }
}
function prepareBranchEntries(entries, tokenBudget = 0) {
  const messages = [];
  const fileOps = createFileOps();
  let totalTokens = 0;
  for (const entry of entries) {
    if (entry.type === "branch_summary" && !entry.fromHook && entry.details) {
      const details = entry.details;
      if (Array.isArray(details.readFiles)) {
        for (const f of details.readFiles) fileOps.read.add(f);
      }
      if (Array.isArray(details.modifiedFiles)) {
        for (const f of details.modifiedFiles) {
          fileOps.edited.add(f);
        }
      }
    }
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const message = getMessageFromEntry(entry);
    if (!message) continue;
    extractFileOpsFromMessage(message, fileOps);
    const tokens = estimateTokens(message);
    if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
      if (entry.type === "compaction" || entry.type === "branch_summary") {
        if (totalTokens < tokenBudget * 0.9) {
          messages.unshift(message);
          totalTokens += tokens;
        }
      }
      break;
    }
    messages.unshift(message);
    totalTokens += tokens;
  }
  return { messages, fileOps, totalTokens };
}
var BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;
var BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;
export {
  BRANCH_SUMMARY_PREAMBLE,
  BRANCH_SUMMARY_PROMPT,
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT2 as SUMMARIZATION_SYSTEM_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  collectEntriesForBranchSummary,
  computeFileLists2 as computeFileLists,
  createFileOps,
  estimateContextTokens,
  estimateTokens,
  extractFileOpsFromMessage,
  formatFileOperations2 as formatFileOperations,
  prepareBranchEntries,
  prepareCompaction,
  serializeConversation2 as serializeConversation
};
