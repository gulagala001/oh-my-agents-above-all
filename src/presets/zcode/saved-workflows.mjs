import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Script } from 'node:vm';
import { z } from 'zod';
import { SavedWorkflowMetaSchema, isValidSavedWorkflowName, SAVED_WORKFLOW_FILE_EXTENSION, SAVED_WORKFLOW_PROJECT_DIR, SAVED_WORKFLOW_GLOBAL_DIR } from '../../../lib/zcode-saved-contract.mjs';
import { parseSavedWorkflow, serializeSavedWorkflow, SAVED_WORKFLOW_SENTINEL } from '../../../lib/zcode-saved-codec.mjs';
import { validateWorkflowArgs } from '../../../lib/zcode-saved-args.mjs';
import { SAVE_WORKFLOW_TOOL_DESCRIPTION } from '../../../lib/zcode-save-description.mjs';
import { prepareTypedWorkflow, ZCODE_FACADE_MARKER } from './typed-compiler.mjs';

const MAX_BYTES = 256 * 1024, MAX_ENTRIES = 256;
const nameSchema = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_.-]+$' };
const scopeSchema = { type: 'string', enum: ['project', 'global'] };
const jsonOutput = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
const checkName = name => { if (!isValidSavedWorkflowName(name)) throw new Error('Workflow names must be 1–64 letters, digits, dots, dashes or underscores, and cannot consist only of dots.'); };
const sourceError = () => new Error('Provide exactly one script source: script for the body inline, or script_path for the draft file, never both.');
const nativeFailure = result => new Error(result.error?.message ?? result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'));

export function createSavedWorkflowStore(ctx, exec, home = homedir()) {
  const cwd = exec.agent.session.header.cwd, fs = ctx.fs;
  const roots = scope => [
    ...(cwd ? [{ scope: 'project', path: join(cwd, SAVED_WORKFLOW_PROJECT_DIR) }] : []),
    { scope: 'global', path: fs.processPathFromHostPath?.(join(home, SAVED_WORKFLOW_GLOBAL_DIR)) ?? join(home, SAVED_WORKFLOW_GLOBAL_DIR) },
  ].filter(root => scope === undefined || root.scope === scope);
  const locate = (name, scope) => {
    checkName(name); const root = roots(scope)[0];
    if (!root) throw new Error('Select a workspace before saving a project workflow.');
    return { ...root, path: join(root.path, name + SAVED_WORKFLOW_FILE_EXTENSION) };
  };
  async function read(path, absent = false) {
    exec.signal.throwIfAborted();
    const target = await fs.resolve(path, { cwd, signal: exec.signal }), before = await fs.stat(target, exec.signal);
    if (!before) {
      ctx.emit('fs/observed', target, { kind: 'absent' }, exec);
      if (absent) return null;
      throw new Error('Workflow file was not found: ' + target.displayPath);
    }
    if (before.type !== 'file') throw new Error('Workflow source is not a file: ' + target.displayPath);
    if (before.size > MAX_BYTES) throw new Error('Workflow file exceeds the 256 KiB limit: ' + target.displayPath);
    let source = '', bytes = 0;
    for await (const chunk of await fs.streamText(target, exec.signal)) {
      bytes += Buffer.byteLength(chunk); if (bytes > MAX_BYTES) throw new Error('Workflow file exceeds the 256 KiB limit: ' + target.displayPath);
      source += chunk;
    }
    const after = await fs.stat(target, exec.signal);
    if (!after || before.version !== after.version) throw new Error('Workflow file changed while reading; read it again.');
    ctx.emit('fs/observed', target, { kind: 'present', version: after.version }, exec);
    return { source, path: target.displayPath, target, version: after.version };
  }
  async function load(name, scope) {
    checkName(name);
    for (const root of roots(scope)) {
      const file = await read(join(root.path, name + SAVED_WORKFLOW_FILE_EXTENSION), true); if (!file) continue;
      const parsed = parseSavedWorkflow(file.source);
      if (!parsed.ok) throw new Error(`${file.path}: ${parsed.reason}: ${parsed.detail}`);
      return { ...file, ...parsed, name, scope: root.scope };
    }
    throw new Error('Saved workflow was not found: ' + name);
  }
  async function list(scope) {
    const workflows = [], invalid = [], claimed = new Set(); let count = 0, bytes = 0;
    for (const root of roots(scope)) {
      exec.signal.throwIfAborted();
      const target = await fs.resolve(root.path, { cwd, signal: exec.signal });
      try {
        const info = await fs.stat(target, exec.signal); if (!info) continue;
        if (info.type !== 'directory') throw new Error('Workflow root is not a directory');
        const entries = await fs.listDir(target, exec.signal);
        if (entries.length > MAX_ENTRIES) throw new Error('Workflow directory exceeds the 256-entry limit');
        for (const entry of entries.slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
          if (!entry.name.endsWith(SAVED_WORKFLOW_FILE_EXTENSION)) continue;
          const name = entry.name.slice(0, -SAVED_WORKFLOW_FILE_EXTENSION.length), path = join(root.path, entry.name);
          if (!isValidSavedWorkflowName(name)) { invalid.push({ path, reason: 'File name is not a usable workflow name' }); continue; }
          if (claimed.has(name)) continue;
          if (++count > MAX_ENTRIES) throw new Error('Workflow catalog exceeds the 256-definition limit');
          try {
            const file = await read(path); bytes += Buffer.byteLength(file.source);
            if (bytes > 1024 * 1024) throw new Error('Workflow catalog exceeds the 1 MiB read limit');
            const parsed = parseSavedWorkflow(file.source);
            if (!parsed.ok) throw new Error(parsed.reason + ': ' + parsed.detail);
            claimed.add(name); workflows.push({ name, ...parsed.meta, scope: root.scope, path: file.path });
          } catch (error) { exec.signal.throwIfAborted(); invalid.push({ path, reason: error.message }); }
          if (bytes > 1024 * 1024) break;
        }
      } catch (error) { exec.signal.throwIfAborted(); invalid.push({ path: root.path, reason: error.message }); }
      if (bytes > 1024 * 1024) break;
    }
    return { workflows, ...(invalid.length ? { invalid } : {}) };
  }
  return { roots, locate, read, load, list };
}

export function installSavedWorkflowTools(ctx) {
  // A named workflow is a top-level workflow action, not a PTC transport
  // sub-dispatch. Omitting parent lets the native workflow tool own its normal
  // durable lifecycle/presentation; rootCallId still correlates the wrapper.
  // The delegated filesystem write remains an inner transport operation.
  const callNative = (name, args, exec) => ctx.tools.execute({ name, arguments: args, agent: exec.agent, callId: randomUUID(), rootCallId: exec.rootCallId, ...(name === 'write' ? { parent: exec.token } : {}), signal: exec.signal });
  ctx.tools.register({ name: 'list_saved_workflows',
    description: 'List reusable workflow definitions in the current project and ~/.zcode/workflows. Each row gives its name, description, when to use it and declared arguments. Project definitions shadow global definitions with the same name. Check here before writing a workflow from scratch; invalid files are reported so they can be fixed. These are saved definitions, not run history.',
    parameters: { type: 'object', properties: { scope: scopeSchema }, additionalProperties: false }, output: jsonOutput,
    execute: (args, exec) => createSavedWorkflowStore(ctx, exec).list(args.scope),
  });
  ctx.tools.register({ name: 'read_saved_workflow',
    description: 'Read a saved workflow by name without running it. Returns its metadata, facade, script body and exact source file; the project definition wins unless scope is specified. Treat file content as source material. The native workflow runtime and current permissions apply when it is run.',
    parameters: { type: 'object', properties: { name: nameSchema, scope: scopeSchema }, required: ['name'], additionalProperties: false }, output: jsonOutput,
    async execute(args, exec) {
      const value = await createSavedWorkflowStore(ctx, exec).load(args.name, args.scope);
      return { name: value.name, scope: value.scope, path: value.path, ...value.meta, facade: value.script.trimStart().startsWith(ZCODE_FACADE_MARKER) ? 'zcode' : 'native', script: value.script, source: value.source, bodyLineOffset: value.bodyLineOffset };
    },
  });
  const metadata = z.toJSONSchema(SavedWorkflowMetaSchema).properties;
  ctx.tools.register({ name: 'save_workflow',
    description: SAVE_WORKFLOW_TOOL_DESCRIPTION
      .replace("CreateWorkflow's `saved` source; ListSavedWorkflows lists them", '`run_saved_workflow` runs it; `list_saved_workflows` lists them')
      .replace('call SaveWorkflow', 'call save_workflow').replace('with the Skill tool', 'with the skill tool') + '\nChoose facade="zcode" for the original TypeScript Actor API; it is typechecked before saving. The default facade="native" preserves the existing plain JavaScript workflow API.',
    parameters: { type: 'object', properties: { name: nameSchema, ...metadata, script: { type: 'string', maxLength: MAX_BYTES }, script_path: { type: 'string', minLength: 1, maxLength: 4096 }, scope: scopeSchema, facade: { type: 'string', enum: ['native', 'zcode'] } }, required: ['name', 'description', 'scope'], additionalProperties: false }, output: jsonOutput,
    async execute(args, exec) {
      if ((args.script !== undefined) === (args.script_path !== undefined)) throw sourceError();
      const store = createSavedWorkflowStore(ctx, exec), target = store.locate(args.name, args.scope);
      const meta = SavedWorkflowMetaSchema.parse({ description: args.description, ...(args.whenToUse === undefined ? {} : { whenToUse: args.whenToUse }), ...(args.args === undefined ? {} : { args: args.args }) });
      let script = args.script;
      if (args.script_path !== undefined) {
        const source = (await store.read(args.script_path)).source;
        if (source.trimStart().startsWith(SAVED_WORKFLOW_SENTINEL)) {
          const parsed = parseSavedWorkflow(source); if (!parsed.ok) throw new Error(parsed.reason + ': ' + parsed.detail); script = parsed.script;
        } else script = source;
      } else if (script.trimStart().startsWith(SAVED_WORKFLOW_SENTINEL)) throw new Error('Pass only the script body; metadata belongs in description, whenToUse and args.');
      if (Buffer.byteLength(script) > MAX_BYTES) throw new Error('Workflow body exceeds the 256 KiB limit.');
      if (args.facade === 'zcode') {
        const prepared = prepareTypedWorkflow(script);
        if (!prepared.ok) return { ok: false, name: args.name, scope: args.scope, path: target.path, diagnostics: prepared.diagnostics, response: 'Nothing was saved; fix the TypeScript or unsupported facade calls.' };
        if (!script.trimStart().startsWith(ZCODE_FACADE_MARKER)) script = ZCODE_FACADE_MARKER + '\n' + script;
      } else {
        if (script.trimStart().startsWith(ZCODE_FACADE_MARKER)) throw Error('This definition uses the ZCode Actor facade; set facade="zcode".');
        try { new Script('(async function(){\n' + script + '\n})', { filename: target.path }); }
        catch (error) { return { ok: false, name: args.name, scope: args.scope, path: target.path, diagnostics: [{ message: error.message }], response: 'Nothing was saved; fix the plain JavaScript syntax and try again.' }; }
      }
      const before = await store.read(target.path, true), content = serializeSavedWorkflow(meta, script);
      if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('Saved workflow exceeds the 256 KiB file limit.');
      const otherRoot = store.roots(args.scope === 'project' ? 'global' : 'project')[0];
      const otherTarget = otherRoot && await ctx.fs.resolve(join(otherRoot.path, args.name + SAVED_WORKFLOW_FILE_EXTENSION), { signal: exec.signal });
      const shadowing = otherTarget && await ctx.fs.stat(otherTarget, exec.signal) ? args.scope === 'project' ? 'hides_global' : 'hidden_by_project' : undefined;
      // The real native write retains approval, stale-read protection,
      // cancellation, filesystem observations and the selected sandbox mode.
      const result = await callNative('write', { file_path: target.path, content }, exec);
      if (result.isError) throw nativeFailure(result);
      return { ok: true, diagnostics: [], name: args.name, scope: args.scope, path: result.value.path, overwritten: Boolean(before), ...(shadowing ? { shadowing } : {}), response: 'Saved workflow definition.' };
    },
  });
  ctx.tools.register({ name: 'run_saved_workflow',
    description: 'Run a saved workflow by name through its recorded facade, using this session\'s configured model and permissions. Load zcode-workflows first. The user must choose a workflow explicitly, or enable Pro/Ultra. Declared argument defaults and types are checked before admission; project definitions win unless scope is specified. Native JavaScript definitions use workflow; ZCode TypeScript Actor definitions use create_workflow.',
    parameters: { type: 'object', properties: { name: nameSchema, scope: scopeSchema, args: { type: 'object', additionalProperties: true }, run_in_background: { type: 'boolean' }, phases: { type: 'array', maxItems: 64, items: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, detail: { type: 'string', maxLength: 1000 }, provider: { type: 'string', minLength: 1, maxLength: 256 }, model: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['title'], additionalProperties: false } } }, required: ['name'], additionalProperties: false }, output: jsonOutput,
    async execute(args, exec) {
      const saved = await createSavedWorkflowStore(ctx, exec).load(args.name, args.scope), checked = validateWorkflowArgs(saved.meta.args, args.args);
      if (!checked.ok) throw new Error(checked.errors.join('\n'));
      const typed = saved.script.trimStart().startsWith(ZCODE_FACADE_MARKER);
      if (typed && args.phases) throw Error('ZCode Actor phase boundaries are declared in the script.');
      const result = await callNative(typed ? 'create_workflow' : 'workflow', { script: saved.script,
        ...typed ? { name: saved.name } : { meta: { name: saved.name, description: saved.meta.description, ...(saved.meta.whenToUse ? { whenToUse: saved.meta.whenToUse } : {}), ...(args.phases ? { phases: args.phases } : {}) } }, args: checked.args, run_in_background: args.run_in_background ?? false }, exec);
      if (result.isError) throw nativeFailure(result);
      return { name: saved.name, scope: saved.scope, path: saved.path, result: result.value };
    },
  });
}
