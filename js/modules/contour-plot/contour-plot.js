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
 *
 * @agent  Steuerbar über das Viewmodel: Modellform, Formel, Achsenbereich
 *   und Beschriftungen (setParam), die sechs Koeffizienten (setCoefficient)
 *   und die drei Datenspalten (setColumn). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead), samt Minimum, Maximum, Spannweite und
 *   Optimum der Fläche (surface).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText, requireNumber } from '../../core/agent/agent-argcheck.js';
import { datasetSlotColumns } from '../../core/agent/agent-datasets.js';
import { State, MODEL_TYPES } from './contour-plot-model.js';

import { createModebar } from '../../core/chart/modebar.js';
import { DatasetPicker, getColumnValues, refToKey, keyToRef } from '../../ui/dataset-picker.js';

import { editorMethods } from './contour-plot-editor.js';
import { renderMethods } from './contour-plot-render.js';
import { evalFormula, validateFormula } from './contour-plot-formula.js';
import { scanSurface } from './contour-plot-surface.js';

/** Map a legacy `_val(id)` reference to its Model property. */
const VAL_FIELD = {
  modelType: 'modelType',
  customFormula: 'customFormula',
  xLabel: 'xLabel', yLabel: 'yLabel', zLabel: 'zLabel',
  xMin: 'xMin', xMax: 'xMax', yMin: 'yMin', yMax: 'yMax',
};

const BETA = ['β₀', 'β₁', 'β₂', 'β₃', 'β₄', 'β₅'];

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'x', types: ['numeric'], required: true },
  { key: 'y', types: ['numeric'], required: true },
  { key: 'z', types: ['numeric'], required: true },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'y', 'z'];

/** Die Optionen, die `setParam` annimmt (Reihenfolge der Oberfläche). */
const PARAM_KEYS = ['modelType', 'customFormula', 'xLabel', 'yLabel', 'zLabel', 'xMin', 'xMax', 'yMin', 'yMax'];

/** Je Option ihr Prüfer; gibt den Wert zurück, den das Model hält. */
const PARAM_CHECKS = {
  modelType: (v) => { requireEnum('value', v, MODEL_TYPES); return v; },
  customFormula: (v) => requireText('value', v),
  xLabel: (v) => requireText('value', v),
  yLabel: (v) => requireText('value', v),
  zLabel: (v) => requireText('value', v),
  xMin: (v) => requireNumber('value', v),
  xMax: (v) => requireNumber('value', v),
  yMin: (v) => requireNumber('value', v),
  yMax: (v) => requireNumber('value', v),
};

/** Zahl der Polynomkoeffizienten b0…b5. */
const COEFFICIENT_COUNT = 6;

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'statParams.trim'`) in `obj` ablegen.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/**
 * Die Agenten-Lesefläche des Konturdiagramms.
 *
 * Modell (Form, Koeffizienten oder Formel), Achsenbereich, Beschriftungen und
 * die drei optionalen Datenspalten sind der Zustand. Das Model persistiert
 * die Form unter dem Altschlüssel `model`; die Lesefläche nennt sie
 * `modelType`, wie das Feld und den `setParam`-Schlüssel. `formulaError` ist
 * die Absage, die die Oberfläche unter der Formel zeigt. Nicht darin:
 * Darstellung (Farbschema, Stufen, Raster, Linien, Datenpunkte, Marker,
 * `chartConfig`, Referenzlinien — nur über den Diagramm-Editor), Raster und
 * Legende. Minimum, Maximum und Optimum der Fläche stehen in `surface` (E8).
 *
 * @typedef {object} AgentRead
 * @property {string} modelType  `quadratic`, `interaction` or `custom`
 * @property {number[]} b  the six polynomial coefficients b0…b5 (used unless `modelType` is `custom`)
 * @property {string} customFormula  the formula in x and y (used with `modelType` `custom`)
 * @property {string} xLabel  the label of the x factor
 * @property {string} yLabel  the label of the y factor
 * @property {string} zLabel  the label of the response
 * @property {number} xMin  lower end of the x range
 * @property {number} xMax  upper end of the x range
 * @property {number} yMin  lower end of the y range
 * @property {number} yMax  upper end of the y range
 * @property {object|null} colRefX  the optional x data column (slot `x`), or null
 * @property {object|null} colRefY  the optional y data column (slot `y`), or null
 * @property {object|null} colRefZ  the optional response data column (slot `z`), or null
 * @property {object|null} formulaError  `{ code, token }` while the custom formula is invalid, else null
 * @property {string[]} activeParams  the options `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {object|null} surface  the evaluated surface over the axis range: `{ zMin, zMax, range, optimum: { x, y, z } }` (optimum = highest point), or null if the model cannot be evaluated
 */
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

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Modell, Bereich, Beschriftungen, Spaltenbezüge, wählbare Mengen und Kennzahlen der Fläche
       */
      read(options) {
        const m = this.model;
        return readAgentState('contour-plot', {
          modelType: m.modelType, b: m.b, customFormula: m.customFormula,
          xLabel: m.xLabel, yLabel: m.yLabel, zLabel: m.zLabel,
          xMin: m.xMin, xMax: m.xMax, yMin: m.yMin, yMax: m.yMax,
          colRefX: m.colRefX, colRefY: m.colRefY, colRefZ: m.colRefZ,
          formulaError: this.formulaError,
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          surface: this._agentSurface(),
        }, options);
      },

      /** @noagent view transform; ob die Fläche aus einer eigenen Formel kommt (Vorlage und activeParams) */
      isCustomModel() { return this.model.modelType === 'custom'; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return PARAM_KEYS.filter(k => k !== 'customFormula' || this.isCustomModel()); },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() { return datasetSlotColumns(module._context.stateManager, DATASET_SLOTS); },

      /** @noagent view transform; die Optionen der Modellform (eine Quelle: MODEL_TYPES) */
      modelTypeOptions() {
        const LABEL = { quadratic: 'modelQuadratic', interaction: 'modelInteraction', custom: 'modelCustom' };
        return MODEL_TYPES.map(v => ({ value: v, label: this.t(LABEL[v]) }));
      },

      /**
       * Eine Option der Antwortfläche setzen.
       * @agent
       * @param {'modelType'|'customFormula'|'xLabel'|'yLabel'|'zLabel'|'xMin'|'xMax'|'yMin'|'yMax'} key
       *   welche Option; read().activeParams nennt die im aktuellen Zustand gültigen
       * @param {any} value `modelType`: 'quadratic', 'interaction' oder 'custom'; Formel und Beschriftungen: Text; Bereichsgrenzen: Zahl
       * @returns {void}
       * @throws {Error} wenn `key` unbekannt oder gerade nicht aktiv ist oder `value` ungültig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this.revalidateFormula();
        this._syncLabels();
        this.autoPlot();
      },

      /**
       * Einen Polynomkoeffizienten setzen (nicht bei eigener Formel).
       * @agent
       * @param {number} index welcher Koeffizient, 0 bis 5 (b0…b5)
       * @param {number} value der Wert
       * @returns {void}
       * @throws {Error} wenn `index` außerhalb 0…5 liegt, `value` keine Zahl ist oder `modelType` `custom` ist
       */
      setCoefficient(index, value) {
        const i = requireNumber('index', index, { min: 0, max: COEFFICIENT_COUNT - 1, integer: true });
        const v = requireNumber('value', value);
        if (this.isCustomModel()) {
          throw new Error('invalid modelType "custom" for setCoefficient; allowed: quadratic, interaction');
        }
        this.model.b[i] = v;
        this.autoPlot();
      },

      /**
       * Eine Spalte einem Slot zuweisen; die übrigen Slots bleiben.
       * @agent
       * @param {'x'|'y'|'z'} slot der Slot
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, this.activeColumnSlots());
        const row = this._datasetRows()[0];
        if (ref == null) {
          row[slot] = null;
        } else {
          const keys = this.pickableColumns()[slot].map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
          row[slot] = keyToRef(refToKey(ref));
        }
        this._applyDatasets([row]);
        if (this._picker) this._picker.value = [row];
      },

      /** Die Kennzahlen der Fläche für read() — dieselbe Abtastung wie das Zeichnen (E8). */
      _agentSurface() {
        if (this.isCustomModel() && this.formulaError) return null;
        const { zMin, zMax, optimum } = scanSurface((x, y) => this._evalModel(x, y), {
          xMin: this._numVal('xMin', -3), xMax: this._numVal('xMax', 3),
          yMin: this._numVal('yMin', -3), yMax: this._numVal('yMax', 3),
        }, this._state.gridRes || 100);
        if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return null;
        return { zMin, zMax, range: zMax - zMin, optimum };
      },

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, neu zeichnen. Picker und Aktion rufen ihn. */
      _applyDatasets(rows) {
        const ds = rows[0] || {};
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

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ x: this.model.colRefX, y: this.model.colRefY, z: this.model.colRefZ }];
      },

      // ── View transforms ───────────────────────────────────────

      /** @noagent view transform */
      betaLabel: (i) => BETA[i] || '',

      /** @noagent DOM event handler; the agent uses setCoefficient() */
      onCoefficientInput(index, event) {
        const raw = event.target.value.trim();
        if (raw !== '' && Number.isFinite(Number(raw))) this.setCoefficient(index, Number(raw));
        else event.target.value = this.model.b[index];
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      onAxisInput(key, event) {
        const raw = event.target.value.trim();
        if (raw !== '' && Number.isFinite(Number(raw))) this.setParam(key, Number(raw));
        else event.target.value = this.model[key];
      },

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

      /** @noagent helper; re-validate the custom formula, store {code, token} or null */
      revalidateFormula() {
        if (this.model.modelType !== 'custom') { this.formulaError = null; return; }
        const r = validateFormula(this.model.customFormula);
        this.formulaError = r.ok ? null : { code: r.code, token: r.token };
      },

      /** @noagent view transform; localized message for the current formulaError (or '' when valid) */
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

      // ── Redraw ─────────────────────────────────────────────────

      /** @noagent helper; redraw when a model form is set */
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

        const i18n = module._context.i18n;
        const SLOT_LABELS = {
          x: { label: 'X', title: i18n.t('ui.datasetPicker.slotX') },
          y: { label: 'Y', title: i18n.t('ui.datasetPicker.slotY') },
          z: { label: 'Z', title: i18n.t('ui.datasetPicker.slotZ') },
        };
        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: false,
          slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
          onChange: (rows) => this._applyDatasets(rows),
        });

        if (this._colRefX || this._colRefY || this._colRefZ) {
          this._picker.value = this._datasetRows();
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

      /** @noagent lifecycle */
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

      /** @noagent lifecycle */
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
