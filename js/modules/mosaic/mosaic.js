/**
 * D.Mike — Mosaic Chart Module (mosaic.js)
 * Data phase: mosaic plot of two categorical variables.
 *
 * The plot is divided into one column per X-level. Column WIDTH is
 * proportional to the marginal count of that X-level; within a column,
 * the height of each G-segment is proportional to P(G | X).
 *
 * Both slots are required — without two categorical columns, a mosaic
 * is undefined.
 *
 * Migrated to createModule + Alpine CSP. The Model (`mosaic-model.js`) holds
 * only the persisted inputs (xRef/gRef, the chartConfig block, the example
 * worksheet id) plus the X×G cross-tab business logic. Everything transient —
 * the DatasetPicker, the SVG chart, the declarative stats table data,
 * render generation — lives in the data-fn. The DatasetPicker and the SVG chart
 * are mounted imperatively; the stats `<table>` is rendered declaratively from
 * structured reactive data (statsRows/statsHeaders/…) in mosaic.html.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * mosaic chart type and owned by the chart instance — the module mounts no
 * separate editor widget, mirroring the legacy behavior.
 *
 * @agent  Steuerbar über das Viewmodel: die zwei Kategorienspalten
 *   (setColumn). Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — die zwei Spaltenbezüge, die wählbaren Spalten je Slot und
 *   die Kreuztabelle als Zahlen (stats).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './mosaic-model.js';

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
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['x', 'g'];

/**
 * Die Kreuztabelle (`_agentStats()`), wie `read().stats` sie liefert.
 *
 * @typedef {object} MosaicStats
 * @property {string[]} categories  Kategorien der X-Achse
 * @property {MosaicGroup[]} groups  je Gruppe die Häufigkeiten
 */

/**
 * @typedef {object} MosaicGroup
 * @property {string} name  Gruppe
 * @property {number[]} counts  Häufigkeit je X-Kategorie
 */

/**
 * Die Agenten-Lesefläche des Mosaikdiagramms.
 *
 * Die zwei Kategorienspalten sind der Zustand; dazu die Mengen, gegen die
 * `setColumn` prüft; die Kreuztabelle als Zahlen in `stats` (E8). Nicht
 * darin: `chartConfig` (Darstellung), das Diagrammbild, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object|null} xRef  the category column on the x axis (slot `x`), or null
 * @property {object|null} gRef  the column whose categories split each bar (slot `g`), or null
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {MosaicStats|null} stats  the cross table, each figure described under keys; null while a required slot is empty
 */

const mod = createModule({
  config: {
    id: 'mosaic',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.mosaic',
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
            x: { label: 'X', title: i18n.t('modules.mosaic.slotX'), helpKey: 'modules.mosaic.fields.xRef.help' },
            g: { label: 'G', title: i18n.t('modules.mosaic.slotG'), helpKey: 'modules.mosaic.fields.gRef.help' },
          };
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
            onChange: (rows) => this._applyDatasets(rows),
          });

          if (this.model.xRef || this.model.gRef) {
            this._picker.value = this._datasetRows();
          }
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
       * @returns {AgentRead} Spaltenbezüge, wählbare Mengen und Kreuztabelle
       */
      read(options) {
        return readAgentState('mosaic', {
          xRef: this.model.xRef,
          gRef: this.model.gRef,
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
       * Eine Spalte einem Slot zuweisen; der andere Slot bleibt.
       * @agent
       * @param {'x'|'g'} slot der Slot
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

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, neu zeichnen. Picker und Aktion rufen ihn. */
      _applyDatasets(rows) {
        const ds = rows[0] || {};
        this.model.xRef = ds.x || null;
        this.model.gRef = ds.g || null;
        this._plot();
      },

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ x: this.model.xRef, g: this.model.gRef }];
      },

      /** Die Kennzahlen für read() — die Kreuztabelle aus derselben Quelle wie die Tabelle (E8). */
      _agentStats() {
        const d = this.model.buildChartData((ref) => this._getColumnValues(ref));
        if (!d.categories.length || !d.groups.length) return null;
        return { categories: [...d.categories], groups: d.groups.map(g => ({ name: g.name, counts: [...g.values] })) };
      },

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsCorner: '',
      /** @type {Array<{name:string, color:string}>} group column headers */
      statsHeaders: [],
      statsTotalHeader: '',
      /** @type {Array<{label:string, cells:string[], total:string}>} */
      statsRows: [],
      /** @type {string[]} per-column totals */
      statsColTotals: [],
      statsGrandTotal: '',
      statsTotalLabel: '',
      statsShow: false,

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

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const { categories, groups } = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
        );
        this._categories = categories;
        this._groups = groups;

        if (categories.length === 0 || groups.length === 0) {
          this._showPlaceholder();
          return;
        }

        this._showChartArea();

        const cfg = this.model.chartConfig;
        const mosaicConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel: this._xColumnName() || '',
          yLabel: '',
          categories,
          groups,
          showLegend: cfg.showLegend,
          legendTitle: this._gColumnName() || '',
          showCellLabels: cfg.showCellLabels,
          columnGap: cfg.columnGap,
          segmentGap: cfg.segmentGap,
          bgColor: cfg.bgColor,
        };

        if (await this._upsertChart('mosaic', mosaicConfig)) this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        // Cross-tab table with row totals (per X-level) and grand total.
        // Build structured data with RAW text — x-text escapes structurally;
        // number formatting matches the legacy string output (formatNum). The
        // group-color swatch is decomposed into a structured {name, color}.
        this.statsCorner = `${this._xColumnName() || _t('statX')} \\ ${this._gColumnName() || _t('statG')}`;
        this.statsHeaders = this._groups.map((g) => ({ name: g.name, color: g.color }));
        this.statsTotalHeader = _t('statTotal');
        this.statsTotalLabel = _t('statTotal');

        const colTotals = this._groups.map(() => 0);
        let grandTotal = 0;
        const rows = [];
        for (let ci = 0; ci < this._categories.length; ci++) {
          let rowTotal = 0;
          const cellTexts = [];
          for (let gi = 0; gi < this._groups.length; gi++) {
            const v = this._groups[gi].values[ci] || 0;
            cellTexts.push(formatNum(v));
            rowTotal += v;
            colTotals[gi] += v;
          }
          grandTotal += rowTotal;
          rows.push({
            label: this._categories[ci],
            cells: cellTexts,
            total: formatNum(rowTotal),
          });
        }
        this.statsRows = rows;
        this.statsColTotals = colTotals.map((tv) => formatNum(tv));
        this.statsGrandTotal = formatNum(grandTotal);
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsHeaders = [];
        this.statsColTotals = [];
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: mosaic catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / gRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'gRef']),
  });
};

export default mod;
