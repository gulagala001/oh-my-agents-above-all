// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
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
  /** 一个 run 内 `report` 的最大条数。 */
  maxItemsPerRun: 256,
  /** 单条 item 序列化后的最大字节数。 */
  maxItemSerializedBytes: 32 * 1024
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
