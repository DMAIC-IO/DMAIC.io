/**
 * D.Mike — Course test power (power.js)
 *
 * The two-sided z test of lesson 6 seen from the errors it makes: the alarm
 * limits (lesson 5's rule p < α expressed in grams), the alarm check, the
 * exact power against a drift δ and the sample size a power target needs.
 * Pure logic, no DOM.
 */

import { normalCDF, normalQuantile } from '../../engines/math-utils.js';

/** z₁₋α/₂ of the two-sided test. */
function criticalZ(alpha) {
  return normalQuantile(1 - alpha / 2);
}

/**
 * Alarm limits μ₀ ∓ z₁₋α/₂ · σ/√n: a check alarms when x̄ lies outside.
 * @param {number} mu0 mean the test checks against
 * @param {number} sigma known process standard deviation
 * @param {number} n packs per check
 * @param {number} alpha significance level
 * @returns {{lower: number, upper: number}}
 */
export function alarmLimits(mu0, sigma, n, alpha) {
  const half = criticalZ(alpha) * sigma / Math.sqrt(n);
  return { lower: mu0 - half, upper: mu0 + half };
}

/**
 * Whether a check's mean raises an alarm (lies strictly outside the limits).
 * @param {number} mean mean x̄ of the check
 * @param {{lower: number, upper: number}} limits
 * @returns {boolean}
 */
export function isAlarm(mean, limits) {
  return mean < limits.lower || mean > limits.upper;
}

/**
 * Exact two-sided power Φ(k − z) + Φ(−k − z), k = δ/(σ/√n), z = z₁₋α/₂.
 * At δ = 0 this is α, the false-alarm rate.
 * @param {number} delta drift of the true mean from μ₀
 * @param {number} sigma known process standard deviation
 * @param {number} n packs per check
 * @param {number} alpha significance level
 * @returns {number}
 */
export function exactPower(delta, sigma, n, alpha) {
  const k = delta / (sigma / Math.sqrt(n));
  const z = criticalZ(alpha);
  return normalCDF(k - z, 0, 1) + normalCDF(-k - z, 0, 1);
}

/**
 * Packs per check for a power target: ⌈((z₁₋α/₂ + z_power) · σ/δ)²⌉.
 * @param {number} delta drift the check must detect
 * @param {number} sigma known process standard deviation
 * @param {number} alpha significance level
 * @param {number} power target power, e.g. 0.9
 * @returns {number}
 */
export function requiredN(delta, sigma, alpha, power) {
  const root = (criticalZ(alpha) + normalQuantile(power)) * sigma / delta;
  return Math.ceil(root * root);
}
