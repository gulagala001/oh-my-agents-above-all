// Derived from version-pinned Apache-2.0 ZCode artifact sources; see source.json and THIRD_PARTY_NOTICES.md.
import { WorkflowError } from "./zcode-world-shared.mjs";
const ARTIFACT_CAPS = {
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
const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const REPORT_CAPS = {
  /**
   * 一个 run 内 `report` 的最大条数。原为 256：那是节点上限（100）还在时按「与之同宽」定的，
   * 节点上限删掉之后，一次「每个任务报一条」的扇出就能合理地撞上它，而撞上的代价是整个 run
   * 失败。条数本身不贵：没有读者会把超出展示界的 item 读进内存（docs/execution-engine.md
   * 「Reading the journal」），磁盘上的总量由 {@link REPORT_CAPS.maxBytesPerRun} 管。
   */
  maxItemsPerRun: 65536,
  /**
   * 单条 item 序列化后的最大字节数。原为 32 KiB；1 MiB 的界来自一条 item 要能放进一个协议
   * 消息（单帧上限 16 MiB，看板与事件日志一页 4 MiB 且至少带一条），并给读取整条 item 的
   * 读者留出余量——冷回放与 GetWorkflowRun 一次最多读 64 条，即至多 64 MiB 的瞬时内存。
   * 更大的产出该走 `artifact.file`（上限 20 MiB，按块读取）。
   */
  maxItemSerializedBytes: 1024 * 1024,
  /**
   * 一个 run 内全部 item 的序列化字节总数上限。没有它，65,536 条 × 1 MiB 就是 64 GiB 的
   * item（磁盘上 128 GiB）。resume 时由 `sumResultBytes` 从 journal 恢复，跨 resume 连续。
   */
  maxBytesPerRun: 1024 * 1024 * 1024
};
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
function fnv1a(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 255;
    hash ^= input.charCodeAt(i) >> 8 & 255;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function inputHash(value) {
  return fnv1a(canonicalJson(value));
}
function refToString(ref) {
  return `${ref.siteId}@${ref.ordinal}`;
}
export {
  ARTIFACT_CAPS,
  ARTIFACT_ID_PATTERN,
  REPORT_CAPS,
  WorkflowError,
  canonicalJson,
  fnv1a,
  inputHash,
  refToString
};
