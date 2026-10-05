// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.
import { WorkflowError } from "./zcode-world-shared.mjs";
const GIT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@^~-]*$/;
const GIT_LOG_PRETTY = "--pretty=format:%H%x00%s%x00%an%x00%aI";
const GIT_SHOW_PREFIX_ARGV = ["rev-parse", "--show-prefix"];
const GIT_STATUS_ARGV = [
  "status",
  "--porcelain=v2",
  "-z",
  "--branch",
  "--",
  "."
];
const GIT_UNTRACKED_ARGV = [
  "ls-files",
  "--others",
  "--exclude-standard",
  "-z",
  "--full-name",
  "--",
  "."
];
const WORKSPACE_PATHSPEC = ".";
function validateGitRef(op, value) {
  if (value.length === 0) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: base must not be empty. Pass a ref such as "main" or omit it.`
    );
  }
  if (value.startsWith("-")) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: base '${value}' starts with '-', which git would read as an option, not a ref. Pass a plain ref.`
    );
  }
  if (value.includes("..")) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: base '${value}' is a '..' range; only a single ref is accepted. Pass one ref.`
    );
  }
  if (!GIT_REF_PATTERN.test(value)) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: base '${value}' is not a valid ref. A ref starts with a letter or digit, followed by letters, digits and . _ / @ ^ ~ - (no whitespace or syntax characters such as {} :).`
    );
  }
  return value;
}
function validateGitPath(op, value) {
  if (value.length === 0) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: path must not be empty. Pass a workspace-relative path or omit it.`
    );
  }
  if (value.startsWith("-")) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: path '${value}' starts with '-', which git could read as an option. Pass a path that does not start with '-'.`
    );
  }
  if (looksAbsolute(value)) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: path '${value}' is absolute; only workspace-relative paths are accepted. Pass the path relative to the workspace root.`
    );
  }
  const normalized = value.replace(/\\/g, "/");
  if (normalized.split("/").includes("..")) {
    throw new WorkflowError(
      "DriverError",
      `world-read ${op}: path '${value}' contains a '..' segment and would leave the workspace. Pass a path inside the workspace.`
    );
  }
  return normalized;
}
function looksAbsolute(value) {
  return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]?/.test(value);
}
function gitChangedFilesPlan(base) {
  const ref = base === void 0 ? "HEAD" : validateGitRef("git-changed-files", base);
  const tracked = {
    argv: ["diff", "--name-only", "-z", ref, "--", WORKSPACE_PATHSPEC]
  };
  if (base !== void 0) return [tracked];
  return [tracked, { argv: [...GIT_UNTRACKED_ARGV] }];
}
function gitDiffArgv(base, path) {
  const ref = base === void 0 ? "HEAD" : validateGitRef("git-diff", base);
  const pathspec = path === void 0 ? WORKSPACE_PATHSPEC : validateGitPath("git-diff", path);
  return ["diff", "--relative", ref, "--", pathspec];
}
function gitLogArgv(count) {
  return ["log", `-n${count}`, GIT_LOG_PRETTY];
}
function parseGitShowPrefix(stdout) {
  return stdout.replace(/\r?\n$/, "");
}
function nulSegments(stdout) {
  return stdout.split("\0").filter((segment) => segment.length > 0);
}
function stripWorkspacePrefix(prefix, path) {
  if (prefix.length === 0) return path;
  if (path.startsWith(prefix)) return path.slice(prefix.length);
  throw new WorkflowError(
    "DriverError",
    `git reported path '${path}' outside the workspace prefix '${prefix}'. The pathspec should have scoped the read to the workspace, so the scoping is broken; report this as a bug.`
  );
}
function parseGitStatusPorcelainV2(stdout, prefix = "") {
  const staged = [];
  const unstaged = [];
  const untracked = [];
  let branch;
  const segments = nulSegments(stdout);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.startsWith("# branch.head ")) {
      const head = segment.slice("# branch.head ".length);
      if (head !== "(detached)") branch = head;
      continue;
    }
    if (segment.startsWith("#")) continue;
    const kind = segment[0];
    if (kind === "1" || kind === "2") {
      const xy = segment.split(" ")[1] ?? "..";
      const path = fieldTail(segment, kind === "1" ? 8 : 9);
      if (kind === "2") index += 1;
      if (path.length === 0) continue;
      const relative = stripWorkspacePrefix(prefix, path);
      if (xy[0] !== void 0 && xy[0] !== ".") staged.push(relative);
      if (xy[1] !== void 0 && xy[1] !== ".") unstaged.push(relative);
      continue;
    }
    if (kind === "u") {
      const path = fieldTail(segment, 10);
      if (path.length > 0) unstaged.push(stripWorkspacePrefix(prefix, path));
      continue;
    }
    if (kind === "?") {
      const path = fieldTail(segment, 1);
      if (path.length > 0) untracked.push(stripWorkspacePrefix(prefix, path));
    }
  }
  const clean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  return {
    ...branch === void 0 ? {} : { branch },
    clean,
    staged: sortedUnique(staged),
    unstaged: sortedUnique(unstaged),
    untracked: sortedUnique(untracked)
  };
}
function parseGitLog(stdout) {
  const commits = [];
  for (const raw of stdout.split("\n")) {
    const record = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (record.length === 0) continue;
    const fields = record.split("\0");
    if (fields.length !== 4) {
      throw new WorkflowError(
        "DriverError",
        `world-read git-log: cannot parse the output; a record should have 4 NUL-separated fields, got ${fields.length}. Retry, and report this as a bug if it persists.`
      );
    }
    commits.push({
      hash: fields[0],
      subject: fields[1],
      author: fields[2],
      date: fields[3]
    });
  }
  return commits;
}
function parseGitPathList(stdout, prefix = "") {
  return nulSegments(stdout).map((path) => stripWorkspacePrefix(prefix, path));
}
function fieldTail(line, index) {
  let at = 0;
  for (let i = 0; i < index; i += 1) {
    const next = line.indexOf(" ", at);
    if (next === -1) return "";
    at = next + 1;
  }
  return line.slice(at);
}
function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
export {
  GIT_SHOW_PREFIX_ARGV,
  GIT_STATUS_ARGV,
  gitChangedFilesPlan,
  gitDiffArgv,
  gitLogArgv,
  parseGitLog,
  parseGitPathList,
  parseGitShowPrefix,
  parseGitStatusPorcelainV2
};
