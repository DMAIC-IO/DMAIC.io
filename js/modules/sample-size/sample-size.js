/**
 * D.Mike — Sample Size Module (sample-size.js)
 * Analyze phase: calculate required sample sizes for variance and mean tests.
 *
 * Uses the power functions from hypothesis-test-engine.js to determine
 * the minimum n needed to detect a given effect at specified α and power.
 */

import {
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT,
  findRequiredN,
} from '../../engines/hypothesis-test-engine.js';
import { esc } from '../../core/html-utils.js';

function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '\u2013'; }

const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

/** Map category + testType to the underlying Algorithm Lab ID. */
function resolveAlgoId(category, testType) {
  if (category === 'variance') return testType === 'two' ? 'f-test' : 'chi-square-variance';
  return testType === 'two' ? 'two-sample-t-test' : 'one-sample-t-test';
}

export default {
  id: 'sample-size',
  phase: 'analyze',
  icon: 'hash',
  i18nKey: 'modules.sample-size',
  version: '1.0.0',

  _container: null,
  _context: null,
  _chart: null,

  // ── State ──
  _category: 'variance',   // 'variance' | 'mean'
  _testType: 'one',        // 'one' | 'two'
  _direction: 'two-sided', // 'two-sided' | 'greater' | 'less'
  _alpha: null,
  _power: null,

  // Variance inputs
  _sigma0: '',        // hypothesized σ (one-sample)
  _sigmaAlt: '',      // expected σ (one-sample)
  _ratio: '',         // σ₁²/σ₂² ratio (two-sample)

  // Mean inputs
  _delta: '',         // |μ − μ₀| or |μ₁ − μ₂|
  _sigma: '',         // known/estimated σ

  help: () => import('./sample-size-help.js'),

  // ─── Lifecycle ────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._category  = saved.category  || 'variance';
      this._testType  = saved.testType  || 'one';
      this._direction = saved.direction || 'two-sided';
      this._alpha     = saved.alpha     ?? null;
      this._power     = saved.power     ?? null;
      this._sigma0    = saved.sigma0    ?? '';
      this._sigmaAlt  = saved.sigmaAlt  ?? '';
      this._ratio     = saved.ratio     ?? '';
      this._delta     = saved.delta     ?? '';
      this._sigma     = saved.sigma     ?? '';
    }

    const globalConf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    const globalPower = (context.stateManager.get('settings.power') ?? 80) / 100;
    if (this._alpha == null) this._alpha = +(1 - globalConf).toFixed(4);
    if (this._power == null) this._power = globalPower;

    this._render();
  },

  async destroy() {
    this._destroyChart();
    this._container.innerHTML = '';
  },

  _destroyChart() {
    if (this._chart) {
      try { this._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
      this._chart = null;
    }
  },

  onLanguageChange() { this._render(); },
  onThemeChange() {},

  getState() {
    return {
      category:  this._category,
      testType:  this._testType,
      direction: this._direction,
      alpha:     this._alpha,
      power:     this._power,
      sigma0:    this._sigma0,
      sigmaAlt:  this._sigmaAlt,
      ratio:     this._ratio,
      delta:     this._delta,
      sigma:     this._sigma,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.category)  this._category  = data.category;
    if (data.testType)  this._testType  = data.testType;
    if (data.direction) this._direction = data.direction;
    if (data.alpha != null)    this._alpha    = data.alpha;
    if (data.power != null)    this._power    = data.power;
    if (data.sigma0 != null)   this._sigma0   = data.sigma0;
    if (data.sigmaAlt != null) this._sigmaAlt = data.sigmaAlt;
    if (data.ratio != null)    this._ratio    = data.ratio;
    if (data.delta != null)    this._delta    = data.delta;
    if (data.sigma != null)    this._sigma    = data.sigma;
    if (this._container) this._render();
  },

  /**
   * Load a catalog example. Parameter-only — no worksheet is provisioned.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasInputs = !!(this._sigma0 || this._sigmaAlt || this._ratio || this._delta || this._sigma);
    if (hasInputs && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Translation helper ───────────────────────────────────

  _t(k, v) { return this._context.i18n.t(`modules.sample-size.${k}`, v); },

  // ─── Main Render ──────────────────────────────────────────

  _render() {
    const t = (k, v) => this._t(k, v);
    this._destroyChart();

    this._container.innerHTML = `
      <div class="smpsize dmike-split">
        <div class="smpsize__input dmike-split__input">
          ${this._renderConfig(t)}
        </div>
        <div class="smpsize__output dmike-split__output">
          <div class="smpsize__placeholder" data-ref="placeholder"></div>
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  },

  // ─── Config Panel (left side) ─────────────────────────────

  _renderConfig(t) {
    const isVar  = this._category === 'variance';
    const isTwo  = this._testType === 'two';

    return `
      <div class="dmike-split__section-title">${t('sectionCategory')}</div>
      <div class="btn-group smpsize__toggle-row">
        <button class="btn--segment smpsize__toggle-btn${this._category === 'variance' ? ' btn--active' : ''}" data-cat="variance">\u03C3\u00B2 ${t('catVariance')}</button>
        <button class="btn--segment smpsize__toggle-btn${this._category === 'mean' ? ' btn--active' : ''}" data-cat="mean">\u03BC ${t('catMean')}</button>
      </div>

      <div class="dmike-split__section-title">${t('sectionTestType')}</div>
      <div class="btn-group smpsize__toggle-row">
        <button class="btn--segment smpsize__toggle-btn${this._testType === 'one' ? ' btn--active' : ''}" data-type="one">${t('oneSample')}</button>
        <button class="btn--segment smpsize__toggle-btn${this._testType === 'two' ? ' btn--active' : ''}" data-type="two">${t('twoSample')}</button>
      </div>

      <div class="dmike-split__section-title">${t('sectionEffect')}</div>
      ${isVar ? this._renderVarianceInputs(t, isTwo) : this._renderMeanInputs(t, isTwo)}

      <div class="dmike-split__section-title">${t('sectionParams')}</div>
      <div class="field-row">
        <div class="field-group field-group--major">
          <label>${t('direction')}</label>
          <select data-ref="direction" class="field">
            <option value="two-sided" ${this._direction === 'two-sided' ? 'selected' : ''}>\u2260 ${t('twoSided')}</option>
            <option value="greater" ${this._direction === 'greater' ? 'selected' : ''}>&gt; ${t('greater')}</option>
            <option value="less" ${this._direction === 'less' ? 'selected' : ''}>&lt; ${t('less')}</option>
          </select>
        </div>
        <div class="field-group field-group--minor">
          <label>\u03B1</label>
          <input type="number" data-ref="alpha" class="field field--num" min="0.001" max="0.5" value="${this._alpha}">
        </div>
      </div>
      <div class="field-group">
        <label>${t('targetPower')} (1 \u2212 \u03B2)</label>
        <input type="number" data-ref="power" class="field field--num" min="0.5" max="0.99" value="${this._power}">
      </div>

      <div class="smpsize__error" data-ref="error-box"></div>
    `;
  },

  _renderVarianceInputs(t, isTwo) {
    if (isTwo) {
      return `
        <div class="field-group">
          <label>${t('varianceRatio')} (\u03C3\u00B2\u2081 / \u03C3\u00B2\u2082)</label>
          <input type="number" data-ref="ratio" class="field field--num" min="0" value="${esc(String(this._ratio))}" placeholder="${t('ratioPlaceholder')}">
        </div>
      `;
    }
    return `
      <div class="field-row">
        <div class="field-group field-group--grow">
          <label>${t('hypothesizedStd')} (\u03C3\u2080)</label>
          <input type="number" data-ref="sigma0" class="field field--num" min="0" value="${esc(String(this._sigma0))}" placeholder="${t('sigma0Placeholder')}">
        </div>
        <div class="field-group field-group--grow">
          <label>${t('expectedStd')} (\u03C3\u2081)</label>
          <input type="number" data-ref="sigma-alt" class="field field--num" min="0" value="${esc(String(this._sigmaAlt))}" placeholder="${t('sigmaAltPlaceholder')}">
        </div>
      </div>
    `;
  },

  _renderMeanInputs(t, isTwo) {
    return `
      <div class="field-row">
        <div class="field-group field-group--major">
          <label>${isTwo ? t('meanDifference') : t('meanDifference')} (\u0394)</label>
          <input type="number" data-ref="delta" class="field field--num" min="0" value="${esc(String(this._delta))}" placeholder="${t('deltaPlaceholder')}">
        </div>
        <div class="field-group field-group--minor">
          <label>${t('stdDev')} (\u03C3)</label>
          <input type="number" data-ref="sigma" class="field field--num" min="0" value="${esc(String(this._sigma))}" placeholder="${t('sigmaPlaceholder')}">
        </div>
      </div>
    `;
  },

  // ─── Events ───────────────────────────────────────────────

  _bindEvents() {
    const c = this._container;

    // Category toggle
    c.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._category = btn.dataset.cat;
        this._save();
        this._render();
      });
    });

    // Test type toggle
    c.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._testType = btn.dataset.type;
        this._save();
        this._render();
      });
    });

    const autoCalc = () => { this._save(); this._calculate(); };

    // Direction
    const dirSel = c.querySelector('[data-ref="direction"]');
    if (dirSel) dirSel.addEventListener('change', () => { this._direction = dirSel.value; autoCalc(); });

    // Alpha
    const alphaInp = c.querySelector('[data-ref="alpha"]');
    if (alphaInp) alphaInp.addEventListener('input', () => { this._alpha = parseFloat(alphaInp.value) || this._alpha; autoCalc(); });

    // Power
    const powInp = c.querySelector('[data-ref="power"]');
    if (powInp) powInp.addEventListener('input', () => { this._power = Math.min(0.99, Math.max(0.5, parseFloat(powInp.value) || this._power)); autoCalc(); });

    // Variance inputs
    const s0 = c.querySelector('[data-ref="sigma0"]');
    if (s0) s0.addEventListener('input', () => { this._sigma0 = s0.value; autoCalc(); });

    const sa = c.querySelector('[data-ref="sigma-alt"]');
    if (sa) sa.addEventListener('input', () => { this._sigmaAlt = sa.value; autoCalc(); });

    const rat = c.querySelector('[data-ref="ratio"]');
    if (rat) rat.addEventListener('input', () => { this._ratio = rat.value; autoCalc(); });

    // Mean inputs
    const del = c.querySelector('[data-ref="delta"]');
    if (del) del.addEventListener('input', () => { this._delta = del.value; autoCalc(); });

    const sig = c.querySelector('[data-ref="sigma"]');
    if (sig) sig.addEventListener('input', () => { this._sigma = sig.value; autoCalc(); });

    // Auto-calculate if inputs are already present (e.g. restored state)
    this._calculate();
  },

  // ─── Calculation ──────────────────────────────────────────

  _hideResults(resEl, phEl) {
    this._destroyChart();
    if (resEl) resEl.style.display = 'none';
    if (phEl) phEl.style.display = '';
  },

  _calculate() {
    const t = (k, v) => this._t(k, v);
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    errBox.textContent = '';
    errBox.style.display = 'none';

    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl  = this._container.querySelector('[data-ref="placeholder"]');

    const alpha = this._alpha;
    const power = this._power;
    const dir   = this._direction;
    const isVar = this._category === 'variance';
    const isTwo = this._testType === 'two';

    let nRequired, powerFn, effLabel, effValue;

    if (isVar) {
      if (isTwo) {
        const ratio = parseFloat(this._ratio);
        if (isNaN(ratio) || ratio <= 0) { this._hideResults(resEl, phEl); return; }
        effLabel = t('varianceRatio');
        effValue = ratio;
        powerFn = (n) => powerFTest(n, n, ratio, alpha, dir);
        nRequired = findRequiredN(power, powerFn);
      } else {
        const s0 = parseFloat(this._sigma0);
        const s1 = parseFloat(this._sigmaAlt);
        if (isNaN(s0) || s0 <= 0 || isNaN(s1) || s1 <= 0) { this._hideResults(resEl, phEl); return; }
        const sigma0Sq = s0 * s0;
        const sigmaAltSq = s1 * s1;
        effLabel = t('varianceRatio');
        effValue = sigmaAltSq / sigma0Sq;
        powerFn = (n) => powerChiSquare(n, sigma0Sq, sigmaAltSq, alpha, dir);
        nRequired = findRequiredN(power, powerFn);
      }
    } else {
      const delta = parseFloat(this._delta);
      const sigma = parseFloat(this._sigma);
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

    // Calculate power curve for table
    const curvePoints = this._buildPowerCurve(powerFn, nRequired);

    this._renderResults(t, nRequired, effLabel, effValue, curvePoints, isTwo);
  },

  /**
   * Build power-vs-n curve points.
   * Returns a dense array for smooth charting plus sparser table points.
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

  // ─── Render Results ───────────────────────────────────────

  async _renderResults(t, nRequired, effLabel, effValue, curvePoints, isTwo) {
    this._destroyChart();

    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl  = this._container.querySelector('[data-ref="placeholder"]');
    phEl.style.display  = 'none';
    resEl.style.display = 'block';

    const alpha = this._alpha;
    const power = this._power;
    const powerPct = (power * 100).toFixed(0);
    const nLabel = nRequired >= 5000 ? '> 5.000' : nRequired;
    const nOverflow = nRequired >= 5000;

    let html = '';

    // ── Summary box ──
    html += `<div class="dmike-split__output-section">${t('sectionResult')}</div>`;
    html += `<div class="smpsize__summary">
      <strong>${t('requiredN')}${isTwo ? ' (' + t('perGroup') + ')' : ''}: ${nLabel}</strong>
      <p>${nOverflow ? t('nOverflow') : t('resultSummary', { n: nRequired, power: powerPct, alpha })}</p>
    </div>`;

    // ── Parameters ──
    html += `<div class="dmike-kpi-strip">
        <div class="dmike-kpi dmike-kpi--good"><div class="dmike-kpi-value">${nLabel}</div><div class="dmike-kpi-label">${t('requiredN')}${isTwo ? ' (' + t('perGroup') + ')' : ''}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${powerPct}%</div><div class="dmike-kpi-label">${t('targetPower')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${alpha}</div><div class="dmike-kpi-label">\u03B1</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(effValue, 3)}</div><div class="dmike-kpi-label">${effLabel}</div></div>
        ${isTwo ? `<div class="dmike-kpi"><div class="dmike-kpi-value">${nOverflow ? '> 10.000' : nRequired * 2}</div><div class="dmike-kpi-label">${t('totalN')}</div></div>` : ''}
    </div>`;

    // ── Power curve chart ──
    const algoId = resolveAlgoId(this._category, this._testType);
    html += `<div class="dmike-split__output-section">${t('sectionCurve')} <button class="smpsize__algo-link" data-algo-id="${algoId}" title="Algorithm Lab">${ALGO_LINK_SVG}</button></div>`;
    html += `<div data-ref="power-chart" style="height:320px"></div>`;

    resEl.innerHTML = html;

    // Bind algo link
    resEl.querySelectorAll('.smpsize__algo-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._context.eventBus.emit('lab:navigate', { algoId: btn.dataset.algoId, tab: 'docs' });
      });
    });

    // Create scatter chart with connected line + refLine at target power
    const chartEl = resEl.querySelector('[data-ref="power-chart"]');
    if (chartEl && this._context.chartManager) {
      const xVals = curvePoints.map(p => p.n);
      const yVals = curvePoints.map(p => p.power * 100);

      // Mark the solution point
      const solX = nRequired < 5000 ? [nRequired] : [];
      const solY = nRequired < 5000 ? [power * 100] : [];

      this._chart = await this._context.chartManager.create(chartEl, 'scatter', {
        title: t('sectionCurve'),
        xLabel: 'n' + (isTwo ? ' (' + t('perGroup') + ')' : ''),
        yLabel: t('power') + ' (%)',
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
            label: t('targetPower') + ': ' + powerPct + '%',
            dash: 'dash',
            width: 1.5,
            color: 'var(--color-error)',
          },
        ],
        series: [
          {
            name: t('power'),
            color: 'var(--color-chart-1)',
            markerSize: 3,
            strokeWidth: 0.5,
            x: xVals,
            y: yVals,
            symbol: 'circle',
            connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)' },
          },
          ...(solX.length ? [{
            name: 'n = ' + nRequired,
            color: 'var(--color-accent)',
            markerSize: 8,
            strokeWidth: 2,
            x: solX,
            y: solY,
            symbol: 'diamond',
          }] : []),
        ],
      });
    }
  },
};
