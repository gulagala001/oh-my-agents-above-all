import { realpathSync, readFileSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function officialNpmCli(candidate) {
  try {
    const cli = realpathSync(candidate);
    if (basename(cli) !== 'npm-cli.js') return;
    if (JSON.parse(readFileSync(join(dirname(dirname(cli)), 'package.json'), 'utf8')).name === 'npm') return cli;
  } catch { /* Try the next installed layout. */ }
}

// Execute npm's JavaScript entry with Node. Windows npm.cmd is a shell shim,
// not an executable accepted by execFile; npm_execpath can also point to pnpm.
export function resolveNpmCli({ env = process.env, nodePath = process.execPath, platform = process.platform } = {}) {
  const explicit = env.npm_execpath && officialNpmCli(env.npm_execpath);
  if (explicit) return explicit;
  const directories = [dirname(nodePath)];
  try { directories.push(dirname(realpathSync(nodePath))); } catch { /* Test layouts may use a stand-in Node path. */ }
  const path = Object.entries(env).find(([name]) => name.toUpperCase() === 'PATH')?.[1] ?? '';
  directories.push(...path.split(platform === 'win32' ? ';' : ':').filter(Boolean));
  if (platform === 'win32' && env.APPDATA) directories.push(join(env.APPDATA, 'npm'));
  for (const directory of new Set(directories.map(value => resolve(value)))) {
    const candidates = [
      join(directory, 'npm'),
      join(directory, 'node_modules/npm/bin/npm-cli.js'),
      join(directory, '../lib/node_modules/npm/bin/npm-cli.js'),
    ];
    for (const candidate of candidates) {
      const cli = officialNpmCli(candidate);
      if (cli) return cli;
    }
  }
  throw new Error('Cannot locate an installed npm/bin/npm-cli.js; install npm with the active Node runtime.');
}

export function npmCommand(args, options = {}) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new TypeError('npm arguments must be a string array.');
  return { program: options.nodePath ?? process.execPath, args: [resolveNpmCli(options), ...args] };
}

export function runNpmSync(args, options = {}) {
  const command = npmCommand(args, { env: options.env ?? process.env });
  return execFileSync(command.program, command.args, options);
}
