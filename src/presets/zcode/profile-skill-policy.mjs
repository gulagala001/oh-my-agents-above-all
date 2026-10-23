// These are routing claims, never authorization by themselves. An owned
// reader must verify the full native descriptor and admission before serving.
export const PROFILE_SKILL_PRESET_PREFIX = 'omaa-zcode-profile-skills-';
export const PROFILE_SKILL_ADMISSION = 'plugin:omaa/zcode/profile-skills-admission';
export const PROFILE_SKILL_ROUTING_KEY = 'omaaZcodeProfileSkillsRouting';
export const PROFILE_SKILL_SOURCE_EVENTS = 100000;
export const PROFILE_SKILL_PRESET = PROFILE_SKILL_PRESET_PREFIX + 'local';
// Shared with the build's declarative composition. No parent configuration is
// written into a Session; live/cold readers compare its complete declaration.
export function profileSkillPresetPlugins(basePlugins) {
  if (!Array.isArray(basePlugins)) throw Error('A profile skill preset needs an explicit base composition.');
  let count = 0;
  const withoutFilesystem = (rows, depth = 0) => {
    if (!Array.isArray(rows) || depth > 32) throw Error('The base skill composition exceeds its bounded plugin tree.');
    return rows.flatMap(row => {
    if (++count > 2048 || !row || typeof row !== 'object' || Array.isArray(row) || typeof row.name !== 'string')
      throw Error('The base skill composition has no bounded explicit plugin tree.');
    if (row.name === '@deepseek-ai/dsh-skill-filesystem') return [];
    return [{ ...row, ...(row.group === true ? { config: withoutFilesystem(row.config, depth + 1) } : {}) }];
    });
  };
  return [{ id: 'profile-skills', name: 'cordis:group', group: true, isolate: { skills: true }, config: [
    { id: 'profile-skill-view', name: 'oh-my-agents-above-all/zcode-profile-skills' },
    ...withoutFilesystem(basePlugins),
  ] }];
}
export const PROFILE_SKILL_PROVIDERS = [
  'omaa-zcode-profile-snapshot-agents-skills-',
  'omaa-zcode-profile-no-agents-skills-',
  'omaa-zcode-profile-snapshot-agents-plan-skills-',
  'omaa-zcode-profile-no-agents-plan-skills-',
];
export function isProfileSkillProvider(provider) {
  return typeof provider === 'string' && PROFILE_SKILL_PROVIDERS.some(prefix => provider.startsWith(prefix));
}
export function claimsProfileSkills(observation) {
  // A registered native projection is a routing hint over the complete cut,
  // never authority to serve a restricted view. Ordinary sessions retain
  // native catalog behavior without this feature's full-source scan bound.
  const projected = observation.projections?.values[PROFILE_SKILL_ROUTING_KEY];
  if (typeof projected === 'boolean') return projected;
  // The public observation may already have read the full log; this is a
  // routing/scan admission bound, not an atomic persistence I/O ceiling.
  // Beyond it, fail rather than delegate an unexamined restricted suffix.
  if (!Array.isArray(observation.events) || observation.events.length > PROFILE_SKILL_SOURCE_EVENTS)
    throw Error('Skill catalog ownership routing exceeds its 100000-event verification bound; no global fallback was used.');
  const preset = observation.projections?.values.agentPreset ?? observation.header.agentPreset;
  return typeof preset === 'string' && preset.startsWith(PROFILE_SKILL_PRESET_PREFIX)
    || observation.events.some(event => event.type === PROFILE_SKILL_ADMISSION
      || event.type === 'subagent/descriptor' && isProfileSkillProvider(event.data?.provider));
}
