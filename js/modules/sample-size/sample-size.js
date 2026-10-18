/**
 * D.Mike — Sample Size Module (sample-size.js)
 * Analyze phase: calculate required sample sizes for variance and mean tests.
 *
 * Migrated to createModule + Alpine CSP. The Model holds all persisted inputs.
 * The analysis result is derived transiently in the view layer from those inputs.
 * The power curve chart is mounted imperatively (msa-typ1 pattern):
 *   - mount in init() / data-Fn lifecycle
 *   - dispose in destroy()
 *   - _renderGen stale-guard before await chartManager.create
 *   - _unsubs for event-bus subscriptions (theme:changed → re-render)
 *
 * Spec: docs/modules/SAMPLE-SIZE.md
 *
 * @agent  Steuerbar über das Viewmodel: alle Eingaben (setParam) und das
 *   Rechnen selbst (runAnalysis). Gelesen wird über read() mit erklärter
 *   Lesefläche (AgentRead) — Eingaben, die im aktuellen Zustand gültigen
 *   Schlüssel und das Ergebnis. Der Agent bekommt Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireEnum, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import {
  State, VALID_CATEGORIES, VALID_TEST_TYPES, VALID_DIRECTIONS,
} from './sample-size-model.js';
import {
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT,
  findRequiredN,
} from '../../engines/hypothesis-test-engine.js';
/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

/** Map category + testType to the underlying Algorithm Lab ID. */
function resolveAlgoId(category, testType) {
  if (category === 'variance') return testType === 'two' ? 'f-test' : 'chi-square-variance';
  return testType === 'two' ? 'two-sample-t-test' : 'one-sample-t-test';
}

/**
 * Zulässige Bereiche von alpha und power (einzige Quelle für Setter und Oberfläche).
 * Nicht enger als das, was die Einstellungen säen können (settings.js clampConfPower:
 * Konfidenz bis 99,99 % → alpha 0.0001, power bis 0.9999).
 */
const ALPHA_RANGE = { min: 0.0001, max: 0.5 };
const POWER_RANGE = { min: 0.5, max: 0.9999 };

/** Die Parameter, die `setParam` annimmt. */
const PARAM_KEYS = ['category', 'testType', 'direction', 'alpha', 'power',
  'sigma0', 'sigmaAlt', 'ratio', 'delta', 'sigma'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  category: (v) => { requireEnum('value', v, VALID_CATEGORIES); return v; },
  testType: (v) => { requireEnum('value', v, VALID_TEST_TYPES); return v; },
  direction: (v) => { requireEnum('value', v, VALID_DIRECTIONS); return v; },
  alpha: (v) => requireNumber('value', v, ALPHA_RANGE),
  power: (v) => requireNumber('value', v, POWER_RANGE),
  sigma0: (v) => requireText('value', v),
  sigmaAlt: (v) => requireText('value', v),
  ratio: (v) => requireText('value', v),
  delta: (v) => requireText('value', v),
  sigma: (v) => requireText('value', v),
};

/**
 * Setzt einen Wert unter einem Schlüssel in `obj`. Lokal geschrieben, weil der
 * Generator (agent-data) Importe nicht liest und die Schreibstelle im Modul
 * selbst sehen muss.
 * @param {object} obj Wurzel, deren Schlüssel beschrieben wird
 * @param {string} key Schlüssel
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  obj[key] = value;
}

/** Beschriftungsschlüssel der Richtungsauswahl. */
const DIRECTION_LABEL_METHODS = {
  'two-sided': 'directionTwoSidedLabel',
  greater: 'directionGreaterLabel',
  less: 'directionLessLabel',
};

/** Präfix der Hilfeschlüssel, die die Kennzahlkacheln tragen. */
const HELP = 'modules.sample-size.types.';

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'variance'|'mean'} category  Varianz oder Mittelwert
 * @property {'one'|'two'} testType  eine oder zwei Stichproben
 * @property {'two-sided'|'greater'|'less'} direction  Alternativhypothese
 * @property {number} alpha  Signifikanzniveau
 * @property {number} power  Ziel-Teststärke
 * @property {string} [sigma0]  Standardabweichung unter H₀
 * @property {string} [sigmaAlt]  erwartete Standardabweichung
 * @property {string} [ratio]  Varianzverhältnis
 * @property {string} [delta]  Mittelwertdifferenz
 * @property {string} [sigma]  Standardabweichung
 */

/**
 * Der benötigte Stichprobenumfang (`_calculate()`), wie `read().result` ihn liefert.
 *
 * @typedef {object} Result
 * @property {number} nRequired  Umfang je Gruppe
 * @property {number} totalN  Gesamtumfang
 * @property {number} alpha  Signifikanzniveau
 * @property {number} power  Ziel-Teststärke
 * @property {string} effectLabel  Name der Effektgröße
 * @property {number} effectValue  Effektgröße
 * @property {'chi-square-variance'|'f-test'|'one-sample-t-test'|'two-sample-t-test'} algoId  Verfahren
 */

/**
 * Die Agenten-Lesefläche von Sample Size.
 *
 * Das Model hält die zehn Eingaben flach; das Ergebnis entsteht transient im
 * Viewmodel. Darum erklärt dieses Modul seine Lesefläche: die persistierte
 * Form plus die gültigen Schlüssel und das Ergebnis.
 *
 * @typedef {object} AgentRead
 * @property {'variance'|'mean'} category  which kind of test the sample size is for
 * @property {'one'|'two'} testType  one-sample or two-sample test
 * @property {'two-sided'|'greater'|'less'} direction  the alternative hypothesis
 * @property {number|null} alpha  significance level; null until resolved from the settings
 * @property {number|null} power  target power (1 − β); null until resolved from the settings
 * @property {string} sigma0  hypothesized standard deviation σ₀, as entered (one-sample variance)
 * @property {string} sigmaAlt  expected standard deviation σ₁, as entered (one-sample variance)
 * @property {string} ratio  variance ratio σ²₁/σ²₂, as entered (two-sample variance)
 * @property {string} delta  mean difference Δ, as entered (mean tests)
 * @property {string} sigma  standard deviation σ, as entered (mean tests)
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {Result|null} result  the required sample size with key figures, or null while the inputs are incomplete or not positive numbers
 */
export default createModule({
  config: {
    id: 'sample-size',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.sample-size',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {object|null} — current chart instance */
      _chart: null,
      /** Stale-render guard: incremented before each async chart.create */
      _renderGen: 0,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],

      // ── Results panel (declarative — structured reactive data) ──
      /** Whether the results panel is shown. */
      resultShow: false,
      /** Summary box <strong> text (required-n line). */
      summaryStrong: '',
      /** Summary box <p> text (explanatory sentence). */
      summaryText: '',
      /** @type {Array<{value:string, label:string, mod:string}>} KPI cells. */
      kpiCells: [],
      /** Algorithm-Lab id bound to the curve-section link button. */
      curveAlgoId: '',
      /**
       * The calculation outcome the agent reads; null while the inputs are incomplete or not positive numbers.
       * @type {{nRequired:number,totalN:number,alpha:number,power:number,effectLabel:string,effectValue:number,algoId:string}|null}
       */
      result: null,

      // ── Label helpers (Unicode characters via data-Fn per alpine.md §3) ──

      /**
       * σ² Varianzen
       * @noagent view transform
       */
      catVarianceLabel() { return `σ² ${  _t('catVariance')}`; },
      /**
       * μ Mittelwerte
       * @noagent view transform
       */
      catMeanLabel() { return `μ ${  _t('catMean')}`; },

      /**
       * "≠ Zweiseitig" option text
       * @noagent view transform
       */
      directionTwoSidedLabel() { return `≠ ${  _t('twoSided')}`; },
      /**
       * "> Größer"
       * @noagent view transform
       */
      directionGreaterLabel() { return `> ${  _t('greater')}`; },
      /**
       * "< Kleiner"
       * @noagent view transform
       */
      directionLessLabel() { return `< ${  _t('less')}`; },

      /**
       * "Soll-Standardabw. (σ₀)"
       * @noagent view transform
       */
      hypothesizedStdLabel() { return `${_t('hypothesizedStd')  } (σ₀)`; },
      /**
       * "Erw. Standardabw. (σ₁)"
       * @noagent view transform
       */
      expectedStdLabel() { return `${_t('expectedStd')  } (σ₁)`; },
      /**
       * "Varianzverhältnis (σ²₁ / σ²₂)"
       * @noagent view transform
       */
      varianceRatioLabel() { return `${_t('varianceRatio')  } (σ²₁ / σ²₂)`; },
      /**
       * "Differenz (Δ)"
       * @noagent view transform
       */
      meanDifferenceLabel() { return `${_t('meanDifference')  } (Δ)`; },
      /**
       * "Standardabw. (σ)"
       * @noagent view transform
       */
      stdDevLabel() { return `${_t('stdDev')  } (σ)`; },
      /**
       * "Ziel-Power (1 − β)"
       * @noagent view transform
       */
      targetPowerLabel() { return `${_t('targetPower')  } (1 − β)`; },

      // ── Visibility helpers ────────────────────────────────────

      /**
       * @returns {boolean}
       * @noagent helper; der Agent liest die Kategorie über read().category
       */
      isVar() { return this.model.category === 'variance'; },
      /**
       * @returns {boolean}
       * @noagent helper; der Agent liest den Testtyp über read().testType
       */
      isTwoSample() { return this.model.testType === 'two'; },

      // ── CSS class helpers ─────────────────────────────────────

      /**
       * @param {string} cat @returns {string}
       * @noagent view transform
       */
      catActiveClass(cat) { return this.model.category === cat ? 'btn--active' : ''; },
      /**
       * @param {string} type @returns {string}
       * @noagent view transform
       */
      typeActiveClass(type) { return this.model.testType === type ? 'btn--active' : ''; },

      // ── Event handlers ────────────────────────────────────────

      /**
       * Switch category (button click) and recalculate.
       * @noagent DOM event handler; the agent uses setParam()
       */
      setCategory(cat) {
        this.setParam('category', cat);
      },

      /**
       * Switch test type (button click) and recalculate.
       * @noagent DOM event handler; the agent uses setParam()
       */
      setTestType(type) {
        this.setParam('testType', type);
      },

      /**
       * Power input: clamp to the allowed range, then recalculate.
       * @noagent DOM event handler; the agent uses setParam()
       */
      powerChanged(event) {
        const val = parseFloat(event.target.value);
        if (!isNaN(val)) {
          this.setParam('power', Math.min(POWER_RANGE.max, Math.max(POWER_RANGE.min, val)));
        } else {
          this.runAnalysis();
        }
      },

      /**
       * Alpha input: goes through setParam. While typing (input) a refused
       * value is skipped so half-typed text is not disturbed; on commit
       * (change) a refusal resets the field to the model value.
       * @noagent DOM event handler; the agent uses setParam()
       */
      alphaChanged(event) {
        try {
          PARAM_CHECKS.alpha(event.target.value);
        } catch {
          if (event.type === 'change') event.target.value = this.model.alpha;
          return;
        }
        this.setParam('alpha', event.target.value);
      },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Eingaben, gültige Schlüssel und Ergebnis
       */
      read(options) {
        return readAgentState('sample-size', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          result: this.result,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        const keys = ['category', 'testType', 'direction', 'alpha', 'power'];
        if (this.isVar() && !this.isTwoSample()) keys.push('sigma0', 'sigmaAlt');
        if (this.isVar() && this.isTwoSample()) keys.push('ratio');
        if (!this.isVar()) keys.push('delta', 'sigma');
        return keys;
      },

      /** @noagent view transform; die Auswahl rendert aus VALID_DIRECTIONS */
      directionOptions() {
        return VALID_DIRECTIONS.map(v => ({ value: v, label: this[DIRECTION_LABEL_METHODS[v]]() }));
      },

      /**
       * Einen Eingabewert setzen; die Berechnung läuft danach neu.
       * @agent
       * @param {keyof Params} key welcher Parameter; die im aktuellen Zustand zulässigen nennt activeParams
       * @param {string|number} value der neue Wert; Auswahlfelder nehmen einen Eintrag der Liste, alpha und power eine Zahl im Bereich, die übrigen einen Text
       * @returns {void}
       * @throws {Error} wenn `key` im aktuellen Zustand nicht gilt oder `value` nicht zulässig ist
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this.runAnalysis();
      },

      /**
       * Die Berechnung mit den aktuellen Eingaben ausführen. Bei unvollständigen
       * Eingaben oder Werten, die keine positiven Zahlen sind, bleibt result null.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this._calculate();
      },

      // ── Calculation ───────────────────────────────────────────

      /**
       * Run the power/sample-size calculation and render results.
       * Mirrors legacy _calculate() exactly.
       */
      _calculate() {
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }

        const resEl = module._container.querySelector('[data-ref="results"]');
        const phEl  = module._container.querySelector('[data-ref="placeholder"]');

        const alpha = this.model.alpha;
        const power = this.model.power;
        const dir   = this.model.direction;
        const isVar = this.model.category === 'variance';
        const isTwo = this.model.testType === 'two';

        let nRequired, powerFn, effLabel, effValue;

        if (isVar) {
          if (isTwo) {
            const ratio = parseFloat(this.model.ratio);
            if (isNaN(ratio) || ratio <= 0) { this._hideResults(resEl, phEl); return; }
            effLabel = _t('varianceRatio');
            effValue = ratio;
            powerFn = (n) => powerFTest(n, n, ratio, alpha, dir);
            nRequired = findRequiredN(power, powerFn);
          } else {
            const s0 = parseFloat(this.model.sigma0);
            const s1 = parseFloat(this.model.sigmaAlt);
            if (isNaN(s0) || s0 <= 0 || isNaN(s1) || s1 <= 0) { this._hideResults(resEl, phEl); return; }
            const sigma0Sq = s0 * s0;
            const sigmaAltSq = s1 * s1;
            effLabel = _t('varianceRatio');
            effValue = sigmaAltSq / sigma0Sq;
            powerFn = (n) => powerChiSquare(n, sigma0Sq, sigmaAltSq, alpha, dir);
            nRequired = findRequiredN(power, powerFn);
          }
        } else {
          const delta = parseFloat(this.model.delta);
          const sigma = parseFloat(this.model.sigma);
          if (isNaN(delta) || delta <= 0 || isNaN(sigma) || sigma <= 0) { this._hideResults(resEl, phEl); return; }
          effLabel = "Cohen's d";
          effValue = delta / sigma;

          if (isTwo) {
            powerFn = (n) => powerTwoSampleT(n, n, delta, sigma, alpha, dir);
            nRequired = findRequiredN(power, powerFn);
          } else {
            powerFn = (n) => powerOneSampleT(n, delta, sigma, alpha, dir);
            nRequired = findRequiredN(power, powerFn);
          }
        }

        // Build power curve for chart
        const curvePoints = this._buildPowerCurve(powerFn, nRequired);

        this.result = {
          nRequired,
          totalN: isTwo ? nRequired * 2 : nRequired,
          alpha,
          power,
          effectLabel: effLabel,
          effectValue: effValue,
          algoId: resolveAlgoId(this.model.category, this.model.testType),
        };

        this._renderResults(nRequired, effLabel, effValue, curvePoints, isTwo);
      },

      /**
       * Build power-vs-n curve points.
       * @param {Function} powerFn
       * @param {number} nReq
       * @returns {Array<{n: number, power: number}>}
       */
      _buildPowerCurve(powerFn, nReq) {
        const nMax = Math.min(5000, Math.max(nReq * 2, 30));
        const nSet = new Set();

        // Dense points for smooth chart curve
        const step = Math.max(1, Math.round(nMax / 80));
        for (let n = 4; n <= nMax; n += step) nSet.add(n);
        // Always include the solution
        if (nReq < 5000) nSet.add(nReq);
        nSet.add(nMax);

        // Additional table landmarks
        for (const n of [4, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000]) {
          if (n <= nMax) nSet.add(n);
        }
        if (nReq > 5 && nReq < 5000) {
          nSet.add(Math.max(4, Math.round(nReq * 0.5)));
          nSet.add(Math.max(4, Math.round(nReq * 0.75)));
        }

        const sorted = [...nSet].sort((a, b) => a - b);
        return sorted.map(n => ({ n, power: powerFn(n) }));
      },

      // ── Results rendering (declarative — structured reactive data) ──
      //
      // Summary box, KPI strip and curve-section header are assigned as
      // reactive fields (resultShow / summaryStrong / summaryText / kpiCells /
      // curveAlgoId) and rendered by the Alpine template. KPI cells carry RAW
      // text (x-text escapes structurally — never esc()'d here). Number
      // formatting matches the legacy string output exactly. The power-curve
      // chart stays an imperative chartManager mount into the templated
      // [data-ref="power-chart"] host (sanctioned chart tier).

      /**
       * Build summary/KPI reactive data, then mount the power-curve chart.
       * @param {number} nRequired
       * @param {string} effLabel
       * @param {number} effValue
       * @param {Array} curvePoints
       * @param {boolean} isTwo
       */
      async _renderResults(nRequired, effLabel, effValue, curvePoints, isTwo) {
        this._destroyChart();

        const phEl = module._container.querySelector('[data-ref="placeholder"]');
        const resEl = module._container.querySelector('[data-ref="results"]');
        if (phEl) phEl.style.display = 'none';
        if (resEl) resEl.style.display = 'block';

        const alpha = this.model.alpha;
        const power = this.model.power;
        const powerPct = (power * 100).toFixed(0);
        const nLabel = nRequired >= 5000 ? '> 5.000' : nRequired;
        const nOverflow = nRequired >= 5000;

        const perGroupSuffix = isTwo ? ` (${  _t('perGroup')  })` : '';

        // Summary box (raw text — x-text escapes structurally).
        this.summaryStrong = `${_t('requiredN') + perGroupSuffix  }: ${  nLabel}`;
        this.summaryText = nOverflow
          ? _t('nOverflow')
          : _t('resultSummary').replace('{n}', nRequired).replace('{power}', powerPct).replace('{alpha}', alpha);

        // KPI strip cells (same order + formatting as the legacy markup).
        const cells = [
          { value: String(nLabel), label: _t('requiredN') + perGroupSuffix, mod: 'dmike-kpi--good', help: `${HELP}Result.nRequired` },
          { value: `${powerPct  }%`, label: _t('targetPower'), mod: '', help: `${HELP}Result.power` },
          { value: String(alpha), label: 'α', mod: '', help: `${HELP}Result.alpha` },
          { value: fmt(effValue, 3), label: effLabel, mod: '', help: `${HELP}Result.effectValue` },
        ];
        if (isTwo) {
          cells.push({ value: nOverflow ? '> 10.000' : String(nRequired * 2), label: _t('totalN'), mod: '', help: `${HELP}Result.totalN` });
        }
        this.kpiCells = cells;

        this.curveAlgoId = resolveAlgoId(this.model.category, this.model.testType);
        this.resultShow = true;

        // Render chart with stale-render guard. The host lives inside the
        // x-if template, so wait (bounded) for Alpine to materialise it.
        if (module._context.chartManager) {
          const xVals = curvePoints.map(p => p.n);
          const yVals = curvePoints.map(p => p.power * 100);
          const solX = nRequired < 5000 ? [nRequired] : [];
          const solY = nRequired < 5000 ? [power * 100] : [];

          const gen = ++this._renderGen;
          const chartEl = await this._whenAnchor('[data-ref="power-chart"]', gen);
          if (!chartEl) return;
          const chart = await module._context.chartManager.create(chartEl, 'scatter', {
            title: _t('sectionCurve'),
            xLabel: `n${  isTwo ? ` (${  _t('perGroup')  })` : ''}`,
            yLabel: `${_t('power')  } (%)`,
            showLegend: false,
            xMin: 0,
            yMin: 0,
            yMax: 100,
            yDec: 0,
            xDec: 0,
            refLines: [
              {
                dir: 'h',
                value: power * 100,
                label: `${_t('targetPower')  }: ${  powerPct  }%`,
                dash: 'dash',
                width: 1.5,
                color: 'var(--color-error)',
              },
            ],
            series: [
              {
                name: _t('power'),
                color: 'var(--color-chart-1)',
                markerSize: 3,
                strokeWidth: 0.5,
                x: xVals,
                y: yVals,
                symbol: 'circle',
                connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)' },
              },
              ...(solX.length ? [{
                name: `n = ${  nRequired}`,
                color: 'var(--color-accent)',
                markerSize: 8,
                strokeWidth: 2,
                x: solX,
                y: solY,
                symbol: 'diamond',
              }] : []),
            ],
          });

          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }

          this._chart = chart;
        }
      },

      /**
       * Hide results, show placeholder, destroy chart, clear reactive data.
       * Bumps _renderGen so any in-flight chart-anchor poll aborts.
       * @param {Element} resEl
       * @param {Element} phEl
       */
      _hideResults(resEl, phEl) {
        this._renderGen++;
        this._destroyChart();
        this.resultShow = false;
        this.result = null;
        this.kpiCells = [];
        this.summaryStrong = '';
        this.summaryText = '';
        if (resEl) resEl.style.display = 'none';
        if (phEl) phEl.style.display = '';
      },

      /** Destroy the current chart instance. */
      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      /**
       * Resolve a [data-ref] anchor that lives inside an x-if template — Alpine
       * may materialise it across several reactive flush cycles, so poll
       * (bounded) until it exists. Aborts if a newer render started.
       * @param {string} selector
       * @param {number} gen
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /**
       * Navigate to the Algorithm Lab entry for the current test.
       * @param {Event} event
       * @noagent navigation
       */
      openAlgoLab(event) {
        if (event) event.preventDefault();
        if (this.curveAlgoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId: this.curveAlgoId, tab: 'docs' });
        }
      },

      // ── Alpine component lifecycle ────────────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance transient state
        this._chart = null;
        this._renderGen = 0;
        this._unsubs = [];
        this.resultShow = false;
        this.result = null;
        this.kpiCells = [];
        this.summaryStrong = '';
        this.summaryText = '';
        this.curveAlgoId = '';

        // Apply global defaults for alpha / power if not persisted
        const globalConf = (module._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        const globalPower = (module._context.stateManager.get('settings.power') ?? 80) / 100;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));
        if (this.model.power == null) this.model.power = globalPower;

        const eb = module._context.eventBus;

        // Re-render chart on theme change
        const onTheme = () => {
          const resEl = module._container.querySelector('[data-ref="results"]');
          if (resEl && resEl.style.display !== 'none') {
            // Re-run calculation to re-draw chart with new theme colors
            this._calculate();
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial calculation if state was restored
        this._calculate();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
      },
    };
  },
});
