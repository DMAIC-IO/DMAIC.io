/**
 * D.Mike — Contour Plot Module (contour-plot.js)
 * Data phase: renders contour diagrams from regression models z = f(x, y).
 *
 * Migrated to createModule + Alpine CSP. The Model (contour-plot-model.js) holds
 * the regression spec, axes, display options, column refs and the shared
 * chart-editor config — everything that persists.
 *
 * SPECIAL: the contour itself is rendered by this module's OWN imperative widget
 * (contour-plot-render.js draws onto a <canvas>; contour-plot-editor.js builds the
 * chart-editor sidebar via the shared chart-editor.js helpers). These two files are
 * kept verbatim. They are mounted/updated imperatively into the template's
 * `data-ref` anchors in init()/on each redraw and disposed in destroy() — the
 * msa-typ1 imperative-widget lifecycle (`_renderGen` stale-guard, `_unsubs` for
 * the event-bus, transient handles only in the data-fn, never in the Model).
 *
 * The render/editor mixins read the user inputs through `_val()`/`_numVal()` and
 * the display/marker state through `_state`/`_chartConfig`/`_refLines`/`_refAreas`
 * /`_colRef*`. Those are bridged to the reactive Model below, so the mixins keep
 * working unchanged.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './contour-plot-model.js';

import { createModebar } from '../../core/chart/modebar.js';
import { DatasetPicker, getColumnValues } from '../../ui/dataset-picker.js';

import { editorMethods } from './contour-plot-editor.js';
import { renderMethods } from './contour-plot-render.js';
import { evalFormula, validateFormula } from './contour-plot-formula.js';

/** Map a legacy `_val(id)` reference to its Model property. */
const VAL_FIELD = {
  modelType: 'modelType',
  customFormula: 'customFormula',
  xLabel: 'xLabel', yLabel: 'yLabel', zLabel: 'zLabel',
  xMin: 'xMin', xMax: 'xMax', yMin: 'yMin', yMax: 'yMax',
};

const BETA = ['β₀', 'β₁', 'β₂', 'β₃', 'β₄', 'β₅'];

const mod = createModule({
  config: {
    id: 'contour-plot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.contour-plot',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // The imperative render + editor mixins (kept verbatim) become methods on
      // the Alpine component, sharing `this` with the data-fn below. They resolve
      // `this._drawContour()` / `this._buildEditor()` against the component proxy.
      ...renderMethods,
      ...editorMethods,

      // ── Transient handles (NEVER persisted) ───────────────────
      _container: null,
      _context: null,
      _canvas: null,
      _lastGrid: null,
      _modebarInstance: null,
      _picker: null,
      _activeColorPicker: null,
      _editorOpen: false,
      _tooltipMove: null,
      _tooltipLeave: null,
      _renderGen: 0,
      _unsubs: [],
      // Bridge handles wired to the reactive Model in init().
      _state: null,
      _chartConfig: null,
      _refLines: null,
      _refAreas: null,
      _colRefX: null,
      _colRefY: null,
      _colRefZ: null,

      // ── Reactive view state (transient — colorbar + tooltip) ───
      legend: { title: '', items: [] },
      legendShow: false,
      tip: { visible: false, left: 0, top: 0, x: '', y: '', z: '' },
      formulaError: null,
      xLabelText: '', yLabelText: '', zLabelText: '',

      /** Mirror the Model axis labels into the reactive tooltip fields. */
      _syncLabels() {
        this.xLabelText = this.model.xLabel;
        this.yLabelText = this.model.yLabel;
        this.zLabelText = this.model.zLabel;
      },

      // ── View transforms ───────────────────────────────────────

      betaLabel: (i) => BETA[i] || '',

      // ── Legacy-compatible helpers (bridge mixins → Model) ──────

      _t(key) { return module._context.i18n.t(`modules.contour-plot.${  key}`); },
      _isEn() { return module._context.language === 'en'; },

      /** Read an input value from the Model (replaces the old DOM read). */
      _val(id) {
        const m = this.model;
        if (id in VAL_FIELD) return m[VAL_FIELD[id]];
        const bm = /^b([0-5])$/.exec(id);
        if (bm) return m.b[Number(bm[1])];
        return '';
      },
      _numVal(id, fallback = 0) {
        const v = parseFloat(this._val(id));
        return isNaN(v) ? fallback : v;
      },

      /** Persistence is handled by the createModule persist-$watch → no-op. */
      _saveState() {},

      _getColumnValues(ref) {
        return getColumnValues(module._context?.stateManager, ref)
          .filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      // ── Model evaluation (used by the render mixin) ────────────

      _evalModel(x, y) {
        if (this.model.modelType === 'custom') {
          return evalFormula(this.model.customFormula, x, y);
        }
        const b = this.model.b;
        return b[0] + b[1] * x + b[2] * y + b[3] * x * x + b[4] * y * y + b[5] * x * y;
      },

      /** Re-validate the custom formula; store {code, token} or null. */
      revalidateFormula() {
        if (this.model.modelType !== 'custom') { this.formulaError = null; return; }
        const r = validateFormula(this.model.customFormula);
        this.formulaError = r.ok ? null : { code: r.code, token: r.token };
      },

      /** Textarea @input handler: validate, then re-plot. */
      onFormulaInput() {
        this.revalidateFormula();
        this.autoPlot();
      },

      /** Localized message for the current formulaError (or '' when valid). */
      formulaErrorText() {
        const e = this.formulaError;
        if (!e) return '';
        const KEY = {
          UNKNOWN_FUNCTION: 'formulaErrFn',
          UNKNOWN_IDENTIFIER: 'formulaErrVar',
          UNEXPECTED_CHAR: 'formulaErrChar',
          INVALID_NUMBER: 'formulaErrNum',
          EMPTY: 'formulaErrEmpty',
          SYNTAX: 'formulaErrSyntax',
          TRAILING: 'formulaErrSyntax',
        };
        return this.t(KEY[e.code] || 'formulaErrSyntax', { name: e.token ?? '' });
      },

      /** Worksheet data points (X, Y, Z) — only rows where all three exist. */
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

      // ── Event handlers (template @change / @input) ─────────────

      onModelTypeChange() {
        // coeff/custom sections are toggled declaratively (x-show); just redraw.
        this.revalidateFormula();
        this.autoPlot();
      },

      autoPlot() {
        if (this.model.modelType) this._drawContour();
      },

      // ── Export ─────────────────────────────────────────────────

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

      // ── Imperative widgets: DatasetPicker + Modebar ────────────

      _createPicker() {
        const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
        if (!pickerWrap) return;
        this._picker?.destroy();

        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: false,
          slots: [
            { key: 'x', label: 'X', title: module._context.i18n.t('ui.datasetPicker.slotX'), types: ['numeric'], required: true },
            { key: 'y', label: 'Y', title: module._context.i18n.t('ui.datasetPicker.slotY'), types: ['numeric'], required: true },
            { key: 'z', label: 'Z', title: module._context.i18n.t('ui.datasetPicker.slotZ'), types: ['numeric'], required: true },
          ],
          onChange: (datasets) => {
            const ds = datasets[0] || {};
            this._colRefX = ds.x || null;
            this._colRefY = ds.y || null;
            this._colRefZ = ds.z || null;
            this.model.colRefX = this._colRefX;
            this.model.colRefY = this._colRefY;
            this.model.colRefZ = this._colRefZ;

            // Auto-enable data point overlay once all 3 columns are selected.
            if (this._colRefX && this._colRefY && this._colRefZ) {
              this.model.showDataPoints = true;
            }

            if (this._lastGrid) this._drawContour();
          },
        });

        if (this._colRefX || this._colRefY || this._colRefZ) {
          this._picker.value = [{ x: this._colRefX, y: this._colRefY, z: this._colRefZ }];
        }
      },

      _createModebar() {
        this._modebarInstance?.destroy();
        this._modebarInstance = null;

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
            if (editorPanel) editorPanel.classList.toggle('contour__editor--open', open);
            if (open) this._buildEditor();
          },
        });

        chartWrap.prepend(this._modebarInstance.el);
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._container = module._container;
        this._context = module._context;
        this._unsubs = [];
        this._renderGen = 0;

        // Bridge the imperative mixins to the reactive Model. The mixins mutate
        // these objects/arrays in place (e.g. `cc.markerSymbol = v`,
        // `this._state.colorScheme = v`, `refLines.push(...)`) — sharing the same
        // reference keeps the Model (and persistence) in sync.
        this._state = this.model;
        this._chartConfig = this.model.chartConfig;
        this._refLines = this.model.refLines;
        this._refAreas = this.model.refAreas;
        this._colRefX = this.model.colRefX;
        this._colRefY = this.model.colRefY;
        this._colRefZ = this.model.colRefZ;

        // Seed locale-default axis/response labels when unset (legacy seeded
        // these into the hidden inputs at render time, so the tooltip/title show
        // "Factor X" / "Response Z" out of the box).
        const en = this._isEn();
        if (!this.model.xLabel) this.model.xLabel = en ? 'Factor X' : 'Faktor X';
        if (!this.model.yLabel) this.model.yLabel = en ? 'Factor Y' : 'Faktor Y';
        if (!this.model.zLabel) this.model.zLabel = en ? 'Response Z' : 'Antwort Z';
        this._syncLabels();

        this._canvas = this._container.querySelector('[data-ref="canvas"]');

        this._createPicker();
        this._createModebar();

        const eb = module._context.eventBus;
        if (eb) {
          const onActivated = ({ instanceId }) => {
            if (instanceId === module._context.instanceId) this._picker?.refresh();
          };
          eb.on('module:activated', onActivated);
          this._unsubs.push(() => eb.off('module:activated', onActivated));

          const onTheme = () => { if (this._lastGrid) this._drawContour(); };
          eb.on('theme:changed', onTheme);
          this._unsubs.push(() => eb.off('theme:changed', onTheme));
        }

        this.revalidateFormula();

        // Initial draw (model always has a drawable spec).
        this._drawContour();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._picker?.destroy();
        this._picker = null;
        this._removeTooltipListeners();
        this._closeColorPicker();
        if (this._modebarInstance) {
          this._modebarInstance.destroy();
          this._modebarInstance = null;
        }
        this._canvas = null;
        this._lastGrid = null;
      },
    };
  },
});

export default mod;
