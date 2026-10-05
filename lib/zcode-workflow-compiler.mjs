// Derived from fixed Apache-2.0 ZCode compiler/analysis/schema/lowering sources; see THIRD_PARTY_NOTICES.md.

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/facade/dts.ts
var FACADE_FILE_NAME = "workflow-facade.d.ts";
var FACADE_ACTOR_SEGMENT = String.raw`
/**
 * A node: one task assigned to an actor, producing a typed result.
 * Thenable — await it, or combine with Promise.all for joins.
 */
declare interface Node<T> extends PromiseLike<T> {}

/**
 * Persona of an actor: identity, fixed at creation (frozen for the actor's lifetime). Every
 * actor has the regular working tools (reading, searching, editing, running commands); what
 * it may do with them is said in the ask.
 */
declare interface AgentPersona {
  /** System prompt describing the actor's role. */
  system?: string;
}

/**
 * An actor: a persistent conversational context that executes tasks serially.
 * Context accumulates across asks; concurrent asks on one actor queue FIFO.
 */
declare interface Agent {
  /**
   * Assign one task. T is the task's output value: an interface you define in
   * this script with a plain "interface" declaration (no "declare" modifier; the
   * harness synthesizes its runtime schema from the type), or the final response
   * text when the type argument is omitted.
   */
  ask<T = string>(instructions: string): Node<T>;
}

/**
 * Create a fresh actor. Every call creates a new context; sharing context means
 * sharing this reference.
 *
 * The name is optional, but a non-empty one is an identity, not a label. It must be
 * unique within the run: two actors under the same name fail the whole run. It is
 * also the key a revised re-run matches its cache on (AmendWorkflow imports the
 * finished work of each named actor), so stable, meaningful
 * names carry work across script revisions. Anonymous actors are legal and never
 * reuse imported work.
 *
 * In a fan-out or a loop each iteration is a separate actor, so a single static name
 * there is the duplicate case: give each one its own name (agent("reviewer-" + file))
 * or leave them all anonymous. A literal name in a loop is reported when the script
 * is compiled; a computed one fails at run time.
 */
declare function agent(name?: string, persona?: string | AgentPersona): Agent;
`;
var FACADE_LOG_SEGMENT = String.raw`
/** Emit a progress message to the user. */
declare function log(message: string): void;
`;
var FACADE_REPORT_SEGMENT = String.raw`
/**
 * Publish one intermediate result while the run is still going. Like log() it
 * returns nothing and there is nothing to await — a finding has no reply.
 *
 * Unlike log() it is journaled: a resumed run never shows the same item twice, and
 * the items are delivered with the completion notification even when the run ends in
 * failure. That is the point of it — a run that dies on its twelfth of forty tasks
 * still did eleven tasks' worth of work, and reported items are how that work
 * survives.
 *
 * Two caps, and both fail the whole run rather than the call (there is no rejection
 * channel in a void return): at most 256 items per run, and at most 32KB per
 * serialized item. They are generous on purpose — report findings, not chatter.
 *
 * The item must be JSON-serializable: plain objects, arrays, strings, numbers,
 * booleans, null. Functions, class instances, Date and promises are rejected when
 * the script is compiled.
 *
 * The optional second argument routes the item to a dashboard artifact: pass the id
 * of a preset declared with artifact.chart / table / metrics / board, and this item
 * becomes one more point, row, tile value or card on it — the dashboard is nothing
 * but the items tagged with its id. The tag must be a compile-time string literal
 * naming a preset the script declares (anywhere in the text, but the declaration must
 * have executed by the time this call runs); a tag that names nothing, or names a
 * file/markdown artifact, fails the run. An untagged report is unchanged: it goes to
 * the run's Results, and a tagged one goes to both.
 */
declare function report(item: unknown, artifactId?: string): void;
`;
var FACADE_ARTIFACT_SEGMENT = String.raw`
/** A published artifact version: the id it was published under, and which version this call minted. */
declare interface ArtifactRef { id: string; version: number }
/** Card metadata every artifact kind accepts. */
declare interface ArtifactOptions {
  /** Shown as the card title; defaults to the id. In the user's language. */
  title?: string;
  /** A sentence or two, shown beside the title when this artifact leads the card. */
  description?: string;
  /** The run's deliverable: the card and the run pane lead with it. At most one id per run; once set it stays set for later versions. */
  primary?: boolean;
}
declare interface ArtifactFileOptions extends ArtifactOptions {
  /** Overrides the type sniffed from the extension ("application/pdf", "text/html", …). */
  contentType?: string;
}
/** One value taken from a reported item: a dot path into the item ("timing.after"). */
declare interface ArtifactField { field: string; label?: string; unit?: string }
declare interface ChartSpec extends ArtifactOptions {
  type?: "line" | "bar" | "scatter";        // default "line"
  x: ArtifactField;
  y: ArtifactField | ArtifactField[];        // several = several series
  scale?: "linear" | "log";                  // y axis, default "linear"
  /** A reference value drawn as a horizontal rule, taken from the first item that has the field. */
  baseline?: ArtifactField;
}
declare interface TableSpec extends ArtifactOptions {
  columns: ArtifactField[];
  /** Field that identifies a row; a later item with the same key replaces the row. Absent = append-only. */
  key?: string;
}
declare interface MetricsSpec extends ArtifactOptions {
  /** Each tile shows the value from the latest item that has the field. */
  metrics: ArtifactField[];
}
declare interface BoardSpec extends ArtifactOptions {
  /** Field identifying a card; a later item with the same key moves/updates the card. */
  key: string;
  /** Field holding the card's column. */
  status: string;
  /** Column order. Items whose status is not listed land in a trailing "other" column. */
  columns: string[];
  /** Field for the card title (default: the key) and extra fields shown on the card. */
  cardTitle?: string;
  detail?: ArtifactField[];
}
/**
 * Publish what the user should see: the run's own deliverable surface, kept after it ends.
 * Two habits. (1) EVERY RUN PUBLISHES ITS DELIVERABLE, whatever the user asked for: a webpage
 * or PDF a subagent wrote goes out via file(); an answer (findings, a review) goes out as the
 * long form of the facts the return summarises, usually via markdown(). Once, at the end;
 * skip it only when the whole answer is one line. When the run publishes more than one
 * artifact, mark the deliverable { primary: true }. (2) A DASHBOARD IS FOR THE PERSON WATCHING
 * THE RUN: declare one when there is state worth watching mid-run (the key number per round,
 * which items are done) and none when the run is over before anyone looks. Two tests keep it
 * to what matters: would the user open it on its own? does it repeat another artifact? A CSV
 * and a table of its rows: one of them is noise.
 *
 * Every id is a compile-time string literal (non-empty, at most 64 characters of
 * [A-Za-z0-9_.-]); the set a run can publish is fixed at submit time, so the compiler
 * rejects a computed one. Within one run an id belongs to exactly one member.
 * The two families are deliberately asymmetric, and the asymmetry is the whole design:
 * - CONTENT (file, markdown) are EFFECTS: async, resolve to an ArtifactRef, and REJECT
 *   catchably — missing file, not a file, path outside the workspace, over the size cap, no
 *   store. try { await artifact.file("book", "out/book.pdf") } catch { …ask a subagent to
 *   write it… } is the intended idiom. Bytes are copied at publish time, so later workspace
 *   edits never rewrite a version; republishing an id mints the NEXT version and keeps the
 *   old ones (at most 16 per id).
 * - PRESET (chart, table, metrics, board) are DECLARATIONS: synchronous, return nothing,
 *   never touch a file; they say how items tagged with their id are drawn. Declare each ONCE,
 *   at the top, then feed it with report(item, "<id>"). The same id with an identical spec is
 *   a no-op; a DIFFERENT or malformed spec fails the whole run — a void return has no
 *   rejection channel, exactly as with report().
 * Caps: 32 ids per run, 16 versions per id, 20 MiB per file, 256 KB per markdown, 120
 * characters of title and 500 of description.
 */
declare const artifact: {
  /**
   * Publish a file from the workspace. path is workspace-relative, resolved by the same
   * resolver files.read() uses; the bytes are copied at publish time. The content type is
   * read off the extension unless opts.contentType overrides it. Rejects (catchably)
   * rather than publishing something empty.
   */
  file(id: string, path: string, opts?: ArtifactFileOptions): Promise<ArtifactRef>;
  /** Publish markdown text the script composed: the usual shape of a report deliverable, the long form of what the return summarises. */
  markdown(id: string, content: string, opts?: ArtifactOptions): Promise<ArtifactRef>;
  /** Declare a chart fed by report(item, id): each tagged item is one point. */
  chart(id: string, spec: ChartSpec): void;
  /** Declare a table fed by report(item, id): each tagged item is one row. */
  table(id: string, spec: TableSpec): void;
  /** Declare a metric tile row fed by report(item, id): each tile shows the newest value it has. */
  metrics(id: string, spec: MetricsSpec): void;
  /** Declare a board fed by report(item, id): each tagged item is a card, placed by its status field. */
  board(id: string, spec: BoardSpec): void;
};
`;
var FACADE_PHASE_SEGMENT = String.raw`
/**
 * Mark the start of a phase: a short, human-readable name for the group of steps that
 * follow, shown as one node on the workflow graph the user reads and approves.
 * Presentation only — it starts nothing, waits for nothing, returns nothing.
 *
 * Required in every script you submit, not optional: the phase graph is how the user
 * experiences the workflow. Without markers they face one card per step and no story;
 * group the whole script, top to bottom.
 *
 * Name phases for the user, in the language the user is speaking in this session: a short
 * natural phrase saying what the stage accomplishes ("Research each changed file in parallel",
 * "汇总并产出最终报告"). Graph-building vocabulary the user never chose — "fan-out", "gate",
 * "aggregate" — is not a name; the user approves stages by what they do. Say it the way you
 * would tell a colleague what is happening: "确认测试仍然通过", not "执行测试验证任务".
 *
 * The scope is the rest of the enclosing block: the marker claims every step issued
 * from it to the end of the block it stands in — nested blocks and inlined helper
 * calls included — and the enclosing phase resumes once that block ends. A marker
 * inside an if-branch therefore groups that branch and does not leak past it. Two
 * markers with the same name are one phase: repeating a name continues that phase,
 * which is the opposite of an actor's name — that one has to be unique.
 *
 * Two rules the compiler enforces. The name must be a compile-time string literal
 * ("review the diff" or a no-substitution template) and non-empty, because the phase
 * names label the graph the user confirms before anything runs. And the call must
 * stand alone as its own statement: a marker in expression position has no
 * rest-of-block to claim.
 *
 * Every phase must contain at least one subagent ask or one world.run. A phase is a
 * stage the user watches progress through; plain script logic between two asks (reading
 * args, shaping a prompt, building the return) runs in a flash and shows no progress, so
 * it is not a stage. Fold it into the phase before or after it; never open a phase for
 * the setup at the top or the return at the bottom.
 *
 * Idiom: one marker at the head of each stage that does work — name the loop body and
 * its check where they start, name the close-out that asks or runs after the loop.
 */
declare function phase(name: string): void;
`;
var FACADE_WORLD_SEGMENT = String.raw`
/** One matching line found by files.grep. */
declare interface GrepMatch {
  /** Workspace-relative path of the file the match was found in. */
  path: string;
  /** One-based line number of the match. */
  line: number;
  /** The full text of the matching line. */
  text: string;
}

/**
 * Journaled read-only observations of the workspace, executed by the harness.
 * Replay returns the journal-recorded value. Prefer passing paths to agents and
 * letting them read files with their own tools; read() and grep() are for when the
 * script itself must shard or branch on content. There is no write — writing to the
 * world is an agent task.
 */
declare const files: {
  /**
   * List workspace files matching a glob pattern, as workspace-relative paths sorted
   * lexicographically. Capped at 2000 files: over the cap the call rejects instead of
   * returning a partial view — narrow the pattern.
   */
  glob(pattern: string): Promise<string[]>;
  /** Read one workspace file as UTF-8 text. Size-capped. */
  read(path: string): Promise<string>;
  /**
   * Search file contents with a ripgrep-compatible regular expression, optionally
   * narrowed to a glob over paths (the same syntax glob() takes: "*.ts", "src/**").
   * Returns one entry per matching line, with workspace-relative paths and one-based
   * line numbers.
   *
   * Capped at 2000 matches or 256KB of results, whichever comes first. Over the cap
   * the call rejects instead of returning a partial view — a silently truncated search
   * is the one result you cannot reason about — so narrow the pattern or add a glob.
   */
  grep(pattern: string, glob?: string): Promise<GrepMatch[]>;
};

/** The working tree's status, as reported by git.status(). */
declare interface GitStatus {
  /** Current branch name; absent when HEAD is detached. */
  branch?: string;
  /** True when nothing is staged, modified, or untracked. */
  clean: boolean;
  /** Workspace-relative paths staged for the next commit. */
  staged: string[];
  /** Workspace-relative paths modified in the working tree but not staged. */
  unstaged: string[];
  /** Workspace-relative paths git does not track (honouring .gitignore). */
  untracked: string[];
}

/** One commit, as reported by git.log(). */
declare interface GitCommit {
  /** Full commit hash. */
  hash: string;
  /** First line of the commit message. */
  subject: string;
  /** Author name. */
  author: string;
  /** Author date, ISO 8601. */
  date: string;
}

/**
 * Journaled read-only git observations — the same bargain as files.*: executed by the
 * harness, recorded in the journal, and replayed from the record, so a resumed run
 * sees the repository as it was rather than as it is now.
 *
 * Read-only by construction rather than by permission: the harness builds a fixed
 * argument list for one allowlisted subcommand and never a shell string, so there is
 * no call this surface can express that writes. A base must name a single ref — no
 * ".." ranges in this version — and paths are workspace-relative.
 *
 * Observations are scoped to the workspace, which is the same world files.* observes:
 * every path you get back is relative to the workspace and safe to pass straight to
 * files.read(). If the workspace is a subdirectory of the repository, changes outside
 * it are not reported — the workspace is the world. git.log is the exception, because
 * commits are repository-wide objects rather than paths.
 *
 * Caps reject rather than truncate (diff at 512KB, log at 100 commits), for the same
 * reason grep does. Outside a git repository, or with no git available, every call
 * rejects with a catchable error, so the idiom is try/catch with a files.glob fallback.
 */
declare const git: {
  /**
   * Workspace-relative paths that changed. With no base: files modified against HEAD
   * plus untracked files, because a brand-new file is a change to anyone reading. With
   * a base ref: files differing from that ref, tracked history only.
   */
  changedFiles(base?: string): Promise<string[]>;
  /**
   * Unified diff against base (default HEAD). Covers the whole workspace unless you
   * narrow it to one workspace-relative path.
   */
  diff(base?: string, path?: string): Promise<string>;
  /** The current working-tree status, for the workspace. */
  status(): Promise<GitStatus>;
  /**
   * The most recent commits, newest first. Default 20, maximum 100. Unlike the other
   * members this reads repository-wide history, not workspace paths.
   */
  log(count?: number): Promise<GitCommit[]>;
};
`;
var FACADE_WORLD_RUN_SEGMENT = String.raw`
/** The outcome of one world.run command, including nonzero exits. */
declare interface WorldRunResult {
  /** The process exit code. Nonzero is a normal, returned outcome — branch on it. */
  exitCode: number;
  /** Captured stdout (UTF-8). Capped at 256KB; over the cap the call rejects. */
  stdout: string;
  /** Captured stderr (UTF-8). Same cap and rejection semantics as stdout. */
  stderr: string;
}

/**
 * Journaled command execution — the effect primitive. Executed by the harness exactly
 * once per call site and iteration, recorded in the journal, and replayed from the
 * record on resume (resume is crash recovery, not re-verification).
 *
 * Deliberately unlike git.*: a completed process with a NONZERO exit code RESOLVES to
 * a WorldRunResult — a failing check is the gating loop's normal case and must not
 * travel exception control flow. The promise only rejects (catchably) when the
 * command could not run as an observation at all: spawn failure, or timeout (default
 * 300000ms, override per call via timeoutMs, no upper cap).
 *
 * cmd must be a compile-time string literal: the script's command set is shown to the
 * user when the run is confirmed, and only those commands are executable. Fixed argv,
 * never a shell — no pipes, no redirection, no variable expansion; compose with
 * multiple calls and plain code. cwd is the workspace. Idiom: model generates, code
 * gates — run the check here, parse its output with pure script logic, and hand
 * failures to an agent to fix. A helper that needs Node builtins can be inlined as
 * world.run("node", ["-e", code]) — the code string lives inside the script, so it is
 * pinned by the journal key like every other argument.
 */
declare const world: {
  run(cmd: string, args?: string[], opts?: { timeoutMs?: number }): Promise<WorldRunResult>;
};
`;
var FACADE_ARGS_SEGMENT = String.raw`
/**
 * The run's arguments: the values supplied when this workflow was started.
 *
 * A workflow saved into the project declares its arguments (name, type, whether they
 * are required, defaults); the host validates the caller's values against that
 * declaration and fills in defaults before the run starts, so what lands here is
 * always a complete, checked bag. For an inline script — and inside a snippet — it is
 * simply empty.
 *
 * Always defined, so reading args.target is a plain property read rather than a crash.
 * The values are typed unknown on purpose: the compiler surface must not change from
 * one workflow to the next, so narrow them in the script -- String(args.target), or a
 * typeof guard -- exactly as you would any other external input.
 */
declare const args: Readonly<Record<string, unknown>>;
`;
var FACADE_DTS = FACADE_ACTOR_SEGMENT + FACADE_ARGS_SEGMENT + FACADE_LOG_SEGMENT + FACADE_REPORT_SEGMENT + FACADE_ARTIFACT_SEGMENT + FACADE_PHASE_SEGMENT + FACADE_WORLD_SEGMENT + FACADE_WORLD_RUN_SEGMENT;
var SNIPPET_FACADE_DTS = FACADE_ARGS_SEGMENT + FACADE_LOG_SEGMENT + FACADE_WORLD_SEGMENT + FACADE_WORLD_RUN_SEGMENT;

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/facade/world-read-caps.ts
var WORLD_READ_CAPS = {
  /**
   * `files.glob` 的最大匹配文件数。之前 glob 没有自己的 cap，于是文件系统
   * 端口面向 UI 工具的默认值（100，mtime 降序）静默生效——正是本注册表要禁止的
   * "静默夹到上限"。所有 world-read 的 cap 都必须在这里拥有名字。
   */
  globMaxFiles: 2e3,
  /** `files.grep` 的最大命中条数。 */
  grepMaxMatches: 2e3,
  /** `files.grep` 结果序列化后的最大字节数（与条数上限**先到先拒**）。 */
  grepMaxSerializedBytes: 256 * 1024,
  /** `git.diff` 输出的最大字节数。 */
  gitDiffMaxBytes: 512 * 1024,
  /** `git.log` 可请求的最大条数；超过即结构化拒绝，而不是静默夹到上限。 */
  gitLogMaxCount: 100,
  /** `git.log` 未指定 count 时的条数。 */
  gitLogDefaultCount: 20,
  /** `world.run` stdout 的最大字节数（拒绝不截断，cap+1 探测）。 */
  runStdoutMaxBytes: 256 * 1024,
  /** `world.run` stderr 的最大字节数（同上）。 */
  runStderrMaxBytes: 256 * 1024,
  /** `world.run` 未指定 timeoutMs 时的墙钟（ms）。**无上限钳制**：为真正长跑的测试设计。 */
  runDefaultTimeoutMs: 3e5
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/facade/report-caps.ts
var REPORT_CAPS = {
  /** 一个 run 内 `report` 的最大条数。 */
  maxItemsPerRun: 256,
  /** 单条 item 序列化后的最大字节数。 */
  maxItemSerializedBytes: 32 * 1024
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/facade/artifact-caps.ts
var ARTIFACT_CAPS = {
  /** 一个 run 内最多能有几个不同的产物 id。 */
  maxArtifactsPerRun: 32,
  /** 单个 id 最多能发布几版（内容成员每次成功发布 = 一版）。 */
  maxVersionsPerArtifact: 16,
  /** `artifact.file` 的最大字节数（与 PROTOCOL_V4_LIMITS.attachmentMaxBytes 同值）。 */
  maxFileBytes: 20 * 1024 * 1024,
  /** `artifact.markdown` 的最大字节数（UTF-8）。 */
  maxMarkdownBytes: 256 * 1024,
  /** `opts.title` 的最大字符数。 */
  maxTitleLength: 120,
  /** `opts.description` 的最大字符数。 */
  maxDescriptionLength: 500,
  /** 预置 spec 规范化 JSON 后的最大字节数。 */
  maxSpecSerializedBytes: 8 * 1024,
  /** 产物 id 的最大字符数。 */
  maxIdLength: 64
};
var ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/facade/registry.ts
import ts from "typescript";
var WORLD_READ_REGISTRY = [
  { container: "files", member: "glob", op: "glob" },
  { container: "files", member: "read", op: "read" },
  { container: "files", member: "grep", op: "grep" },
  { container: "git", member: "changedFiles", op: "git-changed-files" },
  { container: "git", member: "diff", op: "git-diff" },
  { container: "git", member: "status", op: "git-status" },
  { container: "git", member: "log", op: "git-log" },
  // world.run：journal 化命令执行。同一张表、同一套
  // 机制——「读」与「效应」的差别在授权面（编译期字面量 cmd + 确认窗）与 journal 的
  // 节点种类（world-run），不在站点身份。
  { container: "world", member: "run", op: "run" }
];
var ARTIFACT_REGISTRY = [
  { container: "artifact", member: "file", op: "file", family: "content" },
  { container: "artifact", member: "markdown", op: "markdown", family: "content" },
  { container: "artifact", member: "chart", op: "chart", family: "preset" },
  { container: "artifact", member: "table", op: "table", family: "preset" },
  { container: "artifact", member: "metrics", op: "metrics", family: "preset" },
  { container: "artifact", member: "board", op: "board", family: "preset" }
];
function artifactRow(container, member) {
  if (container === void 0) return void 0;
  return ARTIFACT_REGISTRY.find((row) => row.container === container && row.member === member);
}
function artifactRowOfSymbol(symbol) {
  const member = facadeMemberOf(symbol);
  if (member === void 0) return void 0;
  return artifactRow(member.container, member.member);
}
function artifactFamilyOf(op) {
  const row = ARTIFACT_REGISTRY.find((candidate) => candidate.op === op);
  if (row === void 0) throw new Error(`unknown artifact op: ${op}`);
  return row.family;
}
function isArtifactPresetOp(op) {
  return ARTIFACT_REGISTRY.some((row) => row.op === op && row.family === "preset");
}
var ASK_MEMBER = { container: "Agent", member: "ask" };
var SITE_PRODUCING_FUNCTIONS = ["agent", "report"];
function siteProducingFunctionOfSymbol(symbol) {
  const member = facadeMemberOf(symbol);
  if (member === void 0 || member.container !== void 0) return void 0;
  return SITE_PRODUCING_FUNCTIONS.find((name) => name === member.member);
}
var MARKER_FUNCTIONS = ["phase"];
function markerFunctionOfSymbol(symbol) {
  const member = facadeMemberOf(symbol);
  if (member === void 0 || member.container !== void 0) return void 0;
  return MARKER_FUNCTIONS.find((name) => name === member.member);
}
var SITE_MEMBER_NAMES = /* @__PURE__ */ new Set([
  ASK_MEMBER.member,
  ...WORLD_READ_REGISTRY.map((row) => row.member),
  ...ARTIFACT_REGISTRY.map((row) => row.member)
]);
function worldReadOp(container, member) {
  if (container === void 0) return void 0;
  return WORLD_READ_REGISTRY.find((row) => row.container === container && row.member === member)?.op;
}
function isSiteProducing(container, member) {
  if (container === void 0) return SITE_PRODUCING_FUNCTIONS.some((name) => name === member);
  if (container === ASK_MEMBER.container && member === ASK_MEMBER.member) return true;
  if (artifactRow(container, member) !== void 0) return true;
  return worldReadOp(container, member) !== void 0;
}
function facadeContainerOf(declaration) {
  if (declaration === void 0) return void 0;
  if (declaration.getSourceFile().fileName !== FACADE_FILE_NAME) return void 0;
  for (let node = declaration.parent; node !== void 0; node = node.parent) {
    if (ts.isVariableDeclaration(node)) {
      return ts.isIdentifier(node.name) ? node.name.text : void 0;
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return node.name.text;
    if (ts.isSourceFile(node)) return void 0;
  }
  return void 0;
}
function facadeMemberOf(symbol) {
  const declaration = symbol?.declarations?.find(
    (decl) => decl.getSourceFile().fileName === FACADE_FILE_NAME
  );
  if (declaration === void 0 || symbol === void 0) return void 0;
  return { container: facadeContainerOf(declaration), member: symbol.name };
}
function worldReadOpOfSymbol(symbol) {
  const member = facadeMemberOf(symbol);
  if (member === void 0) return void 0;
  return worldReadOp(member.container, member.member);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/artifacts.ts
import ts6 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/sites.ts
import ts5 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/compiler/compile.ts
import ts2 from "typescript";

// zcode-stdlib:typescript-es2022
var TS_LIBS = {
  "lib.decorators.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/**\n * The decorator context types provided to class element decorators.\n */\ntype ClassMemberDecoratorContext =\n    | ClassMethodDecoratorContext\n    | ClassGetterDecoratorContext\n    | ClassSetterDecoratorContext\n    | ClassFieldDecoratorContext\n    | ClassAccessorDecoratorContext;\n\n/**\n * The decorator context types provided to any decorator.\n */\ntype DecoratorContext =\n    | ClassDecoratorContext\n    | ClassMemberDecoratorContext;\n\ntype DecoratorMetadataObject = Record<PropertyKey, unknown> & object;\n\ntype DecoratorMetadata = typeof globalThis extends { Symbol: { readonly metadata: symbol; }; } ? DecoratorMetadataObject : DecoratorMetadataObject | undefined;\n\n/**\n * Context provided to a class decorator.\n * @template Class The type of the decorated class associated with this context.\n */\ninterface ClassDecoratorContext<\n    Class extends abstract new (...args: any) => any = abstract new (...args: any) => any,\n> {\n    /** The kind of element that was decorated. */\n    readonly kind: "class";\n\n    /** The name of the decorated class. */\n    readonly name: string | undefined;\n\n    /**\n     * Adds a callback to be invoked after the class definition has been finalized.\n     *\n     * @example\n     * ```ts\n     * function customElement(name: string): ClassDecoratorFunction {\n     *   return (target, context) => {\n     *     context.addInitializer(function () {\n     *       customElements.define(name, this);\n     *     });\n     *   }\n     * }\n     *\n     * @customElement("my-element")\n     * class MyElement {}\n     * ```\n     */\n    addInitializer(initializer: (this: Class) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n\n/**\n * Context provided to a class method decorator.\n * @template This The type on which the class element will be defined. For a static class element, this will be\n * the type of the constructor. For a non-static class element, this will be the type of the instance.\n * @template Value The type of the decorated class method.\n */\ninterface ClassMethodDecoratorContext<\n    This = unknown,\n    Value extends (this: This, ...args: any) => any = (this: This, ...args: any) => any,\n> {\n    /** The kind of class element that was decorated. */\n    readonly kind: "method";\n\n    /** The name of the decorated class element. */\n    readonly name: string | symbol;\n\n    /** A value indicating whether the class element is a static (`true`) or instance (`false`) element. */\n    readonly static: boolean;\n\n    /** A value indicating whether the class element has a private name. */\n    readonly private: boolean;\n\n    /** An object that can be used to access the current value of the class element at runtime. */\n    readonly access: {\n        /**\n         * Determines whether an object has a property with the same name as the decorated element.\n         */\n        has(object: This): boolean;\n        /**\n         * Gets the current value of the method from the provided object.\n         *\n         * @example\n         * let fn = context.access.get(instance);\n         */\n        get(object: This): Value;\n    };\n\n    /**\n     * Adds a callback to be invoked either after static methods are defined but before\n     * static initializers are run (when decorating a `static` element), or before instance\n     * initializers are run (when decorating a non-`static` element).\n     *\n     * @example\n     * ```ts\n     * const bound: ClassMethodDecoratorFunction = (value, context) {\n     *   if (context.private) throw new TypeError("Not supported on private methods.");\n     *   context.addInitializer(function () {\n     *     this[context.name] = this[context.name].bind(this);\n     *   });\n     * }\n     *\n     * class C {\n     *   message = "Hello";\n     *\n     *   @bound\n     *   m() {\n     *     console.log(this.message);\n     *   }\n     * }\n     * ```\n     */\n    addInitializer(initializer: (this: This) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n\n/**\n * Context provided to a class getter decorator.\n * @template This The type on which the class element will be defined. For a static class element, this will be\n * the type of the constructor. For a non-static class element, this will be the type of the instance.\n * @template Value The property type of the decorated class getter.\n */\ninterface ClassGetterDecoratorContext<\n    This = unknown,\n    Value = unknown,\n> {\n    /** The kind of class element that was decorated. */\n    readonly kind: "getter";\n\n    /** The name of the decorated class element. */\n    readonly name: string | symbol;\n\n    /** A value indicating whether the class element is a static (`true`) or instance (`false`) element. */\n    readonly static: boolean;\n\n    /** A value indicating whether the class element has a private name. */\n    readonly private: boolean;\n\n    /** An object that can be used to access the current value of the class element at runtime. */\n    readonly access: {\n        /**\n         * Determines whether an object has a property with the same name as the decorated element.\n         */\n        has(object: This): boolean;\n        /**\n         * Invokes the getter on the provided object.\n         *\n         * @example\n         * let value = context.access.get(instance);\n         */\n        get(object: This): Value;\n    };\n\n    /**\n     * Adds a callback to be invoked either after static methods are defined but before\n     * static initializers are run (when decorating a `static` element), or before instance\n     * initializers are run (when decorating a non-`static` element).\n     */\n    addInitializer(initializer: (this: This) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n\n/**\n * Context provided to a class setter decorator.\n * @template This The type on which the class element will be defined. For a static class element, this will be\n * the type of the constructor. For a non-static class element, this will be the type of the instance.\n * @template Value The type of the decorated class setter.\n */\ninterface ClassSetterDecoratorContext<\n    This = unknown,\n    Value = unknown,\n> {\n    /** The kind of class element that was decorated. */\n    readonly kind: "setter";\n\n    /** The name of the decorated class element. */\n    readonly name: string | symbol;\n\n    /** A value indicating whether the class element is a static (`true`) or instance (`false`) element. */\n    readonly static: boolean;\n\n    /** A value indicating whether the class element has a private name. */\n    readonly private: boolean;\n\n    /** An object that can be used to access the current value of the class element at runtime. */\n    readonly access: {\n        /**\n         * Determines whether an object has a property with the same name as the decorated element.\n         */\n        has(object: This): boolean;\n        /**\n         * Invokes the setter on the provided object.\n         *\n         * @example\n         * context.access.set(instance, value);\n         */\n        set(object: This, value: Value): void;\n    };\n\n    /**\n     * Adds a callback to be invoked either after static methods are defined but before\n     * static initializers are run (when decorating a `static` element), or before instance\n     * initializers are run (when decorating a non-`static` element).\n     */\n    addInitializer(initializer: (this: This) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n\n/**\n * Context provided to a class `accessor` field decorator.\n * @template This The type on which the class element will be defined. For a static class element, this will be\n * the type of the constructor. For a non-static class element, this will be the type of the instance.\n * @template Value The type of decorated class field.\n */\ninterface ClassAccessorDecoratorContext<\n    This = unknown,\n    Value = unknown,\n> {\n    /** The kind of class element that was decorated. */\n    readonly kind: "accessor";\n\n    /** The name of the decorated class element. */\n    readonly name: string | symbol;\n\n    /** A value indicating whether the class element is a static (`true`) or instance (`false`) element. */\n    readonly static: boolean;\n\n    /** A value indicating whether the class element has a private name. */\n    readonly private: boolean;\n\n    /** An object that can be used to access the current value of the class element at runtime. */\n    readonly access: {\n        /**\n         * Determines whether an object has a property with the same name as the decorated element.\n         */\n        has(object: This): boolean;\n\n        /**\n         * Invokes the getter on the provided object.\n         *\n         * @example\n         * let value = context.access.get(instance);\n         */\n        get(object: This): Value;\n\n        /**\n         * Invokes the setter on the provided object.\n         *\n         * @example\n         * context.access.set(instance, value);\n         */\n        set(object: This, value: Value): void;\n    };\n\n    /**\n     * Adds a callback to be invoked immediately after the auto `accessor` being\n     * decorated is initialized (regardless if the `accessor` is `static` or not).\n     */\n    addInitializer(initializer: (this: This) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n\n/**\n * Describes the target provided to class `accessor` field decorators.\n * @template This The `this` type to which the target applies.\n * @template Value The property type for the class `accessor` field.\n */\ninterface ClassAccessorDecoratorTarget<This, Value> {\n    /**\n     * Invokes the getter that was defined prior to decorator application.\n     *\n     * @example\n     * let value = target.get.call(instance);\n     */\n    get(this: This): Value;\n\n    /**\n     * Invokes the setter that was defined prior to decorator application.\n     *\n     * @example\n     * target.set.call(instance, value);\n     */\n    set(this: This, value: Value): void;\n}\n\n/**\n * Describes the allowed return value from a class `accessor` field decorator.\n * @template This The `this` type to which the target applies.\n * @template Value The property type for the class `accessor` field.\n */\ninterface ClassAccessorDecoratorResult<This, Value> {\n    /**\n     * An optional replacement getter function. If not provided, the existing getter function is used instead.\n     */\n    get?(this: This): Value;\n\n    /**\n     * An optional replacement setter function. If not provided, the existing setter function is used instead.\n     */\n    set?(this: This, value: Value): void;\n\n    /**\n     * An optional initializer mutator that is invoked when the underlying field initializer is evaluated.\n     * @param value The incoming initializer value.\n     * @returns The replacement initializer value.\n     */\n    init?(this: This, value: Value): Value;\n}\n\n/**\n * Context provided to a class field decorator.\n * @template This The type on which the class element will be defined. For a static class element, this will be\n * the type of the constructor. For a non-static class element, this will be the type of the instance.\n * @template Value The type of the decorated class field.\n */\ninterface ClassFieldDecoratorContext<\n    This = unknown,\n    Value = unknown,\n> {\n    /** The kind of class element that was decorated. */\n    readonly kind: "field";\n\n    /** The name of the decorated class element. */\n    readonly name: string | symbol;\n\n    /** A value indicating whether the class element is a static (`true`) or instance (`false`) element. */\n    readonly static: boolean;\n\n    /** A value indicating whether the class element has a private name. */\n    readonly private: boolean;\n\n    /** An object that can be used to access the current value of the class element at runtime. */\n    readonly access: {\n        /**\n         * Determines whether an object has a property with the same name as the decorated element.\n         */\n        has(object: This): boolean;\n\n        /**\n         * Gets the value of the field on the provided object.\n         */\n        get(object: This): Value;\n\n        /**\n         * Sets the value of the field on the provided object.\n         */\n        set(object: This, value: Value): void;\n    };\n\n    /**\n     * Adds a callback to be invoked immediately after the field being decorated\n     * is initialized (regardless if the field is `static` or not).\n     */\n    addInitializer(initializer: (this: This) => void): void;\n\n    readonly metadata: DecoratorMetadata;\n}\n',
  "lib.decorators.legacy.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare type ClassDecorator = <TFunction extends Function>(target: TFunction) => TFunction | void;\ndeclare type PropertyDecorator = (target: Object, propertyKey: string | symbol) => void;\ndeclare type MethodDecorator = <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;\ndeclare type ParameterDecorator = (target: Object, propertyKey: string | symbol | undefined, parameterIndex: number) => void;\n',
  "lib.es2015.collection.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Map<K, V> {\n    clear(): void;\n    /**\n     * @returns true if an element in the Map existed and has been removed, or false if the element does not exist.\n     */\n    delete(key: K): boolean;\n    /**\n     * Executes a provided function once per each key/value pair in the Map, in insertion order.\n     */\n    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;\n    /**\n     * Returns a specified element from the Map object. If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.\n     * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.\n     */\n    get(key: K): V | undefined;\n    /**\n     * @returns boolean indicating whether an element with the specified key exists or not.\n     */\n    has(key: K): boolean;\n    /**\n     * Adds a new element with a specified key and value to the Map. If an element with the same key already exists, the element will be updated.\n     */\n    set(key: K, value: V): this;\n    /**\n     * @returns the number of elements in the Map.\n     */\n    readonly size: number;\n}\n\ninterface MapConstructor {\n    new (): Map<any, any>;\n    new <K, V>(entries?: readonly (readonly [K, V])[] | null): Map<K, V>;\n    readonly prototype: Map<any, any>;\n}\ndeclare var Map: MapConstructor;\n\ninterface ReadonlyMap<K, V> {\n    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any): void;\n    get(key: K): V | undefined;\n    has(key: K): boolean;\n    readonly size: number;\n}\n\ninterface WeakMap<K extends WeakKey, V> {\n    /**\n     * Removes the specified element from the WeakMap.\n     * @returns true if the element was successfully removed, or false if it was not present.\n     */\n    delete(key: K): boolean;\n    /**\n     * @returns a specified element.\n     */\n    get(key: K): V | undefined;\n    /**\n     * @returns a boolean indicating whether an element with the specified key exists or not.\n     */\n    has(key: K): boolean;\n    /**\n     * Adds a new element with a specified key and value.\n     * @param key Must be an object or symbol.\n     */\n    set(key: K, value: V): this;\n}\n\ninterface WeakMapConstructor {\n    new <K extends WeakKey = WeakKey, V = any>(entries?: readonly (readonly [K, V])[] | null): WeakMap<K, V>;\n    readonly prototype: WeakMap<WeakKey, any>;\n}\ndeclare var WeakMap: WeakMapConstructor;\n\ninterface Set<T> {\n    /**\n     * Appends a new element with a specified value to the end of the Set.\n     */\n    add(value: T): this;\n\n    clear(): void;\n    /**\n     * Removes a specified value from the Set.\n     * @returns Returns true if an element in the Set existed and has been removed, or false if the element does not exist.\n     */\n    delete(value: T): boolean;\n    /**\n     * Executes a provided function once per each value in the Set object, in insertion order.\n     */\n    forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void;\n    /**\n     * @returns a boolean indicating whether an element with the specified value exists in the Set or not.\n     */\n    has(value: T): boolean;\n    /**\n     * @returns the number of (unique) elements in Set.\n     */\n    readonly size: number;\n}\n\ninterface SetConstructor {\n    new <T = any>(values?: readonly T[] | null): Set<T>;\n    readonly prototype: Set<any>;\n}\ndeclare var Set: SetConstructor;\n\ninterface ReadonlySet<T> {\n    forEach(callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: any): void;\n    has(value: T): boolean;\n    readonly size: number;\n}\n\ninterface WeakSet<T extends WeakKey> {\n    /**\n     * Appends a new value to the end of the WeakSet.\n     */\n    add(value: T): this;\n    /**\n     * Removes the specified element from the WeakSet.\n     * @returns Returns true if the element existed and has been removed, or false if the element does not exist.\n     */\n    delete(value: T): boolean;\n    /**\n     * @returns a boolean indicating whether a value exists in the WeakSet or not.\n     */\n    has(value: T): boolean;\n}\n\ninterface WeakSetConstructor {\n    new <T extends WeakKey = WeakKey>(values?: readonly T[] | null): WeakSet<T>;\n    readonly prototype: WeakSet<WeakKey>;\n}\ndeclare var WeakSet: WeakSetConstructor;\n',
  "lib.es2015.core.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Array<T> {\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find<S extends T>(predicate: (value: T, index: number, obj: T[]) => value is S, thisArg?: any): S | undefined;\n    find(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: T, start?: number, end?: number): this;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string;\n}\n\ninterface ArrayConstructor {\n    /**\n     * Creates an array from an array-like object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from<T>(arrayLike: ArrayLike<T>): T[];\n\n    /**\n     * Creates an array from an iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T, U>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => U, thisArg?: any): U[];\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of<T>(...items: T[]): T[];\n}\n\ninterface DateConstructor {\n    new (value: number | string | Date): Date;\n}\n\ninterface Function {\n    /**\n     * Returns the name of the function. Function names are read-only and can not be changed.\n     */\n    readonly name: string;\n}\n\ninterface Math {\n    /**\n     * Returns the number of leading zero bits in the 32-bit binary representation of a number.\n     * @param x A numeric expression.\n     */\n    clz32(x: number): number;\n\n    /**\n     * Returns the result of 32-bit multiplication of two numbers.\n     * @param x First number\n     * @param y Second number\n     */\n    imul(x: number, y: number): number;\n\n    /**\n     * Returns the sign of the x, indicating whether x is positive, negative or zero.\n     * @param x The numeric expression to test\n     */\n    sign(x: number): number;\n\n    /**\n     * Returns the base 10 logarithm of a number.\n     * @param x A numeric expression.\n     */\n    log10(x: number): number;\n\n    /**\n     * Returns the base 2 logarithm of a number.\n     * @param x A numeric expression.\n     */\n    log2(x: number): number;\n\n    /**\n     * Returns the natural logarithm of 1 + x.\n     * @param x A numeric expression.\n     */\n    log1p(x: number): number;\n\n    /**\n     * Returns the result of (e^x - 1), which is an implementation-dependent approximation to\n     * subtracting 1 from the exponential function of x (e raised to the power of x, where e\n     * is the base of the natural logarithms).\n     * @param x A numeric expression.\n     */\n    expm1(x: number): number;\n\n    /**\n     * Returns the hyperbolic cosine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    cosh(x: number): number;\n\n    /**\n     * Returns the hyperbolic sine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    sinh(x: number): number;\n\n    /**\n     * Returns the hyperbolic tangent of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    tanh(x: number): number;\n\n    /**\n     * Returns the inverse hyperbolic cosine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    acosh(x: number): number;\n\n    /**\n     * Returns the inverse hyperbolic sine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    asinh(x: number): number;\n\n    /**\n     * Returns the inverse hyperbolic tangent of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    atanh(x: number): number;\n\n    /**\n     * Returns the square root of the sum of squares of its arguments.\n     * @param values Values to compute the square root for.\n     *     If no arguments are passed, the result is +0.\n     *     If there is only one argument, the result is the absolute value.\n     *     If any argument is +Infinity or -Infinity, the result is +Infinity.\n     *     If any argument is NaN, the result is NaN.\n     *     If all arguments are either +0 or \u22120, the result is +0.\n     */\n    hypot(...values: number[]): number;\n\n    /**\n     * Returns the integral part of the a numeric expression, x, removing any fractional digits.\n     * If x is already an integer, the result is x.\n     * @param x A numeric expression.\n     */\n    trunc(x: number): number;\n\n    /**\n     * Returns the nearest single precision float representation of a number.\n     * @param x A numeric expression.\n     */\n    fround(x: number): number;\n\n    /**\n     * Returns an implementation-dependent approximation to the cube root of number.\n     * @param x A numeric expression.\n     */\n    cbrt(x: number): number;\n}\n\ninterface NumberConstructor {\n    /**\n     * The value of Number.EPSILON is the difference between 1 and the smallest value greater than 1\n     * that is representable as a Number value, which is approximately:\n     * 2.2204460492503130808472633361816 x 10\u200D\u2212\u200D16.\n     */\n    readonly EPSILON: number;\n\n    /**\n     * Returns true if passed value is finite.\n     * Unlike the global isFinite, Number.isFinite doesn\'t forcibly convert the parameter to a\n     * number. Only finite values of the type number, result in true.\n     * @param number A numeric value.\n     */\n    isFinite(number: unknown): boolean;\n\n    /**\n     * Returns true if the value passed is an integer, false otherwise.\n     * @param number A numeric value.\n     */\n    isInteger(number: unknown): boolean;\n\n    /**\n     * Returns a Boolean value that indicates whether a value is the reserved value NaN (not a\n     * number). Unlike the global isNaN(), Number.isNaN() doesn\'t forcefully convert the parameter\n     * to a number. Only values of the type number, that are also NaN, result in true.\n     * @param number A numeric value.\n     */\n    isNaN(number: unknown): boolean;\n\n    /**\n     * Returns true if the value passed is a safe integer.\n     * @param number A numeric value.\n     */\n    isSafeInteger(number: unknown): boolean;\n\n    /**\n     * The value of the largest integer n such that n and n + 1 are both exactly representable as\n     * a Number value.\n     * The value of Number.MAX_SAFE_INTEGER is 9007199254740991 2^53 \u2212 1.\n     */\n    readonly MAX_SAFE_INTEGER: number;\n\n    /**\n     * The value of the smallest integer n such that n and n \u2212 1 are both exactly representable as\n     * a Number value.\n     * The value of Number.MIN_SAFE_INTEGER is \u22129007199254740991 (\u2212(2^53 \u2212 1)).\n     */\n    readonly MIN_SAFE_INTEGER: number;\n\n    /**\n     * Converts a string to a floating-point number.\n     * @param string A string that contains a floating-point number.\n     */\n    parseFloat(string: string): number;\n\n    /**\n     * Converts A string to an integer.\n     * @param string A string to convert into a number.\n     * @param radix A value between 2 and 36 that specifies the base of the number in `string`.\n     * If this argument is not supplied, strings with a prefix of \'0x\' are considered hexadecimal.\n     * All other strings are considered decimal.\n     */\n    parseInt(string: string, radix?: number): number;\n}\n\ninterface ObjectConstructor {\n    /**\n     * Copy the values of all of the enumerable own properties from one or more source objects to a\n     * target object. Returns the target object.\n     * @param target The target object to copy to.\n     * @param source The source object from which to copy properties.\n     */\n    assign<T extends {}, U>(target: T, source: U): T & U;\n\n    /**\n     * Copy the values of all of the enumerable own properties from one or more source objects to a\n     * target object. Returns the target object.\n     * @param target The target object to copy to.\n     * @param source1 The first source object from which to copy properties.\n     * @param source2 The second source object from which to copy properties.\n     */\n    assign<T extends {}, U, V>(target: T, source1: U, source2: V): T & U & V;\n\n    /**\n     * Copy the values of all of the enumerable own properties from one or more source objects to a\n     * target object. Returns the target object.\n     * @param target The target object to copy to.\n     * @param source1 The first source object from which to copy properties.\n     * @param source2 The second source object from which to copy properties.\n     * @param source3 The third source object from which to copy properties.\n     */\n    assign<T extends {}, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W;\n\n    /**\n     * Copy the values of all of the enumerable own properties from one or more source objects to a\n     * target object. Returns the target object.\n     * @param target The target object to copy to.\n     * @param sources One or more source objects from which to copy properties\n     */\n    assign(target: object, ...sources: any[]): any;\n\n    /**\n     * Returns an array of all symbol properties found directly on object o.\n     * @param o Object to retrieve the symbols from.\n     */\n    getOwnPropertySymbols(o: any): symbol[];\n\n    /**\n     * Returns the names of the enumerable string properties and methods of an object.\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    keys(o: {}): string[];\n\n    /**\n     * Returns true if the values are the same value, false otherwise.\n     * @param value1 The first value.\n     * @param value2 The second value.\n     */\n    is(value1: any, value2: any): boolean;\n\n    /**\n     * Sets the prototype of a specified object o to object proto or null. Returns the object o.\n     * @param o The object to change its prototype.\n     * @param proto The value of the new prototype or null.\n     */\n    setPrototypeOf(o: any, proto: object | null): any;\n}\n\ninterface ReadonlyArray<T> {\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find<S extends T>(predicate: (value: T, index: number, obj: readonly T[]) => value is S, thisArg?: any): S | undefined;\n    find(predicate: (value: T, index: number, obj: readonly T[]) => unknown, thisArg?: any): T | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: T, index: number, obj: readonly T[]) => unknown, thisArg?: any): number;\n\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string;\n}\n\ninterface RegExp {\n    /**\n     * Returns a string indicating the flags of the regular expression in question. This field is read-only.\n     * The characters in this string are sequenced and concatenated in the following order:\n     *\n     *    - "g" for global\n     *    - "i" for ignoreCase\n     *    - "m" for multiline\n     *    - "u" for unicode\n     *    - "y" for sticky\n     *\n     * If no flags are set, the value is the empty string.\n     */\n    readonly flags: string;\n\n    /**\n     * Returns a Boolean value indicating the state of the sticky flag (y) used with a regular\n     * expression. Default is false. Read-only.\n     */\n    readonly sticky: boolean;\n\n    /**\n     * Returns a Boolean value indicating the state of the Unicode flag (u) used with a regular\n     * expression. Default is false. Read-only.\n     */\n    readonly unicode: boolean;\n}\n\ninterface RegExpConstructor {\n    new (pattern: RegExp | string, flags?: string): RegExp;\n    (pattern: RegExp | string, flags?: string): RegExp;\n}\n\ninterface String {\n    /**\n     * Returns a nonnegative integer Number less than 1114112 (0x110000) that is the code point\n     * value of the UTF-16 encoded code point starting at the string element at position pos in\n     * the String resulting from converting this object to a String.\n     * If there is no element at that position, the result is undefined.\n     * If a valid UTF-16 surrogate pair does not begin at pos, the result is the code unit at pos.\n     */\n    codePointAt(pos: number): number | undefined;\n\n    /**\n     * Returns true if searchString appears as a substring of the result of converting this\n     * object to a String, at one or more positions that are\n     * greater than or equal to position; otherwise, returns false.\n     * @param searchString search string\n     * @param position If position is undefined, 0 is assumed, so as to search all of the String.\n     */\n    includes(searchString: string, position?: number): boolean;\n\n    /**\n     * Returns true if the sequence of elements of searchString converted to a String is the\n     * same as the corresponding elements of this object (converted to a String) starting at\n     * endPosition \u2013 length(this). Otherwise returns false.\n     */\n    endsWith(searchString: string, endPosition?: number): boolean;\n\n    /**\n     * Returns the String value result of normalizing the string into the normalization form\n     * named by form as specified in Unicode Standard Annex #15, Unicode Normalization Forms.\n     * @param form Applicable values: "NFC", "NFD", "NFKC", or "NFKD", If not specified default\n     * is "NFC"\n     */\n    normalize(form: "NFC" | "NFD" | "NFKC" | "NFKD"): string;\n\n    /**\n     * Returns the String value result of normalizing the string into the normalization form\n     * named by form as specified in Unicode Standard Annex #15, Unicode Normalization Forms.\n     * @param form Applicable values: "NFC", "NFD", "NFKC", or "NFKD", If not specified default\n     * is "NFC"\n     */\n    normalize(form?: string): string;\n\n    /**\n     * Returns a String value that is made from count copies appended together. If count is 0,\n     * the empty string is returned.\n     * @param count number of copies to append\n     */\n    repeat(count: number): string;\n\n    /**\n     * Returns true if the sequence of elements of searchString converted to a String is the\n     * same as the corresponding elements of this object (converted to a String) starting at\n     * position. Otherwise returns false.\n     */\n    startsWith(searchString: string, position?: number): boolean;\n\n    /**\n     * Returns an `<a>` HTML anchor element and sets the name attribute to the text value\n     * @deprecated A legacy feature for browser compatibility\n     * @param name\n     */\n    anchor(name: string): string;\n\n    /**\n     * Returns a `<big>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    big(): string;\n\n    /**\n     * Returns a `<blink>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    blink(): string;\n\n    /**\n     * Returns a `<b>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    bold(): string;\n\n    /**\n     * Returns a `<tt>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    fixed(): string;\n\n    /**\n     * Returns a `<font>` HTML element and sets the color attribute value\n     * @deprecated A legacy feature for browser compatibility\n     */\n    fontcolor(color: string): string;\n\n    /**\n     * Returns a `<font>` HTML element and sets the size attribute value\n     * @deprecated A legacy feature for browser compatibility\n     */\n    fontsize(size: number): string;\n\n    /**\n     * Returns a `<font>` HTML element and sets the size attribute value\n     * @deprecated A legacy feature for browser compatibility\n     */\n    fontsize(size: string): string;\n\n    /**\n     * Returns an `<i>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    italics(): string;\n\n    /**\n     * Returns an `<a>` HTML element and sets the href attribute value\n     * @deprecated A legacy feature for browser compatibility\n     */\n    link(url: string): string;\n\n    /**\n     * Returns a `<small>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    small(): string;\n\n    /**\n     * Returns a `<strike>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    strike(): string;\n\n    /**\n     * Returns a `<sub>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    sub(): string;\n\n    /**\n     * Returns a `<sup>` HTML element\n     * @deprecated A legacy feature for browser compatibility\n     */\n    sup(): string;\n}\n\ninterface StringConstructor {\n    /**\n     * Return the String value whose elements are, in order, the elements in the List elements.\n     * If length is 0, the empty string is returned.\n     */\n    fromCodePoint(...codePoints: number[]): string;\n\n    /**\n     * String.raw is usually used as a tag function of a Tagged Template String. When called as\n     * such, the first argument will be a well formed template call site object and the rest\n     * parameter will contain the substitution values. It can also be called directly, for example,\n     * to interleave strings and values from your own tag function, and in this case the only thing\n     * it needs from the first argument is the raw property.\n     * @param template A well-formed template string call site representation.\n     * @param substitutions A set of substitution values.\n     */\n    raw(template: { raw: readonly string[] | ArrayLike<string>; }, ...substitutions: any[]): string;\n}\n\ninterface Int8Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Uint8Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Int16Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Uint16Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Int32Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Uint32Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Float32Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Float64Array<TArrayBuffer extends ArrayBufferLike> {\n    toLocaleString(locales: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n',
  "lib.es2015.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es5" />\n/// <reference lib="es2015.core" />\n/// <reference lib="es2015.collection" />\n/// <reference lib="es2015.iterable" />\n/// <reference lib="es2015.generator" />\n/// <reference lib="es2015.promise" />\n/// <reference lib="es2015.proxy" />\n/// <reference lib="es2015.reflect" />\n/// <reference lib="es2015.symbol" />\n/// <reference lib="es2015.symbol.wellknown" />\n',
  "lib.es2015.generator.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

/// <reference lib="es2015.iterable" />

interface Generator<T = unknown, TReturn = any, TNext = any> extends IteratorObject<T, TReturn, TNext> {
    // NOTE: 'next' is defined using a tuple to ensure we report the correct assignability errors in all places.
    next(...[value]: [] | [TNext]): IteratorResult<T, TReturn>;
    return(value: TReturn): IteratorResult<T, TReturn>;
    throw(e: any): IteratorResult<T, TReturn>;
    [Symbol.iterator](): Generator<T, TReturn, TNext>;
}

interface GeneratorFunction {
    /**
     * Creates a new Generator object.
     * @param args A list of arguments the function accepts.
     */
    new (...args: any[]): Generator;
    /**
     * Creates a new Generator object.
     * @param args A list of arguments the function accepts.
     */
    (...args: any[]): Generator;
    /**
     * The length of the arguments.
     */
    readonly length: number;
    /**
     * Returns the name of the function.
     */
    readonly name: string;
    /**
     * A reference to the prototype.
     */
    readonly prototype: Generator;
}

interface GeneratorFunctionConstructor {
    /**
     * Creates a new Generator function.
     * @param args A list of arguments the function accepts.
     */
    new (...args: string[]): GeneratorFunction;
    /**
     * Creates a new Generator function.
     * @param args A list of arguments the function accepts.
     */
    (...args: string[]): GeneratorFunction;
    /**
     * The length of the arguments.
     */
    readonly length: number;
    /**
     * Returns the name of the function.
     */
    readonly name: string;
    /**
     * A reference to the prototype.
     */
    readonly prototype: GeneratorFunction;
}
`,
  "lib.es2015.iterable.d.ts": "/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the \"License\"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib=\"true\"/>\n\n/// <reference lib=\"es2015.symbol\" />\n\ninterface SymbolConstructor {\n    /**\n     * A method that returns the default iterator for an object. Called by the semantics of the\n     * for-of statement.\n     */\n    readonly iterator: unique symbol;\n}\n\ninterface IteratorYieldResult<TYield> {\n    done?: false;\n    value: TYield;\n}\n\ninterface IteratorReturnResult<TReturn> {\n    done: true;\n    value: TReturn;\n}\n\ntype IteratorResult<T, TReturn = any> = IteratorYieldResult<T> | IteratorReturnResult<TReturn>;\n\ninterface Iterator<T, TReturn = any, TNext = any> {\n    // NOTE: 'next' is defined using a tuple to ensure we report the correct assignability errors in all places.\n    next(...[value]: [] | [TNext]): IteratorResult<T, TReturn>;\n    return?(value?: TReturn): IteratorResult<T, TReturn>;\n    throw?(e?: any): IteratorResult<T, TReturn>;\n}\n\ninterface Iterable<T, TReturn = any, TNext = any> {\n    [Symbol.iterator](): Iterator<T, TReturn, TNext>;\n}\n\n/**\n * Describes a user-defined {@link Iterator} that is also iterable.\n */\ninterface IterableIterator<T, TReturn = any, TNext = any> extends Iterator<T, TReturn, TNext> {\n    [Symbol.iterator](): IterableIterator<T, TReturn, TNext>;\n}\n\n/**\n * Describes an {@link Iterator} produced by the runtime that inherits from the intrinsic `Iterator.prototype`.\n */\ninterface IteratorObject<T, TReturn = unknown, TNext = unknown> extends Iterator<T, TReturn, TNext> {\n    [Symbol.iterator](): IteratorObject<T, TReturn, TNext>;\n}\n\n/**\n * Defines the `TReturn` type used for built-in iterators produced by `Array`, `Map`, `Set`, and others.\n * This is `undefined` when `strictBuiltInIteratorReturn` is `true`; otherwise, this is `any`.\n */\ntype BuiltinIteratorReturn = intrinsic;\n\ninterface ArrayIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n    [Symbol.iterator](): ArrayIterator<T>;\n}\n\ninterface Array<T> {\n    /** Iterator */\n    [Symbol.iterator](): ArrayIterator<T>;\n\n    /**\n     * Returns an iterable of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, T]>;\n\n    /**\n     * Returns an iterable of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an iterable of values in the array\n     */\n    values(): ArrayIterator<T>;\n}\n\ninterface ArrayConstructor {\n    /**\n     * Creates an array from an iterable object.\n     * @param iterable An iterable object to convert to an array.\n     */\n    from<T>(iterable: Iterable<T> | ArrayLike<T>): T[];\n\n    /**\n     * Creates an array from an iterable object.\n     * @param iterable An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T, U>(iterable: Iterable<T> | ArrayLike<T>, mapfn: (v: T, k: number) => U, thisArg?: any): U[];\n}\n\ninterface ReadonlyArray<T> {\n    /** Iterator of values in the array. */\n    [Symbol.iterator](): ArrayIterator<T>;\n\n    /**\n     * Returns an iterable of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, T]>;\n\n    /**\n     * Returns an iterable of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an iterable of values in the array\n     */\n    values(): ArrayIterator<T>;\n}\n\ninterface IArguments {\n    /** Iterator */\n    [Symbol.iterator](): ArrayIterator<any>;\n}\n\ninterface MapIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n    [Symbol.iterator](): MapIterator<T>;\n}\n\ninterface Map<K, V> {\n    /** Returns an iterable of entries in the map. */\n    [Symbol.iterator](): MapIterator<[K, V]>;\n\n    /**\n     * Returns an iterable of key, value pairs for every entry in the map.\n     */\n    entries(): MapIterator<[K, V]>;\n\n    /**\n     * Returns an iterable of keys in the map\n     */\n    keys(): MapIterator<K>;\n\n    /**\n     * Returns an iterable of values in the map\n     */\n    values(): MapIterator<V>;\n}\n\ninterface ReadonlyMap<K, V> {\n    /** Returns an iterable of entries in the map. */\n    [Symbol.iterator](): MapIterator<[K, V]>;\n\n    /**\n     * Returns an iterable of key, value pairs for every entry in the map.\n     */\n    entries(): MapIterator<[K, V]>;\n\n    /**\n     * Returns an iterable of keys in the map\n     */\n    keys(): MapIterator<K>;\n\n    /**\n     * Returns an iterable of values in the map\n     */\n    values(): MapIterator<V>;\n}\n\ninterface MapConstructor {\n    new (): Map<any, any>;\n    new <K, V>(iterable?: Iterable<readonly [K, V]> | null): Map<K, V>;\n}\n\ninterface WeakMap<K extends WeakKey, V> {}\n\ninterface WeakMapConstructor {\n    new <K extends WeakKey, V>(iterable: Iterable<readonly [K, V]>): WeakMap<K, V>;\n}\n\ninterface SetIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n    [Symbol.iterator](): SetIterator<T>;\n}\n\ninterface Set<T> {\n    /** Iterates over values in the set. */\n    [Symbol.iterator](): SetIterator<T>;\n\n    /**\n     * Returns an iterable of [v,v] pairs for every value `v` in the set.\n     */\n    entries(): SetIterator<[T, T]>;\n\n    /**\n     * Despite its name, returns an iterable of the values in the set.\n     */\n    keys(): SetIterator<T>;\n\n    /**\n     * Returns an iterable of values in the set.\n     */\n    values(): SetIterator<T>;\n}\n\ninterface ReadonlySet<T> {\n    /** Iterates over values in the set. */\n    [Symbol.iterator](): SetIterator<T>;\n\n    /**\n     * Returns an iterable of [v,v] pairs for every value `v` in the set.\n     */\n    entries(): SetIterator<[T, T]>;\n\n    /**\n     * Despite its name, returns an iterable of the values in the set.\n     */\n    keys(): SetIterator<T>;\n\n    /**\n     * Returns an iterable of values in the set.\n     */\n    values(): SetIterator<T>;\n}\n\ninterface SetConstructor {\n    new <T>(iterable?: Iterable<T> | null): Set<T>;\n}\n\ninterface WeakSet<T extends WeakKey> {}\n\ninterface WeakSetConstructor {\n    new <T extends WeakKey = WeakKey>(iterable: Iterable<T>): WeakSet<T>;\n}\n\ninterface Promise<T> {}\n\ninterface PromiseConstructor {\n    /**\n     * Creates a Promise that is resolved with an array of results when all of the provided Promises\n     * resolve, or rejected when any Promise is rejected.\n     * @param values An iterable of Promises.\n     * @returns A new Promise.\n     */\n    all<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>[]>;\n\n    /**\n     * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved\n     * or rejected.\n     * @param values An iterable of Promises.\n     * @returns A new Promise.\n     */\n    race<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;\n}\n\ninterface StringIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n    [Symbol.iterator](): StringIterator<T>;\n}\n\ninterface String {\n    /** Iterator */\n    [Symbol.iterator](): StringIterator<string>;\n}\n\ninterface Int8Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Int8ArrayConstructor {\n    new (elements: Iterable<number>): Int8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Int8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Int8Array<ArrayBuffer>;\n}\n\ninterface Uint8Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Uint8ArrayConstructor {\n    new (elements: Iterable<number>): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Uint8Array<ArrayBuffer>;\n}\n\ninterface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Uint8ClampedArrayConstructor {\n    new (elements: Iterable<number>): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Uint8ClampedArray<ArrayBuffer>;\n}\n\ninterface Int16Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Int16ArrayConstructor {\n    new (elements: Iterable<number>): Int16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Int16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Int16Array<ArrayBuffer>;\n}\n\ninterface Uint16Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Uint16ArrayConstructor {\n    new (elements: Iterable<number>): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Uint16Array<ArrayBuffer>;\n}\n\ninterface Int32Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Int32ArrayConstructor {\n    new (elements: Iterable<number>): Int32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Int32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Int32Array<ArrayBuffer>;\n}\n\ninterface Uint32Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Uint32ArrayConstructor {\n    new (elements: Iterable<number>): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Uint32Array<ArrayBuffer>;\n}\n\ninterface Float32Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Float32ArrayConstructor {\n    new (elements: Iterable<number>): Float32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Float32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Float32Array<ArrayBuffer>;\n}\n\ninterface Float64Array<TArrayBuffer extends ArrayBufferLike> {\n    [Symbol.iterator](): ArrayIterator<number>;\n\n    /**\n     * Returns an array of key, value pairs for every entry in the array\n     */\n    entries(): ArrayIterator<[number, number]>;\n\n    /**\n     * Returns an list of keys in the array\n     */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns an list of values in the array\n     */\n    values(): ArrayIterator<number>;\n}\n\ninterface Float64ArrayConstructor {\n    new (elements: Iterable<number>): Float64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<number>): Float64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of 'this' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: any): Float64Array<ArrayBuffer>;\n}\n",
  "lib.es2015.promise.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface PromiseConstructor {\n    /**\n     * A reference to the prototype.\n     */\n    readonly prototype: Promise<any>;\n\n    /**\n     * Creates a new Promise.\n     * @param executor A callback used to initialize the promise. This callback is passed two arguments:\n     * a resolve callback used to resolve the promise with a value or the result of another promise,\n     * and a reject callback used to reject the promise with a provided reason or error.\n     */\n    new <T>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;\n\n    /**\n     * Creates a Promise that is resolved with an array of results when all of the provided Promises\n     * resolve, or rejected when any Promise is rejected.\n     * @param values An array of Promises.\n     * @returns A new Promise.\n     */\n    all<T extends readonly unknown[] | []>(values: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]>; }>;\n\n    // see: lib.es2015.iterable.d.ts\n    // all<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>[]>;\n\n    /**\n     * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved\n     * or rejected.\n     * @param values An array of Promises.\n     * @returns A new Promise.\n     */\n    race<T extends readonly unknown[] | []>(values: T): Promise<Awaited<T[number]>>;\n\n    // see: lib.es2015.iterable.d.ts\n    // race<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;\n\n    /**\n     * Creates a new rejected promise for the provided reason.\n     * @param reason The reason the promise was rejected.\n     * @returns A new rejected Promise.\n     */\n    reject<T = never>(reason?: any): Promise<T>;\n\n    /**\n     * Creates a new resolved promise.\n     * @returns A resolved promise.\n     */\n    resolve(): Promise<void>;\n    /**\n     * Creates a new resolved promise for the provided value.\n     * @param value A promise.\n     * @returns A promise whose internal state matches the provided promise.\n     */\n    resolve<T>(value: T): Promise<Awaited<T>>;\n    /**\n     * Creates a new resolved promise for the provided value.\n     * @param value A promise.\n     * @returns A promise whose internal state matches the provided promise.\n     */\n    resolve<T>(value: T | PromiseLike<T>): Promise<Awaited<T>>;\n}\n\ndeclare var Promise: PromiseConstructor;\n',
  "lib.es2015.proxy.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface ProxyHandler<T extends object> {\n    /**\n     * A trap method for a function call.\n     * @param target The original callable object which is being proxied.\n     */\n    apply?(target: T, thisArg: any, argArray: any[]): any;\n\n    /**\n     * A trap for the `new` operator.\n     * @param target The original object which is being proxied.\n     * @param newTarget The constructor that was originally called.\n     */\n    construct?(target: T, argArray: any[], newTarget: Function): object;\n\n    /**\n     * A trap for `Object.defineProperty()`.\n     * @param target The original object which is being proxied.\n     * @returns A `Boolean` indicating whether or not the property has been defined.\n     */\n    defineProperty?(target: T, property: string | symbol, attributes: PropertyDescriptor): boolean;\n\n    /**\n     * A trap for the `delete` operator.\n     * @param target The original object which is being proxied.\n     * @param p The name or `Symbol` of the property to delete.\n     * @returns A `Boolean` indicating whether or not the property was deleted.\n     */\n    deleteProperty?(target: T, p: string | symbol): boolean;\n\n    /**\n     * A trap for getting a property value.\n     * @param target The original object which is being proxied.\n     * @param p The name or `Symbol` of the property to get.\n     * @param receiver The proxy or an object that inherits from the proxy.\n     */\n    get?(target: T, p: string | symbol, receiver: any): any;\n\n    /**\n     * A trap for `Object.getOwnPropertyDescriptor()`.\n     * @param target The original object which is being proxied.\n     * @param p The name of the property whose description should be retrieved.\n     */\n    getOwnPropertyDescriptor?(target: T, p: string | symbol): PropertyDescriptor | undefined;\n\n    /**\n     * A trap for the `[[GetPrototypeOf]]` internal method.\n     * @param target The original object which is being proxied.\n     */\n    getPrototypeOf?(target: T): object | null;\n\n    /**\n     * A trap for the `in` operator.\n     * @param target The original object which is being proxied.\n     * @param p The name or `Symbol` of the property to check for existence.\n     */\n    has?(target: T, p: string | symbol): boolean;\n\n    /**\n     * A trap for `Object.isExtensible()`.\n     * @param target The original object which is being proxied.\n     */\n    isExtensible?(target: T): boolean;\n\n    /**\n     * A trap for `Reflect.ownKeys()`.\n     * @param target The original object which is being proxied.\n     */\n    ownKeys?(target: T): ArrayLike<string | symbol>;\n\n    /**\n     * A trap for `Object.preventExtensions()`.\n     * @param target The original object which is being proxied.\n     */\n    preventExtensions?(target: T): boolean;\n\n    /**\n     * A trap for setting a property value.\n     * @param target The original object which is being proxied.\n     * @param p The name or `Symbol` of the property to set.\n     * @param receiver The object to which the assignment was originally directed.\n     * @returns A `Boolean` indicating whether or not the property was set.\n     */\n    set?(target: T, p: string | symbol, newValue: any, receiver: any): boolean;\n\n    /**\n     * A trap for `Object.setPrototypeOf()`.\n     * @param target The original object which is being proxied.\n     * @param newPrototype The object\'s new prototype or `null`.\n     */\n    setPrototypeOf?(target: T, v: object | null): boolean;\n}\n\ninterface ProxyConstructor {\n    /**\n     * Creates a revocable Proxy object.\n     * @param target A target object to wrap with Proxy.\n     * @param handler An object whose properties define the behavior of Proxy when an operation is attempted on it.\n     */\n    revocable<T extends object>(target: T, handler: ProxyHandler<T>): { proxy: T; revoke: () => void; };\n\n    /**\n     * Creates a Proxy object. The Proxy object allows you to create an object that can be used in place of the\n     * original object, but which may redefine fundamental Object operations like getting, setting, and defining\n     * properties. Proxy objects are commonly used to log property accesses, validate, format, or sanitize inputs.\n     * @param target A target object to wrap with Proxy.\n     * @param handler An object whose properties define the behavior of Proxy when an operation is attempted on it.\n     */\n    new <T extends object>(target: T, handler: ProxyHandler<T>): T;\n}\ndeclare var Proxy: ProxyConstructor;\n',
  "lib.es2015.reflect.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Reflect {\n    /**\n     * Calls the function with the specified object as the this value\n     * and the elements of specified array as the arguments.\n     * @param target The function to call.\n     * @param thisArgument The object to be used as the this object.\n     * @param argumentsList An array of argument values to be passed to the function.\n     */\n    function apply<T, A extends readonly any[], R>(\n        target: (this: T, ...args: A) => R,\n        thisArgument: T,\n        argumentsList: Readonly<A>,\n    ): R;\n    function apply(target: Function, thisArgument: any, argumentsList: ArrayLike<any>): any;\n\n    /**\n     * Constructs the target with the elements of specified array as the arguments\n     * and the specified constructor as the `new.target` value.\n     * @param target The constructor to invoke.\n     * @param argumentsList An array of argument values to be passed to the constructor.\n     * @param newTarget The constructor to be used as the `new.target` object.\n     */\n    function construct<A extends readonly any[], R>(\n        target: new (...args: A) => R,\n        argumentsList: Readonly<A>,\n        newTarget?: new (...args: any) => any,\n    ): R;\n    function construct(target: Function, argumentsList: ArrayLike<any>, newTarget?: Function): any;\n\n    /**\n     * Adds a property to an object, or modifies attributes of an existing property.\n     * @param target Object on which to add or modify the property. This can be a native JavaScript object\n     *        (that is, a user-defined object or a built in object) or a DOM object.\n     * @param propertyKey The property name.\n     * @param attributes Descriptor for the property. It can be for a data property or an accessor property.\n     */\n    function defineProperty(target: object, propertyKey: PropertyKey, attributes: PropertyDescriptor & ThisType<any>): boolean;\n\n    /**\n     * Removes a property from an object, equivalent to `delete target[propertyKey]`,\n     * except it won\'t throw if `target[propertyKey]` is non-configurable.\n     * @param target Object from which to remove the own property.\n     * @param propertyKey The property name.\n     */\n    function deleteProperty(target: object, propertyKey: PropertyKey): boolean;\n\n    /**\n     * Gets the property of target, equivalent to `target[propertyKey]` when `receiver === target`.\n     * @param target Object that contains the property on itself or in its prototype chain.\n     * @param propertyKey The property name.\n     * @param receiver The reference to use as the `this` value in the getter function,\n     *        if `target[propertyKey]` is an accessor property.\n     */\n    function get<T extends object, P extends PropertyKey>(\n        target: T,\n        propertyKey: P,\n        receiver?: unknown,\n    ): P extends keyof T ? T[P] : any;\n\n    /**\n     * Gets the own property descriptor of the specified object.\n     * An own property descriptor is one that is defined directly on the object and is not inherited from the object\'s prototype.\n     * @param target Object that contains the property.\n     * @param propertyKey The property name.\n     */\n    function getOwnPropertyDescriptor<T extends object, P extends PropertyKey>(\n        target: T,\n        propertyKey: P,\n    ): TypedPropertyDescriptor<P extends keyof T ? T[P] : any> | undefined;\n\n    /**\n     * Returns the prototype of an object.\n     * @param target The object that references the prototype.\n     */\n    function getPrototypeOf(target: object): object | null;\n\n    /**\n     * Equivalent to `propertyKey in target`.\n     * @param target Object that contains the property on itself or in its prototype chain.\n     * @param propertyKey Name of the property.\n     */\n    function has(target: object, propertyKey: PropertyKey): boolean;\n\n    /**\n     * Returns a value that indicates whether new properties can be added to an object.\n     * @param target Object to test.\n     */\n    function isExtensible(target: object): boolean;\n\n    /**\n     * Returns the string and symbol keys of the own properties of an object. The own properties of an object\n     * are those that are defined directly on that object, and are not inherited from the object\'s prototype.\n     * @param target Object that contains the own properties.\n     */\n    function ownKeys(target: object): (string | symbol)[];\n\n    /**\n     * Prevents the addition of new properties to an object.\n     * @param target Object to make non-extensible.\n     * @return Whether the object has been made non-extensible.\n     */\n    function preventExtensions(target: object): boolean;\n\n    /**\n     * Sets the property of target, equivalent to `target[propertyKey] = value` when `receiver === target`.\n     * @param target Object that contains the property on itself or in its prototype chain.\n     * @param propertyKey Name of the property.\n     * @param receiver The reference to use as the `this` value in the setter function,\n     *        if `target[propertyKey]` is an accessor property.\n     */\n    function set<T extends object, P extends PropertyKey>(\n        target: T,\n        propertyKey: P,\n        value: P extends keyof T ? T[P] : any,\n        receiver?: any,\n    ): boolean;\n    function set(target: object, propertyKey: PropertyKey, value: any, receiver?: any): boolean;\n\n    /**\n     * Sets the prototype of a specified object o to object proto or null.\n     * @param target The object to change its prototype.\n     * @param proto The value of the new prototype or null.\n     * @return Whether setting the prototype was successful.\n     */\n    function setPrototypeOf(target: object, proto: object | null): boolean;\n}\n',
  "lib.es2015.symbol.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface SymbolConstructor {\n    /**\n     * A reference to the prototype.\n     */\n    readonly prototype: Symbol;\n\n    /**\n     * Returns a new unique Symbol value.\n     * @param  description Description of the new Symbol object.\n     */\n    (description?: string | number): symbol;\n\n    /**\n     * Returns a Symbol object from the global symbol registry matching the given key if found.\n     * Otherwise, returns a new symbol with this key.\n     * @param key key to search for.\n     */\n    for(key: string): symbol;\n\n    /**\n     * Returns a key from the global symbol registry matching the given Symbol if found.\n     * Otherwise, returns a undefined.\n     * @param sym Symbol to find the key for.\n     */\n    keyFor(sym: symbol): string | undefined;\n}\n\ndeclare var Symbol: SymbolConstructor;\n',
  "lib.es2015.symbol.wellknown.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

/// <reference lib="es2015.symbol" />

interface SymbolConstructor {
    /**
     * A method that determines if a constructor object recognizes an object as one of the
     * constructor\u2019s instances. Called by the semantics of the instanceof operator.
     */
    readonly hasInstance: unique symbol;

    /**
     * A Boolean value that if true indicates that an object should flatten to its array elements
     * by Array.prototype.concat.
     */
    readonly isConcatSpreadable: unique symbol;

    /**
     * A regular expression method that matches the regular expression against a string. Called
     * by the String.prototype.match method.
     */
    readonly match: unique symbol;

    /**
     * A regular expression method that replaces matched substrings of a string. Called by the
     * String.prototype.replace method.
     */
    readonly replace: unique symbol;

    /**
     * A regular expression method that returns the index within a string that matches the
     * regular expression. Called by the String.prototype.search method.
     */
    readonly search: unique symbol;

    /**
     * A function valued property that is the constructor function that is used to create
     * derived objects.
     */
    readonly species: unique symbol;

    /**
     * A regular expression method that splits a string at the indices that match the regular
     * expression. Called by the String.prototype.split method.
     */
    readonly split: unique symbol;

    /**
     * A method that converts an object to a corresponding primitive value.
     * Called by the ToPrimitive abstract operation.
     */
    readonly toPrimitive: unique symbol;

    /**
     * A String value that is used in the creation of the default string description of an object.
     * Called by the built-in method Object.prototype.toString.
     */
    readonly toStringTag: unique symbol;

    /**
     * An Object whose truthy properties are properties that are excluded from the 'with'
     * environment bindings of the associated objects.
     */
    readonly unscopables: unique symbol;
}

interface Symbol {
    /**
     * Converts a Symbol object to a symbol.
     */
    [Symbol.toPrimitive](hint: string): symbol;

    readonly [Symbol.toStringTag]: string;
}

interface Array<T> {
    /**
     * Is an object whose properties have the value 'true'
     * when they will be absent when used in a 'with' statement.
     */
    readonly [Symbol.unscopables]: {
        [K in keyof any[]]?: boolean;
    };
}

interface ReadonlyArray<T> {
    /**
     * Is an object whose properties have the value 'true'
     * when they will be absent when used in a 'with' statement.
     */
    readonly [Symbol.unscopables]: {
        [K in keyof readonly any[]]?: boolean;
    };
}

interface Date {
    /**
     * Converts a Date object to a string.
     */
    [Symbol.toPrimitive](hint: "default"): string;
    /**
     * Converts a Date object to a string.
     */
    [Symbol.toPrimitive](hint: "string"): string;
    /**
     * Converts a Date object to a number.
     */
    [Symbol.toPrimitive](hint: "number"): number;
    /**
     * Converts a Date object to a string or number.
     *
     * @param hint The strings "number", "string", or "default" to specify what primitive to return.
     *
     * @throws {TypeError} If 'hint' was given something other than "number", "string", or "default".
     * @returns A number if 'hint' was "number", a string if 'hint' was "string" or "default".
     */
    [Symbol.toPrimitive](hint: string): string | number;
}

interface Map<K, V> {
    readonly [Symbol.toStringTag]: string;
}

interface WeakMap<K extends WeakKey, V> {
    readonly [Symbol.toStringTag]: string;
}

interface Set<T> {
    readonly [Symbol.toStringTag]: string;
}

interface WeakSet<T extends WeakKey> {
    readonly [Symbol.toStringTag]: string;
}

interface JSON {
    readonly [Symbol.toStringTag]: string;
}

interface Function {
    /**
     * Determines whether the given value inherits from this function if this function was used
     * as a constructor function.
     *
     * A constructor function can control which objects are recognized as its instances by
     * 'instanceof' by overriding this method.
     */
    [Symbol.hasInstance](value: any): boolean;
}

interface GeneratorFunction {
    readonly [Symbol.toStringTag]: string;
}

interface Math {
    readonly [Symbol.toStringTag]: string;
}

interface Promise<T> {
    readonly [Symbol.toStringTag]: string;
}

interface PromiseConstructor {
    readonly [Symbol.species]: PromiseConstructor;
}

interface RegExp {
    /**
     * Matches a string with this regular expression, and returns an array containing the results of
     * that search.
     * @param string A string to search within.
     */
    [Symbol.match](string: string): RegExpMatchArray | null;

    /**
     * Replaces text in a string, using this regular expression.
     * @param string A String object or string literal whose contents matching against
     *               this regular expression will be replaced
     * @param replaceValue A String object or string literal containing the text to replace for every
     *                     successful match of this regular expression.
     */
    [Symbol.replace](string: string, replaceValue: string): string;

    /**
     * Replaces text in a string, using this regular expression.
     * @param string A String object or string literal whose contents matching against
     *               this regular expression will be replaced
     * @param replacer A function that returns the replacement text.
     */
    [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string;

    /**
     * Finds the position beginning first substring match in a regular expression search
     * using this regular expression.
     *
     * @param string The string to search within.
     */
    [Symbol.search](string: string): number;

    /**
     * Returns an array of substrings that were delimited by strings in the original input that
     * match against this regular expression.
     *
     * If the regular expression contains capturing parentheses, then each time this
     * regular expression matches, the results (including any undefined results) of the
     * capturing parentheses are spliced.
     *
     * @param string string value to split
     * @param limit if not undefined, the output array is truncated so that it contains no more
     * than 'limit' elements.
     */
    [Symbol.split](string: string, limit?: number): string[];
}

interface RegExpConstructor {
    readonly [Symbol.species]: RegExpConstructor;
}

interface String {
    /**
     * Matches a string or an object that supports being matched against, and returns an array
     * containing the results of that search, or null if no matches are found.
     * @param matcher An object that supports being matched against.
     */
    match(matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null;

    /**
     * Passes a string and {@linkcode replaceValue} to the \`[Symbol.replace]\` method on {@linkcode searchValue}. This method is expected to implement its own replacement algorithm.
     * @param searchValue An object that supports searching for and replacing matches within a string.
     * @param replaceValue The replacement text.
     */
    replace(searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string;

    /**
     * Replaces text in a string, using an object that supports replacement within a string.
     * @param searchValue A object can search for and replace matches within a string.
     * @param replacer A function that returns the replacement text.
     */
    replace(searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string;

    /**
     * Finds the first substring match in a regular expression search.
     * @param searcher An object which supports searching within a string.
     */
    search(searcher: { [Symbol.search](string: string): number; }): number;

    /**
     * Split a string into substrings using the specified separator and return them as an array.
     * @param splitter An object that can split a string.
     * @param limit A value used to limit the number of elements returned in the array.
     */
    split(splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[];
}

interface ArrayBuffer {
    readonly [Symbol.toStringTag]: "ArrayBuffer";
}

interface DataView<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: string;
}

interface Int8Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Int8Array";
}

interface Uint8Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Uint8Array";
}

interface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Uint8ClampedArray";
}

interface Int16Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Int16Array";
}

interface Uint16Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Uint16Array";
}

interface Int32Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Int32Array";
}

interface Uint32Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Uint32Array";
}

interface Float32Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Float32Array";
}

interface Float64Array<TArrayBuffer extends ArrayBufferLike> {
    readonly [Symbol.toStringTag]: "Float64Array";
}

interface ArrayConstructor {
    readonly [Symbol.species]: ArrayConstructor;
}
interface MapConstructor {
    readonly [Symbol.species]: MapConstructor;
}
interface SetConstructor {
    readonly [Symbol.species]: SetConstructor;
}
interface ArrayBufferConstructor {
    readonly [Symbol.species]: ArrayBufferConstructor;
}
`,
  "lib.es2016.array.include.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Array<T> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: T, fromIndex?: number): boolean;\n}\n\ninterface ReadonlyArray<T> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: T, fromIndex?: number): boolean;\n}\n\ninterface Int8Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Uint8Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Int16Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Uint16Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Int32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Uint32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Float32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n\ninterface Float64Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: number, fromIndex?: number): boolean;\n}\n',
  "lib.es2016.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2015" />\n/// <reference lib="es2016.array.include" />\n/// <reference lib="es2016.intl" />\n',
  "lib.es2016.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    /**\n     * The `Intl.getCanonicalLocales()` method returns an array containing\n     * the canonical locale names. Duplicates will be omitted and elements\n     * will be validated as structurally valid language tags.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/getCanonicalLocales)\n     *\n     * @param locale A list of String values for which to get the canonical locale names\n     * @returns An array containing the canonical and validated locale names.\n     */\n    function getCanonicalLocales(locale?: string | readonly string[]): string[];\n}\n',
  "lib.es2017.arraybuffer.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface ArrayBufferConstructor {\n    new (): ArrayBuffer;\n}\n',
  "lib.es2017.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2016" />\n/// <reference lib="es2017.arraybuffer" />\n/// <reference lib="es2017.date" />\n/// <reference lib="es2017.intl" />\n/// <reference lib="es2017.object" />\n/// <reference lib="es2017.sharedmemory" />\n/// <reference lib="es2017.string" />\n/// <reference lib="es2017.typedarrays" />\n',
  "lib.es2017.date.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface DateConstructor {\n    /**\n     * Returns the number of milliseconds between midnight, January 1, 1970 Universal Coordinated Time (UTC) (or GMT) and the specified date.\n     * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.\n     * @param monthIndex The month as a number between 0 and 11 (January to December).\n     * @param date The date as a number between 1 and 31.\n     * @param hours Must be supplied if minutes is supplied. A number from 0 to 23 (midnight to 11pm) that specifies the hour.\n     * @param minutes Must be supplied if seconds is supplied. A number from 0 to 59 that specifies the minutes.\n     * @param seconds Must be supplied if milliseconds is supplied. A number from 0 to 59 that specifies the seconds.\n     * @param ms A number from 0 to 999 that specifies the milliseconds.\n     */\n    UTC(year: number, monthIndex?: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;\n}\n',
  "lib.es2017.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    interface DateTimeFormatPartTypesRegistry {\n        day: any;\n        dayPeriod: any;\n        era: any;\n        hour: any;\n        literal: any;\n        minute: any;\n        month: any;\n        second: any;\n        timeZoneName: any;\n        weekday: any;\n        year: any;\n    }\n\n    type DateTimeFormatPartTypes = keyof DateTimeFormatPartTypesRegistry;\n\n    interface DateTimeFormatPart {\n        type: DateTimeFormatPartTypes;\n        value: string;\n    }\n\n    interface DateTimeFormat {\n        formatToParts(date?: Date | number): DateTimeFormatPart[];\n    }\n}\n',
  "lib.es2017.object.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface ObjectConstructor {\n    /**\n     * Returns an array of values of the enumerable own properties of an object\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    values<T>(o: { [s: string]: T; } | ArrayLike<T>): T[];\n\n    /**\n     * Returns an array of values of the enumerable own properties of an object\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    values(o: {}): any[];\n\n    /**\n     * Returns an array of key/values of the enumerable own properties of an object\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    entries<T>(o: { [s: string]: T; } | ArrayLike<T>): [string, T][];\n\n    /**\n     * Returns an array of key/values of the enumerable own properties of an object\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    entries(o: {}): [string, any][];\n\n    /**\n     * Returns an object containing all own property descriptors of an object\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    getOwnPropertyDescriptors<T>(o: T): { [P in keyof T]: TypedPropertyDescriptor<T[P]>; } & { [x: string]: PropertyDescriptor; };\n}\n',
  "lib.es2017.sharedmemory.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2015.symbol" />\n/// <reference lib="es2015.symbol.wellknown" />\n\ninterface SharedArrayBuffer {\n    /**\n     * Read-only. The length of the ArrayBuffer (in bytes).\n     */\n    readonly byteLength: number;\n\n    /**\n     * Returns a section of an SharedArrayBuffer.\n     */\n    slice(begin?: number, end?: number): SharedArrayBuffer;\n    readonly [Symbol.toStringTag]: "SharedArrayBuffer";\n}\n\ninterface SharedArrayBufferConstructor {\n    readonly prototype: SharedArrayBuffer;\n    new (byteLength?: number): SharedArrayBuffer;\n    readonly [Symbol.species]: SharedArrayBufferConstructor;\n}\ndeclare var SharedArrayBuffer: SharedArrayBufferConstructor;\n\ninterface ArrayBufferTypes {\n    SharedArrayBuffer: SharedArrayBuffer;\n}\n\ninterface Atomics {\n    /**\n     * Adds a value to the value at the given position in the array, returning the original value.\n     * Until this atomic operation completes, any other read or write operation against the array\n     * will block.\n     */\n    add(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * Stores the bitwise AND of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or\n     * write operation against the array will block.\n     */\n    and(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * Replaces the value at the given position in the array if the original value equals the given\n     * expected value, returning the original value. Until this atomic operation completes, any\n     * other read or write operation against the array will block.\n     */\n    compareExchange(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, expectedValue: number, replacementValue: number): number;\n\n    /**\n     * Replaces the value at the given position in the array, returning the original value. Until\n     * this atomic operation completes, any other read or write operation against the array will\n     * block.\n     */\n    exchange(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * Returns a value indicating whether high-performance algorithms can use atomic operations\n     * (`true`) or must use locks (`false`) for the given number of bytes-per-element of a typed\n     * array.\n     */\n    isLockFree(size: number): boolean;\n\n    /**\n     * Returns the value at the given position in the array. Until this atomic operation completes,\n     * any other read or write operation against the array will block.\n     */\n    load(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number): number;\n\n    /**\n     * Stores the bitwise OR of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or write\n     * operation against the array will block.\n     */\n    or(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * Stores a value at the given position in the array, returning the new value. Until this\n     * atomic operation completes, any other read or write operation against the array will block.\n     */\n    store(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * Subtracts a value from the value at the given position in the array, returning the original\n     * value. Until this atomic operation completes, any other read or write operation against the\n     * array will block.\n     */\n    sub(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    /**\n     * If the value at the given position in the array is equal to the provided value, the current\n     * agent is put to sleep causing execution to suspend until the timeout expires (returning\n     * `"timed-out"`) or until the agent is awoken (returning `"ok"`); otherwise, returns\n     * `"not-equal"`.\n     */\n    wait(typedArray: Int32Array<ArrayBufferLike>, index: number, value: number, timeout?: number): "ok" | "not-equal" | "timed-out";\n\n    /**\n     * Wakes up sleeping agents that are waiting on the given index of the array, returning the\n     * number of agents that were awoken.\n     * @param typedArray A shared Int32Array<ArrayBufferLike>.\n     * @param index The position in the typedArray to wake up on.\n     * @param count The number of sleeping agents to notify. Defaults to +Infinity.\n     */\n    notify(typedArray: Int32Array<ArrayBufferLike>, index: number, count?: number): number;\n\n    /**\n     * Stores the bitwise XOR of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or write\n     * operation against the array will block.\n     */\n    xor(typedArray: Int8Array<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | Int16Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Int32Array<ArrayBufferLike> | Uint32Array<ArrayBufferLike>, index: number, value: number): number;\n\n    readonly [Symbol.toStringTag]: "Atomics";\n}\n\ndeclare var Atomics: Atomics;\n',
  "lib.es2017.string.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

interface String {
    /**
     * Pads the current string with a given string (possibly repeated) so that the resulting string reaches a given length.
     * The padding is applied from the start (left) of the current string.
     *
     * @param maxLength The length of the resulting string once the current string has been padded.
     *        If this parameter is smaller than the current string's length, the current string will be returned as it is.
     *
     * @param fillString The string to pad the current string with.
     *        If this string is too long, it will be truncated and the left-most part will be applied.
     *        The default value for this parameter is " " (U+0020).
     */
    padStart(maxLength: number, fillString?: string): string;

    /**
     * Pads the current string with a given string (possibly repeated) so that the resulting string reaches a given length.
     * The padding is applied from the end (right) of the current string.
     *
     * @param maxLength The length of the resulting string once the current string has been padded.
     *        If this parameter is smaller than the current string's length, the current string will be returned as it is.
     *
     * @param fillString The string to pad the current string with.
     *        If this string is too long, it will be truncated and the left-most part will be applied.
     *        The default value for this parameter is " " (U+0020).
     */
    padEnd(maxLength: number, fillString?: string): string;
}
`,
  "lib.es2017.typedarrays.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Int8ArrayConstructor {\n    new (): Int8Array<ArrayBuffer>;\n}\n\ninterface Uint8ArrayConstructor {\n    new (): Uint8Array<ArrayBuffer>;\n}\n\ninterface Uint8ClampedArrayConstructor {\n    new (): Uint8ClampedArray<ArrayBuffer>;\n}\n\ninterface Int16ArrayConstructor {\n    new (): Int16Array<ArrayBuffer>;\n}\n\ninterface Uint16ArrayConstructor {\n    new (): Uint16Array<ArrayBuffer>;\n}\n\ninterface Int32ArrayConstructor {\n    new (): Int32Array<ArrayBuffer>;\n}\n\ninterface Uint32ArrayConstructor {\n    new (): Uint32Array<ArrayBuffer>;\n}\n\ninterface Float32ArrayConstructor {\n    new (): Float32Array<ArrayBuffer>;\n}\n\ninterface Float64ArrayConstructor {\n    new (): Float64Array<ArrayBuffer>;\n}\n',
  "lib.es2018.asyncgenerator.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

/// <reference lib="es2018.asynciterable" />

interface AsyncGenerator<T = unknown, TReturn = any, TNext = any> extends AsyncIteratorObject<T, TReturn, TNext> {
    // NOTE: 'next' is defined using a tuple to ensure we report the correct assignability errors in all places.
    next(...[value]: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;
    return(value: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>>;
    throw(e: any): Promise<IteratorResult<T, TReturn>>;
    [Symbol.asyncIterator](): AsyncGenerator<T, TReturn, TNext>;
}

interface AsyncGeneratorFunction {
    /**
     * Creates a new AsyncGenerator object.
     * @param args A list of arguments the function accepts.
     */
    new (...args: any[]): AsyncGenerator;
    /**
     * Creates a new AsyncGenerator object.
     * @param args A list of arguments the function accepts.
     */
    (...args: any[]): AsyncGenerator;
    /**
     * The length of the arguments.
     */
    readonly length: number;
    /**
     * Returns the name of the function.
     */
    readonly name: string;
    /**
     * A reference to the prototype.
     */
    readonly prototype: AsyncGenerator;
}

interface AsyncGeneratorFunctionConstructor {
    /**
     * Creates a new AsyncGenerator function.
     * @param args A list of arguments the function accepts.
     */
    new (...args: string[]): AsyncGeneratorFunction;
    /**
     * Creates a new AsyncGenerator function.
     * @param args A list of arguments the function accepts.
     */
    (...args: string[]): AsyncGeneratorFunction;
    /**
     * The length of the arguments.
     */
    readonly length: number;
    /**
     * Returns the name of the function.
     */
    readonly name: string;
    /**
     * A reference to the prototype.
     */
    readonly prototype: AsyncGeneratorFunction;
}
`,
  "lib.es2018.asynciterable.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2015.symbol" />\n/// <reference lib="es2015.iterable" />\n\ninterface SymbolConstructor {\n    /**\n     * A method that returns the default async iterator for an object. Called by the semantics of\n     * the for-await-of statement.\n     */\n    readonly asyncIterator: unique symbol;\n}\n\ninterface AsyncIterator<T, TReturn = any, TNext = any> {\n    // NOTE: \'next\' is defined using a tuple to ensure we report the correct assignability errors in all places.\n    next(...[value]: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;\n    return?(value?: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>>;\n    throw?(e?: any): Promise<IteratorResult<T, TReturn>>;\n}\n\ninterface AsyncIterable<T, TReturn = any, TNext = any> {\n    [Symbol.asyncIterator](): AsyncIterator<T, TReturn, TNext>;\n}\n\n/**\n * Describes a user-defined {@link AsyncIterator} that is also async iterable.\n */\ninterface AsyncIterableIterator<T, TReturn = any, TNext = any> extends AsyncIterator<T, TReturn, TNext> {\n    [Symbol.asyncIterator](): AsyncIterableIterator<T, TReturn, TNext>;\n}\n\n/**\n * Describes an {@link AsyncIterator} produced by the runtime that inherits from the intrinsic `AsyncIterator.prototype`.\n */\ninterface AsyncIteratorObject<T, TReturn = unknown, TNext = unknown> extends AsyncIterator<T, TReturn, TNext> {\n    [Symbol.asyncIterator](): AsyncIteratorObject<T, TReturn, TNext>;\n}\n',
  "lib.es2018.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2017" />\n/// <reference lib="es2018.asynciterable" />\n/// <reference lib="es2018.asyncgenerator" />\n/// <reference lib="es2018.promise" />\n/// <reference lib="es2018.regexp" />\n/// <reference lib="es2018.intl" />\n',
  "lib.es2018.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    // http://cldr.unicode.org/index/cldr-spec/plural-rules#TOC-Determining-Plural-Categories\n    type LDMLPluralRule = "zero" | "one" | "two" | "few" | "many" | "other";\n    type PluralRuleType = "cardinal" | "ordinal";\n\n    interface PluralRulesOptions {\n        localeMatcher?: "lookup" | "best fit" | undefined;\n        type?: PluralRuleType | undefined;\n        minimumIntegerDigits?: number | undefined;\n        minimumFractionDigits?: number | undefined;\n        maximumFractionDigits?: number | undefined;\n        minimumSignificantDigits?: number | undefined;\n        maximumSignificantDigits?: number | undefined;\n    }\n\n    interface ResolvedPluralRulesOptions {\n        locale: string;\n        pluralCategories: LDMLPluralRule[];\n        type: PluralRuleType;\n        minimumIntegerDigits: number;\n        minimumFractionDigits: number;\n        maximumFractionDigits: number;\n        minimumSignificantDigits?: number;\n        maximumSignificantDigits?: number;\n    }\n\n    interface PluralRules {\n        resolvedOptions(): ResolvedPluralRulesOptions;\n        select(n: number): LDMLPluralRule;\n    }\n\n    interface PluralRulesConstructor {\n        new (locales?: string | readonly string[], options?: PluralRulesOptions): PluralRules;\n        (locales?: string | readonly string[], options?: PluralRulesOptions): PluralRules;\n        supportedLocalesOf(locales: string | readonly string[], options?: { localeMatcher?: "lookup" | "best fit"; }): string[];\n    }\n\n    const PluralRules: PluralRulesConstructor;\n\n    interface NumberFormatPartTypeRegistry {\n        literal: never;\n        nan: never;\n        infinity: never;\n        percent: never;\n        integer: never;\n        group: never;\n        decimal: never;\n        fraction: never;\n        plusSign: never;\n        minusSign: never;\n        percentSign: never;\n        currency: never;\n    }\n\n    type NumberFormatPartTypes = keyof NumberFormatPartTypeRegistry;\n\n    interface NumberFormatPart {\n        type: NumberFormatPartTypes;\n        value: string;\n    }\n\n    interface NumberFormat {\n        formatToParts(number?: number | bigint): NumberFormatPart[];\n    }\n}\n',
  "lib.es2018.promise.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/**\n * Represents the completion of an asynchronous operation\n */\ninterface Promise<T> {\n    /**\n     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The\n     * resolved value cannot be modified from the callback.\n     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).\n     * @returns A Promise for the completion of the callback.\n     */\n    finally(onfinally?: (() => void) | undefined | null): Promise<T>;\n}\n',
  "lib.es2018.regexp.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface RegExpMatchArray {\n    groups?: {\n        [key: string]: string;\n    };\n}\n\ninterface RegExpExecArray {\n    groups?: {\n        [key: string]: string;\n    };\n}\n\ninterface RegExp {\n    /**\n     * Returns a Boolean value indicating the state of the dotAll flag (s) used with a regular expression.\n     * Default is false. Read-only.\n     */\n    readonly dotAll: boolean;\n}\n',
  "lib.es2019.array.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ntype FlatArray<Arr, Depth extends number> = {\n    done: Arr;\n    recur: Arr extends ReadonlyArray<infer InnerArr> ? FlatArray<InnerArr, [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][Depth]>\n        : Arr;\n}[Depth extends -1 ? "done" : "recur"];\n\ninterface ReadonlyArray<T> {\n    /**\n     * Calls a defined callback function on each element of an array. Then, flattens the result into\n     * a new array.\n     * This is identical to a map followed by flat with depth 1.\n     *\n     * @param callback A function that accepts up to three arguments. The flatMap method calls the\n     * callback function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callback function. If\n     * thisArg is omitted, undefined is used as the this value.\n     */\n    flatMap<U, This = undefined>(\n        callback: (this: This, value: T, index: number, array: T[]) => U | ReadonlyArray<U>,\n        thisArg?: This,\n    ): U[];\n\n    /**\n     * Returns a new array with all sub-array elements concatenated into it recursively up to the\n     * specified depth.\n     *\n     * @param depth The maximum recursion depth\n     */\n    flat<A, D extends number = 1>(\n        this: A,\n        depth?: D,\n    ): FlatArray<A, D>[];\n}\n\ninterface Array<T> {\n    /**\n     * Calls a defined callback function on each element of an array. Then, flattens the result into\n     * a new array.\n     * This is identical to a map followed by flat with depth 1.\n     *\n     * @param callback A function that accepts up to three arguments. The flatMap method calls the\n     * callback function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callback function. If\n     * thisArg is omitted, undefined is used as the this value.\n     */\n    flatMap<U, This = undefined>(\n        callback: (this: This, value: T, index: number, array: T[]) => U | ReadonlyArray<U>,\n        thisArg?: This,\n    ): U[];\n\n    /**\n     * Returns a new array with all sub-array elements concatenated into it recursively up to the\n     * specified depth.\n     *\n     * @param depth The maximum recursion depth\n     */\n    flat<A, D extends number = 1>(\n        this: A,\n        depth?: D,\n    ): FlatArray<A, D>[];\n}\n',
  "lib.es2019.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2018" />\n/// <reference lib="es2019.array" />\n/// <reference lib="es2019.object" />\n/// <reference lib="es2019.string" />\n/// <reference lib="es2019.symbol" />\n/// <reference lib="es2019.intl" />\n',
  "lib.es2019.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    interface DateTimeFormatPartTypesRegistry {\n        unknown: never;\n    }\n}\n',
  "lib.es2019.object.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2015.iterable" />\n\ninterface ObjectConstructor {\n    /**\n     * Returns an object created by key-value entries for properties and methods\n     * @param entries An iterable object that contains key-value entries for properties and methods.\n     */\n    fromEntries<T = any>(entries: Iterable<readonly [PropertyKey, T]>): { [k: string]: T; };\n\n    /**\n     * Returns an object created by key-value entries for properties and methods\n     * @param entries An iterable object that contains key-value entries for properties and methods.\n     */\n    fromEntries(entries: Iterable<readonly any[]>): any;\n}\n',
  "lib.es2019.string.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface String {\n    /** Removes the trailing white space and line terminator characters from a string. */\n    trimEnd(): string;\n\n    /** Removes the leading white space and line terminator characters from a string. */\n    trimStart(): string;\n\n    /**\n     * Removes the leading white space and line terminator characters from a string.\n     * @deprecated A legacy feature for browser compatibility. Use `trimStart` instead\n     */\n    trimLeft(): string;\n\n    /**\n     * Removes the trailing white space and line terminator characters from a string.\n     * @deprecated A legacy feature for browser compatibility. Use `trimEnd` instead\n     */\n    trimRight(): string;\n}\n',
  "lib.es2019.symbol.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Symbol {\n    /**\n     * Expose the [[Description]] internal slot of a symbol directly.\n     */\n    readonly description: string | undefined;\n}\n',
  "lib.es2020.bigint.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2020.intl" />\n\ninterface BigIntToLocaleStringOptions {\n    /**\n     * The locale matching algorithm to use.The default is "best fit". For information about this option, see the {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation Intl page}.\n     */\n    localeMatcher?: string;\n    /**\n     * The formatting style to use , the default is "decimal".\n     */\n    style?: string;\n\n    numberingSystem?: string;\n    /**\n     * The unit to use in unit formatting, Possible values are core unit identifiers, defined in UTS #35, Part 2, Section 6. A subset of units from the full list was selected for use in ECMAScript. Pairs of simple units can be concatenated with "-per-" to make a compound unit. There is no default value; if the style is "unit", the unit property must be provided.\n     */\n    unit?: string;\n\n    /**\n     * The unit formatting style to use in unit formatting, the defaults is "short".\n     */\n    unitDisplay?: string;\n\n    /**\n     * The currency to use in currency formatting. Possible values are the ISO 4217 currency codes, such as "USD" for the US dollar, "EUR" for the euro, or "CNY" for the Chinese RMB \u2014 see the Current currency & funds code list. There is no default value; if the style is "currency", the currency property must be provided. It is only used when [[Style]] has the value "currency".\n     */\n    currency?: string;\n\n    /**\n     * How to display the currency in currency formatting. It is only used when [[Style]] has the value "currency". The default is "symbol".\n     *\n     * "symbol" to use a localized currency symbol such as \u20AC,\n     *\n     * "code" to use the ISO currency code,\n     *\n     * "name" to use a localized currency name such as "dollar"\n     */\n    currencyDisplay?: string;\n\n    /**\n     * Whether to use grouping separators, such as thousands separators or thousand/lakh/crore separators. The default is true.\n     */\n    useGrouping?: boolean;\n\n    /**\n     * The minimum number of integer digits to use. Possible values are from 1 to 21; the default is 1.\n     */\n    minimumIntegerDigits?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;\n\n    /**\n     * The minimum number of fraction digits to use. Possible values are from 0 to 20; the default for plain number and percent formatting is 0; the default for currency formatting is the number of minor unit digits provided by the {@link http://www.currency-iso.org/en/home/tables/table-a1.html ISO 4217 currency codes list} (2 if the list doesn\'t provide that information).\n     */\n    minimumFractionDigits?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;\n\n    /**\n     * The maximum number of fraction digits to use. Possible values are from 0 to 20; the default for plain number formatting is the larger of minimumFractionDigits and 3; the default for currency formatting is the larger of minimumFractionDigits and the number of minor unit digits provided by the {@link http://www.currency-iso.org/en/home/tables/table-a1.html ISO 4217 currency codes list} (2 if the list doesn\'t provide that information); the default for percent formatting is the larger of minimumFractionDigits and 0.\n     */\n    maximumFractionDigits?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;\n\n    /**\n     * The minimum number of significant digits to use. Possible values are from 1 to 21; the default is 1.\n     */\n    minimumSignificantDigits?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;\n\n    /**\n     * The maximum number of significant digits to use. Possible values are from 1 to 21; the default is 21.\n     */\n    maximumSignificantDigits?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;\n\n    /**\n     * The formatting that should be displayed for the number, the defaults is "standard"\n     *\n     *     "standard" plain number formatting\n     *\n     *     "scientific" return the order-of-magnitude for formatted number.\n     *\n     *     "engineering" return the exponent of ten when divisible by three\n     *\n     *     "compact" string representing exponent, defaults is using the "short" form\n     */\n    notation?: string;\n\n    /**\n     * used only when notation is "compact"\n     */\n    compactDisplay?: string;\n}\n\ninterface BigInt {\n    /**\n     * Returns a string representation of an object.\n     * @param radix Specifies a radix for converting numeric values to strings.\n     */\n    toString(radix?: number): string;\n\n    /** Returns a string representation appropriate to the host environment\'s current locale. */\n    toLocaleString(locales?: Intl.LocalesArgument, options?: BigIntToLocaleStringOptions): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): bigint;\n\n    readonly [Symbol.toStringTag]: "BigInt";\n}\n\ninterface BigIntConstructor {\n    (value: bigint | boolean | number | string): bigint;\n    readonly prototype: BigInt;\n\n    /**\n     * Interprets the low bits of a BigInt as a 2\'s-complement signed integer.\n     * All higher bits are discarded.\n     * @param bits The number of low bits to use\n     * @param int The BigInt whose bits to extract\n     */\n    asIntN(bits: number, int: bigint): bigint;\n    /**\n     * Interprets the low bits of a BigInt as an unsigned integer.\n     * All higher bits are discarded.\n     * @param bits The number of low bits to use\n     * @param int The BigInt whose bits to extract\n     */\n    asUintN(bits: number, int: bigint): bigint;\n}\n\ndeclare var BigInt: BigIntConstructor;\n\n/**\n * A typed array of 64-bit signed integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated, an exception is raised.\n */\ninterface BigInt64Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /** The size in bytes of each element in the array. */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /** The ArrayBuffer instance referenced by the array. */\n    readonly buffer: TArrayBuffer;\n\n    /** The length in bytes of the array. */\n    readonly byteLength: number;\n\n    /** The offset in bytes of the array. */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /** Yields index, value pairs for every entry in the array. */\n    entries(): ArrayIterator<[number, bigint]>;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns false,\n     * or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => boolean, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: bigint, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => any, thisArg?: any): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => boolean, thisArg?: any): bigint | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => void, thisArg?: any): void;\n\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: bigint, fromIndex?: number): boolean;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: bigint, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /** Yields each index in the array. */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: bigint, fromIndex?: number): number;\n\n    /** The length of the array. */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => bigint, thisArg?: any): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: bigint, currentValue: bigint, currentIndex: number, array: BigInt64Array<TArrayBuffer>) => bigint): bigint;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: bigint, currentIndex: number, array: BigInt64Array<TArrayBuffer>) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: bigint, currentValue: bigint, currentIndex: number, array: BigInt64Array<TArrayBuffer>) => bigint): bigint;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: bigint, currentIndex: number, array: BigInt64Array<TArrayBuffer>) => U, initialValue: U): U;\n\n    /** Reverses the elements in the array. */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<bigint>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array.\n     */\n    slice(start?: number, end?: number): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls the\n     * predicate function for each element in the array until the predicate returns true, or until\n     * the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: bigint, index: number, array: BigInt64Array<TArrayBuffer>) => boolean, thisArg?: any): boolean;\n\n    /**\n     * Sorts the array.\n     * @param compareFn The function used to determine the order of the elements. If omitted, the elements are sorted in ascending order.\n     */\n    sort(compareFn?: (a: bigint, b: bigint) => number | bigint): this;\n\n    /**\n     * Gets a new BigInt64Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): BigInt64Array<TArrayBuffer>;\n\n    /** Converts the array to a string by using the current locale. */\n    toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string;\n\n    /** Returns a string representation of the array. */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): BigInt64Array<TArrayBuffer>;\n\n    /** Yields each value in the array. */\n    values(): ArrayIterator<bigint>;\n\n    [Symbol.iterator](): ArrayIterator<bigint>;\n\n    readonly [Symbol.toStringTag]: "BigInt64Array";\n\n    [index: number]: bigint;\n}\ninterface BigInt64ArrayConstructor {\n    readonly prototype: BigInt64Array<ArrayBufferLike>;\n    new (length?: number): BigInt64Array<ArrayBuffer>;\n    new (array: ArrayLike<bigint> | Iterable<bigint>): BigInt64Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): BigInt64Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): BigInt64Array<ArrayBuffer>;\n    new (array: ArrayLike<bigint> | ArrayBuffer): BigInt64Array<ArrayBuffer>;\n\n    /** The size in bytes of each element in the array. */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: bigint[]): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<bigint>): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<U>(arrayLike: ArrayLike<U>, mapfn: (v: U, k: number) => bigint, thisArg?: any): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<bigint>): BigInt64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => bigint, thisArg?: any): BigInt64Array<ArrayBuffer>;\n}\ndeclare var BigInt64Array: BigInt64ArrayConstructor;\n\n/**\n * A typed array of 64-bit unsigned integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated, an exception is raised.\n */\ninterface BigUint64Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /** The size in bytes of each element in the array. */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /** The ArrayBuffer instance referenced by the array. */\n    readonly buffer: TArrayBuffer;\n\n    /** The length in bytes of the array. */\n    readonly byteLength: number;\n\n    /** The offset in bytes of the array. */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /** Yields index, value pairs for every entry in the array. */\n    entries(): ArrayIterator<[number, bigint]>;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns false,\n     * or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => boolean, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: bigint, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => any, thisArg?: any): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => boolean, thisArg?: any): bigint | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => void, thisArg?: any): void;\n\n    /**\n     * Determines whether an array includes a certain element, returning true or false as appropriate.\n     * @param searchElement The element to search for.\n     * @param fromIndex The position in this array at which to begin searching for searchElement.\n     */\n    includes(searchElement: bigint, fromIndex?: number): boolean;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: bigint, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /** Yields each index in the array. */\n    keys(): ArrayIterator<number>;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: bigint, fromIndex?: number): number;\n\n    /** The length of the array. */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => bigint, thisArg?: any): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: bigint, currentValue: bigint, currentIndex: number, array: BigUint64Array<TArrayBuffer>) => bigint): bigint;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: bigint, currentIndex: number, array: BigUint64Array<TArrayBuffer>) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: bigint, currentValue: bigint, currentIndex: number, array: BigUint64Array<TArrayBuffer>) => bigint): bigint;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: bigint, currentIndex: number, array: BigUint64Array<TArrayBuffer>) => U, initialValue: U): U;\n\n    /** Reverses the elements in the array. */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<bigint>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array.\n     */\n    slice(start?: number, end?: number): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls the\n     * predicate function for each element in the array until the predicate returns true, or until\n     * the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: bigint, index: number, array: BigUint64Array<TArrayBuffer>) => boolean, thisArg?: any): boolean;\n\n    /**\n     * Sorts the array.\n     * @param compareFn The function used to determine the order of the elements. If omitted, the elements are sorted in ascending order.\n     */\n    sort(compareFn?: (a: bigint, b: bigint) => number | bigint): this;\n\n    /**\n     * Gets a new BigUint64Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): BigUint64Array<TArrayBuffer>;\n\n    /** Converts the array to a string by using the current locale. */\n    toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string;\n\n    /** Returns a string representation of the array. */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): BigUint64Array<TArrayBuffer>;\n\n    /** Yields each value in the array. */\n    values(): ArrayIterator<bigint>;\n\n    [Symbol.iterator](): ArrayIterator<bigint>;\n\n    readonly [Symbol.toStringTag]: "BigUint64Array";\n\n    [index: number]: bigint;\n}\ninterface BigUint64ArrayConstructor {\n    readonly prototype: BigUint64Array<ArrayBufferLike>;\n    new (length?: number): BigUint64Array<ArrayBuffer>;\n    new (array: ArrayLike<bigint> | Iterable<bigint>): BigUint64Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): BigUint64Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): BigUint64Array<ArrayBuffer>;\n    new (array: ArrayLike<bigint> | ArrayBuffer): BigUint64Array<ArrayBuffer>;\n\n    /** The size in bytes of each element in the array. */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: bigint[]): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<bigint>): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<U>(arrayLike: ArrayLike<U>, mapfn: (v: U, k: number) => bigint, thisArg?: any): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     */\n    from(elements: Iterable<bigint>): BigUint64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param elements An iterable object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => bigint, thisArg?: any): BigUint64Array<ArrayBuffer>;\n}\ndeclare var BigUint64Array: BigUint64ArrayConstructor;\n\ninterface DataView<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Gets the BigInt64 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getBigInt64(byteOffset: number, littleEndian?: boolean): bigint;\n\n    /**\n     * Gets the BigUint64 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getBigUint64(byteOffset: number, littleEndian?: boolean): bigint;\n\n    /**\n     * Stores a BigInt64 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setBigInt64(byteOffset: number, value: bigint, littleEndian?: boolean): void;\n\n    /**\n     * Stores a BigUint64 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setBigUint64(byteOffset: number, value: bigint, littleEndian?: boolean): void;\n}\n\ndeclare namespace Intl {\n    interface NumberFormat {\n        format(value: number | bigint): string;\n    }\n}\n',
  "lib.es2020.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2019" />\n/// <reference lib="es2020.bigint" />\n/// <reference lib="es2020.date" />\n/// <reference lib="es2020.number" />\n/// <reference lib="es2020.promise" />\n/// <reference lib="es2020.sharedmemory" />\n/// <reference lib="es2020.string" />\n/// <reference lib="es2020.symbol.wellknown" />\n/// <reference lib="es2020.intl" />\n',
  "lib.es2020.date.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2020.intl" />\n\ninterface Date {\n    /**\n     * Converts a date and time to a string by using the current or specified locale.\n     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleString(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string;\n\n    /**\n     * Converts a date to a string by using the current or specified locale.\n     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleDateString(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string;\n\n    /**\n     * Converts a time to a string by using the current or specified locale.\n     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleTimeString(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string;\n}\n',
  "lib.es2020.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2018.intl" />\ndeclare namespace Intl {\n    /**\n     * A string that is a valid [Unicode BCP 47 Locale Identifier](https://unicode.org/reports/tr35/#Unicode_locale_identifier).\n     *\n     * For example: "fa", "es-MX", "zh-Hant-TW".\n     *\n     * See [MDN - Intl - locales argument](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument).\n     */\n    type UnicodeBCP47LocaleIdentifier = string;\n\n    /**\n     * Unit to use in the relative time internationalized message.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/format#Parameters).\n     */\n    type RelativeTimeFormatUnit =\n        | "year"\n        | "years"\n        | "quarter"\n        | "quarters"\n        | "month"\n        | "months"\n        | "week"\n        | "weeks"\n        | "day"\n        | "days"\n        | "hour"\n        | "hours"\n        | "minute"\n        | "minutes"\n        | "second"\n        | "seconds";\n\n    /**\n     * Value of the `unit` property in objects returned by\n     * `Intl.RelativeTimeFormat.prototype.formatToParts()`. `formatToParts` and\n     * `format` methods accept either singular or plural unit names as input,\n     * but `formatToParts` only outputs singular (e.g. "day") not plural (e.g.\n     * "days").\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/formatToParts#Using_formatToParts).\n     */\n    type RelativeTimeFormatUnitSingular =\n        | "year"\n        | "quarter"\n        | "month"\n        | "week"\n        | "day"\n        | "hour"\n        | "minute"\n        | "second";\n\n    /**\n     * The locale matching algorithm to use.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation).\n     */\n    type RelativeTimeFormatLocaleMatcher = "lookup" | "best fit";\n\n    /**\n     * The format of output message.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#Parameters).\n     */\n    type RelativeTimeFormatNumeric = "always" | "auto";\n\n    /**\n     * The length of the internationalized message.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#Parameters).\n     */\n    type RelativeTimeFormatStyle = "long" | "short" | "narrow";\n\n    /**\n     * The locale or locales to use\n     *\n     * See [MDN - Intl - locales argument](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument).\n     */\n    type LocalesArgument = UnicodeBCP47LocaleIdentifier | Locale | readonly (UnicodeBCP47LocaleIdentifier | Locale)[] | undefined;\n\n    /**\n     * An object with some or all of properties of `options` parameter\n     * of `Intl.RelativeTimeFormat` constructor.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#Parameters).\n     */\n    interface RelativeTimeFormatOptions {\n        /** The locale matching algorithm to use. For information about this option, see [Intl page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation). */\n        localeMatcher?: RelativeTimeFormatLocaleMatcher;\n        /** The format of output message. */\n        numeric?: RelativeTimeFormatNumeric;\n        /** The length of the internationalized message. */\n        style?: RelativeTimeFormatStyle;\n    }\n\n    /**\n     * An object with properties reflecting the locale\n     * and formatting options computed during initialization\n     * of the `Intl.RelativeTimeFormat` object\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/resolvedOptions#Description).\n     */\n    interface ResolvedRelativeTimeFormatOptions {\n        locale: UnicodeBCP47LocaleIdentifier;\n        style: RelativeTimeFormatStyle;\n        numeric: RelativeTimeFormatNumeric;\n        numberingSystem: string;\n    }\n\n    /**\n     * An object representing the relative time format in parts\n     * that can be used for custom locale-aware formatting.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/formatToParts#Using_formatToParts).\n     */\n    type RelativeTimeFormatPart =\n        | {\n            type: "literal";\n            value: string;\n        }\n        | {\n            type: Exclude<NumberFormatPartTypes, "literal">;\n            value: string;\n            unit: RelativeTimeFormatUnitSingular;\n        };\n\n    interface RelativeTimeFormat {\n        /**\n         * Formats a value and a unit according to the locale\n         * and formatting options of the given\n         * [`Intl.RelativeTimeFormat`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RelativeTimeFormat)\n         * object.\n         *\n         * While this method automatically provides the correct plural forms,\n         * the grammatical form is otherwise as neutral as possible.\n         *\n         * It is the caller\'s responsibility to handle cut-off logic\n         * such as deciding between displaying "in 7 days" or "in 1 week".\n         * This API does not support relative dates involving compound units.\n         * e.g "in 5 days and 4 hours".\n         *\n         * @param value -  Numeric value to use in the internationalized relative time message\n         *\n         * @param unit - [Unit](https://tc39.es/ecma402/#sec-singularrelativetimeunit) to use in the relative time internationalized message.\n         *\n         * @throws `RangeError` if `unit` was given something other than `unit` possible values\n         *\n         * @returns {string} Internationalized relative time message as string\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/format).\n         */\n        format(value: number, unit: RelativeTimeFormatUnit): string;\n\n        /**\n         *  Returns an array of objects representing the relative time format in parts that can be used for custom locale-aware formatting.\n         *\n         *  @param value - Numeric value to use in the internationalized relative time message\n         *\n         *  @param unit - [Unit](https://tc39.es/ecma402/#sec-singularrelativetimeunit) to use in the relative time internationalized message.\n         *\n         *  @throws `RangeError` if `unit` was given something other than `unit` possible values\n         *\n         *  [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/formatToParts).\n         */\n        formatToParts(value: number, unit: RelativeTimeFormatUnit): RelativeTimeFormatPart[];\n\n        /**\n         * Provides access to the locale and options computed during initialization of this `Intl.RelativeTimeFormat` object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/resolvedOptions).\n         */\n        resolvedOptions(): ResolvedRelativeTimeFormatOptions;\n    }\n\n    /**\n     * The [`Intl.RelativeTimeFormat`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RelativeTimeFormat)\n     * object is a constructor for objects that enable language-sensitive relative time formatting.\n     *\n     * [Compatibility](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat#Browser_compatibility).\n     */\n    const RelativeTimeFormat: {\n        /**\n         * Creates [Intl.RelativeTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RelativeTimeFormat) objects\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the locales argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#Parameters)\n         *  with some or all of options of `RelativeTimeFormatOptions`.\n         *\n         * @returns [Intl.RelativeTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/RelativeTimeFormat) object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat).\n         */\n        new (\n            locales?: LocalesArgument,\n            options?: RelativeTimeFormatOptions,\n        ): RelativeTimeFormat;\n\n        /**\n         * Returns an array containing those of the provided locales\n         * that are supported in date and time formatting\n         * without having to fall back to the runtime\'s default locale.\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the locales argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#Parameters)\n         *  with some or all of options of the formatting.\n         *\n         * @returns An array containing those of the provided locales\n         *  that are supported in date and time formatting\n         *  without having to fall back to the runtime\'s default locale.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/supportedLocalesOf).\n         */\n        supportedLocalesOf(\n            locales?: LocalesArgument,\n            options?: RelativeTimeFormatOptions,\n        ): UnicodeBCP47LocaleIdentifier[];\n    };\n\n    interface NumberFormatOptionsStyleRegistry {\n        unit: never;\n    }\n\n    interface NumberFormatOptionsCurrencyDisplayRegistry {\n        narrowSymbol: never;\n    }\n\n    interface NumberFormatOptionsSignDisplayRegistry {\n        auto: never;\n        never: never;\n        always: never;\n        exceptZero: never;\n    }\n\n    type NumberFormatOptionsSignDisplay = keyof NumberFormatOptionsSignDisplayRegistry;\n\n    interface NumberFormatOptions {\n        numberingSystem?: string | undefined;\n        compactDisplay?: "short" | "long" | undefined;\n        notation?: "standard" | "scientific" | "engineering" | "compact" | undefined;\n        signDisplay?: NumberFormatOptionsSignDisplay | undefined;\n        unit?: string | undefined;\n        unitDisplay?: "short" | "long" | "narrow" | undefined;\n        currencySign?: "standard" | "accounting" | undefined;\n    }\n\n    interface ResolvedNumberFormatOptions {\n        compactDisplay?: "short" | "long";\n        notation: "standard" | "scientific" | "engineering" | "compact";\n        signDisplay: NumberFormatOptionsSignDisplay;\n        unit?: string;\n        unitDisplay?: "short" | "long" | "narrow";\n        currencySign?: "standard" | "accounting";\n    }\n\n    interface NumberFormatPartTypeRegistry {\n        compact: never;\n        exponentInteger: never;\n        exponentMinusSign: never;\n        exponentSeparator: never;\n        unit: never;\n        unknown: never;\n    }\n\n    interface DateTimeFormatOptions {\n        calendar?: string | undefined;\n        dayPeriod?: "narrow" | "short" | "long" | undefined;\n        numberingSystem?: string | undefined;\n\n        dateStyle?: "full" | "long" | "medium" | "short" | undefined;\n        timeStyle?: "full" | "long" | "medium" | "short" | undefined;\n        hourCycle?: "h11" | "h12" | "h23" | "h24" | undefined;\n    }\n\n    type LocaleHourCycleKey = "h12" | "h23" | "h11" | "h24";\n    type LocaleCollationCaseFirst = "upper" | "lower" | "false";\n\n    interface LocaleOptions {\n        /** A string containing the language, and the script and region if available. */\n        baseName?: string;\n        /** The part of the Locale that indicates the locale\'s calendar era. */\n        calendar?: string;\n        /** Flag that defines whether case is taken into account for the locale\'s collation rules. */\n        caseFirst?: LocaleCollationCaseFirst;\n        /** The collation type used for sorting */\n        collation?: string;\n        /** The time keeping format convention used by the locale. */\n        hourCycle?: LocaleHourCycleKey;\n        /** The primary language subtag associated with the locale. */\n        language?: string;\n        /** The numeral system used by the locale. */\n        numberingSystem?: string;\n        /** Flag that defines whether the locale has special collation handling for numeric characters. */\n        numeric?: boolean;\n        /** The region of the world (usually a country) associated with the locale. Possible values are region codes as defined by ISO 3166-1. */\n        region?: string;\n        /** The script used for writing the particular language used in the locale. Possible values are script codes as defined by ISO 15924. */\n        script?: string;\n    }\n\n    interface Locale extends LocaleOptions {\n        /** A string containing the language, and the script and region if available. */\n        baseName: string;\n        /** The primary language subtag associated with the locale. */\n        language: string;\n        /** Gets the most likely values for the language, script, and region of the locale based on existing values. */\n        maximize(): Locale;\n        /** Attempts to remove information about the locale that would be added by calling `Locale.maximize()`. */\n        minimize(): Locale;\n        /** Returns the locale\'s full locale identifier string. */\n        toString(): UnicodeBCP47LocaleIdentifier;\n    }\n\n    /**\n     * Constructor creates [Intl.Locale](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale)\n     * objects\n     *\n     * @param tag - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646).\n     *  For the general form and interpretation of the locales argument,\n     *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n     *\n     * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/Locale#Parameters) with some or all of options of the locale.\n     *\n     * @returns [Intl.Locale](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale) object.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale).\n     */\n    const Locale: {\n        new (tag: UnicodeBCP47LocaleIdentifier | Locale, options?: LocaleOptions): Locale;\n    };\n\n    type DisplayNamesFallback =\n        | "code"\n        | "none";\n\n    type DisplayNamesType =\n        | "language"\n        | "region"\n        | "script"\n        | "calendar"\n        | "dateTimeField"\n        | "currency";\n\n    type DisplayNamesLanguageDisplay =\n        | "dialect"\n        | "standard";\n\n    interface DisplayNamesOptions {\n        localeMatcher?: RelativeTimeFormatLocaleMatcher;\n        style?: RelativeTimeFormatStyle;\n        type: DisplayNamesType;\n        languageDisplay?: DisplayNamesLanguageDisplay;\n        fallback?: DisplayNamesFallback;\n    }\n\n    interface ResolvedDisplayNamesOptions {\n        locale: UnicodeBCP47LocaleIdentifier;\n        style: RelativeTimeFormatStyle;\n        type: DisplayNamesType;\n        fallback: DisplayNamesFallback;\n        languageDisplay?: DisplayNamesLanguageDisplay;\n    }\n\n    interface DisplayNames {\n        /**\n         * Receives a code and returns a string based on the locale and options provided when instantiating\n         * [`Intl.DisplayNames()`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)\n         *\n         * @param code The `code` to provide depends on the `type` passed to display name during creation:\n         *  - If the type is `"region"`, code should be either an [ISO-3166 two letters region code](https://www.iso.org/iso-3166-country-codes.html),\n         *    or a [three digits UN M49 Geographic Regions](https://unstats.un.org/unsd/methodology/m49/).\n         *  - If the type is `"script"`, code should be an [ISO-15924 four letters script code](https://unicode.org/iso15924/iso15924-codes.html).\n         *  - If the type is `"language"`, code should be a `languageCode` ["-" `scriptCode`] ["-" `regionCode` ] *("-" `variant` )\n         *    subsequence of the unicode_language_id grammar in [UTS 35\'s Unicode Language and Locale Identifiers grammar](https://unicode.org/reports/tr35/#Unicode_language_identifier).\n         *    `languageCode` is either a two letters ISO 639-1 language code or a three letters ISO 639-2 language code.\n         *  - If the type is `"currency"`, code should be a [3-letter ISO 4217 currency code](https://www.iso.org/iso-4217-currency-codes.html).\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames/of).\n         */\n        of(code: string): string | undefined;\n        /**\n         * Returns a new object with properties reflecting the locale and style formatting options computed during the construction of the current\n         * [`Intl/DisplayNames`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames) object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames/resolvedOptions).\n         */\n        resolvedOptions(): ResolvedDisplayNamesOptions;\n    }\n\n    /**\n     * The [`Intl.DisplayNames()`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)\n     * object enables the consistent translation of language, region and script display names.\n     *\n     * [Compatibility](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames#browser_compatibility).\n     */\n    const DisplayNames: {\n        prototype: DisplayNames;\n\n        /**\n         * @param locales A string with a BCP 47 language tag, or an array of such strings.\n         *   For the general form and interpretation of the `locales` argument, see the [Intl](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locale_identification_and_negotiation)\n         *   page.\n         *\n         * @param options An object for setting up a display name.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames/DisplayNames).\n         */\n        new (locales: LocalesArgument, options: DisplayNamesOptions): DisplayNames;\n\n        /**\n         * Returns an array containing those of the provided locales that are supported in display names without having to fall back to the runtime\'s default locale.\n         *\n         * @param locales A string with a BCP 47 language tag, or an array of such strings.\n         *   For the general form and interpretation of the `locales` argument, see the [Intl](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locale_identification_and_negotiation)\n         *   page.\n         *\n         * @param options An object with a locale matcher.\n         *\n         * @returns An array of strings representing a subset of the given locale tags that are supported in display names without having to fall back to the runtime\'s default locale.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames/supportedLocalesOf).\n         */\n        supportedLocalesOf(locales?: LocalesArgument, options?: { localeMatcher?: RelativeTimeFormatLocaleMatcher; }): UnicodeBCP47LocaleIdentifier[];\n    };\n\n    interface CollatorConstructor {\n        new (locales?: LocalesArgument, options?: CollatorOptions): Collator;\n        (locales?: LocalesArgument, options?: CollatorOptions): Collator;\n        supportedLocalesOf(locales: LocalesArgument, options?: CollatorOptions): string[];\n    }\n\n    interface DateTimeFormatConstructor {\n        new (locales?: LocalesArgument, options?: DateTimeFormatOptions): DateTimeFormat;\n        (locales?: LocalesArgument, options?: DateTimeFormatOptions): DateTimeFormat;\n        supportedLocalesOf(locales: LocalesArgument, options?: DateTimeFormatOptions): string[];\n    }\n\n    interface NumberFormatConstructor {\n        new (locales?: LocalesArgument, options?: NumberFormatOptions): NumberFormat;\n        (locales?: LocalesArgument, options?: NumberFormatOptions): NumberFormat;\n        supportedLocalesOf(locales: LocalesArgument, options?: NumberFormatOptions): string[];\n    }\n\n    interface PluralRulesConstructor {\n        new (locales?: LocalesArgument, options?: PluralRulesOptions): PluralRules;\n        (locales?: LocalesArgument, options?: PluralRulesOptions): PluralRules;\n\n        supportedLocalesOf(locales: LocalesArgument, options?: { localeMatcher?: "lookup" | "best fit"; }): string[];\n    }\n}\n',
  "lib.es2020.number.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2020.intl" />\n\ninterface Number {\n    /**\n     * Converts a number to a string by using the current or specified locale.\n     * @param locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleString(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string;\n}\n',
  "lib.es2020.promise.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface PromiseFulfilledResult<T> {\n    status: "fulfilled";\n    value: T;\n}\n\ninterface PromiseRejectedResult {\n    status: "rejected";\n    reason: any;\n}\n\ntype PromiseSettledResult<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;\n\ninterface PromiseConstructor {\n    /**\n     * Creates a Promise that is resolved with an array of results when all\n     * of the provided Promises resolve or reject.\n     * @param values An array of Promises.\n     * @returns A new Promise.\n     */\n    allSettled<T extends readonly unknown[] | []>(values: T): Promise<{ -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>; }>;\n\n    /**\n     * Creates a Promise that is resolved with an array of results when all\n     * of the provided Promises resolve or reject.\n     * @param values An array of Promises.\n     * @returns A new Promise.\n     */\n    allSettled<T>(values: Iterable<T | PromiseLike<T>>): Promise<PromiseSettledResult<Awaited<T>>[]>;\n}\n',
  "lib.es2020.sharedmemory.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2020.bigint" />\n\ninterface Atomics {\n    /**\n     * Adds a value to the value at the given position in the array, returning the original value.\n     * Until this atomic operation completes, any other read or write operation against the array\n     * will block.\n     */\n    add(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * Stores the bitwise AND of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or\n     * write operation against the array will block.\n     */\n    and(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * Replaces the value at the given position in the array if the original value equals the given\n     * expected value, returning the original value. Until this atomic operation completes, any\n     * other read or write operation against the array will block.\n     */\n    compareExchange(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, expectedValue: bigint, replacementValue: bigint): bigint;\n\n    /**\n     * Replaces the value at the given position in the array, returning the original value. Until\n     * this atomic operation completes, any other read or write operation against the array will\n     * block.\n     */\n    exchange(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * Returns the value at the given position in the array. Until this atomic operation completes,\n     * any other read or write operation against the array will block.\n     */\n    load(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number): bigint;\n\n    /**\n     * Stores the bitwise OR of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or write\n     * operation against the array will block.\n     */\n    or(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * Stores a value at the given position in the array, returning the new value. Until this\n     * atomic operation completes, any other read or write operation against the array will block.\n     */\n    store(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * Subtracts a value from the value at the given position in the array, returning the original\n     * value. Until this atomic operation completes, any other read or write operation against the\n     * array will block.\n     */\n    sub(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n\n    /**\n     * If the value at the given position in the array is equal to the provided value, the current\n     * agent is put to sleep causing execution to suspend until the timeout expires (returning\n     * `"timed-out"`) or until the agent is awoken (returning `"ok"`); otherwise, returns\n     * `"not-equal"`.\n     */\n    wait(typedArray: BigInt64Array<ArrayBufferLike>, index: number, value: bigint, timeout?: number): "ok" | "not-equal" | "timed-out";\n\n    /**\n     * Wakes up sleeping agents that are waiting on the given index of the array, returning the\n     * number of agents that were awoken.\n     * @param typedArray A shared BigInt64Array.\n     * @param index The position in the typedArray to wake up on.\n     * @param count The number of sleeping agents to notify. Defaults to +Infinity.\n     */\n    notify(typedArray: BigInt64Array<ArrayBufferLike>, index: number, count?: number): number;\n\n    /**\n     * Stores the bitwise XOR of a value with the value at the given position in the array,\n     * returning the original value. Until this atomic operation completes, any other read or write\n     * operation against the array will block.\n     */\n    xor(typedArray: BigInt64Array<ArrayBufferLike> | BigUint64Array<ArrayBufferLike>, index: number, value: bigint): bigint;\n}\n',
  "lib.es2020.string.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

/// <reference lib="es2015.iterable" />
/// <reference lib="es2020.intl" />
/// <reference lib="es2020.symbol.wellknown" />

interface String {
    /**
     * Matches a string with a regular expression, and returns an iterable of matches
     * containing the results of that search.
     * @param regexp A variable name or string literal containing the regular expression pattern and flags.
     */
    matchAll(regexp: RegExp): RegExpStringIterator<RegExpExecArray>;

    /** Converts all alphabetic characters to lowercase, taking into account the host environment's current locale. */
    toLocaleLowerCase(locales?: Intl.LocalesArgument): string;

    /** Returns a string where all alphabetic characters have been converted to uppercase, taking into account the host environment's current locale. */
    toLocaleUpperCase(locales?: Intl.LocalesArgument): string;

    /**
     * Determines whether two strings are equivalent in the current or specified locale.
     * @param that String to compare to target string
     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used. This parameter must conform to BCP 47 standards; see the Intl.Collator object for details.
     * @param options An object that contains one or more properties that specify comparison options. see the Intl.Collator object for details.
     */
    localeCompare(that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions): number;
}
`,
  "lib.es2020.symbol.wellknown.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2015.iterable" />\n/// <reference lib="es2015.symbol" />\n\ninterface SymbolConstructor {\n    /**\n     * A regular expression method that matches the regular expression against a string. Called\n     * by the String.prototype.matchAll method.\n     */\n    readonly matchAll: unique symbol;\n}\n\ninterface RegExpStringIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n    [Symbol.iterator](): RegExpStringIterator<T>;\n}\n\ninterface RegExp {\n    /**\n     * Matches a string with this regular expression, and returns an iterable of matches\n     * containing the results of that search.\n     * @param string A string to search within.\n     */\n    [Symbol.matchAll](str: string): RegExpStringIterator<RegExpMatchArray>;\n}\n',
  "lib.es2021.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2020" />\n/// <reference lib="es2021.promise" />\n/// <reference lib="es2021.string" />\n/// <reference lib="es2021.weakref" />\n/// <reference lib="es2021.intl" />\n',
  "lib.es2021.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    interface DateTimeFormatPartTypesRegistry {\n        fractionalSecond: any;\n    }\n\n    interface DateTimeFormatOptions {\n        formatMatcher?: "basic" | "best fit" | "best fit" | undefined;\n        dateStyle?: "full" | "long" | "medium" | "short" | undefined;\n        timeStyle?: "full" | "long" | "medium" | "short" | undefined;\n        dayPeriod?: "narrow" | "short" | "long" | undefined;\n        fractionalSecondDigits?: 1 | 2 | 3 | undefined;\n    }\n\n    interface DateTimeRangeFormatPart extends DateTimeFormatPart {\n        source: "startRange" | "endRange" | "shared";\n    }\n\n    interface DateTimeFormat {\n        formatRange(startDate: Date | number | bigint, endDate: Date | number | bigint): string;\n        formatRangeToParts(startDate: Date | number | bigint, endDate: Date | number | bigint): DateTimeRangeFormatPart[];\n    }\n\n    interface ResolvedDateTimeFormatOptions {\n        formatMatcher?: "basic" | "best fit" | "best fit";\n        dateStyle?: "full" | "long" | "medium" | "short";\n        timeStyle?: "full" | "long" | "medium" | "short";\n        hourCycle?: "h11" | "h12" | "h23" | "h24";\n        dayPeriod?: "narrow" | "short" | "long";\n        fractionalSecondDigits?: 1 | 2 | 3;\n    }\n\n    /**\n     * The locale matching algorithm to use.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat#parameters).\n     */\n    type ListFormatLocaleMatcher = "lookup" | "best fit";\n\n    /**\n     * The format of output message.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat#parameters).\n     */\n    type ListFormatType = "conjunction" | "disjunction" | "unit";\n\n    /**\n     * The length of the formatted message.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat#parameters).\n     */\n    type ListFormatStyle = "long" | "short" | "narrow";\n\n    /**\n     * An object with some or all properties of the `Intl.ListFormat` constructor `options` parameter.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat#parameters).\n     */\n    interface ListFormatOptions {\n        /** The locale matching algorithm to use. For information about this option, see [Intl page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation). */\n        localeMatcher?: ListFormatLocaleMatcher | undefined;\n        /** The format of output message. */\n        type?: ListFormatType | undefined;\n        /** The length of the internationalized message. */\n        style?: ListFormatStyle | undefined;\n    }\n\n    interface ResolvedListFormatOptions {\n        locale: string;\n        style: ListFormatStyle;\n        type: ListFormatType;\n    }\n\n    interface ListFormat {\n        /**\n         * Returns a string with a language-specific representation of the list.\n         *\n         * @param list - An iterable object, such as an [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array).\n         *\n         * @throws `TypeError` if `list` includes something other than the possible values.\n         *\n         * @returns {string} A language-specific formatted string representing the elements of the list.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/format).\n         */\n        format(list: Iterable<string>): string;\n\n        /**\n         * Returns an Array of objects representing the different components that can be used to format a list of values in a locale-aware fashion.\n         *\n         * @param list - An iterable object, such as an [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array), to be formatted according to a locale.\n         *\n         * @throws `TypeError` if `list` includes something other than the possible values.\n         *\n         * @returns {{ type: "element" | "literal", value: string; }[]} An Array of components which contains the formatted parts from the list.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/formatToParts).\n         */\n        formatToParts(list: Iterable<string>): { type: "element" | "literal"; value: string; }[];\n\n        /**\n         * Returns a new object with properties reflecting the locale and style\n         * formatting options computed during the construction of the current\n         * `Intl.ListFormat` object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/resolvedOptions).\n         */\n        resolvedOptions(): ResolvedListFormatOptions;\n    }\n\n    const ListFormat: {\n        prototype: ListFormat;\n\n        /**\n         * Creates [Intl.ListFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat) objects that\n         * enable language-sensitive list formatting.\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the `locales` argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/ListFormat#parameters)\n         *  with some or all options of `ListFormatOptions`.\n         *\n         * @returns [Intl.ListFormatOptions](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat) object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat).\n         */\n        new (locales?: LocalesArgument, options?: ListFormatOptions): ListFormat;\n\n        /**\n         * Returns an array containing those of the provided locales that are\n         * supported in list formatting without having to fall back to the runtime\'s default locale.\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the `locales` argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/supportedLocalesOf#parameters).\n         *  with some or all possible options.\n         *\n         * @returns An array of strings representing a subset of the given locale tags that are supported in list\n         *  formatting without having to fall back to the runtime\'s default locale.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/supportedLocalesOf).\n         */\n        supportedLocalesOf(locales: LocalesArgument, options?: Pick<ListFormatOptions, "localeMatcher">): UnicodeBCP47LocaleIdentifier[];\n    };\n}\n',
  "lib.es2021.promise.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface AggregateError extends Error {\n    errors: any[];\n}\n\ninterface AggregateErrorConstructor {\n    new (errors: Iterable<any>, message?: string): AggregateError;\n    (errors: Iterable<any>, message?: string): AggregateError;\n    readonly prototype: AggregateError;\n}\n\ndeclare var AggregateError: AggregateErrorConstructor;\n\n/**\n * Represents the completion of an asynchronous operation\n */\ninterface PromiseConstructor {\n    /**\n     * The any function returns a promise that is fulfilled by the first given promise to be fulfilled, or rejected with an AggregateError containing an array of rejection reasons if all of the given promises are rejected. It resolves all elements of the passed iterable to promises as it runs this algorithm.\n     * @param values An array or iterable of Promises.\n     * @returns A new Promise.\n     */\n    any<T extends readonly unknown[] | []>(values: T): Promise<Awaited<T[number]>>;\n\n    /**\n     * The any function returns a promise that is fulfilled by the first given promise to be fulfilled, or rejected with an AggregateError containing an array of rejection reasons if all of the given promises are rejected. It resolves all elements of the passed iterable to promises as it runs this algorithm.\n     * @param values An array or iterable of Promises.\n     * @returns A new Promise.\n     */\n    any<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;\n}\n',
  "lib.es2021.string.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface String {\n    /**\n     * Replace all instances of a substring in a string, using a regular expression or search string.\n     * @param searchValue A string to search for.\n     * @param replaceValue A string containing the text to replace for every successful match of searchValue in this string.\n     */\n    replaceAll(searchValue: string | RegExp, replaceValue: string): string;\n\n    /**\n     * Replace all instances of a substring in a string, using a regular expression or search string.\n     * @param searchValue A string to search for.\n     * @param replacer A function that returns the replacement text.\n     */\n    replaceAll(searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string;\n}\n',
  "lib.es2021.weakref.d.ts": `/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */


/// <reference no-default-lib="true"/>

/// <reference lib="es2015.symbol.wellknown" />

interface WeakRef<T extends WeakKey> {
    readonly [Symbol.toStringTag]: "WeakRef";

    /**
     * Returns the WeakRef instance's target value, or undefined if the target value has been
     * reclaimed.
     * In es2023 the value can be either a symbol or an object, in previous versions only object is permissible.
     */
    deref(): T | undefined;
}

interface WeakRefConstructor {
    readonly prototype: WeakRef<any>;

    /**
     * Creates a WeakRef instance for the given target value.
     * In es2023 the value can be either a symbol or an object, in previous versions only object is permissible.
     * @param target The target value for the WeakRef instance.
     */
    new <T extends WeakKey>(target: T): WeakRef<T>;
}

declare var WeakRef: WeakRefConstructor;

interface FinalizationRegistry<T> {
    readonly [Symbol.toStringTag]: "FinalizationRegistry";

    /**
     * Registers a value with the registry.
     * In es2023 the value can be either a symbol or an object, in previous versions only object is permissible.
     * @param target The target value to register.
     * @param heldValue The value to pass to the finalizer for this value. This cannot be the
     * target value.
     * @param unregisterToken The token to pass to the unregister method to unregister the target
     * value. If not provided, the target cannot be unregistered.
     */
    register(target: WeakKey, heldValue: T, unregisterToken?: WeakKey): void;

    /**
     * Unregisters a value from the registry.
     * In es2023 the value can be either a symbol or an object, in previous versions only object is permissible.
     * @param unregisterToken The token that was used as the unregisterToken argument when calling
     * register to register the target value.
     */
    unregister(unregisterToken: WeakKey): boolean;
}

interface FinalizationRegistryConstructor {
    readonly prototype: FinalizationRegistry<any>;

    /**
     * Creates a finalization registry with an associated cleanup callback
     * @param cleanupCallback The callback to call after a value in the registry has been reclaimed.
     */
    new <T>(cleanupCallback: (heldValue: T) => void): FinalizationRegistry<T>;
}

declare var FinalizationRegistry: FinalizationRegistryConstructor;
`,
  "lib.es2022.array.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface Array<T> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): T | undefined;\n}\n\ninterface ReadonlyArray<T> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): T | undefined;\n}\n\ninterface Int8Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Uint8Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Int16Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Uint16Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Int32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Uint32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Float32Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface Float64Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): number | undefined;\n}\n\ninterface BigInt64Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): bigint | undefined;\n}\n\ninterface BigUint64Array<TArrayBuffer extends ArrayBufferLike> {\n    /**\n     * Returns the item located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): bigint | undefined;\n}\n',
  "lib.es2022.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2021" />\n/// <reference lib="es2022.array" />\n/// <reference lib="es2022.error" />\n/// <reference lib="es2022.intl" />\n/// <reference lib="es2022.object" />\n/// <reference lib="es2022.regexp" />\n/// <reference lib="es2022.string" />\n',
  "lib.es2022.error.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="es2021.promise" />\n\ninterface ErrorOptions {\n    cause?: unknown;\n}\n\ninterface Error {\n    cause?: unknown;\n}\n\ninterface ErrorConstructor {\n    new (message?: string, options?: ErrorOptions): Error;\n    (message?: string, options?: ErrorOptions): Error;\n}\n\ninterface EvalErrorConstructor {\n    new (message?: string, options?: ErrorOptions): EvalError;\n    (message?: string, options?: ErrorOptions): EvalError;\n}\n\ninterface RangeErrorConstructor {\n    new (message?: string, options?: ErrorOptions): RangeError;\n    (message?: string, options?: ErrorOptions): RangeError;\n}\n\ninterface ReferenceErrorConstructor {\n    new (message?: string, options?: ErrorOptions): ReferenceError;\n    (message?: string, options?: ErrorOptions): ReferenceError;\n}\n\ninterface SyntaxErrorConstructor {\n    new (message?: string, options?: ErrorOptions): SyntaxError;\n    (message?: string, options?: ErrorOptions): SyntaxError;\n}\n\ninterface TypeErrorConstructor {\n    new (message?: string, options?: ErrorOptions): TypeError;\n    (message?: string, options?: ErrorOptions): TypeError;\n}\n\ninterface URIErrorConstructor {\n    new (message?: string, options?: ErrorOptions): URIError;\n    (message?: string, options?: ErrorOptions): URIError;\n}\n\ninterface AggregateErrorConstructor {\n    new (\n        errors: Iterable<any>,\n        message?: string,\n        options?: ErrorOptions,\n    ): AggregateError;\n    (\n        errors: Iterable<any>,\n        message?: string,\n        options?: ErrorOptions,\n    ): AggregateError;\n}\n',
  "lib.es2022.intl.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ndeclare namespace Intl {\n    /**\n     * An object with some or all properties of the `Intl.Segmenter` constructor `options` parameter.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/Segmenter#parameters)\n     */\n    interface SegmenterOptions {\n        /** The locale matching algorithm to use. For information about this option, see [Intl page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation). */\n        localeMatcher?: "best fit" | "lookup" | undefined;\n        /** The type of input to be split */\n        granularity?: "grapheme" | "word" | "sentence" | undefined;\n    }\n\n    /**\n     * The `Intl.Segmenter` object enables locale-sensitive text segmentation, enabling you to get meaningful items (graphemes, words or sentences) from a string.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)\n     */\n    interface Segmenter {\n        /**\n         * Returns `Segments` object containing the segments of the input string, using the segmenter\'s locale and granularity.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/segment)\n         *\n         * @param input - The text to be segmented as a `string`.\n         *\n         * @returns A new iterable Segments object containing the segments of the input string, using the segmenter\'s locale and granularity.\n         */\n        segment(input: string): Segments;\n        /**\n         * The `resolvedOptions()` method of `Intl.Segmenter` instances returns a new object with properties reflecting the options computed during initialization of this `Segmenter` object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/resolvedOptions)\n         */\n        resolvedOptions(): ResolvedSegmenterOptions;\n    }\n\n    interface ResolvedSegmenterOptions {\n        locale: string;\n        granularity: "grapheme" | "word" | "sentence";\n    }\n\n    interface SegmentIterator<T> extends IteratorObject<T, BuiltinIteratorReturn, unknown> {\n        [Symbol.iterator](): SegmentIterator<T>;\n    }\n\n    /**\n     * A `Segments` object is an iterable collection of the segments of a text string. It is returned by a call to the `segment()` method of an `Intl.Segmenter` object.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/segment/Segments)\n     */\n    interface Segments {\n        /**\n         * Returns an object describing the segment in the original string that includes the code unit at a specified index.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/segment/Segments/containing)\n         *\n         * @param codeUnitIndex - A number specifying the index of the code unit in the original input string. If the value is omitted, it defaults to `0`.\n         */\n        containing(codeUnitIndex?: number): SegmentData | undefined;\n\n        /** Returns an iterator to iterate over the segments. */\n        [Symbol.iterator](): SegmentIterator<SegmentData>;\n    }\n\n    interface SegmentData {\n        /** A string containing the segment extracted from the original input string. */\n        segment: string;\n        /** The code unit index in the original input string at which the segment begins. */\n        index: number;\n        /** The complete input string that was segmented. */\n        input: string;\n        /**\n         * A boolean value only if granularity is "word"; otherwise, undefined.\n         * If granularity is "word", then isWordLike is true when the segment is word-like (i.e., consists of letters/numbers/ideographs/etc.); otherwise, false.\n         */\n        isWordLike?: boolean;\n    }\n\n    /**\n     * The `Intl.Segmenter` object enables locale-sensitive text segmentation, enabling you to get meaningful items (graphemes, words or sentences) from a string.\n     *\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)\n     */\n    const Segmenter: {\n        prototype: Segmenter;\n\n        /**\n         * Creates a new `Intl.Segmenter` object.\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the `locales` argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options - An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/Segmenter#parameters)\n         *  with some or all options of `SegmenterOptions`.\n         *\n         * @returns [Intl.Segmenter](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segments) object.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter).\n         */\n        new (locales?: LocalesArgument, options?: SegmenterOptions): Segmenter;\n\n        /**\n         * Returns an array containing those of the provided locales that are supported without having to fall back to the runtime\'s default locale.\n         *\n         * @param locales - A string with a [BCP 47 language tag](http://tools.ietf.org/html/rfc5646), or an array of such strings.\n         *  For the general form and interpretation of the `locales` argument,\n         *  see the [`Intl` page](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_identification_and_negotiation).\n         *\n         * @param options An [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/supportedLocalesOf#parameters).\n         *  with some or all possible options.\n         *\n         * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/supportedLocalesOf)\n         */\n        supportedLocalesOf(locales: LocalesArgument, options?: Pick<SegmenterOptions, "localeMatcher">): UnicodeBCP47LocaleIdentifier[];\n    };\n\n    /**\n     * Returns a sorted array of the supported collation, calendar, currency, numbering system, timezones, and units by the implementation.\n     * [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf)\n     *\n     * @param key A string indicating the category of values to return.\n     * @returns A sorted array of the supported values.\n     */\n    function supportedValuesOf(key: "calendar" | "collation" | "currency" | "numberingSystem" | "timeZone" | "unit"): string[];\n}\n',
  "lib.es2022.object.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface ObjectConstructor {\n    /**\n     * Determines whether an object has a property with the specified name.\n     * @param o An object.\n     * @param v A property name.\n     */\n    hasOwn(o: object, v: PropertyKey): boolean;\n}\n',
  "lib.es2022.regexp.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface RegExpMatchArray {\n    indices?: RegExpIndicesArray;\n}\n\ninterface RegExpExecArray {\n    indices?: RegExpIndicesArray;\n}\n\ninterface RegExpIndicesArray extends Array<[number, number]> {\n    groups?: {\n        [key: string]: [number, number];\n    };\n}\n\ninterface RegExp {\n    /**\n     * Returns a Boolean value indicating the state of the hasIndices flag (d) used with a regular expression.\n     * Default is false. Read-only.\n     */\n    readonly hasIndices: boolean;\n}\n',
  "lib.es2022.string.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\ninterface String {\n    /**\n     * Returns a new String consisting of the single UTF-16 code unit located at the specified index.\n     * @param index The zero-based index of the desired code unit. A negative index will count back from the last item.\n     */\n    at(index: number): string | undefined;\n}\n',
  "lib.es5.d.ts": '/*! *****************************************************************************\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use\nthis file except in compliance with the License. You may obtain a copy of the\nLicense at http://www.apache.org/licenses/LICENSE-2.0\n\nTHIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\nKIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED\nWARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,\nMERCHANTABLITY OR NON-INFRINGEMENT.\n\nSee the Apache Version 2.0 License for specific language governing permissions\nand limitations under the License.\n***************************************************************************** */\n\n\n/// <reference no-default-lib="true"/>\n\n/// <reference lib="decorators" />\n/// <reference lib="decorators.legacy" />\n\n/////////////////////////////\n/// ECMAScript APIs\n/////////////////////////////\n\ndeclare var NaN: number;\ndeclare var Infinity: number;\n\n/**\n * Evaluates JavaScript code and executes it.\n * @param x A String value that contains valid JavaScript code.\n */\ndeclare function eval(x: string): any;\n\n/**\n * Converts a string to an integer.\n * @param string A string to convert into a number.\n * @param radix A value between 2 and 36 that specifies the base of the number in `string`.\n * If this argument is not supplied, strings with a prefix of \'0x\' are considered hexadecimal.\n * All other strings are considered decimal.\n */\ndeclare function parseInt(string: string, radix?: number): number;\n\n/**\n * Converts a string to a floating-point number.\n * @param string A string that contains a floating-point number.\n */\ndeclare function parseFloat(string: string): number;\n\n/**\n * Returns a Boolean value that indicates whether a value is the reserved value NaN (not a number).\n * @param number A numeric value.\n */\ndeclare function isNaN(number: number): boolean;\n\n/**\n * Determines whether a supplied number is finite.\n * @param number Any numeric value.\n */\ndeclare function isFinite(number: number): boolean;\n\n/**\n * Gets the unencoded version of an encoded Uniform Resource Identifier (URI).\n * @param encodedURI A value representing an encoded URI.\n */\ndeclare function decodeURI(encodedURI: string): string;\n\n/**\n * Gets the unencoded version of an encoded component of a Uniform Resource Identifier (URI).\n * @param encodedURIComponent A value representing an encoded URI component.\n */\ndeclare function decodeURIComponent(encodedURIComponent: string): string;\n\n/**\n * Encodes a text string as a valid Uniform Resource Identifier (URI)\n * @param uri A value representing an unencoded URI.\n */\ndeclare function encodeURI(uri: string): string;\n\n/**\n * Encodes a text string as a valid component of a Uniform Resource Identifier (URI).\n * @param uriComponent A value representing an unencoded URI component.\n */\ndeclare function encodeURIComponent(uriComponent: string | number | boolean): string;\n\n/**\n * Computes a new string in which certain characters have been replaced by a hexadecimal escape sequence.\n * @deprecated A legacy feature for browser compatibility\n * @param string A string value\n */\ndeclare function escape(string: string): string;\n\n/**\n * Computes a new string in which hexadecimal escape sequences are replaced with the character that it represents.\n * @deprecated A legacy feature for browser compatibility\n * @param string A string value\n */\ndeclare function unescape(string: string): string;\n\ninterface Symbol {\n    /** Returns a string representation of an object. */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): symbol;\n}\n\ndeclare type PropertyKey = string | number | symbol;\n\ninterface PropertyDescriptor {\n    configurable?: boolean;\n    enumerable?: boolean;\n    value?: any;\n    writable?: boolean;\n    get?(): any;\n    set?(v: any): void;\n}\n\ninterface PropertyDescriptorMap {\n    [key: PropertyKey]: PropertyDescriptor;\n}\n\ninterface Object {\n    /** The initial value of Object.prototype.constructor is the standard built-in Object constructor. */\n    constructor: Function;\n\n    /** Returns a string representation of an object. */\n    toString(): string;\n\n    /** Returns a date converted to a string using the current locale. */\n    toLocaleString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): Object;\n\n    /**\n     * Determines whether an object has a property with the specified name.\n     * @param v A property name.\n     */\n    hasOwnProperty(v: PropertyKey): boolean;\n\n    /**\n     * Determines whether an object exists in another object\'s prototype chain.\n     * @param v Another object whose prototype chain is to be checked.\n     */\n    isPrototypeOf(v: Object): boolean;\n\n    /**\n     * Determines whether a specified property is enumerable.\n     * @param v A property name.\n     */\n    propertyIsEnumerable(v: PropertyKey): boolean;\n}\n\ninterface ObjectConstructor {\n    new (value?: any): Object;\n    (): any;\n    (value: any): any;\n\n    /** A reference to the prototype for a class of objects. */\n    readonly prototype: Object;\n\n    /**\n     * Returns the prototype of an object.\n     * @param o The object that references the prototype.\n     */\n    getPrototypeOf(o: any): any;\n\n    /**\n     * Gets the own property descriptor of the specified object.\n     * An own property descriptor is one that is defined directly on the object and is not inherited from the object\'s prototype.\n     * @param o Object that contains the property.\n     * @param p Name of the property.\n     */\n    getOwnPropertyDescriptor(o: any, p: PropertyKey): PropertyDescriptor | undefined;\n\n    /**\n     * Returns the names of the own properties of an object. The own properties of an object are those that are defined directly\n     * on that object, and are not inherited from the object\'s prototype. The properties of an object include both fields (objects) and functions.\n     * @param o Object that contains the own properties.\n     */\n    getOwnPropertyNames(o: any): string[];\n\n    /**\n     * Creates an object that has the specified prototype or that has null prototype.\n     * @param o Object to use as a prototype. May be null.\n     */\n    create(o: object | null): any;\n\n    /**\n     * Creates an object that has the specified prototype, and that optionally contains specified properties.\n     * @param o Object to use as a prototype. May be null\n     * @param properties JavaScript object that contains one or more property descriptors.\n     */\n    create(o: object | null, properties: PropertyDescriptorMap & ThisType<any>): any;\n\n    /**\n     * Adds a property to an object, or modifies attributes of an existing property.\n     * @param o Object on which to add or modify the property. This can be a native JavaScript object (that is, a user-defined object or a built in object) or a DOM object.\n     * @param p The property name.\n     * @param attributes Descriptor for the property. It can be for a data property or an accessor property.\n     */\n    defineProperty<T>(o: T, p: PropertyKey, attributes: PropertyDescriptor & ThisType<any>): T;\n\n    /**\n     * Adds one or more properties to an object, and/or modifies attributes of existing properties.\n     * @param o Object on which to add or modify the properties. This can be a native JavaScript object or a DOM object.\n     * @param properties JavaScript object that contains one or more descriptor objects. Each descriptor object describes a data property or an accessor property.\n     */\n    defineProperties<T>(o: T, properties: PropertyDescriptorMap & ThisType<any>): T;\n\n    /**\n     * Prevents the modification of attributes of existing properties, and prevents the addition of new properties.\n     * @param o Object on which to lock the attributes.\n     */\n    seal<T>(o: T): T;\n\n    /**\n     * Prevents the modification of existing property attributes and values, and prevents the addition of new properties.\n     * @param f Object on which to lock the attributes.\n     */\n    freeze<T extends Function>(f: T): T;\n\n    /**\n     * Prevents the modification of existing property attributes and values, and prevents the addition of new properties.\n     * @param o Object on which to lock the attributes.\n     */\n    freeze<T extends { [idx: string]: U | null | undefined | object; }, U extends string | bigint | number | boolean | symbol>(o: T): Readonly<T>;\n\n    /**\n     * Prevents the modification of existing property attributes and values, and prevents the addition of new properties.\n     * @param o Object on which to lock the attributes.\n     */\n    freeze<T>(o: T): Readonly<T>;\n\n    /**\n     * Prevents the addition of new properties to an object.\n     * @param o Object to make non-extensible.\n     */\n    preventExtensions<T>(o: T): T;\n\n    /**\n     * Returns true if existing property attributes cannot be modified in an object and new properties cannot be added to the object.\n     * @param o Object to test.\n     */\n    isSealed(o: any): boolean;\n\n    /**\n     * Returns true if existing property attributes and values cannot be modified in an object, and new properties cannot be added to the object.\n     * @param o Object to test.\n     */\n    isFrozen(o: any): boolean;\n\n    /**\n     * Returns a value that indicates whether new properties can be added to an object.\n     * @param o Object to test.\n     */\n    isExtensible(o: any): boolean;\n\n    /**\n     * Returns the names of the enumerable string properties and methods of an object.\n     * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.\n     */\n    keys(o: object): string[];\n}\n\n/**\n * Provides functionality common to all JavaScript objects.\n */\ndeclare var Object: ObjectConstructor;\n\n/**\n * Creates a new function.\n */\ninterface Function {\n    /**\n     * Calls the function, substituting the specified object for the this value of the function, and the specified array for the arguments of the function.\n     * @param thisArg The object to be used as the this object.\n     * @param argArray A set of arguments to be passed to the function.\n     */\n    apply(this: Function, thisArg: any, argArray?: any): any;\n\n    /**\n     * Calls a method of an object, substituting another object for the current object.\n     * @param thisArg The object to be used as the current object.\n     * @param argArray A list of arguments to be passed to the method.\n     */\n    call(this: Function, thisArg: any, ...argArray: any[]): any;\n\n    /**\n     * For a given function, creates a bound function that has the same body as the original function.\n     * The this object of the bound function is associated with the specified object, and has the specified initial parameters.\n     * @param thisArg An object to which the this keyword can refer inside the new function.\n     * @param argArray A list of arguments to be passed to the new function.\n     */\n    bind(this: Function, thisArg: any, ...argArray: any[]): any;\n\n    /** Returns a string representation of a function. */\n    toString(): string;\n\n    prototype: any;\n    readonly length: number;\n\n    // Non-standard extensions\n    arguments: any;\n    caller: Function;\n}\n\ninterface FunctionConstructor {\n    /**\n     * Creates a new function.\n     * @param args A list of arguments the function accepts.\n     */\n    new (...args: string[]): Function;\n    (...args: string[]): Function;\n    readonly prototype: Function;\n}\n\ndeclare var Function: FunctionConstructor;\n\n/**\n * Extracts the type of the \'this\' parameter of a function type, or \'unknown\' if the function type has no \'this\' parameter.\n */\ntype ThisParameterType<T> = T extends (this: infer U, ...args: never) => any ? U : unknown;\n\n/**\n * Removes the \'this\' parameter from a function type.\n */\ntype OmitThisParameter<T> = unknown extends ThisParameterType<T> ? T : T extends (...args: infer A) => infer R ? (...args: A) => R : T;\n\ninterface CallableFunction extends Function {\n    /**\n     * Calls the function with the specified object as the this value and the elements of specified array as the arguments.\n     * @param thisArg The object to be used as the this object.\n     */\n    apply<T, R>(this: (this: T) => R, thisArg: T): R;\n\n    /**\n     * Calls the function with the specified object as the this value and the elements of specified array as the arguments.\n     * @param thisArg The object to be used as the this object.\n     * @param args An array of argument values to be passed to the function.\n     */\n    apply<T, A extends any[], R>(this: (this: T, ...args: A) => R, thisArg: T, args: A): R;\n\n    /**\n     * Calls the function with the specified object as the this value and the specified rest arguments as the arguments.\n     * @param thisArg The object to be used as the this object.\n     * @param args Argument values to be passed to the function.\n     */\n    call<T, A extends any[], R>(this: (this: T, ...args: A) => R, thisArg: T, ...args: A): R;\n\n    /**\n     * For a given function, creates a bound function that has the same body as the original function.\n     * The this object of the bound function is associated with the specified object, and has the specified initial parameters.\n     * @param thisArg The object to be used as the this object.\n     */\n    bind<T>(this: T, thisArg: ThisParameterType<T>): OmitThisParameter<T>;\n\n    /**\n     * For a given function, creates a bound function that has the same body as the original function.\n     * The this object of the bound function is associated with the specified object, and has the specified initial parameters.\n     * @param thisArg The object to be used as the this object.\n     * @param args Arguments to bind to the parameters of the function.\n     */\n    bind<T, A extends any[], B extends any[], R>(this: (this: T, ...args: [...A, ...B]) => R, thisArg: T, ...args: A): (...args: B) => R;\n}\n\ninterface NewableFunction extends Function {\n    /**\n     * Calls the function with the specified object as the this value and the elements of specified array as the arguments.\n     * @param thisArg The object to be used as the this object.\n     */\n    apply<T>(this: new () => T, thisArg: T): void;\n    /**\n     * Calls the function with the specified object as the this value and the elements of specified array as the arguments.\n     * @param thisArg The object to be used as the this object.\n     * @param args An array of argument values to be passed to the function.\n     */\n    apply<T, A extends any[]>(this: new (...args: A) => T, thisArg: T, args: A): void;\n\n    /**\n     * Calls the function with the specified object as the this value and the specified rest arguments as the arguments.\n     * @param thisArg The object to be used as the this object.\n     * @param args Argument values to be passed to the function.\n     */\n    call<T, A extends any[]>(this: new (...args: A) => T, thisArg: T, ...args: A): void;\n\n    /**\n     * For a given function, creates a bound function that has the same body as the original function.\n     * The this object of the bound function is associated with the specified object, and has the specified initial parameters.\n     * @param thisArg The object to be used as the this object.\n     */\n    bind<T>(this: T, thisArg: any): T;\n\n    /**\n     * For a given function, creates a bound function that has the same body as the original function.\n     * The this object of the bound function is associated with the specified object, and has the specified initial parameters.\n     * @param thisArg The object to be used as the this object.\n     * @param args Arguments to bind to the parameters of the function.\n     */\n    bind<A extends any[], B extends any[], R>(this: new (...args: [...A, ...B]) => R, thisArg: any, ...args: A): new (...args: B) => R;\n}\n\ninterface IArguments {\n    [index: number]: any;\n    length: number;\n    callee: Function;\n}\n\ninterface String {\n    /** Returns a string representation of a string. */\n    toString(): string;\n\n    /**\n     * Returns the character at the specified index.\n     * @param pos The zero-based index of the desired character.\n     */\n    charAt(pos: number): string;\n\n    /**\n     * Returns the Unicode value of the character at the specified location.\n     * @param index The zero-based index of the desired character. If there is no character at the specified index, NaN is returned.\n     */\n    charCodeAt(index: number): number;\n\n    /**\n     * Returns a string that contains the concatenation of two or more strings.\n     * @param strings The strings to append to the end of the string.\n     */\n    concat(...strings: string[]): string;\n\n    /**\n     * Returns the position of the first occurrence of a substring.\n     * @param searchString The substring to search for in the string\n     * @param position The index at which to begin searching the String object. If omitted, search starts at the beginning of the string.\n     */\n    indexOf(searchString: string, position?: number): number;\n\n    /**\n     * Returns the last occurrence of a substring in the string.\n     * @param searchString The substring to search for.\n     * @param position The index at which to begin searching. If omitted, the search begins at the end of the string.\n     */\n    lastIndexOf(searchString: string, position?: number): number;\n\n    /**\n     * Determines whether two strings are equivalent in the current locale.\n     * @param that String to compare to target string\n     */\n    localeCompare(that: string): number;\n\n    /**\n     * Matches a string with a regular expression, and returns an array containing the results of that search.\n     * @param regexp A variable name or string literal containing the regular expression pattern and flags.\n     */\n    match(regexp: string | RegExp): RegExpMatchArray | null;\n\n    /**\n     * Replaces text in a string, using a regular expression or search string.\n     * @param searchValue A string or regular expression to search for.\n     * @param replaceValue A string containing the text to replace. When the {@linkcode searchValue} is a `RegExp`, all matches are replaced if the `g` flag is set (or only those matches at the beginning, if the `y` flag is also present). Otherwise, only the first match of {@linkcode searchValue} is replaced.\n     */\n    replace(searchValue: string | RegExp, replaceValue: string): string;\n\n    /**\n     * Replaces text in a string, using a regular expression or search string.\n     * @param searchValue A string to search for.\n     * @param replacer A function that returns the replacement text.\n     */\n    replace(searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string;\n\n    /**\n     * Finds the first substring match in a regular expression search.\n     * @param regexp The regular expression pattern and applicable flags.\n     */\n    search(regexp: string | RegExp): number;\n\n    /**\n     * Returns a section of a string.\n     * @param start The index to the beginning of the specified portion of stringObj.\n     * @param end The index to the end of the specified portion of stringObj. The substring includes the characters up to, but not including, the character indicated by end.\n     * If this value is not specified, the substring continues to the end of stringObj.\n     */\n    slice(start?: number, end?: number): string;\n\n    /**\n     * Split a string into substrings using the specified separator and return them as an array.\n     * @param separator A string that identifies character or characters to use in separating the string. If omitted, a single-element array containing the entire string is returned.\n     * @param limit A value used to limit the number of elements returned in the array.\n     */\n    split(separator: string | RegExp, limit?: number): string[];\n\n    /**\n     * Returns the substring at the specified location within a String object.\n     * @param start The zero-based index number indicating the beginning of the substring.\n     * @param end Zero-based index number indicating the end of the substring. The substring includes the characters up to, but not including, the character indicated by end.\n     * If end is omitted, the characters from start through the end of the original string are returned.\n     */\n    substring(start: number, end?: number): string;\n\n    /** Converts all the alphabetic characters in a string to lowercase. */\n    toLowerCase(): string;\n\n    /** Converts all alphabetic characters to lowercase, taking into account the host environment\'s current locale. */\n    toLocaleLowerCase(locales?: string | string[]): string;\n\n    /** Converts all the alphabetic characters in a string to uppercase. */\n    toUpperCase(): string;\n\n    /** Returns a string where all alphabetic characters have been converted to uppercase, taking into account the host environment\'s current locale. */\n    toLocaleUpperCase(locales?: string | string[]): string;\n\n    /** Removes the leading and trailing white space and line terminator characters from a string. */\n    trim(): string;\n\n    /** Returns the length of a String object. */\n    readonly length: number;\n\n    // IE extensions\n    /**\n     * Gets a substring beginning at the specified location and having the specified length.\n     * @deprecated A legacy feature for browser compatibility\n     * @param from The starting position of the desired substring. The index of the first character in the string is zero.\n     * @param length The number of characters to include in the returned substring.\n     */\n    substr(from: number, length?: number): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): string;\n\n    readonly [index: number]: string;\n}\n\ninterface StringConstructor {\n    new (value?: any): String;\n    (value?: any): string;\n    readonly prototype: String;\n    fromCharCode(...codes: number[]): string;\n}\n\n/**\n * Allows manipulation and formatting of text strings and determination and location of substrings within strings.\n */\ndeclare var String: StringConstructor;\n\ninterface Boolean {\n    /** Returns the primitive value of the specified object. */\n    valueOf(): boolean;\n}\n\ninterface BooleanConstructor {\n    new (value?: any): Boolean;\n    <T>(value?: T): boolean;\n    readonly prototype: Boolean;\n}\n\ndeclare var Boolean: BooleanConstructor;\n\ninterface Number {\n    /**\n     * Returns a string representation of an object.\n     * @param radix Specifies a radix for converting numeric values to strings. This value is only used for numbers.\n     */\n    toString(radix?: number): string;\n\n    /**\n     * Returns a string representing a number in fixed-point notation.\n     * @param fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.\n     */\n    toFixed(fractionDigits?: number): string;\n\n    /**\n     * Returns a string containing a number represented in exponential notation.\n     * @param fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.\n     */\n    toExponential(fractionDigits?: number): string;\n\n    /**\n     * Returns a string containing a number represented either in exponential or fixed-point notation with a specified number of digits.\n     * @param precision Number of significant digits. Must be in the range 1 - 21, inclusive.\n     */\n    toPrecision(precision?: number): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): number;\n}\n\ninterface NumberConstructor {\n    new (value?: any): Number;\n    (value?: any): number;\n    readonly prototype: Number;\n\n    /** The largest number that can be represented in JavaScript. Equal to approximately 1.79E+308. */\n    readonly MAX_VALUE: number;\n\n    /** The closest number to zero that can be represented in JavaScript. Equal to approximately 5.00E-324. */\n    readonly MIN_VALUE: number;\n\n    /**\n     * A value that is not a number.\n     * In equality comparisons, NaN does not equal any value, including itself. To test whether a value is equivalent to NaN, use the isNaN function.\n     */\n    readonly NaN: number;\n\n    /**\n     * A value that is less than the largest negative number that can be represented in JavaScript.\n     * JavaScript displays NEGATIVE_INFINITY values as -infinity.\n     */\n    readonly NEGATIVE_INFINITY: number;\n\n    /**\n     * A value greater than the largest number that can be represented in JavaScript.\n     * JavaScript displays POSITIVE_INFINITY values as infinity.\n     */\n    readonly POSITIVE_INFINITY: number;\n}\n\n/** An object that represents a number of any kind. All JavaScript numbers are 64-bit floating-point numbers. */\ndeclare var Number: NumberConstructor;\n\ninterface TemplateStringsArray extends ReadonlyArray<string> {\n    readonly raw: readonly string[];\n}\n\n/**\n * The type of `import.meta`.\n *\n * If you need to declare that a given property exists on `import.meta`,\n * this type may be augmented via interface merging.\n */\ninterface ImportMeta {\n}\n\n/**\n * The type for the optional second argument to `import()`.\n *\n * If your host environment supports additional options, this type may be\n * augmented via interface merging.\n */\ninterface ImportCallOptions {\n    /** @deprecated*/ assert?: ImportAssertions;\n    with?: ImportAttributes;\n}\n\n/**\n * The type for the `assert` property of the optional second argument to `import()`.\n * @deprecated\n */\ninterface ImportAssertions {\n    [key: string]: string;\n}\n\n/**\n * The type for the `with` property of the optional second argument to `import()`.\n */\ninterface ImportAttributes {\n    [key: string]: string;\n}\n\ninterface Math {\n    /** The mathematical constant e. This is Euler\'s number, the base of natural logarithms. */\n    readonly E: number;\n    /** The natural logarithm of 10. */\n    readonly LN10: number;\n    /** The natural logarithm of 2. */\n    readonly LN2: number;\n    /** The base-2 logarithm of e. */\n    readonly LOG2E: number;\n    /** The base-10 logarithm of e. */\n    readonly LOG10E: number;\n    /** Pi. This is the ratio of the circumference of a circle to its diameter. */\n    readonly PI: number;\n    /** The square root of 0.5, or, equivalently, one divided by the square root of 2. */\n    readonly SQRT1_2: number;\n    /** The square root of 2. */\n    readonly SQRT2: number;\n    /**\n     * Returns the absolute value of a number (the value without regard to whether it is positive or negative).\n     * For example, the absolute value of -5 is the same as the absolute value of 5.\n     * @param x A numeric expression for which the absolute value is needed.\n     */\n    abs(x: number): number;\n    /**\n     * Returns the arc cosine (or inverse cosine) of a number.\n     * @param x A numeric expression.\n     */\n    acos(x: number): number;\n    /**\n     * Returns the arcsine of a number.\n     * @param x A numeric expression.\n     */\n    asin(x: number): number;\n    /**\n     * Returns the arctangent of a number.\n     * @param x A numeric expression for which the arctangent is needed.\n     */\n    atan(x: number): number;\n    /**\n     * Returns the angle (in radians) between the X axis and the line going through both the origin and the given point.\n     * @param y A numeric expression representing the cartesian y-coordinate.\n     * @param x A numeric expression representing the cartesian x-coordinate.\n     */\n    atan2(y: number, x: number): number;\n    /**\n     * Returns the smallest integer greater than or equal to its numeric argument.\n     * @param x A numeric expression.\n     */\n    ceil(x: number): number;\n    /**\n     * Returns the cosine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    cos(x: number): number;\n    /**\n     * Returns e (the base of natural logarithms) raised to a power.\n     * @param x A numeric expression representing the power of e.\n     */\n    exp(x: number): number;\n    /**\n     * Returns the greatest integer less than or equal to its numeric argument.\n     * @param x A numeric expression.\n     */\n    floor(x: number): number;\n    /**\n     * Returns the natural logarithm (base e) of a number.\n     * @param x A numeric expression.\n     */\n    log(x: number): number;\n    /**\n     * Returns the larger of a set of supplied numeric expressions.\n     * @param values Numeric expressions to be evaluated.\n     */\n    max(...values: number[]): number;\n    /**\n     * Returns the smaller of a set of supplied numeric expressions.\n     * @param values Numeric expressions to be evaluated.\n     */\n    min(...values: number[]): number;\n    /**\n     * Returns the value of a base expression taken to a specified power.\n     * @param x The base value of the expression.\n     * @param y The exponent value of the expression.\n     */\n    pow(x: number, y: number): number;\n    /** Returns a pseudorandom number between 0 and 1. */\n    random(): number;\n    /**\n     * Returns a supplied numeric expression rounded to the nearest integer.\n     * @param x The value to be rounded to the nearest integer.\n     */\n    round(x: number): number;\n    /**\n     * Returns the sine of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    sin(x: number): number;\n    /**\n     * Returns the square root of a number.\n     * @param x A numeric expression.\n     */\n    sqrt(x: number): number;\n    /**\n     * Returns the tangent of a number.\n     * @param x A numeric expression that contains an angle measured in radians.\n     */\n    tan(x: number): number;\n}\n/** An intrinsic object that provides basic mathematics functionality and constants. */\ndeclare var Math: Math;\n\n/** Enables basic storage and retrieval of dates and times. */\ninterface Date {\n    /** Returns a string representation of a date. The format of the string depends on the locale. */\n    toString(): string;\n    /** Returns a date as a string value. */\n    toDateString(): string;\n    /** Returns a time as a string value. */\n    toTimeString(): string;\n    /** Returns a value as a string value appropriate to the host environment\'s current locale. */\n    toLocaleString(): string;\n    /** Returns a date as a string value appropriate to the host environment\'s current locale. */\n    toLocaleDateString(): string;\n    /** Returns a time as a string value appropriate to the host environment\'s current locale. */\n    toLocaleTimeString(): string;\n    /** Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC. */\n    valueOf(): number;\n    /** Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC. */\n    getTime(): number;\n    /** Gets the year, using local time. */\n    getFullYear(): number;\n    /** Gets the year using Universal Coordinated Time (UTC). */\n    getUTCFullYear(): number;\n    /** Gets the month, using local time. */\n    getMonth(): number;\n    /** Gets the month of a Date object using Universal Coordinated Time (UTC). */\n    getUTCMonth(): number;\n    /** Gets the day-of-the-month, using local time. */\n    getDate(): number;\n    /** Gets the day-of-the-month, using Universal Coordinated Time (UTC). */\n    getUTCDate(): number;\n    /** Gets the day of the week, using local time. */\n    getDay(): number;\n    /** Gets the day of the week using Universal Coordinated Time (UTC). */\n    getUTCDay(): number;\n    /** Gets the hours in a date, using local time. */\n    getHours(): number;\n    /** Gets the hours value in a Date object using Universal Coordinated Time (UTC). */\n    getUTCHours(): number;\n    /** Gets the minutes of a Date object, using local time. */\n    getMinutes(): number;\n    /** Gets the minutes of a Date object using Universal Coordinated Time (UTC). */\n    getUTCMinutes(): number;\n    /** Gets the seconds of a Date object, using local time. */\n    getSeconds(): number;\n    /** Gets the seconds of a Date object using Universal Coordinated Time (UTC). */\n    getUTCSeconds(): number;\n    /** Gets the milliseconds of a Date, using local time. */\n    getMilliseconds(): number;\n    /** Gets the milliseconds of a Date object using Universal Coordinated Time (UTC). */\n    getUTCMilliseconds(): number;\n    /** Gets the difference in minutes between Universal Coordinated Time (UTC) and the time on the local computer. */\n    getTimezoneOffset(): number;\n    /**\n     * Sets the date and time value in the Date object.\n     * @param time A numeric value representing the number of elapsed milliseconds since midnight, January 1, 1970 GMT.\n     */\n    setTime(time: number): number;\n    /**\n     * Sets the milliseconds value in the Date object using local time.\n     * @param ms A numeric value equal to the millisecond value.\n     */\n    setMilliseconds(ms: number): number;\n    /**\n     * Sets the milliseconds value in the Date object using Universal Coordinated Time (UTC).\n     * @param ms A numeric value equal to the millisecond value.\n     */\n    setUTCMilliseconds(ms: number): number;\n\n    /**\n     * Sets the seconds value in the Date object using local time.\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setSeconds(sec: number, ms?: number): number;\n    /**\n     * Sets the seconds value in the Date object using Universal Coordinated Time (UTC).\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setUTCSeconds(sec: number, ms?: number): number;\n    /**\n     * Sets the minutes value in the Date object using local time.\n     * @param min A numeric value equal to the minutes value.\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setMinutes(min: number, sec?: number, ms?: number): number;\n    /**\n     * Sets the minutes value in the Date object using Universal Coordinated Time (UTC).\n     * @param min A numeric value equal to the minutes value.\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setUTCMinutes(min: number, sec?: number, ms?: number): number;\n    /**\n     * Sets the hour value in the Date object using local time.\n     * @param hours A numeric value equal to the hours value.\n     * @param min A numeric value equal to the minutes value.\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setHours(hours: number, min?: number, sec?: number, ms?: number): number;\n    /**\n     * Sets the hours value in the Date object using Universal Coordinated Time (UTC).\n     * @param hours A numeric value equal to the hours value.\n     * @param min A numeric value equal to the minutes value.\n     * @param sec A numeric value equal to the seconds value.\n     * @param ms A numeric value equal to the milliseconds value.\n     */\n    setUTCHours(hours: number, min?: number, sec?: number, ms?: number): number;\n    /**\n     * Sets the numeric day-of-the-month value of the Date object using local time.\n     * @param date A numeric value equal to the day of the month.\n     */\n    setDate(date: number): number;\n    /**\n     * Sets the numeric day of the month in the Date object using Universal Coordinated Time (UTC).\n     * @param date A numeric value equal to the day of the month.\n     */\n    setUTCDate(date: number): number;\n    /**\n     * Sets the month value in the Date object using local time.\n     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.\n     * @param date A numeric value representing the day of the month. If this value is not supplied, the value from a call to the getDate method is used.\n     */\n    setMonth(month: number, date?: number): number;\n    /**\n     * Sets the month value in the Date object using Universal Coordinated Time (UTC).\n     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.\n     * @param date A numeric value representing the day of the month. If it is not supplied, the value from a call to the getUTCDate method is used.\n     */\n    setUTCMonth(month: number, date?: number): number;\n    /**\n     * Sets the year of the Date object using local time.\n     * @param year A numeric value for the year.\n     * @param month A zero-based numeric value for the month (0 for January, 11 for December). Must be specified if numDate is specified.\n     * @param date A numeric value equal for the day of the month.\n     */\n    setFullYear(year: number, month?: number, date?: number): number;\n    /**\n     * Sets the year value in the Date object using Universal Coordinated Time (UTC).\n     * @param year A numeric value equal to the year.\n     * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively. Must be supplied if numDate is supplied.\n     * @param date A numeric value equal to the day of the month.\n     */\n    setUTCFullYear(year: number, month?: number, date?: number): number;\n    /** Returns a date converted to a string using Universal Coordinated Time (UTC). */\n    toUTCString(): string;\n    /** Returns a date as a string value in ISO format. */\n    toISOString(): string;\n    /** Used by the JSON.stringify method to enable the transformation of an object\'s data for JavaScript Object Notation (JSON) serialization. */\n    toJSON(key?: any): string;\n}\n\ninterface DateConstructor {\n    new (): Date;\n    new (value: number | string): Date;\n    /**\n     * Creates a new Date.\n     * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.\n     * @param monthIndex The month as a number between 0 and 11 (January to December).\n     * @param date The date as a number between 1 and 31.\n     * @param hours Must be supplied if minutes is supplied. A number from 0 to 23 (midnight to 11pm) that specifies the hour.\n     * @param minutes Must be supplied if seconds is supplied. A number from 0 to 59 that specifies the minutes.\n     * @param seconds Must be supplied if milliseconds is supplied. A number from 0 to 59 that specifies the seconds.\n     * @param ms A number from 0 to 999 that specifies the milliseconds.\n     */\n    new (year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;\n    (): string;\n    readonly prototype: Date;\n    /**\n     * Parses a string containing a date, and returns the number of milliseconds between that date and midnight, January 1, 1970.\n     * @param s A date string\n     */\n    parse(s: string): number;\n    /**\n     * Returns the number of milliseconds between midnight, January 1, 1970 Universal Coordinated Time (UTC) (or GMT) and the specified date.\n     * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.\n     * @param monthIndex The month as a number between 0 and 11 (January to December).\n     * @param date The date as a number between 1 and 31.\n     * @param hours Must be supplied if minutes is supplied. A number from 0 to 23 (midnight to 11pm) that specifies the hour.\n     * @param minutes Must be supplied if seconds is supplied. A number from 0 to 59 that specifies the minutes.\n     * @param seconds Must be supplied if milliseconds is supplied. A number from 0 to 59 that specifies the seconds.\n     * @param ms A number from 0 to 999 that specifies the milliseconds.\n     */\n    UTC(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;\n    /** Returns the number of milliseconds elapsed since midnight, January 1, 1970 Universal Coordinated Time (UTC). */\n    now(): number;\n}\n\ndeclare var Date: DateConstructor;\n\ninterface RegExpMatchArray extends Array<string> {\n    /**\n     * The index of the search at which the result was found.\n     */\n    index?: number;\n    /**\n     * A copy of the search string.\n     */\n    input?: string;\n    /**\n     * The first match. This will always be present because `null` will be returned if there are no matches.\n     */\n    0: string;\n}\n\ninterface RegExpExecArray extends Array<string> {\n    /**\n     * The index of the search at which the result was found.\n     */\n    index: number;\n    /**\n     * A copy of the search string.\n     */\n    input: string;\n    /**\n     * The first match. This will always be present because `null` will be returned if there are no matches.\n     */\n    0: string;\n}\n\ninterface RegExp {\n    /**\n     * Executes a search on a string using a regular expression pattern, and returns an array containing the results of that search.\n     * @param string The String object or string literal on which to perform the search.\n     */\n    exec(string: string): RegExpExecArray | null;\n\n    /**\n     * Returns a Boolean value that indicates whether or not a pattern exists in a searched string.\n     * @param string String on which to perform the search.\n     */\n    test(string: string): boolean;\n\n    /** Returns a copy of the text of the regular expression pattern. Read-only. The regExp argument is a Regular expression object. It can be a variable name or a literal. */\n    readonly source: string;\n\n    /** Returns a Boolean value indicating the state of the global flag (g) used with a regular expression. Default is false. Read-only. */\n    readonly global: boolean;\n\n    /** Returns a Boolean value indicating the state of the ignoreCase flag (i) used with a regular expression. Default is false. Read-only. */\n    readonly ignoreCase: boolean;\n\n    /** Returns a Boolean value indicating the state of the multiline flag (m) used with a regular expression. Default is false. Read-only. */\n    readonly multiline: boolean;\n\n    lastIndex: number;\n\n    // Non-standard extensions\n    /** @deprecated A legacy feature for browser compatibility */\n    compile(pattern: string, flags?: string): this;\n}\n\ninterface RegExpConstructor {\n    new (pattern: RegExp | string): RegExp;\n    new (pattern: string, flags?: string): RegExp;\n    (pattern: RegExp | string): RegExp;\n    (pattern: string, flags?: string): RegExp;\n    readonly "prototype": RegExp;\n\n    // Non-standard extensions\n    /** @deprecated A legacy feature for browser compatibility */\n    "$1": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$2": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$3": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$4": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$5": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$6": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$7": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$8": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$9": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "input": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$_": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "lastMatch": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$&": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "lastParen": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$+": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "leftContext": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$`": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "rightContext": string;\n    /** @deprecated A legacy feature for browser compatibility */\n    "$\'": string;\n}\n\ndeclare var RegExp: RegExpConstructor;\n\ninterface Error {\n    name: string;\n    message: string;\n    stack?: string;\n}\n\ninterface ErrorConstructor {\n    new (message?: string): Error;\n    (message?: string): Error;\n    readonly prototype: Error;\n}\n\ndeclare var Error: ErrorConstructor;\n\ninterface EvalError extends Error {\n}\n\ninterface EvalErrorConstructor extends ErrorConstructor {\n    new (message?: string): EvalError;\n    (message?: string): EvalError;\n    readonly prototype: EvalError;\n}\n\ndeclare var EvalError: EvalErrorConstructor;\n\ninterface RangeError extends Error {\n}\n\ninterface RangeErrorConstructor extends ErrorConstructor {\n    new (message?: string): RangeError;\n    (message?: string): RangeError;\n    readonly prototype: RangeError;\n}\n\ndeclare var RangeError: RangeErrorConstructor;\n\ninterface ReferenceError extends Error {\n}\n\ninterface ReferenceErrorConstructor extends ErrorConstructor {\n    new (message?: string): ReferenceError;\n    (message?: string): ReferenceError;\n    readonly prototype: ReferenceError;\n}\n\ndeclare var ReferenceError: ReferenceErrorConstructor;\n\ninterface SyntaxError extends Error {\n}\n\ninterface SyntaxErrorConstructor extends ErrorConstructor {\n    new (message?: string): SyntaxError;\n    (message?: string): SyntaxError;\n    readonly prototype: SyntaxError;\n}\n\ndeclare var SyntaxError: SyntaxErrorConstructor;\n\ninterface TypeError extends Error {\n}\n\ninterface TypeErrorConstructor extends ErrorConstructor {\n    new (message?: string): TypeError;\n    (message?: string): TypeError;\n    readonly prototype: TypeError;\n}\n\ndeclare var TypeError: TypeErrorConstructor;\n\ninterface URIError extends Error {\n}\n\ninterface URIErrorConstructor extends ErrorConstructor {\n    new (message?: string): URIError;\n    (message?: string): URIError;\n    readonly prototype: URIError;\n}\n\ndeclare var URIError: URIErrorConstructor;\n\ninterface JSON {\n    /**\n     * Converts a JavaScript Object Notation (JSON) string into an object.\n     * @param text A valid JSON string.\n     * @param reviver A function that transforms the results. This function is called for each member of the object.\n     * If a member contains nested objects, the nested objects are transformed before the parent object is.\n     * @throws {SyntaxError} If `text` is not valid JSON.\n     */\n    parse(text: string, reviver?: (this: any, key: string, value: any) => any): any;\n    /**\n     * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.\n     * @param value A JavaScript value, usually an object or array, to be converted.\n     * @param replacer A function that transforms the results.\n     * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.\n     * @throws {TypeError} If a circular reference or a BigInt value is found.\n     */\n    stringify(value: any, replacer?: (this: any, key: string, value: any) => any, space?: string | number): string;\n    /**\n     * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.\n     * @param value A JavaScript value, usually an object or array, to be converted.\n     * @param replacer An array of strings and numbers that acts as an approved list for selecting the object properties that will be stringified.\n     * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.\n     * @throws {TypeError} If a circular reference or a BigInt value is found.\n     */\n    stringify(value: any, replacer?: (number | string)[] | null, space?: string | number): string;\n}\n\n/**\n * An intrinsic object that provides functions to convert JavaScript values to and from the JavaScript Object Notation (JSON) format.\n */\ndeclare var JSON: JSON;\n\n/////////////////////////////\n/// ECMAScript Array API (specially handled by compiler)\n/////////////////////////////\n\ninterface ReadonlyArray<T> {\n    /**\n     * Gets the length of the array. This is a number one higher than the highest element defined in an array.\n     */\n    readonly length: number;\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n    /**\n     * Returns a string representation of an array. The elements are converted to string using their toLocaleString methods.\n     */\n    toLocaleString(): string;\n    /**\n     * Combines two or more arrays.\n     * @param items Additional items to add to the end of array1.\n     */\n    concat(...items: ConcatArray<T>[]): T[];\n    /**\n     * Combines two or more arrays.\n     * @param items Additional items to add to the end of array1.\n     */\n    concat(...items: (T | ConcatArray<T>)[]): T[];\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): T[];\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.\n     */\n    indexOf(searchElement: T, fromIndex?: number): number;\n    /**\n     * Returns the index of the last occurrence of a specified value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.\n     */\n    lastIndexOf(searchElement: T, fromIndex?: number): number;\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every<S extends T>(predicate: (value: T, index: number, array: readonly T[]) => value is S, thisArg?: any): this is readonly S[];\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): boolean;\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): boolean;\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: T, index: number, array: readonly T[]) => void, thisArg?: any): void;\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.\n     */\n    map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U, thisArg?: any): U[];\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.\n     */\n    filter<S extends T>(predicate: (value: T, index: number, array: readonly T[]) => value is S, thisArg?: any): S[];\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: T, index: number, array: readonly T[]) => unknown, thisArg?: any): T[];\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T): T;\n    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T, initialValue: T): T;\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U, initialValue: U): U;\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T): T;\n    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: readonly T[]) => T, initialValue: T): T;\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: readonly T[]) => U, initialValue: U): U;\n\n    readonly [n: number]: T;\n}\n\ninterface ConcatArray<T> {\n    readonly length: number;\n    readonly [n: number]: T;\n    join(separator?: string): string;\n    slice(start?: number, end?: number): T[];\n}\n\ninterface Array<T> {\n    /**\n     * Gets or sets the length of the array. This is a number one higher than the highest index in the array.\n     */\n    length: number;\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n    /**\n     * Returns a string representation of an array. The elements are converted to string using their toLocaleString methods.\n     */\n    toLocaleString(): string;\n    /**\n     * Removes the last element from an array and returns it.\n     * If the array is empty, undefined is returned and the array is not modified.\n     */\n    pop(): T | undefined;\n    /**\n     * Appends new elements to the end of an array, and returns the new length of the array.\n     * @param items New elements to add to the array.\n     */\n    push(...items: T[]): number;\n    /**\n     * Combines two or more arrays.\n     * This method returns a new array without modifying any existing arrays.\n     * @param items Additional arrays and/or items to add to the end of the array.\n     */\n    concat(...items: ConcatArray<T>[]): T[];\n    /**\n     * Combines two or more arrays.\n     * This method returns a new array without modifying any existing arrays.\n     * @param items Additional arrays and/or items to add to the end of the array.\n     */\n    concat(...items: (T | ConcatArray<T>)[]): T[];\n    /**\n     * Adds all the elements of an array into a string, separated by the specified separator string.\n     * @param separator A string used to separate one element of the array from the next in the resulting string. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n    /**\n     * Reverses the elements in an array in place.\n     * This method mutates the array and returns a reference to the same array.\n     */\n    reverse(): T[];\n    /**\n     * Removes the first element from an array and returns it.\n     * If the array is empty, undefined is returned and the array is not modified.\n     */\n    shift(): T | undefined;\n    /**\n     * Returns a copy of a section of an array.\n     * For both start and end, a negative index can be used to indicate an offset from the end of the array.\n     * For example, -2 refers to the second to last element of the array.\n     * @param start The beginning index of the specified portion of the array.\n     * If start is undefined, then the slice begins at index 0.\n     * @param end The end index of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     * If end is undefined, then the slice extends to the end of the array.\n     */\n    slice(start?: number, end?: number): T[];\n    /**\n     * Sorts an array in place.\n     * This method mutates the array and returns a reference to the same array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if the first argument is less than the second argument, zero if they\'re equal, and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending, UTF-16 code unit order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: T, b: T) => number): this;\n    /**\n     * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.\n     * @param start The zero-based location in the array from which to start removing elements.\n     * @param deleteCount The number of elements to remove. Omitting this argument will remove all elements from the start\n     * paramater location to end of the array. If value of this argument is either a negative number, zero, undefined, or a type\n     * that cannot be converted to an integer, the function will evaluate the argument as zero and not remove any elements.\n     * @returns An array containing the elements that were deleted.\n     */\n    splice(start: number, deleteCount?: number): T[];\n    /**\n     * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.\n     * @param start The zero-based location in the array from which to start removing elements.\n     * @param deleteCount The number of elements to remove. If value of this argument is either a negative number, zero,\n     * undefined, or a type that cannot be converted to an integer, the function will evaluate the argument as zero and\n     * not remove any elements.\n     * @param items Elements to insert into the array in place of the deleted elements.\n     * @returns An array containing the elements that were deleted.\n     */\n    splice(start: number, deleteCount: number, ...items: T[]): T[];\n    /**\n     * Inserts new elements at the start of an array, and returns the new length of the array.\n     * @param items Elements to insert at the start of the array.\n     */\n    unshift(...items: T[]): number;\n    /**\n     * Returns the index of the first occurrence of a value in an array, or -1 if it is not present.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.\n     */\n    indexOf(searchElement: T, fromIndex?: number): number;\n    /**\n     * Returns the index of the last occurrence of a specified value in an array, or -1 if it is not present.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin searching backward. If fromIndex is omitted, the search starts at the last index in the array.\n     */\n    lastIndexOf(searchElement: T, fromIndex?: number): number;\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): this is S[];\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.\n     */\n    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.\n     */\n    filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;\n    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;\n    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;\n\n    [n: number]: T;\n}\n\ninterface ArrayConstructor {\n    new (arrayLength?: number): any[];\n    new <T>(arrayLength: number): T[];\n    new <T>(...items: T[]): T[];\n    (arrayLength?: number): any[];\n    <T>(arrayLength: number): T[];\n    <T>(...items: T[]): T[];\n    isArray(arg: any): arg is any[];\n    readonly prototype: any[];\n}\n\ndeclare var Array: ArrayConstructor;\n\ninterface TypedPropertyDescriptor<T> {\n    enumerable?: boolean;\n    configurable?: boolean;\n    writable?: boolean;\n    value?: T;\n    get?: () => T;\n    set?: (value: T) => void;\n}\n\ndeclare type PromiseConstructorLike = new <T>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) => PromiseLike<T>;\n\ninterface PromiseLike<T> {\n    /**\n     * Attaches callbacks for the resolution and/or rejection of the Promise.\n     * @param onfulfilled The callback to execute when the Promise is resolved.\n     * @param onrejected The callback to execute when the Promise is rejected.\n     * @returns A Promise for the completion of which ever callback is executed.\n     */\n    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2>;\n}\n\n/**\n * Represents the completion of an asynchronous operation\n */\ninterface Promise<T> {\n    /**\n     * Attaches callbacks for the resolution and/or rejection of the Promise.\n     * @param onfulfilled The callback to execute when the Promise is resolved.\n     * @param onrejected The callback to execute when the Promise is rejected.\n     * @returns A Promise for the completion of which ever callback is executed.\n     */\n    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;\n\n    /**\n     * Attaches a callback for only the rejection of the Promise.\n     * @param onrejected The callback to execute when the Promise is rejected.\n     * @returns A Promise for the completion of the callback.\n     */\n    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;\n}\n\n/**\n * Recursively unwraps the "awaited type" of a type. Non-promise "thenables" should resolve to `never`. This emulates the behavior of `await`.\n */\ntype Awaited<T> = T extends null | undefined ? T : // special case for `null | undefined` when not in `--strictNullChecks` mode\n    T extends object & { then(onfulfilled: infer F, ...args: infer _): any; } ? // `await` only unwraps object types with a callable `then`. Non-object types are not unwrapped\n        F extends ((value: infer V, ...args: infer _) => any) ? // if the argument to `then` is callable, extracts the first argument\n            Awaited<V> : // recursively unwrap the value\n        never : // the argument to `then` was not callable\n    T; // non-object or non-thenable\n\ninterface ArrayLike<T> {\n    readonly length: number;\n    readonly [n: number]: T;\n}\n\n/**\n * Make all properties in T optional\n */\ntype Partial<T> = {\n    [P in keyof T]?: T[P];\n};\n\n/**\n * Make all properties in T required\n */\ntype Required<T> = {\n    [P in keyof T]-?: T[P];\n};\n\n/**\n * Make all properties in T readonly\n */\ntype Readonly<T> = {\n    readonly [P in keyof T]: T[P];\n};\n\n/**\n * From T, pick a set of properties whose keys are in the union K\n */\ntype Pick<T, K extends keyof T> = {\n    [P in K]: T[P];\n};\n\n/**\n * Construct a type with a set of properties K of type T\n */\ntype Record<K extends keyof any, T> = {\n    [P in K]: T;\n};\n\n/**\n * Exclude from T those types that are assignable to U\n */\ntype Exclude<T, U> = T extends U ? never : T;\n\n/**\n * Extract from T those types that are assignable to U\n */\ntype Extract<T, U> = T extends U ? T : never;\n\n/**\n * Construct a type with the properties of T except for those in type K.\n */\ntype Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;\n\n/**\n * Exclude null and undefined from T\n */\ntype NonNullable<T> = T & {};\n\n/**\n * Obtain the parameters of a function type in a tuple\n */\ntype Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;\n\n/**\n * Obtain the parameters of a constructor function type in a tuple\n */\ntype ConstructorParameters<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;\n\n/**\n * Obtain the return type of a function type\n */\ntype ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;\n\n/**\n * Obtain the return type of a constructor function type\n */\ntype InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : any;\n\n/**\n * Convert string literal type to uppercase\n */\ntype Uppercase<S extends string> = intrinsic;\n\n/**\n * Convert string literal type to lowercase\n */\ntype Lowercase<S extends string> = intrinsic;\n\n/**\n * Convert first character of string literal type to uppercase\n */\ntype Capitalize<S extends string> = intrinsic;\n\n/**\n * Convert first character of string literal type to lowercase\n */\ntype Uncapitalize<S extends string> = intrinsic;\n\n/**\n * Marker for non-inference type position\n */\ntype NoInfer<T> = intrinsic;\n\n/**\n * Marker for contextual \'this\' type\n */\ninterface ThisType<T> {}\n\n/**\n * Stores types to be used with WeakSet, WeakMap, WeakRef, and FinalizationRegistry\n */\ninterface WeakKeyTypes {\n    object: object;\n}\n\ntype WeakKey = WeakKeyTypes[keyof WeakKeyTypes];\n\n/**\n * Represents a raw buffer of binary data, which is used to store data for the\n * different typed arrays. ArrayBuffers cannot be read from or written to directly,\n * but can be passed to a typed array or DataView Object to interpret the raw\n * buffer as needed.\n */\ninterface ArrayBuffer {\n    /**\n     * Read-only. The length of the ArrayBuffer (in bytes).\n     */\n    readonly byteLength: number;\n\n    /**\n     * Returns a section of an ArrayBuffer.\n     */\n    slice(begin?: number, end?: number): ArrayBuffer;\n}\n\n/**\n * Allowed ArrayBuffer types for the buffer of an ArrayBufferView and related Typed Arrays.\n */\ninterface ArrayBufferTypes {\n    ArrayBuffer: ArrayBuffer;\n}\ntype ArrayBufferLike = ArrayBufferTypes[keyof ArrayBufferTypes];\n\ninterface ArrayBufferConstructor {\n    readonly prototype: ArrayBuffer;\n    new (byteLength: number): ArrayBuffer;\n    isView(arg: any): arg is ArrayBufferView;\n}\ndeclare var ArrayBuffer: ArrayBufferConstructor;\n\ninterface ArrayBufferView<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n}\n\ninterface DataView<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    readonly buffer: TArrayBuffer;\n    readonly byteLength: number;\n    readonly byteOffset: number;\n    /**\n     * Gets the Float32 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getFloat32(byteOffset: number, littleEndian?: boolean): number;\n\n    /**\n     * Gets the Float64 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getFloat64(byteOffset: number, littleEndian?: boolean): number;\n\n    /**\n     * Gets the Int8 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     */\n    getInt8(byteOffset: number): number;\n\n    /**\n     * Gets the Int16 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getInt16(byteOffset: number, littleEndian?: boolean): number;\n    /**\n     * Gets the Int32 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getInt32(byteOffset: number, littleEndian?: boolean): number;\n\n    /**\n     * Gets the Uint8 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     */\n    getUint8(byteOffset: number): number;\n\n    /**\n     * Gets the Uint16 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getUint16(byteOffset: number, littleEndian?: boolean): number;\n\n    /**\n     * Gets the Uint32 value at the specified byte offset from the start of the view. There is\n     * no alignment constraint; multi-byte values may be fetched from any offset.\n     * @param byteOffset The place in the buffer at which the value should be retrieved.\n     * @param littleEndian If false or undefined, a big-endian value should be read.\n     */\n    getUint32(byteOffset: number, littleEndian?: boolean): number;\n\n    /**\n     * Stores an Float32 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setFloat32(byteOffset: number, value: number, littleEndian?: boolean): void;\n\n    /**\n     * Stores an Float64 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setFloat64(byteOffset: number, value: number, littleEndian?: boolean): void;\n\n    /**\n     * Stores an Int8 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     */\n    setInt8(byteOffset: number, value: number): void;\n\n    /**\n     * Stores an Int16 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setInt16(byteOffset: number, value: number, littleEndian?: boolean): void;\n\n    /**\n     * Stores an Int32 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setInt32(byteOffset: number, value: number, littleEndian?: boolean): void;\n\n    /**\n     * Stores an Uint8 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     */\n    setUint8(byteOffset: number, value: number): void;\n\n    /**\n     * Stores an Uint16 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setUint16(byteOffset: number, value: number, littleEndian?: boolean): void;\n\n    /**\n     * Stores an Uint32 value at the specified byte offset from the start of the view.\n     * @param byteOffset The place in the buffer at which the value should be set.\n     * @param value The value to set.\n     * @param littleEndian If false or undefined, a big-endian value should be written.\n     */\n    setUint32(byteOffset: number, value: number, littleEndian?: boolean): void;\n}\ninterface DataViewConstructor {\n    readonly prototype: DataView<ArrayBufferLike>;\n    new <TArrayBuffer extends ArrayBufferLike & { BYTES_PER_ELEMENT?: never; }>(buffer: TArrayBuffer, byteOffset?: number, byteLength?: number): DataView<TArrayBuffer>;\n}\ndeclare var DataView: DataViewConstructor;\n\n/**\n * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested\n * number of bytes could not be allocated an exception is raised.\n */\ninterface Int8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Int8Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Int8Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Int8Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Int8Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Int8Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Int8ArrayConstructor {\n    readonly prototype: Int8Array<ArrayBufferLike>;\n    new (length: number): Int8Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Int8Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Int8Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int8Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Int8Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Int8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Int8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Int8Array<ArrayBuffer>;\n}\ndeclare var Int8Array: Int8ArrayConstructor;\n\n/**\n * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated an exception is raised.\n */\ninterface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Uint8Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Uint8Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Uint8ArrayConstructor {\n    readonly prototype: Uint8Array<ArrayBufferLike>;\n    new (length: number): Uint8Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Uint8Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Uint8Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Uint8Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Uint8Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Uint8Array<ArrayBuffer>;\n}\ndeclare var Uint8Array: Uint8ArrayConstructor;\n\n/**\n * A typed array of 8-bit unsigned integer (clamped) values. The contents are initialized to 0.\n * If the requested number of bytes could not be allocated an exception is raised.\n */\ninterface Uint8ClampedArray<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Uint8ClampedArray view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Uint8ClampedArray<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Uint8ClampedArrayConstructor {\n    readonly prototype: Uint8ClampedArray<ArrayBufferLike>;\n    new (length: number): Uint8ClampedArray<ArrayBuffer>;\n    new (array: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Uint8ClampedArray<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8ClampedArray<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Uint8ClampedArray<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Uint8ClampedArray<ArrayBuffer>;\n}\ndeclare var Uint8ClampedArray: Uint8ClampedArrayConstructor;\n\n/**\n * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated an exception is raised.\n */\ninterface Int16Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Int16Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Int16Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Int16Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Int16Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Int16Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Int16ArrayConstructor {\n    readonly prototype: Int16Array<ArrayBufferLike>;\n    new (length: number): Int16Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Int16Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Int16Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int16Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Int16Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Int16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Int16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Int16Array<ArrayBuffer>;\n}\ndeclare var Int16Array: Int16ArrayConstructor;\n\n/**\n * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated an exception is raised.\n */\ninterface Uint16Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Uint16Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Uint16Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Uint16ArrayConstructor {\n    readonly prototype: Uint16Array<ArrayBufferLike>;\n    new (length: number): Uint16Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Uint16Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Uint16Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint16Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Uint16Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Uint16Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Uint16Array<ArrayBuffer>;\n}\ndeclare var Uint16Array: Uint16ArrayConstructor;\n/**\n * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated an exception is raised.\n */\ninterface Int32Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Int32Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Int32Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Int32Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Int32Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Int32Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Int32ArrayConstructor {\n    readonly prototype: Int32Array<ArrayBufferLike>;\n    new (length: number): Int32Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Int32Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Int32Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int32Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Int32Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Int32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Int32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Int32Array<ArrayBuffer>;\n}\ndeclare var Int32Array: Int32ArrayConstructor;\n\n/**\n * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the\n * requested number of bytes could not be allocated an exception is raised.\n */\ninterface Uint32Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Uint32Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Uint32Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Uint32ArrayConstructor {\n    readonly prototype: Uint32Array<ArrayBufferLike>;\n    new (length: number): Uint32Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Uint32Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Uint32Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint32Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Uint32Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Uint32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Uint32Array<ArrayBuffer>;\n}\ndeclare var Uint32Array: Uint32ArrayConstructor;\n\n/**\n * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number\n * of bytes could not be allocated an exception is raised.\n */\ninterface Float32Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Float32Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Float32Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Float32Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Float32Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Float32Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Float32ArrayConstructor {\n    readonly prototype: Float32Array<ArrayBufferLike>;\n    new (length: number): Float32Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Float32Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Float32Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float32Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Float32Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Float32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Float32Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Float32Array<ArrayBuffer>;\n}\ndeclare var Float32Array: Float32ArrayConstructor;\n\n/**\n * A typed array of 64-bit float values. The contents are initialized to 0. If the requested\n * number of bytes could not be allocated an exception is raised.\n */\ninterface Float64Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * The ArrayBuffer instance referenced by the array.\n     */\n    readonly buffer: TArrayBuffer;\n\n    /**\n     * The length in bytes of the array.\n     */\n    readonly byteLength: number;\n\n    /**\n     * The offset in bytes of the array.\n     */\n    readonly byteOffset: number;\n\n    /**\n     * Returns the this object after copying a section of the array identified by start and end\n     * to the same array starting at position target\n     * @param target If target is negative, it is treated as length+target where length is the\n     * length of the array.\n     * @param start If start is negative, it is treated as length+start. If end is negative, it\n     * is treated as length+end.\n     * @param end If not specified, length of the this object is used as its default value.\n     */\n    copyWithin(target: number, start: number, end?: number): this;\n\n    /**\n     * Determines whether all the members of an array satisfy the specified test.\n     * @param predicate A function that accepts up to three arguments. The every method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value false, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Changes all array elements from `start` to `end` index to a static `value` and returns the modified array\n     * @param value value to fill array section with\n     * @param start index to start filling the array at. If start is negative, it is treated as\n     * length+start where length is the length of the array.\n     * @param end index to stop filling the array at. If end is negative, it is treated as\n     * length+end.\n     */\n    fill(value: number, start?: number, end?: number): this;\n\n    /**\n     * Returns the elements of an array that meet the condition specified in a callback function.\n     * @param predicate A function that accepts up to three arguments. The filter method calls\n     * the predicate function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): Float64Array<ArrayBuffer>;\n\n    /**\n     * Returns the value of the first element in the array where predicate is true, and undefined\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found, find\n     * immediately returns that element value. Otherwise, find returns undefined.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;\n\n    /**\n     * Returns the index of the first element in the array where predicate is true, and -1\n     * otherwise.\n     * @param predicate find calls predicate once for each element of the array, in ascending\n     * order, until it finds one where predicate returns true. If such an element is found,\n     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.\n     * @param thisArg If provided, it will be used as the this value for each invocation of\n     * predicate. If it is not provided, undefined is used instead.\n     */\n    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;\n\n    /**\n     * Performs the specified action for each element in an array.\n     * @param callbackfn A function that accepts up to three arguments. forEach calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;\n\n    /**\n     * Returns the index of the first occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    indexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * Adds all the elements of an array separated by the specified separator string.\n     * @param separator A string used to separate one element of an array from the next in the\n     * resulting String. If omitted, the array elements are separated with a comma.\n     */\n    join(separator?: string): string;\n\n    /**\n     * Returns the index of the last occurrence of a value in an array.\n     * @param searchElement The value to locate in the array.\n     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the\n     * search starts at index 0.\n     */\n    lastIndexOf(searchElement: number, fromIndex?: number): number;\n\n    /**\n     * The length of the array.\n     */\n    readonly length: number;\n\n    /**\n     * Calls a defined callback function on each element of an array, and returns an array that\n     * contains the results.\n     * @param callbackfn A function that accepts up to three arguments. The map method calls the\n     * callbackfn function one time for each element in the array.\n     * @param thisArg An object to which the this keyword can refer in the callbackfn function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): Float64Array<ArrayBuffer>;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array. The return value of\n     * the callback function is the accumulated result, and is provided as an argument in the next\n     * call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the\n     * callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an\n     * argument instead of an array value.\n     */\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;\n    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;\n\n    /**\n     * Calls the specified callback function for all the elements in an array, in descending order.\n     * The return value of the callback function is the accumulated result, and is provided as an\n     * argument in the next call to the callback function.\n     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls\n     * the callbackfn function one time for each element in the array.\n     * @param initialValue If initialValue is specified, it is used as the initial value to start\n     * the accumulation. The first call to the callbackfn function provides this value as an argument\n     * instead of an array value.\n     */\n    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;\n\n    /**\n     * Reverses the elements in an Array.\n     */\n    reverse(): this;\n\n    /**\n     * Sets a value or an array of values.\n     * @param array A typed or untyped array of values to set.\n     * @param offset The index in the current array at which the values are to be written.\n     */\n    set(array: ArrayLike<number>, offset?: number): void;\n\n    /**\n     * Returns a section of an array.\n     * @param start The beginning of the specified portion of the array.\n     * @param end The end of the specified portion of the array. This is exclusive of the element at the index \'end\'.\n     */\n    slice(start?: number, end?: number): Float64Array<ArrayBuffer>;\n\n    /**\n     * Determines whether the specified callback function returns true for any element of an array.\n     * @param predicate A function that accepts up to three arguments. The some method calls\n     * the predicate function for each element in the array until the predicate returns a value\n     * which is coercible to the Boolean value true, or until the end of the array.\n     * @param thisArg An object to which the this keyword can refer in the predicate function.\n     * If thisArg is omitted, undefined is used as the this value.\n     */\n    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;\n\n    /**\n     * Sorts an array.\n     * @param compareFn Function used to determine the order of the elements. It is expected to return\n     * a negative value if first argument is less than second argument, zero if they\'re equal and a positive\n     * value otherwise. If omitted, the elements are sorted in ascending order.\n     * ```ts\n     * [11,2,22,1].sort((a, b) => a - b)\n     * ```\n     */\n    sort(compareFn?: (a: number, b: number) => number): this;\n\n    /**\n     * Gets a new Float64Array view of the ArrayBuffer store for this array, referencing the elements\n     * at begin, inclusive, up to end, exclusive.\n     * @param begin The index of the beginning of the array.\n     * @param end The index of the end of the array.\n     */\n    subarray(begin?: number, end?: number): Float64Array<TArrayBuffer>;\n\n    /**\n     * Converts a number to a string by using the current locale.\n     */\n    toLocaleString(): string;\n\n    /**\n     * Returns a string representation of an array.\n     */\n    toString(): string;\n\n    /** Returns the primitive value of the specified object. */\n    valueOf(): this;\n\n    [index: number]: number;\n}\ninterface Float64ArrayConstructor {\n    readonly prototype: Float64Array<ArrayBufferLike>;\n    new (length: number): Float64Array<ArrayBuffer>;\n    new (array: ArrayLike<number>): Float64Array<ArrayBuffer>;\n    new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(buffer: TArrayBuffer, byteOffset?: number, length?: number): Float64Array<TArrayBuffer>;\n    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float64Array<ArrayBuffer>;\n    new (array: ArrayLike<number> | ArrayBuffer): Float64Array<ArrayBuffer>;\n\n    /**\n     * The size in bytes of each element in the array.\n     */\n    readonly BYTES_PER_ELEMENT: number;\n\n    /**\n     * Returns a new array from a set of elements.\n     * @param items A set of elements to include in the new array object.\n     */\n    of(...items: number[]): Float64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     */\n    from(arrayLike: ArrayLike<number>): Float64Array<ArrayBuffer>;\n\n    /**\n     * Creates an array from an array-like or iterable object.\n     * @param arrayLike An array-like object to convert to an array.\n     * @param mapfn A mapping function to call on every element of the array.\n     * @param thisArg Value of \'this\' used to invoke the mapfn.\n     */\n    from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: any): Float64Array<ArrayBuffer>;\n}\ndeclare var Float64Array: Float64ArrayConstructor;\n\n/////////////////////////////\n/// ECMAScript Internationalization API\n/////////////////////////////\n\ndeclare namespace Intl {\n    interface CollatorOptions {\n        usage?: "sort" | "search" | undefined;\n        localeMatcher?: "lookup" | "best fit" | undefined;\n        numeric?: boolean | undefined;\n        caseFirst?: "upper" | "lower" | "false" | undefined;\n        sensitivity?: "base" | "accent" | "case" | "variant" | undefined;\n        collation?: "big5han" | "compat" | "dict" | "direct" | "ducet" | "emoji" | "eor" | "gb2312" | "phonebk" | "phonetic" | "pinyin" | "reformed" | "searchjl" | "stroke" | "trad" | "unihan" | "zhuyin" | undefined;\n        ignorePunctuation?: boolean | undefined;\n    }\n\n    interface ResolvedCollatorOptions {\n        locale: string;\n        usage: string;\n        sensitivity: string;\n        ignorePunctuation: boolean;\n        collation: string;\n        caseFirst: string;\n        numeric: boolean;\n    }\n\n    interface Collator {\n        compare(x: string, y: string): number;\n        resolvedOptions(): ResolvedCollatorOptions;\n    }\n\n    interface CollatorConstructor {\n        new (locales?: string | string[], options?: CollatorOptions): Collator;\n        (locales?: string | string[], options?: CollatorOptions): Collator;\n        supportedLocalesOf(locales: string | string[], options?: CollatorOptions): string[];\n    }\n\n    var Collator: CollatorConstructor;\n\n    interface NumberFormatOptionsStyleRegistry {\n        decimal: never;\n        percent: never;\n        currency: never;\n    }\n\n    type NumberFormatOptionsStyle = keyof NumberFormatOptionsStyleRegistry;\n\n    interface NumberFormatOptionsCurrencyDisplayRegistry {\n        code: never;\n        symbol: never;\n        name: never;\n    }\n\n    type NumberFormatOptionsCurrencyDisplay = keyof NumberFormatOptionsCurrencyDisplayRegistry;\n\n    interface NumberFormatOptionsUseGroupingRegistry {}\n\n    type NumberFormatOptionsUseGrouping = {} extends NumberFormatOptionsUseGroupingRegistry ? boolean : keyof NumberFormatOptionsUseGroupingRegistry | "true" | "false" | boolean;\n    type ResolvedNumberFormatOptionsUseGrouping = {} extends NumberFormatOptionsUseGroupingRegistry ? boolean : keyof NumberFormatOptionsUseGroupingRegistry | false;\n\n    interface NumberFormatOptions {\n        localeMatcher?: "lookup" | "best fit" | undefined;\n        style?: NumberFormatOptionsStyle | undefined;\n        currency?: string | undefined;\n        currencyDisplay?: NumberFormatOptionsCurrencyDisplay | undefined;\n        useGrouping?: NumberFormatOptionsUseGrouping | undefined;\n        minimumIntegerDigits?: number | undefined;\n        minimumFractionDigits?: number | undefined;\n        maximumFractionDigits?: number | undefined;\n        minimumSignificantDigits?: number | undefined;\n        maximumSignificantDigits?: number | undefined;\n    }\n\n    interface ResolvedNumberFormatOptions {\n        locale: string;\n        numberingSystem: string;\n        style: NumberFormatOptionsStyle;\n        currency?: string;\n        currencyDisplay?: NumberFormatOptionsCurrencyDisplay;\n        minimumIntegerDigits: number;\n        minimumFractionDigits?: number;\n        maximumFractionDigits?: number;\n        minimumSignificantDigits?: number;\n        maximumSignificantDigits?: number;\n        useGrouping: ResolvedNumberFormatOptionsUseGrouping;\n    }\n\n    interface NumberFormat {\n        format(value: number): string;\n        resolvedOptions(): ResolvedNumberFormatOptions;\n    }\n\n    interface NumberFormatConstructor {\n        new (locales?: string | string[], options?: NumberFormatOptions): NumberFormat;\n        (locales?: string | string[], options?: NumberFormatOptions): NumberFormat;\n        supportedLocalesOf(locales: string | string[], options?: NumberFormatOptions): string[];\n        readonly prototype: NumberFormat;\n    }\n\n    var NumberFormat: NumberFormatConstructor;\n\n    interface DateTimeFormatOptions {\n        localeMatcher?: "best fit" | "lookup" | undefined;\n        weekday?: "long" | "short" | "narrow" | undefined;\n        era?: "long" | "short" | "narrow" | undefined;\n        year?: "numeric" | "2-digit" | undefined;\n        month?: "numeric" | "2-digit" | "long" | "short" | "narrow" | undefined;\n        day?: "numeric" | "2-digit" | undefined;\n        hour?: "numeric" | "2-digit" | undefined;\n        minute?: "numeric" | "2-digit" | undefined;\n        second?: "numeric" | "2-digit" | undefined;\n        timeZoneName?: "short" | "long" | "shortOffset" | "longOffset" | "shortGeneric" | "longGeneric" | undefined;\n        formatMatcher?: "best fit" | "basic" | undefined;\n        hour12?: boolean | undefined;\n        timeZone?: string | undefined;\n    }\n\n    interface ResolvedDateTimeFormatOptions {\n        locale: string;\n        calendar: string;\n        numberingSystem: string;\n        timeZone: string;\n        hour12?: boolean;\n        weekday?: string;\n        era?: string;\n        year?: string;\n        month?: string;\n        day?: string;\n        hour?: string;\n        minute?: string;\n        second?: string;\n        timeZoneName?: string;\n    }\n\n    interface DateTimeFormat {\n        format(date?: Date | number): string;\n        resolvedOptions(): ResolvedDateTimeFormatOptions;\n    }\n\n    interface DateTimeFormatConstructor {\n        new (locales?: string | string[], options?: DateTimeFormatOptions): DateTimeFormat;\n        (locales?: string | string[], options?: DateTimeFormatOptions): DateTimeFormat;\n        supportedLocalesOf(locales: string | string[], options?: DateTimeFormatOptions): string[];\n        readonly prototype: DateTimeFormat;\n    }\n\n    var DateTimeFormat: DateTimeFormatConstructor;\n}\n\ninterface String {\n    /**\n     * Determines whether two strings are equivalent in the current or specified locale.\n     * @param that String to compare to target string\n     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used. This parameter must conform to BCP 47 standards; see the Intl.Collator object for details.\n     * @param options An object that contains one or more properties that specify comparison options. see the Intl.Collator object for details.\n     */\n    localeCompare(that: string, locales?: string | string[], options?: Intl.CollatorOptions): number;\n}\n\ninterface Number {\n    /**\n     * Converts a number to a string by using the current or specified locale.\n     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string;\n}\n\ninterface Date {\n    /**\n     * Converts a date and time to a string by using the current or specified locale.\n     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;\n    /**\n     * Converts a date to a string by using the current or specified locale.\n     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleDateString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;\n\n    /**\n     * Converts a time to a string by using the current or specified locale.\n     * @param locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.\n     * @param options An object that contains one or more properties that specify comparison options.\n     */\n    toLocaleTimeString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;\n}\n'
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/compiler/compile.ts
var SCRIPT_FILE_NAME = "workflow-script.ts";
var WORKFLOW_FUNCTION_NAME = "__workflowScript__";
var SCRIPT_PRELUDE = `async function ${WORKFLOW_FUNCTION_NAME}() {
`;
var SCRIPT_EPILOGUE = "\n}\nexport {};\n";
var PRELUDE_LINES = 1;
var COMPILER_OPTIONS = {
  allowJs: false,
  lib: ["lib.es2022.d.ts"],
  module: ts2.ModuleKind.ESNext,
  moduleResolution: ts2.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  // `strict` on, `noUncheckedIndexedAccess` deliberately OFF. Models write TS as
  // if the flag were off — training corpora almost universally have it off — so
  // with it on, TS2532/TS18048 on `items[i]` was the single largest source of
  // compile failures (96% of the undefined-family diagnostics in local runs),
  // almost all on indexes whose bounds the surrounding logic already proved.
  // `strictNullChecks` stays: `.find()` / `match()` / optional properties are
  // real hazards and their messages name the cause.
  strict: true,
  target: ts2.ScriptTarget.ES2022,
  // No ambient @types: the script sees ES2022 + the facade and nothing else.
  // `process`, `fetch`, `require` etc. fail typechecking — the purity contract
  // starts at compile time.
  types: []
};
function createWorkflowProgram(scriptText, options) {
  const wrapped = `${SCRIPT_PRELUDE}${scriptText}${SCRIPT_EPILOGUE}`;
  const host = createVirtualHost(wrapped, options?.facadeDts ?? FACADE_DTS);
  const program = ts2.createProgram({
    host,
    options: COMPILER_OPTIONS,
    rootNames: [SCRIPT_FILE_NAME, FACADE_FILE_NAME]
  });
  const scriptFile = program.getSourceFile(SCRIPT_FILE_NAME);
  if (scriptFile === void 0) {
    throw new Error("workflow script source file missing from program");
  }
  const toScriptLoc = (pos) => {
    const { character, line } = scriptFile.getLineAndCharacterOfPosition(pos);
    return { column: character + 1, line: Math.max(1, line - PRELUDE_LINES + 1) };
  };
  return { program, scriptFile, toScriptLoc };
}
function collectDiagnostics(program) {
  return [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].map(
    toCompileDiagnostic
  );
}
function compileWorkflowScript(scriptText) {
  const { program } = createWorkflowProgram(scriptText);
  const diagnostics = collectDiagnostics(program);
  return { diagnostics, ok: diagnostics.length === 0 };
}
function createVirtualHost(wrappedScript, facadeDts) {
  const virtualFiles = new Map([
    [SCRIPT_FILE_NAME, wrappedScript],
    [FACADE_FILE_NAME, facadeDts],
    ...Object.entries(TS_LIBS)
  ]);
  const sourceFileCache = /* @__PURE__ */ new Map();
  return {
    getSourceFile: (fileName, languageVersionOrOptions) => {
      const cached = sourceFileCache.get(fileName);
      if (cached !== void 0) return cached;
      const text = virtualFiles.get(fileName);
      if (text === void 0) return void 0;
      const sourceFile = ts2.createSourceFile(fileName, text, languageVersionOrOptions, true);
      sourceFileCache.set(fileName, sourceFile);
      return sourceFile;
    },
    getDefaultLibFileName: (options) => ts2.getDefaultLibFileName(options),
    writeFile: () => {
      throw new Error("workflow compile is noEmit; nothing may write output");
    },
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => virtualFiles.has(fileName),
    readFile: (fileName) => virtualFiles.get(fileName)
  };
}
var AMBIENT_MODIFIER_MESSAGES = /* @__PURE__ */ new Map([
  [
    "declare",
    "The `declare` modifier is not allowed in a workflow script: the script is compiled inside a function body, where ambient declarations are illegal. Remove `declare` and write a plain declaration (e.g. `interface Foo { ... }`)."
  ],
  [
    "export",
    "`export` is not allowed in a workflow script: the script is compiled inside a function body. Remove `export` \u2014 the workflow's output is its final `return` value."
  ]
]);
var MISPLACED_MODIFIER_CODE = 1184;
function toCompileDiagnostic(diagnostic) {
  const message = ts2.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file === void 0 || diagnostic.start === void 0) {
    return { code: diagnostic.code, column: 1, line: 1, message };
  }
  const { character, line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const scriptLine = diagnostic.file.fileName === SCRIPT_FILE_NAME ? line - PRELUDE_LINES : line;
  return {
    code: diagnostic.code,
    column: character + 1,
    line: Math.max(1, scriptLine + 1),
    message: rewriteAmbientModifierMessage(diagnostic) ?? message
  };
}
function rewriteAmbientModifierMessage(diagnostic) {
  if (diagnostic.code !== MISPLACED_MODIFIER_CODE || diagnostic.file?.fileName !== SCRIPT_FILE_NAME || diagnostic.start === void 0 || diagnostic.length === void 0) {
    return void 0;
  }
  const span = diagnostic.file.text.slice(diagnostic.start, diagnostic.start + diagnostic.length);
  return AMBIENT_MODIFIER_MESSAGES.get(span);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/callbacks.ts
import ts3 from "typescript";
var DEFAULT_CALLBACK_SEMANTICS = {
  entered: false,
  multiplicity: "once"
};
var EACH_METHODS = /* @__PURE__ */ new Map([
  ["map", { element: [0], whole: [2] }],
  ["flatMap", { element: [0], whole: [2] }],
  ["forEach", { element: [0], whole: [2] }],
  ["filter", { element: [0], whole: [2] }],
  ["some", { element: [0], whole: [2] }],
  ["every", { element: [0], whole: [2] }],
  ["find", { element: [0], whole: [2] }],
  ["findIndex", { element: [0], whole: [2] }],
  ["findLast", { element: [0], whole: [2] }],
  ["findLastIndex", { element: [0], whole: [2] }],
  ["reduce", { accumulator: 0, element: [1], whole: [3] }],
  ["reduceRight", { accumulator: 0, element: [1], whole: [3] }],
  ["sort", { element: [0, 1], whole: [] }]
]);
var ONCE_METHODS = /* @__PURE__ */ new Map([
  ["then", { callbacks: [0, 1], deferred: true, entered: false }],
  ["catch", { callbacks: [0], deferred: true, entered: false }],
  ["finally", { callbacks: [0], deferred: true, entered: true }]
]);
var ONCE_GLOBALS = /* @__PURE__ */ new Set(["setTimeout", "setInterval", "setImmediate", "queueMicrotask"]);
function callbackSemanticsOf(node, checker, program) {
  const args = node.arguments ?? [];
  if (ts3.isNewExpression(node)) {
    if (isGlobalLibValue(node.expression, "Promise", checker, program) && args.length > 0) {
      return { callbacks: [0], entered: true, label: "Promise", multiplicity: "once" };
    }
    return void 0;
  }
  const callee = node.expression;
  if (ts3.isPropertyAccessExpression(callee)) {
    if (isScriptDeclared(callee.name, checker, program)) return void 0;
    const method = callee.name.text;
    if (method === "from" && isGlobalLibValue(callee.expression, "Array", checker, program)) {
      const iterated = args[0];
      if (iterated === void 0 || args.length < 2) return void 0;
      return { callbacks: [1], elementParams: [0], entered: false, iterated, label: "from", multiplicity: "each", wholeParams: [] };
    }
    const each = EACH_METHODS.get(method);
    if (each !== void 0) {
      return {
        callbacks: [0],
        elementParams: each.element,
        entered: false,
        iterated: callee.expression,
        label: method,
        multiplicity: "each",
        wholeParams: each.whole,
        ...each.accumulator === void 0 ? {} : { accumulatorParam: each.accumulator }
      };
    }
    const once = ONCE_METHODS.get(method);
    if (once !== void 0) return { ...once, label: method, multiplicity: "once" };
    return void 0;
  }
  if (ts3.isIdentifier(callee) && ONCE_GLOBALS.has(callee.text) && isGlobalLibValue(callee, callee.text, checker, program)) {
    return { callbacks: [0], deferred: true, entered: false, label: callee.text, multiplicity: "once" };
  }
  return void 0;
}
function isGlobalLibValue(expr, name, checker, program) {
  let symbol = checker.getSymbolAtLocation(expr);
  if (symbol !== void 0 && (symbol.flags & ts3.SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol);
  if (symbol?.name !== name) return false;
  return symbol.declarations?.some((declaration) => isLibDeclaration(declaration, program)) ?? false;
}
function isForeignMember(name, checker, scriptFile) {
  const declarations = checker.getSymbolAtLocation(name)?.declarations;
  if (declarations === void 0 || declarations.length === 0) return false;
  return declarations.every((declaration) => declaration.getSourceFile() !== scriptFile);
}
function isScriptDeclared(name, checker, program) {
  const symbol = checker.getSymbolAtLocation(name);
  return symbol?.declarations?.some((declaration) => {
    const file = declaration.getSourceFile();
    return !isLibDeclaration(declaration, program) && !file.isDeclarationFile;
  }) ?? false;
}
function isLibDeclaration(declaration, program) {
  const file = declaration.getSourceFile();
  return program.isSourceFileDefaultLibrary(file) || /^lib\..+\.d\.ts$/.test(file.fileName);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/sites-labels.ts
import ts4 from "typescript";
function resolveSymbol(node, checker) {
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol !== void 0 && (symbol.flags & ts4.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}
function isFacadeDeclared(symbol) {
  return symbol?.declarations?.some(
    (declaration) => declaration.getSourceFile().fileName === FACADE_FILE_NAME
  ) ?? false;
}
function literalText(expr) {
  return expr !== void 0 && ts4.isStringLiteralLike(expr) ? expr.text : void 0;
}
var Counter = class {
  value = 0;
  next() {
    this.value += 1;
    return this.value;
  }
};
function askLabel(receiver, checker) {
  if (ts4.isCallExpression(receiver) && isActorCall(receiver, checker)) {
    const first = receiver.arguments[0];
    if (first !== void 0 && ts4.isStringLiteralLike(first)) return first.text;
  }
  if (ts4.isIdentifier(receiver)) return receiver.text;
  return "ask";
}
function askLabelPattern(receiver, checker) {
  if (!ts4.isCallExpression(receiver) || !isActorCall(receiver, checker)) return void 0;
  return templateAffixes(receiver.arguments[0]);
}
function isActorCall(call, checker) {
  if (ts4.isPropertyAccessExpression(call.expression)) return false;
  const symbol = resolveSymbol(call.expression, checker);
  return isFacadeDeclared(symbol) && symbol?.name === "agent";
}
function actorName(call) {
  const first = call.arguments[0];
  if (first !== void 0 && ts4.isStringLiteralLike(first)) return first.text;
  const parent = call.parent;
  if (ts4.isVariableDeclaration(parent) && parent.initializer === call && ts4.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return void 0;
}
function actorNamePattern(call) {
  return templateAffixes(call.arguments[0]);
}
function templateAffixes(arg) {
  if (arg === void 0 || !ts4.isTemplateExpression(arg)) return void 0;
  const head = meaningfulAffix(arg.head.text);
  const tail = meaningfulAffix(arg.templateSpans.at(-1)?.literal.text);
  if (head === void 0 && tail === void 0) return void 0;
  return {
    ...head === void 0 ? {} : { head },
    ...tail === void 0 ? {} : { tail }
  };
}
function meaningfulAffix(text) {
  const trimmed = text?.trim();
  if (trimmed === void 0 || trimmed === "") return void 0;
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : void 0;
}
function worldReadLabel(op, arg) {
  if (arg !== void 0 && ts4.isStringLiteralLike(arg)) return `${op} ${arg.text}`;
  return op;
}
function eachCandidate(call, semantics, order, loc) {
  const index = semantics.callbacks[0];
  const argument = index === void 0 ? void 0 : call.arguments[index];
  const iterated = semantics.iterated;
  if (argument === void 0 || iterated === void 0) return void 0;
  const literal = ts4.isArrowFunction(argument) || ts4.isFunctionExpression(argument);
  return {
    body: literal ? argument.body : argument,
    ...literal ? { callback: argument } : { callbackExpr: argument },
    call,
    element: literal ? argument.parameters[semantics.elementParams?.[0] ?? 0]?.name : void 0,
    form: "array-method",
    iterated,
    loc,
    method: semantics.label,
    order,
    semantics
  };
}
function forOfCandidate(statement, order, loc) {
  let element;
  if (ts4.isVariableDeclarationList(statement.initializer)) {
    element = statement.initializer.declarations[0]?.name;
  }
  return {
    body: statement.statement,
    element,
    form: "for-of",
    iterated: statement.expression,
    loc,
    order
  };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/sites.ts
function collectSites(workflow) {
  const { program, scriptFile, toScriptLoc } = workflow;
  const checker = program.getTypeChecker();
  const body = findWorkflowBody(scriptFile);
  const table = {
    actors: [],
    artifacts: [],
    asks: [],
    iterations: [],
    joins: [],
    phases: [],
    reports: [],
    topLevelReturns: [],
    worldReads: []
  };
  let order = 0;
  const askCounter = new Counter();
  const actorCounter = new Counter();
  const worldReadCounter = new Counter();
  const joinCounter = new Counter();
  const reportCounter = new Counter();
  const artifactCounter = new Counter();
  const locOf2 = (node) => toScriptLoc(node.getStart(scriptFile));
  const classify = (node, funcDepth) => {
    if (ts5.isReturnStatement(node)) {
      if (funcDepth === 0) {
        table.topLevelReturns.push({ expression: node.expression, loc: locOf2(node) });
      }
      return;
    }
    if (ts5.isForOfStatement(node)) {
      table.iterations.push(forOfCandidate(node, order++, locOf2(node)));
      return;
    }
    if (!ts5.isCallExpression(node)) return;
    if (ts5.isPropertyAccessExpression(node.expression)) {
      const access = node.expression;
      const propSymbol = checker.getSymbolAtLocation(access.name);
      if (isFacadeDeclared(propSymbol)) {
        const name = access.name.text;
        if (name === "ask") {
          const labelPattern = askLabelPattern(access.expression, checker);
          table.asks.push({
            call: node,
            id: `ask#${askCounter.next()}`,
            instructions: node.arguments[0],
            label: askLabel(access.expression, checker),
            ...labelPattern === void 0 ? {} : { labelPattern },
            loc: toScriptLoc(access.name.getStart(scriptFile)),
            order: order++,
            receiver: access.expression
          });
          return;
        }
        const artifact = artifactRowOfSymbol(propSymbol);
        if (artifact !== void 0) {
          const idExpr = node.arguments[0];
          const id = literalText(idExpr);
          table.artifacts.push({
            artifactIdExpr: idExpr,
            ...id === void 0 ? {} : { artifactId: id },
            call: node,
            id: `artifact#${artifactCounter.next()}`,
            loc: toScriptLoc(access.name.getStart(scriptFile)),
            op: artifact.op,
            order: order++
          });
          return;
        }
        const op = worldReadOpOfSymbol(propSymbol);
        if (op !== void 0) {
          table.worldReads.push({
            args: node.arguments,
            call: node,
            id: `world-read#${worldReadCounter.next()}`,
            label: worldReadLabel(op, node.arguments[0]),
            loc: toScriptLoc(access.name.getStart(scriptFile)),
            op,
            order: order++
          });
        }
        return;
      }
      const method = access.name.text;
      if ((method === "all" || method === "allSettled") && isGlobalLibValue(access.expression, "Promise", checker, program)) {
        table.joins.push({
          arg: node.arguments[0],
          call: node,
          id: `join#${joinCounter.next()}`,
          label: "join",
          loc: toScriptLoc(access.name.getStart(scriptFile)),
          method,
          order: order++
        });
        return;
      }
      const semantics = callbackSemanticsOf(node, checker, program);
      if (semantics?.multiplicity === "each") {
        const candidate = eachCandidate(node, semantics, order, locOf2(node));
        if (candidate !== void 0) {
          order++;
          table.iterations.push(candidate);
        }
      }
      return;
    }
    const calleeSymbol = resolveSymbol(node.expression, checker);
    const fn = siteProducingFunctionOfSymbol(calleeSymbol);
    if (fn === "agent") {
      const name = actorName(node);
      const namePattern = name === void 0 ? actorNamePattern(node) : void 0;
      table.actors.push({
        call: node,
        id: `actor#${actorCounter.next()}`,
        loc: locOf2(node),
        name,
        ...namePattern === void 0 ? {} : { namePattern },
        order: order++
      });
      return;
    }
    if (fn === "report") {
      const tagExpr = node.arguments[1];
      const tag = literalText(tagExpr);
      table.reports.push({
        artifactIdExpr: tagExpr,
        ...tag === void 0 ? {} : { artifactId: tag },
        call: node,
        id: `report#${reportCounter.next()}`,
        item: node.arguments[0],
        loc: locOf2(node),
        order: order++
      });
      return;
    }
    if (markerFunctionOfSymbol(calleeSymbol) === "phase") {
      const nameExpr = node.arguments[0];
      const name = literalText(nameExpr);
      table.phases.push({
        call: node,
        loc: locOf2(node),
        ...name === void 0 ? {} : { name },
        nameExpr
      });
    }
  };
  const walk = (node, funcDepth) => {
    classify(node, funcDepth);
    const childDepth = funcDepth + (isFunctionLike(node) ? 1 : 0);
    ts5.forEachChild(node, (child) => walk(child, childDepth));
  };
  for (const statement of body.statements) walk(statement, 0);
  return table;
}
function findWorkflowBody(scriptFile) {
  for (const statement of scriptFile.statements) {
    if (ts5.isFunctionDeclaration(statement) && statement.name?.text === WORKFLOW_FUNCTION_NAME && statement.body !== void 0) {
      return statement.body;
    }
  }
  throw new Error(`workflow wrapper function ${WORKFLOW_FUNCTION_NAME} not found`);
}
function isFunctionLike(node) {
  return ts5.isFunctionDeclaration(node) || ts5.isFunctionExpression(node) || ts5.isArrowFunction(node) || ts5.isMethodDeclaration(node) || ts5.isGetAccessorDeclaration(node) || ts5.isSetAccessorDeclaration(node) || ts5.isConstructorDeclaration(node);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/artifacts.ts
var ARTIFACT_DECLARATION_CODE = 9007;
var ARTIFACT_HOISTING_CODE = 9008;
var ARTIFACT_PRIMARY_CONFLICT_CODE = 9009;
var HOISTING_MESSAGE = {
  callback: 'a preset artifact declared inside a callback: hoist it to the top level and declare it once. A preset is a declaration, not a step \u2014 it says how the items tagged with its id are drawn, and the tagged report() calls are what fill it in. Declaring it where the callback runs buries it: move artifact.<kind>("<id>", spec) to the head of the script and keep only report(item, "<id>") in the callback.',
  conditional: "a preset artifact declared inside a conditional branch: hoist it to the top level and declare it once. The card should exist from the moment the run starts (it is legitimately empty until the first tagged report arrives), and a declaration that may or may not have run is a card that may or may not exist. Declare it unconditionally and let the branch decide what to report.",
  loop: 'a preset artifact declared inside a loop: hoist it to the top level and declare it once. A preset is declared once and fed many times \u2014 the loop body is where report(item, "<id>") belongs, not the declaration. Re-declaring the same spec is a no-op, but re-declaring it with a different spec fails the whole run, so the loop is the wrong place for it either way.'
};
var NON_LITERAL_ID_MESSAGE = 'an artifact id must be a compile-time string literal ("report" or a no-substitution template): the set of artifacts a run can publish is fixed when the script is submitted, so it can be listed before anything runs. Write the id inline; put the runtime value in the title instead (artifact.file("report", path, { title: `Report for ${name}` })).';
var EMPTY_ID_MESSAGE = 'an artifact id must not be empty: it is the identity the card, the version history and the report tag all key off. Give it a short stable name ("book", "perf", "coverage").';
function collectArtifactDeclarations(workflow, table) {
  const diagnostics = [];
  const push = (code, loc, message) => {
    diagnostics.push({ code, column: loc.column, line: loc.line, message });
  };
  const locOf2 = (node) => workflow.toScriptLoc(node.getStart(workflow.scriptFile));
  const body = findWorkflowBody(workflow.scriptFile);
  const claimed = /* @__PURE__ */ new Map();
  let primaryClaim;
  const declared = [];
  for (const site of table.artifacts) {
    const idLoc = site.artifactIdExpr === void 0 ? site.loc : locOf2(site.artifactIdExpr);
    if (site.artifactId === void 0) {
      push(ARTIFACT_DECLARATION_CODE, idLoc, NON_LITERAL_ID_MESSAGE);
      continue;
    }
    const id = site.artifactId;
    if (id === "") {
      push(ARTIFACT_DECLARATION_CODE, idLoc, EMPTY_ID_MESSAGE);
      continue;
    }
    if (id.length > ARTIFACT_CAPS.maxIdLength) {
      push(
        ARTIFACT_DECLARATION_CODE,
        idLoc,
        `artifact id "${id}" is ${id.length} characters; the limit is ${ARTIFACT_CAPS.maxIdLength}. The id is a key, not a description \u2014 put the prose in the title.`
      );
      continue;
    }
    if (!ARTIFACT_ID_PATTERN.test(id)) {
      push(
        ARTIFACT_DECLARATION_CODE,
        idLoc,
        `artifact id "${id}" contains characters outside [A-Za-z0-9_.-]. The id is carried verbatim through the journal, the artifact store and the side pane, so it is restricted to characters that need no escaping anywhere ("build-log", "perf.p95").`
      );
      continue;
    }
    const first = claimed.get(id);
    if (first === void 0) {
      claimed.set(id, site);
      declared.push({ id, kind: site.op });
    } else if (first.op !== site.op) {
      push(
        ARTIFACT_DECLARATION_CODE,
        site.loc,
        `artifact id "${id}" is used with two different kinds: artifact.${first.op} on line ${first.loc.line} and artifact.${site.op} here. Within one run an id belongs to exactly one kind \u2014 publishing it again is what mints the next VERSION, and a version cannot change what the thing is. Give this one its own id.`
      );
    }
    const primaryNode = primaryLiteralOf(site);
    if (primaryNode !== void 0) {
      if (primaryClaim === void 0) primaryClaim = { id, site };
      else if (primaryClaim.id !== id) {
        push(
          ARTIFACT_PRIMARY_CONFLICT_CODE,
          locOf2(primaryNode),
          `artifact "${id}" is marked primary, but "${primaryClaim.id}" already is (artifact.${primaryClaim.site.op} on line ${primaryClaim.site.loc.line}). A run has one deliverable \u2014 the card and the run pane lead with it. Drop primary from one of them, or publish this content as a new version of the other id.`
        );
      }
    }
    if (isArtifactPresetOp(site.op)) {
      const context = hoistingContextOf(site.call, body);
      if (context !== void 0) {
        push(ARTIFACT_HOISTING_CODE, site.loc, HOISTING_MESSAGE[context]);
      }
    }
  }
  const presetIds = declared.filter((entry) => isArtifactPresetOp(entry.kind)).map((e) => e.id);
  const contentIds = new Set(
    declared.filter((entry) => !isArtifactPresetOp(entry.kind)).map((e) => e.id)
  );
  for (const site of table.reports) {
    if (site.artifactIdExpr === void 0) continue;
    const tagLoc = locOf2(site.artifactIdExpr);
    if (site.artifactId === void 0) {
      push(
        ARTIFACT_DECLARATION_CODE,
        tagLoc,
        "report()'s artifact tag must be a compile-time string literal naming a preset artifact declared in this script: the tag is how an item finds its dashboard, and a tag that only exists at run time cannot be checked against the declarations. Write the id inline."
      );
      continue;
    }
    const tag = site.artifactId;
    if (presetIds.includes(tag)) continue;
    if (contentIds.has(tag)) {
      push(
        ARTIFACT_DECLARATION_CODE,
        tagLoc,
        `report()'s tag "${tag}" names a file/markdown artifact, which holds content rather than a stream of items \u2014 there is nothing for this item to become. Tag the item with a preset artifact (chart / table / metrics / board), or drop the tag and let the item go to the run's Results.`
      );
      continue;
    }
    push(
      ARTIFACT_DECLARATION_CODE,
      tagLoc,
      `report()'s tag "${tag}" names no preset artifact declared in this script${describePresets(presetIds)}. Declare it first \u2014 artifact.chart("` + tag + '", { x, y }) at the top of the script \u2014 or drop the tag.'
    );
  }
  return { declaredArtifacts: sortDeclared(declared), diagnostics };
}
function primaryLiteralOf(site) {
  const arg = site.call.arguments[isArtifactPresetOp(site.op) ? 1 : 2];
  if (arg === void 0 || !ts6.isObjectLiteralExpression(arg)) return void 0;
  for (const property of arg.properties) {
    if (!ts6.isPropertyAssignment(property)) continue;
    const name = property.name;
    const key = ts6.isIdentifier(name) || ts6.isStringLiteral(name) ? name.text : void 0;
    if (key !== "primary") continue;
    return property.initializer.kind === ts6.SyntaxKind.TrueKeyword ? property : void 0;
  }
  return void 0;
}
function describePresets(presetIds) {
  if (presetIds.length === 0) return " (this script declares no preset artifacts at all)";
  return ` (declared presets: ${[...presetIds].sort().map((id) => `"${id}"`).join(", ")})`;
}
function sortDeclared(declared) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const entry of declared) {
    const key = `${entry.id}\0${entry.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique.sort((a, b) => a.id === b.id ? a.kind.localeCompare(b.kind) : a.id < b.id ? -1 : 1);
}
function hoistingContextOf(call, body) {
  let child = call;
  for (let node = call.parent; node !== void 0; node = node.parent) {
    if (node === body) return void 0;
    if (ts6.isArrowFunction(node) || ts6.isFunctionExpression(node) || ts6.isMethodDeclaration(node)) {
      return "callback";
    }
    if (ts6.isForStatement(node) || ts6.isForOfStatement(node) || ts6.isForInStatement(node) || ts6.isWhileStatement(node) || ts6.isDoStatement(node)) {
      return "loop";
    }
    if (ts6.isIfStatement(node) && (node.thenStatement === child || node.elseStatement === child)) {
      return "conditional";
    }
    if (ts6.isConditionalExpression(node) && (node.whenTrue === child || node.whenFalse === child)) {
      return "conditional";
    }
    if (ts6.isCaseClause(node) || ts6.isDefaultClause(node)) return "conditional";
    child = node;
  }
  return void 0;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/facade-misuse.ts
import ts8 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/domain.ts
import ts7 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/core.ts
function isActorSite(site) {
  return site.startsWith("actor#");
}
function quote(text) {
  return `"${text.replace(/"/g, '\\"')}"`;
}
function renderPattern(pattern) {
  if (pattern === void 0) return "";
  let out = "";
  if (pattern.head !== void 0) out += ` head=${quote(pattern.head)}`;
  if (pattern.tail !== void 0) out += ` tail=${quote(pattern.tail)}`;
  return out;
}
function at(loc) {
  return `@${loc.line}:${loc.column}`;
}
function serializeCore(core) {
  return `${[
    ...renderSites(core),
    ...renderFacts(core.facts),
    ...core.trace.regions.map(
      (region) => `region ${region.id} ${region.kind}` + (region.parent === void 0 ? "" : ` parent=${region.parent}`) + (region.loc === void 0 ? "" : ` ${at(region.loc)}`) + (region.entered ? " entered" : "") + (region.exhaustive ? " exhaustive" : "") + (region.fallthrough ? " fallthrough" : "") + (region.recursive ? " recursive" : "") + (region.detached ? " detached" : "") + (region.bound === void 0 ? "" : ` bound=${region.bound}`) + (region.label === void 0 ? "" : ` label=${quote(region.label)}`) + (region.strand ? " strand" : "")
    ),
    ...core.trace.events.map(renderEvent),
    ...core.trace.controls.map(
      (control) => `control ${control.region}` + (control.controllers.length > 0 ? ` by=${control.controllers.join(",")}` : "") + (control.maybeControllers.length > 0 ? ` maybe=${control.maybeControllers.join(",")}` : "")
    ),
    ...core.trace.phases.map((phase) => `phase ${phase.id} ${quote(phase.name)} ${at(phase.loc)}`)
  ].join("\n")}
`;
}
function renderSites(core) {
  const typeOf = (id) => {
    const type = core.types.siteType.get(id);
    return type === void 0 ? "" : ` type=${quote(type)}`;
  };
  const withinOf = (within) => within === void 0 ? "" : ` within=${within}`;
  const lines = [
    ...core.sites.asks.map((site) => ({
      line: `ask ${site.id} ${quote(site.label)}${renderPattern(site.labelPattern)} ${at(site.loc)} order=${site.order}${withinOf(site.within)}${typeOf(site.id)}`,
      order: site.order
    })),
    ...core.sites.worldReads.map((site) => ({
      line: `world-read ${site.id} ${quote(site.label)} ${at(site.loc)} order=${site.order}${withinOf(site.within)}${typeOf(site.id)}`,
      order: site.order
    })),
    ...core.sites.joins.map((site) => {
      const ports = core.types.joinPortTypes.get(site.id);
      const portsText = ports === void 0 ? "" : ` ports=${ports.map((port) => port === void 0 ? "-" : quote(port)).join(",")}`;
      return {
        line: `join ${site.id} ${quote(site.label)} ${at(site.loc)} order=${site.order}${withinOf(site.within)}${typeOf(site.id)}${portsText}`,
        order: site.order
      };
    }),
    ...core.sites.actors.map((site) => ({
      line: `actor ${site.id}${site.name === void 0 ? "" : ` ${quote(site.name)}`}${renderPattern(site.namePattern)} ${at(site.loc)} order=${site.order}${withinOf(site.within)}`,
      order: site.order
    })),
    ...core.sites.fanouts.map((site) => ({
      line: `fan-out ${site.id} ${quote(site.label)} ${at(site.loc)} order=${site.order}${withinOf(site.within)}${site.cardinality === void 0 ? "" : ` count=${site.cardinality}`}${typeOf(site.id)}`,
      order: site.order
    }))
  ];
  return lines.sort((a, b) => a.order - b.order).map((entry) => entry.line);
}
function renderFacts(facts) {
  const occText = (occ) => `${occ.site} ${occ.exact ? "exact" : "inexact"}${occ.port === void 0 ? "" : ` port=${occ.port}`}`;
  const group = (kind, map) => {
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    const lines = [];
    for (const [sink, occs] of entries) {
      for (const occ of occs) lines.push(`fact ${kind} ${sink} <- ${occText(occ)}`);
    }
    return lines;
  };
  return [
    ...group("ask-data", facts.askData),
    ...group("ask-actor", facts.askActor),
    ...group("world-read-data", facts.worldReadData),
    ...group("join-in", facts.joinIn),
    ...group("fan-out-in", facts.fanoutIn),
    ...facts.returnData.map((occ) => `fact return <- ${occText(occ)}`)
  ];
}
function renderEvent(event) {
  const chain = (regions) => regions.length === 0 ? "" : ` in=${regions.join(">")}`;
  if (event.at === "issue") {
    return `issue ${event.step}${chain(event.regions)} phase=${event.phase}`;
  }
  if (event.at === "settle") {
    return "settle" + (event.maybe ? " maybe" : "") + (event.steps.length === 0 ? "" : ` ${event.steps.join(",")}`) + chain(event.regions) + (event.joins === void 0 || event.joins.length === 0 ? "" : ` joins=${event.joins.join(",")}`);
  }
  if (event.at === "mark") return `mark ${event.phase}${chain(event.regions)}`;
  if (event.at === "jump") {
    return `jump ${event.kind} ${event.target}${chain(event.regions)} phase=${event.phase}`;
  }
  return `spawn ${event.actor}${chain(event.regions)}`;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/domain.ts
function emptyValue() {
  return { fields: /* @__PURE__ */ new Map(), fns: /* @__PURE__ */ new Set(), occs: /* @__PURE__ */ new Map(), phs: /* @__PURE__ */ new Map() };
}
function occKey(site, port) {
  return `${site}|${port ?? ""}`;
}
function phKey(ph) {
  return `${ph.fnId}:${ph.param}`;
}
function addOcc(target, occ) {
  if (occ.port === void 0) return addPortless(target, occ);
  const portless = target.occs.get(occKey(occ.site, void 0));
  if (portless !== void 0) {
    if (occ.exact && !portless.exact) {
      portless.exact = true;
      return true;
    }
    return false;
  }
  return addExact(target, occ);
}
function addPortless(target, occ) {
  let exact = occ.exact;
  let changed = false;
  const drop = [];
  for (const [key, existing] of target.occs) {
    if (existing.site === occ.site && existing.port !== void 0) {
      exact = exact || existing.exact;
      drop.push(key);
    }
  }
  for (const key of drop) {
    target.occs.delete(key);
    changed = true;
  }
  return addExact(target, { exact, site: occ.site }) || changed;
}
function addExact(target, occ) {
  const key = occKey(occ.site, occ.port);
  const existing = target.occs.get(key);
  if (existing === void 0) {
    target.occs.set(key, { exact: occ.exact, port: occ.port, site: occ.site });
    return true;
  }
  if (occ.exact && !existing.exact) {
    existing.exact = true;
    return true;
  }
  return false;
}
function addPlaceholder(target, ph) {
  const key = phKey(ph);
  const existing = target.phs.get(key);
  if (existing !== void 0) {
    if (ph.rest === true && existing.rest !== true) {
      existing.rest = true;
      return true;
    }
    return false;
  }
  target.phs.set(key, { fnId: ph.fnId, param: ph.param, ...ph.rest === true ? { rest: true } : {} });
  return true;
}
var VALUE_DEPTH_CAP = 8;
function mergeInto(target, source, depth = 0) {
  if (target === source) return false;
  let changed = false;
  for (const occ of source.occs.values()) changed = addOcc(target, occ) || changed;
  for (const ph of source.phs.values()) changed = addPlaceholder(target, ph) || changed;
  for (const fn of source.fns) {
    if (!target.fns.has(fn)) {
      target.fns.add(fn);
      changed = true;
    }
  }
  if (source.bound !== void 0) changed = mergeBound(target, source.bound, depth) || changed;
  if (source.mayAlias !== void 0) {
    const targets = target.mayAlias ??= /* @__PURE__ */ new Set();
    for (const m of source.mayAlias) {
      if (!targets.has(m)) {
        targets.add(m);
        changed = true;
      }
    }
  }
  if (depth >= VALUE_DEPTH_CAP) {
    for (const field of source.fields.values()) changed = collapseInto(target, field) || changed;
    return changed;
  }
  for (const [key, field] of source.fields) {
    let slot = target.fields.get(key);
    if (slot === void 0) {
      slot = emptyValue();
      target.fields.set(key, slot);
    }
    changed = mergeInto(slot, field, depth + 1) || changed;
  }
  return changed;
}
function mergeBound(target, sourceBound, depth) {
  let changed = false;
  if (depth >= VALUE_DEPTH_CAP) {
    for (const el of sourceBound) changed = collapseInto(target, el) || changed;
    return changed;
  }
  if (target.bound === void 0) target.bound = [];
  const tb = target.bound;
  for (let i = 0; i < sourceBound.length; i += 1) {
    const el = sourceBound[i];
    if (i >= VALUE_DEPTH_CAP) {
      changed = collapseInto(target, el) || changed;
      continue;
    }
    let slot = tb[i];
    if (slot === void 0) {
      slot = emptyValue();
      tb[i] = slot;
      changed = true;
    }
    changed = mergeInto(slot, el, depth + 1) || changed;
  }
  return changed;
}
function cloneValue(v) {
  const out = emptyValue();
  mergeInto(out, v);
  return out;
}
function unionValues(...values) {
  const out = emptyValue();
  for (const v of values) mergeInto(out, v);
  return out;
}
function singleOcc(site, exact, port) {
  const out = emptyValue();
  addOcc(out, { exact, port, site });
  return out;
}
function collapse(v) {
  const out = emptyValue();
  collapseInto(out, v);
  return out;
}
function collapseInto(out, v, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(v)) return false;
  seen.add(v);
  let changed = false;
  for (const occ of v.occs.values()) changed = addOcc(out, occ) || changed;
  for (const ph of v.phs.values()) changed = addPlaceholder(out, ph) || changed;
  for (const fn of v.fns) {
    if (!out.fns.has(fn)) {
      out.fns.add(fn);
      changed = true;
    }
  }
  for (const field of v.fields.values()) changed = collapseInto(out, field, seen) || changed;
  for (const el of v.bound ?? []) changed = collapseInto(out, el, seen) || changed;
  return changed;
}
function readField(container, key) {
  const field = container.fields.get(key);
  if (field === void 0) return collapse(container);
  const out = cloneValue(field);
  for (const occ of container.occs.values()) {
    if (occ.port === void 0 && hasPortedOcc(out, occ.site)) continue;
    addOcc(out, occ);
  }
  for (const ph of container.phs.values()) addPlaceholder(out, ph);
  return out;
}
function hasPortedOcc(v, site) {
  for (const occ of v.occs.values()) {
    if (occ.site === site && occ.port !== void 0) return true;
  }
  return false;
}
function clearExact(v) {
  const out = cloneValue(v);
  clearExactInPlace(out);
  return out;
}
function clearExactInPlace(v, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(v)) return;
  seen.add(v);
  for (const occ of v.occs.values()) occ.exact = false;
  for (const field of v.fields.values()) clearExactInPlace(field, seen);
  for (const el of v.bound ?? []) clearExactInPlace(el, seen);
}
function provisionalFanoutId(order) {
  return `fan-out@${order}`;
}
var HEAP_MUTATORS = /* @__PURE__ */ new Set(["push", "unshift", "splice", "set", "add"]);
var COMPOUND_ASSIGNMENT_OPS = /* @__PURE__ */ new Set([
  ts7.SyntaxKind.PlusEqualsToken,
  ts7.SyntaxKind.MinusEqualsToken,
  ts7.SyntaxKind.AsteriskEqualsToken,
  ts7.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts7.SyntaxKind.SlashEqualsToken,
  ts7.SyntaxKind.PercentEqualsToken,
  ts7.SyntaxKind.LessThanLessThanEqualsToken,
  ts7.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts7.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts7.SyntaxKind.AmpersandEqualsToken,
  ts7.SyntaxKind.BarEqualsToken,
  ts7.SyntaxKind.CaretEqualsToken,
  ts7.SyntaxKind.BarBarEqualsToken,
  ts7.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts7.SyntaxKind.QuestionQuestionEqualsToken
]);
function findWorkflowBody2(scriptFile) {
  for (const statement of scriptFile.statements) {
    if (ts7.isFunctionDeclaration(statement) && statement.name?.text === WORKFLOW_FUNCTION_NAME && statement.body !== void 0) {
      return statement.body;
    }
  }
  throw new Error(`workflow wrapper function ${WORKFLOW_FUNCTION_NAME} not found`);
}
function isFunctionLike2(node) {
  return ts7.isFunctionDeclaration(node) || ts7.isFunctionExpression(node) || ts7.isArrowFunction(node) || ts7.isMethodDeclaration(node) || ts7.isGetAccessorDeclaration(node) || ts7.isSetAccessorDeclaration(node) || ts7.isConstructorDeclaration(node);
}
function isNonArrowFunctionLike(node) {
  return isFunctionLike2(node) && !ts7.isArrowFunction(node);
}
function isDirectCallee(callee) {
  const expr = ts7.isParenthesizedExpression(callee) ? callee.expression : callee;
  return ts7.isIdentifier(expr) || ts7.isPropertyAccessExpression(expr) || ts7.isFunctionExpression(expr) || ts7.isArrowFunction(expr);
}
function isJsonStringify(access) {
  return ts7.isIdentifier(access.expression) && access.expression.text === "JSON" && access.name.text === "stringify";
}
function staticIndexKey(arg) {
  if (ts7.isNumericLiteral(arg)) return arg.text;
  if (ts7.isStringLiteralLike(arg)) return arg.text;
  return void 0;
}
function peelPlace(expr) {
  let cur = expr;
  while (true) {
    if (ts7.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts7.isNonNullExpression(cur)) cur = cur.expression;
    else if (ts7.isAsExpression(cur) || ts7.isSatisfiesExpression(cur)) cur = cur.expression;
    else if (ts7.isTypeAssertionExpression(cur)) cur = cur.expression;
    else if (ts7.isBinaryExpression(cur) && cur.operatorToken.kind === ts7.SyntaxKind.CommaToken) cur = cur.right;
    else if (ts7.isCommaListExpression(cur) && cur.elements.length > 0) {
      cur = cur.elements[cur.elements.length - 1];
    } else return cur;
  }
}
function liveField(container, key) {
  let field = container.fields.get(key);
  if (field === void 0) {
    field = emptyValue();
    container.fields.set(key, field);
  }
  return field;
}
function replayMayAliasWrite(container, key, value) {
  if (container.mayAlias === void 0) return false;
  return replayFieldInto(container.mayAlias, key, clearExact(value), /* @__PURE__ */ new Set(), 0);
}
function replayFieldInto(targets, key, write, seen, depth) {
  let changed = false;
  for (const target of targets) {
    if (seen.has(target)) continue;
    seen.add(target);
    if (depth >= VALUE_DEPTH_CAP) {
      changed = collapseInto(target, write) || changed;
      continue;
    }
    changed = mergeInto(liveField(target, key), write) || changed;
    if (target.mayAlias !== void 0) changed = replayFieldInto(target.mayAlias, key, write, seen, depth + 1) || changed;
  }
  return changed;
}
function replayMayAliasMerge(container, value) {
  if (container.mayAlias === void 0) return false;
  return replayMergeInto(container.mayAlias, clearExact(collapse(value)), /* @__PURE__ */ new Set());
}
function replayMergeInto(targets, write, seen) {
  let changed = false;
  for (const target of targets) {
    if (seen.has(target)) continue;
    seen.add(target);
    changed = mergeInto(target, write) || changed;
    if (target.mayAlias !== void 0) changed = replayMergeInto(target.mayAlias, write, seen) || changed;
  }
  return changed;
}
function adoptFields(target, source) {
  let changed = false;
  for (const [key, srcField] of source.fields) {
    const existing = target.fields.get(key);
    if (existing === srcField) continue;
    if (existing !== void 0) mergeInto(srcField, existing);
    target.fields.set(key, srcField);
    changed = true;
  }
  return changed;
}
function bindingPropertyKey(element) {
  if (element.propertyName !== void 0) {
    if (ts7.isIdentifier(element.propertyName) || ts7.isStringLiteralLike(element.propertyName) || ts7.isNumericLiteral(element.propertyName)) {
      return element.propertyName.text;
    }
    return void 0;
  }
  return ts7.isIdentifier(element.name) ? element.name.text : void 0;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/facade-misuse.ts
var FACADE_SITING_CODE = 9001;
var FACADE_SITE_DEPTH = 4;
var VALUE_ASSIGNMENT_OPS = /* @__PURE__ */ new Set([
  ts8.SyntaxKind.EqualsToken,
  ts8.SyntaxKind.BarBarEqualsToken,
  ts8.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts8.SyntaxKind.QuestionQuestionEqualsToken
]);
function collectFacadeMisuse(workflow, table) {
  const { program, scriptFile, toScriptLoc } = workflow;
  const checker = program.getTypeChecker();
  const body = findWorkflowBody2(scriptFile);
  const diagnostics = [];
  const flag = (at2, name) => {
    const loc = toScriptLoc(at2.getStart(scriptFile));
    diagnostics.push({
      code: FACADE_SITING_CODE,
      column: loc.column,
      line: loc.line,
      message: `facade function '${name}' may only be called directly; taking a reference to it defeats site identity (journal and replay key off call sites)`
    });
  };
  const flagExtractedMember = (nameNode, containerType) => {
    if (!ts8.isIdentifier(nameNode) && !ts8.isStringLiteralLike(nameNode)) return;
    const property = checker.getPropertyOfType(containerType, nameNode.text);
    if (isFacadeCallable(property)) flag(nameNode, nameNode.text);
  };
  const scanRefs = (node) => {
    if (ts8.isPropertyAccessExpression(node)) {
      const symbol = resolveSymbol(node.name, checker);
      if (isFacadeCallable(symbol) && !isDirectCallee2(node)) flag(node.name, symbol.name);
    } else if (ts8.isIdentifier(node) && !isPropertyAccessName(node)) {
      const symbol = resolveSymbol(node, checker);
      if (isFacadeCallable(symbol) && !isDirectCallee2(node)) flag(node, symbol.name);
    } else if (ts8.isBindingElement(node) && ts8.isObjectBindingPattern(node.parent)) {
      flagExtractedMember(node.propertyName ?? node.name, checker.getTypeAtLocation(node.parent));
    } else if (ts8.isShorthandPropertyAssignment(node) && ts8.isBinaryExpression(node.parent.parent)) {
      const assign = node.parent.parent;
      if (assign.left === node.parent && assign.operatorToken.kind === ts8.SyntaxKind.EqualsToken) {
        flagExtractedMember(node.name, checker.getTypeAtLocation(assign.right));
      }
    }
    ts8.forEachChild(node, scanRefs);
  };
  const sited = /* @__PURE__ */ new Set([
    ...table.asks.map((site) => site.call),
    ...table.actors.map((site) => site.call),
    ...table.worldReads.map((site) => site.call),
    ...table.reports.map((site) => site.call),
    // 产物站点与 report 同席：它们产生站点（registry），
    // 所以已 site 的直接调用不得被误报，而收集漏掉的那一次必须被报出来。
    ...table.artifacts.map((site) => site.call),
    ...table.joins.map((site) => site.call)
  ]);
  const scanCalls = (node) => {
    if (ts8.isCallExpression(node) && !sited.has(node)) {
      const callee = facadeCallee(node, checker);
      if (callee !== void 0 && isSiteProducing(callee.container, callee.member)) {
        flag(node.expression, callee.member);
      }
    }
    ts8.forEachChild(node, scanCalls);
  };
  const flagRetype = (at2, name) => {
    const loc = toScriptLoc(at2.getStart(scriptFile));
    diagnostics.push({
      code: FACADE_SITING_CODE,
      column: loc.column,
      line: loc.line,
      message: `facade function '${name}' may only be called directly; retyping a facade value to a structurally-compatible non-facade type escapes site identity (the disguised '.${name}(...)' resolves to the local type and runs unsited)`
    });
  };
  const checkConversion = (valueExpr, destType) => {
    if (destType === void 0) return;
    const laundered = facadeSiteMember(checker.getTypeAtLocation(valueExpr), checker);
    if (laundered === void 0) return;
    if (facadeSiteMember(destType, checker) !== void 0) return;
    const viaDest = [...SITE_MEMBER_NAMES].find((name) => destType.getProperty(name) !== void 0);
    flagRetype(valueExpr, viaDest ?? laundered);
  };
  const scanRetyping = (node) => {
    if (ts8.isAsExpression(node) || ts8.isSatisfiesExpression(node)) {
      checkConversion(node.expression, checker.getTypeFromTypeNode(node.type));
    } else if (ts8.isCallExpression(node) || ts8.isNewExpression(node)) {
      for (const arg of node.arguments ?? []) checkConversion(arg, checker.getContextualType(arg));
    } else if (ts8.isReturnStatement(node) && node.expression !== void 0) {
      checkConversion(node.expression, checker.getContextualType(node.expression));
    } else if (ts8.isArrowFunction(node) && !ts8.isBlock(node.body)) {
      checkConversion(node.body, checker.getContextualType(node.body));
    } else if (ts8.isVariableDeclaration(node) && node.type !== void 0 && node.initializer !== void 0) {
      checkConversion(node.initializer, checker.getTypeFromTypeNode(node.type));
    } else if (ts8.isBinaryExpression(node) && VALUE_ASSIGNMENT_OPS.has(node.operatorToken.kind) && (ts8.isIdentifier(node.left) || ts8.isPropertyAccessExpression(node.left) || ts8.isElementAccessExpression(node.left))) {
      const destType = checker.getTypeAtLocation(node.left);
      if (!isEvolvingAny(node.left, destType, checker)) checkConversion(node.right, destType);
    }
    ts8.forEachChild(node, scanRetyping);
  };
  for (const statement of body.statements) scanRefs(statement);
  for (const statement of body.statements) scanCalls(statement);
  for (const statement of body.statements) scanRetyping(statement);
  const seen = /* @__PURE__ */ new Set();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isFacadeCallable(symbol) {
  return isFacadeDeclared(symbol) && symbol !== void 0 && (symbol.flags & (ts8.SymbolFlags.Function | ts8.SymbolFlags.Method)) !== 0;
}
function facadeSiteMember(type, checker, seen = /* @__PURE__ */ new Set(), depth = 0) {
  if (depth > FACADE_SITE_DEPTH || seen.has(type)) return void 0;
  seen.add(type);
  for (const name of SITE_MEMBER_NAMES) {
    if (isFacadeDeclared(type.getProperty(name))) return name;
  }
  if (type.isUnionOrIntersection()) {
    for (const constituent of type.types) {
      const found = facadeSiteMember(constituent, checker, seen, depth + 1);
      if (found !== void 0) return found;
    }
  }
  for (const arg of typeArguments(type, checker)) {
    const found = facadeSiteMember(arg, checker, seen, depth + 1);
    if (found !== void 0) return found;
  }
  for (const property of type.getProperties()) {
    if (property.valueDeclaration === void 0) continue;
    const propType = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration);
    const found = facadeSiteMember(propType, checker, seen, depth + 1);
    if (found !== void 0) return found;
  }
  return void 0;
}
function typeArguments(type, checker) {
  if ((type.flags & ts8.TypeFlags.Object) === 0) return [];
  if ((type.objectFlags & ts8.ObjectFlags.Reference) === 0) return [];
  return checker.getTypeArguments(type);
}
function isEvolvingAny(left, leftType, checker) {
  if ((leftType.flags & ts8.TypeFlags.Any) === 0 || !ts8.isIdentifier(left)) return false;
  const declaration = checker.getSymbolAtLocation(left)?.valueDeclaration;
  return declaration !== void 0 && ts8.isVariableDeclaration(declaration) && declaration.type === void 0;
}
function facadeCallee(call, checker) {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === void 0 || declaration.getSourceFile().fileName !== FACADE_FILE_NAME) {
    return void 0;
  }
  const name = declaration.name;
  if (name === void 0 || !ts8.isIdentifier(name)) return void 0;
  return { container: facadeContainerOf(declaration), member: name.text };
}
function isPropertyAccessName(node) {
  return ts8.isPropertyAccessExpression(node.parent) && node.parent.name === node;
}
function isDirectCallee2(node) {
  const parent = node.parent;
  return ts8.isCallExpression(parent) && parent.expression === node;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/world-run.ts
import ts9 from "typescript";
var WORLD_RUN_LITERAL_CODE = 9003;
function collectWorldRunCommands(workflow, table) {
  const commands = /* @__PURE__ */ new Set();
  const diagnostics = [];
  for (const site of table.worldReads) {
    if (site.op !== "run") continue;
    const cmd = site.args[0];
    if (cmd !== void 0 && ts9.isStringLiteralLike(cmd)) {
      commands.add(cmd.text);
      continue;
    }
    const loc = cmd === void 0 ? site.loc : workflow.toScriptLoc(cmd.getStart());
    diagnostics.push({
      code: WORLD_RUN_LITERAL_CODE,
      column: loc.column,
      line: loc.line,
      message: `world.run's first argument must be a compile-time string literal ("lean" or a no-substitution template): the script's command set is shown to the user at confirmation and only those commands are executable. Move the command name out of the variable/template, and put runtime values in the args array instead.`
    });
  }
  return { commands: [...commands].sort(), diagnostics };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/phases.ts
import ts10 from "typescript";
var PHASE_MARKER_CODE = 9004;
var LITERAL_MESSAGE = `phase()'s argument must be a compile-time string literal ("gate" or a no-substitution template): the script's phase names are fixed when it is submitted, because they label the graph the user confirms before anything runs. Write the name inline \u2014 a name that only exists at run time cannot be drawn.`;
var EMPTY_MESSAGE = 'phase("") has no name to show: the phase label is what the confirmation graph draws. Give the group a word ("preflight", "gate", "wrap-up"), or drop the marker \u2014 a script with no markers is perfectly legal and is drawn step by step.';
var STATEMENT_MESSAGE = 'phase("\u2026") must stand alone as its own statement. The marker claims the rest of the block it stands in, so one in expression position (a variable initializer, an argument, a ternary arm) has no rest-of-block to claim. Put the call on its own line at the head of the steps it names.';
function collectPhaseMarkerDiagnostics(workflow, table) {
  const diagnostics = [];
  const push = (loc, message) => {
    diagnostics.push({ code: PHASE_MARKER_CODE, column: loc.column, line: loc.line, message });
  };
  for (const marker of table.phases) {
    const nameLoc = marker.nameExpr === void 0 ? marker.loc : workflow.toScriptLoc(marker.nameExpr.getStart(workflow.scriptFile));
    if (marker.name === void 0) {
      push(nameLoc, LITERAL_MESSAGE);
    } else if (marker.name.trim() === "") {
      push(nameLoc, EMPTY_MESSAGE);
    }
    if (!ts10.isExpressionStatement(marker.call.parent)) {
      push(marker.loc, STATEMENT_MESSAGE);
    }
  }
  return diagnostics;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/actor-names.ts
import ts11 from "typescript";
var DUPLICATE_ACTOR_NAME_CODE = 9005;
var FANOUT_ACTOR_NAME_CODE = 9006;
function collectDuplicateActorNames(workflow, table) {
  const diagnostics = [];
  const claimed = /* @__PURE__ */ new Map();
  const fanOutBodies = new Set(table.iterations.map((iteration) => iteration.body));
  for (const site of table.actors) {
    const name = staticEffectiveName(site.call);
    if (name === void 0 || name === "") continue;
    const first = claimed.get(name);
    if (first === void 0) claimed.set(name, site.call);
    const loc = workflow.toScriptLoc(site.call.getStart(workflow.scriptFile));
    if (isInsideFanOut(site.call, fanOutBodies)) {
      diagnostics.push({
        code: FANOUT_ACTOR_NAME_CODE,
        column: loc.column,
        line: loc.line,
        message: `this agent(...) runs once per element of a fan-out but its name "${name}" is a fixed string, so every element creates a different actor under the same name \u2014 the run fails with DuplicateActorName as soon as the collection holds more than one item. An actor name must be unique within a run: it is the identity key an amended re-run matches its imported cache against. Build a per-element name (\`${name}-\${item}\`), or drop the name \u2014 anonymous actors are legal (they just never reuse cached work).`
      });
      continue;
    }
    if (first === void 0) continue;
    const firstLoc = workflow.toScriptLoc(first.getStart(workflow.scriptFile));
    diagnostics.push({
      code: DUPLICATE_ACTOR_NAME_CODE,
      column: loc.column,
      line: loc.line,
      message: `two actors are named "${name}" (the first is on line ${firstLoc.line}): an actor name must be unique within a run. The name is the identity key an amended re-run matches its imported cache against, and any run can become the predecessor of one, so a repeated name makes that match ambiguous. Give this one its own name, or drop the name entirely \u2014 anonymous actors are legal (they just never reuse cached work).`
    });
  }
  return diagnostics;
}
function isInsideFanOut(call, fanOutBodies) {
  for (let node = call; node !== void 0; node = node.parent) {
    if (fanOutBodies.has(node)) return true;
  }
  return false;
}
function staticEffectiveName(call) {
  const [nameArg, personaArg] = call.arguments;
  if (personaArg !== void 0 && !ts11.isStringLiteralLike(personaArg)) {
    if (!ts11.isObjectLiteralExpression(personaArg)) return void 0;
    for (const property of personaArg.properties) {
      if (ts11.isSpreadAssignment(property)) return void 0;
      if (property.name !== void 0 && ts11.isComputedPropertyName(property.name)) return void 0;
      if (property.name === void 0 || !isNameKey(property.name)) continue;
      if (!ts11.isPropertyAssignment(property)) return void 0;
      return ts11.isStringLiteralLike(property.initializer) ? property.initializer.text : void 0;
    }
  }
  return nameArg !== void 0 && ts11.isStringLiteralLike(nameArg) ? nameArg.text : void 0;
}
function isNameKey(key) {
  return (ts11.isIdentifier(key) || ts11.isStringLiteralLike(key)) && key.text === "name";
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/artifact-types.ts
import ts12 from "typescript";
var FORMAT_FLAGS = ts12.TypeFormatFlags.NoTruncation;
var UNINFORMATIVE = /* @__PURE__ */ new Set(["any", "unknown", "never", "void"]);
var FANOUT_UNWRAP_CAP = 8;
function computeArtifactTypes(workflow, table) {
  const checker = workflow.program.getTypeChecker();
  const siteType = /* @__PURE__ */ new Map();
  const joinPortTypes = /* @__PURE__ */ new Map();
  const renderRaw = (type) => checker.typeToString(type, void 0, FORMAT_FLAGS);
  const render = (type) => {
    if (type === void 0) return void 0;
    const text = renderRaw(type);
    return UNINFORMATIVE.has(text) ? void 0 : text;
  };
  const set = (id, type) => {
    const text = render(type);
    if (text !== void 0) siteType.set(id, text);
  };
  const awaitedOf = (node) => checker.getAwaitedType(checker.getTypeAtLocation(node));
  const arrayElement = (type) => {
    const name = type.target?.symbol?.name;
    if (name !== "Array" && name !== "ReadonlyArray") return void 0;
    const args = checker.getTypeArguments(type);
    return args.length > 0 ? args[0] : void 0;
  };
  const fanoutType = (call) => {
    const whole = awaitedOf(call);
    if (whole === void 0) return void 0;
    const wholeText = render(whole);
    let type = whole;
    let depth = 0;
    while (depth < FANOUT_UNWRAP_CAP) {
      const element = arrayElement(type);
      if (element === void 0) break;
      type = checker.getAwaitedType(element) ?? element;
      depth += 1;
    }
    if (depth === 0) return wholeText;
    const elementText = render(type);
    if (elementText === void 0) return wholeText;
    const base = /\s[|&]\s/.test(elementText) ? `(${elementText})` : elementText;
    return `${base}${"[]".repeat(depth)}`;
  };
  for (const site of table.asks) {
    const typeArg = site.call.typeArguments?.[0];
    const type = typeArg !== void 0 ? checker.getTypeFromTypeNode(typeArg) : awaitedOf(site.call);
    set(site.id, type);
  }
  for (const site of table.worldReads) set(site.id, awaitedOf(site.call));
  for (const site of table.joins) {
    set(site.id, awaitedOf(site.call));
    if (site.arg !== void 0 && ts12.isArrayLiteralExpression(site.arg)) {
      joinPortTypes.set(
        site.id,
        site.arg.elements.map((element) => render(awaitedOf(element)))
      );
    }
  }
  for (const cand of table.iterations) {
    if (cand.form !== "array-method" || cand.call === void 0) continue;
    const text = fanoutType(cand.call);
    if (text !== void 0) siteType.set(provisionalFanoutId(cand.order), text);
  }
  return { joinPortTypes, siteType };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/taint.ts
import ts24 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/calls.ts
import ts19 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/classes.ts
import ts14 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/promise-ops.ts
import ts13 from "typescript";
function appliedCallbackTaint(ev, fn) {
  const out = emptyValue();
  const id = ev.s.fnId.get(fn);
  if (id === void 0) return out;
  const paramCount = (ev.s.fnParamSymbols.get(id) ?? []).length;
  for (let param = 0; param < paramCount; param += 1) {
    const captured = ev.s.phCallActualsOf(id, param);
    if (captured !== void 0) mergeInto(out, captured);
  }
  return out;
}
function handleNewUnknown(ev, node, ctx) {
  const out = emptyValue();
  const argVals = (node.arguments ?? []).map((arg) => ev.evalExpr(arg, ctx));
  for (const argVal of argVals) collapseInto(out, argVal);
  const pot = clearExact(out);
  pot.fns.clear();
  for (const argVal of argVals) {
    applyPessimistically(ev, argVal, pot, ctx, out, node);
    for (const fn of argVal.fns) mergeInto(out, appliedCallbackTaint(ev, fn));
  }
  return out;
}
function evalAwait(ev, node, ctx) {
  const at2 = node.getStart(ev.s.scriptFile);
  const inner = ev.evalExpr(node.expression, ctx);
  const thenField = inner.fields.get("then");
  if (thenField === void 0 || thenField.fns.size === 0) {
    ev.s.mergeSink(ev.s.awaitVal, at2, inner);
    return inner;
  }
  const out = cloneValue(inner);
  for (const fn of thenField.fns) {
    const id = ev.s.fnId.get(fn);
    if (id !== void 0) ev.s.markCalled(ctx.regionStack, id);
    mergeInto(out, appliedCallbackTaint(ev, fn));
  }
  ev.s.mergeSink(ev.s.awaitVal, at2, out);
  return out;
}
function handlePromiseReject(ev, node, ctx) {
  const arg = node.arguments[0];
  const val = arg === void 0 ? emptyValue() : collapse(ev.evalExpr(arg, ctx));
  ev.s.mergeThrown(val);
  return val;
}
function isPromiseReject(access) {
  return ts13.isIdentifier(access.expression) && access.expression.text === "Promise" && access.name.text === "reject";
}
function applyConstructor(ev, id, ctx, argVals, argPlaces, site) {
  recordCall(ev, id, ctx.regionStack, argVals, argPlaces, site === void 0 ? void 0 : { site, via: "callee" });
}
function applyMixinConstructor(ev, ctx, instance, argVals) {
  const pot = emptyValue();
  for (const arg of argVals) collapseInto(pot, arg);
  const inexact = clearExact(pot);
  if (mergeInto(instance, inexact)) ev.s.changed = true;
  for (const arg of argVals) applyPessimistically(ev, arg, inexact, ctx, instance);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/classes.ts
function evalClasses(ev) {
  const ctx = { onReturn: () => {
  }, regionStack: ["top"] };
  for (const cls of ev.s.classes) evalClassBody(ev, cls, ctx);
}
function evalClassBody(ev, cls, ctx) {
  const instance = ev.s.instanceOf(cls);
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== ts14.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      const base = resolveClassNode(ev, type.expression);
      if (base !== void 0 && mergeInto(instance, ev.s.instanceOf(base))) ev.s.changed = true;
    }
  }
  for (const member of cls.members) {
    if (ts14.isPropertyDeclaration(member)) {
      const key = staticMemberKey(ev, member.name);
      if (key === void 0 || member.initializer === void 0) continue;
      mergeInstanceField(ev, instance, key, ev.evalExpr(member.initializer, ctx));
    } else if (ts14.isClassStaticBlockDeclaration(member)) {
      for (const stmt of member.body.statements) ev.visit(stmt, ctx);
    } else if (ts14.isMethodDeclaration(member)) {
      registerMember(ev, instance, staticMemberKey(ev, member.name), member);
    } else if (ts14.isGetAccessorDeclaration(member)) {
      const id = ev.s.fnId.get(member);
      if (id === void 0) continue;
      const key = staticMemberKey(ev, member.name);
      const summary = cloneValue(ev.s.summaryOf(id));
      if (key === void 0) mergeInstanceField(ev, instance, void 0, summary);
      else mergeInstanceField(ev, instance, key, summary);
    } else if (ts14.isConstructorDeclaration(member)) {
      applyParameterProperties(ev, instance, member);
    }
  }
}
function staticMemberKey(ev, name) {
  if (ts14.isComputedPropertyName(name)) return staticIndexKey(name.expression);
  return name.getText(ev.s.scriptFile);
}
function applyParameterProperties(ev, instance, ctor) {
  const id = ev.s.fnId.get(ctor);
  if (id === void 0) return;
  ctor.parameters.forEach((param, index) => {
    if (!ts14.isParameterPropertyDeclaration(param, ctor) || !ts14.isIdentifier(param.name)) return;
    const val = emptyValue();
    addPlaceholder(val, { fnId: id, param: index });
    mergeInstanceField(ev, instance, param.name.text, val);
  });
}
function mergeInstanceField(ev, instance, key, value) {
  const field = key === void 0 ? instance : liveField(instance, key);
  if (field !== value && mergeInto(field, value)) ev.s.changed = true;
}
function registerMember(ev, instance, key, fn) {
  const target = key === void 0 ? instance : liveField(instance, key);
  if (!target.fns.has(fn)) {
    target.fns.add(fn);
    ev.s.changed = true;
  }
}
function resolveClassNode(ev, expr) {
  const sym = ev.checker.getSymbolAtLocation(expr);
  return sym === void 0 ? void 0 : classNodeOfSymbol(ev, sym);
}
function classNodeOfSymbol(ev, sym, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(sym)) return void 0;
  seen.add(sym);
  for (const decl of sym.declarations ?? []) {
    if ((ts14.isClassDeclaration(decl) || ts14.isClassExpression(decl)) && ev.s.classInstances.has(decl)) return decl;
    const init = ts14.isVariableDeclaration(decl) || ts14.isPropertyAssignment(decl) ? decl.initializer : void 0;
    if (init !== void 0) {
      const via = classNodeFromExpr(ev, init, seen);
      if (via !== void 0) return via;
    }
  }
  return void 0;
}
function classNodeFromExpr(ev, expr, seen) {
  const e = peelPlace(expr);
  if (ts14.isClassExpression(e) && ev.s.classInstances.has(e)) return e;
  if (ts14.isIdentifier(e) || ts14.isPropertyAccessExpression(e)) {
    const sym = ev.checker.getSymbolAtLocation(e);
    if (sym !== void 0) return classNodeOfSymbol(ev, sym, seen);
  }
  return void 0;
}
function classConstructor(ev, cls, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(cls)) return void 0;
  seen.add(cls);
  for (const member of cls.members) {
    if (ts14.isConstructorDeclaration(member) && member.body !== void 0) return member;
  }
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== ts14.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      const base = resolveClassNode(ev, type.expression);
      if (base !== void 0) {
        const inherited = classConstructor(ev, base, seen);
        if (inherited !== void 0) return inherited;
      }
    }
  }
  return void 0;
}
function enclosingClassInstance(ev, node) {
  for (let cur = node.parent; cur !== void 0; cur = cur.parent) {
    if (ts14.isClassLike(cur)) return ev.s.instanceOf(cur);
  }
  return void 0;
}
function enclosingBaseInstance(ev, node) {
  for (let cur = node.parent; cur !== void 0; cur = cur.parent) {
    if (!ts14.isClassLike(cur)) continue;
    for (const clause of cur.heritageClauses ?? []) {
      if (clause.token !== ts14.SyntaxKind.ExtendsKeyword) continue;
      for (const type of clause.types) {
        const base = resolveClassNode(ev, type.expression);
        if (base !== void 0) return ev.s.instanceOf(base);
      }
    }
    return void 0;
  }
  return void 0;
}
function hasUnresolvedHeritage(ev, cls) {
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== ts14.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      if (resolveClassNode(ev, type.expression) === void 0) return true;
    }
  }
  return false;
}
function applySuperCall(ev, node, ctx) {
  for (let cur = node.parent; cur !== void 0; cur = cur.parent) {
    if (!ts14.isClassLike(cur)) continue;
    for (const clause of cur.heritageClauses ?? []) {
      if (clause.token !== ts14.SyntaxKind.ExtendsKeyword) continue;
      for (const type of clause.types) {
        const base = resolveClassNode(ev, type.expression);
        const ctor = base === void 0 ? void 0 : classConstructor(ev, base);
        const id = ctor === void 0 ? void 0 : ev.s.fnId.get(ctor);
        if (id !== void 0) {
          const argVals = node.arguments.map((arg) => ev.evalExpr(arg, ctx));
          const argPlaces = node.arguments.map((arg) => ev.resolvePlace(arg));
          applyConstructor(ev, id, ctx, argVals, argPlaces, node);
        }
      }
    }
    return;
  }
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/array-methods.ts
import ts15 from "typescript";
function handleArrayMethod(ev, node, cand, ctx) {
  const semantics = cand.semantics;
  const iterated = collapse(ev.evalExpr(cand.iterated, ctx));
  const fanoutId = provisionalFanoutId(cand.order);
  const promoted = ev.s.promotedOrders.has(cand.order);
  if (promoted) ev.s.mergeSink(ev.s.fanoutInVal, fanoutId, iterated);
  const element = cloneValue(iterated);
  if (promoted) addOcc(element, { exact: true, site: fanoutId });
  const regionStack = [...ctx.regionStack, `cand@${cand.order}`];
  const isReduce = semantics?.accumulatorParam !== void 0;
  const elementParams = semantics?.elementParams ?? [0];
  const wholeParams = semantics?.wholeParams ?? [2];
  const seedArg = node.arguments[1];
  const accumulator = () => {
    const chain = ev.s.reduceAccOf(cand.order);
    const seedPlace = seedArg === void 0 ? void 0 : ev.resolvePlace(seedArg);
    if (seedPlace !== void 0) {
      if (mergeInto(seedPlace, chain)) ev.s.changed = true;
      return { place: seedPlace, value: seedPlace };
    }
    const initial = seedArg === void 0 ? element : ev.evalExpr(seedArg, ctx);
    return { value: unionValues(initial, chain) };
  };
  const callbackReturn = emptyValue();
  const cb = cand.callback;
  if (cb !== void 0) {
    const cbCtx = {
      onReturn: (value) => void mergeInto(callbackReturn, value),
      regionStack
    };
    if (isReduce) bindCallbackParam(ev, cb, semantics?.accumulatorParam ?? 0, accumulator().value, cbCtx);
    elementParams.forEach((index, i) => bindCallbackParam(ev, cb, index, i === 0 ? element : cloneValue(element), cbCtx));
    for (const index of wholeParams) bindCallbackParam(ev, cb, index, cloneValue(element), cbCtx);
    if (ts15.isBlock(cb.body)) {
      for (const stmt of cb.body.statements) ev.visit(stmt, cbCtx);
    } else {
      mergeInto(callbackReturn, ev.evalExpr(cb.body, cbCtx));
    }
  } else if (cand.callbackExpr !== void 0) {
    const fns = [...ev.evalExpr(cand.callbackExpr, ctx).fns].filter((fn) => ev.s.fnId.has(fn));
    if (fns.length > 0) {
      const slots = Math.max(-1, ...elementParams, ...wholeParams, semantics?.accumulatorParam ?? -1) + 1;
      const actuals = Array.from({ length: slots }, () => emptyValue());
      if (isReduce) actuals[semantics?.accumulatorParam ?? 0] = accumulator().value;
      for (const index of elementParams) actuals[index] = cloneValue(element);
      for (const index of wholeParams) actuals[index] = cloneValue(element);
      mergeInto(callbackReturn, applyCallbackFns(ev, fns, actuals, regionStack, node));
    }
  }
  const collectionPlace = ev.resolvePlace(cand.iterated);
  if (collectionPlace !== void 0) {
    for (const field of element.fields.values()) {
      if (mergeInto(collectionPlace, collapse(field))) ev.s.changed = true;
    }
  }
  if (isReduce) ev.s.mergeReduceAcc(cand.order, callbackReturn);
  return unionValues(callbackReturn, element);
}
function bindCallbackParam(ev, cb, index, value, ctx) {
  const param = cb.parameters[index];
  if (param === void 0) return;
  ev.bindPattern(param.name, value, ctx);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/heap-ops.ts
import ts17 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/assign.ts
import ts16 from "typescript";
function handleAssignment(ev, node, ctx) {
  const value = ev.evalExpr(node.right, ctx);
  const rhsPlace = ev.resolvePlace(node.right);
  const target = peelParens(node.left);
  if (ts16.isArrayLiteralExpression(target) || ts16.isObjectLiteralExpression(target)) {
    bindAssignmentPattern(ev, target, value, ctx, rhsPlace);
    return value;
  }
  writeTarget(ev, target, value, ctx, rhsPlace);
  return value;
}
function handleCompoundAssignment(ev, node, ctx) {
  const rhs = ev.evalExpr(node.right, ctx);
  const prior = ev.evalExpr(node.left, ctx);
  writeTarget(ev, peelParens(node.left), rhs, ctx);
  return unionValues(prior, rhs);
}
function writeTarget(ev, target, value, ctx, rhsPlace) {
  if (ts16.isIdentifier(target)) {
    const sym = ev.checker.getSymbolAtLocation(target);
    if (sym !== void 0) ev.s.bindSymbol(sym, rhsPlace ?? value);
  } else if (ts16.isPropertyAccessExpression(target)) {
    const recv = ev.resolvePlace(target.expression, true);
    if (recv !== void 0) writeField(ev, recv, target.name.text, value, rhsPlace);
    else mergeIntoRootIdentifier(ev, target.expression, value);
    recordSetterWrite(ev, target.name.text, value);
  } else if (ts16.isElementAccessExpression(target)) {
    const key = staticIndexKey(target.argumentExpression);
    const recv = ev.resolvePlace(target.expression, true);
    if (key !== void 0) {
      if (recv !== void 0) writeField(ev, recv, key, value, rhsPlace);
      else mergeIntoRootIdentifier(ev, target.expression, value);
      return;
    }
    const keyTaint = collapse(ev.evalExpr(target.argumentExpression, ctx));
    if (recv !== void 0) {
      if (mergeInto(recv, keyTaint)) ev.s.changed = true;
      if (mergeInto(recv, collapse(value))) ev.s.changed = true;
    } else {
      mergeIntoRootIdentifier(ev, target.expression, keyTaint);
      mergeIntoRootIdentifier(ev, target.expression, value);
    }
  }
}
function writeField(ev, container, key, value, rhsPlace) {
  if (rhsPlace !== void 0 && !container.fields.has(key)) {
    container.fields.set(key, rhsPlace);
    ev.s.changed = true;
    return;
  }
  const field = liveField(container, key);
  if (field !== (rhsPlace ?? value) && mergeInto(field, rhsPlace ?? value)) ev.s.changed = true;
  if (rhsPlace !== void 0 && field !== rhsPlace && mergeInto(rhsPlace, field)) ev.s.changed = true;
  if (replayMayAliasWrite(container, key, rhsPlace ?? value)) ev.s.changed = true;
}
function recordSetterWrite(ev, name, value) {
  const setters = ev.s.settersByProp.get(name);
  if (setters === void 0) return;
  const actual = collapse(value);
  for (const id of setters) ev.s.addParamActual(id, 0, actual);
}
function bindAssignmentPattern(ev, target, value, ctx, sourcePlace) {
  if (ts16.isArrayLiteralExpression(target)) {
    let index = 0;
    for (const element of target.elements) {
      if (ts16.isOmittedExpression(element)) {
        index += 1;
        continue;
      }
      if (ts16.isSpreadElement(element)) {
        bindAssignmentTarget(ev, element.expression, collapse(value), ctx);
        continue;
      }
      if (sourcePlace !== void 0) {
        const field = ev.extractField(sourcePlace, String(index));
        bindAssignmentTarget(ev, element, field, ctx, field);
      } else {
        bindAssignmentTarget(ev, element, ev.selectField(value, String(index)), ctx);
      }
      index += 1;
    }
    return;
  }
  if (!ts16.isObjectLiteralExpression(target)) return;
  for (const prop of target.properties) {
    if (ts16.isSpreadAssignment(prop)) {
      bindAssignmentTarget(ev, prop.expression, collapse(value), ctx);
    } else if (ts16.isShorthandPropertyAssignment(prop)) {
      if (sourcePlace !== void 0) {
        const field = ev.extractField(sourcePlace, prop.name.text);
        if (prop.objectAssignmentInitializer !== void 0) {
          if (mergeInto(field, ev.evalExpr(prop.objectAssignmentInitializer, ctx))) ev.s.changed = true;
        }
        writeTarget(ev, prop.name, field, ctx, field);
      } else {
        let elemValue = ev.selectField(value, prop.name.text);
        if (prop.objectAssignmentInitializer !== void 0) {
          elemValue = unionValues(elemValue, ev.evalExpr(prop.objectAssignmentInitializer, ctx));
        }
        writeTarget(ev, prop.name, elemValue, ctx);
      }
    } else if (ts16.isPropertyAssignment(prop) && !ts16.isComputedPropertyName(prop.name)) {
      const key = prop.name.getText(ev.s.scriptFile);
      if (sourcePlace !== void 0) {
        const field = ev.extractField(sourcePlace, key);
        bindAssignmentTarget(ev, prop.initializer, field, ctx, field);
      } else {
        bindAssignmentTarget(ev, prop.initializer, ev.selectField(value, key), ctx);
      }
    } else if (ts16.isPropertyAssignment(prop)) {
      bindAssignmentTarget(ev, prop.initializer, collapse(value), ctx);
    }
  }
}
function bindForInitializer(ev, initializer, value, ctx) {
  if (!ts16.isVariableDeclarationList(initializer)) {
    bindAssignmentTarget(ev, initializer, value, ctx);
    return;
  }
  const decl = initializer.declarations[0];
  if (decl !== void 0) ev.bindPattern(decl.name, value, ctx);
}
function bindAssignmentTarget(ev, target, value, ctx, sourcePlace) {
  let t = peelParens(target);
  if (ts16.isBinaryExpression(t) && t.operatorToken.kind === ts16.SyntaxKind.EqualsToken) {
    if (sourcePlace !== void 0) {
      if (mergeInto(value, ev.evalExpr(t.right, ctx))) ev.s.changed = true;
    } else {
      value = unionValues(value, ev.evalExpr(t.right, ctx));
    }
    t = peelParens(t.left);
  }
  if (ts16.isArrayLiteralExpression(t) || ts16.isObjectLiteralExpression(t)) {
    bindAssignmentPattern(ev, t, value, ctx, sourcePlace);
    return;
  }
  writeTarget(ev, t, value, ctx, sourcePlace);
}
function mergeIntoRootIdentifier(ev, expr, value) {
  let cur = expr;
  while (true) {
    if (ts16.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts16.isPropertyAccessExpression(cur)) cur = cur.expression;
    else if (ts16.isElementAccessExpression(cur)) cur = cur.expression;
    else if (ts16.isNonNullExpression(cur)) cur = cur.expression;
    else if (ts16.isAsExpression(cur) || ts16.isSatisfiesExpression(cur)) cur = cur.expression;
    else if (ts16.isTypeAssertionExpression(cur)) cur = cur.expression;
    else break;
  }
  if (!ts16.isIdentifier(cur)) return;
  const sym = ev.checker.getSymbolAtLocation(cur);
  if (sym !== void 0 && mergeInto(ev.s.envSlot(sym), collapse(value))) ev.s.changed = true;
}
function peelParens(expr) {
  let cur = expr;
  while (ts16.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/heap-ops.ts
function isObjectAssign(access) {
  return ts17.isIdentifier(access.expression) && access.expression.text === "Object" && access.name.text === "assign";
}
function handleHeapMutator(ev, node, access, ctx) {
  const container = ev.resolvePlace(access.expression, true);
  if (container === void 0) ev.evalExpr(access.expression, ctx);
  for (const arg of node.arguments) {
    const argVal = collapse(ev.evalExpr(arg, ctx));
    if (container !== void 0) {
      if (mergeInto(container, argVal)) ev.s.changed = true;
      if (replayMayAliasMerge(container, argVal)) ev.s.changed = true;
    } else {
      mergeIntoRootIdentifier(ev, access.expression, argVal);
    }
  }
  return emptyValue();
}
function handleObjectAssign(ev, node, ctx) {
  const [targetArg, ...sources] = node.arguments;
  if (targetArg === void 0) return emptyValue();
  const targetLive = ev.resolvePlace(targetArg, true);
  const result = ev.evalExpr(targetArg, ctx);
  for (const src of sources) {
    const srcPlace = ev.resolvePlace(src);
    const srcVal = srcPlace ?? ev.evalExpr(src, ctx);
    if (targetLive !== void 0) {
      if (srcPlace !== void 0 && adoptFields(targetLive, srcPlace)) ev.s.changed = true;
      if (mergeInto(targetLive, srcVal)) ev.s.changed = true;
    }
    mergeInto(result, srcVal);
  }
  return result;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/relays.ts
import ts18 from "typescript";
function handleAsk(ev, node, askId, ctx) {
  ev.s.markFacade(ctx.regionStack);
  const site = ev.s.askSites.get(askId);
  if (site !== void 0) {
    ev.s.mergeSink(ev.s.askRecv, askId, collapse(ev.evalExpr(site.receiver, ctx)));
    if (site.instructions !== void 0) {
      ev.s.mergeSink(ev.s.askInstr, askId, collapse(ev.evalExpr(site.instructions, ctx)));
    }
  }
  node.arguments.forEach((arg, index) => {
    if (index !== 0) ev.evalExpr(arg, ctx);
  });
  return singleOcc(askId, true);
}
function handleWorldRead(ev, id, args, ctx) {
  ev.s.markFacade(ctx.regionStack);
  for (const arg of args) ev.s.mergeSink(ev.s.worldRead, id, collapse(ev.evalExpr(arg, ctx)));
  return singleOcc(id, true);
}
function handleJoin(ev, node, id, arg, ctx) {
  ev.s.markFacade(ctx.regionStack);
  const result = ev.s.joinResultOf(node);
  if (arg !== void 0 && ts18.isArrayLiteralExpression(arg) && !arg.elements.some(ts18.isSpreadElement)) {
    arg.elements.forEach((el, port) => {
      const elemValue = ev.evalExpr(el, ctx);
      ev.s.mergeJoinIn(id, port, collapse(elemValue));
      const field = liveField(result, String(port));
      if (mergeInto(field, elemValue)) ev.s.changed = true;
      if (addOcc(field, { exact: true, port, site: id })) ev.s.changed = true;
      const elemPlace = ev.resolvePlace(el);
      if (elemPlace !== void 0) {
        const targets = field.mayAlias ??= /* @__PURE__ */ new Set();
        if (!targets.has(elemPlace)) {
          targets.add(elemPlace);
          ev.s.changed = true;
        }
      }
    });
    if (addOcc(result, { exact: true, site: id })) ev.s.changed = true;
    return result;
  }
  if (arg !== void 0) {
    const argCollapsed = collapse(ev.evalExpr(arg, ctx));
    ev.s.mergeJoinIn(id, -1, argCollapsed);
    if (mergeInto(result, argCollapsed)) ev.s.changed = true;
  }
  if (addOcc(result, { exact: true, site: id })) ev.s.changed = true;
  return result;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/calls.ts
function evalCall(ev, node, ctx) {
  const actorId = ev.s.actorByCall.get(node);
  if (actorId !== void 0) return singleOcc(actorId, true);
  if (node.expression.kind === ts19.SyntaxKind.SuperKeyword) {
    applySuperCall(ev, node, ctx);
    return emptyValue();
  }
  const askId = ev.s.askByCall.get(node);
  if (askId !== void 0) return handleAsk(ev, node, askId, ctx);
  const world = ev.s.worldByCall.get(node);
  if (world !== void 0) return handleWorldRead(ev, world.id, world.args, ctx);
  const join = ev.s.joinByCall.get(node);
  if (join !== void 0) return handleJoin(ev, node, join.id, join.arg, ctx);
  if (ts19.isPropertyAccessExpression(node.expression)) {
    const cand = ev.s.candByCall.get(node);
    if (cand !== void 0) return handleArrayMethod(ev, node, cand, ctx);
    if (isJsonStringify(node.expression)) {
      return node.arguments[0] === void 0 ? emptyValue() : collapse(ev.evalExpr(node.arguments[0], ctx));
    }
    if (isPromiseReject(node.expression)) return handlePromiseReject(ev, node, ctx);
    if (isObjectAssign(node.expression)) return handleObjectAssign(ev, node, ctx);
    if (HEAP_MUTATORS.has(node.expression.name.text)) {
      const smear = handleHeapMutator(ev, node, node.expression, ctx);
      const memberVal = ev.evalExpr(node.expression, ctx);
      const hasTrackedFns = [...memberVal.fns].some((fn) => ev.s.fnId.has(fn));
      return hasTrackedFns ? handleGenericCall(ev, node, ctx) : smear;
    }
    const forwarded = handleInvocationForwarding(ev, node, node.expression, ctx);
    if (forwarded !== void 0) return forwarded;
    if (callbackSemanticsOf(node, ev.checker, ev.s.program)?.deferred === true) {
      const receiver = node.expression.expression;
      ev.s.mergeSink(ev.s.awaitVal, node.expression.name.getStart(ev.s.scriptFile), collapse(ev.evalExpr(receiver, ctx)));
    }
  }
  return handleGenericCall(ev, node, ctx);
}
function handleGenericCall(ev, node, ctx) {
  const { explicit, places, tail } = buildActuals(ev, node.arguments, ctx);
  return applyCall(ev, node.expression, explicit, ctx, places, tail, node);
}
function buildActuals(ev, argsNodes, ctx) {
  const spreadIndex = argsNodes.findIndex((a) => ts19.isSpreadElement(a));
  if (spreadIndex < 0) {
    const explicit2 = argsNodes.map((a) => ev.evalExpr(a, ctx));
    return {
      explicit: explicit2,
      places: argsNodes.map((a, i) => ev.argWriteBackPlace(a, explicit2[i])),
      tail: void 0
    };
  }
  const explicit = argsNodes.slice(0, spreadIndex).map((a) => ev.evalExpr(a, ctx));
  const places = argsNodes.slice(0, spreadIndex).map((a, i) => ev.argWriteBackPlace(a, explicit[i]));
  const tail = emptyValue();
  for (const arg of argsNodes.slice(spreadIndex)) collapseInto(tail, ev.evalExpr(arg, ctx));
  return { explicit, places, tail: clearExact(tail) };
}
function handleInvocationForwarding(ev, node, access, ctx) {
  const method = access.name.text;
  if (method !== "call" && method !== "apply" && method !== "bind") return void 0;
  const receiverVal = ev.evalExpr(access.expression, ctx);
  const fns = [...receiverVal.fns].filter((fn) => ev.s.fnId.has(fn));
  if (fns.length === 0) return void 0;
  const exact = fns.length === 1 && isDirectCallee(access.expression);
  if (method === "call") {
    const { explicit, places, tail } = buildActuals(ev, node.arguments.slice(1), ctx);
    return applyToFns(ev, fns, exact, explicit, ctx, places, tail, receiverVal.bound, node);
  }
  if (method === "apply") {
    const argsArray = node.arguments[1];
    const tail = argsArray === void 0 ? emptyValue() : clearExact(collapse(ev.evalExpr(argsArray, ctx)));
    return applyToFns(ev, fns, false, [], ctx, void 0, tail, receiverVal.bound, node);
  }
  const prefixArgs = node.arguments.slice(1).map((arg) => ev.evalExpr(arg, ctx));
  const out = emptyValue();
  for (const fn of receiverVal.fns) out.fns.add(fn);
  out.bound = [...receiverVal.bound ?? [], ...prefixArgs];
  return out;
}
function applyCall(ev, calleeExpr, argVals, ctx, argPlaces, tail, site) {
  const calleeVal = ev.evalExpr(calleeExpr, ctx);
  const foreign = ts19.isPropertyAccessExpression(calleeExpr) && isForeignMember(calleeExpr.name, ev.checker, ev.s.scriptFile);
  const fns = foreign ? [] : [...calleeVal.fns].filter((fn) => ev.s.fnId.has(fn));
  if (fns.length === 0) return handleUnknownCall(ev, calleeExpr, calleeVal, argVals, ctx, tail, site);
  const exact = fns.length === 1 && isDirectCallee(calleeExpr);
  return applyToFns(ev, fns, exact, argVals, ctx, argPlaces, tail, calleeVal.bound, site);
}
function applyToFns(ev, fns, exact, explicit, ctx, argPlaces, tail, bound, site) {
  const result = emptyValue();
  const hasBound = bound !== void 0 && bound.length > 0;
  applyAligned(ev, fns, hasBound ? false : exact, explicit, ctx, argPlaces, tail, result, site);
  if (hasBound) {
    const prefixed = [...bound, ...explicit];
    const prefixedPlaces = [...bound.map(() => void 0), ...argPlaces ?? []];
    applyAligned(ev, fns, false, prefixed, ctx, prefixedPlaces, tail, result, site);
  }
  return result;
}
function applyAligned(ev, fns, exact, explicit, ctx, argPlaces, tail, result, site) {
  const clear = !exact;
  for (const fn of fns) {
    const id = ev.s.fnId.get(fn);
    if (id === void 0) continue;
    const paramCount = (ev.s.fnParamSymbols.get(id) ?? []).length;
    const len = tail !== void 0 ? Math.max(explicit.length, paramCount) : explicit.length;
    const args = [];
    const places = [];
    for (let i = 0; i < len; i += 1) {
      const explicitVal = i < explicit.length ? explicit[i] : void 0;
      args.push(explicitVal ?? tail);
      places.push(explicitVal !== void 0 ? argPlaces?.[i] : void 0);
    }
    const recorded = clear ? args.map((a) => clearExact(a)) : args;
    recordCall(ev, id, ctx.regionStack, recorded, places, site === void 0 ? void 0 : { site, via: "callee" });
    mergeInto(result, substitute(ev.s.summaryOf(id), id, args, clear));
  }
}
function handleUnknownCall(ev, calleeExpr, calleeVal, argVals, ctx, tail, site) {
  const applied = emptyValue();
  if (ts19.isPropertyAccessExpression(calleeExpr)) collapseInto(applied, ev.evalExpr(calleeExpr.expression, ctx));
  for (const arg of argVals) collapseInto(applied, arg);
  if (tail !== void 0) collapseInto(applied, tail);
  const out = cloneValue(applied);
  const actual = clearExact(applied);
  actual.fns.clear();
  for (const arg of argVals) applyPessimistically(ev, arg, actual, ctx, out, site);
  if (tail !== void 0) applyPessimistically(ev, tail, actual, ctx, out, site);
  for (const arg of argVals) recordPhCallActuals(ev, arg, actual);
  if (tail !== void 0) recordPhCallActuals(ev, tail, actual);
  if (calleeVal.phs.size > 0) {
    const argPot = emptyValue();
    for (const arg of argVals) collapseInto(argPot, arg);
    if (tail !== void 0) collapseInto(argPot, tail);
    recordPhCallActuals(ev, calleeVal, argPot);
  }
  return out;
}
function applyPessimistically(ev, source, pot, ctx, out, site) {
  for (const fn of source.fns) {
    const id = ev.s.fnId.get(fn);
    if (id === void 0) continue;
    const actuals = (ev.s.fnParamSymbols.get(id) ?? []).map(() => pot);
    recordCall(ev, id, ctx.regionStack, actuals, void 0, site === void 0 ? void 0 : { site, via: "argument" });
    mergeInto(out, substitute(ev.s.summaryOf(id), id, actuals, true));
  }
}
function applyCallbackFns(ev, fns, actuals, regionStack, site) {
  const out = emptyValue();
  for (const fn of fns) {
    const id = ev.s.fnId.get(fn);
    if (id === void 0) continue;
    recordCall(ev, id, regionStack, actuals, void 0, { site, via: "argument" });
    mergeInto(out, substitute(ev.s.summaryOf(id), id, actuals, true));
  }
  return out;
}
function recordPhCallActuals(ev, source, value) {
  for (const ph of source.phs.values()) ev.s.recordPhCall(phKey(ph), value);
}
function recordCall(ev, id, regionStack, argVals, argPlaces, application) {
  ev.s.markCalled(regionStack, id);
  if (application !== void 0) {
    const fn = ev.s.functions[id];
    if (fn !== void 0) ev.s.recordApplication(application.site, fn, application.via);
  }
  const params = ev.s.fnParamSymbols.get(id) ?? [];
  argVals.forEach((argVal, param) => {
    ev.s.addParamActual(id, param, argVal);
    const psym = params[param];
    if (psym !== void 0 && argVal.fns.size > 0) {
      const fnsOnly = emptyValue();
      for (const fn of argVal.fns) fnsOnly.fns.add(fn);
      ev.s.bindSymbol(psym, fnsOnly);
    }
    const actualLive = argPlaces?.[param];
    if (psym !== void 0 && actualLive !== void 0) {
      const paramSlot = ev.s.env.get(psym);
      if (paramSlot !== void 0 && paramSlot !== actualLive && mergeHeapEffects(actualLive, paramSlot, id, param, argVals)) {
        ev.s.changed = true;
      }
    }
  });
}
function mergeHeapEffects(target, source, fnId, selfParam, argVals) {
  let changed = false;
  for (const occ of source.occs.values()) changed = addOcc(target, occ) || changed;
  for (const ph of source.phs.values()) {
    if (ph.fnId !== fnId) {
      changed = addPlaceholder(target, ph) || changed;
      continue;
    }
    if (ph.param === selfParam) continue;
    if (ph.rest === true) {
      for (let i = ph.param; i < argVals.length; i += 1) {
        const restActual = argVals[i];
        if (restActual !== void 0) changed = mergeInto(target, collapse(restActual)) || changed;
      }
      continue;
    }
    const actual = argVals[ph.param];
    if (actual !== void 0) changed = mergeInto(target, collapse(actual)) || changed;
  }
  for (const fn of source.fns) {
    if (!target.fns.has(fn)) {
      target.fns.add(fn);
      changed = true;
    }
  }
  for (const [key, field] of source.fields) {
    let slot = target.fields.get(key);
    if (slot === void 0) {
      slot = emptyValue();
      target.fields.set(key, slot);
    }
    changed = mergeInto(slot, field) || changed;
  }
  if (source.bound !== void 0) changed = mergeBound(target, source.bound, 0) || changed;
  return changed;
}
function substitute(summary, fnId, argVals, clear, depth = 0) {
  const out = emptyValue();
  for (const occ of summary.occs.values()) {
    addOcc(out, { exact: clear ? false : occ.exact, port: occ.port, site: occ.site });
  }
  for (const ph of summary.phs.values()) {
    if (ph.fnId !== fnId) {
      addPlaceholder(out, ph);
      continue;
    }
    if (ph.rest === true) {
      for (let i = ph.param; i < argVals.length; i += 1) {
        const restActual = argVals[i];
        if (restActual !== void 0) mergeInto(out, clear ? clearExact(restActual) : restActual);
      }
      continue;
    }
    const actual = argVals[ph.param];
    if (actual !== void 0) mergeInto(out, clear ? clearExact(actual) : actual);
  }
  for (const fn of summary.fns) out.fns.add(fn);
  if (depth >= VALUE_DEPTH_CAP) {
    for (const field of summary.fields.values()) collapseInto(out, field);
    for (const el of summary.bound ?? []) collapseInto(out, el);
    return out;
  }
  if (summary.bound !== void 0) {
    out.bound = summary.bound.map((el) => substitute(el, fnId, argVals, clear, depth + 1));
  }
  for (const [key, field] of summary.fields) out.fields.set(key, substitute(field, fnId, argVals, clear, depth + 1));
  return out;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/control-flow.ts
import ts20 from "typescript";
function visitForStatement(ev, node, ctx) {
  if (node.initializer !== void 0) {
    if (ts20.isVariableDeclarationList(node.initializer)) {
      for (const decl of node.initializer.declarations) ev.handleDeclaration(decl, ctx);
    } else {
      ev.evalExpr(node.initializer, ctx);
    }
  }
  if (node.condition !== void 0) ev.recordGuard(node.condition, ev.evalExpr(node.condition, ctx));
  if (node.incrementor !== void 0) ev.evalExpr(node.incrementor, ctx);
  ev.visit(node.statement, ctx);
}
function handleForOf(ev, node, ctx) {
  const cand = ev.s.candByForOf.get(node);
  const iterated = collapse(ev.evalExpr(node.expression, ctx));
  if (node.awaitModifier !== void 0) {
    ev.s.mergeSink(ev.s.awaitVal, node.expression.getStart(ev.s.scriptFile), iterated);
  }
  const element = cloneValue(iterated);
  let regionStack = ctx.regionStack;
  if (cand !== void 0) {
    const fanoutId = provisionalFanoutId(cand.order);
    if (ev.s.promotedOrders.has(cand.order)) {
      ev.s.mergeSink(ev.s.fanoutInVal, fanoutId, iterated);
      addOcc(element, { exact: true, site: fanoutId });
    }
    regionStack = [...ctx.regionStack, `cand@${cand.order}`];
  }
  bindForInitializer(ev, node.initializer, element, ctx);
  ev.visit(node.statement, { onReturn: ctx.onReturn, regionStack });
  const collectionPlace = ev.resolvePlace(node.expression);
  if (collectionPlace !== void 0) {
    const writeBackFields = (holder) => {
      for (const field of holder.fields.values()) {
        if (mergeInto(collectionPlace, collapse(field))) ev.s.changed = true;
      }
    };
    writeBackFields(element);
    for (const sym of boundSymbolsOfForInitializer(ev, node.initializer)) {
      const slot = ev.s.env.get(sym);
      if (slot !== void 0 && slot !== collectionPlace) writeBackFields(slot);
    }
  }
}
function boundSymbolsOfForInitializer(ev, initializer) {
  const out = [];
  const addName = (name) => {
    if (ts20.isIdentifier(name)) {
      const sym = ev.checker.getSymbolAtLocation(name);
      if (sym !== void 0) out.push(sym);
      return;
    }
    for (const el of name.elements) {
      if (ts20.isBindingElement(el)) addName(el.name);
    }
  };
  if (ts20.isVariableDeclarationList(initializer)) {
    const decl = initializer.declarations[0];
    if (decl !== void 0) addName(decl.name);
    return out;
  }
  if (ts20.isIdentifier(initializer)) {
    const sym = ev.checker.getSymbolAtLocation(initializer);
    if (sym !== void 0) out.push(sym);
  }
  return out;
}
function handleForIn(ev, node, ctx) {
  bindForInitializer(ev, node.initializer, collapse(ev.evalExpr(node.expression, ctx)), ctx);
  ev.visit(node.statement, ctx);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/literals.ts
import ts21 from "typescript";
function evalArrayLiteral(ev, node, ctx) {
  const out = emptyValue();
  if (node.elements.some((el) => ts21.isSpreadElement(el))) {
    const sole = node.elements[0];
    if (node.elements.length === 1 && sole !== void 0 && ts21.isSpreadElement(sole) && spreadShare(ev, out, sole.expression)) {
      return out;
    }
    for (const el of node.elements) collapseInto(out, ev.evalExpr(el, ctx));
    return out;
  }
  node.elements.forEach((el, index) => out.fields.set(String(index), fieldValue(ev, el, ctx)));
  return out;
}
function evalObjectLiteral(ev, node, ctx) {
  const out = emptyValue();
  for (const prop of node.properties) {
    if (ts21.isPropertyAssignment(prop) && !ts21.isComputedPropertyName(prop.name)) {
      out.fields.set(prop.name.getText(ev.s.scriptFile), fieldValue(ev, prop.initializer, ctx));
    } else if (ts21.isShorthandPropertyAssignment(prop)) {
      const sym = ev.checker.getShorthandAssignmentValueSymbol(prop);
      out.fields.set(prop.name.text, sym === void 0 ? emptyValue() : ev.s.envSlot(sym));
    } else if (ts21.isSpreadAssignment(prop)) {
      if (!spreadShare(ev, out, prop.expression)) mergeInto(out, ev.evalExpr(prop.expression, ctx));
    } else if (ts21.isMethodDeclaration(prop) && !ts21.isComputedPropertyName(prop.name)) {
      const fnVal = emptyValue();
      fnVal.fns.add(prop);
      out.fields.set(prop.name.getText(ev.s.scriptFile), fnVal);
    } else if (ts21.isGetAccessorDeclaration(prop) && !ts21.isComputedPropertyName(prop.name)) {
      const id = ev.s.fnId.get(prop);
      out.fields.set(prop.name.getText(ev.s.scriptFile), id === void 0 ? emptyValue() : cloneValue(ev.s.summaryOf(id)));
    } else if (ts21.isPropertyAssignment(prop)) {
      if (ts21.isComputedPropertyName(prop.name)) collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
      collapseInto(out, ev.evalExpr(prop.initializer, ctx));
    } else if ((ts21.isMethodDeclaration(prop) || ts21.isGetAccessorDeclaration(prop) || ts21.isSetAccessorDeclaration(prop)) && ts21.isComputedPropertyName(prop.name)) {
      collapseInto(out, ev.evalExpr(prop.name.expression, ctx));
    }
  }
  return out;
}
function fieldValue(ev, expr, ctx) {
  return ev.resolvePlace(expr) ?? ev.evalExpr(expr, ctx);
}
function spreadShare(ev, out, expr) {
  const place = ev.resolvePlace(expr);
  if (place === void 0) return false;
  adoptFields(out, place);
  mergeInto(out, place);
  return true;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/patterns.ts
import ts22 from "typescript";
function bindPattern(ev, name, value, ctx, sourcePlace) {
  if (ts22.isIdentifier(name)) {
    const sym = ev.checker.getSymbolAtLocation(name);
    if (sym !== void 0) ev.s.bindSymbol(sym, value);
    return;
  }
  if (ts22.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken !== void 0) {
        bindPattern(ev, element.name, collapse(value), ctx);
        continue;
      }
      const key = bindingPropertyKey(element);
      if (sourcePlace !== void 0 && key !== void 0) {
        bindPatternElement(ev, element.name, extractField(ev, sourcePlace, key), element.initializer, ctx);
      } else {
        bindPattern(ev, element.name, key === void 0 ? collapse(value) : selectField(value, key), ctx);
      }
    }
    return;
  }
  let index = 0;
  for (const element of name.elements) {
    if (ts22.isOmittedExpression(element)) {
      index += 1;
      continue;
    }
    if (element.dotDotDotToken !== void 0) {
      bindPattern(ev, element.name, collapse(value), ctx);
      continue;
    }
    if (sourcePlace !== void 0) {
      bindPatternElement(ev, element.name, extractField(ev, sourcePlace, String(index)), element.initializer, ctx);
    } else {
      bindPattern(ev, element.name, selectField(value, String(index)), ctx);
    }
    index += 1;
  }
}
function bindPatternElement(ev, name, field, initializer, ctx) {
  if (initializer !== void 0 && mergeInto(field, ev.evalExpr(initializer, ctx))) ev.s.changed = true;
  bindPattern(ev, name, field, ctx, field);
}
function extractField(ev, container, key) {
  const existing = container.fields.get(key);
  if (existing !== void 0) return existing;
  const field = emptyValue();
  for (const occ of container.occs.values()) addOcc(field, occ);
  for (const ph of container.phs.values()) addPlaceholder(field, ph);
  container.fields.set(key, field);
  ev.s.changed = true;
  return field;
}
function selectField(value, key) {
  return readField(value, key);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/state.ts
import ts23 from "typescript";
var TaintState = class {
  constructor(workflow, table) {
    this.table = table;
    this.checker = workflow.program.getTypeChecker();
    this.program = workflow.program;
    this.scriptFile = workflow.scriptFile;
    this.body = findWorkflowBody2(workflow.scriptFile);
    this.buildLookups();
    this.collectFunctions();
  }
  checker;
  program;
  scriptFile;
  body;
  // Site lookups keyed by their raw AST nodes (the table resolved them via the checker).
  askByCall = /* @__PURE__ */ new Map();
  askSites = /* @__PURE__ */ new Map();
  worldByCall = /* @__PURE__ */ new Map();
  joinByCall = /* @__PURE__ */ new Map();
  actorByCall = /* @__PURE__ */ new Map();
  /** Per-element callback calls (`xs.map(fn)`, `Array.from(xs, fn)`, …), keyed by the CALL. */
  candByCall = /* @__PURE__ */ new Map();
  candByForOf = /* @__PURE__ */ new Map();
  /**
   * THE CALL ORACLE: for every call / `new` /
   * tagged-template node, the script-local functions this pass applied there and HOW —
   * `callee` (the node's callee value held the function: direct call, through a parameter,
   * a field, a class member) or `argument` (the node handed the function to a library callee
   * that may invoke it: a registry entry or the keystone rule). Monotone like every other
   * accumulator; read after convergence by the ordering walk, which inlines exactly these
   * bodies at exactly these sites instead of guessing from syntax.
   */
  applications = /* @__PURE__ */ new Map();
  /**
   * The live abstract result of each `Promise.all` join call, keyed by the join CALL NODE
   * and PERSISTENT across fixpoint passes (see {@link joinResultOf}). A join result IS a
   * place whose element fields carry may-alias back-references to the (place) inputs, so
   * resolvePlace returns it — letting `const [a, b] = await Promise.all([…])`
   * destructure-alias the elements and a write through `res[k]` reach the original input.
   */
  joinResults = /* @__PURE__ */ new Map();
  /**
   * The live abstract place of each conditional expression used as a place
   * (`flag ? box1 : box2`), keyed by the ConditionalExpression NODE and persistent across
   * passes (see {@link condPlaceOf}). Same canonical-heap requirement as {@link joinResults}.
   */
  condPlaces = /* @__PURE__ */ new Map();
  /** Allocation-site places of container literals; see {@link literalPlaceOf}. */
  literalPlaces = /* @__PURE__ */ new Map();
  // Script-local functions (excluding iteration callbacks, handled inline).
  fnId = /* @__PURE__ */ new Map();
  fnParamSymbols = /* @__PURE__ */ new Map();
  functions = [];
  callbackNodes = /* @__PURE__ */ new Set();
  /**
   * Object-literal set accessors, keyed by property name -> setter fn ids. Crude but
   * sound: an assignment to ANY property of that name (on any object) records the
   * assigned value as the setter's param-0 actual, so the setter body's flow is seen.
   */
  settersByProp = /* @__PURE__ */ new Map();
  /**
   * One shared abstract instance per class declaration/expression, keyed by the class
   * node. Static AND instance members conflate into this ONE value (a deliberate sound
   * over-approximation: per-instance and static/instance precision are out of scope, so
   * a write through any instance, through `this`, or through the class name is visible
   * through every other). Persistent across fixpoint passes — growth is signalled like
   * any env slot.
   */
  classInstances = /* @__PURE__ */ new Map();
  /** Class declarations/expressions in the workflow body, in discovery order. */
  classes = [];
  // Persistent fixpoint state.
  env = /* @__PURE__ */ new Map();
  summaries = /* @__PURE__ */ new Map();
  paramActuals = /* @__PURE__ */ new Map();
  /**
   * Per-placeholder-parameter set of values that MAY be passed to an INVOCATION of that
   * parameter (keyed by `${fnId}:${param}`). Two capture sites (calls.ts handleUnknownCall):
   * a direct call of a placeholder callee (`resolve(draft)` — resolve is param 0), and a
   * placeholder-valued argument to an unknown call (`draft.then(onOk)` — the unknown `.then`
   * may invoke onOk with the receiver pot). Consumed by the promise machinery: `new
   * Unknown(fn)` and `await thenable` resolve to whatever fn's / then's callback params
   * receive (the resolve/reject/continuation pattern). Distinct from {@link paramActuals},
   * which records what a function receives when IT is called.
   */
  phCallActuals = /* @__PURE__ */ new Map();
  reachSet = /* @__PURE__ */ new Set();
  calledFns = /* @__PURE__ */ new Map();
  promotedOrders = /* @__PURE__ */ new Set();
  /**
   * Per-`reduce`-candidate accumulator taint (keyed by candidate `order`), carried
   * ACROSS fixpoint passes. The callback-return value that reduce threads into the
   * accumulator param is a fresh local each pass, so binding the param from it
   * directly never observed the return taint; this persistent slot fixes that.
   */
  reduceAcc = /* @__PURE__ */ new Map();
  // Sink accumulators (may contain placeholders; resolved at emission).
  askInstr = /* @__PURE__ */ new Map();
  askRecv = /* @__PURE__ */ new Map();
  worldRead = /* @__PURE__ */ new Map();
  joinInByPort = /* @__PURE__ */ new Map();
  fanoutInVal = /* @__PURE__ */ new Map();
  /**
   * The ORACLE accumulators, keyed by source START OFFSET rather than by site id: the
   * value each `await` operand carries, and the value each guard expression reads. They
   * feed {@link emitOracle}, which only the temporal walk (causality-order.ts) consumes —
   * nothing here changes a transfer rule, and a position keys nothing in the site
   * vocabulary, which is what keeps the site-id stability rule untouched: no `order`
   * counter and no per-kind counter is consulted.
   */
  awaitVal = /* @__PURE__ */ new Map();
  guardVal = /* @__PURE__ */ new Map();
  returnVal = emptyValue();
  /**
   * One script-global thrown-value set: every `throw` joins its operand into it and
   * every `catch` binding reads all of it. A flow-insensitive over-approximation of
   * exception routing — sound under gen-only, deliberately imprecise across disjoint
   * `try` blocks. Persistent across passes so throws in one iteration reach catches
   * in the next (fixpoint-safe).
   */
  thrownVal = emptyValue();
  changed = false;
  buildLookups() {
    for (const site of this.table.asks) {
      this.askByCall.set(site.call, site.id);
      this.askSites.set(site.id, { instructions: site.instructions, receiver: site.receiver });
    }
    for (const site of this.table.worldReads) this.worldByCall.set(site.call, { args: site.args, id: site.id });
    for (const site of this.table.joins) this.joinByCall.set(site.call, { arg: site.arg, id: site.id });
    for (const site of this.table.actors) this.actorByCall.set(site.call, site.id);
    for (const cand of this.table.iterations) {
      if (cand.form === "array-method" && cand.call !== void 0) {
        this.candByCall.set(cand.call, cand);
        if (cand.callback !== void 0) this.callbackNodes.add(cand.callback);
      } else if (cand.form === "for-of") {
        this.candByForOf.set(cand.body.parent, cand);
      }
    }
  }
  collectFunctions() {
    const visit = (node) => {
      if (ts23.isClassDeclaration(node) || ts23.isClassExpression(node)) {
        this.classInstances.set(node, emptyValue());
        this.classes.push(node);
      }
      if (isFunctionLike2(node) && !this.callbackNodes.has(node)) {
        const id = this.functions.length;
        this.fnId.set(node, id);
        this.functions.push(node);
        const decl = node;
        this.fnParamSymbols.set(
          id,
          decl.parameters.map(
            (p) => ts23.isIdentifier(p.name) ? this.checker.getSymbolAtLocation(p.name) : void 0
          )
        );
        if (ts23.isSetAccessorDeclaration(node) && !ts23.isComputedPropertyName(node.name)) {
          const name = node.name.getText(this.scriptFile);
          const list = this.settersByProp.get(name);
          if (list === void 0) this.settersByProp.set(name, [id]);
          else list.push(id);
        }
      }
      ts23.forEachChild(node, visit);
    };
    for (const stmt of this.body.statements) visit(stmt);
  }
  // -- monotone update primitives ------------------------------------------
  /**
   * Bind a symbol to an abstract value. A FRESH symbol ADOPTS the value object by
   * reference (`env[sym] === value`); an already-bound slot weak-merges (sound smear).
   * Adoption is what makes bindings alias rather than snapshot: passing a live place (env slot / live field) shares it, so a later
   * write through any alias is visible through every other. Callers that must NOT
   * alias pass a fresh clone/collapse (reads already return snapshots).
   */
  bindSymbol(sym, value) {
    const existing = this.env.get(sym);
    if (existing === void 0) {
      this.env.set(sym, value);
      this.changed = true;
      return;
    }
    if (existing !== value && mergeInto(existing, value)) this.changed = true;
  }
  envSlot(sym) {
    let slot = this.env.get(sym);
    if (slot === void 0) {
      slot = emptyValue();
      this.env.set(sym, slot);
    }
    return slot;
  }
  summaryOf(id) {
    let slot = this.summaries.get(id);
    if (slot === void 0) {
      slot = emptyValue();
      this.summaries.set(id, slot);
    }
    return slot;
  }
  /** The shared abstract instance of a class node, created empty on demand (persistent). */
  instanceOf(cls) {
    let inst = this.classInstances.get(cls);
    if (inst === void 0) {
      inst = emptyValue();
      this.classInstances.set(cls, inst);
    }
    return inst;
  }
  /**
   * The shared abstract result of a join call, created empty on demand (persistent).
   *
   * THE CANONICAL-HEAP INVARIANT: every value that models runtime storage — anything that
   * can be aliased, written through, or referenced from a `mayAlias` set — is keyed by a
   * static program point and lives across fixpoint passes; per-pass temporaries are
   * snapshots only. handleJoin used to mint a FRESH result value each pass, so
   * `Promise.all([Promise.all([…])])` added a never-before-seen object to the outer
   * element's `mayAlias` set every pass. That set dedups by IDENTITY (domain.ts), so
   * `changed` stayed true forever and the fixpoint hit ITERATION_CAP. Keying the result by
   * the call node makes the identity stable, so the union saturates.
   */
  joinResultOf(call) {
    let result = this.joinResults.get(call);
    if (result === void 0) {
      result = emptyValue();
      this.joinResults.set(call, result);
    }
    return result;
  }
  /**
   * The shared abstract place of a conditional expression, created empty on demand
   * (persistent). Same canonical-heap invariant as {@link joinResultOf}: a per-pass
   * wrapper for `flag ? box1 : box2` diverged the fixpoint as soon as it became a
   * `mayAlias` target — which a SYNTACTICALLY NESTED ternary place
   * (`f2 ? (f ? box1 : box2) : box3`) does on every pass.
   */
  condPlaceOf(node) {
    let place = this.condPlaces.get(node);
    if (place === void 0) {
      place = emptyValue();
      this.condPlaces.set(node, place);
    }
    return place;
  }
  /**
   * The allocation-site place of a container literal (`{…}` / `[…]`): the value its first
   * evaluation produced, kept across passes and weak-merged with every re-evaluation
   * (persistent). Same canonical-heap invariant as {@link joinResultOf}: a literal IS runtime
   * storage — a callee writes through it (`fill([], v)`, `tag({ name }, t)` with
   * `box.note = t`), a binding adopts it, a spread shares its fields — so a value recreated
   * every pass can never settle once something persistent merges INTO it. The
   * parameter write-back targeted the per-pass fresh literal, reported a change on every pass
   * (the note it had just added was gone again), and the fixpoint hit ITERATION_CAP with no
   * state growing at all. Any `f({ … })` whose callee mutates its parameter was affected.
   *
   * Adopting the first evaluation (rather than minting an empty slot) keeps the literal's
   * aliasing: a field that stores a live place (`{ box }`, `[obj]`) keeps pointing at that
   * slot, and later passes merge the same slot into itself — an identity no-op. Snapshot
   * fields accumulate monotonically, exactly as an env slot bound to the literal always did.
   */
  literalPlaceOf(node, fresh) {
    const place = this.literalPlaces.get(node);
    if (place === void 0) {
      this.literalPlaces.set(node, fresh);
      return fresh;
    }
    if (mergeInto(place, fresh)) this.changed = true;
    return place;
  }
  mergeReturn(value) {
    if (mergeInto(this.returnVal, value)) this.changed = true;
  }
  /** Join a thrown operand into the script-global thrown-value set. */
  mergeThrown(value) {
    if (mergeInto(this.thrownVal, value)) this.changed = true;
  }
  /**
   * Weak-merge into a keyed sink accumulator. Generic in the key so the oracle
   * accumulators ({@link awaitVal} / {@link guardVal}), which are keyed by source offset
   * rather than site id, share the one monotone update path every other sink uses.
   */
  mergeSink(map, id, value) {
    let slot = map.get(id);
    if (slot === void 0) {
      slot = emptyValue();
      map.set(id, slot);
    }
    if (mergeInto(slot, value)) this.changed = true;
  }
  mergeJoinIn(id, port, value) {
    let ports = this.joinInByPort.get(id);
    if (ports === void 0) {
      ports = /* @__PURE__ */ new Map();
      this.joinInByPort.set(id, ports);
    }
    let slot = ports.get(port);
    if (slot === void 0) {
      slot = emptyValue();
      ports.set(port, slot);
    }
    if (mergeInto(slot, value)) this.changed = true;
  }
  addParamActual(id, param, value) {
    const key = `${id}:${param}`;
    let slot = this.paramActuals.get(key);
    if (slot === void 0) {
      slot = emptyValue();
      this.paramActuals.set(key, slot);
    }
    if (mergeInto(slot, value)) this.changed = true;
  }
  /** Record a value that may reach an invocation of the placeholder-parameter `key`. */
  recordPhCall(key, value) {
    let slot = this.phCallActuals.get(key);
    if (slot === void 0) {
      slot = emptyValue();
      this.phCallActuals.set(key, slot);
    }
    if (mergeInto(slot, value)) this.changed = true;
  }
  /** The taint fed to invocations of a function's parameter `param`, if any. */
  phCallActualsOf(id, param) {
    return this.phCallActuals.get(`${id}:${param}`);
  }
  /** The persistent accumulator taint for a `reduce` candidate (empty until seeded). */
  reduceAccOf(order) {
    let slot = this.reduceAcc.get(order);
    if (slot === void 0) {
      slot = emptyValue();
      this.reduceAcc.set(order, slot);
    }
    return slot;
  }
  /** Merge a pass's callback-return taint into a `reduce` candidate's accumulator. */
  mergeReduceAcc(order, value) {
    if (mergeInto(this.reduceAccOf(order), value)) this.changed = true;
  }
  /**
   * Record a call against EVERY enclosing region, mirroring {@link markFacade}.
   * Recording only the innermost region left a caller function `fn@f`
   * unmarked when its call to `g` happened inside an iteration candidate's callback
   * (region `cand@N`). Reachability then never propagated `fn@f`, so a sibling
   * candidate whose callback calls `f` failed to promote to a fan-out — an
   * under-approximation (a dropped may-flow), which this analysis must never do.
   */
  markCalled(regionStack, id) {
    for (const region of regionStack) {
      let called = this.calledFns.get(region);
      if (called === void 0) {
        called = /* @__PURE__ */ new Set();
        this.calledFns.set(region, called);
      }
      if (!called.has(id)) {
        called.add(id);
        this.changed = true;
      }
    }
  }
  /** Record that `fn` was applied at `site` (see {@link applications}). Not a fixpoint
   * signal: applications feed no transfer rule, and the final pass re-records them all. */
  recordApplication(site, fn, via) {
    let applied = this.applications.get(site);
    if (applied === void 0) {
      applied = /* @__PURE__ */ new Map();
      this.applications.set(site, applied);
    }
    if (applied.get(fn) !== "callee") applied.set(fn, via);
  }
  /** Mark every enclosing region as reaching a facade site. */
  markFacade(regionStack) {
    for (const region of regionStack) {
      if (!this.reachSet.has(region)) {
        this.reachSet.add(region);
        this.changed = true;
      }
    }
  }
  /** Propagate reachability across the call graph until it stops growing. */
  propagateReachability() {
    let grew = true;
    while (grew) {
      grew = false;
      for (const [region, fns] of this.calledFns) {
        if (this.reachSet.has(region)) continue;
        for (const id of fns) {
          if (this.reachSet.has(`fn@${id}`)) {
            this.reachSet.add(region);
            this.changed = true;
            grew = true;
            break;
          }
        }
      }
    }
  }
  /** Promote iteration candidates whose body region reaches a facade site. */
  recomputePromotion() {
    for (const cand of this.table.iterations) {
      if (this.promotedOrders.has(cand.order)) continue;
      if (this.reachSet.has(`cand@${cand.order}`)) {
        this.promotedOrders.add(cand.order);
        this.changed = true;
      }
    }
  }
  // -- emission ------------------------------------------------------------
  emitFacts() {
    const askData = /* @__PURE__ */ new Map();
    const askActor = /* @__PURE__ */ new Map();
    const worldReadData = /* @__PURE__ */ new Map();
    const joinIn = /* @__PURE__ */ new Map();
    const fanoutIn = /* @__PURE__ */ new Map();
    for (const [id, value] of this.askInstr) askData.set(id, this.resolveArtifact(value));
    for (const [id, value] of this.askRecv) askActor.set(id, this.resolveActor(value));
    for (const [id, value] of this.worldRead) worldReadData.set(id, this.resolveArtifact(value));
    for (const [id, ports] of this.joinInByPort) {
      const occs = [];
      for (const [port, value] of ports) {
        for (const occ of this.resolveArtifact(value)) {
          occs.push({ exact: occ.exact, site: occ.site, ...port >= 0 ? { port } : {} });
        }
      }
      joinIn.set(id, occs);
    }
    for (const [id, value] of this.fanoutInVal) fanoutIn.set(id, this.resolveArtifact(value));
    const promoted = this.table.iterations.filter((cand) => this.promotedOrders.has(cand.order)).sort((a, b) => a.order - b.order).map((cand) => ({ id: provisionalFanoutId(cand.order), label: "fan-out", loc: cand.loc, order: cand.order }));
    return {
      askActor,
      askData,
      fanoutIn,
      joinIn,
      promoted,
      returnData: this.resolveArtifact(this.returnVal),
      worldReadData
    };
  }
  /**
   * The ordering walk's oracle view, resolved directly off the CONVERGED interpreter
   * state — the fused pass's replacement for the `awaitSettles`/`guardReads` members
   * TaintFacts used to carry.
   * Same keying (`node.getStart(scriptFile)` of the awaited/guard expression) and the
   * SAME resolution pipeline as every artifact sink (placeholders expanded, collapsed,
   * actor labels filtered) — so an awaited parameter still resolves to the union of the
   * promises its callers passed in, across all call sites. That union is normative: the
   * temporal walk must see today's context-INsensitive values bit-for-bit; caller-context
   * precision is explicitly out of scope.
   *
   * Only meaningful after the fixpoint has converged; interpret.ts is the one caller.
   */
  emitOracle() {
    const awaitSettles = /* @__PURE__ */ new Map();
    for (const [pos, value] of this.awaitVal) awaitSettles.set(pos, this.resolveArtifact(value));
    const guardReads = /* @__PURE__ */ new Map();
    for (const [pos, value] of this.guardVal) guardReads.set(pos, this.resolveArtifact(value));
    return { applications: this.applications, awaitSettles, guardReads };
  }
  resolveArtifact(value) {
    return this.resolveOccs(value).filter((occ) => !isActorSite(occ.site));
  }
  resolveActor(value) {
    return this.resolveOccs(value).filter((occ) => isActorSite(occ.site));
  }
  resolveOccs(value) {
    return [...collapse(this.resolvePlaceholders(value, /* @__PURE__ */ new Set())).occs.values()];
  }
  /** Expand parameter placeholders to the union of actual arguments across all calls. */
  resolvePlaceholders(value, visiting, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(value)) return emptyValue();
    seen.add(value);
    const out = emptyValue();
    for (const occ of value.occs.values()) addOcc(out, occ);
    for (const ph of value.phs.values()) this.resolvePlaceholder(out, ph, visiting);
    for (const [key, field] of value.fields) out.fields.set(key, this.resolvePlaceholders(field, visiting, seen));
    for (const el of value.bound ?? []) mergeInto(out, this.resolvePlaceholders(el, visiting, seen));
    return out;
  }
  resolvePlaceholder(out, ph, visiting) {
    if (ph.rest === true) {
      for (const [key2, actual2] of this.paramActuals) {
        const sep = key2.indexOf(":");
        if (Number(key2.slice(0, sep)) !== ph.fnId || Number(key2.slice(sep + 1)) < ph.param) continue;
        if (visiting.has(key2)) continue;
        visiting.add(key2);
        mergeInto(out, this.resolvePlaceholders(actual2, visiting));
        visiting.delete(key2);
      }
      return;
    }
    const key = phKey(ph);
    if (visiting.has(key)) return;
    const actual = this.paramActuals.get(key);
    if (actual === void 0) return;
    visiting.add(key);
    mergeInto(out, this.resolvePlaceholders(actual, visiting));
    visiting.delete(key);
  }
  bindPlaceholderParams(fn, id) {
    const params = fn.parameters;
    (this.fnParamSymbols.get(id) ?? []).forEach((sym, param) => {
      if (sym === void 0) return;
      const val = emptyValue();
      const rest = params[param]?.dotDotDotToken !== void 0;
      addPlaceholder(val, { fnId: id, param, ...rest ? { rest: true } : {} });
      this.bindSymbol(sym, val);
    });
  }
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/taint.ts
var ITERATION_CAP = 100;
var Evaluator = class {
  s;
  checker;
  constructor(workflow, table) {
    this.s = new TaintState(workflow, table);
    this.checker = this.s.checker;
  }
  converge() {
    let iterations = 0;
    do {
      this.s.changed = false;
      iterations += 1;
      if (iterations > ITERATION_CAP) {
        throw new Error(`taint analysis failed to converge after ${ITERATION_CAP} iterations`);
      }
      this.iterate();
      this.s.propagateReachability();
      this.s.recomputePromotion();
    } while (this.s.changed);
  }
  iterate() {
    for (const fn of this.s.functions) {
      if (ts24.isFunctionDeclaration(fn) && fn.name !== void 0) {
        const sym = this.checker.getSymbolAtLocation(fn.name);
        if (sym !== void 0) {
          const val = emptyValue();
          val.fns.add(fn);
          this.s.bindSymbol(sym, val);
        }
      }
    }
    const topCtx = {
      onReturn: (value) => this.s.mergeReturn(collapse(value)),
      regionStack: ["top"]
    };
    for (const stmt of this.s.body.statements) this.visit(stmt, topCtx);
    evalClasses(this);
    for (const fn of this.s.functions) this.evalFunction(fn);
  }
  evalFunction(fn) {
    const id = this.s.fnId.get(fn);
    if (id === void 0) return;
    this.s.bindPlaceholderParams(fn, id);
    const ctx = {
      onReturn: (value) => {
        if (mergeInto(this.s.summaryOf(id), value)) this.s.changed = true;
      },
      regionStack: [`fn@${id}`]
    };
    fn.parameters.forEach((param, index) => {
      if (ts24.isIdentifier(param.name)) return;
      const val = emptyValue();
      const rest = param.dotDotDotToken !== void 0;
      addPlaceholder(val, { fnId: id, param: index, ...rest ? { rest: true } : {} });
      this.bindPattern(param.name, val, ctx);
    });
    for (const param of fn.parameters) {
      if (param.initializer === void 0) continue;
      this.bindPattern(param.name, this.evalExpr(param.initializer, ctx), ctx);
    }
    const bodyNode = fn.body;
    if (bodyNode === void 0) return;
    if (ts24.isBlock(bodyNode)) {
      for (const stmt of bodyNode.statements) this.visit(stmt, ctx);
    } else {
      ctx.onReturn(this.evalExpr(bodyNode, ctx));
    }
  }
  /**
   * Record a guard expression's value as the control-dependence oracle, keyed by the
   * guard node's START OFFSET — the same node `traceOrder` hands to `controllersOf`, so a
   * parenthesized guard is keyed by its ParenthesizedExpression. This is a SINK, not a
   * flow: the value is recorded and not joined into anything, because a condition does not
   * join the data contract (see the ConditionalExpression case in evalExpr). Consumed only
   * by the causality graph.
   */
  recordGuard(node, value) {
    this.s.mergeSink(this.s.guardVal, node.getStart(this.s.scriptFile), value);
  }
  // -- statement visitor ---------------------------------------------------
  visit(node, ctx) {
    if (ts24.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) this.handleDeclaration(decl, ctx);
    } else if (ts24.isExpressionStatement(node)) {
      this.evalExpr(node.expression, ctx);
    } else if (ts24.isReturnStatement(node)) {
      ctx.onReturn(node.expression === void 0 ? emptyValue() : this.evalExpr(node.expression, ctx));
    } else if (ts24.isForOfStatement(node)) {
      handleForOf(this, node, ctx);
    } else if (ts24.isIfStatement(node)) {
      this.recordGuard(node.expression, this.evalExpr(node.expression, ctx));
      this.visit(node.thenStatement, ctx);
      if (node.elseStatement !== void 0) this.visit(node.elseStatement, ctx);
    } else if (ts24.isBlock(node)) {
      for (const stmt of node.statements) this.visit(stmt, ctx);
    } else if (ts24.isForStatement(node)) {
      visitForStatement(this, node, ctx);
    } else if (ts24.isForInStatement(node)) {
      handleForIn(this, node, ctx);
    } else if (ts24.isWhileStatement(node)) {
      this.recordGuard(node.expression, this.evalExpr(node.expression, ctx));
      this.visit(node.statement, ctx);
    } else if (ts24.isDoStatement(node)) {
      this.evalExpr(node.expression, ctx);
      this.visit(node.statement, ctx);
    } else if (ts24.isSwitchStatement(node)) {
      this.recordGuard(node.expression, this.evalExpr(node.expression, ctx));
      for (const clause of node.caseBlock.clauses) {
        if (ts24.isCaseClause(clause)) this.evalExpr(clause.expression, ctx);
        for (const stmt of clause.statements) this.visit(stmt, ctx);
      }
    } else if (ts24.isTryStatement(node)) {
      this.visit(node.tryBlock, ctx);
      if (node.catchClause !== void 0) {
        const vd = node.catchClause.variableDeclaration;
        if (vd !== void 0) this.bindPattern(vd.name, cloneValue(this.s.thrownVal), ctx);
        this.visit(node.catchClause.block, ctx);
      }
      if (node.finallyBlock !== void 0) this.visit(node.finallyBlock, ctx);
    } else if (ts24.isThrowStatement(node)) {
      this.s.mergeThrown(collapse(this.evalExpr(node.expression, ctx)));
    } else if (ts24.isLabeledStatement(node)) {
      this.visit(node.statement, ctx);
    }
  }
  handleDeclaration(decl, ctx) {
    if (decl.initializer === void 0) return;
    const place = this.resolvePlace(decl.initializer);
    if (ts24.isIdentifier(decl.name)) {
      if (place !== void 0) {
        const sym = this.checker.getSymbolAtLocation(decl.name);
        if (sym !== void 0) {
          this.evalExpr(decl.initializer, ctx);
          this.s.bindSymbol(sym, place);
          return;
        }
      }
      this.bindPattern(decl.name, this.evalExpr(decl.initializer, ctx), ctx);
      return;
    }
    if (place !== void 0) {
      this.evalExpr(decl.initializer, ctx);
      this.bindPattern(decl.name, place, ctx, place);
      return;
    }
    this.bindPattern(decl.name, this.evalExpr(decl.initializer, ctx), ctx);
  }
  /**
   * The LIVE (shared, unclonable) abstract value a *place expression* denotes, or
   * undefined for non-places (calls, literals, computed access, operators). A place is
   * an identifier (its env slot) or a chain of static property / literal-index element
   * accesses rooted at a place. Value-preserving wrappers (parens / `as` / `satisfies` /
   * non-null / type assertion) are peeled at every level. This is the single primitive
   * behind aliasing: bindings, container-literal fields, write receivers and param
   * write-back all resolve places through it. Reads must NOT call this (they clone).
   *
   * `create` governs missing field slots. WRITE receivers create empty fields on demand
   * (`arr[0].f = t` materializes `arr[0]`). Read-side callers (aliasing binds,
   * container-literal embedding, write-back actuals) pass `create=false`: an absent field
   * returns undefined so the caller falls back to value semantics (readField's collapse),
   * which correctly surfaces the container's own occurrences. Fabricating an empty field
   * there would alias to a phantom and DROP the opaque container's taint (e.g. reading
   * `review.feedback` off an opaque ask result must yield collapse(review), not ∅).
   */
  resolvePlace(expr, create = false) {
    const e = peelPlace(expr);
    if (ts24.isAwaitExpression(e)) {
      const inner = this.resolvePlace(e.expression, create);
      if (inner === void 0) return void 0;
      const thenField = inner.fields.get("then");
      return thenField !== void 0 && thenField.fns.size > 0 ? void 0 : inner;
    }
    if (e.kind === ts24.SyntaxKind.ThisKeyword) {
      return enclosingClassInstance(this, e);
    }
    if (e.kind === ts24.SyntaxKind.SuperKeyword) {
      return enclosingBaseInstance(this, e);
    }
    if (ts24.isIdentifier(e)) {
      const sym = this.checker.getSymbolAtLocation(e);
      if (sym === void 0) return void 0;
      const cls = classNodeOfSymbol(this, sym);
      if (cls !== void 0) return this.s.instanceOf(cls);
      return this.s.envSlot(sym);
    }
    if (ts24.isPropertyAccessExpression(e)) {
      const base = this.resolvePlace(e.expression, create);
      return base === void 0 ? void 0 : this.placeField(base, e.name.text, create);
    }
    if (ts24.isElementAccessExpression(e)) {
      const key = staticIndexKey(e.argumentExpression);
      if (key === void 0) return void 0;
      const base = this.resolvePlace(e.expression, create);
      return base === void 0 ? void 0 : this.placeField(base, key, create);
    }
    if (ts24.isConditionalExpression(e)) {
      const whenTrue = this.resolvePlace(e.whenTrue, create);
      const whenFalse = this.resolvePlace(e.whenFalse, create);
      if (whenTrue === void 0 || whenFalse === void 0) return void 0;
      const out = this.s.condPlaceOf(e);
      const targets = out.mayAlias ??= /* @__PURE__ */ new Set();
      for (const arm of [whenTrue, whenFalse]) {
        if (!targets.has(arm)) {
          targets.add(arm);
          this.s.changed = true;
        }
        if (mergeInto(out, arm)) this.s.changed = true;
      }
      return out;
    }
    if (ts24.isCallExpression(e)) {
      return this.s.joinResults.get(e);
    }
    return void 0;
  }
  placeField(container, key, create) {
    const field = container.fields.get(key);
    if (field !== void 0) return field;
    return create ? liveField(container, key) : void 0;
  }
  /**
   * The parameter write-back target for an actual argument `arg` whose evaluated value is
   * `value`. A place actual resolves to its live slot (write-back aliases through it, as
   * before). An object/array LITERAL's evaluated value IS its allocation-site place
   * (state.literalPlaceOf), and its FIELDS hold live places (`poke({ box })` — the literal's
   * `box` field IS the box slot), so that value is the write-back target: `mergeHeapEffects`
   * descends into it and a field the callee wrote through `p.box` lands on the shared `box`
   * slot, while a field written on the literal itself (`tag({ name }, t)` → `box.note = t`)
   * persists on the place and reaches whoever the callee hands the object to.
   * A literal argument once skipped write-back entirely, so mutations through its live
   * sub-objects were invisible to the caller; and when the literal was a per-pass fresh
   * value, that write-back re-reported a change on every pass and the fixpoint never
   * settled.
   */
  argWriteBackPlace(arg, value) {
    const place = this.resolvePlace(arg);
    if (place !== void 0) return place;
    const peeled = peelPlace(arg);
    return ts24.isObjectLiteralExpression(peeled) || ts24.isArrayLiteralExpression(peeled) ? value : void 0;
  }
  /**
   * Bind a destructuring pattern (or a single name). See {@link bindPattern} in patterns.ts;
   * exposed as a thin method because the aliasing-bind machinery is used across modules.
   */
  bindPattern(name, value, ctx, sourcePlace) {
    bindPattern(this, name, value, ctx, sourcePlace);
  }
  /** The live field at `key` of a place, for destructuring aliasing (see patterns.ts). */
  extractField(container, key) {
    return extractField(this, container, key);
  }
  /** Read a statically-known field with smear-on-read, else collapse (see patterns.ts). */
  selectField(value, key) {
    return selectField(value, key);
  }
  // -- expression evaluator ------------------------------------------------
  evalExpr(node, ctx) {
    switch (node.kind) {
      case ts24.SyntaxKind.Identifier:
        return this.evalIdentifier(node);
      case ts24.SyntaxKind.ParenthesizedExpression:
        return this.evalExpr(node.expression, ctx);
      case ts24.SyntaxKind.AwaitExpression:
        return evalAwait(this, node, ctx);
      case ts24.SyntaxKind.AsExpression:
      case ts24.SyntaxKind.SatisfiesExpression:
        return this.evalExpr(node.expression, ctx);
      case ts24.SyntaxKind.NonNullExpression:
        return this.evalExpr(node.expression, ctx);
      case ts24.SyntaxKind.TypeAssertionExpression:
        return this.evalExpr(node.expression, ctx);
      case ts24.SyntaxKind.FunctionExpression:
      case ts24.SyntaxKind.ArrowFunction: {
        const out = emptyValue();
        out.fns.add(node);
        return out;
      }
      case ts24.SyntaxKind.ThisKeyword: {
        const instance = enclosingClassInstance(this, node);
        return instance === void 0 ? emptyValue() : cloneValue(instance);
      }
      case ts24.SyntaxKind.SuperKeyword: {
        const base = enclosingBaseInstance(this, node);
        return base === void 0 ? emptyValue() : cloneValue(base);
      }
      default:
        break;
    }
    if (ts24.isCallExpression(node)) return evalCall(this, node, ctx);
    if (ts24.isPropertyAccessExpression(node)) return this.evalPropertyAccess(node, ctx);
    if (ts24.isElementAccessExpression(node)) return this.evalElementAccess(node, ctx);
    if (ts24.isBinaryExpression(node)) return this.evalBinary(node, ctx);
    if (ts24.isTemplateExpression(node)) {
      const out = emptyValue();
      for (const span of node.templateSpans) collapseInto(out, this.evalExpr(span.expression, ctx));
      return out;
    }
    if (ts24.isTaggedTemplateExpression(node)) {
      const argVals = [emptyValue()];
      if (ts24.isTemplateExpression(node.template)) {
        for (const span of node.template.templateSpans) argVals.push(this.evalExpr(span.expression, ctx));
      }
      return applyCall(this, node.tag, argVals, ctx, void 0, void 0, node);
    }
    if (ts24.isYieldExpression(node)) {
      if (node.expression !== void 0) ctx.onReturn(this.evalExpr(node.expression, ctx));
      return emptyValue();
    }
    if (ts24.isConditionalExpression(node)) {
      this.recordGuard(node.condition, this.evalExpr(node.condition, ctx));
      return unionValues(this.evalExpr(node.whenTrue, ctx), this.evalExpr(node.whenFalse, ctx));
    }
    if (ts24.isPrefixUnaryExpression(node) || ts24.isPostfixUnaryExpression(node)) {
      return collapse(this.evalExpr(node.operand, ctx));
    }
    if (ts24.isTypeOfExpression(node)) return collapse(this.evalExpr(node.expression, ctx));
    if (ts24.isVoidExpression(node) || ts24.isDeleteExpression(node)) {
      this.evalExpr(node.expression, ctx);
      return emptyValue();
    }
    if (ts24.isArrayLiteralExpression(node)) return this.s.literalPlaceOf(node, evalArrayLiteral(this, node, ctx));
    if (ts24.isObjectLiteralExpression(node)) return this.s.literalPlaceOf(node, evalObjectLiteral(this, node, ctx));
    if (ts24.isNewExpression(node)) {
      const cls = resolveClassNode(this, node.expression);
      if (cls !== void 0) {
        const ctor = classConstructor(this, cls);
        const ctorId = ctor === void 0 ? void 0 : this.s.fnId.get(ctor);
        const args = node.arguments ?? [];
        const argVals = args.map((arg) => this.evalExpr(arg, ctx));
        if (ctorId !== void 0) {
          const argPlaces = args.map((arg, i) => this.argWriteBackPlace(arg, argVals[i]));
          applyConstructor(this, ctorId, ctx, argVals, argPlaces, node);
        } else if (hasUnresolvedHeritage(this, cls)) {
          applyMixinConstructor(this, ctx, this.s.instanceOf(cls), argVals);
        }
        return this.s.instanceOf(cls);
      }
      return handleNewUnknown(this, node, ctx);
    }
    if (ts24.isSpreadElement(node)) return collapse(this.evalExpr(node.expression, ctx));
    return emptyValue();
  }
  evalIdentifier(node) {
    const sym = this.checker.getSymbolAtLocation(node);
    if (sym === void 0) return this.argumentsValue(node) ?? emptyValue();
    const cls = classNodeOfSymbol(this, sym);
    if (cls !== void 0) return cloneValue(this.s.instanceOf(cls));
    const slot = this.s.env.get(sym);
    if (slot !== void 0) return cloneValue(slot);
    return this.argumentsValue(node) ?? emptyValue();
  }
  /**
   * The implicit `arguments` object as a rest-like placeholder gathering every actual of
   * the nearest enclosing NON-arrow function (param index 0, rest). `arguments[i]` then
   * reads a field of it → collapse keeps the placeholder → emission expands it to all
   * recorded actuals (a sound over-approximation: `arguments[0]` yields the whole list).
   * Arrow functions have no own `arguments`, so the ancestor walk skips them and binds the
   * enclosing function's — matching JS's lexical `arguments`. Previously `arguments`
   * resolved to the lib symbol with no env slot, so `arguments[0]` dropped every
   * actual's taint.
   */
  argumentsValue(node) {
    if (node.text !== "arguments") return void 0;
    const fn = ts24.findAncestor(node, (a) => isNonArrowFunctionLike(a));
    const id = fn === void 0 ? void 0 : this.s.fnId.get(fn);
    if (id === void 0) return void 0;
    const val = emptyValue();
    addPlaceholder(val, { fnId: id, param: 0, rest: true });
    return val;
  }
  evalBinary(node, ctx) {
    const op = node.operatorToken.kind;
    if (op === ts24.SyntaxKind.EqualsToken) return handleAssignment(this, node, ctx);
    if (COMPOUND_ASSIGNMENT_OPS.has(op)) return handleCompoundAssignment(this, node, ctx);
    if (op === ts24.SyntaxKind.CommaToken) {
      this.evalExpr(node.left, ctx);
      return this.evalExpr(node.right, ctx);
    }
    if (op === ts24.SyntaxKind.AmpersandAmpersandToken || op === ts24.SyntaxKind.BarBarToken || op === ts24.SyntaxKind.QuestionQuestionToken) {
      const left = this.evalExpr(node.left, ctx);
      this.recordGuard(node.left, left);
      return unionValues(left, this.evalExpr(node.right, ctx));
    }
    return unionValues(collapse(this.evalExpr(node.left, ctx)), collapse(this.evalExpr(node.right, ctx)));
  }
  evalPropertyAccess(node, ctx) {
    const receiver = this.evalExpr(node.expression, ctx);
    return readField(receiver, node.name.text);
  }
  evalElementAccess(node, ctx) {
    const receiver = this.evalExpr(node.expression, ctx);
    const literalKey = staticIndexKey(node.argumentExpression);
    if (literalKey !== void 0) return readField(receiver, literalKey);
    this.evalExpr(node.argumentExpression, ctx);
    return clearExact(collapse(receiver));
  }
  receiverSymbol(expr) {
    return ts24.isIdentifier(expr) ? this.checker.getSymbolAtLocation(expr) : void 0;
  }
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/constants.ts
var STRUCTURAL_REGION_KINDS = /* @__PURE__ */ new Set([
  "choice",
  "call",
  "try",
  "attempt",
  "catch",
  "finally"
]);
function isStructuralRegionKind(kind) {
  return STRUCTURAL_REGION_KINDS.has(kind);
}
var UNPHASED_ID = "unphased";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-functions.ts
import ts25 from "typescript";
function boundIdentifiers(name) {
  if (ts25.isIdentifier(name)) return [name];
  const out = [];
  for (const element of name.elements) {
    if (ts25.isOmittedExpression(element)) continue;
    out.push(...boundIdentifiers(element.name));
  }
  return out;
}
function asScriptFunction(node, scriptFile) {
  if (!isFunctionLike(node)) return void 0;
  if (node.getSourceFile() !== scriptFile) return void 0;
  const body = node.body;
  return body === void 0 ? void 0 : node;
}
function enclosingFunctions(node) {
  const scriptFile = node.getSourceFile();
  const out = [];
  for (let current = node.parent; current !== void 0; current = current.parent) {
    const fn = asScriptFunction(current, scriptFile);
    if (fn !== void 0) out.push(fn);
  }
  return out;
}
function functionName(decl) {
  if (ts25.isConstructorDeclaration(decl)) {
    const cls = decl.parent;
    return ts25.isClassLike(cls) && cls.name !== void 0 ? cls.name.text : void 0;
  }
  const named = decl;
  if (named.name !== void 0 && ts25.isIdentifier(named.name)) return named.name.text;
  const parent = decl.parent;
  if (parent !== void 0 && ts25.isVariableDeclaration(parent) && ts25.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return void 0;
}
function resolveCallDeclaration(call, checker, scriptFile) {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === void 0) return void 0;
  return asScriptFunction(declaration, scriptFile);
}
function collectRecursiveFunctions(scriptFile, checker, applications) {
  const functions = [];
  const collect = (node) => {
    const fn = asScriptFunction(node, scriptFile);
    if (fn !== void 0) functions.push(fn);
    ts25.forEachChild(node, collect);
  };
  collect(scriptFile);
  const callees = /* @__PURE__ */ new Map();
  for (const fn of functions) {
    const set = /* @__PURE__ */ new Set();
    const scan = (node) => {
      if (ts25.isCallExpression(node)) {
        const target = resolveCallDeclaration(node, checker, scriptFile);
        if (target !== void 0) set.add(target);
      }
      if (ts25.isCallExpression(node) || ts25.isNewExpression(node) || ts25.isTaggedTemplateExpression(node)) {
        for (const applied of applications.get(node)?.keys() ?? []) {
          const target = asScriptFunction(applied, scriptFile);
          if (target !== void 0) set.add(target);
        }
      }
      ts25.forEachChild(node, scan);
    };
    scan(fn.body);
    callees.set(fn, set);
  }
  const recursive = /* @__PURE__ */ new Set();
  for (const fn of functions) {
    const seen = /* @__PURE__ */ new Set();
    const stack = [...callees.get(fn) ?? []];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === fn) {
        recursive.add(fn);
        break;
      }
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...callees.get(next) ?? []);
    }
  }
  return recursive;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-state.ts
import ts27 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-strands.ts
import ts26 from "typescript";
function currentFrame(state) {
  return state.frames[state.frames.length - 1];
}
function isVisiblySettled(state, step) {
  return state.frames.some((frame) => frame.settled.has(step));
}
function innermostOpenStrand(state) {
  for (let i = state.strands.length - 1; i >= 0; i -= 1) {
    const record = state.strands[i];
    if (!record.closed) return record;
  }
  return void 0;
}
function openStrand(state, region) {
  const record = {
    at: state.strands.length,
    closed: false,
    issued: /* @__PURE__ */ new Set(),
    region,
    summary: /* @__PURE__ */ new Set()
  };
  state.strands.push(record);
  state.frames.push({ region, settled: /* @__PURE__ */ new Set() });
  return record;
}
function closeStrand(state, record) {
  const frame = state.frames.pop();
  record.summary = frame?.settled ?? /* @__PURE__ */ new Set();
  record.closed = true;
}
function strandMark(state) {
  return state.strands.length;
}
function strandsSince(state, mark) {
  return state.strands.filter((record) => record.at >= mark).map((record) => record.region);
}
function bindStrands(state, name, regions) {
  if (regions.length === 0) return;
  for (const identifier of boundIdentifiers(name)) {
    const symbol = state.checker.getSymbolAtLocation(identifier);
    if (symbol === void 0) continue;
    const set = state.strandsBySymbol.get(symbol) ?? /* @__PURE__ */ new Set();
    for (const region of regions) set.add(region);
    state.strandsBySymbol.set(symbol, set);
  }
}
function isAsyncFunction(decl) {
  const { modifiers } = decl;
  return modifiers?.some((modifier) => modifier.kind === ts26.SyntaxKind.AsyncKeyword) ?? false;
}
var COMBINATORS = /* @__PURE__ */ new Set(["all", "allSettled", "race", "any"]);
function isPromiseCombinator(state, node) {
  const callee = node.expression;
  if (!ts26.isPropertyAccessExpression(callee) || !COMBINATORS.has(callee.name.text)) return false;
  return isGlobalLibValue(callee.expression, "Promise", state.checker, state.program);
}
function awaitedIdentifiers(state, operand) {
  const out = [];
  const scan = (node) => {
    if (ts26.isParenthesizedExpression(node) || ts26.isAsExpression(node) || ts26.isSatisfiesExpression(node) || ts26.isNonNullExpression(node) || ts26.isSpreadElement(node)) {
      scan(node.expression);
      return;
    }
    if (ts26.isIdentifier(node)) {
      out.push(node);
      return;
    }
    if (ts26.isArrayLiteralExpression(node)) {
      for (const element of node.elements) scan(element);
      return;
    }
    if (ts26.isCallExpression(node) && isPromiseCombinator(state, node)) {
      for (const argument of node.arguments) scan(argument);
    }
  };
  scan(operand);
  return out;
}
function joinStrands(state, certain, maybe, awaited) {
  const joins = { certain: [], maybe: [] };
  const take = (region, side) => {
    if (state.joined.has(region)) return;
    state.joined.add(region);
    side.push(region);
  };
  if (awaited !== void 0) {
    for (const region of strandsSince(state, awaited.mark)) take(region, joins.certain);
    for (const identifier of awaitedIdentifiers(state, awaited.operand)) {
      const symbol = state.checker.getSymbolAtLocation(identifier);
      const bound = symbol === void 0 ? void 0 : state.strandsBySymbol.get(symbol);
      for (const region of bound ?? []) take(region, joins.certain);
    }
  }
  for (const record of state.strands) {
    if (!record.closed || state.joined.has(record.region)) continue;
    if (certain.some((step) => record.issued.has(step))) take(record.region, joins.certain);
    else if (maybe.some((step) => record.issued.has(step))) take(record.region, joins.maybe);
  }
  return joins;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-state.ts
function applicationsAt(state, node, via) {
  const out = [];
  for (const [fn, how] of state.oracle.applications.get(node) ?? []) {
    if (how !== via) continue;
    const decl = asScriptFunction(fn, state.scriptFile);
    if (decl !== void 0) out.push(decl);
  }
  return out;
}
function openRegion(state, kind, parent, extra) {
  const next = (state.counters.get(kind) ?? 0) + 1;
  state.counters.set(kind, next);
  const id = `${kind}#${next}`;
  state.regions.push({ id, kind, ...parent === void 0 ? {} : { parent }, ...extra });
  return id;
}
function createTraceState(workflow, table, oracle, walk) {
  const { program, scriptFile, toScriptLoc } = workflow;
  const checker = program.getTypeChecker();
  const body = findWorkflowBody(scriptFile);
  const askByCall = new Map(table.asks.map((site) => [site.call, site.id]));
  const readByCall = new Map(table.worldReads.map((site) => [site.call, site.id]));
  const actorByCall = new Map(table.actors.map((site) => [site.call, site.id]));
  const candByCall = /* @__PURE__ */ new Map();
  const candByCallback = /* @__PURE__ */ new Map();
  for (const cand of table.iterations) {
    if (cand.call !== void 0) candByCall.set(cand.call, cand);
    if (cand.callback !== void 0) candByCallback.set(cand.callback, cand);
  }
  const eachCallbackFns = /* @__PURE__ */ new Set();
  for (const call of candByCall.keys()) {
    for (const fn of applicationsAt({ oracle, scriptFile }, call, "argument"))
      eachCallbackFns.add(fn);
  }
  const recursive = collectRecursiveFunctions(scriptFile, checker, oracle.applications);
  const realSteps = /* @__PURE__ */ new Set([
    ...table.asks.map((site) => site.id),
    ...table.worldReads.map((site) => site.id)
  ]);
  const callByStep = new Map([
    ...table.asks.map((site) => [site.id, site.call]),
    ...table.worldReads.map((site) => [site.id, site.call])
  ]);
  const markerByStatement = /* @__PURE__ */ new Map();
  for (const marker of table.phases) {
    if (ts27.isExpressionStatement(marker.call.parent))
      markerByStatement.set(marker.call.parent, marker);
  }
  const regions = [];
  const counters = /* @__PURE__ */ new Map();
  const root = openRegion({ counters, regions }, "seq", void 0, { entered: true });
  const state = {
    actorByCall,
    askByCall,
    body,
    callByStep,
    candByCall,
    candByCallback,
    checker,
    controls: [],
    counters,
    currentPhase: UNPHASED_ID,
    eachCallbackFns,
    events: [],
    fnStack: [],
    frames: [{ region: root, settled: /* @__PURE__ */ new Set() }],
    issued: /* @__PURE__ */ new Set(),
    iterationAncestorCache: /* @__PURE__ */ new Map(),
    joined: /* @__PURE__ */ new Set(),
    markerByStatement,
    oracle,
    phaseIdByName: /* @__PURE__ */ new Map(),
    phases: [],
    program,
    readByCall,
    realSteps,
    recursive,
    regionByStatement: /* @__PURE__ */ new Map(),
    regions,
    returnTargets: [],
    root,
    sccLoopByDecl: /* @__PURE__ */ new Map(),
    scriptFile,
    stepsBySymbol: /* @__PURE__ */ new Map(),
    strands: [],
    strandsBySymbol: /* @__PURE__ */ new Map(),
    throwTargets: [],
    toScriptLoc,
    walk: (node, chain) => walk(state, node, chain),
    walkedFns: /* @__PURE__ */ new Set()
  };
  return state;
}
function locOf(state, node) {
  return state.toScriptLoc(node.getStart(state.scriptFile));
}
function innermost(state, chain) {
  return chain[chain.length - 1] ?? state.root;
}
function issue(state, step, chain) {
  state.issued.add(step);
  innermostOpenStrand(state)?.issued.add(step);
  state.events.push({ at: "issue", phase: state.currentPhase, regions: chain, step });
}
function jump(state, kind, target, chain) {
  state.events.push({ at: "jump", kind, phase: state.currentPhase, regions: chain, target });
}
function issuesSince(state, mark) {
  const out = [];
  for (let i = mark; i < state.events.length; i += 1) {
    const event = state.events[i];
    if (event.at === "issue" && !out.includes(event.step)) out.push(event.step);
  }
  return out;
}
function phaseIdOf(state, marker) {
  const name = marker.name?.trim();
  if (name === void 0 || name === "") return void 0;
  const existing = state.phaseIdByName.get(name);
  if (existing !== void 0) return existing;
  const id = `phase#${state.phases.length + 1}`;
  state.phaseIdByName.set(name, id);
  state.phases.push({ id, loc: marker.loc, name });
  return id;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-walk.ts
import ts31 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-calls.ts
import ts29 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-settle.ts
import ts28 from "typescript";
var NO_CLAIM = { certain: [], maybe: [] };
function iterationAncestorsOf(state, node) {
  const cached = state.iterationAncestorCache.get(node);
  if (cached !== void 0) return cached;
  const out = /* @__PURE__ */ new Set();
  for (let cur = node.parent; cur !== void 0; cur = cur.parent) {
    if (ts28.isForStatement(cur) || ts28.isForOfStatement(cur) || ts28.isForInStatement(cur) || ts28.isWhileStatement(cur) || ts28.isDoStatement(cur) || state.candByCallback.has(cur) || state.eachCallbackFns.has(cur)) {
      out.add(cur);
    }
  }
  state.iterationAncestorCache.set(node, out);
  return out;
}
function admissionOf(state, awaitNode, step) {
  if (state.issued.has(step)) return "issued";
  const call = state.callByStep.get(step);
  if (call === void 0) return void 0;
  const enclosing = iterationAncestorsOf(state, awaitNode);
  if (enclosing.size === 0) return void 0;
  for (const ancestor of iterationAncestorsOf(state, call)) {
    if (enclosing.has(ancestor)) return "repetition";
  }
  return void 0;
}
function claimAt(state, map, at2, admit) {
  const occs = (map.get(at2) ?? []).filter((occ) => state.realSteps.has(occ.site));
  const bySite = /* @__PURE__ */ new Map();
  for (const occ of occs) {
    const how = admit === void 0 ? "issued" : admit(occ.site);
    if (how === void 0) continue;
    const existing = bySite.get(occ.site);
    if (existing === void 0)
      bySite.set(occ.site, { certainOk: how === "issued", exact: occ.exact });
    else existing.exact = existing.exact || occ.exact;
  }
  const sites = [...bySite.keys()];
  if (sites.length === 0) return NO_CLAIM;
  const only = sites[0];
  const solo = bySite.get(only);
  if (sites.length === 1 && solo.exact && solo.certainOk) return { certain: [only], maybe: [] };
  return { certain: [], maybe: sites };
}
function settlesAt(state, node, at2) {
  return claimAt(state, state.oracle.awaitSettles, at2, (step) => admissionOf(state, node, step));
}
function barrier(state, certain, maybe, chain, awaited) {
  const { events, issued } = state;
  const joins = joinStrands(state, certain, maybe, awaited);
  const summaryOf = (regions) => regions.flatMap((region) => [
    ...state.strands.find((record) => record.region === region)?.summary ?? []
  ]);
  const allCertain = [...certain, ...summaryOf(joins.certain)];
  const allMaybe = [...maybe, ...summaryOf(joins.maybe)];
  const joined = [...joins.certain, ...joins.maybe];
  const frame = currentFrame(state);
  const freshCertain = [];
  for (const step of allCertain) {
    if (!isVisiblySettled(state, step) && !freshCertain.includes(step)) freshCertain.push(step);
  }
  for (const step of freshCertain) frame.settled.add(step);
  const freshMaybe = [];
  for (const step of allMaybe) {
    if (!isVisiblySettled(state, step) && !freshMaybe.includes(step)) freshMaybe.push(step);
  }
  for (const step of freshMaybe) frame.settled.add(step);
  const withJoins = joined.length === 0 ? {} : { joins: joined };
  if (freshCertain.length > 0) {
    events.push({ at: "settle", maybe: false, regions: chain, steps: freshCertain, ...withJoins });
  }
  if (freshMaybe.length > 0) {
    events.push({
      at: "settle",
      maybe: true,
      regions: chain,
      steps: freshMaybe,
      ...freshCertain.length > 0 ? {} : withJoins
    });
  }
  if (freshCertain.length > 0 || freshMaybe.length > 0) return;
  const joinOnly = () => {
    if (joined.length === 0) return;
    events.push({ at: "settle", joins: joined, maybe: false, regions: chain, steps: [] });
  };
  if (allCertain.length > 0 || allMaybe.length > 0) {
    joinOnly();
    return;
  }
  const pending = [...issued].filter((step) => !isVisiblySettled(state, step));
  if (pending.length === 0) {
    joinOnly();
    return;
  }
  for (const step of pending) frame.settled.add(step);
  events.push({ at: "settle", maybe: true, regions: chain, steps: pending, ...withJoins });
}
function bindSteps(state, name, steps) {
  if (steps.length === 0) return;
  for (const identifier of boundIdentifiers(name)) {
    const symbol = state.checker.getSymbolAtLocation(identifier);
    if (symbol === void 0) continue;
    const set = state.stepsBySymbol.get(symbol) ?? /* @__PURE__ */ new Set();
    for (const step of steps) set.add(step);
    state.stepsBySymbol.set(symbol, set);
  }
}
function controllersOf(state, guard) {
  const controllers = [];
  const scan = (node) => {
    if (isFunctionLike(node)) return;
    if (ts28.isIdentifier(node)) {
      const symbol = state.checker.getSymbolAtLocation(node);
      const steps = symbol === void 0 ? void 0 : state.stepsBySymbol.get(symbol);
      if (steps !== void 0) {
        for (const step of steps) if (!controllers.includes(step)) controllers.push(step);
      }
      return;
    }
    ts28.forEachChild(node, scan);
  };
  scan(guard);
  const claim = claimAt(state, state.oracle.guardReads, guard.getStart(state.scriptFile));
  for (const step of claim.certain) if (!controllers.includes(step)) controllers.push(step);
  return {
    controllers,
    maybeControllers: claim.maybe.filter((step) => !controllers.includes(step))
  };
}
function recordControl(state, guard, region) {
  const { controllers, maybeControllers } = controllersOf(state, guard);
  if (controllers.length > 0 || maybeControllers.length > 0) {
    state.controls.push({ controllers, maybeControllers, region });
  }
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-calls.ts
function walkCall(state, node, chain) {
  const { walk } = state;
  const receiverMark = state.events.length;
  walk(node.expression, chain);
  const receiverIssues = issuesSince(state, receiverMark);
  for (const argument of node.arguments) walk(argument, chain);
  const handled = /* @__PURE__ */ new Set();
  const cand = state.candByCall.get(node);
  if (cand !== void 0) {
    const strand = cand.callback !== void 0 && isAsyncFunction(cand.callback);
    const id = openRegion(state, "fanout", innermost(state, chain), {
      entered: false,
      label: cand.method,
      loc: cand.loc,
      ...strand ? { strand: true } : {}
    });
    const inside = [...chain, id];
    if (cand.callback !== void 0) {
      const record = strand ? openStrand(state, id) : void 0;
      state.returnTargets.push(id);
      walk(cand.body, inside);
      state.returnTargets.pop();
      if (record !== void 0) closeStrand(state, record);
    } else {
      for (const fn of applicationsAt(state, node, "argument")) {
        handled.add(fn);
        inlineBody(state, fn, inside, node);
      }
    }
  }
  const ask = state.askByCall.get(node);
  if (ask !== void 0) {
    issue(state, ask, chain);
    return;
  }
  const read = state.readByCall.get(node);
  if (read !== void 0) {
    issue(state, read, chain);
    return;
  }
  const actor = state.actorByCall.get(node);
  if (actor !== void 0) {
    state.events.push({ actor, at: "actor", regions: chain });
    return;
  }
  applyAt(state, node, chain, handled, receiverIssues);
}
function applyAt(state, node, chain, handled = /* @__PURE__ */ new Set(), receiverIssues = []) {
  const { checker, program, scriptFile } = state;
  const callees = applicationsAt(state, node, "callee").filter((fn) => !handled.has(fn));
  if (callees.length === 0 && ts29.isCallExpression(node)) {
    const decl = resolveCallDeclaration(node, checker, scriptFile);
    if (decl !== void 0) callees.push(decl);
  }
  if (callees.length === 1) {
    inlineBody(state, callees[0], chain, node);
  } else if (callees.length > 1) {
    const choice = openRegion(state, "choice", innermost(state, chain), {
      entered: true,
      exhaustive: true,
      loc: locOf(state, node)
    });
    for (const fn of callees) {
      const arm = openRegion(state, "branch", choice, { entered: false, loc: locOf(state, fn) });
      inlineBody(state, fn, [...chain, choice, arm], node);
    }
  }
  const callbacks = applicationsAt(state, node, "argument").filter((fn) => !handled.has(fn));
  if (callbacks.length === 0) return;
  const semantics = ts29.isTaggedTemplateExpression(node) ? void 0 : callbackSemanticsOf(node, checker, program);
  const entered = semantics?.entered ?? DEFAULT_CALLBACK_SEMANTICS.entered;
  const access = semantics?.deferred === true && ts29.isCallExpression(node) && ts29.isPropertyAccessExpression(node.expression) ? node.expression : void 0;
  const prologue = access === void 0 ? void 0 : (inside) => {
    const claim = settlesAt(state, node, access.name.getStart(scriptFile));
    barrier(state, [...receiverIssues, ...claim.certain], claim.maybe, inside);
  };
  const options = {
    label: semantics?.label,
    prologue,
    ...semantics?.deferred === true ? { strand: true } : {}
  };
  for (const fn of callbacks) {
    if (entered) {
      inlineBody(state, fn, chain, node, options);
      continue;
    }
    const choice = openRegion(state, "choice", innermost(state, chain), {
      entered: true,
      loc: locOf(state, node)
    });
    const arm = openRegion(state, "branch", choice, { entered: false, loc: locOf(state, fn) });
    inlineBody(state, fn, [...chain, choice, arm], node, options);
  }
}
function inlineBody(state, decl, chain, site, options = {}) {
  const { fnStack, sccLoopByDecl } = state;
  const { label, prologue } = options;
  if (fnStack.includes(decl)) {
    const loop = sccLoopByDecl.get(decl);
    if (loop !== void 0) jump(state, "recur", loop, chain);
    return;
  }
  const name = functionName(decl) ?? label;
  const strand = options.strand === true || isAsyncFunction(decl);
  let inside = chain;
  let sccLoop;
  if (state.recursive.has(decl)) {
    sccLoop = openRegion(state, "loop", innermost(state, chain), {
      entered: true,
      loc: locOf(state, decl),
      recursive: true,
      ...name === void 0 ? {} : { label: name }
    });
    inside = [...inside, sccLoop];
  }
  const call = openRegion(state, "call", innermost(state, inside), {
    entered: true,
    loc: locOf(state, site),
    ...name === void 0 ? {} : { label: name },
    ...strand ? { strand: true } : {}
  });
  inside = [...inside, call];
  const record = strand ? openStrand(state, call) : void 0;
  if (prologue !== void 0) prologue(inside);
  fnStack.push(decl);
  state.walkedFns.add(decl);
  const outerSccLoop = sccLoopByDecl.get(decl);
  if (sccLoop !== void 0) sccLoopByDecl.set(decl, sccLoop);
  state.returnTargets.push(call);
  state.walk(decl.body, inside);
  state.returnTargets.pop();
  if (outerSccLoop === void 0) sccLoopByDecl.delete(decl);
  else sccLoopByDecl.set(decl, outerSccLoop);
  fnStack.pop();
  if (record !== void 0) closeStrand(state, record);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-loops.ts
import ts30 from "typescript";
function walkLoopBody(state, statement, body, chain) {
  state.regionByStatement.set(statement, innermost(state, chain));
  state.walk(body, chain);
  state.regionByStatement.delete(statement);
}
function walkLoop(state, node, chain) {
  const { walk } = state;
  if (ts30.isForStatement(node)) {
    const { bound, entered } = literalForBound(node);
    if (node.initializer !== void 0) walk(node.initializer, chain);
    if (node.condition !== void 0) walk(node.condition, chain);
    if (node.incrementor !== void 0) walk(node.incrementor, chain);
    const id = openRegion(state, "loop", innermost(state, chain), {
      entered,
      loc: locOf(state, node),
      ...bound === void 0 ? {} : { bound }
    });
    if (node.condition !== void 0) recordControl(state, node.condition, id);
    walkLoopBody(state, node, node.statement, [...chain, id]);
    return true;
  }
  if (ts30.isForOfStatement(node) || ts30.isForInStatement(node)) {
    const mark = state.events.length;
    const spawned = strandMark(state);
    walk(node.expression, chain);
    const id = openRegion(state, "loop", innermost(state, chain), {
      entered: false,
      loc: locOf(state, node)
    });
    const inside = [...chain, id];
    if (ts30.isForOfStatement(node) && node.awaitModifier !== void 0) {
      const claim = settlesAt(state, node.expression, node.expression.getStart(state.scriptFile));
      barrier(state, [...issuesSince(state, mark), ...claim.certain], claim.maybe, inside, {
        mark: spawned,
        operand: node.expression
      });
    }
    walk(node.initializer, inside);
    walkLoopBody(state, node, node.statement, inside);
    return true;
  }
  if (ts30.isWhileStatement(node)) {
    walk(node.expression, chain);
    const id = openRegion(state, "loop", innermost(state, chain), {
      entered: false,
      loc: locOf(state, node)
    });
    recordControl(state, node.expression, id);
    walkLoopBody(state, node, node.statement, [...chain, id]);
    return true;
  }
  if (ts30.isDoStatement(node)) {
    const id = openRegion(state, "loop", innermost(state, chain), {
      entered: true,
      loc: locOf(state, node)
    });
    walkLoopBody(state, node, node.statement, [...chain, id]);
    walk(node.expression, [...chain, id]);
    return true;
  }
  return false;
}
function literalForBound(node) {
  const initializer = node.initializer;
  const condition = node.condition;
  if (initializer === void 0 || !ts30.isVariableDeclarationList(initializer)) {
    return { entered: false };
  }
  const decl = initializer.declarations[0];
  if (decl === void 0 || !ts30.isIdentifier(decl.name) || decl.initializer === void 0) {
    return { entered: false };
  }
  const start = numericValue(decl.initializer);
  if (start === void 0 || condition === void 0 || !ts30.isBinaryExpression(condition)) {
    return { entered: false };
  }
  if (!ts30.isIdentifier(condition.left) || condition.left.text !== decl.name.text) {
    return { entered: false };
  }
  const limit = numericValue(condition.right);
  if (limit === void 0) return { entered: false };
  const operator = condition.operatorToken.kind;
  const rounds = operator === ts30.SyntaxKind.LessThanToken && start < limit ? limit - start : operator === ts30.SyntaxKind.LessThanEqualsToken && start <= limit ? limit - start + 1 : void 0;
  if (rounds === void 0) return { entered: false };
  return isUnitIncrement(node.incrementor, decl.name.text) ? { bound: rounds, entered: true } : { entered: true };
}
function numericValue(expr) {
  if (ts30.isNumericLiteral(expr)) return Number(expr.text);
  if (ts30.isPrefixUnaryExpression(expr) && expr.operator === ts30.SyntaxKind.MinusToken) {
    const inner = numericValue(expr.operand);
    return inner === void 0 ? void 0 : -inner;
  }
  return void 0;
}
function isUnitIncrement(incrementor, name) {
  if (incrementor === void 0) return false;
  if (ts30.isPostfixUnaryExpression(incrementor) && incrementor.operator === ts30.SyntaxKind.PlusPlusToken) {
    return ts30.isIdentifier(incrementor.operand) && incrementor.operand.text === name;
  }
  if (ts30.isPrefixUnaryExpression(incrementor) && incrementor.operator === ts30.SyntaxKind.PlusPlusToken) {
    return ts30.isIdentifier(incrementor.operand) && incrementor.operand.text === name;
  }
  if (ts30.isBinaryExpression(incrementor) && incrementor.operatorToken.kind === ts30.SyntaxKind.PlusEqualsToken && ts30.isIdentifier(incrementor.left) && incrementor.left.text === name) {
    return numericValue(incrementor.right) === 1;
  }
  return false;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order-walk.ts
function guarded(state, guard, node, chain) {
  const id = openRegion(state, "branch", innermost(state, chain), {
    entered: false,
    loc: locOf(state, node)
  });
  if (guard !== void 0) recordControl(state, guard, id);
  return [...chain, id];
}
function jumpTargetOf(state, node) {
  const { regionByStatement } = state;
  const isBreak = ts31.isBreakStatement(node);
  for (let cur = node.parent; cur !== void 0 && !isFunctionLike(cur); cur = cur.parent) {
    if (node.label !== void 0) {
      if (ts31.isLabeledStatement(cur) && cur.label.text === node.label.text) {
        return regionByStatement.get(cur.statement);
      }
      continue;
    }
    if (ts31.isIterationStatement(cur, false)) return regionByStatement.get(cur);
    if (isBreak && ts31.isSwitchStatement(cur)) return regionByStatement.get(cur);
  }
  return void 0;
}
function walkStatements(state, statements, chain) {
  const outer = state.currentPhase;
  for (const statement of statements) {
    const marker = state.markerByStatement.get(statement);
    if (marker !== void 0) {
      const id = phaseIdOf(state, marker);
      if (id !== void 0) {
        state.currentPhase = id;
        state.events.push({ at: "mark", phase: id, regions: chain });
      }
    }
    state.walk(statement, chain);
  }
  state.currentPhase = outer;
}
function walkNode(state, node, chain) {
  const { events, regionByStatement, returnTargets, root, scriptFile, throwTargets, walk } = state;
  if (isFunctionLike(node)) {
    const { name } = node;
    if (name !== void 0 && ts31.isComputedPropertyName(name)) walk(name.expression, chain);
    return;
  }
  if (ts31.isBlock(node)) {
    walkStatements(state, node.statements, chain);
    return;
  }
  if (ts31.isAwaitExpression(node)) {
    const mark = events.length;
    const spawned = strandMark(state);
    walk(node.expression, chain);
    const claim = settlesAt(state, node, node.getStart(scriptFile));
    barrier(state, [...issuesSince(state, mark), ...claim.certain], claim.maybe, chain, {
      mark: spawned,
      operand: node.expression
    });
    return;
  }
  if (ts31.isCallExpression(node)) {
    walkCall(state, node, chain);
    return;
  }
  if (ts31.isNewExpression(node)) {
    walk(node.expression, chain);
    for (const argument of node.arguments ?? []) walk(argument, chain);
    applyAt(state, node, chain);
    return;
  }
  if (ts31.isTaggedTemplateExpression(node)) {
    walk(node.tag, chain);
    walk(node.template, chain);
    applyAt(state, node, chain);
    return;
  }
  if (ts31.isVariableDeclaration(node)) {
    if (node.initializer !== void 0) {
      const mark = events.length;
      const spawned = strandMark(state);
      walk(node.initializer, chain);
      bindSteps(state, node.name, issuesSince(state, mark));
      bindStrands(state, node.name, strandsSince(state, spawned));
    }
    return;
  }
  if (ts31.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts31.SyntaxKind.AmpersandAmpersandToken || operator === ts31.SyntaxKind.BarBarToken || operator === ts31.SyntaxKind.QuestionQuestionToken) {
      walk(node.left, chain);
      const choice = [
        ...chain,
        openRegion(state, "choice", innermost(state, chain), {
          entered: true,
          loc: locOf(state, node)
        })
      ];
      walk(node.right, guarded(state, node.left, node.right, choice));
      return;
    }
    if (operator === ts31.SyntaxKind.EqualsToken) {
      const mark = events.length;
      const spawned = strandMark(state);
      walk(node.right, chain);
      if (ts31.isIdentifier(node.left)) {
        bindSteps(state, node.left, issuesSince(state, mark));
        bindStrands(state, node.left, strandsSince(state, spawned));
      }
      walk(node.left, chain);
      return;
    }
    walk(node.left, chain);
    walk(node.right, chain);
    return;
  }
  if (ts31.isConditionalExpression(node)) {
    walk(node.condition, chain);
    const choice = [
      ...chain,
      openRegion(state, "choice", innermost(state, chain), {
        entered: true,
        exhaustive: true,
        loc: locOf(state, node)
      })
    ];
    walk(node.whenTrue, guarded(state, node.condition, node.whenTrue, choice));
    walk(node.whenFalse, guarded(state, node.condition, node.whenFalse, choice));
    return;
  }
  if (ts31.isIfStatement(node)) {
    walk(node.expression, chain);
    const choice = [
      ...chain,
      openRegion(state, "choice", innermost(state, chain), {
        entered: true,
        loc: locOf(state, node),
        ...node.elseStatement === void 0 ? {} : { exhaustive: true }
      })
    ];
    walk(node.thenStatement, guarded(state, node.expression, node.thenStatement, choice));
    if (node.elseStatement !== void 0) {
      walk(node.elseStatement, guarded(state, node.expression, node.elseStatement, choice));
    }
    return;
  }
  if (ts31.isSwitchStatement(node)) {
    walk(node.expression, chain);
    const clauses = node.caseBlock.clauses;
    const id = openRegion(state, "choice", innermost(state, chain), {
      entered: true,
      fallthrough: true,
      loc: locOf(state, node),
      ...clauses.some((clause) => ts31.isDefaultClause(clause)) ? { exhaustive: true } : {}
    });
    const choice = [...chain, id];
    regionByStatement.set(node, id);
    for (const clause of clauses) {
      if (ts31.isCaseClause(clause)) walk(clause.expression, choice);
      const inside = guarded(state, node.expression, clause, choice);
      walkStatements(state, clause.statements, inside);
    }
    regionByStatement.delete(node);
    return;
  }
  if (ts31.isReturnStatement(node)) {
    if (node.expression !== void 0) walk(node.expression, chain);
    jump(state, "return", returnTargets[returnTargets.length - 1] ?? root, chain);
    return;
  }
  if (ts31.isThrowStatement(node)) {
    walk(node.expression, chain);
    jump(state, "throw", throwTargets[throwTargets.length - 1] ?? root, chain);
    return;
  }
  if (ts31.isBreakOrContinueStatement(node)) {
    const target = jumpTargetOf(state, node);
    if (target !== void 0)
      jump(state, ts31.isBreakStatement(node) ? "break" : "continue", target, chain);
    return;
  }
  if (ts31.isTryStatement(node)) {
    const group = openRegion(state, "try", innermost(state, chain), {
      entered: true,
      loc: locOf(state, node)
    });
    const inGroup = [...chain, group];
    const attempt = openRegion(state, "attempt", group, {
      entered: true,
      loc: locOf(state, node.tryBlock)
    });
    throwTargets.push(attempt);
    walk(node.tryBlock, [...inGroup, attempt]);
    throwTargets.pop();
    if (node.catchClause !== void 0) {
      const id = openRegion(state, "catch", group, {
        entered: false,
        loc: locOf(state, node.catchClause)
      });
      walk(node.catchClause.block, [...inGroup, id]);
    }
    if (node.finallyBlock !== void 0) {
      const id = openRegion(state, "finally", group, {
        entered: true,
        loc: locOf(state, node.finallyBlock)
      });
      walk(node.finallyBlock, [...inGroup, id]);
    }
    return;
  }
  if (walkLoop(state, node, chain)) return;
  ts31.forEachChild(node, (child) => walk(child, chain));
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-order.ts
function traceOrder(workflow, table, oracle) {
  const state = createTraceState(workflow, table, oracle, walkNode);
  const { controls, events, fnStack, issued, phases, regions, returnTargets, root, walkedFns } = state;
  walkStatements(state, state.body.statements, [root]);
  state.currentPhase = UNPHASED_ID;
  const stepSites = [...table.asks, ...table.worldReads].sort((a, b) => a.order - b.order);
  let progress = true;
  while (progress) {
    progress = false;
    for (const site of stepSites) {
      if (issued.has(site.id)) continue;
      const owner = enclosingFunctions(site.call).find((fn) => !walkedFns.has(fn));
      if (owner === void 0) continue;
      walkedFns.add(owner);
      fnStack.push(owner);
      const detached = openRegion(state, "branch", root, {
        detached: true,
        entered: false,
        loc: locOf(state, owner),
        ...functionName(owner) === void 0 ? {} : { label: functionName(owner) }
      });
      returnTargets.push(detached);
      state.walk(owner.body, [root, detached]);
      returnTargets.pop();
      fnStack.pop();
      progress = true;
    }
  }
  for (const site of stepSites) if (!issued.has(site.id)) issue(state, site.id, [root]);
  return { controls, events, phases, regions, root };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/fanout-cardinality.ts
import ts32 from "typescript";
function literalCardinality(iterated, checker) {
  const expr = unwrap(iterated);
  if (ts32.isArrayLiteralExpression(expr)) return spreadFreeLength(expr);
  if (!ts32.isIdentifier(expr)) return void 0;
  const symbol = checker.getSymbolAtLocation(expr);
  const decl = symbol?.valueDeclaration;
  if (symbol === void 0 || decl === void 0 || !ts32.isVariableDeclaration(decl)) return void 0;
  if (!ts32.isIdentifier(decl.name)) return void 0;
  const list = decl.parent;
  if (!ts32.isVariableDeclarationList(list) || (list.flags & ts32.NodeFlags.Const) === 0) return void 0;
  if (decl.initializer === void 0) return void 0;
  const init = unwrap(decl.initializer);
  if (!ts32.isArrayLiteralExpression(init)) return void 0;
  const length = spreadFreeLength(init);
  if (length === void 0) return void 0;
  return isEverWritten(symbol, decl.getSourceFile(), checker) ? void 0 : length;
}
function unwrap(expr) {
  let current = expr;
  for (; ; ) {
    if (ts32.isParenthesizedExpression(current)) current = current.expression;
    else if (ts32.isAsExpression(current) || ts32.isSatisfiesExpression(current)) current = current.expression;
    else if (ts32.isNonNullExpression(current)) current = current.expression;
    else if (ts32.isTypeAssertionExpression(current)) current = current.expression;
    else return current;
  }
}
function spreadFreeLength(literal) {
  if (literal.elements.some((element) => ts32.isSpreadElement(element) || ts32.isOmittedExpression(element))) {
    return void 0;
  }
  return literal.elements.length > 0 ? literal.elements.length : void 0;
}
var MUTATORS = /* @__PURE__ */ new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "length"]);
function isEverWritten(symbol, file, checker) {
  let written = false;
  const visit = (node) => {
    if (written) return;
    if (ts32.isIdentifier(node) && node.parent !== void 0 && checker.getSymbolAtLocation(node) === symbol) {
      if (isWriteReference(node)) written = true;
    }
    ts32.forEachChild(node, visit);
  };
  visit(file);
  return written;
}
function isWriteReference(id) {
  const parent = id.parent;
  if (ts32.isVariableDeclaration(parent) && parent.name === id) return false;
  if (ts32.isPropertyAccessExpression(parent) && parent.expression === id) {
    const name = parent.name.text;
    if (!MUTATORS.has(name)) return false;
    if (name === "length") return isAssignmentTarget(parent);
    return ts32.isCallExpression(parent.parent) && parent.parent.expression === parent;
  }
  if (ts32.isElementAccessExpression(parent) && parent.expression === id) return isAssignmentTarget(parent);
  return isAssignmentTarget(id);
}
function isAssignmentTarget(node) {
  const parent = node.parent;
  if (ts32.isBinaryExpression(parent) && parent.left === node) {
    const op = parent.operatorToken.kind;
    return op >= ts32.SyntaxKind.FirstAssignment && op <= ts32.SyntaxKind.LastAssignment;
  }
  if (ts32.isPrefixUnaryExpression(parent) || ts32.isPostfixUnaryExpression(parent)) {
    return parent.operator === ts32.SyntaxKind.PlusPlusToken || parent.operator === ts32.SyntaxKind.MinusMinusToken;
  }
  if (ts32.isDeleteExpression(parent)) return true;
  if (ts32.isArrayLiteralExpression(parent) || ts32.isPropertyAssignment(parent) || ts32.isShorthandPropertyAssignment(parent)) {
    let up = parent;
    while (ts32.isArrayLiteralExpression(up) || ts32.isObjectLiteralExpression(up) || ts32.isPropertyAssignment(up) || ts32.isShorthandPropertyAssignment(up) || ts32.isSpreadElement(up)) {
      up = up.parent;
    }
    return ts32.isBinaryExpression(up) && up.operatorToken.kind === ts32.SyntaxKind.EqualsToken && up.left !== void 0 && containsNode(up.left, node);
  }
  return false;
}
function containsNode(root, target) {
  return target.pos >= root.pos && target.end <= root.end;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/interpret.ts
function interpret(workflow, table) {
  const evaluator = new Evaluator(workflow, table);
  evaluator.converge();
  const facts = evaluator.s.emitFacts();
  const oracle = evaluator.s.emitOracle();
  const trace = traceOrder(workflow, table, oracle);
  return mintCore(workflow, table, facts, trace, oracle.applications);
}
function mintCore(workflow, table, facts, trace, applications) {
  const { scriptFile } = workflow;
  const fanoutId = /* @__PURE__ */ new Map();
  facts.promoted.forEach((fanout, index) => fanoutId.set(fanout.id, `fan-out#${index + 1}`));
  const rename = (site) => fanoutId.get(site) ?? site;
  const spanOf = (node) => ({ end: node.getEnd(), start: node.getStart(scriptFile) });
  const insideSpan = (pos, span) => span.start <= pos && pos < span.end;
  const promotedSpans = [];
  for (const cand of table.iterations) {
    const id = fanoutId.get(provisionalFanoutId(cand.order));
    if (id === void 0) continue;
    const seedSpans = [spanOf(cand.body)];
    if (cand.call !== void 0) {
      for (const [fn, via] of applications.get(cand.call) ?? []) {
        if (via === "argument") seedSpans.push(spanOf(fn));
      }
    }
    const spans = [...seedSpans];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i];
      for (const [site, fns] of applications) {
        if (!insideSpan(site.getStart(scriptFile), span)) continue;
        for (const fn of fns.keys()) {
          if (seen.has(fn)) continue;
          seen.add(fn);
          spans.push(spanOf(fn));
        }
      }
    }
    for (const span of spans) promotedSpans.push({ id, ...span });
  }
  const within = (pos) => {
    let best;
    for (const span of promotedSpans) {
      if (insideSpan(pos, span) && (best === void 0 || span.start > best.start)) {
        best = { id: span.id, start: span.start };
      }
    }
    return best?.id;
  };
  const withinOf = (node) => {
    const enclosing = within(node.getStart(scriptFile));
    return enclosing === void 0 ? {} : { within: enclosing };
  };
  const asks = table.asks.map((site) => ({
    id: site.id,
    label: site.label,
    ...site.labelPattern === void 0 ? {} : { labelPattern: site.labelPattern },
    loc: site.loc,
    order: site.order,
    ...withinOf(site.call)
  }));
  const simple = (site) => ({
    id: site.id,
    label: site.label,
    loc: site.loc,
    order: site.order,
    ...withinOf(site.call)
  });
  const actors = table.actors.map((site) => ({
    id: site.id,
    loc: site.loc,
    ...site.name === void 0 ? {} : { name: site.name },
    ...site.namePattern === void 0 ? {} : { namePattern: site.namePattern },
    order: site.order,
    ...withinOf(site.call)
  }));
  const candByOrder = new Map(table.iterations.map((cand) => [cand.order, cand]));
  const checker = workflow.program.getTypeChecker();
  const fanouts = facts.promoted.map((fanout) => {
    const cand = candByOrder.get(fanout.order);
    const cardinality = cand === void 0 ? void 0 : literalCardinality(cand.iterated, checker);
    return {
      id: fanoutId.get(fanout.id),
      label: fanout.label,
      loc: fanout.loc,
      order: fanout.order,
      ...cand === void 0 ? {} : withinOf(cand.iterated),
      ...cardinality === void 0 ? {} : { cardinality }
    };
  });
  const sites = {
    actors,
    asks,
    fanouts,
    joins: table.joins.map(simple),
    worldReads: table.worldReads.map(simple)
  };
  return {
    facts: mintFacts(facts, fanoutId, rename),
    sites,
    trace,
    types: mintTypes(computeArtifactTypes(workflow, table), rename)
  };
}
function mintFacts(facts, fanoutId, rename) {
  const renameOccs = (occs) => occs.map((occ) => ({ exact: occ.exact, site: rename(occ.site), ...occ.port === void 0 ? {} : { port: occ.port } }));
  const renameMap = (map) => {
    const out = /* @__PURE__ */ new Map();
    for (const [sink, occs] of map) out.set(sink, renameOccs(occs));
    return out;
  };
  const fanoutIn = /* @__PURE__ */ new Map();
  for (const [provId, occs] of facts.fanoutIn) {
    const finalId = fanoutId.get(provId);
    if (finalId === void 0) continue;
    fanoutIn.set(finalId, renameOccs(occs));
  }
  return {
    askActor: renameMap(facts.askActor),
    askData: renameMap(facts.askData),
    fanoutIn,
    joinIn: renameMap(facts.joinIn),
    returnData: renameOccs(facts.returnData),
    worldReadData: renameMap(facts.worldReadData)
  };
}
function mintTypes(types, rename) {
  const siteType = /* @__PURE__ */ new Map();
  for (const [id, type] of types.siteType) siteType.set(rename(id), type);
  return { joinPortTypes: types.joinPortTypes, siteType };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/graph.ts
var SOURCE_NODE = { id: "source", kind: "source", label: "source" };
var SINK_NODE = { id: "sink", kind: "sink", label: "sink" };
function projectSiteGraph(core) {
  const { facts, sites, types } = core;
  const fanoutNodes = sites.fanouts.map((site) => {
    const artifactType = types.siteType.get(site.id);
    return {
      id: site.id,
      kind: "fan-out",
      label: site.label,
      loc: site.loc,
      order: site.order,
      ...site.within === void 0 ? {} : { within: site.within },
      ...artifactType === void 0 ? {} : { artifactType }
    };
  });
  const actorOrder = new Map(sites.actors.map((actor) => [actor.id, actor.order]));
  const askActors = (id) => [...new Set((facts.askActor.get(id) ?? []).map((occ) => occ.site))].sort(
    (a, b) => (actorOrder.get(a) ?? 0) - (actorOrder.get(b) ?? 0)
  );
  const siteNodes = [
    ...sites.asks.map((site) => {
      const actors2 = askActors(site.id);
      const artifactType = types.siteType.get(site.id);
      return {
        id: site.id,
        kind: "ask",
        label: site.label,
        ...site.labelPattern === void 0 ? {} : { labelPattern: site.labelPattern },
        loc: site.loc,
        order: site.order,
        ...actors2.length > 0 ? { actors: actors2 } : {},
        ...site.within === void 0 ? {} : { within: site.within },
        ...artifactType === void 0 ? {} : { artifactType }
      };
    }),
    ...sites.worldReads.map((site) => plainNode(site, "world-read", types)),
    ...sites.joins.map((site) => plainNode(site, "join", types)),
    ...fanoutNodes
  ].sort((a, b) => a.order - b.order);
  const edges = [];
  const edgeType = (from, occ, intoJoin) => {
    const whole = types.siteType.get(from);
    if (!intoJoin && occ.port !== void 0) {
      const ports = types.joinPortTypes.get(from);
      if (ports !== void 0) return ports[occ.port] ?? whole;
    }
    return whole;
  };
  const dataEdge = (from, to, occ, intoJoin = false) => {
    const type = edgeType(from, occ, intoJoin);
    edges.push({
      exact: occ.exact,
      from,
      kind: "data",
      to,
      ...occ.port === void 0 ? {} : { port: occ.port },
      ...type === void 0 ? {} : { type }
    });
  };
  for (const [askId, occs] of facts.askData) for (const occ of occs) dataEdge(occ.site, askId, occ);
  for (const [worldId, occs] of facts.worldReadData) for (const occ of occs) dataEdge(occ.site, worldId, occ);
  for (const [joinId, occs] of facts.joinIn) for (const occ of occs) dataEdge(occ.site, joinId, occ, true);
  for (const [fanoutId, occs] of facts.fanoutIn) for (const occ of occs) dataEdge(occ.site, fanoutId, occ);
  for (const occ of facts.returnData) dataEdge(occ.site, "sink", occ);
  const askOrder = new Map(sites.asks.map((site) => [site.id, site.order]));
  const contextAsks = sites.asks.map((site) => ({ actors: facts.askActor.get(site.id) ?? [], id: site.id })).filter((entry) => entry.actors.length > 0);
  for (let i = 0; i < contextAsks.length; i += 1) {
    for (let j = i + 1; j < contextAsks.length; j += 1) {
      const a = contextAsks[i];
      const b = contextAsks[j];
      if (a === void 0 || b === void 0) continue;
      if (!actorsIntersect(a.actors, b.actors)) continue;
      const [from, to] = (askOrder.get(a.id) ?? 0) <= (askOrder.get(b.id) ?? 0) ? [a.id, b.id] : [b.id, a.id];
      edges.push({ exact: contextExact(a.actors, b.actors), from, kind: "context", to });
    }
  }
  const deduped = dedupeEdges(edges);
  const hasIncomingData = /* @__PURE__ */ new Set();
  for (const edge of deduped) if (edge.kind === "data") hasIncomingData.add(edge.to);
  for (const node of siteNodes) {
    if (node.kind === "join") continue;
    if (!hasIncomingData.has(node.id)) {
      deduped.push({ exact: true, from: "source", kind: "data", to: node.id });
    }
  }
  const incident = /* @__PURE__ */ new Set();
  for (const edge of deduped) {
    incident.add(edge.from);
    incident.add(edge.to);
  }
  const keptNodes = siteNodes.filter(
    (node) => node.kind !== "join" && node.kind !== "fan-out" || incident.has(node.id)
  );
  const nodes = [SOURCE_NODE, ...keptNodes.map(stripOrder), SINK_NODE];
  const actors = sites.actors.map((actor) => ({
    id: actor.id,
    loc: actor.loc,
    ...actor.name === void 0 ? {} : { name: actor.name },
    ...actor.namePattern === void 0 ? {} : { namePattern: actor.namePattern },
    ...actor.within === void 0 ? {} : { within: actor.within }
  }));
  return { actors, edges: deduped, nodes };
}
function plainNode(site, kind, types) {
  const artifactType = types.siteType.get(site.id);
  return {
    id: site.id,
    kind,
    label: site.label,
    loc: site.loc,
    order: site.order,
    ...site.within === void 0 ? {} : { within: site.within },
    ...artifactType === void 0 ? {} : { artifactType }
  };
}
function stripOrder({ order: _order, ...node }) {
  return node;
}
function actorsIntersect(a, b) {
  const sites = new Set(a.map((occ) => occ.site));
  return b.some((occ) => sites.has(occ.site));
}
function contextExact(a, b) {
  if (a.length !== 1 || b.length !== 1) return false;
  const [oa] = a;
  const [ob] = b;
  return oa !== void 0 && ob !== void 0 && oa.site === ob.site && oa.exact && ob.exact;
}
function dedupeEdges(edges) {
  const byKey = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (isActorSite(edge.from) && edge.kind === "data") continue;
    const key = `${edge.from}|${edge.to}|${edge.kind}|${edge.port ?? ""}`;
    const existing = byKey.get(key);
    if (existing === void 0) {
      byKey.set(key, { ...edge });
    } else {
      if (edge.exact && !existing.exact) existing.exact = true;
      if (existing.type === void 0 && edge.type !== void 0) existing.type = edge.type;
    }
  }
  return [...byKey.values()];
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-reduce.ts
var KIND_RANK = {
  carry: 0,
  control: 4,
  data: 3,
  fifo: 2,
  seq: 1
};
var JUSTIFIED_BY = {
  // A hard dependency yields only to a path of hard dependencies. `data` and `control`
  // are both non-removable — no refactoring can make a consumer precede its producer,
  // or a guarded step precede its guard — so either one justifies either one. What this
  // does NOT yield to is `seq`/`fifo`: those are incidental serialization the reader is
  // meant to be able to delete mentally, and the constraint must survive that deletion.
  // This is what kills the phantom producer→sink edges the actor projection emitted
  // through relays, and what keeps `scan → judge` alive against the incidental
  // `scan → plan → review → judge`.
  //
  // Bug: `data` originally yielded to `data` alone, which kept every data fact that a
  // control edge already implied. In a refine-until-approved loop that is most of the
  // picture — `initial plan → revision` reads as a second arrow on top of
  // `initial plan → initial review → (guards) → revision`, saying nothing the chain
  // did not. Ordering-redundant arrows are pure ink here, because the renderer draws
  // every kind identically; a data edge earns its place only by asserting an order no
  // hard path already asserts.
  control: /* @__PURE__ */ new Set(["data", "control"]),
  data: /* @__PURE__ */ new Set(["data", "control"]),
  // FIFO yields to a real dependency or to another FIFO hop (a same-actor chain
  // already implies its own transitive closure), but never to bare serialization.
  // For example, `assess → refine → wrap up` already implies `assess → wrap up`.
  fifo: /* @__PURE__ */ new Set(["data", "control", "fifo"]),
  // Pure serialization yields to any ordering at all.
  seq: /* @__PURE__ */ new Set(["data", "control", "fifo", "seq"])
};
var underlyingOf = (edge) => edge.carryOf ?? "data";
function reduceOrdering(edges) {
  const dropped = /* @__PURE__ */ new Set();
  const forward = edges.filter((edge) => edge.kind !== "carry");
  const carries = edges.filter((edge) => edge.kind === "carry");
  const outgoing = /* @__PURE__ */ new Map();
  for (const edge of forward) {
    const list = outgoing.get(edge.from);
    if (list === void 0) outgoing.set(edge.from, [edge]);
    else list.push(edge);
  }
  const reaches = (from, to, allowed) => {
    const seen = /* @__PURE__ */ new Set([from]);
    const stack = [];
    for (const edge of outgoing.get(from) ?? []) {
      if (edge.to === to || !allowed.has(edge.kind) || dropped.has(edge)) continue;
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    while (stack.length > 0) {
      const node = stack.pop();
      for (const edge of outgoing.get(node) ?? []) {
        if (!allowed.has(edge.kind) || dropped.has(edge)) continue;
        if (edge.to === to) return true;
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          stack.push(edge.to);
        }
      }
    }
    return false;
  };
  for (const edge of forward) {
    const allowed = JUSTIFIED_BY[edge.kind];
    if (allowed === void 0) continue;
    if (edge.from === edge.to) continue;
    if (reaches(edge.from, edge.to, allowed)) dropped.add(edge);
  }
  const carryOutgoing = /* @__PURE__ */ new Map();
  for (const edge of carries) {
    const list = carryOutgoing.get(edge.from);
    if (list === void 0) carryOutgoing.set(edge.from, [edge]);
    else list.push(edge);
  }
  const carryWitness = (candidate, allowed) => {
    const seen = /* @__PURE__ */ new Set([`${candidate.from}\x000`]);
    const stack = [[candidate.from, 0]];
    while (stack.length > 0) {
      const [node, spent] = stack.pop();
      const push = (next, state) => {
        if (state === 1 && next === candidate.to) return true;
        const key = `${next}\0${state}`;
        if (!seen.has(key)) {
          seen.add(key);
          stack.push([next, state]);
        }
        return false;
      };
      for (const edge of outgoing.get(node) ?? []) {
        if (!allowed.has(edge.kind) || dropped.has(edge)) continue;
        if (push(edge.to, spent)) return true;
      }
      if (spent === 1) continue;
      for (const edge of carryOutgoing.get(node) ?? []) {
        if (edge === candidate || dropped.has(edge) || !allowed.has(underlyingOf(edge))) continue;
        if (push(edge.to, 1)) return true;
      }
    }
    return false;
  };
  for (const edge of carries) {
    const allowed = JUSTIFIED_BY[underlyingOf(edge)];
    if (allowed === void 0) continue;
    if (carryWitness(edge, allowed)) dropped.add(edge);
  }
  return edges.filter((edge) => !dropped.has(edge));
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/phase-graph.ts
var COPY_SEPARATOR = "~";
function headPhasesOf(claiming, toPhases) {
  if (toPhases === void 0) return [...claiming];
  const narrowed = claiming.filter((phase) => toPhases.has(phase));
  return narrowed.length > 0 ? narrowed : [...claiming];
}
function collectPhaseClaims(events, steps, certainChain, controlled) {
  const bySite = /* @__PURE__ */ new Map();
  const position = /* @__PURE__ */ new Map();
  const firstIssue = /* @__PURE__ */ new Map();
  const lastIssue = /* @__PURE__ */ new Map();
  const certainSeen = /* @__PURE__ */ new Set();
  let clock = 0;
  for (const event of events) {
    if (event.at !== "issue") continue;
    const at2 = clock;
    clock += 1;
    if (!steps.has(event.step)) continue;
    const claiming = bySite.get(event.step);
    if (claiming === void 0) bySite.set(event.step, [event.phase]);
    else if (!claiming.includes(event.phase)) claiming.push(event.phase);
    if (!position.has(event.phase)) position.set(event.phase, at2);
    const key = `${event.step}|${event.phase}`;
    if (!firstIssue.has(key)) firstIssue.set(key, at2);
    lastIssue.set(key, at2);
    if (certainChain(event.regions)) certainSeen.add(key);
  }
  const certainty = /* @__PURE__ */ new Map();
  for (const [site, claiming] of bySite) {
    for (const phase of claiming) {
      const key = `${site}|${phase}`;
      certainty.set(key, certainSeen.has(key) && !controlled.has(site) ? "always" : "maybe");
    }
  }
  return { bySite, certainty, firstIssue, lastIssue, position };
}
function projectPhaseGraph(graph, phases, claims, facts, sharesIteration) {
  if (phases.length === 0) return graph;
  const claimsOf = (siteId) => claims.bySite.get(siteId) ?? [UNPHASED_ID];
  const certaintyOfClaim = (siteId, phase) => claims.certainty.get(`${siteId}|${phase}`) ?? "maybe";
  const admits = (from, fromPhase, to, toPhase) => {
    const firstFrom = claims.firstIssue.get(`${from}|${fromPhase}`);
    const lastTo = claims.lastIssue.get(`${to}|${toPhase}`);
    if (firstFrom === void 0 || lastTo === void 0) return true;
    return lastTo > firstFrom || sharesIteration(from, to);
  };
  const ADMITTED_KINDS = /* @__PURE__ */ new Set(["data", "control", "seq"]);
  const copiesOf = /* @__PURE__ */ new Map();
  for (const step of graph.steps) {
    const siteId = step.source ?? step.id;
    const claiming = claimsOf(siteId);
    if (claiming.length < 2) continue;
    copiesOf.set(
      step.id,
      claiming.map((phase) => ({
        ...step,
        certainty: weakest([step.certainty, certaintyOfClaim(siteId, phase)]),
        id: `${step.id}${COPY_SEPARATOR}${phase}`,
        phase,
        // `source` 是运行时实际上报的站点 id，**只设一次**：车道拷贝已经带上了，沿用。
        source: siteId
      }))
    );
  }
  const steps = graph.steps.flatMap((step) => {
    const copies = copiesOf.get(step.id);
    if (copies !== void 0) return copies;
    return [{ ...step, phase: claimsOf(step.source ?? step.id)[0] }];
  });
  const stepById = new Map(graph.steps.map((step) => [step.id, step]));
  const siteOf = (id) => {
    const step = stepById.get(id);
    return step === void 0 ? id : step.source ?? step.id;
  };
  const provenance = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    if (fact.toPhases !== void 0) provenance.set(`${fact.from}|${fact.to}`, fact.toPhases);
  }
  const endpointsOf = (id, toPhases) => {
    const copies = copiesOf.get(id);
    if (copies !== void 0) {
      const heads = new Set(headPhasesOf(claimsOf(siteOf(id)), toPhases));
      return copies.filter((copy) => heads.has(copy.phase)).map((copy) => ({
        certainty: copy.certainty,
        id: copy.id,
        lane: copy.lane,
        phase: copy.phase
      }));
    }
    const step = stepById.get(id);
    return [
      {
        certainty: step?.certainty ?? "maybe",
        id,
        lane: step?.lane,
        phase: claimsOf(siteOf(id))[0]
      }
    ];
  };
  const edges = [];
  for (const edge of graph.edges) {
    if (!copiesOf.has(edge.from) && !copiesOf.has(edge.to)) {
      edges.push(edge);
      continue;
    }
    const fromSite = siteOf(edge.from);
    const toSite = siteOf(edge.to);
    const pairs = [];
    const admitted = [];
    for (const tail of endpointsOf(edge.from)) {
      for (const head of endpointsOf(edge.to, provenance.get(`${fromSite}|${toSite}`))) {
        if (edge.kind === "fifo" && tail.lane !== head.lane) continue;
        if (tail.id === head.id && edge.from !== edge.to) continue;
        const pair = {
          certainty: weakest([edge.certainty, tail.certainty, head.certainty]),
          from: tail.id,
          to: head.id
        };
        pairs.push(pair);
        if (!ADMITTED_KINDS.has(edge.kind) || admits(fromSite, tail.phase, toSite, head.phase)) {
          admitted.push(pair);
        }
      }
    }
    for (const pair of admitted.length > 0 ? admitted : pairs) {
      edges.push({ ...edge, ...pair });
    }
  }
  const members = new Set(steps.map((step) => step.phase));
  const phaseList = [];
  if (members.has(UNPHASED_ID)) phaseList.push({ id: UNPHASED_ID });
  for (const phase of phases) {
    if (!members.has(phase.id)) continue;
    phaseList.push({ id: phase.id, loc: phase.loc, name: phase.name });
  }
  const live = new Set(phaseList.map((phase) => phase.id));
  const quotient = [];
  for (const fact of facts) {
    const tails = claimsOf(fact.from);
    const heads = headPhasesOf(claimsOf(fact.to), fact.toPhases);
    const copied = tails.length > 1 || claimsOf(fact.to).length > 1;
    const gated = copied && ADMITTED_KINDS.has(fact.kind);
    const pairs = [];
    const admitted = [];
    for (const from of tails) {
      for (const to of heads) {
        pairs.push({ from, to });
        if (!gated || admits(fact.from, from, fact.to, to)) admitted.push({ from, to });
      }
    }
    for (const { from, to } of admitted.length > 0 ? admitted : pairs) {
      if (!live.has(from) || !live.has(to)) continue;
      if (from === to && fact.kind !== "carry") continue;
      quotient.push({
        certainty: fact.certainty,
        from,
        kind: fact.kind,
        to,
        ...fact.carryOf === void 0 ? {} : { carryOf: fact.carryOf }
      });
    }
  }
  const position = (id) => claims.position.get(id) ?? 0;
  const deduped = dedupePhaseFacts(quotient).sort(
    (a, b) => position(a.from) - position(b.from) || position(a.to) - position(b.to) || a.kind.localeCompare(b.kind)
  );
  const phaseEdges = reduceOrdering(deduped).map((fact) => ({
    certainty: fact.certainty,
    from: fact.from,
    kind: fact.kind,
    to: fact.to
  }));
  const sink = graph.sink;
  return {
    edges,
    lanes: graph.lanes,
    phaseEdges,
    phases: phaseList,
    regions: graph.regions,
    steps,
    // 阶段级 sink 边不出图（UI 由 fedBy step 的 phase 推导），但 fedBy 自己要跟着拷贝走。
    ...sink === void 0 ? {} : { sink: { fedBy: sink.fedBy.flatMap((id) => endpointsOf(id).map((end) => end.id)) } }
  };
}
function dedupePhaseFacts(facts) {
  const byPair = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    const key = `${fact.from}|${fact.to}`;
    const existing = byPair.get(key);
    if (existing === void 0) {
      byPair.set(key, { ...fact });
      continue;
    }
    if (KIND_RANK[fact.kind] > KIND_RANK[existing.kind]) existing.kind = fact.kind;
    if (existing.carryOf === void 0 && fact.carryOf !== void 0) existing.carryOf = fact.carryOf;
    if (fact.certainty === "maybe") existing.certainty = "maybe";
  }
  return [...byPair.values()];
}
function weakest(values) {
  return values.includes("maybe") ? "maybe" : "always";
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph-types.ts
var WORKSPACE_LANE = "workspace";
var UNKNOWN_LANE = "unknown";
var SINK_ID = "sink";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph-lanes.ts
var MAY_SET_LANE_CAP = 4;
var COPY_SEPARATOR2 = "~";
function expandMaySetLanes(graph) {
  const copiesOf = /* @__PURE__ */ new Map();
  for (const step of graph.steps) {
    const lanes = step.lanes ?? [];
    if (lanes.length < 2 || lanes.length > MAY_SET_LANE_CAP) continue;
    if (lanes.some((lane) => lane === WORKSPACE_LANE || lane === UNKNOWN_LANE)) continue;
    copiesOf.set(
      step.id,
      lanes.map((lane) => ({
        ...step,
        // The ask always runs; each copy may not. Certainty is per-node and the node
        // changed meaning, so this is the one field overridden rather than inherited.
        certainty: "maybe",
        id: `${step.id}${COPY_SEPARATOR2}${lane}`,
        lane,
        source: step.id
      }))
    );
  }
  if (copiesOf.size === 0) return graph;
  const stepById = new Map(graph.steps.map((step) => [step.id, step]));
  const endpointsOf = (id) => {
    const copies = copiesOf.get(id);
    if (copies !== void 0) {
      return copies.map((copy) => ({ certainty: copy.certainty, id: copy.id, lane: copy.lane }));
    }
    const step = stepById.get(id);
    return [{ certainty: step?.certainty, id, lane: step?.lane }];
  };
  const edges = [];
  for (const edge of graph.edges) {
    if (!copiesOf.has(edge.from) && !copiesOf.has(edge.to)) {
      edges.push(edge);
      continue;
    }
    for (const tail of endpointsOf(edge.from)) {
      for (const head of endpointsOf(edge.to)) {
        if (edge.kind === "fifo" && tail.lane !== head.lane) continue;
        edges.push({
          ...edge,
          // Endpoint inheritance, re-applied to the copies rather than a special case: a
          // copy is `maybe`, so every edge incident to one weakens. This is what keeps
          // refactoring invariance honest — the branch form `cond ? a.ask(p) : b.ask(p)`
          // already yields `maybe` steps and `maybe` edges into them, and the expanded
          // ternary must agree or the two identical programs draw different certainty.
          certainty: weakest2([
            edge.certainty,
            tail.certainty ?? edge.certainty,
            head.certainty ?? edge.certainty
          ]),
          from: tail.id,
          to: head.id
        });
      }
    }
  }
  const steps = graph.steps.flatMap((step) => copiesOf.get(step.id) ?? [step]);
  const sink = graph.sink;
  return {
    edges,
    lanes: graph.lanes,
    regions: graph.regions,
    steps,
    ...sink === void 0 ? {} : { sink: { fedBy: sink.fedBy.flatMap((id) => endpointsOf(id).map((end) => end.id)) } }
  };
}
function dedupeFacts(facts) {
  const byPair = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    const key = `${fact.from}|${fact.to}`;
    const existing = byPair.get(key);
    if (existing === void 0) {
      byPair.set(key, {
        ...fact,
        ...fact.toPhases === void 0 ? {} : { toPhases: new Set(fact.toPhases) }
      });
      continue;
    }
    if (KIND_RANK[fact.kind] > KIND_RANK[existing.kind]) existing.kind = fact.kind;
    if (fact.exact !== void 0 && existing.exact === void 0) existing.exact = fact.exact;
    else if (fact.exact === true) existing.exact = true;
    if (fact.certainty === "maybe") existing.certainty = "maybe";
    if (fact.viaJump !== true) delete existing.viaJump;
    if (fact.toPhases === void 0) delete existing.toPhases;
    else if (existing.toPhases !== void 0) {
      for (const phase of fact.toPhases) existing.toPhases.add(phase);
    }
  }
  return [...byPair.values()];
}
function weakest2(values) {
  return values.includes("maybe") ? "maybe" : "always";
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-graph.ts
function projectCausalityGraph(core, site) {
  const trace = core.trace;
  const regionById = new Map(trace.regions.map((region) => [region.id, region]));
  const stepNodes = site.nodes.filter(
    (node) => (node.kind === "ask" || node.kind === "world-read") && node.loc !== void 0
  );
  const stepIds = new Set(stepNodes.map((node) => node.id));
  const minIssue = /* @__PURE__ */ new Map();
  const maxIssue = /* @__PURE__ */ new Map();
  const innermostRegion = /* @__PURE__ */ new Map();
  const regionsOf = /* @__PURE__ */ new Map();
  const unconditional = /* @__PURE__ */ new Set();
  const actorRegions = /* @__PURE__ */ new Map();
  const settled = /* @__PURE__ */ new Map();
  const settledInside = /* @__PURE__ */ new Map();
  const facts = [];
  let clock = 0;
  const chainIsCertain = (chain) => chain.every((id) => {
    const region = regionById.get(id);
    if (region === void 0) return false;
    if (isStructuralRegionKind(region.kind)) return true;
    if (region.kind === "seq" || region.kind === "parallel") return true;
    return region.kind === "loop" && region.entered;
  });
  const homeOf = (chain) => {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const id = chain[i];
      const kind = regionById.get(id)?.kind;
      if (kind !== void 0 && !isStructuralRegionKind(kind)) return id;
    }
    return trace.root;
  };
  const frameOf = (regions2) => {
    for (let i = regions2.length - 1; i >= 0; i -= 1) {
      const id = regions2[i];
      if (regionById.get(id)?.strand === true) return id;
    }
    return trace.root;
  };
  const visibleFrames = (regions2) => {
    const out = /* @__PURE__ */ new Set([trace.root]);
    for (const id of regions2) if (regionById.get(id)?.strand === true) out.add(id);
    return out;
  };
  const visibleParent = (region) => {
    let parent = region.parent === void 0 ? void 0 : regionById.get(region.parent);
    while (parent !== void 0 && isStructuralRegionKind(parent.kind)) {
      parent = parent.parent === void 0 ? void 0 : regionById.get(parent.parent);
    }
    return parent?.id;
  };
  const deferredByStep = /* @__PURE__ */ new Map();
  for (const event of trace.events) {
    if (event.at === "mark") continue;
    if (event.at === "jump") {
      if (event.kind !== "continue" && event.kind !== "break") continue;
      let arm;
      for (let i = event.regions.length - 1; i >= 0; i -= 1) {
        const id = event.regions[i];
        if (id === event.target) break;
        if (regionById.get(id)?.kind === "branch") arm = id;
      }
      if (arm === void 0 || !event.regions.includes(event.target)) continue;
      for (const [step, regions2] of regionsOf) {
        if (!regions2.has(arm)) continue;
        const loops = deferredByStep.get(step) ?? /* @__PURE__ */ new Map();
        loops.set(event.target, event.kind);
        deferredByStep.set(step, loops);
      }
      continue;
    }
    if (event.at === "settle") {
      const frame = frameOf(event.regions);
      for (const step of event.steps) {
        const byFrame = settled.get(step) ?? /* @__PURE__ */ new Map();
        const prior = byFrame.get(frame);
        if (prior === void 0 || prior && !event.maybe) byFrame.set(frame, event.maybe);
        settled.set(step, byFrame);
      }
      for (const id of event.regions) {
        const set = settledInside.get(id) ?? /* @__PURE__ */ new Set();
        for (const step of event.steps) set.add(step);
        settledInside.set(id, set);
      }
      continue;
    }
    if (event.at === "actor") {
      if (!actorRegions.has(event.actor)) actorRegions.set(event.actor, event.regions);
      continue;
    }
    const at2 = clock;
    clock += 1;
    if (!minIssue.has(event.step)) {
      minIssue.set(event.step, at2);
      innermostRegion.set(event.step, homeOf(event.regions));
    }
    maxIssue.set(event.step, at2);
    const seen = regionsOf.get(event.step) ?? /* @__PURE__ */ new Set();
    for (const id of event.regions) seen.add(id);
    regionsOf.set(event.step, seen);
    if (chainIsCertain(event.regions)) unconditional.add(event.step);
    const visible = visibleFrames(event.regions);
    for (const [from, byFrame] of settled) {
      if (from === event.step) continue;
      let mayHaveSettled;
      for (const [frame, maybe] of byFrame) {
        if (!visible.has(frame)) continue;
        mayHaveSettled = mayHaveSettled === void 0 ? maybe : mayHaveSettled && maybe;
      }
      if (mayHaveSettled === void 0) continue;
      let viaJump = false;
      let unrealizable = false;
      for (const [loop, kind] of deferredByStep.get(from) ?? []) {
        if (!event.regions.includes(loop)) continue;
        if (kind === "break") unrealizable = true;
        else viaJump = true;
      }
      if (unrealizable) continue;
      facts.push({
        certainty: mayHaveSettled ? "maybe" : "always",
        from,
        kind: "seq",
        to: event.step,
        toPhases: /* @__PURE__ */ new Set([event.phase]),
        ...viaJump ? { viaJump: true } : {}
      });
    }
  }
  const laneSet = /* @__PURE__ */ new Map();
  for (const node of stepNodes) {
    if (node.kind === "world-read") {
      laneSet.set(node.id, [WORKSPACE_LANE]);
      continue;
    }
    const actors = node.actors ?? [];
    laneSet.set(node.id, actors.length > 0 ? [...actors] : [UNKNOWN_LANE]);
  }
  const familiesOf = (actorId) => (actorRegions.get(actorId) ?? []).filter((id) => {
    const kind = regionById.get(id)?.kind;
    return kind === "fanout" || kind === "loop";
  });
  const controlled = /* @__PURE__ */ new Set();
  for (const control of trace.controls) {
    for (const step of stepNodes) {
      if (!(regionsOf.get(step.id)?.has(control.region) ?? false)) continue;
      controlled.add(step.id);
      for (const controller of control.controllers) {
        if (controller === step.id || !stepIds.has(controller)) continue;
        facts.push({ certainty: "always", from: controller, kind: "control", to: step.id });
      }
      for (const controller of control.maybeControllers) {
        if (controller === step.id || !stepIds.has(controller)) continue;
        facts.push({ certainty: "maybe", from: controller, kind: "control", to: step.id });
      }
    }
  }
  const certaintyOf = (step) => unconditional.has(step) && !controlled.has(step) ? "always" : "maybe";
  for (const edge of site.edges) {
    if (edge.kind !== "data" || !stepIds.has(edge.from)) continue;
    if (edge.to !== SINK_ID && !stepIds.has(edge.to)) continue;
    facts.push({ certainty: "always", exact: edge.exact, from: edge.from, kind: "data", to: edge.to });
  }
  const issueOrder = [...stepNodes].sort(
    (a, b) => (minIssue.get(a.id) ?? 0) - (minIssue.get(b.id) ?? 0)
  );
  const realLanes = (step) => (laneSet.get(step) ?? []).filter((lane) => lane !== WORKSPACE_LANE && lane !== UNKNOWN_LANE);
  for (let i = 0; i < issueOrder.length; i += 1) {
    for (let j = i + 1; j < issueOrder.length; j += 1) {
      const a = issueOrder[i];
      const b = issueOrder[j];
      const lanesA = realLanes(a.id);
      const lanesB = realLanes(b.id);
      if (!lanesA.some((lane) => lanesB.includes(lane))) continue;
      const certainty = lanesA.length === 1 && lanesB.length === 1 ? "always" : "maybe";
      facts.push({ certainty, from: a.id, kind: "fifo", to: b.id });
    }
  }
  const repeat = /* @__PURE__ */ new Map();
  const markRepeat = (step, value) => {
    if (value === "serial" || !repeat.has(step)) repeat.set(step, value);
  };
  for (const region of trace.regions) {
    if (region.kind !== "loop" && region.kind !== "fanout") continue;
    const inside = issueOrder.filter((node) => regionsOf.get(node.id)?.has(region.id) ?? false);
    if (inside.length === 0) continue;
    const first = inside[0];
    const settledHere = inside.filter((node) => settledInside.get(region.id)?.has(node.id) ?? false);
    const last = settledHere[settledHere.length - 1];
    if (last !== void 0) {
      facts.push({ certainty: certaintyOf(last.id), from: last.id, kind: "seq", to: first.id });
    }
    for (const node of settledHere) markRepeat(node.id, "serial");
    const awaited = new Set(settledHere.map((node) => node.id));
    for (const node of inside) {
      if (awaited.has(node.id)) continue;
      const lanes = realLanes(node.id);
      const fixedActor = lanes.length === 1 && familiesOf(lanes[0]).length === 0;
      if (!fixedActor) {
        markRepeat(node.id, "stack");
        continue;
      }
      facts.push({ certainty: certaintyOf(node.id), from: node.id, kind: "fifo", to: node.id });
      markRepeat(node.id, "serial");
    }
  }
  const deduped = dedupeFacts(facts);
  const positionOf = (id) => id === SINK_ID ? Number.MAX_SAFE_INTEGER : minIssue.get(id) ?? 0;
  const lastIssueOf = (id) => id === SINK_ID ? Number.MAX_SAFE_INTEGER : maxIssue.get(id) ?? 0;
  const iterationRegionsOf = (id) => [...regionsOf.get(id) ?? []].filter((region) => {
    const kind = regionById.get(region)?.kind;
    return kind === "loop" || kind === "fanout";
  });
  const sharesIteration = (a, b) => {
    const enclosing = new Set(iterationRegionsOf(b));
    return iterationRegionsOf(a).some((region) => enclosing.has(region));
  };
  const realizableCarry = (from, to) => {
    if (from === to) {
      return iterationRegionsOf(to).length > 0 || lastIssueOf(to) > positionOf(to);
    }
    return sharesIteration(from, to);
  };
  const typed = [];
  for (const fact of deduped) {
    const back = fact.viaJump === true || fact.from === fact.to || lastIssueOf(fact.to) <= positionOf(fact.from);
    if (!back) {
      typed.push(fact);
      continue;
    }
    if (!realizableCarry(fact.from, fact.to)) continue;
    const { exact: _exact, kind, ...rest } = fact;
    typed.push({
      // `toPhases` rides along in `rest`: retyping changes WHEN the fact holds (next
      // round), not WHERE it was witnessed.
      ...rest,
      kind: "carry",
      // 保留底层 kind：carry 最小化需要知道回边改型前是硬依赖还是纯顺序。
      ...kind === "carry" ? {} : { carryOf: kind }
    });
  }
  const reduced = reduceOrdering(typed);
  const edges = [];
  const fedBy = [];
  const phaseFacts = [];
  for (const fact of reduced) {
    const certainty = weakest2([fact.certainty, certaintyOf(fact.from), certaintyOf(fact.to)]);
    if (fact.to === SINK_ID) {
      fedBy.push(fact.from);
      continue;
    }
    phaseFacts.push({
      certainty,
      from: fact.from,
      kind: fact.kind,
      to: fact.to,
      ...fact.carryOf === void 0 ? {} : { carryOf: fact.carryOf },
      ...fact.toPhases === void 0 ? {} : { toPhases: fact.toPhases }
    });
    edges.push({
      certainty,
      from: fact.from,
      kind: fact.kind,
      to: fact.to,
      ...fact.kind === "data" && fact.exact !== void 0 ? { exact: fact.exact } : {}
    });
  }
  edges.sort(
    (a, b) => positionOf(a.from) - positionOf(b.from) || positionOf(a.to) - positionOf(b.to) || a.kind.localeCompare(b.kind)
  );
  fedBy.sort((a, b) => positionOf(a) - positionOf(b));
  const usedLanes = /* @__PURE__ */ new Set();
  for (const node of stepNodes) for (const lane of laneSet.get(node.id) ?? []) usedLanes.add(lane);
  const laneOrder = [];
  if (usedLanes.has(WORKSPACE_LANE)) laneOrder.push({ id: WORKSPACE_LANE });
  for (const actor of site.actors) {
    if (!usedLanes.has(actor.id)) continue;
    const families = familiesOf(actor.id);
    laneOrder.push({
      id: actor.id,
      loc: actor.loc,
      ...actor.name === void 0 ? {} : { name: actor.name },
      ...actor.namePattern === void 0 ? {} : { namePattern: actor.namePattern },
      ...families.length > 0 ? { families } : {}
    });
  }
  if (usedLanes.has(UNKNOWN_LANE)) laneOrder.push({ id: UNKNOWN_LANE });
  const keep = /* @__PURE__ */ new Set();
  const keepWithAncestors = (id) => {
    let current = id;
    while (current !== void 0 && !keep.has(current)) {
      keep.add(current);
      current = regionById.get(current)?.parent;
    }
  };
  for (const node of stepNodes) keepWithAncestors(innermostRegion.get(node.id) ?? trace.root);
  for (const lane of laneOrder) for (const family of lane.families ?? []) keepWithAncestors(family);
  const rename = /* @__PURE__ */ new Map();
  const counters = /* @__PURE__ */ new Map();
  const regions = [];
  for (const region of trace.regions) {
    if (!keep.has(region.id)) continue;
    if (isStructuralRegionKind(region.kind)) continue;
    const next = (counters.get(region.kind) ?? 0) + 1;
    counters.set(region.kind, next);
    const id = `${region.kind}#${next}`;
    rename.set(region.id, id);
    const visible = visibleParent(region);
    const parent = visible === void 0 ? void 0 : rename.get(visible);
    regions.push({
      id,
      kind: region.kind,
      ...parent === void 0 ? {} : { parent },
      ...region.loc === void 0 ? {} : { loc: region.loc },
      ...region.bound === void 0 ? {} : { bound: region.bound },
      ...region.label === void 0 ? {} : { label: region.label }
    });
  }
  const renamed = (id) => rename.get(id) ?? id;
  for (const lane of laneOrder) {
    if (lane.families !== void 0) lane.families = lane.families.map(renamed);
  }
  const steps = stepNodes.map((node) => {
    const lanes = laneSet.get(node.id) ?? [UNKNOWN_LANE];
    const repeats = repeat.get(node.id);
    return {
      certainty: certaintyOf(node.id),
      id: node.id,
      kind: node.kind,
      label: node.label,
      ...node.labelPattern === void 0 ? {} : { labelPattern: node.labelPattern },
      lane: lanes[0],
      loc: node.loc,
      region: renamed(innermostRegion.get(node.id) ?? trace.root),
      ...lanes.length > 1 ? { lanes } : {},
      ...repeats === void 0 ? {} : { repeat: repeats }
    };
  });
  const expanded = expandMaySetLanes({
    edges,
    lanes: laneOrder,
    regions,
    steps,
    ...fedBy.length > 0 ? { sink: { fedBy } } : {}
  });
  return projectPhaseGraph(
    expanded,
    trace.phases,
    collectPhaseClaims(trace.events, stepIds, chainIsCertain, controlled),
    phaseFacts,
    sharesIteration
  );
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-phase.ts
function collectFlowPhases(trace, nodes) {
  const present = new Set(nodes.map((node) => node.phase));
  const rank = new Map(trace.phases.map((phase, index) => [phase.id, index + 1]));
  rank.set(UNPHASED_ID, 0);
  const at2 = (id) => rank.get(id) ?? rank.size;
  const running = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (node.alongside === void 0) continue;
    const into = running.get(node.phase) ?? /* @__PURE__ */ new Set();
    for (const id of node.alongside) if (id !== node.phase) into.add(id);
    running.set(node.phase, into);
  }
  const alongsideOf = (id) => {
    const ids = [...running.get(id) ?? []].sort((a, b) => at2(a) - at2(b));
    return ids.length === 0 ? {} : { alongside: ids };
  };
  const out = [];
  if (present.has(UNPHASED_ID)) out.push({ id: UNPHASED_ID, ...alongsideOf(UNPHASED_ID) });
  for (const phase of trace.phases) {
    if (present.has(phase.id)) {
      out.push({ id: phase.id, loc: phase.loc, name: phase.name, ...alongsideOf(phase.id) });
    }
  }
  return out;
}
function quotientFlow(nodes, edges, phases) {
  const phaseOf = new Map(nodes.map((node) => [node.id, node.phase]));
  const rank = new Map(phases.map((phase, index) => [phase.id, index]));
  rank.set(FLOW_ENTRY, -1);
  rank.set(FLOW_SINK, phases.length);
  rank.set(FLOW_ABORT, phases.length + 1);
  const at2 = (id) => rank.get(id) ?? phases.length + 2;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const edge of edges) {
    const from = phaseOf.get(edge.from) ?? edge.from;
    const to = phaseOf.get(edge.to) ?? edge.to;
    if (from === to && edge.kind !== "loop") continue;
    const key = `${from}|${to}|${edge.kind}|${edge.via ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, kind: edge.kind, to, ...edge.via === void 0 ? {} : { via: edge.via } });
  }
  out.sort(
    (a, b) => at2(a.from) - at2(b.from) || at2(a.to) - at2(b.to) || a.kind.localeCompare(b.kind) || (a.via ?? "").localeCompare(b.via ?? "")
  );
  return out;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-strands.ts
function createStrandPark(phases) {
  const parked = /* @__PURE__ */ new Map();
  const rank = new Map(phases.map((phase, index) => [phase.id, index + 1]));
  rank.set(UNPHASED_ID, 0);
  const at2 = (id) => rank.get(id) ?? rank.size;
  return {
    alongside: (phase, regions) => {
      const enclosing = new Set(regions);
      const running = /* @__PURE__ */ new Set();
      for (const [region, strand] of parked) {
        if (enclosing.has(region)) continue;
        for (const id of strand.phases) if (id !== phase) running.add(id);
      }
      return [...running].sort((a, b) => at2(a) - at2(b));
    },
    discard: () => parked.clear(),
    drain: () => {
      const out = [...parked.values()].flatMap((strand) => strand.exits);
      parked.clear();
      return out;
    },
    join: (regions) => {
      const out = [];
      for (const region of regions) {
        const strand = parked.get(region);
        if (strand === void 0) continue;
        parked.delete(region);
        out.push(...strand.exits);
      }
      return out;
    },
    park: (region, exits, phaseIds) => {
      parked.set(region, { exits: [...exits], phases: [...phaseIds] });
    }
  };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-tree.ts
function buildTree(trace) {
  const byId = /* @__PURE__ */ new Map();
  for (const region of trace.regions) {
    byId.set(region.id, { children: [], first: Number.POSITIVE_INFINITY, region, type: "region" });
  }
  for (const region of trace.regions) {
    if (region.parent === void 0) continue;
    byId.get(region.parent)?.children.push(byId.get(region.id));
  }
  trace.events.forEach((event, index) => {
    const home = event.regions[event.regions.length - 1] ?? trace.root;
    byId.get(home)?.children.push({ event, index, type: "leaf" });
  });
  const firstOf = (node) => node.type === "leaf" ? node.index : node.first;
  const order = (node) => {
    if (node.type === "leaf") return node.index;
    for (const child of node.children) node.first = Math.min(node.first, order(child));
    node.children.sort((a, b) => firstOf(a) - firstOf(b));
    return node.first;
  };
  const root = byId.get(trace.root);
  order(root);
  return { byId, root };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-graph.ts
var FLOW_ENTRY = "entry";
var FLOW_SINK = "sink";
var FLOW_ABORT = "abort";
var RANK = {
  next: 0,
  branch: 1,
  fork: 1,
  exit: 2,
  join: 2,
  jump: 2,
  loop: 3,
  throw: 4,
  "may-throw": 4
};
function retype(srcs, kind, via) {
  return srcs.map(
    (src) => RANK[kind] > RANK[src.kind] ? { from: src.from, kind, ...via === void 0 ? {} : { via } } : src
  );
}
function settle(srcs, kind, via) {
  return srcs.map((src) => ({ from: src.from, kind, ...via === void 0 ? {} : { via } }));
}
function dedupeSrcs(srcs) {
  const seen = /* @__PURE__ */ new Set();
  return srcs.filter((src) => {
    const key = `${src.from}|${src.kind}|${src.via ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function jumpEdge(kind) {
  switch (kind) {
    case "continue":
      return { kind: "loop", via: "continue" };
    case "recur":
      return { kind: "loop", via: "recur" };
    case "break":
      return { kind: "exit", via: "break" };
    case "return":
      return { kind: "jump", via: "return" };
    case "throw":
      return { kind: "throw" };
  }
}
function projectControlFlow(core) {
  const trace = core.trace;
  const { byId, root } = buildTree(trace);
  const nodes = [];
  const edges = [];
  const edgeKeys = /* @__PURE__ */ new Set();
  const pending = [];
  const occurrences = /* @__PURE__ */ new Map();
  const park = createStrandPark(trace.phases);
  let placeholders = 0;
  const emit = (from, to, kind, via) => {
    const key = `${from}|${to}|${kind}|${via ?? ""}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, kind, to, ...via === void 0 ? {} : { via } });
  };
  const connect = (srcs, to) => {
    for (const src of srcs) emit(src.from, to, src.kind, src.via);
  };
  const take = (target, kinds) => {
    const out = [];
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const entry = pending[i];
      if (entry.target !== target || !kinds.includes(entry.kind)) continue;
      out.unshift(...entry.srcs);
      pending.splice(i, 1);
    }
    return out;
  };
  const enclosingAttempt = (region) => {
    let parent = region.parent === void 0 ? void 0 : byId.get(region.parent)?.region;
    while (parent !== void 0) {
      if (parent.kind === "attempt") return parent.id;
      parent = parent.parent === void 0 ? void 0 : byId.get(parent.parent)?.region;
    }
    return void 0;
  };
  const raiseOutward = (from, srcs) => {
    if (srcs.length === 0) return;
    const attempt = enclosingAttempt(from);
    if (attempt === void 0) connect(srcs, FLOW_ABORT);
    else pending.push({ kind: "throw", srcs: [...srcs], target: attempt });
  };
  const subtreeIds = (node, into = /* @__PURE__ */ new Set()) => {
    into.add(node.region.id);
    for (const child of node.children) if (child.type === "region") subtreeIds(child, into);
    return into;
  };
  const leaf = (node, incoming) => {
    const { event } = node;
    if (event.at === "actor") return [...incoming];
    if (event.at === "settle") return [...incoming, ...park.join(event.joins ?? [])];
    if (event.at === "jump") {
      const { kind, via } = jumpEdge(event.kind);
      pending.push({ kind: event.kind, srcs: retype(incoming, kind, via), target: event.target });
      return [];
    }
    const key = event.at === "issue" ? event.step : event.phase;
    const k = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, k);
    const id = `${key}@${k}`;
    const alongside = event.at === "mark" ? park.alongside(event.phase, event.regions) : [];
    nodes.push({
      id,
      kind: event.at,
      ...event.at === "issue" ? { site: event.step } : {},
      phase: event.phase,
      ...alongside.length === 0 ? {} : { alongside }
    });
    connect(incoming, id);
    return [{ from: id, kind: "next" }];
  };
  const sequence = (children, incoming) => {
    let cur = [...incoming];
    for (const child of children) cur = flow(child, cur);
    return cur;
  };
  const withEntries = (children, incoming) => {
    placeholders += 1;
    const ph = `$entry${placeholders}`;
    const pendingMark = pending.length;
    const exits2 = sequence(children, [{ from: ph, kind: "next" }]);
    const entries = [];
    for (let i = edges.length - 1; i >= 0; i -= 1) {
      const edge = edges[i];
      if (edge.from !== ph) continue;
      edges.splice(i, 1);
      edgeKeys.delete(`${edge.from}|${edge.to}|${edge.kind}|${edge.via ?? ""}`);
      if (!entries.includes(edge.to)) entries.unshift(edge.to);
      connect(retype(incoming, edge.kind, edge.via), edge.to);
    }
    for (const entry of pending.slice(pendingMark)) {
      entry.srcs = entry.srcs.flatMap(
        (src) => src.from === ph ? incoming.map((real) => ({ ...src, from: real.from })) : [src]
      );
    }
    return {
      entries,
      exits: exits2.filter((src) => src.from !== ph),
      passed: exits2.some((src) => src.from === ph) ? [...incoming] : []
    };
  };
  const choice = (node, incoming) => {
    const { region } = node;
    let cur = [...incoming];
    const exits2 = [];
    let carried = [];
    let sawArm = false;
    for (const child of node.children) {
      if (child.type !== "region" || child.region.kind !== "branch") {
        cur = flow(child, cur);
        continue;
      }
      sawArm = true;
      const armExits = sequence(child.children, [...retype(cur, "branch"), ...carried]);
      if (region.fallthrough) carried = armExits;
      else exits2.push(...armExits);
    }
    if (region.fallthrough) exits2.push(...carried);
    if (!region.exhaustive || !sawArm) exits2.push(...retype(cur, "branch"));
    exits2.push(...settle(take(region.id, ["break"]), "branch"));
    return exits2;
  };
  const loop = (node, incoming) => {
    const { region } = node;
    const { entries, exits: bodyExits, passed } = withEntries(node.children, incoming);
    const breaks = take(region.id, ["break"]);
    const jumpsBack = take(region.id, ["continue", "recur"]);
    if (region.recursive) {
      for (const src of jumpsBack) for (const entry of entries) emit(src.from, entry, src.kind, src.via);
      return [...bodyExits, ...passed, ...breaks];
    }
    const back = [...retype(bodyExits, "loop"), ...jumpsBack];
    for (const src of back) for (const entry of entries) emit(src.from, entry, src.kind, src.via);
    if (entries.length === 0) {
      return dedupeSrcs([...bodyExits, ...passed, ...breaks, ...region.entered ? [] : incoming]);
    }
    const exits2 = [...retype(bodyExits, "exit"), ...retype(passed, "exit"), ...breaks];
    if (!region.entered) exits2.push(...retype(incoming, "exit"));
    return dedupeSrcs(exits2);
  };
  const fanout = (node, incoming) => {
    const { entries, exits: bodyExits, passed } = withEntries(node.children, retype(incoming, "fork"));
    const returns = settle(take(node.region.id, ["return"]), "join", "return");
    if (entries.length === 0) return dedupeSrcs([...bodyExits, ...passed, ...returns]);
    return dedupeSrcs([...retype(bodyExits, "join"), ...retype(passed, "join"), ...returns]);
  };
  const strandRegion = (node, incoming) => {
    const nodeMark = nodes.length;
    const spawner = new Set(incoming.map((src) => src.from));
    const { exits: bodyExits } = withEntries(node.children, retype(incoming, "fork"));
    const returns = settle(take(node.region.id, ["return"]), "join", "return");
    const all = dedupeSrcs([...retype(bodyExits, "join"), ...returns]);
    const exits2 = all.filter((src) => !spawner.has(src.from));
    const phases2 = new Set(nodes.slice(nodeMark).map((inner) => inner.phase));
    if (exits2.length > 0 || phases2.size > 0) park.park(node.region.id, exits2, [...phases2]);
    return [...incoming];
  };
  const call = (node, incoming) => [
    ...sequence(node.children, incoming),
    ...settle(take(node.region.id, ["return"]), "next")
  ];
  const tryGroup = (node, incoming) => {
    const part = (kind) => node.children.find((child) => child.type === "region" && child.region.kind === kind);
    const attempt = part("attempt");
    const handler = part("catch");
    const finalizer = part("finally");
    if (attempt === void 0) return sequence(node.children, incoming);
    const inside = subtreeIds(node);
    const pendingMark = pending.length;
    const nodeMark = nodes.length;
    let normal = sequence(attempt.children, incoming);
    let raised = [
      ...nodes.slice(nodeMark).filter((n) => n.kind === "issue").map((n) => ({ from: n.id, kind: "may-throw" })),
      ...take(attempt.region.id, ["throw"])
    ];
    if (handler !== void 0) {
      normal = [...normal, ...sequence(handler.children, raised)];
      raised = [];
    }
    if (finalizer === void 0) {
      raiseOutward(node.region, raised);
      return normal;
    }
    const escaping = [];
    for (let i = pending.length - 1; i >= pendingMark; i -= 1) {
      const entry = pending[i];
      if (inside.has(entry.target)) continue;
      escaping.unshift(entry);
      pending.splice(i, 1);
    }
    const finallyExits = sequence(finalizer.children, [
      ...normal,
      ...raised,
      ...escaping.flatMap((entry) => entry.srcs)
    ]);
    for (const entry of escaping) {
      const { kind, via } = jumpEdge(entry.kind);
      pending.push({ kind: entry.kind, srcs: retype(finallyExits, kind, via), target: entry.target });
    }
    if (raised.length > 0) raiseOutward(node.region, retype(finallyExits, "throw"));
    return normal.length > 0 ? finallyExits : [];
  };
  const flow = (node, incoming) => dedupeSrcs(flowRaw(node, incoming));
  const flowRaw = (node, incoming) => {
    if (node.type === "leaf") return leaf(node, incoming);
    if (node.region.strand === true) return strandRegion(node, incoming);
    switch (node.region.kind) {
      case "choice":
        return choice(node, incoming);
      case "loop":
        return loop(node, incoming);
      case "fanout":
        return fanout(node, incoming);
      case "call":
        return call(node, incoming);
      case "try":
        return tryGroup(node, incoming);
      default:
        return sequence(node.children, incoming);
    }
  };
  const detached = root.children.filter(
    (child) => child.type === "region" && child.region.detached === true
  );
  const main = root.children.filter((child) => !detached.includes(child));
  const exits = sequence(main, [{ from: FLOW_ENTRY, kind: "next" }]);
  connect(exits, FLOW_SINK);
  connect(take(trace.root, ["return"]), FLOW_SINK);
  connect(take(trace.root, ["throw"]), FLOW_ABORT);
  connect(park.drain(), FLOW_SINK);
  for (const body of detached) {
    const pendingMark = pending.length;
    const nodeMark = nodes.length;
    sequence(body.children, []);
    for (const node of nodes.slice(nodeMark)) node.detached = true;
    pending.splice(pendingMark);
    park.discard();
  }
  sortEdges(nodes, edges);
  const phases = collectFlowPhases(trace, nodes);
  return {
    edges,
    nodes,
    ...trace.phases.length === 0 ? {} : { phaseEdges: quotientFlow(nodes, edges, phases), phases }
  };
}
function sortEdges(nodes, edges) {
  const rank = new Map(nodes.map((node, index) => [node.id, index]));
  rank.set(FLOW_ENTRY, -1);
  rank.set(FLOW_SINK, nodes.length);
  rank.set(FLOW_ABORT, nodes.length + 1);
  const at2 = (id) => rank.get(id) ?? nodes.length + 2;
  edges.sort(
    (a, b) => at2(a.from) - at2(b.from) || at2(a.to) - at2(b.to) || a.kind.localeCompare(b.kind) || (a.via ?? "").localeCompare(b.via ?? "")
  );
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/handoff-graph.ts
var UNPHASED = "unphased";
var FANOUT_EXPAND_CAP = 8;
function projectHandoffGraph(core, causality, sites) {
  const phaseIds = causality.phases === void 0 ? [UNPHASED] : causality.phases.map((phase) => phase.id);
  const stepIndex = new Map(causality.steps.map((step, index) => [step.id, index]));
  const stepById = new Map(causality.steps.map((step) => [step.id, step]));
  const phaseOf = (step) => step.phase ?? UNPHASED;
  const cardsByPhase = /* @__PURE__ */ new Map();
  const cardsOfStep = /* @__PURE__ */ new Map();
  for (const phase of phaseIds) cardsByPhase.set(phase, []);
  for (const step of causality.steps) {
    const phase = phaseOf(step);
    const cards = cardsByPhase.get(phase);
    if (cards === void 0) continue;
    const lane = step.lane;
    const existing = cards.filter((card) => card.participant.lane === lane);
    if (existing.length > 0) {
      for (const card of existing) card.participant.steps.push(step.id);
      cardsOfStep.set(step.id, existing.map((card) => card.participant.id));
      continue;
    }
    const multiplicity = familyMultiplicity(core, lane);
    const firstStep = stepIndex.get(step.id) ?? 0;
    const fresh = [];
    if (multiplicity.kind === "members") {
      for (let index = 0; index < multiplicity.of; index += 1) {
        fresh.push({
          firstStep,
          participant: { id: `${phase}:${lane}[${index}]`, lane, member: { index, of: multiplicity.of }, phase, steps: [step.id] }
        });
      }
    } else {
      fresh.push({
        firstStep,
        participant: { id: `${phase}:${lane}`, lane, phase, steps: [step.id], ...multiplicity.kind === "many" ? { many: true } : {} }
      });
    }
    cards.push(...fresh);
    cardsOfStep.set(step.id, fresh.map((card) => card.participant.id));
  }
  const pairs = /* @__PURE__ */ new Map();
  for (const edge of causality.edges) {
    const from = stepById.get(edge.from);
    const to = stepById.get(edge.to);
    if (from === void 0 || to === void 0 || phaseOf(from) !== phaseOf(to)) continue;
    if (from.lane === to.lane) continue;
    const isCarry = edge.kind === "carry";
    for (const a of cardsOfStep.get(from.id) ?? []) {
      for (const b of cardsOfStep.get(to.id) ?? []) {
        if (a === b) continue;
        const key = `${a}\0${b}`;
        const pair = pairs.get(key);
        if (pair === void 0) pairs.set(key, { allCarry: isCarry, from: a, kind: "seq", to: b });
        else pair.allCarry = pair.allCarry && isCarry;
      }
    }
  }
  const reducible = [...pairs.values()].map(
    (pair) => pair.allCarry ? { ...pair, carryOf: "seq", kind: "carry" } : pair
  );
  const reduced = reduceOrdering(reducible);
  const siteOf = (stepId) => stepById.get(stepId)?.source ?? stepId;
  const sitesOfCard = /* @__PURE__ */ new Map();
  for (const cards of cardsByPhase.values()) {
    for (const card of cards) sitesOfCard.set(card.participant.id, new Set(card.participant.steps.map(siteOf)));
  }
  const typesBetween = (from, to) => {
    const fromSites = sitesOfCard.get(from);
    const toSites = sitesOfCard.get(to);
    if (fromSites === void 0 || toSites === void 0) return [];
    const types = [];
    for (const edge of sites.edges) {
      if (edge.kind !== "data" || edge.type === void 0) continue;
      if (!fromSites.has(edge.from) || !toSites.has(edge.to)) continue;
      if (!types.includes(edge.type)) types.push(edge.type);
    }
    return types;
  };
  const forwardOut = /* @__PURE__ */ new Map();
  for (const edge of reduced) {
    if (edge.kind === "carry") continue;
    const list = forwardOut.get(edge.from);
    if (list === void 0) forwardOut.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const participants = [];
  const position = /* @__PURE__ */ new Map();
  for (const phase of phaseIds) {
    const cards = cardsByPhase.get(phase) ?? [];
    const rank = longestPathRanks(cards.map((card) => card.participant.id), forwardOut);
    const sorted = [...cards].sort((a, b) => {
      const byRank = (rank.get(a.participant.id) ?? 0) - (rank.get(b.participant.id) ?? 0);
      if (byRank !== 0) return byRank;
      const byStep = a.firstStep - b.firstStep;
      if (byStep !== 0) return byStep;
      return (a.participant.member?.index ?? 0) - (b.participant.member?.index ?? 0);
    });
    for (const card of sorted) {
      position.set(card.participant.id, participants.length);
      participants.push(card.participant);
    }
  }
  const handoffs = reduced.map((edge) => {
    const types = typesBetween(edge.from, edge.to);
    return {
      from: edge.from,
      to: edge.to,
      ...edge.kind === "carry" ? { back: true } : {},
      ...types.length > 0 ? { types } : {}
    };
  }).sort((a, b) => (position.get(a.from) ?? 0) - (position.get(b.from) ?? 0) || (position.get(a.to) ?? 0) - (position.get(b.to) ?? 0));
  return { handoffs, participants };
}
function familyMultiplicity(core, lane) {
  if (lane === WORKSPACE_LANE || lane === UNKNOWN_LANE) return { kind: "single" };
  const actor = core.sites.actors.find((site) => site.id === lane);
  if (actor === void 0 || actor.within === void 0) return { kind: "single" };
  const fanoutById = new Map(core.sites.fanouts.map((site) => [site.id, site]));
  let product = 1;
  let within = actor.within;
  while (within !== void 0) {
    const fanout = fanoutById.get(within);
    if (fanout === void 0 || fanout.cardinality === void 0) return { kind: "many" };
    product *= fanout.cardinality;
    if (product > FANOUT_EXPAND_CAP) return { kind: "many" };
    within = fanout.within;
  }
  return { kind: "members", of: product };
}
function longestPathRanks(ids, out) {
  const members = new Set(ids);
  const state = /* @__PURE__ */ new Map();
  const closing = /* @__PURE__ */ new Set();
  const mark = (id) => {
    state.set(id, "open");
    for (const next of out.get(id) ?? []) {
      if (!members.has(next)) continue;
      const s = state.get(next);
      if (s === "open") closing.add(`${id} ${next}`);
      else if (s === void 0) mark(next);
    }
    state.set(id, "done");
  };
  for (const id of ids) if (state.get(id) === void 0) mark(id);
  const rank = /* @__PURE__ */ new Map();
  const postorder = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = (id) => {
    seen.add(id);
    for (const next of out.get(id) ?? []) {
      if (members.has(next) && !closing.has(`${id} ${next}`) && !seen.has(next)) walk(next);
    }
    postorder.push(id);
  };
  for (const id of ids) if (!seen.has(id)) walk(id);
  for (const id of ids) rank.set(id, 0);
  for (const id of postorder.reverse()) {
    const here = rank.get(id) ?? 0;
    for (const next of out.get(id) ?? []) {
      if (!members.has(next) || closing.has(`${id} ${next}`)) continue;
      rank.set(next, Math.max(rank.get(next) ?? 0, here + 1));
    }
  }
  return rank;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/analyze.ts
function analyzeWorkflowScript(scriptText) {
  const workflow = createWorkflowProgram(scriptText);
  const diagnostics = collectDiagnostics(workflow.program);
  if (diagnostics.length > 0) return { declaredArtifacts: [], diagnostics, ok: false };
  const table = collectSites(workflow);
  const misuse = collectFacadeMisuse(workflow, table);
  if (misuse.length > 0) return { declaredArtifacts: [], diagnostics: misuse, ok: false };
  const worldRun = collectWorldRunCommands(workflow, table);
  const artifacts = collectArtifactDeclarations(workflow, table);
  const authoring = [
    ...worldRun.diagnostics,
    ...artifacts.diagnostics,
    ...collectPhaseMarkerDiagnostics(workflow, table),
    ...collectDuplicateActorNames(workflow, table)
  ];
  const withholding = authoring.filter((d) => d.code !== FANOUT_ACTOR_NAME_CODE);
  if (withholding.length > 0) {
    return { declaredArtifacts: artifacts.declaredArtifacts, diagnostics: authoring, ok: false };
  }
  const core = interpret(workflow, table);
  const graph = projectSiteGraph(core);
  const causality = projectCausalityGraph(core, graph);
  return {
    causality,
    core,
    declaredArtifacts: artifacts.declaredArtifacts,
    diagnostics: authoring,
    flow: projectControlFlow(core),
    graph,
    handoff: projectHandoffGraph(core, causality, graph),
    ok: authoring.length === 0
  };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/actor-graph.ts
var SOURCE = "source";
var SINK = "sink";
var WORKSPACE = "workspace";
function toActorGraph(graph) {
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const actorsOf = new Map(
    graph.nodes.filter((node) => node.kind === "ask").map((node) => [node.id, node.actors ?? []])
  );
  const project = (id) => {
    if (id === SOURCE || id === SINK) return [id];
    const kind = kindOf.get(id);
    if (kind === "world-read") return [WORKSPACE];
    if (kind === "ask") return actorsOf.get(id) ?? [];
    return [];
  };
  const agg = /* @__PURE__ */ new Map();
  const contribute = (from, to, exact, type) => {
    const key = `${from}|${to}`;
    const existing = agg.get(key);
    if (existing === void 0) {
      agg.set(key, { count: 1, exact, from, to, ...type === void 0 ? {} : { types: [type] } });
      return;
    }
    existing.count += 1;
    existing.exact = existing.exact || exact;
    if (type !== void 0) {
      const types = existing.types ??= [];
      if (!types.includes(type)) types.push(type);
    }
  };
  for (const edge of graph.edges) {
    if (edge.kind !== "data") continue;
    if (edge.from === SOURCE && kindOf.get(edge.to) === "world-read") continue;
    const fromNodes = project(edge.from);
    const toNodes = project(edge.to);
    if (fromNodes.length === 0 || toNodes.length === 0) continue;
    const exact = edge.exact && fromNodes.length === 1 && toNodes.length === 1;
    for (const from of fromNodes) for (const to of toNodes) contribute(from, to, exact, edge.type);
  }
  const isEndpoint = (id) => id === SOURCE || id === SINK || id === WORKSPACE;
  const kept = [...agg.values()].filter((edge) => !(isEndpoint(edge.from) && isEndpoint(edge.to)));
  const incident = /* @__PURE__ */ new Set();
  for (const edge of kept) {
    incident.add(edge.from);
    incident.add(edge.to);
  }
  const nodes = [];
  if (incident.has(SOURCE)) nodes.push({ id: SOURCE });
  if (incident.has(WORKSPACE)) nodes.push({ id: WORKSPACE });
  for (const actor of graph.actors) {
    nodes.push({
      id: actor.id,
      loc: actor.loc,
      ...actor.name === void 0 ? {} : { name: actor.name },
      ...actor.within === void 0 ? {} : { family: actor.within }
    });
  }
  if (incident.has(SINK)) nodes.push({ id: SINK });
  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const rank = (id) => position.get(id) ?? Number.MAX_SAFE_INTEGER;
  const edges = kept.sort((a, b) => rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to));
  return { edges, nodes };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/mermaid.ts
function safeId(id) {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}
function escapeLabel(text) {
  return text.replace(/`/g, "").replace(/[\r\n]+/g, " ").replace(/"/g, "#quot;");
}
function quote2(content) {
  return `"${content}"`;
}
function siteGraphToMermaid(graph) {
  const lines = ["flowchart TD"];
  const laneAsks = /* @__PURE__ */ new Map();
  const laned = /* @__PURE__ */ new Set();
  for (const node of graph.nodes) {
    if (node.kind === "ask" && node.actors !== void 0 && node.actors.length === 1) {
      const actorId = node.actors[0];
      const list = laneAsks.get(actorId) ?? [];
      list.push(node);
      laneAsks.set(actorId, list);
      laned.add(node.id);
    }
  }
  for (const actor of graph.actors) {
    const asks = laneAsks.get(actor.id);
    if (asks === void 0 || asks.length === 0) continue;
    lines.push(`  subgraph ${safeId(actor.id)}[${quote2(laneTitle(actor))}]`);
    for (const ask of asks) lines.push(`    ${siteNodeDef(ask, actor.within)}`);
    lines.push("  end");
  }
  for (const node of graph.nodes) {
    if (laned.has(node.id)) continue;
    lines.push(`  ${siteNodeDef(node, void 0)}`);
  }
  for (const edge of graph.edges) lines.push(`  ${siteEdgeLine(edge)}`);
  lines.push(...classDefs(graph));
  return `${lines.join("\n")}
`;
}
function laneTitle(actor) {
  const name = escapeLabel(actor.name ?? actor.id);
  const family = actor.within === void 0 ? "" : `  \xD7N per ${actor.within}`;
  return `${name} (${actor.id})${family}`;
}
function siteNodeDef(node, laneFamily) {
  const id = safeId(node.id);
  if (node.kind === "source" || node.kind === "sink") {
    return `${id}([${quote2(escapeLabel(node.label))}])`;
  }
  if (node.kind === "ask") {
    const parts2 = [escapeLabel(node.label), node.id];
    if (node.within !== void 0 && node.within !== laneFamily) parts2.push(`per ${node.within}`);
    return `${id}[${quote2(parts2.join("<br/>"))}]`;
  }
  if (node.kind === "world-read") {
    const parts2 = [escapeLabel(node.label), node.id];
    if (node.within !== void 0) parts2.push(`per ${node.within}`);
    return `${id}[/${quote2(parts2.join("<br/>"))}/]`;
  }
  const parts = [node.id];
  if (node.kind === "join" && node.within !== void 0) parts.push(`per ${node.within}`);
  return `${id}{{${quote2(parts.join("<br/>"))}}}`;
}
function siteEdgeLine(edge) {
  const from = safeId(edge.from);
  const to = safeId(edge.to);
  if (edge.kind === "context") return `${from} -. context .- ${to}`;
  const arrow = edge.exact ? "-->" : "-.->";
  const parts = [];
  if (edge.port !== void 0) parts.push(`port ${edge.port}`);
  if (edge.type !== void 0) parts.push(escapeLabel(edge.type));
  if (parts.length === 0) return `${from} ${arrow} ${to}`;
  return `${from} ${arrow}|${quote2(parts.join(" \xB7 "))}| ${to}`;
}
function classDefs(graph) {
  const idsOf = (kinds) => graph.nodes.filter((node) => kinds.includes(node.kind)).map((node) => safeId(node.id));
  const out = [
    "  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;",
    "  classDef world fill:#e8f0fe,stroke:#4285f4;",
    "  classDef relay fill:#fff2cc,stroke:#d6b656;"
  ];
  const endpoint = idsOf(["source", "sink"]);
  const world = idsOf(["world-read"]);
  const relay = idsOf(["join", "fan-out"]);
  if (endpoint.length > 0) out.push(`  class ${endpoint.join(",")} endpoint;`);
  if (world.length > 0) out.push(`  class ${world.join(",")} world;`);
  if (relay.length > 0) out.push(`  class ${relay.join(",")} relay;`);
  return out;
}
function actorGraphToMermaid(graph) {
  const lines = ["flowchart LR"];
  for (const node of graph.nodes) lines.push(`  ${actorNodeDef(node)}`);
  for (const edge of graph.edges) lines.push(`  ${actorEdgeLine(edge)}`);
  const endpoints = graph.nodes.filter((n) => n.id === "source" || n.id === "sink").map((n) => safeId(n.id));
  if (endpoints.length > 0) {
    lines.push("  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;");
    lines.push(`  class ${endpoints.join(",")} endpoint;`);
  }
  return `${lines.join("\n")}
`;
}
function actorNodeDef(node) {
  const id = safeId(node.id);
  if (node.id === "source" || node.id === "sink") return `${id}([${quote2(node.id)}])`;
  if (node.id === "workspace") return `${id}[(${quote2("workspace")})]`;
  const label = escapeLabel(node.name ?? node.id) + (node.family === void 0 ? "" : " \xD7N");
  return `${id}[${quote2(label)}]`;
}
function actorEdgeLine(edge) {
  const from = safeId(edge.from);
  const to = safeId(edge.to);
  const arrow = edge.exact ? "-->" : "-.->";
  if (edge.types !== void 0 && edge.types.length > 0) {
    const label = edge.types.map(escapeLabel).join(", ") + (edge.count > 1 ? ` \xD7${edge.count}` : "");
    return `${from} ${arrow}|${quote2(label)}| ${to}`;
  }
  if (edge.count > 1) return `${from} ${arrow}|${quote2(`\xD7${edge.count}`)}| ${to}`;
  return `${from} ${arrow} ${to}`;
}
function causalityGraphToMermaid(graph) {
  const lines = ["flowchart LR"];
  const byLane = /* @__PURE__ */ new Map();
  for (const step of graph.steps) {
    const list = byLane.get(step.lane);
    if (list === void 0) byLane.set(step.lane, [step]);
    else list.push(step);
  }
  for (const lane of graph.lanes) {
    const steps = byLane.get(lane.id) ?? [];
    if (steps.length === 0) continue;
    lines.push(`  subgraph ${safeId(lane.id)}[${quote2(causalityLaneTitle(lane))}]`);
    for (const step of steps) lines.push(`    ${stepNodeDef(step)}`);
    lines.push("  end");
  }
  if (graph.sink !== void 0) lines.push(`  sink([${quote2("sink")}])`);
  for (const edge of graph.edges) lines.push(`  ${safeId(edge.from)} --> ${safeId(edge.to)}`);
  for (const from of graph.sink?.fedBy ?? []) lines.push(`  ${safeId(from)} --> sink`);
  if (graph.sink !== void 0) {
    lines.push("  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;");
    lines.push("  class sink endpoint;");
  }
  return `${lines.join("\n")}
`;
}
function phaseGraphToMermaid(graph) {
  const lines = ["flowchart LR"];
  const phases = graph.phases ?? [];
  for (const phase of phases) {
    lines.push(`  ${safeId(phase.id)}[${quote2(escapeLabel(phase.name ?? phase.id))}]`);
  }
  const phaseOf = new Map(graph.steps.map((step) => [step.id, step.phase]));
  const feeding = new Set(
    (graph.sink?.fedBy ?? []).map((id) => phaseOf.get(id)).filter((id) => id !== void 0)
  );
  if (graph.sink !== void 0) lines.push(`  sink([${quote2("sink")}])`);
  for (const edge of graph.phaseEdges ?? []) {
    lines.push(`  ${safeId(edge.from)} --> ${safeId(edge.to)}`);
  }
  for (const phase of phases) {
    if (feeding.has(phase.id)) lines.push(`  ${safeId(phase.id)} --> sink`);
  }
  if (graph.sink !== void 0) {
    lines.push("  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;");
    lines.push("  class sink endpoint;");
  }
  return `${lines.join("\n")}
`;
}
function phaseFlowToMermaid(flow) {
  const lines = ["flowchart LR"];
  const phaseEdges = flow.phaseEdges ?? [];
  const terminals = [FLOW_ENTRY, FLOW_SINK, FLOW_ABORT].filter(
    (id) => phaseEdges.some((edge) => edge.from === id || edge.to === id)
  );
  for (const id of terminals) if (id === FLOW_ENTRY) lines.push(`  ${id}([${quote2(id)}])`);
  for (const phase of flow.phases ?? []) {
    lines.push(`  ${safeId(phase.id)}[${quote2(escapeLabel(phase.name ?? phase.id))}]`);
  }
  for (const id of terminals) if (id !== FLOW_ENTRY) lines.push(`  ${id}([${quote2(id)}])`);
  const byPair = /* @__PURE__ */ new Map();
  for (const edge of phaseEdges) {
    const key = `${edge.from}|${edge.to}`;
    const entry = byPair.get(key) ?? { from: edge.from, labels: [], to: edge.to };
    const label = flowEdgeLabel(edge);
    if (!entry.labels.includes(label)) entry.labels.push(label);
    byPair.set(key, entry);
  }
  for (const { from, labels, to } of byPair.values()) {
    const shown = labels.filter((label) => label !== "next");
    const arrow = shown.length === 0 ? "-->" : `-->|${quote2(shown.join(", "))}|`;
    lines.push(`  ${safeId(from)} ${arrow} ${safeId(to)}`);
  }
  const rank = new Map((flow.phases ?? []).map((phase, index) => [phase.id, index]));
  const drawn = /* @__PURE__ */ new Set();
  for (const phase of flow.phases ?? []) {
    for (const other of phase.alongside ?? []) {
      const earlier = (rank.get(phase.id) ?? rank.size) < (rank.get(other) ?? rank.size);
      const from = earlier ? phase.id : other;
      const to = earlier ? other : phase.id;
      if (drawn.has(`${from}|${to}`)) continue;
      drawn.add(`${from}|${to}`);
      lines.push(`  ${safeId(from)} -.->|${quote2("alongside")}| ${safeId(to)}`);
    }
  }
  if (terminals.length > 0) {
    lines.push("  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;");
    lines.push(`  class ${terminals.join(",")} endpoint;`);
  }
  return `${lines.join("\n")}
`;
}
function flowEdgeLabel(edge) {
  return edge.via === void 0 ? edge.kind : `${edge.kind} (${edge.via})`;
}
var MULTIPLICITY_SYMBOLS = ["N", "M", "K", "P"];
function causalityLaneTitle(lane) {
  const name = escapeLabel(lane.name ?? lane.id);
  const head = lane.name === void 0 ? name : `${name} (${lane.id})`;
  const families = lane.families ?? [];
  if (families.length === 0) return head;
  const factors = families.map((_, index) => MULTIPLICITY_SYMBOLS[index] ?? "N").join("\xB7");
  return `${head}  \xD7${factors}`;
}
function stepNodeDef(step) {
  const parts = [escapeLabel(step.label), step.id];
  if (step.repeat === "stack") parts.push("\xD7N");
  if (step.lanes !== void 0) parts.push(`may: ${step.lanes.join("|")}`);
  const body = quote2(parts.join("<br/>"));
  return step.kind === "world-read" ? `${safeId(step.id)}[/${body}/]` : `${safeId(step.id)}[${body}]`;
}
function controlFlowToMermaid(flow) {
  const lines = ["flowchart TD"];
  const terminals = [FLOW_ENTRY, FLOW_SINK, FLOW_ABORT].filter(
    (id) => flow.edges.some((edge) => edge.from === id || edge.to === id)
  );
  const phaseName = new Map((flow.phases ?? []).map((phase) => [phase.id, phase.name ?? phase.id]));
  const nodeDef = (node) => {
    const id = safeId(node.id);
    const tail = node.detached ? "<br/>detached" : "";
    if (node.kind === "mark") {
      return `${id}{{${quote2(`${escapeLabel(phaseName.get(node.phase) ?? node.phase)}<br/>${node.id}${tail}`)}}}`;
    }
    return `${id}[${quote2(`${node.id}${tail}`)}]`;
  };
  if (terminals.includes(FLOW_ENTRY)) lines.push(`  ${FLOW_ENTRY}([${quote2(FLOW_ENTRY)}])`);
  if (flow.phases === void 0) {
    for (const node of flow.nodes) lines.push(`  ${nodeDef(node)}`);
  } else {
    for (const phase of flow.phases) {
      const members = flow.nodes.filter((node) => node.phase === phase.id);
      if (members.length === 0) continue;
      lines.push(`  subgraph ${safeId(phase.id)}[${quote2(escapeLabel(phase.name ?? phase.id))}]`);
      for (const node of members) lines.push(`    ${nodeDef(node)}`);
      lines.push("  end");
    }
  }
  for (const id of terminals) if (id !== FLOW_ENTRY) lines.push(`  ${id}([${quote2(id)}])`);
  for (const edge of flow.edges) {
    const arrow = edge.kind === "next" ? "-->" : `-->|${quote2(flowEdgeLabel(edge))}|`;
    lines.push(`  ${safeId(edge.from)} ${arrow} ${safeId(edge.to)}`);
  }
  if (terminals.length > 0) {
    lines.push("  classDef endpoint fill:#eeeeef,stroke:#9a9aa5,color:#555566;");
    lines.push(`  class ${terminals.join(",")} endpoint;`);
  }
  const marks = flow.nodes.filter((node) => node.kind === "mark").map((node) => safeId(node.id));
  if (marks.length > 0) {
    lines.push("  classDef mark fill:#fff2cc,stroke:#d6b656;");
    lines.push(`  class ${marks.join(",")} mark;`);
  }
  const detached = flow.nodes.filter((node) => node.detached).map((node) => safeId(node.id));
  if (detached.length > 0) {
    lines.push("  classDef detached stroke-dasharray:4 3,color:#555566;");
    lines.push(`  class ${detached.join(",")} detached;`);
  }
  return `${lines.join("\n")}
`;
}
function handoffGraphToMermaid(graph, names = { lanes: [] }) {
  const lines = ["flowchart LR"];
  const laneName = new Map(names.lanes.map((lane) => [lane.id, lane.name]));
  const phaseName = new Map((names.phases ?? []).map((phase) => [phase.id, phase.name ?? phase.id]));
  const byPhase = /* @__PURE__ */ new Map();
  for (const participant of graph.participants) {
    const list = byPhase.get(participant.phase);
    if (list === void 0) byPhase.set(participant.phase, [participant]);
    else list.push(participant);
  }
  for (const [phase, participants] of byPhase) {
    lines.push(`  subgraph ${safeId(phase)}[${quote2(escapeLabel(phaseName.get(phase) ?? phase))}]`);
    for (const participant of participants) {
      lines.push(`    ${participantNodeDef(participant, laneName.get(participant.lane))}`);
    }
    lines.push("  end");
  }
  for (const handoff of graph.handoffs) lines.push(`  ${handoffEdgeLine(handoff)}`);
  const workspace = graph.participants.filter((participant) => participant.lane === WORKSPACE_LANE).map((participant) => safeId(participant.id));
  if (workspace.length > 0) {
    lines.push("  classDef world fill:#e8f0fe,stroke:#4285f4;");
    lines.push(`  class ${workspace.join(",")} world;`);
  }
  return `${lines.join("\n")}
`;
}
function participantNodeDef(participant, name) {
  const id = safeId(participant.id);
  let head = escapeLabel(name ?? participant.lane);
  if (participant.member !== void 0) head += ` [${participant.member.index + 1}/${participant.member.of}]`;
  if (participant.many) head += " \xD7N";
  const body = quote2(`${head}<br/>${participant.steps.join(", ")}`);
  return participant.lane === WORKSPACE_LANE ? `${id}[(${body})]` : `${id}[${body}]`;
}
function handoffEdgeLine(handoff) {
  const from = safeId(handoff.from);
  const to = safeId(handoff.to);
  const arrow = handoff.back ? "-.->" : "-->";
  if (handoff.types === void 0 || handoff.types.length === 0) return `${from} ${arrow} ${to}`;
  return `${from} ${arrow}|${quote2(handoff.types.map(escapeLabel).join(", "))}| ${to}`;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/serialize.ts
function quoteType(type) {
  return `"${type.replace(/"/g, '\\"')}"`;
}
function serializeCausalityGraph(graph) {
  const lines = [
    ...(graph.phases ?? []).map(renderPhase),
    ...graph.lanes.map(renderLane),
    ...graph.regions.map(renderRegion),
    ...graph.steps.map(renderStep),
    ...graph.edges.map(renderOrderEdge),
    ...(graph.phaseEdges ?? []).map(renderPhaseEdge),
    ...graph.sink === void 0 ? [] : [`sink ${graph.sink.fedBy.join(",")}`]
  ];
  return `${lines.join("\n")}
`;
}
function renderPhase(phase) {
  let line = `phase ${phase.id}`;
  if (phase.name !== void 0) line += ` "${phase.name}"`;
  if (phase.loc !== void 0) line += ` @${phase.loc.line}:${phase.loc.column}`;
  return line;
}
function renderPhaseEdge(edge) {
  return `phase-edge ${edge.from} -> ${edge.to} ${edge.kind} ${edge.certainty}`;
}
function renderLane(lane) {
  let line = `lane ${lane.id}`;
  if (lane.name !== void 0) line += ` "${lane.name}"`;
  line += renderNamePattern("name", lane.namePattern);
  if (lane.loc !== void 0) line += ` @${lane.loc.line}:${lane.loc.column}`;
  if (lane.families !== void 0 && lane.families.length > 0) {
    line += ` families=${lane.families.join(",")}`;
  }
  return line;
}
function renderNamePattern(field, pattern) {
  if (pattern === void 0) return "";
  let out = "";
  if (pattern.head !== void 0) out += ` ${field}-head=${quoteType(pattern.head)}`;
  if (pattern.tail !== void 0) out += ` ${field}-tail=${quoteType(pattern.tail)}`;
  return out;
}
function renderRegion(region) {
  let line = `region ${region.id} ${region.kind}`;
  if (region.parent !== void 0) line += ` parent=${region.parent}`;
  if (region.loc !== void 0) line += ` @${region.loc.line}:${region.loc.column}`;
  if (region.bound !== void 0) line += ` bound=${region.bound}`;
  if (region.label !== void 0) line += ` label=${quoteType(region.label)}`;
  return line;
}
function renderStep(step) {
  let line = `step ${step.id} ${step.kind} "${step.label}"`;
  line += renderNamePattern("label", step.labelPattern);
  line += ` @${step.loc.line}:${step.loc.column}`;
  line += ` lane=${step.lane}`;
  if (step.lanes !== void 0) line += ` lanes=${step.lanes.join(",")}`;
  if (step.source !== void 0) line += ` source=${step.source}`;
  if (step.phase !== void 0) line += ` phase=${step.phase}`;
  line += ` region=${step.region} ${step.certainty}`;
  if (step.repeat !== void 0) line += ` ${step.repeat}`;
  return line;
}
function renderOrderEdge(edge) {
  let line = `edge ${edge.from} -> ${edge.to} ${edge.kind} ${edge.certainty}`;
  if (edge.exact !== void 0) line += edge.exact ? " exact" : " inexact";
  return line;
}
function serializeControlFlow(flow) {
  const edgeLine = (head, edge) => `${head} ${edge.from} -> ${edge.to} ${edge.kind}${edge.via === void 0 ? "" : ` via=${edge.via}`}`;
  const lines = [
    ...(flow.phases ?? []).map(
      (phase) => `phase ${phase.id}${phase.name === void 0 ? "" : ` ${quoteType(phase.name)}`}` + (phase.alongside === void 0 ? "" : ` alongside=${phase.alongside.join(",")}`)
    ),
    ...flow.nodes.map(
      (node) => `node ${node.id} ${node.kind}` + (node.site === void 0 ? "" : ` site=${node.site}`) + ` phase=${node.phase}` + (node.alongside === void 0 ? "" : ` alongside=${node.alongside.join(",")}`) + (node.detached ? " detached" : "")
    ),
    ...flow.edges.map((edge) => edgeLine("edge", edge)),
    ...(flow.phaseEdges ?? []).map((edge) => edgeLine("phase-edge", edge))
  ];
  return `${lines.join("\n")}
`;
}
function serializeHandoffGraph(graph, lanes) {
  const nameOf = new Map(lanes.map((lane) => [lane.id, lane.name]));
  const lines = [];
  let phase;
  for (const participant of graph.participants) {
    if (participant.phase !== phase) {
      phase = participant.phase;
      lines.push(`phase ${phase}`);
    }
    let line = `participant ${participant.id}`;
    const name = nameOf.get(participant.lane);
    if (name !== void 0) line += ` ${quoteType(name)}`;
    if (participant.member !== void 0) line += ` member=${participant.member.index}/${participant.member.of}`;
    if (participant.many) line += " many";
    line += ` steps=${participant.steps.join(",")}`;
    lines.push(line);
  }
  for (const edge of graph.handoffs) {
    let line = `handoff ${edge.from} -> ${edge.to}`;
    if (edge.back) line += " back";
    if (edge.types !== void 0) line += ` types=${quoteType(edge.types.join(","))}`;
    lines.push(line);
  }
  return `${lines.join("\n")}
`;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/core-json.ts
var VERSION = 1;
function encodeAnalysisCore(core) {
  return {
    facts: {
      askActor: [...core.facts.askActor],
      askData: [...core.facts.askData],
      fanoutIn: [...core.facts.fanoutIn],
      joinIn: [...core.facts.joinIn],
      returnData: core.facts.returnData,
      worldReadData: [...core.facts.worldReadData]
    },
    sites: core.sites,
    trace: core.trace,
    types: {
      joinPortTypes: [...core.types.joinPortTypes].map(([id, ports]) => [
        id,
        ports.map((port) => port === void 0 ? null : port)
      ]),
      siteType: [...core.types.siteType]
    },
    version: VERSION
  };
}
function decodeAnalysisCore(json) {
  if (json.version !== VERSION) {
    throw new Error(`unsupported AnalysisCoreJson version ${String(json.version)} (expected ${VERSION})`);
  }
  return {
    facts: {
      askActor: new Map(json.facts.askActor),
      askData: new Map(json.facts.askData),
      fanoutIn: new Map(json.facts.fanoutIn),
      joinIn: new Map(json.facts.joinIn),
      returnData: json.facts.returnData,
      worldReadData: new Map(json.facts.worldReadData)
    },
    sites: json.sites,
    trace: json.trace,
    types: {
      joinPortTypes: new Map(
        json.types.joinPortTypes.map(([id, ports]) => [id, ports.map((port) => port === null ? void 0 : port)])
      ),
      siteType: new Map(json.types.siteType)
    }
  };
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/synthesize.ts
import ts35 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/emit.ts
import ts34 from "typescript";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/jsdoc.ts
import ts33 from "typescript";
var NUMERIC_TAGS = {
  exclusiveMaximum: "exclusiveMaximum",
  exclusiveMinimum: "exclusiveMinimum",
  maximum: "maximum",
  maxItems: "maxItems",
  maxLength: "maxLength",
  minimum: "minimum",
  minItems: "minItems",
  minLength: "minLength"
};
var STRING_TAGS = {
  format: "format",
  pattern: "pattern"
};
function harvestConstraints(symbol, checker) {
  const out = {};
  const doc = ts33.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  if (doc.length > 0) out.description = doc;
  for (const tag of symbol.getJsDocTags(checker)) applyTag(out, tag);
  return out;
}
function applyTag(out, tag) {
  const raw = ts33.displayPartsToString(tag.text).trim();
  const numericKey = NUMERIC_TAGS[tag.name];
  if (numericKey !== void 0) {
    const value = Number(raw);
    if (Number.isFinite(value)) out[numericKey] = value;
    return;
  }
  const stringKey = STRING_TAGS[tag.name];
  if (stringKey !== void 0) {
    if (raw.length > 0) out[stringKey] = raw;
    return;
  }
  if (tag.name === "default") {
    out.default = parseDefault(raw);
  }
}
function parseDefault(raw) {
  if (raw.length === 0) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function mergeConstraints(schema, extra) {
  const merged = { ...schema };
  for (const [key, value] of Object.entries(extra)) {
    if (value === void 0) continue;
    if (key === "description" && merged.description !== void 0) continue;
    merged[key] = value;
  }
  return merged;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/types.ts
var SCHEMA_DIAGNOSTIC_CODE = 9002;
var MAX_UNION_MEMBERS = 100;

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/emit.ts
var SchemaRejection = class extends Error {
  constructor(reason, path) {
    super(reason);
    this.reason = reason;
    this.path = path;
    this.name = "SchemaRejection";
  }
};
var REJECTED_BUILTINS = /* @__PURE__ */ new Set([
  "Date",
  "RegExp",
  "Map",
  "WeakMap",
  "ReadonlyMap",
  "Set",
  "WeakSet",
  "ReadonlySet",
  "Promise",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array"
]);
function objectFlagsOf(type) {
  return (type.flags & ts34.TypeFlags.Object) !== 0 ? type.objectFlags : 0;
}
var SchemaEmitter = class {
  constructor(checker, location) {
    this.checker = checker;
    this.location = location;
  }
  defs = /* @__PURE__ */ new Map();
  inProgress = /* @__PURE__ */ new Map();
  defName = /* @__PURE__ */ new Map();
  usedNames = /* @__PURE__ */ new Set();
  /** 发射顶层类型；若过程中产生了 def，则把 `$defs` 挂到根 schema 上。 */
  emitTop(type) {
    const schema = this.emit(type, "$");
    if (this.defs.size === 0) return schema;
    const $defs = {};
    for (const { name, schema: defSchema } of this.defs.values()) $defs[name] = defSchema;
    return { ...schema, $defs };
  }
  emit(type, path) {
    const settled = this.defs.get(type);
    if (settled !== void 0) return { $ref: `#/$defs/${settled.name}` };
    const frame = this.inProgress.get(type);
    if (frame !== void 0) {
      frame.requested = true;
      return { $ref: `#/$defs/${this.nameFor(type)}` };
    }
    const flags = type.flags;
    if (flags & ts34.TypeFlags.Any) {
      throw new SchemaRejection("type 'any' is not allowed; use 'unknown' or a concrete type", path);
    }
    if (flags & ts34.TypeFlags.Unknown) return {};
    if (flags & ts34.TypeFlags.Never) throw new SchemaRejection("type 'never' cannot be represented", path);
    if (flags & (ts34.TypeFlags.Undefined | ts34.TypeFlags.Void)) {
      throw new SchemaRejection("'undefined' is only allowed on optional properties", path);
    }
    if (flags & ts34.TypeFlags.Null) return { type: "null" };
    if (flags & ts34.TypeFlags.BooleanLiteral) return { const: this.booleanValue(type) };
    if (flags & ts34.TypeFlags.Boolean) return { type: "boolean" };
    if (flags & ts34.TypeFlags.StringLiteral) return { const: type.value };
    if (flags & ts34.TypeFlags.NumberLiteral) return { const: type.value };
    if (flags & ts34.TypeFlags.String) return { type: "string" };
    if (flags & ts34.TypeFlags.Number) return { type: "number" };
    if (flags & (ts34.TypeFlags.BigInt | ts34.TypeFlags.BigIntLiteral)) {
      throw new SchemaRejection("'bigint' is not JSON-serializable", path);
    }
    if (flags & (ts34.TypeFlags.ESSymbol | ts34.TypeFlags.UniqueESSymbol)) {
      throw new SchemaRejection("'symbol' is not JSON-serializable", path);
    }
    if (type.isUnion()) return this.composite(type, () => this.emitUnion(type, path));
    if (type.isIntersection()) return this.composite(type, () => this.emitIntersection(type, path));
    if (flags & ts34.TypeFlags.Object) return this.composite(type, () => this.emitObjectLike(type, path));
    throw new SchemaRejection("type is not JSON-serializable", path);
  }
  /** 复合类型的栈帧包装：发射期间若被自身再次引用则提升为 def 并返回 `$ref`。 */
  composite(type, build) {
    this.inProgress.set(type, { requested: false });
    const schema = build();
    const frame = this.inProgress.get(type);
    this.inProgress.delete(type);
    if (!frame.requested) return schema;
    const name = this.nameFor(type);
    this.defs.set(type, { name, schema });
    return { $ref: `#/$defs/${name}` };
  }
  /** 为一个类型分配稳定且唯一的 def 名（源自别名/符号名），惰性且去重。 */
  nameFor(type) {
    const cached = this.defName.get(type);
    if (cached !== void 0) return cached;
    const base = type.aliasSymbol?.name ?? type.getSymbol()?.name ?? "Schema";
    let name = base;
    let suffix = 1;
    while (this.usedNames.has(name)) {
      suffix += 1;
      name = `${base}${suffix}`;
    }
    this.usedNames.add(name);
    this.defName.set(type, name);
    return name;
  }
  booleanValue(type) {
    return type.intrinsicName === "true";
  }
  emitUnion(type, path) {
    const members = type.types;
    if (members.length > MAX_UNION_MEMBERS) {
      throw new SchemaRejection(
        `union has too many members (${members.length} > ${MAX_UNION_MEMBERS})`,
        path
      );
    }
    for (const member of members) {
      if (member.flags & (ts34.TypeFlags.Undefined | ts34.TypeFlags.Void)) {
        throw new SchemaRejection("'undefined' is only allowed on optional properties", path);
      }
    }
    return this.emitMembers(members, path);
  }
  /** 一组成员类型 → enum（全为字面量时）或 anyOf。也被可选属性的去 undefined 路径复用。 */
  emitMembers(members, path) {
    const literals = this.asLiterals(members);
    if (literals !== void 0) return { enum: literals };
    return { anyOf: members.map((member, index) => this.emit(member, `${path}|${index}`)) };
  }
  /** 若所有成员都是字面量（string/number/boolean 字面量或 null），返回其取值数组。 */
  asLiterals(members) {
    const values = [];
    for (const member of members) {
      const flags = member.flags;
      if (flags & ts34.TypeFlags.StringLiteral) values.push(member.value);
      else if (flags & ts34.TypeFlags.NumberLiteral) values.push(member.value);
      else if (flags & ts34.TypeFlags.BooleanLiteral) values.push(this.booleanValue(member));
      else if (flags & ts34.TypeFlags.Null) values.push(null);
      else return void 0;
    }
    return values;
  }
  /** 交叉类型：合并为一个 object（checker 已把成员属性合并到交叉类型上）。含原始类型成员
   *  的品牌类型（如 `string & {__brand}`）按其原始类型发射。 */
  emitIntersection(type, path) {
    for (const member of type.types) {
      if (member.flags & ts34.TypeFlags.String) return { type: "string" };
      if (member.flags & ts34.TypeFlags.Number) return { type: "number" };
      if (member.flags & ts34.TypeFlags.Boolean) return { type: "boolean" };
    }
    if (type.getCallSignatures().length > 0) {
      throw new SchemaRejection("function types are not JSON-serializable", path);
    }
    return this.emitObject(type, path);
  }
  emitObjectLike(type, path) {
    if (this.isArrayType(type)) return this.emitArray(type, path);
    if (this.isTupleType(type)) return this.emitTuple(type, path);
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      throw new SchemaRejection("function types are not JSON-serializable", path);
    }
    const name = type.getSymbol()?.getName();
    if (name !== void 0 && REJECTED_BUILTINS.has(name)) {
      throw new SchemaRejection(`'${name}' is not JSON-serializable`, path);
    }
    if (((type.getSymbol()?.flags ?? 0) & ts34.SymbolFlags.Class) !== 0) {
      throw new SchemaRejection("class instances are not JSON-serializable", path);
    }
    if (this.isThenable(type)) {
      throw new SchemaRejection("Promise/thenable values are not JSON-serializable", path);
    }
    return this.emitObject(type, path);
  }
  emitObject(type, path) {
    const properties = {};
    const required = [];
    for (const prop of this.checker.getPropertiesOfType(type)) {
      const optional = (prop.flags & ts34.SymbolFlags.Optional) !== 0;
      const propPath = `${path}.${prop.name}`;
      const propType = this.checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? this.location);
      const base = optional ? this.emitOptional(propType, propPath) : this.emit(propType, propPath);
      properties[prop.name] = mergeConstraints(base, harvestConstraints(prop, this.checker));
      if (!optional) required.push(prop.name);
    }
    const schema = { type: "object" };
    if (Object.keys(properties).length > 0) schema.properties = properties;
    if (required.length > 0) schema.required = required;
    const indexInfo = this.checker.getIndexInfoOfType(type, ts34.IndexKind.String);
    schema.additionalProperties = indexInfo !== void 0 ? this.emit(indexInfo.type, `${path}[*]`) : false;
    return schema;
  }
  /** 可选属性：从属性类型里剥掉 undefined 后再发射（可选性由 required 表达，不进类型）。 */
  emitOptional(propType, path) {
    if (!propType.isUnion()) return this.emit(propType, path);
    const rest = propType.types.filter(
      (member) => (member.flags & (ts34.TypeFlags.Undefined | ts34.TypeFlags.Void)) === 0
    );
    if (rest.length === propType.types.length) return this.emit(propType, path);
    if (rest.length === 1) return this.emit(rest[0], path);
    return this.emitMembers(rest, path);
  }
  emitArray(type, path) {
    const element = this.checker.getTypeArguments(type)[0];
    const items = element !== void 0 ? this.emit(element, `${path}[]`) : {};
    return { type: "array", items };
  }
  emitTuple(type, path) {
    const elementFlags = type.target.elementFlags;
    const args = this.checker.getTypeArguments(type);
    const prefixItems = [];
    let minItems = 0;
    let restItems;
    for (let index = 0; index < args.length; index += 1) {
      const flag = elementFlags[index] ?? ts34.ElementFlags.Required;
      const arg = args[index];
      if (flag & ts34.ElementFlags.Rest) {
        restItems = this.emit(arg, `${path}[${index}]`);
        continue;
      }
      const optional = (flag & ts34.ElementFlags.Optional) !== 0;
      prefixItems.push(optional ? this.emitOptional(arg, `${path}[${index}]`) : this.emit(arg, `${path}[${index}]`));
      if (flag & ts34.ElementFlags.Required) minItems += 1;
    }
    const schema = { type: "array", prefixItems, minItems };
    if (restItems !== void 0) schema.items = restItems;
    else schema.maxItems = prefixItems.length;
    return schema;
  }
  isArrayType(type) {
    if ((objectFlagsOf(type) & ts34.ObjectFlags.Reference) === 0) return false;
    const name = type.target.getSymbol()?.getName();
    return name === "Array" || name === "ReadonlyArray";
  }
  isTupleType(type) {
    if ((objectFlagsOf(type) & ts34.ObjectFlags.Reference) === 0) return false;
    return ((type.target.objectFlags ?? 0) & ts34.ObjectFlags.Tuple) !== 0;
  }
  isThenable(type) {
    const then = this.checker.getPropertyOfType(type, "then");
    if (then === void 0) return false;
    const thenType = this.checker.getTypeOfSymbolAtLocation(then, then.valueDeclaration ?? this.location);
    return thenType.getCallSignatures().length > 0;
  }
};

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/synthesize.ts
function askResultType(checker, call) {
  const typeNode = call.typeArguments?.[0];
  if (typeNode === void 0) return void 0;
  const type = checker.getTypeFromTypeNode(typeNode);
  return (type.flags & ts35.TypeFlags.String) !== 0 ? void 0 : type;
}
function synthesizeAskSchemas(workflow, table) {
  const checker = workflow.program.getTypeChecker();
  const schemas = {};
  const diagnostics = [];
  for (const site of table.asks) {
    const type = askResultType(checker, site.call);
    if (type === void 0) continue;
    try {
      const typeNode = site.call.typeArguments[0];
      const emitter = new SchemaEmitter(checker, typeNode);
      schemas[site.id] = attachTopDoc(emitter.emitTop(type), type, checker);
    } catch (error) {
      if (!(error instanceof SchemaRejection)) throw error;
      diagnostics.push({
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: site.loc.column,
        line: site.loc.line,
        message: rejectionMessage(error, "ask result type")
      });
    }
  }
  for (const site of table.reports) diagnostics.push(...reportItemDiagnostics(checker, site));
  return { diagnostics, schemas };
}
function reportItemDiagnostics(checker, site) {
  if (site.item === void 0) return [];
  try {
    new SchemaEmitter(checker, site.item).emitTop(checker.getTypeAtLocation(site.item));
    return [];
  } catch (error) {
    if (!(error instanceof SchemaRejection)) throw error;
    return [
      {
        code: SCHEMA_DIAGNOSTIC_CODE,
        column: site.loc.column,
        line: site.loc.line,
        message: rejectionMessage(error, "report item type")
      }
    ];
  }
}
function synthesizeWorkflowSchemas(scriptText) {
  const workflow = createWorkflowProgram(scriptText);
  const compileDiagnostics = collectDiagnostics(workflow.program);
  if (compileDiagnostics.length > 0) return { diagnostics: compileDiagnostics, schemas: {} };
  return synthesizeAskSchemas(workflow, collectSites(workflow));
}
function buildAskSpecs(table, schemas) {
  const specs = /* @__PURE__ */ new Map();
  for (const site of table.asks) {
    const schema = schemas[site.id];
    specs.set(site.id, schema === void 0 ? { typed: false } : { typed: true, schema });
  }
  return specs;
}
function attachTopDoc(schema, type, checker) {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (symbol === void 0) return schema;
  return mergeConstraints(schema, harvestConstraints(symbol, checker));
}
function rejectionMessage(error, subject) {
  const where = error.path !== "$" && error.path.length > 0 ? ` (at ${error.path})` : "";
  return `unsupported ${subject}: ${error.reason}${where}`;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/validate.ts
function validate(schema, value) {
  const violations = [];
  check(schema, value, "$", schema, violations);
  return violations;
}
function formatViolation(violation) {
  return `${violation.path}: expected ${violation.expected}, got ${violation.got}`;
}
function formatViolations(violations) {
  return violations.map(formatViolation).join("\n");
}
function check(schema, value, path, root, out) {
  if (schema.$ref !== void 0) {
    const resolved = resolveRef(root, schema.$ref);
    if (resolved === void 0) {
      out.push({ expected: `schema ${schema.$ref}`, got: "unresolved $ref", path });
      return;
    }
    check(resolved, value, path, root, out);
    return;
  }
  if ("const" in schema) {
    if (!deepEqual(value, schema.const)) {
      out.push({ expected: describeValue(schema.const), got: describeValue(value), path });
    }
    return;
  }
  if (schema.enum !== void 0) {
    if (!schema.enum.some((candidate) => deepEqual(value, candidate))) {
      out.push({ expected: `one of ${schema.enum.map((v) => describeValue(v)).join(", ")}`, got: describeValue(value), path });
    }
    return;
  }
  if (schema.anyOf !== void 0) {
    const matched = schema.anyOf.some((branch) => {
      const trial = [];
      check(branch, value, path, root, trial);
      return trial.length === 0;
    });
    if (!matched) {
      out.push({ expected: `one of ${schema.anyOf.length} variants`, got: describeValue(value), path });
    }
    return;
  }
  if (schema.type !== void 0 && !typeMatches(schema.type, value)) {
    out.push({ expected: typeName(schema.type), got: describeValue(value), path });
    return;
  }
  if (schema.type === "object") checkObject(schema, value, path, root, out);
  if (schema.type === "array") checkArray(schema, value, path, root, out);
  if (typeof value === "string") checkString(schema, value, path, out);
  if (typeof value === "number") checkNumber(schema, value, path, out);
}
function checkObject(schema, value, path, root, out) {
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      out.push({ expected: "present", got: "missing", path: `${path}.${key}` });
    }
  }
  const properties = schema.properties ?? {};
  for (const [key, propValue] of Object.entries(value)) {
    const propSchema = properties[key];
    if (propSchema !== void 0) {
      check(propSchema, propValue, `${path}.${key}`, root, out);
      continue;
    }
    const additional = schema.additionalProperties;
    if (additional === false) {
      out.push({ expected: "no additional property", got: describeValue(propValue), path: `${path}.${key}` });
    } else if (additional !== void 0 && additional !== true) {
      check(additional, propValue, `${path}.${key}`, root, out);
    }
  }
}
function checkArray(schema, value, path, root, out) {
  if (schema.minItems !== void 0 && value.length < schema.minItems) {
    out.push({ expected: `at least ${schema.minItems} items`, got: `array(${value.length})`, path });
  }
  if (schema.maxItems !== void 0 && value.length > schema.maxItems) {
    out.push({ expected: `at most ${schema.maxItems} items`, got: `array(${value.length})`, path });
  }
  if (schema.prefixItems !== void 0) {
    schema.prefixItems.forEach((itemSchema, index) => {
      if (index < value.length) check(itemSchema, value[index], `${path}[${index}]`, root, out);
    });
    if (schema.items !== void 0) {
      for (let index = schema.prefixItems.length; index < value.length; index += 1) {
        check(schema.items, value[index], `${path}[${index}]`, root, out);
      }
    }
    return;
  }
  if (schema.items !== void 0) {
    value.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, root, out));
  }
}
function checkString(schema, value, path, out) {
  if (schema.minLength !== void 0 && value.length < schema.minLength) {
    out.push({ expected: `string length >= ${schema.minLength}`, got: `length ${value.length}`, path });
  }
  if (schema.maxLength !== void 0 && value.length > schema.maxLength) {
    out.push({ expected: `string length <= ${schema.maxLength}`, got: `length ${value.length}`, path });
  }
  if (schema.pattern !== void 0 && !new RegExp(schema.pattern).test(value)) {
    out.push({ expected: `match /${schema.pattern}/`, got: describeValue(value), path });
  }
}
function checkNumber(schema, value, path, out) {
  if (schema.type === "integer" && !Number.isInteger(value)) {
    out.push({ expected: "integer", got: `number ${value}`, path });
  }
  if (schema.minimum !== void 0 && value < schema.minimum) {
    out.push({ expected: `>= ${schema.minimum}`, got: `number ${value}`, path });
  }
  if (schema.maximum !== void 0 && value > schema.maximum) {
    out.push({ expected: `<= ${schema.maximum}`, got: `number ${value}`, path });
  }
  if (schema.exclusiveMinimum !== void 0 && value <= schema.exclusiveMinimum) {
    out.push({ expected: `> ${schema.exclusiveMinimum}`, got: `number ${value}`, path });
  }
  if (schema.exclusiveMaximum !== void 0 && value >= schema.exclusiveMaximum) {
    out.push({ expected: `< ${schema.exclusiveMaximum}`, got: `number ${value}`, path });
  }
}
function typeMatches(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => matchesOne(candidate, value));
}
function matchesOne(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
function typeName(type) {
  return Array.isArray(type) ? type.join(" | ") : type;
}
function resolveRef(root, ref) {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (match === null) return void 0;
  return root.$defs?.[match[1]];
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
    );
  }
  return false;
}
function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  switch (typeof value) {
    case "string": {
      const shown = value.length > 20 ? `${value.slice(0, 20)}\u2026` : value;
      return `string ${JSON.stringify(shown)}`;
    }
    case "number":
      return `number ${value}`;
    case "boolean":
      return `boolean ${value}`;
    case "object":
      return "object";
    case "undefined":
      return "undefined";
    default:
      return typeof value;
  }
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/engine/hash.ts
function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const s = JSON.stringify(value);
    return s === void 0 ? "null" : s;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value;
  const keys = Object.keys(obj).sort();
  const parts = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === void 0) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(",")}}`;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/actor-submit-profiles.ts
var GENERIC_SUBMIT_PROFILE = { kind: "generic" };
function deriveActorSubmitProfiles(graph, askSpecs) {
  const profiles = /* @__PURE__ */ new Map();
  const actorIds = graph.actors.map((actor) => actor.id);
  const schemasByActor = /* @__PURE__ */ new Map();
  for (const id of actorIds) schemasByActor.set(id, /* @__PURE__ */ new Map());
  for (const node of graph.nodes) {
    if (node.kind !== "ask") continue;
    const actors = node.actors ?? [];
    const spec = askSpecs.get(node.id);
    if (actors.length === 0 || spec === void 0) {
      for (const id of actorIds) profiles.set(id, GENERIC_SUBMIT_PROFILE);
      return profiles;
    }
    if (!spec.typed) continue;
    const schema = spec.schema;
    const key = canonicalJson(schema);
    for (const actorId of actors) {
      let bucket = schemasByActor.get(actorId);
      if (bucket === void 0) {
        bucket = /* @__PURE__ */ new Map();
        schemasByActor.set(actorId, bucket);
      }
      bucket.set(key, schema);
    }
  }
  for (const [actorId, bucket] of schemasByActor) {
    if (bucket.size === 0) profiles.set(actorId, { kind: "untyped" });
    else if (bucket.size === 1)
      profiles.set(actorId, { kind: "mono", schema: [...bucket.values()][0] });
    else profiles.set(actorId, GENERIC_SUBMIT_PROFILE);
  }
  return profiles;
}
function deriveActorSubmitProfilesFor(workflow, table, askSpecs) {
  return deriveActorSubmitProfiles(projectSiteGraph(interpret(workflow, table)), askSpecs);
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/schema/serialize.ts
function serializeSchema(schema) {
  return `${JSON.stringify(canonicalize(schema), null, 2)}
`;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/lowering/lower.ts
import ts36 from "typescript";
var HOST_BINDING = "__host";
function lowerWorkflowScript(scriptText) {
  const workflow = createWorkflowProgram(scriptText);
  const diagnostics = collectDiagnostics(workflow.program);
  if (diagnostics.length > 0) return { diagnostics, ok: false };
  const table = collectSites(workflow);
  const misuse = collectFacadeMisuse(workflow, table);
  if (misuse.length > 0) return { diagnostics: misuse, ok: false };
  return { diagnostics, lowered: lowerWorkflow(workflow, table), ok: true };
}
function lowerWorkflow(workflow, table) {
  const checker = workflow.program.getTypeChecker();
  const siteMap = buildSiteMap(table);
  const transformer = (context) => {
    const { factory } = context;
    const hostMember = (name) => factory.createPropertyAccessExpression(factory.createIdentifier(HOST_BINDING), name);
    const siteArg = (id) => factory.createStringLiteral(id);
    const visit = (node) => {
      if (ts36.isIdentifier(node) && node.text === "args" && isFacadeArgsRead(node, checker)) {
        return hostMember("args");
      }
      if (ts36.isCallExpression(node)) {
        const emit = siteMap.get(node);
        if (emit !== void 0) return lowerSited(node, emit);
        const name = facadeCalleeName(node, checker);
        if (name === "log") {
          return factory.createCallExpression(
            hostMember("log"),
            void 0,
            node.arguments.map(visitExpr)
          );
        }
      }
      return ts36.visitEachChild(node, visit, context);
    };
    const visitExpr = (expr) => ts36.visitNode(expr, visit);
    const lowerSited = (call, emit) => {
      if (emit.kind === "phase") {
        const name = emit.name?.trim();
        if (name === void 0 || name.length === 0) return factory.createVoidZero();
        return factory.createCallExpression(hostMember("enterPhase"), void 0, [
          factory.createStringLiteral(name)
        ]);
      }
      if (emit.kind === "actor") {
        return factory.createCallExpression(hostMember("createActor"), void 0, [
          siteArg(emit.siteId),
          ...call.arguments.map(visitExpr)
        ]);
      }
      if (emit.kind === "ask") {
        const access = call.expression;
        const receiver = visitExpr(access.expression);
        const loweredAsk = (recv) => factory.createCallExpression(hostMember("ask"), void 0, [
          siteArg(emit.siteId),
          recv,
          ...call.arguments.map(visitExpr)
        ]);
        if (!ts36.isOptionalChain(call)) return loweredAsk(receiver);
        const once = ts36.isIdentifier(receiver) ? receiver : factory.createTempVariable(context.hoistVariableDeclaration);
        const evaluated = once === receiver ? receiver : factory.createAssignment(once, receiver);
        const isNullish = factory.createBinaryExpression(
          factory.createBinaryExpression(
            evaluated,
            factory.createToken(ts36.SyntaxKind.EqualsEqualsEqualsToken),
            factory.createNull()
          ),
          factory.createToken(ts36.SyntaxKind.BarBarToken),
          factory.createBinaryExpression(
            once,
            factory.createToken(ts36.SyntaxKind.EqualsEqualsEqualsToken),
            factory.createIdentifier("undefined")
          )
        );
        return factory.createConditionalExpression(
          isNullish,
          factory.createToken(ts36.SyntaxKind.QuestionToken),
          factory.createIdentifier("undefined"),
          factory.createToken(ts36.SyntaxKind.ColonToken),
          loweredAsk(once)
        );
      }
      if (emit.kind === "artifact") {
        const member = isArtifactPresetOp(emit.op) ? "declareArtifact" : "publishArtifact";
        return factory.createCallExpression(hostMember(member), void 0, [
          siteArg(emit.siteId),
          factory.createStringLiteral(emit.op),
          factory.createArrayLiteralExpression(call.arguments.map(visitExpr))
        ]);
      }
      if (emit.kind === "report") {
        return factory.createCallExpression(hostMember("report"), void 0, [
          siteArg(emit.siteId),
          ...call.arguments.map(visitExpr)
        ]);
      }
      return factory.createCallExpression(hostMember("worldRead"), void 0, [
        siteArg(emit.siteId),
        factory.createStringLiteral(emit.op),
        factory.createArrayLiteralExpression(call.arguments.map(visitExpr))
      ]);
    };
    return (sourceFile) => ts36.visitNode(sourceFile, visit);
  };
  const result = ts36.transform(workflow.scriptFile, [transformer]);
  const transformed = result.transformed[0];
  if (transformed === void 0) throw new Error("lowering: transform produced no source file");
  const printer = ts36.createPrinter({ newLine: ts36.NewLineKind.LineFeed, removeComments: false });
  const instrumented = workflowBody(transformed).map((statement) => printer.printNode(ts36.EmitHint.Unspecified, statement, transformed)).join("\n");
  result.dispose();
  const code = ts36.transpileModule(instrumented, {
    compilerOptions: {
      isolatedModules: false,
      module: ts36.ModuleKind.ESNext,
      newLine: ts36.NewLineKind.LineFeed,
      removeComments: false,
      target: ts36.ScriptTarget.ES2022
    },
    reportDiagnostics: false
  }).outputText;
  return { code, siteIds: sourceOrderSiteIds(table) };
}
function buildSiteMap(table) {
  const map = /* @__PURE__ */ new Map();
  for (const site of table.actors) map.set(site.call, { kind: "actor", siteId: site.id });
  for (const site of table.artifacts) {
    map.set(site.call, { kind: "artifact", op: site.op, siteId: site.id });
  }
  for (const site of table.asks) map.set(site.call, { kind: "ask", siteId: site.id });
  for (const marker of table.phases) map.set(marker.call, { kind: "phase", name: marker.name });
  for (const site of table.reports) map.set(site.call, { kind: "report", siteId: site.id });
  for (const site of table.worldReads) {
    map.set(site.call, { kind: "world-read", op: site.op, siteId: site.id });
  }
  return map;
}
function sourceOrderSiteIds(table) {
  const sited = [
    ...table.actors,
    ...table.artifacts,
    ...table.asks,
    ...table.reports,
    ...table.worldReads
  ];
  return sited.sort((a, b) => a.order - b.order).map((site) => site.id);
}
function workflowBody(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts36.isFunctionDeclaration(statement) && statement.name?.text === WORKFLOW_FUNCTION_NAME && statement.body !== void 0) {
      return statement.body.statements;
    }
  }
  throw new Error(`lowering: ${WORKFLOW_FUNCTION_NAME} not found in transformed source`);
}
function isFacadeArgsRead(node, checker) {
  const parent = node.parent;
  if (parent !== void 0) {
    if (ts36.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts36.isQualifiedName(parent) && parent.right === node) return false;
    if ((ts36.isPropertyAssignment(parent) || ts36.isPropertySignature(parent)) && parent.name === node) {
      return false;
    }
    if (ts36.isShorthandPropertyAssignment(parent) && parent.name === node) return false;
    if (ts36.isBindingElement(parent) && parent.propertyName === node) return false;
    if ((ts36.isVariableDeclaration(parent) || ts36.isParameter(parent) || ts36.isBindingElement(parent) || ts36.isFunctionDeclaration(parent) || ts36.isClassDeclaration(parent)) && parent.name === node) {
      return false;
    }
  }
  return isFacadeDeclared(resolveSymbol(node, checker));
}
function facadeCalleeName(call, checker) {
  const declaration = checker.getResolvedSignature(call)?.declaration;
  if (declaration === void 0 || declaration.getSourceFile().fileName !== FACADE_FILE_NAME) {
    return void 0;
  }
  const name = declaration.name;
  return name !== void 0 && ts36.isIdentifier(name) ? name.text : void 0;
}
export {
  ARTIFACT_CAPS,
  ARTIFACT_DECLARATION_CODE,
  ARTIFACT_HOISTING_CODE,
  ARTIFACT_ID_PATTERN,
  ARTIFACT_PRIMARY_CONFLICT_CODE,
  ARTIFACT_REGISTRY,
  FACADE_DTS,
  FACADE_FILE_NAME,
  FANOUT_EXPAND_CAP,
  FLOW_ABORT,
  FLOW_ENTRY,
  FLOW_SINK,
  GENERIC_SUBMIT_PROFILE,
  HOST_BINDING,
  MAX_UNION_MEMBERS,
  PHASE_MARKER_CODE,
  REPORT_CAPS,
  SCHEMA_DIAGNOSTIC_CODE,
  SCRIPT_FILE_NAME,
  SINK_ID,
  SNIPPET_FACADE_DTS,
  SchemaEmitter,
  SchemaRejection,
  UNKNOWN_LANE,
  UNPHASED,
  UNPHASED_ID,
  WORKSPACE_LANE,
  WORLD_READ_CAPS,
  WORLD_RUN_LITERAL_CODE,
  actorGraphToMermaid,
  analyzeWorkflowScript,
  artifactFamilyOf,
  buildAskSpecs,
  causalityGraphToMermaid,
  collectArtifactDeclarations,
  collectDiagnostics,
  collectPhaseMarkerDiagnostics,
  collectSites,
  collectWorldRunCommands,
  compileWorkflowScript,
  controlFlowToMermaid,
  createWorkflowProgram,
  decodeAnalysisCore,
  deriveActorSubmitProfiles,
  deriveActorSubmitProfilesFor,
  encodeAnalysisCore,
  formatViolation,
  formatViolations,
  handoffGraphToMermaid,
  isArtifactPresetOp,
  lowerWorkflow,
  lowerWorkflowScript,
  phaseFlowToMermaid,
  phaseGraphToMermaid,
  projectCausalityGraph,
  projectControlFlow,
  projectHandoffGraph,
  projectSiteGraph,
  reduceOrdering,
  serializeCausalityGraph,
  serializeControlFlow,
  serializeCore,
  serializeHandoffGraph,
  serializeSchema,
  siteGraphToMermaid,
  synthesizeAskSchemas,
  synthesizeWorkflowSchemas,
  toActorGraph,
  validate
};
