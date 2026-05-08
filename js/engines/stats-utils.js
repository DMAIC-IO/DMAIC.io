/**
 * D.Mike — Basic Statistics Utilities (stats-utils.js)
 * Shared mean, variance, stddev used across engine files.
 */

/** @param {number[]} arr  @returns {number} */
export function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Sample variance (n−1). @param {number[]} arr  @returns {number} */
export function variance(arr) {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

/** Sample standard deviation (n−1). @param {number[]} arr  @returns {number} */
export function stddev(arr) {
  return Math.sqrt(variance(arr));
}

/** Population standard deviation (n). @param {number[]} arr  @returns {number} */
export function stddevPop(arr) {
  if (arr.length < 1) return NaN;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
