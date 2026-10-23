import { HarnessError } from '@deepseek-ai/dsh-llm';

// Fixed ZCode 3.15.1 ListModels takes exactly {} and has a 24,000-byte model
// budget. Native admission bounds below are not upstream catalog limits.
const LIMITS = Object.freeze({ providers: 64, models: 512, efforts: 64, textChars: 1024, outputBytes: 24_000, timeoutMs: 10_000 });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const encodedBytes = value => Buffer.byteLength(JSON.stringify(value));
const failure = (code, message) => new HarnessError(message, 'OMAA_ZCODE_' + code);
const invalid = () => failure('INVALID_MODEL_CATALOG', 'model_catalog_invalid: native model metadata could not be represented faithfully; no complete catalog was returned.');
const unavailable = () => failure('MODEL_CATALOG_UNAVAILABLE', 'model_catalog_unavailable: this session cannot read and verify the native model catalog. This is not an empty configuration. Omit subagent_model to keep the session model.');
const tooLarge = () => failure('MODEL_CATALOG_LIMIT', 'model_catalog_limit: the native catalog exceeds this tool\'s bounded admission or 24000-byte response budget. No partial catalog was returned; do not infer that models are absent.');
const text = value => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.textChars;
const route = value => text(value) && value === value.trim() && !value.includes('$');

// listModels has no public AbortSignal argument. Stop this wait on cancellation
// and observe its eventual rejection; do not claim the adapter read was killed.
function abortableRead(work, signal) {
  const pending = Promise.resolve(work); pending.catch(() => {});
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function modelRow(provider, model, resolved) {
  if (!object(model) || model.provider !== provider.id || !route(model.id) || !text(model.name)
    || !object(resolved) || resolved.provider !== provider.id || resolved.id !== model.id || !text(resolved.name)) throw invalid();
  const row = { id: `${provider.id}/${model.id}`, providerId: provider.id, modelId: model.id,
    providerLabel: provider.name, reasoningLevels: [] };
  // Fixed public DSH resolveCallWithInfo rejects explicit efforts when exact
  // resolved reasoning is absent. The lightweight listModels omission alone
  // cannot establish this empty selectable-effort set.
  if (resolved.reasoning !== undefined) {
    const reasoning = resolved.reasoning;
    if (!object(reasoning) || !Array.isArray(reasoning.efforts) || reasoning.efforts.length === 0) throw invalid();
    if (reasoning.efforts.length > LIMITS.efforts) throw tooLarge();
    for (const effort of reasoning.efforts) {
      if (!object(effort) || !text(effort.id) || effort.id !== effort.id.trim() || row.reasoningLevels.includes(effort.id)) throw invalid();
      row.reasoningLevels.push(effort.id);
    }
    if (reasoning.defaultEffort !== undefined) {
      if (!row.reasoningLevels.includes(reasoning.defaultEffort)) throw invalid();
      row.defaultReasoningLevel = reasoning.defaultEffort;
    }
  }
  if (resolved.context !== undefined) {
    if (!object(resolved.context) || !Number.isSafeInteger(resolved.context.contextWindow) || resolved.context.contextWindow <= 0) throw invalid();
    row.contextWindow = resolved.context.contextWindow;
  }
  // No public metadata here proves credential/policy availability. Do not
  // manufacture disabledReason, or treat catalog membership as authorization.
  return row;
}

export function installListModelsTool(ctx) {
  const lifetime = new AbortController(), active = new Set();
  ctx.on('agent/disposed', ({ agent }) => {
    for (const call of active) if (call.agent === agent) call.control.abort(Error('Model catalog owner was disposed.'));
  }, { global: true });
  ctx.effect(() => () => lifetime.abort(Error('Model catalog tool scope disposed.')), 'ZCode model catalog reads');
  ctx.tools.register({ name: 'list_models', timeoutMs: LIMITS.timeoutMs,
    description: 'List the models advertised by this session\'s registered native DSH providers for choosing create_workflow/amend_workflow subagent_model. Takes exactly {}; there is no query, filter or pagination. Copy id verbatim and append $<level> only from reasoningLevels. This read does not change any model or execute inference. Native exact-route metadata supplies reasoningLevels, its advertised default and contextWindow when known. Catalog membership does not prove credentials, permissions or availability; disabledReason and current are omitted because these public interfaces do not prove them. The native catalog is read sequentially, not as an atomic registry snapshot. Empty means no advertised models, not no configured or usable model. Failed, invalid or oversized catalogs return an explicit error, never an empty or partial list. Native admission is bounded at 64 providers, 512 models, 64 efforts per model and 24000 JSON bytes.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (!object(args) || Object.keys(args).length) throw failure('INVALID_MODEL_CATALOG_INPUT', 'list_models takes exactly an empty object; query, filter and pagination are not supported.');
      const agent = exec.agent, control = new AbortController();
      const signal = AbortSignal.any([exec.signal, lifetime.signal, control.signal, AbortSignal.timeout(LIMITS.timeoutMs)]);
      const call = { agent, control };
      const llm = ctx.get('llm');
      const check = () => {
        signal.throwIfAborted();
        if (!agent || ctx.agents.get(agent.id) !== agent || ctx.get('sessions')?.get(agent.id) !== agent.session)
          throw failure('MODEL_CATALOG_OWNER_CHANGED', 'Model catalog reads require the same live owning agent and session.');
      };
      const read = async action => {
        check();
        let value;
        try { value = await abortableRead(Promise.resolve().then(() => { check(); return action(); }), signal); }
        catch { check(); throw unavailable(); }
        check(); return value;
      };
      active.add(call);
      try {
        check();
        if (!llm || !['listProviders', 'listModels', 'resolveModelInfo'].every(name => typeof llm[name] === 'function')) throw unavailable();
        const providers = await read(() => llm.listProviders());
        if (!Array.isArray(providers)) throw invalid();
        if (providers.length > LIMITS.providers) throw tooLarge();
        const output = { models: [], catalogScope: 'registered-native-providers', catalogConsistency: 'sequential-native-reads',
          currentSelectionAvailable: false, disabledStateAvailable: false,
          response: 'Current live model selection and disabled state are not supplied by this public catalog; omitted fields are not inferred.' };
        const providerIds = new Set(), modelIds = new Set(), canonicalIds = new Set();
        let modelCount = 0;
        for (const provider of providers) {
          check();
          if (!object(provider) || !route(provider.id) || !text(provider.name) || providerIds.has(provider.id)) throw invalid();
          providerIds.add(provider.id);
          const models = await read(() => llm.listModels(provider.id));
          if (!Array.isArray(models)) throw invalid();
          modelCount += models.length;
          if (modelCount > LIMITS.models) throw tooLarge();
          for (const model of models) {
            if (!object(model) || model.provider !== provider.id || !route(model.id) || !text(model.name)) throw invalid();
            const identity = JSON.stringify([provider.id, model.id]);
            if (modelIds.has(identity)) throw invalid(); modelIds.add(identity);
            const canonical = `${provider.id}/${model.id}`;
            if (canonicalIds.has(canonical)) throw invalid(); canonicalIds.add(canonical);
            const resolved = await read(() => llm.resolveModelInfo(provider.id, model.id, signal));
            output.models.push(modelRow(provider, model, resolved));
            if (encodedBytes(output) > LIMITS.outputBytes) throw tooLarge();
          }
        }
        if (!output.models.length) output.response = 'No models are advertised by the registered native providers. This does not prove that no model is configured or usable; omit subagent_model to keep the session model.';
        check();
        if (encodedBytes(output) > LIMITS.outputBytes) throw tooLarge();
        return output;
      } finally { active.delete(call); }
    },
  });
}
