import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { selectPiSkills, piIgnoreRulesChanged } from '../src/presets/pi/skill-discovery.mjs';
import { loadPiResourcePaths, selectPiPromptFiles } from '../src/presets/pi/resource-paths.mjs';

function memoryFs(contents) {
  const entries = new Map(Object.entries(contents));
  const reads = [], listings = [];
  const info = file => entries.has(file) ? { type: 'file', size: Buffer.byteLength(entries.get(file)), version: entries.get(file) }
    : [...entries.keys()].some(key => key.startsWith(file + path.sep)) ? { type: 'directory', version: 'directory' } : undefined;
  const fs = {
    async resolve(file, { signal } = {}) { signal?.throwIfAborted(); return { displayPath: file }; },
    async stat(target) { return info(target.displayPath); },
    async listDir(target) {
      const directory = target.displayPath; listings.push(directory);
      if (!info(directory)) throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      const names = [...new Set([...entries.keys()].filter(file => file.startsWith(directory + path.sep))
        .map(file => file.slice(directory.length + 1).split(path.sep)[0]))];
      return names.map(name => { const file = path.join(directory, name); return { name, type: info(file).type, target: { displayPath: file } }; });
    },
    async *streamText(target) { reads.push(target.displayPath); yield entries.get(target.displayPath); },
  };
  return { fs, entries, reads, listings };
}

test('Pi native selection applies ordered gitignore rules, directory pruning and bundle boundaries', async () => {
  const root = '/pi-fixture/project/.pi/skills';
  const f = memoryFs({
    '/pi-fixture/project/.git': '',
    [root + '/.gitignore']: 'blocked/\n!blocked/keep/SKILL.md\n*.skip.md\nroot-only.md\n*.drop.md\n**/temp-*/\n',
    [root + '/.ignore']: '!allowed.skip.md\n',
    [root + '/.fdignore']: 'allowed.skip.md\n!kept.drop.md\n',
    [root + '/kept.drop.md']: 'selected',
    [root + '/allowed.skip.md']: 'hidden by later fdignore',
    [root + '/root-only.md']: 'hidden',
    [root + '/blocked/keep/SKILL.md']: 'parent cannot be reintroduced by child negation',
    [root + '/group/.ignore']: '/drop/\n',
    [root + '/group/drop/SKILL.md']: 'hidden',
    [root + '/group/okay/SKILL.md']: 'bundle',
    [root + '/group/okay/support/nested/SKILL.md']: 'bundle supporting files must not recurse',
    [root + '/group/temp-data/SKILL.md']: 'hidden by doublestar',
    [root + '/else/drop/SKILL.md']: 'sibling unaffected by prefixed rule',
    [root + '/unbundled/.ignore']: 'SKILL.md\n',
    [root + '/unbundled/SKILL.md']: 'ignored bundle does not stop recursion',
    [root + '/unbundled/child/SKILL.md']: 'selected',
    [root + '/.hidden/SKILL.md']: 'dot hidden',
    [root + '/node_modules/dep/SKILL.md']: 'dependency hidden',
    [root + '/group/flat.md']: 'nested Pi markdown excluded',
    '/pi-fixture/project/.agents/skills/flat.md': 'root agents markdown excluded',
    '/pi-fixture/project/.agents/skills/group/flat.md': 'nested agents markdown selected',
    '/pi-fixture/project/.agents/skills/.ignore': 'group/hidden.md\n',
    '/pi-fixture/project/.agents/skills/group/hidden.md': 'hidden',
  });
  const result = await selectPiSkills(f.fs, { cwd: '/pi-fixture/project', agentDir: '/pi-fixture/agent' });
  assert.deepEqual([...result.files].sort(), [root + '/kept.drop.md', root + '/group/okay/SKILL.md', root + '/else/drop/SKILL.md',
    root + '/unbundled/child/SKILL.md', '/pi-fixture/project/.agents/skills/group/flat.md'].sort());
  assert(!f.listings.includes(root + '/blocked'));
  assert(!f.listings.includes(root + '/group/okay/support'));
  assert(!f.listings.includes(root + '/group/temp-data'));
  assert(f.reads.every(file => /\.(?:gitignore|ignore|fdignore)$/.test(file)), 'selection never reads skill bodies');
});

test('Pi rules are isolated per discovery base and native version checks detect creation, edits and deletion', async () => {
  const root = '/pi-fixture/project/.pi/skills', user = '/pi-fixture/agent/skills';
  const f = memoryFs({ '/pi-fixture/project/.git': '', [root + '/.ignore']: 'same/\n', [root + '/same/SKILL.md']: 'project hidden',
    [user + '/same/SKILL.md']: 'user remains selectable' });
  const options = { cwd: '/pi-fixture/project', agentDir: '/pi-fixture/agent' };
  let result = await selectPiSkills(f.fs, options);
  assert(result.files.has(user + '/same/SKILL.md'));
  const listings = f.listings.length, reads = f.reads.length;
  assert.equal(await piIgnoreRulesChanged(f.fs, result.ignoreObservations), false);
  assert.equal(f.listings.length, listings);
  assert.equal(f.reads.length, reads, 'unchanged refresh uses stat only');
  f.entries.set(root + '/.fdignore', '!same/\n');
  assert.equal(await piIgnoreRulesChanged(f.fs, result.ignoreObservations), true);
  result = await selectPiSkills(f.fs, options);
  assert(result.files.has(root + '/same/SKILL.md'));
  f.entries.set(root + '/.fdignore', 'same/\n');
  assert.equal(await piIgnoreRulesChanged(f.fs, result.ignoreObservations), true);
  result = await selectPiSkills(f.fs, options);
  f.entries.delete(root + '/.fdignore');
  assert.equal(await piIgnoreRulesChanged(f.fs, result.ignoreObservations), true);
  const controller = new AbortController(); controller.abort(new Error('test cancel'));
  await assert.rejects(selectPiSkills(f.fs, { ...options, signal: controller.signal }), /test cancel/);
});

test('Pi settings and existing local packages discover native resources with real manifest and filter semantics', async () => {
  const project = '/pi-fixture/project', base = project + '/.pi', pkg = base + '/local-package', agentDir = '/pi-fixture/agent';
  const f = memoryFs({
    [project + '/.git']: '',
    [base + '/settings.json']: JSON.stringify({ skills: ['custom-skills', '!custom-skills/hidden.md'], prompts: ['custom-prompts'],
      packages: [{ source: './local-package', skills: ['*', '!blocked', '+resources/skills/blocked', '-resources/skills/excluded'], prompts: ['*.md', '!blocked.md'] }, 'npm:never-install', './delta-package'] }),
    [agentDir + '/settings.json']: JSON.stringify({ packages: [pkg] }),
    [base + '/custom-skills/direct.md']: 'direct',
    [base + '/custom-skills/hidden.md']: 'hidden by settings filter',
    [base + '/custom-prompts/review.md']: 'custom prompt',
    [pkg + '/package.json']: JSON.stringify({ pi: { skills: ['resources/skills/*', '!resources/skills/excluded'], prompts: ['resources/prompts/*.md'], extensions: ['execute-never.js'] } }),
    [pkg + '/resources/skills/blocked/SKILL.md']: 'force included',
    [pkg + '/resources/skills/excluded/SKILL.md']: 'manifest excluded cannot be exposed',
    [pkg + '/resources/skills/okay/SKILL.md']: 'package skill',
    [pkg + '/resources/prompts/package.md']: 'package prompt',
    [pkg + '/resources/prompts/blocked.md']: 'filtered prompt',
    [pkg + '/resources/prompts/.hidden.md']: 'glob must not discover dot file',
    [pkg + '/execute-never.js']: 'throw new Error("do not execute");',
    [base + '/delta-package/skills/alternate/SKILL.md']: 'convention discovery',
  });
  const options = { cwd: project, agentDir };
  const paths = await loadPiResourcePaths(f.fs, options);
  const selection = await selectPiSkills(f.fs, { ...options, resourcePaths: paths });
  assert.deepEqual([...selection.files].sort(), [base + '/custom-skills/direct.md', pkg + '/resources/skills/blocked/SKILL.md',
    pkg + '/resources/skills/okay/SKILL.md', base + '/delta-package/skills/alternate/SKILL.md'].sort());
  assert.equal(selection.selectedRanks.get(base + '/custom-skills/direct.md'), 30);
  const prompts = await selectPiPromptFiles(f.fs, paths.prompts);
  assert.deepEqual(prompts, [base + '/custom-prompts/review.md', pkg + '/resources/prompts/package.md']);
  assert(paths.diagnostics.some(item => item.includes('remote Pi package')));
  assert(f.reads.every(file => !file.endsWith('.js') && !file.endsWith('SKILL.md')), 'configuration and discovery never execute extensions or read skill bodies');
  f.entries.set(base + '/settings.json', '{}');
  assert.equal(await piIgnoreRulesChanged(f.fs, selection.ignoreObservations), true, 'settings changes also invalidate the Pi catalog');
});
