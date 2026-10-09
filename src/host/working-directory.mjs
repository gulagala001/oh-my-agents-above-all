import { realpath } from 'node:fs/promises';

// Execution locations follow the native directory projection. Project identity
// and sandbox policy roots continue to use the immutable session header.
export const currentDirectory = (ctx, session) => ctx.get('workingDirectory')?.get(session) ?? session.header.cwd;
export const ensureDirectory = (ctx, agent, signal) => ctx.get('workingDirectory')?.ensure(agent, signal) ?? Promise.resolve(agent.session.header.cwd);

export async function executionDirectories(ctx, agent, signal, workspaceRoot = agent.session.header.cwd) {
  const cwd = await ensureDirectory(ctx, agent, signal);
  signal?.throwIfAborted();
  const fs = ctx.get('fs');
  const localCwd = typeof cwd === 'string' && fs?.processPathFromHostPath?.(cwd);
  const localRoot = typeof workspaceRoot === 'string' && fs?.processPathFromHostPath?.(workspaceRoot);
  if (!localCwd || !localRoot) return { cwd, workspaceRoot };
  // Canonicalize both sides for aliases such as /var and /private/var. These
  // execution values do not change the session header or delegated policy.
  const [directory, root] = await Promise.all([realpath(localCwd), realpath(localRoot)]);
  signal?.throwIfAborted();
  return { cwd: directory, workspaceRoot: root };
}
