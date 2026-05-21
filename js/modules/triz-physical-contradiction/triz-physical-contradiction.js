/**
 * D.Mike — TRIZ Physical Contradiction Module (triz-physical-contradiction.js)
 * Improve / Innovation: name a single parameter that must take two opposite
 * values at the same time, then resolve the contradiction via one of the four
 * separation principles (time / space / condition / system level).
 *
 * Spec: docs/modules/TRIZ-PHYSICAL-CONTRADICTION.md
 */

const PRINCIPLES = ['time', 'space', 'condition', 'system'];

function emptyPrincipleNotes() {
  return { time: '', space: '', condition: '', system: '' };
}

export default {
  id: 'triz-physical-contradiction',
  phase: 'improve',
  icon: 'split',
  i18nKey: 'modules.triz-physical-contradiction',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,

  /** @type {string} */ _parameter: '',
  /** @type {string} */ _requirementA: '',
  /** @type {string} */ _requirementNotA: '',
  /** @type {string} */ _problemNote: '',
  /** @type {{time:string,space:string,condition:string,system:string}} */
  _principleNotes: emptyPrincipleNotes(),
  /** @type {'time'|'space'|'condition'|'system'|null} */
  _selectedPrinciple: null,
  /** @type {string} */ _solutionNote: '',

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
      parameter: this._parameter,
      requirementA: this._requirementA,
      requirementNotA: this._requirementNotA,
      problemNote: this._problemNote,
      principleNotes: { ...this._principleNotes },
      selectedPrinciple: this._selectedPrinciple,
      solutionNote: this._solutionNote,
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container) this._render();
  },

  _restore(data) {
    this._parameter = typeof data?.parameter === 'string' ? data.parameter : '';
    this._requirementA = typeof data?.requirementA === 'string' ? data.requirementA : '';
    this._requirementNotA = typeof data?.requirementNotA === 'string' ? data.requirementNotA : '';
    this._problemNote = typeof data?.problemNote === 'string' ? data.problemNote : '';
    const pn = data?.principleNotes;
    this._principleNotes = {
      time:      typeof pn?.time      === 'string' ? pn.time      : '',
      space:     typeof pn?.space     === 'string' ? pn.space     : '',
      condition: typeof pn?.condition === 'string' ? pn.condition : '',
      system:    typeof pn?.system    === 'string' ? pn.system    : '',
    };
    this._selectedPrinciple = PRINCIPLES.includes(data?.selectedPrinciple) ? data.selectedPrinciple : null;
    this._solutionNote = typeof data?.solutionNote === 'string' ? data.solutionNote : '';
  },

  /**
   * Load a catalog example. Mirrors the API used by the other TRIZ modules.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._parameter || this._requirementA || this._requirementNotA || this._problemNote
      || PRINCIPLES.some(p => this._principleNotes[p]) || this._selectedPrinciple || this._solutionNote);
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

  help: () => import('./triz-physical-contradiction-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.triz-physical-contradiction.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container triz-pc">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-physical-contradiction.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-pc__body">

          <section class="triz-pc__section">
            <h3 class="triz-pc__section-title">${t('problemHeading')}</h3>

            <div class="triz-pc__field">
              <label class="triz-pc__label" for="triz-pc-param">${t('parameterLabel')}</label>
              <input
                id="triz-pc-param"
                class="field triz-pc__input"
                type="text"
                data-role="parameter"
                value="${this._escape(this._parameter)}"
                placeholder="${t('parameterPlaceholder')}"
              />
            </div>

            <div class="triz-pc__requirements">
              <div class="triz-pc__field triz-pc__field--a">
                <label class="triz-pc__label triz-pc__label--a" for="triz-pc-a">
                  <span class="triz-pc__dot triz-pc__dot--a"></span>${t('requirementALabel')}
                </label>
                <input
                  id="triz-pc-a"
                  class="field triz-pc__input"
                  type="text"
                  data-role="requirement-a"
                  value="${this._escape(this._requirementA)}"
                  placeholder="${t('requirementAPlaceholder')}"
                />
              </div>
              <button class="btn btn--sm triz-pc__swap-btn" type="button" data-action="swap" title="${t('swap')}" aria-label="${t('swap')}">⇅</button>
              <div class="triz-pc__field triz-pc__field--b">
                <label class="triz-pc__label triz-pc__label--b" for="triz-pc-b">
                  <span class="triz-pc__dot triz-pc__dot--b"></span>${t('requirementNotALabel')}
                </label>
                <input
                  id="triz-pc-b"
                  class="field triz-pc__input"
                  type="text"
                  data-role="requirement-not-a"
                  value="${this._escape(this._requirementNotA)}"
                  placeholder="${t('requirementNotAPlaceholder')}"
                />
              </div>
            </div>

            <div class="triz-pc__field">
              <label class="triz-pc__label" for="triz-pc-note">${t('problemNoteLabel')}</label>
              <textarea
                id="triz-pc-note"
                class="field triz-pc__textarea"
                rows="2"
                data-role="problem-note"
                placeholder="${t('problemNotePlaceholder')}"
              >${this._escape(this._problemNote)}</textarea>
            </div>
          </section>

          <section class="triz-pc__section">
            <h3 class="triz-pc__section-title">${t('separationHeading')}</h3>
            <p class="triz-pc__hint">${t('separationHint')}</p>
            <div class="triz-pc__principles" role="radiogroup" aria-label="${t('separationHeading')}">
              ${PRINCIPLES.map((p, i) => this._renderPrinciple(p, i + 1, t)).join('')}
            </div>
          </section>

          ${this._selectedPrinciple ? this._renderSolution(t) : ''}
        </div>
      </div>
    `;

    this._wire();
  },

  _renderPrinciple(key, num, t) {
    const isSel = this._selectedPrinciple === key;
    const note = this._principleNotes[key] || '';
    return `
      <article class="triz-pc__principle${isSel ? ' is-selected' : ''}" data-principle="${key}">
        <header class="triz-pc__principle-head">
          <span class="triz-pc__principle-num">${num}</span>
          <span class="triz-pc__principle-icon" aria-hidden="true">${t(`principles.${key}.icon`)}</span>
          <h4 class="triz-pc__principle-title">${t(`principles.${key}.name`)}</h4>
        </header>
        <p class="triz-pc__principle-question">${t(`principles.${key}.question`)}</p>
        <p class="triz-pc__principle-example"><em>${t('exampleLead')}:</em> ${t(`principles.${key}.example`)}</p>
        <textarea
          class="field triz-pc__principle-note"
          rows="3"
          data-role="principle-note"
          data-principle="${key}"
          placeholder="${t('principleNotePlaceholder')}"
        >${this._escape(note)}</textarea>
        <label class="triz-pc__principle-select">
          <input
            type="radio"
            name="triz-pc-selected-${this._context.instanceId}"
            value="${key}"
            data-role="select-principle"
            ${isSel ? 'checked' : ''}
          />
          <span>${t('selectPrinciple')}</span>
        </label>
      </article>
    `;
  },

  _renderSolution(t) {
    const key = this._selectedPrinciple;
    return `
      <section class="triz-pc__section triz-pc__solution">
        <h3 class="triz-pc__section-title">${t('solutionHeading')}</h3>
        <p class="triz-pc__solution-chosen">${t('chosenPrinciple')}: <strong>${t(`principles.${key}.name`)}</strong></p>
        <textarea
          class="field triz-pc__textarea"
          rows="3"
          data-role="solution-note"
          placeholder="${t('solutionPlaceholder')}"
        >${this._escape(this._solutionNote)}</textarea>
      </section>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    c.querySelector('[data-role="parameter"]')?.addEventListener('input', (e) => {
      this._parameter = e.target.value;
      this._persist();
    });

    c.querySelector('[data-role="requirement-a"]')?.addEventListener('input', (e) => {
      this._requirementA = e.target.value;
      this._persist();
    });

    c.querySelector('[data-role="requirement-not-a"]')?.addEventListener('input', (e) => {
      this._requirementNotA = e.target.value;
      this._persist();
    });

    c.querySelector('[data-role="problem-note"]')?.addEventListener('input', (e) => {
      this._problemNote = e.target.value;
      this._persist();
    });

    c.querySelectorAll('[data-role="principle-note"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const key = e.currentTarget.dataset.principle;
        if (!PRINCIPLES.includes(key)) return;
        this._principleNotes[key] = e.target.value;
        this._persist();
      });
    });

    c.querySelectorAll('[data-role="select-principle"]').forEach(el => {
      el.addEventListener('change', (e) => {
        const v = e.target.value;
        if (!PRINCIPLES.includes(v)) return;
        this._selectedPrinciple = v;
        this._persist();
        this._render();
      });
    });

    c.querySelector('[data-role="solution-note"]')?.addEventListener('input', (e) => {
      this._solutionNote = e.target.value;
      this._persist();
    });

    c.querySelector('[data-action="swap"]')?.addEventListener('click', () => {
      const a = this._requirementA;
      this._requirementA = this._requirementNotA;
      this._requirementNotA = a;
      this._persist();
      this._render();
    });
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
