import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const runFile = promisify(execFile);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const sanitize = text => String(text).replace(/token=[\w-]+/g, 'token=[redacted]');
export async function until(check, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(50); }
  throw new Error('Installed DSH fixture timed out');
}
export const textReply = content => ({ delta: { role: 'assistant', content }, finish_reason: 'stop' });
export const toolReply = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });

export async function installedHost(t, { liveSettings, piResources = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'omaa-installed-'));
  const home = join(root, 'dsh-home'), workspace = join(root, 'workspace');
  await mkdir(home); await mkdir(workspace);
  const env = { ...process.env, DSH_HOME: home };
  // The host is a separate application, not a node:test worker. These markers
  // make a workspace's nested `node --test` skip discovery and report 0 tests.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  const piAgentDir = piResources ? join(root, 'pi-agent') : undefined;
  if (piAgentDir) { await mkdir(piAgentDir); env.PI_CODING_AGENT_DIR = piAgentDir; }
  const protectedValues = [liveSettings?.apiKey, liveSettings?.baseUrl];
  if (liveSettings?.baseUrl) try { protectedValues.push(new URL(liveSettings.baseUrl).origin); } catch {}
  const redact = value => protectedValues.filter(value => typeof value === 'string' && value.length).sort((a, b) => b.length - a.length).reduce((text, secret) => text.replaceAll(secret, '[redacted]'), sanitize(value));
  const liveProviderId = liveSettings?.providerId ?? 'configured-dsh';
  const liveModel = liveSettings?.modelDefinition ?? { id: liveSettings?.model, name: liveSettings?.model, contextWindow: liveSettings?.contextWindow || 128000, maxTokens: liveSettings?.maxTokens || 8192, input: ['text'] };
  let child, origin, cookie, loginUrl, log = '', responder, gate;
  const requests = [], errors = [];
  const provider = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body); requests.push(payload);
      const choice = await responder?.(payload) ?? textReply('Local fixture completed.');
      if (gate && payload.tools?.length) { const held = gate; gate = undefined; await held.promise; }
      if (res.destroyed) return;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, ...choice }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }) + '\n\ndata: [DONE]\n\n');
    } catch (error) { errors.push(error.message); if (!res.destroyed) { res.writeHead(500); res.end(error.message); } }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  let releaseHeld;
  const stop = async () => {
    releaseHeld?.(); releaseHeld = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const stopped = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
    if (!stopped) { child.kill('SIGKILL'); await exited; }
  };
  t.after(async () => {
    try { await stop(); } finally {
      provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
      if (t.passed === false) t.diagnostic(redact(log.slice(-12000)));
      await rm(root, { recursive: true, force: true });
    }
  });
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'OMAA_INSTALL_FIXTURE', models: [{ id: 'fixture', name: 'Local installation fixture', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] }] } } },
    ...liveSettings ? { 'llm-pi-ai': {providers: { [liveProviderId]: {api: liveSettings.api, baseURL:liveSettings.baseUrl, ...(liveSettings.streamIdleTimeoutMs !== undefined ? { streamIdleTimeoutMs: liveSettings.streamIdleTimeoutMs } : {}), apiKeyEnv:'OMAA_LIVE_CONFIGURED_KEY', compat:liveSettings.compat||{}, models:[liveModel]} }}, 'agent-default-model':{provider:liveProviderId,model:liveModel.id} } : { 'agent-default-model':{provider:'fixture',model:'fixture'} },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: liveSettings ? { OMAA_LIVE_CONFIGURED_KEY: liveSettings.apiKey } : { OMAA_INSTALL_FIXTURE:'local-dummy-key' } }), { mode: 0o600 });
  const command = async args => {
    try { return await runFile(process.execPath, [cli, ...args], { cwd: repo, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (error) { throw new Error(redact(error.stderr || error.stdout || error.message)); }
  };
  await command(['--profile', 'omaa-fixture', '--from-default-profile', 'web', '--dump-config']);
  const install = async () => {
    const result = await runFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { cwd: repo, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    const [packed] = JSON.parse(result.stdout);
    await command(['plugin', '--profile', 'omaa-fixture', 'add', 'file:' + join(root, packed.filename)]);
    return packed;
  };
  const call = async (method, args) => {
    const response = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) });
    const value = await response.json();
    if (!value.result?.ok) throw new Error(redact(JSON.stringify(value)) + '\n' + redact(log.slice(-4000)));
    return value.result.value;
  };
  const rpc = (method, request) => call(method, { request });
  const api = async (sessionId, patch) => {
    const response = await fetch(origin + '/omaa/api/session?session=' + encodeURIComponent(sessionId), { headers: { cookie, 'content-type': 'application/json' }, ...(patch === undefined ? {} : { method: 'POST', body: JSON.stringify(patch) }) });
    return { status: response.status, value: await response.json() };
  };
  const boot = async () => {
    log = '';
    child = spawn(process.execPath, [cli, '--profile', 'omaa-fixture', '--no-open', '--port', '0'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { log = (log + data).slice(-30000); });
    child.stderr.on('data', data => { log = (log + data).slice(-30000); });
    const url = await until(() => {
      if (child.exitCode !== null) throw new Error(redact(log));
      return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
    }, 45000).catch(error => { throw new Error(error.message + '\n' + redact(log)); });
    origin = new URL(url).origin;
    const login = await fetch(url, { redirect: 'manual' });
    loginUrl = url;
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    await until(async () => (await call('llm/listProviders', {})).some(value => value.id === (liveSettings ? liveProviderId : 'fixture')));
  };
  const snapshot = async sessionId => {
    const projections = await rpc('session/projections', { sessionId });
    const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: projections.asOfSeq, maxMessages: 100 });
    return { ...page, projections };
  };
  const send = (sessionId, text, mode = 'queue') => rpc('session/prompt', { sessionId, requestId: crypto.randomUUID(), mode, content: [{ type: 'text', text }] });
  const prompt = async (sessionId, text, { timeout = liveSettings ? 180000 : 20000 } = {}) => {
    const before = (await snapshot(sessionId)).projections.asOfSeq;
    await send(sessionId, text);
    return until(async () => {
      const value = await snapshot(sessionId);
      const end = value.records.findLast(record => record.event?.type === 'turn/end' && record.event.seq > before)?.event;
      if (end?.data.reason?.kind === 'error') throw new Error(redact(JSON.stringify(end.data.reason)) + '\n' + redact(log.slice(-4000)));
      return end && value;
    }, timeout);
  };
  return {
    get origin() { return origin; }, get cookie() { return cookie; }, get loginUrl() { return loginUrl; },
    root, home, workspace, piAgentDir, requests, errors, install, boot, stop, call, rpc, api, snapshot, prompt, send,
    uninstall: () => command(['plugin', '--profile', 'omaa-fixture', 'remove', 'oh-my-agents-above-all']),
    create: agentPreset => rpc('session/create', { cwd: workspace, agentPreset }),
    replyWith(fn) { responder = fn; },
    holdNextReply() { let resolve; const promise = new Promise(value => { resolve = value; }); releaseHeld = resolve; gate = { promise }; return resolve; },
    readWorkspace: path => readFile(join(workspace, path), 'utf8'),
  };
}
