/**
 * D.Mike — TRIZ Ideal Final Result Module (triz-ifr.js)
 * Improve / Innovation: state the ideal — useful function fulfilled, system
 * disappears, no harmful effect. Captures three IFR levels (system itself /
 * no system / supersystem resource) plus a gap analysis.
 *
 * Spec: docs/modules/TRIZ-IFR.md
 */

export default {
  id: 'triz-ifr',
  phase: 'improve',
  icon: 'target',
  i18nKey: 'modules.triz-ifr',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,

  /** @type {string} */ _system: '',
  /** @type {string} */ _usefulFunction: '',
  /** @type {string} */ _harmfulEffect: '',
  /** @type {string} */ _ifr1: '',
  /** @type {string} */ _ifr2: '',
  /** @type {string} */ _ifr3: '',
  /** @type {string} */ _obstacles: '',

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._restore(saved);

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme changes.
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      system: this._system,
      usefulFunction: this._usefulFunction,
      harmfulEffect: this._harmfulEffect,
      ifr1: this._ifr1,
      ifr2: this._ifr2,
      ifr3: this._ifr3,
      obstacles: this._obstacles,
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container) this._render();
  },

  _restore(data) {
    this._system         = typeof data?.system         === 'string' ? data.system         : '';
    this._usefulFunction = typeof data?.usefulFunction === 'string' ? data.usefulFunction : '';
    this._harmfulEffect  = typeof data?.harmfulEffect  === 'string' ? data.harmfulEffect  : '';
    this._ifr1           = typeof data?.ifr1           === 'string' ? data.ifr1           : '';
    this._ifr2           = typeof data?.ifr2           === 'string' ? data.ifr2           : '';
    this._ifr3           = typeof data?.ifr3           === 'string' ? data.ifr3           : '';
    this._obstacles      = typeof data?.obstacles      === 'string' ? data.obstacles      : '';
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._system || this._usefulFunction || this._harmfulEffect
      || this._ifr1 || this._ifr2 || this._ifr3 || this._obstacles);
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./triz-ifr-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.triz-ifr.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container triz-ifr">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-ifr.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-ifr__body">

          <section class="triz-ifr__section">
            <h3 class="triz-ifr__section-title">${t('taskHeading')}</h3>
            <div class="triz-ifr__field">
              <label class="triz-ifr__label" for="triz-ifr-system">${t('systemLabel')}</label>
              <input id="triz-ifr-system" class="field" type="text"
                data-role="system"
                value="${this._escape(this._system)}"
                placeholder="${t('systemPlaceholder')}" />
            </div>
            <div class="triz-ifr__field">
              <label class="triz-ifr__label" for="triz-ifr-useful">${t('usefulLabel')}</label>
              <input id="triz-ifr-useful" class="field" type="text"
                data-role="useful"
                value="${this._escape(this._usefulFunction)}"
                placeholder="${t('usefulPlaceholder')}" />
            </div>
            <div class="triz-ifr__field">
              <label class="triz-ifr__label" for="triz-ifr-harmful">${t('harmfulLabel')}</label>
              <input id="triz-ifr-harmful" class="field" type="text"
                data-role="harmful"
                value="${this._escape(this._harmfulEffect)}"
                placeholder="${t('harmfulPlaceholder')}" />
            </div>
          </section>

          <section class="triz-ifr__section">
            <h3 class="triz-ifr__section-title">${t('ifrHeading')}</h3>
            <p class="triz-ifr__hint">${t('ifrHint')}</p>

            ${this._renderIfrLevel(1, 'ifr1', this._ifr1, t)}
            ${this._renderIfrLevel(2, 'ifr2', this._ifr2, t)}
            ${this._renderIfrLevel(3, 'ifr3', this._ifr3, t)}
          </section>

          <section class="triz-ifr__section">
            <h3 class="triz-ifr__section-title">${t('obstaclesHeading')}</h3>
            <p class="triz-ifr__hint">${t('obstaclesHint')}</p>
            <textarea
              class="field triz-ifr__textarea triz-ifr__obstacles"
              rows="4"
              data-role="obstacles"
              placeholder="${t('obstaclesPlaceholder')}"
            >${this._escape(this._obstacles)}</textarea>
          </section>

          <section class="triz-ifr__actions">
            <button class="btn btn--sm triz-ifr__resources-btn" type="button" data-action="open-resources">
              ${t('openResources')}
            </button>
            <div class="triz-ifr__spacer"></div>
            <button class="btn btn--sm" type="button" data-action="example">${t('loadExample')}</button>
            <button class="btn btn--sm" type="button" data-action="reset">${t('reset')}</button>
          </section>
        </div>
      </div>
    `;

    this._wire();
  },

  _renderIfrLevel(num, key, value, t) {
    return `
      <div class="triz-ifr__level">
        <div class="triz-ifr__level-head">
          <span class="triz-ifr__level-num">IFR-${num}</span>
          <span class="triz-ifr__level-title">${t(`ifr${num}Title`)}</span>
        </div>
        <p class="triz-ifr__level-desc">${t(`ifr${num}Desc`)}</p>
        <textarea
          class="field triz-ifr__textarea"
          rows="2"
          data-role="${key}"
          placeholder="${t(`ifr${num}Placeholder`)}"
        >${this._escape(value)}</textarea>
      </div>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    const bind = (sel, field) => {
      c.querySelector(`[data-role="${sel}"]`)?.addEventListener('input', (e) => {
        this[field] = e.target.value;
        this._persist();
      });
    };
    bind('system',    '_system');
    bind('useful',    '_usefulFunction');
    bind('harmful',   '_harmfulEffect');
    bind('ifr1',      '_ifr1');
    bind('ifr2',      '_ifr2');
    bind('ifr3',      '_ifr3');
    bind('obstacles', '_obstacles');

    c.querySelector('[data-action="example"]')?.addEventListener('click', () => this._loadBuiltInExample());
    c.querySelector('[data-action="reset"]')?.addEventListener('click', () => this._reset());
    c.querySelector('[data-action="open-resources"]')?.addEventListener('click', () => this._openResources());
  },

  _openResources() {
    // The workspace currently has no programmatic "add module" API, so we just
    // surface a hint that points the user at the extras tile.  Once such an API
    // exists, this can switch to an event-driven add.
    this._context.notify?.(this._context.i18n.t('modules.triz-ifr.openResourcesHint'), 'info');
  },

  _loadBuiltInExample() {
    const ex = this._context.i18n.t('modules.triz-ifr.example');
    if (!ex || typeof ex !== 'object') return;
    this._system         = String(ex.system         ?? '');
    this._usefulFunction = String(ex.usefulFunction ?? '');
    this._harmfulEffect  = String(ex.harmfulEffect  ?? '');
    this._ifr1           = String(ex.ifr1           ?? '');
    this._ifr2           = String(ex.ifr2           ?? '');
    this._ifr3           = String(ex.ifr3           ?? '');
    this._obstacles      = String(ex.obstacles      ?? '');
    this._persist();
    this._render();
  },

  async _reset() {
    const ctx = this._context;
    const ok = await ctx.showModal?.confirm?.({
      title: ctx.i18n.t('modules.triz-ifr.resetTitle'),
      message: ctx.i18n.t('modules.triz-ifr.resetMessage'),
      confirmText: ctx.i18n.t('modules.triz-ifr.reset'),
      cancelText: ctx.i18n.t('common.cancel'),
    });
    if (ok === false) return;
    this._system = '';
    this._usefulFunction = '';
    this._harmfulEffect = '';
    this._ifr1 = '';
    this._ifr2 = '';
    this._ifr3 = '';
    this._obstacles = '';
    this._persist();
    this._render();
  },

  _persist() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  },
};
