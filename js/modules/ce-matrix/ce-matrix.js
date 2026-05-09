/**
 * D.Mike — C&E Matrix Module (ce-matrix.js)
 * Cause and Effect Matrix for scoring process inputs against outputs.
 * DMAIC phase: Analyze
 *
 * Spec: docs/modules/CE-MATRIX.md
 */

import {
  downloadFile, ensureXLSX, createExportDropdown,
  exportTableAsPNG, exportTableAsSVG,
} from '../../core/export-utils.js';

export default {
  id: 'ce-matrix',
  phase: 'analyze',
  icon: 'grid',
  i18nKey: 'modules.ce-matrix',
  version: '1.0.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {string[]} */
  _inputs: [],
  /** @type {string[]} */
  _outputs: [],
  /** @type {Record<string, number>} key "r-c" → 0..9 */
  _scores: {},
  /** @type {number[]} weight 1..10 per output (customer importance) */
  _weights: [],
  /** @type {number|null} */
  _renderTimer: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._inputs = [];
    this._outputs = [];
    this._scores = {};
    this._weights = [];

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._importState(saved);
    }

    if (this._inputs.length === 0 && this._outputs.length === 0) {
      this._inputs = ['Input 1', 'Input 2', 'Input 3'];
      this._outputs = ['Output 1', 'Output 2', 'Output 3'];
    }

    while (this._weights.length < this._outputs.length) {
      this._weights.push(1);
    }

    this._render();
  },

  async destroy() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    if (this._exportDropdown) { this._exportDropdown.destroy(); this._exportDropdown = null; }
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
      inputs: [...this._inputs],
      outputs: [...this._outputs],
      scores: { ...this._scores },
      weights: [...this._weights],
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./ce-matrix-help.js'),

  // ─── Internal: state import ─────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    if (Array.isArray(saved.inputs)) this._inputs = [...saved.inputs];
    if (Array.isArray(saved.outputs)) this._outputs = [...saved.outputs];
    if (saved.scores && typeof saved.scores === 'object') {
      this._scores = { ...saved.scores };
    }
    if (Array.isArray(saved.weights)) {
      this._weights = saved.weights.map(w => Math.max(1, Math.min(10, parseInt(w, 10) || 1)));
    }
  },

  // ─── Score helpers ──────────────────────────────────────────

  _key(r, c) { return `${r}-${c}`; },

  _getScore(r, c) {
    const v = this._scores[this._key(r, c)];
    return v !== undefined ? v : 0;
  },

  _setScore(r, c, val) {
    if (val === '' || val === null || val === undefined) {
      delete this._scores[this._key(r, c)];
      return;
    }
    let v = parseInt(val, 10);
    if (isNaN(v)) { delete this._scores[this._key(r, c)]; return; }
    v = Math.max(0, Math.min(9, v));
    this._scores[this._key(r, c)] = v;
  },

  _getWeight(c) {
    return this._weights[c] ?? 1;
  },

  _rowSum(r) {
    let s = 0;
    for (let c = 0; c < this._outputs.length; c++) {
      s += this._getScore(r, c) * this._getWeight(c);
    }
    return s;
  },

  _colSum(c) {
    let s = 0;
    const w = this._getWeight(c);
    for (let r = 0; r < this._inputs.length; r++) s += this._getScore(r, c) * w;
    return s;
  },

  // ─── Color scale (green → yellow → red) ────────────────────

  _lerpColor(ratio) {
    const stops = [
      { p: 0,    r: 34,  g: 197, b: 94  },
      { p: 0.35, r: 132, g: 204, b: 22  },
      { p: 0.55, r: 234, g: 179, b: 8   },
      { p: 0.75, r: 249, g: 115, b: 22  },
      { p: 1,    r: 239, g: 68,  b: 68  },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      if (ratio >= stops[i].p && ratio <= stops[i + 1].p) {
        const t = (ratio - stops[i].p) / (stops[i + 1].p - stops[i].p);
        return {
          r: Math.round(stops[i].r + (stops[i + 1].r - stops[i].r) * t),
          g: Math.round(stops[i].g + (stops[i + 1].g - stops[i].g) * t),
          b: Math.round(stops[i].b + (stops[i + 1].b - stops[i].b) * t),
        };
      }
    }
    return stops[stops.length - 1];
  },

  _colorForValue(val, min, max) {
    if (max === min) return 'transparent';
    const ratio = (val - min) / (max - min);
    const { r, g, b } = this._lerpColor(ratio);
    return `rgba(${r},${g},${b},.18)`;
  },

  _textColorForValue(val, min, max) {
    if (max === min) return 'var(--color-text-tertiary)';
    const ratio = (val - min) / (max - min);
    const { r, g, b } = this._lerpColor(ratio);
    return `rgb(${r},${g},${b})`;
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.ce-matrix.${key}`, params);

    const rowSums = this._inputs.map((_, r) => this._rowSum(r));
    const colSums = this._outputs.map((_, c) => this._colSum(c));
    const minR = Math.min(...rowSums);
    const maxR = Math.max(...rowSums);
    const minC = Math.min(...colSums);
    const maxC = Math.max(...colSums);
    const grandTotal = rowSums.reduce((a, b) => a + b, 0);

    this._container.innerHTML = `
      <div class="module-container ce-matrix">
        <div class="module-container__header">
          <h2 class="module-container__title">${this._context.i18n.t('modules.ce-matrix.name')}</h2>
          <div class="ce-matrix__toolbar">
            <div class="ce-matrix__toolbar-spacer"></div>
            <button class="btn btn--sm ce-matrix__add-input-btn" type="button">+ ${t('addInput')}</button>
            <button class="btn btn--sm ce-matrix__add-output-btn" type="button">+ ${t('addOutput')}</button>
            <span class="ce-matrix__export-anchor"></span>
          </div>
        </div>

        <div class="module-container__body">
          <div class="ce-matrix__wrap">
            <table class="ce-matrix__table">
              ${this._renderHeader(t)}
              ${this._renderBody(rowSums, minR, maxR)}
              ${this._renderFooter(colSums, minC, maxC, grandTotal, t)}
            </table>
          </div>

          <div class="ce-matrix__legend">
            <span class="ce-matrix__legend-label">${t('legendLow')}</span>
            <div class="ce-matrix__legend-bar"></div>
            <span class="ce-matrix__legend-label">${t('legendHigh')}</span>
            <span class="ce-matrix__legend-info">${t('legendInfo')}</span>
          </div>
        </div>
      </div>
    `;

    this._bindEvents(t);
  },

  _renderHeader(t) {
    let html = '<thead>';

    // Weight row
    html += '<tr class="ce-matrix__weight-row">';
    html += `<th class="ce-matrix__weight-label">${t('weight')}</th>`;
    for (let c = 0; c < this._outputs.length; c++) {
      html += '<th class="ce-matrix__weight-cell">';
      html += `<select class="ce-matrix__weight-select" data-col="${c}">`;
      for (let w = 1; w <= 10; w++) {
        const sel = w === this._getWeight(c) ? ' selected' : '';
        html += `<option value="${w}"${sel}>${w}</option>`;
      }
      html += '</select>';
      html += '</th>';
    }
    html += '<th class="ce-matrix__corner"></th>';
    html += '</tr>';

    // Output name row
    html += '<tr>';
    html += '<th class="ce-matrix__corner"></th>';
    for (let c = 0; c < this._outputs.length; c++) {
      html += `
        <th class="ce-matrix__output-header">
          <div class="ce-matrix__output-header-content">
            <input type="text" class="ce-matrix__output-name"
                   value="${this._escapeAttr(this._outputs[c])}"
                   placeholder="${t('outputPlaceholder')}"
                   data-col="${c}" />
          </div>
          <button class="ce-matrix__del-btn ce-matrix__col-del-btn" data-col="${c}"
                  title="${t('removeOutput')}">&#x2715;</button>
        </th>`;
    }
    html += `<th class="ce-matrix__total-label ce-matrix__total-label--vertical">
      <div class="ce-matrix__output-header-content">${t('rowSum')}</div>
    </th>`;
    html += '</tr>';

    html += '</thead>';
    return html;
  },

  _renderBody(rowSums, minR, maxR) {
    let html = '<tbody>';
    for (let r = 0; r < this._inputs.length; r++) {
      html += '<tr>';
      html += `
        <td class="ce-matrix__name-cell">
          <input type="text" class="ce-matrix__input-name"
                 value="${this._escapeAttr(this._inputs[r])}"
                 placeholder="${this._context.i18n.t('modules.ce-matrix.inputPlaceholder')}"
                 data-row="${r}" />
          <button class="ce-matrix__del-btn ce-matrix__row-del-btn" data-row="${r}"
                  title="${this._context.i18n.t('modules.ce-matrix.removeInput')}">&#x2715;</button>
        </td>`;
      for (let c = 0; c < this._outputs.length; c++) {
        const v = this._scores[this._key(r, c)];
        const display = v !== undefined ? v : '';
        html += `
          <td class="ce-matrix__score-cell">
            <input type="number" min="0" max="9" value="${display}"
                   data-r="${r}" data-c="${c}"
                   class="ce-matrix__score-input" />
          </td>`;
      }
      const rs = rowSums[r];
      html += `<td class="ce-matrix__result-cell"
                   style="background:${this._colorForValue(rs, minR, maxR)};color:${this._textColorForValue(rs, minR, maxR)}">${rs}</td>`;
      html += '</tr>';
    }
    html += '</tbody>';
    return html;
  },

  _renderFooter(colSums, minC, maxC, grandTotal, t) {
    let html = '<tfoot><tr>';
    html += `<td class="ce-matrix__total-label">${t('colSum')}</td>`;
    for (let c = 0; c < this._outputs.length; c++) {
      const cs = colSums[c];
      html += `<td class="ce-matrix__result-cell"
                   style="background:${this._colorForValue(cs, minC, maxC)};color:${this._textColorForValue(cs, minC, maxC)}">${cs}</td>`;
    }
    html += `<td class="ce-matrix__grand-total">${grandTotal}</td>`;
    html += '</tr></tfoot>';
    return html;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Score input
    el.querySelectorAll('.ce-matrix__score-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const r = parseInt(input.dataset.r, 10);
        const c = parseInt(input.dataset.c, 10);
        this._setScore(r, c, input.value);
        this._save();
        this._deferRender();
      });
      input.addEventListener('focus', () => input.select());
    });

    // Input name changes
    el.querySelectorAll('.ce-matrix__input-name').forEach(input => {
      input.addEventListener('change', () => {
        const r = parseInt(input.dataset.row, 10);
        this._inputs[r] = input.value;
        this._save();
      });
    });

    // Weight changes
    el.querySelectorAll('.ce-matrix__weight-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const c = parseInt(sel.dataset.col, 10);
        this._weights[c] = parseInt(sel.value, 10);
        this._save();
        this._deferRender();
      });
    });

    // Output name changes
    el.querySelectorAll('.ce-matrix__output-name').forEach(input => {
      input.addEventListener('change', () => {
        const c = parseInt(input.dataset.col, 10);
        this._outputs[c] = input.value;
        this._save();
      });
    });

    // Delete input rows
    el.querySelectorAll('.ce-matrix__row-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._removeInput(parseInt(btn.dataset.row, 10));
      });
    });

    // Delete output columns
    el.querySelectorAll('.ce-matrix__col-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._removeOutput(parseInt(btn.dataset.col, 10));
      });
    });

    // Toolbar buttons
    el.querySelector('.ce-matrix__add-input-btn')?.addEventListener('click', () => this._addInput());
    el.querySelector('.ce-matrix__add-output-btn')?.addEventListener('click', () => this._addOutput());

    // Export dropdown (central component)
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._exportDropdown = createExportDropdown(
      ['xlsx', 'csv', 'json', 'png', 'svg'],
      (fmt) => {
        if (fmt === 'csv')  this._exportCSV(t);
        if (fmt === 'xlsx') this._exportXLSX(t);
        if (fmt === 'json') this._exportJSON();
        if (fmt === 'png')  this._exportImage('png');
        if (fmt === 'svg')  this._exportImage('svg');
      }
    );
    el.querySelector('.ce-matrix__export-anchor')?.replaceWith(this._exportDropdown.el);
  },

  // ─── Actions ────────────────────────────────────────────────

  _addInput() {
    this._inputs.push(`Input ${this._inputs.length + 1}`);
    this._save();
    this._render();
  },

  _addOutput() {
    this._outputs.push(`Output ${this._outputs.length + 1}`);
    this._weights.push(1);
    this._save();
    this._render();
  },

  _removeInput(r) {
    if (this._inputs.length <= 1) return;
    const ns = {};
    for (let ri = 0; ri < this._inputs.length; ri++) {
      if (ri === r) continue;
      const nr = ri > r ? ri - 1 : ri;
      for (let c = 0; c < this._outputs.length; c++) {
        const v = this._scores[this._key(ri, c)];
        if (v !== undefined) ns[this._key(nr, c)] = v;
      }
    }
    this._inputs.splice(r, 1);
    this._scores = ns;
    this._save();
    this._render();
  },

  _removeOutput(c) {
    if (this._outputs.length <= 1) return;
    const ns = {};
    for (let r = 0; r < this._inputs.length; r++) {
      for (let ci = 0; ci < this._outputs.length; ci++) {
        if (ci === c) continue;
        const nc = ci > c ? ci - 1 : ci;
        const v = this._scores[this._key(r, ci)];
        if (v !== undefined) ns[this._key(r, nc)] = v;
      }
    }
    this._outputs.splice(c, 1);
    this._weights.splice(c, 1);
    this._scores = ns;
    this._save();
    this._render();
  },

  async _resetAll(t) {
    const confirmed = await this._context.confirmPopout(
      t('resetConfirm'),
      { danger: true }
    );
    if (!confirmed) return;
    this._inputs = ['Input 1', 'Input 2', 'Input 3'];
    this._outputs = ['Output 1', 'Output 2', 'Output 3'];
    this._scores = {};
    this._weights = [1, 1, 1];
    this._save();
    this._render();
    this._context.notify(t('resetDone'));
  },

  // ─── Deferred render ────────────────────────────────────────

  _deferRender() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this._render();
    }, 0);
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportCSV(t) {
    const sep = ';';
    let csv = 'sep=;\n';
    csv += `"${t('weight')}"` + sep + this._weights.map(w => w).join(sep) + sep + '\n';
    csv += sep + this._outputs.map(o => `"${o.replace(/"/g, '""')}"`).join(sep) + sep + `"${t('rowSum')}"\n`;
    for (let r = 0; r < this._inputs.length; r++) {
      csv += `"${this._inputs[r].replace(/"/g, '""')}"`;
      for (let c = 0; c < this._outputs.length; c++) {
        csv += sep + this._getScore(r, c);
      }
      csv += sep + this._rowSum(r) + '\n';
    }
    csv += `"${t('colSum')}"`;
    for (let c = 0; c < this._outputs.length; c++) {
      csv += sep + this._colSum(c);
    }
    csv += '\n';

    downloadFile(csv, 'ce-matrix.csv', 'text/csv;charset=utf-8');
    this._context.notify('CSV ✓', 'success');
  },

  async _exportXLSX(t) {
    try { await ensureXLSX(); } catch { this._context.notify?.('XLSX library not loaded'); return; }
    const rows = [];
    rows.push([t('weight'), ...this._weights, '']);
    rows.push(['', ...this._outputs, t('rowSum')]);
    for (let r = 0; r < this._inputs.length; r++) {
      const row = [this._inputs[r]];
      for (let c = 0; c < this._outputs.length; c++) row.push(this._getScore(r, c));
      row.push(this._rowSum(r));
      rows.push(row);
    }
    const footRow = [t('colSum')];
    for (let c = 0; c < this._outputs.length; c++) footRow.push(this._colSum(c));
    rows.push(footRow);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'C&E Matrix');
    XLSX.writeFile(wb, 'ce-matrix.xlsx');
    this._context.notify('Excel ✓', 'success');
  },

  _exportJSON() {
    const data = this.getState();
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'ce-matrix.json', 'application/json');
    this._context.notify('JSON ✓', 'success');
  },

  _buildTableDescriptor() {
    const t = (key) => this._context.i18n.t(`modules.ce-matrix.${key}`);
    const cells = [];
    for (let r = 0; r < this._inputs.length; r++) {
      const row = [];
      for (let c = 0; c < this._outputs.length; c++) {
        const v = this._scores[this._key(r, c)];
        row.push(v !== undefined ? v : '');
      }
      cells.push(row);
    }
    return {
      outputs: this._outputs,
      inputs: this._inputs,
      weights: [...this._weights],
      weightLabel: t('weight'),
      cells,
      rowSums: this._inputs.map((_, r) => this._rowSum(r)),
      colSums: this._outputs.map((_, c) => this._colSum(c)),
      grandTotal: this._inputs.reduce((s, _, r) => s + this._rowSum(r), 0),
      rowSumLabel: t('rowSum'),
      colSumLabel: t('colSum'),
      cellBg: (v, min, max) => this._colorForValue(v, min, max),
      cellFg: (v, min, max) => this._textColorForValue(v, min, max),
    };
  },

  async _exportImage(format) {
    const td = this._buildTableDescriptor();
    if (format === 'png') {
      exportTableAsPNG(td, 'ce-matrix.png');
      this._context.notify('PNG ✓', 'success');
    } else {
      await exportTableAsSVG(td, 'ce-matrix.svg');
      this._context.notify('SVG ✓', 'success');
    }
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ────────────────────────────────────────────────

  _escapeAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  },
};
