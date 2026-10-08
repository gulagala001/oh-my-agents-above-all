import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import semver from 'semver';
import { HOST_RANGE, LOADER_RANGE, validationHosts, supportsHostVersion, splitReleaseVersion } from '../src/host/compatibility.mjs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runNpmSync } from './npm-runner.mjs';
import { hostManifest, releaseFiles } from './host-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const usage = 'Usage: node scripts/package.mjs [--host-version VERSION] [--host-cli PATH]';
const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--host-version', '--host-cli'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) throw new Error(usage);
  options[args[i]] = args[i + 1];
}
const release = splitReleaseVersion(source.version, 'omaa');
const hostVersion = options['--host-version'] ?? release.host;
if (!supportsHostVersion(hostVersion)) throw new Error(`Unsupported host version ${hostVersion}; current range is ${HOST_RANGE}.`);
const representative = validationHosts.find(row => row.version === hostVersion);
let loaderVersion = representative?.loaderVersion;
if (options['--host-cli']) {
  const cli = await realpath(resolve(options['--host-cli']));
  const hostManifest = JSON.parse(await readFile(join(dirname(dirname(cli)), 'package.json'), 'utf8'));
  if (hostManifest.name !== '@deepseek-ai/dsh' || hostManifest.version !== hostVersion) throw new Error('Host CLI package does not match the requested full host version.');
  const hostRequire = createRequire(cli);
  const loader = JSON.parse(await readFile(hostRequire.resolve('@deepseek-ai/cordis-plugin-loader/package.json'), 'utf8'));
  if (loader.name !== '@deepseek-ai/cordis-plugin-loader' || semver.valid(loader.version) !== loader.version || !semver.satisfies(loader.version, LOADER_RANGE, { includePrerelease: true })) throw new Error(`Host CLI loader is outside ${LOADER_RANGE}.`);
  if (representative && loader.version !== representative.loaderVersion) throw new Error('Host CLI loader differs from its reviewed validation representative.');
  const home = await mkdtemp(join(tmpdir(), 'omaa-package-host-'));
  try {
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    Object.assign(env, { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' });
    const actual = execFileSync(process.execPath, [cli, '--version'], { cwd: home, env, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (actual !== hostVersion) throw new Error('Host CLI --version does not match its package manifest.');
  } finally { await rm(home, { recursive: true, force: true }); }
  loaderVersion = loader.version;
}
if (!loaderVersion) throw new Error(`Host ${hostVersion} is not a validation representative; supply --host-cli with its installed official CLI and loader.`);

const cache = join(root, '.cache');
const dist = join(root, 'dist');
await mkdir(cache, { recursive: true });
await mkdir(dist, { recursive: true });
const staging = await mkdtemp(join(cache, `package-${hostVersion}-`));
try {
  const files = releaseFiles;
  const localNames = new Set([
    'AGENTS.md', 'CLAUDE.md', 'AI_README.md', 'COMPUTER_USE_HANDOFF.md',
    'COMPUTER_USE_BASELINE.md', 'WINDOWS_HANDOFF.md', 'PROMPT_MAINTENANCE.md',
    'PROMPT_CHANGES.md', '.cache', 'test', 'node_modules', '.git',
  ]);
  for (const file of files) {
    await cp(join(root, file), join(staging, file), {
      recursive: true,
      filter: (path) => !localNames.has(basename(path)),
    });
  }

  const manifest = hostManifest(source, hostVersion, loaderVersion);
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const packed = JSON.parse(runNpmSync(['pack', '--ignore-scripts', '--json', '--pack-destination', dist], {
    cwd: staging, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }));
  const filename = packed[0].filename;
  const tarball = join(dist, filename);
  const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await writeFile(`${tarball}.sha256`, `${sha256}  ${filename}\n`);
  const metadata = {
    name: manifest.name, version: manifest.version, hostVersion,
    loaderVersion, filename, sha256,
    createdAt: new Date().toISOString(),
  };
  await writeFile(`${tarball}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ ...metadata, tarball }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
}
