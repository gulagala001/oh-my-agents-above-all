// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.
import { activeSessionMessages } from "../src/presets/zcode/session-material-adapter.mjs";
import { dedupeParts, formatPartForContext } from "../src/presets/zcode/session-material-adapter.mjs";
import { truncateText } from "../src/presets/zcode/session-material-adapter.mjs";
const DEFAULT_OUTPUT_CHAR_BUDGET = 24e3;
const MAX_OUTPUT_CHAR_BUDGET = 48e3;
const MAX_LITE_INPUT_CHARS = 8e4;
const MAX_LITE_CHUNKS = 5;
const MAX_CHUNK_CHARS = 28e3;
function buildSessionContextMaterial(input) {
  const outputCharBudget = clampOutputCharBudget(input.outputCharBudget);
  const activeMessages = activeSessionMessages(input.messages);
  const snippets = activeMessages.map((message, index) => formatMessageSnippet(message, index)).filter((snippet) => snippet !== null);
  const scoredSnippets = scoreSnippets(snippets, input.query);
  const allContent = formatSessionTranscript(input.session, scoredSnippets, {
    budgetChars: Number.POSITIVE_INFINITY,
    heading: "Cleaned transcript",
    query: input.query,
    strategy: input.strategy
  });
  const chunks = buildTranscriptChunks(scoredSnippets);
  const selectedChunks = selectChunks(chunks, input.strategy);
  const selectedSnippets = selectSnippets(scoredSnippets, input.strategy, outputCharBudget);
  const localContent = formatSessionTranscript(input.session, selectedSnippets, {
    budgetChars: outputCharBudget,
    heading: localHeading(input.strategy),
    query: input.query,
    strategy: input.strategy
  });
  return {
    allContent,
    allContentChars: allContent.length,
    chunks,
    localContent,
    messageCount: activeMessages.length,
    readableMessageCount: scoredSnippets.length,
    references: selectedSnippets.flatMap((snippet) => snippet.references),
    selectedChunks,
    selectedMessageCount: selectedSnippets.length,
    truncated: selectedSnippets.length < scoredSnippets.length || allContent.length > localContent.length || allContent.length > outputCharBudget
  };
}
function formatReadSessionContextModelContent(output) {
  if (output.status === "not_found") {
    return `Session ${output.sessionId} was not found.`;
  }
  if (output.status === "failed") {
    return [
      `ReadSessionContext failed for ${output.sessionId}.`,
      output.error ? `Error: ${output.error}` : void 0,
      output.content
    ].filter(Boolean).join("\n");
  }
  return [
    `ReadSessionContext returned ${output.source} context for ${output.sessionId}.`,
    output.title ? `Title: ${output.title}` : void 0,
    output.truncated ? "The returned context is truncated." : void 0,
    "",
    output.content
  ].filter(Boolean).join("\n");
}
function formatLocalSessionNotFound(input) {
  return {
    status: "not_found",
    sessionId: input.sessionId,
    strategy: input.strategy,
    query: input.query,
    source: "none",
    content: `No persisted session was found for ${input.sessionId}.`,
    messageCount: 0,
    selectedMessageCount: 0,
    truncated: false
  };
}
function outputCharBudgetFromMaxTokens(maxTokens) {
  if (maxTokens === void 0) return DEFAULT_OUTPUT_CHAR_BUDGET;
  return clampOutputCharBudget(maxTokens * 4);
}
function liteInputCharBudget() {
  return MAX_LITE_INPUT_CHARS;
}
function maxLiteChunks() {
  return MAX_LITE_CHUNKS;
}
function formatMessageSnippet(message, index) {
  if (message.info.role === "user" && message.info.visibility === "model-only") {
    return null;
  }
  const partTexts = dedupeParts(message.parts).map((part) => formatPartForContext(part)).filter((text) => Boolean(text?.trim()));
  if (partTexts.length === 0) return null;
  const role = message.info.role;
  const body = partTexts.join("\n\n");
  const content = [
    `[${index + 1}] ${role} ${message.info.id}`,
    `created: ${new Date(message.info.time.created).toISOString()}`,
    body
  ].join("\n");
  return {
    index,
    role,
    content,
    searchText: `${role}
${body}`.toLowerCase(),
    score: 0,
    references: [
      {
        messageId: message.info.id,
        index,
        role
      }
    ]
  };
}
function scoreSnippets(snippets, query) {
  const terms = tokenizeQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  return snippets.map((snippet) => ({
    ...snippet,
    score: scoreSearchText(snippet.searchText, normalizedQuery, terms) + snippet.index / 1e4
  }));
}
function tokenizeQuery(query) {
  const normalized = query.toLowerCase();
  const matches = normalized.match(/[a-z0-9_./-]+|[\p{Script=Han}]+/gu) ?? [];
  const terms = /* @__PURE__ */ new Set();
  for (const match of matches) {
    if (match.length < 2) continue;
    terms.add(match);
    if (/^[\p{Script=Han}]+$/u.test(match) && match.length > 2) {
      for (let index = 0; index < match.length - 1; index++) {
        terms.add(match.slice(index, index + 2));
      }
    }
  }
  return [...terms];
}
function scoreSearchText(searchText, normalizedQuery, terms) {
  let score = 0;
  if (normalizedQuery.length > 0 && searchText.includes(normalizedQuery)) {
    score += 20;
  }
  for (const term of terms) {
    if (!searchText.includes(term)) continue;
    score += 3 + Math.min(countOccurrences(searchText, term), 5);
  }
  return score;
}
function countOccurrences(text, term) {
  let count = 0;
  let offset = 0;
  while (true) {
    const found = text.indexOf(term, offset);
    if (found < 0) return count;
    count++;
    offset = found + term.length;
  }
}
function selectSnippets(snippets, strategy, budgetChars) {
  if (snippets.length === 0) return [];
  if (strategy === "handoff") {
    return selectTailWithinBudget(snippets, budgetChars);
  }
  const positives = snippets.filter((snippet) => snippet.score >= 3);
  const ranked = positives.length > 0 ? positives : snippets.slice(-12);
  const selected = [];
  let usedChars = 0;
  for (const snippet of [...ranked].sort((a, b) => b.score - a.score || b.index - a.index)) {
    if (usedChars > budgetChars) break;
    selected.push(snippet);
    usedChars += snippet.content.length;
  }
  return selected.sort((a, b) => a.index - b.index);
}
function selectTailWithinBudget(snippets, budgetChars) {
  const selected = [];
  let usedChars = 0;
  for (let index = snippets.length - 1; index >= 0; index--) {
    const snippet = snippets[index];
    if (selected.length > 0 && usedChars + snippet.content.length > budgetChars) break;
    selected.push(snippet);
    usedChars += snippet.content.length;
  }
  return selected.reverse();
}
function buildTranscriptChunks(snippets) {
  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const snippet of snippets) {
    if (current.length > 0 && currentChars + snippet.content.length > MAX_CHUNK_CHARS) {
      chunks.push(createChunk(chunks.length, current));
      current = [];
      currentChars = 0;
    }
    current.push(snippet);
    currentChars += snippet.content.length;
  }
  if (current.length > 0) {
    chunks.push(createChunk(chunks.length, current));
  }
  return chunks;
}
function createChunk(index, snippets) {
  const content = snippets.map((snippet) => snippet.content).join("\n\n---\n\n");
  return {
    index,
    startMessageIndex: snippets[0].index,
    endMessageIndex: snippets[snippets.length - 1].index,
    messageCount: snippets.length,
    content,
    searchText: snippets.map((snippet) => snippet.searchText).join("\n"),
    score: snippets.reduce((sum, snippet) => sum + snippet.score, 0),
    references: snippets.flatMap((snippet) => snippet.references)
  };
}
function selectChunks(chunks, strategy) {
  if (chunks.length <= MAX_LITE_CHUNKS) return chunks;
  if (strategy === "handoff") return chunks.slice(-MAX_LITE_CHUNKS);
  const byScore = [...chunks].sort((a, b) => b.score - a.score || b.index - a.index);
  const selected = /* @__PURE__ */ new Map();
  for (const chunk of byScore.slice(0, MAX_LITE_CHUNKS - 1)) {
    selected.set(chunk.index, chunk);
  }
  selected.set(chunks[chunks.length - 1].index, chunks[chunks.length - 1]);
  return [...selected.values()].sort((a, b) => a.index - b.index);
}
function formatSessionTranscript(session, snippets, options) {
  const header = [
    `# ${options.heading}`,
    `Session: ${session.title} (${session.id})`,
    `Directory: ${session.directory}`,
    session.path ? `Path: ${session.path}` : void 0,
    `Strategy: ${options.strategy}`,
    `Query: ${options.query}`,
    ""
  ].filter((line) => line !== void 0).join("\n");
  if (snippets.length === 0) {
    return `${header}No readable transcript content was found in the target session.`;
  }
  let remaining = Number.isFinite(options.budgetChars) ? Math.max(0, options.budgetChars - header.length) : Number.POSITIVE_INFINITY;
  const body = [];
  for (const snippet of snippets) {
    const separator = body.length > 0 ? "\n\n---\n\n" : "";
    const next = separator + snippet.content;
    if (Number.isFinite(remaining) && next.length > remaining) {
      if (remaining > 200) {
        body.push(truncateText(next, remaining));
      }
      break;
    }
    body.push(next);
    remaining -= next.length;
  }
  return `${header}${body.join("")}`;
}
function localHeading(strategy) {
  return strategy === "handoff" ? "Recent session handoff context" : "Relevant session context";
}
function clampOutputCharBudget(value) {
  if (value === void 0 || !Number.isFinite(value)) return DEFAULT_OUTPUT_CHAR_BUDGET;
  return Math.max(4e3, Math.min(MAX_OUTPUT_CHAR_BUDGET, Math.floor(value)));
}
export {
  buildSessionContextMaterial,
  formatLocalSessionNotFound,
  formatReadSessionContextModelContent,
  liteInputCharBudget,
  maxLiteChunks,
  outputCharBudgetFromMaxTokens
};
