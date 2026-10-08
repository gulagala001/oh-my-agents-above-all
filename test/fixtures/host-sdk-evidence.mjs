// Inspect the official host's own runtime routing in a separate process. Plain
// Node resolution from a profile is not DSH's native shared-package resolver.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, realpath, stat } from 'node:fs/promises';
const [cli, home, pluginName] = process.argv.slice(2);
const hostRequire = createRequire(cli);
const { createRuntimeResolution, loadProfile, PluginPackages } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-app-boot')).href);
const { Context } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')).href);
const anchor = join(dirname(dirname(cli)), 'package.json');
const profile = loadProfile('dsh', 'omaa-fixture', anchor, home);
const resolution = await createRuntimeResolution({ installAnchor: anchor, profile, home });
const ctx = new Context();
try {
  const packages = new PluginPackages(ctx, { resolution });
  const installed = await realpath(join(profile.dir, 'node_modules', pluginName));
  const manifestPath = join(installed, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  async function inspectNativePeers(owner) {
    const ownerRequire = createRequire(owner.manifestPath), peers = {};
    for (const [name, declaredPeerSpecifier] of Object.entries(owner.manifest.peerDependencies ?? {}).filter(([name]) => name.startsWith('@deepseek-ai/'))) {
      const host = packages.packageOf(name, pathToFileURL(cli).href);
      const plugin = packages.packageOf(name, pathToFileURL(owner.manifestPath).href);
      if (!host || !plugin) throw new Error('Native host routing did not resolve SDK ' + owner.name + ' -> ' + name);
      peers[name] = { hostPath: await realpath(host.manifestPath), pluginPath: await realpath(plugin.manifestPath),
        hostVersion: host.version, pluginVersion: plugin.version, declaredPeerSpecifier,
        hostModule: await realpath(createRequire(host.manifestPath).resolve(name)), pluginModule: await realpath(ownerRequire.resolve(name)),
        hostResolutionAnchor: await realpath(host.manifestPath), pluginResolutionAnchor: await realpath(owner.manifestPath),
        routingScope: resolution.entries.find(row => row.name === name)?.scope };
    }
    return peers;
  }
  const sdk = await inspectNativePeers({ name: manifest.name, manifestPath, manifest });
  const utilityDependencyChains = {};
  // Schemastery is the one approved utility exception. Preserve the actual
  // ordinary dependency chain and target; never change native host routing.
  if (pluginName === 'trisoul_x' && sdk['@deepseek-ai/schemastery']) {
    const queue = [{ item: { name: manifest.name, version: manifest.version, manifestPath, manifest }, chain: [] }], seen = new Set();
    while (queue.length) {
      const { item, chain } = queue.shift();
      if (seen.has(item.manifestPath)) continue; seen.add(item.manifestPath);
      for (const [name, specifier] of Object.entries(item.manifest.dependencies ?? {})) {
        const child = packages.packageOf(name, pathToFileURL(item.manifestPath).href);
        if (!child) continue;
        const next = [...chain, { declaringPackage: item.name, declaringVersion: item.version, declaringManifest: await realpath(item.manifestPath), field: 'dependencies', dependency: name, specifier, targetVersion: child.version, targetManifest: await realpath(child.manifestPath) }];
        if (name === '@deepseek-ai/schemastery' && await realpath(child.manifestPath) === sdk[name].pluginPath) {
          utilityDependencyChains[name] = next; queue.length = 0; break;
        }
        queue.push({ item: child, chain: next });
      }
    }
  }
  const ordinaryDeclaringPeerSdk = [];
  const declaringManifests = new Set(Object.values(utilityDependencyChains).flat().map(row => row.declaringManifest));
  for (const path of declaringManifests) {
    const declaring = JSON.parse(await readFile(path, 'utf8'));
    ordinaryDeclaringPeerSdk.push({ declaringPackage: declaring.name, declaringVersion: declaring.version,
      declaringManifest: path, peers: await inspectNativePeers({ name: declaring.name, manifestPath: path, manifest: declaring }) });
  }
  let nativeHostDetection = { available: false };
  const detectionPath = join(installed, 'src/host/compatibility.mjs');
  if (pluginName === 'oh-my-agents-above-all') {
    const exists = await stat(detectionPath).then(value => value.isFile(), error => { if (error.code === 'ENOENT') return false; throw error; });
    if (exists) {
      const { nativeHostVersion, splitReleaseVersion } = await import(pathToFileURL(detectionPath).href);
      if (typeof nativeHostVersion !== 'function') throw new Error('Installed nativeHostVersion() export is missing');
      const version = nativeHostVersion(), releaseHostPrefix = splitReleaseVersion(manifest.version).host;
      nativeHostDetection = { available: true, version, releaseHostPrefix, crossesReleaseHostPrefix: version !== releaseHostPrefix, source: detectionPath, packageVersion: manifest.version };
    }
  }
  process.stdout.write(JSON.stringify({ path: installed, manifest, sdk, nativeHostDetection, utilityDependencyChains, ordinaryDeclaringPeerSdk, profileDir: await realpath(profile.dir),
    profile: JSON.parse(await readFile(join(profile.dir, 'package.json'), 'utf8')),
    linkedRoots: resolution.linkedRoots, resolver: '@deepseek-ai/dsh-app-boot/PluginPackages' }) + '\n');
} finally { await ctx.fiber.dispose(); }
