/**
 * D.Mike — Outlier Test Module (outlier-test.js)
 * Analyze phase: classical outlier identification on a single numeric column.
 *
 * Methods (any subset can be enabled at once):
 *   - Grubbs' Test
 *   - Dixon Q Test
 *   - Generalized ESD (Rosner 1983)
 *   - Tukey IQR Rule (boxplot fences)
 *   - Hampel Identifier (median + scaled MAD)
 *   - Z-Score
 *   - Modified Z-Score (Iglewicz-Hoaglin)
 *
 * Migrated to createModule + Alpine CSP.
 * The input panel is declarative Alpine; the output (result cards, chart,
 * flagged table) is rendered imperatively into [data-ref="results"] — required
 * for byte-parity with the POM selectors (.outliertest__card, .outliertest__chip,
 * .outliertest__steps, etc.).
 *
 * Imperative widgets follow the msa-typ1 lifecycle pattern:
 *   _picker, _chart, _renderGen, _unsubs in data-Fn (transient, never in Model).
 *
 * @agent  Steuerbar über das Viewmodel: die Parameter (setParam), die
 *   Messwertspalte (setColumn), das Rechnen (runAnalysis) und die
 *   Diagrammwahl (setChartMethod). Gelesen wird über read() mit erklärter
 *   Lesefläche (AgentRead) — Konfiguration, wählbare Spalten und je Methode
 *   die markierten Werte. Der Agent bekommt Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { paramInputMixin, numberCheck } from '../../core/param-input.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, ALL_METHODS, VALID_SIDES, METRIC_KEYS } from './outlier-test-model.js';
import {
  grubbsTest, dixonQTest, generalizedESD,
  tukeyIQR, hampelIdentifier, zScoreOutliers, modifiedZScore,
} from '../../engines/outlier-test-engine.js';
import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';

/** Mapping: test id → Algorithm Lab algorithm id. */
const ALGO_LAB_IDS = {
  'grubbs':           'grubbs-test',
  'dixon-q':          'dixon-q-test',
  'generalized-esd':  'generalized-esd',
  'tukey-iqr':        'tukey-iqr',
  'hampel':           'hampel-identifier',
  'z-score':          'z-score-outlier',
  'modified-z':       'modified-z-score',
};

/** Maps method id to the i18n-key suffix (e.g. 'grubbs' → 'Grubbs' → key 'mGrubbs'). */
const LABEL_KEY_MAP = {
  'grubbs':           'Grubbs',
  'dixon-q':          'Dixon',
  'generalized-esd':  'ESD',
  'tukey-iqr':        'Tukey',
  'hampel':           'Hampel',
  'z-score':          'ZScore',
  'modified-z':       'ModZ',
};

/** Maps method id to short table header label. */
const SHORT_LABEL_MAP = {
  'grubbs':           'G',
  'dixon-q':          'Q',
  'generalized-esd':  'ESD',
  'tukey-iqr':        'IQR',
  'hampel':           'Ham',
  'z-score':          'Z',
  'modified-z':       'M-Z',
};

/** @param {number|null} v @param {number} d @returns {string} */
/**
 * Translated text for an engine error code; falls back to the code itself.
 * @param {(key: string) => string} t
 * @param {string} code
 * @returns {string}
 */
function _errText(t, code) {
  const key = `err_${code}`;
  const text = t(key);
  return text && text !== key ? text : code;
}

function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

/** Zahlenparameter: zulässiger Bereich und Schrittweite (einzige Quelle für Setter und Oberfläche). */
const PARAM_SPEC = {
  // Nicht enger als die Einstellungen säen können (settings.js clampConfPower: bis 99,99 % → alpha 0.0001).
  alpha: { min: 0.0001, max: 0.5, step: 0.01 },
  tukeyFactor: { min: 0.1, max: 10, step: 0.1 },
  hampelK: { min: 0.1, max: 20, step: 0.1 },
  zThreshold: { min: 0.1, max: 10, step: 0.1 },
  modZThreshold: { min: 0.1, max: 10, step: 0.1 },
  esdMaxOutliers: { min: 1, max: 50, integer: true, step: 1, nullable: true },
};

/** Die Parameter, die `setParam` annimmt (kein Modus schaltet einen ab). */
const PARAM_KEYS = ['alpha', 'side', 'tukeyFactor', 'hampelK', 'zThreshold',
  'modZThreshold', 'esdMaxOutliers', 'enabled'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  alpha: numberCheck(PARAM_SPEC.alpha),
  side: (v) => { requireEnum('value', v, VALID_SIDES); return v; },
  tukeyFactor: numberCheck(PARAM_SPEC.tukeyFactor),
  hampelK: numberCheck(PARAM_SPEC.hampelK),
  zThreshold: numberCheck(PARAM_SPEC.zThreshold),
  modZThreshold: numberCheck(PARAM_SPEC.modZThreshold),
  esdMaxOutliers: numberCheck(PARAM_SPEC.esdMaxOutliers),
  enabled: (v) => {
    if (!Array.isArray(v)) {
      throw new Error(`invalid value ${JSON.stringify(v)}; allowed: a list of method ids from ${ALL_METHODS.join(', ')}`);
    }
    for (const m of v) requireEnum('method', m, ALL_METHODS);
    return ALL_METHODS.filter(m => v.includes(m));      // Reihenfolge der Konstante, ohne Doppelte
  },
};

/** Die Spalten-Slots dieses Moduls: genau einer, die Messwertspalte. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter, den der Wähler dieses Slots bekommt. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 3 } };

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = { value: (m, ref) => { m.colRef = ref; } };

/** Beschriftungsschlüssel der Seitenauswahl. */
const SIDE_LABEL_KEYS = { 'two-sided': 'sideTwo', upper: 'sideUpper', lower: 'sideLower' };

/** Zahl oder leer: nicht endliche Werte (NaN, Infinity) werden zu null. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Die Kennzahlen eines Verfahrens aus dem Rohergebnis der Engine — die eine
 * Quelle für die Karte und die Lesefläche.
 * @param {string} id Verfahren
 * @param {object} r Rohergebnis des Verfahrens
 * @returns {Object<string, number|null>|null} null für ein unbekanntes Verfahren
 */
function methodMetrics(id, r) {
  switch (id) {
    case 'grubbs':
      return { statistic: num(r.statistic), critical: num(r.critical), pValue: num(r.pValue), mean: num(r.mean), sd: num(r.sd) };
    case 'dixon-q':
      return { statistic: num(r.statistic), critical: num(r.critical) };
    case 'generalized-esd':
      return { detected: num(r.detected), maxOutliers: num(r.parameters.maxOutliers) };
    case 'tukey-iqr':
      return { q1: num(r.q1), median: num(r.median), q3: num(r.q3), iqr: num(r.iqr), fenceLower: num(r.fenceLower), fenceUpper: num(r.fenceUpper) };
    case 'hampel':
      return { median: num(r.median), mad: num(r.mad), madScaled: num(r.madScaled), k: num(r.parameters.k), threshold: num(r.threshold) };
    case 'z-score':
      return { mean: num(r.mean), sd: num(r.sd), threshold: num(r.parameters.threshold) };
    case 'modified-z':
      return { median: num(r.median), mad: num(r.mad), threshold: num(r.parameters.threshold) };
    default:
      return null;
  }
}

/** Präfix der Typedef-Sätze; die Kennzahlen der Übersicht hängen ihren Schlüssel an. */
const HELP = 'modules.outlier-test.types.';

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {number} alpha  Signifikanzniveau
 * @property {'two-sided'|'upper'|'lower'} side  Richtung
 * @property {number} tukeyFactor  Faktor der Tukey-Zäune
 * @property {number} hampelK  Schwelle des Hampel-Filters
 * @property {number} zThreshold  Schwelle des z-Werts
 * @property {number} modZThreshold  Schwelle des modifizierten z-Werts
 * @property {number} esdMaxOutliers  Höchstzahl beim verallgemeinerten ESD, leer für automatisch
 * @property {string[]} enabled  aktive Verfahren
 */

/**
 * Das gerechnete Ergebnis (`_buildResult()`), wie `read().result` es liefert.
 * Die Indizes zählen die verwerteten Zahlen ab 0, nicht die Zeilen.
 *
 * @typedef {object} Result
 * @property {number} n  verwertete Zahlen
 * @property {number[]} flaggedIdxs  von mindestens einem Verfahren markiert
 * @property {MethodResult[]} methods  je aktivem Verfahren
 */

/**
 * @typedef {object} MethodResult
 * @property {string} id  Verfahren
 * @property {number[]} flagged  markierte Punkte
 * @property {string|null} error  Fehlerkennung
 * @property {MethodMetrics|null} metrics  Kennzahlen der Karte; leer, wenn das Verfahren nicht anwendbar ist
 * @property {EsdStep[]|null} steps  Schritte der Generalized ESD; nur dort, sonst leer
 */

/**
 * Die Kennzahlen eines Verfahrens, dieselben Zahlen wie auf seiner Karte. Welche
 * Schlüssel da sind, hängt vom Verfahren ab.
 *
 * @typedef {object} MethodMetrics
 * @property {number|null} [statistic]  Prüfgröße G (Grubbs) bzw. Q (Dixon Q)
 * @property {number|null} [critical]  kritischer Wert zur Prüfgröße
 * @property {number|null} [pValue]  p-Wert (nur Grubbs)
 * @property {number|null} [mean]  Mittelwert (Grubbs, Z-Score)
 * @property {number|null} [sd]  Standardabweichung (Grubbs, Z-Score)
 * @property {number|null} [detected]  erkannte Ausreißer (Generalized ESD)
 * @property {number|null} [maxOutliers]  geprüfte Höchstzahl (Generalized ESD)
 * @property {number|null} [q1]  erstes Quartil (Tukey)
 * @property {number|null} [median]  Median (Tukey, Hampel, Modified Z-Score)
 * @property {number|null} [q3]  drittes Quartil (Tukey)
 * @property {number|null} [iqr]  Quartilsabstand (Tukey)
 * @property {number|null} [fenceLower]  untere Schranke (Tukey)
 * @property {number|null} [fenceUpper]  obere Schranke (Tukey)
 * @property {number|null} [mad]  MAD (Hampel, Modified Z-Score)
 * @property {number|null} [madScaled]  1,4826·MAD (Hampel)
 * @property {number|null} [k]  Schwelle k (Hampel)
 * @property {number|null} [threshold]  Schwelle (Hampel, Z-Score, Modified Z-Score)
 */

/**
 * Ein Schritt der Generalized ESD.
 *
 * @typedef {object} EsdStep
 * @property {number} i  Nummer des Schritts ab 1
 * @property {number} value  der Wert, der in diesem Schritt geprüft wird
 * @property {number} R  Prüfgröße Rᵢ
 * @property {number} lambda  kritischer Wert λᵢ
 */

/**
 * Die Agenten-Lesefläche von Outlier Test.
 *
 * Das Model hält die Eingaben flach; das Ergebnis entsteht transient am
 * Viewmodel. Darum erklärt dieses Modul seine Lesefläche — ohne die interne
 * Beispiel-Buchführung (`exampleWorksheetId`) und ohne Diagrammdaten.
 *
 * @typedef {object} AgentRead
 * @property {object|null} colRef  the chosen data column, `{ instanceId, sheetId, columnId }`, or null
 * @property {number|null} alpha  significance level of Grubbs, Dixon Q and generalized ESD
 * @property {'two-sided'|'upper'|'lower'} side  which tail Grubbs and Dixon Q test
 * @property {number} tukeyFactor  fence multiplier of the Tukey IQR rule
 * @property {number} hampelK  threshold of the Hampel identifier in scaled MAD units
 * @property {number} zThreshold  threshold of the Z-score rule
 * @property {number} modZThreshold  threshold of the modified Z-score
 * @property {number|null} esdMaxOutliers  upper limit of outliers for generalized ESD; null chooses it automatically
 * @property {string[]} enabled  the methods that are run, in the fixed order of the module
 * @property {string} chartMethod  the method the chart highlights; `'all'` or one of chartMethodOptions
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {string[]} chartMethodOptions  the values `setChartMethod` accepts: `'all'` plus every method that flagged a value
 * @property {Result|null} result  the flagged points per method, or null while no column is chosen or it has fewer than 3 numeric values
 * @property {string} errorMsg  why drawing the chart failed, or an empty string
 */

const mod = createModule({
  config: {
    id: 'outlier-test',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.outlier-test',
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
      // ── Transient view state (not persisted) ──────────────────
      _picker: null,
      _chart: null,
      _renderGen: 0,
      _unsubs: [],

      // ── Results panel (declarative — structured reactive data) ──
      /** Whether the composite results panel is shown. */
      panelShow: false,
      /** @type {Array<{value:string,label:string,help:string,kpiClass:string,valueClass:string}>} summary KPI cells. */
      summaryKpis: [],
      /** @type {Array<{val:string,label:string,active:boolean}>} chart-method segmented buttons. */
      chartSegs: [],
      /** @type {Array} per-method result cards (see _buildMethodCard). */
      methodCards: [],
      /** Whether the combined flagged-points table is shown. */
      flaggedShow: false,
      /** @type {Array<{short:string,title:string}>} flagged-table method headers. */
      flaggedHeaders: [],
      /** @type {Array} flagged-table rows (see _renderResults). */
      flaggedRows: [],
      /**
       * The analysis outcome the agent reads; null while no column is chosen or it has fewer than 3 numeric values.
       * `flaggedIdxs` and each `flagged` are 0-based positions among the numeric values of the column (empty and non-numeric cells are skipped).
       * @type {{n:number,flaggedIdxs:number[],methods:Array<{id:string,flagged:number[],error:string|null,metrics:object|null,steps:object[]|null}>}|null}
       */
      result: null,
      /** Why drawing the chart failed; empty while there is no failure. */
      errorMsg: '',
      /** @type {object} transient render context for chart re-plots (not persisted). */
      _chartCtx: { data: [], colName: '', results: {}, flaggedIdxs: [] },

      // ── View helpers exposed to the Alpine template ───────────

      /** All method ids for x-for iteration in the template. */
      allMethods: ALL_METHODS,

      /**
       * Whether a method is enabled.
       * @noagent view transform; der Agent liest die Menge über read().enabled
       */
      isMethodEnabled(mid) {
        return this.model.enabled.includes(mid);
      },

      /**
       * i18n label for a method id.
       * @noagent view transform
       */
      methodLabel(mid) {
        const key = LABEL_KEY_MAP[mid];
        return key ? _t(`m${  key}`) : mid;
      },

      // ── Event handlers (Alpine template → @change / @input) ───

      /**
       * Toggle a method checkbox on/off.
       * @noagent DOM event handler; the agent uses setParam()
       */
      toggleMethod(mid) {
        const next = this.model.enabled.includes(mid)
          ? this.model.enabled.filter(m => m !== mid)
          : [...this.model.enabled, mid];
        this.setParam('enabled', next);
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!wrap) return;
        this._picker && this._picker.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.value,
          onChange: (ref) => {
            this.setColumn('value', ref);
          },
        });
        if (this.model.colRef) this._picker.value = this.model.colRef;
      },

      // ── Data retrieval ────────────────────────────────────────

      _getColumnData() {
        if (!this.model.colRef) return [];
        const raw = getColumnValues(module._context.stateManager, this.model.colRef);
        return raw.filter((v) => v != null && typeof v === 'number' && !isNaN(v));
      },

      // ── Error display ─────────────────────────────────────────

      _showError(msg) {
        this.errorMsg = msg;
      },

      _hideError() {
        this.errorMsg = '';
      },

      _hideResults() {
        const phEl = module._container.querySelector('[data-ref="placeholder"]');
        const resEl = module._container.querySelector('[data-ref="results"]');
        if (phEl) phEl.style.display = '';
        if (resEl) resEl.style.display = 'none';
        this._clearPanel();
        this._destroyChart();
      },

      /** Clear all reactive panel data (no-data / hide paths). */
      _clearPanel() {
        // Bump the render generation so any in-flight chart mount aborts.
        this._renderGen++;
        this.panelShow = false;
        this.summaryKpis = [];
        this.chartSegs = [];
        this.methodCards = [];
        this.flaggedShow = false;
        this.flaggedHeaders = [];
        this.flaggedRows = [];
      },

      // ── Analysis ─────────────────────────────────────────────

      /**
       * Rechnet mit der gewählten Spalte und allen aktivierten Methoden; ohne
       * Spalte oder mit weniger als 3 numerischen Werten bleibt result null
       * (keine Absage, wie die Oberfläche).
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this._hideError();

        const data = this._getColumnData();
        if (data.length < 3) { this.result = null; this._hideResults(); return; }

        const alpha = this.model.alpha;
        const enabled = new Set(this.model.enabled);

        const results = {};
        const errs = {};

        const safe = (id, fn) => {
          if (!enabled.has(id)) return;
          try { results[id] = fn(); }
          catch (e) { errs[id] = e.message || 'error'; }
        };

        safe('grubbs',          () => grubbsTest(data, alpha, this.model.side));
        safe('dixon-q',         () => dixonQTest(data, alpha, this.model.side));
        safe('generalized-esd', () => generalizedESD(data, alpha, this.model.esdMaxOutliers ?? undefined));
        safe('tukey-iqr',       () => tukeyIQR(data, this.model.tukeyFactor));
        safe('hampel',          () => hampelIdentifier(data, this.model.hampelK));
        safe('z-score',         () => zScoreOutliers(data, this.model.zThreshold));
        safe('modified-z',      () => modifiedZScore(data, this.model.modZThreshold));

        this.result = this._buildResult(data, results, errs);
        this._renderResults(data, results, errs);
      },

      /**
       * Build the agent-facing outcome (no chart data) from the engine results.
       * @param {number[]} data numeric values of the column
       * @param {object} results engine result per method id
       * @param {object} errs error message per method id
       * @returns {{n:number,flaggedIdxs:number[],methods:Array<{id:string,flagged:number[],error:string|null,metrics:object|null,steps:object[]|null}>}}
       */
      _buildResult(data, results, errs) {
        const union = new Set();
        const methods = [];
        for (const id of ALL_METHODS) {
          if (!results[id] && !errs[id]) continue;
          const flagged = results[id] && results[id].outliers
            ? results[id].outliers.map((o) => o.index) : [];
          flagged.forEach((i) => union.add(i));
          const r = results[id];
          const steps = id === 'generalized-esd' && r && Array.isArray(r.steps)
            ? r.steps.map((s) => ({ i: s.i, value: s.value, R: s.R, lambda: s.lambda })) : null;
          methods.push({ id, flagged, error: errs[id] || null, metrics: r ? methodMetrics(id, r) : null, steps });
        }
        return { n: data.length, flaggedIdxs: [...union].sort((a, b) => a - b), methods };
      },

      // ── Render results (declarative — structured reactive data) ──
      //
      // The composite panel (summary KPI strip + chart-method selector +
      // per-method cards + combined flagged-points table) is modelled as
      // reactive structured data and rendered by the Alpine template
      // (outlier-test.html). All text is RAW — x-text escapes structurally,
      // so values are NEVER esc()'d here. Number formatting matches the legacy
      // string output exactly (fmt()), so the rendered text is byte-identical.
      // The chart stays an imperative chartManager mount into the templated
      // [data-ref="chart"] host (sanctioned chart tier), resolved via the
      // bounded _whenAnchor rAF-poll since the host now lives inside x-if.

      /**
       * Navigate to an Algorithm Lab entry from a card link.
       * @noagent navigation
       * @param {string} algoId
       * @param {Event} event
       */
      openAlgoLab(algoId, event) {
        if (event) event.preventDefault();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      /**
       * Build the structured data for a single (non-error) method card.
       * @param {string} id
       * @param {object} r engine result
       * @returns {object}
       */
      _buildMethodCard(id, r) {
        const key = LABEL_KEY_MAP[id] || 'Grubbs';
        const label = _t(`m${  key}`);
        const k = r.outliers && r.outliers.length ? r.outliers.length : 0;
        const verdictIcon = k === 0 ? 'status.ok' : 'status.warning';
        const verdictText = k === 0
          ? _t('verdictClean')
          : _t('verdictFlagged', { count: k });
        const verdictClass = k === 0
          ? 'outliertest__verdict--clean'
          : 'outliertest__verdict--flag';

        const M = methodMetrics(id, r) || {};
        const mc = (value, lbl, key, kpiClass = '', valueClass = '') => {
          if (key && !METRIC_KEYS.includes(key)) throw new Error(`METRIC_KEYS kennt „${key}“ nicht`);
          return { value, label: lbl, help: key ? `${HELP}MethodMetrics.${key}` : '', kpiClass, valueClass };
        };
        let metrics = [];
        let steps = [];
        let stepsHeader = '';
        let hint = '';

        if (id === 'grubbs') {
          const pBad = r.pValue < r.parameters.alpha;
          metrics = [
            mc(fmt(M.statistic, 4), _t('symG'), 'statistic'),
            mc(fmt(M.critical, 4), _t('symGcrit'), 'critical'),
            mc(fmt(M.pValue, 4), _t('common.sym.p'), 'pValue', pBad ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
            mc(fmt(M.mean, 4), _t('common.sym.xbar'), 'mean'),
            mc(fmt(M.sd, 4), _t('symS'), 'sd'),
          ];
        } else if (id === 'dixon-q') {
          metrics = [
            mc(fmt(M.statistic, 4), _t('symQ'), 'statistic'),
            mc(fmt(M.critical, 4), _t('symQcrit'), 'critical'),
            mc(r.parameters.variant, _t('variant'), '', '', 'dmike-kpi-value--sm'),
            mc(r.side, _t('side'), '', '', 'dmike-kpi-value--sm'),
          ];
        } else if (id === 'generalized-esd') {
          metrics = [
            mc(fmt(M.detected, 0), _t('detected'), 'detected', M.detected > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
            mc(String(M.maxOutliers), _t('esdMax'), 'maxOutliers'),
          ];
          stepsHeader = _t('stepsReject');
          steps = r.steps.map((s) => ({
            i: String(s.i),
            value: fmt(s.value, 4),
            R: fmt(s.R, 4),
            lambda: fmt(s.lambda, 4),
            markIcon: s.R > s.lambda ? 'status.error' : 'status.ok',
            rejectClass: s.R > s.lambda ? 'outliertest__step--reject' : '',
          }));
        } else if (id === 'tukey-iqr') {
          metrics = [
            mc(fmt(M.q1, 4), _t('symQ1'), 'q1'),
            mc(fmt(M.median, 4), _t('median'), 'median'),
            mc(fmt(M.q3, 4), _t('symQ3'), 'q3'),
            mc(fmt(M.iqr, 4), _t('symIqr'), 'iqr'),
            mc(fmt(M.fenceLower, 4), _t('fenceLower'), 'fenceLower'),
            mc(fmt(M.fenceUpper, 4), _t('fenceUpper'), 'fenceUpper'),
          ];
        } else if (id === 'hampel') {
          metrics = [
            mc(fmt(M.median, 4), _t('median'), 'median'),
            mc(fmt(M.mad, 4), _t('symMad'), 'mad'),
            mc(fmt(M.madScaled, 4), _t('symMadScaled'), 'madScaled'),
            mc(fmt(M.k, 2), _t('symK'), 'k'),
            mc(fmt(M.threshold, 4), _t('threshold'), 'threshold'),
          ];
          if (r.degenerate) hint = _t('hintDegenerateMad');
        } else if (id === 'z-score') {
          metrics = [
            mc(fmt(M.mean, 4), _t('common.sym.xbar'), 'mean'),
            mc(fmt(M.sd, 4), _t('symS'), 'sd'),
            mc(fmt(M.threshold, 2), _t('threshold'), 'threshold'),
          ];
          if (r.degenerate) hint = _t('hintDegenerateSd');
        } else if (id === 'modified-z') {
          metrics = [
            mc(fmt(M.median, 4), _t('median'), 'median'),
            mc(fmt(M.mad, 4), _t('symMad'), 'mad'),
            mc(fmt(M.threshold, 2), _t('threshold'), 'threshold'),
          ];
          if (r.degenerate) hint = _t('hintDegenerateMad');
        }

        const chips = [];
        if (k > 0) {
          for (const o of r.outliers.slice(0, 12)) {
            chips.push({
              text: `#${  o.index + 1  }: ${  fmt(o.value, 4)}`,
              // Leading space inside the chip-stat span (legacy had it as a
              // separate text node before the span; visually identical).
              stat: o.statistic != null ? ` (${  fmt(o.statistic, 3)  })` : '',
              moreClass: '',
            });
          }
          if (r.outliers.length > 12) {
            chips.push({
              text: `+${  r.outliers.length - 12}`,
              stat: '',
              moreClass: 'outliertest__chip--more',
            });
          }
        }

        return {
          isError: false,
          cardClass: '',
          label,
          algoId: ALGO_LAB_IDS[id] || '',
          verdictIcon,
          verdictText,
          verdictClass,
          metrics,
          chips,
          steps,
          stepsHeader,
          hint,
        };
      },

      /**
       * Build the structured data for an error card.
       * @param {string} id
       * @param {string} msg
       * @returns {object}
       */
      _buildErrorCard(id, msg) {
        const key = LABEL_KEY_MAP[id] || 'Grubbs';
        return {
          isError: true,
          cardClass: 'outliertest__card--error',
          label: _t(`m${  key}`),
          algoId: ALGO_LAB_IDS[id] || '',
          errorText: `${_t('errInapplicable')}: ${_errText(_t, msg)}`,
        };
      },

      /**
       * Build all reactive panel data, then mount the chart.
       * @param {number[]} data
       * @param {object} results
       * @param {object} errs
       */
      _renderResults(data, results, errs) {
        const resEl = module._container.querySelector('[data-ref="results"]');
        const phEl = module._container.querySelector('[data-ref="placeholder"]');
        if (!resEl) return;
        phEl.style.display = 'none';
        resEl.style.display = 'block';

        const colName = this.model.colRef
          ? getColumnName(module._context.stateManager, this.model.colRef)
          : _t('untitledColumn');

        // Union of flagged indices across enabled methods
        const flagsByIndex = new Map();
        for (const [id, r] of Object.entries(results)) {
          if (!r || !r.outliers) continue;
          for (const o of r.outliers) {
            if (!flagsByIndex.has(o.index)) flagsByIndex.set(o.index, new Set());
            flagsByIndex.get(o.index).add(id);
          }
        }
        const flaggedIdxs = [...flagsByIndex.keys()].sort((a, b) => a - b);
        const totalFlagged = flaggedIdxs.length;

        // ── Summary KPIs
        this.summaryKpis = [
          { value: String(data.length), label: _t('common.sym.n'), help: HELP + 'Result.n', kpiClass: '', valueClass: '' },
          { value: colName, label: _t('column'), help: 'modules.outlier-test.actions.setColumn.help', kpiClass: '', valueClass: 'dmike-kpi-value--sm' },
          { value: String(totalFlagged), label: _t('flaggedAny'), help: HELP + 'Result.flaggedIdxs', kpiClass: totalFlagged > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good', valueClass: '' },
          { value: String(Object.keys(results).length), label: _t('methodsRun'), help: HELP + 'Result.methods', kpiClass: '', valueClass: '' },
        ];

        // ── Chart method selector
        const enabled = new Set(this.model.enabled);
        const availableForChart = ALL_METHODS.filter(
          (id) => enabled.has(id) && results[id] && (results[id].outliers && results[id].outliers.length > 0)
        );
        if (this.model.chartMethod !== 'all' && !availableForChart.includes(this.model.chartMethod)) {
          this.model.chartMethod = 'all';
        }
        const seg = (val, label) => ({
          val,
          label,
          activeClass: this.model.chartMethod === val ? 'btn--active' : '',
        });
        const segs = [seg('all', _t('chartMethodAll'))];
        for (const mid of availableForChart) {
          const key = LABEL_KEY_MAP[mid] || 'Grubbs';
          segs.push(seg(mid, _t(`m${  key}`)));
        }
        this.chartSegs = segs;

        // ── Per-method cards
        const cards = [];
        for (const id of ALL_METHODS) {
          if (!enabled.has(id)) continue;
          if (errs[id]) {
            cards.push(this._buildErrorCard(id, errs[id]));
          } else if (results[id]) {
            cards.push(this._buildMethodCard(id, results[id]));
          }
        }
        this.methodCards = cards;

        // ── Combined flagged-points table
        const cols = ALL_METHODS.filter((id) => enabled.has(id) && results[id]);
        this.flaggedHeaders = cols.map((id) => {
          const key = LABEL_KEY_MAP[id] || id;
          return { short: SHORT_LABEL_MAP[id] || id, title: _t(`m${  key}`) };
        });
        this.flaggedRows = flaggedIdxs.map((idx) => {
          const flags = flagsByIndex.get(idx);
          return {
            idx: String(idx + 1),
            value: fmt(data[idx], 4),
            count: String(flags.size),
            cells: cols.map((id) => flags.has(id)
              ? { flagged: true, cls: 'outliertest__flag' }
              : { flagged: false, cls: 'outliertest__no-flag' }),
          };
        });
        this.flaggedShow = totalFlagged > 0;

        // Stash render context so the chart-method @click handler can re-plot.
        this._chartCtx = { data, colName, results, flaggedIdxs };

        this.panelShow = true;

        // Render chart — initial render reflects the saved selection.
        this._plotForMethod(this.model.chartMethod);
      },

      /** Indices to plot for a given chart-method selection. */
      _idxsForMethod(method) {
        const { results, flaggedIdxs } = this._chartCtx;
        if (method === 'all') return flaggedIdxs;
        return (results[method] && results[method].outliers)
          ? results[method].outliers.map((o) => o.index)
          : [];
      },

      /** Render the chart for the given method using the stashed context. */
      _plotForMethod(method) {
        const { data, colName, results } = this._chartCtx;
        this._renderChart(data, this._idxsForMethod(method), colName, method, results);
      },

      /**
       * Chart-method segmented button @click handler.
       * @noagent DOM event handler; the agent uses setChartMethod()
       */
      selectChartMethod(method) {
        this.setChartMethod(method);
      },

      // ── Chart ─────────────────────────────────────────────────

      _destroyChart() {
        if (this._chart && module._context && module._context.chartManager) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
        }
        this._chart = null;
      },

      /**
       * Resolve the [data-ref="chart"] anchor that lives inside the x-if
       * results template — Alpine may materialise it across several reactive
       * flush cycles, so poll (bounded) until it exists. Aborts if a newer
       * render started (stale _renderGen).
       * @param {string} selector
       * @param {number} gen
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container && module._container.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      async _renderChart(data, flaggedIdxs, colName, chartMethod = 'all') {
        this._destroyChart();

        const gen = ++this._renderGen;
        const chartEl = await this._whenAnchor('[data-ref="chart"]', gen);
        if (!chartEl) return;
        chartEl.replaceChildren();

        const flagged = new Set(flaggedIdxs);
        const inliers = [];
        const outliers = [];
        for (let i = 0; i < data.length; i++) {
          (flagged.has(i) ? outliers : inliers).push(data[i]);
        }

        const methodLabel = chartMethod === 'all'
          ? _t('chartMethodAll')
          : _t(`m${  LABEL_KEY_MAP[chartMethod] || 'Grubbs'}`);

        const groups = [
          { name: _t('groupInliers'), values: inliers },
        ];
        if (outliers.length > 0) {
          groups.push({ name: `${_t('groupOutliers')} — ${methodLabel}`, values: outliers });
        }

        try {
          const chart = await module._context.chartManager.create(chartEl, 'individual-value-plot', {
            title: _t('chartTitle', { col: colName, method: methodLabel }),
            xLabel: '',
            yLabel: colName,
            showLegend: outliers.length > 0,
            showXTicks: false,
            showMean: true,
            showMedian: true,
            connectMeans: false,
            showOverallMean: false,
            jitter: 0.6,
            groups,
            pointColors: outliers.length > 0
              ? ['var(--color-accent)', 'var(--color-error)']
              : ['var(--color-accent)'],
            pointSize: 6,
          });
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._chart = chart;
        } catch (e) {
          if (gen === this._renderGen) {
            this._showError(e.message || _t('errChart'));
          }
        }
      },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Spalten und Ergebnis
       */
      read(options) {
        return readAgentState('outlier-test', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          chartMethodOptions: this.chartMethodOptions(),
          result: this.result,
          errorMsg: this.errorMsg,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return [...PARAM_KEYS];
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        return [...COLUMN_SLOTS];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return { value: pickableColumnList(sm, SLOT_FILTERS.value) };
      },

      /** @noagent derived set; der Agent liest sie über read().chartMethodOptions */
      chartMethodOptions() {
        return ['all', ...this.chartSegs.map(s => s.val).filter(v => v !== 'all')];
      },

      /** @noagent view transform; die Auswahl rendert aus VALID_SIDES */
      sideOptions() {
        return VALID_SIDES.map(v => ({ value: v, label: _t(SIDE_LABEL_KEYS[v]) }));
      },

      /**
       * Einen Parameter setzen; die Analyse läuft danach neu.
       * @agent
       * @param {keyof Params} key welcher Parameter
       * @param {number|string|string[]|null} value der Wert; Bereich je Schlüssel siehe `Params`; `side`: `'two-sided'`, `'upper'` oder `'lower'`; `enabled`: Liste von Methoden-ids; `esdMaxOutliers`: ganze Zahl oder `null` für automatisch
       * @returns {void}
       * @throws {Error} wenn `key` kein Parameter dieses Moduls ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this.runAnalysis();
      },

      /**
       * Die Messwertspalte wählen; die Analyse läuft danach neu.
       * @agent
       * @param {'value'} slot der Slot; dieses Modul führt nur `value`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._picker?.syncValue(null);
          this.runAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._picker?.syncValue(clean);
        this.runAnalysis();
      },

      /**
       * Wählt, welche Methode das Diagramm hervorhebt.
       * @agent
       * @param {string} method `'all'` oder eine Methode aus chartMethodOptions
       * @returns {void}
       * @throws {Error} wenn die Methode im aktuellen Ergebnis nichts markiert hat
       */
      setChartMethod(method) {
        requireEnum('method', method, this.chartMethodOptions());
        this.model.chartMethod = method;
        for (const s of this.chartSegs) s.activeClass = s.val === method ? 'btn--active' : '';
        if (this.panelShow) this._plotForMethod(method);
      },

      // ── Alpine lifecycle ──────────────────────────────────────

      /** @noagent lifecycle */
      init() {
        this._unsubs = [];
        this._renderGen = 0;

        // Resolve alpha from global settings if not yet persisted
        if (this.model.alpha == null) {
          const globalConf = (module._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
          this.model.alpha = Number((1 - globalConf).toFixed(4));
        }

        this._mountPicker();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._picker && this._picker.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          this.runAnalysis();
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
        if (this._picker) { this._picker.destroy(); this._picker = null; }
      },
    };
  },
});

/**
 * Custom loadExample: outlier-test examples ship a full worksheet
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by examples-registry)
 * and use the literal placeholder `__source__` as `colRef.instanceId`.
 * On load: provision a fresh worksheet, rewrite the placeholder, apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['colRef']),
  });
};

export default mod;
