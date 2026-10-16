/**
 * D.Mike — Internationalization Engine (i18n.js)
 * Handles language loading, key translation, interpolation,
 * and auto-updating the DOM on language switch.
 *
 * Default language: German ('de').
 * Fallback chain: active language → 'en' → key itself.
 */

export class I18n {
  /**
   * @param {string} [defaultLang='de']
   */
  constructor(defaultLang = 'de') {
    this._lang = defaultLang;
    /** @type {Map<string, object>} */
    this._cache = new Map();
    this._eventBus = null;
    this._stateManager = null;
  }

  /**
   * Connect to core services (called after construction).
   * @param {import('./event-bus.js').EventBus} eventBus
   * @param {import('./state-manager.js').StateManager} stateManager
   */
  connect(eventBus, stateManager) {
    this._eventBus = eventBus;
    this._stateManager = stateManager;
  }

  /**
   * Fetch and cache a language file.
   * @param {string} lang
   */
  async loadLanguage(lang) {
    if (this._cache.has(lang)) return;
    const v = document.querySelector('meta[name="i18n-version"]')?.content;
    const url = v ? `i18n/${lang}.json?v=${v}` : `i18n/${lang}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[i18n] Could not load language: ${lang}`);
    this._cache.set(lang, await response.json());
  }

  /**
   * Switch active language, update DOM, emit event, persist preference.
   * @param {string} lang
   */
  async setLanguage(lang) {
    await this.loadLanguage(lang);
    this._lang = lang;
    this._updateDOM();
    this._stateManager?.set('settings.language', lang);
    this._eventBus?.emit('language:changed', { lang });
  }

  /**
   * Get the current language code.
   * @returns {string}
   */
  getLanguage() {
    return this._lang;
  }

  /**
   * Translate a key with optional interpolation.
   * @param {string} key - dot-separated, e.g. 'app.lastSaved'
   * @param {object} [params] - placeholder values, e.g. { time: '14:30' }
   * @returns {string}
   */
  t(key, params) {
    let value = this._resolve(key, this._lang)
             ?? this._resolve(key, 'en')
             ?? key;

    if (params) {
      value = value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
    }

    // Pluralization: if params.count is provided, select _zero / _one / _other
    if (params?.count !== undefined) {
      const pluralKey = params.count === 0 ? `${key}_zero`
                      : params.count === 1 ? `${key}_one`
                      : `${key}_other`;
      const pluralValue = this._resolve(pluralKey, this._lang)
                       ?? this._resolve(pluralKey, 'en');
      if (pluralValue) {
        value = pluralValue.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
      }
    }

    return value;
  }

  /**
   * Create a prefix-aware translation function for a module.
   * The returned function tries `prefix.key` first, then falls back to bare `key`.
   * @param {string} prefix - e.g. 'modules.triz-resources'
   * @returns {(key: string, params?: object) => string}
   */
  tf(prefix) {
    return (key, params) => {
      const prefixed = `${prefix  }.${  key}`;
      const result = this.t(prefixed, params);
      return result !== prefixed ? result : this.t(key, params);
    };
  }

  /**
   * Check if a translation key exists.
   * @param {string} key
   * @returns {boolean}
   */
  exists(key) {
    return this._resolve(key, this._lang) !== undefined
        || this._resolve(key, 'en') !== undefined;
  }

  /**
   * Return a deep copy of a translation subtree in a given language,
   * independent of the active language. Keys missing in `lang` are filled
   * from English. Used where strings leave the app (exported survey page).
   * @param {string} key dot-separated path, e.g. 'modules.survey-builder.runner'
   * @param {string} lang
   * @returns {Promise<object>}
   */
  async section(key, lang) {
    for (const l of new Set([lang, 'en'])) {
      if (!this._cache.has(l)) {
        try { await this.loadLanguage(l); } catch { /* fall back to what is cached */ }
      }
    }
    const merge = (base, over) => {
      if (!over || typeof over !== 'object') return base;
      const out = { ...base };
      for (const [k, v] of Object.entries(over)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v)
          ? merge(base?.[k] && typeof base[k] === 'object' ? base[k] : {}, v)
          : v;
      }
      return out;
    };
    const en = this._resolve(key, 'en');
    const own = lang === 'en' ? undefined : this._resolve(key, lang);
    return JSON.parse(JSON.stringify(merge(merge({}, en), own)));
  }

  /**
   * Register module translations at runtime.
   * @param {string} moduleId
   * @param {{ de: object, en: object }} translations
   */
  registerModuleTranslations(moduleId, translations) {
    for (const [lang, strings] of Object.entries(translations)) {
      const data = this._cache.get(lang) ?? {};
      if (!data.modules) data.modules = {};
      data.modules[moduleId] = { ...data.modules[moduleId], ...strings };
      this._cache.set(lang, data);
    }
  }

  // ─── DOM Auto-Update ────────────────────────────────────────

  /**
   * Scan the DOM and apply translations to all data-i18n* elements.
   */
  _updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', this.t(el.dataset.i18nAriaLabel));
    });
  }

  // ─── Internal ───────────────────────────────────────────────

  /**
   * Resolve a dot-separated key against a cached language object.
   * @param {string} key
   * @param {string} lang
   * @returns {string|undefined}
   */
  _resolve(key, lang) {
    const data = this._cache.get(lang);
    if (!data) return undefined;
    return key.split('.').reduce((obj, k) => obj?.[k], data);
  }
}
