import { buildPromptSections, promptOptions } from './prompt.mjs';
import { applySharedIdentity } from '../../host/identity.mjs';

// Keep the native rendered sections around Pi's three owned sections. The
// guest can synchronously render the same mutable options for chained hooks;
// host admission still uses the native assembly and tool registry.
export function promptFrame(sections, { tools, cwd, customTools, catalog, identity, child = false }) {
  const options = promptOptions({ tools, cwd, customTools });
  if (catalog.system?.text) options.customPrompt = catalog.system.text;
  options.appendSystemPrompt = catalog.append?.text ?? '';
  if (catalog.globalContext) options.contextFiles = [{ path: catalog.globalContext.file, content: catalog.globalContext.text }];
  return { sections, options, ...(identity === undefined ? {} : { identity }), child };
}

export function renderPromptFrame(frame, options = frame.options) {
  if (options.forceSystemPrompt !== undefined) {
    if (typeof options.forceSystemPrompt !== 'string') throw Error('Pi forced system prompt must be text.');
    return [{ name: 'omaa:pi-forced-prompt', text: options.forceSystemPrompt }];
  }
  // Native request declarations are authoritative. The current host adapter
  // does not implement prepareLoadout, so extensions cannot hide a declared
  // tool by editing this derived prompt field alone.
  const pi = buildPromptSections({ ...options, hiddenTools: frame.options.hiddenTools });
  const { addendum = '', project_context = '', ...persona } = pi;
  const body = Object.values(persona).join('\n\n');
  const prefix = applySharedIdentity(body, 'pi', frame.identity, { child: frame.child, userSystem: Boolean(options.customPrompt) });
  return frame.sections.map(section => ({ ...section, text: section.name === 'deployment:persona-prefix' ? prefix
    : section.name === 'omaa:pi-addendum' ? addendum : section.name === 'omaa:pi-global-context' ? project_context : section.text }));
}

export function promptFrameText(frame, options = frame.options) { return renderPromptFrame(frame, options).map(section => section.text).filter(Boolean).join('\n\n'); }
