/**
 * D.Mike — TRIZ Substance-Field Analysis Module (triz-sufield.js)
 * Improve / Innovation: model the technical interaction as a substance-
 * substance-field triangle, diagnose the situation, and browse Altschuller's
 * 76 standard solutions filtered by situation.
 *
 * Spec: docs/modules/TRIZ-SUFIELD.md
 */

const DATA_PATH = 'js/modules/triz-sufield/data/standards.json';
let _dataPromise = null;
function loadData() {
  if (_dataPromise) return _dataPromise;
  _dataPromise = fetch(DATA_PATH, { cache: 'no-cache' })
    .then(r => r.json())
    .then(d => d.standards);
  return _dataPromise;
}

const FIELDS = ['M', 'A', 'T', 'C', 'E', 'Mg'];
const LINKS  = ['useful', 'insufficient', 'excessive', 'harmful', 'missing'];

/**
 * Map (field, link) → { situation, suggestedClasses }.
 * `situation` is an i18n key under `modules.triz-sufield.situation.*`.
 */
function diagnose(s1, s2, field, link) {
  const hasS1 = !!s1?.trim();
  const hasS2 = !!s2?.trim();
  if (!hasS1 || !hasS2) {
    return { situation: 'partial', suggestedClasses: [1] };
  }
  if (!field || link === 'missing') {
    return { situation: 'incomplete', suggestedClasses: [1] };
  }
  switch (link) {
    case 'useful':        return { situation: 'complete-useful',        suggestedClasses: [2, 3] };
    case 'insufficient':  return { situation: 'complete-insufficient',  suggestedClasses: [2] };
    case 'excessive':     return { situation: 'complete-excessive',     suggestedClasses: [2, 5] };
    case 'harmful':       return { situation: 'complete-harmful',       suggestedClasses: [1, 5] };
    default:              return { situation: 'incomplete',             suggestedClasses: [1] };
  }
}

export default {
  id: 'triz-sufield',
  phase: 'improve',
  icon: 'triangle',
  i18nKey: 'modules.triz-sufield',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,

  /** @type {string} */ _s1: '',
  /** @type {string} */ _s2: '',
  /** @type {'M'|'A'|'T'|'C'|'E'|'Mg'|''} */ _field: '',
  /** @type {'useful'|'insufficient'|'excessive'|'harmful'|'missing'|''} */ _link: '',
  /** @type {string} */ _problemNote: '',
  /** @type {Record<string,string>} */ _notes: {},
  /** @type {Record<string,boolean>} */ _selected: {},
  /** @type {'auto'|'all'} */ _filterMode: 'auto',
  /** @type {Set<number>} */ _expandedClasses: new Set(),
  /** @type {Array|null} */ _standards: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._restore(saved);

    container.innerHTML = `<div class="module-container triz-sf"><div class="module-container__body"><p class="triz-sf__loading">…</p></div></div>`;
    try {
      this._standards = await loadData();
    } catch (err) {
      console.error('[triz-sufield] data load failed:', err);
      container.innerHTML = `<div class="module-error"><div class="module-error__title">Daten konnten nicht geladen werden</div><div class="module-error__message">${err.message}</div></div>`;
      return;
    }

    // Default: all classes collapsed except the ones suggested by diagnosis.
    if (this._expandedClasses.size === 0) {
      const { suggestedClasses } = diagnose(this._s1, this._s2, this._field, this._link);
      suggestedClasses.forEach(c => this._expandedClasses.add(c));
    }

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
      s1: this._s1,
      s2: this._s2,
      field: this._field,
      link: this._link,
      problemNote: this._problemNote,
      notes: { ...this._notes },
      selected: { ...this._selected },
      filterMode: this._filterMode,
      expandedClasses: [...this._expandedClasses],
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container && this._standards) this._render();
  },

  _restore(data) {
    this._s1          = typeof data?.s1          === 'string' ? data.s1          : '';
    this._s2          = typeof data?.s2          === 'string' ? data.s2          : '';
    this._field       = FIELDS.includes(data?.field) ? data.field : '';
    this._link        = LINKS.includes(data?.link) ? data.link : '';
    this._problemNote = typeof data?.problemNote === 'string' ? data.problemNote : '';
    this._notes       = (data?.notes && typeof data.notes === 'object') ? { ...data.notes } : {};
    this._selected    = (data?.selected && typeof data.selected === 'object') ? { ...data.selected } : {};
    this._filterMode  = data?.filterMode === 'all' ? 'all' : 'auto';
    this._expandedClasses = new Set(Array.isArray(data?.expandedClasses) ? data.expandedClasses.filter(Number.isInteger) : []);
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._s1 || this._s2 || this._field || this._link
      || this._problemNote || Object.keys(this._notes).length || Object.keys(this._selected).length);
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

  help: () => import('./triz-sufield-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const lang = this._context.language || 'de';
    const t = (key, params) => i18n.t(`modules.triz-sufield.${key}`, params);

    const diag = diagnose(this._s1, this._s2, this._field, this._link);

    this._container.innerHTML = `
      <div class="module-container triz-sf">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-sufield.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-sf__body">

          <section class="triz-sf__model">
            <div class="triz-sf__inputs">
              <div class="triz-sf__field">
                <label class="triz-sf__label" for="triz-sf-s1">${t('s1Label')}</label>
                <input id="triz-sf-s1" class="field" type="text" data-role="s1"
                  value="${this._escape(this._s1)}" placeholder="${t('s1Placeholder')}" />
              </div>
              <div class="triz-sf__field">
                <label class="triz-sf__label" for="triz-sf-s2">${t('s2Label')}</label>
                <input id="triz-sf-s2" class="field" type="text" data-role="s2"
                  value="${this._escape(this._s2)}" placeholder="${t('s2Placeholder')}" />
              </div>
              <div class="triz-sf__field">
                <label class="triz-sf__label" for="triz-sf-field">${t('fieldLabel')}</label>
                <select id="triz-sf-field" class="field" data-role="field">
                  <option value="">${t('selectPlaceholder')}</option>
                  ${FIELDS.map(f => `<option value="${f}"${this._field === f ? ' selected' : ''}>${t(`field.${f}`)}</option>`).join('')}
                </select>
              </div>
              <div class="triz-sf__field">
                <label class="triz-sf__label" for="triz-sf-link">${t('linkLabel')}</label>
                <select id="triz-sf-link" class="field" data-role="link">
                  <option value="">${t('selectPlaceholder')}</option>
                  ${LINKS.map(l => `<option value="${l}"${this._link === l ? ' selected' : ''}>${t(`link.${l}`)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="triz-sf__diagram-wrap">
              ${this._renderDiagram(t)}
            </div>
          </section>

          <section class="triz-sf__diagnosis">
            <div class="triz-sf__diagnosis-text">
              <strong>${t('diagnosisLabel')}:</strong> ${t(`situation.${diag.situation}`)}
              <span class="triz-sf__diagnosis-classes">${t('suggestedClasses')}: ${diag.suggestedClasses.map(c => `<code>${c}</code>`).join(', ')}</span>
            </div>
            <textarea
              class="field triz-sf__problem-note"
              rows="2"
              data-role="problem-note"
              placeholder="${t('problemNotePlaceholder')}"
            >${this._escape(this._problemNote)}</textarea>
          </section>

          <section class="triz-sf__filter">
            <label class="triz-sf__filter-label">
              <input type="radio" name="triz-sf-filter-${this._context.instanceId}"
                value="auto" data-role="filter"
                ${this._filterMode === 'auto' ? 'checked' : ''} />
              ${t('filterAuto')}
            </label>
            <label class="triz-sf__filter-label">
              <input type="radio" name="triz-sf-filter-${this._context.instanceId}"
                value="all" data-role="filter"
                ${this._filterMode === 'all' ? 'checked' : ''} />
              ${t('filterAll')}
            </label>
            <div class="triz-sf__filter-spacer"></div>
            <button class="btn btn--sm" type="button" data-action="example">${t('loadExample')}</button>
            <button class="btn btn--sm" type="button" data-action="reset">${t('reset')}</button>
          </section>

          <section class="triz-sf__standards">
            ${this._renderStandards(diag, lang, t)}
          </section>

        </div>
      </div>
    `;

    this._wire();
  },

  _renderDiagram(t) {
    // Compact SVG: triangle with F on top, S1 bottom-left, S2 bottom-right.
    // Edge between S1 and S2 carries the link quality (color + line style).
    const fieldLabel = this._field ? t(`field.${this._field}`) : t('fieldEmpty');
    const linkClass = this._link ? `triz-sf__edge--${this._link}` : 'triz-sf__edge--empty';
    const s1Text = this._s1 || t('s1Placeholder');
    const s2Text = this._s2 || t('s2Placeholder');

    // Build the bottom edge marker / dasharray based on link quality.
    let dashAttr = '';
    let markerEnd = 'url(#triz-sf-arrow)';
    let edgeColor = 'var(--color-text-tertiary)';
    if (this._link === 'useful') { edgeColor = 'var(--color-success, #2ea043)'; }
    else if (this._link === 'insufficient') { dashAttr = 'stroke-dasharray="6 4"'; edgeColor = 'var(--color-warning, #d29922)'; }
    else if (this._link === 'excessive')    { edgeColor = 'var(--color-accent, #2e7dd9)'; }
    else if (this._link === 'harmful')      { dashAttr = 'stroke-dasharray="2 4"'; edgeColor = 'var(--color-error, #c93c3c)'; }
    else if (this._link === 'missing')      { dashAttr = 'stroke-dasharray="2 6"'; edgeColor = 'var(--color-text-tertiary)'; markerEnd = ''; }

    return `
      <svg class="triz-sf__diagram ${linkClass}" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t('diagramAria')}">
        <defs>
          <marker id="triz-sf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="${edgeColor}"/>
          </marker>
        </defs>

        <!-- bottom edge S1 → S2, coloured by link quality -->
        <line x1="60" y1="160" x2="260" y2="160" stroke="${edgeColor}" stroke-width="2.5" ${dashAttr} ${markerEnd ? `marker-end="${markerEnd}"` : ''} />

        <!-- sides toward F (always thin grey unless field empty) -->
        <line x1="160" y1="30" x2="60"  y2="160" stroke="var(--color-border-primary)" stroke-width="1.5" stroke-dasharray="${this._field ? '0' : '2 4'}" />
        <line x1="160" y1="30" x2="260" y2="160" stroke="var(--color-border-primary)" stroke-width="1.5" stroke-dasharray="${this._field ? '0' : '2 4'}" />

        <!-- nodes -->
        <g class="triz-sf__diag-node">
          <circle cx="160" cy="30" r="22" fill="var(--color-bg-secondary)" stroke="var(--color-border-primary)"/>
          <text x="160" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="var(--color-text-primary)">F</text>
        </g>
        <text x="160" y="14" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)">${this._escape(fieldLabel)}</text>

        <g class="triz-sf__diag-node">
          <circle cx="60" cy="160" r="22" fill="var(--color-bg-secondary)" stroke="var(--color-border-primary)"/>
          <text x="60" y="164" text-anchor="middle" font-size="13" font-weight="600" fill="var(--color-text-primary)">S1</text>
        </g>
        <text x="60" y="195" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)">${this._escape(this._truncate(s1Text, 22))}</text>

        <g class="triz-sf__diag-node">
          <circle cx="260" cy="160" r="22" fill="var(--color-bg-secondary)" stroke="var(--color-border-primary)"/>
          <text x="260" y="164" text-anchor="middle" font-size="13" font-weight="600" fill="var(--color-text-primary)">S2</text>
        </g>
        <text x="260" y="195" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)">${this._escape(this._truncate(s2Text, 22))}</text>
      </svg>
    `;
  },

  _renderStandards(diag, lang, t) {
    if (!this._standards) return '';

    // Class header → list of standards.
    const classes = [1, 2, 3, 4, 5];
    const visibleClasses = this._filterMode === 'all'
      ? classes
      : classes.filter(c => diag.suggestedClasses.includes(c));

    if (visibleClasses.length === 0) {
      return `<p class="triz-sf__hint">${t('noStandardsHint')}</p>`;
    }

    return visibleClasses.map(c => {
      const entries = this._standards.filter(s => s.class === c);
      const isOpen = this._expandedClasses.has(c);
      const className = t(`class.${c}.name`);
      const classDesc = t(`class.${c}.description`);
      return `
        <details class="triz-sf__class" data-class="${c}"${isOpen ? ' open' : ''}>
          <summary class="triz-sf__class-head">
            <span class="triz-sf__class-num">${c}</span>
            <span class="triz-sf__class-title">${className}</span>
            <span class="triz-sf__class-count">(${entries.length})</span>
          </summary>
          <p class="triz-sf__class-desc">${classDesc}</p>
          <ul class="triz-sf__standard-list">
            ${entries.map(s => this._renderStandard(s, lang, t)).join('')}
          </ul>
        </details>
      `;
    }).join('');
  },

  _renderStandard(s, lang, t) {
    const loc = s[lang] || s.en;
    const note = this._notes[s.id] || '';
    const selected = !!this._selected[s.id];
    return `
      <li class="triz-sf__standard${selected ? ' is-selected' : ''}" data-id="${s.id}">
        <details>
          <summary class="triz-sf__standard-head">
            <span class="triz-sf__standard-id">${s.id}</span>
            <span class="triz-sf__standard-title">${this._escape(loc.title)}</span>
            ${selected ? '<span class="triz-sf__standard-pin">★</span>' : ''}
          </summary>
          <p class="triz-sf__standard-desc">${this._escape(loc.description)}</p>
          <p class="triz-sf__standard-trigger"><em>${t('triggerLead')}:</em> ${this._escape(loc.trigger)}</p>
          <p class="triz-sf__standard-example"><em>${t('exampleLead')}:</em> ${this._escape(loc.example)}</p>
          <textarea
            class="field triz-sf__standard-note"
            rows="2"
            data-role="standard-note"
            data-id="${s.id}"
            placeholder="${t('standardNotePlaceholder')}"
          >${this._escape(note)}</textarea>
          <label class="triz-sf__standard-select">
            <input type="checkbox" data-role="standard-select" data-id="${s.id}" ${selected ? 'checked' : ''}/>
            <span>${t('considered')}</span>
          </label>
        </details>
      </li>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    const bind = (sel, field) => {
      c.querySelector(`[data-role="${sel}"]`)?.addEventListener('input', (e) => {
        this[field] = e.target.value;
        this._persist();
        this._render();
      });
    };
    bind('s1', '_s1');
    bind('s2', '_s2');
    bind('problem-note', '_problemNote');

    c.querySelector('[data-role="field"]')?.addEventListener('change', (e) => {
      this._field = FIELDS.includes(e.target.value) ? e.target.value : '';
      this._persist();
      this._render();
    });

    c.querySelector('[data-role="link"]')?.addEventListener('change', (e) => {
      this._link = LINKS.includes(e.target.value) ? e.target.value : '';
      this._persist();
      this._render();
    });

    c.querySelectorAll('[data-role="filter"]').forEach(el => {
      el.addEventListener('change', (e) => {
        this._filterMode = e.target.value === 'all' ? 'all' : 'auto';
        this._persist();
        this._render();
      });
    });

    c.querySelectorAll('.triz-sf__class').forEach(el => {
      el.addEventListener('toggle', (e) => {
        const cls = Number(e.currentTarget.dataset.class);
        if (!Number.isInteger(cls)) return;
        if (e.currentTarget.open) this._expandedClasses.add(cls);
        else this._expandedClasses.delete(cls);
        this._persist();
      });
    });

    c.querySelectorAll('[data-role="standard-note"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        if (e.target.value) this._notes[id] = e.target.value;
        else delete this._notes[id];
        this._persist();
      });
    });

    c.querySelectorAll('[data-role="standard-select"]').forEach(el => {
      el.addEventListener('change', (e) => {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        if (e.target.checked) this._selected[id] = true;
        else delete this._selected[id];
        this._persist();
        // Re-render so the pin star + highlight reflect the change immediately.
        this._render();
      });
    });

    c.querySelector('[data-action="example"]')?.addEventListener('click', () => this._loadBuiltInExample());
    c.querySelector('[data-action="reset"]')?.addEventListener('click', () => this._reset());
  },

  _loadBuiltInExample() {
    const ex = this._context.i18n.t('modules.triz-sufield.example');
    if (!ex || typeof ex !== 'object') return;
    this._s1 = String(ex.s1 ?? '');
    this._s2 = String(ex.s2 ?? '');
    this._field = FIELDS.includes(ex.field) ? ex.field : '';
    this._link  = LINKS.includes(ex.link) ? ex.link : '';
    this._problemNote = String(ex.problemNote ?? '');
    this._notes = (ex.notes && typeof ex.notes === 'object') ? { ...ex.notes } : {};
    this._selected = (ex.selected && typeof ex.selected === 'object') ? { ...ex.selected } : {};
    // Expand the suggested classes so the user sees the marked standards.
    const diag = diagnose(this._s1, this._s2, this._field, this._link);
    this._expandedClasses = new Set(diag.suggestedClasses);
    this._persist();
    this._render();
  },

  async _reset() {
    const ctx = this._context;
    const ok = await ctx.showModal?.confirm?.({
      title: ctx.i18n.t('modules.triz-sufield.resetTitle'),
      message: ctx.i18n.t('modules.triz-sufield.resetMessage'),
      confirmText: ctx.i18n.t('modules.triz-sufield.reset'),
      cancelText: ctx.i18n.t('common.cancel'),
    });
    if (ok === false) return;
    this._s1 = ''; this._s2 = ''; this._field = ''; this._link = '';
    this._problemNote = '';
    this._notes = {};
    this._selected = {};
    this._filterMode = 'auto';
    this._expandedClasses = new Set([1]);
    this._persist();
    this._render();
  },

  _persist() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _truncate(s, n) {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  },

  _escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  },
};
