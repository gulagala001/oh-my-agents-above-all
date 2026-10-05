import path from 'node:path';
import { homedir } from 'node:os';
import { createPiIgnoreReader } from './resource-ignore.mjs';
import { piResourceEnabled } from './resource-paths.mjs';
export { piIgnoreRulesChanged, prefixIgnorePattern } from './resource-ignore.mjs';

const absent = error => ['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error?.code);
const toPosixPath = value => value.split(path.sep).join('/');
export async function selectPiSkills(fs, { cwd, agentDir, signal, resourcePaths }) {
  const bases = [], roots = [], files = new Set(), selectedRanks = new Map();
  const ruleReader = createPiIgnoreReader(fs, signal);
  const userAgents = path.join(process.env.HOME || homedir(), '.agents', 'skills');
  if (cwd) {
    bases.push({ path: path.join(cwd, '.pi', 'skills'), mode: 'pi', source: 'project-pi', rank: 40, projectRoot: cwd,
      filters: resourcePaths?.project?.skills ? [{ entries: resourcePaths.project.skills, baseDir: path.join(cwd, '.pi'), overridesOnly: true }] : [] });
    let directory = path.resolve(cwd);
    for (let depth = 0; depth < 64; depth++) {
      signal?.throwIfAborted();
      const agents = path.join(directory, '.agents', 'skills');
      if (path.resolve(agents) !== path.resolve(userAgents)) bases.push({ path: agents, mode: 'agents', source: 'project-agents-pi', rank: 41, projectRoot: cwd,
        filters: resourcePaths?.project?.skills ? [{ entries: resourcePaths.project.skills, baseDir: path.dirname(agents), overridesOnly: true }] : [] });
      try { if (await fs.stat(await fs.resolve(path.join(directory, '.git'), { signal }), signal)) break; }
      catch (error) { if (!absent(error)) throw error; }
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
  }
  bases.push({ path: path.join(agentDir, 'skills'), mode: 'pi', source: 'user-pi', rank: 60,
    filters: resourcePaths?.user?.skills ? [{ entries: resourcePaths.user.skills, baseDir: agentDir, overridesOnly: true }] : [] },
  { path: userAgents, mode: 'agents', source: 'user-agents-pi', rank: 61,
    filters: resourcePaths?.user?.skills ? [{ entries: resourcePaths.user.skills, baseDir: path.dirname(userAgents), overridesOnly: true }] : [] });
  bases.push(...(resourcePaths?.skills ?? [])); bases.sort((a, b) => a.rank - b.rank);
  let entriesSeen = 0;
  const addFile = (base, file) => {
    if ((base.filters ?? []).every(filter => piResourceEnabled(file, filter))) {
      files.add(file); selectedRanks.set(file, Math.min(base.rank, selectedRanks.get(file) ?? Infinity));
    }
  };
  async function walk(base, directory, matcher, depth = 0) {
    signal?.throwIfAborted();
    if (depth > 12 || roots.length >= 128) throw new Error('Pi skill directory selection exceeds its depth/root budget');
    let entries;
    try { entries = await fs.listDir(await fs.resolve(directory, { signal }), signal); }
    catch (error) { if (absent(error)) return; throw error; }
    entriesSeen += entries.length;
    if (entriesSeen > 2048) throw new Error('Pi skill directory selection exceeds 2048 entries');
    roots.push({ ...base, path: directory });
    await ruleReader.addRules(matcher, directory, base.path);
    const ignored = entry => {
      const relative = toPosixPath(path.relative(base.path, path.join(directory, entry.name)));
      return matcher.ignores(relative + (entry.type === 'directory' ? '/' : ''));
    };
    const bundle = entries.find(entry => entry.type === 'file' && entry.name === 'SKILL.md' && !ignored(entry));
    if (bundle) { addFile(base, bundle.target.displayPath); return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || ignored(entry)) continue;
      if (entry.type === 'directory') await walk(base, path.join(directory, entry.name), matcher, depth + 1);
      else if (entry.type === 'file' && entry.name.endsWith('.md') && (base.mode === 'pi' ? depth === 0 : depth !== 0)) addFile(base, entry.target.displayPath);
    }
  }
  for (const base of bases) {
    if (base.exactFile) {
      if (roots.length >= 128) throw new Error('Pi skill directory selection exceeds its root budget');
      roots.push({ ...base, path: path.dirname(base.path) }); addFile(base, base.path);
    }
    else await walk(base, base.path, ruleReader.createMatcher());
  }
  return { roots, files, selectedRanks, ignoreObservations: new Map([...ruleReader.observations, ...(resourcePaths?.observations ?? [])]) };
}
