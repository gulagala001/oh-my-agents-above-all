// Pi display is a presentation choice: the original custom->user model
// projection includes hidden messages as well. Keep the native journal intact.
export const piExtensionMessageKind = 'omaa-pi-extension';

export function piExtensionText(content) {
  if (typeof content === 'string') return content;
  return (content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
}

export const piExtensionMessageDefinition = {
  kind: piExtensionMessageKind,
  target: 'chat',
  // The function form is shared by rc.2 and alpha.1. Only append-origin
  // events belong to the human transcript; replacement copies are model-only.
  match(event) {
    const source = event.data?.source;
    return event.type === 'user/message' && event.surfaceOp === 'append'
      && source?.kind === 'pi-extension' && typeof source.customType === 'string' && typeof source.display === 'boolean'
      ? { id: String(event.data.id), role: 'start' } : null;
  },
  start(_context, match) {
    return { message: match.event.data, seq: match.event.seq, time: match.event.time };
  },
  update: context => context.state,
  buildViewNode(context) {
    return {
      key: context.key, id: context.id, kind: piExtensionMessageKind, target: 'chat',
      anchorSeq: context.state.seq, location: context.start.location,
      visibility: context.state.message.source.display ? 'visible' : 'hidden', data: context.state,
    };
  },
};
