/**
 * D.Mike — Multivariate Control Chart Module (multivariate-control-chart.js)
 *
 * Hotelling T² for individuals: monitors several correlated variables
 * simultaneously. Detects shifts in any one variable AND deviations from the
 * normal correlation structure (which Shewhart-on-each-variable misses).
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, output placeholders)
 *     lives in the Alpine template (multivariate-control-chart.html).
 *   - Dynamic output (chart section with header + badge) is rendered
 *     imperatively into [data-ref="chart-wrap"] because the POM relies on the
 *     exact CSS selectors (.mvcc__chart-section, .mvcc__badge--stable/--unstable)
 *     which are POM-Byte-Parität.
 *   - The KPI strip ([data-ref="stats-bar"]) and the .mvcc__error message
 *     ([data-ref="error-area"]) are declarative (x-if/x-for/x-text).
 *   - ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-chart uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *
 * @agent  Steuerbar über das Viewmodel: Variablen (setColumns), α und
 *   Phase-I-Länge (setParam), neu rechnen (runAnalysis). Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Eingaben, T²-Grenze,
 *   Mittelwert und Kovarianz der Phase I, Signalzeilen und je Zeile T².
 */

import { createModule } from '../../core/template-module.js';
import { State, ALPHA_DEFAULT } from './multivariate-control-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import { computeHotellingT2 } from '../../engines/multivariate-chart-engine.js';
import { loadWorksheetExample, rewriteRefArray } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Die Mehrfachslots: genau einer, die Variablen. */
const MULTI_SLOTS = ['variables'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { variables: { types: ['numeric'], minCount: 3 } };

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['alpha', 'baselineCount'];

/** Die Leerform eines Zahlenfelds („alle Zeilen"): `null` oder `''`. */
const isEmptyForm = (v) => v === null || v === '';

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  alpha: (v) => requireNumber('value', v, { exclusiveMin: 0, exclusiveMax: 1 }),
  baselineCount: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, { min: 1, integer: true })),
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
 * Die Agenten-Lesefläche der multivariaten Regelkarte (Hotelling T²).
 *
 * Eingaben (Variablen, α, Phase-I-Länge), die Mengen der Setter, das
 * Ergebnis als Zahlen (Plan Welle 3 B, E4) und der Text, den die Oberfläche
 * bei zu wenigen Zeilen zeigt. Nicht darin: Kennzahlenleiste als Text,
 * `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object[]} columnRefs  the variable columns (slot `variables`), each `{ instanceId, sheetId, columnId }`
 * @property {number} alpha  false-alarm rate of the T² limit, 0 < alpha < 1
 * @property {number|null} baselineCount  rows used to estimate mean and covariance (Phase I), or null for all rows; used only when greater than the number of variables
 * @property {string[]} activeMultiSlots  the slots `setColumns` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts
 * @property {object} pickableColumns  per slot the columns `setColumns` accepts, each `{ key, name }`
 * @property {string} errorMsg  why nothing was computed (too few complete rows, computation error), or ''
 * @property {object|null} result  `{ n, p, m, cl, ucl, mean, covariance, signals }` — n complete rows, p variables, m Phase-I rows, mean and covariance from Phase I, signals the indices of rows above ucl; null with fewer than 2 variables or on error
 * @property {object[]} points  [bulk] one row per complete data row: `{ t2, signal }`
 */

const mod = createModule({
  config: {
    id: 'multivariate-control-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.multivariate-control-chart',
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
          this._picker = new ColumnPicker(wrap, module._context, {
            mode: 'multi',
            ...SLOT_FILTERS.variables,
            onChange: (refs) => this.setColumns('variables', Array.isArray(refs) ? refs : []),
          });
          if (this.model.columnRefs.length) this._picker.value = this.model.columnRefs;
        },
        themeMode: 'rerun',
        autorun: true,
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** KPI strip (declarative — structured cells, see _renderStats) */
      kpiCells: [],
      /** Error message (declarative — rendered via x-if/x-text in error-area) */
      errorMsg: '',
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). See _renderChart. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      /** Das Engine-Ergebnis der letzten Rechnung samt Zeilenzahl, synchron vor dem Zeichnen gesetzt (E3). */
      _lastRun: null,

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
        return readAgentState('multivariate-control-chart', {
          columnRefs: this.model.columnRefs,
          alpha: this.model.alpha,
          baselineCount: this.model.baselineCount,
          activeMultiSlots: this.activeMultiSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          errorMsg: this.errorMsg,
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeMultiSlots */
      activeMultiSlots() { return [...MULTI_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return [...PARAM_KEYS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(MULTI_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Die Variablen wählen und neu rechnen.
       * @agent
       * @param {'variables'} slot der Slot; dieses Modul führt nur `variables`
       * @param {{ instanceId: string, sheetId: string, columnId: string }[]} refs
       *   die Spaltenbezüge wählbarer Spalten (mindestens 2 für ein Ergebnis); [] leert
       * @returns {Promise<void>}
       * @throws {Error} wenn `slot` unbekannt ist, `refs` keine Liste oder eine Spalte nicht wählbar
       */
      async setColumns(slot, refs) {
        requireEnum('slot', slot, this.activeMultiSlots());
        if (!Array.isArray(refs)) {
          throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: a list of column references, [] clears it`);
        }
        const keys = this.pickableColumns()[slot].map(c => c.key);
        for (const ref of refs) requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        // Doppelte Bezüge fallen weg (erstes Vorkommen bleibt), wie der Wähler sie über ein Set zusammenführt.
        const clean = [...new Set(refs.map(refToKey))].map(keyToRef);
        this.model.columnRefs = clean;
        this._picker?.syncValue(clean);
        await this.runAnalysis();
      },

      /**
       * Eine Analyseoption setzen und neu rechnen.
       * @agent
       * @param {'alpha'|'baselineCount'} key welche Option
       * @param {any} value alpha eine Zahl mit 0 < alpha < 1; baselineCount eine ganze Zahl ≥ 1, oder null/'' für alle Zeilen
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        await this.runAnalysis();
      },

      /**
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._autoRunTimer);
        await this._runAnalysis();
      },

      /** Ergebnis und Punkte für read(), aus `_lastRun` (E4). */
      _agentResult() {
        if (!this._lastRun) return { result: null, points: [], pointsColumns: [] };
        const { r, n } = this._lastRun;
        const { rows, columns } = zipPoints({ t2: r.t2 }, { signal: r.signals });
        return {
          result: {
            n,
            p: r.p,
            m: r.m,
            cl: finiteOrNull(r.cl),
            ucl: finiteOrNull(r.ucl),
            mean: r.mean.map(finiteOrNull),
            covariance: r.cov.map(row => row.map(finiteOrNull)),
            signals: [...r.signals],
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── View helpers ──────────────────────────────────────────

      /**
       * Return the value for the baseline-count input (empty string for null).
       * Avoids Alpine CSP optional-chaining in template.
       * @noagent view transform
       */
      baselineCountValue() {
        return this.model.baselineCount != null ? this.model.baselineCount : '';
      },

      // ── Event handlers ────────────────────────────────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des Phase-I-Feldes
       */
      async baselineCountChanged(event) {
        const v = parseInt(event.target.value, 10);
        // Leer, unlesbar oder < 1 heißt „alle Zeilen" (E6).
        await this.setParam('baselineCount', Number.isInteger(v) && v >= 1 ? v : null);
        event.target.value = this.baselineCountValue();
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des α-Feldes
       */
      async alphaChanged(event) {
        const v = parseFloat(event.target.value);
        // Wie bisher: ein ungültiger Wert fällt auf die Vorgabe zurück — vor der Senke (E6).
        await this.setParam('alpha', (Number.isFinite(v) && v > 0 && v < 1) ? v : ALPHA_DEFAULT);
        event.target.value = String(this.model.alpha);
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const refs = this.model.columnRefs;
        if (!Array.isArray(refs) || refs.length < 2) {
          this._clear();
          return;
        }

        // Build data matrix; skip rows with any non-numeric entry.
        const sm = module._context.stateManager;
        const cols = refs.map(ref => getColumnValues(sm, ref));
        const len = Math.min(...cols.map(c => c.length));
        const rows = [];
        for (let i = 0; i < len; i++) {
          const r = cols.map(c => c[i]);
          if (r.every(v => typeof v === 'number' && !isNaN(v))) rows.push(r);
        }
        const p = refs.length;
        if (rows.length <= p) {
          this._showError(_t('errTooFewRows', { p }));
          return;
        }

        let result;
        try {
          result = computeHotellingT2(rows, {
            alpha: this.model.alpha,
            baselineEnd: this.model.baselineCount && this.model.baselineCount > p
              ? this.model.baselineCount
              : undefined,
          });
        } catch (e) {
          this._showError(_t('errCompute', { msg: e.message || String(e) }));
          return;
        }

        this._lastRun = { r: result, n: rows.length };
        this._renderStats(result, rows.length);
        await this._renderChart(result);
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──

      _renderStats(r, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        const cls = r.signals.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
        this.kpiCells = [
          { value: fmt(r.ucl), label: 'UCL (T²)', labelHint: '', sub: `α = ${this.model.alpha}`, mod: '' },
          { value: r.p, label: _t('statVariables'), labelHint: '', sub: _t('statBaseline', { m: r.m }), mod: '' },
          { value: r.signals.length, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      // ── Chart rendering (header declarative; chart mounts into templated host) ──

      async _renderChart(r) {
        this._destroyChart();

        const sm = module._context.stateManager;
        const colNames = this.model.columnRefs
          .map(ref => getColumnName(sm, ref))
          .join(', ');
        const isStable = r.signals.length === 0;

        this.errorMsg = '';

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 't2',
          title: _t('chartTitle', { vars: colNames }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: r.signals.length }),
          badgeClass: isStable ? 'mvcc__badge--stable' : 'mvcc__badge--unstable',
          badgeIcon: isStable ? 'status.ok' : 'status.warning',
        }];

        const host = await this.whenAnchor('[data-chart-host="t2"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: 'T²',
          showLegend: false,
          showTitle: false,
          values: r.t2,
          cl: r.cl,
          ucl: r.ucl,
          lcl: 0,
          sigma: 0,
          violationIndices: new Set(r.signals),
          usl: null, lsl: null,
          showZones: false,
        });

        if (gen !== this._renderGen) {
          // Stale render — newer one started while awaiting
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }

        this._chart = chart;
      },

      // ── Error / clear helpers ─────────────────────────────────

      _showError(msg) {
        this._lastRun = null;
        this._renderGen++;
        this.kpiCells = [];
        this.errorMsg = msg;
        this.chartViews = [];
        this._destroyChart();
      },

      _clear() {
        this._lastRun = null;
        this._renderGen++;
        this.kpiCells = [];
        this.errorMsg = '';
        this.chartViews = [];
        this._destroyChart();
      },

    };
  },
});

/**
 * Custom loadExample: multivariate-control-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRefs[n].instanceId`. On load we provision a fresh worksheet, rewrite each
 * placeholder, then apply state (which re-runs the analysis on the new data).
 *
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefArray('columnRefs'),
  });
};

export default mod;
