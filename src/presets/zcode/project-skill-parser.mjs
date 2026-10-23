import { basename, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Derived from fixed ZCode 3.15.1 skills/index.ts and shared/skill-scan-policy.
// The native registry requires kebab names and nonempty catalog descriptions;
// never normalize a different original name into a seemingly identical skill.
const excluded = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '.cache', '.next', '.turbo', '.venv', '__pycache__']);
export function shouldScanProjectSkillDirectory(name) {
  return !excluded.has(name) && (!name.startsWith('.') || name === '.system');
}

function parsePlainProjectSkill(raw, lexicalPath) {
  const normalized = raw.replace(/^\uFEFF/, '');
  // Native YAML invocation fields remain authoritative. Do not reinterpret a
  // malformed or incomplete metadata header as ordinary invocable Markdown.
  if (normalized.split(/\r?\n/, 1)[0]?.trim() === '---') return undefined;
  const name = basename(dirname(lexicalPath));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return undefined;
  return { name, description: `Project skill ${name}; no description was declared in its Markdown source.`,
    content: raw.trim(), invocation: { modelInvocable: true, userInvocable: true },
    metadata: { omaaProjectSkill: { format: 'plain-markdown', declaredDescription: false,
      compatibility: 'Native kebab-name/default-invocation adaptation; catalog description is an explicit placeholder.' } } };
}

// Fixed core skillHandler performs only these two directory substitutions.
// A callback keeps '$&' and '$`' in a real directory name literal.
export function expandProjectSkillDirectory(content, directory) {
  return content.replace(/\$\{(CLAUDE_SKILL_DIR|ZCODE_SKILL_DIR)\}/gu, () => directory);
}

// YAML/frontmatter and invocation rules are transcribed from fixed DSH d743
// skill-filesystem/src/index.ts. The registry still decides invocation access.
export function parseProjectSkill(raw, lexicalPath) {
  const normalized = raw.replace(/^\uFEFF/, '');
  if (normalized.split(/\r?\n/, 1)[0]?.trim() !== '---') return parsePlainProjectSkill(raw, lexicalPath);
  const firstEnd = normalized.indexOf('\n');
  if (firstEnd < 0 || normalized.slice(0, firstEnd).replace(/\r$/, '') !== '---') return undefined;
  let start = firstEnd + 1, closing;
  while (start <= normalized.length) {
    const newline = normalized.indexOf('\n', start), end = newline < 0 ? normalized.length : newline;
    if (normalized.slice(start, end).replace(/\r$/, '') === '---') {
      closing = { start, bodyStart: newline < 0 ? normalized.length : newline + 1 }; break;
    }
    if (newline < 0) break;
    start = newline + 1;
  }
  if (!closing) return undefined;
  const data = parseYaml(normalized.slice(firstEnd + 1, closing.start));
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  if (typeof data.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name)
    || typeof data.description !== 'string' || !data.description.length) return undefined;
  for (const [legacy, canonical] of [['disableModelInvocation', 'disable-model-invocation'],
    ['modelInvocable', 'disable-model-invocation'], ['userInvocable', 'user-invocable']]) {
    if (Object.hasOwn(data, legacy)) throw Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
  }
  const invocation = { modelInvocable: booleanField(data, 'disable-model-invocation') !== true,
    userInvocable: booleanField(data, 'user-invocable') !== false };
  return { name: data.name, description: data.description, invocation,
    ...(typeof data.whenToUse === 'string' && data.whenToUse.length ? { whenToUse: data.whenToUse } : {}),
    ...(data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? { metadata: data.metadata } : {}),
    content: normalized.slice(closing.bodyStart).trim() };
}
function booleanField(data, key) {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    if (['true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (['false', 'no', 'off'].includes(value.toLowerCase())) return false;
  }
  throw TypeError(`frontmatter field "${key}" must be a boolean`);
}
