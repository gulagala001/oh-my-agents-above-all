import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { AsyncLocalStorage } from 'node:async_hooks';
import { encodeFrames, frameDecoder, MAX_FRAME_BYTES } from './wire.mjs';

const MAX_FRAME = MAX_FRAME_BYTES;
const guestFile = fileURLToPath(new URL('./guest.mjs', import.meta.url));

// The subprocess provider owns the process range, scrubbed environment and
// cancellation. This guest has callbacks only, no agent/model/input driver.
export async function startGuest({ subprocess, sandbox, policy, cwd, signal, api }) {
  signal?.throwIfAborted();
  const program = await subprocess.resolveExecutable('node', undefined, signal);
  const command = [program, guestFile];
  const confined = policy.mode === 'danger-full-access' ? { argv: command } : await sandbox.confine(command, policy, signal);
  signal?.throwIfAborted();
  const life = new AbortController();
  const child = subprocess.spawn({ argv: confined.argv, cwd,
    env: { ELECTRON_RUN_AS_NODE: undefined, JITI_FS_CACHE: '0' },
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal: life.signal });
  const decoder = new StringDecoder('utf8'), messages = frameDecoder();
  const pending = new Map(); let buffer = '', stderr = '', stopped = false, closing, compression = false;
  const apiContext = new AsyncLocalStorage(), apiTasks = new Set(), apiIds = new Set();
  child.stdin?.on('error', () => {});
  const send = value => {
    if (stopped) throw Error('Pi 扩展进程已停止');
    for (const line of encodeFrames({ ...value, wireCompression: true }, { compress: compression })) child.stdin.write(line);
  };
  const close = () => {
    if (closing) return closing;
    const result = Promise.withResolvers(); closing = result.promise;
    void (async () => {
      stopped = true; messages.clear();
      for (const entry of pending.values()) entry.reject(Error('Pi 扩展进程已停止'));
      pending.clear();
      life.abort(Error('Pi 扩展进程已停止'));
      const processDrain = (async () => {
        child.terminate();
        const deadline = AbortSignal.timeout(5000);
        // Command completion and managed-range quiescence are distinct native
        // facts. Neither an unbounded done wait nor a false exit proves drain.
        const completion = new Promise((resolve, reject) => {
          const abort = () => reject(Error('Pi 扩展命令结束事实未确认'));
          deadline.addEventListener('abort', abort, { once: true });
          void child.done.then(resolve, resolve).finally(() => deadline.removeEventListener('abort', abort));
        });
        const [completed, exited] = await Promise.allSettled([completion, child.waitForExit(deadline)]);
        if (completed.status === 'rejected') throw completed.reason;
        if (exited.status === 'rejected') throw exited.reason;
        if (!exited.value) throw Error('Pi 扩展进程范围未完成退出');
      })();
      // Stop admission first. Every API gate is registered before its first
      // asynchronous effect; nested cancellation must not await this same join.
      const [processResult] = await Promise.allSettled([processDrain, Promise.allSettled([...apiTasks])]);
      if (processResult.status === 'rejected') throw processResult.reason;
    })().then(result.resolve, result.reject);
    return closing;
  };
  const frame = async message => {
    if (message.wireCompression === true) compression = true;
    if (message.type === 'result') {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id);
      message.error ? entry.reject(Error(message.error)) : entry.resolve(message.value);
    } else if (message.type === 'api') {
      const entry = pending.get(message.requestId);
      if (!entry || entry.signal?.aborted) throw Error('Pi 扩展 API 没有有效调用上下文');
      try { const value = await api(message.method, message.args, entry.context, entry.signal); if (!stopped) send({ type: 'api-result', id: message.id, ...value === undefined ? {} : { value } }); }
      catch (error) { if (!stopped) send({ type: 'api-result', id: message.id, error: error.message }); }
    } else if (message.type === 'update') {
      // The native registry has no partial-result ABI. Do not create fake log
      // events; the final canonical content/details remain authoritative.
      pending.get(message.requestId)?.onUpdate?.(message.value);
    } else throw Error('Pi 扩展返回未知消息');
  };
  const frameFailure = error => {
    for (const entry of pending.values()) entry.reject(error);
    void close().catch(() => {});
  };
  const launchFrame = message => {
    if (stopped) return;
    if (message.type !== 'api') { void frame(message).catch(frameFailure); return; }
    if (typeof message.id !== 'string' || !message.id || message.id.length > 512 || apiIds.has(message.id) || apiTasks.size >= 256)
      throw Error('Pi 扩展 API 调用身份重复、无效或超过256项预算');
    const gate = Promise.withResolvers(), token = { active: true };
    apiTasks.add(gate.promise); apiIds.add(message.id);
    const finish = (value, error) => {
      token.active = false; apiTasks.delete(gate.promise); apiIds.delete(message.id);
      error ? gate.reject(error) : gate.resolve(value);
    };
    void gate.promise.catch(frameFailure);
    // Register before any host API can synchronously request shutdown.
    void Promise.resolve().then(() => {
      if (stopped) throw Error('Pi 扩展 API 范围已停止');
      return apiContext.run(token, () => frame(message));
    }).then(value => finish(value), error => finish(undefined, error));
  };
  const pump = (async () => {
    try {
      for await (const chunk of child.stdout) {
        buffer += decoder.write(chunk);
        let split;
        while ((split = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, split); buffer = buffer.slice(split + 1);
          if (Buffer.byteLength(line) > MAX_FRAME) throw Error('Pi 扩展消息超过大小限制');
          // Never globally await callbacks: executeTool and userQuestions can
          // require another guest invocation while this API frame is pending.
          const value = messages.accept(JSON.parse(line));
          if (value !== null) launchFrame(value);
        }
        if (Buffer.byteLength(buffer) > MAX_FRAME) throw Error('Pi 扩展消息超过大小限制');
      }
    } catch (error) { for (const e of pending.values()) e.reject(error); await close(); }
  })();
  // close() can reject when native command/range drain is unconfirmed. Observe
  // that reader failure too; explicit callers still receive the shared close
  // rejection, rather than leaving an unhandled reader Promise in the host.
  void pump.catch(frameFailure);
  void (async () => { for await (const chunk of child.stderr) stderr = (stderr + chunk.toString('utf8')).slice(-8192); })().catch(() => {});
  void child.done.then(() => {
    stopped = true; messages.clear();
    for (const entry of pending.values()) entry.reject(Error('Pi 扩展进程退出' + (stderr ? ': ' + stderr.slice(-2048) : '')));
    pending.clear();
    void close().catch(() => {});
  }, error => { stopped = true; messages.clear(); for (const entry of pending.values()) entry.reject(error); pending.clear(); void close().catch(() => {}); });
  return {
    get stopped() { return stopped; },
    close,
    async call(request, { context, signal: caller, timeoutMs = 120000, onUpdate, onCancel } = {}) {
      const deadline = AbortSignal.timeout(timeoutMs), fused = AbortSignal.any([life.signal, deadline, ...caller ? [caller] : []]);
      fused.throwIfAborted();
      const id = randomUUID();
      let abort;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, context, signal: fused, onUpdate });
        abort = () => {
          try { send({ type: 'cancel', id }); } catch {}
          // An active callback may publish its read-only cancelled
          // settlement before the guest is terminated. This is bounded by the
          // caller; cancellation still revokes this invocation immediately.
          const drain = Promise.resolve().then(() => onCancel?.()).catch(() => {}).then(close);
          if (apiContext.getStore()?.active) { void drain.catch(() => {}); reject(fused.reason); }
          else void drain.then(() => reject(fused.reason), reject);
        };
        fused.addEventListener('abort', abort, { once: true });
        try { send({ ...request, id }); } catch (error) { pending.delete(id); reject(error); }
      });
      try { return await result; }
      catch (error) {
        if (fused.aborted || stopped) {
          const drain = close();
          if (apiContext.getStore()?.active) void drain.catch(() => {});
          else await drain;
        }
        throw error;
      }
      finally { fused.removeEventListener('abort', abort); pending.delete(id); }
    },
  };
}
