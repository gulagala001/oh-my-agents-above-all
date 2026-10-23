import { isDeepStrictEqual } from 'node:util';
import { checkSiteStability, spliceHoleBody } from '../../../lib/zcode-workflow-compiler.mjs';

// The pinned 3.15.1 lowerer produces the fill expression itself. Never accept
// caller-supplied JavaScript or a replacement script for a live lexical hole.
export function validateFill(current, revised, { siteId, body, spliced } = {}) {
  const reject = detail => ({ ok: false, reason: 'invalid_fill', detail });
  if (!current?.ok || !revised?.ok || typeof siteId !== 'string' || typeof body !== 'string')
    return reject('A live fill needs compiled current and revised workflow sources.');
  const insertion = spliced ?? spliceHoleBody(current.script, current.sites, siteId, body);
  if (!insertion || revised.script !== insertion.text) return reject('A live fill may only insert a body at the requested open hole.');
  const stability = checkSiteStability(current.sites, revised.sites, siteId, insertion.insertedAtLine, insertion.insertedLines);
  if (!stability.ok) return reject(stability.detail);
  for (const [id, spec] of current.askSpecs) {
    if (!revised.askSpecs.has(id) || !isDeepStrictEqual(spec, revised.askSpecs.get(id)))
      return reject('An existing ask contract changed during the fill: ' + id);
  }
  if (!(current.sitePhases instanceof Map) || !(revised.sitePhases instanceof Map)
    || !Array.isArray(revised.phaseNames) || !Array.isArray(revised.holes))
    return reject('The compiled workflow is missing its original lexical phase tables.');
  for (const [id, phase] of current.sitePhases) {
    // The original temporal analyzer stops issuing the target as a step when
    // its body is filled; its named phase survives in the phase vocabulary.
    if (id === siteId && !revised.sitePhases.has(id)) continue;
    if (revised.sitePhases.get(id) !== phase) return reject('An existing lexical birth phase changed during the fill: ' + id);
  }
  const models = new Set(current.modelReferences.map(reference => reference.name));
  if (revised.modelReferences.some(reference => !models.has(reference.name)))
    return reject('A live fill cannot add a model route that was not resolved when the run started.');
  const original = current.sites.holes.find(site => site.id === siteId);
  const filled = revised.sites.holes.find(site => site.id === siteId);
  if (!original || original.body !== undefined || !filled?.body || filled.name !== original.name
    || filled.typeText !== original.typeText || filled.tail !== original.tail || filled.fill !== original.fill)
    return reject('The requested hole identity or return contract changed during the fill.');
  const code = revised.lowered.holeBodies?.[siteId];
  if (typeof code !== 'string' || !code) return reject('The revised lowerer did not produce a body for this hole.');
  return { ok: true, code, spliced: insertion };
}

export { spliceHoleBody };
