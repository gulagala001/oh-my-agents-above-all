// Pi abe508e1 agent-session.ts _applyToolLoadout: active hooks see one original
// catalog; later descriptions win. The host owns admission and never changes
// execution registration or authorization from this presentation-only result.
export function prepareToolLoadout(frame, runtime, signal) {
  const { loadout, hooks } = frame;
  if (!loadout || !Array.isArray(hooks) || hooks.some(id => typeof id !== 'string')
    || ['declared', 'callable', 'registered'].some(key => !Array.isArray(loadout[key]))
    || !loadout.metadata || typeof loadout.metadata !== 'object') throw Error('Invalid Pi tool loadout');
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const tools = values => freeze(values.map(value => ({ ...value,
    // Native execution must pass through the host registry and its guards.
    execute() { throw Error('Direct execution from a Pi loadout descriptor is unsupported'); },
  })));
  const metadata = freeze(loadout.metadata);
  const view = Object.freeze({ declared: tools(loadout.declared), callable: tools(loadout.callable), registered: tools(loadout.registered),
    getExposure: name => Object.hasOwn(metadata, name) ? metadata[name].exposure : 'direct',
    getNamespace: name => Object.hasOwn(metadata, name) ? metadata[name].namespace : undefined,
    getPromptGuidelines: name => Object.hasOwn(metadata, name) ? metadata[name].promptGuidelines : Object.freeze([]),
  });
  const descriptions = new Map(), hidden = new Set(), errors = [];
  for (const id of hooks) {
    signal.throwIfAborted();
    const callback = runtime.callbacks.get(id);
    if (callback?.kind !== 'tool' || typeof callback.definition.prepareLoadout !== 'function') throw Error('Stale Pi loadout callback');
    try {
      const changes = callback.definition.prepareLoadout(view);
      if (changes?.then) {
        void Promise.resolve(changes).catch(() => {});
        throw Error('Pi prepareLoadout must return synchronously');
      }
      if (changes === undefined) continue;
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)
        || changes.descriptions !== undefined && (!changes.descriptions || typeof changes.descriptions !== 'object' || Array.isArray(changes.descriptions)
          || Object.values(changes.descriptions).some(value => typeof value !== 'string'))
        || changes.hiddenDeclarations !== undefined && (!Array.isArray(changes.hiddenDeclarations)
          || changes.hiddenDeclarations.some(name => typeof name !== 'string'))) throw Error('Invalid Pi prepareLoadout result');
      for (const [name, description] of Object.entries(changes.descriptions ?? {})) descriptions.set(name, description);
      for (const name of changes.hiddenDeclarations ?? []) hidden.add(name);
    } catch (error) {
      signal.throwIfAborted();
      errors.push({ toolName: callback.definition.name, error: String(error?.message ?? error).slice(0, 4096) });
    }
  }
  return { descriptions: Object.fromEntries(descriptions), hiddenDeclarations: [...hidden], errors };
}
