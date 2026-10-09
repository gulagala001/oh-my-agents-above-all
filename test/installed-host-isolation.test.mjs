import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { fixtureEnvironment, installedHost, stopFixtureChild } from './fixtures/installed-host.mjs';

const inheritedPaths = { HOME: '/synthetic-inherited/home', USERPROFILE: '/synthetic-inherited/profile',
  XDG_CONFIG_HOME: '/synthetic-inherited/config', XDG_CACHE_HOME: '/synthetic-inherited/cache',
  XDG_DATA_HOME: '/synthetic-inherited/data', XDG_STATE_HOME: '/synthetic-inherited/state',
  APPDATA: '/synthetic-inherited/appdata', LOCALAPPDATA: '/synthetic-inherited/localdata',
  TEMP: '/synthetic-inherited/temp', TMP: '/synthetic-inherited/tmp', TMPDIR: '/synthetic-inherited/tmpdir',
  PI_CODING_AGENT_DIR: '/synthetic-inherited/personal-pi', DSH_HOME: '/synthetic-inherited/dsh',
  npm_config_userconfig: '/synthetic-inherited/npmrc', npm_config_cache: '/synthetic-inherited/npm-cache',
  NPM_CONFIG_USERCONFIG: '/synthetic-inherited/uppercase-npmrc', NPM_CONFIG_CACHE: '/synthetic-inherited/uppercase-cache',
  npm_config_prefix: '/synthetic-inherited/npm-prefix', NPM_CONFIG_PREFIX: '/synthetic-inherited/uppercase-prefix',
  PNPM_HOME: '/synthetic-inherited/pnpm', COREPACK_HOME: '/synthetic-inherited/corepack',
  NODE_OPTIONS: '--require=/synthetic-inherited/user-node-hook.cjs', NODE_PATH: '/synthetic-inherited/node-modules', NODE_TEST_CONTEXT: 'synthetic-test-marker', NODE_TEST_WORKER_ID: '42',
  SYNTHETIC_FIXTURE_CREDENTIAL: 'not-a-real-key', OMAA_TEST_SAFE: undefined };

async function withSyntheticEnvironment(action, overrides = {}) {
  const prior = Object.fromEntries(Object.keys(inheritedPaths).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(inheritedPaths)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    Object.assign(process.env, overrides);
    return await action();
  } finally {
    for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
const expectedPaths = home => ({ HOME: join(home, 'user-home'), USERPROFILE: join(home, 'user-home'), DSH_HOME: home,
  XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), XDG_STATE_HOME: join(home, 'state'),
  APPDATA: join(home, 'config'), LOCALAPPDATA: join(home, 'cache'), TEMP: join(home, 'tmp'), TMP: join(home, 'tmp'), TMPDIR: join(home, 'tmp'),
  PI_CODING_AGENT_DIR: join(home, 'pi-agent'), PNPM_HOME: join(home, 'bin'), COREPACK_HOME: join(home, 'cache/corepack'),
  npm_config_userconfig: join(home, 'fixture-empty.npmrc'), NPM_CONFIG_USERCONFIG: join(home, 'fixture-empty.npmrc'),
  npm_config_cache: join(home, 'cache/npm'), NPM_CONFIG_CACHE: join(home, 'cache/npm'),
  npm_config_prefix: join(home, 'npm-global'), NPM_CONFIG_PREFIX: join(home, 'npm-global') });

test('graceful host stop records SIGTERM and cancels its fallback timer', async () => {
  const child = new EventEmitter(), signals = []; Object.assign(child, { exitCode: null, signalCode: null });
  child.kill = signal => { signals.push(signal); queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, null); }); };
  assert.deepEqual(await stopFixtureChild(child, 1000), { alreadyStopped: false, signal: 'SIGTERM', forced: false });
  assert.deepEqual(signals, ['SIGTERM']);
});

test('unresponsive host is cleaned with SIGKILL but forced cleanup rejects', async () => {
  const child = new EventEmitter(), signals = []; Object.assign(child, { exitCode: null, signalCode: null });
  child.kill = signal => { signals.push(signal); if (signal === 'SIGKILL') { child.signalCode = signal; child.emit('exit', null, signal); } };
  await assert.rejects(stopFixtureChild(child, 5), /required forced SIGKILL.*cleanup is not a pass/);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.equal(child.signalCode, 'SIGKILL');
});

test('ordinary fixture environment overrides every inherited user and Pi path without requiring SAFE', async () => withSyntheticEnvironment(() => {
  const home = '/synthetic-owned/fixture/dsh-home', env = fixtureEnvironment(home);
  for (const [key, value] of Object.entries(expectedPaths(home))) assert.equal(env[key], value, key + ' must stay owned');
  assert.equal(env.SYNTHETIC_FIXTURE_CREDENTIAL, inheritedPaths.SYNTHETIC_FIXTURE_CREDENTIAL, 'ordinary environment retains its explicit credential semantics');
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID']) assert.equal(env[key], undefined);
}));

test('SAFE still rejects explicitly configured live credentials before starting any fixture', async () => {
  await assert.rejects(installedHost({ after() { throw Error('No fixture should have been constructed'); } }, { safeEnvironment: true, liveSettings: { apiKey: 'synthetic-live', baseUrl: 'https://synthetic.invalid/v1', model: 'synthetic' } }), /Safe host matrix only permits the localhost fixture provider/);
});

test('SAFE credential filtering remains distinct from mandatory filesystem isolation', async () => withSyntheticEnvironment(() => {
  const home = '/synthetic-owned/fixture/dsh-home', env = fixtureEnvironment(home, true);
  for (const [key, value] of Object.entries(expectedPaths(home))) assert.equal(env[key], value, key + ' must stay owned in SAFE mode');
  assert.equal(env.SYNTHETIC_FIXTURE_CREDENTIAL, undefined); assert.equal(env.npm_config_ignore_scripts, 'true');
  assert.equal(env.DSH_TELEMETRY_DISABLED, '1');
}));

async function cliStub(t) {
  const root = await mkdtemp(join(tmpdir(), 'omaa-isolation-unit-')), lib = join(root, 'host/lib'); await mkdir(lib, { recursive: true });
  const manifest = { name: '@deepseek-ai/dsh', version: '0.2.1-alpha.2', type: 'module' };
  await writeFile(join(root, 'host/package.json'), JSON.stringify(manifest));
  const cli = join(lib, 'bin.mjs');
  await writeFile(cli, `import {readFileSync} from 'node:fs'; import {join} from 'node:path';
    const keys = ${JSON.stringify(Object.keys(expectedPaths('/ignored')))};
    if(process.argv.includes('--version')) { console.log('0.2.1-alpha.2'); }
    else if(process.argv.includes('--dump-config')) { console.log('[]'); }
    else { console.log(JSON.stringify({ cwd:process.cwd(), env:Object.fromEntries(keys.map(k=>[k,process.env[k]])), settings:JSON.parse(readFileSync(join(process.env.DSH_HOME,'settings.yaml'),'utf8')) })); }
  `);
  t.after(() => rm(root, { recursive: true, force: true })); return { cliPath: cli, temporary: root };
}

test('default Native fixture construction owns Chrome and Pi while automatic features remain configured', { timeout: 15000 }, async t => {
  const { cliPath, temporary } = await cliStub(t);
  await withSyntheticEnvironment(async () => {
    const f = await installedHost(t, { cliPath, expectedHostVersion: '0.2.1-alpha.2' });
    assert.equal(f.evidence.isolation.safeEnvironment, false, 'This is the ordinary default, not SAFE opt-in');
    const probe = JSON.parse((await f.command(['unit-isolation-probe'])).stdout);
    for (const [key, value] of Object.entries(expectedPaths(f.home))) { assert.equal(probe.env[key], value, key); await access(value); }
    assert.equal(f.userHome, probe.env.HOME); assert.equal(f.piAgentDir, probe.env.PI_CODING_AGENT_DIR);
    assert.equal(probe.cwd, f.workspace, 'Ordinary install commands must not discover repository/user ancestors');
    assert.equal(probe.settings['trisoul-x'].computerUseChromeUserDataDir, join(f.home, 'chrome-profile'));
    assert.equal(probe.settings['trisoul-x'].componentAutoSetup, undefined, 'Mandatory path ownership must not disable automatic setup');
    assert.equal(probe.settings['trisoul-x'].computerUseNativeBinary, undefined, 'Ordinary fixture retains real component configuration');
    await assert.rejects(readFile(join(f.piAgentDir, 'settings.json')), { code: 'ENOENT' });
    await access(join(f.workspace, '.git'));
  }, { TMPDIR: temporary });
});

test('default fallback npm pack uses the same owned environment before profile installation', { timeout: 15000 }, async t => {
  const { cliPath, temporary } = await cliStub(t), npmRoot = join(temporary, 'synthetic-npm'), npmBin = join(npmRoot, 'bin'); await mkdir(npmBin, { recursive: true });
  await writeFile(join(npmRoot, 'package.json'), JSON.stringify({ name: 'npm', version: '0.0.0-unit-stub' }));
  const npmCli = join(npmBin, 'npm-cli.js');
  await writeFile(npmCli, `const {writeFileSync}=require('node:fs'), {join}=require('node:path'); const keys=${JSON.stringify(Object.keys(expectedPaths('/ignored')))};
    writeFileSync(join(process.env.DSH_HOME,'unit-pack-environment.json'),JSON.stringify(Object.fromEntries(keys.map(k=>[k,process.env[k]]))));
    console.log(JSON.stringify([{filename:'unit-synthetic-only.tgz',files:[]}]));`);
  const priorNpm = process.env.npm_execpath;
  try {
    process.env.npm_execpath = npmCli;
    await withSyntheticEnvironment(async () => {
      const f = await installedHost(t, { cliPath }); await f.install();
      const packedEnvironment = JSON.parse(await readFile(join(f.home, 'unit-pack-environment.json')));
      for (const [key, value] of Object.entries(expectedPaths(f.home))) assert.equal(packedEnvironment[key], value, 'npm pack ' + key);
    }, { TMPDIR: temporary });
  } finally { if (priorNpm === undefined) delete process.env.npm_execpath; else process.env.npm_execpath = priorNpm; }
});

test('legacy false isolation options cannot opt an ordinary fixture back into personal HOME or Pi', { timeout: 15000 }, async t => {
  const { cliPath, temporary } = await cliStub(t);
  await withSyntheticEnvironment(async () => {
    const f = await installedHost(t, { cliPath, isolatedHome: false, piResources: false });
    const probe = JSON.parse((await f.command(['unit-isolation-probe'])).stdout);
    for (const [key, value] of Object.entries(expectedPaths(f.home))) assert.equal(probe.env[key], value, key);
    assert.equal(f.userHome, join(f.home, 'user-home')); assert.equal(f.piAgentDir, join(f.home, 'pi-agent'));
    assert.equal(probe.settings['trisoul-x'].computerUseChromeUserDataDir, join(f.home, 'chrome-profile'));
    assert.equal(probe.settings['trisoul-x'].componentAutoSetup, undefined);
  }, { TMPDIR: temporary });
});
