import { AsyncLocalStorage } from 'node:async_hooks';
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';

export const name = 'omaa-grok-monitor';
export const inject = ['tools', 'jobs', 'agents', 'omaaGrokMonitorShell'];
const source = readFileSync(new URL('./sources/crates/codegen/xai-grok-tools/src/implementations/grok_build/monitor/tool.rs', import.meta.url), 'utf8');
const description = source.match(/fn description_template\(&self\) -> &str \{\s*r#"([\s\S]*?)"#/)[1]
  .replaceAll('${%- if system_reminders_enabled %}', '').replaceAll('${%- endif %}', '')
  .replaceAll('${%- if tools.by_kind.kill_task_action %}', '').replaceAll('${{ tools.by_kind.kill_task_action }}', '`job_kill`');
const duration = 36_000_000;
const batchLimit = 3000;
const startupSettlementLimit = 32;
const gapNotice = '[Monitor output gap: bytes were dropped by the native output source or retention.]';
function utf8Prefix(text, size) {
  const buffer = Buffer.from(text);
  if (buffer.length <= size) return text;
  let end = size;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8');
}
function truncate(text, size) {
  return Buffer.byteLength(text) <= size ? text : utf8Prefix(text, size) + '...(truncated)';
}
export class MonitorLines {
  #chunks = [];
  #head = 0;
  #bytes = 0;
  #wellFormed = true;
  get pending() { return this.#chunks.slice(this.#head).join(''); }
  set pending(text) { this.#chunks = []; this.#head = 0; this.#bytes = Buffer.byteLength(text); this.#wellFormed = text.isWellFormed(); this.#append(text); }
  #append(text) {
    const last = this.#chunks.at(-1);
    if (typeof last === 'string' && last.length + text.length <= 4096) { this.#chunks[this.#chunks.length - 1] += text; return; }
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 4096, text.length);
      if (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end++;
      this.#chunks.push(text.slice(start, end)); start = end;
    }
  }
  push(text) {
    if (!text) return [];
    const last = this.#chunks.at(-1), previous = typeof last === 'string' ? last.charCodeAt(last.length - 1) : undefined, first = text.charCodeAt(0);
    const bytes = Buffer.byteLength(text);
    this.#bytes += bytes - (previous >= 0xd800 && previous <= 0xdbff && first >= 0xdc00 && first <= 0xdfff ? 2 : 0);
    this.#wellFormed &&= text.isWellFormed();
    this.#append(text);
    if (this.#bytes > 1_048_576) {
      if (!this.#wellFormed || bytes > 1_048_576) this.pending = Buffer.from(this.pending).subarray(-1_048_576).toString('utf8');
      else {
        let excess = this.#bytes - 1_048_576;
        while (excess > 0) {
          const buffer = Buffer.from(this.#chunks[this.#head]);
          if (buffer.length <= excess) { excess -= buffer.length; this.#bytes -= buffer.length; this.#chunks[this.#head++] = null; continue; }
          const tail = buffer.subarray(excess);
          let start = 0;
          while ((tail[start] & 0xc0) === 0x80) start++;
          // Preserve Buffer's replacement characters when the byte cap cuts a code point.
          this.#chunks[this.#head] = tail.subarray(start).toString('utf8');
          if (start) this.#chunks.splice(this.#head, 0, '\ufffd'.repeat(start));
          this.#bytes += start * 2 - excess;
          break;
        }
        if (this.#head >= 1024) { this.#chunks = this.#chunks.slice(this.#head); this.#head = 0; }
      }
    }
    if (!text.includes('\n')) return [];
    const lines = this.pending.split('\n'); this.pending = lines.pop();
    return lines.map(line => line.trim()).filter(Boolean).map(line => truncate(line, 500));
  }
  flush() { const text = this.pending.trim(); this.pending = ''; return text ? [truncate(text, 500)] : []; }
}
export class MonitorRateLimiter {
  constructor(now = performance.now()) { this.tokens = 10; this.lastRefill = now; this.suppressed = 0; this.since = null; this.lastSuppression = null; this.killed = false; }
  process(now = performance.now()) {
    if (this.killed) return { kind: 'suppressed' };
    const refill = Math.floor((now - this.lastRefill) / 2000);
    if (refill > 0) { this.tokens = Math.min(10, this.tokens + refill); this.lastRefill += refill * 2000; }
    if (this.tokens > 0) {
      this.tokens--;
      const notice = this.suppressed ? `[${this.suppressed} events suppressed -- output rate too high. Consider using job_kill to restart this monitor with a more selective filter.]` : '';
      if (this.suppressed && now - this.lastSuppression > 6000) this.since = null;
      this.suppressed = 0;
      return { kind: 'allowed', notice };
    }
    this.suppressed++; this.lastSuppression = now; this.since ??= now;
    if (now - this.since > 30_000) {
      this.killed = true;
      return { kind: 'kill', notice: `[Monitor stopped -- your script produced too much output (${this.suppressed} events suppressed over ${Math.floor((now - this.since) / 1000)}s). Write a new monitor command that filters more aggressively -- pipe through grep --line-buffered, awk, or a wrapper script that only emits the specific events you need.]` };
    }
    return { kind: 'suppressed' };
  }
}
const safeAttribute = value => value.replaceAll('"', "'").replace(/[\r\n]/g, ' ');
function appendBatch(state, lines) {
  for (const line of lines) {
    if (state.batchTruncated) break;
    const separator = state.batch.length ? 1 : 0, bytes = Buffer.byteLength(line);
    if (state.batchBytes + separator + bytes <= batchLimit) {
      state.batch.push(line); state.batchBytes += separator + bytes;
    } else {
      const room = batchLimit - state.batchBytes - separator;
      if (room >= 0) {
        const prefix = utf8Prefix(line, room);
        state.batch.push(prefix); state.batchBytes += separator + Buffer.byteLength(prefix);
      }
      state.batchTruncated = true;
    }
  }
}

export function apply(ctx) {
  const starting = new AsyncLocalStorage(), startups = new Set(), monitors = new Map();
  let closed = false;
  const clear = state => { clearTimeout(state.debounce); clearTimeout(state.deadline); state.debounce = undefined; state.deadline = undefined; };
  const matchesJob = (state, job) => job && typeof job.id === 'string' && job.id
    && job.owner === state.agent.id && job.kind === state.shell && job.label === state.command;
  const observeJob = (state, job) => {
    if (!matchesJob(state, job)) return false;
    state.knownJobs.add(job.id);
    state.id ??= job.id;
    if (state.id === job.id && job.status === 'running') armDeadline(state, job);
    return true;
  };
  const notice = (state, text) => {
    if (closed || state.disabled || ctx.agents.get(state.agent.id) !== state.agent) return;
    const message = createUserMessage({ content: [{ type: 'text', text: `<monitor-event description="${safeAttribute(state.description)}" task_id="${state.id}">\n${text}\n</monitor-event>` }],
      source: { kind: 'tool-jobs', form: 'notice', summary: boundContextSummary('Monitor event: ' + state.description) } });
    if (state.agent.status === 'idle') state.agent.followup(message); else state.agent.inject(message);
  };
  const kill = (state, reason, drainOutput = false) => {
    if (!drainOutput) state.disabled = true;
    clear(state);
    for (const id of state.knownJobs) {
      if (state.stopRequested.has(id) || state.stopInFlight.has(id)) continue;
      state.stopInFlight.add(id);
      try {
        const job = ctx.jobs.get(id, state.agent.id);
        if (job.id !== id || !matchesJob(state, job)) { ctx.logger.warn('Grok monitor stop refused: native job identity changed.'); continue; }
        const outcome = ctx.jobs.kill(id, state.agent.id, reason);
        if (drainOutput && !state.disabled && outcome === 'requested') state.stopping = true;
        state.stopRequested.add(id);
      } catch (error) { ctx.logger.warn('Grok monitor stop not confirmed: ' + error.message); }
      finally { state.stopInFlight.delete(id); }
    }
  };
  function armDeadline(state, job) {
    if (!state.timeout || state.deadlineArmed || state.disabled || state.stopping || closed || state.signal.aborted) return;
    if (!Number.isSafeInteger(job.startedAt) || job.startedAt < 0 || !Number.isSafeInteger(job.startedAt + state.timeout))
      throw Error('Native monitor job has no valid registration timestamp.');
    state.deadlineArmed = true;
    // Public startedAt is Date.now() at registration, not an OS-spawn or
    // monotonic lease. Clamp clock rollback to at most one requested duration.
    const remaining = Math.min(state.timeout, Math.max(0, job.startedAt + state.timeout - Date.now()));
    state.deadline = setTimeout(() => kill(state, 'monitor deadline reached', true), remaining);
    state.deadline.unref();
  }
  const deliver = (state, final = false) => {
    state.debounce = undefined;
    if (closed || state.disabled || state.stopping && !final || (!state.batch.length && !state.batchGap)) return;
    try {
      // Reserve body room for the loss fact even when stdout filled the
      // collector first. Fixed batch_lines caps the body at 3000 UTF-8 bytes,
      // then appends its separate newline + truncation marker.
      const gap = state.batchGap ? gapNotice + '\n' : '', text = state.batch.join('\n');
      const suffix = '\n...(truncated)', available = batchLimit - Buffer.byteLength(gap);
      const prefix = utf8Prefix(text, available);
      const truncated = state.batchTruncated || prefix !== text;
      const batch = gap + prefix + (truncated ? suffix : '');
      state.batch = []; state.batchBytes = 0; state.batchTruncated = false; state.batchGap = false;
      const outcome = state.limiter.process();
      if (outcome.kind === 'allowed') { if (outcome.notice) notice(state, outcome.notice); notice(state, batch); }
      else if (outcome.kind === 'kill') {
        try { notice(state, outcome.notice); }
        finally { kill(state, 'monitor output rate exceeded for 30s'); }
      }
    } catch (error) {
      ctx.logger.warn('Grok monitor delivery failed: ' + error.message);
      kill(state, 'monitor notification delivery failed');
    }
  };
  const collect = (state, final = false) => {
    if (closed || state.disabled || state.stopping && !final) return;
    const output = ctx.jobs.readAt(state.id, state.offset, state.agent.id);
    state.offset = output.next;
    if (output.lossy) { state.lines.pending = ''; state.batchGap = true; }
    for (const chunk of output.chunks) if (chunk.channel !== 'stderr') {
      if (chunk.gapBefore) { state.lines.pending = ''; state.batchGap = true; }
      appendBatch(state, state.lines.push(chunk.text));
    }
    if (final) appendBatch(state, state.lines.flush());
    if ((state.batch.length || state.batchGap) && !state.debounce) {
      state.debounce = setTimeout(() => deliver(state), 200); state.debounce.unref();
    }
    // Flush the last partial stdout line; the existing job service owns completion.
    if (final) { clear(state); deliver(state, true); }
  };
  ctx.jobs.events.subscribe({ owners: 'scope' }, event => {
    if (event.type === 'settled') for (const state of startups) {
      // These are bounded, observe-only candidates. They grant no job id or
      // authority until the actual returned receipt and owner/kind/label match.
      if (matchesJob(state, event.job) && state.startupSettlements.size < startupSettlementLimit)
        state.startupSettlements.set(event.job.id, { cause: event.cause, startedAt: event.job.startedAt });
    }
    if (event.type === 'registered') {
      const state = starting.getStore();
      if (state && startups.has(state) && observeJob(state, event.job)) {
        if (closed || state.signal.aborted) kill(state, 'monitor launch cancelled or scope disposed');
        else if (state.id === event.job.id) monitors.set(state.id, state);
      }
      return;
    }
    const id = event.type === 'output' ? event.id : event.job?.id;
    const state = monitors.get(id);
    if (!state || (event.job && !matchesJob(state, event.job))) return;
    try {
      if (event.type === 'output') collect(state);
      else if (event.type === 'settled') {
        if (event.cause !== 'teardown') collect(state, true);
        state.disabled = true; clear(state); monitors.delete(id);
      } else if (event.type === 'stopping') {
        // The stopping event has no cause. Retain bounded output until settled
        // distinguishes explicit kill from teardown, without waking meanwhile.
        state.stopping = true; state.stopRequested.add(id); clear(state);
      }
    } catch (error) { kill(state, 'monitor observer failed'); ctx.logger.warn('Grok monitor: ' + error.message); }
  });
  ctx.effect(() => async () => {
    closed = true;
    const launching = [...startups], running = new Set([...launching, ...monitors.values()]);
    for (const state of running) {
      state.control.abort(Error('monitor scope disposed'));
      kill(state, 'monitor scope disposed');
    }
    // Native tool dispatch waits for canceled started bodies to settle. Keep
    // launch state until late registered/returned owned jobs are reclaimed.
    await Promise.allSettled(launching.map(state => state.launch));
    for (const state of running) kill(state, 'monitor scope disposed');
    monitors.clear();
  }, 'Grok monitor teardown');
  ctx.tools.register({ name: 'monitor', description,
    parameters: { type: 'object', properties: {
      command: { type: 'string', description: 'Shell command or script. Each stdout line is an event; exit ends the watch.' },
      description: { type: 'string', description: 'Short human-readable description of what you are monitoring (shown in every notification).' },
      timeout_ms: { type: ['integer', 'null'], minimum: 0, description: 'Kill the monitor after this deadline (ms). Ignored when persistent is true. Omitted or null: 36000000 (10 hr). Max: 36000000 unless persistent is true; 0 means no deadline.' },
      persistent: { type: 'boolean', description: 'Run for the lifetime of the session (no timeout). Stop with job_kill.' },
    }, required: ['command', 'description'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { taskId: { type: 'string' }, timeoutMs: { type: 'integer' }, persistent: { type: 'boolean' } }, required: ['taskId', 'timeoutMs', 'persistent'] },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(args, exec) {
      if (closed) throw new Error('monitor scope is closed');
      if (!exec.agent) throw new Error('monitor requires a session agent');
      const shell = ctx.tools.get('bash', exec.agent) ? 'bash' : ctx.tools.get('pwsh', exec.agent) ? 'pwsh' : undefined;
      if (!shell) throw new Error('monitor requires a native command tool');
      const persistent = args.persistent === true, timeout = persistent ? 0 : args.timeout_ms ?? duration;
      if (!persistent && timeout > duration) throw new Error('persistent must be true when timeout_ms exceeds 36000000ms');
      const control = new AbortController(), signal = AbortSignal.any([exec.signal, control.signal]);
      const state = { agent: exec.agent, shell, command: args.command, description: args.description, id: undefined, offset: 0, lines: new MonitorLines(), batch: [], batchBytes: 0, batchTruncated: false, batchGap: false, limiter: new MonitorRateLimiter(), disabled: false, stopping: false, timeout, deadlineArmed: false, control, signal, knownJobs: new Set(), stopRequested: new Set(), stopInFlight: new Set(), startupSettlements: new Map() };
      const stopOnAbort = () => kill(state, 'monitor call cancelled or scope disposed');
      signal.addEventListener('abort', stopOnAbort, { once: true });
      const launch = Promise.withResolvers(); state.launch = launch.promise;
      startups.add(state);
      (async () => {
        try {
          signal.throwIfAborted();
          if (closed) throw new Error('monitor scope is closed');
          const call = { name: shell, callId: exec.callId + ':monitor-command', rootCallId: exec.rootCallId ?? exec.callId,
            arguments: { description: args.description, command: args.command, run_in_background: true }, agent: exec.agent, signal, parent: exec.token };
          const result = await ctx.omaaGrokMonitorShell.run(call, () => starting.run(state, () => ctx.tools.execute(call)));
          // A return is usable only after an authoritative owner/kind/label
          // lookup. Never derive an id or kill a job from an unknown receipt.
          if (result.value?.kind === 'background' && typeof result.value.jobId === 'string') {
            const returned = ctx.jobs.get(result.value.jobId, state.agent.id);
            if (returned.id !== result.value.jobId || !observeJob(state, returned)) throw new Error('native background job identity did not match this monitor');
            if (!result.isError && !closed && !signal.aborted && !state.disabled) {
              if (returned.status === 'running' || returned.status === 'stopping') {
                const previous = monitors.get(returned.id);
                if (previous && previous !== state) throw new Error('native background job already belongs to another monitor');
                monitors.set(returned.id, state);
                if (returned.status === 'stopping') { state.stopping = true; state.stopRequested.add(returned.id); clear(state); }
              } else if (['completed', 'failed', 'killed'].includes(returned.status)) {
                const candidate = state.startupSettlements.get(returned.id);
                const cause = candidate?.startedAt === returned.startedAt ? candidate.cause : undefined;
                if (['producer', 'kill'].includes(cause)) collect(state, true);
                state.disabled = true; clear(state); monitors.delete(returned.id);
              } else throw new Error('native background job has an unsupported observation state');
            }
          }
          if (result.isError) throw new Error(result.error?.message ?? 'native command failed');
          if (result.value?.kind !== 'background' || !result.value.jobId || result.value.jobId !== state.id || state.knownJobs.size !== 1)
            throw new Error('native command did not return exactly one monitored background job');
          signal.throwIfAborted();
          if (closed) throw new Error('monitor scope is closed');
          if (monitors.has(state.id)) {
            collect(state);
          }
          return { taskId: state.id, timeoutMs: timeout, persistent: timeout === 0 };
        } catch (error) { kill(state, 'monitor launch failed or cancelled'); throw error; }
        finally { signal.removeEventListener('abort', stopOnAbort); startups.delete(state); state.startupSettlements.clear(); }
      })().then(launch.resolve, launch.reject);
      return await state.launch;
    },
  });
}
