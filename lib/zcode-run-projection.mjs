// Derived from fixed Apache-2.0 ZCode source; see THIRD_PARTY_NOTICES.md.

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/contracts/src/tools/create-workflow.ts
var CREATE_WORKFLOW_GRAPH_MAX_STEPS = 64;
var CREATE_WORKFLOW_GRAPH_MAX_LANES = 32;
var CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS = 64;
var CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS = 256;
var CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES = 8;
var CREATE_WORKFLOW_GRAPH_MAX_PHASES = 32;
var CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES = 128;
var CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS = 64;
var CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS = 128;

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/causality-reduce.ts
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

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/flow-graph.ts
var FLOW_ENTRY = "entry";
var FLOW_SINK = "sink";
var FLOW_ABORT = "abort";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/dynamic-workflow/src/analysis/handoff-graph.ts
var UNPHASED = "unphased";

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-fold.ts
function foldPhaseEdges(raw) {
  const folded = foldPairs(raw);
  const componentOf = componentsOf(folded);
  const component = (id) => componentOf.get(id) ?? id;
  const keyOf = (from, to, back) => `${from} ${to} ${back}`;
  const order = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const edge of folded) {
    const from = component(edge.from);
    const to = component(edge.to);
    if (from === to) continue;
    const key = keyOf(from, to, edge.back);
    if (byKey.has(key)) continue;
    order.push(key);
    byKey.set(
      key,
      edge.back ? { carryOf: "seq", from, kind: "carry", to } : { from, kind: "seq", to }
    );
  }
  const condensed = order.map((key) => byKey.get(key));
  const kept = new Set(
    reduceOrdering(condensed).map((edge) => keyOf(edge.from, edge.to, edge.kind === "carry"))
  );
  return folded.filter((edge) => {
    const from = component(edge.from);
    const to = component(edge.to);
    return from === to || kept.has(keyOf(from, to, edge.back));
  });
}
function foldPairs(raw) {
  const order = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const edge of raw) {
    if (edge.from === edge.to) continue;
    const key = `${edge.from} ${edge.to}`;
    const seen = byKey.get(key);
    if (seen === void 0) {
      order.push(key);
      byKey.set(key, { ...edge });
    } else {
      seen.back = seen.back && edge.back;
    }
  }
  return order.map((key) => byKey.get(key));
}
function componentsOf(folded) {
  const nodes = [];
  const seen = /* @__PURE__ */ new Set();
  const next = /* @__PURE__ */ new Map();
  for (const edge of folded) {
    for (const id of [edge.from, edge.to]) {
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push(id);
    }
    if (edge.back) continue;
    const list = next.get(edge.from);
    if (list === void 0) next.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const reach = /* @__PURE__ */ new Map();
  for (const start of nodes) {
    const reached = /* @__PURE__ */ new Set();
    const stack = [...next.get(start) ?? []];
    while (stack.length > 0) {
      const node = stack.pop();
      if (reached.has(node)) continue;
      reached.add(node);
      stack.push(...next.get(node) ?? []);
    }
    reach.set(start, reached);
  }
  const componentOf = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (componentOf.has(node)) continue;
    componentOf.set(node, node);
    for (const other of reach.get(node) ?? []) {
      if (componentOf.has(other)) continue;
      if (reach.get(other)?.has(node) === true) componentOf.set(other, node);
    }
  }
  return componentOf;
}

// src/presets/zcode/sources/upstream/apps/zcode-cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.ts
function boundCausalityGraph(graph, flow, handoff) {
  let truncated = graph.steps.length > CREATE_WORKFLOW_GRAPH_MAX_STEPS;
  const headSteps = graph.steps.slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS);
  const wantedLanes = /* @__PURE__ */ new Set();
  for (const step of headSteps) {
    wantedLanes.add(step.lane);
    for (const lane of step.lanes ?? []) wantedLanes.add(lane);
  }
  const laneList = graph.lanes.filter((lane) => wantedLanes.has(lane.id));
  truncated = truncated || laneList.length > CREATE_WORKFLOW_GRAPH_MAX_LANES;
  const keptLanes = laneList.slice(0, CREATE_WORKFLOW_GRAPH_MAX_LANES);
  const laneIds = new Set(keptLanes.map((lane) => lane.id));
  const steps = headSteps.filter((step) => laneIds.has(step.lane));
  truncated = truncated || steps.length < headSteps.length;
  const stepIds = new Set(steps.map((step) => step.id));
  const laneOk = (lane) => laneIds.has(lane);
  const participantList = [];
  for (const participant of handoff?.participants ?? []) {
    if (!laneOk(participant.lane)) continue;
    const memberSteps = participant.steps.filter((id) => stepIds.has(id));
    if (memberSteps.length === 0) continue;
    participantList.push({
      id: boundGraphText(participant.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      phase: boundGraphText(participant.phase, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      lane: boundGraphText(participant.lane, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      steps: memberSteps.slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS).map((id) => boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS)),
      ...participant.member === void 0 ? {} : { member: { ...participant.member } },
      ...participant.many === true ? { many: true } : {}
    });
  }
  truncated = truncated || participantList.length < (handoff?.participants.length ?? 0);
  truncated = truncated || participantList.length > CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS;
  const participants = participantList.slice(0, CREATE_WORKFLOW_GRAPH_MAX_PARTICIPANTS);
  const participantIds = new Set(participants.map((participant) => participant.id));
  const handoffList = (handoff?.handoffs ?? []).filter((edge) => participantIds.has(edge.from) && participantIds.has(edge.to)).map((edge) => {
    const types = (edge.types ?? []).slice(0, CREATE_WORKFLOW_GRAPH_MAX_HANDOFF_TYPES).map((type) => boundGraphText(type, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS)).filter((type) => type.length > 0);
    return {
      from: boundGraphText(edge.from, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      to: boundGraphText(edge.to, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...edge.back === true ? { back: true } : {},
      ...types.length > 0 ? { types } : {}
    };
  });
  truncated = truncated || handoffList.length < (handoff?.handoffs.length ?? 0);
  truncated = truncated || handoffList.length > CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS;
  const handoffs = handoffList.slice(0, CREATE_WORKFLOW_GRAPH_MAX_HANDOFFS);
  const sink = (graph.sink?.fedBy ?? []).filter((id) => stepIds.has(id)).slice(0, CREATE_WORKFLOW_GRAPH_MAX_STEPS).map((id) => boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));
  const declaredPhases = flow?.phases;
  const phaseIds = new Set((declaredPhases ?? []).map((phase) => phase.id));
  const rawPhaseEdges = [];
  const exitSet = /* @__PURE__ */ new Set();
  for (const edge of flow?.phaseEdges ?? []) {
    if (edge.from === FLOW_ENTRY || edge.from === FLOW_ABORT || edge.to === FLOW_ABORT) continue;
    if (!phaseIds.has(edge.from)) continue;
    if (edge.to === FLOW_SINK) {
      exitSet.add(edge.from);
      continue;
    }
    if (!phaseIds.has(edge.to)) continue;
    rawPhaseEdges.push({ back: edge.kind === "loop", from: edge.from, to: edge.to });
  }
  const phaseEdges = foldPhaseEdges(rawPhaseEdges).map((edge) => ({
    from: boundGraphText(edge.from, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    to: boundGraphText(edge.to, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
    ...edge.back ? { back: true } : {}
  }));
  const phaseVocabularyDropped = declaredPhases !== void 0 && (declaredPhases.length > CREATE_WORKFLOW_GRAPH_MAX_PHASES || phaseEdges.length > CREATE_WORKFLOW_GRAPH_MAX_PHASE_EDGES);
  truncated = truncated || phaseVocabularyDropped;
  const emitPhases = declaredPhases !== void 0 && !phaseVocabularyDropped;
  const boundPhases = (declaredPhases ?? []).map((phase) => {
    const name = phase.name ? boundGraphText(phase.name, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS) : void 0;
    const alongside = [];
    const alongsideSeen = /* @__PURE__ */ new Set();
    for (const id of phase.alongside ?? []) {
      if (id === phase.id || !phaseIds.has(id) || alongsideSeen.has(id)) continue;
      if (alongside.length >= CREATE_WORKFLOW_GRAPH_MAX_PHASES) break;
      alongsideSeen.add(id);
      alongside.push(boundGraphText(id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));
    }
    return {
      id: boundGraphText(phase.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...name === void 0 ? {} : { name },
      ...phase.loc === void 0 ? {} : { line: phase.loc.line, column: phase.loc.column },
      ...alongside.length === 0 ? {} : { alongside }
    };
  });
  const exits = (declaredPhases ?? []).filter((phase) => exitSet.has(phase.id)).map((phase) => boundGraphText(phase.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS));
  const boundLanes = keptLanes.map((lane) => {
    const name = lane.name ? boundGraphText(lane.name, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS) : void 0;
    const namePattern = boundNamePattern(lane.namePattern);
    return {
      id: boundGraphText(lane.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...name === void 0 ? {} : { name },
      ...namePattern === void 0 ? {} : { namePattern },
      ...lane.loc === void 0 ? {} : { line: lane.loc.line, column: lane.loc.column }
    };
  });
  const boundSteps = steps.map((step) => {
    const lanes = (step.lanes ?? []).filter((lane) => laneIds.has(lane));
    const label = step.label ? boundGraphText(step.label, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS) : step.id;
    const labelPattern = boundNamePattern(step.labelPattern);
    return {
      id: boundGraphText(step.id, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      kind: step.kind,
      label,
      ...labelPattern === void 0 ? {} : { labelPattern },
      line: step.loc.line,
      column: step.loc.column,
      lane: boundGraphText(step.lane, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS),
      ...lanes.length > 1 ? { lanes } : {},
      // may-set 拷贝的关联键：这里指向的站点已被拷贝替换，所以它**不**参与上面的引用完整性
      // 收敛（那条规则管的是边与 sink 指向的节点）。字段可选，漏掉不会被 schema 抓住，只会
      // 让实时叠加悄悄关联不上实例。
      ...step.source === void 0 ? {} : { source: boundGraphText(step.source, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS) },
      // 词汇表整体降级时 `phase` 必须一起消失，指向未列出阶段的 `phase` 同样消失：带着一个
      // 不在 `phases` 里的阶段 id 的卡片是悬空引用，UI 会去查一个不存在的阶段。分析器保证
      // 「每个 issue 的阶段都是某个 node 的阶段」，所以正常输入下这一收紧零行为变化；裁剪层
      // 的姿态照旧是自卫而非信任生产者。
      ...emitPhases && step.phase !== void 0 && phaseIds.has(step.phase) ? { phase: boundGraphText(step.phase, CREATE_WORKFLOW_GRAPH_MAX_ID_CHARS) } : {},
      ...step.repeat === void 0 ? {} : { repeat: step.repeat }
    };
  });
  const boundParticipants = participants.map(
    (participant) => emitPhases && phaseIds.has(participant.phase) ? participant : { ...participant, phase: UNPHASED }
  );
  return {
    steps: boundSteps,
    lanes: boundLanes,
    participants: boundParticipants,
    handoffs,
    ...emitPhases ? { phases: boundPhases, phaseEdges, exits } : {},
    ...sink.length > 0 ? { sink } : {},
    ...truncated ? { truncated: true } : {}
  };
}
function boundGraphText(value, maxChars) {
  const bounded = value.slice(0, maxChars);
  const lastCodeUnit = bounded.charCodeAt(bounded.length - 1);
  return lastCodeUnit >= 55296 && lastCodeUnit <= 56319 ? bounded.slice(0, -1) : bounded;
}
function boundNamePattern(pattern) {
  if (pattern === void 0) return void 0;
  const head = pattern.head ? boundGraphText(pattern.head, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS) : "";
  const tail = pattern.tail ? boundGraphText(pattern.tail, CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS) : "";
  if (head === "" && tail === "") return void 0;
  return {
    ...head === "" ? {} : { head },
    ...tail === "" ? {} : { tail }
  };
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs.ts
import { z as z3 } from "zod";

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts
import { z as z2 } from "zod";

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/core.ts
import { z } from "zod";

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-media-policy.ts
var VIDEO_INPUT_MAX_BYTES = 30 * 1024 * 1024;

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/core.ts
var conversationRowTargetSchema = z.object({
  rowId: z.number().int().nonnegative(),
  entityId: z.string().trim().min(1)
}).strict();
var timestampSchema = z.number();
var streamablePathSchema = z.enum(["text", "inputText", "output.text", "summaryText"]);
var PROTOCOL_V4_LIMITS = {
  maxFrameBytes: 1024 * 1024,
  logicalFrameAssemblyMaxBytes: 16 * 1024 * 1024,
  logicalFrameAssemblyMaxFragments: 1024,
  logicalFrameAssemblyMaxConcurrent: 32,
  logicalFrameAssemblyMaxStagedBytes: 32 * 1024 * 1024,
  logicalFrameAssemblyTimeoutMs: 3e4,
  transportEnvelopeIdMaxChars: 256,
  subscriberBufferMaxOps: 500,
  subscriberBufferMaxBytes: 1024 * 1024,
  eventRetentionPerSession: 2e3,
  snapshotTailWindowRows: 60,
  rowsRangeMaxLimit: 200,
  toolOutputFinalHeadBytes: 32 * 1024,
  toolOutputFinalTailBytes: 32 * 1024,
  goalVerificationsRetained: 20,
  pendingCommandsDisplayMax: 32,
  commandPendingTtlMs: 24 * 60 * 60 * 1e3,
  idempotencyTablePerSession: 512,
  conversationQueryTimeoutMs: 1e4,
  attachmentMaxBytes: 20 * 1024 * 1024,
  attachmentChunkMaxBytes: 512 * 1024,
  attachmentPreviewMaxBytes: VIDEO_INPUT_MAX_BYTES,
  // share 选择阶段的 metadata-only stat 曾复用 attachmentPreviewMaxBytes
  // （30MiB）作为 totalBytes 上限，于是超过该值的附件在 schema 校验就抛错，
  // 「容量超限」这个本应确定阻断的分类反而被降级成 deferred 并静默丢内容。
  // stat 不搬运字节，只需要一个足够表达真实文件大小的上界。
  attachmentStatMaxBytes: 2 * 1024 * 1024 * 1024,
  attachmentPreviewMaxChunks: VIDEO_INPUT_MAX_BYTES / (512 * 1024),
  attachmentReadCacheMaxBytes: VIDEO_INPUT_MAX_BYTES,
  attachmentReadCacheTtlMs: 3e4,
  attachmentUploadMaxChunks: 64,
  attachmentUploadMaxConcurrent: 16,
  attachmentUploadMaxStagedBytes: 64 * 1024 * 1024,
  attachmentUploadTtlMs: 5 * 6e4,
  attachmentUnreferencedTtlMs: 24 * 60 * 60 * 1e3
};

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts
var workflowRunArtifactKindSchema = z2.enum([
  "file",
  "markdown",
  "chart",
  "table",
  "metrics",
  "board"
]);
var WORKFLOW_ARTIFACT_LIMITS = {
  maxIdLength: 64,
  maxTitleLength: 120,
  maxDescriptionLength: 500,
  /** 每 id ≤ 16 版（`ARTIFACT_CAPS.maxVersionsPerArtifact`）。 */
  maxVersions: 16,
  /** `workflowRunArtifactData` 一页的条目上界；`limit` 的钳制在网关侧。 */
  maxItemsPerPage: 500,
  /** 一页的缺省条数（调用方不传 limit 时网关用它）。 */
  defaultItemsPerPage: 200
};
var workflowRunArtifactVersionSchema = z2.object({
  version: z2.number().int().positive().max(WORKFLOW_ARTIFACT_LIMITS.maxVersions),
  title: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxTitleLength).optional(),
  description: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxDescriptionLength).optional(),
  contentType: z2.string().min(1).max(128).optional(),
  /** 该版本在 store 里的字节数（内容成员才有）。 */
  bytes: z2.number().int().nonnegative().optional(),
  /** store 的 `zcode-artifact://…`；**只给 CLI 侧用**，模型与 renderer 都读不了它。 */
  uri: z2.string().min(1).max(512).optional(),
  /** 工作区相对的原路径（`file` 才有）——卡片的「在工作区显示」按它定位。 */
  sourcePath: z2.string().min(1).max(1024).optional(),
  /** 预置看板的 spec（canonical）。形状由 UI 的四个渲染器各自解释，协议不复述。 */
  spec: z2.unknown().optional(),
  /** 发布时刻（epoch 毫秒）。 */
  publishedAt: z2.number().int().nonnegative(),
  /** 这一版属于 run 的交付物；引擎盖章，按 id 粘着。 */
  primary: z2.literal(true).optional()
}).strict();
var workflowRunArtifactSchema = z2.object({
  id: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
  kind: workflowRunArtifactKindSchema,
  title: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxTitleLength).optional(),
  description: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxDescriptionLength).optional(),
  contentType: z2.string().min(1).max(128).optional(),
  sourcePath: z2.string().min(1).max(1024).optional(),
  spec: z2.unknown().optional(),
  /** 最新版号（= `versions` 末项的 version）。 */
  version: z2.number().int().positive().max(WORKFLOW_ARTIFACT_LIMITS.maxVersions),
  /** 版本升序。失败的发布**不在**这里：失败行不认领 id / 种类 / 版本。 */
  versions: z2.array(workflowRunArtifactVersionSchema).max(WORKFLOW_ARTIFACT_LIMITS.maxVersions),
  /** 打了这个 id 标签的 `report` 条目数（预置看板的数据量；内容产物恒 0）。 */
  itemCount: z2.number().int().nonnegative(),
  /** run 的交付物（至多一件）；清单以它带头。 */
  primary: z2.literal(true).optional()
}).strict();
var workflowRunArtifactSummarySchema = z2.object({
  id: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
  kind: workflowRunArtifactKindSchema,
  title: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxTitleLength).optional(),
  version: z2.number().int().positive().max(WORKFLOW_ARTIFACT_LIMITS.maxVersions),
  contentType: z2.string().min(1).max(128).optional(),
  bytes: z2.number().int().nonnegative().optional(),
  itemCount: z2.number().int().nonnegative().optional(),
  /** run 的交付物（至多一件）。UI 据它排先后与选形态；缺席即不是。 */
  primary: z2.literal(true).optional()
}).strict();
var v4ConversationWorkflowRunArtifactsParamsSchema = z2.object({
  sessionId: z2.string().min(1),
  runId: z2.string().min(1)
}).strict();
var v4ConversationWorkflowRunArtifactsResultSchema = z2.object({
  /** 按首次出现顺序（= journal 里该 id 第一条 artifact 行的 ordinal）。 */
  artifacts: z2.array(workflowRunArtifactSchema)
}).strict();
var v4ConversationWorkflowRunArtifactDataParamsSchema = z2.object({
  sessionId: z2.string().min(1),
  runId: z2.string().min(1),
  artifactId: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
  /** 只取 sequence 严格大于该值的条目；缺省从头取。 */
  afterSequence: z2.number().int().nonnegative().optional(),
  /** 缺省 200、钳 [1, 500]——两者都在网关侧执行（存储层不得自造页大小，也不得再钳）。 */
  limit: z2.number().int().positive().max(WORKFLOW_ARTIFACT_LIMITS.maxItemsPerPage).optional()
}).strict();
var v4ConversationWorkflowRunArtifactDataResultSchema = z2.object({
  items: z2.array(
    z2.object({
      /** journal sequence——回传成 `afterSequence` 就是下一页的游标。 */
      sequence: z2.number().int().nonnegative(),
      /** 产出该条目的 report 站点（如 `report#1`）。 */
      siteId: z2.string().min(1).max(64),
      ordinal: z2.number().int().nonnegative(),
      /**
       * 条目原值，**不做预览序列化**：看板的纯函数要按字段路径取数
       * （`ChartSpec.x.field` 形如 "timing.after"），拿到一段 pretty JSON 文本就没法取了。
       * 单条在线上已由 `REPORT_CAPS.maxItemSerializedBytes`（32KB）与事件载荷有界化
       * 双重保证，这里不再叠一层界。
       */
      item: z2.unknown()
    }).strict()
  ),
  /** 本页取满 limit 且后面仍有条目（网关多取一条判定）。 */
  hasMore: z2.boolean()
}).strict();
var v4ConversationWorkflowRunArtifactReadParamsSchema = z2.object({
  sessionId: z2.string().min(1),
  runId: z2.string().min(1),
  artifactId: z2.string().min(1).max(WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
  version: z2.number().int().positive().max(WORKFLOW_ARTIFACT_LIMITS.maxVersions),
  offset: z2.number().int().nonnegative(),
  limit: z2.number().int().positive().max(PROTOCOL_V4_LIMITS.attachmentChunkMaxBytes)
}).strict();
var v4ConversationWorkflowRunArtifactReadResultSchema = z2.object({
  /** base64（不带 data: 前缀）；解码后 ≤ attachmentChunkMaxBytes。 */
  dataBase64: z2.string(),
  /**
   * 该版本的 contentType，取 journal 记录上的值（driver 按扩展名表算出、`opts.contentType`
   * 可覆盖）——那是 UI 分派渲染器的**精确匹配**契约。刻意不像 attachmentRead 那样把
   * mediaType 限死在 image/video/pdf：产物的合法类型就是 driver 那张 17 项扩展名表加
   * `application/octet-stream`，限死会让 markdown 与 office 文件整条读不出来。
   */
  mediaType: z2.string().min(1).max(128),
  /** 该版本的总字节数（≤ ARTIFACT_CAPS.maxFileBytes = attachmentMaxBytes）。 */
  totalBytes: z2.number().int().nonnegative().max(PROTOCOL_V4_LIMITS.attachmentMaxBytes),
  /** 下一块的 offset；本块读到尾时为 null。 */
  nextOffset: z2.number().int().positive().nullable()
}).strict().superRefine((value, context) => {
  const decodedBytes = decodedBase64ByteLength(value.dataBase64);
  if (decodedBytes === null) {
    context.addIssue({ code: "custom", message: "invalid base64", path: ["dataBase64"] });
    return;
  }
  if (decodedBytes > PROTOCOL_V4_LIMITS.attachmentChunkMaxBytes) {
    context.addIssue({
      code: "too_big",
      maximum: PROTOCOL_V4_LIMITS.attachmentChunkMaxBytes,
      origin: "string",
      inclusive: true,
      message: "workflow artifact read chunk exceeds decoded byte limit",
      path: ["dataBase64"]
    });
  }
  if (value.nextOffset !== null && value.nextOffset > value.totalBytes) {
    context.addIssue({
      code: "custom",
      message: "nextOffset exceeds totalBytes",
      path: ["nextOffset"]
    });
  }
});
function decodedBase64ByteLength(value) {
  if (value.length === 0) return 0;
  if (value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return value.length / 4 * 3 - padding;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs.ts
var WORKFLOW_RUNS_LIMITS = {
  /** 最近若干个 run；超出按最旧淘汰。 */
  maxRuns: 8,
  /**
   * actors 与 nodes 使用相同的容量上限，避免节点可展示而所属子代理提前被截断。
   * 键级增量使每个事件只传输改动部分；容量上限用于限制单条 run 的投影大小，
   * 并限制异常脚本持续创建条目带来的资源消耗。跨 run 的总量由 {@link maxTotalEntries} 控制。
   * 这是展示状态的容量限制，不限制引擎实际运行的子代理数量。
   */
  maxActors: 1024,
  maxNodes: 1024,
  /**
   * 整个状态键的条目预算：所有 run 的 `nodes.length + actors.length` 之和。
   *
   * 单条 run 的界乘以 {@link maxRuns} 是 16384 条，按每条约 150 字节算就是 ~2.5 MB ——
   * 离 16 MiB 的快照上限不远，而快照是要整份序列化的。预算把最坏情形压回 ~1 MB，
   * 代价是**最旧的终态 run** 会提前离场（它的完整事实仍在 journal 里，详情页照样查得到）。
   * 归约在超预算时只淘汰终态 run，绝不动在跑的 run，也绝不动事件所属的那条。
   */
  maxTotalEntries: 6144,
  /**
   * 详情页 Results 区的**展示**预算，刻意远小于引擎的 run 级 report 上限（256 条）：
   * 协议线上的界是展示预算，引擎的界才是契约，两者不必相等。超出这个界的条目仍在
   * journal 里（`dwf_node.kind = "report"`），只是不进这条高频状态键。
   */
  maxReports: 64,
  maxReportPreviewLength: 2048,
  maxResultPreviewLength: 2048,
  maxErrorLength: 2048,
  /**
   * 同时停驻的升级问题条数。引擎侧的真实上界是
   * per-ask 3 条 × 在飞 ask 数（maxConcurrency），32 因此在任何现实 caps 下都够用；
   * 它同时是一道防线——一个疯掉的脚本不该能把一个高频状态键撑爆。
   */
  maxPendingQuestions: 32,
  /** 问题与补充说明的展示上界。与事件载荷的字符串界（2048）同值，所以正常路径永不截断。 */
  maxQuestionLength: 2048,
  /** 并发桶的 provider key（`${providerId}/${modelId}`）上界。 */
  maxConcurrencyKeyLength: 256,
  /**
   * 子代理模型串（`providerId/modelId`，可带 `$reasoningLevel` 后缀）的线上上界。与并发桶的
   * provider key 同值：两者是同一族标识串，只是这一条可能多一个推理档后缀。
   */
  maxSubagentModelLength: 256,
  /**
   * `run.concurrencyCeiling` 的上界。天花板按 `min(16, cores − 2)` 推导，这条界只挡坏载荷
   * （reducer 读到界外的值当作读不出，沿用已知值）。
   */
  maxConcurrencyCeiling: 1024,
  /**
   * 子代理展示名的线上上界（actor.name 与 pendingQuestion.actorName 同值）。名字是脚本作者
   * 写的任意字符串（`agent("reader-" + paths.join("+"))`），reducer 必须按这条界裁剪后再上线：
   * 曾因一个 131 字的名字让父会话之后的每一帧被渲染端拒收，订阅永久失效。
   */
  maxActorNameLength: 128,
  /**
   * 用户面产物的条数。与引擎侧的
   * `ARTIFACT_CAPS.maxArtifactsPerRun` **同值**，理由与 maxReports 的「展示预算 <
   * 引擎契约」相反：产物的引擎上限本来就是 32，把展示界压得更低只会让一个跑在上限上的
   * 脚本在侧板里静默少掉几张卡，而这些卡正是这个特性存在的全部理由。
   */
  maxArtifacts: 32,
  /**
   * 被进入过的阶段条数。与 display
   * 载荷的 `CREATE_WORKFLOW_GRAPH_MAX_PHASES` 同值：时间线上画不出的阶段，投影里也不必记。
   */
  maxPhases: 32,
  /** 阶段名的线上上界，与 display 的 `CREATE_WORKFLOW_GRAPH_MAX_NAME_CHARS` 同值（UI 按名字关联两边）。 */
  maxPhaseNameLength: 128,
  /**
   * 一次 ask 的**任务摘要**上界（`node-queued` 的 `instructionsHead`）。与引擎侧的
   * `INSTRUCTIONS_HEAD_MAX_CHARS` 同值：那一头已经按这条界切好，这里是线上的第二道闸。
   * 240 是「一眼看出这个子代理被派去干什么」所需的长度——再长就是在协议线上搬运指令全文，
   * 而指令全文有 journal 与子代理转录两处可去。
   */
  maxInstructionsHeadLength: 240,
  /** 最近一次工具调用的工具名上界（与 actor/node 的 siteId 同量级，工具名是标识符不是文本）。 */
  maxLastToolNameLength: 64,
  /**
   * 最近一次工具调用的**目标**上界（文件路径、命令头）。与引擎侧的
   * `LAST_TOOL_TARGET_MAX_CHARS` 同值。这条界同时是一条安全界：它只放得下一个路径或命令头，
   * 放不下参数全文或文件内容——后两者永远不该出现在这条高频状态键上。
   */
  maxLastToolTargetLength: 120
};
var workflowRunPhaseSchema = z3.object({
  name: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength),
  rounds: z3.number().int().positive()
});
var workflowRunUnlistedPhaseSchema = z3.object({
  phaseName: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  actors: z3.number().int().nonnegative(),
  actorsSettled: z3.number().int().nonnegative().optional(),
  actorsFailed: z3.number().int().nonnegative().optional(),
  settled: z3.number().int().nonnegative()
});
var workflowRunUsageSchema = z3.object({
  spentTokens: z3.number().int().nonnegative(),
  nodesUsed: z3.number().int().nonnegative(),
  /**
   * 撞上 {@link WORKFLOW_RUNS_LIMITS.maxNodes} 被**拒之表外**的实例数，以及其中已结算的条数。`truncated` 只说得出「有东西没进来」，说不出
   * 有多少——于是一个 3000 路 fan-out 的 run 在读面上会显示成「1024 步」，那是一句假话。
   *
   * 两条都是**加出来**的计数（被拒实例根本不在表里，没有可去重的身份），所以归约只在事件
   * **抬过水位**时才计，重传的队尾事件不会把它们越推越高。`run-started` 连同整个 usage 一起
   * 清零：resume 会把脚本前缀重发一遍，不清零等于把两世的步数加在一起。零时整个键缺席。
   */
  nodesUnlisted: z3.number().int().nonnegative().optional(),
  nodesUnlistedSettled: z3.number().int().nonnegative().optional()
});
var workflowRunActorSchema = z3.object({
  siteId: z3.string().min(1).max(64),
  ordinal: z3.number().int().nonnegative(),
  name: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxActorNameLength).optional(),
  sessionId: z3.string().min(1).max(256).optional(),
  status: z3.enum(["waiting", "running", "completed"]),
  /**
   * 这个实例**出生**在哪个阶段：它的 ordinal 被铸造的那一刻，控制流所在的 `phase("…")` 标记名。UI 按**名字**与 `phases[].name`
   * 关联——名字是引擎与分析器唯一共享的词汇，所以界与 `maxPhaseNameLength` 同值。
   *
   * 缺席有两种读法，消费者都要认：出生在任何标记之前（脚本没写 `phase()`，或写在后面），
   * 或者发事件的是不带这个键的旧 CLI。
   */
  phaseName: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional()
});
var workflowRunNodeLastToolSchema = z3.object({
  name: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxLastToolNameLength),
  target: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxLastToolTargetLength).optional()
});
var workflowRunNodeSchema = z3.object({
  siteId: z3.string().min(1).max(64),
  ordinal: z3.number().int().nonnegative(),
  kind: z3.enum(["ask", "world-read"]).optional(),
  phase: z3.enum(["queued", "dispatched", "executing", "waiting", "repairing", "nudged", "settled"]),
  outcome: z3.enum(["ok", "failed", "cancelled"]).optional(),
  cached: z3.boolean().optional(),
  /** 该节点所属 actor 的站点 id（world-read 无 actor）。 */
  actorSiteId: z3.string().min(1).max(64).optional(),
  actorOrdinal: z3.number().int().nonnegative().optional(),
  /**
   * 这个实例**出生**在哪个阶段，
   * 语义与 {@link workflowRunActorSchema} 的同名键逐字相同：ordinal 被铸造那一刻的
   * `phase("…")` 标记名，UI 按名字与 `phases[].name` 关联；缺席 = 出生在任何标记之前，或旧 CLI。
   *
   * ⚠ 与上面的 `phase` **不是**一回事：`phase` 是节点的生命周期相位（queued / executing /
   * settled…），`phaseName` 是脚本阶段坐标。字段特意不叫 `phase` 就是为了不把两个概念揉在一起。
   *
   * 引擎只在**出生事件**上打戳（`node-queued`，以及 replay 命中时直接发的
   * `node-settled { cached: true }`）；其余 `node-*` 不带，由 reducer 向前携带。
   */
  phaseName: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  /**
   * 这次 ask 的**任务**：作者写的 `instructions` 的头 240 字，随 `node-queued` 到达。读面据它回答「这个子代理被派去干什么」——
   * 相位只说得出「在跑」，说不出在跑什么。
   *
   * 是**作者原文**的头，不含引擎后来追加的尾注（那些是运行时脚手架，不是任务）。
   * 缺席有两种读法，消费者都要认：world-read 节点（没有指令），或不带这个键的旧 CLI/旧 journal。
   */
  instructionsHead: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxInstructionsHeadLength).optional(),
  /**
   * 这次 ask 走到第几个已解析轮次（1 起，nudge 轮次计入），以及累计工具调用数与最近一次
   * 工具调用——随 `node-progress` 到达，每个已解析轮次一条。
   *
   * 三者一起回答「它在动吗」：一个卡在 `executing` 十分钟的 ask，只有这几个读数能分出
   * 「在干一件长活」与「已经死了」。**没有 `node-progress` 的旧 journal 上三键全缺席**，
   * 读面必须把缺席显示成「不知道」，而不是显示成 0 —— 0 是「一个工具都没调过」的事实。
   *
   * 归约是**后来者覆盖**而不是取 max（与 `phases[].rounds` 相反）：同一实例在 resume 里被
   * 重新 queue 时是一次全新的 ask，轮次从 1 重新数，取 max 会把上一世的读数冻在这里。
   */
  turn: z3.number().int().positive().optional(),
  toolCalls: z3.number().int().nonnegative().optional(),
  lastTool: workflowRunNodeLastToolSchema.optional()
});
var workflowRunConcurrencySchema = z3.object({
  key: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxConcurrencyKeyLength).optional(),
  cap: z3.number().int().positive(),
  ceiling: z3.number().int().positive(),
  limit: z3.number().int().positive().optional(),
  cooldownMs: z3.number().int().nonnegative().optional()
});
var workflowRunReportSchema = z3.object({
  siteId: z3.string().min(1).max(64),
  ordinal: z3.number().int().nonnegative(),
  preview: z3.string().max(WORKFLOW_RUNS_LIMITS.maxReportPreviewLength),
  /**
   * `report(item, artifactId)` 的第二实参：这条条目喂给哪个**预置看板**。缺席 = 没打标签，照旧只进 Results 区。
   *
   * 带标签的条目**仍然进 `reports`**：一条通道一套上限，标签只是多一个去处，不是改道。
   * 上界与产物 id 同（64），因为它就是一个产物 id。
   */
  artifactId: z3.string().min(1).max(64).optional()
});
var workflowRunPendingQuestionSchema = z3.object({
  /** 全局唯一的问题 id（形如 `dwfq-<runId 片段>-<seq>`）。主代理按它作答。 */
  qid: z3.string().min(1).max(128),
  actorSiteId: z3.string().min(1).max(64).optional(),
  actorOrdinal: z3.number().int().nonnegative().optional(),
  actorName: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxActorNameLength).optional(),
  question: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxQuestionLength),
  context: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxQuestionLength).optional(),
  /**
   * 提问时刻（epoch 毫秒），由事件携带——本模块是纯归约，没有时钟可用。
   *
   * 事件侧**必填**（driver 是唯一生产者，与停驻记录取同一个 `Date.now()`），这里仍然 optional：
   * 老开发机上的 journal 可能重放出 askedAt 之前的事件。所以渲染侧按「有则显示等待时长」处理，
   * 缺席不是错误。
   */
  askedAt: z3.number().int().nonnegative().optional()
});
var workflowRunSchema = z3.object({
  runId: z3.string().min(1).max(128),
  /** 发起该 run 的 CreateWorkflow 工具调用（工具卡 → 详情页的关联键）。 */
  toolCallId: z3.string().min(1).max(128).optional(),
  status: z3.enum(["pending", "running", "completed", "errored", "stopped"]),
  /** `status === "stopped"` 才在场。 */
  stopReason: z3.enum(["user", "model", "provider", "interrupted", "superseded"]).optional(),
  /**
   * lineage 的两端：本 run 修订自哪个 run
   * （`run-started` 载荷的 `resumedFrom`），以及本 run 被哪次修订停下并替代（`run-settled` 载荷的
   * `supersededBy`，只随 `stopReason: "superseded"` 出现）。两者都 optional，理由与 `reports` 同：
   * 往已有状态键追加字段，旧 CLI 不发它们时少一个键是退化，不是整帧被丢。
   */
  resumedFrom: z3.string().min(1).max(128).optional(),
  supersededBy: z3.string().min(1).max(128).optional(),
  usage: workflowRunUsageSchema,
  error: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxErrorLength).optional(),
  /**
   * 可恢复。**为真才在场**。
   *
   * 由 CLI 在 `run-settled` 载荷上按 resume 门的同一个谓词给出（live 由 toProgressPayload 算，
   * 冷回放由补种按 journal 行算），reducer 只搬运——UI 绝不自行按 status + failureCode 推导
   * （两处谓词总有一天不一致：按钮亮着但命令被拒）。optional 的理由与 `reports` 同：往已有
   * 状态键追加字段，旧 CLI 不发它时少一个键是退化，不是整帧被丢。
   */
  resumable: z3.literal(true).optional(),
  resultPreview: z3.string().max(WORKFLOW_RUNS_LIMITS.maxResultPreviewLength).optional(),
  actors: z3.array(workflowRunActorSchema).max(WORKFLOW_RUNS_LIMITS.maxActors),
  nodes: z3.array(workflowRunNodeSchema).max(WORKFLOW_RUNS_LIMITS.maxNodes),
  /**
   * `report(item)` 交出的渐进产物，按报告顺序。**零条时整个键缺席**（不是空数组）：
   * Results 区据此整区不渲染，而不是给不用 `report` 的工作流留一节空壳。
   *
   * 刻意 optional 而不是必填：这是往一个**已有状态键**上追加字段，而已知键上的解析错误
   * 不会被剥离——它会让整个 `state.updated` patch 失败、整帧被丢。
   * 必填意味着任何一个不发 reports 的旧 CLI 都会触发那一档；optional 让它退化成「少一个键」。
   */
  reports: z3.array(workflowRunReportSchema).max(WORKFLOW_RUNS_LIMITS.maxReports).optional(),
  /**
   * 停驻中的升级问题，按提问顺序。**零条时整个键缺席**（不是空数组），与 `reports` 同一条
   * 惯例：侧栏据此整区不渲染，而不是给一个没人提问的 run 留一节空壳。
   *
   * 「零条」是这个键的**常态**，而且它会来回进出：问题一被作答就从表里消失，答完最后一个
   * 又退回缺席。所以消费者不能把「见过一次这个键」当成它会一直在。
   *
   * optional 的第二个理由与 `reports` 相同：这是往一个**已有状态键**上追加字段，而已知键上的
   * 解析错误不会被剥离——必填会让任何一个不发该字段的旧 CLI 整帧被丢。
   */
  pendingQuestions: z3.array(workflowRunPendingQuestionSchema).max(WORKFLOW_RUNS_LIMITS.maxPendingQuestions).optional(),
  /**
   * 并发现状（见 {@link workflowRunConcurrencySchema}）。只在**两条界里有一条低于天花板**时
   * 在场：收到过 `concurrency-changed`（共享桶被限流压低），或 `run-started` 带来一个低于天花板
   * 的 `limit`（用户给这次 run 定了上限）。两者都没有的 run 一直跑在天花板上，没有可说的。
   * optional 的理由与 `reports` / `pendingQuestions` 同。
   */
  concurrency: workflowRunConcurrencySchema.optional(),
  /**
   * 本机的并发天花板（`run-started` 载荷的 `concurrencyCeiling`，CLI 铸载荷时拼进去的进程事实）。
   * 与 `concurrency.ceiling` 不同：那是读数芯片自己的水位，只随芯片在场；这一个**只要读得到就在**，
   * 不论本 run 是否低于它——「配置」弹层的步进器停在这里。optional 的理由与 `concurrency` 同：老 CLI 不发，少一个键是退化。
   */
  concurrencyCeiling: z3.number().int().positive().max(WORKFLOW_RUNS_LIMITS.maxConcurrencyCeiling).optional(),
  /**
   * 这次 run 的**子代理**跑在哪个模型上（`CreateWorkflow` / `AmendWorkflow` 的 `subagent_model`
   * 落到载荷的 `subagentModel`），规范串 `providerId/modelId`，可带 `$reasoningLevel` 后缀。
   * 随 `run-started` 到达、整条 run 不动——与 `concurrency.limit` 同族：用户给这次 run 定下的
   * 条件，不随运行时涨落。
   *
   * **只在用户给这次 run 指定过模型时在场**：不指定的 run 里子代理跟随会话模型，没有可说的。
   * 主代理无论如何都留在会话模型上，所以这个键说的只是子代理那一侧。
   * optional 的理由与 `reports` / `concurrency` 逐字相同：往已有状态键追加字段，旧 CLI 不发它时
   * 少一个键是退化，不是整帧被丢。
   */
  subagentModel: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxSubagentModelLength).optional(),
  /**
   * 本 run 发布的**用户面产物**，按首次出现顺序，每项只带**最新版**的元数据。**零件时整个键缺席**（不是空数组）：
   * 侧板的 Artifacts 区据此整区不渲染——「无则缺席」与 `reports` / `pendingQuestions` 同规。
   *
   * optional 的第二个理由与 `reports` 逐字相同，也是这里真正要紧的那个：这是往一个**已有
   * 状态键**上追加字段，而已知键上的解析错误不会被剥离——必填会让任何一个不发产物的旧 CLI
   * 整帧被丢。少一个键是退化，不是错误。
   *
   * ⚠ 术语：这里的 artifact 是脚本发布给用户看的产出，不是 `resultPreview` 背后那个
   * 「脚本顶层返回值」（引擎内部也叫 artifact）。见 workflow-artifacts.ts 的文件头。
   */
  artifacts: z3.array(workflowRunArtifactSummarySchema).max(WORKFLOW_RUNS_LIMITS.maxArtifacts).optional(),
  /**
   * 被进入过的阶段，按首次进入顺序。
   * **零条时整个键缺席**；optional 的理由与 `reports` 逐字相同（旧 CLI 不发它，少一个键是退化
   * 不是错误）。时间线据它给零成员的站点灯、给所有站补「第一个 ask 派发之前」那段的 running。
   */
  phases: z3.array(workflowRunPhaseSchema).max(WORKFLOW_RUNS_LIMITS.maxPhases).optional(),
  /** 控制流最后进入的阶段名（最后一条 `phase-entered`）；从未进入过任何阶段时缺席。 */
  currentPhase: z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength).optional(),
  /**
   * 脚本**声明**的阶段表，按声明序（`run-launched.phaseNames`）。与 `phases`（已进入的）互补：侧栏迷你轨道据此画出前方还没到的站点。
   * 零条 / 旧 CLI / 无标记脚本时整个键缺席。
   */
  phaseNames: z3.array(z3.string().min(1).max(WORKFLOW_RUNS_LIMITS.maxPhaseNameLength)).max(WORKFLOW_RUNS_LIMITS.maxPhases).optional(),
  /**
   * 与 `phaseNames` **按位置对齐**的「同时在跑」表（`run-launched.phaseAlongside`）：
   * `phaseAlongside[i]` 是进入 `phaseNames[i]` 时 strand 仍在跑的其他阶段的**下标**，下标落在
   * `phaseNames` 这张表上。侧栏迷你轨道据此把并行的两站之间画成双线段
   *
   * 依附 `phaseNames`：后者不在场时它一定不在场；没有任何阶段并行时同样缺席——缺席就是
   * 「这条轨道是一条直线」。归约保证每个下标都落在被接受的那张表里（workflow-runs-phases.ts）。
   */
  phaseAlongside: z3.array(z3.array(z3.number().int().nonnegative()).max(WORKFLOW_RUNS_LIMITS.maxPhases)).max(WORKFLOW_RUNS_LIMITS.maxPhases).optional(),
  /**
   * 界在各个出生阶段上花掉了多少（见 {@link workflowRunUnlistedPhaseSchema}）。**一格都没有时
   * 整个键缺席**。表长比 `maxPhases` 多一格：那一格是「无阶段」，它与具名阶段共用同一张表。
   *
   * 表满之后新阶段的归属**丢掉**，run 级两个计数器照旧准——一个站点可以少一个它本来就没有的
   * 数字，run 的总数不可以说假话。
   */
  unlistedByPhase: z3.array(workflowRunUnlistedPhaseSchema).max(WORKFLOW_RUNS_LIMITS.maxPhases + 1).optional(),
  /**
   * actors / nodes / reports / pendingQuestions / artifacts / phases 触到上限后置位；
   * 原始事实仍在 journal。淘汰（给活的新人腾位）同样置位：这条 run 的条目表已经装不下它
   * 自己的事实了，而 `run-started` 正是按这一位决定新一世要不要从空表重开。
   */
  truncated: z3.boolean().optional(),
  /** 最后一条已归约事件的 journal sequence；抬升即事件日志重取的触发条件。 */
  lastEventSequence: z3.number().int().nonnegative()
});
var workflowRunsStateSchema = z3.object({
  revision: z3.number().int().nonnegative(),
  runs: z3.array(workflowRunSchema).max(WORKFLOW_RUNS_LIMITS.maxRuns)
});

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-artifact.ts
function serializeWorkflowArtifact(value) {
  if (value === void 0) return void 0;
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value, null, 2);
    return text === void 0 ? String(value) : text;
  } catch {
    return String(value);
  }
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-actor-status.ts
function actorKey(siteId, ordinal) {
  return `${siteId}\0${ordinal}`;
}
function withDerivedWorkflowActorStatuses(run) {
  const executing = /* @__PURE__ */ new Set();
  const live = /* @__PURE__ */ new Set();
  const owned = /* @__PURE__ */ new Set();
  for (const node of run.nodes) {
    if (node.actorSiteId === void 0 || node.actorOrdinal === void 0) continue;
    const key = actorKey(node.actorSiteId, node.actorOrdinal);
    owned.add(key);
    switch (node.phase) {
      case "executing":
      case "repairing":
      case "nudged":
        executing.add(key);
        break;
      case "queued":
      case "dispatched":
      case "waiting":
        live.add(key);
        break;
      default:
        break;
    }
  }
  const runLive = run.status === "pending" || run.status === "running";
  return {
    ...run,
    actors: run.actors.map((actor) => {
      const key = actorKey(actor.siteId, actor.ordinal);
      const status = !runLive ? "completed" : executing.has(key) ? "running" : live.has(key) || !owned.has(key) ? "waiting" : "completed";
      return actor.status === status ? actor : { ...actor, status };
    })
  };
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-artifacts.ts
var ARTIFACT_KINDS = /* @__PURE__ */ new Set([
  "file",
  "markdown",
  "chart",
  "table",
  "metrics",
  "board"
]);
function workflowArtifactSummary(value) {
  if (!isPlainRecord(value)) return void 0;
  const id = nonEmptyString(value.id);
  const kind = nonEmptyString(value.kind);
  const version = value.version;
  if (id === void 0 || kind === void 0 || !ARTIFACT_KINDS.has(kind)) return void 0;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return void 0;
  const title = nonEmptyString(value.title);
  const contentType = nonEmptyString(value.contentType);
  const bytes = value.bytes;
  return {
    id: id.slice(0, WORKFLOW_ARTIFACT_LIMITS.maxIdLength),
    kind,
    ...title === void 0 ? {} : { title: title.slice(0, WORKFLOW_ARTIFACT_LIMITS.maxTitleLength) },
    version: Math.min(version, WORKFLOW_ARTIFACT_LIMITS.maxVersions),
    ...contentType === void 0 ? {} : { contentType: contentType.slice(0, 128) },
    ...typeof bytes === "number" && Number.isInteger(bytes) && bytes >= 0 ? { bytes } : {},
    ...value.primary === true ? { primary: true } : {}
  };
}
function upsertBoundedByArtifactId(list, entry, limit) {
  const index = list.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    const previous = list[index];
    const next = [...list];
    next[index] = {
      ...entry,
      ...previous.itemCount === void 0 ? {} : { itemCount: previous.itemCount }
    };
    return { list: next, truncated: false };
  }
  if (list.length >= limit) return { list: [...list], truncated: true };
  return { list: [...list, entry], truncated: false };
}
function countTaggedReport(list, artifactId) {
  if (list === void 0) return void 0;
  const index = list.findIndex((item) => item.id === artifactId);
  if (index < 0) return void 0;
  const previous = list[index];
  const next = [...list];
  next[index] = { ...previous, itemCount: (previous.itemCount ?? 0) + 1 };
  return next;
}
function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-caps.ts
function countUnlistedInstance(usage, event) {
  if (!event.rejected || !event.advancesWaterMark) return usage;
  const settled = event.eventType === "node-settled";
  const born = event.eventType === "node-queued" || settled && event.cached;
  if (!born && !settled) return usage;
  const nodesUnlisted = (usage.nodesUnlisted ?? 0) + (born ? 1 : 0);
  const nodesUnlistedSettled = (usage.nodesUnlistedSettled ?? 0) + (settled ? 1 : 0);
  return {
    ...usage,
    // 零时整个键缺席（与 reports / pendingQuestions 同规）：没撞过界的 run 一个新键都不多。
    ...nodesUnlisted > 0 ? { nodesUnlisted } : {},
    ...nodesUnlistedSettled > 0 ? { nodesUnlistedSettled } : {}
  };
}
function discountUnlistedInstance(usage) {
  const current = usage.nodesUnlisted ?? 0;
  if (current === 0) return usage;
  const { nodesUnlisted: _returned, nodesUnlistedSettled: settled, ...head } = usage;
  return {
    ...head,
    ...current > 1 ? { nodesUnlisted: current - 1 } : {},
    ...settled === void 0 ? {} : { nodesUnlistedSettled: settled }
  };
}
function evictForEntryBudget(runs, eventRunId) {
  let total = 0;
  for (const run of runs) total += run.nodes.length + run.actors.length;
  if (total <= WORKFLOW_RUNS_LIMITS.maxTotalEntries) return runs;
  let remaining = runs;
  while (total > WORKFLOW_RUNS_LIMITS.maxTotalEntries) {
    const index = remaining.findIndex(
      (run) => run.runId !== eventRunId && run.status !== "pending" && run.status !== "running"
    );
    if (index < 0) break;
    total -= remaining[index].nodes.length + remaining[index].actors.length;
    remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
  }
  return remaining;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-unlisted.ts
function addToUnlistedBucket(buckets, phaseName, delta, maxPhases) {
  const current = buckets ?? [];
  const index = current.findIndex((bucket) => bucket.phaseName === phaseName);
  if (index < 0 && current.length >= maxPhases + 1) {
    return buckets === void 0 ? void 0 : [...buckets];
  }
  const base = index < 0 ? void 0 : current[index];
  const actors = atLeastZero((base?.actors ?? 0) + (delta.actors ?? 0));
  const actorsSettled = Math.min(
    atLeastZero((base?.actorsSettled ?? 0) + (delta.actorsSettled ?? 0)),
    actors
  );
  const actorsFailed = Math.min(
    atLeastZero((base?.actorsFailed ?? 0) + (delta.actorsFailed ?? 0)),
    actorsSettled
  );
  const settled = atLeastZero((base?.settled ?? 0) + (delta.settled ?? 0));
  if (actors === 0 && actorsSettled === 0 && actorsFailed === 0 && settled === 0) {
    if (index < 0) return buckets === void 0 ? void 0 : [...buckets];
    const remaining = current.filter((_, position) => position !== index);
    return remaining.length > 0 ? remaining : void 0;
  }
  const merged = {
    ...phaseName === void 0 ? {} : { phaseName },
    actors,
    ...actorsSettled > 0 ? { actorsSettled } : {},
    ...actorsFailed > 0 ? { actorsFailed } : {},
    settled
  };
  if (index < 0) return [...current, merged];
  const next = [...current];
  next[index] = merged;
  return next;
}
function withUnlistedBuckets(run, buckets) {
  if (buckets === run.unlistedByPhase) return run;
  if (buckets === void 0 || buckets.length === 0) {
    if (run.unlistedByPhase === void 0) return run;
    const { unlistedByPhase: _emptied, ...withoutKey } = run;
    return withoutKey;
  }
  return { ...run, unlistedByPhase: [...buckets] };
}
function atLeastZero(value) {
  return value > 0 ? value : 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-eviction.ts
function sameInstance(left, right) {
  return left.siteId === right.siteId && left.ordinal === right.ordinal;
}
function isFailed(node) {
  return node.outcome === "failed" || node.outcome === "cancelled";
}
function admitsNewEntry(run, live) {
  return run.truncated !== true || live;
}
function withRoomForActor(run, ref, limits = WORKFLOW_RUNS_LIMITS) {
  if (run.actors.length < limits.maxActors) return run;
  if (run.actors.some((actor) => sameInstance(actor, ref))) return run;
  const victim = pickVictim(listedGroups(run).filter((group) => group.finished));
  return victim === void 0 ? run : evictGroup(run, victim, limits);
}
function seatWorkflowNode(run, seat, limits = WORKFLOW_RUNS_LIMITS) {
  const byBirth = admitsNewEntry(run, seat.born && seat.advancesWaterMark);
  if (!seat.advancesWaterMark) return { run, admitNew: byBirth, activated: false };
  if (seat.eventType === "node-dispatched" && seat.actor !== null && run.truncated === true) {
    return activateInstance(run, seat.ref, seat.actor, limits);
  }
  if (seat.eventType !== "node-queued") return { run, admitNew: byBirth, activated: false };
  if (run.truncated === true && seat.actorRef !== null && !run.actors.some((actor) => sameInstance(actor, seat.actorRef))) {
    return { run, admitNew: false, activated: false };
  }
  return {
    run: withRoomForNode(run, seat.ref, seat.actorRef, limits),
    admitNew: byBirth,
    activated: false
  };
}
function withRoomForNode(run, ref, owner, limits) {
  if (run.nodes.length < limits.maxNodes) return run;
  if (run.nodes.some((node) => sameInstance(node, ref))) return run;
  const loose = pickVictim(looseSettledNodes(run));
  if (loose !== void 0) return evictSingleNode(run, loose, limits);
  const victim = pickVictim(spareGroups(run, owner).filter((group) => group.finished));
  return victim === void 0 ? run : evictGroup(run, victim, limits);
}
function activateInstance(run, ref, actor, limits) {
  const nodeListed = run.nodes.some((node) => sameInstance(node, ref));
  const actorListed = run.actors.some((listed) => sameInstance(listed, actor));
  if (nodeListed && actorListed) return { run, admitNew: true, activated: false };
  let next = run;
  if (!actorListed && next.actors.length >= limits.maxActors) {
    const victim = pickGroupVictim(next, null, true);
    if (victim === void 0) return { run, admitNew: false, activated: false };
    next = evictGroup(next, victim, limits);
  }
  if (!nodeListed && next.nodes.length >= limits.maxNodes) {
    const own = ownSettledNodes(next, actor)[0];
    if (own !== void 0) next = evictSingleNode(next, own, limits);
    else {
      const loose = pickVictim(looseSettledNodes(next));
      if (loose !== void 0) next = evictSingleNode(next, loose, limits);
      else {
        const victim = pickGroupVictim(next, actor, false);
        if (victim === void 0) return { run, admitNew: false, activated: false };
        next = evictGroup(next, victim, limits);
      }
    }
  }
  if (!actorListed) {
    next = withUnlistedBuckets(
      { ...next, actors: [...next.actors, actor] },
      addToUnlistedBucket(next.unlistedByPhase, actor.phaseName, { actors: -1 }, limits.maxPhases)
    );
  }
  return { run: next, admitNew: true, activated: !nodeListed };
}
function absorbRefusedActor(run, phaseName, limits = WORKFLOW_RUNS_LIMITS) {
  return withUnlistedBuckets(
    run,
    addToUnlistedBucket(run.unlistedByPhase, phaseName, { actors: 1 }, limits.maxPhases)
  );
}
function absorbRefusedSettledNode(run, node, limits = WORKFLOW_RUNS_LIMITS) {
  let buckets = addToUnlistedBucket(
    run.unlistedByPhase,
    node.phaseName,
    { settled: 1 },
    limits.maxPhases
  );
  const owner = node.actorSiteId === void 0 || node.actorOrdinal === void 0 ? null : { siteId: node.actorSiteId, ordinal: node.actorOrdinal };
  const index = owner === null ? -1 : run.actors.findIndex((actor2) => sameInstance(actor2, owner));
  const actor = index < 0 ? void 0 : run.actors[index];
  const orphan = actor !== void 0 && !ownsListedNode(run, actor);
  if (orphan) {
    buckets = addToUnlistedBucket(
      buckets,
      actor.phaseName,
      { actors: 1, actorsSettled: 1, actorsFailed: isFailed(node) ? 1 : 0 },
      limits.maxPhases
    );
  }
  return withUnlistedBuckets(
    orphan ? { ...run, actors: run.actors.filter((_, position) => position !== index) } : run,
    buckets
  );
}
function workflowRunTablesForNewLife(run) {
  if (run.truncated !== true) return { actors: run.actors, nodes: run.nodes };
  return { actors: [], nodes: [] };
}
function pickGroupVictim(run, owner, allowZeroNode) {
  const groups = spareGroups(run, owner);
  return pickVictim(groups.filter((group) => group.finished)) ?? // 空闲组取表内**最靠后**的：FIFO 下最后建出来的那个最后才轮到派活，它的位子最不急着用。
  groups.filter((group) => group.idle).at(-1) ?? // 零节点 actor 同理取最靠后的，而且是最后一档：它没有节点、没有分数、表里也没有历史，
  // 淘汰它读者看不见任何损失，而它自己下一次被派活时会带着事实回来。少了这一档，一次
  // resume 之后的宽 fan-out 会卡死——空表重开、前缀把 2000 个 actor 重新建出来、命中缓存的
  // 结算又不带 actor，于是一张全是零节点 actor 的表谁都淘汰不动，此后每一次派发都被拒。
  (allowZeroNode ? groups.filter((group) => group.zeroNode).at(-1) : void 0);
}
function spareGroups(run, owner) {
  const groups = listedGroups(run);
  if (owner === null) return groups;
  return groups.filter((group) => !sameInstance(run.actors[group.index], owner));
}
function pickVictim(candidates) {
  if (candidates.length === 0) return void 0;
  const unfailed = candidates.filter((candidate) => !candidate.failed);
  const pool = unfailed.length > 0 ? unfailed : candidates;
  const crowd = /* @__PURE__ */ new Map();
  for (const candidate of pool) {
    const key = candidate.phaseName ?? "";
    crowd.set(key, (crowd.get(key) ?? 0) + 1);
  }
  let best = pool[0];
  let bestCrowd = crowd.get(best.phaseName ?? "") ?? 0;
  for (const candidate of pool) {
    const size = crowd.get(candidate.phaseName ?? "") ?? 0;
    if (size > bestCrowd) {
      best = candidate;
      bestCrowd = size;
    }
  }
  return best;
}
function listedGroups(run) {
  const owned = /* @__PURE__ */ new Map();
  run.nodes.forEach((node, index) => {
    if (node.actorSiteId === void 0 || node.actorOrdinal === void 0) return;
    const key = instanceKey({ siteId: node.actorSiteId, ordinal: node.actorOrdinal });
    const bucket = owned.get(key) ?? { nodeIndexes: [], live: false, queued: false, failed: false };
    bucket.nodeIndexes.push(index);
    if (node.phase === "queued") bucket.queued = true;
    else if (node.phase !== "settled") bucket.live = true;
    if (isFailed(node)) bucket.failed = true;
    owned.set(key, bucket);
  });
  const groups = [];
  run.actors.forEach((actor, index) => {
    const bucket = owned.get(instanceKey(actor));
    if (bucket?.live === true) return;
    groups.push({
      index,
      phaseName: actor.phaseName,
      failed: bucket?.failed ?? false,
      nodeIndexes: bucket?.nodeIndexes ?? [],
      finished: bucket !== void 0 && !bucket.queued,
      idle: bucket?.queued === true,
      // 一条已列节点都没有：只有 activation 的 actor 位那一支拿它当受害者（见 pickGroupVictim），
      // 出生那两条路径都只认 `finished`，所以这一档不会在界之下改变任何东西。
      zeroNode: bucket === void 0
    });
  });
  return groups;
}
function looseSettledNodes(run) {
  const candidates = [];
  run.nodes.forEach((node, index) => {
    if (node.actorSiteId !== void 0 || node.phase !== "settled") return;
    candidates.push({ index, phaseName: node.phaseName, failed: isFailed(node) });
  });
  return candidates;
}
function ownSettledNodes(run, owner) {
  const candidates = [];
  run.nodes.forEach((node, index) => {
    if (node.actorSiteId !== owner.siteId || node.actorOrdinal !== owner.ordinal) return;
    if (node.phase !== "settled") return;
    candidates.push({ index, phaseName: node.phaseName, failed: isFailed(node) });
  });
  return candidates;
}
function ownsListedNode(run, actor) {
  return run.nodes.some(
    (node) => node.actorSiteId === actor.siteId && node.actorOrdinal === actor.ordinal
  );
}
function instanceKey(ref) {
  return `${ref.siteId}\0${ref.ordinal}`;
}
function evictGroup(run, group, limits) {
  const actor = run.actors[group.index];
  const dropped = new Set(group.nodeIndexes);
  const evicted = group.nodeIndexes.map((index) => run.nodes[index]);
  return {
    ...withUnlistedEvictions(
      run,
      evicted,
      {
        phaseName: actor.phaseName,
        actors: 1,
        ...group.finished ? { actorsSettled: 1, actorsFailed: group.failed ? 1 : 0 } : {}
      },
      limits
    ),
    actors: run.actors.filter((_, index) => index !== group.index),
    nodes: run.nodes.filter((_, index) => !dropped.has(index)),
    truncated: true
  };
}
function evictSingleNode(run, candidate, limits) {
  const node = run.nodes[candidate.index];
  return {
    ...withUnlistedEvictions(run, [node], void 0, limits),
    nodes: run.nodes.filter((_, index) => index !== candidate.index),
    truncated: true
  };
}
function withUnlistedEvictions(run, nodes, agent, limits) {
  let buckets = run.unlistedByPhase;
  if (agent !== void 0) {
    const { phaseName, ...delta } = agent;
    buckets = addToUnlistedBucket(buckets, phaseName, delta, limits.maxPhases);
  }
  let settledCount = 0;
  for (const node of nodes) {
    if (node.phase !== "settled") continue;
    settledCount += 1;
    buckets = addToUnlistedBucket(buckets, node.phaseName, { settled: 1 }, limits.maxPhases);
  }
  const settledTotal = (run.usage.nodesUnlistedSettled ?? 0) + settledCount;
  return withUnlistedBuckets(
    {
      ...run,
      usage: {
        ...run.usage,
        nodesUnlisted: (run.usage.nodesUnlisted ?? 0) + nodes.length,
        // 零时整个键缺席（与 workflow-runs-caps.ts 同规）。
        ...settledTotal > 0 ? { nodesUnlistedSettled: settledTotal } : {}
      }
    },
    buckets
  );
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-concurrency.ts
var CONCURRENCY_IDLE_RESET_REASON = "idle_reset";
function reduceConcurrencyChanged(run, payload) {
  const next = positiveInteger(payload.next);
  if (next === void 0) return run;
  const previous = positiveInteger(payload.previous) ?? next;
  const ceiling = Math.max(run.concurrency?.ceiling ?? 0, previous, next);
  const key = nonEmptyString2(payload.key);
  const limit = run.concurrency?.limit;
  const cooldownMs = payload.reason === CONCURRENCY_IDLE_RESET_REASON ? void 0 : nonNegativeInteger(payload.cooldownMs);
  const concurrency = {
    ...key === void 0 || key.length > WORKFLOW_RUNS_LIMITS.maxConcurrencyKeyLength ? {} : { key },
    cap: next,
    ceiling,
    ...limit === void 0 ? {} : { limit },
    ...cooldownMs === void 0 ? {} : { cooldownMs }
  };
  return { ...run, concurrency };
}
function reduceRunStartedConcurrency(run, payload) {
  const limit = positiveInteger(plainRecord(payload.caps)?.maxConcurrency);
  const readCeiling = positiveInteger(payload.concurrencyCeiling);
  const ceiling = readCeiling !== void 0 && readCeiling <= WORKFLOW_RUNS_LIMITS.maxConcurrencyCeiling ? readCeiling : void 0;
  const withCeiling = ceiling === void 0 || run.concurrencyCeiling === ceiling ? run : { ...run, concurrencyCeiling: ceiling };
  if (limit === void 0 || ceiling === void 0 || limit >= ceiling) return withCeiling;
  const existing = withCeiling.concurrency;
  const concurrency = {
    // 没有共享桶读数时，cap 从天花板起步——桶本来就是从那里开始的（同 reduceConcurrencyChanged
    // 推导 ceiling 的那条依据）。
    ...existing ?? { cap: ceiling },
    ceiling: Math.max(existing?.ceiling ?? 0, ceiling),
    limit
  };
  return { ...withCeiling, concurrency };
}
function reduceRunCapsChanged(run, payload) {
  const maxConcurrency = positiveInteger(plainRecord(payload.caps)?.maxConcurrency);
  const readCeiling = positiveInteger(payload.concurrencyCeiling);
  const payloadCeiling = readCeiling !== void 0 && readCeiling <= WORKFLOW_RUNS_LIMITS.maxConcurrencyCeiling ? readCeiling : void 0;
  const withCeiling = payloadCeiling === void 0 || run.concurrencyCeiling === payloadCeiling ? run : { ...run, concurrencyCeiling: payloadCeiling };
  const ceiling = payloadCeiling ?? withCeiling.concurrencyCeiling;
  if (maxConcurrency === void 0 || ceiling === void 0) return withCeiling;
  const existing = withCeiling.concurrency;
  if (maxConcurrency < ceiling) {
    const concurrency = {
      // 没有共享桶读数时 cap 从天花板起步——与 reduceRunStartedConcurrency 同一条依据。
      ...existing ?? { cap: ceiling },
      ceiling: Math.max(existing?.ceiling ?? 0, ceiling),
      limit: maxConcurrency
    };
    return { ...withCeiling, concurrency };
  }
  if (existing?.limit === void 0) return withCeiling;
  const { limit: _lifted, ...shared } = existing;
  return shared.cooldownMs === void 0 && shared.cap >= shared.ceiling ? withoutConcurrency(withCeiling) : { ...withCeiling, concurrency: shared };
}
function withoutConcurrency(run) {
  const { concurrency: _cleared, ...rest } = run;
  return rest;
}
function withoutCooldown(run) {
  if (run.concurrency?.cooldownMs === void 0) return run;
  const { cooldownMs: _expired, ...rest } = run.concurrency;
  return { ...run, concurrency: rest };
}
function positiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : void 0;
}
function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function nonEmptyString2(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function plainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-entries.ts
function workflowActorEntry(ref, name, phaseName, sessionId) {
  const bounded = boundedActorName(nonEmptyString3(name));
  return {
    siteId: ref.siteId,
    ordinal: ref.ordinal,
    ...bounded === void 0 ? {} : { name: bounded },
    ...sessionId ? { sessionId } : {},
    ...phaseName === void 0 ? {} : { phaseName },
    status: "waiting"
  };
}
function boundedActorName(name) {
  return name === void 0 ? void 0 : name.slice(0, WORKFLOW_RUNS_LIMITS.maxActorNameLength);
}
function boundedPhaseName(name) {
  return name === void 0 ? void 0 : name.slice(0, WORKFLOW_RUNS_LIMITS.maxPhaseNameLength);
}
function nonEmptyString3(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-delta.ts
var WORKFLOW_RUN_KEYS = Object.keys(workflowRunSchema.shape);
var WORKFLOW_RUN_KEY_SET = new Set(WORKFLOW_RUN_KEYS);
var WORKFLOW_RUN_HEADER_KEYS = WORKFLOW_RUN_KEYS.filter(
  (key) => key !== "actors" && key !== "nodes"
);
var runShape = workflowRunSchema.shape;
var WORKFLOW_RUN_REQUIRED_HEADER_KEYS = WORKFLOW_RUN_HEADER_KEYS.filter((key) => !runShape[key].safeParse(void 0).success);
function canonicalWorkflowRun(run) {
  const source = run;
  const canonical = {};
  for (const key of WORKFLOW_RUN_KEYS) {
    const value = source[key];
    if (value !== void 0) canonical[key] = value;
  }
  for (const key of Object.keys(source)) {
    if (WORKFLOW_RUN_KEY_SET.has(key)) continue;
    const value = source[key];
    if (value !== void 0) canonical[key] = value;
  }
  return canonical;
}
function jsonValueEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonValueEqual(item, b[index]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const left = a;
  const right = b;
  let present = 0;
  for (const key of Object.keys(left)) {
    const value = left[key];
    if (value === void 0) continue;
    present += 1;
    if (!jsonValueEqual(value, right[key])) return false;
  }
  let expected = 0;
  for (const key of Object.keys(right)) if (right[key] !== void 0) expected += 1;
  return present === expected;
}
function workflowRunUnchanged(previous, next) {
  return jsonValueEqual(previous, next);
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-observation-display.ts
import { z as z4 } from "zod";
var WORKFLOW_RUN_STOP_REASONS = [
  "user",
  "model",
  "provider",
  "interrupted",
  "superseded"
];
var WORKFLOW_RUN_OBSERVATION_STATUSES = [
  "pending",
  "running",
  "completed",
  "errored",
  "stopped"
];
var usageSchema = z4.object({
  spentTokens: z4.number(),
  nodesObserved: z4.number(),
  nodesRunning: z4.number(),
  nodesCompleted: z4.number(),
  nodesFailed: z4.number()
}).strict();
var actorSchema = z4.object({
  siteId: z4.string(),
  ordinal: z4.number(),
  name: z4.string().optional()
}).strict();
var workflowRunPhaseViewSchema = z4.object({
  name: z4.string().min(1).max(128),
  state: z4.enum(["done", "current", "ahead", "unfinished"]),
  rounds: z4.number().int().nonnegative(),
  nodesSettled: z4.number().int().nonnegative(),
  nodesRunning: z4.number().int().nonnegative(),
  enteredAt: z4.number().optional(),
  exitedAt: z4.number().optional()
}).strict();
var workflowRunLastToolSchema = z4.object({
  name: z4.string().min(1).max(64),
  target: z4.string().max(120).optional(),
  at: z4.number().optional()
}).strict();
var workflowRunSubagentViewSchema = z4.object({
  siteId: z4.string().min(1),
  ordinal: z4.number().int().nonnegative(),
  name: z4.string().max(128).optional(),
  state: z4.enum(["idle", "executing", "waiting", "parked", "done", "failed", "unfinished"]),
  phaseName: z4.string().max(128).optional(),
  instructionsHead: z4.string().max(240).optional(),
  startedAt: z4.number().optional(),
  turn: z4.number().int().nonnegative().optional(),
  toolCalls: z4.number().int().nonnegative().optional(),
  lastTool: workflowRunLastToolSchema.optional(),
  waitCause: z4.enum(["slot", "backoff"]).optional(),
  retryAfterMs: z4.number().nonnegative().optional(),
  waitSince: z4.number().optional(),
  parkedOn: z4.string().optional(),
  stepsSettled: z4.number().int().nonnegative(),
  stepsFailed: z4.number().int().nonnegative(),
  tokens: z4.number().int().nonnegative(),
  lastProgressAt: z4.number().optional()
}).strict();
var workflowRunHealthSchema = z4.object({
  lastProgressAt: z4.number().optional(),
  stalledSince: z4.number().optional(),
  concurrency: z4.object({
    effective: z4.number().int().nonnegative(),
    cap: z4.number().int().positive(),
    reason: z4.string().max(240).optional(),
    since: z4.number().optional()
  }).strict().optional(),
  consecutiveFailures: z4.number().int().nonnegative(),
  cachedSteps: z4.number().int().nonnegative(),
  leftoverRunning: z4.number().int().positive().optional(),
  pendingQuestionsKnown: z4.boolean()
}).strict();
var diagnosticSchema = z4.object({
  line: z4.number().int().nonnegative(),
  column: z4.number().int().nonnegative(),
  code: z4.number().int().nonnegative(),
  message: z4.string().min(1).max(2048)
}).strict();
var workflowRunSummaryRowSchema = z4.object({
  runId: z4.string().min(1),
  label: z4.string(),
  labelSource: z4.enum(["name", "script"]),
  status: z4.enum(WORKFLOW_RUN_OBSERVATION_STATUSES),
  stopReason: z4.enum(WORKFLOW_RUN_STOP_REASONS).optional(),
  ownedByThisSession: z4.boolean(),
  possiblyInterrupted: z4.boolean().optional(),
  createdAt: z4.number(),
  updatedAt: z4.number(),
  spentTokens: z4.number()
}).strict();
var toolCallGetWorkflowRunDisplaySchema = z4.object({
  kind: z4.literal("get_workflow_run"),
  runId: z4.string().min(1),
  label: z4.string(),
  status: z4.enum(WORKFLOW_RUN_OBSERVATION_STATUSES),
  stopReason: z4.enum(WORKFLOW_RUN_STOP_REASONS).optional(),
  possiblyInterrupted: z4.boolean().optional(),
  // 情势截面五件全部可选：情势上线前持久化的 transcript 载荷没有这些键，而本 schema 是
  // strict 的——设成必填会让升级后打开的每一条历史会话里这张卡整块被剥、退化成纯文本。
  // 构造侧每次仍然全填（CLI 侧同款注释）。
  summary: z4.string().max(400).optional(),
  generatedAt: z4.number().optional(),
  usage: usageSchema,
  phases: z4.array(workflowRunPhaseViewSchema).max(32).optional(),
  subagents: z4.array(workflowRunSubagentViewSchema).max(64).optional(),
  health: workflowRunHealthSchema.optional(),
  actors: z4.array(actorSchema).max(32),
  logTail: z4.array(
    z4.object({
      sequence: z4.number(),
      message: z4.string().max(1024),
      // 事件落 journal 的时刻（epoch ms）；卡上的「多久以前」对 generatedAt 算。
      // 可选：这一列在情势截面之前的载荷上不存在，读旧行时缺席而不是拒收。
      at: z4.number().optional()
    }).strict()
  ).max(40),
  result: z4.string().max(4e3).optional(),
  error: z4.object({
    code: z4.string(),
    message: z4.string()
  }).strict().optional(),
  truncated: z4.boolean().optional()
}).strict();
var toolCallListWorkflowRunsDisplaySchema = z4.object({
  kind: z4.literal("list_workflow_runs"),
  runs: z4.array(workflowRunSummaryRowSchema).max(50),
  truncated: z4.boolean().optional()
}).strict();
var toolCallEvalWorkflowSnippetDisplaySchema = z4.object({
  kind: z4.literal("eval_workflow_snippet"),
  ok: z4.boolean(),
  diagnostics: z4.array(diagnosticSchema).max(100),
  logs: z4.array(z4.string().max(1024)).max(40),
  response: z4.string().max(4e3),
  durationMs: z4.number().int().nonnegative(),
  truncated: z4.boolean().optional()
}).strict();
var toolCallSavedWorkflowListDisplaySchema = z4.object({
  kind: z4.literal("saved_workflow_list"),
  workflows: z4.array(
    z4.object({
      name: z4.string().min(1),
      description: z4.string().max(2048).optional(),
      whenToUse: z4.string().max(2048).optional(),
      scope: z4.string(),
      path: z4.string().min(1),
      argNames: z4.array(z4.string()).max(32)
    }).strict()
  ).max(50),
  invalid: z4.array(
    z4.object({
      path: z4.string().min(1),
      reason: z4.string().max(1024).optional()
    }).strict()
  ).optional(),
  truncated: z4.boolean().optional()
}).strict();
var toolCallListModelsDisplaySchema = z4.object({
  kind: z4.literal("list_models"),
  current: z4.string().optional(),
  models: z4.array(
    z4.object({
      id: z4.string().min(1),
      providerId: z4.string().min(1),
      modelId: z4.string().min(1),
      providerLabel: z4.string().max(2048).optional(),
      reasoningLevels: z4.array(z4.string()),
      defaultReasoningLevel: z4.string().optional(),
      contextWindow: z4.number().optional(),
      disabledReason: z4.string().max(2048).optional()
    }).strict()
  ).max(100),
  truncated: z4.boolean().optional()
}).strict();
var toolCallResumeWorkflowRunDisplaySchema = z4.object({
  kind: z4.literal("resume_workflow_run"),
  runId: z4.string().min(1)
}).strict();

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-lineage.ts
function readRunIdField(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readWorkflowRunStopReason(value) {
  return typeof value === "string" && WORKFLOW_RUN_STOP_REASONS.includes(value) ? value : void 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-node-progress.ts
function carryNodeProgress(eventType, payload, previousNode) {
  const requeued = eventType === "node-queued";
  const born = requeued || eventType === "node-settled" && payload.cached === true;
  const carried = born ? void 0 : previousNode;
  const head = boundedText(
    payload.instructionsHead,
    WORKFLOW_RUNS_LIMITS.maxInstructionsHeadLength
  );
  const instructionsHead = requeued ? head : head ?? previousNode?.instructionsHead;
  return {
    ...instructionsHead === void 0 ? {} : { instructionsHead },
    ...carried?.turn === void 0 ? {} : { turn: carried.turn },
    ...carried?.toolCalls === void 0 ? {} : { toolCalls: carried.toolCalls },
    ...carried?.lastTool === void 0 ? {} : { lastTool: carried.lastTool }
  };
}
function reduceNodeProgress(run, ref, payload) {
  const index = run.nodes.findIndex(
    (node2) => node2.siteId === ref.siteId && node2.ordinal === ref.ordinal
  );
  if (index < 0) return run;
  const node = run.nodes[index];
  const turn = readPositiveInt(payload.turn) ?? node.turn;
  const toolCalls = readNonNegativeInt(payload.toolCalls) ?? node.toolCalls;
  const lastTool = readLastTool(payload.lastTool) ?? node.lastTool;
  const nodes = [...run.nodes];
  nodes[index] = {
    ...node,
    ...turn === void 0 ? {} : { turn },
    ...toolCalls === void 0 ? {} : { toolCalls },
    ...lastTool === void 0 ? {} : { lastTool }
  };
  return { ...run, nodes };
}
function readPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : void 0;
}
function readNonNegativeInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function readLastTool(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
  const record = value;
  const name = boundedText(record.name, WORKFLOW_RUNS_LIMITS.maxLastToolNameLength);
  if (name === void 0) return void 0;
  const target = boundedText(record.target, WORKFLOW_RUNS_LIMITS.maxLastToolTargetLength);
  return { name, ...target === void 0 ? {} : { target } };
}
function boundedText(value, limit) {
  if (typeof value !== "string") return void 0;
  const text = value.slice(0, limit);
  return text.length > 0 ? text : void 0;
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-phases.ts
function reduceRunLaunched(run, payload) {
  if (!Array.isArray(payload.phaseNames)) return run;
  const phaseNames = [];
  for (const raw of payload.phaseNames) {
    if (typeof raw !== "string") continue;
    const name = raw.slice(0, WORKFLOW_RUNS_LIMITS.maxPhaseNameLength);
    if (name.length === 0) continue;
    phaseNames.push(name);
    if (phaseNames.length >= WORKFLOW_RUNS_LIMITS.maxPhases) break;
  }
  if (phaseNames.length === 0) return run;
  const phaseAlongside = readPhaseAlongside(payload.phaseAlongside, phaseNames.length);
  return { ...run, phaseNames, ...phaseAlongside === void 0 ? {} : { phaseAlongside } };
}
function readPhaseAlongside(raw, count) {
  if (!Array.isArray(raw)) return void 0;
  const out = [];
  let any = false;
  for (let index = 0; index < count; index += 1) {
    const entry = raw[index];
    const indexes = [];
    if (Array.isArray(entry)) {
      for (const value of entry) {
        if (typeof value !== "number" || !Number.isInteger(value)) continue;
        if (value < 0 || value >= count || value === index) continue;
        if (indexes.includes(value)) continue;
        indexes.push(value);
        if (indexes.length >= WORKFLOW_RUNS_LIMITS.maxPhases) break;
      }
    }
    if (indexes.length > 0) any = true;
    out.push(indexes);
  }
  return any ? out : void 0;
}
function reducePhaseEntered(run, payload) {
  const raw = typeof payload.name === "string" ? payload.name : void 0;
  const name = raw?.slice(0, WORKFLOW_RUNS_LIMITS.maxPhaseNameLength);
  if (name === void 0 || name.length === 0) return run;
  const ordinal = typeof payload.ordinal === "number" && Number.isInteger(payload.ordinal) && payload.ordinal > 0 ? payload.ordinal : 1;
  const existing = run.phases ?? [];
  const index = existing.findIndex((phase) => phase.name === name);
  let phases;
  let truncated = run.truncated === true;
  if (index >= 0) {
    const current = existing[index];
    phases = current.rounds >= ordinal ? existing : existing.map((phase, i) => i === index ? { ...phase, rounds: ordinal } : phase);
  } else if (existing.length >= WORKFLOW_RUNS_LIMITS.maxPhases) {
    phases = existing;
    truncated = true;
  } else {
    phases = [...existing, { name, rounds: ordinal }];
  }
  return {
    ...run,
    phases,
    currentPhase: name,
    ...truncated ? { truncated: true } : {}
  };
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-started.ts
function readSubagentModel(value) {
  if (typeof value !== "string") return void 0;
  const text = value.trim();
  return text.length > 0 && text.length <= WORKFLOW_RUNS_LIMITS.maxSubagentModelLength ? text : void 0;
}
function reduceRunStarted(run, payload) {
  const {
    error: staleError,
    resultPreview: staleResultPreview,
    pendingQuestions: staleQuestions,
    resumable: staleResumable,
    stopReason: staleStopReason,
    unlistedByPhase: staleUnlisted,
    ...rebased
  } = run;
  void [
    staleError,
    staleResultPreview,
    staleQuestions,
    staleResumable,
    staleStopReason,
    staleUnlisted
  ];
  const resumedFrom = readRunIdField(payload.resumedFrom) ?? rebased.resumedFrom;
  const subagentModel = readSubagentModel(payload.subagentModel) ?? rebased.subagentModel;
  return reduceRunStartedConcurrency(
    {
      ...rebased,
      ...resumedFrom === void 0 ? {} : { resumedFrom },
      ...subagentModel === void 0 ? {} : { subagentModel },
      status: "running",
      usage: { spentTokens: 0, nodesUsed: 0 },
      ...workflowRunTablesForNewLife(run)
    },
    payload
  );
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-tables.ts
function upsertBoundedByInstance(list, entry, limit, options = {}) {
  const index = list.findIndex(
    (item) => item.siteId === entry.siteId && item.ordinal === entry.ordinal
  );
  if (index >= 0) {
    const next = [...list];
    next[index] = entry;
    return { list: next, truncated: false };
  }
  if (options.admitNew === false || list.length >= limit) {
    return { list: [...list], truncated: true };
  }
  return { list: [...list, entry], truncated: false };
}
function upsertBoundedByQid(list, entry, limit) {
  const index = list.findIndex((item) => item.qid === entry.qid);
  if (index >= 0) {
    const next = [...list];
    next[index] = entry;
    return { list: next, truncated: false };
  }
  if (list.length >= limit) return { list: [...list], truncated: true };
  return { list: [...list, entry], truncated: false };
}

// src/presets/zcode/sources/upstream/packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts
var NODE_EVENT_PHASE = {
  "node-queued": "queued",
  "node-dispatched": "dispatched",
  "node-executing": "executing",
  "node-waiting": "waiting",
  "node-repairing": "repairing",
  "node-nudged": "nudged",
  "node-settled": "settled"
};
function reduceWorkflowRunsState(previous, envelope, limits = WORKFLOW_RUNS_LIMITS) {
  const runId = envelope.runId;
  if (!runId || typeof envelope.eventType !== "string") return null;
  const sequence = typeof envelope.sequence === "number" ? envelope.sequence : 0;
  const payload = isPlainRecord2(envelope.payload) ? envelope.payload : {};
  const prior = previous ?? { revision: 0, runs: [] };
  const existing = prior.runs.find((run) => run.runId === runId);
  const base = existing ?? {
    runId,
    ...envelope.toolCallId ? { toolCallId: envelope.toolCallId } : {},
    status: "pending",
    usage: { spentTokens: 0, nodesUsed: 0 },
    actors: [],
    nodes: [],
    lastEventSequence: sequence
  };
  const next = canonicalWorkflowRun(
    applyWorkflowRunEvent(base, envelope.eventType, payload, {
      ...envelope.actorSessionId === void 0 ? {} : { actorSessionId: envelope.actorSessionId },
      ...envelope.toolCallId === void 0 ? {} : { toolCallId: envelope.toolCallId },
      // 单调：迟到/重放的事件不会把水位拉回去。
      sequence: Math.max(base.lastEventSequence, sequence),
      // 被拒实例的计数器是**加出来**的，没有可去重的身份，所以只认抬过水位的事件
      // （见 workflow-runs-caps.ts）。水位取的是**本条事件之前**的值。
      advancesWaterMark: sequence > base.lastEventSequence,
      limits
    })
  );
  if (existing !== void 0 && workflowRunUnchanged(existing, next)) return null;
  const runs = existing ? prior.runs.map((run) => run.runId === runId ? next : run) : [...prior.runs, next];
  const bounded = runs.length > WORKFLOW_RUNS_LIMITS.maxRuns ? runs.slice(runs.length - WORKFLOW_RUNS_LIMITS.maxRuns) : runs;
  return { revision: prior.revision + 1, runs: evictForEntryBudget(bounded, runId) };
}
function applyWorkflowRunEvent(base, eventType, payload, derived) {
  const run = {
    ...base,
    ...derived.toolCallId && !base.toolCallId ? { toolCallId: derived.toolCallId } : {},
    lastEventSequence: derived.sequence
  };
  switch (eventType) {
    /**
     * run-started：回到 running、用量归零、剥掉上一世的结算残影，并记下本 run 自己的并发界。
     * 规则在同族的 workflow-runs-started.ts（resume 的重臂语义值得一整个文件头来讲）。
     */
    case "run-started":
      return reduceRunStarted(run, payload);
    case "actor-created": {
      const ref = workflowInstanceRef(payload.actor);
      if (!ref) return run;
      const phaseName = boundedPhaseName(nonEmptyString3(payload.phaseName));
      const actor = workflowActorEntry(ref, payload.name, phaseName, derived.actorSessionId);
      const seated = derived.advancesWaterMark ? withRoomForActor(run, ref, derived.limits) : run;
      const upserted = upsertBoundedByInstance(seated.actors, actor, derived.limits.maxActors, {
        admitNew: admitsNewEntry(run, derived.advancesWaterMark)
      });
      const absorbed = upserted.truncated && derived.advancesWaterMark ? absorbRefusedActor(seated, phaseName, derived.limits) : seated;
      return withDerivedWorkflowActorStatuses({
        ...absorbed,
        actors: upserted.list,
        ...upserted.truncated || seated.truncated ? { truncated: true } : {}
      });
    }
    case "node-queued":
    case "node-dispatched":
    case "node-executing":
    case "node-waiting":
    case "node-repairing":
    case "node-nudged":
    case "node-settled": {
      const ref = workflowInstanceRef(payload.instance);
      if (!ref) return run;
      const phase = NODE_EVENT_PHASE[eventType];
      const born = eventType === "node-queued" || eventType === "node-settled" && payload.cached === true;
      const actorRef = workflowInstanceRef(payload.actor);
      const dispatchActor = eventType === "node-dispatched" && actorRef !== null ? workflowActorEntry(
        actorRef,
        payload.actorName,
        boundedPhaseName(nonEmptyString3(payload.actorPhaseName)),
        derived.actorSessionId
      ) : null;
      const seating = seatWorkflowNode(
        run,
        {
          eventType,
          ref,
          actorRef,
          actor: dispatchActor,
          born,
          advancesWaterMark: derived.advancesWaterMark
        },
        derived.limits
      );
      const seated = seating.run;
      const previousNode = seated.nodes.find(
        (node2) => node2.siteId === ref.siteId && node2.ordinal === ref.ordinal
      );
      const kind = payload.kind === "ask" || payload.kind === "world-read" ? payload.kind : previousNode?.kind;
      const phaseName = boundedPhaseName(nonEmptyString3(payload.phaseName)) ?? previousNode?.phaseName;
      const node = {
        siteId: ref.siteId,
        ordinal: ref.ordinal,
        ...kind === void 0 ? {} : { kind },
        phase,
        ...payload.outcome === "ok" || payload.outcome === "failed" || payload.outcome === "cancelled" ? { outcome: payload.outcome } : {},
        ...payload.cached === true ? { cached: true } : {},
        ...actorRef ? { actorSiteId: actorRef.siteId, actorOrdinal: actorRef.ordinal } : previousNode?.actorSiteId !== void 0 ? { actorSiteId: previousNode.actorSiteId, actorOrdinal: previousNode.actorOrdinal } : {},
        ...phaseName === void 0 ? {} : { phaseName },
        // 任务摘要与进度读数：node-queued 取载荷、其余事件向前携带，出生事件清掉上一世的计数。
        // 规则在同族的 workflow-runs-node-progress.ts（那里也讲了为什么必须显式携带）。
        ...carryNodeProgress(eventType, payload, previousNode)
      };
      const upsertedNodes = upsertBoundedByInstance(seated.nodes, node, derived.limits.maxNodes, {
        admitNew: seating.admitNew
      });
      const firstDispatch = eventType === "node-dispatched" && admitsNewEntry(run, derived.advancesWaterMark) && (previousNode === void 0 || previousNode.phase === "queued");
      const restored = seating.activated ? discountUnlistedInstance(seated.usage) : seated.usage;
      const usage = countUnlistedInstance(
        firstDispatch ? { ...restored, nodesUsed: restored.nodesUsed + 1 } : restored,
        {
          rejected: upsertedNodes.truncated,
          advancesWaterMark: derived.advancesWaterMark,
          eventType,
          cached: payload.cached === true
        }
      );
      const absorbed = upsertedNodes.truncated && derived.advancesWaterMark && born && phase === "settled" ? absorbRefusedSettledNode(seated, node, derived.limits) : seated;
      return withDerivedWorkflowActorStatuses({
        ...absorbed,
        ...usage === seated.usage ? {} : { usage },
        nodes: upsertedNodes.list,
        ...upsertedNodes.truncated || seated.truncated ? { truncated: true } : {}
      });
    }
    /**
     * node-progress：一次 ask 的某个轮次解析完了（driver 每个已解析轮次发一条）。
     *
     * **不是生命周期事件**：它不落相位、不计步、不动 actor 状态，只把三个读数写到那个节点上。
     * 所以它刻意不在上面那组 case 里，也不进 NODE_EVENT_PHASE 表。规则在
     * workflow-runs-node-progress.ts。
     */
    case "node-progress": {
      const ref = workflowInstanceRef(payload.instance);
      if (!ref) return run;
      return reduceNodeProgress(run, ref, payload);
    }
    /**
     * report：脚本 `report(item)` 交出的一条渐进产物（详情页 Results 区的数据源）。
     *
     * 它**刻意不碰 `nodes[]`**：report 没有 node-queued/node-settled 生命周期，计进去会让
     * 一个报得勤的工作流步数虚高（紧凑卡与任务列表的 `settled/observed` 读的就是 nodes），
     * 也会把一个没有任何顺序含义的实例带进状态叠加。同理它不碰 actor 状态——它不是某个
     * actor 在动的证据。
     */
    case "report": {
      const ref = workflowInstanceRef(payload.instance);
      if (!ref) return run;
      const artifactId = nonEmptyString3(payload.artifactId);
      const report = {
        siteId: ref.siteId,
        ordinal: ref.ordinal,
        preview: workflowReportPreview(payload.item),
        ...artifactId === void 0 ? {} : { artifactId }
      };
      const existingReports = run.reports ?? [];
      const firstSighting = !existingReports.some(
        (item) => item.siteId === ref.siteId && item.ordinal === ref.ordinal
      );
      const upserted = upsertBoundedByInstance(
        existingReports,
        report,
        WORKFLOW_RUNS_LIMITS.maxReports
      );
      const counted = artifactId !== void 0 && firstSighting ? countTaggedReport(run.artifacts, artifactId) : run.artifacts;
      return {
        ...run,
        reports: upserted.list,
        ...counted === void 0 ? {} : { artifacts: counted },
        ...upserted.truncated || run.truncated ? { truncated: true } : {}
      };
    }
    /**
     * artifact-published：脚本经 `artifact.*` 发布了一个**用户面**产物的一个版本，或者
     * 声明了一块预置看板。内容成员发布成功与预置成员
     * 声明都走这一条；缓存命中不重发（同 report）。
     *
     * ⚠ 术语：这里的 artifact 是给**用户**看的产出。`resultPreview` 背后那个「脚本顶层
     * 返回值」在引擎内部也叫 artifact，是给**模型**看的——两者无关。见 workflow-artifacts.ts。
     *
     * 与 report 一样**不碰 `nodes[]` 与 actor 状态**：产物站点不在任何图里、没有 node 生命
     * 周期事件（连 node-settled 都不发，正是为了不在侧板长出一个 untracked
     * 节点）。它也不计步数——交付一件产物不是"多跑了一步"。
     *
     * 去重键是**产物 id**，不是站点实例：同 id 再发布是**新版本**，而新版本必须覆盖同一张卡
     * 而不是长出第二张。这与 nodes/actors/reports 那三张按 (siteId, ordinal) 去重的表是不同
     * 的族——同一个 id 的两个版本来自两个不同的站点实例，按实例去重会得到两张卡。
     */
    case "artifact-published": {
      const summary = workflowArtifactSummary(payload.artifact);
      if (summary === void 0) return run;
      const upserted = upsertBoundedByArtifactId(
        run.artifacts ?? [],
        summary,
        WORKFLOW_RUNS_LIMITS.maxArtifacts
      );
      return {
        ...run,
        artifacts: upserted.list,
        ...upserted.truncated || run.truncated ? { truncated: true } : {}
      };
    }
    /**
     * artifact-failed：一次内容产物发布被拒（文件不在 / 越界 / 超上限 / store 缺席）。
     *
     * **刻意不改任何状态。** 失败的发布不认领 id、不认领种类、不占版本号
     * （只有 completed 行认领这些，否则 live 路径会认领 resume 路径认领不了的东西，两本账）。
     * 于是这里没有可 upsert 的东西：为一个从未存在的产物摆一张"失败卡"，会让用户看见一件
     * 并不存在的交付物，而脚本很可能已经 catch 住它、让子代理补写后重新发布成功了。
     *
     * 这条事件的读者是**事件日志**（详情页的审计面按 journal 分页读，不经本归约）。这里
     * 显式列出 case 而不是落到 default，是为了让"不改状态"是一条**读得见的裁决**，
     * 而不是一个漏写的分支。
     */
    case "artifact-failed":
      return run;
    case "usage-updated": {
      if (typeof payload.spentTokens !== "number") return run;
      return { ...run, usage: { ...run.usage, spentTokens: payload.spentTokens } };
    }
    /**
     * escalation：一个 actor 把阻塞问题升级给主代理，并停在自己那次 ask 里等答案。
     *
     * 与 report 一样**不碰 `nodes[]` 与 actor 状态**：升级没有 node 生命周期、不计步数
     * （等待不是工作量，与 report 豁免同一 doctrine）。它也不该把提问的 actor 翻成 idle——
     * 那个 actor 的 ask 仍然是 dispatched 的，状态照旧由节点相位派生，这里一个字都不改。
     *
     * 去重键是 `qid` 而不是站点实例：升级没有 site 身份。upsert（而非 push）让重放天然幂等——
     * 同一条 raised 事件再来一次得到逐字节相同的表，顶层的 JSON 比对随即返回 null。
     */
    case "escalation-raised": {
      const qid = nonEmptyString3(payload.qid);
      const question = nonEmptyString3(payload.question);
      if (qid === void 0 || question === void 0) return run;
      const actorRef = workflowInstanceRef(payload.actor);
      const actorName = boundedActorName(nonEmptyString3(payload.actorName));
      const context = nonEmptyString3(payload.context);
      const askedAt = typeof payload.askedAt === "number" && Number.isFinite(payload.askedAt) ? payload.askedAt : void 0;
      const pending = {
        qid,
        ...actorRef ? { actorSiteId: actorRef.siteId, actorOrdinal: actorRef.ordinal } : {},
        ...actorName === void 0 ? {} : { actorName },
        question: boundedQuestionText(question),
        ...context === void 0 ? {} : { context: boundedQuestionText(context) },
        ...askedAt === void 0 ? {} : { askedAt }
      };
      const upserted = upsertBoundedByQid(
        run.pendingQuestions ?? [],
        pending,
        WORKFLOW_RUNS_LIMITS.maxPendingQuestions
      );
      return {
        ...run,
        pendingQuestions: upserted.list,
        ...upserted.truncated || run.truncated ? { truncated: true } : {}
      };
    }
    /**
     * 主代理答了：那个 actor 的轮次就地继续，问题不再欠着。
     *
     * 答案本身**不落投影**：它作为 `escalate` 的工具结果活在 actor 轮次的转录里（缓存命中时
     * 整轮逐字节重放），这里只需要把问题从"欠答"表里划掉。事件日志那一行仍然带着答案原文，
     * 那是审计面，与"现在还欠谁"这个活事实是两回事。
     */
    case "escalation-resolved": {
      const qid = nonEmptyString3(payload.qid);
      if (qid === void 0) return run;
      return withoutPendingQuestions(run, (pending) => pending.qid !== qid);
    }
    /**
     * concurrency-changed：进程级治理器调整了本 run 所在 provider key 的 cap。不碰 `nodes[]` 与 actor 状态：
     * cap 是闸门，不是任何节点的事。规则在 workflow-runs-concurrency.ts。
     */
    case "concurrency-changed":
      return reduceConcurrencyChanged(run, payload);
    /**
     * run-caps-changed：run **在飞时**它自己的那条并发界被改了（只改 `max_concurrency` 的修订就地生效，不停这次 run、不另起一次）。载荷与
     * `run-started` 同形，规则也是同一条，所以与它同住 workflow-runs-concurrency.ts。
     * 同样不碰 `nodes[]` 与 actor 状态：界是闸门，不是任何节点的事。
     */
    case "run-caps-changed":
      return reduceRunCapsChanged(run, payload);
    /** phase-entered / run-launched：阶段归约在同族的 workflow-runs-phases.ts（后者只搬运声明阶段表）。 */
    case "phase-entered":
      return reducePhaseEntered(run, payload);
    case "run-launched":
      return reduceRunLaunched(run, payload);
    case "run-settled": {
      const status = payload.status;
      const error = isPlainRecord2(payload.error) ? payload.error : void 0;
      const message = typeof error?.message === "string" ? error.message : void 0;
      const cleared = withoutCooldown(withoutPendingQuestions(run, () => false));
      const carriedStopReason = status === "stopped" ? readWorkflowRunStopReason(payload.stopReason) : void 0;
      const supersededBy = carriedStopReason === "superseded" ? readRunIdField(payload.supersededBy) : void 0;
      const terminal = status === "completed" || status === "errored" || status === "stopped";
      const settledMessage = terminal ? message : message ?? `run settled with an unrecognized status: ${String(status)}`;
      return withDerivedWorkflowActorStatuses({
        ...cleared,
        status: terminal ? status : "errored",
        ...carriedStopReason === void 0 ? {} : { stopReason: carriedStopReason },
        ...supersededBy === void 0 ? {} : { supersededBy },
        ...settledMessage === void 0 ? {} : { error: settledMessage.slice(0, WORKFLOW_RUNS_LIMITS.maxErrorLength) },
        // 可恢复性由 CLI 在载荷上裁定（resume 门的同一个谓词），这里只搬运；为真才在场。
        ...payload.resumable === true ? { resumable: true } : {}
      });
    }
    // log / compaction 不是 step，也没有 site id，所以只抬水位（它们只进事件日志，不进图）。
    default:
      return run;
  }
}
function workflowInstanceRef(value) {
  if (!isPlainRecord2(value)) return null;
  const siteId = nonEmptyString3(value.siteId);
  const ordinal = value.ordinal;
  if (siteId === void 0 || typeof ordinal !== "number") return null;
  return { siteId, ordinal };
}
function withoutPendingQuestions(run, keep) {
  const current = run.pendingQuestions;
  if (current === void 0) return run;
  const remaining = current.filter(keep);
  if (remaining.length === current.length) return run;
  if (remaining.length > 0) return { ...run, pendingQuestions: remaining };
  const { pendingQuestions: _emptied, ...withoutKey } = run;
  return withoutKey;
}
function boundedQuestionText(text) {
  const limit = WORKFLOW_RUNS_LIMITS.maxQuestionLength;
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}\u2026`;
}
function workflowReportPreview(item) {
  const text = serializeWorkflowArtifact(item) ?? "";
  const limit = WORKFLOW_RUNS_LIMITS.maxReportPreviewLength;
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}\u2026`;
}
function isPlainRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export {
  boundCausalityGraph,
  reduceWorkflowRunsState
};
