/**
 * D.Mike — σ within estimators (sigma-within-engine.js)
 * Pure functions, no DOM. Splits values into subgroups and estimates the
 * within-subgroup standard deviation with Minitab's methods for Normal
 * Capability Analysis, together with the estimator's degrees of freedom ν.
 *
 *   subgroups:   pooled SD (default), R̄/d2, S̄/c4
 *   individuals: average moving range (default), median moving range, √MSSD
 *
 * Unequal subgroup sizes use the MVLUE weights (Minitab; qcc MVLUE-R/-SD).
 * Constants: spc-unbiasing-constants.js (Minitab's printed tables).
 */

import { mean, stddev } from './stats-utils.js';
import { lnGamma } from './math-utils.js';
import { D2, D3, D4, C4_PRIME } from './spc-unbiasing-constants.js';

export const SUBGROUP_METHODS = ['pooled', 'rbar', 'sbar'];
export const INDIVIDUALS_METHODS = ['averageMR', 'medianMR', 'sqrtMSSD'];
export const WITHIN_METHODS = [...SUBGROUP_METHODS, ...INDIVIDUALS_METHODS];

/** Largest subgroup size / moving-range span with tabulated d2, d3, d4. */
export const MAX_TABLE_N = D2.length - 1;

/** Error with a machine-readable `code` the module maps to a hint. */
export class SigmaWithinError extends Error {
  /**
   * @param {'subgroupTooLarge'|'spanTooLarge'|'methodInvalid'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'SigmaWithinError';
    this.code = code;
  }
}

/**
 * Unbiasing constant c4(n) = √(2/(n−1)) · Γ(n/2) / Γ((n−1)/2).
 * @param {number} n - sample size (> 1)
 * @returns {number}
 */
export function c4(n) {
  return Math.sqrt(2 / (n - 1)) * Math.exp(lnGamma(n / 2) - lnGamma((n - 1) / 2));
}

/**
 * Minitab's c4′(N) for √MSSD; beyond the table 1 − (1 − c4′(500))·499/(N − 1).
 * @param {number} N - number of observations (≥ 2)
 * @returns {number}
 */
export function c4Prime(N) {
  if (N < C4_PRIME.length) return C4_PRIME[N];
  const last = C4_PRIME.length - 1;
  return 1 - (1 - C4_PRIME[last]) * (last - 1) / (N - 1);
}

/** Minitab's f_n for the S̄ degrees of freedom, keyed by the upper n of each row. */
const F_N = [[2, 0.88], [3, 0.92], [4, 0.94], [5, 0.95], [7, 0.96], [9, 0.97], [17, 0.98], [64, 0.99]];

/**
 * f_n for ν(S̄) = f_n · k · (n̄ − 1), with n̄ rounded to the nearest integer.
 * @param {number} nBar
 * @returns {number}
 */
export function fN(nBar) {
  const n = Math.round(nBar);
  for (const [hi, f] of F_N) if (n <= hi) return f;
  return 1;
}

/** @returns {number} tabulated constant, or throws `code` beyond the table */
function tabulated(table, n, code) {
  const v = n < table.length ? table[n] : null;
  if (v == null) {
    throw new SigmaWithinError(code, `no unbiasing constant for n = ${n} (max ${MAX_TABLE_N})`);
  }
  return v;
}

/**
 * Comparable subgroup ID: '' for null/undefined/blank, otherwise the trimmed
 * string (numbers via String(), so 1 and '1' match, '1' and '1.0' do not).
 * @param {*} id
 * @returns {string}
 */
export function idKey(id) {
  return id == null ? '' : String(id).trim();
}

/**
 * Pair a value column with an ID column row by row. Rows whose value is not
 * a number or whose ID is empty are dropped together, so pairs stay aligned.
 * @param {any[]} rawValues
 * @param {any[]} rawIds
 * @returns {{ values: number[], ids: string[] }}
 */
export function alignValuesAndIds(rawValues, rawIds) {
  const values = [];
  const ids = [];
  const rows = Math.min(rawValues.length, rawIds.length);
  for (let i = 0; i < rows; i++) {
    const v = rawValues[i];
    const id = idKey(rawIds[i]);
    if (typeof v !== 'number' || Number.isNaN(v) || id === '') continue;
    values.push(v);
    ids.push(id);
  }
  return { values, ids };
}

/**
 * Split values (in production order) into subgroups: by a fixed size
 * (a trailing partial subgroup is kept) or by IDs (a new subgroup starts
 * whenever the ID differs from the previous row).
 * @param {number[]} values
 * @param {{ size?: number, ids?: any[] }} by
 * @returns {number[][]}
 */
export function splitSubgroups(values, { size, ids } = {}) {
  if (ids) {
    if (ids.length !== values.length) throw new Error('ids and values must have the same length');
    const groups = [];
    let prev = null;
    values.forEach((v, i) => {
      const key = idKey(ids[i]);
      if (groups.length === 0 || key !== prev) groups.push([]);
      groups[groups.length - 1].push(v);
      prev = key;
    });
    return groups;
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`size must be a positive integer (got ${size})`);
  }
  const groups = [];
  for (let i = 0; i < values.length; i += size) groups.push(values.slice(i, i + size));
  return groups;
}

/** @param {number[][]} groups @returns {boolean} no subgroup has two or more values */
export function isIndividuals(groups) {
  return !groups.some(g => g.length >= 2);
}

/** @param {number[][]} groups @returns {string} 'averageMR' for individuals, else 'pooled' */
export function defaultMethod(groups) {
  return isIndividuals(groups) ? 'averageMR' : 'pooled';
}

/** @param {number[][]} groups @returns {string[]} the methods that fit these groups */
export function validMethods(groups) {
  return [...(isIndividuals(groups) ? INDIVIDUALS_METHODS : SUBGROUP_METHODS)];
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pooled(groups, unbiased) {
  let ss = 0;
  let d = 0;
  for (const g of groups) {
    if (g.length < 2) continue;
    const m = mean(g);
    for (const v of g) ss += (v - m) ** 2;
    d += g.length - 1;
  }
  const sp = Math.sqrt(ss / d);
  return { sigma: unbiased ? sp / c4(d + 1) : sp, df: d };
}

function rbar(multi, k, nBar) {
  let num = 0;
  let den = 0;
  for (const g of multi) {
    const d2 = tabulated(D2, g.length, 'subgroupTooLarge');
    const d3 = tabulated(D3, g.length, 'subgroupTooLarge');
    const f = (d2 * d2) / (d3 * d3);
    num += f * (Math.max(...g) - Math.min(...g)) / d2;
    den += f;
  }
  return { sigma: num / den, df: 0.9 * k * (nBar - 1) };
}

function sbar(multi, k, nBar, unbiased) {
  let sigma;
  if (unbiased) {
    let num = 0;
    let den = 0;
    for (const g of multi) {
      const c = c4(g.length);
      const h = (c * c) / (1 - c * c);
      num += h * stddev(g) / c;
      den += h;
    }
    sigma = num / den;
  } else {
    sigma = multi.reduce((s, g) => s + stddev(g), 0) / k;
  }
  return { sigma, df: fN(nBar) * k * (nBar - 1) };
}

function movingRanges(x, w) {
  if (!Number.isInteger(w) || w < 2) throw new Error(`mrSpan must be an integer ≥ 2 (got ${w})`);
  if (w > x.length || w > MAX_TABLE_N) {
    throw new SigmaWithinError('spanTooLarge', `mrSpan ${w} exceeds N = ${x.length} or ${MAX_TABLE_N}`);
  }
  const out = [];
  for (let i = w - 1; i < x.length; i++) {
    let lo = x[i];
    let hi = x[i];
    for (let j = i - w + 1; j < i; j++) {
      if (x[j] < lo) lo = x[j];
      if (x[j] > hi) hi = x[j];
    }
    out.push(hi - lo);
  }
  return out;
}

function sqrtMssd(x, unbiased) {
  const n = x.length;
  let ss = 0;
  for (let i = 1; i < n; i++) ss += (x[i] - x[i - 1]) ** 2;
  const s = Math.sqrt(ss / (2 * (n - 1)));
  return { sigma: unbiased ? s / c4Prime(n) : s, df: n - 1 };
}

/**
 * Estimate σ within and its degrees of freedom ν.
 * Individuals methods flatten the groups in order.
 * @param {number[][]} groups - from {@link splitSubgroups}
 * @param {object} [opts]
 * @param {string} [opts.method] - one of WITHIN_METHODS; default {@link defaultMethod}
 * @param {boolean} [opts.unbiased=true] - c4 / c4′ for pooled, S̄, √MSSD
 * @param {number} [opts.mrSpan=2] - moving-range span w (average/median MR)
 * @returns {{ sigma: number, df: number, method: string, k: number, nBar: number,
 *   unbiased: boolean, mrSpan: number }}
 * @throws {SigmaWithinError} methodInvalid, subgroupTooLarge, spanTooLarge
 */
export function estimateSigmaWithin(groups, { method, unbiased = true, mrSpan = 2 } = {}) {
  const m = method || defaultMethod(groups);
  if (!validMethods(groups).includes(m)) {
    throw new SigmaWithinError('methodInvalid', `method ${m} does not fit ${isIndividuals(groups) ? 'individuals' : 'subgroups'}`);
  }
  let est;
  let k;
  let nBar;
  if (SUBGROUP_METHODS.includes(m)) {
    const multi = groups.filter(g => g.length >= 2);
    k = multi.length;
    nBar = multi.reduce((s, g) => s + g.length, 0) / k;
    if (m === 'pooled') est = pooled(groups, unbiased);
    else if (m === 'rbar') est = rbar(multi, k, nBar);
    else est = sbar(multi, k, nBar, unbiased);
  } else {
    const x = groups.flat();
    k = x.length;
    nBar = 1;
    if (m === 'sqrtMSSD') {
      est = sqrtMssd(x, unbiased);
    } else {
      const mr = movingRanges(x, mrSpan);
      est = m === 'averageMR'
        ? { sigma: mr.reduce((s, r) => s + r, 0) / mr.length / D2[mrSpan], df: mr.length }
        : { sigma: median(mr) / D4[mrSpan], df: mr.length };
    }
  }
  return { sigma: est.sigma, df: est.df, method: m, k, nBar, unbiased, mrSpan };
}
