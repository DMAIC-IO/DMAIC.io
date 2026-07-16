/**
 * D.Mike — Random Variates Engine (random-variates-engine.js)
 *
 * Pure, general-purpose statistical RNG. Owns:
 *   - Seeded PRNG (Mulberry32)
 *   - Distribution registry (25 distributions: continuous + discrete) + sampling
 *   - The Algorithm-Lab API `generateRandomVariates`
 *   - Module sampling wrapper `generateSamples`
 *   - Numeric input helpers `resolveParams` / `clampCount`
 *
 * No DOM, no i18n (`_t`), no chartManager. The per-distribution `nameKey`,
 * `categoryKey`, `formula` and `label`/`hint` strings stored on the registry are
 * raw DATA — they are resolved/translated by the consuming module's view layer,
 * never inside this engine.
 *
 * Extracted from modules/random-generator/random-generator-model.js (behaviour
 * byte-identical: same seed → same sequence).
 */

// ═══════════════════════════════════════════════════════════════
// Seeded PRNG — Mulberry32
// ═══════════════════════════════════════════════════════════════

/** @param {number} seed @returns {() => number} */
export function mulberry32(seed) {
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
export const DISTRIBUTIONS = {
  // ── Continuous ──
  normal: {
    nameKey: 'distNormal', categoryKey: 'catContinuous',
    formula: 'X ~ SinhArcSinh(μ, σ, ε, δ)',
    params: [
      { id: 'mu', label: 'Mittelwert (μ)', labelEn: 'Mean (μ)', default: 0 },
      { id: 'sigma', label: 'Std.-Abw. (σ)', labelEn: 'Std. Dev. (σ)', default: 1, min: 0.0001 },
      { id: 'epsilon', label: 'Schiefe (ε)', labelEn: 'Skewness (ε)', default: 0, hint: '0 = symmetrisch', hintEn: '0 = symmetric' },
      { id: 'delta', label: 'Tailweight (δ)', labelEn: 'Tailweight (δ)', default: 1, min: 0.01, hint: '1 = normal', hintEn: '1 = normal' },
    ],
    generate(rng, p) {
      const z = stdNormal(rng);
      return p.mu + p.sigma * Math.sinh((Math.asinh(z) + p.epsilon) / p.delta);
    },
  },
  chisquare: {
    nameKey: 'distChiSquare', categoryKey: 'catContinuous',
    formula: 'X ~ χ²(k)',
    params: [{ id: 'k', label: 'Freiheitsgrade (k)', labelEn: 'Degrees of freedom (k)', default: 5, min: 1, step: 1 }],
    generate(rng, p) { return gammaVariate(rng, p.k / 2, 2); },
  },
  f_dist: {
    nameKey: 'distF', categoryKey: 'catContinuous',
    formula: 'X ~ F(d₁, d₂)',
    params: [
      { id: 'd1', label: 'Freiheitsgrade d₁', labelEn: 'Degrees of freedom d₁', default: 5, min: 1, step: 1 },
      { id: 'd2', label: 'Freiheitsgrade d₂', labelEn: 'Degrees of freedom d₂', default: 10, min: 1, step: 1 },
    ],
    generate(rng, p) {
      const x1 = gammaVariate(rng, p.d1 / 2, 2);
      const x2 = gammaVariate(rng, p.d2 / 2, 2);
      return (x1 / p.d1) / (x2 / p.d2);
    },
  },
  t_dist: {
    nameKey: 'distT', categoryKey: 'catContinuous',
    formula: 'X ~ t(ν)',
    params: [{ id: 'nu', label: 'Freiheitsgrade (ν)', labelEn: 'Degrees of freedom (ν)', default: 10, min: 1, step: 1 }],
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
    formula: 'X ~ Beta(α, β)',
    params: [
      { id: 'alpha', label: 'Form α', labelEn: 'Shape α', default: 2, min: 0.01 },
      { id: 'beta', label: 'Form β', labelEn: 'Shape β', default: 5, min: 0.01 },
    ],
    generate(rng, p) { return betaVariate(rng, p.alpha, p.beta); },
  },
  cauchy: {
    nameKey: 'distCauchy', categoryKey: 'catContinuous',
    formula: 'X ~ Cauchy(x₀, γ)',
    params: [
      { id: 'x0', label: 'Lage (x₀)', labelEn: 'Location (x₀)', default: 0 },
      { id: 'gamma', label: 'Skala (γ)', labelEn: 'Scale (γ)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.x0 + p.gamma * Math.tan(Math.PI * (rng() - 0.5)); },
  },
  exponential: {
    nameKey: 'distExponential', categoryKey: 'catContinuous',
    formula: 'X ~ Exp(λ)',
    params: [{ id: 'lambda', label: 'Rate (λ)', labelEn: 'Rate (λ)', default: 1, min: 0.0001 }],
    generate(rng, p) { return -Math.log(1 - rng()) / p.lambda; },
  },
  gamma_dist: {
    nameKey: 'distGamma', categoryKey: 'catContinuous',
    formula: 'X ~ Gamma(α, β)',
    params: [
      { id: 'alpha', label: 'Form (α)', labelEn: 'Shape (α)', default: 2, min: 0.01 },
      { id: 'beta', label: 'Skala (β)', labelEn: 'Scale (β)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return gammaVariate(rng, p.alpha, p.beta); },
  },
  laplace: {
    nameKey: 'distLaplace', categoryKey: 'catContinuous',
    formula: 'X ~ Laplace(μ, b)',
    params: [
      { id: 'mu', label: 'Lage (μ)', labelEn: 'Location (μ)', default: 0 },
      { id: 'b', label: 'Skala (b)', labelEn: 'Scale (b)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) {
      const u = rng() - 0.5;
      return p.mu - p.b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    },
  },
  gumbel_max: {
    nameKey: 'distGumbelMax', categoryKey: 'catContinuous',
    formula: 'X ~ GumbelMax(μ, β)',
    params: [
      { id: 'mu', label: 'Lage (μ)', labelEn: 'Location (μ)', default: 0 },
      { id: 'beta', label: 'Skala (β)', labelEn: 'Scale (β)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return p.mu - p.beta * Math.log(-Math.log(rng())); },
  },
  logistic: {
    nameKey: 'distLogistic', categoryKey: 'catContinuous',
    formula: 'X ~ Logistic(μ, s)',
    params: [
      { id: 'mu', label: 'Lage (μ)', labelEn: 'Location (μ)', default: 0 },
      { id: 's', label: 'Skala (s)', labelEn: 'Scale (s)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { const u = rng(); return p.mu + p.s * Math.log(u / (1 - u)); },
  },
  loglogistic: {
    nameKey: 'distLogLogistic', categoryKey: 'catContinuous',
    formula: 'X ~ LogLogistic(α, β)',
    params: [
      { id: 'alpha', label: 'Skala (α)', labelEn: 'Scale (α)', default: 1, min: 0.0001 },
      { id: 'beta', label: 'Form (β)', labelEn: 'Shape (β)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) {
      const u = rng();
      return p.alpha * Math.pow(u / (1 - u), 1 / p.beta);
    },
  },
  lognormal: {
    nameKey: 'distLogNormal', categoryKey: 'catContinuous',
    formula: 'X ~ LogN(μ, σ)',
    params: [
      { id: 'mu', label: 'Log-Mittelwert (μ)', labelEn: 'Log-Mean (μ)', default: 0 },
      { id: 'sigma', label: 'Log-Std.Abw. (σ)', labelEn: 'Log-Std.Dev. (σ)', default: 1, min: 0.0001 },
    ],
    generate(rng, p) { return Math.exp(stdNormal(rng) * p.sigma + p.mu); },
  },
  gumbel_min: {
    nameKey: 'distGumbelMin', categoryKey: 'catContinuous',
    formula: 'X ~ GumbelMin(μ, β)',
    params: [
      { id: 'mu', label: 'Lage (μ)', labelEn: 'Location (μ)', default: 0 },
      { id: 'beta', label: 'Skala (β)', labelEn: 'Scale (β)', default: 1, min: 0.0001 },
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
    formula: 'X ~ Weibull(α, β)',
    params: [
      { id: 'alpha', label: 'Form (α)', labelEn: 'Shape (α)', default: 1.5, min: 0.0001 },
      { id: 'beta', label: 'Skala (β)', labelEn: 'Scale (β)', default: 1, min: 0.0001 },
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
      const L = Math.exp(-g);
      let x = 0, p = 1;
      do { x++; p *= rng(); } while (p > L);
      return x - 1;
    },
    discrete: true,
  },
  hypergeometric: {
    nameKey: 'distHypergeometric', categoryKey: 'catDiscrete',
    formula: 'X ~ HyperGeo(N, K, n)',
    params: [
      { id: 'N', label: 'Populationsgröße (N)', labelEn: 'Population size (N)', default: 100, min: 1, step: 1 },
      { id: 'K', label: 'Erfolgszust. (K)', labelEn: 'Success states (K)', default: 30, min: 0, step: 1 },
      { id: 'n', label: 'Stichprobe (n)', labelEn: 'Sample size (n)', default: 10, min: 1, step: 1 },
    ],
    generate(rng, par) {
      const n = par.n;
      let N = par.N, K = par.K, s = 0;
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
    formula: 'X ~ Poi(λ)',
    params: [{ id: 'lambda', label: 'Rate (λ)', labelEn: 'Rate (λ)', default: 5, min: 0.01 }],
    generate(rng, par) {
      if (par.lambda < 30) {
        const L = Math.exp(-par.lambda);
        let k = 0, p = 1;
        do { k++; p *= rng(); } while (p > L);
        return k - 1;
      }
      return Math.max(0, Math.round(stdNormal(rng) * Math.sqrt(par.lambda) + par.lambda));
    },
    discrete: true,
  },
  mvnormal: {
    nameKey: 'distMvNormal', categoryKey: 'catContinuous',
    formula: 'X ~ N₂(μ, Σ)',
    params: [
      { id: 'mu1', label: 'Mittelwert μ₁', labelEn: 'Mean μ₁', default: 0 },
      { id: 'mu2', label: 'Mittelwert μ₂', labelEn: 'Mean μ₂', default: 0 },
      { id: 'sigma1', label: 'Std.Abw. σ₁', labelEn: 'Std.Dev. σ₁', default: 1, min: 0.0001 },
      { id: 'sigma2', label: 'Std.Abw. σ₂', labelEn: 'Std.Dev. σ₂', default: 1, min: 0.0001 },
      { id: 'rho', label: 'Korrelation ρ', labelEn: 'Correlation ρ', default: 0.5, min: -0.999, max: 0.999 },
    ],
    generate(rng, p) {
      const [z1] = normalPair(rng);
      return p.mu1 + p.sigma1 * z1;
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// Sampling helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Generate random variates from a named distribution (Algorithm-Lab API).
 * @param {string} distribution — key into DISTRIBUTIONS
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

/**
 * Generate `count` samples from a distribution. Thin wrapper used by the module
 * (returns just the value array). Assumes a valid distribution key.
 * @param {string} distKey
 * @param {object} params — already resolved numeric params
 * @param {number} count
 * @param {number} seed
 * @returns {number[]}
 */
export function generateSamples(distKey, params, count, seed) {
  const dist = DISTRIBUTIONS[distKey];
  if (!dist) return [];
  const rng = mulberry32(seed);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = dist.generate(rng, params);
  return out;
}

/**
 * Resolve raw input strings to numeric distribution parameters, falling back to
 * each param's default when the input is missing or non-numeric (NaN).
 * @param {string} distKey
 * @param {Record<string, any>} rawInputs
 * @returns {Record<string, number>}
 */
export function resolveParams(distKey, rawInputs) {
  const dist = DISTRIBUTIONS[distKey];
  const params = {};
  if (!dist) return params;
  const raw = rawInputs || {};
  dist.params.forEach(p => {
    let v = parseFloat(raw[p.id]);
    if (isNaN(v)) v = p.default;
    params[p.id] = v;
  });
  return params;
}

/**
 * Clamp a sample count into [1, 100000]. Non-numeric → fallback default.
 * @param {number|string} n
 * @param {number} [fallback=1000]
 * @returns {number}
 */
export function clampCount(n, fallback = 1000) {
  const parsed = parseInt(n);
  if (!Number.isFinite(parsed)) return Math.min(100000, Math.max(1, fallback));
  return Math.min(100000, Math.max(1, parsed));
}
