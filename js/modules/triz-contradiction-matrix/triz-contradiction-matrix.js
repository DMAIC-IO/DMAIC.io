/**
 * D.Mike — TRIZ Contradiction Matrix Module (triz-contradiction-matrix.js)
 * Improve / Innovation: pick an improving and a worsening engineering
 * parameter; the module looks up Altschuller's contradiction matrix and
 * shows the recommended inventive principles.
 *
 * Spec: docs/modules/TRIZ-CONTRADICTION-MATRIX.md
 */

/* Data is fetched on first init() and cached on the module export. */
const DATA_BASE = 'js/modules/triz-contradiction-matrix/data';
let _dataPromise = null;
function loadData() {
  if (_dataPromise) return _dataPromise;
  _dataPromise = Promise.all([
    fetch(`${DATA_BASE}/parameters.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${DATA_BASE}/principles.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${DATA_BASE}/matrix.json`,     { cache: 'no-cache' }).then(r => r.json()),
  ]).then(([p, pr, mx]) => ({
    parameters: p.parameters,
    principles: pr.principles,
    matrix: mx.cells,
  }));
  return _dataPromise;
}

export default {
  id: 'triz-contradiction-matrix',
  phase: 'improve',
  icon: 'git-merge',
  i18nKey: 'modules.triz-contradiction-matrix',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {number|null} 1..39 — id of the improving parameter */
  _improving: null,
  /** @type {number|null} 1..39 — id of the worsening parameter */
  _worsening: null,
  /** @type {string} free-form problem description */
  _problemNote: '',
  /** @type {boolean} matrix overview panel open */
  _showMatrix: false,
  /** @type {Array} 39 parameters (loaded async) */
  _params: null,
  /** @type {Array} 40 principles (loaded async) */
  _principles: null,
  /** @type {Array<Array>} 39×39 matrix (loaded async) */
  _matrix: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._improving = Number.isInteger(saved.improving) ? saved.improving : null;
      this._worsening = Number.isInteger(saved.worsening) ? saved.worsening : null;
      this._problemNote = saved.problemNote ?? '';
      this._showMatrix = !!saved.showMatrix;
    }

    // Show a loading hint while the data files come down (3 small JSONs).
    container.innerHTML = `<div class="module-container triz-cm"><div class="module-container__body"><p class="triz-cm__hint">…</p></div></div>`;
    try {
      const data = await loadData();
      this._params = data.parameters;
      this._principles = data.principles;
      this._matrix = data.matrix;
    } catch (err) {
      console.error('[triz-contradiction-matrix] failed to load data:', err);
      container.innerHTML = `<div class="module-error"><div class="module-error__title">Daten konnten nicht geladen werden</div><div class="module-error__message">${err.message}</div></div>`;
      return;
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
    // CSS custom properties handle theme changes
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      improving: this._improving,
      worsening: this._worsening,
      problemNote: this._problemNote,
      showMatrix: this._showMatrix,
    };
  },

  setState(data) {
    this._improving = Number.isInteger(data?.improving) ? data.improving : null;
    this._worsening = Number.isInteger(data?.worsening) ? data.worsening : null;
    this._problemNote = data?.problemNote ?? '';
    this._showMatrix = !!data?.showMatrix;
    this._render();
  },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = this._improving !== null || this._worsening !== null || !!this._problemNote;
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

  help: () => import('./triz-contradiction-matrix-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const lang = this._context.language || 'de';
    const t = (key, params) => i18n.t(`modules.triz-contradiction-matrix.${key}`, params);

    const principleIds = this._lookup(this._improving, this._worsening);

    this._container.innerHTML = `
      <div class="module-container triz-cm">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-contradiction-matrix.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-cm__body">

          <section class="triz-cm__section">
            <h3 class="triz-cm__section-title">${t('problemHeading')}</h3>
            <textarea
              class="field triz-cm__problem"
              rows="2"
              placeholder="${t('problemPlaceholder')}"
              aria-label="${t('problemHeading')}"
            >${this._escape(this._problemNote)}</textarea>
          </section>

          <section class="triz-cm__section triz-cm__selectors">
            <div class="triz-cm__selector">
              <label class="triz-cm__label triz-cm__label--improving" for="triz-cm-improving">
                <span class="triz-cm__dot triz-cm__dot--improving"></span>
                ${t('improvingParameter')}
              </label>
              <select id="triz-cm-improving" class="field triz-cm__select" data-role="improving">
                <option value="">${t('selectPlaceholder')}</option>
                ${this._renderParamOptions(this._improving, lang)}
              </select>
              ${this._improving ? `<p class="triz-cm__param-desc">${this._escape(this._paramDesc(this._improving, lang))}</p>` : ''}
            </div>

            <div class="triz-cm__selector">
              <label class="triz-cm__label triz-cm__label--worsening" for="triz-cm-worsening">
                <span class="triz-cm__dot triz-cm__dot--worsening"></span>
                ${t('worseningParameter')}
              </label>
              <select id="triz-cm-worsening" class="field triz-cm__select" data-role="worsening">
                <option value="">${t('selectPlaceholder')}</option>
                ${this._renderParamOptions(this._worsening, lang)}
              </select>
              ${this._worsening ? `<p class="triz-cm__param-desc">${this._escape(this._paramDesc(this._worsening, lang))}</p>` : ''}
            </div>

            <button class="btn btn--sm triz-cm__swap-btn" type="button" data-action="swap" title="${t('swap')}" aria-label="${t('swap')}">⇅</button>
          </section>

          <section class="triz-cm__section">
            <h3 class="triz-cm__section-title">${t('recommendedHeading')}</h3>
            ${this._renderResult(principleIds, lang, t)}
          </section>

          <section class="triz-cm__section">
            <button class="btn btn--sm triz-cm__matrix-toggle" type="button" data-action="toggle-matrix">
              ${this._showMatrix ? t('hideMatrix') : t('showMatrix')}
            </button>
            ${this._showMatrix ? this._renderMatrix(lang, t) : ''}
          </section>

        </div>
      </div>
    `;

    this._wire();
  },

  _renderParamOptions(selectedId, lang) {
    return this._params.map(p => {
      const sel = p.id === selectedId ? ' selected' : '';
      return `<option value="${p.id}"${sel}>${p.id}. ${this._escape(p[lang]?.name ?? p.en.name)}</option>`;
    }).join('');
  },

  _renderResult(principleIds, lang, t) {
    if (!this._improving || !this._worsening) {
      return `<p class="triz-cm__hint">${t('hintSelectBoth')}</p>`;
    }
    if (this._improving === this._worsening) {
      return `<p class="triz-cm__warn">${t('warnSameParameter')}</p>`;
    }
    if (!principleIds || principleIds.length === 0) {
      return `<p class="triz-cm__hint">${t('noContradiction')}</p>`;
    }
    const cards = principleIds.map(pid => {
      const pr = this._principles.find(x => x.id === pid);
      if (!pr) return '';
      const loc = pr[lang] ?? pr.en;
      return `
        <li class="triz-cm__principle">
          <div class="triz-cm__principle-num">${pr.id}</div>
          <div class="triz-cm__principle-body">
            <div class="triz-cm__principle-name">${this._escape(loc.name)}</div>
            <div class="triz-cm__principle-desc">${this._escape(loc.description)}</div>
          </div>
        </li>
      `;
    }).join('');
    return `<ol class="triz-cm__principles">${cards}</ol>`;
  },

  _renderMatrix(lang, t) {
    // Compact 39×39 heatmap-like overview. Cells: empty / has principles.
    const headerCells = this._params.map(p => {
      const isW = p.id === this._worsening;
      return `<th class="triz-cm__mx-col-head${isW ? ' is-active' : ''}" title="${p.id}. ${this._escape(p[lang]?.name ?? p.en.name)}">${p.id}</th>`;
    }).join('');

    const rows = this._matrix.map((row, i) => {
      const rowParam = this._params[i];
      const isI = rowParam.id === this._improving;
      const cells = row.map((cell, j) => {
        const colParam = this._params[j];
        const isPicked = rowParam.id === this._improving && colParam.id === this._worsening;
        const isDiag = i === j;
        const cls = ['triz-cm__mx-cell'];
        if (isDiag) cls.push('is-diag');
        else if (cell === null) cls.push('is-empty');
        else cls.push('is-filled');
        if (isPicked) cls.push('is-picked');
        const content = isDiag ? '·' : (cell === null ? '' : cell.length);
        const title = isDiag
          ? `${rowParam.id} ↔ ${rowParam.id}`
          : `${rowParam.id}↑ ${this._escape(rowParam[lang]?.name ?? rowParam.en.name)} / ${colParam.id}↓ ${this._escape(colParam[lang]?.name ?? colParam.en.name)}` + (cell ? `: ${cell.join(', ')}` : '');
        return `<td class="${cls.join(' ')}" data-i="${rowParam.id}" data-j="${colParam.id}" title="${title}">${content}</td>`;
      }).join('');
      return `
        <tr>
          <th class="triz-cm__mx-row-head${isI ? ' is-active' : ''}" title="${rowParam.id}. ${this._escape(rowParam[lang]?.name ?? rowParam.en.name)}">${rowParam.id}</th>
          ${cells}
        </tr>
      `;
    }).join('');

    return `
      <div class="triz-cm__mx-wrap">
        <p class="triz-cm__mx-legend">${t('matrixLegend')}</p>
        <table class="triz-cm__mx">
          <thead>
            <tr>
              <th class="triz-cm__mx-corner" title="${t('matrixCornerTip')}">↑/↓</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    c.querySelector('[data-role="improving"]')?.addEventListener('change', (e) => {
      const v = e.target.value;
      this._improving = v ? Number(v) : null;
      this._persist();
      this._render();
    });

    c.querySelector('[data-role="worsening"]')?.addEventListener('change', (e) => {
      const v = e.target.value;
      this._worsening = v ? Number(v) : null;
      this._persist();
      this._render();
    });

    c.querySelector('.triz-cm__problem')?.addEventListener('input', (e) => {
      this._problemNote = e.target.value;
      this._persist();
    });

    c.querySelector('[data-action="swap"]')?.addEventListener('click', () => {
      const a = this._improving;
      this._improving = this._worsening;
      this._worsening = a;
      this._persist();
      this._render();
    });

    c.querySelector('[data-action="toggle-matrix"]')?.addEventListener('click', () => {
      this._showMatrix = !this._showMatrix;
      this._persist();
      this._render();
    });

    c.querySelectorAll('.triz-cm__mx-cell').forEach(td => {
      td.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.dataset.i);
        const j = Number(e.currentTarget.dataset.j);
        if (!i || !j || i === j) return;
        this._improving = i;
        this._worsening = j;
        this._persist();
        this._render();
      });
    });
  },

  _persist() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Helpers ────────────────────────────────────────────────

  /** @param {number|null} i  @param {number|null} j  @returns {number[]|null} */
  _lookup(i, j) {
    if (!i || !j || i === j) return null;
    const row = this._matrix[i - 1];
    if (!row) return null;
    return row[j - 1] ?? null;
  },

  _paramDesc(id, lang) {
    const p = this._params.find(x => x.id === id);
    if (!p) return '';
    return (p[lang] ?? p.en).description;
  },

  _escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  },
};
