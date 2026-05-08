/**
 * D.Mike — Random Generator Module (random-generator.js)
 * Data phase: generates random numbers from various statistical distributions.
 * Supports seeded PRNG (Mulberry32), descriptive statistics, histogram,
 * CSV export, and optional transfer to worksheet.
 */

import { ColumnPicker, uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';

// Special distribution key for the attribute-based generator.
const ATTRIBUTIVE_KEY = 'attributive';

// ═══════════════════════════════════════════════════════════════
// Seeded PRNG — Mulberry32
// ═══════════════════════════════════════════════════════════════

/** @param {number} seed */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════
// Basic distribution building blocks
// ═══════════════════════════════════════════════════════════════

function normalPair(rng) {
  let u, v, s;
  do { u = 2 * rng() - 1; v = 2 * rng() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
  const m = Math.sqrt(-2 * Math.log(s) / s);
  return [u * m, v * m];
}

function stdNormal(rng) { return normalPair(rng)[0]; }

function gammaVariate(rng, shape, scale) {
  if (shape < 1) {
    return gammaVariate(rng, shape + 1, scale) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do { x = stdNormal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

function betaVariate(rng, a, b) {
  const x = gammaVariate(rng, a, 1);
  const y = gammaVariate(rng, b, 1);
  return x / (x + y);
}

// ═══════════════════════════════════════════════════════════════
// Distribution definitions
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {{ id: string, label: string, labelEn: string, default: number,
 *             min?: number, max?: number, step?: number, hint?: string, hintEn?: string }} DistParam
 * @typedef {{ nameKey: string, categoryKey: string, formula: string,
 *             params: DistParam[], generate: function, discrete?: boolean }} Distribution
 */

/** @type {Record<string, Distribution>} */
const DISTRIBUTIONS = {
  // ── Continuous ──
  normal: {
    nameKey: 'distNormal', categoryKey: 'catContinuous',
    formula: 'X ~ SinhArcSinh(\u03bc, \u03c3, \u03b5, \u03b4)',
    params: [
      { id: 'mu', label: 'Mittelwert (\u03bc)', labelEn: 'Mean (\u03bc)', default: 0 },
      { id: 'sigma', label: 'Std.-Abw. (\u03c3)', labelEn: 'Std. Dev. (\u03c3)', default: 1, min: 0.0001 },
      { id: 'epsilon', label: 'Schiefe (\u03b5)', labelEn: 'Skewness (\u03b5)', default: 0, hint: '0 = symmetrisch', hintEn: '0 = symmetric' },
      { id: 'delta', label: 'Tailweight (\u03b4)', labelEn: 'Tailweight (\u03b4)', default: 1, min: 0.01, hint: '1 = normal', hintEn: '1 = normal' },
    ],
    generate(rng, p) {
      const z = stdNormal(rng);
      return p.mu + p.sigma * Math.sinh((Math.asinh(z) + p.epsilon) / p.delta);
    },
  },
  chisquare: {
    nameKey: 'distChiSquare', categoryKey: 'catContinuous',
    formula: 'X ~ \u03c7\u00b2(k)',
    params: [{ id: 'k', label: 'Freiheitsgrade (k)', labelEn: 'Degrees of freedom (k)', default: 5, min: 1, step: 1 }],
    generate(rng, p) { return gammaVariate(rng, p.k / 2, 2); },
  },
  f_dist: {
    nameKey: 'distF', categoryKey: 'catContinuous',
    formula: 'X ~ F(d\u2081, d\u2082)',
    params: [
      { id: 'd1', label: 'Freiheitsgrade d\u2081', labelEn: 'Degrees of freedom d\u2081', default: 5, min: 1, step: 1 },
      { id: 'd2', label: 'Freiheitsgrade d\u2082', labelEn: 'Degrees of freedom d\u2082', default: 10, min: 1, step: 1 },
    ],
    generate(rng, p) {
      const x1 = gammaVariate(rng, p.d1 / 2, 2);
      const x2 = gammaVariate(rng, p.d2 / 2, 2);
      return (x1 / p.d1) / (x2 / p.d2);
    },
  },
  t_dist: {
    nameKey: 'distT', categoryKey: 'catContinuous',
    formula: 'X ~ t(\u03bd)',
    params: [{ id: 'nu', label: 'Freiheitsgrade (\u03bd)', labelEn: 'Degrees of freedom (\u03bd)', default: 10, min: 1, step: 1 }],
    generate(rng, p) {
      const z = stdNormal(rng);
      const chi = gammaVariate(rng, p.nu / 2, 2);
      return z / Math.sqrt(chi / p.nu);
    },
  },
  uniform: {
    nameKey: 'distUniform', categoryKey: 'catContinuous',
    formula: 'X ~ U(a, b)',
    params: [
      { id: 'a', label: 'Untergrenze (a)', labelEn: 'Lower bound (a)', default: 0 },
      { id: 'b', label: 'Obergrenze (b)', labelEn: 'Upper bound (b)', default: 1 },
    ],
    generate(rng, p) { return p.a + rng() * (p.b - p.a); },
  },
  beta: {
    nameKey: 'distBeta', categoryKey: 'catContinuous',
    formula: 'X ~ Beta(\u03b1, \u03b2)',
    params: [
      { id: 'alpha', label: 'Form \u03b1', labelEn: 'Shape \u03b1', default: 2, min: 0.01 },
      { id: 'beta', label: 'Form \u03b2', labelEn: 'Shape \u03b2', default: 5, min: 0.01 },
    ],
    generate(rng, p) { return betaVariate(rng, p.alpha, p.beta); },
  },
  cauchy: {
    nameKey: 'distCauchy', categoryKey: 'catContinuous',
    formula: 'X ~ Cauchy(x\u2080, \u03b3)',
    params: [
      { id: 'x0', label: 'Lage (x\u2080)', labelEn: 'Location (x\u2080)', default: 0 },
      { id: 'gamma', label: 'Skala (\u03b3)', labelEn: 'Scale (\u03b3)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.x0 + p.gamma * Math.tan(Math.PI * (rng() - 0.5)); },
  },
  exponential: {
    nameKey: 'distExponential', categoryKey: 'catContinuous',
    formula: 'X ~ Exp(\u03bb)',
    params: [{ id: 'lambda', label: 'Rate (\u03bb)', labelEn: 'Rate (\u03bb)', default: 1, min: 0.0001 }],
    generate(rng, p) { return -Math.log(1 - rng()) / p.lambda; },
  },
  gamma_dist: {
    nameKey: 'distGamma', categoryKey: 'catContinuous',
    formula: 'X ~ Gamma(\u03b1, \u03b2)',
    params: [
      { id: 'alpha', label: 'Form (\u03b1)', labelEn: 'Shape (\u03b1)', default: 2, min: 0.01 },
      { id: 'beta', label: 'Skala (\u03b2)', labelEn: 'Scale (\u03b2)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return gammaVariate(rng, p.alpha, p.beta); },
  },
  laplace: {
    nameKey: 'distLaplace', categoryKey: 'catContinuous',
    formula: 'X ~ Laplace(\u03bc, b)',
    params: [
      { id: 'mu', label: 'Lage (\u03bc)', labelEn: 'Location (\u03bc)', default: 0 },
      { id: 'b', label: 'Skala (b)', labelEn: 'Scale (b)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) {
      const u = rng() - 0.5;
      return p.mu - p.b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    },
  },
  gumbel_max: {
    nameKey: 'distGumbelMax', categoryKey: 'catContinuous',
    formula: 'X ~ GumbelMax(\u03bc, \u03b2)',
    params: [
      { id: 'mu', label: 'Lage (\u03bc)', labelEn: 'Location (\u03bc)', default: 0 },
      { id: 'beta', label: 'Skala (\u03b2)', labelEn: 'Scale (\u03b2)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.mu - p.beta * Math.log(-Math.log(rng())); },
  },
  logistic: {
    nameKey: 'distLogistic', categoryKey: 'catContinuous',
    formula: 'X ~ Logistic(\u03bc, s)',
    params: [
      { id: 'mu', label: 'Lage (\u03bc)', labelEn: 'Location (\u03bc)', default: 0 },
      { id: 's', label: 'Skala (s)', labelEn: 'Scale (s)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { const u = rng(); return p.mu + p.s * Math.log(u / (1 - u)); },
  },
  loglogistic: {
    nameKey: 'distLogLogistic', categoryKey: 'catContinuous',
    formula: 'X ~ LogLogistic(\u03b1, \u03b2)',
    params: [
      { id: 'alpha', label: 'Skala (\u03b1)', labelEn: 'Scale (\u03b1)', default: 1, min: 0.0001 },
      { id: 'beta', label: 'Form (\u03b2)', labelEn: 'Shape (\u03b2)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) {
      const u = rng();
      return p.alpha * Math.pow(u / (1 - u), 1 / p.beta);
    },
  },
  lognormal: {
    nameKey: 'distLogNormal', categoryKey: 'catContinuous',
    formula: 'X ~ LogN(\u03bc, \u03c3)',
    params: [
      { id: 'mu', label: 'Log-Mittelwert (\u03bc)', labelEn: 'Log-Mean (\u03bc)', default: 0 },
      { id: 'sigma', label: 'Log-Std.Abw. (\u03c3)', labelEn: 'Log-Std.Dev. (\u03c3)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return Math.exp(stdNormal(rng) * p.sigma + p.mu); },
  },
  gumbel_min: {
    nameKey: 'distGumbelMin', categoryKey: 'catContinuous',
    formula: 'X ~ GumbelMin(\u03bc, \u03b2)',
    params: [
      { id: 'mu', label: 'Lage (\u03bc)', labelEn: 'Location (\u03bc)', default: 0 },
      { id: 'beta', label: 'Skala (\u03b2)', labelEn: 'Scale (\u03b2)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.mu + p.beta * Math.log(-Math.log(1 - rng())); },
  },
  triangular: {
    nameKey: 'distTriangular', categoryKey: 'catContinuous',
    formula: 'X ~ Tri(a, b, c)',
    params: [
      { id: 'a', label: 'Minimum (a)', labelEn: 'Minimum (a)', default: 0 },
      { id: 'c', label: 'Modus (c)', labelEn: 'Mode (c)', default: 0.5 },
      { id: 'b', label: 'Maximum (b)', labelEn: 'Maximum (b)', default: 1 },
    ],
    generate(rng, p) {
      const u = rng();
      const fc = (p.c - p.a) / (p.b - p.a);
      if (u < fc) return p.a + Math.sqrt(u * (p.b - p.a) * (p.c - p.a));
      return p.b - Math.sqrt((1 - u) * (p.b - p.a) * (p.b - p.c));
    },
  },
  weibull: {
    nameKey: 'distWeibull', categoryKey: 'catContinuous',
    formula: 'X ~ Weibull(\u03b1, \u03b2)',
    params: [
      { id: 'alpha', label: 'Form (\u03b1)', labelEn: 'Shape (\u03b1)', default: 1.5, min: 0.0001 },
      { id: 'beta', label: 'Skala (\u03b2)', labelEn: 'Scale (\u03b2)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.beta * Math.pow(-Math.log(1 - rng()), 1 / p.alpha); },
  },

  // ── Discrete ──
  bernoulli: {
    nameKey: 'distBernoulli', categoryKey: 'catDiscrete',
    formula: 'X ~ Bernoulli(p)',
    params: [{ id: 'p', label: 'Erfolgswahrsch. (p)', labelEn: 'Success prob. (p)', default: 0.5, min: 0, max: 1 }],
    generate(rng, p) { return rng() < p.p ? 1 : 0; },
    discrete: true,
  },
  binomial: {
    nameKey: 'distBinomial', categoryKey: 'catDiscrete',
    formula: 'X ~ Bin(n, p)',
    params: [
      { id: 'n', label: 'Versuche (n)', labelEn: 'Trials (n)', default: 10, min: 1, step: 1 },
      { id: 'p', label: 'Erfolgswahrsch. (p)', labelEn: 'Success prob. (p)', default: 0.5, min: 0, max: 1 },
    ],
    generate(rng, par) {
      let s = 0;
      for (let i = 0; i < par.n; i++) if (rng() < par.p) s++;
      return s;
    },
    discrete: true,
  },
  geometric: {
    nameKey: 'distGeometric', categoryKey: 'catDiscrete',
    formula: 'X ~ Geo(p)',
    params: [{ id: 'p', label: 'Erfolgswahrsch. (p)', labelEn: 'Success prob. (p)', default: 0.3, min: 0.0001, max: 1 }],
    generate(rng, par) { return Math.floor(Math.log(1 - rng()) / Math.log(1 - par.p)); },
    discrete: true,
  },
  negbinomial: {
    nameKey: 'distNegBinomial', categoryKey: 'catDiscrete',
    formula: 'X ~ NB(r, p)',
    params: [
      { id: 'r', label: 'Erfolge (r)', labelEn: 'Successes (r)', default: 5, min: 1, step: 1 },
      { id: 'p', label: 'Erfolgswahrsch. (p)', labelEn: 'Success prob. (p)', default: 0.5, min: 0.0001, max: 1 },
    ],
    generate(rng, par) {
      const g = gammaVariate(rng, par.r, (1 - par.p) / par.p);
      let x = 0, L = Math.exp(-g), p = 1;
      do { x++; p *= rng(); } while (p > L);
      return x - 1;
    },
    discrete: true,
  },
  hypergeometric: {
    nameKey: 'distHypergeometric', categoryKey: 'catDiscrete',
    formula: 'X ~ HyperGeo(N, K, n)',
    params: [
      { id: 'N', label: 'Populationsgr\u00f6\u00dfe (N)', labelEn: 'Population size (N)', default: 100, min: 1, step: 1 },
      { id: 'K', label: 'Erfolgszust. (K)', labelEn: 'Success states (K)', default: 30, min: 0, step: 1 },
      { id: 'n', label: 'Stichprobe (n)', labelEn: 'Sample size (n)', default: 10, min: 1, step: 1 },
    ],
    generate(rng, par) {
      let N = par.N, K = par.K, n = par.n, s = 0;
      for (let i = 0; i < n; i++) {
        if (rng() < K / N) { s++; K--; }
        N--;
      }
      return s;
    },
    discrete: true,
  },
  integer: {
    nameKey: 'distInteger', categoryKey: 'catDiscrete',
    formula: 'X ~ DU(a, b)',
    params: [
      { id: 'a', label: 'Minimum (a)', labelEn: 'Minimum (a)', default: 1, step: 1 },
      { id: 'b', label: 'Maximum (b)', labelEn: 'Maximum (b)', default: 6, step: 1 },
    ],
    generate(rng, p) { return Math.floor(rng() * (Math.floor(p.b) - Math.floor(p.a) + 1)) + Math.floor(p.a); },
    discrete: true,
  },
  poisson: {
    nameKey: 'distPoisson', categoryKey: 'catDiscrete',
    formula: 'X ~ Poi(\u03bb)',
    params: [{ id: 'lambda', label: 'Rate (\u03bb)', labelEn: 'Rate (\u03bb)', default: 5, min: 0.01 }],
    generate(rng, par) {
      if (par.lambda < 30) {
        let L = Math.exp(-par.lambda), k = 0, p = 1;
        do { k++; p *= rng(); } while (p > L);
        return k - 1;
      }
      return Math.max(0, Math.round(stdNormal(rng) * Math.sqrt(par.lambda) + par.lambda));
    },
    discrete: true,
  },
  mvnormal: {
    nameKey: 'distMvNormal', categoryKey: 'catContinuous',
    formula: 'X ~ N\u2082(\u03bc, \u03a3)',
    params: [
      { id: 'mu1', label: 'Mittelwert \u03bc\u2081', labelEn: 'Mean \u03bc\u2081', default: 0 },
      { id: 'mu2', label: 'Mittelwert \u03bc\u2082', labelEn: 'Mean \u03bc\u2082', default: 0 },
      { id: 'sigma1', label: 'Std.Abw. \u03c3\u2081', labelEn: 'Std.Dev. \u03c3\u2081', default: 1, min: 0.0001 },
      { id: 'sigma2', label: 'Std.Abw. \u03c3\u2082', labelEn: 'Std.Dev. \u03c3\u2082', default: 1, min: 0.0001 },
      { id: 'rho', label: 'Korrelation \u03c1', labelEn: 'Correlation \u03c1', default: 0.5, min: -0.999, max: 0.999 },
    ],
    generate(rng, p) {
      const [z1] = normalPair(rng);
      return p.mu1 + p.sigma1 * z1;
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// Exported API for Algorithm Lab
// ═══════════════════════════════════════════════════════════════

/**
 * Generate random variates from a named distribution.
 * @param {string} distribution — key into DISTRIBUTIONS (e.g. 'normal', 'exponential')
 * @param {object} params — distribution-specific parameters
 * @param {number} n — number of values to generate
 * @param {number} seed — PRNG seed (deterministic)
 * @returns {{ values: number[], n: number, seed: number, distribution: string }}
 */
export function generateRandomVariates(distribution, params, n, seed) {
  if (!distribution || typeof distribution !== 'string') {
    throw new TypeError('distribution must be a non-empty string');
  }
  const dist = DISTRIBUTIONS[distribution];
  if (!dist) throw new Error(`unknownDistribution: ${distribution}`);
  if (!Number.isFinite(n) || n < 1) throw new Error('n must be >= 1');
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');

  const rng = mulberry32(seed);
  const values = [];
  for (let i = 0; i < n; i++) {
    values.push(dist.generate(rng, params));
  }
  return { values, n, seed, distribution };
}

// ═══════════════════════════════════════════════════════════════
// Module export
// ═══════════════════════════════════════════════════════════════

export default {
  id: 'random-generator',
  phase: 'data',
  icon: 'dice',
  i18nKey: 'modules.random-generator',
  version: '1.0.0',

  _container: null,
  _context: null,
  _currentDist: null,
  _generatedData: [],
  _chart: null,
  _targetPicker: null,
  _state: {},
  _autoTimer: 0,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('random-generator-css')) {
      const link = document.createElement('link');
      link.id = 'random-generator-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/random-generator/random-generator.css';
      document.head.appendChild(link);
    }

    this._render();
  },

  async destroy() {
    clearTimeout(this._autoTimer);
    this._destroyChart();
    this._targetPicker?.destroy();
    this._targetPicker = null;
    this._container = null;
    this._context = null;
    this._currentDist = null;
    this._generatedData = [];
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* chartManager handles theme updates automatically */ },

  getState() { return { ...this._state, currentDist: this._currentDist }; },

  setState(data) {
    if (data) {
      this._state = { ...data };
      this._currentDist = data.currentDist || null;
    }
  },

  help: () => import('./random-generator-help.js'),

  // ─── Rendering ──────────────────────────────────────────────

  _t(key) { return this._context.i18n.t(`modules.random-generator.${key}`); },

  _isEn() { return this._context.language === 'en'; },

  _render() {
    const t = (k) => this._t(k);
    this._container.innerHTML = `<div class="module-random-generator dmike-split">
      <aside class="rg-sidebar dmike-split__input" id="rg-sidebar"></aside>
      <main class="rg-main dmike-split__output" id="rg-main">
        <div class="rg-main__empty"></div>
      </main>
    </div>`;

    this._buildSidebar();
    if (this._currentDist === ATTRIBUTIVE_KEY) {
      this._selectDistribution(ATTRIBUTIVE_KEY);
    } else if (this._currentDist && DISTRIBUTIONS[this._currentDist]) {
      this._selectDistribution(this._currentDist);
    }
  },

  _buildSidebar() {
    const sb = this._container.querySelector('#rg-sidebar');
    const cats = {};
    for (const [key, d] of Object.entries(DISTRIBUTIONS)) {
      const catKey = d.categoryKey;
      if (!cats[catKey]) cats[catKey] = [];
      cats[catKey].push(key);
    }
    for (const [catKey, keys] of Object.entries(cats)) {
      const sec = document.createElement('div');
      sec.className = 'rg-sidebar__section';
      const title = document.createElement('div');
      title.className = 'rg-sidebar__title';
      title.textContent = this._t(catKey);
      sec.appendChild(title);
      keys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'rg-sidebar__btn';
        if (k === this._currentDist) btn.classList.add('rg-sidebar__btn--active');
        btn.textContent = this._t(DISTRIBUTIONS[k].nameKey);
        btn.dataset.dist = k;
        btn.addEventListener('click', () => this._selectDistribution(k));
        sec.appendChild(btn);
      });
      sb.appendChild(sec);
    }

    // Attributive section
    const attrSec = document.createElement('div');
    attrSec.className = 'rg-sidebar__section';
    const attrTitle = document.createElement('div');
    attrTitle.className = 'rg-sidebar__title';
    attrTitle.textContent = this._t('catAttributive');
    attrSec.appendChild(attrTitle);
    const attrBtn = document.createElement('button');
    attrBtn.className = 'rg-sidebar__btn';
    if (this._currentDist === ATTRIBUTIVE_KEY) attrBtn.classList.add('rg-sidebar__btn--active');
    attrBtn.textContent = this._t('distAttributive');
    attrBtn.dataset.dist = ATTRIBUTIVE_KEY;
    attrBtn.addEventListener('click', () => this._selectDistribution(ATTRIBUTIVE_KEY));
    attrSec.appendChild(attrBtn);
    sb.appendChild(attrSec);
  },

  _selectDistribution(key) {
    this._destroyChart();
    this._currentDist = key;
    this._generatedData = [];

    // Update sidebar highlight
    this._container.querySelectorAll('.rg-sidebar__btn').forEach(b =>
      b.classList.toggle('rg-sidebar__btn--active', b.dataset.dist === key));

    if (key === ATTRIBUTIVE_KEY) {
      this._renderAttributiveMain();
      this._generateAttributive();
    } else {
      this._renderMain(key);
      this._generate();
    }
  },

  _renderMain(key) {
    const d = DISTRIBUTIONS[key];
    const main = this._container.querySelector('#rg-main');
    const isEn = this._isEn();

    const paramsHTML = d.params.map(p => {
      const attrs = [];
      if (p.min !== undefined) attrs.push(`min="${p.min}"`);
      if (p.max !== undefined) attrs.push(`max="${p.max}"`);
      const lbl = isEn ? p.labelEn : p.label;
      const hint = isEn ? (p.hintEn || '') : (p.hint || '');
      return `<div class="field-group rg-control-group">
        <label>${lbl}</label>
        <input type="number" class="field field--num" id="rg_param_${p.id}" value="${p.default}" ${attrs.join(' ')}>
        ${hint ? `<div class="rg-param-hint">${hint}</div>` : ''}
      </div>`;
    }).join('');

    main.innerHTML = `
      <div class="rg-dist-title">${this._t(d.nameKey)}</div>
      <div class="rg-dist-formula">${d.formula}</div>
      <div class="rg-controls">
        ${paramsHTML}
        <div class="field-group rg-control-group">
          <label>${this._t('count')}</label>
          <input type="number" class="field field--num" id="rg_param_count" value="1000" min="1" max="100000">
        </div>
        <div class="field-group rg-control-group">
          <label>Seed</label>
          <input type="number" class="field field--num" id="rg_seed" value="42">
        </div>
      </div>
      <div class="rg-action-bar">
        <span class="rg-export-group" id="rg-export-group" style="display:none">
          <button class="btn btn--secondary" id="rg-btn-csv">${this._t('exportCSV')}</button>
          <span class="rg-target-wrap" id="rg-target-wrap"></span>
          <button class="btn btn--secondary" id="rg-btn-worksheet">${this._t('toWorksheet')}</button>
        </span>
      </div>
      <div id="rg-stats"></div>
      <div class="rg-histogram" id="rg-hist" style="display:none"></div>
      <div id="rg-data"></div>
    `;

    main.querySelector('#rg-btn-csv').addEventListener('click', () => this._exportCSV());
    main.querySelector('#rg-btn-worksheet').addEventListener('click', () => this._toWorksheet());

    // Live-update on any parameter / count / seed change
    main.querySelectorAll('input[type="number"]').forEach(inp => {
      inp.addEventListener('input', () => this._autoGenerate());
    });

    // Column picker for target (empty columns only)
    this._targetPicker?.destroy();
    const targetWrap = main.querySelector('#rg-target-wrap');
    this._targetPicker = new ColumnPicker(targetWrap, this._context, {
      mode: 'single',
      maxCount: 0,
      allowCreateWorksheet: true,
    });
  },

  // ─── Generate ───────────────────────────────────────────────

  _autoGenerate() {
    clearTimeout(this._autoTimer);
    this._autoTimer = setTimeout(() => {
      if (this._currentDist === ATTRIBUTIVE_KEY) this._generateAttributive();
      else this._generate();
    }, 80);
  },

  _generate() {
    if (!this._currentDist) return;
    const d = DISTRIBUTIONS[this._currentDist];
    const seedEl = this._container.querySelector('#rg_seed');
    const countEl = this._container.querySelector('#rg_param_count');
    const seed = parseInt(seedEl.value) || 42;
    const count = Math.min(100000, Math.max(1, parseInt(countEl.value) || 1000));
    const rng = mulberry32(seed);

    const params = {};
    d.params.forEach(p => {
      const el = this._container.querySelector(`#rg_param_${p.id}`);
      params[p.id] = parseFloat(el.value);
      if (isNaN(params[p.id])) params[p.id] = p.default;
    });

    this._generatedData = [];
    for (let i = 0; i < count; i++) {
      this._generatedData.push(d.generate(rng, params));
    }

    this._state = { currentDist: this._currentDist, seed, count, params };

    const exportGroup = this._container.querySelector('#rg-export-group');
    if (exportGroup) exportGroup.style.display = '';

    this._renderStats();
    this._renderHistogram();
    this._renderData(d.discrete);
  },

  // ─── Statistics ─────────────────────────────────────────────

  _renderStats() {
    const data = this._generatedData;
    const ds = descriptiveStats(data);

    const fmt = v => {
      if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4);
      return v.toFixed(4);
    };

    const t = (k) => this._t(k);
    this._container.querySelector('#rg-stats').innerHTML = `
      <div class="dmike-kpi-strip">
        <div class="dmike-kpi"><div class="dmike-kpi-value">${ds.n}</div><div class="dmike-kpi-label">n</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.mean)}</div><div class="dmike-kpi-label">${t('statMean')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.stdDev)}</div><div class="dmike-kpi-label">${t('statStd')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.median)}</div><div class="dmike-kpi-label">${t('statMedian')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.min)}</div><div class="dmike-kpi-label">Min</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.max)}</div><div class="dmike-kpi-label">Max</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.skewness)}</div><div class="dmike-kpi-label">${t('statSkewness')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(ds.kurtosis)}</div><div class="dmike-kpi-label">${t('statKurtosis')}</div></div>
      </div>
    `;
  },

  // ─── Histogram (via Chart Framework) ─────────────────────

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  async _renderHistogram() {
    this._destroyChart();
    const area = this._container.querySelector('#rg-hist');
    area.style.display = '';
    area.innerHTML = '';

    const d = DISTRIBUTIONS[this._currentDist];
    const distName = this._t(d.nameKey);

    this._chart = await this._context.chartManager.create(area, 'histogram', {
      title: this._t('histogram') + ' — ' + distName,
      data: this._generatedData,
      binMethod: 'sturges',
      showNormalCurve: !d.discrete,
      barColor: 'var(--color-chart-1)',
      normalCurveColor: 'var(--color-chart-2)',
      showLegend: !d.discrete,
      xLabel: distName,
      yLabel: '',
    });
  },

  // ─── Data Display ──────────────────────────────────────────

  _renderData(isDiscrete) {
    const displayMax = 2000;
    const shown = this._generatedData.slice(0, displayMax);
    const fmt = v => isDiscrete ? v.toString() : v.toFixed(6);
    const t = (k) => this._t(k);
    const total = this._generatedData.length;

    this._container.querySelector('#rg-data').innerHTML = `
      <div class="rg-data">
        <div class="rg-data__header">
          <div class="rg-data__title">${t('generatedData')}</div>
          <div class="rg-data__count">${total > displayMax ? `${displayMax} / ${total}` : `${total}`}</div>
        </div>
        <div class="rg-data__grid">
          <div class="rg-data__values">
            ${shown.map(v => `<span>${fmt(v)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  },

  // ─── CSV Export ─────────────────────────────────────────────

  _exportCSV() {
    if (!this._generatedData.length) return;
    const isAttr = this._currentDist === ATTRIBUTIVE_KEY;
    const lines = ['Value'];
    if (isAttr) {
      this._generatedData.forEach(v => lines.push(this._csvEscape(v)));
    } else {
      const d = DISTRIBUTIONS[this._currentDist];
      this._generatedData.forEach(v => lines.push(d.discrete ? v.toString() : v.toFixed(8)));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const seedEl = this._container.querySelector('#rg_seed');
    a.download = `${this._currentDist}_seed${seedEl.value}_n${this._generatedData.length}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this._context.notify(this._t('csvExported'));
  },

  _csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  },

  // ─── To Worksheet ──────────────────────────────────────────


  /**
   * "→ Worksheet" button: sends generated data to the selected target.
   * If the picker shows "__create_worksheet__", a new worksheet is
   * created first, navigated to, and the data is sent once it's live.
   */
  _toWorksheet() {
    if (!this._generatedData.length) return;
    const pickerValue = this._targetPicker?.value;
    if (!pickerValue) {
      this._context.notify(this._t('selectTarget'));
      return;
    }

    const isAttr = this._currentDist === ATTRIBUTIVE_KEY;
    const name = isAttr ? this._t('distAttributive') : this._t(DISTRIBUTIONS[this._currentDist].nameKey);
    const discrete = isAttr ? true : !!DISTRIBUTIONS[this._currentDist].discrete;
    const type = isAttr ? 'text' : 'numeric';
    const values = [...this._generatedData];

    if (pickerValue === ColumnPicker.NEW_WORKSHEET) {
      this._createWorksheetAndSend(name, values, type, discrete);
      return;
    }

    // Existing column — use the standard event
    this._context.eventBus.emit('worksheet:appendColumn', {
      instanceId: pickerValue.instanceId,
      sheetId: pickerValue.sheetId,
      colId: pickerValue.columnId,
      name, values, discrete, type,
    });
    this._context.notify(this._t('sentToWorksheet'));
  },

  /**
   * Create a brand-new worksheet in the same phase, navigate to it,
   * and send data via worksheet:appendColumn once it's live.
   */
  _createWorksheetAndSend(name, values, type, discrete) {
    const sm = this._context.stateManager;
    const eb = this._context.eventBus;
    const phase = this._findOwnPhase();
    const wsId = `worksheet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Register in the phase list (same as sidebar._addModule)
    const existing = sm.get(`phases.${phase}`) ?? [];
    sm.set(`phases.${phase}`, [
      ...existing,
      { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
    ]);

    // Pre-populate with a unique sheet name so it doesn't collide with existing worksheets
    const baseName = this._context.i18n.t('modules.worksheet.defaultSheetName');
    const sheetName = uniqueSheetName(sm, baseName);
    sm.setModuleState(wsId, buildInitialWorksheetState(sheetName));

    // Once the worksheet is activated (= init finished, grid is live),
    // send the data via the normal appendColumn path.
    const onActivated = ({ instanceId }) => {
      if (instanceId !== wsId) return;
      eb.off('module:activated', onActivated);

      // Write into the first default column (C1) via __first__ sentinel
      eb.emit('worksheet:appendColumn', {
        instanceId: wsId,
        sheetId: 'sheet_1',
        colId: '__first__',
        name, values, discrete, type,
      });
      this._context.notify(this._t('sentToWorksheet'));
    };
    eb.on('module:activated', onActivated);

    // Navigate to the new worksheet (non-silent → workspace instantiates it)
    eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  },

  /** Find the phase this module instance is registered under. */
  _findOwnPhase() {
    const sm = this._context.stateManager;
    const id = this._context.instanceId;
    for (const p of Object.keys(sm.get('phases') || {})) {
      const items = sm.get(`phases.${p}`) ?? [];
      if (items.some(i => i.instanceId === id)) return p;
    }
    return 'data';
  },

  // ─── Attributive Mode ──────────────────────────────────────

  _escapeHTML(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  },

  _attrColor(i) {
    // Use chart palette variables so colors respect the active theme.
    const n = 10;
    return `var(--color-chart-${(i % n) + 1})`;
  },

  _getAttrDefs() {
    if (!Array.isArray(this._state.attributes) || !this._state.attributes.length) {
      this._state.attributes = [
        { name: 'A', weight: 1 },
        { name: 'B', weight: 2 },
        { name: 'C', weight: 7 },
      ];
    }
    return this._state.attributes;
  },

  _renderAttributiveMain() {
    const main = this._container.querySelector('#rg-main');
    const t = (k) => this._t(k);
    this._getAttrDefs();
    if (!Number.isFinite(this._state.attrCount)) this._state.attrCount = 50;
    if (!Number.isFinite(this._state.attrSeed)) this._state.attrSeed = 42;

    main.innerHTML = `
      <div class="rg-dist-title">${t('distAttributive')}</div>
      <div class="rg-dist-formula">X ~ Categorical(p\u2081, p\u2082, \u2026, p\u2096)</div>

      <div class="rg-attr-wrap">
        <div class="rg-attr-section">
          <div class="rg-attr-head">
            <div class="rg-attr-head__label">${t('attrName')}</div>
            <div class="rg-attr-head__label">${t('attrWeight')}</div>
            <div></div>
          </div>
          <div class="rg-attr-list" id="rg-attr-list"></div>
          <button class="rg-attr-add" id="rg-attr-add">+ ${t('addAttribute')}</button>
        </div>
        <div class="rg-attr-section rg-attr-section--prob">
          <div class="rg-attr-head">
            <div class="rg-attr-head__label">${t('probability')}</div>
          </div>
          <div class="rg-attr-prob__bars" id="rg-attr-prob"></div>
        </div>
      </div>

      <div class="rg-controls rg-controls--attr">
        <div class="field-group rg-control-group">
          <label>${t('count')}</label>
          <input type="number" id="rg_param_count" value="${this._state.attrCount}" min="1" max="100000">
        </div>
        <div class="field-group rg-control-group">
          <label>Seed</label>
          <input type="number" id="rg_seed" value="${this._state.attrSeed}">
        </div>
      </div>

      <div class="rg-action-bar">
        <span class="rg-export-group" id="rg-export-group" style="display:none">
          <button class="btn btn--secondary" id="rg-btn-csv">${t('exportCSV')}</button>
          <span class="rg-target-wrap" id="rg-target-wrap"></span>
          <button class="btn btn--secondary" id="rg-btn-worksheet">${t('toWorksheet')}</button>
        </span>
      </div>

      <div id="rg-stats"></div>
      <div class="rg-histogram" id="rg-hist" style="display:none"></div>
      <div class="rg-attr-freq" id="rg-attr-freq"></div>
      <div id="rg-data"></div>
    `;

    this._renderAttrRows();
    this._renderProbBar();

    main.querySelector('#rg-attr-add').addEventListener('click', () => {
      this._state.attributes.push({ name: '', weight: 1 });
      this._renderAttrRows();
      this._renderProbBar();
      this._autoGenerate();
    });

    main.querySelector('#rg_param_count').addEventListener('input', (e) => {
      this._state.attrCount = parseInt(e.target.value) || 0;
      this._autoGenerate();
    });
    main.querySelector('#rg_seed').addEventListener('input', (e) => {
      this._state.attrSeed = parseInt(e.target.value) || 0;
      this._autoGenerate();
    });

    main.querySelector('#rg-btn-csv').addEventListener('click', () => this._exportCSV());
    main.querySelector('#rg-btn-worksheet').addEventListener('click', () => this._toWorksheet());

    this._targetPicker?.destroy();
    const targetWrap = main.querySelector('#rg-target-wrap');
    this._targetPicker = new ColumnPicker(targetWrap, this._context, {
      mode: 'single',
      maxCount: 0,
      allowCreateWorksheet: true,
    });
  },

  _renderAttrRows() {
    const listEl = this._container.querySelector('#rg-attr-list');
    if (!listEl) return;
    const t = (k) => this._t(k);
    listEl.innerHTML = '';
    this._state.attributes.forEach((a, i) => {
      const row = document.createElement('div');
      row.className = 'rg-attr-row';
      row.innerHTML = `
        <input type="text" class="field rg-attr-row__name" value="${this._escapeHTML(a.name)}" data-i="${i}" data-f="name" placeholder="${t('attrName')}">
        <input type="number" class="field field--num rg-attr-row__weight" value="${a.weight}" min="0" data-i="${i}" data-f="weight">
        <button class="rg-attr-row__remove" data-i="${i}" title="${t('removeAttribute')}" aria-label="${t('removeAttribute')}">\u00D7</button>
      `;
      // Color swatch via left border
      row.style.setProperty('--rg-attr-color', this._attrColor(i));
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.i);
        const f = e.target.dataset.f;
        if (f === 'name') this._state.attributes[i].name = e.target.value;
        if (f === 'weight') this._state.attributes[i].weight = parseFloat(e.target.value) || 0;
        this._renderProbBar();
        this._autoGenerate();
      });
    });
    listEl.querySelectorAll('.rg-attr-row__remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.i);
        this._state.attributes.splice(i, 1);
        this._renderAttrRows();
        this._renderProbBar();
        this._autoGenerate();
      });
    });
  },

  _renderProbBar() {
    const host = this._container.querySelector('#rg-attr-prob');
    if (!host) return;
    host.innerHTML = '';
    const total = this._state.attributes.reduce((s, a) => s + Math.max(0, a.weight || 0), 0);
    this._state.attributes.forEach((a, idx) => {
      const bar = document.createElement('div');
      bar.className = 'rg-attr-prob__bar';
      const w = Math.max(0, a.weight || 0);
      const pct = total > 0 ? (w / total * 100) : 0;

      const fill = document.createElement('div');
      fill.className = 'rg-attr-prob__bar-fill';
      fill.style.width = pct + '%';
      fill.style.background = this._attrColor(idx);
      bar.appendChild(fill);

      const label = document.createElement('div');
      label.className = 'rg-attr-prob__bar-label';
      label.textContent = `${pct.toFixed(1)}%`;
      bar.appendChild(label);

      bar.title = `${a.name || '?'}: ${pct.toFixed(1)}%`;
      host.appendChild(bar);
    });
  },

  _generateAttributive() {
    if (this._currentDist !== ATTRIBUTIVE_KEY) return;
    const valid = this._state.attributes.filter(a => a.name && a.weight > 0);

    const seedEl = this._container.querySelector('#rg_seed');
    const countEl = this._container.querySelector('#rg_param_count');
    const seed = parseInt(seedEl?.value) || 42;
    const count = Math.min(100000, Math.max(1, parseInt(countEl?.value) || 50));
    this._state.attrSeed = seed;
    this._state.attrCount = count;

    if (!valid.length) {
      this._generatedData = [];
      this._clearAttrResults();
      const exportGroup = this._container.querySelector('#rg-export-group');
      if (exportGroup) exportGroup.style.display = 'none';
      return;
    }

    const total = valid.reduce((s, a) => s + a.weight, 0);
    const cum = [];
    let running = 0;
    valid.forEach(a => { running += a.weight / total; cum.push({ name: a.name, threshold: running }); });

    const rng = mulberry32(seed);
    this._generatedData = new Array(count);
    for (let i = 0; i < count; i++) {
      const r = rng();
      for (const c of cum) {
        if (r <= c.threshold) { this._generatedData[i] = c.name; break; }
      }
    }

    const exportGroup = this._container.querySelector('#rg-export-group');
    if (exportGroup) exportGroup.style.display = '';

    this._renderAttrFrequency();
    this._renderAttrChart();
    this._renderAttrData();
  },

  _clearAttrResults() {
    const freq = this._container.querySelector('#rg-attr-freq');
    if (freq) freq.innerHTML = '';
    const data = this._container.querySelector('#rg-data');
    if (data) data.innerHTML = '';
    const stats = this._container.querySelector('#rg-stats');
    if (stats) stats.innerHTML = '';
    this._destroyChart();
    const hist = this._container.querySelector('#rg-hist');
    if (hist) hist.style.display = 'none';
  },

  _renderAttrFrequency() {
    const host = this._container.querySelector('#rg-attr-freq');
    const statsHost = this._container.querySelector('#rg-stats');
    if (!host || !statsHost) return;
    const t = (k) => this._t(k);
    const freq = {};
    this._generatedData.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const total = this._generatedData.length;
    const attrOrder = this._state.attributes.map(a => a.name);
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

    statsHost.innerHTML = `
      <div class="dmike-kpi-strip">
        <div class="dmike-kpi"><div class="dmike-kpi-value">${total}</div><div class="dmike-kpi-label">n</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${sorted.length}</div><div class="dmike-kpi-label">${t('catCount')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${this._escapeHTML(sorted[0]?.[0] ?? '—')}</div><div class="dmike-kpi-label">${t('mostFrequent')}</div></div>
      </div>
    `;

    const maxCount = sorted.length ? sorted[0][1] : 1;
    const rows = sorted.map(([name, count]) => {
      const idx = attrOrder.indexOf(name);
      const color = idx >= 0 ? this._attrColor(idx) : 'var(--color-text-tertiary)';
      const pct = (count / total * 100).toFixed(1);
      const barW = (count / maxCount * 100).toFixed(1);
      return `
        <div class="rg-freq-row">
          <div class="rg-freq-row__swatch" style="background:${color}"></div>
          <div class="rg-freq-row__name">${this._escapeHTML(name)}</div>
          <div class="rg-freq-row__count">${count}</div>
          <div class="rg-freq-row__pct">${pct}%</div>
          <div class="rg-freq-row__bar"><div class="rg-freq-row__bar-fill" style="width:${barW}%;background:${color}"></div></div>
        </div>
      `;
    }).join('');

    host.innerHTML = `
      <div class="rg-freq-header">${t('frequency')}</div>
      <div class="rg-freq-list">${rows}</div>
    `;
  },

  async _renderAttrChart() {
    this._destroyChart();
    const area = this._container.querySelector('#rg-hist');
    if (!area) return;
    area.style.display = '';
    area.innerHTML = '';

    const freq = {};
    this._generatedData.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const attrOrder = this._state.attributes.map(a => a.name);
    const items = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => {
        const idx = attrOrder.indexOf(name);
        return { name, value, color: idx >= 0 ? this._attrColor(idx) : 'var(--color-chart-1)' };
      });

    this._chart = await this._context.chartManager.create(area, 'pareto', {
      title: this._t('distAttributive') + ' — ' + this._t('frequency'),
      items,
      refLineValue: 80,
    });
  },

  _renderAttrData() {
    const displayMax = 2000;
    const shown = this._generatedData.slice(0, displayMax);
    const t = (k) => this._t(k);
    const total = this._generatedData.length;
    const attrOrder = this._state.attributes.map(a => a.name);
    const host = this._container.querySelector('#rg-data');
    if (!host) return;
    host.innerHTML = `
      <div class="rg-data">
        <div class="rg-data__header">
          <div class="rg-data__title">${t('generatedData')}</div>
          <div class="rg-data__count">${total > displayMax ? `${displayMax} / ${total}` : `${total}`}</div>
        </div>
        <div class="rg-data__grid">
          <div class="rg-attr-chips">
            ${shown.map(v => {
              const idx = attrOrder.indexOf(v);
              const color = idx >= 0 ? this._attrColor(idx) : 'var(--color-text-tertiary)';
              return `<span class="rg-attr-chip" style="--rg-attr-color:${color}">${this._escapeHTML(v)}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  },
};
