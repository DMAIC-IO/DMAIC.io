/**
 * D.Mike — Attribute test engine (attribute-test-engine.js)
 *
 * Tests on counts: Clopper-Pearson interval, 1- and 2-proportion tests,
 * Fisher's exact test (2×2) and the chi-square test of association (r×c).
 * Pure functions, no DOM, no i18n. Inputs are assumed valid — the module's
 * normalizer (attribute-test-input.js) rejects nonsense before calling in.
 *
 * Conventions (see docs/superpowers/specs/2026-10-10-attribute-tests-design.md):
 *  - 1 proportion: exact binomial test consistent with Clopper-Pearson,
 *    two-sided p = min(1, 2·min(P(X ≤ x), P(X ≥ x))). Minitab's adjusted
 *    Blaker interval is not implemented.
 *  - 2 proportions: z with separate estimates (default) or pooled SE, CI of
 *    the difference always unpooled; test difference fixed at 0.
 *  - Fisher two-sided: sum of all tables with P ≤ P_obs · (1 + 1e-7)
 *    (R and Minitab). Probabilities in log space via lnGamma.
 */

import {
  lnGamma, betaIncomplete, normalQuantile, chi2CDF, normalUpperTail,
} from './math-utils.js';

/** Relative tolerance for "as or less likely" in Fisher's two-sided test. */
const FISHER_REL_TOL = 1e-7;

/** Quantile of Beta(a, b) by bisection on the regularized incomplete beta. */
function betaQuantile(p, a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (betaIncomplete(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Standard normal quantile (zQuantile), Acklam refined by one Halley step. */
function zQuantile(p) {
  const x = normalQuantile(p);
  const e = (1 - normalUpperTail(x)) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

/** p-value of a z statistic for the given alternative. */
function normalP(z, direction) {
  if (direction === 'greater') return normalUpperTail(z);
  if (direction === 'less') return normalUpperTail(-z);
  return Math.min(1, 2 * normalUpperTail(Math.abs(z)));
}

/** P(X ≤ k) for X ~ Bin(n, p). */
function binomLE(k, n, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  return betaIncomplete(1 - p, n - k, k + 1);
}

/** P(X ≥ k) for X ~ Bin(n, p). */
function binomGE(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  return betaIncomplete(p, k, n - k + 1);
}

/** Natural log of the binomial coefficient C(n, k). */
function lnChoose(n, k) {
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/**
 * Exact (Clopper-Pearson) confidence interval for a binomial proportion.
 * One-sided alternatives give a one-sided bound; the open side is 0 or 1.
 * @param {number} x — events (0 ≤ x ≤ n)
 * @param {number} n — trials (> 0)
 * @param {number} [confidence=0.95]
 * @param {'two-sided'|'greater'|'less'} [direction='two-sided']
 * @returns {{ lower: number, upper: number }}
 */
export function clopperPearsonCI(x, n, confidence = 0.95, direction = 'two-sided') {
  const tail = direction === 'two-sided' ? (1 - confidence) / 2 : 1 - confidence;
  const lower = direction === 'less' || x === 0 ? 0 : betaQuantile(tail, x, n - x + 1);
  const upper = direction === 'greater' || x === n ? 1 : betaQuantile(1 - tail, x + 1, n - x);
  return { lower, upper };
}

/**
 * 1-proportion test: exact binomial test plus normal approximation.
 * @param {number} x — events
 * @param {number} n — trials
 * @param {number} [p0=0.5] — hypothesized proportion, 0 < p0 < 1
 * @param {'two-sided'|'greater'|'less'} [direction='two-sided']
 * @param {number} [alpha=0.05]
 * @returns {{ pHat: number, ciLower: number, ciUpper: number, pExact: number,
 *   z: number, pNormal: number, normalApproxOk: boolean, reject: boolean }}
 */
export function oneProportionTest(x, n, p0 = 0.5, direction = 'two-sided', alpha = 0.05) {
  const pHat = x / n;
  const { lower, upper } = clopperPearsonCI(x, n, 1 - alpha, direction);
  const le = binomLE(x, n, p0);
  const ge = binomGE(x, n, p0);
  let pExact;
  if (direction === 'greater') pExact = ge;
  else if (direction === 'less') pExact = le;
  else pExact = Math.min(1, 2 * Math.min(le, ge));
  const z = (pHat - p0) / Math.sqrt(p0 * (1 - p0) / n);
  return {
    pHat,
    ciLower: lower,
    ciUpper: upper,
    pExact,
    z,
    pNormal: normalP(z, direction),
    normalApproxOk: n * p0 >= 5 && n * (1 - p0) >= 5 && x > 0 && x < n,
    reject: pExact < alpha,
  };
}

/**
 * Fisher's exact test for a 2×2 table [[a, b], [c, d]].
 * "greater" tests odds ratio > 1 (a large), "less" odds ratio < 1.
 * @param {number[][]} table
 * @param {'two-sided'|'greater'|'less'} [direction='two-sided']
 * @returns {{ pValue: number, pLess: number, pGreater: number, oddsRatio: number|null }}
 */
export function fisherExact2x2(table, direction = 'two-sided') {
  const [[a, b], [c, d]] = table;
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  const logP = [];
  for (let k = lo; k <= hi; k++) logP.push(lnChoose(r1, k) + lnChoose(r2, c1 - k));
  let maxLog = -Infinity;
  for (const l of logP) if (l > maxLog) maxLog = l;
  const w = logP.map(l => Math.exp(l - maxLog));
  const total = w.reduce((s, v) => s + v, 0);
  const obs = w[a - lo];
  let pLess = 0;
  let pGreater = 0;
  let pTwo = 0;
  for (let i = 0; i < w.length; i++) {
    const k = lo + i;
    if (k <= a) pLess += w[i];
    if (k >= a) pGreater += w[i];
    if (w[i] <= obs * (1 + FISHER_REL_TOL)) pTwo += w[i];
  }
  pLess = Math.min(1, pLess / total);
  pGreater = Math.min(1, pGreater / total);
  pTwo = Math.min(1, pTwo / total);
  const pValue = direction === 'greater' ? pGreater : direction === 'less' ? pLess : pTwo;
  return { pValue, pLess, pGreater, oddsRatio: b * c === 0 ? null : (a * d) / (b * c) };
}

/**
 * 2-proportion test (difference 0) with Fisher's exact test as second p.
 * @param {number} x1 @param {number} n1 @param {number} x2 @param {number} n2
 * @param {'two-sided'|'greater'|'less'} [direction='two-sided']
 * @param {number} [alpha=0.05]
 * @param {boolean} [pooled=false] — pooled SE for the z statistic
 * @returns {{ p1: number, p2: number, diff: number, ciLower: number, ciUpper: number,
 *   z: number|null, pValue: number, pFisher: number, reject: boolean }}
 */
export function twoProportionTest(x1, n1, x2, n2, direction = 'two-sided', alpha = 0.05, pooled = false) {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const diff = p1 - p2;
  const se = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  const pp = (x1 + x2) / (n1 + n2);
  const seTest = pooled ? Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)) : se;

  let z = null;
  let pValue;
  if (seTest > 0) {
    z = diff / seTest;
    pValue = normalP(z, direction);
  } else if (diff === 0) {
    pValue = 1;
  } else if (direction === 'greater') {
    pValue = diff > 0 ? 0 : 1;
  } else if (direction === 'less') {
    pValue = diff < 0 ? 0 : 1;
  } else {
    pValue = 0;
  }

  let ciLower;
  let ciUpper;
  if (direction === 'two-sided') {
    const q = zQuantile(1 - alpha / 2);
    ciLower = diff - q * se;
    ciUpper = diff + q * se;
  } else if (direction === 'greater') {
    ciLower = diff - zQuantile(1 - alpha) * se;
    ciUpper = 1;
  } else {
    ciLower = -1;
    ciUpper = diff + zQuantile(1 - alpha) * se;
  }

  const pFisher = fisherExact2x2([[x1, n1 - x1], [x2, n2 - x2]], direction).pValue;
  return { p1, p2, diff, ciLower, ciUpper, z, pValue, pFisher, reject: pValue < alpha };
}

/**
 * Chi-square test of association for an r×c table of counts.
 * Rows/columns with total 0 are dropped (indices reported); fewer than 2×2
 * remaining → `{ testable: false, … }`. 2×2 adds Yates and Fisher
 * (two-sided, less, greater); those fields are null for larger tables.
 * @param {number[][]} table — rectangular, non-negative integers
 * @param {number} [alpha=0.05]
 * @returns {object} see the fixture fields of `chi-square-association`
 */
export function chiSquareAssociation(table, alpha = 0.05) {
  const nCols = table.length ? table[0].length : 0;
  const rowTot = table.map(r => r.reduce((s, v) => s + v, 0));
  const colTot = Array.from({ length: nCols }, (_, j) => table.reduce((s, r) => s + r[j], 0));
  const droppedRows = rowTot.flatMap((t, i) => (t === 0 ? [i] : []));
  const droppedCols = colTot.flatMap((t, j) => (t === 0 ? [j] : []));
  const keepCols = colTot.flatMap((t, j) => (t > 0 ? [j] : []));
  const observed = table.filter((_, i) => rowTot[i] > 0).map(r => keepCols.map(j => r[j]));

  const r = observed.length;
  const c = keepCols.length;
  if (r < 2 || c < 2) return { testable: false, observed, droppedRows, droppedCols };

  const R = observed.map(row => row.reduce((s, v) => s + v, 0));
  const C = Array.from({ length: c }, (_, j) => observed.reduce((s, row) => s + row[j], 0));
  const N = R.reduce((s, v) => s + v, 0);
  const expected = R.map(ri => C.map(cj => (ri * cj) / N));
  const contributions = observed.map((row, i) => row.map((o, j) => (o - expected[i][j]) ** 2 / expected[i][j]));

  let pearson = 0;
  let lr = 0;
  let below5 = 0;
  let minExpected = Infinity;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const o = observed[i][j];
      const e = expected[i][j];
      pearson += contributions[i][j];
      if (o > 0) lr += o * Math.log(o / e);
      if (e < 5) below5++;
      if (e < minExpected) minExpected = e;
    }
  }
  lr *= 2;
  const df = (r - 1) * (c - 1);
  const pPearson = 1 - chi2CDF(pearson, df);
  const shareBelow5 = below5 / (r * c);

  let yates = null;
  let pYates = null;
  let fisherTwoSided = null;
  let fisherLess = null;
  let fisherGreater = null;
  if (r === 2 && c === 2) {
    yates = 0;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const dev = Math.max(0, Math.abs(observed[i][j] - expected[i][j]) - 0.5);
        yates += (dev * dev) / expected[i][j];
      }
    }
    pYates = 1 - chi2CDF(yates, 1);
    const fisher = fisherExact2x2(observed, 'two-sided');
    fisherTwoSided = fisher.pValue;
    fisherLess = fisher.pLess;
    fisherGreater = fisher.pGreater;
  }

  return {
    testable: true,
    observed,
    droppedRows,
    droppedCols,
    expected,
    contributions,
    df,
    pearson,
    pPearson,
    lr,
    pLR: 1 - chi2CDF(lr, df),
    minExpected,
    shareBelow5,
    warnExpectedBelow1: minExpected < 1,
    warnShareBelow5: shareBelow5 > 0.2,
    yates,
    pYates,
    fisherTwoSided,
    fisherLess,
    fisherGreater,
    reject: pPearson < alpha,
  };
}
