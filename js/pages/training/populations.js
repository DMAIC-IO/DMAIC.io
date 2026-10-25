/**
 * D.Mike — Course populations (populations.js)
 *
 * Four populations with exact theory values, plus the summary helpers the
 * sampling-distribution widget needs. Pure logic, no DOM.
 */

/**
 * Standard normal variate via Box–Muller.
 * @param {() => number} rng uniform generator on [0, 1)
 * @returns {number}
 */
export function normal(rng) {
  const u = 1 - rng(); // (0, 1]
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Population definitions keyed by id.
 * @type {Object<string, {mu: number, sigma: number, range: [number, number], draw: (rng: () => number) => number}>}
 */
export const POPULATIONS = {
  normal: {
    mu: 50,
    sigma: 10,
    range: [0, 100],
    draw: (rng) => 50 + 10 * normal(rng),
  },
  uniform: {
    mu: 50,
    sigma: 60 / Math.sqrt(12),
    range: [0, 100],
    draw: (rng) => 20 + 60 * rng(),
  },
  skewed: {
    mu: 35,
    sigma: 15,
    range: [0, 130],
    draw: (rng) => 20 - 15 * Math.log(1 - rng()),
  },
  bimodal: {
    mu: 52.5,
    sigma: Math.sqrt(36 + 17.5 * 17.5),
    range: [0, 100],
    draw: (rng) => (rng() < 0.5 ? 35 : 70) + 6 * normal(rng),
  },
};

/**
 * Mean of n draws from a population.
 * @param {{draw: Function}} population
 * @param {number} n
 * @param {() => number} rng
 * @returns {number}
 */
export function drawSampleMean(population, n, rng) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += population.draw(rng);
  return sum / n;
}

/**
 * Mean and sample standard deviation (n - 1); sd is NaN below two values.
 * @param {number[]} values
 * @returns {{mean: number, sd: number}}
 */
export function meanSd(values) {
  const n = values.length;
  if (n === 0) return { mean: NaN, sd: NaN };
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  if (n < 2) return { mean, sd: NaN };
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  return { mean, sd: Math.sqrt(ss / (n - 1)) };
}

/**
 * Pooled summary of two disjoint groups (Chan et al. parallel update).
 * @param {{mean: number, sd: number, count: number}|undefined} a
 * @param {{mean: number, sd: number, count: number}} b
 * @returns {{mean: number, sd: number, count: number}}
 */
export function mergeSummary(a, b) {
  if (!a) return { mean: b.mean, sd: b.sd, count: b.count };
  const count = a.count + b.count;
  const delta = b.mean - a.mean;
  const mean = a.mean + (delta * b.count) / count;
  // M2 of a group with a single value is 0 (its sd is NaN).
  const m2a = a.count > 1 ? a.sd * a.sd * (a.count - 1) : 0;
  const m2b = b.count > 1 ? b.sd * b.sd * (b.count - 1) : 0;
  const m2 = m2a + m2b + (delta * delta * a.count * b.count) / count;
  return { mean, sd: count > 1 ? Math.sqrt(m2 / (count - 1)) : NaN, count };
}

/**
 * Theoretical standard error of the mean.
 * @param {{sigma: number}} population
 * @param {number} n
 * @returns {number}
 */
export function standardError(population, n) {
  return population.sigma / Math.sqrt(n);
}

/**
 * Histogram bins over [lo, hi]; values outside clamp to the edge bins, non-finite values are skipped.
 * @param {number[]} values
 * @param {[number, number]} range
 * @param {number} count number of bins
 * @returns {{x0: number, x1: number, count: number}[]}
 */
export function binValues(values, range, count) {
  const [lo, hi] = range;
  const width = (hi - lo) / count;
  const bins = Array.from({ length: count }, (_, i) => ({
    x0: lo + i * width, x1: lo + (i + 1) * width, count: 0,
  }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = Math.min(count - 1, Math.max(0, Math.floor((v - lo) / width)));
    bins[idx].count++;
  }
  return bins;
}
