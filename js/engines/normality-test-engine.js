/**
 * D.Mike — Normality Test Engine (normality-test-engine.js)
 *
 * Four normality tests:
 *   - Shapiro-Wilk        — gold standard for small samples (n = 3–50)
 *   - Anderson-Darling    — good for small to medium n, tail-sensitive
 *   - Jarque-Bera         — asymptotic test for large samples (n > 30)
 *   - D'Agostino-Pearson  — omnibus test combining skewness & kurtosis Z-scores (n ≥ 20)
 *
 * Based on: prototypes/normalityTests.js
 */

import { normalCDF, normalQuantile, chi2CDF } from './math-utils.js';

// Re-export normalQuantile for backward compatibility
export { normalQuantile };

// ─── Descriptive Statistics ──────────────────────────────────

/**
 * Compute descriptive statistics for a numeric array.
 * @param {number[]} data
 */
export function descriptiveStats(data) {
  const n = data.length;
  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((s, x) => s + x, 0) / n;
  const variance = data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of data) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const skewness = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  return { n, mean, stdDev, variance, min, max, median, skewness, kurtosis };
}

// ─── Shapiro-Wilk Test (AS R94 — Royston 1995) ──────────────

/**
 * Evaluate polynomial with SciPy/AS R94 coefficient ordering.
 * Coefficients stored as [c0, cn, cn-1, ..., c2, c1].
 * Evaluates c0 + c1·x + c2·x² + … + cn·xⁿ.
 * @param {number[]} c — coefficient array
 * @param {number} nord — number of coefficients to use
 * @param {number} x — evaluation point
 */
function _swPoly(c, nord, x) {
  let res = c[0];
  if (nord === 1) return res;
  let p = x * c[nord - 1];
  if (nord === 2) return res + p;
  for (let i = nord - 2; i >= 1; i--) p = (p + c[i]) * x;
  return res + p;
}

/**
 * Inverse normal distribution — AS R94 _ppnd (AS 111).
 * Matches SciPy's internal _ppnd exactly.
 * @param {number} p — probability (0 < p < 1)
 */
function _swPpnd(p) {
  const A0 = 2.50662823884, A1 = -18.61500062529;
  const A2 = 41.39119773534, A3 = -25.44106049637;
  const B1 = -8.47351093090, B2 = 23.08336743743;
  const B3 = -21.06224101826, B4 = 3.13082909833;
  const C0 = -2.78718931138, C1 = -2.29796479134;
  const C2 = 4.85014127135, C3 = 2.32121276858;
  const D1 = 3.54388924762, D2 = 1.63706781897;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.42) {
    const r = q * q;
    return q * (((A3 * r + A2) * r + A1) * r + A0) /
               ((((B4 * r + B3) * r + B2) * r + B1) * r + 1);
  }
  let r = q > 0 ? 1 - p : p;
  if (r <= 0) return 0;
  r = Math.sqrt(-Math.log(r));
  const t = (((C3 * r + C2) * r + C1) * r + C0) / ((D2 * r + D1) * r + 1);
  return q < 0 ? -t : t;
}

/**
 * Upper-tail area of standard normal — AS R94 _alnorm (AS 66).
 * @param {number} x
 * @param {boolean} upper — if true, returns P(Z > x)
 */
function _swAlnorm(x, upper) {
  const ltone = 7, utzero = 38, con = 1.28;
  let z = x;
  if (!(z > 0)) { upper = false; z = -z; }
  if (!((z <= ltone) || (upper && z <= utzero))) return upper ? 0 : 1;
  const y = 0.5 * z * z;
  let temp;
  if (z <= con) {
    temp = 0.5 - z * (0.398942280444 - 0.399903438504 * y /
      (y + 5.75885480458 - 29.8213557808 /
        (y + 2.62433121679 + 48.6959930692 /
          (y + 5.92885724438))));
  } else {
    temp = 0.398942280385 * Math.exp(-y) /
      (z - 3.8052e-8 + 1.00000615302 /
        (z + 3.98064794e-4 + 1.98615381364 /
          (z - 0.151679116635 + 5.29330324926 /
            (z + 4.8385912808 - 15.1508972451 /
              (z + 0.742380924027 + 30.789933034 /
                (z + 3.99019417011))))));
  }
  return upper ? temp : 1 - temp;
}

/**
 * Shapiro-Wilk normality test.
 * Exact port of Royston's AS R94 algorithm as implemented in SciPy.
 * @param {number[]} data — measurements (n ≥ 3)
 * @returns {{ test: string, statistic: number, pValue: number, n: number }}
 */
export function shapiroWilk(data) {
  if (!Array.isArray(data)) throw new TypeError('data must be an array');
  const n = data.length;
  if (n < 3) throw new Error('min3');

  const x = [...data].sort((a, b) => a - b);
  const n2 = Math.floor(n / 2);
  const nn2 = n2;
  const an = n;
  const SMALL = 1e-19;
  const SQRTH = Math.sqrt(2) / 2;
  const PI6 = 6 / Math.PI;

  // Polynomial coefficients (AS R94, Royston 1995)
  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0, 0.42981e-1, -0.293762, -1.752461, 5.682633, -3.582633];
  const c3 = [0.5440, -0.39978, 0.25054e-1, -6.714e-4];
  const c4 = [1.3822, -0.77857, 0.62767e-1, -2.0322e-3];
  const c5 = [-1.5861, -0.31082, -0.83751e-1, 3.8915e-3];
  const c6 = [-0.4803, -0.82676e-1, 3.0302e-3];
  const g  = [-2.273, 0.459];

  // ─── INIT: compute coefficients ───
  const a = new Array(n2);
  if (n === 3) {
    a[0] = SQRTH;
  } else {
    const an25 = an + 0.25;
    let summ2 = 0;
    for (let i = 0; i < n2; i++) {
      const temp = _swPpnd((i + 1 - 0.375) / an25);
      a[i] = temp;
      summ2 += temp * temp;
    }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2);
    const rsn = 1 / Math.sqrt(an);

    let A1 = _swPoly(c1, 6, rsn) - a[0] / ssumm2;
    let i1, fac;

    if (n > 5) {
      i1 = 2;
      const A2 = -a[1] / ssumm2 + _swPoly(c2, 6, rsn);
      fac = Math.sqrt((summ2 - 2 * a[0] * a[0] - 2 * a[1] * a[1]) /
                      (1 - 2 * A1 * A1 - 2 * A2 * A2));
      a[1] = A2;
    } else {
      i1 = 1;
      fac = Math.sqrt((summ2 - 2 * a[0] * a[0]) / (1 - 2 * A1 * A1));
    }
    a[0] = A1;
    for (let i = i1; i < nn2; i++) a[i] *= -1 / fac;
  }

  // ─── Compute W (non-censored case) ───
  const n1 = n;
  const RANGE = x[n1 - 1] - x[0];
  if (RANGE < SMALL) throw new Error('zeroVariance');

  let SX = x[0] / RANGE;
  let SA = -a[0];
  let ind2 = n - 2;
  for (let ind1 = 1; ind1 < n1; ind1++) {
    const XI = x[ind1] / RANGE;
    SX += XI;
    if (ind1 !== ind2) {
      SA += (ind1 < ind2 ? -1 : 1) * a[Math.min(ind1, ind2)];
    }
    ind2--;
  }
  SA /= n1;
  SX /= n1;

  let SSA = 0, SSX = 0, SAX = 0;
  ind2 = n - 1;
  for (let ind1 = 0; ind1 < n1; ind1++) {
    let ASA;
    if (ind1 !== ind2) {
      ASA = (ind1 < ind2 ? -1 : 1) * a[Math.min(ind1, ind2)] - SA;
    } else {
      ASA = -SA;
    }
    const XSX = x[ind1] / RANGE - SX;
    SSA += ASA * ASA;
    SSX += XSX * XSX;
    SAX += ASA * XSX;
    ind2--;
  }

  const SSASSX = Math.sqrt(SSA * SSX);
  const w1 = (SSASSX - SAX) * (SSASSX + SAX) / (SSA * SSX);
  const W = 1 - w1;

  // ─── p-value (Royston approximation) ───
  let pValue;
  if (n === 3) {
    pValue = W >= 0.75 ? 1 - PI6 * Math.acos(Math.sqrt(W)) : 0;
  } else {
    const y_raw = Math.log(w1);
    const XX = Math.log(an);
    let y, m, s;
    if (n <= 11) {
      const gamma = _swPoly(g, 2, an);
      if (y_raw >= gamma) {
        pValue = SMALL;
      } else {
        y = -Math.log(gamma - y_raw);
        m = _swPoly(c3, 4, an);
        s = Math.exp(_swPoly(c4, 4, an));
        pValue = _swAlnorm((y - m) / s, true);
      }
    } else {
      y = y_raw;
      m = _swPoly(c5, 4, XX);
      s = Math.exp(_swPoly(c6, 3, XX));
      pValue = _swAlnorm((y - m) / s, true);
    }
  }

  pValue = Math.max(0, Math.min(1, pValue));
  return { test: 'shapiro-wilk', statistic: W, pValue, n };
}

// ─── Anderson-Darling Test ───────────────────────────────────

/**
 * Anderson-Darling normality test.
 * @param {number[]} data — measurements (n ≥ 3)
 */
export function andersonDarling(data) {
  const n = data.length;
  if (n < 3) throw new Error('min3');

  const mean = data.reduce((s, x) => s + x, 0) / n;
  const variance = data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  if (variance === 0) throw new Error('zeroVariance');
  const stdDev = Math.sqrt(variance);

  const z = [...data].sort((a, b) => a - b).map(x => (x - mean) / stdDev);
  const phi = z.map(v => normalCDF(v));

  let S = 0;
  for (let i = 0; i < n; i++) {
    const p1 = Math.max(phi[i], 1e-15);
    const p2 = Math.max(1 - phi[n - 1 - i], 1e-15);
    S += (2 * (i + 1) - 1) * (Math.log(p1) + Math.log(p2));
  }
  const A2 = -n - S / n;
  const A2adj = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  const pValue = andersonDarlingPValue(A2adj);

  return { test: 'anderson-darling', statistic: A2, statisticAdj: A2adj, pValue, n };
}

function andersonDarlingPValue(A2star) {
  if (A2star <= 0) return 1;
  let p;
  if (A2star < 0.2) {
    p = 1 - Math.exp(-13.436 + 101.14 * A2star - 223.73 * A2star * A2star);
  } else if (A2star < 0.34) {
    p = 1 - Math.exp(-8.318 + 42.796 * A2star - 59.938 * A2star * A2star);
  } else if (A2star < 0.6) {
    p = Math.exp(0.9177 - 4.279 * A2star - 1.38 * A2star * A2star);
  } else if (A2star < 10) {
    p = Math.exp(1.2937 - 5.709 * A2star + 0.0186 * A2star * A2star);
  } else {
    p = 0;
  }
  return Math.max(0, Math.min(1, p));
}

// ─── Jarque-Bera Test ────────────────────────────────────────

/**
 * Jarque-Bera normality test — asymptotic, ideal for n > 30.
 * @param {number[]} data
 */
export function jarqueBera(data) {
  const n = data.length;
  if (n < 3) throw new Error('min3');

  const mean = data.reduce((s, x) => s + x, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of data) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  if (m2 === 0) throw new Error('zeroVariance');

  const skewness = m3 / Math.pow(m2, 1.5);
  const kurtosis = m4 / (m2 * m2) - 3;
  const JB = (n / 6) * (skewness ** 2 + kurtosis ** 2 / 4);
  const pValue = Math.max(0, Math.min(1, 1 - chi2CDF(JB, 2)));

  return { test: 'jarque-bera', statistic: JB, pValue, skewness, kurtosis, n };
}

// ─── D'Agostino-Pearson Omnibus Test ────────────────────────

/**
 * D'Agostino-Pearson omnibus normality test.
 * Combines Z-scores from skewness (D'Agostino 1970) and kurtosis
 * (Anscombe & Glynn 1983) into a chi-squared(2) statistic K².
 * Requires n ≥ 20 for reliable results.
 * @param {number[]} data
 * @returns {{ test: string, statistic: number, pValue: number, skewnessZ: number, kurtosisZ: number, skewness: number, kurtosis: number, n: number }}
 */
export function dagostinoPearson(data) {
  const n = data.length;
  if (n < 20) throw new Error('min20');

  const m = data.reduce((s, x) => s + x, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of data) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  if (m2 === 0) throw new Error('zeroVariance');

  // ── Skewness Z-score (D'Agostino 1970) ──
  const g1 = m3 / Math.pow(m2, 1.5);
  const Y = g1 * Math.sqrt((n + 1) * (n + 3) / (6 * (n - 2)));
  const beta2 = 3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)
              / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const W2 = Math.sqrt(2 * beta2 - 2) - 1;
  const W = Math.sqrt(W2);
  const delta = 1 / Math.sqrt(Math.log(W));
  const alpha = Math.sqrt(2 / (W2 - 1));
  const Zs = delta * Math.log(Y / alpha + Math.sqrt((Y / alpha) ** 2 + 1));

  // ── Kurtosis Z-score (Anscombe & Glynn 1983) ──
  const g2 = m4 / (m2 * m2) - 3;
  const Eg2 = 3 * (n - 1) / (n + 1) - 3;
  const Vg2 = (24 * n * (n - 2) * (n - 3))
            / ((n + 1) * (n + 1) * (n + 3) * (n + 5));
  const x2 = (g2 - Eg2) / Math.sqrt(Vg2);
  const sqrtB1 = (6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9)))
               * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
  const A = 6 + 8 / sqrtB1 * (2 / sqrtB1 + Math.sqrt(1 + 4 / (sqrtB1 * sqrtB1)));
  const denom2 = 1 + x2 * Math.sqrt(2 / (A - 4));
  const term = (1 - 2 / A) / denom2;
  const Zk = (Math.cbrt(Math.abs(term)) * Math.sign(term) - (1 - 2 / (9 * A)))
           / Math.sqrt(2 / (9 * A));

  // ── Omnibus statistic K² ~ χ²(2) ──
  const K2 = Zs * Zs + Zk * Zk;
  // For χ²(2), survival function is exactly exp(-x/2)
  const pValue = Math.max(0, Math.min(1, Math.exp(-K2 / 2)));

  return {
    test: 'dagostino-pearson',
    statistic: K2,
    pValue,
    skewnessZ: Zs,
    kurtosisZ: Zk,
    skewness: g1,
    kurtosis: g2,
    n
  };
}

// ─── Run All Tests + Recommendation ─────────────────────────

/**
 * Run all four normality tests and generate a recommendation.
 * @param {number[]} data
 * @returns {{ shapiroWilk, andersonDarling, jarqueBera, dagostinoPearson, stats, recommendation: string }}
 */
export function runAllTests(data) {
  const stats = descriptiveStats(data);
  const sw = shapiroWilk(data);
  const ad = andersonDarling(data);
  const jb = jarqueBera(data);

  let dp = null;
  try { dp = dagostinoPearson(data); } catch { /* n < 20 */ }

  // recommendation key (resolved to i18n in the UI)
  let recommendation;
  const n = data.length;
  const absSkew = Math.abs(stats.skewness);

  let bestTest;
  if (n <= 50) {
    recommendation = 'recSmallN';
    bestTest = 'shapiroWilk';
  } else if (n > 300) {
    recommendation = 'recLargeN';
    bestTest = 'jarqueBera';
  } else if (absSkew > 1) {
    recommendation = 'recSkewed';
    bestTest = 'andersonDarling';
  } else {
    recommendation = 'recMediumN';
    bestTest = 'shapiroWilk';
  }

  return { shapiroWilk: sw, andersonDarling: ad, jarqueBera: jb, dagostinoPearson: dp, stats, recommendation, bestTest };
}
