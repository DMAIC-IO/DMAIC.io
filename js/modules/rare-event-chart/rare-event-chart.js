/**
 * D.Mike — Rare-Event Control Chart Module (rare-event-chart.js)
 *
 * g-Chart  (count of opportunities between events)
 * t-Chart  (time between events — Nelson power transform)
 *
 * Both detect drifts in the rate of rare events (failures, accidents,
 * incidents) where Shewhart-style charts on counts/intervals fail because
 * the underlying distribution is geometric / exponential, not normal.
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs (chart type, the referenced column, the example-worksheet id); the
 * analysis result (limits, signals) is derived transiently in the view from
 * those inputs plus the live worksheet column values. The SPC math lives in
 * `js/engines/rare-event-chart-engine.js`. The ColumnPicker and the SVG
 * control chart are mounted imperatively (they are not pure-template concerns).
 *
 * @agent  Steuerbar über das Viewmodel: Kartentyp g/t (setParam),
 *   Ereignisreihe (setColumn), neu rechnen (runAnalysis). Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Eingaben, Grenzen auf
 *   Original- und gezeichneter Skala, Signalpunkte und je Punkt der Wert.
 */

import { createModule } from '../../core/template-module.js';
import { State, TYPES } from './rare-event-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { computeGChart, computeTChart } from '../../engines/rare-event-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Die Spalten-Slots: genau einer, die Ereignisreihe. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 2 } };

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['chartTypeId'];

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  chartTypeId: (v) => { requireEnum('value', v, TYPES); return v; },
};

/**
 * Einen Wert unter einem Punkt-Schlüssel in `obj` ablegen.
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
 * Die Agenten-Lesefläche der Karte seltener Ereignisse.
 *
 * Eingaben (Kartentyp, Spalte), die Mengen der Setter und das gerechnete
 * Ergebnis als Zahlen (Plan Welle 3 B, E4). Nicht darin: Kennzahlenleiste
 * und Badge als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {string} chartTypeId  `'g'` (opportunities between events) or `'t'` (time between events)
 * @property {object|null} columnRef  the event column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {object|null} result  `{ chartType, n, cl, ucl, lcl, sigma, transformed, plotted: { cl, ucl, lcl, sigma }, signals }` — cl/ucl/lcl on the original scale, `plotted` on the plotted scale (transformed for the t chart), `signals` the indices of points outside the limits; null with fewer than 2 usable values
 * @property {object[]} points  [bulk] one row per plotted point: `{ value, signal }`, value on the plotted scale, null where the t chart drops a non-positive value
 */

const mod = createModule({
  config: {
    id: 'rare-event-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.rare-event-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() { this._mountPicker(); },
        themeMode: 'rerun',
        autorun: true,
        onTheme() {
          if (this.result) {
            this.$nextTick(() => this._renderChart(this.result, ++this._renderGen));
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { cl, ucl, lcl, sigma, n, signals, transformedNote,
       *     chartValues, chartCl, chartUcl, chartLcl, chartSigma, yLabel }
       * KPI fields (cl/ucl/lcl) use the ORIGINAL scale for t-charts;
       * the chart* fields use the (possibly transformed) plotting scale.
       */
      result: null,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       *   — `fields: ['points']` liefert die Punkte vollständig, `rows` schneidet sie zu
       * @returns {AgentRead} Eingaben, wählbare Mengen und das gerechnete Ergebnis
       */
      read(options) {
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('rare-event-chart', {
          chartTypeId: this.model.chartTypeId,
          columnRef: this.model.columnRef,
          activeColumnSlots: this.activeColumnSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return [...PARAM_KEYS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent view transform; die Optionen der Kartentyp-Auswahl (eine Quelle: TYPES) */
      chartTypeOptions() { return TYPES.map(v => ({ value: v, label: _t(`type_${v}`) })); },

      /**
       * Die Ereignisreihe wählen und neu rechnen.
       * @agent
       * @param {'value'} slot der Slot; dieses Modul führt nur `value`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {Promise<void>}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      async setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        let clean = null;
        if (ref != null) {
          requireEnum('slot', slot, this.activeColumnSlots());
          const keys = this.pickableColumns()[slot].map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
          clean = keyToRef(refToKey(ref));
        }
        this.model.columnRef = clean;
        this._picker?.syncValue(clean);
        await this.runAnalysis();
      },

      /**
       * Eine Analyseoption setzen und neu rechnen.
       * @agent
       * @param {'chartTypeId'} key welche Option
       * @param {'g'|'t'} value der Kartentyp
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt ist oder `value` kein Kartentyp
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        // Wie bisher beim Typwechsel: den Wähler neu aufbauen (bisher chartTypeChanged).
        if (key === 'chartTypeId') this._mountPicker();
        await this.runAnalysis();
      },

      /**
       * Mit dem aktuellen Kartentyp und den Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._autoRunTimer);
        await this._runAnalysis();
      },

      /** Die Indizes der Punkte außerhalb der gezeichneten Grenzen — eine Quelle für Zeichnen und read(). */
      _signalIndices(result) {
        const out = [];
        result.chartValues.forEach((v, i) => {
          if (v != null && (v > result.chartUcl || v < result.chartLcl)) out.push(i);
        });
        return out;
      },

      /** Ergebnis und Punkte für read(), aus dem Vorlagenfeld `result` (E4). */
      _agentResult() {
        const r = this.result;
        if (!r) return { result: null, points: [], pointsColumns: [] };
        const signals = this._signalIndices(r);
        const { rows, columns } = zipPoints({ value: r.chartValues }, { signal: signals });
        return {
          result: {
            chartType: this.model.chartTypeId,
            n: r.n,
            cl: finiteOrNull(r.cl),
            ucl: finiteOrNull(r.ucl),
            lcl: finiteOrNull(r.lcl),
            sigma: finiteOrNull(r.sigma),
            transformed: r.transformedNote,
            plotted: {
              cl: finiteOrNull(r.chartCl),
              ucl: finiteOrNull(r.chartUcl),
              lcl: finiteOrNull(r.chartLcl),
              sigma: finiteOrNull(r.chartSigma),
            },
            signals,
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(3) : '–';
      },

      /** @noagent view transform */
      signalsClass() {
        const r = this.result;
        return r && r.signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
      },

      /** @noagent view transform */
      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        return _t(`chartTitle_${  this.model.chartTypeId}`, { col: colName });
      },

      /** @noagent view transform */
      isStable() {
        return Boolean(this.result) && this.result.signals === 0;
      },

      /** @noagent view transform */
      badgeClass() {
        return this.isStable() ? 'rec__badge--stable' : 'rec__badge--unstable';
      },

      /** @noagent view transform */
      badgeText() {
        const r = this.result;
        if (!r) return '';
        return r.signals === 0 ? _t('stable') : _t('unstable', { count: r.signals });
      },

      /** @noagent view transform */
      badgeIcon() {
        return this.isStable() ? 'status.ok' : 'status.warning';
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      _runAnalysis() {
        const clear = () => {
          this._destroyChart();
          this.result = null;
        };

        if (!this.model.columnRef) return clear();

        const raw = getColumnValues(module._context.stateManager, this.model.columnRef);
        const valid = raw.filter(v => typeof v === 'number' && !isNaN(v));
        const minPositive = (this.model.chartTypeId === 't')
          ? valid.filter(v => v > 0).length
          : valid.length;
        if (minPositive < 2) return clear();

        let result;
        if (this.model.chartTypeId === 'g') {
          const r = computeGChart(valid);
          const signals = this.model.countSignals(r.values, r.ucl, r.lcl);
          result = {
            cl: r.cl, ucl: r.ucl, lcl: r.lcl, sigma: r.sigma,
            n: valid.length, signals, transformedNote: false,
            chartValues: r.values, chartCl: r.cl, chartUcl: r.ucl,
            chartLcl: r.lcl, chartSigma: r.sigma,
            yLabel: _t('yLabel_g'),
          };
        } else {
          const r = computeTChart(valid);
          const transformedVals = r.transformed.filter(v => v !== null);
          const signals = this.model.countSignals(r.transformed, r.ucl, r.lcl);
          result = {
            cl: r.clOriginal, ucl: r.uclOriginal, lcl: r.lclOriginal, sigma: r.sigma,
            n: transformedVals.length, signals, transformedNote: true,
            chartValues: r.transformed, chartCl: r.cl, chartUcl: r.ucl,
            chartLcl: r.lcl, chartSigma: r.sigma,
            yLabel: _t('yLabel_t'),
          };
        }

        this.result = result;

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(result, gen));
      },

      // ── SVG control chart (imperative via chartManager) ───────

      async _renderChart(result, gen) {
        this._destroyChart();
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (!plotEl) return;
        plotEl.replaceChildren();

        // Out-of-limit points get the standard red marker.
        const violationIndices = new Set(this._signalIndices(result));
        const values = result.chartValues;

        const chart = await module._context.chartManager.create(plotEl, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: result.yLabel,
          showLegend: false,
          showTitle: false,
          values,
          cl: result.chartCl,
          ucl: result.chartUcl,
          lcl: result.chartLcl,
          sigma: result.chartSigma,
          violationIndices,
          usl: null, lsl: null,
          // Zone bands assume normal — disable for rare-event charts (they make
          // the geometric/exponential case look misleadingly Gaussian).
          showZones: false,
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._chart = chart;
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.value,
          onChange: (ref) => this.setColumn('value', ref),
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },
    };
  },
});

/**
 * Custom loadExample: rare-event-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef` instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder, then apply state (which re-runs the analysis on the new data).
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['columnRef']),
  });
};

export default mod;
