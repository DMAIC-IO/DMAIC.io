/**
 * D.Mike — Transformed I-MR Control Chart Module (transformed-imr-chart.js)
 *
 * Box-Cox-transformed I-MR for right-skewed or otherwise non-normal data.
 * Either auto-fits λ via Anderson-Darling or accepts a user-supplied value.
 * The chart is plotted on the transformed scale (where SPC limits are valid);
 * a side table shows the back-transformed limits on the original scale for
 * interpretation.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, lambda controls,
 *     output placeholders) lives in the Alpine template (transformed-imr-chart.html).
 *   - Dynamic output (error, stats KPI strip, chart section with header + badge,
 *     limits table) is rendered imperatively into the data-ref anchors
 *     because the POM relies on exact CSS selectors — POM-Byte-Parität.
 *   - One ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-chart uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *
 * @agent  Steuerbar über das Viewmodel: Messreihe (setColumn), λ automatisch
 *   oder von Hand (setParam), neu rechnen (runAnalysis). Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Eingaben, λ, Grenzen auf
 *   transformierter und Originalskala, Signalpunkte, je Punkt der
 *   transformierte Wert.
 */

import { createModule } from '../../core/template-module.js';
import { State, LAMBDA_MODES } from './transformed-imr-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import { computeTransformedIMR } from '../../engines/transformed-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Präfix der i18n-Schlüssel der Typ-Sätze (Kachel-Anker). */
const HELP = 'modules.transformed-imr-chart.types.';

/** Die Spalten-Slots: genau einer, die Messreihe. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 5 } };

/** Die Optionen, die `setParam` annimmt. */
const PARAM_KEYS = ['lambdaMode', 'lambdaManual'];

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  lambdaMode: (v) => { requireEnum('value', v, LAMBDA_MODES); return v; },
  lambdaManual: (v) => requireNumber('value', v),
};

/** Die i18n-Schlüssel der λ-Arten, wie die Vorlage sie bisher nannte. */
const LAMBDA_MODE_LABELS = { auto: 'lambdaAuto', manual: 'lambdaManual' };

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'auto'|'manual'} lambdaMode  λ schätzen oder vorgeben
 * @property {number} [lambdaManual]  vorgegebenes λ, nur im Modus manual
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 * Die Signalindizes zählen die verwerteten Zahlen, nicht die Zeilen.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Werte
 * @property {number|null} lambda  verwendetes λ
 * @property {boolean} lambdaAuto  λ geschätzt
 * @property {IndividualLimits} i  Einzelwertkarte, transformiert
 * @property {Limits} mr  Karte der gleitenden Spannweiten, transformiert
 * @property {Limits} iOriginal  Einzelwertkarte, zurücktransformiert
 * @property {number[]} signals  Signalpunkte der Einzelwertkarte
 */

/**
 * @typedef {object} IndividualLimits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 * @property {number|null} sigma  Streuung
 */

/**
 * @typedef {object} Limits
 * @property {number|null} cl  Mittellinie
 * @property {number|null} ucl  obere Eingriffsgrenze
 * @property {number|null} lcl  untere Eingriffsgrenze
 */

/**
 * Die Agenten-Lesefläche der transformierten I-MR-Karte.
 *
 * Eingaben (Spalte, λ-Art, λ), die Mengen der Setter, das Ergebnis als
 * Zahlen (Plan Welle 3 B, E4) und der Text, den die Oberfläche bei
 * unbrauchbaren Daten zeigt. Nicht darin: Kennzahlenleiste und
 * Grenzentabelle als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object|null} columnRef  the measured column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {string} lambdaMode  `'auto'` (estimated from the data) or `'manual'`
 * @property {number} lambdaManual  the Box-Cox λ used in manual mode; in auto mode it mirrors the estimated λ after each computation
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state (`lambdaManual` only in manual mode)
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {string} errorMsg  why nothing was computed (non-positive values, computation error), or ''
 * @property {Result|null} result  das gerechnete Ergebnis; null, solange nichts gerechnet ist
 * @property {object[]} points  [bulk] one row per value: `{ transformed, signal }`
 */

const mod = createModule({
  config: {
    id: 'transformed-imr-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.transformed-imr-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
          const wrap = module._container.querySelector('[data-ref="col-picker"]');
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
      /** KPI strip (declarative — structured cells, see _renderStats) */
      kpiCells: [],
      /** Error message (declarative — rendered via x-if/x-text in error-area) */
      errorMsg: '',
      /** Limits table rows (declarative — structured cells, see _renderLimitsTable) */
      limitRows: [],
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). See _renderCharts. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      /** Das Engine-Ergebnis der letzten Rechnung samt Punktzahl, synchron vor dem Zeichnen gesetzt (E3). */
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
        return readAgentState('transformed-imr-chart', {
          columnRef: this.model.columnRef,
          lambdaMode: this.model.lambdaMode,
          lambdaManual: this.model.lambdaManual,
          activeColumnSlots: this.activeColumnSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          errorMsg: this.errorMsg,
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return this.isManualLambda() ? ['lambdaMode', 'lambdaManual'] : ['lambdaMode'];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent view transform; λ von Hand — dasselbe Prädikat für :disabled und activeParams */
      isManualLambda() { return this.model.lambdaMode === 'manual'; },

      /** @noagent view transform; die Optionen der λ-Auswahl (eine Quelle: LAMBDA_MODES) */
      lambdaModeOptions() { return LAMBDA_MODES.map(v => ({ value: v, label: _t(LAMBDA_MODE_LABELS[v]) })); },

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
       * @param {keyof Params} key welche Option; die im Zustand zulässigen nennt `activeParams`
       * @param {string|number} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt oder gerade nicht aktiv ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        await this.runAnalysis();
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des λ-Feldes
       */
      async lambdaManualChanged(event) {
        const v = parseFloat(event.target.value);
        // Ein leeres oder unlesbares Feld setzt nichts; das Feld zeigt wieder den Model-Wert.
        if (!Number.isFinite(v)) { event.target.value = String(this.model.lambdaManual); return; }
        await this.setParam('lambdaManual', v);
      },

      /**
       * Mit der aktuellen Spalte und λ-Einstellung neu rechnen.
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
        const lim = (o, keys) => Object.fromEntries(keys.map(k => [k, finiteOrNull(o[k])]));
        const { rows, columns } = zipPoints({ transformed: r.transformed }, { signal: r.signalsI });
        return {
          result: {
            n,
            lambda: finiteOrNull(r.lambda),
            lambdaAuto: Boolean(r.lambdaAuto),
            i: lim(r.iLimits, ['cl', 'ucl', 'lcl', 'sigma']),
            mr: lim(r.mrLimits, ['cl', 'ucl', 'lcl']),
            iOriginal: lim(r.iLimitsOriginal, ['cl', 'ucl', 'lcl']),
            signals: [...r.signalsI],
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const clear = () => {
          this._lastRun = null;
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.errorMsg = '';
          this.kpiCells = [];
          this.limitRows = [];
        };

        if (!this.model.columnRef) { clear(); return; }

        const sm = module._context.stateManager;
        const raw = getColumnValues(sm, this.model.columnRef);
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));

        if (values.length < 5) { clear(); return; }

        if (values.some(v => v <= 0)) {
          clear();
          this.errorMsg = _t('errPositiveOnly');
          return;
        }

        let result;
        try {
          result = computeTransformedIMR(values, {
            lambda: this.model.lambdaMode === 'manual' ? this.model.lambdaManual : undefined,
          });
        } catch (e) {
          clear();
          const key = e.message === 'errPositiveOnly' ? 'errPositiveOnly' : 'errCompute';
          this.errorMsg = _t(key, { msg: e.message });
          return;
        }

        // Sync the lambda input in auto mode so the user sees the computed value
        if (this.model.lambdaMode === 'auto') {
          this.model.lambdaManual = result.lambda;
        }

        // Clear any previous error
        this.errorMsg = '';
        this._lastRun = { r: result, n: values.length };

        this._renderStats(result, values.length);
        await this._renderCharts(result);
        this._renderLimitsTable(result);
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──
      //
      // The λ label is a composite plain-text string ("λ (auto)" / "λ (manual)")
      // — the tag i18n strings already include the parentheses and the original
      // markup rendered them inline within the same label text node (no separate
      // span), so we keep one label string rather than splitting into labelHint.

      _renderStats(r, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        const cls = r.signalsI.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
        this.kpiCells = [
          { value: fmt(r.lambda), label: `λ ${r.lambdaAuto ? _t('lambdaAutoTag') : _t('lambdaManualTag')}`, labelHint: '', sub: _t('boxCoxLabel'), mod: '', help: `${HELP}Result.lambda` },
          { value: fmt(r.iLimits.cl), label: 'CL (y)', labelHint: '', sub: `σ̂ = ${fmt(r.iLimits.sigma)}`, mod: '', help: `${HELP}IndividualLimits.cl` },
          { value: r.signalsI.length, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls, help: `${HELP}Result.signals` },
        ];
      },

      // ── Chart rendering (header declarative; chart mounts into templated host) ──

      async _renderCharts(r) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);
        const isStable = r.signalsI.length === 0;

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 'i',
          title: _t('chartTitle', { col: colName, lambda: r.lambda }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: r.signalsI.length }),
          badgeClass: isStable ? 'timr__badge--stable' : 'timr__badge--unstable',
          badgeIcon: isStable ? 'status.ok' : 'status.warning',
        }];

        const host = await this.whenAnchor('[data-chart-host="i"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: _t('yLabel'),
          showLegend: false,
          showTitle: false,
          values: r.transformed,
          cl: r.iLimits.cl, ucl: r.iLimits.ucl, lcl: r.iLimits.lcl, sigma: r.iLimits.sigma,
          violationIndices: new Set(r.signalsI),
          usl: null, lsl: null,
          showZones: true,
        });

        if (gen !== this._renderGen) {
          // Stale render — a newer one started while awaiting
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }

        this._charts.push(chart);
      },

      // ── Limits table (declarative — structured rows, RAW text; x-text escapes) ──

      _renderLimitsTable(r) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        this.limitRows = [
          { label: 'UCL', transformed: fmt(r.iLimits.ucl), original: fmt(r.iLimitsOriginal.ucl) },
          { label: 'CL',  transformed: fmt(r.iLimits.cl),  original: fmt(r.iLimitsOriginal.cl) },
          { label: 'LCL', transformed: fmt(r.iLimits.lcl), original: fmt(r.iLimitsOriginal.lcl) },
        ];
      },

    };
  },
});

/**
 * Custom loadExample: transformed-imr-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. On load we provision a fresh worksheet, rewrite the
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
    rewriteRefs: rewriteRefFields(['columnRef']),
  });
};

export default mod;
