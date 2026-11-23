/**
 * D.Mike — XY-Plot Module (xy-plot.js)
 * Data phase: scatter/line plot of worksheet columns.
 * Each dataset has its own X and Y column — datasets need not share X data.
 * Optional Size slot turns the dataset into a bubble plot (third numeric column
 * sqrt-mapped to 6–28 px marker diameter so area stays proportional to value).
 * Uses the SVG chart framework (chartManager) for rendering.
 * Includes editor panel for series customization (connect line), reference
 * lines/areas (chart-type owned).
 *
 * Migrated to createModule + Alpine CSP.
 * Architecture:
 *   - Static structure (input panel, placeholder, plot wrap, stats) lives in
 *     the Alpine template (xy-plot.html).
 *   - DatasetPicker, chart, and stats table are rendered imperatively.
 *   - DatasetPicker mounted in init(), disposed in destroy().
 *   - chartManager uses a _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *   - getState() syncs chart-editor changes back to the model before
 *     serialising (refLines/refAreas/bgColor/seriesOverrides).
 *
 * @agent  Steuerbar über das Viewmodel: die Datenreihen, je Reihe X-, Y-,
 *   Gruppen- und Größenspalte (setDatasets) und Fehlerbalken (setErrorBars). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead), samt den Kennzahlen der Y-Werte je
 *   Reihe (stats).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { datasetSlotColumns, requireDatasetRows } from '../../core/agent/agent-datasets.js';
import { requireEnum, requireIndex, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { keyToRef, refToKey } from '../../ui/column-picker.js';
import Alpine from '@alpinejs/csp';
import {
  State, ERROR_BAR_MODES, ERROR_BAR_KEYS,
  emptyErrorBars, errorBarsFromJSON, buildErrorBars,
} from './xy-plot-model.js';
import {
  edCheckboxRow, edSelectRow,
  edColorPair,
  openColorPicker,
} from '../../core/chart/chart-editor.js';
import {
  DatasetPicker, discoverColumns, slotFilter,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { h } from '../../core/dom.js';

/** Labels of the four error directions — math symbols, the same in every language. */
const ERROR_BAR_LABELS = { xPlus: '+X', xMinus: '−X', yPlus: '+Y', yMinus: '−Y' };
/** i18n key (under `modules.xy-plot.`) of each error bar mode's option. */
const ERROR_BAR_MODE_LABELS = { none: 'ebModeNone', constant: 'ebModeConstant', columns: 'ebModeColumns' };
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'x', types: ['numeric'], minCount: 1, required: true },
  { key: 'y', types: ['numeric'], minCount: 1, required: true },
  { key: 'group', group: true },
  { key: 'size', types: ['numeric'], minCount: 1 },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'y', 'group', 'size'];

/**
 * Eine Datenreihe, wie `read().datasets` sie je Zeile des Pickers liefert.
 * Sätze unter `types.Dataset.<slot>`, dieselben an den Slots „X“, „Y“, „G“, „S“.
 *
 * @typedef {object} Dataset
 * @property {object|null} xRef  X-Spalte (Slot x)
 * @property {object|null} yRef  Y-Spalte (Slot y)
 * @property {object|null} groupRef  Gruppenspalte (Slot group)
 * @property {object|null} sizeRef  Spalte der Blasengröße (Slot size)
 * @property {ErrorBars} errorBars  Fehlerbalken der Reihe (setErrorBars)
 */

/**
 * Die Fehlerbalken einer Datenreihe. Sätze unter `types.ErrorBars.<key>`.
 *
 * @typedef {object} ErrorBars
 * @property {string} mode  'none', 'constant' oder 'columns'
 * @property {number|object|null} xPlus  Fehler nach +x: Zahl (constant) oder Spaltenbezug (columns)
 * @property {number|object|null} xMinus  Fehler nach −x
 * @property {number|object|null} yPlus  Fehler nach +y
 * @property {number|object|null} yMinus  Fehler nach −y
 */

/**
 * Kennzahlen einer gezeichneten Reihe (`computeSeriesStats`). Sätze
 * geteilt unter `modules.shared.types.SeriesStats.*`.
 *
 * @typedef {object} SeriesStats
 * @property {string} name  Name der Reihe
 * @property {Stats|null} stats  Kennzahlen, leer ohne Werte
 * @property {StatsCi} ci  Konfidenzintervalle
 */

/**
 * @typedef {object} Stats
 * @property {number} n  Anzahl Werte
 * @property {number} mean  Mittelwert
 * @property {number} stddev  Standardabweichung
 * @property {number} variance  Varianz
 * @property {number} seMean  Standardfehler des Mittelwerts
 * @property {number} median  Median
 * @property {number} min  kleinster Wert
 * @property {number} max  größter Wert
 * @property {number} range  Spannweite
 * @property {number} q1  erstes Quartil
 * @property {number} q3  drittes Quartil
 * @property {number} skewness  Schiefe
 * @property {number} kurtosis  Kurtosis
 */

/**
 * @typedef {object} StatsCi
 * @property {number[]} [mean]  Intervall des Mittelwerts
 * @property {number[]} [variance]  Intervall der Varianz
 * @property {number[]} [stddev]  Intervall der Standardabweichung
 */

/**
 * Die Agenten-Lesefläche des XY-Diagramms.
 *
 * Die Datenreihen sind der Zustand, im Model als `datasets` mit
 * `{ xRef, yRef, groupRef, sizeRef }` je Reihe; unvollständige Reihen
 * bleiben stehen (wie bei der Oberfläche). Nicht darin: Darstellung
 * (`showLines`, `showMarkers`, `seriesOverrides`, Referenzlinien,
 * Hintergrund — nur über den Diagramm-Editor), `showStats`/`confLevel`,
 * das Diagrammbild, `exampleWorksheetId`. Die Kennzahlen stehen in `stats`.
 *
 * @typedef {object} AgentRead
 * @property {Dataset[]} datasets  per data row its columns, each described under keys
 * @property {string[]} activeColumnSlots  the slot keys a row of `setDatasets` may carry
 * @property {object} pickableColumns  per slot the columns `setDatasets` accepts, each `{ key, name }`
 * @property {SeriesStats[]|null} stats  per plotted series its statistics, each figure described under keys; null while nothing can be computed
 */

const mod = createModule({
  config: {
    id: 'xy-plot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.xy-plot',
    version: '1.4.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {object|null} — active chart instance */
      _chart: null,
      /** Guard against concurrent plot runs */
      _plotting: false,
      /** @type {import('../../ui/dataset-picker.js').DatasetPicker|null} */
      _picker: null,
      /** Last series array passed to the chart (for _renderStats). */
      _lastSeries: null,
      /** Stale-render guard counter */
      _renderGen: 0,
      /** @type {object|null} — active color picker popup */
      _activeColorPicker: null,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, wählbare Mengen und Kennzahlen
       */
      read(options) {
        return readAgentState('xy-plot', {
          datasets: this.model.datasets,
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          stats: this._agentStats(),
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() { return datasetSlotColumns(module._context.stateManager, DATASET_SLOTS); },

      /**
       * Die ganze Liste der Datenreihen setzen.
       * @agent
       * @param {object[]} rows je Reihe `{ <slot>: ref|null }`; Slots siehe
       *   read().activeColumnSlots, Spalten siehe read().pickableColumns; [] leert
       * @returns {void}
       * @throws {Error} wenn `rows` keine Liste ist, ein Slot unbekannt oder eine Spalte nicht wählbar
       */
      setDatasets(rows) {
        const clean = requireDatasetRows(rows, this.pickableColumns());
        this._applyDatasets(clean);
        if (this._picker) this._picker.value = clean;
      },

      /**
       * Die Fehlerbalken einer Datenreihe setzen.
       * @agent
       * @param {number} index die Reihe, 0-basiert (read().datasets)
       * @param {object} spec `{ mode, xPlus?, xMinus?, yPlus?, yMinus? }`; mode 'none',
       *   'constant' (Zahlen) oder 'columns' (Spalten aus read().pickableColumns.y); fehlend = null
       * @returns {void}
       * @throws {Error} wenn index, mode, eine Zahl oder eine Spalte ungültig ist
       */
      setErrorBars(index, spec) {
        requireIndex('index', index, this.model.datasets.length, { existing: true });
        if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
          throw new Error(`invalid spec ${JSON.stringify(spec)}; allowed: { mode, xPlus, xMinus, yPlus, yMinus }`);
        }
        const mode = requireEnum('mode', spec.mode, ERROR_BAR_MODES);
        const next = emptyErrorBars(mode);
        if (mode !== 'none') {
          const columnKeys = this.pickableColumns().y.map(c => c.key);
          for (const key of ERROR_BAR_KEYS) {
            const v = spec[key];
            if (v == null) continue;
            if (mode === 'constant') {
              next[key] = requireNumber(key, v);
            } else {
              const k = v && typeof v === 'object' ? refToKey(v) : String(v);
              requireKnownId(key, k, columnKeys);
              next[key] = keyToRef(k);
            }
          }
        }
        this.model.datasets[index] = { ...this.model.datasets[index], errorBars: next };
        if (this._picker) this._picker.value = this._datasetRows();
        this._plot();
      },

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, Serienanpassungen verwerfen, neu zeichnen. */
      _applyDatasets(rows) {
        const refsOf = (list) => JSON.stringify(list.map(ds => [ds.xRef, ds.yRef, ds.groupRef, ds.sizeRef]));
        const before = refsOf(this.model.datasets);
        this.model.datasets = rows.map(ds => ({
          xRef: ds.x || null,
          yRef: ds.y || null,
          groupRef: ds.group || null,
          sizeRef: ds.size || null,
          errorBars: ds.errorBars ? errorBarsFromJSON(ds.errorBars) : emptyErrorBars(),
        }));
        // Series count may change — drop stale overrides when the columns change.
        // An error bar edit alone keeps the series, so it keeps their overrides.
        if (refsOf(this.model.datasets) !== before) this.model.seriesOverrides = [];
        this._plot();
      },

      /** Die aktuellen Zeilen in Picker-Form, aus dem Model. */
      _datasetRows() {
        return this.model.datasets.map(ds => ({
          x: ds.xRef, y: ds.yRef, group: ds.groupRef, size: ds.sizeRef, errorBars: ds.errorBars,
        }));
      },

      /** Die Kennzahlen für read() — dieselben Reihen und dieselbe Rechnung wie die Tabelle. */
      _agentStats() {
        let series;
        try { series = this._buildSeries(); } catch { return null; }
        if (!series.length) return null;
        const result = computeSeriesStats(this._statsInput(series), this.model.confLevel / 100)
          .map(({ name, stats, ci }) => ({ name, stats, ci }));
        return result.length ? result : null;
      },

      /** Die Abbildung Reihe → Statistikeingabe (Y-Werte sichtbarer Reihen) — Quelle für Tabelle und read(). */
      _statsInput(series) {
        return series
          .filter(s => s.visible !== false)
          .map(s => ({
            name: s.name,
            values: s.y,
            color: s.color,
            visible: true,
          }));
      },

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      _getColumnName(ref) {
        return getColumnName(module._context.stateManager, ref);
      },

      // ── DatasetPicker (imperative widget) ─────────────────────

      _mountPicker() {
        const pickerWrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!pickerWrap) return;
        this._picker?.destroy();
        this._picker = null;

        const i18n = module._context.i18n;
        const SLOT_LABELS = {
          x: { label: 'X', title: i18n.t('ui.datasetPicker.slotX'), helpKey: 'modules.xy-plot.types.Dataset.xRef' },
          y: { label: 'Y', title: i18n.t('ui.datasetPicker.slotY'), helpKey: 'modules.xy-plot.types.Dataset.yRef' },
          group: { label: 'G', title: i18n.t('ui.datasetPicker.slotG'), helpKey: 'modules.xy-plot.types.Dataset.groupRef' },
          size: { label: 'S', title: i18n.t('ui.datasetPicker.slotS'), helpKey: 'modules.xy-plot.types.Dataset.sizeRef' },
        };
        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: true,
          addHelpKey: 'modules.xy-plot.actions.setDatasets.help',
          colors: CHART_COLORS,
          slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
          onChange: (rows) => this._applyDatasets(rows),
          rowExtension: {
            key: 'errorBars',
            empty: () => emptyErrorBars(),
            render: (el, value, update) => this._renderErrorBarControls(el, value, update),
          },
        });

        // Restore saved refs
        if (this.model.datasets.some(ds => ds.xRef || ds.yRef || ds.groupRef || ds.sizeRef)) {
          this._picker.value = this._datasetRows();
        }
      },

      _refreshPicker() {
        this._picker?.refresh?.();
      },

      /**
       * The error bar controls of one picker row: a mode select and, unless
       * the mode is 'none', one field per direction (number or column).
       * A mode change starts from empty values.
       */
      _renderErrorBarControls(el, value, update) {
        const eb = value || emptyErrorBars();
        const helpKey = (k) => `modules.xy-plot.types.ErrorBars.${k}`;
        const modeSelect = h('select', { class: 'xyplot__eb-mode', 'data-ref': 'eb-mode' },
          ERROR_BAR_MODES.map(m => h('option', { value: m, selected: m === eb.mode }, _t(ERROR_BAR_MODE_LABELS[m]))));
        modeSelect.addEventListener('change', () => update(emptyErrorBars(modeSelect.value)));
        el.append(h('label', { class: 'xyplot__eb-head', 'data-help-key': helpKey('mode') },
          h('span', { class: 'xyplot__eb-title' }, _t('errorBars')), modeSelect));
        if (eb.mode === 'none') return;

        const ySlot = DATASET_SLOTS.find(s => s.key === 'y');
        const columns = eb.mode === 'columns'
          ? discoverColumns(module._context.stateManager, slotFilter(ySlot))
          : [];
        const fields = h('div', { class: 'xyplot__eb-fields' });
        for (const key of ERROR_BAR_KEYS) {
          let input;
          if (eb.mode === 'constant') {
            input = h('input', {
              type: 'number', step: 'any', class: 'xyplot__eb-input', 'data-eb': key, value: eb[key] ?? '',
            });
            input.addEventListener('change', () => {
              const n = input.value === '' ? null : Number(input.value);
              update({ ...eb, [key]: Number.isFinite(n) ? n : null });
            });
          } else {
            const current = eb[key] ? refToKey(eb[key]) : '';
            input = h('select', { class: 'xyplot__eb-input', 'data-eb': key },
              h('option', { value: '' }, _t('ebNoColumn')),
              columns.map(c => {
                const k = refToKey(c);
                return h('option', { value: k, selected: k === current }, `${c.shortName} ${c.columnName}`);
              }));
            input.addEventListener('change', () => {
              update({ ...eb, [key]: input.value ? keyToRef(input.value) : null });
            });
          }
          fields.append(h('label', { class: 'xyplot__eb-field', 'data-help-key': helpKey(key) },
            h('span', { class: 'xyplot__eb-label' }, ERROR_BAR_LABELS[key]), input));
        }
        el.append(fields);
      },

      // ── Error display ─────────────────────────────────────────

      _showError(msg) {
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 4000);
        }
      },

      // ── Placeholder ───────────────────────────────────────────

      _showPlaceholder() {
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = '';
        if (plotEl) {
          plotEl.style.display = 'none';
          plotEl.replaceChildren();
        }
        this._destroyChart();
      },

      // ── Chart cleanup ─────────────────────────────────────────

      _destroyChart() {
        this._closeCp();
        if (this._chart) {
          module._context.chartManager.destroy(this._chart);
          this._chart = null;
        }
      },

      _closeCp() {
        if (this._activeColorPicker) {
          this._activeColorPicker.close();
          this._activeColorPicker = null;
        }
      },

      /**
       * Sync chart-editor changes (refLines/refAreas/bgColor + series visual
       * overrides) back to the model before serialising.
       */
      _syncFromChart() {
        if (this._chart && this._chart.config) {
          this.model.refLines = this._chart.config.refLines || this.model.refLines;
          this.model.refAreas = this._chart.config.refAreas || this.model.refAreas;
          if (this._chart.config.bgColor != null) {
            this.model.bgColor = this._chart.config.bgColor;
          }
        }
      },

      // ── Bubble helper (delegates to model) ────────────────────

      _buildBubble(rawSizes, label) {
        return State.buildBubble(rawSizes, label);
      },

      // ── Plot ──────────────────────────────────────────────────

      /**
       * Die Reihen aus den Datensätzen bilden (paarweise Filter, Gruppen, Größe, Anpassungen).
       * @returns {object[]} die Reihen `{ name, color, visible, x, y, … }`, wie `_plot` sie zeichnet
       * @throws {Error} mit der übersetzten Meldung, die `_plot` über `_showError` zeigt
       */
      _buildSeries() {
        const series = [];
        const pushSeries = (x, y, name, bubble, errorBars) => {
          const seriesIdx = series.length;
          const defaultColor = CHART_COLORS[seriesIdx % CHART_COLORS.length];
          const ovr = this.model.seriesOverrides[seriesIdx] || {};
          const s = {
            name: ovr.name || name,
            color: ovr.color || defaultColor,
            stroke: ovr.stroke || 'rgba(255,255,255,1)',
            strokeWidth: ovr.strokeWidth ?? 1.5,
            symbol: ovr.symbol || 'circle',
            visible: ovr.visible !== false,
            x,
            y,
            markerSize: this.model.showMarkers ? 7 : 0,
            connectLine: ovr.connectLine || {
              show: this.model.showLines,
              color: ovr.color || defaultColor,
              dash: 'solid',
              width: 2,
            },
          };
          if (bubble && this.model.showMarkers) {
            s.sizes = bubble.sizes;
            s.sizeValues = bubble.rawSizes;
            s.sizeLabel = bubble.label;
          }
          if (errorBars) s.errorBars = errorBars;
          series.push(s);
        };

        for (let i = 0; i < this.model.datasets.length; i++) {
          const ds = this.model.datasets[i];
          // Skip incomplete datasets silently — the chart updates as the user selects columns.
          if (!ds.xRef || !ds.yRef) continue;

          const xVals = this._getColumnValues(ds.xRef);
          const yVals = this._getColumnValues(ds.yRef);
          const yName = this._getColumnName(ds.yRef);
          const groupVals = ds.groupRef ? this._getColumnValues(ds.groupRef) : null;
          const sizeVals = ds.sizeRef ? this._getColumnValues(ds.sizeRef) : null;
          const sizeName = ds.sizeRef ? this._getColumnName(ds.sizeRef) : '';
          const errSpec = ds.errorBars;
          const errValues = {};
          if (errSpec?.mode === 'columns') {
            for (const key of ERROR_BAR_KEYS) {
              if (!errSpec[key]) continue;
              const vals = this._getColumnValues(errSpec[key]);
              if (Array.isArray(vals)) errValues[key] = vals;
            }
          }

          if (groupVals) {
            // Split into one sub-series per unique group level (insertion order).
            const buckets = new Map();
            const len = Math.min(
              xVals.length, yVals.length, groupVals.length,
              sizeVals ? sizeVals.length : Infinity,
            );
            for (let r = 0; r < len; r++) {
              const vx = xVals[r], vy = yVals[r], vg = groupVals[r];
              if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
              if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
              if (vg == null || vg === '') continue;
              if (sizeVals) {
                const vs = sizeVals[r];
                if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
              }
              const key = String(vg);
              let b = buckets.get(key);
              if (!b) {
                b = { level: vg, x: [], y: [], rows: [], rawSizes: sizeVals ? [] : null };
                buckets.set(key, b);
              }
              b.x.push(vx);
              b.y.push(vy);
              b.rows.push(r);
              if (sizeVals) b.rawSizes.push(sizeVals[r]);
            }

            if (buckets.size === 0) {
              throw new Error(_t('errNoGroupLevels', { n: i + 1 }));
            }

            let hasAny = false;
            for (const b of buckets.values()) {
              if (b.x.length < 2) continue;
              const bubble = b.rawSizes ? this._buildBubble(b.rawSizes, sizeName) : null;
              pushSeries(
                b.x, b.y, _t('groupSeriesName', { y: yName, level: String(b.level) }), bubble,
                buildErrorBars(errSpec, b.rows, errValues),
              );
              hasAny = true;
            }
            if (!hasAny) {
              throw new Error(_t('errTooFew', { col: yName }));
            }
          } else {
            const x = [], y = [], rows = [], rawSizes = sizeVals ? [] : null;
            const len = Math.min(
              xVals.length, yVals.length,
              sizeVals ? sizeVals.length : Infinity,
            );
            for (let r = 0; r < len; r++) {
              const vx = xVals[r], vy = yVals[r];
              if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
              if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
              if (sizeVals) {
                const vs = sizeVals[r];
                if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
                rawSizes.push(vs);
              }
              x.push(vx);
              y.push(vy);
              rows.push(r);
            }

            if (x.length < 2) {
              throw new Error(_t('errTooFew', { col: yName }));
            }

            const bubble = rawSizes ? this._buildBubble(rawSizes, sizeName) : null;
            pushSeries(x, y, yName, bubble, buildErrorBars(errSpec, rows, errValues));
          }
        }

        return series;
      },

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        let series;
        try {
          series = this._buildSeries();
        } catch (err) {
          this._showError(err.message);
          this._plotting = false;
          return;
        }
        // First ready dataset's X column names the x axis (a ready dataset always yields a series, or throws).
        const firstReadyXRef = this.model.datasets.find(ds => ds.xRef && ds.yRef)?.xRef || null;

        if (series.length === 0) {
          // Nothing ready to plot yet — fall back to placeholder.
          this._showPlaceholder();
          this._lastSeries = null;
          this._renderStats();
          this._plotting = false;
          return;
        }

        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = 'none';
        if (plotEl) plotEl.style.display = '';

        this._destroyChart();
        if (plotEl) plotEl.replaceChildren();

        // Use the first ready dataset's X column name as default x label
        const xLabel = this._getColumnName(firstReadyXRef);

        const gen = ++this._renderGen;

        try {
          const chart = await module._context.chartManager.create(plotEl, 'scatter', {
            title: '',
            xLabel,
            yLabel: '',
            showLegend: module._context.stateManager.get('settings.chartShowLegend') !== false,
            series,
            refLines: this.model.refLines,
            refAreas: this.model.refAreas,
            ...(this.model.bgColor ? { bgColor: this.model.bgColor } : {}),
            onSeriesChange: (idx, key, value) => {
              this._syncSeriesOverride(idx, key, value);
            },
            onEditorBuild: (editorInner, t, onUpdate, seriesItemEls) => {
              this._appendSeriesDetails(editorInner, seriesItemEls);
            },
          });

          if (gen !== this._renderGen) {
            // Stale render — a newer one started while awaiting.
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            this._plotting = false;
            return;
          }

          this._chart = chart;
        } finally {
          this._plotting = false;
        }

        this._lastSeries = series;
        this._renderStats();
      },

      // ── Stats panel ───────────────────────────────────────────

      _renderStats() {
        const panel = module._container.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;

        if (!this.model.showStats || !this._lastSeries || this._lastSeries.length === 0) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }

        const seriesStats = computeSeriesStats(this._statsInput(this._lastSeries), this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel: this.model.confLevel,
        });
      },

      // ── Series Detail Panels (appended to base-provided series items) ──

      _appendSeriesDetails(inner, seriesItemEls) {
        if (!seriesItemEls || !seriesItemEls.length) return;
        const t = _t;
        const chartSeries = this._chart?.config?.series || [];

        for (let idx = 0; idx < seriesItemEls.length && idx < chartSeries.length; idx++) {
          const item = seriesItemEls[idx];
          const ser = chartSeries[idx];

          const detail = document.createElement('div');
          detail.className = 'dmike-chart-ed-series-detail open';

          // Marker styling (symbol, size, fill, border) is provided by scatter._buildTypeEditor.

          const cl = ser.connectLine || { show: false, color: ser.color, dash: 'solid', width: 2 };
          const clTitle = document.createElement('div');
          clTitle.className = 'dmike-chart-ed-subsection-title';
          clTitle.textContent = t('edConnectLine');
          detail.appendChild(clTitle);

          detail.appendChild(edCheckboxRow(t('edShow'), Boolean(cl.show), (v) => {
            cl.show = v;
            this._syncSeriesOverride(idx, 'connectLine', { ...cl });
            if (this._chart) this._chart.render();
          }));

          const { el: clColorRow, swatch: clSw } = edColorPair(t('edColor'), cl.color || ser.color, (e) => {
            this._closeCp();
            const p = openColorPicker(e, cl.color || ser.color, (c) => {
              cl.color = c;
              clSw.style.background = c;
              this._syncSeriesOverride(idx, 'connectLine', { ...cl });
              if (this._chart) this._chart.render();
            });
            this._activeColorPicker = p;
          });
          detail.appendChild(clColorRow);

          detail.appendChild(edSelectRow(t('edLineStyle'), [
            { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
            { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
            { value: 'longdash', label: 'Long dash' },
          ], cl.dash || 'solid', (v) => {
            cl.dash = v;
            this._syncSeriesOverride(idx, 'connectLine', { ...cl });
            if (this._chart) this._chart.render();
          }));

          item.appendChild(detail);
        }
      },

      _syncSeriesOverride(idx, key, value) {
        while (this.model.seriesOverrides.length <= idx) this.model.seriesOverrides.push({});
        this.model.seriesOverrides[idx][key] = value;
      },

      // ── Alpine component lifecycle ────────────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance transient collections
        this._chart = null;
        this._plotting = false;
        this._lastSeries = null;
        this._renderGen = 0;
        this._activeColorPicker = null;
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;

        // Refresh picker (column list) when worksheet data changes
        const onRefresh = () => this._refreshPicker();
        eb.on('state:saved', onRefresh);
        eb.on('worksheet:dataChanged', onRefresh);
        this._unsubs.push(
          () => eb.off('state:saved', onRefresh),
          () => eb.off('worksheet:dataChanged', onRefresh),
        );

        // Refresh picker when a worksheet module is added / removed
        const onAdd = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshPicker(); };
        eb.on('module:added', onAdd);
        this._unsubs.push(() => eb.off('module:added', onAdd));

        const onRem = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshPicker(); };
        eb.on('module:removed', onRem);
        this._unsubs.push(() => eb.off('module:removed', onRem));

        // Refresh picker when this module gets activated (user switches to it)
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-render chart on theme change
        const onTheme = () => {
          if (this._lastSeries) {
            this._destroyChart();
            this._plot();
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial plot from restored state
        this._plot();
      },

      /** @noagent lifecycle */
      destroy() {
        this._closeCp();
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._picker?.destroy();
        this._picker = null;
        this._destroyChart();
      },
    };
  },
});

/**
 * Custom loadExample: xy-plot examples ship a full worksheet
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the
 * examples-registry) and use the literal placeholder `__source__` as
 * dataset/columnRef instanceIds. On load we provision a fresh worksheet,
 * rewrite the placeholders, then apply state (which re-runs the plot on the
 * new data).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key) => ctx.i18n.t(key);

  const current = this.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel && currentModel.hasContent() && ctx.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel && currentModel.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      const rewrite = (r) =>
        r && r.instanceId === '__source__' ? { ...r, instanceId: ref.instanceId } : r;

      if (Array.isArray(data.datasets)) {
        data.datasets = data.datasets.map(d => ({
          ...d,
          xRef: rewrite(d.xRef),
          yRef: rewrite(d.yRef),
          groupRef: rewrite(d.groupRef),
          sizeRef: rewrite(d.sizeRef),
        }));
      }
    }
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

// Nicht an `mod` gebunden: die Registry legt je Instanz eine Kopie an (`{ ...moduleExport }`),
// der Aufruf muss auf der Instanz laufen, sonst liefert er den Zustand der Vorlage (null).
const _origGetState = mod.getState;
/**
 * Override getState to sync chart-editor changes before serialising, so any
 * editor modifications (refLines, refAreas, bgColor) are captured when state
 * is persisted. Series overrides are kept in sync live via onSeriesChange.
 */
mod.getState = function getState() {
  if (this._container) {
    const root = this._container.querySelector('[x-data]');
    if (root) {
      try {
        const alpineData = Alpine.$data(root);
        if (typeof alpineData._syncFromChart === 'function') {
          alpineData._syncFromChart();
        }
      } catch { /* ignore — component may not be mounted yet */ }
    }
  }
  return _origGetState.call(this);
};

export default mod;
