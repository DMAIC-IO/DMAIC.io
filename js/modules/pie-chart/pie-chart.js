/**
 * D.Mike — Pie Chart Module (pie-chart.js)
 * Data phase: pie/donut chart from worksheet columns.
 *
 * Two input modes (driven by the column slots the user fills):
 *   - value only   → frequency count per distinct value (one slice per value)
 *   - value+label  → sum of value per label              (one slice per label)
 *
 * Renders through the shared pie chart type (`pie.js` in core/chart/types).
 *
 * Migrated to createModule + Alpine CSP. The Model (`pie-chart-model.js`) holds
 * only the persisted inputs (valueRef/labelRef, the chartConfig block, the
 * example worksheet id) plus the slice-aggregation business logic. Everything
 * transient — the DatasetPicker, the SVG chart, the imperatively rendered stats
 * table, render generation — lives in the data-fn. The DatasetPicker, the SVG
 * chart and the stats `<table>` are mounted imperatively to keep the legacy DOM
 * selectors and style-based visibility toggles byte-identical for the Page
 * Object Model.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * pie chart type and owned by the chart instance — the module mounts no separate
 * editor widget, mirroring the legacy behavior (it only imports `esc`).
 *
 * @agent  Steuerbar über das Viewmodel: Wert- und Beschriftungsspalte
 *   (setColumn). Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — die zwei Spaltenbezüge und die wählbaren Spalten je Slot.
 *   Der Agent bekommt Bezüge, kein Diagramm.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './pie-chart-model.js';

import { formatNum, formatPct } from '../../core/chart/chart-core.js';
import {
  DatasetPicker,
  getColumnValues,
  refToKey,
  keyToRef,
} from '../../ui/dataset-picker.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { datasetSlotColumns } from '../../core/agent/agent-datasets.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'value', minCount: 1, required: true },
  { key: 'label', minCount: 1, group: true },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['value', 'label'];

/**
 * Die Segmenttabelle (`_agentStats()`), wie `read().stats` sie liefert.
 *
 * @typedef {object} PieStats
 * @property {Slice[]} slices  Segmente
 * @property {number} total  Summe aller Segmente
 */

/**
 * @typedef {object} Slice
 * @property {string} name  Segmentname
 * @property {number} value  Wert des Segments
 * @property {number} share  Anteil an der Summe, 0 bis 1
 */

/**
 * Die Agenten-Lesefläche des Kreisdiagramms.
 *
 * Die zwei Spaltenbezüge sind der Zustand, den ein Agent setzen kann; dazu
 * die zwei Mengen, gegen die `setColumn` prüft. Nicht darin: `chartConfig`
 * (Darstellung, nur über den Diagramm-Editor), das Diagrammbild und
 * `exampleWorksheetId`. Die Segmenttabelle steht als Zahlen in `stats` (E8).
 *
 * @typedef {object} AgentRead
 * @property {object|null} valueRef  the value column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} labelRef  the label column (slot `label`), or null — without it slices count distinct values
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {PieStats|null} stats  the slice table, each figure described under keys; null while nothing is plotted
 */

const mod = createModule({
  config: {
    id: 'pie-chart',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.pie-chart',
    version: '1.1.0',
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
            value: { label: 'V', title: i18n.t('ui.datasetPicker.slotV'), helpKey: 'modules.pie-chart.fields.valueRef.help' },
            label: { label: 'G', title: i18n.t('ui.datasetPicker.slotG'), helpKey: 'modules.pie-chart.fields.labelRef.help' },
          };
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
            onChange: (rows) => this._applyDatasets(rows),
          });

          if (this.model.labelRef || this.model.valueRef) {
            this._picker.value = this._datasetRows();
          }
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.valueRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, wählbare Mengen und Segmentkennzahlen
       */
      read(options) {
        return readAgentState('pie-chart', {
          valueRef: this.model.valueRef,
          labelRef: this.model.labelRef,
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
       * @param {'value'|'label'} slot der Slot
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
        this.model.valueRef = ds.value || null;
        this.model.labelRef = ds.label || null;
        this._plot();
      },

      /** Die aktuelle Zeile in Picker-Form, aus dem Model. */
      _datasetRows() {
        return [{ value: this.model.valueRef, label: this.model.labelRef }];
      },

      /** Die Kennzahlen für read() — beim Lesen gerechnet, dieselbe Quelle wie die Tabelle (E8). */
      _agentStats() {
        const slices = this.model.buildSlices((ref) => this._getColumnValues(ref));
        return slices.length ? State.sliceStats(slices) : null;
      },

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed slices, for the stats re-render. */
      _slices: [],

      // ── Stats table (declarative — structured reactive data) ──
      /** @type {Array<{color:string, name:string, value:string, pct:string}>} */
      statsRows: [],
      statsTotal: '',
      statsTotalPct: '',
      statsShow: false,

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        this._slices = this.model.buildSlices((ref) => this._getColumnValues(ref));

        if (this._slices.length === 0) {
          this._showPlaceholder();
          return;
        }

        this._showChartArea();

        const cfg = this.model.chartConfig;
        const pieConfig = {
          slices: this._slices,
          title: cfg.title,
          showTitle: cfg.showTitle,
          titleSize: cfg.titleSize,
          showLegend: cfg.showLegend,
          showLabels: cfg.showLabels,
          labelMode: cfg.labelMode,
          labelSize: cfg.labelSize,
          innerRadius: cfg.innerRadius,
          padAngle: cfg.padAngle,
          startAngle: cfg.startAngle,
          explodeDistance: cfg.explodeDistance,
          strokeColor: cfg.strokeColor,
          strokeWidth: cfg.strokeWidth,
          sortSlices: cfg.sortSlices,
          centerLabel: cfg.centerLabel,
          centerSub: cfg.centerSub,
          bgColor: cfg.bgColor,
        };

        if (await this._upsertChart('pie', pieConfig)) this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        const { slices, total } = State.sliceStats(this._slices);

        // Build structured rows with RAW text — x-text escapes structurally.
        // Numbers and percents follow the active language (Bug 11).
        // The color swatch is a structured 'color' field.
        const lang = module._context.language;
        this.statsRows = this._slices.map((s, i) => ({
          color: s.color,
          name: s.name,
          value: formatNum(s.value, null, lang),
          pct: formatPct(slices[i].share, 1, lang),
        }));
        this.statsTotal = formatNum(total, null, lang);
        this.statsTotalPct = formatPct(1, 1, lang);
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
 * Custom loadExample. Pie-chart's native state uses valueRef + labelRef.
 * Catalog examples ship a full worksheet (`sourceWorksheetData`) and use the
 * literal placeholder `__source__` as the column-ref instanceId. On load we
 * provision a fresh worksheet, rewrite the placeholder across all known column
 * refs, then translate foreign state: for examples that ship only a numeric
 * `columnRef` (process-capability, outlier-test, distribution-fit) or a
 * `defectsRef` (attribute SPC), pick the most pie-chart-appropriate field as
 * valueRef and let the module derive slices from value frequencies.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key) => ctx.i18n.t(key);

  const current = this.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel?.hasContent() && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
      if (data.labelRef)   data.labelRef   = rewrite(data.labelRef);
      if (data.valueRef)   data.valueRef   = rewrite(data.valueRef);
      if (data.columnRef)  data.columnRef  = rewrite(data.columnRef);
      if (data.colRef)     data.colRef     = rewrite(data.colRef);
      if (data.defectsRef) data.defectsRef = rewrite(data.defectsRef);
      if (data.sizeRef)    data.sizeRef    = rewrite(data.sizeRef);
    }
  }

  // Foreign-state translation: pick the most pie-chart-appropriate field as
  // valueRef. Attribute-SPC examples ship defectsRef (counts); distfit/
  // outlier-test ship columnRef (numeric values that get binned by name).
  if (!data.valueRef) {
    data.valueRef = data.defectsRef || data.columnRef || data.colRef || null;
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
