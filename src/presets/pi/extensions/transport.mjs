import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

const MAX_FRAME = 2_097_152;
const guestFile = fileURLToPath(new URL('./guest.mjs', import.meta.url));

// The subprocess provider owns the process range, scrubbed environment and
// cancellation. This guest has callbacks only, no agent/model/input driver.
export async function startGuest({ subprocess, sandbox, policy, cwd, signal, api }) {
  signal?.throwIfAborted();
  const program = await subprocess.resolveExecutable('node', undefined, signal);
  const command = [program, guestFile];
  const confined = policy.mode === 'danger-full-access' ? { argv: command } : await sandbox.confine(command, policy, signal);
  const life = new AbortController();
  const child = subprocess.spawn({ argv: confined.argv, cwd,
    env: { ELECTRON_RUN_AS_NODE: undefined, JITI_FS_CACHE: '0' },
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 500, signal: life.signal });
  const decoder = new StringDecoder('utf8');
  const pending = new Map(); let buffer = '', stderr = '', stopped = false, closing;
  child.stdin?.on('error', () => {});
  const send = value => {
    if (stopped) throw Error('Pi 扩展进程已停止');
    const line = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(line) > MAX_FRAME) throw Error('Pi 扩展消息超过 2 MiB');
    child.stdin.write(line);
  };
  const close = () => {
    if (closing) return closing;
    const result = Promise.withResolvers(); closing = result.promise;
    void (async () => {
      stopped = true; life.abort(); child.terminate();
      try { await child.done; } catch {}
      if (!await child.waitForExit(AbortSignal.timeout(5000))) throw Error('Pi 扩展进程未完成退出');
      for (const entry of pending.values()) entry.reject(Error('Pi 扩展进程已停止'));
      pending.clear();
    })().then(result.resolve, result.reject);
    return closing;
  };
  const frame = async message => {
    if (message.type === 'result') {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id);
      message.error ? entry.reject(Error(message.error)) : entry.resolve(message.value);
    } else if (message.type === 'api') {
      const entry = pending.get(message.requestId);
      if (!entry || entry.signal?.aborted) throw Error('Pi 扩展 API 没有有效调用上下文');
      try { const value = await api(message.method, message.args, entry.context, entry.signal); send({ type: 'api-result', id: message.id, ...value === undefined ? {} : { value } }); }
      catch (error) { if (!stopped) send({ type: 'api-result', id: message.id, error: error.message }); }
    } else if (message.type === 'update') {
      // The native registry has no partial-result ABI. Do not create fake log
      // events; the final canonical content/details remain authoritative.
      pending.get(message.requestId)?.onUpdate?.(message.value);
    } else throw Error('Pi 扩展返回未知消息');
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
          void frame(JSON.parse(line)).catch(async error => { for (const e of pending.values()) e.reject(error); await close(); });
        }
        if (Buffer.byteLength(buffer) > MAX_FRAME) throw Error('Pi 扩展消息超过大小限制');
      }
    } catch (error) { for (const e of pending.values()) e.reject(error); await close(); }
  })();
  void (async () => { for await (const chunk of child.stderr) stderr = (stderr + chunk.toString('utf8')).slice(-8192); })().catch(() => {});
  void child.done.then(() => {
    stopped = true;
    for (const entry of pending.values()) entry.reject(Error('Pi 扩展进程退出' + (stderr ? ': ' + stderr.slice(-2048) : '')));
    pending.clear();
  }, error => { stopped = true; for (const entry of pending.values()) entry.reject(error); pending.clear(); });
  return {
    get stopped() { return stopped; },
    close,
    async call(request, { context, signal: caller, timeoutMs = 120000, onUpdate } = {}) {
      const deadline = AbortSignal.timeout(timeoutMs), fused = AbortSignal.any([life.signal, deadline, ...caller ? [caller] : []]);
      fused.throwIfAborted();
      const id = randomUUID();
      let abort;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, context, signal: fused, onUpdate });
        abort = () => { try { send({ type: 'cancel', id }); } catch {} void close().then(() => reject(fused.reason), reject); };
        fused.addEventListener('abort', abort, { once: true });
        try { send({ ...request, id }); } catch (error) { pending.delete(id); reject(error); }
      });
      try { return await result; }
      catch (error) { if (fused.aborted || stopped) await close(); throw error; }
      finally { fused.removeEventListener('abort', abort); pending.delete(id); }
    },
  };
}
