/**
 * D.Mike — Course intervals (intervals.js)
 *
 * Two-sided confidence intervals for the mean, as lesson 4 builds them: with
 * a known σ and the normal factor z, or with the sample's s and either z or
 * the t factor (df = n − 1). Pure logic, no DOM.
 */

import { normalQuantile, tInv } from '../../engines/math-utils.js';
import { meanSd } from './populations.js';

/**
 * Two-sided factor for a confidence level: the normal quantile, or the t
 * quantile when degrees of freedom are given.
 * @param {number} level confidence level, e.g. 0.95
 * @param {number} [df] degrees of freedom; omitted → normal factor
 * @returns {number}
 */
export function intervalFactor(level, df) {
  const p = (1 + level) / 2;
  return df == null ? normalQuantile(p) : tInv(p, df);
}

/**
 * Confidence interval for the mean of one sample. With `sigma` the half-width
 * is z·σ/√n; without, s replaces σ and the factor is z (`method: 'z'`) or t
 * (`method: 't'`). Fields are NaN when s is needed but undefined (n < 2).
 * @param {number[]} values
 * @param {{level: number, sigma?: number, method?: 'z'|'t'}} opts
 * @returns {{mean: number, sd: number, half: number, lo: number, hi: number}}
 */
export function meanInterval(values, { level, sigma, method = 'z' }) {
  const n = values.length;
  const { mean, sd } = meanSd(values);
  let half;
  if (sigma != null) half = intervalFactor(level) * sigma / Math.sqrt(n);
  else if (n < 2) half = NaN;
  else half = intervalFactor(level, method === 't' ? n - 1 : undefined) * sd / Math.sqrt(n);
  return { mean, sd, half, lo: mean - half, hi: mean + half };
}

/**
 * Does the interval contain the value (bounds included)?
 * @param {{lo: number, hi: number}} interval
 * @param {number} value
 * @returns {boolean}
 */
export function covers(interval, value) {
  return interval.lo <= value && value <= interval.hi;
}
