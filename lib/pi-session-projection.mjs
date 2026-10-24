// Derived from the pinned Pi session-manager.ts and messages.ts.
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

// src/presets/pi/sources/packages/coding-agent/src/core/messages.ts
var COMPACTION_SUMMARY_PREFIX = `The conversation history before this point was compacted into the following summary:

<summary>
`;
var COMPACTION_SUMMARY_SUFFIX = `
</summary>`;
var BRANCH_SUMMARY_PREFIX = `The following is a summary of a branch that this conversation came back from:

<summary>
`;
var BRANCH_SUMMARY_SUFFIX = `</summary>`;
function bashExecutionToText(msg) {
  let text = `Ran \`${msg.command}\`
`;
  if (msg.output) {
    text += `\`\`\`
${msg.output}
\`\`\``;
  } else {
    text += "(no output)";
  }
  if (msg.cancelled) {
    text += "\n\n(command cancelled)";
  } else if (msg.exitCode !== null && msg.exitCode !== void 0 && msg.exitCode !== 0) {
    text += `

Command exited with code ${msg.exitCode}`;
  }
  if (msg.truncated && msg.fullOutputPath) {
    text += `

[Output truncated. Full output: ${msg.fullOutputPath}]`;
  }
  return text;
}
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
function convertToLlm(messages) {
  return messages.map((m) => {
    switch (m.role) {
      case "bashExecution":
        if (m.excludeFromContext) {
          return void 0;
        }
        return {
          role: "user",
          content: [{ type: "text", text: bashExecutionToText(m) }],
          timestamp: m.timestamp
        };
      case "custom": {
        const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
        return {
          role: "user",
          content,
          timestamp: m.timestamp
        };
      }
      case "branchSummary":
        return {
          role: "user",
          content: [{ type: "text", text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX }],
          timestamp: m.timestamp
        };
      case "compactionSummary":
        return {
          role: "user",
          content: [
            { type: "text", text: COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX }
          ],
          timestamp: m.timestamp
        };
      case "system":
      case "user":
      case "assistant":
      case "toolResult":
        return m;
      default:
        const _exhaustiveCheck = m;
        return void 0;
    }
  }).filter((m) => m !== void 0);
}

// <stdin>
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
var PiReadonlyTree = class {
  constructor(entries, leafId) {
    this.fileEntries = entries;
    this.leafId = leafId;
    this.byId = new Map(entries.map((entry) => [entry.id, entry]));
    this.labelsById = new Map(entries.filter((entry) => entry.label).map((entry) => [entry.id, entry.label]));
    this.labelTimestampsById = /* @__PURE__ */ new Map();
  }
  getTree() {
    const entries = this.getEntries();
    const nodeMap = /* @__PURE__ */ new Map();
    const roots = [];
    for (const entry of entries) {
      const label = this.labelsById.get(entry.id);
      const labelTimestamp = this.labelTimestampsById.get(entry.id);
      nodeMap.set(entry.id, { entry, children: [], label, labelTimestamp });
    }
    for (const entry of entries) {
      const node = nodeMap.get(entry.id);
      if (entry.parentId === null || entry.parentId === entry.id) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(entry.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }
    const stack = [...roots];
    while (stack.length > 0) {
      const node = stack.pop();
      node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
      stack.push(...node.children);
    }
    return roots;
  }
  getEntries() {
    return this.fileEntries.filter((e) => e.type !== "session");
  }
  getBranch(fromId) {
    const path = [];
    const startId = fromId ?? this.leafId;
    let current = startId ? this.byId.get(startId) : void 0;
    while (current) {
      path.push(current);
      current = current.parentId ? this.byId.get(current.parentId) : void 0;
    }
    path.reverse();
    return path;
  }
  getEntry(id) {
    return this.byId.get(id);
  }
  getLeafId() {
    return this.leafId;
  }
  getLeafEntry() {
    return this.leafId ? this.byId.get(this.leafId) : void 0;
  }
  getChildren(parentId) {
    const children = [];
    for (const entry of this.byId.values()) {
      if (entry.parentId === parentId) {
        children.push(entry);
      }
    }
    return children;
  }
  getLabel(id) {
    return this.labelsById.get(id);
  }
};
export {
  PiReadonlyTree,
  buildContextEntries,
  buildSessionProjection,
  convertToLlm,
  createBranchSummaryMessage,
  createCompactionSummaryMessage,
  createCustomMessage,
  sessionEntryToContextMessages
};
