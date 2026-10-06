import React, { useMemo, useSyncExternalStore } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import palette from './themes/sources/pi/palette.json' with { type: 'json' };
import { piExtensionMessageDefinition, piExtensionMessageKind, piExtensionText } from './pi-extension-messages.mjs';

const css = `.omaa-pi-custom-message{min-width:0;box-sizing:border-box;padding:12px 16px;margin:6px 0;border-radius:3px;background:var(--omaa-pi-custom-bg);color:var(--omaa-pi-custom-text);overflow-wrap:anywhere}.omaa-pi-custom-message>header{color:var(--omaa-pi-custom-label);font-weight:700;white-space:pre-wrap;margin-bottom:8px}.omaa-pi-custom-message>div{min-width:0;color:inherit}.omaa-pi-custom-message :is(p,li){color:inherit}.omaa-pi-custom-message pre{max-width:100%;overflow:auto}`;

export function applyPiExtensionMessages(ctx) {
  ctx.effect(() => ctx.uiConversation.events.register(piExtensionMessageDefinition));
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.omaaPiCustomMessages = ''; style.textContent = css;
    document.head.append(style); return () => style.remove();
  });
  const subscribe = listener => ctx.on('theme/change', listener);
  const colorScheme = () => ctx.theme.getTheme().active.colorScheme;
  function PiExtensionMessage({ node, t }) {
    const mode = useSyncExternalStore(subscribe, colorScheme);
    const labels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied'),
      toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
      footnotes: t('markdown.footnotes') }), [t]);
    const message = node.data.message;
    if (!message.source.display) return null;
    const roles = palette.variants[mode].palette;
    return <section className="omaa-pi-custom-message" aria-label={`Pi 扩展消息：${message.source.customType}`}
      style={{ '--omaa-pi-custom-bg': roles.customMessageBg.browserValue,
        '--omaa-pi-custom-text': roles.customMessageText.browserValue, '--omaa-pi-custom-label': roles.customMessageLabel.browserValue }}>
      <header>[{message.source.customType}]</header>
      <div><MarkdownText text={piExtensionText(message.content)} labels={labels}/></div>
    </section>;
  }
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: piExtensionMessageKind, locale: 'chat' }, PiExtensionMessage));
}
