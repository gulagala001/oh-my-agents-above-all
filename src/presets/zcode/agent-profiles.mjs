import { parseAgentProfileFromMarkdown } from '../../../lib/zcode-agent-profile-parser.mjs';

const FILE_BYTES = 256 * 1024, TOTAL_BYTES = 1024 * 1024, MAX_FILES = 128;
const unsupported = ['permissionMode', 'maxTurns', 'mcpServers', 'skills'];
const fieldReason = {
  permissionMode: 'requires the original child permission-mode resolver and PermissionService; native parent authority is retained without a guessed mapping',
  maxTurns: 'the fixed original child config receives this field, but executable enforcement has not been found; no native step or turn budget is invented',
  mcpServers: 'requires the parent connected-server startup snapshot and scoped borrowed MCP port; server names are not inferred from tool names',
  skills: 'only at most 128 distinct exact native kebab-case local skills can be admitted at launch; qualified/plugin and official identities require authentic provenance, not a name heuristic',
};

// Explicit user directory, then project overrides. The selected directory is
// not a guessed ZCode storageRoot and never creates directories or authority.
export async function loadProjectAgentProfiles(ctx, agent, signal, { check: externalCheck = () => {} } = {}) {
  const session = agent?.session, workspace = session?.header.cwd;
  const preset = ctx.omaa.product(session)?.preset, mode = ctx.omaa.modeFor(session, agent);
  const preferences = ctx.omaa.preferences(session), preferenceSnapshot = JSON.stringify(preferences);
  const selected = session?.header.origin === 'subagent' ? undefined : preferences.agentProfileDirectory;
  const check = () => {
    signal.throwIfAborted(); externalCheck();
    if (!agent || ctx.get('agents')?.get(agent.id) !== agent || ctx.get('sessions')?.get(agent.id) !== session
      || ctx.omaa.product(session)?.id !== 'zcode' || ctx.omaa.product(session)?.preset !== preset
      || ctx.omaa.modeFor(session, agent) !== mode || session.header.cwd !== workspace
      || JSON.stringify(ctx.omaa.preferences(session)) !== preferenceSnapshot)
      throw Error('The profile owner, workspace, preset, preferences or mode changed.');
  };
  const read = async action => { check(); const value = await action(); check(); return value; };
  check();
  const fs = agent.ctx.get('fs');
  if (!fs) throw Error('Native project-profile filesystem is unavailable.');
  if (selected && (typeof selected.root !== 'string' || !selected.root || selected.workspacePath !== workspace))
    throw Error('The selected Agent profile directory is not bound to this immutable workspace.');
  const base = await read(() => fs.resolve(workspace, { signal }));
  const active = new Map(), diagnostics = [], verifiers = [];
  let total = 0;
  const roots = [...(selected ? [{ path: selected.root, source: 'user' }] : []), { path: '.zcode/agents', source: 'project' }];
  for (const root of roots) {
    const directory = await read(() => fs.resolve(root.path, { cwd: workspace, signal }));
    const canonical = fs.processPath(directory);
    if (root.source === 'project' ? !fs.contains(base, directory) : canonical !== selected.root)
      throw Error('The Agent profile directory escaped its canonical root or immutable project workspace.');
    const info = await read(() => fs.stat(directory, signal));
    if (!info && root.source === 'project') continue;
    if (info?.type !== 'directory') throw Error('The selected Agent profile path is not an existing directory.');
    const verifyDirectory = async () => {
      const currentBase = await read(() => fs.resolve(workspace, { signal }));
      const current = await read(() => fs.resolve(root.path, { cwd: workspace, signal }));
      if (fs.processPath(currentBase) !== fs.processPath(base) || root.source === 'project' && !fs.contains(currentBase, current)
        || fs.processPath(current) !== canonical || (await read(() => fs.stat(current, signal)))?.type !== 'directory')
        throw Error('The canonical Agent profile directory changed.');
    };
    verifiers.push(verifyDirectory);
    const entries = await read(() => fs.listDir(directory, signal));
    // Bound directory processing too, before filtering potential Markdown files.
    if (!Array.isArray(entries) || entries.length > MAX_FILES) throw Error('An Agent profile directory exceeds the 128-entry bound.');
    const files = entries.filter(entry => entry.type === 'file' && /\.(?:md|markdown)$/iu.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of files) {
      if (typeof entry.name !== 'string' || !entry.name || /[/\\\0]/u.test(entry.name)) throw Error('Invalid native profile directory entry.');
      const target = await read(() => fs.resolve(entry.name, { cwd: canonical, signal }));
      if (!fs.contains(directory, target)) throw Error('An Agent profile resolves outside its canonical directory.');
      const path = fs.processPath(target), before = await read(() => fs.stat(target, signal));
      if (!before || before.type !== 'file' || typeof before.version !== 'string'
        || !Number.isSafeInteger(before.size) || before.size < 0 || before.size > FILE_BYTES || total + before.size > TOTAL_BYTES)
        throw Error('An Agent profile has no stable bounded regular-file version (256 KiB/file, 1 MiB total).');
      const bytes = await read(() => fs.readBytes(target, signal, FILE_BYTES));
      const after = await read(() => fs.stat(target, signal));
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== before.size || !after || after.type !== 'file'
        || after.version !== before.version || after.size !== before.size) throw Error('An Agent profile changed during its bounded read.');
      const current = await read(() => fs.resolve(entry.name, { cwd: canonical, signal }));
      if (!fs.contains(directory, current) || fs.processPath(current) !== path) throw Error('An Agent profile changed its canonical target.');
      await verifyDirectory(); total += bytes.byteLength;
      const parsed = parseAgentProfileFromMarkdown({ content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), path, source: root.source });
      if (parsed.diagnostic) {
        diagnostics.push(parsed.diagnostic);
        // The original parser can return both a named profile and a warning
        // (invalid memory scope). Conservative refusal must not resurrect an
        // earlier same-name user definition beneath this project override.
        if (parsed.profile) active.delete(parsed.profile.name);
        continue;
      }
      const profile = parsed.profile;
      if (!profile) continue;
      // Default inherits parent authority; plan uses a separate native logged
      // plan-admission gate. Neither selects a new sandbox or approval mode.
      const fields = unsupported.filter(name => profile[name] !== undefined
        && !(name === 'permissionMode' && ['default', 'plan'].includes(profile.permissionMode))
        && !(name === 'skills' && Array.isArray(profile.skills) && profile.skills.length <= 128
          && new Set(profile.skills).size === profile.skills.length
          && profile.skills.every(value => typeof value === 'string' && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))));
      if (fields.length) {
        diagnostics.push({ code: 'unsupported_native_profile_fields', path, message: 'Profile ' + JSON.stringify(profile.name)
          + ' was not activated: ' + fields.map(field => field + ': ' + fieldReason[field]).join('; ') + '.' });
        // A later unsupported definition must not silently resurrect an earlier
        // same-name profile that the original sorted loader would override.
        active.delete(profile.name); continue;
      }
      active.set(profile.name, Object.freeze(profile));
    }
    await verifyDirectory();
  }
  for (const verify of verifiers) await verify();
  check();
  return { profiles: [...active.values()], diagnostics, scope: selected ? 'explicit-user-and-project' : 'project-only' };
}
