// Derived from fixed Apache-2.0 ZCode import-cache sources at 29628c9; see THIRD_PARTY_NOTICES.md.
import { canonicalJson } from "./zcode-artifact-shared.mjs";
class ImportedActorState {
  constructor(candidate) {
    this.candidate = candidate;
  }
  /** 已消费的导入条目数 = 下一个可命中的 actorSeq（也是转录截断边界的下标 + 1）。 */
  consumed = 0;
  diverged = false;
  /**
   * 「续跑前驱在飞 ask」的那个 seq（没有续跑即缺席）。至多一个：续跑本身就是分歧，
   * 分歧单调，所以第二次不会再有。
   */
  carriedSeq;
  /**
   * fresh ask 在 seq 上问缓存：命中返回条目（并推进游标），否则置分歧并返回 undefined。
   *
   * 两种不命中同等处理：哈希不符（指令变了）与 `seq >= entries.length`（新脚本在此 actor 上
   * 扩了新 ask）。分歧的**级联**是免费且动态的——上游 ask 转 live 拿到新结果，下游用它插值出的
   * 指令哈希必变，于是下游自动分歧，不需要任何显式传播。
   *
   * 本方法只在导入缓存**开着**时被调用（关门后走 {@link takeIfPure}），所以未命中时可以谈续跑。
   */
  take(seq, hash) {
    if (this.diverged) return void 0;
    const entry = this.candidate.entries[seq];
    if (entry === void 0 || entry.inputHash !== hash) {
      this.diverge(seq, hash, true);
      return void 0;
    }
    this.consumed = seq + 1;
    return entry;
  }
  /**
   * 缓存关闭后的问法：只有**纯**条目（前驱记下 `worldToolCalls === 0`）还能命中。纯 ask 只依赖指令与
   * 转录前缀——两者都在哈希链里——与工作区无关，所以关门不影响它的答案。碰过外部世界的条目即便同哈希
   * 也不给：它读过的工作区可能已被改写；这个 ask 转 live，actor 从此分歧（转录不再与前驱一致，
   * 后缀条目不可复活）。没有 stats、或 stats 里没有这个键的老条目按「碰过」处理（保守）。
   *
   * 关门后同样不续跑在飞 ask：那半场转录里全是前驱对**旧工作区**的观察，与带工具的条目同理。
   */
  takeIfPure(seq, hash) {
    if (this.diverged) return void 0;
    const entry = this.candidate.entries[seq];
    if (entry === void 0 || entry.inputHash !== hash || entry.stats?.worldToolCalls !== 0) {
      this.diverge(seq, hash, false);
      return void 0;
    }
    this.consumed = seq + 1;
    return entry;
  }
  /** 该 seq 的 ask 是否续跑了前驱的在飞 ask（调度器据此决定 stats 记不记 worldToolCalls）。 */
  carriedAt(seq) {
    return this.carriedSeq === seq;
  }
  /**
   * 据一行**已记录**的 ask 重推分歧状态（修订 run 崩溃后 resume 时用）。
   *
   * 分歧状态不落库，而修订 run 的 resume 会把导入缓存整表重建。若不据 journal 行重推分歧点，
   * 一个在原次执行中已于 seq k 分歧的 actor，其 seq k+n 的 fresh ask 可能恰好撞上导入条目的
   * 哈希而被**错误导入**——那等于把一段与本 run 实际转录无关的历史塞回来。逐 seq 拿记录行的
   * inputHash 与导入条目比对，恰好重建了原次执行当时的判定（准入按 seq 升序，hold 规则保证
   * 这一点），因此这个重推是精确的，不是保守近似。`wasLive` 补上哈希看不见的那一种 live
   * （缓存关闭后带工具的 ask，见 scheduler 的 tryImportedSettle）。
   *
   * `queuedBeforeClose` 是续跑判定的那一半事实：续跑与该 ask 的 `node-queued` 在准入的同一个
   * 同步片里发生，所以「当时门开着」等价于「这条 node-queued 早于第一条 import-cache-closed」
   * （见 engine-world.ts 的 recoverImportClosure）。必须精确——错判成续跑会让 seedActorTranscript
   * 往一个**已经分歧**的会话里多抄一段前驱消息（driver 的幂等判据只看目标够不够长）。
   */
  reconcileRecorded(seq, recordedHash, wasLive, queuedBeforeClose) {
    if (this.diverged) return;
    if (wasLive) {
      this.diverge(seq, recordedHash, queuedBeforeClose);
      return;
    }
    const entry = this.candidate.entries[seq];
    if (entry === void 0 || entry.inputHash !== recordedHash) {
      this.diverged = true;
      return;
    }
    this.consumed = Math.max(this.consumed, seq + 1);
  }
  /**
   * 分歧 actor 的会话种子：源会话 + 复制多少条消息 + 承袭的模型 pin。
   *
   * 边界取**最后一条被消费**的导入条目的记账值：在 seq k 分歧意味着 0..k-1 的问答都已按缓存
   * 结算，新会话要接着的正是那 k 次完整交换之后的位置（含它们的 repair / nudge 轮）。
   * 一条也没消费就没有种子——全新会话、全新模型解析、不带 pin：pin 是为「转录接续下不静默
   * 换模型」存在的，没有接续就没有它的用武之地。
   *
   * **续跑是例外**：边界改取 `inFlight.messageBoundary`（前驱整个会话），因此一条都没消费也有
   * 种子——那正是「扇出第一轮在飞时被修订」的形状。
   */
  seed() {
    const inFlight = this.candidate.inFlight;
    if (this.carriedSeq !== void 0 && inFlight !== void 0) {
      return this.seedAt(inFlight.messageBoundary);
    }
    if (this.consumed === 0) return void 0;
    const last = this.candidate.entries[this.consumed - 1];
    if (last === void 0) return void 0;
    return this.seedAt(last.messageBoundary);
  }
  /**
   * 置分歧，并在此顺带判定这次未命中是不是**续跑前驱的在飞 ask**。
   *
   * 续跑的四个条件缺一不可：此前未分歧（否则本 actor 的转录早已不是前驱那条）、`seq` 恰在
   * 前缀之后（在飞 ask 的位置）、整个前缀都已消费、指令哈希与在飞 ask 相符。`cacheOpen`
   * 是第五个：关门之后那半场转录只是对旧工作区的观察，不比缓存的 world 读取更可信。
   */
  diverge(seq, hash, cacheOpen) {
    const inFlight = this.candidate.inFlight;
    if (cacheOpen && inFlight !== void 0 && seq === this.candidate.entries.length && this.consumed === seq && inFlight.inputHash === hash) {
      this.carriedSeq = seq;
    }
    this.diverged = true;
  }
  seedAt(messageCount) {
    const seed = {
      sourceSessionId: this.candidate.transcriptSourceSessionId,
      messageCount
    };
    if (this.candidate.resolvedModel !== void 0)
      seed.resolvedModel = this.candidate.resolvedModel;
    return seed;
  }
}
class ImportedWorldQueue {
  constructor(world) {
    this.world = world;
  }
  cursors = /* @__PURE__ */ new Map();
  /** 取该内容哈希的下一条记录，耗尽或从未记录即 undefined（调用方转 live）。 */
  take(hash) {
    const queue = this.world.get(hash);
    if (queue === void 0) return void 0;
    const cursor = this.cursors.get(hash) ?? 0;
    const entry = queue[cursor];
    if (entry === void 0) return void 0;
    this.cursors.set(hash, cursor + 1);
    return entry;
  }
}
function matchImportedActor(cache, spec) {
  if (cache === void 0) return void 0;
  const name = spec.name;
  if (name === void 0 || name === "") return void 0;
  const candidate = cache.actors.get(name);
  if (candidate === void 0) return void 0;
  if (canonicalJson(spec) !== canonicalJson(candidate.persona)) return void 0;
  return new ImportedActorState(candidate);
}
function importedAskRecord(runId, instance, actor, seq, hash, entry) {
  const record = {
    runId,
    siteId: instance.siteId,
    ordinal: instance.ordinal,
    kind: "ask",
    actorSiteId: actor.siteId,
    actorOrdinal: actor.ordinal,
    actorSeq: seq,
    inputHash: hash,
    status: "completed",
    result: entry.result,
    messageBoundary: entry.messageBoundary
  };
  if (entry.stats !== void 0) record.stats = entry.stats;
  return record;
}
function normalizePersona(name, persona) {
  const base = typeof persona === "string" ? { system: persona } : persona ? { ...persona } : {};
  if (base.name === void 0 && name !== void 0) base.name = name;
  return base;
}
import { canonicalJson as canonicalJson2, inputHash } from "./zcode-artifact-shared.mjs";
export {
  ImportedActorState,
  ImportedWorldQueue,
  canonicalJson2 as canonicalJson,
  importedAskRecord,
  inputHash,
  matchImportedActor,
  normalizePersona
};
