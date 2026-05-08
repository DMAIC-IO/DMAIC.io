/**
 * D.Mike — Correlation Analysis Engine (correlation-engine.js)
 * Pure math functions for Pearson, Spearman, and Kendall correlations.
 * No DOM dependencies — can be tested independently.
 */

import { mean, stddev } from './stats-utils.js';
export { mean };
export { stddev as stdDev };
const stdDev = stddev;

/** @param {number[]} x @param {number[]} y */
export function covariance(x, y) {
  const mx = mean(x), my = mean(y);
  let s = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (n - 1);
}

// ─── Pearson ────────────────────────────────────────────────

/** @param {number[]} x @param {number[]} y @returns {number} */
export function pearsonR(x, y) {
  return covariance(x, y) / (stdDev(x) * stdDev(y));
}

// ─── Rank array (for Spearman) ──────────────────────────────

/** @param {number[]} arr @returns {number[]} */
export function rankArray(arr) {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avg;
    i = j;
  }
  return ranks;
}

/** @param {number[]} x @param {number[]} y @returns {number} */
export function spearmanR(x, y) {
  return pearsonR(rankArray(x), rankArray(y));
}

// ─── Kendall ────────────────────────────────────────────────

/**
 * @param {number[]} x
 * @param {number[]} y
 * @returns {{ tau: number, concordant: number, discordant: number }}
 */
export function kendallTau(x, y) {
  const n = x.length;
  let conc = 0, disc = 0, tx = 0, ty = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j];
      if (dx * dy > 0) conc++;
      else if (dx * dy < 0) disc++;
      else {
        if (dx === 0) tx++;
        if (dy === 0) ty++;
      }
    }
  }
  const n0 = n * (n - 1) / 2;
  const d = Math.sqrt((n0 - tx) * (n0 - ty));
  return { tau: d === 0 ? 0 : (conc - disc) / d, concordant: conc, discordant: disc };
}

// ─── Statistical distributions (from math-utils.js) ────────

import {
  normalCDF, normalQuantile as normInv, tCDF, tPValue,
} from './math-utils.js';

// Re-export for backward compatibility
export { normalCDF, normInv };

/** Two-tailed p-value from t-statistic */
export function pFromT(t, df) {
  return tPValue(Math.abs(t), df);
}

/** Kendall p-value (normal approximation) */
export function kendallPValue(tau, n) {
  const v = (2 * (2 * n + 5)) / (9 * n * (n - 1));
  const z = tau / Math.sqrt(v);
  return { p: 2 * (1 - normalCDF(Math.abs(z))), z };
}

// ─── Confidence intervals ───────────────────────────────────

/** Fisher z-transform CI for Pearson/Spearman */
export function fisherCI(r, n, alpha) {
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const zc = normInv(1 - alpha / 2);
  const lo = z - zc * se, hi = z + zc * se;
  return [
    (Math.exp(2 * lo) - 1) / (Math.exp(2 * lo) + 1),
    (Math.exp(2 * hi) - 1) / (Math.exp(2 * hi) + 1),
  ];
}

/** Normal approximation CI for Kendall */
export function kendallCI(tau, n, alpha) {
  // At |τ| = 1 all observations are perfectly (dis)concordant — sample variance is 0
  // and the H0-based SE below no longer represents the sampling distribution of τ̂.
  if (Math.abs(tau) >= 1 - 1e-12) return [tau, tau];
  const se = Math.sqrt(2 * (2 * n + 5) / (9 * n * (n - 1)));
  const zc = normInv(1 - alpha / 2);
  return [Math.max(-1, tau - zc * se), Math.min(1, tau + zc * se)];
}

// ─── Diagnostics ────────────────────────────────────────────

/** @param {number[]} a */
export function skewness(a) {
  const m = mean(a), s = stdDev(a), n = a.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.pow((a[i] - m) / s, 3);
  return (n / ((n - 1) * (n - 2))) * sum;
}

/** @param {number[]} a (excess kurtosis) */
export function kurtosis(a) {
  const m = mean(a), s = stdDev(a), n = a.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.pow((a[i] - m) / s, 4);
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
}

/** Jarque-Bera normality test */
export function isApproxNormal(a) {
  const n = a.length, sk = skewness(a), ku = kurtosis(a);
  const jb = (n / 6) * (sk * sk + (ku * ku) / 4);
  return { normal: jb < 5.99, jb, label: jb < 5.99 ? '\u2248 normal' : '\u2260 normal' };
}

/** Count outliers using IQR on residuals */
export function countOutliers(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) * (x[i] - mx); }
  const slope = den ? num / den : 0, intercept = my - slope * mx;
  const res = [];
  for (let i = 0; i < n; i++) res.push(y[i] - (slope * x[i] + intercept));
  const sorted = res.slice().sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)], q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  let count = 0;
  for (let i = 0; i < n; i++) if (res[i] < lo || res[i] > hi) count++;
  return count;
}

/** Monotonicity index (fraction of concordant pairs) */
export function monotonicityIndex(x, y) {
  const n = x.length;
  let conc = 0, disc = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j];
      if (dx * dy > 0) conc++;
      else if (dx * dy < 0) disc++;
    }
  }
  const total = conc + disc;
  return total === 0 ? 1 : conc / total;
}

// ─── Full analysis ──────────────────────────────────────────

/**
 * Run complete correlation analysis.
 * @param {number[]} x
 * @param {number[]} y
 * @param {number} confidenceLevel  e.g. 0.95
 * @returns {object}
 */
export function runCorrelationAnalysis(x, y, confidenceLevel = 0.95) {
  const n = x.length;
  const df = n - 2;
  const alpha = 1 - confidenceLevel;

  // Pearson
  const pRraw = pearsonR(x, y);
  const pR = Math.max(-1, Math.min(1, pRraw));
  const pPerfect = Math.abs(pR) >= 1;
  const pT = pPerfect ? (pR >= 0 ? Infinity : -Infinity) : pR * Math.sqrt(df / (1 - pR * pR));
  const pP = pPerfect ? 0 : pFromT(pT, df);
  const pCI = pPerfect ? [pR, pR] : fisherCI(pR, n, alpha);

  // Spearman
  const sRraw = spearmanR(x, y);
  const sR = Math.max(-1, Math.min(1, sRraw));
  const sPerfect = Math.abs(sR) >= 1;
  const sT = sPerfect ? (sR >= 0 ? Infinity : -Infinity) : sR * Math.sqrt(df / (1 - sR * sR));
  const sP = sPerfect ? 0 : pFromT(sT, df);
  const sCI = sPerfect ? [sR, sR] : fisherCI(sR, n, alpha);

  // Kendall
  const kRes = kendallTau(x, y);
  const kTau = kRes.tau;
  const kPRes = kendallPValue(kTau, n);
  const kP = kPRes.p;
  const kZ = kPRes.z;
  const kCI = kendallCI(kTau, n, alpha);

  // Diagnostics
  const normX = isApproxNormal(x);
  const normY = isApproxNormal(y);
  const outliers = countOutliers(x, y);
  const mono = monotonicityIndex(x, y);

  // Recommendation
  const rec = buildRecommendation(x, y, pR, sR, kTau, pP, sP, kP, n, normX, normY, outliers, mono);

  return {
    n,
    df,
    confidenceLevel,
    pearson: { r: pR, t: pT, p: pP, r2: pR * pR, ci: pCI },
    spearman: { r: sR, t: sT, p: sP, r2: sR * sR, ci: sCI },
    kendall: { tau: kTau, z: kZ, p: kP, concordant: kRes.concordant, discordant: kRes.discordant, ci: kCI },
    descriptive: {
      meanX: mean(x), meanY: mean(y),
      stdX: stdDev(x), stdY: stdDev(y),
      cov: covariance(x, y),
    },
    diagnostics: {
      normX, normY,
      skewX: skewness(x), skewY: skewness(y),
      kurtX: kurtosis(x), kurtY: kurtosis(y),
      mono, outliers,
    },
    recommendation: rec,
  };
}

// ─── Recommendation engine ──────────────────────────────────

function buildRecommendation(x, y, pR, sR, kTau, pP, sP, kP, n, normX, normY, outliers, mono) {
  const bothNormal = normX.normal && normY.normal;
  const hasOutliers = outliers > 0;
  const diffPS = Math.abs(Math.abs(pR) - Math.abs(sR));
  const smallN = n < 20;

  const scores = { pearson: 0, spearman: 0, kendall: 0 };
  const reasons = [];

  if (bothNormal) {
    scores.pearson += 3;
    reasons.push({ ok: true, key: 'recNormal' });
  } else {
    scores.spearman += 2;
    scores.kendall += 2;
    reasons.push({ ok: false, key: 'recNotNormal' });
  }

  if (hasOutliers) {
    scores.spearman += 2;
    scores.kendall += 3;
    scores.pearson -= 2;
    reasons.push({ ok: false, key: 'recOutliers', params: { count: outliers } });
  } else {
    scores.pearson += 1;
    reasons.push({ ok: true, key: 'recNoOutliers' });
  }

  if (diffPS > 0.1) {
    scores.spearman += 2;
    scores.kendall += 1;
    reasons.push({ ok: false, key: 'recNonlinear', params: { delta: diffPS.toFixed(3) } });
  } else {
    scores.pearson += 1;
    reasons.push({ ok: true, key: 'recLinear', params: { delta: diffPS.toFixed(3) } });
  }

  if (smallN) {
    scores.kendall += 2;
    reasons.push({ ok: false, key: 'recSmallN', params: { n } });
  } else {
    reasons.push({ ok: true, key: 'recLargeN', params: { n } });
  }

  if (mono < 0.7) {
    scores.pearson -= 1;
    scores.spearman -= 1;
    reasons.push({ ok: false, key: 'recLowMono', params: { pct: (mono * 100).toFixed(0) } });
  }

  let best = 'pearson';
  if (scores.spearman > scores[best]) best = 'spearman';
  if (scores.kendall > scores[best]) best = 'kendall';

  return { best, reasons, scores };
}
