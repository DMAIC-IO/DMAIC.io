/** Gemeinsame i18n-Attrappe für Tests, die die Widget-Direktive einhängen. */
export const WIDGET_I18N = { t: (k, p) => (p ? `${k}:${p.message ?? JSON.stringify(p)}` : k), getLanguage: () => 'de' };
