// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.
import { basename, dirname, extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { createFileSystemError } from "./zcode-fs-contracts.mjs";
const DEFAULT_GREP_HEAD_LIMIT = 250;
const VCS_DIRECTORIES_TO_EXCLUDE = /* @__PURE__ */ new Set([".git", ".svn", ".hg", ".bzr", ".jj", ".sl"]);
function createRipgrepSearchPlan(path, rootInfo, request, mode) {
  const outputRoot = rootInfo.isDirectory() ? path : dirname(path);
  const target = rootInfo.isDirectory() ? "." : basename(path);
  const args = [
    "--no-config",
    "--hidden",
    "--color",
    "never",
    "--no-heading",
    "--with-filename",
    "--max-columns",
    "500"
  ];
  for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
    args.push("--glob", `!${dir}`, "--glob", `!**/${dir}/**`);
  }
  if (request.multiline) {
    args.push("-U", "--multiline-dotall");
  }
  if (request.ignoreCase) {
    args.push("-i");
  }
  if (mode === "content") {
    args.push("--json");
    if (request.onlyMatching) {
      args.push("--only-matching");
    }
    addRipgrepContextArgs(args, request);
  } else {
    args.push("-c");
  }
  if (request.glob) {
    addRipgrepGlobArgs(args, request.glob);
  }
  if (request.type) {
    addRipgrepTypeArgs(args, request.type);
  }
  args.push("-e", request.pattern.trim(), "--", target);
  return {
    args,
    outputRoot,
    preopens: { ".": outputRoot }
  };
}
function addRipgrepContextArgs(args, request) {
  if (request.context !== void 0) {
    args.push("-C", String(request.context));
    return;
  }
  if (request.beforeContext !== void 0) {
    args.push("-B", String(request.beforeContext));
  }
  if (request.afterContext !== void 0) {
    args.push("-A", String(request.afterContext));
  }
}
function addRipgrepGlobArgs(args, glob) {
  for (const pattern of splitRipgrepGlobPatterns(glob)) {
    args.push("--glob", pattern);
  }
}
function splitRipgrepGlobPatterns(glob) {
  const patterns = [];
  for (const rawPattern of glob.split(/\s+/)) {
    if (rawPattern.includes("{") && rawPattern.includes("}")) {
      patterns.push(rawPattern);
      continue;
    }
    patterns.push(...rawPattern.split(","));
  }
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
}
function addRipgrepTypeArgs(args, type) {
  for (const pattern of fileTypeGlobPatterns(type)) {
    args.push("--glob", pattern);
  }
}
function fileTypeGlobPatterns(type) {
  const normalized = normalizeFileType(type);
  if (!/^[a-z0-9_+-]+$/i.test(normalized)) return [];
  const extensions = TYPE_EXTENSION_MAP[normalized] ?? [`.${normalized}`];
  return extensions.flatMap((extension) => [`*${extension}`, `**/*${extension}`]);
}
function normalizeFileType(type) {
  return type.toLowerCase().replace(/^\./, "");
}
function parseRipgrepJsonOutput(stdout, outputRoot, request) {
  const entries = [];
  const files = /* @__PURE__ */ new Set();
  const shouldKeep = createTextResultFilter(outputRoot, request);
  let numMatches = 0;
  for (const line of splitOutputLines(stdout)) {
    const event = parseRipgrepJsonEvent(line, request.path);
    if (event.type !== "match" && event.type !== "context") continue;
    const rawPath = event.data?.path?.text;
    if (!rawPath) continue;
    const path = resolveRipgrepOutputPath(outputRoot, rawPath);
    if (!shouldKeep(path)) continue;
    const matched = event.type === "match";
    if (matched) {
      files.add(path);
      numMatches += 1;
    }
    if (request.onlyMatching && matched) {
      const submatches = event.data?.submatches ?? [];
      if (submatches.length > 0) {
        const lineNumber = typeof event.data?.line_number === "number" ? event.data.line_number : void 0;
        for (const submatch of submatches) {
          entries.push(...createOnlyMatchingEntries({
            path,
            text: submatch.match?.text ?? "",
            lineNumber
          }));
        }
        continue;
      }
    }
    entries.push({
      path,
      lineNumber: typeof event.data?.line_number === "number" ? event.data.line_number : void 0,
      text: stripTrailingLineEnding(event.data?.lines?.text ?? ""),
      matched
    });
  }
  return { entries, files: [...files], numMatches };
}
function parseRipgrepCountOutput(stdout, outputRoot, request) {
  const entries = [];
  const files = /* @__PURE__ */ new Set();
  const shouldKeep = createTextResultFilter(outputRoot, request);
  let numMatches = 0;
  for (const line of splitOutputLines(stdout)) {
    const separatorIndex = line.lastIndexOf(":");
    if (separatorIndex <= 0) continue;
    const rawPath = line.slice(0, separatorIndex);
    const count = Number.parseInt(line.slice(separatorIndex + 1), 10);
    if (!Number.isFinite(count) || count <= 0) continue;
    const path = resolveRipgrepOutputPath(outputRoot, rawPath);
    if (!shouldKeep(path)) continue;
    files.add(path);
    numMatches += count;
    entries.push({ path, count });
  }
  return { entries, files: [...files], numMatches };
}
function finishTextSearchResult(params) {
  if (params.mode === "files_with_matches") {
    const limited2 = applyHeadLimit(params.files, params.request.headLimit, params.request.offset);
    return {
      path: params.path,
      pattern: params.pattern,
      mode: params.mode,
      durationMs: Math.max(0, Date.now() - params.startedAt),
      files: limited2.items,
      entries: [],
      numMatches: params.numMatches,
      truncated: limited2.truncated,
      appliedLimit: limited2.appliedLimit,
      appliedOffset: limited2.appliedOffset
    };
  }
  const limited = applyHeadLimit(params.entries, params.request.headLimit, params.request.offset);
  return {
    path: params.path,
    pattern: params.pattern,
    mode: params.mode,
    durationMs: Math.max(0, Date.now() - params.startedAt),
    files: params.files,
    entries: limited.items,
    numMatches: params.numMatches,
    truncated: limited.truncated,
    appliedLimit: limited.appliedLimit,
    appliedOffset: limited.appliedOffset
  };
}
function splitOutputLines(stdout) {
  return stdout.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}
function parseRipgrepJsonEvent(line, path) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw createFileSystemError({
      code: "io_error",
      path,
      message: "Failed to parse ripgrep JSON output",
      cause: error
    });
  }
}
function createTextResultFilter(root, request) {
  const globMatcher = request.glob ? createGlobMatcher(request.glob) : void 0;
  return (path) => {
    const relativePath = toPosixRelative(root, path);
    if (globMatcher && !globMatcher(relativePath, basename(path))) return false;
    if (request.type && !matchesFileType(path, request.type)) return false;
    return true;
  };
}
function resolveRipgrepOutputPath(root, rawPath) {
  if (isAbsolute(rawPath)) return normalize(rawPath);
  const withoutLeadingDot = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
  return normalize(join(root, withoutLeadingDot));
}
function stripTrailingLineEnding(value) {
  return value.replace(/\r?\n$/, "");
}
function toRipgrepFileSystemError(stderr, path, pattern) {
  const message = stderr.trim() || `ripgrep failed while searching ${path}`;
  const normalized = message.toLowerCase();
  if (normalized.includes("regex parse error") || normalized.includes("error parsing regex") || normalized.includes("unclosed")) {
    return createFileSystemError({
      code: "invalid_pattern",
      path,
      message: `Invalid grep regular expression: ${pattern}`
    });
  }
  if (normalized.includes("permission denied") || normalized.includes("os error 13")) {
    return createFileSystemError({
      code: "permission_denied",
      path,
      message
    });
  }
  if (normalized.includes("no such file") || normalized.includes("os error 2")) {
    return createFileSystemError({
      code: "not_found",
      path,
      message
    });
  }
  return createFileSystemError({
    code: "io_error",
    path,
    message
  });
}
function compileSearchRegex(pattern, request) {
  try {
    const flags = `${request.ignoreCase ? "i" : ""}${request.multiline ? "s" : ""}`;
    return new RegExp(pattern, flags);
  } catch (error) {
    throw createFileSystemError({
      code: "invalid_pattern",
      path: request.path,
      message: `Invalid grep regular expression: ${pattern}`,
      cause: error
    });
  }
}
function createOnlyMatchingEntries(input) {
  if (input.text.length === 0) {
    return [
      {
        path: input.path,
        lineNumber: input.lineNumber,
        text: "",
        matched: true
      }
    ];
  }
  return input.text.split(/\r?\n/).flatMap(
    (line, index) => line.length === 0 ? [] : [
      {
        path: input.path,
        lineNumber: input.lineNumber === void 0 ? void 0 : input.lineNumber + index,
        text: line,
        matched: true
      }
    ]
  );
}
function createGlobMatcher(pattern) {
  const normalized = normalizeGlobPattern(pattern);
  const regex = globPatternToRegExp(normalized);
  const basenameRegex = normalized.includes("/") ? void 0 : globPatternToRegExp(normalized);
  return (relativePath, fileName) => regex.test(relativePath) || (basenameRegex ? basenameRegex.test(fileName) : false);
}
function normalizeGlobPattern(pattern) {
  return pattern.replaceAll("\\", "/").replace(/^\.\//, "");
}
function globPatternToRegExp(pattern) {
  let regex = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        const afterNext = pattern[index + 2];
        if (afterNext === "/") {
          regex += "(?:.*/)?";
          index += 2;
        } else {
          regex += ".*";
          index += 1;
        }
      } else {
        regex += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      regex += "[^/]";
      continue;
    }
    if (char === "{") {
      const end = pattern.indexOf("}", index + 1);
      if (end > index) {
        const alternatives = pattern.slice(index + 1, end).split(",").map(escapeRegExp).join("|");
        regex += `(?:${alternatives})`;
        index = end;
        continue;
      }
    }
    regex += escapeRegExp(char ?? "");
  }
  regex += "$";
  try {
    return new RegExp(regex);
  } catch (error) {
    throw createFileSystemError({
      code: "invalid_pattern",
      message: `Invalid glob pattern: ${pattern}`,
      cause: error
    });
  }
}
function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
function toPosixRelative(root, filePath) {
  return relative(root, filePath).split(sep).join("/");
}
function applyHeadLimit(items, headLimit, offset = 0) {
  if (headLimit === 0) {
    return {
      items: items.slice(offset),
      appliedOffset: offset > 0 ? offset : void 0,
      truncated: false
    };
  }
  const effectiveLimit = headLimit ?? DEFAULT_GREP_HEAD_LIMIT;
  const sliced = items.slice(offset, offset + effectiveLimit);
  const truncated = items.length - offset > effectiveLimit;
  return {
    items: sliced,
    appliedLimit: truncated ? effectiveLimit : void 0,
    appliedOffset: offset > 0 ? offset : void 0,
    truncated
  };
}
function matchesFileType(path, type) {
  const normalized = type.toLowerCase().replace(/^\./, "");
  const extension = extname(path).toLowerCase();
  const known = TYPE_EXTENSION_MAP[normalized];
  if (known) {
    return known.includes(extension);
  }
  return extension === `.${normalized}`;
}
const TYPE_EXTENSION_MAP = {
  c: [".c", ".h"],
  cpp: [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"],
  csharp: [".cs"],
  css: [".css"],
  go: [".go"],
  html: [".html", ".htm"],
  java: [".java"],
  js: [".js", ".jsx", ".mjs", ".cjs"],
  json: [".json", ".jsonc"],
  markdown: [".md", ".markdown"],
  md: [".md", ".markdown"],
  py: [".py"],
  python: [".py"],
  rs: [".rs"],
  rust: [".rs"],
  sh: [".sh", ".bash", ".zsh"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  tsx: [".tsx"],
  txt: [".txt"],
  yaml: [".yaml", ".yml"]
};
export * from "./zcode-text-metadata.mjs";
export {
  DEFAULT_GREP_HEAD_LIMIT,
  TYPE_EXTENSION_MAP,
  VCS_DIRECTORIES_TO_EXCLUDE,
  addRipgrepContextArgs,
  addRipgrepGlobArgs,
  addRipgrepTypeArgs,
  applyHeadLimit,
  compileSearchRegex,
  createGlobMatcher,
  createOnlyMatchingEntries,
  createRipgrepSearchPlan,
  createTextResultFilter,
  escapeRegExp,
  fileTypeGlobPatterns,
  finishTextSearchResult,
  globPatternToRegExp,
  matchesFileType,
  normalizeFileType,
  normalizeGlobPattern,
  parseRipgrepCountOutput,
  parseRipgrepJsonEvent,
  parseRipgrepJsonOutput,
  resolveRipgrepOutputPath,
  splitOutputLines,
  splitRipgrepGlobPatterns,
  stripTrailingLineEnding,
  toPosixRelative,
  toRipgrepFileSystemError
};
