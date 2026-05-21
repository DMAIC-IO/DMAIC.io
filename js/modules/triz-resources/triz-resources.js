/**
 * D.Mike — TRIZ Resources Checklist Module (triz-resources.js)
 * Improve / Innovation: systematic inventory of available resources across
 * 6 categories (substance / field / space / time / information / functional)
 * × 3 system levels (sub / system / super).  Each cell stores free-text notes
 * and a 4-step utilisation status.
 *
 * Spec: docs/modules/TRIZ-RESOURCES.md
 */

const CATEGORIES = ['substance', 'field', 'space', 'time', 'info', 'function'];
const LEVELS = ['sub', 'sys', 'super'];
const STATUS_CYCLE = ['unknown', 'unused', 'partial', 'full'];

function emptyCell() {
  return { notes: '', status: 'unknown' };
}

function emptyCells() {
  const out = {};
  for (const cat of CATEGORIES) {
    out[cat] = {};
    for (const lvl of LEVELS) {
      out[cat][lvl] = emptyCell();
    }
  }
  return out;
}

export default {
  id: 'triz-resources',
  phase: 'improve',
  icon: 'package',
  i18nKey: 'modules.triz-resources',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,

  /** @type {string} */ _system: '',
  /** @type {Record<string, Record<string, {notes:string, status:string}>>} */
  _cells: emptyCells(),

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
      cells: this._cloneCells(this._cells),
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container) this._render();
  },

  _restore(data) {
    this._system = typeof data?.system === 'string' ? data.system : '';
    const cells = emptyCells();
    if (data?.cells && typeof data.cells === 'object') {
      for (const cat of CATEGORIES) {
        for (const lvl of LEVELS) {
          const src = data.cells?.[cat]?.[lvl];
          if (!src) continue;
          cells[cat][lvl] = {
            notes: typeof src.notes === 'string' ? src.notes : '',
            status: STATUS_CYCLE.includes(src.status) ? src.status : 'unknown',
          };
        }
      }
    }
    this._cells = cells;
  },

  _cloneCells(cells) {
    const out = {};
    for (const cat of CATEGORIES) {
      out[cat] = {};
      for (const lvl of LEVELS) {
        const c = cells[cat][lvl];
        out[cat][lvl] = { notes: c.notes, status: c.status };
      }
    }
    return out;
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._system || this._anyCellFilled();
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

  _anyCellFilled() {
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        const c = this._cells[cat][lvl];
        if (c.notes || c.status !== 'unknown') return true;
      }
    }
    return false;
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./triz-resources-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.triz-resources.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container triz-res">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-resources.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-res__body">

          <section class="triz-res__topbar">
            <label class="triz-res__label" for="triz-res-system">${t('systemLabel')}</label>
            <input id="triz-res-system" class="field triz-res__system-input" type="text"
              data-role="system"
              value="${this._escape(this._system)}"
              placeholder="${t('systemPlaceholder')}" />
          </section>

          <section class="triz-res__grid" aria-label="${t('gridAriaLabel')}">
            ${this._renderHeaderRow(t)}
            ${this._renderRows(t)}
          </section>

          <p class="triz-res__legend">${t('statusLegend')}</p>
        </div>
      </div>
    `;

    this._wire();
  },

  _renderHeaderRow(t) {
    const headers = LEVELS.map(lvl =>
      `<div class="triz-res__col-head">${t(`level.${lvl}`)}</div>`
    ).join('');
    return `
      <div class="triz-res__corner">${t('cornerTip')}</div>
      ${headers}
    `;
  },

  _renderRows(t) {
    return CATEGORIES.map(cat => {
      const cells = LEVELS.map(lvl => this._renderCell(cat, lvl, t)).join('');
      return `
        <div class="triz-res__row-head">
          <span class="triz-res__row-icon" aria-hidden="true">${t(`category.${cat}.icon`)}</span>
          <span class="triz-res__row-title">${t(`category.${cat}.name`)}</span>
        </div>
        ${cells}
      `;
    }).join('');
  },

  _renderCell(cat, lvl, t) {
    const cell = this._cells[cat][lvl];
    const status = cell.status || 'unknown';
    return `
      <div class="triz-res__cell" data-cat="${cat}" data-lvl="${lvl}">
        <button
          class="triz-res__status triz-res__status--${status}"
          type="button"
          data-role="status"
          data-cat="${cat}"
          data-lvl="${lvl}"
          title="${t(`status.${status}`)}"
          aria-label="${t(`status.${status}`)}"
        >${this._statusGlyph(status)}</button>
        <textarea
          class="field triz-res__notes"
          rows="3"
          data-role="notes"
          data-cat="${cat}"
          data-lvl="${lvl}"
          placeholder="${t(`category.${cat}.prompt`)}"
        >${this._escape(cell.notes)}</textarea>
      </div>
    `;
  },

  _statusGlyph(status) {
    switch (status) {
      case 'full':    return '●';
      case 'partial': return '◑';
      case 'unused':  return '◔';
      default:        return '○';
    }
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    c.querySelector('[data-role="system"]')?.addEventListener('input', (e) => {
      this._system = e.target.value;
      this._persist();
    });

    c.querySelectorAll('[data-role="notes"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const cat = e.currentTarget.dataset.cat;
        const lvl = e.currentTarget.dataset.lvl;
        if (!CATEGORIES.includes(cat) || !LEVELS.includes(lvl)) return;
        this._cells[cat][lvl].notes = e.target.value;
        this._persist();
      });
    });

    c.querySelectorAll('[data-role="status"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.cat;
        const lvl = e.currentTarget.dataset.lvl;
        if (!CATEGORIES.includes(cat) || !LEVELS.includes(lvl)) return;
        const cur = this._cells[cat][lvl].status;
        const idx = STATUS_CYCLE.indexOf(cur);
        this._cells[cat][lvl].status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        this._persist();
        this._render();
      });
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
