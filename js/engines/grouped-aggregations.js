/**
 * Grouped aggregation primitives — `groupedMeans` (one factor) and
 * `cellMeans` (two factors). Used by chart-suggestion previews
 * (main-effects, interaction, bar-aggregated) and available to any
 * module that needs to summarise a continuous Y by one or two factors.
 *
 * Both helpers preserve insertion order for factor levels and silently
 * drop pairs where the factor value is null/empty or y is non-numeric.
 */

/**
 * One-factor grouped means. Returns the mean of `yValues` for each unique
 * level of `factorValues`, in insertion order.
 *
 * @param {Array} yValues
 * @param {Array} factorValues
 * @returns {{ levels: string[], means: number[], counts: number[], overall: number }}
 */
export function groupedMeans(yValues, factorValues) {
  const n = Math.min(yValues.length, factorValues.length);
  const sums = new Map();
  const levels = [];
  for (let i = 0; i < n; i++) {
    const f = factorValues[i];
    if (f == null || f === '') continue;
    const y = toNum(yValues[i]);
    if (!Number.isFinite(y)) continue;
    const k = String(f);
    if (!sums.has(k)) { sums.set(k, { sum: 0, count: 0 }); levels.push(k); }
    const entry = sums.get(k);
    entry.sum += y;
    entry.count += 1;
  }
  const means  = levels.map(l => sums.get(l).count > 0 ? sums.get(l).sum / sums.get(l).count : NaN);
  const counts = levels.map(l => sums.get(l).count);
  const totalSum   = levels.reduce((s, l) => s + sums.get(l).sum, 0);
  const totalCount = counts.reduce((s, c) => s + c, 0);
  const overall = totalCount > 0 ? totalSum / totalCount : NaN;
  return { levels, means, counts, overall };
}

/**
 * Two-factor cell means. Returns one row per level of factor A and one
 * column per level of factor B, with `means[ai][bi]` = mean of y in that
 * cell (NaN when empty) and `counts[ai][bi]` = sample size.
 *
 * @param {Array} yValues
 * @param {Array} factorA
 * @param {Array} factorB
 * @returns {{ aLevels: string[], bLevels: string[], means: number[][], counts: number[][] }}
 */
export function cellMeans(yValues, factorA, factorB) {
  const n = Math.min(yValues.length, factorA.length, factorB.length);
  const aLevels = [], bLevels = [];
  const aIdx = new Map(), bIdx = new Map();
  const sums = [];
  const counts = [];
  for (let i = 0; i < n; i++) {
    const av = factorA[i];
    const bv = factorB[i];
    if (av == null || av === '' || bv == null || bv === '') continue;
    const y = toNum(yValues[i]);
    if (!Number.isFinite(y)) continue;
    const ak = String(av);
    const bk = String(bv);
    if (!aIdx.has(ak)) { aIdx.set(ak, aLevels.length); aLevels.push(ak); sums.push([]); counts.push([]); }
    if (!bIdx.has(bk)) { bIdx.set(bk, bLevels.length); bLevels.push(bk); }
    const ai = aIdx.get(ak);
    const bi = bIdx.get(bk);
    if (sums[ai][bi] == null) { sums[ai][bi] = 0; counts[ai][bi] = 0; }
    sums[ai][bi] += y;
    counts[ai][bi] += 1;
  }
  const means = aLevels.map((_, ai) =>
    bLevels.map((__, bi) =>
      counts[ai][bi] > 0 ? sums[ai][bi] / counts[ai][bi] : NaN
    )
  );
  const filledCounts = aLevels.map((_, ai) =>
    bLevels.map((__, bi) => counts[ai][bi] || 0)
  );
  return { aLevels, bLevels, means, counts: filledCounts };
}

function toNum(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  const n = Number(s);
  return n;
}
