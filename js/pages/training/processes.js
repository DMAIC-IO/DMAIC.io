/**
 * D.Mike — Course processes (processes.js)
 *
 * Processes of lesson 1 whose individual values the learner measures: two
 * filling machines and the counter's waiting times. Kept apart from
 * POPULATIONS so lesson 3's population select does not offer them.
 * Lesson 2 draws whole samples of a process and compares two variance
 * formulas. Pure logic, no DOM.
 */

import { POPULATIONS, normal, meanSd } from './populations.js';

/**
 * Process definitions keyed by id.
 * @type {Object<string, {mean: number, sd: number, axis: [number, number], unit: string, draw: (rng: () => number) => number}>}
 */
export const PROCESSES = {
  'fill-a': {
    mean: 500,
    sd: 2,
    axis: [480, 520],
    unit: 'g',
    draw: (rng) => 500 + 2 * normal(rng),
  },
  'fill-b': {
    mean: 500,
    sd: 5,
    axis: [480, 520],
    unit: 'g',
    draw: (rng) => 500 + 5 * normal(rng),
  },
  waiting: {
    mean: POPULATIONS.skewed.mu,
    sd: POPULATIONS.skewed.sigma,
    axis: POPULATIONS.skewed.range,
    unit: 'min',
    draw: POPULATIONS.skewed.draw,
  },
};

/**
 * Summary of measured values. Shares are fractions computed with the measured
 * mean and s; they and s are NaN below two values, everything is NaN for none.
 * @param {number[]} values
 * @returns {{count: number, mean: number, sd: number, min: number, max: number, range: number, belowMean: number, within: {1: number, 2: number}}}
 */
export function summarizeValues(values) {
  const count = values.length;
  const { mean, sd } = meanSd(values);
  let min = NaN;
  let max = NaN;
  if (count > 0) {
    min = Infinity;
    max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const share = (predicate) => {
    if (count < 2) return NaN;
    let hits = 0;
    for (const v of values) if (predicate(v)) hits++;
    return hits / count;
  };
  return {
    count,
    mean,
    sd,
    min,
    max,
    range: max - min,
    belowMean: share((v) => v < mean),
    within: {
      1: share((v) => Math.abs(v - mean) <= sd),
      2: share((v) => Math.abs(v - mean) <= 2 * sd),
    },
  };
}

/**
 * Draw one sample of n values from a process.
 * @param {string} processId key of PROCESSES
 * @param {number} n sample size
 * @param {() => number} rng uniform generator
 * @returns {number[]}
 */
export function drawSample(processId, n, rng) {
  const process = PROCESSES[processId];
  return Array.from({ length: n }, () => process.draw(rng));
}

/**
 * Variance of a sample computed both ways: the sum of squared deviations from
 * the sample mean divided by n and by n − 1. Both NaN below two values.
 * @param {number[]} values
 * @returns {{byN: number, byNMinus1: number}}
 */
export function sampleVariances(values) {
  const n = values.length;
  if (n < 2) return { byN: NaN, byNMinus1: NaN };
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const squares = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return { byN: squares / n, byNMinus1: squares / (n - 1) };
}
