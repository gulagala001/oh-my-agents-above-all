// Derived from fixed Apache-2.0 ZCode 3.15.1 sources at aac4755; see THIRD_PARTY_NOTICES.md.
function normalizePersona(name, persona) {
  const base = {};
  if (typeof persona === "string") {
    base.system = persona;
  } else if (persona !== null && typeof persona === "object") {
    if (typeof persona.name === "string") base.name = persona.name;
    if (typeof persona.system === "string") base.system = persona.system;
    if (typeof persona.model === "string") base.model = persona.model;
  }
  if (base.name === void 0 && name !== void 0) base.name = name;
  return base;
}
function personaIdentity(persona) {
  const { model: _model, ...identity } = persona;
  void _model;
  return identity;
}
export {
  normalizePersona,
  personaIdentity
};
