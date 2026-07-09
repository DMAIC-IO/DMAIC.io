/**
 * D.Mike — Hypothesis Test Engine (hypothesis-test-engine.js)
 *
 * Variance tests:
 *   - Chi-Square Variance Test   — one-sample σ² test
 *   - F-Test                     — two-sample variance equality
 *   - Levene Test (Brown-Forsythe) — robust two-sample variance equality
 *
 * Mean tests:
 *   - One-Sample t-Test          — μ against target value
 *   - Two-Sample t-Test (pooled) — μ₁ vs μ₂ with equal variances
 *   - Welch t-Test               — μ₁ vs μ₂ with unequal variances
 *   - Wilcoxon Signed-Rank Test  — nonparametric one-sample location
 *   - Mann-Whitney U Test        — nonparametric two-sample location
 *
 * Power analysis:
 *   - powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT
 *   - findRequiredN — iterative sample size determination
 *
 * Based on: prototypes/hypothesentest.html
 */

import {
  normalCDF,
  chi2CDF, chi2Inv, tCDF, tInv, fCDF, fQuantile as fInv,
} from './math-utils.js';

import { mean, variance, stddev } from './stats-utils.js';

// ─── Descriptive Helpers ────────────────────────────────────

function median(a) { const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// ─── Variance Tests ─────────────────────────────────────────

/**
 * Chi-Square variance test (one-sample).
 * Tests whether the population variance equals a hypothesized value.
 *
 * @param {number[]} data - Sample data
 * @param {number} sigma0Sq - Hypothesized variance σ₀²
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function chiSquareVarianceTest(data, sigma0Sq, direction = 'two-sided', alpha = 0.05) {
  const n = data.length;
  if (n < 2) throw new Error('At least 2 data points required');
  if (sigma0Sq <= 0) throw new Error('Hypothesized variance must be > 0');

  const df = n - 1;
  const s2 = variance(data);
  const chi2 = df * s2 / sigma0Sq;

  let pValue, cL = null, cU = null;
  if (direction === 'two-sided') {
    pValue = 2 * Math.min(chi2CDF(chi2, df), 1 - chi2CDF(chi2, df));
    cL = chi2Inv(alpha / 2, df);
    cU = chi2Inv(1 - alpha / 2, df);
  } else if (direction === 'greater') {
    pValue = 1 - chi2CDF(chi2, df);
    cU = chi2Inv(1 - alpha, df);
  } else {
    pValue = chi2CDF(chi2, df);
    cL = chi2Inv(alpha, df);
  }

  const ciLower = df * s2 / chi2Inv(1 - alpha / 2, df);
  const ciUpper = df * s2 / chi2Inv(alpha / 2, df);

  return {
    testName: 'Chi-Square Variance Test',
    statistic: chi2,
    df,
    pValue: Math.min(1, pValue),
    sampleVariance: s2,
    criticalLower: cL,
    criticalUpper: cU,
    ci: [ciLower, ciUpper],
    reject: Math.min(1, pValue) < alpha,
    n,
    alpha,
    direction,
  };
}

/**
 * F-Test for two-sample variance equality.
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function fTest(data1, data2, direction = 'two-sided', alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 2 || n2 < 2) throw new Error('At least 2 data points per sample required');

  const s1 = variance(data1), s2 = variance(data2);
  const F = s1 / s2;
  const df1 = n1 - 1, df2 = n2 - 1;

  let pValue, cL = null, cU = null;
  if (direction === 'two-sided') {
    pValue = 2 * Math.min(fCDF(F, df1, df2), 1 - fCDF(F, df1, df2));
    cL = fInv(alpha / 2, df1, df2);
    cU = fInv(1 - alpha / 2, df1, df2);
  } else if (direction === 'greater') {
    pValue = 1 - fCDF(F, df1, df2);
    cU = fInv(1 - alpha, df1, df2);
  } else {
    pValue = fCDF(F, df1, df2);
    cL = fInv(alpha, df1, df2);
  }

  const ciLower = F / fInv(1 - alpha / 2, df1, df2);
  const ciUpper = F / fInv(alpha / 2, df1, df2);

  return {
    testName: 'F-Test',
    statistic: F,
    df1,
    df2,
    pValue: Math.min(1, pValue),
    variance1: s1,
    variance2: s2,
    criticalLower: cL,
    criticalUpper: cU,
    ci: [ciLower, ciUpper],
    reject: Math.min(1, pValue) < alpha,
    n1,
    n2,
    alpha,
    direction,
  };
}

/**
 * Levene Test (Brown-Forsythe variant using median).
 * Robust test for equality of variances.
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function leveneTest(data1, data2, alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 2 || n2 < 2) throw new Error('At least 2 data points per sample required');

  const med1 = median(data1), med2 = median(data2);
  const z1 = data1.map(v => Math.abs(v - med1));
  const z2 = data2.map(v => Math.abs(v - med2));
  const N = n1 + n2;
  const m1 = mean(z1), m2 = mean(z2);
  const mA = (n1 * m1 + n2 * m2) / N;

  const num = (N - 2) * (n1 * (m1 - mA) ** 2 + n2 * (m2 - mA) ** 2);
  const den = z1.reduce((s, v) => s + (v - m1) ** 2, 0) + z2.reduce((s, v) => s + (v - m2) ** 2, 0);
  const W = num / den;
  const pValue = 1 - fCDF(W, 1, N - 2);

  return {
    testName: 'Levene Test (Brown-Forsythe)',
    statistic: W,
    df1: 1,
    df2: N - 2,
    pValue,
    variance1: variance(data1),
    variance2: variance(data2),
    reject: pValue < alpha,
    n1,
    n2,
    alpha,
  };
}

// ─── Mean Tests ─────────────────────────────────────────────

/**
 * One-sample t-test.
 * Tests whether the population mean equals a hypothesized value.
 *
 * @param {number[]} data - Sample data
 * @param {number} mu0 - Hypothesized mean
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function oneSampleTTest(data, mu0, direction = 'two-sided', alpha = 0.05) {
  const n = data.length;
  if (n < 2) throw new Error('At least 2 data points required');

  const m = mean(data), s = stddev(data);
  const se = s / Math.sqrt(n);
  const t0 = (m - mu0) / se;
  const df = n - 1;

  let pValue, cL = null, cU = null;
  if (direction === 'two-sided') {
    pValue = 2 * (1 - tCDF(Math.abs(t0), df));
    cL = tInv(alpha / 2, df);
    cU = tInv(1 - alpha / 2, df);
  } else if (direction === 'greater') {
    pValue = 1 - tCDF(t0, df);
    cU = tInv(1 - alpha, df);
  } else {
    pValue = tCDF(t0, df);
    cL = tInv(alpha, df);
  }

  const ciLower = m - tInv(1 - alpha / 2, df) * se;
  const ciUpper = m + tInv(1 - alpha / 2, df) * se;

  return {
    testName: 'One-Sample t-Test',
    statistic: t0,
    df,
    pValue: Math.min(1, Math.max(0, pValue)),
    mean: m,
    stddev: s,
    se,
    criticalLower: cL,
    criticalUpper: cU,
    ci: [ciLower, ciUpper],
    reject: Math.min(1, Math.max(0, pValue)) < alpha,
    n,
    alpha,
    direction,
  };
}

/**
 * Two-sample t-test (pooled, equal variances assumed).
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function twoSampleTTest(data1, data2, direction = 'two-sided', alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 2 || n2 < 2) throw new Error('At least 2 data points per sample required');

  const m1 = mean(data1), m2 = mean(data2);
  const s1 = variance(data1), s2 = variance(data2);
  const sp2 = ((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2);
  const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
  const t0 = (m1 - m2) / se;
  const df = n1 + n2 - 2;

  let pValue, cL = null, cU = null;
  if (direction === 'two-sided') {
    pValue = 2 * (1 - tCDF(Math.abs(t0), df));
    cL = tInv(alpha / 2, df);
    cU = tInv(1 - alpha / 2, df);
  } else if (direction === 'greater') {
    pValue = 1 - tCDF(t0, df);
    cU = tInv(1 - alpha, df);
  } else {
    pValue = tCDF(t0, df);
    cL = tInv(alpha, df);
  }

  const ciLower = (m1 - m2) - tInv(1 - alpha / 2, df) * se;
  const ciUpper = (m1 - m2) + tInv(1 - alpha / 2, df) * se;

  return {
    testName: 'Two-Sample t-Test (pooled)',
    statistic: t0,
    df,
    pValue: Math.min(1, Math.max(0, pValue)),
    mean1: m1,
    mean2: m2,
    pooledVariance: sp2,
    se,
    criticalLower: cL,
    criticalUpper: cU,
    ci: [ciLower, ciUpper],
    reject: Math.min(1, Math.max(0, pValue)) < alpha,
    n1,
    n2,
    alpha,
    direction,
  };
}

/**
 * Welch t-test (unequal variances).
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function welchTTest(data1, data2, direction = 'two-sided', alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 2 || n2 < 2) throw new Error('At least 2 data points per sample required');

  const m1 = mean(data1), m2 = mean(data2);
  const s1 = variance(data1), s2 = variance(data2);
  const se = Math.sqrt(s1 / n1 + s2 / n2);
  const t0 = (m1 - m2) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (s1 / n1 + s2 / n2) ** 2;
  const den = (s1 / n1) ** 2 / (n1 - 1) + (s2 / n2) ** 2 / (n2 - 1);
  const df = num / den;

  let pValue, cL = null, cU = null;
  if (direction === 'two-sided') {
    pValue = 2 * (1 - tCDF(Math.abs(t0), df));
    cL = tInv(alpha / 2, df);
    cU = tInv(1 - alpha / 2, df);
  } else if (direction === 'greater') {
    pValue = 1 - tCDF(t0, df);
    cU = tInv(1 - alpha, df);
  } else {
    pValue = tCDF(t0, df);
    cL = tInv(alpha, df);
  }

  const ciLower = (m1 - m2) - tInv(1 - alpha / 2, df) * se;
  const ciUpper = (m1 - m2) + tInv(1 - alpha / 2, df) * se;

  return {
    testName: 'Welch t-Test',
    statistic: t0,
    df,
    pValue: Math.min(1, Math.max(0, pValue)),
    mean1: m1,
    mean2: m2,
    variance1: s1,
    variance2: s2,
    se,
    criticalLower: cL,
    criticalUpper: cU,
    ci: [ciLower, ciUpper],
    reject: Math.min(1, Math.max(0, pValue)) < alpha,
    n1,
    n2,
    alpha,
    direction,
  };
}

/**
 * Wilcoxon Signed-Rank Test (nonparametric one-sample location test).
 *
 * @param {number[]} data - Sample data
 * @param {number} mu0 - Hypothesized median
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function wilcoxonSignedRank(data, mu0, direction = 'two-sided', alpha = 0.05) {
  const diffs = data.map(v => v - mu0).filter(v => v !== 0);
  const n = diffs.length;
  if (n < 1) throw new Error('At least 1 non-zero difference required');

  const absDiffs = diffs
    .map((v, i) => ({ abs: Math.abs(v), sign: v > 0 ? 1 : -1, idx: i }))
    .sort((a, b) => a.abs - b.abs);

  // Assign average ranks for ties
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && absDiffs[j].abs === absDiffs[i].abs) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) absDiffs[k].rank = avgRank;
    i = j;
  }

  let Wp = 0, Wn = 0;
  absDiffs.forEach(d => { if (d.sign > 0) Wp += d.rank; else Wn += d.rank; });

  const T = Math.min(Wp, Wn);
  const W = Wp;
  const muW = n * (n + 1) / 4;
  const sigW = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);

  let z, pValue;
  if (direction === 'two-sided') {
    z = (T - muW) / sigW;
    pValue = 2 * normalCDF(z);
  } else if (direction === 'greater') {
    z = (W - muW) / sigW;
    pValue = 1 - normalCDF(z);
  } else {
    z = (W - muW) / sigW;
    pValue = normalCDF(z);
  }

  return {
    testName: 'Wilcoxon Signed-Rank Test',
    statistic: W,
    z,
    pValue: Math.min(1, Math.max(0, pValue)),
    Wplus: Wp,
    Wminus: Wn,
    n,
    reject: Math.min(1, Math.max(0, pValue)) < alpha,
    alpha,
    direction,
  };
}

/**
 * Mann-Whitney U Test (nonparametric two-sample location test).
 *
 * @param {number[]} data1 - First sample
 * @param {number[]} data2 - Second sample
 * @param {string} [direction='two-sided'] - 'two-sided' | 'greater' | 'less'
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function mannWhitneyU(data1, data2, direction = 'two-sided', alpha = 0.05) {
  const n1 = data1.length, n2 = data2.length;
  if (n1 < 1 || n2 < 1) throw new Error('At least 1 data point per sample required');

  const all = data1.map(v => ({ v, g: 1 })).concat(data2.map(v => ({ v, g: 2 })))
    .sort((a, b) => a.v - b.v);

  // Assign average ranks for ties
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j].v === all[i].v) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) all[k].rank = avg;
    i = j;
  }

  const R1 = all.filter(d => d.g === 1).reduce((s, d) => s + d.rank, 0);
  const R2 = all.filter(d => d.g === 2).reduce((s, d) => s + d.rank, 0);
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U2 = R2 - n2 * (n2 + 1) / 2;
  const U = Math.min(U1, U2);
  const muU = n1 * n2 / 2;
  const sigU = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);

  let z, pValue;
  if (direction === 'two-sided') {
    z = (U - muU) / sigU;
    pValue = 2 * normalCDF(z);
  } else if (direction === 'greater') {
    z = (U1 - muU) / sigU;
    pValue = 1 - normalCDF(z);
  } else {
    z = (U1 - muU) / sigU;
    pValue = normalCDF(z);
  }

  return {
    testName: 'Mann-Whitney U Test',
    statistic: U,
    U1,
    U2,
    z,
    pValue: Math.min(1, Math.max(0, pValue)),
    R1,
    R2,
    n1,
    n2,
    reject: Math.min(1, Math.max(0, pValue)) < alpha,
    alpha,
    direction,
  };
}

// ─── k-Sample Tests ─────────────────────────────────────────

/**
 * One-Way ANOVA (Fisher) for k ≥ 2 independent samples.
 * Tests whether all group means are equal.
 *
 * @param {number[][]} groups - Array of k samples
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function oneWayANOVA(groups, alpha = 0.05) {
  const k = groups.length;
  if (k < 2) throw new Error('At least 2 groups required');
  for (const g of groups) if (g.length < 2) throw new Error('Each group needs at least 2 observations');

  const groupMeans = groups.map(g => mean(g));
  const groupSizes = groups.map(g => g.length);
  const groupVariances = groups.map(g => variance(g));
  const N = groupSizes.reduce((s, n) => s + n, 0);
  const grandMean = groups.reduce((s, g, i) => s + groupSizes[i] * groupMeans[i], 0) / N;

  let SSB = 0;
  for (let i = 0; i < k; i++) SSB += groupSizes[i] * (groupMeans[i] - grandMean) ** 2;

  let SSW = 0;
  for (let i = 0; i < k; i++) SSW += (groupSizes[i] - 1) * groupVariances[i];

  const SST = SSB + SSW;
  const df1 = k - 1;
  const df2 = N - k;
  const MSB = SSB / df1;
  const MSW = SSW / df2;
  const F = MSB / MSW;
  const pValue = 1 - fCDF(F, df1, df2);

  return {
    testName: 'One-Way ANOVA',
    statistic: F,
    df1,
    df2,
    pValue: Math.min(1, Math.max(0, pValue)),
    SSB, SSW, SST,
    MSB, MSW,
    groupMeans,
    groupSizes,
    groupVariances,
    grandMean,
    k,
    N,
    reject: pValue < alpha,
    alpha,
  };
}

/**
 * Bartlett's Test for equality of variances across k ≥ 2 samples.
 * Parametric, assumes normality. Sensitive to non-normal data —
 * prefer Levene-k when normality is in doubt.
 *
 * @param {number[][]} groups - Array of k samples
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function bartlettTest(groups, alpha = 0.05) {
  const k = groups.length;
  if (k < 2) throw new Error('At least 2 groups required');
  for (const g of groups) if (g.length < 2) throw new Error('Each group needs at least 2 observations');

  const sizes = groups.map(g => g.length);
  const variances = groups.map(g => variance(g));
  const N = sizes.reduce((s, n) => s + n, 0);
  const dfTotal = N - k;

  const pooledVar = groups.reduce((s, _, i) => s + (sizes[i] - 1) * variances[i], 0) / dfTotal;
  const num = dfTotal * Math.log(pooledVar)
    - groups.reduce((s, _, i) => s + (sizes[i] - 1) * Math.log(variances[i]), 0);

  const sumInv = sizes.reduce((s, n) => s + 1 / (n - 1), 0);
  const C = 1 + (1 / (3 * (k - 1))) * (sumInv - 1 / dfTotal);

  const T = num / C;
  const df = k - 1;
  const pValue = 1 - chi2CDF(T, df);

  return {
    testName: "Bartlett's Test",
    statistic: T,
    df,
    pValue: Math.min(1, Math.max(0, pValue)),
    variances,
    pooledVariance: pooledVar,
    correction: C,
    reject: pValue < alpha,
    k,
    N,
    alpha,
  };
}

/**
 * Levene Test (Brown-Forsythe variant) for k ≥ 2 samples.
 * Robust test for equality of variances across multiple groups.
 *
 * @param {number[][]} groups - Array of k samples
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function leveneTestK(groups, alpha = 0.05) {
  const k = groups.length;
  if (k < 2) throw new Error('At least 2 groups required');
  for (const g of groups) if (g.length < 2) throw new Error('Each group needs at least 2 observations');

  const meds = groups.map(g => median(g));
  const z = groups.map((g, i) => g.map(v => Math.abs(v - meds[i])));
  const sizes = groups.map(g => g.length);
  const N = sizes.reduce((s, n) => s + n, 0);
  const zMeans = z.map(zi => mean(zi));
  const zGrand = z.reduce((s, zi, i) => s + sizes[i] * zMeans[i], 0) / N;

  let num = 0;
  for (let i = 0; i < k; i++) num += sizes[i] * (zMeans[i] - zGrand) ** 2;
  num *= (N - k);

  let den = 0;
  for (let i = 0; i < k; i++) {
    for (const v of z[i]) den += (v - zMeans[i]) ** 2;
  }
  den *= (k - 1);

  const W = num / den;
  const df1 = k - 1, df2 = N - k;
  const pValue = 1 - fCDF(W, df1, df2);

  return {
    testName: 'Levene Test (Brown-Forsythe)',
    statistic: W,
    df1,
    df2,
    pValue: Math.min(1, Math.max(0, pValue)),
    variances: groups.map(g => variance(g)),
    reject: pValue < alpha,
    k,
    alpha,
  };
}

/**
 * Kruskal-Wallis Test (nonparametric one-way ANOVA) for k ≥ 2 samples.
 *
 * @param {number[][]} groups - Array of k samples
 * @param {number} [alpha=0.05] - Significance level
 * @returns {object} Test results
 */
export function kruskalWallis(groups, alpha = 0.05) {
  const k = groups.length;
  if (k < 2) throw new Error('At least 2 groups required');
  for (const g of groups) if (g.length < 1) throw new Error('Each group needs at least 1 observation');

  const sizes = groups.map(g => g.length);
  const N = sizes.reduce((s, n) => s + n, 0);

  const all = [];
  for (let i = 0; i < k; i++) for (const v of groups[i]) all.push({ v, g: i });
  all.sort((a, b) => a.v - b.v);

  let tieSum = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j].v === all[i].v) j++;
    const avg = (i + 1 + j) / 2;
    const ts = j - i;
    for (let m = i; m < j; m++) all[m].rank = avg;
    if (ts > 1) tieSum += ts ** 3 - ts;
    i = j;
  }

  const R = new Array(k).fill(0);
  for (const item of all) R[item.g] += item.rank;

  let H = 0;
  for (let i = 0; i < k; i++) H += R[i] ** 2 / sizes[i];
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

  const C = 1 - tieSum / (N ** 3 - N);
  if (C > 0 && C < 1) H = H / C;

  const df = k - 1;
  const pValue = 1 - chi2CDF(H, df);

  return {
    testName: 'Kruskal-Wallis Test',
    statistic: H,
    df,
    pValue: Math.min(1, Math.max(0, pValue)),
    rankSums: R,
    groupSizes: sizes,
    reject: pValue < alpha,
    k,
    N,
    alpha,
  };
}

// ─── Power Analysis ─────────────────────────────────────────

/**
 * Power of a one-sample chi-squared variance test.
 * @param {number} n - Sample size
 * @param {number} sigma0Sq - Hypothesized variance
 * @param {number} sigmaAltSq - True (alternative) variance
 * @param {number} alpha - Significance level
 * @param {string} direction - 'two-sided' | 'greater' | 'less'
 * @returns {number} Power (0–1)
 */
export function powerChiSquare(n, sigma0Sq, sigmaAltSq, alpha, direction) {
  const df = n - 1;
  const r = sigmaAltSq / sigma0Sq;
  if (direction === 'two-sided') {
    return chi2CDF(chi2Inv(alpha / 2, df) / r, df) + (1 - chi2CDF(chi2Inv(1 - alpha / 2, df) / r, df));
  } if (direction === 'greater') {
    return 1 - chi2CDF(chi2Inv(1 - alpha, df) / r, df);
  } 
    return chi2CDF(chi2Inv(alpha, df) / r, df);
  
}

/**
 * Power of a two-sample F-test.
 * @param {number} n1 - Sample size group 1
 * @param {number} n2 - Sample size group 2
 * @param {number} ratioAlt - True variance ratio σ₁²/σ₂²
 * @param {number} alpha - Significance level
 * @param {string} direction - 'two-sided' | 'greater' | 'less'
 * @returns {number} Power (0–1)
 */
export function powerFTest(n1, n2, ratioAlt, alpha, direction) {
  const df1 = n1 - 1, df2 = n2 - 1;
  if (direction === 'two-sided') {
    return fCDF(fInv(alpha / 2, df1, df2) / ratioAlt, df1, df2) +
           (1 - fCDF(fInv(1 - alpha / 2, df1, df2) / ratioAlt, df1, df2));
  } if (direction === 'greater') {
    return 1 - fCDF(fInv(1 - alpha, df1, df2) / ratioAlt, df1, df2);
  } 
    return fCDF(fInv(alpha, df1, df2) / ratioAlt, df1, df2);
  
}

/**
 * Power of a one-sample t-test.
 * @param {number} n - Sample size
 * @param {number} delta - True difference |μ − μ₀|
 * @param {number} sigma - Population standard deviation
 * @param {number} alpha - Significance level
 * @param {string} direction - 'two-sided' | 'greater' | 'less'
 * @returns {number} Power (0–1)
 */
export function powerOneSampleT(n, delta, sigma, alpha, direction) {
  const se = sigma / Math.sqrt(n);
  const df = n - 1;
  const ncp = delta / se;
  if (direction === 'two-sided') {
    const cU = tInv(1 - alpha / 2, df), cL = -cU;
    return 1 - tCDF(cU - ncp, df) + tCDF(cL - ncp, df);
  } if (direction === 'greater') {
    return 1 - tCDF(tInv(1 - alpha, df) - ncp, df);
  } 
    return tCDF(tInv(alpha, df) - ncp, df);
  
}

/**
 * Power of a two-sample t-test (pooled).
 * @param {number} n1 - Sample size group 1
 * @param {number} n2 - Sample size group 2
 * @param {number} delta - True difference |μ₁ − μ₂|
 * @param {number} sigma - Pooled standard deviation
 * @param {number} alpha - Significance level
 * @param {string} direction - 'two-sided' | 'greater' | 'less'
 * @returns {number} Power (0–1)
 */
export function powerTwoSampleT(n1, n2, delta, sigma, alpha, direction) {
  const se = sigma * Math.sqrt(1 / n1 + 1 / n2);
  const df = n1 + n2 - 2;
  const ncp = delta / se;
  if (direction === 'two-sided') {
    const cU = tInv(1 - alpha / 2, df), cL = -cU;
    return 1 - tCDF(cU - ncp, df) + tCDF(cL - ncp, df);
  } if (direction === 'greater') {
    return 1 - tCDF(tInv(1 - alpha, df) - ncp, df);
  } 
    return tCDF(tInv(alpha, df) - ncp, df);
  
}

/**
 * Find minimum sample size to achieve target power.
 * @param {number} targetPower - Target power (e.g. 0.80)
 * @param {function} powerFn - Function(n) → power
 * @param {number} [min=4] - Minimum n to search
 * @param {number} [max=5000] - Maximum n to search
 * @returns {number} Required sample size
 */
export function findRequiredN(targetPower, powerFn, min = 4, max = 5000) {
  for (let n = min; n <= max; n++) {
    if (powerFn(n) >= targetPower) return n;
  }
  return max;
}
