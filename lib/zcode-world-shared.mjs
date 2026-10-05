// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.

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

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts
var WorkflowError = class _WorkflowError extends Error {
  code;
  violations;
  finalText;
  mismatch;
  providerStop;
  constructor(code, message, extra) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    if (extra?.violations !== void 0) this.violations = extra.violations;
    if (extra?.finalText !== void 0) this.finalText = extra.finalText;
    if (extra?.mismatch !== void 0) this.mismatch = extra.mismatch;
    if (extra?.providerStop !== void 0) this.providerStop = extra.providerStop;
    if (extra?.cause !== void 0) this.cause = extra.cause;
  }
  /** 转为可序列化形态落 journal。 */
  toJSON() {
    const json = { code: this.code, message: this.message };
    if (this.violations !== void 0) json.violations = this.violations;
    if (this.finalText !== void 0) json.finalText = this.finalText;
    if (this.mismatch !== void 0) json.mismatch = this.mismatch;
    if (this.providerStop !== void 0) json.providerStop = this.providerStop;
    return json;
  }
  /** 从 journal 记录重建（replay 命中失败节点时用）。 */
  static fromJSON(json) {
    return new _WorkflowError(json.code, json.message, {
      violations: json.violations,
      finalText: json.finalText,
      mismatch: json.mismatch,
      providerStop: json.providerStop
    });
  }
};
export {
  WORLD_READ_CAPS,
  WorkflowError
};
