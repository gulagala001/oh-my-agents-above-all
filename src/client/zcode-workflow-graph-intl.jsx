import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { zcodeGraphMessages } from './zcode-workflow-graph-messages.mjs';

const GraphIntl = createContext(null);
const hostLocale = () => typeof document === 'undefined' ? 'zh-CN' : document.documentElement.lang || 'zh-CN';
const subscribeLocale = listener => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
};
const normalizeLocale = locale => /^en(?:-|$)/i.test(locale || '') ? 'en-US' : 'zh-CN';
const instance = locale => ({
  // Same public formatting contract and replacement policy as the original
  // ZCode IntlProvider. Locale settings and service ownership stay with DSH.
  formatMessage({ id }, values) {
    let text = zcodeGraphMessages[locale][id] ?? id;
    if (values) for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{${key}}`, String(value));
    return text;
  },
});

export function ZCodeGraphIntlProvider({ children, locale }) {
  const existing = useSyncExternalStore(subscribeLocale, hostLocale, () => 'zh-CN');
  const language = normalizeLocale(locale || existing);
  const value = useMemo(() => ({ locale: language, intl: instance(language) }), [language]);
  return <GraphIntl.Provider value={value}>{children}</GraphIntl.Provider>;
}

export function useZCodeIntl() {
  const value = useContext(GraphIntl);
  if (!value) throw new Error('ZCode workflow graph requires its locale provider.');
  return value;
}
