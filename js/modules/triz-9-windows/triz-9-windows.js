/**
 * D.Mike — TRIZ 9-Windows / System Operator Module (triz-9-windows.js)
 * Innovation: place the system on a 3×3 grid spanning time (past / present /
 * future) and hierarchy (sub- / system / super-system) to broaden the
 * solution space beyond the immediate "system × now" cell.
 *
 * Spec: docs/modules/TRIZ-9-WINDOWS.md
 */

const ROWS = ['sub', 'sys', 'super']; // 0 = subsystem, 1 = system, 2 = supersystem
const COLS = ['past', 'present', 'future'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB hard cap on uploaded sketches

function emptyCells() {
  return ROWS.map(() => COLS.map(() => ({ text: '', image: null })));
}

export default {
  id: 'triz-9-windows',
  phase: 'improve',
  icon: 'grid',
  i18nKey: 'modules.triz-9-windows',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {string} system / problem title */
  _systemTitle: '',
  /** @type {string[]} 3 column-axis labels (user-overridable) */
  _colLabels: ['', '', ''],
  /** @type {string[]} 3 row-axis labels (user-overridable) */
  _rowLabels: ['', '', ''],
  /** @type {Array<Array<{text:string,image:string|null}>>} 3×3 cell grid */
  _cells: emptyCells(),
  /** @type {{r:number,c:number}|null} cell currently shown enlarged */
  _enlarged: null,

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
    // CSS custom properties handle theme changes
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      systemTitle: this._systemTitle,
      colLabels: [...this._colLabels],
      rowLabels: [...this._rowLabels],
      cells: this._cells.map(row => row.map(c => ({ text: c.text, image: c.image }))),
    };
  },

  setState(data) {
    this._restore(data);
    if (this._container) this._render();
  },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._systemTitle || (this._cells?.some(row => row.some(c => c?.text)) ?? false);
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


  _restore(data) {
    this._systemTitle = typeof data?.systemTitle === 'string' ? data.systemTitle : '';
    this._colLabels = Array.isArray(data?.colLabels) && data.colLabels.length === 3
      ? data.colLabels.map(v => (typeof v === 'string' ? v : ''))
      : ['', '', ''];
    this._rowLabels = Array.isArray(data?.rowLabels) && data.rowLabels.length === 3
      ? data.rowLabels.map(v => (typeof v === 'string' ? v : ''))
      : ['', '', ''];
    if (Array.isArray(data?.cells) && data.cells.length === 3) {
      this._cells = data.cells.map(row => {
        if (!Array.isArray(row) || row.length !== 3) return [{ text:'', image:null }, { text:'', image:null }, { text:'', image:null }];
        return row.map(c => ({
          text: typeof c?.text === 'string' ? c.text : '',
          image: typeof c?.image === 'string' ? c.image : null,
        }));
      });
    } else {
      this._cells = emptyCells();
    }
    this._enlarged = null;
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./triz-9-windows-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.triz-9-windows.${key}`, params);

    const colDefaults = [t('colPast'), t('colPresent'), t('colFuture')];
    const rowDefaults = [t('rowSub'), t('rowSys'), t('rowSuper')];

    this._container.innerHTML = `
      <div class="module-container triz-9w">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.triz-9-windows.name')}</h2>
          <div class="module-container__subtitle">${t('subtitle')}</div>
        </div>

        <div class="module-container__body triz-9w__body">

          <section class="triz-9w__topbar">
            <label class="triz-9w__title-label" for="triz-9w-title">${t('systemHeading')}</label>
            <input
              id="triz-9w-title"
              class="field triz-9w__title-input"
              type="text"
              data-role="system-title"
              value="${this._escape(this._systemTitle)}"
              placeholder="${t('systemPlaceholder')}"
            />
          </section>

          <section class="triz-9w__grid" aria-label="${t('gridAriaLabel')}">
            ${this._renderHeaderRow(colDefaults, t)}
            ${this._renderRows(rowDefaults, colDefaults, t)}
          </section>

          ${this._enlarged ? this._renderEnlargedOverlay(t) : ''}
        </div>
      </div>
    `;

    this._wire();
  },

  _renderHeaderRow(colDefaults, t) {
    const headers = COLS.map((_, c) => {
      const value = this._colLabels[c];
      return `
        <div class="triz-9w__col-head">
          <input
            class="field field--ghost triz-9w__axis-input triz-9w__col-input"
            type="text"
            data-role="col-label"
            data-c="${c}"
            value="${this._escape(value)}"
            placeholder="${this._escape(colDefaults[c])}"
            aria-label="${t('colAxisAria', { idx: c + 1 })}"
          />
        </div>
      `;
    }).join('');

    return `
      <div class="triz-9w__corner triz-9w__corner-top" title="${t('cornerTip')}">
        <div class="triz-9w__corner-rows">${t('axisRows')}</div>
        <div class="triz-9w__corner-cols">${t('axisCols')} →</div>
      </div>
      ${headers}
    `;
  },

  _renderRows(rowDefaults, colDefaults, t) {
    return ROWS.map((_, r) => {
      const cells = COLS.map((_, c) => this._renderCell(r, c, rowDefaults[r], colDefaults[c], t)).join('');
      const rowLabel = `
        <div class="triz-9w__row-head">
          <input
            class="field field--ghost triz-9w__axis-input triz-9w__row-input"
            type="text"
            data-role="row-label"
            data-r="${r}"
            value="${this._escape(this._rowLabels[r])}"
            placeholder="${this._escape(rowDefaults[r])}"
            aria-label="${t('rowAxisAria', { idx: r + 1 })}"
          />
        </div>
      `;
      return rowLabel + cells;
    }).join('');
  },

  _renderCell(r, c, rowDefault, colDefault, t) {
    const cell = this._cells[r][c];
    const rowLbl = this._rowLabels[r] || rowDefault;
    const colLbl = this._colLabels[c] || colDefault;
    const imgBlock = cell.image
      ? `
        <div class="triz-9w__image-wrap">
          <img class="triz-9w__image" src="${cell.image}" alt="${this._escape(t('imageAlt', { row: rowLbl, col: colLbl }))}" data-action="enlarge" data-r="${r}" data-c="${c}"/>
          <button class="triz-9w__image-clear" type="button" data-action="clear-image" data-r="${r}" data-c="${c}" title="${t('clearImage')}" aria-label="${t('clearImage')}">×</button>
        </div>
      `
      : '';
    const uploadBtn = !cell.image
      ? `
        <label class="triz-9w__upload-btn" title="${t('addImage')}">
          ${t('addImage')}
          <input type="file" accept="image/*" data-role="image-upload" data-r="${r}" data-c="${c}" hidden/>
        </label>
      `
      : '';
    return `
      <div class="triz-9w__cell" data-r="${r}" data-c="${c}">
        <div class="triz-9w__cell-head">
          <span class="triz-9w__cell-coord">${rowLbl} · ${colLbl}</span>
          ${uploadBtn}
        </div>
        <textarea
          class="field triz-9w__cell-text"
          rows="4"
          data-role="cell-text"
          data-r="${r}"
          data-c="${c}"
          placeholder="${t('cellPlaceholder')}"
        >${this._escape(cell.text)}</textarea>
        ${imgBlock}
      </div>
    `;
  },

  _renderEnlargedOverlay(t) {
    const { r, c } = this._enlarged;
    const cell = this._cells[r]?.[c];
    if (!cell?.image) return '';
    return `
      <div class="triz-9w__overlay" data-action="close-enlarged" role="dialog" aria-label="${t('imageEnlargedAria')}">
        <img class="triz-9w__overlay-img" src="${cell.image}" alt=""/>
        <button class="triz-9w__overlay-close" type="button" data-action="close-enlarged" aria-label="${t('close')}">×</button>
      </div>
    `;
  },

  // ─── Wiring ─────────────────────────────────────────────────

  _wire() {
    const c = this._container;

    c.querySelector('[data-role="system-title"]')?.addEventListener('input', (e) => {
      this._systemTitle = e.target.value;
      this._persist();
    });

    c.querySelectorAll('[data-role="col-label"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = Number(e.currentTarget.dataset.c);
        this._colLabels[idx] = e.target.value;
        this._persist();
        // Also refresh the cell-coord chips that mirror the axis text.
        this._refreshCoords();
      });
    });

    c.querySelectorAll('[data-role="row-label"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const idx = Number(e.currentTarget.dataset.r);
        this._rowLabels[idx] = e.target.value;
        this._persist();
        this._refreshCoords();
      });
    });

    c.querySelectorAll('[data-role="cell-text"]').forEach(el => {
      el.addEventListener('input', (e) => {
        const r = Number(e.currentTarget.dataset.r);
        const col = Number(e.currentTarget.dataset.c);
        this._cells[r][col].text = e.target.value;
        this._persist();
      });
    });

    c.querySelectorAll('[data-role="image-upload"]').forEach(el => {
      el.addEventListener('change', (e) => this._handleImageUpload(e));
    });

    c.querySelectorAll('[data-action="clear-image"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const r = Number(e.currentTarget.dataset.r);
        const col = Number(e.currentTarget.dataset.c);
        this._cells[r][col].image = null;
        this._persist();
        this._render();
      });
    });

    c.querySelectorAll('[data-action="enlarge"]').forEach(img => {
      img.addEventListener('click', (e) => {
        const r = Number(e.currentTarget.dataset.r);
        const col = Number(e.currentTarget.dataset.c);
        this._enlarged = { r, c: col };
        this._render();
      });
    });

    c.querySelectorAll('[data-action="close-enlarged"]').forEach(el => {
      el.addEventListener('click', (e) => {
        // Only close on overlay-background or close-button click, not on the
        // image itself, so users can examine the enlarged sketch.
        if (e.target.classList.contains('triz-9w__overlay-img')) return;
        this._enlarged = null;
        this._render();
      });
    });
  },

  /** Update the small "row · col" chip inside each cell when axis labels change,
   *  without re-rendering the whole grid (would lose textarea focus / cursor). */
  _refreshCoords() {
    const i18n = this._context.i18n;
    const t = (key) => i18n.t(`modules.triz-9-windows.${key}`);
    const colDefaults = [t('colPast'), t('colPresent'), t('colFuture')];
    const rowDefaults = [t('rowSub'), t('rowSys'), t('rowSuper')];
    this._container.querySelectorAll('.triz-9w__cell').forEach(cellEl => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);
      const rowLbl = this._rowLabels[r] || rowDefaults[r];
      const colLbl = this._colLabels[c] || colDefaults[c];
      const chip = cellEl.querySelector('.triz-9w__cell-coord');
      if (chip) chip.textContent = `${rowLbl} · ${colLbl}`;
    });
  },

  _handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = Number(e.target.dataset.r);
    const c = Number(e.target.dataset.c);
    if (file.size > MAX_IMAGE_BYTES) {
      this._context.notify?.({
        type: 'error',
        message: this._context.i18n.t('modules.triz-9-windows.imageTooLarge'),
      });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this._cells[r][c].image = String(reader.result);
      this._persist();
      this._render();
    };
    reader.onerror = () => {
      this._context.notify?.({
        type: 'error',
        message: this._context.i18n.t('modules.triz-9-windows.imageReadError'),
      });
    };
    reader.readAsDataURL(file);
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
