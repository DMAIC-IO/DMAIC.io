/**
 * D.Mike — Distribution Fit Engine (distribution-fit-engine.js)
 *
 * Fits data to 7 distributions:
 *   Continuous: Normal, Log-Normal, Weibull, Exponential, Gamma
 *   Discrete:   Poisson, Binomial
 *
 * Goodness-of-Fit tests:
 *   - Kolmogorov-Smirnov (continuous distributions)
 *   - Chi-Squared (discrete distributions)
 *
 * Normality deep-dive:
 *   - Shapiro-Wilk, Anderson-Darling, Jarque-Bera, D'Agostino-Pearson
 *
 * Based on: prototypes/distribution-fit.html
 */

import { mean, variance, stddev } from './stats-utils.js';
export { mean, variance };
export { stddev as std };
const std = stddev;

/** @param {number[]} a */
export function skewness(a) {
  const m = mean(a), s = std(a), n = a.length;
  return (n / ((n - 1) * (n - 2))) * a.reduce((r, v) => r + ((v - m) / s) ** 3, 0);
}

/** @param {number[]} a */
export function kurtosis(a) {
  const m = mean(a), s = std(a), n = a.length;
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * a.reduce((r, v) => r + ((v - m) / s) ** 4, 0) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

/** @param {number[]} a */
export function median(a) {
  const s = [...a].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Compute descriptive statistics for a dataset.
 * @param {number[]} data
 * @returns {object}
 */
export function descriptiveStats(data) {
  return {
    n: data.length,
    mean: mean(data),
    stdDev: std(data),
    median: median(data),
    skewness: skewness(data),
    kurtosis: kurtosis(data),
    min: Math.min(...data),
    max: Math.max(...data),
  };
}

// ─── Special Functions (from math-utils.js) ─────────────────

import {
  erf, normalCDF, normalPDF, normalQuantile,
  lnGamma, gammaFn, gammainc, chi2CDF,
} from './math-utils.js';

import {
  shapiroWilk as _swTest,
  andersonDarling as _adTest,
  jarqueBera as _jbTest,
  dagostinoPearson as _dpTest,
} from './normality-test-engine.js';

// Aliases used internally
const stdNormalCDF = (x) => normalCDF(x);
const stdNormalQuantile = normalQuantile;

// ─── Distribution CDFs & PDFs ────────────────────────────────

function lognormalCDF(x, mu, s) { if (x <= 0) return 0; return 0.5 * (1 + erf((Math.log(x) - mu) / (s * Math.sqrt(2)))); }
function lognormalPDF(x, mu, s) { if (x <= 0) return 0; return (1 / (x * s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((Math.log(x) - mu) / s) ** 2); }

function expCDF(x, l) { return x < 0 ? 0 : 1 - Math.exp(-l * x); }
function expPDF(x, l) { return x < 0 ? 0 : l * Math.exp(-l * x); }

function gammaCDF(x, a, b) { if (x <= 0) return 0; return gammainc(a, b * x); }
function gammaPDF(x, a, b) { if (x <= 0) return 0; return (Math.pow(b, a) / gammaFn(a)) * Math.pow(x, a - 1) * Math.exp(-b * x); }

function weibullCDF(x, k, l) { if (x < 0) return 0; return 1 - Math.exp(-Math.pow(x / l, k)); }
function weibullPDF(x, k, l) { if (x < 0) return 0; return (k / l) * Math.pow(x / l, k - 1) * Math.exp(-Math.pow(x / l, k)); }

function poissonPMF(k, l) { if (k < 0 || !Number.isInteger(k)) return 0; return Math.exp(k * Math.log(l) - l - lnGamma(k + 1)); }
function poissonCDF(k, l) { let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += poissonPMF(i, l); return Math.min(s, 1); }

function binomCoeff(n, k) { if (k > n) return 0; return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1)); }
function binomialPMF(k, n, p) { if (k < 0 || k > n) return 0; return binomCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); }
function binomialCDF(k, n, p) { let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += binomialPMF(i, n, p); return Math.min(s, 1); }

// ─── Fitting Functions ───────────────────────────────────────

/** @param {number[]} d @returns {{ name: string, type: string, params: object, cdf: function, pdf?: function, pmf?: function }|null} */
function fitNormal(d) {
  const mu = mean(d), sigma = std(d);
  return { name: 'Normal', type: 'cont', params: { '\u03bc': mu, '\u03c3': sigma }, cdf: x => normalCDF(x, mu, sigma), pdf: x => normalPDF(x, mu, sigma) };
}

function fitLogNormal(d) {
  const p = d.filter(v => v > 0);
  if (p.length < 3) return null;
  const ld = p.map(v => Math.log(v)), mu = mean(ld), sigma = std(ld);
  return { name: 'Log-Normal', type: 'cont', params: { '\u03bc_log': mu, '\u03c3_log': sigma }, cdf: x => lognormalCDF(x, mu, sigma), pdf: x => lognormalPDF(x, mu, sigma) };
}

function fitExponential(d) {
  const p = d.filter(v => v > 0);
  if (p.length < 3) return null;
  const l = 1 / mean(p);
  return { name: 'Exponential', type: 'cont', params: { '\u03bb': l }, cdf: x => expCDF(x, l), pdf: x => expPDF(x, l) };
}

function fitGamma(d) {
  const p = d.filter(v => v > 0);
  if (p.length < 3) return null;
  const m = mean(p), v = variance(p), a = m * m / v, b = m / v;
  return { name: 'Gamma', type: 'cont', params: { '\u03b1': a, '\u03b2': b }, cdf: x => gammaCDF(x, a, b), pdf: x => gammaPDF(x, a, b) };
}

function fitWeibull(d) {
  const p = d.filter(v => v > 0);
  if (p.length < 5) return null;
  const n = p.length, lnX = p.map(v => Math.log(v));
  let k = 1.2;
  for (let iter = 0; iter < 100; iter++) {
    const xk = p.map(v => Math.pow(v, k));
    const xkLnx = p.map((v, i) => Math.pow(v, k) * lnX[i]);
    const sumXk = xk.reduce((s, v) => s + v, 0);
    const sumXkLnx = xkLnx.reduce((s, v) => s + v, 0);
    const sumLnx = lnX.reduce((s, v) => s + v, 0);
    const xkLnx2 = p.map((v, i) => Math.pow(v, k) * lnX[i] * lnX[i]);
    const sumXkLnx2 = xkLnx2.reduce((s, v) => s + v, 0);
    const fk = sumLnx / n - sumXkLnx / sumXk + 1 / k;
    const fpk = -sumXkLnx2 / sumXk + (sumXkLnx / sumXk) ** 2 - 1 / (k * k);
    const kN = k - fk / fpk;
    if (Math.abs(kN - k) < 1e-8) { k = kN; break; }
    k = Math.max(kN, 0.01);
  }
  const l = Math.pow(p.reduce((s, v) => s + Math.pow(v, k), 0) / n, 1 / k);
  return { name: 'Weibull', type: 'cont', params: { k, '\u03bb': l }, cdf: x => weibullCDF(x, k, l), pdf: x => weibullPDF(x, k, l) };
}

function fitPoisson(d) {
  const i = d.filter(v => v >= 0 && Number.isInteger(v));
  if (i.length < 3) return null;
  const l = mean(i);
  return { name: 'Poisson', type: 'disc', params: { '\u03bb': l }, pmf: k => poissonPMF(k, l), cdf: k => poissonCDF(k, l) };
}

function fitBinomial(d) {
  const i = d.filter(v => v >= 0 && Number.isInteger(v));
  if (i.length < 3) return null;
  const n = Math.max(...i);
  if (n === 0) return null;
  const p = mean(i) / n;
  return { name: 'Binomial', type: 'disc', params: { n, p }, pmf: k => binomialPMF(k, n, p), cdf: k => binomialCDF(k, n, p) };
}

// ─── Goodness-of-Fit Tests ───────────────────────────────────

/** Kolmogorov-Smirnov test for continuous distributions. */
function ksTest(data, cdfFn) {
  const sorted = [...data].sort((a, b) => a - b), n = sorted.length;
  let dP = 0, dM = 0;
  for (let i = 0; i < n; i++) {
    const Fn = (i + 1) / n, FnP = i / n, Fx = cdfFn(sorted[i]);
    dP = Math.max(dP, Fn - Fx);
    dM = Math.max(dM, Fx - FnP);
  }
  const D = Math.max(dP, dM), sqN = Math.sqrt(n);
  const z = (sqN + 0.12 + 0.11 / sqN) * D;
  let p = 0;
  for (let k = 1; k <= 100; k++) p += 2 * Math.pow(-1, k + 1) * Math.exp(-2 * k * k * z * z);
  return { D, p: Math.max(0, Math.min(1, p)) };
}

/** Chi-Squared test for discrete distributions. */
function chiSquaredTest(data, pmfFn, maxK) {
  const n = data.length, obs = {};
  data.forEach(v => { obs[v] = (obs[v] || 0) + 1; });
  let chi2 = 0, df = 0;
  for (let k = 0; k <= maxK; k++) {
    const O = obs[k] || 0, E = n * pmfFn(k);
    if (E >= 1) { chi2 += (O - E) ** 2 / E; df++; }
  }
  df = Math.max(df - 2, 1);
  return { chi2, df, p: Math.max(0, Math.min(1, 1 - gammainc(df / 2, chi2 / 2))) };
}

// ─── Normality Deep-Dive Tests (delegated to normality-test-engine) ──

/** Shapiro-Wilk test — wrapper around validated AS R94 implementation. */
function shapiroWilk(data) {
  try {
    const r = _swTest(data);
    return { W: r.statistic, p: r.pValue, name: 'Shapiro-Wilk' };
  } catch { return null; }
}

/** Anderson-Darling test — wrapper around validated implementation. */
function andersonDarling(data) {
  try {
    const r = _adTest(data);
    return { A2: r.statistic, p: r.pValue, name: 'Anderson-Darling' };
  } catch { return null; }
}

/** Jarque-Bera test — wrapper around validated implementation. */
function jarqueBera(data) {
  const n = data.length;
  if (n < 8) return { JB: NaN, p: NaN, name: 'Jarque-Bera', tooSmall: true };
  try {
    const r = _jbTest(data);
    return { JB: r.statistic, p: r.pValue, skewness: r.skewness, exKurtosis: r.kurtosis, name: 'Jarque-Bera' };
  } catch { return null; }
}

/** D'Agostino-Pearson omnibus test — wrapper around validated implementation. */
function dagostinoPearson(data) {
  const n = data.length;
  if (n < 20) return { K2: NaN, p: NaN, skewZ: NaN, kurtZ: NaN, name: "D'Agostino-Pearson", tooSmall: true };
  try {
    const r = _dpTest(data);
    return { K2: r.statistic, p: r.pValue, skewZ: r.skewnessZ, kurtZ: r.kurtosisZ, skewness: r.skewness, exKurtosis: r.kurtosis, name: "D'Agostino-Pearson" };
  } catch { return null; }
}

// ─── Distribution Colors (for chart rendering) ──────────────

export const DIST_COLORS = {
  'Normal': 'var(--color-chart-1)',
  'Log-Normal': 'var(--color-chart-3)',
  'Weibull': 'var(--color-chart-4)',
  'Exponential': 'var(--color-chart-5)',
  'Gamma': 'var(--color-chart-2)',
  'Poisson': 'var(--color-chart-6)',
  'Binomial': 'var(--color-chart-7)',
};

// ─── Main Analysis Function ──────────────────────────────────

/**
 * Fit multiple distributions to data and rank by GOF test p-value.
 * @param {number[]} data - Array of numeric values (at least 5)
 * @param {'auto'|'continuous'|'discrete'} dataType
 * @returns {{ stats: object, results: object[], normalityTests: object[] }}
 */
export function runDistributionFit(data, dataType = 'auto') {
  if (data.length < 5) throw new Error('minData');
  if (std(data) === 0) throw new Error('zeroVariance');

  const stats = descriptiveStats(data);

  const isDiscrete = dataType === 'discrete' || (dataType === 'auto' && data.every(v => Number.isInteger(v)));
  const isContinuous = dataType === 'continuous' || (dataType === 'auto' && !data.every(v => Number.isInteger(v)));
  const both = dataType === 'auto' && data.every(v => Number.isInteger(v));

  const results = [];

  if (isContinuous || both) {
    const fitters = [fitNormal, fitLogNormal, fitWeibull, fitExponential, fitGamma];
    for (const fitter of fitters) {
      const fit = fitter(data);
      if (!fit) continue;
      const ks = ksTest(data, fit.cdf);
      results.push({ ...fit, ks, score: ks.p });
    }
  }

  if (isDiscrete || both) {
    const maxK = Math.max(...data) + 5;
    const pois = fitPoisson(data);
    if (pois) {
      const cs = chiSquaredTest(data, pois.pmf, maxK);
      results.push({ ...pois, chi2: cs, score: cs.p });
    }
    const binom = fitBinomial(data);
    if (binom) {
      const cs = chiSquaredTest(data, binom.pmf, maxK);
      results.push({ ...binom, chi2: cs, score: cs.p });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const normalityTests = [shapiroWilk(data), andersonDarling(data), jarqueBera(data), dagostinoPearson(data)].filter(Boolean);

  return { stats, results, normalityTests };
}
