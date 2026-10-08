#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import { validationHosts, alignedVersion } from '../src/host/compatibility.mjs';
import { runNpmSync } from './npm-runner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overlay = join(root, 'compat', 'omd');
const usage = 'Usage: node scripts/package-omd-compat.mjs --base <official-directory|official.tgz> --host-version <VERSION> [--omd-version 0.8.2] [--out-dir dist]';
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  if (!['--base', '--host-version', '--omd-version', '--out-dir'].includes(key) || !args[i + 1] || Object.hasOwn(options, key)) throw new Error(usage);
  options[key] = args[i + 1];
}
if (!options['--base'] || !options['--host-version']) throw new Error(usage);
const hostVersion = options['--host-version'];
const variant = validationHosts.find(row => row.version === hostVersion)?.omdVariant;
if (!variant) throw new Error(`Unsupported host ${hostVersion}; review and register a new baseline before packaging.`);
const omdVersion = options['--omd-version'] ?? '0.8.2';
if (!/^\d+\.\d+\.\d+$/.test(omdVersion)) throw new Error('OMD version must have three numeric components.');
const [major, minor] = omdVersion.split('.').map(Number);
if (major === 0 && minor < 7) throw new Error('The OMAA bridge is a new feature; OMD must be 0.7.0 or newer.');
const outputVersion = alignedVersion(hostVersion, 'omd', omdVersion);
const rulesBytes = await readFile(join(overlay, `${variant}.json`));
const rules = JSON.parse(rulesBytes);
if (rules.hostVersion !== hostVersion) throw new Error('OMD baseline host differs from its validation representative.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const localOnly = new Set(['AGENTS.md', 'CLAUDE.md', 'AI_README.md', 'OMAA_HANDOFF.md', 'COMPUTER_USE_HANDOFF.md', 'COMPUTER_USE_BASELINE.md', 'COMPUTER_USE_ASSESSMENT.md', 'WINDOWS_HANDOFF.md', 'PROMPT_MAINTENANCE.md', 'PROMPT_CHANGES.md', '.cache', '.git', 'node_modules', 'data', 'test']);
const allowedFiles = ['src', 'lib', 'presets', 'cordis.patch.yml', 'README.md', 'CONTRIBUTING.md', 'scripts', 'THIRD_PARTY_NOTICES.md', 'docs', 'vendor', 'release-manifest.json', 'CHANGELOG.md'];
const releaseTrees = ['src', 'lib', 'vendor', 'presets', 'scripts', 'docs'];
const safePath = value => typeof value === 'string' && value.length && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => !part || part === '..' || part === '.');
async function walk(directory, prefix = '') {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    if (localOnly.has(name) || name === '.DS_Store') continue;
    const absolute = join(directory, name), rel = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in package input: ${rel}`);
    if (stat.isDirectory()) files.push(...await walk(absolute, rel));
    else if (stat.isFile()) files.push(rel);
    else throw new Error(`Unsupported package entry: ${rel}`);
  }
  return files;
}
async function assertHashes(directory, hashes, label) {
  const failures = [];
  for (const [file, expected] of Object.entries(hashes)) {
    if (!safePath(file)) throw new Error(`Unsafe overlay path: ${file}`);
    try {
      const actual = sha(await readFile(join(directory, file)));
      if (actual !== expected) failures.push(`${file}: expected ${expected}, actual ${actual}`);
    } catch (error) { failures.push(`${file}: ${error.code ?? error.message}`); }
  }
  if (failures.length) throw new Error(`${label} differs from the reviewed ${rules.sourceTag} baseline (${failures.length} file(s)):\n${failures.slice(0, 12).join('\n')}\nReview the upstream diff and update compat/omd; do not force-apply this overlay.`);
}

const cache = join(root, '.cache');
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(join(cache, `omd-compat-${variant}-`));
const staging = join(temporary, 'package');
let completed = false;
try {
  let base = resolve(options['--base']);
  const stat = await lstat(base);
  if (!stat.isDirectory()) {
    if (!stat.isFile()) throw new Error('Base must be an official package directory or tgz.');
    const archive = join(temporary, 'base.tgz');
    await cp(base, archive);
    const members = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } }).trim().split('\n');
    for (const member of members) {
      const name = member.endsWith('/') ? member.slice(0, -1) : member;
      if (!safePath(name) || (name !== 'package' && !name.startsWith('package/'))) throw new Error(`Unsafe tgz entry: ${member}`);
    }
    const listing = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } });
    if (listing.split('\n').some(line => line && !['-', 'd'].includes(line[0]))) throw new Error('Base archive contains links or special files.');
    const extracted = join(temporary, 'base'); await mkdir(extracted);
    execFileSync('tar', ['-xzf', archive, '-C', extracted], { stdio: 'ignore' });
    base = join(extracted, 'package');
  }
  const packageBytes = await readFile(join(base, 'package.json'));
  const manifest = JSON.parse(packageBytes);
  if (manifest.name !== 'trisoul_x' || manifest.version !== rules.baseVersion || manifest.devDependencies?.['@deepseek-ai/dsh'] !== hostVersion) throw new Error(`Expected official trisoul_x ${rules.baseVersion} for DSH ${hostVersion}; found ${manifest.name} ${manifest.version}.`);
  if (sha(packageBytes) !== rules.basePackageSha256) throw new Error('Base package.json differs from the fixed official manifest; review its diff first.');
  if (JSON.stringify(manifest.files) !== JSON.stringify(allowedFiles)) throw new Error('Official package file allowlist changed.');
  if (esbuildVersion !== manifest.devDependencies.esbuild) throw new Error(`Expected esbuild ${manifest.devDependencies.esbuild}, found ${esbuildVersion}; install the repository lockfile.`);
  for (const name of allowedFiles) {
    const input = join(base, name);
    const inputStat = await lstat(input);
    if (inputStat.isSymbolicLink()) throw new Error(`Refusing symlink in package input: ${name}`);
    if (inputStat.isDirectory()) await walk(input);
    await cp(input, join(staging, name), { recursive: true, filter: path => !localOnly.has(basename(path)) && basename(path) !== '.DS_Store' });
  }
  await assertHashes(staging, rules.files, 'Base release');
  const optionalPresent = {};
  for (const [file, expected] of Object.entries(rules.optionalPackagingFiles ?? {})) {
    try { await lstat(join(staging, file)); optionalPresent[file] = expected; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await assertHashes(staging, optionalPresent, 'Packaging control files');
  for (const tree of releaseTrees) {
    const extras = (await walk(join(staging, tree), tree)).filter(file => !Object.hasOwn(rules.files, file) && !Object.hasOwn(rules.optionalPackagingFiles ?? {}, file));
    if (extras.length) throw new Error(`Unknown files in official ${tree} baseline: ${extras.slice(0, 12).join(', ')}`);
  }
  const patchPath = join(overlay, rules.patch), patchBytes = await readFile(patchPath);
  if (sha(patchBytes) !== rules.patchSha256) throw new Error('Overlay patch hash changed; update reviewed compat/omd metadata.');
  await assertHashes(join(overlay, 'additions'), rules.additions, 'Overlay additions');
  const overlaySha256 = sha(Buffer.concat([rulesBytes, patchBytes]));
  // The staging directory is not a checkout. Stop Git's parent discovery so
  // diff --git paths are not silently skipped relative to the OMAA repository.
  const patchOptions = { cwd: staging, stdio: 'pipe', env: { ...process.env, GIT_CEILING_DIRECTORIES: temporary } };
  execFileSync('git', ['apply', '--check', patchPath], patchOptions);
  execFileSync('git', ['apply', patchPath], patchOptions);
  for (const file of Object.keys(rules.additions)) {
    await mkdir(dirname(join(staging, file)), { recursive: true });
    await cp(join(overlay, 'additions', file), join(staging, file));
  }
  await assertHashes(staging, rules.patchedFiles, 'Patched source');
  manifest.version = outputVersion;
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Rebuild only browser assets. Never import upstream build.mjs: it invokes
  // build-host.mjs and would replace the rc.2 host factories with alpha ones.
  const { packSkin } = await import(pathToFileURL(join(staging, 'scripts/pack-skin.mjs')).href);
  for (const skin of ['google-material-expressive', 'ios-liquid-glass', 'codex-desktop', 'claude-cli-terminal']) {
    await packSkin(join(staging, 'src/client/skins', skin), join(staging, 'src/client/skins/bundled', `${skin}.json`));
  }
  await build({
    entryPoints: [join(staging, 'src/client/index.jsx')], outfile: join(staging, 'lib/client.js'),
    bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
    minifySyntax: true, minifyWhitespace: true, keepNames: true,
    external: ['react-dom', 'react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-api-session-controller/client'],
    banner: { js: 'window.__ModuleLoader__.load({id:"trisoul_x",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
    footer: { js: 'return module.exports;}});' },
    plugins: [{ name: 'inline-css', setup(builder) {
      builder.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }));
    } }],
  });
  const retained = Object.fromEntries(Object.entries(rules.files).filter(([file]) => file.startsWith('lib/host/') || file.startsWith('vendor/')));
  await assertHashes(staging, retained, 'Native host factories/vendor snapshot after browser build');
  for (const file of ['src/index.mjs', 'src/ultracode.mjs', 'src/codegraph-agent.mjs', ...Object.keys(rules.additions)]) execFileSync(process.execPath, ['--check', join(staging, file)], { stdio: 'pipe' });
  const releases = JSON.parse(await readFile(join(staging, 'release-manifest.json'), 'utf8'));
  releases.releases = [{ version: outputVersion, severity: 'normal', title: 'OMAA 兼容增强与外观协调', notes: [
    `配对官方 DSH ${hostVersion}，在固定 OMD 0.6.1 基线上添加 OMAA 兼容接口。`,
    '五预设可复用基础增强与 Pro/Ultra，保留原生工作流、无项目会话和宿主草稿恢复。',
    '移除 Jevify 推荐入口。',
  ] }, ...releases.releases.filter(entry => entry.version !== outputVersion)];
  await writeFile(join(staging, 'release-manifest.json'), `${JSON.stringify(releases, null, 2)}\n`);
  await writeFile(join(staging, 'omaa-compat.json'), `${JSON.stringify({ schema: 1, version: outputVersion, hostVersion, baseVersion: rules.baseVersion, sourceCommit: rules.sourceCommit, overlaySha256, patchSha256: sha(patchBytes), nativeHostFactories: 'preserved' }, null, 2)}\n`);
  manifest.files.push('omaa-compat.json');
  await writeFile(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const dist = resolve(root, options['--out-dir'] ?? 'dist'); await mkdir(dist, { recursive: true });
  const packed = JSON.parse(runNpmSync(['pack', '--ignore-scripts', '--json', '--pack-destination', dist], { cwd: staging, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }))[0];
  for (const entry of packed.files) {
    if (!safePath(entry.path) || entry.path.split('/').some(part => localOnly.has(part)) || entry.path.includes('/.build-')) throw new Error(`Non-release file in packed inventory: ${entry.path}`);
  }
  const tarball = join(dist, packed.filename), sha256 = sha(await readFile(tarball));
  await writeFile(`${tarball}.sha256`, `${sha256}  ${packed.filename}\n`);
  const metadata = { name: manifest.name, version: outputVersion, hostVersion, baseVersion: rules.baseVersion, sourceTag: rules.sourceTag, sourceCommit: rules.sourceCommit, overlaySha256, patchSha256: sha(patchBytes), esbuildVersion, nativeHostFactories: 'preserved', filename: packed.filename, sha256, size: packed.size, unpackedSize: packed.unpackedSize };
  await writeFile(`${tarball}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  completed = true;
  console.log(JSON.stringify({ ...metadata, tarball }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
  if (!completed) console.error('Packaging stopped; input and installed profiles were not modified.');
}
