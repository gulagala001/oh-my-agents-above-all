import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply as applyResources } from '../src/presets/pi/resources.mjs';
import { apply as applyExtensions } from '../src/presets/pi/extensions.mjs';
import { frameDecoder } from '../src/presets/pi/extensions/wire.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pi-directory-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = join(root, 'first'), second = join(root, 'second'), third = join(root, 'third'), agentDir = join(root, 'agent');
  for (const dir of [first, second, third, agentDir]) await mkdir(dir);
  const fs = {
    async resolve(file, { signal } = {}) { signal?.throwIfAborted(); return { displayPath: file }; },
    async stat(target) {
      try { const value = await stat(target.displayPath); return { type: value.isDirectory() ? 'directory' : 'file', size: value.size, version: String(value.mtimeMs) }; }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    },
    async *streamText(target) { yield await readFile(target.displayPath, 'utf8'); },
    async listDir(target) { return (await readdir(target.displayPath, { withFileTypes: true })).map(value => ({ name: value.name,
      type: value.isDirectory() ? 'directory' : 'file', target: { displayPath: join(target.displayPath, value.name) } })); },
  };
  const hooks = new Map(), services = new Map(), tools = new Map(), commands = new Map();
  let cwd = first, ensureCalls = 0;
  services.set('workingDirectory', { get: () => cwd, async ensure(_agent, signal) { signal?.throwIfAborted(); ensureCalls++; return cwd; } });
  const ctx = {
    fs, get: name => services.get(name), provide: (name, service) => services.set(name, service),
    on(name, fn) { hooks.set(name, fn); }, effect() {}, logger: { warn() {} },
    tools: { schemas: () => [...tools.values()].map(({ execute, ...tool }) => tool), get: name => tools.get(name), guard() {},
      register(tool) { tools.set(tool.name, tool); return () => { if (tools.get(tool.name) === tool) tools.delete(tool.name); }; } },
    commands: { list: () => [...commands.values()], find: (_agent, name) => commands.get(name),
      register(command) { commands.set(command.name, command); return () => { if (commands.get(command.name) === command) commands.delete(command.name); }; } },
  };
  services.set('tools', ctx.tools); services.set('commands', ctx.commands);
  const session = { id: 'directory-session', header: { cwd: first, origin: 'root', projectId: 'immutable-project' }, snapshotEvents: () => [] };
  const agent = { id: session.id, session, ctx, status: 'idle', inbox: { nextTurn: [], nextStep: [] }, options: {} };
  return { root, first, second, third, agentDir, ctx, services, hooks, tools, commands, agent, setCwd(value) { cwd = value; }, get ensureCalls() { return ensureCalls; } };
}

test('Pi resources and prompt frame follow current directory while session identity stays immutable', async t => {
  const f = await fixture(t);
  for (const [dir, value] of [[f.first, 'FIRST_RESOURCE'], [f.second, 'SECOND_RESOURCE']]) {
    await mkdir(join(dir, '.pi/prompts'), { recursive: true });
    await writeFile(join(dir, '.pi/SYSTEM.md'), value);
    await writeFile(join(dir, '.pi/prompts/location.md'), value + ' $1');
  }
  f.ctx.skills = { registerProvider() {} };
  f.ctx.systemPrompt = { section() {} };
  applyResources(f.ctx, { agentDir: f.agentDir });
  const resources = f.services.get('omaaPiResources'), signal = AbortSignal.timeout(10000);
  await resources.prepare(f.agent, signal);
  const assembly = { sections: [], contexts: [], tools: [] };
  assert.equal(resources.frame(f.agent, assembly, []).options.customPrompt, 'FIRST_RESOURCE');
  f.setCwd(f.second);
  await resources.prepare(f.agent, signal);
  const frame = resources.frame(f.agent, assembly, []);
  assert.equal(frame.options.cwd, f.second);
  assert.equal(frame.options.customPrompt, 'SECOND_RESOURCE');
  assert.equal(f.agent.session.header.cwd, f.first);
  assert.equal(f.agent.session.header.projectId, 'immutable-project');
  const submitted = [];
  f.agent.followup = value => submitted.push(value);
  await f.commands.get('location').handler({ agent: f.agent, rawInput: ' argument', signal });
  assert.equal(submitted[0].content[0].text, '/location argument');
  f.hooks.get('agent/inbox/claimed')({ agent: f.agent, message: submitted[0] });
  const boundary = await resources.prepare(f.agent, signal);
  assert.equal(boundary.messages[0].content[0].text, 'SECOND_RESOURCE argument');
  f.services.delete('workingDirectory');
  await resources.prepare(f.agent, signal);
  const fallback = resources.frame(f.agent, assembly, []);
  assert.equal(fallback.options.cwd, f.first);
  assert.equal(fallback.options.customPrompt, 'FIRST_RESOURCE', 'older hosts keep the session-header directory contract');
});

test('Pi starts a new guest after cd, captures each exec cwd, and retains original sandbox root and history header', async t => {
  const f = await fixture(t), source = join(f.root, 'directory-extension.mjs');
  await writeFile(source, `export default function(pi) {
    pi.registerTool({ name: 'directory_probe', description: 'Probe execution directory', parameters: { type: 'object', properties: {} },
      async execute(_id, _params, _signal, _update, ctx) {
        const result = await pi.exec('node', ['-e', 'process.stdout.write(process.cwd())'], { cwd: ctx.cwd });
        return { content: [{ type: 'text', text: result.stdout }], details: { cwd: ctx.cwd, processCwd: process.cwd(), managerCwd: ctx.sessionManager.getCwd() } };
      } });
  }`);
  const policy = { mode: 'workspace-write', workspaceRoot: f.first }, confined = [], spawned = [], requests = [];
  const states = new Map();
  f.ctx.omaa = { product: () => ({ id: 'pi' }), enhancementEnabled: () => false,
    piExtensions: { states, settings: { read: () => ({ files: [source] }) }, notify() {} } };
  f.ctx.sandboxPolicy = { resolve: () => policy };
  // This unit host records confinement inputs; native sandbox execution is
  // exercised separately by installed-host tests, never claimed here.
  f.ctx.sandbox = { async confine(argv, value) { confined.push(structuredClone(value)); return { argv }; } };
  let executableGate;
  f.ctx.subprocess = {
    async resolveExecutable() { if (executableGate) { const gate = executableGate; executableGate = undefined; gate.entered.resolve(); await gate.release.promise; } return process.execPath; },
    spawn(options) {
      spawned.push(options);
      const child = spawn(options.argv[0], options.argv.slice(1), { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, HOME: f.root, USERPROFILE: f.root, TMPDIR: f.root, JITI_FS_CACHE: '0' } });
      if (options.argv.some(value => value.endsWith('/guest.mjs'))) {
        const frames = frameDecoder(), write = child.stdin.write.bind(child.stdin);
        child.stdin.write = (chunk, ...args) => { for (const line of String(chunk).trim().split('\n')) { const value = frames.accept(JSON.parse(line)); if (value) requests.push(value); } return write(chunk, ...args); };
      }
      const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })); });
      const terminate = () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); };
      options.signal?.addEventListener('abort', terminate, { once: true });
      done.finally(() => options.signal?.removeEventListener('abort', terminate));
      return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, done, terminate,
        async waitForExit(signal) { signal?.throwIfAborted(); await done; return true; } };
    },
  };
  f.services.set('sessionQuery', { async observeSession() { return { header: f.agent.session.header, cursor: 0, events: [], [Symbol.dispose]() {} }; } });
  applyExtensions(f.ctx);
  t.after(async () => { for (const state of states.values()) await state.dispose(); });
  const signal = AbortSignal.timeout(30000);
  await f.hooks.get('agent/created')({ agent: f.agent, signal });
  const run = () => f.tools.get('directory_probe').execute({}, { callId: 'probe', signal });
  const first = await run();
  assert.deepEqual(first.details, { cwd: f.first, processCwd: f.first, managerCwd: f.first });
  assert.equal(first.content[0].text, f.first);
  f.setCwd(f.second);
  const resolve = f.ctx.fs.resolve;
  let changedDuringLoad = false;
  f.ctx.fs.resolve = async (...args) => {
    const target = await resolve(...args);
    if (args[0] === source && !changedDuringLoad) { changedDuringLoad = true; f.setCwd(f.third); }
    return target;
  };
  await f.services.get('omaaPiExtensions').input(f.agent, [], signal);
  assert.equal(requests.filter(value => value.type === 'load').at(-1).snapshot.cwd, f.second, 'load uses the same directory captured for startGuest, even if current cwd changes while inspecting source');
  f.setCwd(f.second);
  const second = await run();
  assert.deepEqual(second.details, { cwd: f.second, processCwd: f.second, managerCwd: f.second });
  assert.equal(second.content[0].text, f.second);
  const guestSpawns = () => spawned.filter(value => value.argv.some(arg => arg.endsWith('/guest.mjs')));
  assert.deepEqual(guestSpawns().map(value => value.cwd), [f.first, f.second]);
  assert(f.ensureCalls >= 2, 'guest startup must use public directory ensure');
  assert(requests.every(value => !value.snapshot || value.snapshot.sessionHeader.cwd === f.first));
  assert(requests.every(value => !value.snapshot || value.snapshot.sessionHeader.projectId === 'immutable-project'));
  executableGate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
  const gate = executableGate, pending = run();
  await gate.entered.promise;
  f.setCwd(f.third);
  gate.release.resolve();
  const captured = await pending;
  assert.equal(captured.content[0].text, f.second, 'an exec already resolving must retain its captured directory');
  assert.equal(captured.details.processCwd, f.second, 'cd does not redirect an existing guest process.cwd');
  await f.services.get('omaaPiExtensions').input(f.agent, [], signal);
  assert.equal((await run()).content[0].text, f.third);
  assert.deepEqual(guestSpawns().map(value => value.cwd), [f.first, f.second, f.third]);
  f.services.delete('workingDirectory');
  await f.services.get('omaaPiExtensions').input(f.agent, [], signal);
  assert.equal((await run()).content[0].text, f.first, 'older hosts retain session-header execution directory');
  assert.deepEqual(guestSpawns().map(value => value.cwd), [f.first, f.second, f.third, f.first]);
  assert(confined.length >= 6 && confined.every(value => value.workspaceRoot === f.first && value.mode === 'workspace-write'));
});
