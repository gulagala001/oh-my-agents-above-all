// Derived from version-pinned Apache-2.0 ZCode artifact sources; see source.json and THIRD_PARTY_NOTICES.md.
import { refToString } from "./zcode-artifact-shared.mjs";
function primaryArtifactId(state) {
  for (const [id, idState] of state.artifacts) if (idState.primary) return id;
  return void 0;
}
function primaryConflict(state, id, primary) {
  if (!primary) return void 0;
  const holder = primaryArtifactId(state);
  return holder === void 0 || holder === id ? void 0 : holder;
}
function primaryConflictMessage(id, holder, fix, instance) {
  const where = instance === void 0 ? "" : ` (at ${refToString(instance)})`;
  return `Cannot mark "${id}" as primary${where}: "${holder}" is already this run's primary artifact. A run has one deliverable; ${fix}, or publish it as a new version of "${holder}".`;
}
export {
  primaryArtifactId,
  primaryConflict,
  primaryConflictMessage
};
