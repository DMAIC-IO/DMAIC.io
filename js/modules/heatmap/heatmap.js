/**
 * D.Mike — Heatmap Chart Module (heatmap.js)
 *
 * Data phase: heatmap / pivot grid for two categorical variables.
 *
 * Two input modes:
 *   - X + G       → frequency cross-tab (count per cell)
 *   - X + G + V   → aggregated value (mean / sum) of V per (X, G) cell
 *
 * X-slot drives the column axis, G-slot drives the row axis, V-slot is the
 * numeric value column whose aggregate fills the cells.
 *
 * Migrated to createModule + Alpine CSP. The Model (`heatmap-model.js`) holds
 * only the persisted inputs (xRef/gRef/vRef, the chartConfig block, the
 * example-worksheet id) plus the cross-tab / aggregation business logic.
 * Everything transient — the DatasetPicker, the SVG chart, the imperatively
 * rendered aggregation select and stats table, render generation — lives in the
 * data-fn. The DatasetPicker, the SVG chart, the aggregation `<select>` and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model. The
 * color-domain / normalization that drives the cell coloring lives in the
 * `heatmap` chart type, fed the raw aggregated `cells` matrix from the model.
 *
 * @agent  Steuerbar über das Viewmodel: drei Spalten (setColumn) und die
 *   Aggregation der Wertespalte (setParam). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead) — Spaltenbezüge, Aggregation, die
 *   wählbaren Mengen und das Raster als Zahlen (stats).
 */

import { createModule } from '../../core/template-module.js';
import { State, AGGREGATIONS } from './heatmap-model.js';

import { formatNum } from '../../core/chart/chart-core.js';
import {
  DatasetPicker,
  getColumnValues,
  getColumnName,
  refToKey,
  keyToRef,
} from '../../ui/dataset-picker.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { datasetSlotColumns } from '../../core/agent/agent-datasets.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'g', minCount: 1, required: true },
  { key: 'v', types: ['numeric', 'currency', 'percent'], minCount: 1 },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'g', 'v'];

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['aggregation'];

/** Je Option ihr Prüfer; gibt den Wert zurück, den das Model hält. */
const PARAM_CHECKS = {
  aggregation: (v) => { requireEnum('value', v, AGGREGATIONS); return v; },
};

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
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'mean'|'sum'} [aggregation]  Zusammenfassung je Zelle, nur mit Wertespalte
 */

/**
 * Das Raster (`_agentStats()`), wie `read().stats` es liefert.
 *
 * @typedef {object} HeatmapStats
 * @property {string[]} xCategories  Spalten des Rasters
 * @property {string[]} yCategories  Zeilen des Rasters
 * @property {Array<Array<number|null>>} cells  Wert je Zeile und Spalte
 * @property {Array<number|null>|null} rowTotals  Summe je Zeile, in der Reihenfolge der Zeilen; null im Mittelwertmodus
 * @property {Array<number|null>|null} colTotals  Summe je Spalte, in der Reihenfolge der Spalten; null im Mittelwertmodus
 * @property {number|null} total  Gesamtsumme aller Zellen; null im Mittelwertmodus
 */

/**
 * Die Agenten-Lesefläche der Heatmap.
 *
 * Drei Spaltenbezüge und die Aggregation sind der Zustand. Die Aggregation
 * hält das Model in `chartConfig`; die Lesefläche hebt sie auf die oberste
 * Ebene, unter ihren `setParam`-Schlüssel. Nicht darin: der Rest von
 * `chartConfig` (Darstellung), das Diagrammbild, `exampleWorksheetId`. Das
 * Raster steht als Zahlen in `stats` (E8).
 *
 * @typedef {object} AgentRead
 * @property {object|null} xRef  the column whose categories become the columns of the grid (slot `x`), or null
 * @property {object|null} gRef  the column whose categories become the rows (slot `g`), or null
 * @property {object|null} vRef  the optional numeric value column (slot `v`), or null — without it cells count rows
 * @property {string} aggregation  how values are combined per cell: `mean` or `sum`; applies only with a value column
 * @property {string[]} activeParams  the options `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {HeatmapStats|null} stats  the heatmap grid, each figure described under keys; null while a required slot is empty
 */

/**
 * Zeilen-, Spalten- und Gesamtsumme eines Rasters; leere Zellen zählen nicht.
 * Eine Quelle für die Tabelle und für `read().stats` (E8).
 *
 * @param {Array<Array<number|null>>} cells  Wert je Zeile und Spalte
 * @returns {{rowTotals: number[], colTotals: number[], total: number}}
 */
function totalsOf(cells) {
  const colTotals = (cells[0] || []).map(() => 0);
  const rowTotals = cells.map((row) => {
    let sum = 0;
    row.forEach((v, xi) => {
      if (Number.isFinite(v)) {
        sum += v;
        colTotals[xi] += v;
      }
    });
    return sum;
  });
  return { rowTotals, colTotals, total: rowTotals.reduce((a, b) => a + b, 0) };
}

const mod = createModule({
  config: {
    id: 'heatmap',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.heatmap',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
          const wrap = module._container.querySelector('[data-ref="picker-wrap"]');
          if (!wrap) return;
          this._picker?.destroy();

          const ctx = module._context;
          const i18n = ctx.i18n;
          const SLOT_LABELS = {
            x: { label: 'X', title: i18n.t('modules.heatmap.slotX'), helpKey: 'modules.heatmap.fields.xRef.help' },
            g: { label: 'G', title: i18n.t('modules.heatmap.slotG'), helpKey: 'modules.heatmap.fields.gRef.help' },
            v: { label: 'V', title: i18n.t('modules.heatmap.slotV'), helpKey: 'modules.heatmap.fields.vRef.help' },
          };
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
            onChange: (rows) => this._applyDatasets(rows),
          });

          if (this.model.xRef || this.model.gRef || this.model.vRef) {
            this._picker.value = this._datasetRows();
          }

          // Preserve the original init() ordering: _mountPicker() was followed
          // immediately by _syncOptions() to seed the aggregation-options x-if.
          this._syncOptions();
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.xRef && this.model.gRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, Aggregation, wählbare Mengen und Raster
       */
      read(options) {
        return readAgentState('heatmap', {
          xRef: this.model.xRef,
          gRef: this.model.gRef,
          vRef: this.model.vRef,
          aggregation: this.model.chartConfig.aggregation,
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          stats: this._agentStats(),
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() { return datasetSlotColumns(module._context.stateManager, DATASET_SLOTS); },

      /** @noagent derived set; der Agent liest sie über read().activeParams — dasselbe Prädikat wie x-if="hasVRef" */
      activeParams() { return this.hasVRef ? [...PARAM_KEYS] : []; },

      /** @noagent view transform; die Optionen der Aggregation (eine Quelle: AGGREGATIONS) */
      aggregationOptions() {
        return AGGREGATIONS.map(v => ({ value: v, label: _t(v === 'sum' ? 'aggSum' : 'aggMean') }));
      },

      /**
       * Eine Spalte einem Slot zuweisen; die übrigen Slots bleiben.
       * @agent
       * @param {'x'|'g'|'v'} slot der Slot
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

      /**
       * Eine Analyseoption setzen.
       * @agent
       * @param {keyof Params} key welche Option; die im Zustand zulässigen nennt `activeParams`
       * @param {'mean'|'sum'} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` unbekannt oder ohne Wertespalte nicht aktiv ist oder `value` ungültig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model.chartConfig, key, PARAM_CHECKS[key](value));
        this._plot();
      },

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, Optionen spiegeln, neu zeichnen. */
      _applyDatasets(rows) {
        const ds = rows[0] || {};
        this.model.xRef = ds.x || null;
        this.model.gRef = ds.g || null;
        this.model.vRef = ds.v || null;
        this._syncOptions();
        this._plot();
      },

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ x: this.model.xRef, g: this.model.gRef, v: this.model.vRef }];
      },

      /** Die Kennzahlen für read() — das Raster aus derselben Quelle wie die Tabelle (E8). */
      _agentStats() {
        const d = this.model.buildChartData((ref) => this._getColumnValues(ref), this.model.chartConfig.aggregation);
        if (!d.xCategories.length || !d.yCategories.length) return null;
        const cells = d.cells.map(row => row.map(v => (Number.isFinite(v) ? v : null)));
        const cfg = this.model.chartConfig;
        const additive = !this.model.vRef || cfg.aggregation === 'sum';
        const sums = additive ? totalsOf(cells) : null;
        return {
          xCategories: [...d.xCategories],
          yCategories: [...d.yCategories],
          cells,
          rowTotals: sums ? sums.rowTotals : null,
          colTotals: sums ? sums.colTotals : null,
          total: sums ? sums.total : null,
        };
      },

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _xCategories: [],
      _yCategories: [],
      _cells: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsCorner: '',
      /** @type {string[]} x-category column headers */
      statsHeaders: [],
      statsTotalHeader: '',
      /** @type {Array<{label:string, cells:string[], total:string}>} */
      statsRows: [],
      /** @type {string[]} per-column totals */
      statsColTotals: [],
      statsGrandTotal: '',
      statsTotalLabel: '',
      statsShowTotals: false,
      statsShow: false,

      // ── Aggregation options (declarative — shown when a V column is picked) ──
      /** Reactive mirror of `!!model.vRef` for the options `x-if`. */
      hasVRef: false,
      _syncOptions() { this.hasVRef = Boolean(this.model.vRef); },

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      _xColumnName() {
        return this.model.xRef ? getColumnName(module._context.stateManager, this.model.xRef) : '';
      },

      _gColumnName() {
        return this.model.gRef ? getColumnName(module._context.stateManager, this.model.gRef) : '';
      },

      _vColumnName() {
        return this.model.vRef ? getColumnName(module._context.stateManager, this.model.vRef) : '';
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const { xCategories, yCategories, cells } = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          this.model.chartConfig.aggregation,
        );
        this._xCategories = xCategories;
        this._yCategories = yCategories;
        this._cells = cells;

        if (xCategories.length === 0 || yCategories.length === 0) {
          this._showPlaceholder();
          return;
        }

        this._showChartArea();

        const cfg = this.model.chartConfig;

        // Count mode → integer cells; mean/sum → user-controlled decimals.
        const isFreq = !this.model.vRef;
        const valueDecimals = isFreq ? 0 : cfg.valueDecimals;
        const valueLabel = isFreq
          ? _t('axisCount')
          : (cfg.aggregation === 'sum' ? `${_t('axisSumOf')} ${this._vColumnName() || ''}`.trim()
                                        : `${_t('axisMeanOf')} ${this._vColumnName() || ''}`.trim());

        const heatConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel: this._xColumnName() || '',
          yLabel: this._gColumnName() || '',
          xCategories,
          yCategories,
          cells,
          cellGap: cfg.cellGap,
          valueDecimals,
          valueLabel,
          showCellLabels: cfg.showCellLabels,
          colorScheme: cfg.colorScheme || 'viridis',
          bgColor: cfg.bgColor,
        };

        if (await this._upsertChart('heatmap', heatConfig)) this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        const isFreq = !this.model.vRef;
        const cfg = this.model.chartConfig;
        const decimals = isFreq ? 0 : cfg.valueDecimals;
        // Totals only make sense for additive aggregations. Mean-of-means without
        // per-cell sample weights is misleading, so the Gesamt column is omitted
        // in mean mode.
        const showTotals = isFreq || cfg.aggregation === 'sum';
        const totalDecimals = isFreq ? 0 : cfg.valueDecimals;

        // Build structured data with RAW text — x-text escapes structurally.
        // Number formatting matches the legacy string output (formatNum).
        this.statsCorner = `${this._gColumnName() || _t('statG')} \\ ${this._xColumnName() || _t('statX')}`;
        this.statsHeaders = this._xCategories.slice();
        this.statsTotalHeader = _t('statTotal');
        this.statsTotalLabel = _t('statTotal');
        this.statsShowTotals = showTotals;

        const sums = showTotals ? totalsOf(this._cells) : null;
        const rows = [];
        for (let yi = 0; yi < this._yCategories.length; yi++) {
          rows.push({
            label: this._yCategories[yi],
            cells: this._xCategories.map((_, xi) => {
              const v = this._cells[yi][xi];
              return Number.isFinite(v) ? formatNum(v, decimals) : '—';
            }),
            total: sums ? formatNum(sums.rowTotals[yi], totalDecimals) : '',
          });
        }
        this.statsRows = rows;
        this.statsColTotals = sums ? sums.colTotals.map((c) => formatNum(c, totalDecimals)) : [];
        this.statsGrandTotal = sums ? formatNum(sums.total, totalDecimals) : '';
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsHeaders = [];
        this.statsColTotals = [];
        this.statsShowTotals = false;
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: heatmap catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / gRef / vRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'gRef', 'vRef']),
  });
};

export default mod;
