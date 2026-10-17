/**
 * D.Mike — Bonett variance tests (bonett-engine.js)
 *
 *   - bonettVarianceTest — one-sample σ² (Bonett 2006; Minitab "1 Variance")
 *   - bonettRatioTest    — two-sample σ₁²/σ₂² (Banga & Fox 2013; Minitab "2 Variances")
 *
 * Robust to non-normal data through a kurtosis estimate built on a trimmed
 * mean. Reference values: Python (tools/fixture-generator/generators/bonett.py),
 * checked against Minitab.
 */

import { mean, variance } from './stats-utils.js';
import { normalUpperTailPrecise, normalQuantilePrecise } from './normal-precise.js';

/** Bisection steps; 200 halvings reach double precision on any bracket used here. */
const BISECT_STEPS = 200;
/** Number of grid intervals for the root scan of H on the log scale. */
const GRID_STEPS = 6000;
/** Golden-section iterations; the bracket shrinks by 0.618 per step (x tolerance far below 1e-14). */
const GOLDEN_STEPS = 100;
/** z beyond which 1 − Φ(z) underflows; a bound that is not crossed by here means p = 0. */
const Z_CAP = 40;
const INV_PHI = (Math.sqrt(5) - 1) / 2;

/**
 * Mean after trimming floor(n · proportion) values from each tail.
 * @param {number[]} data
 * @param {number} proportion trim proportion per tail
 * @returns {number}
 */
export function trimmedMean(data, proportion) {
  const s = [...data].sort((a, b) => a - b);
  const k = Math.floor(s.length * proportion);
  return mean(s.slice(k, s.length - k));
}

function center(data) {
  const n = data.length;
  return n <= 5 ? mean(data) : trimmedMean(data, 1 / (2 * Math.sqrt(n - 4)));
}

function fourthMoment(data) {
  const m = center(data);
  return data.reduce((s, x) => s + (x - m) ** 4, 0);
}

/**
 * Bonett kurtosis estimate γ̂ = n·Σ(x−m)⁴ / (Σ(x−x̄)²)², m the trimmed mean.
 * @param {number[]} data
 * @returns {number}
 */
export function bonettKurtosis(data) {
  const xbar = mean(data);
  const ss = data.reduce((s, x) => s + (x - xbar) ** 2, 0);
  return data.length * fourthMoment(data) / (ss * ss);
}

/** Root of f in [a, b] by bisection; f(a) and f(b) must have opposite signs (or f(a) = 0). */
function bisect(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < BISECT_STEPS; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

/** Minimiser of a unimodal f on [a, b] by golden-section search. */
function goldenMin(f, a, b) {
  let c = b - INV_PHI * (b - a), d = a + INV_PHI * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < GOLDEN_STEPS; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - INV_PHI * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + INV_PHI * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/**
 * All roots of f on [a, b], sorted. A sign-change scan on a grid finds
 * well-separated roots; a pair closer than the grid step shows up as a
 * positive interior grid minimum, which is refined and, if f <= 0 there,
 * contributes the two roots on either side.
 */
function gridRoots(f, a, b, steps) {
  const xs = [], vals = [];
  for (let i = 0; i <= steps; i++) {
    const x = a + (b - a) * i / steps;
    xs.push(x); vals.push(f(x));
  }
  const roots = [];
  for (let i = 0; i < steps; i++) {
    if (vals[i] * vals[i + 1] < 0) roots.push(bisect(f, xs[i], xs[i + 1]));
  }
  for (let i = 1; i < steps; i++) {
    if (vals[i - 1] > vals[i] && vals[i] < vals[i + 1] && vals[i] > 0) {
      const xm = goldenMin(f, xs[i - 1], xs[i + 1]);
      if (f(xm) <= 0) {
        roots.push(bisect(f, xs[i - 1], xm), bisect(f, xm, xs[i + 1]));
      }
    }
  }
  return roots.sort((p, q) => p - q);
}

/**
 * CI for σ₁²/σ₂² from summary statistics (Banga & Fox 2013, p. 10). With
 * more than two roots of H the confidence set is not an interval; the hull
 * [smallest, largest] is reported.
 * @param {{n1:number,n2:number,var1:number,var2:number,kurt1:number,kurt2:number}} s
 * @param {number} z normal quantile
 * @returns {{lower:number, upper:number, roots:number[]}} roots of H in x (before scaling by c·ρ̂²)
 */
export function bonettRatioCI({ n1, n2, var1, var2, kurt1, kurt2 }, z) {
  const A = (n1 + n2) * (n1 + n2 - 2) / ((n1 - 1) * (n2 - 1));
  const B = (n1 - 3) / n1 / (n1 - 1) + (n2 - 3) / n2 / (n2 - 1);
  const K = (n1 - 1) / (n2 - 1);
  const c = (n1 / (n1 - z)) * ((n2 - z) / n2);
  const H = (logX) => {
    const cx = c * Math.exp(logX);
    const se2 = A * (kurt1 * K * K / n1 + kurt2 * cx * cx / n2) / ((K + cx) ** 2) - B;
    return logX * logX - z * z * se2;
  };
  const roots = gridRoots(H, Math.log(1e-12), Math.log(1e12), GRID_STEPS).map(Math.exp);
  if (roots.length < 2) throw new Error('Bonett ratio CI: confidence set is unbounded');
  const scale = c * var1 / var2;
  return { lower: scale * roots[0], upper: scale * roots[roots.length - 1], roots };
}

/**
 * Log-domain CI limits of the one-sample test. The p-value search compares
 * these with log(σ₀²) directly: exp of a large limit would overflow as z → n.
 * @returns {[number, number]} [log lower, log upper]
 */
function oneSampleLogLimits(n, s2, kurt, z) {
  const c = n / (n - z);
  const se = c * Math.sqrt(Math.max(0, (kurt - (n - 3) / n) / (n - 1)));
  const centre = Math.log(c * s2);
  return [centre - z * se, centre + z * se];
}

function oneSampleLimits(n, s2, kurt, z) {
  return oneSampleLogLimits(n, s2, kurt, z).map(Math.exp);
}

/**
 * One-sided p-values by inverting the CI: the α at which the lower (upper)
 * bound — computed with z_α — reaches σ₀². At z = 0 both bounds equal s²,
 * so the side of s² that σ₀² lies on decides which bound is inverted.
 * The first (smallest-z) crossing on the grid is used, as in the Python reference.
 * @returns {[number, number]} [α_L (H₁: σ² > σ₀²), α_U (H₁: σ² < σ₀²)]
 */
function oneSampleAlphas(n, s2, kurt, sigma0Sq) {
  if (sigma0Sq === s2) return [0.5, 0.5];
  const lower = sigma0Sq < s2;
  const idx = lower ? 0 : 1;
  const cap = Math.min(Z_CAP, n * (1 - 1e-9));
  const logSigma0 = Math.log(sigma0Sq);
  const f = (z) => oneSampleLogLimits(n, s2, kurt, z)[idx] - logSigma0;
  const roots = gridRoots(f, 1e-9, cap, 4000);
  const tail = roots.length ? normalUpperTailPrecise(roots[0]) : 0;
  return lower ? [tail, 1 - tail] : [1 - tail, tail];
}

/** Sum of squared deviations from the plain mean. */
function sumSquares(data) {
  const m = mean(data);
  return data.reduce((s, x) => s + (x - m) ** 2, 0);
}

/** Pooled kurtosis under ρ = 1 (equal variances), trimmed-mean fourth moments, plain-mean SS. */
function pooledKurtosisAtOne(d1, d2) {
  return (d1.length + d2.length) * (fourthMoment(d1) + fourthMoment(d2))
    / ((sumSquares(d1) + sumSquares(d2)) ** 2);
}

/** Root of f on [a, b] where f(a)·f(b) <= 0; converges to the jump point if f jumps across 0. */
function solveBracket(f, a, b) {
  const fa = f(a);
  if (fa === 0) return a;
  if (f(b) === 0) return b;
  return bisect(f, a, b);
}

/**
 * One-sided p-values of the unbalanced ratio test by inverting the CI: the α at
 * which the lower (ratio > 1) or upper (ratio < 1) hull bound reaches 1. The
 * first bracket on the z grid is used; where the hull bound jumps across 1 (a
 * root pair is born) the solver converges to the jump point, as in the Python reference.
 * @returns {[number, number]} [α_L, α_U]
 */
function ratioAlphasUnbalanced(bounds, ratio, nMin) {
  if (ratio === 1) return [0.5, 0.5];
  const idx = ratio > 1 ? 0 : 1;
  const cap = Math.min(Z_CAP, nMin * (1 - 1e-9));
  const f = (z) => Math.log(bounds(z)[idx]);
  const steps = 800, lo = 1e-6;
  let tail = 0;
  let a = lo, fa = f(a);
  for (let i = 1; i <= steps; i++) {
    const b = lo + (cap - lo) * i / steps, fb = f(b);
    if (fa * fb <= 0) { tail = normalUpperTailPrecise(solveBracket(f, a, b)); break; }
    a = b; fa = fb;
  }
  return ratio > 1 ? [tail, 1 - tail] : [1 - tail, tail];
}

/**
 * Bonett test for the ratio of two variances (Banga & Fox 2013, Minitab
 * "2 Variances"). Balanced designs report T₂ ~ χ²(1); unbalanced designs
 * have no statistic and the p-value comes from inverting the CI.
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results; ci is for σ₁²/σ₂²
 */
export function bonettRatioTest(data1, data2, direction = 'two-sided', alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 2 || n2 < 2) throw new Error('At least 2 data points required');
  const var1 = variance(data1), var2 = variance(data2);
  if (!(var1 > 0) || !(var2 > 0)) throw new Error('Sample has zero variance');

  const summary = { n1, n2, var1, var2, kurt1: bonettKurtosis(data1), kurt2: bonettKurtosis(data2) };
  const bounds = (z) => { const r = bonettRatioCI(summary, z); return [r.lower, r.upper]; };
  const ratio = var1 / var2;

  let statistic = null, aL, aU, pTwo;
  if (n1 === n2) {
    const g1 = (n1 - 3) / n1, g2 = (n2 - 3) / n2;
    const gp = pooledKurtosisAtOne(data1, data2);
    statistic = Math.log(ratio) ** 2 / ((gp - g1) / (n1 - 1) + (gp - g2) / (n2 - 1));
    const zs = Math.sign(Math.log(ratio)) * Math.sqrt(statistic);
    aL = normalUpperTailPrecise(zs);
    aU = normalUpperTailPrecise(-zs);
    pTwo = 2 * normalUpperTailPrecise(Math.sqrt(statistic)); // χ²(1) upper tail
  } else {
    [aL, aU] = ratioAlphasUnbalanced(bounds, ratio, Math.min(n1, n2));
    pTwo = Math.min(1, 2 * Math.min(aL, aU));
  }

  const z = normalQuantilePrecise(direction === 'two-sided' ? 1 - alpha / 2 : 1 - alpha);
  const [lo, hi] = bounds(z);
  const ci = direction === 'two-sided' ? [lo, hi] : (direction === 'greater' ? [lo, null] : [null, hi]);
  const pValue = direction === 'two-sided' ? pTwo : (direction === 'greater' ? aL : aU);

  return {
    testName: 'Bonett Ratio Test',
    statistic,
    pValue,
    variance1: var1,
    variance2: var2,
    ratio,
    ci,
    reject: pValue < alpha,
    n1,
    n2,
    alpha,
    direction,
  };
}

/**
 * Bonett test for one variance (Bonett 2006, Minitab "1 Variance").
 * No test statistic; the p-value comes from inverting the CI.
 *
 * @param {number[]} data - Sample data
 * @param {number} sigma0Sq - Hypothesized variance σ₀²
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results; one-sided CIs have null on the open side
 */
export function bonettVarianceTest(data, sigma0Sq, direction = 'two-sided', alpha = 0.05) {
  const n = data.length;
  if (n < 2) throw new Error('At least 2 data points required');
  if (!(sigma0Sq > 0)) throw new Error('Hypothesized variance must be > 0');
  const s2 = variance(data);
  if (!(s2 > 0)) throw new Error('Sample has zero variance');
  const z = normalQuantilePrecise(direction === 'two-sided' ? 1 - alpha / 2 : 1 - alpha);
  if (n <= z) throw new Error('Bonett CI needs n > z');

  const kurt = bonettKurtosis(data);
  const [aL, aU] = oneSampleAlphas(n, s2, kurt, sigma0Sq);
  const [lo, hi] = oneSampleLimits(n, s2, kurt, z);
  let pValue, ci;
  if (direction === 'two-sided') { pValue = Math.min(1, 2 * Math.min(aL, aU)); ci = [lo, hi]; }
  else if (direction === 'greater') { pValue = aL; ci = [lo, null]; }
  else { pValue = aU; ci = [null, hi]; }

  return {
    testName: 'Bonett Variance Test',
    statistic: null,
    pValue,
    sampleVariance: s2,
    ci,
    ciSigma: ci.map(v => (v === null ? null : Math.sqrt(v))),
    reject: pValue < alpha,
    n,
    alpha,
    direction,
  };
}
