/**
 * D.Mike — Course hypothesis test (hypothesis.js)
 *
 * The two-sided z test for the mean with a known σ, as lesson 5 builds it:
 * the test statistic, its p value, the "at least as far out" check the
 * simulation counts with, and the decision against α. Pure logic, no DOM.
 */

import { normalCDF } from '../../engines/math-utils.js';

/** Slack for the boundary: a mean exactly as far out as the observed counts. */
const FAR_TOLERANCE = 1e-9;

/**
 * Test statistic z = (x̄ − μ₀) / (σ / √n).
 * @param {number} mean sample mean x̄
 * @param {number} mu0 mean under the null hypothesis
 * @param {number} sigma known process standard deviation
 * @param {number} n sample size
 * @returns {number}
 */
export function zStatistic(mean, mu0, sigma, n) {
  return (mean - mu0) / (sigma / Math.sqrt(n));
}

/**
 * Two-sided p value of a z statistic: 2 · (1 − Φ(|z|)).
 * @param {number} z
 * @returns {number}
 */
export function twoSidedP(z) {
  return 2 * (1 - normalCDF(Math.abs(z), 0, 1));
}

/**
 * Whether a mean lies at least as far from μ₀ as the observed one, on
 * either side.
 * @param {number} mean mean to classify
 * @param {number} mu0 mean under the null hypothesis
 * @param {number} observed observed sample mean
 * @returns {boolean}
 */
export function isAsFarOut(mean, mu0, observed) {
  return Math.abs(mean - mu0) >= Math.abs(observed - mu0) - FAR_TOLERANCE;
}

/**
 * Decision of the test: reject H₀ only when p falls below α.
 * @param {number} p p value
 * @param {number} [alpha=0.05] significance level
 * @returns {'reject'|'keep'}
 */
export function decide(p, alpha = 0.05) {
  return p < alpha ? 'reject' : 'keep';
}
