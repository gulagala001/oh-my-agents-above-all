// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.
import {
  isAbsolute as isAbsolutePath,
  relative as relativePath,
  resolve as resolvePath,
  sep
} from "node:path";
import { WORLD_READ_CAPS, WorkflowError } from "./zcode-world-shared.mjs";
import {
  GIT_SHOW_PREFIX_ARGV,
  GIT_STATUS_ARGV,
  gitChangedFilesPlan,
  gitDiffArgv,
  gitLogArgv,
  parseGitLog,
  parseGitPathList,
  parseGitShowPrefix,
  parseGitStatusPorcelainV2
} from "./zcode-git-world-read.mjs";
async function executeWorldRead(deps, op, args) {
  switch (op) {
    case "glob":
      return await worldGlob(deps, worldReadStringArgs(op, args, ["pattern"])[0]);
    case "read":
      return await worldRead(deps, worldReadStringArgs(op, args, ["path"])[0]);
    case "grep": {
      const [pattern, glob] = worldReadOptionalStringArgs(op, args, ["pattern"], ["glob"]);
      return await worldGrep(deps, pattern, glob);
    }
    case "git-changed-files": {
      const [base] = worldReadOptionalStringArgs(op, args, [], ["base"]);
      return await gitChangedFiles(deps, base);
    }
    case "git-diff": {
      const [base, path] = worldReadOptionalStringArgs(op, args, [], ["base", "path"]);
      return await gitDiff(deps, base, path);
    }
    case "git-status": {
      worldReadStringArgs(op, args, []);
      return await gitStatus(deps);
    }
    case "git-log":
      return await gitLog(deps, worldReadOptionalCount(op, args, "count"));
    case "run":
      return await worldRun(deps, args);
    default: {
      const unknownOp = op;
      throw new WorkflowError("DriverError", `Unsupported world-read op "${String(unknownOp)}".`);
    }
  }
}
async function worldGlob(deps, pattern) {
  const cap = WORLD_READ_CAPS.globMaxFiles;
  const result = await deps.fileSystemPort.searchFiles({
    path: deps.cwd,
    pattern,
    maxResults: cap + 1
  });
  if (result.files.length > cap || result.truncated) {
    throw capExceeded(`files.glob: over ${cap} files match (the cap). Narrow the pattern.`);
  }
  return result.files.map((path) => toWorkspaceRelative(deps.cwd, path)).sort();
}
async function worldRead(deps, arg) {
  const path = assertWithinWorkspace("read", deps.cwd, arg);
  const result = await deps.fileSystemPort.readTextFile({ path });
  return result.content;
}
async function worldGrep(deps, pattern, glob) {
  const cap = WORLD_READ_CAPS.grepMaxMatches;
  const result = await deps.fileSystemPort.searchText({
    path: deps.cwd,
    pattern,
    ...glob === void 0 ? {} : { glob },
    outputMode: "content",
    showLineNumbers: true,
    headLimit: cap + 1
  });
  if (result.entries.length > cap || result.truncated) {
    throw capExceeded(
      `files.grep: over ${cap} matches (the cap). Narrow the pattern or add a glob.`
    );
  }
  const matches = [];
  for (const entry of result.entries) {
    if (entry.lineNumber === void 0 || entry.text === void 0) continue;
    matches.push({
      path: toWorkspaceRelative(deps.cwd, entry.path),
      line: entry.lineNumber,
      text: entry.text
    });
  }
  const serializedBytes = Buffer.byteLength(JSON.stringify(matches), "utf8");
  if (serializedBytes > WORLD_READ_CAPS.grepMaxSerializedBytes) {
    throw capExceeded(
      `files.grep: result is ${serializedBytes} bytes, over the ${WORLD_READ_CAPS.grepMaxSerializedBytes}-byte cap. Narrow the pattern or add a glob.`
    );
  }
  return matches;
}
async function runGit(deps, op, argv, maxInlineBytes) {
  const result = await deps.executionPort.run({
    command: { mode: "argv", file: "git", args: [...argv] },
    cwd: deps.cwd,
    outputLimit: { maxInlineBytes }
  });
  if (result.status !== "completed" || (result.exitCode ?? 0) !== 0) {
    const detail = firstLine(result.stderr.text) || firstLine(result.stdout.text) || result.status;
    throw new WorkflowError(
      "DriverError",
      `git ${argv.join(" ")} failed (${result.status}, exit=${result.exitCode ?? "n/a"}): ${detail}`
    );
  }
  return {
    text: result.stdout.text,
    bytes: result.stdout.bytes,
    truncated: result.stdout.truncated
  };
}
async function gitWorkspacePrefix(deps, op) {
  const out = await runGit(deps, op, GIT_SHOW_PREFIX_ARGV, GIT_TEXT_OUTPUT_BYTES);
  return parseGitShowPrefix(out.text);
}
async function gitChangedFiles(deps, base) {
  const plans = gitChangedFilesPlan(base);
  const prefix = await gitWorkspacePrefix(deps, "git-changed-files");
  const paths = [];
  for (const plan of plans) {
    const out = await runGit(deps, "git-changed-files", plan.argv, GIT_TEXT_OUTPUT_BYTES);
    paths.push(...parseGitPathList(out.text, prefix));
  }
  return [...new Set(paths)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
async function gitDiff(deps, base, path) {
  const cap = WORLD_READ_CAPS.gitDiffMaxBytes;
  const out = await runGit(deps, "git-diff", gitDiffArgv(base, path), cap + 1);
  if (out.bytes > cap || out.truncated) {
    throw capExceeded(
      `git.diff: output is ${out.bytes} bytes, over the ${cap}-byte cap. Pass a path to narrow.`
    );
  }
  return out.text;
}
async function gitStatus(deps) {
  const prefix = await gitWorkspacePrefix(deps, "git-status");
  const out = await runGit(deps, "git-status", GIT_STATUS_ARGV, GIT_TEXT_OUTPUT_BYTES);
  return parseGitStatusPorcelainV2(out.text, prefix);
}
async function gitLog(deps, count) {
  const out = await runGit(deps, "git-log", gitLogArgv(count), GIT_TEXT_OUTPUT_BYTES);
  return parseGitLog(out.text);
}
async function worldRun(deps, args) {
  const { argv, cmd, timeoutMs } = worldRunArgs(args);
  const declared = deps.declaredRunCommands;
  if (declared === void 0 || !declared.has(cmd)) {
    throw new WorkflowError(
      "DriverError",
      `world.run: command '${cmd}' is not in the declared set of commands (a wiring error).`
    );
  }
  const stdoutCap = WORLD_READ_CAPS.runStdoutMaxBytes;
  const stderrCap = WORLD_READ_CAPS.runStderrMaxBytes;
  const result = await deps.executionPort.run({
    command: { mode: "argv", file: cmd, args: argv },
    cwd: deps.cwd,
    timeoutMs,
    outputLimit: { maxInlineBytes: Math.max(stdoutCap, stderrCap) + 1 }
  });
  if (result.status === "timed_out") {
    throw new WorkflowError(
      "DriverError",
      `world.run '${cmd}' timed out after ${timeoutMs}ms. Raise opts.timeoutMs or narrow the work.`
    );
  }
  const ranToExit = result.status === "completed" || result.status === "failed" && result.error === void 0 && typeof result.exitCode === "number";
  if (!ranToExit) {
    const detail = result.error?.message ?? (firstLine(result.stderr.text) || result.status);
    throw new WorkflowError(
      "DriverError",
      `world.run '${cmd}' did not run to completion (${result.status}): ${detail}`
    );
  }
  if (result.stdout.bytes > stdoutCap || result.stdout.truncated) {
    throw capExceeded(
      `world.run '${cmd}': stdout is ${result.stdout.bytes} bytes, over the ${stdoutCap}-byte cap. Quiet the output (e.g. --quiet), or write a file and files.read a summary.`
    );
  }
  if (result.stderr.bytes > stderrCap || result.stderr.truncated) {
    throw capExceeded(
      `world.run '${cmd}': stderr is ${result.stderr.bytes} bytes, over the ${stderrCap}-byte cap. Reduce the diagnostics, or write a file and files.read a summary.`
    );
  }
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout.text,
    stderr: result.stderr.text
  };
}
function worldRunArgs(args) {
  if (args.length < 1 || args.length > 3) {
    throw new WorkflowError(
      "DriverError",
      `world.run takes 1 to 3 arguments (cmd, args?, opts?), got ${args.length}.`
    );
  }
  const cmd = requireStringArg("run", args[0], "cmd", 0);
  const rawArgv = args[1];
  let argv = [];
  if (rawArgv !== void 0) {
    if (!Array.isArray(rawArgv)) {
      throw new WorkflowError(
        "DriverError",
        `world.run: argument 2 (args) must be an array of strings, got ${describeArg(rawArgv)}.`
      );
    }
    argv = rawArgv.map((item, index) => {
      if (typeof item !== "string") {
        throw new WorkflowError(
          "DriverError",
          `world.run: args[${index}] must be a string, got ${describeArg(item)}. Stringify values.`
        );
      }
      return item;
    });
  }
  const rawOpts = args[2];
  let timeoutMs = WORLD_READ_CAPS.runDefaultTimeoutMs;
  if (rawOpts !== void 0) {
    if (typeof rawOpts !== "object" || rawOpts === null || Array.isArray(rawOpts)) {
      throw new WorkflowError(
        "DriverError",
        `world.run: arg 3 (opts) must be an options object or omitted, got ${describeArg(rawOpts)}.`
      );
    }
    const rawTimeout = rawOpts.timeoutMs;
    if (rawTimeout !== void 0) {
      if (typeof rawTimeout !== "number" || !Number.isInteger(rawTimeout) || rawTimeout < 1) {
        throw new WorkflowError(
          "DriverError",
          `world.run: opts.timeoutMs must be an integer >= 1, got ${describeArg(rawTimeout)}.`
        );
      }
      timeoutMs = rawTimeout;
    }
  }
  return { argv, cmd, timeoutMs };
}
function worldReadStringArgs(op, args, names) {
  if (args.length !== names.length) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op} takes ${names.length} arguments (${names.join(", ")}), got ${args.length}.`
    );
  }
  return names.map((name, index) => requireStringArg(op, args[index], name, index));
}
function worldReadOptionalStringArgs(op, args, required, optional) {
  const max = required.length + optional.length;
  if (args.length < required.length || args.length > max) {
    const range = required.length === max ? `${max}` : `${required.length}~${max}`;
    throw new WorkflowError(
      "DriverError",
      `world-read ${op} takes ${range} arguments (${[...required, ...optional.map((n) => `${n}?`)].join(", ")}), got ${args.length}.`
    );
  }
  const out = [];
  required.forEach((name, index) => out.push(requireStringArg(op, args[index], name, index)));
  optional.forEach((name, offset) => {
    const index = required.length + offset;
    if (index >= args.length) {
      out.push(void 0);
      return;
    }
    const value = args[index];
    if (value === void 0) {
      out.push(void 0);
      return;
    }
    out.push(requireStringArg(op, value, name, index));
  });
  return out;
}
function worldReadOptionalCount(op, args, name) {
  const max = WORLD_READ_CAPS.gitLogMaxCount;
  if (args.length > 1) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op} takes at most 1 argument (${name}?), got ${args.length}.`
    );
  }
  const raw = args[0];
  if (raw === void 0) return WORLD_READ_CAPS.gitLogDefaultCount;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: argument '${name}' must be an integer >= 1, got ${describeArg(raw)}.`
    );
  }
  if (raw > max) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: argument '${name}'=${raw} is over the cap of ${max}; pass at most ${max}.`
    );
  }
  return raw;
}
function requireStringArg(op, value, name, index) {
  if (typeof value !== "string") {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: arg ${index + 1} (${name}) must be a string, got ${describeArg(value)}.`
    );
  }
  return value;
}
function capExceeded(message) {
  return new WorkflowError("WorldReadCapExceeded", message);
}
function resolveWithinWorkspace(cwd, arg) {
  const resolved = resolvePath(cwd, arg);
  const rel = relativePath(cwd, resolved);
  const escapes = rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("../");
  return escapes || isAbsolutePath(rel) ? void 0 : resolved;
}
function assertWithinWorkspace(op, cwd, arg) {
  const resolved = resolveWithinWorkspace(cwd, arg);
  if (resolved === void 0) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: path '${arg}' is outside the workspace; pass a path inside it.`
    );
  }
  return resolved;
}
function toWorkspaceRelative(cwd, path) {
  const rel = resolvePath(cwd, path) === path ? relativePath(cwd, path) : path;
  return rel.replace(/\\/g, "/");
}
function firstLine(text) {
  return text.split("\n", 1)[0]?.trim() ?? "";
}
const GIT_TEXT_OUTPUT_BYTES = 4 * 1024 * 1024;
function describeArg(value) {
  if (value === void 0) return "undefined";
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}
export {
  executeWorldRead,
  resolveWithinWorkspace,
  toWorkspaceRelative
};
