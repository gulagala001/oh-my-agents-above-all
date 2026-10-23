import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function isPrivateFile(path) {
  path = path.replaceAll('\\', '/').replace(/^package\//, '');
  if (path === 'test/fixtures/configured-project/project/AGENTS.md') return false;
  return /(^|\/)(?:\.git|node_modules|\.cache|\.local|\.codegraph|work|profiles|credentials|coverage|dist|release-assets)(\/|$)/.test(path)
    || /(^|\/)(?:AGENTS|CLAUDE|AI_README|OMAA_HANDOFF|COMPUTER_USE_HANDOFF|COMPUTER_USE_BASELINE|COMPUTER_USE_ASSESSMENT|WINDOWS_HANDOFF|PROMPT_MAINTENANCE|PROMPT_CHANGES)\.md$/.test(path)
    || /^docs\/(?:plan\.md|recovery\/|verification(?:\.md|\/)|images\/.*\/source\.json$)/.test(path)
    || /^(?:baseline\.diff|WIP\.diff|checkpoint\.json|SHA256SUMS\.json|scripts\/recovery-checkpoint\.py)$/.test(path)
    || /^assets\/marketing\/.*\.source\.json$/.test(path)
    || /(^|\/)(?:codegraph\.json|\.DS_Store|\.env(?:\..*)?)$/.test(path)
    || /\.(?:log|tgz|pem|key)$/.test(path);
}
function check(paths, read) {
  for (const path of paths) {
    if (!path || path.endsWith('/')) continue;
    if (path.startsWith('/') || path.split('/').includes('..') || isPrivateFile(path)) throw new Error('Private or unsafe public file: ' + path);
    if (!read) continue;
    const bytes = read(path);
    if (bytes.length > 16 * 1024 * 1024 || bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{40,})/.test(text)) throw new Error('Credential material in: ' + path);
  }
  console.log(`Public file gate passed: ${paths.length} files`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--archive' && args.length === 2) {
    const archive = resolve(args[1]);
    const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }).trim().split('\n').filter(path => !path.endsWith('/'));
    if (paths.some(path => !path.startsWith('package/')) || new Set(paths).size !== paths.length) throw new Error('Unsafe or duplicate archive path');
    const types = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }).trim().split('\n');
    if (types.some(line => !['-', 'd'].includes(line[0]))) throw new Error('Archive links and special files are forbidden');
    check(paths, path => execFileSync('tar', ['-xOf', archive, path], { maxBuffer: 32 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } }));
  } else if (args[0] === '--package' && args.length === 1) {
    const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    check(packed[0].files.map(file => file.path), path => readFileSync(resolve(root, path)));
  } else if (!args.length || (args[0] === '--ref' && args.length === 2)) {
    const ref = args[1];
    const paths = execFileSync('git', ref ? ['ls-tree', '-r', '--name-only', '-z', ref] : ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
    check(paths, null);
    try {
      const found = execFileSync('git', ['grep', ...(ref ? [] : ['--cached']), '-I', '-l', '-E', 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{40,}', ...(ref ? [ref] : []), '--'], { cwd: root, encoding: 'utf8' });
      if (found.trim()) throw new Error('Credential material in public Git files: ' + found.trim());
    } catch (error) { if (error.status !== 1) throw error; }
  } else throw new Error('Usage: public-files.mjs [--package | --archive TGZ | --ref COMMIT]');
}
