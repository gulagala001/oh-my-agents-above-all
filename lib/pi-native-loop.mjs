// Generated from @deepseek-ai/dsh-agent-loop@0.2.1-rc.5; MIT, Copyright DeepSeek.
// See source.json nativeLoopAdapter and THIRD_PARTY_NOTICES.md.
/*
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.resolve('@deepseek-ai/dsh-agent-loop'));
// pi-native-loop.js
const { AssistantStreamAccumulator, BlockAssembler, LlmAttemptId, LlmError, createAssistantMessage, createDeveloperMessage, createToolResultMessage, errorChain, markAgentLoopRequest } = await import(nativeRequire.resolve("@deepseek-ai/dsh-llm"));
const { ToolCallRecovery, canonicalHeader, headerEquals } = await import(nativeRequire.resolve("@deepseek-ai/dsh-session"));
const { assembleContextFor } = await import(nativeRequire.resolve("@deepseek-ai/dsh-agent"));
const { assertNever, deepFreeze } = await import(nativeRequire.resolve("@deepseek-ai/dsh-util-values"));
const { joinContextSections, renderContextSections, renderPrompt } = await import(nativeRequire.resolve("@deepseek-ai/dsh-system-prompt"));
const { TOOL_ABORTED_BEFORE_DISPATCH, TOOL_RUNTIME_SCHEDULER } = await import(nativeRequire.resolve("@deepseek-ai/dsh-tools"));
var AssistantStreamAttempt = class {
  nextRevision;
  turn;
  step;
  emit;
  accumulator = new AssistantStreamAccumulator();
  assembler = new BlockAssembler();
  index = 0;
  terminal = !1;
  /** Attempt identity unique within this Agent lifecycle. */
  attemptId;
  /** Whether this started attempt has emitted its terminal frame. */
  get ended() {
    return this.terminal;
  }
  /**
  * @param sessionId - identity embedded only in the Agent-lifecycle-local attempt id.
  * @param attempt - attached-Session-local attempt counter.
  * @param nextRevision - allocates the next emitted frame revision.
  * @param turn - durable turn owning the request.
  * @param step - durable step owning the request.
  * @param emit - agent-scoped notification publisher.
  */
  constructor(sessionId, attempt, nextRevision, turn, step, emit) {
    this.nextRevision = nextRevision, this.turn = turn, this.step = step, this.emit = emit, this.attemptId = LlmAttemptId(`${sessionId}:${attempt}`);
  }
  /** Publish the opening marker before the first delivered chunk. */
  start() {
    this.emit({
      type: "start",
      attemptId: this.attemptId,
      revision: this.nextRevision(),
      turn: this.turn,
      step: this.step
    });
  }
  /** Snapshot one chunk once, then feed durable compaction, assembly, and live publication. */
  push(chunk) {
    let timed = this.accumulator.push({
      time: Date.now(),
      chunk
    });
    this.assembler.push(timed.chunk), this.emit({
      type: "chunk",
      attemptId: this.attemptId,
      revision: this.nextRevision(),
      index: this.index++,
      time: timed.time,
      chunk: timed.chunk
    });
  }
  /**
  * Publish terminal settlement after the matching durable event commits.
  * @param eventType - durable settlement type.
  * @param append - synchronous durable append returning its committed seq.
  */
  settle(eventType, append) {
    let seq;
    try {
      seq = append();
    } catch (error) {
      throw this.abandon(), error;
    }
    this.terminal = !0, this.emit({
      type: "end",
      attemptId: this.attemptId,
      revision: this.nextRevision(),
      index: this.index,
      outcome: {
        kind: "committed",
        eventType,
        seq
      }
    });
  }
  /** Publish abandonment when no durable attempt event can be committed. */
  abandon() {
    this.terminal = !0, this.emit({
      type: "end",
      attemptId: this.attemptId,
      revision: this.nextRevision(),
      index: this.index,
      outcome: { kind: "abandoned" }
    });
  }
  /** Exact compact stream for the final durable event. */
  get stream() {
    return [...this.accumulator.snapshot()];
  }
  /** Canonical completed-message blocks from the same chunks. */
  blocks() {
    return this.assembler.blocks();
  }
  /** Safe visible prefix when cancellation interrupts the attempt. */
  interruptedBlocks() {
    return this.assembler.interruptedBlocks();
  }
  /** Latest adapter-reported usage in the stream. */
  get usage() {
    return this.assembler.usage;
  }
  /** Terminal reason, defaulting to stop when the stream omitted one. */
  get finish() {
    return this.assembler.finish;
  }
  /** Replay state carried by the terminal finish record. */
  get replayState() {
    return this.assembler.replayState;
  }
};
async function executeToolCalls(ctx, turn, step, toolCalls, signal, acceptContext) {
  let agent = ctx.agents.requireInitiator(), { session } = agent, planned = toolCalls.map((block) => ({
    block,
    exec: {
      callId: block.id,
      name: block.name,
      arguments: parseArguments(block.arguments),
      agent,
      signal
    }
  })), next = 0, concluded = !1;
  for (; next < planned.length; ) {
    let first = planned[next], mode = ctx.tools.executionMode(first.exec).kind, outcome = await runGroup(ctx, turn, step, mode === "parallel" ? planned.slice(next) : [first], mode, signal, acceptContext);
    if (next += outcome.consumed, concluded ||= outcome.concluded, outcome.aborted) {
      for (let call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block);
      return { concluded };
    }
  }
  return { concluded };
}
function parseArguments(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return raw;
  }
}
async function runGroup(ctx, turn, step, group, mode, signal, acceptContext) {
  let { session } = ctx.agents.requireInitiator(), maxParallelToolCalls = ctx.agentLoop.config.maxParallelToolCalls.get(), slots = group.map(() => {
  }), callSeqs = group.map(() => {
  }), nextToStart = 0, committed = 0, started = 0, aborted = signal.aborted, concluded = !1, schedulerFailure, throwSchedulerFailure = () => {
    if (schedulerFailure !== void 0) throw schedulerFailure.error;
  }, commitReady = async () => {
    for (; committed < group.length; ) {
      let slot = slots[committed];
      if (slot === void 0) break;
      let call = group[committed], result = slot.needsPost ? await ctx.tools[TOOL_RUNTIME_SCHEDULER].finalize(slot.exec, slot.result) : ctx.tools[TOOL_RUNTIME_SCHEDULER].finish(slot.exec, slot.result);
      appendToolResult(session, turn, step, call.block, result, callSeqs[committed]);
      for (let context of result.additionalContexts ?? []) acceptContext(context);
      concluded ||= result.concludesTurn === !0, committed++;
    }
  }, inFlight = /* @__PURE__ */ new Map(), startCall = async (index) => {
    let call = group[index];
    callSeqs[index] = appendToolCall(session, turn, step, call.block), started++;
    let prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec);
    switch (throwSchedulerFailure(), prepared.kind) {
      case "dispatch": {
        let promise = ctx.tools[TOOL_RUNTIME_SCHEDULER].dispatch(prepared.exec).then((outcome) => (slots[index] = {
          exec: prepared.exec,
          result: outcome.result,
          needsPost: outcome.kind === "post-result"
        }, index), (error) => (schedulerFailure ??= { error }, index));
        inFlight.set(index, promise);
        break;
      }
      case "post-result":
        slots[index] = {
          exec: prepared.exec,
          result: prepared.result,
          needsPost: !0
        };
        break;
      case "final-result":
        slots[index] = {
          exec: prepared.exec,
          result: prepared.result,
          needsPost: !1
        };
        break;
      /* v8 ignore next -- closed-union exhaustiveness guard */
      default:
        assertNever(prepared, "tool-call scheduler prepare result");
    }
  }, fillPool = async () => {
    for (; !aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls; ) {
      let nextCall = group[nextToStart];
      if (nextToStart > 0 && mode === "parallel" && ctx.tools.executionMode(nextCall.exec).kind !== "parallel") break;
      await startCall(nextToStart), nextToStart++, throwSchedulerFailure(), await commitReady(), throwSchedulerFailure(), signal.aborted && (aborted = !0);
    }
  };
  try {
    for (await fillPool(); inFlight.size > 0; ) {
      let settledIndex = await Promise.race(inFlight.values());
      inFlight.delete(settledIndex), throwSchedulerFailure(), await commitReady(), throwSchedulerFailure(), signal.aborted && (aborted = !0), await fillPool();
    }
  } catch (error) {
    throw schedulerFailure ??= { error }, await Promise.allSettled(inFlight.values()), schedulerFailure.error;
  }
  if (aborted) {
    for (let call of group.slice(started)) appendSkippedToolCall(session, turn, step, call.block);
    return {
      consumed: group.length,
      aborted: !0,
      concluded
    };
  }
  if (committed !== started) throw new Error("tool-call scheduler: uncommitted settled calls");
  return {
    consumed: started,
    aborted: !1,
    concluded
  };
}
function appendSkippedToolCall(session, turn, step, block) {
  let callSeq = appendToolCall(session, turn, step, block);
  appendToolResult(session, turn, step, block, {
    content: [{
      type: "text",
      text: "Error: tool call aborted before dispatch"
    }],
    isError: !0,
    error: {
      message: "tool call aborted before dispatch",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED_BEFORE_DISPATCH
      }
    }
  }, callSeq);
}
function appendToolCall(session, turn, step, block) {
  return session.append("tool/call", {
    turn,
    step,
    callId: block.id,
    name: block.name,
    arguments: block.arguments
  }).seq;
}
function appendToolResult(session, turn, step, block, result, callSeq) {
  let message = createToolResultMessage({
    callId: block.id,
    content: result.content,
    isError: result.isError
  });
  session.append("tool/result", {
    turn,
    step,
    message,
    ...result.error?.info ? { error: result.error.info } : {},
    ...result.meta !== void 0 ? { meta: result.meta } : {}
  }, {
    surfaceOp: "append",
    sourceEventSeqs: [callSeq]
  });
}
function abortedCancelCause(signal) {
  if (!signal.aborted) return;
  let cause = signal.reason;
  switch (cause.kind) {
    case "user":
    case "parent":
    case "disposed":
      return { kind: cause.kind };
    case "hook":
      return {
        kind: "hook",
        reason: cause.reason
      };
    /* v8 ignore next -- cancel accepts the closed AgentCancelCause union */
    default:
      return assertNever(cause);
  }
}
var piRequestHook = Symbol.for("omaa.pi.request-hook"), methods = { async step(decision) {
  if (this.phase.kind !== "running") throw new Error(`agent "${this.id}": step outside running phase`);
  let { turn, step, abort: { signal } } = this.phase;
  signal.throwIfAborted();
  let { assembly } = decision, renderedPrompt = renderPrompt(assembly), firstAttempt = !0;
  for (; ; ) {
    let { config, preparedCall } = await this.prepareRequest(turn, step, signal), sections = renderContextSections(this.loopCtx.systemPrompt.refreshContext(assembly, assembleContextFor(this, signal))), context = this.runtimeContext.project(joinContextSections(sections), sections);
    signal.throwIfAborted();
    let startsRequestSeries = firstAttempt && decision.startsRequestSeries === !0, commits = this.systemPrompt.project(renderedPrompt, {
      inHistory: preparedCall?.systemPromptUpdate === "in-history",
      startsSeries: startsRequestSeries || this.requestSurfaceGeneration !== this.session.surface.contentGeneration || preparedCall?.toolUpdate === void 0 && this.toolsChanged(assembly.tools)
    });
    for (let { message, intent } of commits) this.session.append("system/message", {
      turn,
      step,
      message
    }, intent);
    let contextAdmitted = !1;
    if (firstAttempt) for (let message of decision.messages) message.source.kind === "runtime-context" ? context !== void 0 && !contextAdmitted && (this.session.append("user/message", context, { surfaceOp: "append" }), contextAdmitted = !0) : this.session.append("user/message", message, { surfaceOp: "append" });
    context !== void 0 && !contextAdmitted && this.session.append("user/message", context, { surfaceOp: "append" }), firstAttempt = !1;
    let request = await this.buildRequest(config, preparedCall, assembly.tools, {
      turn,
      step
    }, startsRequestSeries, signal), live = new AssistantStreamAttempt(this.session.id, ++this.assistantAttemptCounter, () => ++this.assistantStreamRevision, turn, step, (frame) => {
      this.dispatch.emit("agent/assistant-stream", { frame });
    }), started = !1;
    try {
      let stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request);
      signal.throwIfAborted(), live.start(), await this[piRequestHook].stream?.("start", live, request, signal), started = !0;
      for await (let chunk of stream)
        signal.throwIfAborted(), live.push(chunk), await this[piRequestHook].stream?.("chunk", live, request, signal, chunk);
      signal.throwIfAborted();
    } catch (error) {
      if (!started) throw error;
      try {
        if (signal.aborted) {
          let content = live.interruptedBlocks();
          content.length > 0 ? live.settle("assistant/message", () => this.session.append("assistant/message", {
            turn,
            step,
            message: createAssistantMessage({
              content,
              source: {
                provider: request.provider,
                model: request.model,
                ...live.replayState === void 0 ? {} : { replayState: live.replayState }
              }
            }),
            interrupted: !0,
            ...live.usage === void 0 ? {} : { usage: live.usage },
            stream: live.stream
          }, { surfaceOp: "append" }).seq) : live.settle("assistant/attempt", () => this.session.append("assistant/attempt", {
            turn,
            step,
            stream: live.stream
          }).seq);
        } else live.settle("assistant/attempt", () => this.session.append("assistant/attempt", {
          turn,
          step,
          stream: live.stream
        }).seq);
      } catch (settlementError) {
        throw new AggregateError([error, settlementError], "Assistant stream failed and its durable settlement was rejected", { cause: error });
      }
      throw error;
    }
    try {
      let finish = live.finish;
      if (finish.kind === "error" || finish.kind === "aborted") {
        live.settle("assistant/attempt", () => this.session.append("assistant/attempt", {
          turn,
          step,
          stream: live.stream
        }).seq);
        let action = await this.dispatch.waterfall("agent/request-error", {
          turn,
          step,
          provider: request.provider,
          failure: finish.failure,
          retryPolicy: preparedCall?.retryPolicy,
          signal
        }, () => Promise.resolve(void 0));
        if (signal.throwIfAborted(), action?.kind !== "retry") throw new LlmError(finish.failure.message, finish.failure.code, finish.failure);
        continue;
      }
      let message = createAssistantMessage({
        content: live.blocks(),
        source: {
          provider: request.provider,
          model: request.model,
          ...live.replayState !== void 0 ? { replayState: live.replayState } : {}
        }
      });
      if (live.settle("assistant/message", () => this.session.append("assistant/message", {
        turn,
        step,
        message,
        ...live.usage === void 0 ? {} : { usage: live.usage },
        stream: live.stream
      }, { surfaceOp: "append" }).seq), await this[piRequestHook].messages?.(signal), finish.kind === "max-tokens") return { kind: "max-tokens" };
      let toolCalls = message.content.filter((block) => block.type === "tool-call");
      if (toolCalls.length === 0) return { kind: "completed" };
      let { concluded } = await executeToolCalls(this.loopCtx, turn, step, toolCalls, signal, (context2) => this.inbox.splice("next-step", this.inbox.nextStep.length, 0, [context2]));
      return concluded ? { kind: "completed" } : null;
    } catch (error) {
      throw live.ended || live.abandon(), error;
    }
  }
}, async buildRequest(config, preparedCall, tools, position, startsRequestSeries, signal) {
  let { session } = this, surfaceGeneration = session.surface.contentGeneration, header = canonicalHeader({
    config,
    ...preparedCall === void 0 ? {} : { adapterDefaults: preparedCall.adapterDefaults },
    ...tools.length > 0 ? { tools } : {}
  }), baseline = this.session.requestHeader(), startsSeries = startsRequestSeries || this.requestSurfaceGeneration !== surfaceGeneration, headerSeq;
  if (this.requestHeaderLogged ? baseline === void 0 || !headerEquals(baseline, header) ? headerSeq = this.session.append("request/header", {
    header,
    reason: "change",
    ...startsSeries ? { startsSeries: !0 } : {}
  }).seq : startsSeries && this.session.append("request/header", {
    header,
    reason: "series"
  }) : (headerSeq = this.session.append("request/header", {
    header,
    reason: baseline === void 0 ? "initial" : "resume",
    ...startsSeries ? { startsSeries: !0 } : {}
  }).seq, this.requestHeaderLogged = !0), baseline !== void 0 && headerSeq !== void 0) {
    let previousNames = new Set(baseline.tools?.map((tool) => tool.name)), currentNames = new Set(tools.map((tool) => tool.name)), additions = tools.filter((tool) => !previousNames.has(tool.name)).map((tool) => ({
      type: "tool-addition",
      toolName: tool.name
    })), removals = (baseline.tools ?? []).filter((tool) => !currentNames.has(tool.name)).map((tool) => ({
      type: "tool-removal",
      toolName: tool.name
    }));
    (additions.length > 0 || removals.length > 0) && session.append("developer/message", {
      ...position,
      message: createDeveloperMessage({
        source: { kind: "tool-registry" },
        content: [...additions, ...removals]
      }),
      ...additions.length > 0 ? { headerSeq } : {}
    }, { surfaceOp: "append" });
  }
  this.requestSurfaceGeneration = surfaceGeneration;
  let contextWindow = preparedCall?.context?.contextWindow, systemPromptUpdate = preparedCall?.systemPromptUpdate, requestContext = {
    provider: config.provider,
    model: config.model,
    ...contextWindow === void 0 ? {} : { contextWindow },
    ...systemPromptUpdate === void 0 ? {} : { systemPromptUpdate }
  }, previousContext = session.requestContext();
  (previousContext?.provider !== requestContext.provider || previousContext.model !== requestContext.model || previousContext.contextWindow !== requestContext.contextWindow || previousContext.systemPromptUpdate !== requestContext.systemPromptUpdate) && session.append("request/context", requestContext), signal.throwIfAborted();
  let boundaryMessages = session.deriveMessages(), toolHistory = session.toolHistory(), projected = await this[piRequestHook]({ messages: boundaryMessages, tools: header.tools ?? [], toolHistory }, signal);
  if (signal.throwIfAborted(), projected) {
    boundaryMessages = projected.messages, toolHistory = projected.toolHistory;
    let { tools: _tools, ...rest } = header, nextHeader = canonicalHeader({ ...rest, ...projected.tools.length ? { tools: projected.tools } : {} });
    headerEquals(header, nextHeader) || session.append("request/header", { header: nextHeader, reason: "change", startsSeries: !0 }), header = nextHeader;
  }
  deepFreeze(header), deepFreeze(toolHistory);
  for (let message of boundaryMessages)
    this.frozenMessages.has(message) || (deepFreeze(message), this.frozenMessages.add(message));
  return Object.freeze(boundaryMessages), markAgentLoopRequest(Object.freeze({
    ...header.config,
    messages: boundaryMessages,
    toolHistory,
    ...header.tools !== void 0 ? { tools: header.tools } : {},
    sessionId: this.session.id,
    signal
  }));
}, async turn() {
  this.phase.kind !== "running" && this.throwError(/* @__PURE__ */ new Error(`agent "${this.id}": turn without driver reservation`));
  let phase = this.phase, { signal } = phase.abort;
  signal.throwIfAborted();
  let turn = phase.turn + 1;
  try {
    this.session.append("turn/start", { turn });
  } catch (error) {
    this.throwError(error);
  }
  phase.turn = turn;
  let turnEnds = null, target = "next-turn";
  try {
    for (; ; ) {
      signal.throwIfAborted();
      let step = phase.step + 1, decision = await this.preStep(target, {
        turn,
        step
      });
      if (decision.kind === "reject")
        return turnEnds = { kind: "blocked" }, !1;
      if (turnEnds && decision.messages.length === 0) break;
      if (phase.step === 0 && decision.messages.length === 0)
        return turnEnds = { kind: "completed" }, !1;
      signal.throwIfAborted(), this.session.append("step/start", {
        turn,
        step
      }), phase.step = step;
      let toolRecovery = new ToolCallRecovery(), stopRecovery = this.ctx.on("session/event", (session, event) => {
        session === this.session && toolRecovery.observe(event);
      });
      try {
        let stepEnd = await this.step(decision);
        (turnEnds === null || turnEnds.kind !== "max-tokens") && (turnEnds = stepEnd);
      } catch (error) {
        try {
          for (let event of toolRecovery.results()) this.session.append("tool/result", event.data, {
            surfaceOp: "append",
            ...event.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: event.sourceEventSeqs }
          });
        } catch (recoveryError) {
          throw new AggregateError([error, recoveryError], "Step failed and its pending tool results could not be recorded", { cause: error });
        }
        throw error;
      } finally {
        stopRecovery(), this.session.append("step/end", {
          turn,
          step
        });
      }
      if (signal.throwIfAborted(), turnEnds && this.inbox.nextStep.length === 0 && (await this.dispatch.serial("agent/turn-stopping", {
        turn,
        signal
      }), signal.throwIfAborted()), turnEnds && this.inbox.nextStep.length === 0) break;
      target = "next-step";
    }
  } catch (error) {
    let cause = abortedCancelCause(signal);
    if (cause !== void 0)
      throw turnEnds = {
        kind: "aborted",
        reason: cause
      }, error;
    turnEnds = {
      kind: "error",
      error: error instanceof LlmError ? error.failure : {
        message: errorChain(error),
        code: "UNKNOWN"
      }
    }, this.throwError(error);
  } finally {
    try {
      this.session.append("turn/end", {
        turn,
        reason: turnEnds
      });
    } catch (error) {
      this.throwError(error);
    }
  }
  return await this[piRequestHook].settle?.(signal), signal.throwIfAborted(), this.inbox.hasPending ? (phase.abort = new AbortController(), phase.wakeRequested = !1, phase.step = 0, !0) : !1;
} };
export {
  methods,
  piRequestHook
};
