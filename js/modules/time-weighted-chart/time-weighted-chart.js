/**
 * D.Mike — Time-Weighted Control Chart Module (time-weighted-chart.js)
 *
 * EWMA and CUSUM charts. Both detect small persistent shifts much earlier
 * than Shewhart charts (I-MR, X̄-R) by integrating information across points.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, parameter inputs,
 *     output placeholders) lives in the Alpine template (time-weighted-chart.html).
 *     The chart-type and sigma-method <select>s are closed enums with STATIC
 *     <option>s (alpine.md §3). The EWMA (λ/L) and CUSUM (k/h) parameter blocks
 *     use <template x-if> so the inactive block's inputs are removed from the DOM
 *     — the POM's isParamVisible() checks element count.
 *   - Dynamic output (stats KPI strip, chart sections with header + badge) is
 *     rendered imperatively into the data-ref anchors because the POM relies on
 *     the exact CSS selectors — POM-Byte-Parität.
 *   - One ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-charts use a _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *   - EWMA / CUSUM math stays in the engine (time-weighted-chart-engine.js).
 *
 * @agent  Steuerbar über das Viewmodel: Messreihe (setColumn), Kartentyp,
 *   Phase I, Ziel- und σ-Vorgabe, λ/L bzw. k/h (setParam), neu rechnen
 *   (runAnalysis). Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — Eingaben, Ziel, σ, Grenzen, Signalpunkte und je Punkt die
 *   gezeichneten Größen.
 */

import { createModule } from '../../core/template-module.js';
import { State, CHART_TYPE_IDS, SIGMA_METHODS } from './time-weighted-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import {
  computeEWMA, computeCUSUM, estimateSigma,
} from '../../engines/time-weighted-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { paramInputMixin, numberCheck } from '../../core/param-input.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** parseFloat → finite number or null. */
function numOrNull(v) {
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}
/** parseInt → finite int or null. */
function intOrNull(v) {
  const i = parseInt(v, 10);
  return Number.isFinite(i) ? i : null;
}

/** Präfix der i18n-Schlüssel der Typ-Sätze (Kachel-Anker). */
const HELP = 'modules.time-weighted-chart.types.';

/** Die Spalten-Slots: genau einer, die Messreihe. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 3 } };

/** Die Optionen, die `setParam` annimmt (die letzten vier je nach Kartentyp). */
const PARAM_KEYS = ['chartTypeId', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride', 'lambda', 'L', 'kSigma', 'hSigma'];

/** Die Optionen, die für beide Kartentypen gelten. */
const BASE_PARAMS = ['chartTypeId', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride'];

/** Die Leerform eines Zahlenfelds („aus den Daten" bzw. „alle Punkte"): `null` oder `''`. */
const isEmptyForm = (v) => v === null || v === '';

/** Zahlenoptionen λ/L/k/h: zulässiger Bereich (einzige Quelle für Prüfer und Eingabefeld). */
const PARAM_SPEC = {
  lambda: { exclusiveMin: 0, max: 1, step: 0.05 },
  L: { exclusiveMin: 0, step: 0.1 },
  kSigma: { exclusiveMin: 0, step: 0.1 },
  hSigma: { exclusiveMin: 0, step: 0.5 },
};

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  chartTypeId: (v) => { requireEnum('value', v, CHART_TYPE_IDS); return v; },
  sigmaMethod: (v) => { requireEnum('value', v, SIGMA_METHODS); return v; },
  baselineCount: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, { min: 1, integer: true })),
  targetOverride: (v) => (isEmptyForm(v) ? null : requireNumber('value', v)),
  sigmaOverride: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, { min: 0 })),
  lambda: numberCheck(PARAM_SPEC.lambda),
  L: numberCheck(PARAM_SPEC.L),
  kSigma: numberCheck(PARAM_SPEC.kSigma),
  hSigma: numberCheck(PARAM_SPEC.hSigma),
};
/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'ewma'|'cusum'} chartTypeId  Verfahren
 * @property {'mr'|'sd'} sigmaMethod  Schätzung der Streuung
 * @property {number} baselineCount  Werte der Phase I, leer für alle
 * @property {number} targetOverride  vorgegebenes Ziel, leer für das Mittel
 * @property {number} sigmaOverride  vorgegebene Streuung, leer für die Schätzung
 * @property {number} [lambda]  Gewicht λ, nur EWMA
 * @property {number} [L]  Grenzenbreite L, nur EWMA
 * @property {number} [kSigma]  Referenzwert k in σ, nur CUSUM
 * @property {number} [hSigma]  Entscheidungsgrenze h in σ, nur CUSUM
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert;
 * die Schlüssel hängen vom Verfahren ab.
 *
 * @typedef {object} Result
 * @property {'ewma'|'cusum'} chartType  Verfahren
 * @property {number} n  verwertete Werte
 * @property {number|null} target  Ziel
 * @property {number|null} sigma  Streuung der Einzelwerte
 * @property {number} [lambda]  Gewicht λ, nur EWMA
 * @property {number} [L]  Grenzenbreite L, nur EWMA
 * @property {number|null} [cl]  Mittellinie, nur EWMA
 * @property {number|null} [sigmaSteady]  stationäre Streuung des EWMA
 * @property {number[]} [signals]  Signalpunkte, nur EWMA
 * @property {number|null} [k]  Referenzwert in Messeinheiten, nur CUSUM
 * @property {number|null} [h]  Entscheidungsgrenze in Messeinheiten, nur CUSUM
 * @property {number[]} [signalsHigh]  Signale nach oben, nur CUSUM
 * @property {number[]} [signalsLow]  Signale nach unten, nur CUSUM
 */

/**
 * Die Agenten-Lesefläche der zeitgewichteten Karten (EWMA, CUSUM).
 *
 * Eingaben (Spalte, Kartentyp, Phase I, Ziel- und σ-Vorgabe, die Parameter
 * des gewählten Typs), die Mengen der Setter und das Ergebnis als Zahlen.
 * Die Parameter des jeweils anderen Typs bleiben im
 * Model und in der Lesefläche, `activeParams` nennt nur die gerade
 * wirksamen. Nicht darin: Kennzahlenleiste als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object|null} columnRef  the measured column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {string} chartTypeId  `'ewma'` or `'cusum'`
 * @property {string} sigmaMethod  σ estimator from Phase I: `'mr'` (average moving range) or `'sd'` (standard deviation)
 * @property {number|null} baselineCount  Phase I length (first n values), or null for all values
 * @property {number|null} targetOverride  the target used instead of the Phase I mean, or null
 * @property {number|null} sigmaOverride  the σ used instead of the estimate (only when greater than 0), or null
 * @property {number} lambda  EWMA weight, 0 < lambda ≤ 1
 * @property {number} L  EWMA limit width in σ, greater than 0
 * @property {number} kSigma  CUSUM allowance k in σ, greater than 0
 * @property {number} hSigma  CUSUM decision interval h in σ, greater than 0
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts for the current chart type
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Result|null} result  the computed result, shape depends on the chart type (see `Result`); point numbers count the used values, not the worksheet rows; null without a column, with fewer than 3 numbers or σ ≤ 0
 * @property {object[]} points  [bulk] one row per value — EWMA `{ ewma, ucl, lcl, signal }`, CUSUM `{ cPlus, cMinus, signalHigh, signalLow }`
 */
const mod = createModule({
  config: {
    id: 'time-weighted-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.time-weighted-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...paramInputMixin({
        specs: PARAM_SPEC,
        checks: PARAM_CHECKS,
        t: _t,
        lang: () => module._context?.i18n?.getLanguage?.() ?? 'de',
      }),
      ...chartModuleLifecycle(module, {
        mountPicker() {
          const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
          if (!wrap) return;
          this._picker = new ColumnPicker(wrap, module._context, {
            mode: 'single',
            ...SLOT_FILTERS.value,
            onChange: (ref) => this.setColumn('value', ref),
          });
          if (this.model.columnRef) this._picker.value = this.model.columnRef;
        },
        themeMode: 'rerun',
        autorun: true,
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** KPI strip (declarative — structured cells, see _renderStats*) */
      kpiCells: [],
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). One mode renders at a time
       * (EWMA → 1 entry; CUSUM → 2 entries). See _renderChart*. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      /** Typ, Engine-Ergebnis, Ziel, σ und Punktzahl der letzten Rechnung, synchron vor dem Zeichnen gesetzt. */
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
        const m = this.model;
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('time-weighted-chart', {
          columnRef: m.columnRef,
          chartTypeId: m.chartTypeId,
          sigmaMethod: m.sigmaMethod,
          baselineCount: m.baselineCount,
          targetOverride: m.targetOverride,
          sigmaOverride: m.sigmaOverride,
          lambda: m.lambda,
          L: m.L,
          kSigma: m.kSigma,
          hSigma: m.hSigma,
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
      activeParams() {
        return [...BASE_PARAMS, ...(this.isEwma() ? ['lambda', 'L'] : ['kSigma', 'hSigma'])];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent view transform; EWMA gewählt — dasselbe Prädikat für x-if und activeParams */
      isEwma() { return this.model.chartTypeId === 'ewma'; },

      /** @noagent view transform; CUSUM gewählt — das Gegenstück für das zweite x-if */
      isCusum() { return this.model.chartTypeId === 'cusum'; },

      /** @noagent view transform; die Optionen der Kartentyp-Auswahl (eine Quelle: CHART_TYPE_IDS) */
      chartTypeOptions() { return CHART_TYPE_IDS.map(v => ({ value: v, label: _t(`type_${v}`) })); },

      /** @noagent view transform; die Optionen der σ-Schätzer (eine Quelle: SIGMA_METHODS) */
      sigmaMethodOptions() { return SIGMA_METHODS.map(v => ({ value: v, label: _t(`sigma_${v}`) })); },

      /**
       * Eine Analyseoption setzen und neu rechnen.
       * @agent
       * @param {keyof Params} key welche Option; die im Zustand zulässigen nennt `activeParams`
       * @param {string|number|null} value der Wert; Typ und Bereich je Schlüssel siehe `Params`
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt oder für diesen Kartentyp nicht aktiv ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        await this.runAnalysis();
      },

      /** Ergebnis und Punkte für read(), aus `_lastRun`. */
      _agentResult() {
        const run = this._lastRun;
        if (!run) return { result: null, points: [], pointsColumns: [] };
        const { r } = run;
        const base = { n: run.n, target: finiteOrNull(run.target), sigma: finiteOrNull(run.sigma) };
        if (run.type === 'ewma') {
          const { rows, columns } = zipPoints({ ewma: r.values, ucl: r.ucl, lcl: r.lcl }, { signal: r.signals });
          return {
            result: {
              chartType: 'ewma', ...base, lambda: this.model.lambda, L: this.model.L,
              cl: finiteOrNull(r.cl), sigmaSteady: finiteOrNull(r.sigmaSteady), signals: [...r.signals],
            },
            points: rows,
            pointsColumns: columns,
          };
        }
        const { rows, columns } = zipPoints({ cPlus: r.cPlus, cMinus: r.cMinus },
          { signalHigh: r.signalsHi, signalLow: r.signalsLo });
        return {
          result: {
            chartType: 'cusum', ...base, k: finiteOrNull(r.k), h: finiteOrNull(r.h),
            signalsHigh: [...r.signalsHi], signalsLow: [...r.signalsLo],
          },
          points: rows,
          pointsColumns: columns,
        };
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
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._autoRunTimer);
        await this._runAnalysis();
      },

      // ── View transforms (i18n) ────────────────────────────────

      /** @noagent view transform */
      typeHint() {
        return _t(`typeHint_${  this.model.chartTypeId}`);
      },
      /** @noagent view transform */
      sectionParamsLabel() {
        return _t(`sectionParams_${  this.model.chartTypeId}`);
      },

      // ── Nullable input display values ─────────────────────────
      // Legacy stored null for empty; the input shows '' for null.

      /** @noagent view transform */
      baselineCountValue() {
        return this.model.baselineCount == null ? '' : String(this.model.baselineCount);
      },
      /** @noagent view transform */
      targetOverrideValue() {
        return this.model.targetOverride == null ? '' : String(this.model.targetOverride);
      },
      /** @noagent view transform */
      sigmaOverrideValue() {
        return this.model.sigmaOverride == null ? '' : String(this.model.sigmaOverride);
      },

      // ── Change handlers ───────────────────────────────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} ev die Änderung des Phase-I-Feldes
       */
      async onBaselineCountChange(ev) {
        const v = intOrNull(ev.target.value);
        // Leer, unlesbar oder < 1 heißt „alle Punkte".
        await this.setParam('baselineCount', v != null && v >= 1 ? v : null);
        // Das Feld zeigt den Model-Wert, auch wenn er sich nicht geändert hat (0 bei leerem Feld).
        ev.target.value = this.baselineCountValue();
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} ev die Änderung der Zielvorgabe
       */
      async onTargetOverrideChange(ev) {
        await this.setParam('targetOverride', numOrNull(ev.target.value));
        ev.target.value = this.targetOverrideValue();
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} ev die Änderung der σ-Vorgabe
       */
      async onSigmaOverrideChange(ev) {
        const v = numOrNull(ev.target.value);
        await this.setParam('sigmaOverride', (v != null && v >= 0) ? v : null);
        ev.target.value = this.sigmaOverrideValue();
      },





      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const clear = () => {
          this._lastRun = null;
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.kpiCells = [];
        };

        if (!this.model.columnRef) { clear(); return; }

        const sm = module._context.stateManager;
        const raw = getColumnValues(sm, this.model.columnRef);
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
        if (values.length < 3) { clear(); return; }

        const blEnd = (this.model.baselineCount && this.model.baselineCount > 0)
          ? Math.min(this.model.baselineCount, values.length)
          : values.length;
        const baseline = values.slice(0, blEnd);

        // Resolve target & sigma
        const targetAuto = baseline.reduce((s, x) => s + x, 0) / baseline.length;
        const target = this.model.targetOverride != null ? this.model.targetOverride : targetAuto;

        const sigmaAuto = estimateSigma(baseline, this.model.sigmaMethod);
        const sigma = (this.model.sigmaOverride != null && this.model.sigmaOverride > 0)
          ? this.model.sigmaOverride
          : sigmaAuto;

        if (!(sigma > 0)) { clear(); return; }

        if (this.model.chartTypeId === 'ewma') {
          const r = computeEWMA(values, target, sigma, this.model.lambda, this.model.L);
          this._lastRun = { type: 'ewma', r, target, sigma, n: values.length };
          this._renderStatsEWMA(r, target, sigma, values.length);
          await this._renderChartEWMA(r);
        } else {
          const r = computeCUSUM(values, target, sigma, this.model.kSigma, this.model.hSigma);
          this._lastRun = { type: 'cusum', r, target, sigma, n: values.length };
          this._renderStatsCUSUM(r, target, sigma, values.length);
          await this._renderChartCUSUM(r, values.length);
        }
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──

      _renderStatsEWMA(r, target, sigma, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
        const sigCount = r.signals.length;
        const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

        this.kpiCells = [
          { value: fmt(target), label: _t('statTarget'), labelHint: '', sub: `σ̂ = ${fmt(sigma)}`, mod: '', help: `${HELP}Result.target` },
          { value: fmt(r.sigmaSteady), label: _t('statSigmaSteady'), labelHint: '', sub: `λ = ${this.model.lambda}`, mod: '', help: `${HELP}Result.sigmaSteady` },
          { value: sigCount, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls, help: `${HELP}Result.signals` },
        ];
      },

      _renderStatsCUSUM(r, target, sigma, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
        const sigCount = r.signalsHi.length + r.signalsLo.length;
        const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

        this.kpiCells = [
          { value: fmt(target), label: _t('statTarget'), labelHint: '', sub: `σ̂ = ${fmt(sigma)}`, mod: '', help: `${HELP}Result.target` },
          { value: fmt(r.h), label: _t('statHLimit'), labelHint: '', sub: `k = ${fmt(r.k)}`, mod: '', help: `${HELP}Result.h` },
          { value: sigCount, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls, help: `${HELP}Result.signalsHigh` },
        ];
      },

      // ── Chart rendering (headers declarative; charts mount into templated hosts) ──

      async _renderChartEWMA(r) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);
        const sigCount = r.signals.length;
        const isStable = sigCount === 0;

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 'ewma',
          title: _t('chartTitle_ewma', { col: colName }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: sigCount }),
          badgeClass: isStable ? 'twc__badge--stable' : 'twc__badge--unstable',
          badgeIcon: isStable ? 'status.ok' : 'status.warning',
        }];

        const host = await this.whenAnchor('[data-chart-host="ewma"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          editKey: 'ewma',
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: _t('yLabel_ewma'),
          showLegend: false,
          showTitle: false,
          values: r.values,
          cl: r.cl,
          ucl: r.ucl,      // array → stepped limits
          lcl: r.lcl,      // array → stepped limits
          sigma: r.sigma,  // array → no zones (correct: σ_zi varies by point)
          violationIndices: new Set(r.signals),
          usl: null, lsl: null,
          showZones: false,
        });

        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      },

      async _renderChartCUSUM(r, _n) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);

        const gen = ++this._renderGen;

        const subcharts = [
          {
            id: 'cusum_plus', titleKey: 'chartTitle_cusum_plus', yLabel: _t('yLabel_cusumHigh'),
            values: r.cPlus, violations: r.signalsHi,
          },
          {
            id: 'cusum_minus', titleKey: 'chartTitle_cusum_minus', yLabel: _t('yLabel_cusumLow'),
            values: r.cMinus, violations: r.signalsLo,
          },
        ];

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = subcharts.map(sc => {
          const sigCount = sc.violations.length;
          const isStable = sigCount === 0;
          return {
            id: sc.id,
            title: _t(sc.titleKey, { col: colName }),
            badgeText: isStable ? _t('stable') : _t('unstable', { count: sigCount }),
            badgeClass: isStable ? 'twc__badge--stable' : 'twc__badge--unstable',
            badgeIcon: isStable ? 'status.ok' : 'status.warning',
          };
        });

        for (const sc of subcharts) {
          const host = await this.whenAnchor(`[data-chart-host="${  sc.id  }"]`, gen);
          if (!host) return;

          const chart = await module._context.chartManager.create(host, 'control-chart', {
            editKey: 'cusum',
            title: '',
            xLabel: _t('xLabelSample'),
            yLabel: sc.yLabel,
            showLegend: false,
            showTitle: false,
            values: sc.values,
            cl: 0,
            ucl: r.h,
            lcl: 0,
            sigma: 0,            // suppress σ zones
            violationIndices: new Set(sc.violations),
            usl: null, lsl: null,
            showZones: false,
          });

          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },

    };
  },
});

/**
 * Custom loadExample: time-weighted-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. Delegates to the shared worksheet-backed loader,
 * rewriting the single `columnRef` placeholder.
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
