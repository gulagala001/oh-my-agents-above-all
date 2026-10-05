import path from 'node:path';
import { homedir } from 'node:os';
import { minimatch } from 'minimatch';
import { createPiIgnoreReader } from './resource-ignore.mjs';

const absent = error => ['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error?.code);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const override = value => /^[!+-]/.test(value);
const pattern = value => override(value) || /[*?]/.test(value);
const posix = value => value.split(path.sep).join('/');
const resolvePath = (root, value) => path.resolve(root, value.replace(/^~(?=$|[\\/])/, process.env.HOME || homedir()));

// Same matching dimensions and precedence as Pi's package-manager.ts. These
// resource filters are intentionally distinct from gitignore discovery rules.
export function piResourceEnabled(file, { entries, baseDir, overridesOnly = false }) {
  const name = path.basename(file), rel = posix(path.relative(baseDir, file));
  const targets = [rel, name, posix(file)];
  const exactTargets = [rel, posix(file)];
  if (name === 'SKILL.md') {
    const parent = path.dirname(file);
    targets.push(posix(path.relative(baseDir, parent)), path.basename(parent), posix(parent));
    exactTargets.push(posix(path.relative(baseDir, parent)), posix(parent));
  }
  const matches = entry => targets.some(target => minimatch(target, posix(entry)));
  const exact = entry => exactTargets.includes(posix(entry.replace(/^\.[\\/]/, '')));
  const includes = entries.filter(entry => !override(entry));
  let enabled = overridesOnly || includes.length === 0 || includes.some(matches);
  if (entries.filter(entry => entry.startsWith('!')).some(entry => matches(entry.slice(1)))) enabled = false;
  if (entries.filter(entry => entry.startsWith('+')).some(entry => exact(entry.slice(1)))) enabled = true;
  if (entries.filter(entry => entry.startsWith('-')).some(entry => exact(entry.slice(1)))) enabled = false;
  return enabled;
}

export async function loadPiResourcePaths(fs, { cwd, agentDir, signal }) {
  const result = { skills: [], prompts: [], diagnostics: [], observations: new Map(), project: {}, user: {} };
  let totalBytes = 0, globEntries = 0, globDirectories = 0;
  const json = async file => {
    try {
      signal?.throwIfAborted();
      const target = await fs.resolve(file, { signal }), stat = await fs.stat(target, signal);
      result.observations.set(file, JSON.stringify(stat ? [stat.type, stat.version] : null));
      if (!stat || stat.type !== 'file') return undefined;
      if (stat.size > 64 * 1024) throw new Error('Pi resource configuration exceeds 64 KiB: ' + file);
      const chunks = []; let bytes = 0;
      for await (const chunk of await fs.streamText(target, signal)) {
        signal?.throwIfAborted(); bytes += Buffer.byteLength(chunk); totalBytes += Buffer.byteLength(chunk);
        if (bytes > 64 * 1024 || totalBytes > 256 * 1024) throw new Error('Pi resource configuration exceeds its byte budget');
        chunks.push(chunk);
      }
      try { return JSON.parse(chunks.join('').replace(/^\uFEFF/, '')); }
      catch { result.diagnostics.push('invalid resource JSON: ' + file); return undefined; }
    } catch (error) { if (!absent(error)) throw error; result.observations.set(file, 'null'); return undefined; }
  };
  const strings = (entries, label) => {
    if (entries === undefined) return undefined;
    if (!Array.isArray(entries) || entries.length > 128 || !entries.every(entry => typeof entry === 'string' && entry.length > 0 && entry.length <= 4096)) {
      result.diagnostics.push('invalid or oversized resource list: ' + label); return [];
    }
    return entries;
  };
  const expandGlob = async (entry, root) => {
    const absolutePattern = resolvePath(root, entry), parts = absolutePattern.split(path.sep);
    const firstPattern = parts.findIndex(part => /[*?]/.test(part));
    const anchor = parts.slice(0, firstPattern).join(path.sep) || path.parse(absolutePattern).root;
    const maxDepth = parts.slice(firstPattern).includes('**') ? 12 : parts.length - firstPattern - 1;
    const matches = [];
    async function walk(directory, depth) {
      signal?.throwIfAborted();
      if (depth > 12 || ++globDirectories > 128) throw new Error('Pi resource glob exceeds its directory budget');
      let children;
      try {
        const target = await fs.resolve(directory, { signal }), stat = await fs.stat(target, signal);
        result.observations.set(directory, JSON.stringify(stat ? [stat.type, stat.version] : null));
        children = await fs.listDir(target, signal);
      } catch (error) { if (!absent(error)) throw error; result.observations.set(directory, 'null'); return; }
      globEntries += children.length;
      if (globEntries > 2048) throw new Error('Pi resource glob exceeds 2048 entries');
      for (const child of children) {
        if (child.name.startsWith('.')) continue;
        const file = path.join(directory, child.name);
        if (minimatch(posix(file), posix(absolutePattern))) matches.push(file);
        if (child.type === 'directory' && depth < maxDepth) await walk(file, depth + 1);
      }
    }
    await walk(anchor, 0);
    return matches.sort();
  };
  const addPaths = async (entries, baseDir, metadata, filters = [], allowGlobs = false) => {
    for (const entry of entries) {
      if (override(entry) || (!allowGlobs && pattern(entry))) continue;
      const paths = allowGlobs && /[*?]/.test(entry) ? await expandGlob(entry, baseDir) : [resolvePath(baseDir, entry)];
      for (const file of paths) {
        signal?.throwIfAborted();
        let stat, target;
        try { target = await fs.resolve(file, { signal }); stat = await fs.stat(target, signal); }
        catch (error) { if (!absent(error)) throw error; }
        result.observations.set(file, JSON.stringify(stat ? [stat.type, stat.version] : null));
        if (!stat || !['directory', 'file'].includes(stat.type)) continue;
        if (stat.type === 'file' && !file.endsWith('.md')) { result.diagnostics.push('native resource provider requires Markdown: ' + file); continue; }
        result[metadata.type].push({ ...metadata, path: stat.type === 'file' ? target.displayPath : file,
          mode: 'pi', exactFile: stat.type === 'file', recursive: true, filters });
        if (result.skills.length + result.prompts.length > 256) throw new Error('Pi configured resources exceed 256 paths');
      }
    }
  };
  const scopes = [...(cwd ? [{ scope: 'project', baseDir: path.join(cwd, '.pi'), rank: 30 }] : []), { scope: 'user', baseDir: agentDir, rank: 50 }];
  for (const scope of scopes) {
    const settings = await json(path.join(scope.baseDir, 'settings.json'));
    if (!object(settings)) continue;
    result[scope.scope] = { packages: settings.packages };
    for (const type of ['skills', 'prompts']) {
      const entries = strings(settings[type], scope.baseDir + '/settings.json:' + type);
      result[scope.scope][type] = entries ?? [];
      if (entries) await addPaths(entries, scope.baseDir, { type, source: scope.scope + '-settings-pi', rank: scope.rank,
        ...(scope.scope === 'project' ? { projectRoot: cwd } : {}) }, [{ entries: entries.filter(pattern), baseDir: scope.baseDir }]);
    }
  }
  const seen = new Set();
  for (const scope of scopes) {
    const declarations = result[scope.scope].packages ?? [];
    if (!Array.isArray(declarations) || declarations.length > 128) { result.diagnostics.push('invalid or oversized packages list: ' + scope.baseDir); continue; }
    for (const declaration of declarations) {
      const source = typeof declaration === 'string' ? declaration : object(declaration) ? declaration.source : undefined;
      if (typeof source !== 'string' || !source || source.length > 4096) { result.diagnostics.push('invalid local package declaration: ' + scope.baseDir); continue; }
      if (!path.isAbsolute(source) && !/^(?:\.|~)[\\/]/.test(source) && /^(?:npm:|git:|[a-z][a-z0-9+.-]*:|[^/]+\.[a-z]{2,}\/)/i.test(source)) {
        result.diagnostics.push('remote Pi package requires its original package manager; remote source skipped'); continue;
      }
      const root = resolvePath(scope.baseDir, source);
      if (seen.has(root)) continue; seen.add(root);
      if (object(declaration) && declaration.autoload === false) { result.diagnostics.push('Pi package autoload:false delta is unsupported; skipped: ' + source); continue; }
      let stat;
      try { stat = await fs.stat(await fs.resolve(root, { signal }), signal); }
      catch (error) { if (!absent(error)) throw error; }
      result.observations.set(root, JSON.stringify(stat ? [stat.type, stat.version] : null));
      if (!stat || stat.type !== 'directory') { result.diagnostics.push('Pi resource packages must be existing local directories: ' + source); continue; }
      const pkg = await json(path.join(root, 'package.json')), manifest = object(pkg?.pi) ? pkg.pi : undefined;
      for (const type of ['skills', 'prompts']) {
        const filter = object(declaration) ? strings(declaration[type], source + ':' + type) : undefined;
        if (filter?.length === 0) continue;
        const manifestEntries = strings(manifest?.[type], root + '/package.json:pi.' + type);
        const entries = manifest ? manifestEntries ?? [] : [type];
        const filters = [{ entries: entries.filter(override), baseDir: root }];
        if (filter) filters.push({ entries: filter, baseDir: root });
        await addPaths(entries, root, { type, source: 'package-pi', rank: 80,
          ...(scope.scope === 'project' ? { projectRoot: cwd } : {}) }, filters, true);
      }
    }
  }
  result.skills.sort((a, b) => a.rank - b.rank); result.prompts.sort((a, b) => a.rank - b.rank);
  return result;
}

export async function selectPiPromptFiles(fs, entries, signal) {
  const selected = [], seen = new Set(), rules = createPiIgnoreReader(fs, signal);
  let directories = 0, entriesSeen = 0;
  const add = (base, file) => {
    if (!seen.has(file) && (base.filters ?? []).every(filter => piResourceEnabled(file, filter))) { seen.add(file); selected.push(file); }
  };
  async function walk(base, directory, matcher, depth) {
    signal?.throwIfAborted();
    if (depth > 12 || ++directories > 128) throw new Error('Pi prompt discovery exceeds its directory budget');
    let children;
    try { children = await fs.listDir(await fs.resolve(directory, { signal }), signal); }
    catch (error) { if (absent(error)) return; throw error; }
    entriesSeen += children.length;
    if (children.length > 512) throw new Error('Pi prompt directory exceeds 512 entries');
    if (entriesSeen > 2048) throw new Error('Pi prompt discovery exceeds 2048 entries');
    await rules.addRules(matcher, directory, base.path);
    for (const child of children) {
      if (child.name.startsWith('.') || child.name === 'node_modules') continue;
      const file = path.join(directory, child.name), relative = posix(path.relative(base.path, file));
      if (matcher.ignores(relative + (child.type === 'directory' ? '/' : ''))) continue;
      if (child.type === 'directory' && base.recursive) await walk(base, file, matcher, depth + 1);
      else if (child.type === 'file' && child.name.endsWith('.md')) add(base, child.target.displayPath);
    }
  }
  for (const base of entries.sort((a, b) => a.rank - b.rank)) {
    if (base.exactFile) add(base, base.path);
    else await walk(base, base.path, rules.createMatcher(), 0);
  }
  return selected;
}
