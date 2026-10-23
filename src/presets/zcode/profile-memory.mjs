import { isAbsolute, join } from 'node:path';
import { buildPersistentAgentMemoryPrompt } from '../../../lib/zcode-project-memory.mjs';

const MAX_INDEX_BYTES = 256 * 1024;
const directoryAssertion = 'This directory already exists — write to it directly with the Write tool (do not run mkdir or check for its existence).';
const nativeDirectoryGuidance = 'Directory creation was not attempted. Use the native write/edit tools with their existing filesystem permissions and approvals. Missing-directory support depends on the actual filesystem backend; preserve and report its result.';

// This opt-in is separate from main-session project memory. The real launch
// descriptor persists the complete resulting literal persona, so cold resume
// never silently rereads a new MEMORY.md as the launch snapshot.
export async function prepareZCodeProfileMemory(ctx, agent, profile, signal, { check: externalCheck = () => {} } = {}) {
  const session = agent?.session, workspace = session?.header.cwd, preset = ctx.get('omaa').product(session)?.preset;
  const preferences = ctx.get('omaa').preferences(session), preferenceSnapshot = JSON.stringify(preferences);
  const selected = preferences.agentMemory;
  if (!profile.memory || !selected) return { profile, enabled: false };
  if (!['project', 'local', 'user'].includes(profile.memory)) throw Error('Unsupported profile memory scope.');
  const check = () => {
    signal.throwIfAborted(); externalCheck();
    if (ctx.get('agents')?.get(agent.id) !== agent || ctx.get('sessions')?.get(agent.id) !== session
      || ctx.get('omaa').product(session)?.id !== 'zcode' || ctx.get('omaa').product(session)?.preset !== preset
      || ctx.get('omaa').modeFor(session, agent) !== 'default' || session.header.cwd !== workspace
      || JSON.stringify(ctx.get('omaa').preferences(session)) !== preferenceSnapshot)
      throw Error('Profile memory owner, mode, workspace or explicit configuration changed.');
  };
  const read = async operation => { check(); const result = await operation(); check(); return result; };
  check();
  if (session.header.origin === 'subagent' || selected.workspacePath !== workspace)
    throw Error('Profile memory requires this main session’s explicit configuration bound to its immutable workspace.');
  const fs = agent.ctx.get('fs');
  if (!fs) throw Error('Native profile memory filesystem is unavailable.');
  const storage = await read(() => fs.resolve(selected.root, { cwd: workspace, signal }));
  if (fs.processPath(storage) !== selected.root || (await read(() => fs.stat(storage, signal)))?.type !== 'directory')
    throw Error('The explicitly selected Agent memory storage root is no longer the same existing directory.');
  const base = profile.memory === 'user' ? storage : await read(() => fs.resolve(workspace, { signal }));
  const basePath = fs.processPath(base);
  // Do not parse opaque target keys or infer a remote platform's path flavor.
  if (!isAbsolute(basePath)) throw Error('This native memory path flavor is unavailable to the original platform path builder.');
  const key = profile.name.replace(/[^a-zA-Z0-9_-]/g, '-') || 'unknown';
  const relative = (profile.memory === 'user' ? 'agent-memory/' : profile.memory === 'project'
    ? '.zcode/agent-memory/' : '.zcode/agent-memory-local/') + key;
  const expected = join(basePath, relative);
  const root = await read(() => fs.resolve(relative, { cwd: basePath, signal }));
  const rootPath = fs.processPath(root);
  if (!fs.contains(base, root) || rootPath !== expected)
    throw Error('The per-Agent memory root escapes or aliases its exact configured root.');
  const rootInfo = await read(() => fs.stat(root, signal));
  if (rootInfo && rootInfo.type !== 'directory') throw Error('The per-Agent memory root is not a directory.');
  const index = await read(() => fs.resolve('MEMORY.md', { cwd: rootPath, signal }));
  const indexPath = fs.processPath(index);
  if (!fs.contains(root, index) || indexPath !== join(rootPath, 'MEMORY.md'))
    throw Error('The per-Agent MEMORY.md aliases or escapes its exact root.');
  const verify = async () => {
    const currentStorage = await read(() => fs.resolve(selected.root, { cwd: workspace, signal }));
    const currentBase = profile.memory === 'user' ? currentStorage : await read(() => fs.resolve(workspace, { signal }));
    const currentRoot = await read(() => fs.resolve(relative, { cwd: basePath, signal }));
    const currentIndex = await read(() => fs.resolve('MEMORY.md', { cwd: rootPath, signal }));
    const currentRootInfo = await read(() => fs.stat(currentRoot, signal));
    if (fs.processPath(currentStorage) !== selected.root || (await read(() => fs.stat(currentStorage, signal)))?.type !== 'directory'
      || fs.processPath(currentBase) !== basePath || !fs.contains(currentBase, currentRoot) || fs.processPath(currentRoot) !== rootPath
      || currentRootInfo && currentRootInfo.type !== 'directory'
      || !fs.contains(currentRoot, currentIndex) || fs.processPath(currentIndex) !== indexPath)
      throw Error('The canonical per-Agent memory paths changed during their bounded read.');
  };
  let indexContent = '';
  const before = await read(() => fs.stat(index, signal));
  if (before) {
    if (before.type !== 'file' || typeof before.version !== 'string' || !Number.isSafeInteger(before.size)
      || before.size < 0 || before.size > MAX_INDEX_BYTES)
      throw Error('The per-Agent memory index has no stable regular-file version within 256 KiB.');
    const bytes = await read(() => fs.readBytes(index, signal, MAX_INDEX_BYTES));
    const after = await read(() => fs.stat(index, signal));
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== before.size || !after || after.type !== 'file'
      || after.version !== before.version || after.size !== before.size)
      throw Error('The per-Agent memory index changed during its bounded read.');
    indexContent = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  await verify();
  const current = await read(() => fs.stat(index, signal));
  if (before ? !current || current.type !== 'file' || current.version !== before.version || current.size !== before.size : current !== undefined)
    throw Error('The per-Agent memory index changed before snapshot publication.');
  const original = buildPersistentAgentMemoryPrompt({ indexContent, rootDir: rootPath, scope: profile.memory });
  if (original.split(directoryAssertion).length !== 2)
    throw Error('The fixed original memory directory guidance changed.');
  const prompt = original.replace(directoryAssertion, nativeDirectoryGuidance);
  check();
  // Upstream appends Write/Edit to an explicit profile allowlist. Its denylist
  // and the parent's real native authority remain enforced by toolFilter.
  const tools = profile.tools === undefined ? undefined : [...new Set([...profile.tools, 'Write', 'Edit'])];
  return { profile: { ...profile, systemPrompt: profile.systemPrompt + '\n\n' + prompt,
    ...(tools === undefined ? {} : { tools }) }, enabled: true, root: rootPath, scope: profile.memory };
}
