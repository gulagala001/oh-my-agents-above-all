import { access, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

// Fixed editor identities and their documented --goto argv contract. Nothing
// from the HTTP request is evaluated as a command, option or executable path.
const editors = [
  { id: 'cursor', name: 'Cursor', command: 'cursor', bundle: 'Cursor.app', windows: ['Programs/cursor/Cursor.exe'] },
  { id: 'vscode', name: 'Visual Studio Code', command: 'code', bundle: 'Visual Studio Code.app', windows: ['Programs/Microsoft VS Code/Code.exe', 'Microsoft VS Code/Code.exe'] },
  { id: 'vscodeinsiders', name: 'Visual Studio Code Insiders', command: 'code-insiders', bundle: 'Visual Studio Code - Insiders.app', windows: ['Programs/Microsoft VS Code Insiders/Code - Insiders.exe'] },
];
const inside = (root, file) => { const rel = relative(root, file); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
const unavailable = () => Error('未找到支持行定位的本机编辑器。请安装 Cursor 或 Visual Studio Code，并启用其命令行入口后刷新审阅。');

export function reviewLineAnchor(diff, side, line) {
  if (diff?.kind !== 'text') throw Error('此文件没有可定位的文本行。');
  for (const hunk of diff.hunks) {
    const first = side === 'old' ? hunk.oldStart : hunk.newStart;
    const lines = hunk.lines.filter(row => row[0] === ' ' || row[0] === (side === 'old' ? '-' : '+')).map(row => row.slice(1).replace(/\r$/, ''));
    const at = line - first;
    if (at >= 0 && at < lines.length) {
      const start = Math.max(0, at - 3);
      return { lines: lines.slice(start, at + 4), offset: at - start };
    }
  }
  throw Error('所选行已不在比较中，请刷新审阅。');
}
export function locateReviewLine(text, anchor) {
  const current = text.split(/\r?\n/);
  if (text.endsWith('\n')) current.pop();
  // Require the recorded surrounding block to occur exactly once. Deleted,
  // replaced or ambiguous old lines never silently become a different line.
  let match;
  for (let at = 0; at <= current.length - anchor.lines.length; ++at) {
    if (!anchor.lines.every((line, offset) => current[at + offset] === line)) continue;
    if (match !== undefined) throw Error('该行在当前文件中存在多个匹配位置，请刷新比较后重新选择。');
    match = at + anchor.offset + 1;
  }
  if (match === undefined) throw Error('原行或周围内容已变化／删除，无法准确定位；请刷新当前文件比较。');
  return match;
}
async function launch(command, args, signal) {
  signal.throwIfAborted();
  // GUI applications may keep the launcher alive. Observe early failures,
  // then detach without killing the editor or holding the host connection.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
    let timer, settled = false;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      child.unref(); error ? reject(error) : resolve();
    };
    const abort = () => { child.kill(); finish(signal.reason ?? Error('编辑器请求已取消。')); };
    child.on('error', finish);
    child.on('exit', (code, killed) => finish(code === 0 ? undefined : Error('编辑器启动失败：' + (killed || code))));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(), 1500);
    if (signal.aborted) abort();
  });
}
export function createCursorEditor({ verifyPath, platform = process.platform, env = process.env, home = homedir(), run = launch } = {}) {
  async function discover() {
    if (env.SSH_CONNECTION || env.SSH_TTY || platform === 'linux' && (!env.DISPLAY && !env.WAYLAND_DISPLAY || env.WSL_DISTRO_NAME || env.WSL_INTEROP)) return [];
    const found = [];
    for (const editor of editors) {
      const candidates = platform === 'darwin' ? ['/Applications', join(home, 'Applications')].map(root => join(root, editor.bundle, 'Contents/Resources/app/bin', editor.command))
        : platform === 'win32' ? [env.LOCALAPPDATA, env.ProgramFiles].filter(Boolean).flatMap(root => editor.windows.map(file => join(root, file))) : [];
      if (platform !== 'win32') candidates.push(...(env.PATH ?? '').split(delimiter).filter(part => isAbsolute(part)).map(part => join(part, editor.command)));
      for (const file of candidates) {
        try {
          await access(file, platform === 'win32' ? constants.F_OK : constants.X_OK);
          if (!(await stat(file)).isFile()) continue;
          found.push({ ...editor, executable: await realpath(file) }); break;
        } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error; }
      }
    }
    return found;
  }
  async function current(root, file, signal) {
    if (typeof file !== 'string' || !file || file.includes('\0') || file.includes('\\') || isAbsolute(file) || file.split('/').some(part => part === '..' || part === '.git')) throw Error('文件必须位于当前审阅工作目录内。');
    const base = await realpath(root), target = resolve(base, file);
    if (!inside(base, target)) throw Error('文件超出当前审阅工作目录。');
    let path = base;
    for (const part of relative(base, target).split(sep)) {
      path = join(path, part);
      const info = await lstat(path);
      if (info.isSymbolicLink() || (path === target ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) throw Error('编辑器定位不支持符号链接、硬链接或非普通文件。');
    }
    if (typeof verifyPath !== 'function') throw Error('宿主文件权限尚未就绪。');
    await verifyPath(target, signal);
    if ((await stat(target)).size > 2 * 1024 * 1024) throw Error('文件超过精确定位的 2 MiB 上限。');
    const bytes = await readFile(target, { signal });
    if (bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) throw Error('文件不是可定位的文本。');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { path: target, bytes, text };
  }
  return {
    async list() { return (await discover()).map(({ id, name }) => ({ id, name })); },
    async open({ root, path, editor, anchor, line }, signal) {
      const available = await discover(); signal.throwIfAborted();
      const selected = editor ? available.find(item => item.id === editor) : available[0];
      if (!selected) throw unavailable();
      // Never resolve an editor from the workspace, even if PATH includes it.
      if (inside(await realpath(root), selected.executable)) throw Error('不能从当前工作目录启动编辑器程序。');
      const before = await current(root, path, signal);
      const actualLine = anchor ? locateReviewLine(before.text, anchor) : 1;
      const after = await current(root, path, signal);
      if (!after.bytes.equals(before.bytes)) throw Error('文件在打开前已变化，请刷新后重试。');
      signal.throwIfAborted();
      await run(selected.executable, ['--goto', `${after.path}:${actualLine}:1`], signal);
      return { requested: true, editor: selected.name, path: after.path, line: actualLine, column: 1, remapped: line !== undefined && line !== actualLine };
    },
  };
}
