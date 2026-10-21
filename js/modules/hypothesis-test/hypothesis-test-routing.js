/**
 * D.Mike — Hypothesis Test Module — Routing rules (hypothesis-test-routing.js)
 *
 * Pure decisions that pick the test family; no DOM, no i18n.
 *
 * - Normality is judged by Anderson-Darling alone (Minitab's default).
 *   Requiring Shapiro-Wilk and AD to pass together inflates the rate of
 *   false "non-normal" calls (C1-017).
 * - For means, a rank test replaces the parametric test only for small
 *   samples. With n >= LARGE_SAMPLE_N in every group the t-test / ANOVA is
 *   robust (central limit theorem) and is kept; the rank test is then shown
 *   as a secondary result, because it tests a different hypothesis
 *   (distribution shift instead of means).
 * - Variance (one/two samples): χ² / F under normality, Bonett otherwise.
 * - k group means: Fisher or Welch ANOVA on the parametric route, Kruskal-Wallis
 *   on the rank route (kMeanRoute).
 */

/** Per-group sample size from which the parametric mean test is kept. */
export const LARGE_SAMPLE_N = 20;

/**
 * @param {{ pValue: number }} ad Anderson-Darling result
 * @param {number} alpha significance level
 * @returns {boolean} true when normality is not rejected
 */
export function isNormalByAD(ad, alpha) {
  return ad.pValue >= alpha;
}

/**
 * Pick the test family for a mean comparison.
 * @param {boolean} allNormal every group passed the normality check
 * @param {number[]} sizes sample size of each group
 * @returns {'parametric'|'parametric-large-n'|'rank'}
 */
export function meanRoute(allNormal, sizes) {
  if (allNormal) return 'parametric';
  return sizes.every(n => n >= LARGE_SAMPLE_N) ? 'parametric-large-n' : 'rank';
}

/**
 * Pick the test for a comparison of k group means: Welch ANOVA when the
 * variances may differ, Fisher one-way ANOVA when they are equal, and
 * Kruskal-Wallis where the rank route applies (see meanRoute).
 * @param {boolean} allNormal every group passed the normality check
 * @param {number[]} sizes sample size of each group
 * @param {boolean} equalVariances whether the equal-variances option is set
 * @returns {'fisher'|'welch'|'kruskal'}
 */
export function kMeanRoute(allNormal, sizes, equalVariances) {
  return meanRoute(allNormal, sizes) === 'rank'
    ? 'kruskal'
    : (equalVariances ? 'fisher' : 'welch');
}

/**
 * Pick the test for a one- or two-sample variance question. χ² and F are
 * exact under normality but badly non-robust otherwise; Bonett's method
 * (Minitab's default) replaces them when AD rejects normality (C1-012).
 * @param {'one'|'two'} testType
 * @param {boolean} allNormal every sample passed the normality check
 * @returns {'chi2'|'bonett1'|'ftest'|'bonett2'}
 */
export function varianceRoute(testType, allNormal) {
  if (testType === 'one') return allNormal ? 'chi2' : 'bonett1';
  return allNormal ? 'ftest' : 'bonett2';
}

/** Relative spread below which values count as one value (rounding noise). */
const CONSTANT_REL_TOL = 1e-10;

/**
 * Whether values are equal up to floating-point noise. A hand-typed constant
 * shift (5.4 − 5.1, 10.3 − 10, …) differs in the last bits of the double;
 * an exact comparison would let it through and yield t ≈ 10¹⁴, p = 0.
 * @param {number[]} values
 * @returns {boolean} true when the spread is negligible against the magnitude
 */
export function isConstant(values) {
  const min = Math.min(...values), max = Math.max(...values);
  const scale = Math.max(Math.abs(min), Math.abs(max));
  return max - min <= CONSTANT_REL_TOL * scale;
}

/**
 * Whether a confidence interval contains the hypothesized value. The "no
 * significant difference — values between lo and hi are consistent" note is
 * only true then; after a non-rejected one-sided test the two-sided CI can
 * lie entirely on the other side of the target.
 * @param {[number, number]|null} ci
 * @param {number} target
 * @returns {boolean}
 */
export function ciContains(ci, target) {
  return Array.isArray(ci) && ci[0] <= target && target <= ci[1];
}
