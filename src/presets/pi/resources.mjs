import path from 'node:path';
import { homedir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { selectPiSkills, piIgnoreRulesChanged } from './skill-discovery.mjs';
import { loadPiResourcePaths, selectPiPromptFiles } from './resource-paths.mjs';

export const name = 'omaa-pi-resources';
export const inject = ['fs', 'skills', 'commands', 'systemPrompt'];
const maxFileBytes = 64 * 1024, maxTotalBytes = 256 * 1024, maxTemplates = 128;
const absent = error => ['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error?.code);

// Pi v1.0.2 prompt-templates.ts: syntax and non-recursive substitution preserved.
export function parseCommandArgs(argsString) {
  const args = []; let current = '', inQuote = null;
  for (const char of argsString) {
    if (inQuote) { if (char === inQuote) inQuote = null; else current += char; }
    else if (char === '"' || char === "'") inQuote = char;
    else if (/\s/.test(char)) { if (current) { args.push(current); current = ''; } }
    else current += char;
  }
  if (current) args.push(current);
  return args;
}
export function substituteArgs(content, args) {
  const allArgs = args.join(' ');
  return content.replace(/\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
      if (defaultTarget) {
        const value = defaultTarget === '@' || defaultTarget === 'ARGUMENTS' ? allArgs : args[parseInt(defaultTarget, 10) - 1];
        return value ? value : defaultValue;
      }
      if (sliceStart) {
        let start = parseInt(sliceStart, 10) - 1;
        if (start < 0) start = 0;
        if (sliceLength) return args.slice(start, start + parseInt(sliceLength, 10)).join(' ');
        return args.slice(start).join(' ');
      }
      if (simple === 'ARGUMENTS' || simple === '@') return allArgs;
      return args[parseInt(simple, 10) - 1] ?? '';
    });
}
export function expandPromptTemplate(text, templates) {
  if (!text.startsWith('/')) return text;
  const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  const template = match && templates.find(item => item.name === match[1]);
  return template ? substituteArgs(template.content, parseCommandArgs(match[2] ?? '')) : text;
}
function parseTemplate(text, filePath) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const end = normalized.startsWith('---') ? normalized.indexOf('\n---', 3) : -1;
  const meta = end < 0 ? {} : yamlLoad(normalized.slice(4, end), { schema: JSON_SCHEMA }) ?? {};
  const content = end < 0 ? normalized : normalized.slice(end + 4).trim();
  if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('template frontmatter must be a map');
  const first = content.split('\n').find(line => line.trim()) ?? '';
  const description = typeof meta.description === 'string' && meta.description ? meta.description : first.slice(0, 60) + (first.length > 60 ? '...' : '');
  return { name: path.basename(filePath, '.md'), description: description || path.basename(filePath), content, filePath,
    argumentHint: typeof meta['argument-hint'] === 'string' ? meta['argument-hint'] : undefined };
}
async function readText(fs, file, signal) {
  try {
    signal?.throwIfAborted();
    const target = await fs.resolve(file, { signal });
    const stat = await fs.stat(target, signal);
    if (!stat || stat.type !== 'file') return undefined;
    if (stat.size > maxFileBytes) throw new Error('file exceeds 64 KiB: ' + file);
    const chunks = []; let bytes = 0;
    for await (const chunk of await fs.streamText(target, signal)) {
      signal?.throwIfAborted(); bytes += Buffer.byteLength(chunk);
      if (bytes > maxFileBytes) throw new Error('file exceeds 64 KiB: ' + file);
      chunks.push(chunk);
    }
    return chunks.join('');
  } catch (error) { if (absent(error)) return undefined; throw error; }
}
export async function loadPiResources(fs, { cwd, agentDir, signal }) {
  const templates = [], diagnostics = []; let bytes = 0;
  const resourcePaths = await loadPiResourcePaths(fs, { cwd, agentDir, signal });
  diagnostics.push(...resourcePaths.diagnostics);
  const count = text => { bytes += Buffer.byteLength(text); if (bytes > maxTotalBytes) throw new Error('Pi resources exceed 256 KiB'); };
  async function selected(fileName) {
    for (const root of [path.join(cwd, '.pi'), agentDir]) {
      const file = path.join(root, fileName), text = await readText(fs, file, signal);
      if (text !== undefined) { count(text); return { file, text }; }
    }
  }
  const system = await selected('SYSTEM.md'), append = await selected('APPEND_SYSTEM.md');
  let globalContext;
  for (const name of ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD']) {
    const file = path.join(agentDir, name), text = await readText(fs, file, signal);
    if (text !== undefined) { count(text); globalContext = { file, text: text.replace(/^\uFEFF/, '') }; break; }
  }
  const promptPaths = [...resourcePaths.prompts,
    { path: path.join(cwd, '.pi', 'prompts'), rank: 40,
      filters: [{ entries: resourcePaths.project.prompts ?? [], baseDir: path.join(cwd, '.pi'), overridesOnly: true }] },
    { path: path.join(agentDir, 'prompts'), rank: 60,
      filters: [{ entries: resourcePaths.user.prompts ?? [], baseDir: agentDir, overridesOnly: true }] }];
  for (const file of await selectPiPromptFiles(fs, promptPaths, signal)) {
      try {
        const text = await readText(fs, file, signal); if (text === undefined) continue;
        count(text);
        const template = parseTemplate(text, file);
        if (templates.some(item => item.name === template.name)) { diagnostics.push('template collision, first wins: ' + file); continue; }
        if (templates.length >= maxTemplates) throw new Error('Pi templates exceed 128 files');
        templates.push(template);
      } catch (error) { signal?.throwIfAborted(); diagnostics.push(file + ': ' + error.message); }
  }
  return { system, append, globalContext, templates, diagnostics, resourcePaths };
}

export function apply(ctx, config = {}) {
  const configuredDir = config.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
  const agentDir = path.resolve(configuredDir.replace(/^~(?=$|[\\/])/, homedir()));
  let provider, invalidateSkills;
  const selections = new AsyncLocalStorage();
  const observedSelections = new Map();
  const configuredPaths = new Map();
  // Restrict native scan inputs as well as its returned candidates: ignored
  // bundles must not be parsed just because their parent is a watched root.
  const selectionFs = new Proxy(ctx.fs, { get(fs, key) {
    if (key === 'listDir') return async (...args) => {
      const entries = await fs.listDir(...args), selection = selections.getStore();
      return !selection ? entries : entries.filter(entry => selection.files.has(entry.type === 'directory'
        ? path.join(entry.target.displayPath, 'SKILL.md') : entry.target.displayPath));
    };
    const value = Reflect.get(fs, key);
    return typeof value === 'function' ? value.bind(fs) : value;
  } });
  const providerCtx = new Proxy(ctx, { get(context, key) { return key === 'fs' ? selectionFs : Reflect.get(context, key); } });
  class PiSkillProvider extends FileSystemSkillProvider {
    async list(options) {
      const resourcePaths = configuredPaths.get(options.cwd) ?? await loadPiResourcePaths(ctx.fs, { cwd: options.cwd, agentDir, signal: options.signal });
      const selection = await selectPiSkills(ctx.fs, { cwd: options.cwd, agentDir, signal: options.signal, resourcePaths });
      observedSelections.delete(options.cwd);
      observedSelections.set(options.cwd, selection);
      if (observedSelections.size > 16) observedSelections.delete(observedSelections.keys().next().value);
      return selections.run(selection, async () => {
        const result = await super.list(options), seen = new Set();
        const filter = candidates => candidates.filter(candidate => {
          const file = candidate.locator.path;
          if (!selection.files.has(file) || selection.selectedRanks.get(file) !== candidate.rank || seen.has(file)) return false;
          seen.add(file); return true;
        });
        return Array.isArray(result) ? filter(result) : { ...result, candidates: filter(result.candidates) };
      });
    }
    // A pinned 0.2.1-alpha.1 internal extension: roots is private in upstream d.ts.
    // Native discovery/get/watch remains unchanged; this only selects directories.
    async roots(cwd) {
      return (selections.getStore() ?? await selectPiSkills(ctx.fs, { cwd, agentDir })).roots;
    }
  }
  ctx.skills.registerProvider(control => {
    invalidateSkills = control.invalidate;
    return (provider = new PiSkillProvider(providerCtx, control, { providerName: 'pi-filesystem', includeDefaultRoots: false }));
  });
  ctx.effect(function* () { yield () => provider?.dispose(); }, 'Pi skill filesystem watcher');
  ctx.on('fs/observed', (target, _observation, actor) => {
    if (actor?.name === 'write' || actor?.name === 'edit') provider?.observeHostMutation(target.displayPath);
  });
  const catalogs = new WeakMap(), registered = new Set();
  const load = async (agent, signal) => {
    const catalog = await loadPiResources(ctx.fs, { cwd: agent.session.header.cwd, agentDir, signal });
    const cwd = agent.session.header.cwd;
    configuredPaths.delete(cwd); configuredPaths.set(cwd, catalog.resourcePaths);
    if (configuredPaths.size > 16) configuredPaths.delete(configuredPaths.keys().next().value);
    catalogs.set(agent, catalog);
    for (const diagnostic of catalog.diagnostics) ctx.logger.warn('Pi resources: ' + diagnostic);
    for (const template of catalog.templates) {
      if (!/^[a-z][a-z0-9_-]*$/.test(template.name) || registered.has(template.name) || ctx.commands.find(agent, template.name)) continue;
      registered.add(template.name);
      ctx.commands.register({ name: template.name, description: template.description,
        input: { hint: template.argumentHint?.trim() || 'Template arguments' },
        async handler({ agent, rawInput, signal }) {
          const current = await load(agent, signal);
          const item = current.templates.find(item => item.name === template.name);
          if (!item) return { kind: 'error', text: 'Pi template no longer exists: ' + template.name };
          // Submit through the same native input path as typed/queued templates.
          // The pre-step hook expands exactly once, preserving the message id/source.
          agent.followup(createUserMessage({ content: [{ type: 'text', text: '/' + template.name + rawInput }], source: { kind: 'user' } }));
          return { kind: 'success', text: 'Submitted /' + template.name };
        },
      });
    }
    return catalog;
  };
  ctx.systemPrompt.section({ name: 'omaa:pi-addendum', order: 5, text: '', interpolate: false });
  ctx.systemPrompt.section({ name: 'omaa:pi-global-context', order: 10, text: '', interpolate: false });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    if (!context.agent) return next();
    const observed = observedSelections.get(context.agent.session.header.cwd);
    if (observed && await piIgnoreRulesChanged(ctx.fs, observed.ignoreObservations, context.signal)) invalidateSkills?.();
    const catalog = await load(context.agent, context.signal), assembly = await next();
    return { ...assembly, sections: assembly.sections.map(section => {
      if (section.name === 'deployment:persona-prefix' && catalog.system?.text) {
        const cwd = context.agent.session.header.cwd.replaceAll('\\', '/').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        return { ...section, text: catalog.system.text + '\n\n<cwd>\n' + cwd + '\n</cwd>', interpolate: false };
      }
      if (section.name === 'omaa:pi-addendum') return { ...section, text: catalog.append?.text ? '<addendum>\n' + catalog.append.text + '\n</addendum>' : '', interpolate: false };
      if (section.name === 'omaa:pi-global-context') {
        const file = catalog.globalContext;
        const escapedPath = file?.file.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        return { ...section, text: file ? '<project_context>\nProject-specific instructions and guidelines:\n<project_instructions path="' + escapedPath + '">\n' + file.text + '\n</project_instructions>\n</project_context>' : '', interpolate: false };
      }
      return section;
    }) };
  });
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    const catalog = catalogs.get(agent) ?? await load(agent, signal);
    return { ...decision, messages: decision.messages.map(message => {
      if (message.role !== 'user' || message.source?.kind !== 'user') return message;
      const content = message.content.map(part => part.type === 'text' ? { ...part, text: expandPromptTemplate(part.text, catalog.templates) } : part);
      return { ...message, content };
    }) };
  });
}
