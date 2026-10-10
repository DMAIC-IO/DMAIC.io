/**
 * D.Mike — Bootstrap confidence intervals (resampling-intervals.js)
 *
 * Percentile and BCa intervals exactly as R's boot package computes them
 * (boot:::norm.inter, boot::bca.ci) plus jackknife empirical influence values
 * (boot::empinf(type = "jack")). Validated to 1e-10 against R in
 * tests/engines/resampling-intervals.test.js.
 */

import { normalCdfPrecise as pnorm, normalQuantilePrecise as qnorm } from './normal-precise.js';

/** Ascending copy of the finite replicates. */
function finiteSorted(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) out.push(values[i]);
  }
  return Float64Array.from(out).sort();
}

/**
 * Quantile of the bootstrap distribution with normal-scale interpolation
 * between order statistics (R boot:::norm.inter, one alpha).
 * @param {Float64Array} sorted ascending, finite
 * @param {number} alpha
 * @returns {number}
 */
export function normInter(sorted, alpha) {
  const R = sorted.length;
  const rk = (R + 1) * alpha;
  const k = Math.trunc(rk);
  if (k <= 0) return sorted[0];
  if (k >= R) return sorted[R - 1];
  if (k === rk) return sorted[k - 1];
  const z = qnorm(alpha);
  const zk = qnorm(k / (R + 1));
  const zk1 = qnorm((k + 1) / (R + 1));
  const tk = sorted[k - 1];
  const tk1 = sorted[k];
  return tk + ((z - zk) / (zk1 - zk)) * (tk1 - tk);
}

/**
 * Percentile interval (R boot.ci type "perc").
 * @param {ArrayLike<number>} replicates
 * @param {number} confidence in (0, 1)
 * @returns {[number, number]|null} null when not computable
 */
export function percentileCI(replicates, confidence) {
  const s = finiteSorted(replicates);
  if (s.length < 2 || s[0] === s[s.length - 1]) return null;
  return [normInter(s, (1 - confidence) / 2), normInter(s, (1 + confidence) / 2)];
}

/**
 * Bias-corrected and accelerated interval (R boot::bca.ci).
 * @param {ArrayLike<number>} replicates
 * @param {number} estimate t0
 * @param {ArrayLike<number>} influence empirical influence values L
 * @param {number} confidence in (0, 1)
 * @returns {[number, number]|null} null when z0 or the acceleration is not finite
 */
export function bcaCI(replicates, estimate, influence, confidence) {
  const s = finiteSorted(replicates);
  const R = s.length;
  if (R < 2 || !Number.isFinite(estimate)) return null;
  let below = 0;
  for (let i = 0; i < R; i++) if (s[i] < estimate) below++;
  const w = qnorm(below / R);
  if (!Number.isFinite(w)) return null;
  let s2 = 0;
  let s3 = 0;
  for (let i = 0; i < influence.length; i++) {
    const l = influence[i];
    if (!Number.isFinite(l)) return null;
    s2 += l * l;
    s3 += l * l * l;
  }
  const a = s3 / (6 * Math.pow(s2, 1.5));
  if (!Number.isFinite(a)) return null;
  const bound = (alpha) => {
    const z = qnorm(alpha);
    return normInter(s, pnorm(w + (w + z) / (1 - a * (w + z))));
  };
  return [bound((1 - confidence) / 2), bound((1 + confidence) / 2)];
}

/**
 * Jackknife empirical influence values, deleting each observation within its
 * own group: Lᵢ = (n_g − 1)(t₀ − t₍₋ᵢ₎).
 * @param {Float64Array[]} groups
 * @param {(groups: Float64Array[]) => number} fn statistic of all groups
 * @returns {Float64Array} group 0 first, then group 1, …
 */
export function jackknifeInfluence(groups, fn) {
  const t0 = fn(groups);
  const total = groups.reduce((n, g) => n + g.length, 0);
  const L = new Float64Array(total);
  let o = 0;
  for (let g = 0; g < groups.length; g++) {
    const src = groups[g];
    const n = src.length;
    const reduced = new Float64Array(n - 1);
    const view = groups.slice();
    view[g] = reduced;
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let j = 0; j < n; j++) if (j !== i) reduced[r++] = src[j];
      L[o++] = (n - 1) * (t0 - fn(view));
    }
  }
  return L;
}
