import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';

export const outputStyleSchema = z.object({
  name: z.string().trim().min(1).max(128),
  prompt: z.string().min(1).max(16384).refine(value => value.trim().length > 0),
  keepCodingInstructions: z.boolean().optional(),
}).strict();
export const projectMemoryRootSchema = z.string().min(1).max(4096).refine(value => !value.includes('\0')
  && (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)), 'Directory paths must be absolute and contain no NUL.');
export const projectMemorySchema = z.object({ root: projectMemoryRootSchema, workspacePath: projectMemoryRootSchema }).strict();
export const preferenceSchema = z.object({ enhancement: z.boolean(), theme: z.string(), mode: z.enum(['default', 'ask']),
  outputStyle: outputStyleSchema.optional(), projectMemory: projectMemorySchema.optional(),
  agentProfileDirectory: projectMemorySchema.optional(), agentMemory: projectMemorySchema.optional() }).strict();
export const defaults = Object.freeze({ enhancement: false, theme: 'product', mode: 'default' });
export function createPreferencesStore(directory) {
  const folder = join(directory, 'preferences');
  const fileFor = id => join(folder, createHash('sha256').update(id).digest('hex') + '.json');
  const transferFor = id => join(directory, 'transfers', createHash('sha256').update(id).digest('hex') + '.json');
  const atomic = (file, value) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); renameSync(temporary, file); }
    finally { rmSync(temporary, { force: true }); }
  };
  return {
    has(id) {
      try { readFileSync(fileFor(id)); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    },
    get(id) {
      try { return preferenceSchema.parse(JSON.parse(readFileSync(fileFor(id), 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; return { ...defaults }; }
    },
    set(id, value) {
      atomic(fileFor(id), preferenceSchema.parse(value));
      rmSync(transferFor(id), { force: true });
    },
    remove(id) { rmSync(fileFor(id), { force: true }); rmSync(transferFor(id), { force: true }); },
    transfer(id) {
      try { return JSON.parse(readFileSync(transferFor(id), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    saveTransfer(id, value) { atomic(transferFor(id), value); },
  };
}
export function validatePreferences(previous, patch, themes) {
  const keys = ['enhancement', 'theme', 'mode', 'outputStyle', 'projectMemory', 'agentProfileDirectory', 'agentMemory'];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !keys.includes(key))) throw new Error('无效的预设设置');
  const merged = { ...previous, ...patch };
  if (patch.outputStyle === null) delete merged.outputStyle;
  if (patch.projectMemory === null) delete merged.projectMemory;
  if (patch.agentProfileDirectory === null) delete merged.agentProfileDirectory;
  if (patch.agentMemory === null) delete merged.agentMemory;
  const value = preferenceSchema.parse(merged);
  if (!new Set(['product', 'host', 'omd', ...themes]).has(value.theme)) throw new Error('此主题不可用');
  return value;
}
