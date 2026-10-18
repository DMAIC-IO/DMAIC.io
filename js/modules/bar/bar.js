/**
 * D.Mike — Bar Chart Module (bar.js)
 * Data phase: bar chart from worksheet columns.
 *
 * Three input modes (driven by the column slots the user fills):
 *   - X only            → frequency count per category (single series)
 *   - X + Y             → mean/sum of Y per X-level     (single series)
 *   - X + G             → cross-tab count               (one series per G-level)
 *   - X + Y + G         → mean/sum of Y per (X, G)      (one series per G-level)
 *
 * Renders through the shared bar chart type (`bar.js` in core/chart/types).
 *
 * Migrated to createModule + Alpine CSP. The Model (`bar-model.js`) holds only
 * the persisted inputs (xRef/yRef/gRef, the chartConfig block incl. the
 * aggregation mode and stacked flag, the example worksheet id) plus the
 * aggregation/grouping cross-tab business logic. Everything transient — the
 * DatasetPicker, the SVG chart, the imperatively rendered stats table, render
 * generation — lives in the data-fn. The DatasetPicker, the SVG chart and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * bar chart type and owned by the chart instance — the module mounts no separate
 * editor widget, mirroring the legacy behavior (it only imports `esc`).
 *
 * @agent  Steuerbar über das Viewmodel: Kategorie-, Werte- und
 *   Gruppenspalte (setColumn), Aggregation und Stapeln (setParam). Gelesen
 *   wird über read() mit erklärter Lesefläche (AgentRead) — Spaltenbezüge,
 *   Aggregation, Stapeln, die wählbaren Mengen und die Balkenwerte (stats).
 */

import { createModule } from '../../core/template-module.js';
import { State, AGGREGATIONS } from './bar-model.js';

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
  { key: 'y', types: ['numeric', 'currency', 'percent'], minCount: 1 },
  { key: 'g', group: true },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'y', 'g'];

/** Die Optionen, die `setParam` annimmt (Reihenfolge der Oberfläche). */
const PARAM_KEYS = ['aggregation', 'stacked'];

/** Die zwei Werte eines Schalters — kein Umwandeln (Welle 2 E5). */
const BOOL_VALUES = [true, false];

/** Je Option ihr Prüfer; gibt den Wert zurück, den das Model hält. */
const PARAM_CHECKS = {
  aggregation: (v) => { requireEnum('value', v, AGGREGATIONS); return v; },
  stacked: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
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
 * @property {'mean'|'sum'} [aggregation]  Zusammenfassung je Balken, nur mit Wertespalte
 * @property {boolean} [stacked]  Gruppen gestapelt, nur mit Gruppenspalte
 */

/**
 * Die Balkenwerte (`_agentStats()`), wie `read().stats` sie liefert.
 *
 * @typedef {object} BarStats
 * @property {string[]} categories  Kategorien der X-Spalte in Balkenreihenfolge
 * @property {BarGroup[]} groups  je Gruppe die Werte, ohne Gruppenspalte eine
 */

/**
 * @typedef {object} BarGroup
 * @property {string} name  Gruppenname
 * @property {number[]} values  Wert je Kategorie
 */

/**
 * Die Agenten-Lesefläche des Balkendiagramms.
 *
 * Drei Spaltenbezüge, Aggregation und Stapeln sind der Zustand. Die zwei
 * Optionen hält das Model in `chartConfig`; die Lesefläche oben unter ihren
 * `setParam`-Schlüsseln. Nicht darin: der Rest von `chartConfig`
 * (Darstellung), Balken und Tabelle (Ausgabe), `exampleWorksheetId`. Die
 * Balkenwerte stehen als Zahlen in `stats` (E8).
 *
 * @typedef {object} AgentRead
 * @property {object|null} xRef  the category column (slot `x`), or null
 * @property {object|null} yRef  the optional numeric value column (slot `y`), or null — without it bars count rows
 * @property {object|null} gRef  the optional group column (slot `g`), or null
 * @property {string} aggregation  how values are combined per bar: `mean` or `sum`; applies only with a value column
 * @property {boolean} stacked  whether groups are stacked instead of side by side; applies only with a group column
 * @property {string[]} activeParams  the options `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {BarStats|null} stats  the bar values, each figure described under keys; null while nothing is plotted
 */

const mod = createModule({
  config: {
    id: 'bar',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.bar',
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
            x: { label: 'X', title: i18n.t('modules.bar.slotX'), helpKey: 'modules.bar.fields.xRef.help' },
            y: { label: 'Y', title: i18n.t('modules.bar.slotY'), helpKey: 'modules.bar.fields.yRef.help' },
            g: { label: 'G', title: i18n.t('modules.bar.slotG'), helpKey: 'modules.bar.fields.gRef.help' },
          };
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
            onChange: (rows) => this._applyDatasets(rows),
          });

          if (this.model.xRef || this.model.yRef || this.model.gRef) {
            this._picker.value = this._datasetRows();
          }
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.xRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsValueHeader: '',
      statsGroupHeader: '',
      statsShowGroupCol: false,
      /** @type {Array<{color:string, name:string, group:string, value:string}>} */
      statsRows: [],
      statsTotalLabel: '',
      statsTotal: '',
      statsShowTotal: false,
      statsShow: false,

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

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, Optionen, wählbare Mengen und Balkenwerte
       */
      read(options) {
        const cfg = this.model.chartConfig;
        return readAgentState('bar', {
          xRef: this.model.xRef,
          yRef: this.model.yRef,
          gRef: this.model.gRef,
          aggregation: cfg.aggregation,
          stacked: cfg.stacked,
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

      /** @noagent view transform; ob eine Wertespalte gewählt ist (Vorlage und activeParams) */
      hasValueColumn() { return Boolean(this.model.yRef); },

      /** @noagent view transform; ob eine Gruppenspalte gewählt ist (Vorlage und activeParams) */
      hasGroupColumn() { return Boolean(this.model.gRef); },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return [
          ...(this.hasValueColumn() ? ['aggregation'] : []),
          ...(this.hasGroupColumn() ? ['stacked'] : []),
        ];
      },

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
       * @param {'mean'|'sum'|boolean} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` unbekannt oder gerade nicht aktiv ist oder `value` ungültig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model.chartConfig, key, PARAM_CHECKS[key](value));
        this._plot();
      },

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, neu zeichnen. Picker und Aktion rufen ihn. */
      _applyDatasets(rows) {
        const ds = rows[0] || {};
        this.model.xRef = ds.x || null;
        this.model.yRef = ds.y || null;
        this.model.gRef = ds.g || null;
        this._plot();
      },

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ x: this.model.xRef, y: this.model.yRef, g: this.model.gRef }];
      },

      /** Die Balkendaten aus den gewählten Spalten — eine Quelle für _plot und _agentStats. */
      _chartData() {
        return this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          {
            aggregation: this.model.chartConfig.aggregation,
            xColumnName: this._xColumnName() || '',
            yColumnName: this._yColumnName() || '',
          },
        );
      },

      /** Die Kennzahlen für read() — die Balkenwerte aus derselben Quelle wie die Tabelle (E8). */
      _agentStats() {
        const d = this._chartData();
        if (!d.categories.length || !d.groups.length) return null;
        return { categories: [...d.categories], groups: d.groups.map(g => ({ name: g.name, values: [...g.values] })) };
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const cfg = this.model.chartConfig;
        const { categories, groups } = this._chartData();
        this._categories = categories;
        this._groups = groups;

        if (categories.length === 0 || groups.length === 0) {
          this._showPlaceholder();
          return;
        }

        this._showChartArea();

        const xLabel = cfg.xLabel || this._xColumnName() || '';
        let yLabel = cfg.yLabel;
        if (!yLabel) {
          if (this.model.yRef) {
            yLabel = `${cfg.aggregation === 'sum' ? _t('axisSumOf') : _t('axisMeanOf')  } ${  this._yColumnName() || ''}`;
          } else {
            yLabel = _t('axisCount');
          }
        }

        const showLegend = cfg.showLegend && Boolean(this.model.gRef);
        const legendTitle = this.model.gRef ? this._gColumnName() : '';

        const barConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          titleSize: cfg.titleSize,
          xLabel,
          yLabel,
          categories,
          groups,
          stacked: cfg.stacked,
          barGap: cfg.barGap,
          categoryGap: cfg.categoryGap,
          showLegend,
          legendTitle,
          bgColor: cfg.bgColor,
        };

        if (await this._upsertChart('bar', barConfig)) this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        const isFreq = !this.model.yRef;
        this.statsValueHeader = isFreq
          ? _t('statCount')
          : (this.model.chartConfig.aggregation === 'sum' ? _t('statSum') : _t('statMean'));

        const showGroupCol = Boolean(this.model.gRef);
        this.statsShowGroupCol = showGroupCol;
        this.statsGroupHeader = _t('statGroup');

        // Build structured rows with RAW text — x-text escapes structurally.
        // Number formatting matches the legacy string output (formatNum). The
        // per-row color swatch is decomposed into a structured 'color' field.
        const rows = [];
        let total = 0;
        for (const g of this._groups) {
          for (let ci = 0; ci < this._categories.length; ci++) {
            const v = g.values[ci] || 0;
            if (isFreq) total += v;
            rows.push({
              color: g.color,
              name: this._categories[ci],
              group: g.name,
              value: formatNum(v),
            });
          }
        }
        this.statsRows = rows;
        this.statsTotalLabel = _t('statTotal');
        this.statsTotal = formatNum(total);
        this.statsShowTotal = isFreq;
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsShowTotal = false;
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: bar catalog examples ship a full worksheet
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
