/**
 * D.Mike — one-way ANOVA extensions (anova-engine.js)
 *
 *   - oneWayModelSummary — S, R², R²(adj), R²(pred), group CIs, residuals, fitted
 *   - welchANOVA         — Welch (1951) ANOVA, no equal-variance assumption
 *   - tukeyHSD           — Tukey-Kramer all-pairs comparisons (pooled SD)
 *   - gamesHowell        — Games-Howell all-pairs comparisons (per-pair Welch df)
 *
 * Reference values: Python (tools/fixture-generator/generators/anova.py),
 * checked against SciPy and statsmodels. Sums are centered (two-pass) so that
 * data with a large offset and a tiny spread keep their precision.
 */

import { mean } from './stats-utils.js';
import { tInv, fCDF, ptukey, qtukey } from './math-utils.js';

const clamp01 = (p) => Math.min(1, Math.max(0, p));

/**
 * Validates k ≥ 2 groups with n ≥ 2 observations each.
 * @param {number[][]} groups
 */
function assertGroups(groups) {
  if (groups.length < 2) throw new Error('At least 2 groups required');
  for (const g of groups) if (g.length < 2) throw new Error('Each group needs at least 2 observations');
}

/**
 * Group statistics from centered sums: means, sizes, sums of squares, variances.
 * @param {number[][]} groups
 */
function groupStats(groups) {
  const sizes = groups.map(g => g.length);
  const means = groups.map(g => mean(g));
  const ssq = groups.map((g, i) => g.reduce((s, x) => s + (x - means[i]) ** 2, 0));
  const variances = ssq.map((s, i) => (sizes[i] > 1 ? s / (sizes[i] - 1) : NaN));
  return { sizes, means, ssq, variances, N: sizes.reduce((s, n) => s + n, 0) };
}

/**
 * Model summary of the one-way fit. R²(adj) and R²(pred) are returned raw
 * (they may be negative); R²(pred) is null if any group has a single value.
 * Group CIs use the pooled SD (Fisher) or each group's own SD (Welch).
 *
 * @param {number[][]} groups
 * @param {number} alpha
 * @param {boolean} pooled - true: CIs from S with N−k df; false: individual SDs with n_i−1 df
 * @returns {{S: number, R2: number, R2adj: number, R2pred: (number|null),
 *   groupCIs: number[][], residuals: number[], fitted: number[]}}
 */
export function oneWayModelSummary(groups, alpha, pooled) {
  const k = groups.length;
  const { sizes, means, ssq, variances, N } = groupStats(groups);
  const SSW = ssq.reduce((s, v) => s + v, 0);
  const grand = groups.reduce((s, g, i) => s + sizes[i] * means[i], 0) / N;
  let SSB = 0;
  for (let i = 0; i < k; i++) SSB += sizes[i] * (means[i] - grand) ** 2;
  const SST = SSB + SSW;
  const MSW = SSW / (N - k);
  const S = Math.sqrt(MSW);

  let R2pred = null;
  if (sizes.every(n => n >= 2)) {
    let press = 0;
    groups.forEach((g, i) => {
      for (const x of g) press += ((x - means[i]) * sizes[i] / (sizes[i] - 1)) ** 2;
    });
    R2pred = 1 - press / SST;
  }

  const groupCIs = means.map((m, i) => {
    const n = sizes[i];
    const half = pooled
      ? tInv(1 - alpha / 2, N - k) * S / Math.sqrt(n)
      : tInv(1 - alpha / 2, n - 1) * Math.sqrt(variances[i]) / Math.sqrt(n);
    return [m - half, m + half];
  });

  return {
    S,
    R2: SSB / SST,
    R2adj: 1 - MSW / (SST / (N - 1)),
    R2pred,
    groupCIs,
    residuals: groups.flatMap((g, i) => g.map(x => x - means[i])),
    fitted: groups.flatMap((g, i) => g.map(() => means[i])),
  };
}

/**
 * Throws if any group variance is zero (Welch weights and Games-Howell SEs are undefined).
 * @param {number[]} variances
 */
function assertNonZeroVariance(variances) {
  if (variances.some(v => !(v > 0))) throw new Error('Each group needs non-zero variance');
}

/**
 * Welch's ANOVA (Welch 1951): one-way test of equal means without assuming
 * equal variances. Throws for n_i < 2 or a group with zero variance.
 *
 * @param {number[][]} groups - k ≥ 2 samples
 * @param {number} [alpha=0.05]
 * @returns {object} Test results incl. the one-way model summary
 */
export function welchANOVA(groups, alpha = 0.05) {
  assertGroups(groups);
  const k = groups.length;
  const { sizes, means, variances, N } = groupStats(groups);
  assertNonZeroVariance(variances);

  const w = sizes.map((n, i) => n / variances[i]);
  const W = w.reduce((s, v) => s + v, 0);
  const xw = w.reduce((s, v, i) => s + v * means[i], 0) / W;
  const A = w.reduce((s, v, i) => s + v * (means[i] - xw) ** 2, 0) / (k - 1);
  const lambda = w.reduce((s, v, i) => s + (1 - v / W) ** 2 / (sizes[i] - 1), 0);
  const F = A / (1 + 2 * (k - 2) * lambda / (k * k - 1));
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambda);
  const pValue = clamp01(1 - fCDF(F, df1, df2));

  return {
    testName: 'Welch ANOVA',
    statistic: F,
    df1,
    df2,
    pValue,
    groupMeans: means,
    groupSizes: sizes,
    groupVariances: variances,
    k,
    N,
    ...oneWayModelSummary(groups, alpha, false),
    reject: pValue < alpha,
    alpha,
  };
}

/**
 * Builds the all-pairs comparison list in order (0,1), (0,2), …, (k−2,k−1).
 * @param {number} k
 * @param {number[]} means
 * @param {(i: number, j: number) => {se: number, df: number}} pairSE
 * @param {number} alpha
 * @param {(df: number) => number} critFor - studentized range critical value for a pair's df
 *   (qtukey is expensive, so callers cache it)
 * @returns {object[]}
 */
function pairwise(k, means, pairSE, alpha, critFor) {
  const comparisons = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff = means[i] - means[j];
      const { se, df } = pairSE(i, j);
      const q = Math.abs(diff) / se;
      const crit = critFor(df);
      comparisons.push({
        i, j, diff, se, q, df,
        pAdj: clamp01(1 - ptukey(q, k, df)),
        ci: [diff - crit * se, diff + crit * se],
      });
    }
  }
  return comparisons;
}

/**
 * Tukey HSD (Tukey-Kramer for unequal n): all pairwise mean differences with
 * simultaneous CIs and adjusted p-values, using the pooled SD and N−k df.
 * Requires n_i ≥ 2 in every group and a non-zero pooled variance (throws otherwise).
 *
 * @param {number[][]} groups - k ≥ 2 samples
 * @param {number} [alpha=0.05]
 * @returns {{testName: string, comparisons: object[], qCrit: number, df: number, alpha: number}}
 */
export function tukeyHSD(groups, alpha = 0.05) {
  assertGroups(groups);
  const k = groups.length;
  const { sizes, means, ssq, N } = groupStats(groups);
  const df = N - k;
  const S = Math.sqrt(ssq.reduce((s, v) => s + v, 0) / df);
  if (!(S > 0)) throw new Error('Groups have zero variance: pooled variance is zero');
  // df = N − k is the same for every pair: one qtukey call serves all pairs and qCrit
  const qCrit = qtukey(1 - alpha, k, df);
  const comparisons = pairwise(k, means, (i, j) => ({
    se: S * Math.sqrt((1 / sizes[i] + 1 / sizes[j]) / 2),
    df,
  }), alpha, () => qCrit);
  return { testName: 'Tukey HSD', comparisons, qCrit, df, alpha };
}

/**
 * Games-Howell: all pairwise mean differences without assuming equal variances
 * (per-pair Welch-Satterthwaite df). Throws for n_i < 2 or zero variance.
 *
 * @param {number[][]} groups - k ≥ 2 samples
 * @param {number} [alpha=0.05]
 * @returns {{testName: string, comparisons: object[], alpha: number}}
 */
export function gamesHowell(groups, alpha = 0.05) {
  assertGroups(groups);
  const k = groups.length;
  const { sizes, means, variances } = groupStats(groups);
  assertNonZeroVariance(variances);
  const v = variances.map((s2, i) => s2 / sizes[i]);
  // pairs with the same Welch df share one qtukey call (memoised within this call)
  const critCache = new Map();
  const critFor = (df) => {
    if (!critCache.has(df)) critCache.set(df, qtukey(1 - alpha, k, df));
    return critCache.get(df);
  };
  const comparisons = pairwise(k, means, (i, j) => ({
    se: Math.sqrt((v[i] + v[j]) / 2),
    df: (v[i] + v[j]) ** 2 / (v[i] ** 2 / (sizes[i] - 1) + v[j] ** 2 / (sizes[j] - 1)),
  }), alpha, critFor);
  return { testName: 'Games-Howell', comparisons, alpha };
}
