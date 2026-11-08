// Fixed ZCode 3.15.1 ask protocol (Apache-2.0). See build-inputs.json and THIRD_PARTY_NOTICES.md.

// src/presets/zcode/sources/upstream-3.15.1/apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts
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

// zcode-ask:ask-types
var REPAIR_ATTEMPTS = 3;

// src/presets/zcode/sources/upstream-3.15.1/apps/zcode-cli/packages/dynamic-workflow/src/engine/scheduler-submit.ts
function handleSubmitAttempted(seam, instance, payload) {
  const node = seam.liveNode(instance);
  if (node === void 0 || node.settled) return;
  if (!node.spec.typed) return;
  const { value, violations } = normalizeSubmit(seam.host, node.spec.schema, payload);
  if (violations.length === 0) {
    seam.host.driver.respondToSubmit(instance, { kind: "accept" });
    seam.settleOk(node, value);
    return;
  }
  if (node.repairsRemaining > 0) {
    node.repairsRemaining--;
    const attempt = REPAIR_ATTEMPTS - node.repairsRemaining;
    seam.host.driver.respondToSubmit(instance, { kind: "reject", violations });
    seam.host.record({ type: "node-repairing", instance, attempt, violations });
    return;
  }
  seam.host.driver.cancelAsk(instance);
  seam.settleFailed(
    node,
    new WorkflowError(
      "ValidationFailed",
      "submit_result failed schema validation repeatedly and the repair budget is exhausted.",
      { violations }
    )
  );
}
function normalizeSubmit(host, schema, payload) {
  const direct = host.validate(schema, payload);
  if (direct.length === 0) return { value: payload, violations: [] };
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      const after = host.validate(schema, parsed);
      if (after.length === 0) return { value: parsed, violations: [] };
      return { value: parsed, violations: after };
    } catch {
    }
  }
  return { value: payload, violations: direct };
}
function handleTurnEnded(seam, instance, finalText) {
  const node = seam.liveNode(instance);
  if (node === void 0 || node.settled) return;
  if (!node.spec.typed) {
    seam.settleOk(node, finalText);
    return;
  }
  if (node.nudgesRemaining > 0) {
    node.nudgesRemaining--;
    seam.host.driver.respondToSubmit(instance, { kind: "nudge" });
    seam.host.record({ type: "node-nudged", instance });
    return;
  }
  seam.host.driver.cancelAsk(instance);
  seam.settleFailed(
    node,
    new WorkflowError(
      "ResultNotSubmitted",
      "The typed ask ended without a submit_result call, so there is no result.",
      { finalText }
    )
  );
}

// src/presets/zcode/sources/upstream-3.15.1/apps/zcode-cli/packages/bootstrap/src/app/workflow-ask-epilogue.ts
function qualityEpilogue(schema) {
  const fields = topLevelSchemaProperties(schema);
  return [
    "",
    "",
    "---",
    "Standard for this result:",
    "- Every finding cites what you read or ran: path and line for code; the exact command and its output for a check; the part of the ask for material the ask itself gave you.",
    "- A check counts as passed only if you ran it during this ask. Otherwise report it as not run.",
    // 子代理挑最快变绿的命令当「测试跑过了」——ask 说的是整套件，它跑一个文件；
    // ask 说的是 e2e，它跑单测。契约只管它诚实，这句管它的尺度：替身按替身报告，说清跑了哪条。
    "- Run the check the ask names, at the scale it names. A narrower or faster substitute \u2014 one test file for the suite, a build for the tests \u2014 is reported as what it is, never as the ask's check; say the exact command you ran.",
    "- Anything you could not do, verify, or find is stated as such \u2014 never filled with a plausible guess.",
    ...fields.has("evidence") ? ["- Put each finding's citation in its `evidence` field."] : [],
    ...fields.has("confidence") ? ["- Rate `confidence` honestly; a low value with a reason beats a confident guess."] : [],
    "- If you are blocked by something outside your reach, call `escalate` instead of inventing a value."
  ].join("\n");
}
function topLevelSchemaProperties(schema) {
  if (typeof schema !== "object" || schema === null) return /* @__PURE__ */ new Set();
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null) return /* @__PURE__ */ new Set();
  return new Set(Object.keys(properties));
}

// <stdin>
var REPAIR_ATTEMPTS2 = 3;
var NUDGE_ATTEMPTS = 1;
var NUDGE_PROMPT = "You ended your turn without submitting a result. Call the submit_result tool now with a payload conforming to the required schema.";
export {
  NUDGE_ATTEMPTS,
  NUDGE_PROMPT,
  REPAIR_ATTEMPTS2 as REPAIR_ATTEMPTS,
  WorkflowError,
  handleSubmitAttempted,
  handleTurnEnded,
  qualityEpilogue
};
