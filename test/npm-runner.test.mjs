import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveNpmCli, npmCommand, runNpmSync } from '../scripts/npm-runner.mjs';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omaa npm layout '))); t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function npmAt(prefix, name = 'npm') {
  const cli = join(prefix, 'bin/npm-cli.js'); await mkdir(dirname(cli), { recursive: true });
  await writeFile(join(prefix, 'package.json'), JSON.stringify({ name }));
  await writeFile(cli, 'console.log(JSON.stringify(process.argv.slice(2)));\n'); return cli;
}

test('npm resolution handles Unix runtime installs and executable symlinks', async t => {
  const root = await fixture(t), cli = await npmAt(join(root, 'runtime/lib/node_modules/npm'));
  const nodePath = join(root, 'runtime/bin/node'); await mkdir(dirname(nodePath), { recursive: true });
  assert.equal(resolveNpmCli({ env: { PATH: '' }, nodePath, platform: 'linux' }), cli);
  const bin = join(root, 'global-bin'); await mkdir(bin); await symlink(cli, join(bin, 'npm'));
  assert.equal(resolveNpmCli({ env: { PATH: bin }, nodePath: join(root, 'other/node'), platform: 'darwin' }), cli);
});

test('Windows install layouts and global PATH resolve JavaScript without running cmd shims', async t => {
  const root = await fixture(t), prefix = join(root, 'windows global with spaces');
  const cli = await npmAt(join(prefix, 'node_modules/npm'));
  await writeFile(join(prefix, 'npm.cmd'), 'this shell shim must never execute');
  const pnpm = await npmAt(join(root, 'pnpm'), 'pnpm');
  assert.equal(resolveNpmCli({ env: { Path: join(root, 'absent') + ';' + prefix, npm_execpath: pnpm }, nodePath: join(root, 'other/node.exe'), platform: 'win32' }), cli);
  assert.equal(resolveNpmCli({ env: {}, nodePath: join(prefix, 'node.exe'), platform: 'win32' }), cli);
});

test('npm command keeps spaced and shell-looking arguments as literal argv', async t => {
  const root = await fixture(t), cli = await npmAt(join(root, 'explicit npm'));
  const args = ['pack', 'path with spaces', 'literal $(touch never) & "quoted"'];
  const command = npmCommand(args, { env: { npm_execpath: cli } });
  assert.equal(command.program, process.execPath); assert.deepEqual(command.args, [cli, ...args]);
  assert.deepEqual(JSON.parse(runNpmSync(args, { env: { npm_execpath: cli }, encoding: 'utf8' })), args);
  assert.throws(() => npmCommand([1]), /string array/);
  assert.throws(() => resolveNpmCli({ env: {}, nodePath: join(root, 'missing/node') }), /Cannot locate/);
});
