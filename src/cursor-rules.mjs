import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml';

export const name = 'omaa-cursor-rules';
export const inject = ['tools', 'systemPrompt', 'agents'];
const limits = { entries: 512, files: 128, depth: 12, fileBytes: 32 * 1024, totalBytes: 256 * 1024, contextBytes: 64 * 1024, paths: 256 };
const within = (root, target) => { const rel = path.relative(root, target); return rel === '' || !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); };
const failure = message => new Error('Cursor rules: ' + message);

async function safeFile(root, file) {
  if (!within(root, file)) throw failure('path escapes workspace');
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw failure('symbolic links are not read: ' + path.relative(root, current));
  }
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink > 1) throw failure('rule must be a regular, unlinked file: ' + path.relative(root, file));
    if (stat.size > limits.fileBytes) throw failure('rule exceeds file budget: ' + path.relative(root, file));
    if (!within(root, await fs.realpath(file))) throw failure('resolved path escapes workspace');
    const actual = await fs.lstat(file);
    if (actual.isSymbolicLink() || actual.ino !== stat.ino || actual.dev !== stat.dev) throw failure('rule changed while opening');
    const buffer = Buffer.alloc(limits.fileBytes + 1);
    let length = 0;
    while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead; }
    if (length > limits.fileBytes) throw failure('rule exceeds file budget: ' + path.relative(root, file));
    return buffer.subarray(0, length).toString('utf8');
  } finally { await handle.close(); }
}

function parse(text, name) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) throw failure('missing MDC frontmatter: ' + name);
  const end = text.indexOf('\n---', 3);
  if (end < 0 || !/^\n---(?:\n|$)/.test(text.slice(end))) throw failure('unclosed MDC frontmatter: ' + name);
  let header = text.slice(4, end);
  // Cursor accepts unquoted glob strings such as **/*.ts, which YAML sees as aliases.
  header = header.replace(/^globs:\s*([^\n]*)$/m, (line, value) => {
    if (!value || /^[["'|>]/.test(value) || !/[/*?{]/.test(value)) return line;
    return 'globs: ' + JSON.stringify(value.replace(/\s+#.*$/, '').trim());
  });
  let meta;
  try { meta = yamlLoad(header, { schema: JSON_SCHEMA, json: false }); }
  catch { throw failure('invalid MDC frontmatter: ' + name); }
  if (meta == null) meta = {};
  if (typeof meta !== 'object' || Array.isArray(meta)) throw failure('frontmatter must be a map: ' + name);
  if (meta.alwaysApply !== undefined && typeof meta.alwaysApply !== 'boolean') throw failure('alwaysApply must be boolean: ' + name);
  if (meta.description != null && typeof meta.description !== 'string') throw failure('description must be text: ' + name);
  const values = meta.globs == null ? [] : typeof meta.globs === 'string' ? [meta.globs] : meta.globs;
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw failure('globs must be text or text array: ' + name);
  const globs = values.flatMap(splitGlobs).filter(Boolean);
  if (globs.length > 64 || globs.some(pattern => pattern.length > 512 || pattern.includes('\0') || pattern.startsWith('/') || pattern.split('/').includes('..'))) throw failure('invalid glob scope: ' + name);
  return { name, content: text.slice(end + 4).replace(/^\n/, ''), always: meta.alwaysApply === true, description: (meta.description ?? '').trim(), globs };
}
function splitGlobs(value) {
  const output = []; let start = 0, depth = 0;
  for (let i = 0; i < value.length; i++) { if ('{['.includes(value[i])) depth++; else if ('}]'.includes(value[i])) depth--; else if (value[i] === ',' && depth === 0) { output.push(value.slice(start, i).trim()); start = i + 1; } }
  output.push(value.slice(start).trim()); return output;
}
function relativePath(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  const target = path.resolve(root, value);
  if (!within(root, target)) return null;
  const relative = path.relative(root, target).split(path.sep).join('/');
  return relative || null;
}
async function scopedPaths(root, values) {
  if (!Array.isArray(values) || values.length > limits.paths) throw failure('paths exceed selection budget');
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value || value.includes('\0')) continue;
    let target = path.resolve(root, value), resolved;
    const suffix = [];
    for (;;) {
      try { resolved = await fs.realpath(target); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; const parent = path.dirname(target); if (parent === target) break; suffix.unshift(path.basename(target)); target = parent; }
    }
    const canonical = resolved && path.join(resolved, ...suffix);
    if (canonical && within(root, canonical)) result.push(path.relative(root, canonical).split(path.sep).join('/'));
  }
  return result;
}
function resolveName(rules, requested) {
  if (typeof requested !== 'string' || !requested || requested.includes('\0') || requested.includes('\\')) throw failure('invalid requested rule name');
  let value = requested.replace(/^@/, '').replace(/^\.cursor\/rules\//, '').replace(/\.mdc$/, '');
  if (value.startsWith('/') || value.split('/').includes('..')) throw failure('invalid requested rule name');
  const exact = rules.find(rule => rule.name === value);
  if (exact) return exact.name;
  const aliases = rules.filter(rule => path.posix.basename(rule.name) === value);
  if (aliases.length !== 1) throw failure(aliases.length ? 'ambiguous rule name: ' + value : 'rule not found: ' + value);
  return aliases[0].name;
}

async function discover(cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw failure('cwd must be absolute');
  const root = await fs.realpath(cwd), rules = []; let entries = 0, bytes = 0;
  async function read(file, ruleName, legacy = false) {
    const text = await safeFile(root, file); bytes += Buffer.byteLength(text);
    if (rules.length >= limits.files || bytes > limits.totalBytes) throw failure('rule discovery exceeds budget');
    rules.push(legacy ? { name: '.cursorrules', content: text, always: true, description: '', globs: [] } : parse(text, ruleName));
  }
  async function walk(directory, depth) {
    if (depth > limits.depth) throw failure('rule directory exceeds depth budget');
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('rule directory must not be a symbolic link');
    const dir = await fs.opendir(directory);
    for await (const entry of dir) {
      if (++entries > limits.entries) throw failure('rule directory exceeds entry budget');
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw failure('symbolic link in rule directory: ' + entry.name);
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.mdc')) await read(file, path.relative(path.join(root, '.cursor', 'rules'), file).split(path.sep).join('/').slice(0, -4));
    }
  }
  const cursor = path.join(root, '.cursor');
  const optionalStat = async file => { try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const cursorStat = await optionalStat(cursor);
  if (cursorStat?.isSymbolicLink()) throw failure('.cursor must not be a symbolic link');
  const directory = path.join(cursor, 'rules');
  if (cursorStat && await optionalStat(directory)) await walk(directory, 0);
  const legacy = path.join(root, '.cursorrules');
  if (await optionalStat(legacy)) await read(legacy, '.cursorrules', true);
  rules.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { root, rules };
}
function select({ root, rules }, paths, requested) {
  if (!Array.isArray(paths) || !Array.isArray(requested)) throw failure('paths and requested must be arrays');
  if (paths.length > limits.paths || requested.length > limits.files) throw failure('selection exceeds budget');
  const files = paths.map(value => relativePath(root, value)).filter(Boolean);
  const names = new Set(requested.map(value => resolveName(rules, value))), automatic = [], available = [];
  for (const rule of rules) {
    const matched = rule.globs.some(pattern => files.some(file => path.matchesGlob(file, pattern)));
    const reason = rule.always ? 'alwaysApply' : names.has(rule.name) ? 'requested' : matched ? 'glob' : null;
    if (reason) automatic.push({ name: rule.name, content: rule.content, reason });
    else if (!rule.globs.length && rule.description) available.push({ name: rule.name, description: rule.description });
  }
  if (Buffer.byteLength(JSON.stringify({ automatic, available })) > limits.contextBytes) throw failure('selected rules exceed context budget');
  return { automatic, available };
}
const agentRequested = rule => !rule.always && !rule.globs.length && Boolean(rule.description);
export async function loadCursorRules({ cwd, paths = [], requested = [] }) {
  const catalog = await discover(cwd);
  return select(catalog, await scopedPaths(catalog.root, paths), requested);
}

export function apply(ctx) {
  const scopes = new WeakMap();
  const selections = new WeakMap();
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(failure('rule scope disposed')));
  const live = agent => !lifetime.signal.aborted && agent && ctx.agents.get(agent.id) === agent;
  const projectRoot = agent => agent.session.header.cwd
    ?? (agent.ctx.get('workingDirectory') ?? ctx.get('workingDirectory'))?.get(agent.session);
  const rememberPath = (state, file) => {
    state.paths.delete(file);
    if (state.paths.size >= limits.paths) state.paths.delete(state.paths.values().next().value);
    state.paths.add(file); state.inputRevision++;
  };
  const stateFor = agent => {
    if (!live(agent)) throw failure('rule operation requires its actual live agent');
    const project = projectRoot(agent);
    let state = scopes.get(agent);
    if (!state) {
      state = { paths: new Set(), requested: new Set(), userRequested: new Set(), applied: new Set(), pendingMentions: new Set(),
        catalog: null, text: '', scopeRoot: project, inputRevision: 0, selectionRevision: 0, epoch: 0 };
      scopes.set(agent, state);
    } else if (state.scopeRoot !== project) {
      // When no creation-time project anchor exists, an effective-directory
      // change starts a separate rules scope. Old names cannot select a new
      // workspace's same-named manual rule.
      state.paths.clear(); state.requested.clear(); state.userRequested.clear(); state.applied.clear(); state.pendingMentions.clear();
      state.catalog = null; state.text = ''; state.project = undefined;
      state.scopeRoot = project; state.inputRevision++; state.selectionRevision++; state.epoch++;
    }
    return state;
  };
  ctx.systemPrompt.section({ name: 'omaa:cursor-rules', order: 10, interpolate: false, text: ({ agent }) => scopes.get(agent)?.text ?? '' });
  ctx.tools.register({ name: 'cursor_rule',
    description: 'Load a discovered Cursor project rule by name. Select an Agent Requested rule from the available description list, or a rule the user explicitly names. The rule is applied at the next step; this does not read arbitrary files.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute({ name }, exec) {
      exec.signal.throwIfAborted();
      const state = stateFor(exec.agent);
      if (!state.catalog || state.project !== projectRoot(exec.agent)) throw failure('rule catalog has not loaded for the current project');
      const selected = resolveName(state.catalog.rules, name);
      const rule = state.catalog.rules.find(rule => rule.name === selected);
      if (agentRequested(rule)) {
        // Body execution is not the final tool outcome: native post-policy or
        // cancellation can still turn it into an error. Keep this candidate
        // keyed by the original registry execution until tools/result below.
        selections.set(exec, { agent: exec.agent, token: exec.token, args: exec.arguments, signal: exec.signal,
          state, catalog: state.catalog, project: state.project, inputRevision: state.inputRevision, epoch: state.epoch, selected });
      } else if (!state.userRequested.has(selected) && !state.applied.has(selected))
        throw failure('rule requires a native user @mention or an already applied file scope: ' + selected);
      return 'Rule requested for the next step: ' + selected;
    },
  });
  ctx.on('tools/result', (exec, result) => {
    const candidate = selections.get(exec);
    selections.delete(exec);
    if (candidate && result.isError === false && exec.name === 'cursor_rule' && live(exec.agent)
      && !exec.signal?.aborted && !candidate.signal.aborted && exec.agent === candidate.agent
      && exec.token === candidate.token && exec.arguments === candidate.args && projectRoot(exec.agent) === candidate.project) {
      const state = scopes.get(exec.agent);
      if (state === candidate.state && state.catalog === candidate.catalog && state.project === candidate.project
        && state.inputRevision === candidate.inputRevision && state.epoch === candidate.epoch
        && agentRequested(state.catalog.rules.find(rule => rule.name === candidate.selected))) {
        // Independent successes from the same admitted input/catalog merge.
        // They invalidate an in-flight assembly, not each other's candidates.
        if (!state.requested.has(candidate.selected)) { state.requested.add(candidate.selected); state.selectionRevision++; }
      }
    }
    if (!live(exec.agent) || exec.signal?.aborted || result.isError !== false || !['read', 'edit', 'write'].includes(exec.name)
      || typeof exec.arguments?.file_path !== 'string') return;
    // Fixed native tool-fs outputs stamp the canonical execution-world path.
    // A raw relative argument cannot be reinterpreted after a later cd.
    const file = result.value?.path;
    if (typeof file === 'string' && path.isAbsolute(file)) rememberPath(stateFor(exec.agent), file);
  });
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    // Native user attribution is not physical UI authentication. Fresh
    // subagent prompts also use kind:user; their mentions are restricted below.
    if (!live(agent) || message?.source?.kind !== 'user') return;
    const state = stateFor(agent);
    for (const part of message.content ?? []) {
      // Uploaded display labels are not workspace paths.
      if (part.type === 'file' && typeof part.file_path === 'string') {
        const root = projectRoot(agent);
        if (typeof root === 'string' && path.isAbsolute(root)) rememberPath(state, path.resolve(root, part.file_path));
      }
      if (part.type === 'text' && typeof part.text === 'string') {
        for (const match of part.text.matchAll(/(?:^|\s)@([\w./-]+)/g)) {
          const mention = match[1].replace(/[.,;:!?]+$/, '');
          if (mention.length <= 512 && state.pendingMentions.size < limits.files) { state.pendingMentions.add(mention); state.inputRevision++; }
        }
      }
    }
  });
  async function prepare(agent, signal) {
    signal.throwIfAborted();
    const state = stateFor(agent);
    const epoch = ++state.epoch, inputRevision = state.inputRevision, selectionRevision = state.selectionRevision, project = projectRoot(agent);
    const paths = [...state.paths], requested = new Set(state.requested), userRequested = new Set(state.userRequested), mentions = [...state.pendingMentions];
    const current = () => {
      signal.throwIfAborted();
      if (!live(agent) || state.epoch !== epoch || state.inputRevision !== inputRevision || state.selectionRevision !== selectionRevision || projectRoot(agent) !== project)
        throw failure('rule assembly ownership or inputs changed');
    };
    try {
      current();
      const catalog = await discover(project);
      current();
      // A removed canonical request must not poison every future selection, nor
      // silently acquire a newly created basename alias or restored file.
      const rules = new Map(catalog.rules.map(rule => [rule.name, rule]));
      const delegated = agent.session.header.origin === 'subagent';
      for (const name of userRequested) if (delegated || !rules.has(name)) userRequested.delete(name);
      // A model selection authorizes only Agent Requested rules. A later edit
      // into Manual or Auto Attached cannot borrow that old model request.
      for (const name of requested) if (!rules.has(name) || !agentRequested(rules.get(name))) requested.delete(name);
      for (const mention of mentions) {
        try {
          const name = resolveName(catalog.rules, mention);
          // Fixed manager.ts:464-466 attributes a model-delegated child prompt
          // as user. It cannot grant Manual selection or a lasting user request
          // that could authorize a later metadata edit into Manual. Ordinary
          // inputs retain trusted host user attribution, not a physical UI proof.
          if (!delegated) userRequested.add(name);
          else if (agentRequested(rules.get(name))) requested.add(name);
        } catch { /* Unrelated @-mentions are not rule requests. */ }
      }
      const scoped = await scopedPaths(catalog.root, paths);
      current();
      const selected = select(catalog, scoped, [...new Set([...requested, ...userRequested])]);
      let text = selected.automatic.map(rule => `# Cursor project rule: ${rule.name} (${rule.reason})\n${rule.content}`).join('\n\n');
      if (selected.available.length) text += '\n\n# Available Cursor project rules\nUse cursor_rule with an exact name when its description is relevant.\n' + selected.available.map(rule => `${rule.name}: ${rule.description}`).join('\n');
      if (Buffer.byteLength(text) > limits.contextBytes) throw failure('rendered rules exceed context budget');
      state.catalog = catalog; state.project = project; state.requested = requested; state.userRequested = userRequested;
      state.applied = new Set(selected.automatic.map(rule => rule.name));
      for (const mention of mentions) state.pendingMentions.delete(mention);
      state.text = text;
      return { text, current };
    } catch (error) {
      current(); // Cancellation or stale work never replaces a later cache.
      state.catalog = null;
      state.applied.clear();
      state.text = 'Cursor project rules were not applied: ' + error.message;
      ctx.logger?.warn?.(state.text);
      return { text: state.text, current };
    }
  }
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    if (!context.agent) return next();
    const signal = context.signal === undefined ? lifetime.signal : AbortSignal.any([context.signal, lifetime.signal]);
    const prepared = await prepare(context.agent, signal);
    const assembly = await next();
    prepared.current();
    // DSH evaluates section.text before the waterfall and assembles before pre-step.
    // Replace this section in the current request rather than waiting for another step.
    return { ...assembly, sections: assembly.sections.map(section => section.name === 'omaa:cursor-rules'
      ? { ...section, text: prepared.text, interpolate: false } : section) };
  });
}
