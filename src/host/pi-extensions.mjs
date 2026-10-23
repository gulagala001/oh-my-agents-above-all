import { writeFileSync, mkdirSync, renameSync, rmSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { basename, dirname, join, isAbsolute, win32 } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Private settings admission, not a physical I/O lease or external CAS.
function readSettingsJson(file) {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let value, primary, failed = false;
  try {
    const before = fstatSync(descriptor), limit = 1024 * 1024;
    if (!before.isFile() || before.size > limit) throw Error('Pi 扩展配置须为不超过 1 MiB 的普通文件');
    const buffer = Buffer.alloc(limit + 1); let length = 0;
    while (length < buffer.length) { const received = readSync(descriptor, buffer, length, buffer.length - length, null); if (!received) break; length += received; }
    if (length > limit) throw Error('Pi 扩展配置超过 1 MiB');
    const after = fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== before.size) throw Error('Pi 扩展配置读取期间发生变化');
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
  } catch (error) { failed = true; primary = error; }
  try { closeSync(descriptor); }
  catch (cleanup) { throw new AggregateError(failed ? [primary, cleanup] : [cleanup], 'Pi 扩展配置读取或关闭失败', failed ? { cause: primary } : {}); }
  if (failed) throw primary;
  return value;
}

// Match native list presentation without resolving/activating a Session.
export function piExtensionSessionNames({ title, cwd } = {}) {
  title = typeof title === 'string' ? title.trim() : '';
  cwd = typeof cwd === 'string' ? cwd.trim() : '';
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(cwd);
  const directory = cwd && ((windows ? win32.basename(cwd) : basename(cwd)) || cwd.replace(/[\\/]+$/, '') || cwd);
  return { ...(title ? { title } : {}), ...(cwd ? { cwd } : {}), displayTitle: title || directory || '未命名 Pi 会话' };
}

// This is the explicit executable-file allowlist, not Pi's resource discovery.
// Merely finding a project settings/package file never authorizes its JS/TS.
export function createPiExtensionSettings(directory) {
  const file = join(directory, 'pi-extensions.json');
  const read = () => {
    try {
      const data = readSettingsJson(file);
      if (!data || !Array.isArray(data.files) || data.files.length > 32
        || data.files.some(f => typeof f !== 'string' || !f.trim() || f.length > 4096 || f.includes('\0') || !isAbsolute(f) || !/\.(?:[cm]?[jt]s)$/.test(f))
        || !Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('Pi 扩展配置无效');
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
      if (files.some(f => f.length > 4096 || !isAbsolute(f) || !/\.(?:[cm]?[jt]s)$/.test(f))) throw Error('扩展必须是本地 TS/JS 文件的绝对路径');
      if (previous.revision === Number.MAX_SAFE_INTEGER) throw Error('Pi 扩展配置修订号已达上限');
      const value = { files: [...new Set(files)], revision: previous.revision + 1 };
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = file + '.' + randomUUID() + '.tmp';
      let owned = false, descriptor, primary, failed = false; const failures = [];
      try {
        descriptor = openSync(temporary, 'wx', 0o600); owned = true;
        writeFileSync(descriptor, JSON.stringify(value) + '\n');
        const closing = descriptor; descriptor = undefined; closeSync(closing);
        renameSync(temporary, file); owned = false;
      } catch (error) { failed = true; primary = error; }
      finally {
        if (descriptor !== undefined) try { closeSync(descriptor); } catch (error) { failures.push(error); }
        if (owned) try { rmSync(temporary, { force: true }); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError([...(failed ? [primary] : []), ...failures], 'Pi 扩展配置写入或清理失败', failed ? { cause: primary } : {});
      if (failed) throw primary;
      return value;
    },
  };
}
