import path from 'node:path';
import ignore from 'ignore';

const absent = error => ['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error?.code);
const ignoreFileNames = ['.gitignore', '.ignore', '.fdignore'];
const toPosixPath = value => value.split(path.sep).join('/');

// Exact Pi cd32f77 rule prefixing; ignore owns pattern parsing and matching.
export function prefixIgnorePattern(line, prefix) {
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('\\#'))) return null;
  let pattern = line, negated = false;
  if (pattern.startsWith('!')) { negated = true; pattern = pattern.slice(1); }
  else if (pattern.startsWith('\\!')) pattern = pattern.slice(1);
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  const prefixed = prefix ? prefix + pattern : pattern;
  return negated ? '!' + prefixed : prefixed;
}

export async function piIgnoreRulesChanged(fs, observations, signal) {
  for (const [file, expected] of observations) {
    signal?.throwIfAborted();
    let stat;
    try { stat = await fs.stat(await fs.resolve(file, { signal }), signal); }
    catch (error) { if (!absent(error)) throw error; }
    if (JSON.stringify(stat ? [stat.type, stat.version] : null) !== expected) return true;
  }
  return false;
}

export function createPiIgnoreReader(fs, signal) {
  const observations = new Map(); let totalBytes = 0;
  return { observations, createMatcher: () => ignore(),
    async addRules(matcher, directory, root) {
      const relative = path.relative(root, directory), prefix = relative ? toPosixPath(relative) + '/' : '';
      for (const name of ignoreFileNames) {
        signal?.throwIfAborted();
        const file = path.join(directory, name);
        try {
          const target = await fs.resolve(file, { signal }), stat = await fs.stat(target, signal);
          observations.set(file, JSON.stringify(stat ? [stat.type, stat.version] : null));
          if (!stat || stat.type !== 'file') continue;
          if (stat.size > 64 * 1024) throw new Error('Pi ignore file exceeds 64 KiB: ' + target.displayPath);
          const chunks = []; let fileBytes = 0;
          for await (const chunk of await fs.streamText(target, signal)) {
            signal?.throwIfAborted();
            const bytes = Buffer.byteLength(chunk); fileBytes += bytes; totalBytes += bytes;
            if (fileBytes > 64 * 1024 || totalBytes > 256 * 1024) throw new Error('Pi ignore rules exceed their byte budget');
            chunks.push(chunk);
          }
          const patterns = chunks.join('').split(/\r?\n/).map(line => prefixIgnorePattern(line, prefix)).filter(Boolean);
          if (patterns.length) matcher.add(patterns);
        } catch (error) { if (!absent(error)) throw error; observations.set(file, 'null'); }
      }
    },
  };
}
