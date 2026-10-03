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
