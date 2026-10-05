import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// This is the explicit executable-file allowlist, not Pi's resource discovery.
// Merely finding a project settings/package file never authorizes its JS/TS.
export function createPiExtensionSettings(directory) {
  const file = join(directory, 'pi-extensions.json');
  const read = () => {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(data.files) || !Number.isSafeInteger(data.revision)) throw Error('Pi 扩展配置无效');
      return data;
    } catch (error) { if (error.code === 'ENOENT') return { files: [], revision: 0 }; throw error; }
  };
  return {
    read,
    write(files, revision) {
      const previous = read();
      if (previous.revision !== revision) { const e = Error('扩展配置已变化，请刷新后保存'); e.code = 'revision-conflict'; throw e; }
      if (!Array.isArray(files) || files.length > 32 || files.some(f => typeof f !== 'string' || !f.trim() || f.length > 4096 || f.includes('\0'))) throw Error('请提供最多 32 个本地 TS/JS 文件路径');
      files = files.map(f => f.trim().replace(/^~(?=\/)/, homedir()));
      if (files.some(f => !isAbsolute(f) || !/\.(?:[cm]?[jt]s)$/.test(f))) throw Error('扩展必须是本地 TS/JS 文件的绝对路径');
      const value = { files: [...new Set(files)], revision: previous.revision + 1 };
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = file + '.' + randomUUID() + '.tmp';
      try { writeFileSync(temporary, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, file); }
      finally { rmSync(temporary, { force: true }); }
      return value;
    },
  };
}
