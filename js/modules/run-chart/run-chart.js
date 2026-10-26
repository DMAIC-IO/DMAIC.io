/**
 * D.Mike — Run Chart Module (run-chart.js)
 *
 * Plots a numeric series over sample number with a median reference line and
 * runs four standard pattern tests (clustering, mixtures, trends, oscillation).
 *
 * Use case: quick first look at process behavior before building control
 * limits — answers "is there obvious non-randomness?"
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs (the referenced column, alpha, the example-worksheet id); the analysis
 * result (median, runs counts, the four p-values) is derived transiently in the
 * view from those inputs plus the live worksheet column values. The runs-test
 * math lives in `js/engines/run-chart-engine.js` and is reused unchanged. The
 * ColumnPicker and the SVG run chart are mounted imperatively (they are not
 * pure-template concerns).
 *
 * @agent  Steuerbar über das Viewmodel: Messreihe (setColumn), α (setParam),
 *   neu rechnen (runAnalysis). Gelesen wird über read() mit erklärter
 *   Lesefläche (AgentRead) — Eingaben, Median, Läufe, die vier p-Werte und je
 *   Punkt der Wert.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './run-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';
import { computeRunChart } from '../../engines/run-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** Default significance level (mirrors the legacy module). */
const DEFAULT_ALPHA = 0.05;

/** Die Spalten-Slots: genau einer, die Messreihe. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 2 } };

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['alpha'];

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  alpha: (v) => requireNumber('value', v, { exclusiveMin: 0, exclusiveMax: 1 }),
};

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {number} alpha  Signifikanzniveau der vier Lauftests
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Zahlen
 * @property {number|null} median  Median der Reihe
 * @property {number} runsAboutMedian  Läufe um den Median
 * @property {number} runsUpDown  Läufe auf und ab
 * @property {number} flagged  angeschlagene Tests, 0 bis 4
 * @property {RunTest[]} tests  die vier Lauftests
 */

/**
 * @typedef {object} RunTest
 * @property {'clustering'|'mixtures'|'trends'|'oscillation'} id  welcher Test
 * @property {number|null} p  p-Wert
 * @property {number} observed  gezählte Läufe, auf denen der Test beruht
 * @property {boolean} flagged  p kleiner als α
 */

/**
 * Die Agenten-Lesefläche der Verlaufskarte.
 *
 * Eingaben (Spalte, α), die Mengen, gegen die die Setter prüfen, und das
 * gerechnete Ergebnis als Zahlen. Nicht darin: die
 * Kennzahlenleiste und die Testtabelle als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object|null} columnRef  the measured column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {number} alpha  significance level of the four runs tests, 0 < alpha < 1
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Result|null} result  the computed result, or null without column or with fewer than 3 numbers
 * @property {object[]} points  [bulk] one row per plotted value in data order: `{ value }`
 */
const mod = createModule({
  config: {
    id: 'run-chart',
    engine: 'alpine',
    phase: 'data',
    group: 'visualize',
    icon: 'module.run-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
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
        themeMode: 'rerun',
        autorun: true,
        onTheme() {
          if (this.result) {
            const r = this.result;
            this.$nextTick(() => this._renderChart(
              { values: r.values, median: r.median },
              ++this._renderGen,
            ));
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { median, n, runsAboutMedian, runsUpDown, flagged,
       *     values, tests: [{ id, p, obs }] }
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
        return readAgentState('run-chart', {
          columnRef: this.model.columnRef,
          alpha: this.model.alpha,
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

      /**
       * Die Messreihe wählen und neu rechnen.
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
       * @param {keyof Params} key welche Option
       * @param {number} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt ist oder `value` außerhalb von (0, 1)
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        await this.runAnalysis();
      },

      /**
       * Mit der gewählten Spalte und α neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._autoRunTimer);
        await this._runAnalysis();
      },

      /** Ergebnis und Punkte für read(), aus dem Vorlagenfeld `result`. */
      _agentResult() {
        const r = this.result;
        if (!r) return { result: null, points: [], pointsColumns: [] };
        const { rows, columns } = zipPoints({ value: r.values });
        return {
          result: {
            n: r.n,
            median: finiteOrNull(r.median),
            runsAboutMedian: r.runsAboutMedian,
            runsUpDown: r.runsUpDown,
            flagged: r.flagged,
            tests: r.tests.map(t => ({
              id: t.id, p: finiteOrNull(t.p), observed: t.obs, flagged: this.isTestFlagged(t.p),
            })),
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      /** @noagent view transform */
      fmtP(p) {
        return p < 0.0001 ? '< 0.0001' : p.toFixed(4);
      },

      /** @noagent view transform */
      flaggedKpiClass() {
        const r = this.result;
        return r && r.flagged === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
      },

      /** @noagent view transform */
      testName(id) {
        return _t(`test_${  id}`);
      },

      /** @noagent view transform */
      testDesc(id) {
        return _t(`testDesc_${  id}`);
      },

      /** @noagent view transform */
      testStatusClass(p) {
        return p < this.model.alpha
          ? 'run-chart__test-status--bad'
          : 'run-chart__test-status--ok';
      },

      /** @noagent view transform */
      testStatusText(p) {
        return p < this.model.alpha ? _t('flagFail') : _t('flagPass');
      },

      /**
       * @noagent view transform
       * @returns {boolean} true once a test is flagged — the state in which the status carries the warning icon.
       */
      isTestFlagged(p) {
        return p < this.model.alpha;
      },

      /** @noagent view transform */
      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        return _t('chartTitle', { col: colName });
      },

      // ── Event handlers ─────────────────────────────────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des α-Feldes
       */
      async alphaChanged(event) {
        const v = parseFloat(event.target.value);
        // Wie bisher: ein ungültiger Wert fällt auf die Vorgabe zurück — vor der Senke.
        await this.setParam('alpha', (Number.isFinite(v) && v > 0 && v < 1) ? v : DEFAULT_ALPHA);
        event.target.value = String(this.model.alpha);
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      _runAnalysis() {
        const clear = () => {
          this._destroyChart();
          this.result = null;
        };

        if (!this.model.columnRef) return clear();

        const raw = getColumnValues(module._context.stateManager, this.model.columnRef);
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
        if (values.length < 3) return clear();

        const r = computeRunChart(values);
        const flagged = this.model.flaggedCount(r, this.model.alpha);

        this.result = {
          median: r.median,
          n: r.values.length,
          runsAboutMedian: r.runsAboutMedian,
          runsUpDown: r.runsUpDown,
          flagged,
          values: r.values,
          tests: [
            { id: 'clustering',  p: r.pClustering,  obs: r.runsAboutMedian },
            { id: 'mixtures',    p: r.pMixtures,    obs: r.runsAboutMedian },
            { id: 'trends',      p: r.pTrends,      obs: r.runsUpDown },
            { id: 'oscillation', p: r.pOscillation, obs: r.runsUpDown },
          ],
        };

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(r, gen));
      },

      // ── SVG run chart (imperative via chartManager) ───────────

      async _renderChart(r, gen) {
        this._destroyChart();
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (!plotEl) return;
        plotEl.replaceChildren();

        const colName = getColumnName(module._context.stateManager, this.model.columnRef);

        const chart = await module._context.chartManager.create(plotEl, 'run-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: colName,
          showLegend: false,
          showTitle: false,
          values: r.values,
          median: r.median,
          colorBySide: true,
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._chart = chart;
      },
    };
  },
});

/**
 * Custom loadExample: run-chart catalog examples ship a full worksheet
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
