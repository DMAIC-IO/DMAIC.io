/**
 * D.Mike — Contour Plot Module (contour-plot.js)
 * Data phase: renders contour diagrams from regression models z = f(x, y).
 *
 * Supports quadratic, linear+interaction, and custom JS models.
 * Canvas-based rendering with marching-squares contour lines,
 * configurable color schemes, data-point overlay, tooltip, and export.
 *
 * Uses the shared chart framework modebar + editor panel.
 * Data points are sourced from worksheet columns (X, Y, Z).
 */

import { createModebar } from '../../core/chart/modebar.js';

import {
  DatasetPicker,
  getColumnValues,
} from '../../ui/dataset-picker.js';

import { editorMethods } from './contour-plot-editor.js';
import { renderMethods } from './contour-plot-render.js';

// ═══════════════════════════════════════════════════════════════
// Module
// ═══════════════════════════════════════════════════════════════

const mod = {
  id: 'contour-plot',
  phase: 'data',
  icon: 'grid',
  i18nKey: 'modules.contour-plot',
  version: '1.0.0',

  _container: null,
  _context: null,
  _canvas: null,
  _tooltip: null,
  _lastGrid: null,
  _state: {},
  _modebarInstance: null,
  _editorOpen: false,
  _activeColorPicker: null,
  _chartConfig: {
    showTitle: true, title: '',
    titleSize: 15, labelSize: 13, tickSize: 11,
    showXLabel: true, showYLabel: true,
    showXTicks: true, showYTicks: true,
    bgColor: '',
    // Data point styling
    markerSymbol: 'circle',
    markerSize: 10,
    markerColor: '',
    markerStroke: 'rgba(255,255,255,1)',
    markerStrokeWidth: 2,
    markerStrokeDash: 'solid',
  },
  _refLines: [],
  _refAreas: [],
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _colRefX: null,
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _colRefY: null,
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _colRefZ: null,
  /** @type {DatasetPicker|null} */
  _picker: null,

  help: () => import('./contour-plot-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._editorOpen = false;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._state = { ...saved };
      this._colRefX = saved.colRefX || null;
      this._colRefY = saved.colRefY || null;
      this._colRefZ = saved.colRefZ || null;
      if (saved.chartConfig) this._chartConfig = { ...this._chartConfig, ...saved.chartConfig };
      if (saved.refLines) this._refLines = saved.refLines;
      if (saved.refAreas) this._refAreas = saved.refAreas;
    }

    // Ensure display defaults
    if (!this._state.colorScheme) this._state.colorScheme = 'viridis';
    if (!this._state.numLevels) this._state.numLevels = 10;
    if (!this._state.gridRes) this._state.gridRes = 100;
    if (this._state.showLines === undefined) this._state.showLines = true;
    if (this._state.showLabels === undefined) this._state.showLabels = true;
    if (this._state.showDataPoints === undefined) this._state.showDataPoints = false;

    this._render();
    if (this._state.model) this._applyState();
    else this._drawContour();
  },

  async destroy() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._removeTooltipListeners();
    this._closeColorPicker();
    if (this._modebarInstance) {
      this._modebarInstance.destroy();
      this._modebarInstance = null;
    }
    this._container.innerHTML = '';
    this._container = null;
    this._canvas = null;
    this._tooltip = null;
  },

  onLanguageChange() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    if (this._state.model) this._applyState();
  },
  onThemeChange() { if (this._lastGrid) this._drawContour(); },

  getState() { return { ...this._state }; },
  setState(data) { if (data) this._state = { ...data }; },

  // ─── Helpers ────────────────────────────────────────────────

  _t(key) { return this._context.i18n.t(`modules.contour-plot.${key}`); },
  _isEn() { return this._context.language === 'en'; },

  _val(id) {
    const el = this._container.querySelector(`[data-ref="${id}"]`);
    return el ? el.value : '';
  },
  _numVal(id, fallback = 0) {
    const v = parseFloat(this._val(id));
    return isNaN(v) ? fallback : v;
  },

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref)
      .filter(v => v != null && typeof v === 'number' && !isNaN(v));
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = k => this._t(k);

    this._container.innerHTML = `
    <div class="contour dmike-split">
      <aside class="contour__input dmike-split__input">

        <div class="dmike-split__section-title">${t('sectionModel')}</div>
        <div class="field-group">
          <label>${t('modelType')}</label>
          <select data-ref="modelType" class="field">
            <option value="quadratic">${t('modelQuadratic')}</option>
            <option value="interaction">${t('modelInteraction')}</option>
            <option value="custom">${t('modelCustom')}</option>
          </select>
        </div>

        <div data-ref="coeffSection">
          <label class="contour__coeff-label">${t('coeffLabel')}</label>
          <div class="contour__coeff-grid">
            <div class="field-group contour__field-sm"><label>\u03b2\u2080</label><input type="number" class="field field--num" data-ref="b0" value="50"></div>
            <div class="field-group contour__field-sm"><label>\u03b2\u2081</label><input type="number" class="field field--num" data-ref="b1" value="8"></div>
            <div class="field-group contour__field-sm"><label>\u03b2\u2082</label><input type="number" class="field field--num" data-ref="b2" value="5"></div>
            <div class="field-group contour__field-sm"><label>\u03b2\u2083</label><input type="number" class="field field--num" data-ref="b3" value="-3"></div>
            <div class="field-group contour__field-sm"><label>\u03b2\u2084</label><input type="number" class="field field--num" data-ref="b4" value="-2"></div>
            <div class="field-group contour__field-sm"><label>\u03b2\u2085</label><input type="number" class="field field--num" data-ref="b5" value="1.5"></div>
          </div>
        </div>

        <div data-ref="customSection" style="display:none">
          <div class="field-group">
            <label>${t('customFormula')}</label>
            <textarea data-ref="customFormula" class="field contour__textarea" rows="2">50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y</textarea>
          </div>
        </div>

        <input type="hidden" data-ref="xLabel" value="${this._isEn() ? 'Factor X' : 'Faktor X'}">
        <input type="hidden" data-ref="yLabel" value="${this._isEn() ? 'Factor Y' : 'Faktor Y'}">
        <div class="dmike-split__section-title">${t('sectionAxes')}</div>
        <div class="contour__row-2">
          <div class="field-group contour__field-sm"><label>X min</label><input type="number" class="field field--num" data-ref="xMin" value="-3"></div>
          <div class="field-group contour__field-sm"><label>X max</label><input type="number" class="field field--num" data-ref="xMax" value="3"></div>
        </div>
        <div class="contour__row-2">
          <div class="field-group contour__field-sm"><label>Y min</label><input type="number" class="field field--num" data-ref="yMin" value="-3"></div>
          <div class="field-group contour__field-sm"><label>Y max</label><input type="number" class="field field--num" data-ref="yMax" value="3"></div>
        </div>
        <div class="field-group"><label>${t('zName')}</label><input type="text" class="field" data-ref="zLabel" value="${this._isEn() ? 'Response Z' : 'Antwort Z'}"></div>

        <div class="dmike-split__section-title">${t('sectionDataSource')}</div>
        <div data-ref="picker-wrap"></div>
      </aside>

      <main class="contour__output dmike-split__output">
        <div class="contour__info-row" data-ref="infoRow" style="display:none">
          <div class="contour__info-card"><div class="contour__info-label">Z Min</div><div class="contour__info-value" data-ref="infoZmin">\u2013</div><div class="contour__info-sub" data-ref="infoZminPos"></div></div>
          <div class="contour__info-card"><div class="contour__info-label">Z Max</div><div class="contour__info-value" data-ref="infoZmax">\u2013</div><div class="contour__info-sub" data-ref="infoZmaxPos"></div></div>
          <div class="contour__info-card"><div class="contour__info-label">${t('range')}</div><div class="contour__info-value" data-ref="infoRange">\u2013</div><div class="contour__info-sub" data-ref="infoRangeSub"></div></div>
          <div class="contour__info-card"><div class="contour__info-label">${t('optimum')}</div><div class="contour__info-value contour__info-value--opt" data-ref="infoOpt">\u2013</div><div class="contour__info-sub" data-ref="infoOptPos"></div></div>
        </div>

        <div class="contour__placeholder" data-ref="placeholder"></div>

        <div class="contour__chart-area" data-ref="chart-area" style="display:none">
          <div class="contour__chart-card" data-ref="chart-card">
            <div class="contour__chart-main">
              <div class="contour__chart-wrap" data-ref="chart-wrap">
                <canvas data-ref="canvas"></canvas>
                <div class="dmike-chart-tooltip" data-ref="tooltip"></div>
              </div>
              <div class="contour__legend" data-ref="legend" style="display:none"></div>
            </div>
            <div class="contour__editor" data-ref="editor-panel">
              <div class="contour__editor-inner" data-ref="editor-inner"></div>
            </div>
          </div>
        </div>
      </main>
    </div>`;

    this._canvas = this._container.querySelector('[data-ref="canvas"]');
    this._tooltip = this._container.querySelector('[data-ref="tooltip"]');
    this._createPicker();
    this._bindEvents();
    this._createModebar();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      multi: false,
      slots: [
        { key: 'x', label: 'X', title: this._context.i18n.t('ui.datasetPicker.slotX'), types: ['numeric'], required: true },
        { key: 'y', label: 'Y', title: this._context.i18n.t('ui.datasetPicker.slotY'), types: ['numeric'], required: true },
        { key: 'z', label: 'Z', title: this._context.i18n.t('ui.datasetPicker.slotZ'), types: ['numeric'], required: true },
      ],
      onChange: (datasets) => {
        const ds = datasets[0] || {};
        this._colRefX = ds.x || null;
        this._colRefY = ds.y || null;
        this._colRefZ = ds.z || null;

        // Auto-enable data point overlay once all 3 columns are selected
        if (this._colRefX && this._colRefY && this._colRefZ) {
          this._state.showDataPoints = true;
        }

        this._saveState();
        // Only redraw if chart is already visible (model already drawn)
        if (this._lastGrid) this._drawContour();
      },
    });

    // Restore saved refs
    if (this._colRefX || this._colRefY || this._colRefZ) {
      this._picker.value = [{ x: this._colRefX, y: this._colRefY, z: this._colRefZ }];
    }
  },

  _bindEvents() {
    const c = this._container;

    // Model type toggle
    c.querySelector('[data-ref="modelType"]').addEventListener('change', () => {
      this._onModelChange();
      this._autoPlot();
    });

    // Auto-plot on coefficient / axis / formula changes
    for (const ref of ['b0','b1','b2','b3','b4','b5','xMin','xMax','yMin','yMax','zLabel','xLabel','yLabel']) {
      const el = c.querySelector(`[data-ref="${ref}"]`);
      if (el) el.addEventListener('change', () => this._autoPlot());
    }
    const formula = c.querySelector('[data-ref="customFormula"]');
    if (formula) formula.addEventListener('input', () => this._autoPlot());
  },

  _autoPlot() {
    // Only draw if model type is selected (always true since select has default)
    const model = this._val('modelType');
    if (model) this._drawContour();
  },

  // ─── Modebar ──────────────────────────────────────────────

  _createModebar() {
    if (this._modebarInstance) {
      this._modebarInstance.destroy();
      this._modebarInstance = null;
    }

    const chartWrap = this._container?.querySelector('[data-ref="chart-wrap"]');
    const editorPanel = this._container?.querySelector('[data-ref="editor-panel"]');
    if (!chartWrap) return;

    this._modebarInstance = createModebar({
      onZoom: () => {},
      onPan: () => {},
      onReset: () => { if (this._lastGrid) this._drawContour(); },
      onExportPNG: () => this._exportPNG(),
      onExportSVG: () => {},
      onExportCSV: () => this._exportCSV(),
      onExportXLSX: () => this._exportCSV(),
      onEditorToggle: (open) => {
        this._editorOpen = open;
        if (editorPanel) {
          editorPanel.classList.toggle('contour__editor--open', open);
        }
        if (open) this._buildEditor();
      },
    });

    chartWrap.prepend(this._modebarInstance.el);
  },

  // ─── Model Evaluation ───────────────────────────────────────

  _evalModel(x, y) {
    const model = this._val('modelType');
    if (model === 'custom') {
      try { return Function('x', 'y', 'return ' + this._val('customFormula'))(x, y); }
      catch { return 0; }
    }
    const b = [0, 1, 2, 3, 4, 5].map(i => this._numVal('b' + i));
    return b[0] + b[1] * x + b[2] * y + b[3] * x * x + b[4] * y * y + b[5] * x * y;
  },

  /**
   * Returns data points from worksheet columns (X, Y, Z).
   * Only rows where all three values are present are returned.
   */
  _getDataPoints() {
    const xVals = this._getColumnValues(this._colRefX);
    const yVals = this._getColumnValues(this._colRefY);
    const zVals = this._getColumnValues(this._colRefZ);
    const len = Math.min(xVals.length, yVals.length, zVals.length);
    const pts = [];
    for (let i = 0; i < len; i++) {
      if (isFinite(xVals[i]) && isFinite(yVals[i]) && isFinite(zVals[i])) {
        pts.push({ x: xVals[i], y: yVals[i], z: zVals[i] });
      }
    }
    return pts;
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportPNG() {
    if (!this._canvas) return;
    const link = document.createElement('a');
    link.download = 'contour-plot.png';
    link.href = this._canvas.toDataURL('image/png');
    link.click();
  },

  _exportCSV() {
    if (!this._lastGrid) return;
    const { grid, xMin, xMax, yMin, yMax, res } = this._lastGrid;
    let csv = 'x;y;z\n';
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = xMin + (xMax - xMin) * i / (res - 1);
        const y = yMax - (yMax - yMin) * j / (res - 1);
        csv += `${x.toFixed(4)};${y.toFixed(4)};${grid[j][i].toFixed(4)}\n`;
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.download = 'contour-data.csv';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // ─── State Persistence ──────────────────────────────────────

  _saveState() {
    this._state = {
      model: this._val('modelType'),
      b: [0, 1, 2, 3, 4, 5].map(i => this._numVal('b' + i)),
      customFormula: this._val('customFormula'),
      xLabel: this._val('xLabel'), yLabel: this._val('yLabel'), zLabel: this._val('zLabel'),
      xMin: this._numVal('xMin'), xMax: this._numVal('xMax'),
      yMin: this._numVal('yMin'), yMax: this._numVal('yMax'),
      // Display options preserved from current state
      numLevels: this._state.numLevels || 10,
      gridRes: this._state.gridRes || 100,
      colorScheme: this._state.colorScheme || 'viridis',
      showLines: this._state.showLines !== false,
      showLabels: this._state.showLabels !== false,
      showDataPoints: this._state.showDataPoints || false,
      colRefX: this._colRefX,
      colRefY: this._colRefY,
      colRefZ: this._colRefZ,
      // Chart editor config
      chartConfig: { ...this._chartConfig },
      refLines: this._refLines,
      refAreas: this._refAreas,
    };
    this._context.stateManager.setModuleState(this._context.instanceId, this._state);
  },

  _applyState() {
    const s = this._state;
    if (!s.model) return;
    const set = (ref, val) => {
      const el = this._container.querySelector(`[data-ref="${ref}"]`);
      if (el) el.value = val;
    };
    set('modelType', s.model);
    this._onModelChange();
    if (s.b) s.b.forEach((v, i) => set('b' + i, v));
    if (s.customFormula) set('customFormula', s.customFormula);
    set('xLabel', s.xLabel); set('yLabel', s.yLabel); set('zLabel', s.zLabel);
    set('xMin', s.xMin); set('xMax', s.xMax);
    set('yMin', s.yMin); set('yMax', s.yMax);

    if (s.colRefX) this._colRefX = s.colRefX;
    if (s.colRefY) this._colRefY = s.colRefY;
    if (s.colRefZ) this._colRefZ = s.colRefZ;

    // Restore picker selection
    if (this._picker && (this._colRefX || this._colRefY || this._colRefZ)) {
      this._picker.value = [{ x: this._colRefX, y: this._colRefY, z: this._colRefZ }];
    }

    this._drawContour();
  },
};

Object.assign(mod, editorMethods, renderMethods);
export default mod;
