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

import { mean } from './stats-utils.js';

/** Bisection steps; 200 halvings reach double precision on any bracket used here. */
const BISECT_STEPS = 200;
/** Number of grid intervals for the root scan of H on the log scale. */
const GRID_STEPS = 6000;
/** Golden-section iterations; the bracket shrinks by 0.618 per step (x tolerance far below 1e-14). */
const GOLDEN_STEPS = 100;
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
