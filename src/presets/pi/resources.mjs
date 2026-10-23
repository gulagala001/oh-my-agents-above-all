import { omdIdentityPrompt } from '../../host/identity.mjs';
import { currentDirectory } from '../../host/working-directory.mjs';
import path from 'node:path';
import { homedir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { symbols } from '@deepseek-ai/cordis';
import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import { promptFrame, renderPromptFrame } from './extension-prompt.mjs';
import { selectPiSkills, piIgnoreRulesChanged } from './skill-discovery.mjs';
import { loadPiResourcePaths, selectPiPromptFiles } from './resource-paths.mjs';

export const name = 'omaa-pi-resources';
export const inject = ['fs', 'skills', 'commands', 'systemPrompt', 'tools', 'agents', 'omaa'];
const maxFileBytes = 64 * 1024, maxTotalBytes = 256 * 1024, maxTemplates = 128;
const absent = error => ['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error?.code);
const budgetFailure = message => Object.assign(Error(message), { code: 'OMAA_PI_RESOURCE_BUDGET' });

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
async function readText(fs, file, signal, charge) {
  try {
    signal?.throwIfAborted();
    const target = await fs.resolve(file, { signal });
    const stat = await fs.stat(target, signal);
    if (!stat || stat.type !== 'file') return undefined;
    if (stat.size > maxFileBytes) throw new Error('file exceeds 64 KiB: ' + file);
    const chunks = []; let bytes = 0, highSurrogate = false;
    for await (const chunk of await fs.streamText(target, signal)) {
      signal?.throwIfAborted();
      // Charge received decoded text, including rejected files. Preserve UTF-8
      // accounting if a provider splits a surrogate pair across text chunks:
      // two standalone replacements cost 6 bytes, the joined pair costs 4.
      let received = Buffer.byteLength(chunk);
      if (highSurrogate && chunk.length && chunk.charCodeAt(0) >= 0xdc00 && chunk.charCodeAt(0) <= 0xdfff) received -= 2;
      if (chunk.length) { const last = chunk.charCodeAt(chunk.length - 1); highSurrogate = last >= 0xd800 && last <= 0xdbff; }
      bytes += received; charge?.(received);
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
  const charge = received => {
    bytes += received;
    if (bytes > maxTotalBytes) throw budgetFailure('Pi resource text exceeds 256 KiB; received UTF-8 bytes: ' + bytes);
  };
  const read = file => {
    if (bytes >= maxTotalBytes) throw budgetFailure('Pi resource text reached 256 KiB; no further resource file is read.');
    return readText(fs, file, signal, charge);
  };
  async function selected(fileName) {
    for (const root of [path.join(cwd, '.pi'), agentDir]) {
      const file = path.join(root, fileName), text = await read(file);
      if (text !== undefined) return { file, text };
    }
  }
  const system = await selected('SYSTEM.md'), append = await selected('APPEND_SYSTEM.md');
  let globalContext;
  for (const name of ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD']) {
    const file = path.join(agentDir, name), text = await read(file);
    if (text !== undefined) { globalContext = { file, text: text.replace(/^\uFEFF/, '') }; break; }
  }
  const promptPaths = [...resourcePaths.prompts,
    { path: path.join(cwd, '.pi', 'prompts'), rank: 40,
      filters: [{ entries: resourcePaths.project.prompts ?? [], baseDir: path.join(cwd, '.pi'), overridesOnly: true }] },
    { path: path.join(agentDir, 'prompts'), rank: 60,
      filters: [{ entries: resourcePaths.user.prompts ?? [], baseDir: agentDir, overridesOnly: true }] }];
  for (const file of await selectPiPromptFiles(fs, promptPaths, signal)) {
      const name = path.basename(file, '.md');
      if (templates.some(item => item.name === name)) { diagnostics.push('template collision, first wins: ' + file); continue; }
      if (templates.length >= maxTemplates) throw budgetFailure('Pi templates reached 128 accepted files; no further template candidate is read.');
      try {
        const text = await read(file); if (text === undefined) continue;
        const template = parseTemplate(text, file);
        templates.push(template);
      } catch (error) {
        signal?.throwIfAborted();
        if (error?.code === 'OMAA_PI_RESOURCE_BUDGET') throw error;
        diagnostics.push(file + ': ' + error.message);
      }
  }
  // This is received resource TEXT (including malformed/rejected bodies), not
  // accepted template bytes, physical I/O, or the separate config/ignore reads.
  // A stream chunk may already exceed the remainder before this stop is known.
  return { system, append, globalContext, templates, diagnostics, resourcePaths, textBytesRead: bytes };
}

export function apply(ctx, config = {}) {
  const configuredDir = config.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
  const agentDir = path.resolve(configuredDir.replace(/^~(?=$|[\\/])/, homedir()));
  const lifetime = new AbortController(), loadEpochs = new WeakMap();
  ctx.effect(() => () => lifetime.abort(Error('Pi resource scope disposed')));
  const ownerKey = agent => agent?.ctx && scopeOf(agent.ctx);
  const nativeSession = session => session?.[symbols.original] ?? session;
  const operationFor = (agent, callerSignal) => {
    const signal = callerSignal === undefined ? lifetime.signal : AbortSignal.any([callerSignal, lifetime.signal]);
    const owner = ownerKey(agent), session = nativeSession(agent?.session), cwd = session && currentDirectory(ctx, session);
    const roster = agent?.ctx?.get('agentPresets') ?? ctx.get('agentPresets');
    const preset = roster?.composedPreset?.(agent.ctx);
    const check = () => {
      signal.throwIfAborted();
      const current = session && ctx.agents.get(session.id);
      if (!owner || typeof owner !== 'object' || ownerKey(agent) !== owner || ownerKey(current) !== owner
        || nativeSession(agent.session) !== session || nativeSession(current?.session) !== session || currentDirectory(ctx, session) !== cwd
        || ctx.omaa.product(session)?.id !== 'pi' || preset !== 'omaa-pi' || roster?.composedPreset?.(agent.ctx) !== preset)
        throw Error('Pi resource native owner, preset or working directory changed.');
    };
    check(); return { owner, session, cwd, signal, check };
  };
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
  const catalogs = new WeakMap(), catalogLocations = new WeakMap(), registered = new Set();
  const claims = new WeakMap(), origins = new WeakMap(), boundaries = new WeakMap(), preparedAssemblies = new WeakSet();
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    let entries = origins.get(ownerKey(agent)); if (!entries) origins.set(ownerKey(agent), entries = new Map());
    if (!entries.has(message.id)) entries.set(message.id, { streaming: agent.status === 'running', streamingBehavior: agent.inbox.nextStep.some(item => item.id === message.id) ? 'steer' : 'followUp' });
  });
  ctx.on('agent/inbox/discarded', ({ agent, message }) => origins.get(ownerKey(agent))?.delete(message.id));
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    let batch = claims.get(ownerKey(agent)); if (!batch) claims.set(ownerKey(agent), batch = []);
    batch.push({ message, turn });
  });
  const load = async (agent, signal) => {
    const operation = operationFor(agent, signal), { cwd, owner } = operation;
    const epoch = (loadEpochs.get(owner) ?? 0) + 1; loadEpochs.set(owner, epoch);
    const catalog = await loadPiResources(ctx.fs, { cwd, agentDir, signal: operation.signal });
    operation.check();
    if (loadEpochs.get(owner) !== epoch) throw Error('Pi resource load was superseded.');
    configuredPaths.delete(cwd); configuredPaths.set(cwd, catalog.resourcePaths);
    if (configuredPaths.size > 16) configuredPaths.delete(configuredPaths.keys().next().value);
    catalogs.set(ownerKey(agent), catalog);
    catalogLocations.set(owner, cwd);
    for (const diagnostic of catalog.diagnostics) ctx.logger.warn('Pi resources: ' + diagnostic);
    for (const template of catalog.templates) {
      operation.check();
      if (!/^[a-z][a-z0-9_-]*$/.test(template.name) || registered.has(template.name) || ctx.commands.find(agent, template.name)) continue;
      registered.add(template.name);
      ctx.commands.register({ name: template.name, description: template.description,
        input: { hint: template.argumentHint?.trim() || 'Template arguments' },
        async handler({ agent, rawInput, signal }) {
          const operation = operationFor(agent, signal);
          const current = await load(agent, operation.signal);
          operation.check();
          const item = current.templates.find(item => item.name === template.name);
          if (!item) return { kind: 'error', text: 'Pi template no longer exists: ' + template.name };
          // Submit through the same native input path as typed/queued templates.
          // The pre-step hook expands exactly once, preserving the message id/source.
          const message = createUserMessage({ content: [{ type: 'text', text: '/' + template.name + rawInput }], source: { kind: 'user' } });
          let accepted = false;
          // followup returns void. An actual native insertion is the available
          // acceptance fact; a reentrant cancel may discard it before return.
          const stop = ctx.on('agent/inbox/inserted', info => {
            if (ownerKey(info.agent) === operation.owner && nativeSession(info.agent.session) === operation.session && info.message.id === message.id) accepted = true;
          });
          try {
            operation.check(); agent.followup(message);
            if (!accepted) return { kind: 'error', text: 'Native template input acceptance was not observed; its outcome is unknown. Do not automatically resubmit /' + template.name };
            try { operation.check(); }
            catch { return { kind: 'success', text: 'Native inbox accepted /' + template.name + ', then the request was interrupted. The input may already be discarded; inspect native state before resubmitting.' }; }
            return { kind: 'success', text: 'Submitted /' + template.name + ' to the native inbox.' };
          } catch (error) {
            if (accepted) return { kind: 'success', text: 'Native inbox accepted /' + template.name + ', but its later outcome is unknown. Inspect native state before resubmitting.' };
            throw error;
          } finally { stop(); }
        },
      });
    }
    return catalog;
  };
  ctx.systemPrompt.section({ name: 'omaa:pi-addendum', order: 5, text: '', interpolate: false });
  ctx.systemPrompt.section({ name: 'omaa:pi-global-context', order: 10, text: '', interpolate: false });
  const resources = {
    frame(agent, assembly, tools) {
      const operation = operationFor(agent), catalog = catalogs.get(operation.owner);
      if (catalog && catalogLocations.get(operation.owner) !== operation.cwd)
        throw Error('Pi prompt resource catalog belongs to an earlier working directory.');
      return promptFrame(assembly.sections.map(section => ({ name: section.name, text: renderPrompt({ ...assembly, sections: [section] }) })), {
        tools: new Set(tools.map(tool => tool.name)), cwd: operation.cwd,
        customTools: ctx.get('omaaPiExtensions')?.promptTools(agent) ?? [], catalog: catalog ?? {},
        identity: omdIdentityPrompt(ctx, agent.session), child: agent.session.header.origin === 'subagent',
      });
    },
    boundary: agent => boundaries.get(ownerKey(agent)),
    async prepare(agent, signal, beforeInput) {
      const operation = operationFor(agent, signal);
      const catalog = await load(agent, operation.signal);
      operation.check();
      beforeInput?.();
      const claimed = claims.get(ownerKey(agent)) ?? []; claims.delete(ownerKey(agent));
      const original = claimed.map(item => item.message);
      const selected = ctx.get('omaaPiSteering')?.select(agent, original) ?? original;
      const extension = ctx.get('omaaPiExtensions');
      const inputMetadata = new Map(selected.map(message => [message.id, { ...origins.get(ownerKey(agent))?.get(message.id), ...message.source?.pi?.input, ...extension?.inputMetadata(agent, message.id) }]));
      const processed = extension ? await extension.input(agent, selected, operation.signal) : selected;
      operation.check();
      if (catalogs.get(ownerKey(agent)) !== catalog) throw Error('Pi input resource catalog was superseded.');
      const messages = processed.map(message => {
        if (message.role !== 'user' || message.source?.kind !== 'user' || inputMetadata.get(message.id)?.expandPromptTemplates === false) return message;
        return { ...message, content: message.content.map(part => part.type === 'text' ? { ...part, text: expandPromptTemplate(part.text, catalog.templates) } : part) };
      });
      for (const message of selected) origins.get(ownerKey(agent))?.delete(message.id);
      const users = messages.filter(message => message.role === 'user' && message.source?.kind === 'user');
      const boundary = { claimedIds: new Set(original.map(message => message.id)), messages, users,
        customMessages: users.length ? extension?.pendingMessages(agent) ?? [] : [],
        startsRun: users.some(message => !inputMetadata.get(message.id)?.streaming),
        handled: selected.some(message => message.source?.kind === 'user') && !users.length };
      boundaries.set(ownerKey(agent), boundary); preparedAssemblies.add(ownerKey(agent));
      return boundary;
    },
  };
  ctx.provide('omaaPiResources', resources);
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    if (!context.agent) return next();
    const operation = operationFor(context.agent, context.signal);
    const observed = observedSelections.get(currentDirectory(ctx, context.agent.session));
    if (observed && await piIgnoreRulesChanged(ctx.fs, observed.ignoreObservations, operation.signal)) { operation.check(); invalidateSkills?.(); }
    if (!preparedAssemblies.has(ownerKey(context.agent))) await resources.prepare(context.agent, operation.signal);
    preparedAssemblies.delete(ownerKey(context.agent));
    operation.check();
    const catalog = catalogs.get(ownerKey(context.agent));
    const assembly = await next(), tools = ctx.tools?.schemas(context.agent) ?? assembly.tools;
    operation.check();
    if (catalogs.get(ownerKey(context.agent)) !== catalog) throw Error('Pi assembled resource catalog was superseded.');
    const frame = resources.frame(context.agent, assembly, tools);
    const textByName = new Map(renderPromptFrame(frame).map(section => [section.name, section.text]));
    return { ...assembly, sections: assembly.sections.map(section => textByName.has(section.name)
      ? { ...section, text: textByName.get(section.name), interpolate: false } : section) };
  });
  ctx.on('agent/pre-step', async (info, next) => {
    const boundary = boundaries.get(ownerKey(info.agent)); boundaries.delete(ownerKey(info.agent));
    if (boundary) {
      const changes = new Map(boundary.messages.map(message => [message.id, message]));
      info.messages.splice(0, info.messages.length, ...info.messages.flatMap(message => !boundary.claimedIds.has(message.id) ? [message] : changes.has(message.id) ? [changes.get(message.id)] : []));
    }
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    if (boundary?.handled && !boundary.messages.length) return { ...decision, messages: [] };
    return { ...decision, ...(boundary?.startsRequestSeries ? { startsRequestSeries: true } : {}), messages: [...decision.messages, ...boundary?.customMessages ?? []] };
  }, { prepend: true });
}
