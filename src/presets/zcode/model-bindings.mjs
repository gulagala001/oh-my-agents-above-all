// The public 3.15.1 compiler closes the model-name set at launch. Resolve only
// advertised native DSH routes; never guess a provider, alias, effort or tier.
export function checkedWorkflowSubagentModelInput(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('subagent_model must be a nonempty model name.');
  return value.trim();
}

// A separate canonical run choice, never a reserved entry in literal bindings.
export function checkedWorkflowSubagentModel(value) {
  const options = value?.options;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['canonical', 'options'].includes(key))
    || !options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))
    || ![options.provider, options.model].every(item => typeof item === 'string' && item.length > 0 && item === item.trim())
    || options.reasoningEffort !== undefined && (typeof options.reasoningEffort !== 'string' || !options.reasoningEffort || options.reasoningEffort !== options.reasoningEffort.trim())
    || value.canonical !== `${options.provider}/${options.model}${options.reasoningEffort === undefined ? '' : '$' + options.reasoningEffort}`)
    throw Error('Invalid native workflow subagent model choice.');
  return Object.freeze({ canonical: value.canonical, options: Object.freeze({ ...options }) });
}

export async function resolveWorkflowModelBindings(ctx, references, signal, subagentModel) {
  const bindings = new Map(), diagnostics = [];
  const runLiteral = subagentModel === undefined ? undefined : checkedWorkflowSubagentModelInput(subagentModel);
  if (!references.length && runLiteral === undefined) return { bindings, diagnostics };
  const llm = ctx.get('llm');
  if (!llm?.listProviders || !llm.listModels) throw Error('Native model catalog is unavailable.');
  const catalogs = [], resolvedModels = new Map();
  for (const provider of llm.listProviders()) {
    signal.throwIfAborted();
    catalogs.push(...await llm.listModels(provider.id));
  }
  signal.throwIfAborted();
  let runChoice;
  const runReference = runLiteral === undefined ? undefined : { name: runLiteral, line: 1, column: 1 };
  for (const reference of [...references, ...(runReference === undefined ? [] : [runReference])]) {
    const literal = reference.name, normalized = literal.trim();
    const separator = normalized.indexOf('$');
    const hasEffort = separator > 0 && separator < normalized.length - 1;
    const id = hasEffort ? normalized.slice(0, separator) : normalized;
    const effort = hasEffort ? normalized.slice(separator + 1) : undefined;
    // A canonical provider/model route wins over another provider's identical
    // bare model ID. Only an absent exact route falls back to bare matching.
    const exact = catalogs.filter(model => `${model.provider}/${model.id}` === id);
    const matches = exact.length ? exact : catalogs.filter(model => model.id === id);
    const unique = new Map(matches.map(model => [JSON.stringify([model.provider, model.id]), model]));
    const location = { line: reference.line, column: reference.column };
    if (unique.size !== 1) {
      diagnostics.push({ ...location, code: 9011, message: unique.size
        ? `Model "${literal}" is ambiguous in the native catalog; use an exact provider/model id.`
        : `Model "${literal}" is not advertised by a registered native provider.` });
      continue;
    }
    const model = [...unique.values()][0];
    if (effort !== undefined) {
      // Fixed public DSH listModels returns lightweight LlmModelInfo without
      // reasoning. Only the exact-route resolver carries selectable efforts.
      if (typeof llm.resolveModelInfo !== 'function') throw Error('Native exact model metadata is unavailable.');
      const key = JSON.stringify([model.provider, model.id]);
      let resolved = resolvedModels.get(key);
      if (!resolved) {
        resolved = await llm.resolveModelInfo(model.provider, model.id, signal);
        signal.throwIfAborted();
        if (resolved?.provider !== model.provider || resolved.id !== model.id)
          throw Error('Native exact model metadata changed route identity.');
        resolvedModels.set(key, resolved);
      }
      if (!resolved.reasoning?.efforts.some(value => value.id === effort)) {
        diagnostics.push({ ...location, code: 9011, message: `Reasoning effort "${effort}" is not supported by ${model.provider}/${model.id}.` });
        continue;
      }
    }
    const options = Object.freeze({ provider: model.provider, model: model.id,
      ...(effort === undefined ? {} : { reasoningEffort: effort }) });
    if (reference === runReference) runChoice = checkedWorkflowSubagentModel({
      canonical: `${options.provider}/${options.model}${effort === undefined ? '' : '$' + effort}`, options });
    else bindings.set(literal, options);
  }
  return { bindings, diagnostics, ...(runChoice === undefined ? {} : { subagentModel: runChoice }) };
}
