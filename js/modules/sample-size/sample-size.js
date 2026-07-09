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
 */

import { createModule } from '../../core/template-module.js';
import { State } from './sample-size-model.js';
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

export default createModule({
  config: {
    id: 'sample-size',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'hash',
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

      // ── Label helpers (Unicode characters via data-Fn per alpine.md §3) ──

      /** σ² Varianzen */
      catVarianceLabel() { return `σ² ${  _t('catVariance')}`; },
      /** μ Mittelwerte */
      catMeanLabel() { return `μ ${  _t('catMean')}`; },

      /** "≠ Zweiseitig" option text */
      directionTwoSidedLabel() { return `≠ ${  _t('twoSided')}`; },
      /** "> Größer" */
      directionGreaterLabel() { return `> ${  _t('greater')}`; },
      /** "< Kleiner" */
      directionLessLabel() { return `< ${  _t('less')}`; },

      /** "Soll-Standardabw. (σ₀)" */
      hypothesizedStdLabel() { return `${_t('hypothesizedStd')  } (σ₀)`; },
      /** "Erw. Standardabw. (σ₁)" */
      expectedStdLabel() { return `${_t('expectedStd')  } (σ₁)`; },
      /** "Varianzverhältnis (σ²₁ / σ²₂)" */
      varianceRatioLabel() { return `${_t('varianceRatio')  } (σ²₁ / σ²₂)`; },
      /** "Differenz (Δ)" */
      meanDifferenceLabel() { return `${_t('meanDifference')  } (Δ)`; },
      /** "Standardabw. (σ)" */
      stdDevLabel() { return `${_t('stdDev')  } (σ)`; },
      /** "Ziel-Power (1 − β)" */
      targetPowerLabel() { return `${_t('targetPower')  } (1 − β)`; },

      // ── Visibility helpers ────────────────────────────────────

      /** @returns {boolean} */
      isVar() { return this.model.category === 'variance'; },
      /** @returns {boolean} */
      isTwoSample() { return this.model.testType === 'two'; },

      // ── CSS class helpers ─────────────────────────────────────

      /** @param {string} cat @returns {string} */
      catActiveClass(cat) { return this.model.category === cat ? 'btn--active' : ''; },
      /** @param {string} type @returns {string} */
      typeActiveClass(type) { return this.model.testType === type ? 'btn--active' : ''; },

      // ── Event handlers ────────────────────────────────────────

      /** Switch category and recalculate. */
      setCategory(cat) {
        this.model.category = cat;
        this.autoCalc();
      },

      /** Switch test type and recalculate. */
      setTestType(type) {
        this.model.testType = type;
        this.autoCalc();
      },

      /** Power input: clamp to [0.5, 0.99] then recalculate. */
      powerChanged(event) {
        const val = parseFloat(event.target.value);
        if (!isNaN(val)) {
          this.model.power = Math.min(0.99, Math.max(0.5, val));
        }
        this.autoCalc();
      },

      /** Trigger calculation (save is handled by createModule's $watch). */
      autoCalc() {
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
          { value: String(nLabel), label: _t('requiredN') + perGroupSuffix, mod: 'dmike-kpi--good' },
          { value: `${powerPct  }%`, label: _t('targetPower'), mod: '' },
          { value: String(alpha), label: 'α', mod: '' },
          { value: fmt(effValue, 3), label: effLabel, mod: '' },
        ];
        if (isTwo) {
          cells.push({ value: nOverflow ? '> 10.000' : String(nRequired * 2), label: _t('totalN'), mod: '' });
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
       */
      openAlgoLab(event) {
        if (event) event.preventDefault();
        if (this.curveAlgoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId: this.curveAlgoId, tab: 'docs' });
        }
      },

      // ── Alpine component lifecycle ────────────────────────────

      init() {
        // Fresh per-instance transient state
        this._chart = null;
        this._renderGen = 0;
        this._unsubs = [];
        this.resultShow = false;
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

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
      },
    };
  },
});
