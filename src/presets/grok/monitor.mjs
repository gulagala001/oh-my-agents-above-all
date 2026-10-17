import { AsyncLocalStorage } from 'node:async_hooks';
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';

export const name = 'omaa-grok-monitor';
export const inject = ['tools', 'jobs'];
const source = readFileSync(new URL('./sources/crates/codegen/xai-grok-tools/src/implementations/grok_build/monitor/tool.rs', import.meta.url), 'utf8');
const description = source.match(/fn description_template\(&self\) -> &str \{\s*r#"([\s\S]*?)"#/)[1]
  .replaceAll('${%- if system_reminders_enabled %}', '').replaceAll('${%- endif %}', '')
  .replaceAll('${%- if tools.by_kind.kill_task_action %}', '').replaceAll('${{ tools.by_kind.kill_task_action }}', '`job_kill`');
const duration = 36_000_000;
function truncate(text, size) {
  const buffer = Buffer.from(text);
  if (buffer.length <= size) return text;
  let end = size;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8') + '...(truncated)';
}
export class MonitorBatch {
  #text = '';
  #bytes = 0;
  #truncated = false;
  get length() { return this.#text.length; }
  push(lines) {
    for (const line of lines) {
      if (this.#truncated) break;
      const text = (this.#text ? '\n' : '') + line, bytes = Buffer.byteLength(text);
      if (this.#bytes + bytes > 3000) {
        this.#text = truncate(this.#text + text, 3000); this.#truncated = true; break;
      }
      this.#text += text; this.#bytes += bytes;
    }
  }
  flush() { const text = this.#text; this.#text = ''; this.#bytes = 0; this.#truncated = false; return text; }
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

export function apply(ctx) {
  const starting = new AsyncLocalStorage(), monitors = new Map();
  const clear = state => { clearTimeout(state.debounce); clearTimeout(state.deadline); state.debounce = undefined; state.deadline = undefined; };
  const notice = (state, text) => {
    if (state.disabled) return;
    const message = createUserMessage({ content: [{ type: 'text', text: `<monitor-event description="${safeAttribute(state.description)}" task_id="${state.id}">\n${text}\n</monitor-event>` }],
      source: { kind: 'tool-jobs', form: 'notice', summary: boundContextSummary('Monitor event: ' + state.description) } });
    if (state.agent.status === 'idle') state.agent.followup(message); else state.agent.inject(message);
  };
  const kill = (state, reason) => {
    state.disabled = true; clear(state); state.batch.flush(); state.lines.pending = '';
    if (state.stopRequested) return;
    state.stopRequested = true;
    try { ctx.jobs.kill(state.id, state.agent.id, reason); } catch (error) { ctx.logger.warn('Grok monitor stop: ' + error.message); }
  };
  const deliver = state => {
    state.debounce = undefined;
    if (state.disabled || !state.batch.length) return;
    const batch = state.batch.flush();
    const outcome = state.limiter.process();
    if (outcome.kind === 'allowed') { if (outcome.notice) notice(state, outcome.notice); notice(state, batch); }
    else if (outcome.kind === 'kill') { notice(state, outcome.notice); kill(state, 'monitor output rate exceeded for 30s'); }
  };
  const collect = (state, final = false) => {
    if (state.disabled) return;
    const output = ctx.jobs.readAt(state.id, state.offset, state.agent.id);
    state.offset = output.next;
    if (output.lossy) { state.lines.pending = ''; state.batch.push(['[Monitor output gap: earlier bytes were dropped by the host output ring.]']); }
    for (const chunk of output.chunks) if (chunk.channel !== 'stderr') state.batch.push(state.lines.push(chunk.text));
    if (final) state.batch.push(state.lines.flush());
    if (state.batch.length && !state.debounce) {
      state.debounce = setTimeout(() => deliver(state), 200); state.debounce.unref();
    }
    // Flush the last partial stdout line; the existing job service owns completion.
    if (final) { clear(state); deliver(state); }
  };
  ctx.jobs.events.subscribe({ owners: 'scope' }, event => {
    if (event.type === 'registered') {
      const state = starting.getStore();
      if (state && event.job.owner === state.agent.id && event.job.kind === state.shell && !state.id) {
        state.id = event.job.id; monitors.set(state.id, state);
      }
      return;
    }
    const id = event.type === 'output' ? event.id : event.job?.id;
    const state = monitors.get(id);
    if (!state) return;
    try {
      if (event.type === 'output') collect(state);
      else if (event.type === 'settled') {
        if (event.cause !== 'teardown' && event.job.status !== 'killed') collect(state, true);
        state.disabled = true; clear(state); state.batch.flush(); state.lines.pending = ''; monitors.delete(id);
      } else if (event.type === 'stopping') { state.disabled = true; state.stopRequested = true; clear(state); state.batch.flush(); state.lines.pending = ''; }
    } catch (error) { kill(state, 'monitor observer failed'); ctx.logger.warn('Grok monitor: ' + error.message); }
  });
  ctx.effect(() => () => { for (const state of monitors.values()) kill(state, 'monitor scope disposed'); monitors.clear(); }, 'Grok monitor teardown');
  ctx.tools.register({ name: 'monitor', description,
    parameters: { type: 'object', properties: {
      command: { type: 'string', description: 'Shell command or script. Each stdout line is an event; exit ends the watch.' },
      description: { type: 'string', description: 'Short human-readable description of what you are monitoring (shown in every notification).' },
      timeout_ms: { type: 'integer', minimum: 0, description: 'Kill the monitor after this deadline (ms). Ignored when persistent is true. Default: 36000000 (10 hr). Max: 36000000 unless persistent is true; 0 means no deadline.' },
      persistent: { type: 'boolean', description: 'Run for the lifetime of the session (no timeout). Stop with job_kill.' },
    }, required: ['command', 'description'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { taskId: { type: 'string' }, timeoutMs: { type: 'integer' }, persistent: { type: 'boolean' } }, required: ['taskId', 'timeoutMs', 'persistent'] },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('monitor requires a session agent');
      const shell = ctx.tools.get('bash', exec.agent) ? 'bash' : ctx.tools.get('pwsh', exec.agent) ? 'pwsh' : undefined;
      if (!shell) throw new Error('monitor requires a native command tool');
      const state = { agent: exec.agent, shell, description: args.description, id: undefined, offset: 0, lines: new MonitorLines(), batch: new MonitorBatch(), limiter: new MonitorRateLimiter(), disabled: false };
      const persistent = args.persistent === true, timeout = persistent ? 0 : args.timeout_ms ?? duration;
      if (!persistent && timeout > duration) throw new Error('persistent must be true when timeout_ms exceeds 36000000ms');
      const stopOnAbort = () => { if (state.id) kill(state, 'monitor call cancelled'); };
      exec.signal.addEventListener('abort', stopOnAbort, { once: true });
      try {
        const result = await starting.run(state, () => ctx.tools.execute({ name: shell, callId: exec.callId + ':monitor-command', rootCallId: exec.rootCallId ?? exec.callId,
          arguments: { description: args.description, command: args.command, run_in_background: true }, agent: exec.agent, signal: exec.signal, parent: exec.token }));
        if (result.isError) throw new Error(result.error?.message ?? 'native command failed');
        if (result.value?.kind !== 'background' || !result.value.jobId || result.value.jobId !== state.id) throw new Error('native command did not return the monitored background job');
        exec.signal.throwIfAborted();
        if (monitors.has(state.id)) {
          collect(state);
          if (timeout) { state.deadline = setTimeout(() => kill(state, 'monitor deadline reached'), timeout); state.deadline.unref(); }
        }
        return { taskId: state.id, timeoutMs: timeout, persistent };
      } catch (error) { if (state.id) kill(state, 'monitor launch failed or cancelled'); throw error; }
      finally { exec.signal.removeEventListener('abort', stopOnAbort); }
    },
  });
}
