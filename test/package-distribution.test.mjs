import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostManifest, omdBuildMode, reviewedPatchBytes, emptyPatchSha256 } from '../scripts/host-manifest.mjs';
import { HOST_RANGE, LOADER_RANGE, validationHosts, alignedVersion, splitReleaseVersion } from '../src/host/compatibility.mjs';

const run = promisify(execFile), repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + '\n'); };
const command = (cwd, script, args = [], env = process.env) => run(process.execPath, [join(cwd, 'scripts', script), ...args], { cwd, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'omaa-distribution-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'src/host'), { recursive: true });
  for (const script of ['package.mjs', 'release-assets.mjs', 'verify-release.mjs', 'package-omd-compat.mjs', 'npm-runner.mjs', 'host-manifest.mjs']) await cp(join(repo, 'scripts', script), join(root, 'scripts', script));
  for (const name of ['compatibility.mjs', 'compatibility.json']) await cp(join(repo, 'src/host', name), join(root, 'src/host', name));
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const directory of ['lib', 'docs']) { await mkdir(join(root, directory)); await writeFile(join(root, directory, 'placeholder.txt'), 'distribution fixture\n'); }
  for (const name of ['README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'NOTICE', 'LICENSING.md']) await writeFile(join(root, name), 'distribution fixture\n');
  await writeFile(join(root, 'src/AGENTS.md'), 'local only');
  const source = await json(join(repo, 'package.json'));
  source.version = alignedVersion(validationHosts.at(-1).version, 'omaa', '0.13.1');
  await save(join(root, 'package.json'), source); return { root, source };
}
async function hostCli(root, version, loaderVersion, output = version) {
  const path = join(root, 'native-host/node_modules/@deepseek-ai/dsh');
  await save(join(path, 'package.json'), { name: '@deepseek-ai/dsh', version, type: 'module' });
  await mkdir(join(path, 'lib'), { recursive: true });
  const cli = join(path, 'lib/bin.js'); await writeFile(cli, `if (process.argv[2] !== '--version') throw new Error('unexpected CLI command'); console.log(${JSON.stringify(output)});\n`);
  await save(join(root, 'native-host/node_modules/@deepseek-ai/cordis-plugin-loader/package.json'), { name: '@deepseek-ai/cordis-plugin-loader', version: loaderVersion });
  return cli;
}
async function archive(root, entry, manifest, compatibility, payload = {}) {
  const name = `${entry.name}-${entry.version}.tgz`, staging = join(root, 'archive', name, 'package');
  await save(join(staging, 'package.json'), manifest ?? { name: entry.name, version: entry.version, devDependencies: { '@deepseek-ai/dsh': entry.hostVersion } });
  if (entry.name === 'trisoul_x') await save(join(staging, 'omaa-compat.json'), compatibility ?? { schema: 1, version: entry.version, hostVersion: entry.hostVersion, baseVersion: entry.baseVersion, sourceCommit: entry.sourceCommit, overlaySha256: entry.overlaySha256, patchSha256: entry.patchSha256, nativeHostFactories: 'preserved', ...(entry.mode === undefined ? {} : { mode: entry.mode }) });
  for (const [file, bytes] of Object.entries(payload)) {
    await mkdir(dirname(join(staging, file)), { recursive: true });
    await writeFile(join(staging, file), bytes);
  }
  await mkdir(join(root, 'dist'), { recursive: true });
  await run('tar', ['-czf', join(root, 'dist', name), '-C', dirname(staging), 'package']);
  const bytes = await readFile(join(root, 'dist', name)), metadata = { ...entry, filename: name, sha256: sha(bytes) };
  await writeFile(join(root, 'dist', name + '.sha256'), `${metadata.sha256}  ${name}\n`);
  await save(join(root, 'dist', name + '.metadata.json'), metadata);
  return metadata;
}
async function releaseFixture(t, { taggedPolicy = true, stableSource = true, legacyFiles = false, integrated = false } = {}) {
  const { root, source } = await fixture(t);
  const rows = [...validationHosts, ...(!legacyFiles ? [{ version: '0.2.0', loaderVersion: '1.0.5', omdVariant: 'stable' }] : [])];
  if (legacyFiles) {
    source.version = alignedVersion(validationHosts.at(-1).version, 'omaa', '0.12.1');
    source.files = ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md'];
    for (const name of Object.keys(source.peerDependencies ?? {})) {
      if (name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh') source.peerDependencies[name] = validationHosts.at(-1).version;
      if (name === '@deepseek-ai/cordis-plugin-loader') source.peerDependencies[name] = validationHosts.at(-1).loaderVersion;
    }
    await save(join(root, 'package.json'), source);
  }
  if (stableSource) { source.version = alignedVersion('0.2.0', 'omaa', '0.13.1'); await save(join(root, 'package.json'), source); }
  await save(join(root, 'src/host/compatibility.json'), { hostRange: HOST_RANGE, loaderRange: LOADER_RANGE, validationHosts: rows });
  const assets = [];
  for (const row of rows) {
    const patchBytes = integrated ? Buffer.alloc(0) : Buffer.from('reviewed fixture patch for ' + row.version + '\n');
    const payload = integrated ? {
      'src/index.mjs': 'export const integratedBridge = true;\n',
      'lib/client.js': 'OFFICIAL_CLIENT_BYTES_RETAINED\n',
      'lib/host/factory.mjs': 'export const nativeHost = "' + row.version + '";\n',
      'scripts/retained.mjs': 'export const retainedScript = true;\n',
      'vendor/native-snapshot.txt': 'OFFICIAL_VENDOR_BYTES_RETAINED\n',
    } : {};
    const baseline = { name: 'trisoul_x', version: alignedVersion(row.version, 'omd', integrated ? '0.9.0' : '0.6.1'), private: true, type: 'module', main: 'src/index.mjs', exports: { '.': './src/index.mjs', './client': './lib/client.js' }, files: ['src', 'lib', 'scripts', 'vendor'], devDependencies: { '@deepseek-ai/dsh': row.version, '@deepseek-ai/dsh-storage-domain': row.version, '@deepseek-ai/cordis-plugin-loader': row.loaderVersion }, peerDependencies: { '@deepseek-ai/dsh-storage-domain': row.version, '@deepseek-ai/cordis-plugin-loader': row.loaderVersion }, dsh: { bundle: { patch: ['./cordis.patch.yml'] } } };
    const rule = { hostVersion: row.version, baseVersion: baseline.version, basePackageSha256: sha(Buffer.from(JSON.stringify(baseline, null, 2) + '\n')), sourceTag: 'official-' + row.version, sourceCommit: '1'.repeat(40), patch: integrated ? null : row.omdVariant + '.patch', patchSha256: sha(patchBytes), ...(integrated ? { mode: 'integrated-baseline', additions: {}, patchedFiles: {}, packageFiles: [...baseline.files], files: Object.fromEntries(Object.entries(payload).map(([file, bytes]) => [file, sha(Buffer.from(bytes))])) } : {}) };
    await save(join(root, 'compat/omd', row.omdVariant + '.json'), rule);
    if (!integrated) await writeFile(join(root, 'compat/omd', rule.patch), patchBytes);
    const packaged = JSON.parse((await command(root, 'package.mjs', ['--host-version', row.version])).stdout);
    let metadata = await json(packaged.tarball + '.metadata.json');
    if (!taggedPolicy) {
      const manifest = JSON.parse((await run('tar', ['-xOf', packaged.tarball, 'package/package.json'])).stdout);
      for (const name of Object.keys(manifest.peerDependencies ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh') manifest.peerDependencies[name] = row.version;
        if (name === '@deepseek-ai/cordis-plugin-loader') manifest.peerDependencies[name] = row.loaderVersion;
      }
      if (legacyFiles) manifest.files = [...source.files];
      metadata = await archive(root, metadata, manifest);
    }
    assets.push(metadata);
    const overlaySha256 = sha(Buffer.concat([await readFile(join(root, 'compat/omd', row.omdVariant + '.json')), patchBytes]));
    assets.push(await archive(root, { name: 'trisoul_x', version: alignedVersion(row.version, 'omd', integrated ? '0.9.0' : '0.8.1'), ...rule, overlaySha256, nativeHostFactories: 'preserved' }, { ...baseline, version: alignedVersion(row.version, 'omd', integrated ? '0.9.0' : '0.8.1'), files: [...baseline.files, 'omaa-compat.json'] }, undefined, payload));
  }
  if (!taggedPolicy) {
    await rm(join(root, 'src/host/compatibility.json'));
    await writeFile(join(root, 'scripts/package.mjs'), 'const loaderVersions = ' + JSON.stringify(Object.fromEntries(rows.map(row => [row.version, row.loaderVersion]))) + ';\n');
  }
  return { root, source, assets, rows };
}
async function mockRelease(root, source) {
  await run('git', ['init', '-q', root]);
  await run('git', ['-C', root, 'add', 'package.json', 'src/host', 'compat', 'scripts/package.mjs']);
  await run('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Distribution Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'distribution fixture']);
  const commit = (await run('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim(), tag = 'v' + source.version;
  await run('git', ['-C', root, '-c', 'tag.gpgSign=false', 'tag', tag]);
  const entries = [];
  for (const [index, name] of (await readdir(join(root, 'dist'))).entries()) {
    const bytes = await readFile(join(root, 'dist', name)); entries.push({ id: index + 1, name, state: 'uploaded', size: bytes.length, digest: 'sha256:' + sha(bytes) });
  }
  await save(join(root, 'remote-fixture.json'), { commit, tag, entries });
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/gh'), `#!${process.execPath}\nimport fs from 'node:fs'; import path from 'node:path'; const root = ${JSON.stringify(root)}; const data = JSON.parse(fs.readFileSync(path.join(root, 'remote-fixture.json'))); const args = process.argv.slice(2), endpoint = args.find(arg => arg.startsWith('repos/')); let value; if (args[0] === 'release') value = {apiUrl:'https://api.github.com/repos/fixture/omaa/releases/1',tagName:data.tag}; else if (endpoint.includes('/git/ref/tags/')) value = {object:{type:'commit',sha:data.commit}}; else if (endpoint === 'repos/fixture/omaa/releases/1') value = {tag_name:data.tag,id:1}; else if (endpoint.includes('/releases/1/assets?')) value = [data.entries]; else if (endpoint.includes('/releases/assets/')) { const row = data.entries.find(row => row.id === Number(endpoint.split('/').at(-1))); process.stdout.write(fs.readFileSync(path.join(root,'dist',row.name))); process.exit(0); } else throw new Error('Unexpected mock GH call'); console.log(JSON.stringify(value));\n`, { mode: 0o755 });
  return { tag, env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH } };
}

test('representative distributions retain exact SDKs and shared peer range', async t => {
  const { root } = await fixture(t);
  for (const row of validationHosts) {
    const result = JSON.parse((await command(root, 'package.mjs', ['--host-version', row.version])).stdout);
    const manifest = JSON.parse((await run('tar', ['-xOf', result.tarball, 'package/package.json'])).stdout);
    assert.equal(manifest.version, alignedVersion(row.version, 'omaa', '0.13.1'));
    assert.deepEqual(manifest.files, ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'NOTICE', 'LICENSING.md']);
    assert.equal(manifest.devDependencies['@deepseek-ai/dsh'], row.version);
    assert.equal(manifest.devDependencies['@deepseek-ai/cordis-plugin-loader'], row.loaderVersion);
    assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-llm'], HOST_RANGE);
    assert.equal(manifest.peerDependencies['@deepseek-ai/cordis-plugin-loader'], LOADER_RANGE);
    assert(!(await run('tar', ['-tf', result.tarball])).stdout.includes('AGENTS.md'));
    assert.equal(result.sha256, sha(await readFile(result.tarball)));
    assert.deepEqual(await readdir(join(root, '.cache')), [], 'successful packaging must clean its staging directory');
  }
});

test('in-range nonrepresentative host requires an observed CLI and aligns stable versions', async t => {
  const { root } = await fixture(t);
  await assert.rejects(command(root, 'package.mjs', ['--host-version', '0.2.0']), /supply --host-cli/);
  const cli = await hostCli(root, '0.2.0', '1.0.5');
  const result = JSON.parse((await command(root, 'package.mjs', ['--host-version', '0.2.0', '--host-cli', cli])).stdout);
  assert.equal(result.version, '0.2.0-omaa.0.13.1'); assert.equal(result.loaderVersion, '1.0.5');
  await hostCli(root, '0.2.0', '1.0.5', '0.2.0-rc.2');
  await assert.rejects(command(root, 'package.mjs', ['--host-version', '0.2.0', '--host-cli', cli]), /--version does not match/);
  await hostCli(root, '0.2.0', '1.0.7');
  await assert.rejects(command(root, 'package.mjs', ['--host-version', '0.2.0', '--host-cli', cli]), /loader is outside/);
  await assert.rejects(command(root, 'package.mjs', ['--host-version', '0.2.1']), /Unsupported host version/);
});

test('release preparation follows dynamic representatives and rejects altered source evidence', async t => {
  const { root, assets } = await releaseFixture(t);
  const result = JSON.parse((await command(root, 'release-assets.mjs', ['--omd-version', '0.8.1'])).stdout);
  assert.equal(result.packages.length, 6); assert.equal(result.attachmentCount, 18);
  const omd = assets.find(row => row.name === 'trisoul_x'), path = join(root, 'dist', omd.filename + '.metadata.json');
  await save(path, { ...omd, sourceCommit: '3'.repeat(40) });
  await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.8.1', '--out', 'dist/invalid']), /Metadata sourceCommit mismatch/);
});

test('release verification reads tagged dynamic policy and accepts stable host prefix', async t => {
  const { root, source } = await releaseFixture(t);
  const { tag, env } = await mockRelease(root, source);
  // The worktree policy is changed after tagging. Verification must use the tag.
  await save(join(root, 'src/host/compatibility.json'), { hostRange: HOST_RANGE, loaderRange: LOADER_RANGE, validationHosts });
  const result = await command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env);
  assert.match(result.stdout, /18 attachments, 6 identical tarballs/);
  const metadataPath = join(root, 'dist', (await readdir(join(root, 'dist'))).find(name => name.startsWith('trisoul_x-') && name.endsWith('.metadata.json')));
  const metadata = await json(metadataPath); await save(metadataPath, { ...metadata, patchSha256: '4'.repeat(64) });
  await assert.rejects(command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env), /OMD patchSha256 differs/);
});

test('old release verification derives representatives from that tag instead of current policy', async t => {
  const { root, source } = await releaseFixture(t, { taggedPolicy: false });
  const { tag, env } = await mockRelease(root, source);
  await save(join(root, 'src/host/compatibility.json'), { hostRange: HOST_RANGE, loaderRange: LOADER_RANGE, validationHosts });
  const result = await command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env);
  assert.match(result.stdout, /18 attachments, 6 identical tarballs/);
});


test('OMD overlay still requires its reviewed native host baseline', async t => {
  const { root } = await fixture(t), row = validationHosts[0];
  await assert.rejects(command(root, 'package-omd-compat.mjs', ['--base', root, '--host-version', '0.2.0']), /review and register a new baseline/);
  const rules = await json(join(repo, 'compat/omd', row.omdVariant + '.json'));
  await save(join(root, 'compat/omd', row.omdVariant + '.json'), rules);
  const base = join(root, 'wrong-official-baseline');
  await save(join(base, 'package.json'), { name: 'trisoul_x', version: rules.baseVersion, devDependencies: { '@deepseek-ai/dsh': row.version } });
  await assert.rejects(command(root, 'package-omd-compat.mjs', ['--base', base, '--host-version', row.version, '--omd-version', splitReleaseVersion(rules.baseVersion, 'omd').feature.join('.')]), /package.json differs from the fixed official manifest/);
  await save(join(root, 'compat/omd', row.omdVariant + '.json'), { ...rules, hostVersion: '0.2.0' });
  await assert.rejects(command(root, 'package-omd-compat.mjs', ['--base', base, '--host-version', row.version]), /baseline host differs/);
});


test('package staging is removed after copy and npm failures', async t => {
  const { root } = await fixture(t);
  await rm(join(root, 'README.md'));
  await assert.rejects(command(root, 'package.mjs'), /ENOENT/);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
  await writeFile(join(root, 'README.md'), 'restored fixture');
  const npmRoot = join(root, 'failing-npm');
  await save(join(npmRoot, 'package.json'), { name: 'npm' });
  await mkdir(join(npmRoot, 'bin')); const cli = join(npmRoot, 'bin/npm-cli.js');
  await writeFile(cli, "throw new Error('fixture npm failed');\n");
  await assert.rejects(command(root, 'package.mjs', [], { ...process.env, npm_execpath: cli }), /fixture npm failed/);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
});


async function refreshRemote(root) {
  const path = join(root, 'remote-fixture.json'), remote = await json(path);
  for (const asset of remote.entries) { const bytes = await readFile(join(root, 'dist', asset.name)); asset.size = bytes.length; asset.digest = 'sha256:' + sha(bytes); }
  await save(path, remote);
}

test('rehashing an altered OMAA manifest cannot disguise SDK, loader or entry drift', async t => {
  const { root, source, assets } = await releaseFixture(t), metadata = assets.find(row => row.name === source.name && row.hostVersion === validationHosts[0].version);
  const { tag, env } = await mockRelease(root, source);
  const manifest = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/package.json'])).stdout);
  const mutations = [
    ['SDK', value => { value.devDependencies['@deepseek-ai/dsh-storage-domain'] = validationHosts.at(-1).version; }],
    ['loader', value => { value.devDependencies['@deepseek-ai/cordis-plugin-loader'] = validationHosts.at(-1).loaderVersion; }],
    ['peer', value => { value.peerDependencies['@deepseek-ai/dsh-system-prompt'] = validationHosts.at(-1).version; }],
    ['main', value => { value.main = 'lib/fake.js'; }],
    ['exports', value => { value.exports['.'] = './lib/fake.js'; }],
    ['bundle', value => { value.dsh.bundle.patch = ['./fake.patch.yml']; }],
  ];
  for (const [name, mutate] of mutations) {
    const altered = structuredClone(manifest); mutate(altered);
    await archive(root, metadata, altered); await refreshRemote(root);
    await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.8.1']), /complete source\/host contract/, name + ' preparation');
    await assert.rejects(command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env), /complete tagged source\/host contract/, name + ' verification');
  }
});

test('rehashing an OMD archive cannot conceal an altered embedded compatibility record', async t => {
  const { root, source, assets } = await releaseFixture(t), metadata = assets.find(row => row.name === 'trisoul_x');
  const { tag, env } = await mockRelease(root, source), tarball = join(root, 'dist', metadata.filename);
  const manifest = JSON.parse((await run('tar', ['-xOf', tarball, 'package/package.json'])).stdout);
  const compatibility = JSON.parse((await run('tar', ['-xOf', tarball, 'package/omaa-compat.json'])).stdout);
  await archive(root, metadata, manifest, { ...compatibility, nativeHostFactories: 'replaced' }); await refreshRemote(root);
  await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.8.1']), /Archive OMD compatibility differs/);
  await assert.rejects(command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env), /Archive OMD compatibility differs/);
});


test('rehashing OMD manifest drift cannot bypass the reviewed original manifest hash', async t => {
  const { root, source, assets } = await releaseFixture(t), metadata = assets.find(row => row.name === 'trisoul_x' && row.hostVersion === validationHosts[0].version);
  const { tag, env } = await mockRelease(root, source);
  const manifest = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/package.json'])).stdout);
  const mutations = [
    ['SDK', value => { value.devDependencies['@deepseek-ai/dsh-storage-domain'] = validationHosts.at(-1).version; }],
    ['loader', value => { value.devDependencies['@deepseek-ai/cordis-plugin-loader'] = validationHosts.at(-1).loaderVersion; }],
    ['peer', value => { value.peerDependencies['@deepseek-ai/dsh-storage-domain'] = validationHosts.at(-1).version; }],
    ['main', value => { value.main = 'lib/fake.js'; }],
    ['exports', value => { delete value.exports; }],
    ['bundle', value => { value.dsh.bundle.patch = ['./fake.patch.yml']; }],
  ];
  for (const [name, mutate] of mutations) {
    const altered = structuredClone(manifest); mutate(altered);
    await archive(root, metadata, altered); await refreshRemote(root);
    await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.8.1']), /complete reviewed baseline contract/, name + ' preparation');
    await assert.rejects(command(root, 'verify-release.mjs', ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')], env), /complete reviewed tagged baseline contract/, name + ' verification');
  }
});


test('historical six-file release verifies its own whitelist and still rejects rehashed drift', async t => {
  const { root, source, assets } = await releaseFixture(t, { taggedPolicy: false, stableSource: false, legacyFiles: true });
  const { tag, env } = await mockRelease(root, source);
  await save(join(root, 'src/host/compatibility.json'), { hostRange: HOST_RANGE, loaderRange: LOADER_RANGE, validationHosts });
  const args = ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')];
  assert.equal(tag, 'v0.2.1-alpha.1.omaa.0.12.1');
  assert.match((await command(root, 'verify-release.mjs', args, env)).stdout, /12 attachments, 4 identical tarballs/);
  const metadata = assets.find(row => row.name === source.name && row.hostVersion === validationHosts[0].version);
  const manifest = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/package.json'])).stdout);
  assert.deepEqual(manifest.files, ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md']);
  const mutations = [
    ['removed whitelist entry', value => { value.files.pop(); }],
    ['added modern license whitelist', value => { value.files.push('LICENSE', 'NOTICE', 'LICENSING.md'); }],
    ['main', value => { value.main = 'lib/fake.js'; }],
    ['peers', value => { value.peerDependencies['@deepseek-ai/dsh-system-prompt'] = validationHosts.at(-1).version; }],
  ];
  for (const [name, mutate] of mutations) {
    const altered = structuredClone(manifest); mutate(altered);
    await archive(root, metadata, altered); await refreshRemote(root);
    await assert.rejects(command(root, 'verify-release.mjs', args, env), /complete tagged source\/host contract/, name);
  }
});


test('explicit historical whitelists reject malformed or unsafe file arrays', async () => {
  const source = await json(join(repo, 'package.json')), row = validationHosts[0];
  for (const files of [null, 'src', [], ['src', 'src'], ['../src'], ['/src'], ['src/../outside'], ['src\\outside'], [1], ['LICENSE\nNOTICE']]) {
    assert.throws(() => hostManifest(source, row.version, row.loaderVersion, { files }), /Invalid release file allowlist/);
  }
});


test('current policy cannot override the mandatory licensing whitelist', async t => {
  const { root, source, assets } = await releaseFixture(t);
  const policyPath = join(root, 'src/host/compatibility.json'), policy = await json(policyPath);
  await save(policyPath, { ...policy, files: ['src', 'lib', 'docs', 'README.md', 'cordis.patch.yml', 'THIRD_PARTY_NOTICES.md'] });
  const { tag, env } = await mockRelease(root, source);
  const args = ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')];
  assert.match((await command(root, 'verify-release.mjs', args, env)).stdout, /18 attachments, 6 identical tarballs/);
  const metadata = assets.find(row => row.name === source.name);
  const manifest = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/package.json'])).stdout);
  manifest.files = manifest.files.filter(file => !['LICENSE', 'NOTICE', 'LICENSING.md'].includes(file));
  await archive(root, metadata, manifest); await refreshRemote(root);
  await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.8.1']), /complete source\/host contract/);
  await assert.rejects(command(root, 'verify-release.mjs', args, env), /complete tagged source\/host contract/);
});


async function integratedPackFixture(t, omdVersion = '0.9.0') {
  const { root } = await fixture(t), row = validationHosts[0], base = join(root, 'official-integrated');
  const files = {
    'src/index.mjs': 'export const integratedBridge = true;\n',
    'src/ultracode.mjs': 'export const retainedUltracode = true;\n',
    'src/codegraph-agent.mjs': 'export const retainedCodegraph = true;\n',
    'src/client/index.jsx': 'UNBUILDABLE_JXS_PROVES_NO_REBUILD\n',
    'lib/client.js': 'OFFICIAL_CLIENT_BYTES_RETAINED\n',
    'lib/host/factory.mjs': 'export const nativeHost = "' + row.version + '";\n',
    'vendor/native-snapshot.txt': 'OFFICIAL_VENDOR_BYTES_RETAINED\n',
    'scripts/pack-skin.mjs': 'throw Error("integrated mode must not rebuild skins");\n',
    'release-manifest.json': JSON.stringify({ releases: [{ version: alignedVersion(row.version, 'omd', omdVersion), notes: ['official integrated release note'] }] }) + '\n',
    'LICENSE': 'OFFICIAL_LICENSE_BYTES_RETAINED\n',
  };
  const manifest = { name: 'trisoul_x', version: alignedVersion(row.version, 'omd', omdVersion), private: true, type: 'module', main: 'src/index.mjs', files: ['src', 'lib', 'vendor', 'scripts', 'release-manifest.json', 'LICENSE'], devDependencies: { '@deepseek-ai/dsh': row.version, esbuild: (await json(join(repo, 'node_modules/esbuild/package.json'))).version } };
  await save(join(base, 'package.json'), manifest);
  for (const [file, bytes] of Object.entries(files)) { await mkdir(dirname(join(base, file)), { recursive: true }); await writeFile(join(base, file), bytes); }
  const rules = { schema: 1, mode: 'integrated-baseline', hostVersion: row.version, baseVersion: manifest.version, basePackageSha256: sha(await readFile(join(base, 'package.json'))), sourceTag: 'v' + manifest.version, sourceCommit: '1'.repeat(40), patch: null, patchSha256: emptyPatchSha256, additions: {}, patchedFiles: {}, packageFiles: [...manifest.files], files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, sha(Buffer.from(bytes))])) };
  await save(join(root, 'compat/omd', row.omdVariant + '.json'), rules);
  return { root, row, base, rules, files };
}

test('integrated official-shaped baseline packs without patching or rebuilding and retains every byte', async t => {
  const { root, row, base, rules, files } = await integratedPackFixture(t);
  const args = ['--base', base, '--host-version', row.version, '--omd-version', '0.9.0'];
  const result = JSON.parse((await command(root, 'package-omd-compat.mjs', args)).stdout);
  assert.equal(result.version, alignedVersion(row.version, 'omd', '0.9.0'));
  assert.equal(result.mode, 'integrated-baseline'); assert.equal(result.patchSha256, emptyPatchSha256);
  assert.equal(result.overlaySha256, sha(await readFile(join(root, 'compat/omd', row.omdVariant + '.json'))));
  const compatibility = JSON.parse((await run('tar', ['-xOf', result.tarball, 'package/omaa-compat.json'])).stdout);
  assert.equal(compatibility.mode, result.mode); assert.equal(compatibility.overlaySha256, result.overlaySha256);
  for (const [file, bytes] of Object.entries(files)) {
    assert.equal((await run('tar', ['-xOf', result.tarball, 'package/' + file])).stdout, bytes, file);
    assert.equal(await readFile(join(base, file), 'utf8'), bytes, 'input ' + file);
  }
  const published = join(root, 'official-published'), officialTarball = join(root, 'official-integrated.tgz');
  await mkdir(published); await cp(base, join(published, 'package'), { recursive: true });
  await run('tar', ['-czf', officialTarball, '-C', published, 'package']);
  const packedOfficial = JSON.parse((await command(root, 'package-omd-compat.mjs', ['--base', officialTarball, '--host-version', row.version, '--omd-version', '0.9.0'])).stdout);
  assert.equal(packedOfficial.version, result.version); assert.equal(packedOfficial.mode, 'integrated-baseline');
  for (const [file, bytes] of Object.entries(files)) assert.equal((await run('tar', ['-xOf', packedOfficial.tarball, 'package/' + file])).stdout, bytes, 'official tgz ' + file);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
  await assert.rejects(command(root, 'package-omd-compat.mjs', [...args.slice(0, 4), '--omd-version', '0.8.2']), /output version must equal/);
  await writeFile(join(base, 'vendor/native-snapshot.txt'), 'changed native snapshot');
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /Base release differs/);
  await writeFile(join(base, 'vendor/native-snapshot.txt'), files['vendor/native-snapshot.txt']);
  await writeFile(join(base, 'lib/client.js'), 'changed client snapshot');
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /Base release differs/);
  await writeFile(join(base, 'lib/client.js'), files['lib/client.js']);
  await writeFile(join(base, 'unreviewed-root.txt'), 'unreviewed release input');
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /Unknown files in official baseline/);
  await rm(join(base, 'unreviewed-root.txt'));
  await symlink(join(base, 'lib/client.js'), join(base, 'unknown-root-link'));
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /symlink/i);
  await rm(join(base, 'unknown-root-link'));
  const manifestBytes = await readFile(join(base, 'package.json'));
  const externalManifest = join(root, 'external-manifest.json');
  await writeFile(externalManifest, manifestBytes); await rm(join(base, 'package.json'));
  await symlink(externalManifest, join(base, 'package.json'));
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /regular|symlink/i);
  await rm(join(base, 'package.json')); await writeFile(join(base, 'package.json'), manifestBytes);
  await writeFile(join(base, 'src/unreviewed.mjs'), 'export const bypass = true;');
  await assert.rejects(command(root, 'package-omd-compat.mjs', args), /Unknown files in official baseline/);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
});

test('current OMD 0.10 default preserves its integrated official payload', async t => {
  const { root, row, base, files } = await integratedPackFixture(t, '0.10.0');
  const result = JSON.parse((await command(root, 'package-omd-compat.mjs', ['--base', base, '--host-version', row.version])).stdout);
  assert.equal(result.version, alignedVersion(row.version, 'omd', '0.10.0'));
  assert.equal(result.mode, 'integrated-baseline');
  for (const [file, bytes] of Object.entries(files)) assert.equal((await run('tar', ['-xOf', result.tarball, 'package/' + file])).stdout, bytes, file);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
});

test('integrated mode requires reviewed explicit no-op fields and a safe complete package whitelist', () => {
  const valid = { mode: 'integrated-baseline', patch: null, patchSha256: emptyPatchSha256, additions: {}, patchedFiles: {}, packageFiles: ['src', 'lib', 'vendor'] };
  assert.equal(omdBuildMode(valid), 'integrated-baseline'); assert.deepEqual(reviewedPatchBytes(valid), Buffer.alloc(0));
  for (const change of [{ mode: null }, { mode: 'unknown' }, { patch: 'apply.patch' }, { patchSha256: '1'.repeat(64) }, { additions: { 'src/new.mjs': '1'.repeat(64) } }, { additions: 1 }, { patchedFiles: null }, { patchedFiles: [] }, { packageFiles: ['../vendor'] }, { packageFiles: ['omaa-compat.json'] }]) assert.throws(() => omdBuildMode({ ...valid, ...change }));
  assert.throws(() => reviewedPatchBytes(valid, Buffer.from('not empty')), /patch hash mismatch/);
});

test('integrated paired release preparation and tagged verification bind no-op mode and provenance', async t => {
  const { root, source, assets } = await releaseFixture(t, { integrated: true });
  const prepared = JSON.parse((await command(root, 'release-assets.mjs', ['--omd-version', '0.9.0', '--out', 'paired-prepared'])).stdout);
  assert.equal(prepared.attachmentCount, 18);
  const { tag, env } = await mockRelease(root, source), args = ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')];
  assert.match((await command(root, 'verify-release.mjs', args, env)).stdout, /18 attachments, 6 identical tarballs/);
  const metadata = assets.find(row => row.name === 'trisoul_x'), metadataPath = join(root, 'dist', metadata.filename + '.metadata.json');
  await save(metadataPath, { ...metadata, mode: 'overlay' }); await refreshRemote(root);
  await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.9.0', '--out', 'dist/rejected-mode']), /Metadata mode mismatch/);
  await assert.rejects(command(root, 'verify-release.mjs', args, env), /build mode differs/);
  await save(metadataPath, metadata); await refreshRemote(root);
  const manifest = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/package.json'])).stdout);
  const compatibility = JSON.parse((await run('tar', ['-xOf', join(root, 'dist', metadata.filename), 'package/omaa-compat.json'])).stdout);
  delete compatibility.mode;
  await archive(root, metadata, manifest, compatibility); await refreshRemote(root);
  await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.9.0', '--out', 'dist/rejected-embedded-mode']), /OMD compatibility differs/);
  await assert.rejects(command(root, 'verify-release.mjs', args, env), /OMD compatibility differs/);
});

test('integrated release payload drift, missing members, unknown members and links fail after complete rehashing', async t => {
  const { root, source, assets } = await releaseFixture(t, { integrated: true });
  await command(root, 'release-assets.mjs', ['--omd-version', '0.9.0', '--out', 'payload-positive']);
  const { tag, env } = await mockRelease(root, source);
  const args = ['--repo', 'fixture/omaa', '--tag', tag, '--assets', join(root, 'dist')];
  assert.match((await command(root, 'verify-release.mjs', args, env)).stdout, /18 attachments, 6 identical tarballs/);
  const metadata = assets.find(row => row.name === 'trisoul_x');
  const staging = join(root, 'archive', metadata.filename, 'package');
  const manifest = await json(join(staging, 'package.json'));
  const client = join(staging, 'lib/client.js'), clientBytes = await readFile(client);
  const unexpected = join(staging, 'unknown-payload.txt');
  const mutations = [
    ['changed-client', () => writeFile(client, 'ALTERED_UNREVIEWED_CLIENT\n'), () => writeFile(client, clientBytes)],
    ['missing-client', () => rm(client), () => writeFile(client, clientBytes)],
    ['unknown-member', () => writeFile(unexpected, 'UNREVIEWED_PAYLOAD\n'), () => rm(unexpected)],
    ['linked-client', async () => { await rm(client); await symlink('/tmp/omaa-fixture-untrusted-link-target', client); }, async () => { await rm(client); await writeFile(client, clientBytes); }],
  ];
  for (const [label, mutate, restore] of mutations) {
    await mutate();
    const altered = await archive(root, metadata, manifest);
    assert.notEqual(altered.sha256, metadata.sha256, label + ' must alter the archive');
    // Recompute every attachment digest so source payload evidence is the only
    // rejection reason, rather than an incidental sidecar or remote mismatch.
    await refreshRemote(root);
    await assert.rejects(command(root, 'release-assets.mjs', ['--omd-version', '0.9.0', '--out', 'payload-rejected-' + label]), /[Ii]ntegrated.*(?:payload|archive|member|inventory)/, label + ' preparation');
    await assert.rejects(command(root, 'verify-release.mjs', args, env), /[Ii]ntegrated.*(?:payload|archive|member|inventory)/, label + ' verification');
    await restore();
  }
});
