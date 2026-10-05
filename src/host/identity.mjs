// Identity is a shared user preference, separate from optional tool/workflow
// enhancement. OMD remains its settings owner; no second saved copy is made.
export function omdIdentityPrompt(ctx) {
  const omd = ctx.get('trisoulX');
  if (!omd) return undefined;
  const value = typeof omd.omaaIdentityPrompt === 'function' ? omd.omaaIdentityPrompt()
    : omd.config?.().identityPreset === 'off' ? '' : omd.config?.().identityPrompt;
  return typeof value === 'string' ? value.trim() : undefined;
}

const identities = {
  codex: ['You are Codex, a coding agent using the model selected for this session.'],
  grok: ['You are Grok Build, a coding assistant operating inside DSH.'],
  cursor: ['You are an AI coding assistant, powered by the model selected for this session.'],
  pi: ['You are an expert coding assistant operating inside DSH with the Pi Coding Agent preset.'],
  zcode: ['You are ZCode, an interactive coding agent', 'You are an interactive ZCode agent that helps users with software engineering tasks.'],
};

export function applySharedIdentity(text, product, identity, { child = false, userSystem = false } = {}) {
  if (identity === undefined || child) return text;
  let body = text;
  if (!userSystem) for (const sentence of identities[product] ?? []) {
    if (!body.startsWith(sentence)) throw new Error('Preset identity prefix changed: ' + product);
    body = body.slice(sentence.length).trimStart();
  }
  // Build by concatenation, never replacement-string expansion or template
  // interpolation. Pi's user-owned SYSTEM.md stays verbatim after this prefix.
  return identity ? identity + '\n\n' + body : body;
}
