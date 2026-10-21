/**
 * D.Mike — Pareto Chart Module (pareto.js)
 *
 * Data phase: Pareto chart from worksheet columns — a descending-sorted bar
 * chart with a cumulative-percentage line and an 80 % reference line.
 *
 * Four input modes (driven by the column slots the user fills):
 *   - X only      → frequency count per category               (items[])
 *   - X + Y       → sum (or mean) of Y per X-level             (items[])
 *   - X + G       → cross-tab count → stacked Pareto           (groups[])
 *   - X + Y + G   → sum/mean of Y per (X, G) → stacked Pareto  (groups[])
 *
 * Bars are sorted by descending total inside the chart type itself.
 *
 * Migrated to createModule + Alpine CSP. The Model (`pareto-model.js`) holds
 * only the persisted inputs (xRef/yRef/gRef, the chartConfig block, the
 * example-worksheet id) plus the Pareto aggregation + stats-row business logic.
 * Everything transient — the DatasetPicker, the SVG chart, the imperatively
 * rendered aggregation select and stats table, render generation — lives in the
 * data-fn. The DatasetPicker, the SVG chart, the aggregation `<select>` and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model.
 *
 * @agent  Steuerbar über das Viewmodel: Kategorie-, Werte- und
 *   Stapelspalte (setColumn) und die Aggregation (setParam). Gelesen wird
 *   über read() mit erklärter Lesefläche (AgentRead) — Spaltenbezüge,
 *   Aggregation, die wählbaren Mengen und die geordnete Tabelle als Zahlen
 *   (stats).
 */

import { createModule } from '../../core/template-module.js';
import { State, AGGREGATIONS } from './pareto-model.js';

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
import { setAtPath } from '../../core/agent/agent-path.js';
import { datasetSlotColumns } from '../../core/agent/agent-datasets.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'y', types: ['numeric', 'currency', 'percent'], minCount: 1 },
  { key: 'g', group: true },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'y', 'g'];

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['aggregation'];

/** Je Option ihr Prüfer; gibt den Wert zurück, den das Model hält. */
const PARAM_CHECKS = {
  aggregation: (v) => { requireEnum('value', v, AGGREGATIONS); return v; },
};

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'sum'|'mean'} [aggregation]  Zusammenfassung je Kategorie, nur mit Wertespalte
 */

/**
 * Die geordnete Tabelle (`_agentStats()`), wie `read().stats` sie liefert.
 *
 * @typedef {object} ParetoStats
 * @property {ParetoRow[]} rows  Kategorien absteigend nach Wert
 * @property {number} total  Summe aller Werte
 */

/**
 * @typedef {object} ParetoRow
 * @property {string} name  Kategorie
 * @property {number} value  Wert der Kategorie
 * @property {number} cumPct  kumulierter Anteil in Prozent
 */

/**
 * Die Agenten-Lesefläche des Pareto-Diagramms.
 *
 * Drei Spaltenbezüge und die Aggregation sind der Zustand; die Aggregation
 * hält das Model in `chartConfig`, die Lesefläche oben unter ihrem
 * `setParam`-Schlüssel. Nicht darin: der Rest von `chartConfig`
 * (Darstellung), Balken, Summenlinie und Tabelle (Ausgabe), `exampleWorksheetId`.
 * Die Tabelle steht als Zahlen in `stats` (E8).
 *
 * @typedef {object} AgentRead
 * @property {object|null} xRef  the category column (slot `x`), or null
 * @property {object|null} yRef  the optional numeric value column (slot `y`), or null — without it bars count rows
 * @property {object|null} gRef  the optional column that stacks each bar (slot `g`), or null
 * @property {string} aggregation  how values are combined per category: `sum` or `mean`; applies only with a value column
 * @property {string[]} activeParams  the options `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {ParetoStats|null} stats  the ranked table, each figure described under keys; null while nothing is plotted
 */

const mod = createModule({
  config: {
    id: 'pareto',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.pareto',
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
            x: { label: 'X', title: i18n.t('modules.pareto.slotX'), helpKey: 'modules.pareto.fields.xRef.help' },
            y: { label: 'Y', title: i18n.t('modules.pareto.slotY'), helpKey: 'modules.pareto.fields.yRef.help' },
            g: { label: 'G', title: i18n.t('modules.pareto.slotG'), helpKey: 'modules.pareto.fields.gRef.help' },
          };
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
            onChange: (rows) => this._applyDatasets(rows),
          });

          if (this.model.xRef || this.model.yRef || this.model.gRef) {
            this._picker.value = this._datasetRows();
          }

          // Preserve the original init() ordering: _mountPicker() was followed
          // immediately by _syncOptions() to seed the aggregation-options x-if.
          this._syncOptions();
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.xRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, Aggregation, wählbare Mengen und geordnete Tabelle
       */
      read(options) {
        return readAgentState('pareto', {
          xRef: this.model.xRef,
          yRef: this.model.yRef,
          gRef: this.model.gRef,
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

      /** @noagent derived set; der Agent liest sie über read().activeParams — dasselbe Prädikat wie x-if="hasYRef" */
      activeParams() { return this.hasYRef ? [...PARAM_KEYS] : []; },

      /** @noagent view transform; die Optionen der Aggregation (eine Quelle: AGGREGATIONS) */
      aggregationOptions() {
        return AGGREGATIONS.map(v => ({ value: v, label: _t(v === 'sum' ? 'aggSum' : 'aggMean') }));
      },

      /**
       * Eine Spalte einem Slot zuweisen; die übrigen Slots bleiben.
       * @agent
       * @param {'x'|'y'|'g'} slot der Slot
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
       * @param {'sum'|'mean'} value der Wert; Bereich je Schlüssel siehe `Params`
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
        this.model.yRef = ds.y || null;
        this.model.gRef = ds.g || null;
        this._syncOptions();
        this._plot();
      },

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ x: this.model.xRef, y: this.model.yRef, g: this.model.gRef }];
      },

      /** Die Diagrammdaten aus den gewählten Spalten — eine Quelle für _plot und _agentStats. */
      _chartData() {
        return this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          this.model.chartConfig.aggregation,
        );
      },

      /** Ob die Daten ein Diagramm tragen — dasselbe Prädikat für _plot und _agentStats. */
      _hasData(data) {
        return (data.items.length > 0) || (data.categories.length > 0 && data.groups.length > 0);
      },

      /** Die Kennzahlen für read() — die sortierten Zeilen aus derselben Quelle wie die Tabelle (E8). */
      _agentStats() {
        const d = this._chartData();
        if (!this._hasData(d)) return null;
        const { rows, grandTotal } = State.computeStatsRows(d);
        return { rows: rows.map(r => ({ name: r.name, value: r.value, cumPct: r.cumPct })), total: grandTotal };
      },

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _items: [],
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      /** @type {Array<{name:string, color:string, value:string, cumPct:string}>} */
      statsRows: [],
      statsValueHeader: '',
      statsTotal: '',
      statsTotalPct: '',
      statsShow: false,

      // ── Aggregation options (declarative — shown when a Y column is picked) ──
      /** Reactive mirror of `!!model.yRef` for the options `x-if`. */
      hasYRef: false,
      _syncOptions() { this.hasYRef = Boolean(this.model.yRef); },

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      _xColumnName() {
        return this.model.xRef ? getColumnName(module._context.stateManager, this.model.xRef) : '';
      },

      _yColumnName() {
        return this.model.yRef ? getColumnName(module._context.stateManager, this.model.yRef) : '';
      },

      _gColumnName() {
        return this.model.gRef ? getColumnName(module._context.stateManager, this.model.gRef) : '';
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const data = this._chartData();
        this._items = data.items;
        this._categories = data.categories;
        this._groups = data.groups;

        const hasData = this._hasData(data);

        if (!hasData) {
          this._showPlaceholder();
          return;
        }

        this._showChartArea();

        const cfg = this.model.chartConfig;
        const xLabel = this._xColumnName() || '';
        let yLabel;
        if (this.model.yRef) {
          yLabel = `${cfg.aggregation === 'mean' ? _t('axisMeanOf') : _t('axisSumOf')  } ${  this._yColumnName() || ''}`;
        } else {
          yLabel = _t('axisCount');
        }

        const paretoConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel,
          yLabel,
          maxItems: cfg.maxItems,
          otherBucket: cfg.otherBucket,
          otherLabel: _t('otherLabel'),
          otherCountTemplate: _t('otherCountTemplate'),
          refLineValue: cfg.refLineValue,
          barOpacity: cfg.barOpacity,
          bgColor: cfg.bgColor,
          showLegend: Boolean(this.model.gRef),
          legendTitle: this.model.gRef ? (this._gColumnName() || '') : '',
        };

        if (data.items.length > 0) {
          paretoConfig.items = data.items;
        } else {
          paretoConfig.categories = data.categories;
          paretoConfig.groups = data.groups;
        }

        if (await this._upsertChart('pareto', paretoConfig)) this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        const isFreq = !this.model.yRef;
        this.statsValueHeader = isFreq
          ? _t('statCount')
          : (this.model.chartConfig.aggregation === 'mean' ? _t('statMean') : _t('statSum'));

        const { rows, grandTotal } = State.computeStatsRows({
          items: this._items,
          categories: this._categories,
          groups: this._groups,
        });

        // Build structured rows with RAW text — x-text escapes structurally.
        // Number formatting is applied here so the rendered text is identical
        // to the legacy string output (formatNum / toFixed(1) + '%').
        this.statsRows = rows.map((r) => ({
          name: r.name,
          color: r.color,
          value: formatNum(r.value),
          cumPct: `${r.cumPct.toFixed(1)  }%`,
        }));
        this.statsTotal = formatNum(grandTotal);
        this.statsTotalPct = `${(100).toFixed(1)}%`;
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: pareto catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / yRef / gRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'yRef', 'gRef']),
  });
};

export default mod;
