/**
 * D.Mike — Resampling Module — Analysis (resampling-analysis.js)
 *
 * Pure glue between the model, the worksheet columns and the engine: reads
 * and cleans the inputs, validates them (i18n error keys), builds the engine
 * jobs, hashes the inputs and condenses engine results into the persisted
 * summary. No DOM, no i18n lookups — testable in node.
 */

import { coerceNumeric } from '../../core/worksheet-columns.js';
import { summarizeBins } from '../../engines/resampling-engine.js';
import { STATS_BY_MODE, SEED_MAX } from './resampling-model.js';

const B_MIN = 1000;
const B_MAX = 100000;
const MIN_VALUES = 2;
const MIN_VALUES_PPK = 10;
const BIN_COUNT = 30;

/**
 * Parse an optional numeric text input.
 * @param {unknown} v
 * @returns {number|null} null when empty, NaN when not a finite number
 */
export function parseOptionalNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Cell → finite number or null (empty, whitespace, text, ±Infinity). */
function cellNumber(v) {
  const n = coerceNumeric(v);
  return n !== null && Number.isFinite(n) ? n : null;
}

function numbersOf(raw) {
  const out = [];
  for (const v of raw || []) {
    const n = cellNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * Read the selected columns as clean samples.
 * @param {import('./resampling-model.js').State} state
 * @param {(ref: object) => unknown[]|null} getValues raw column values
 * @returns {{x?: number[], y?: number[], groups?: number[][]}}
 */
export function readInputs(state, getValues) {
  const raw = (ref) => (ref ? getValues(ref) || [] : []);
  if (state.mode === 'k') return { groups: (state.colRefsK || []).map((r) => numbersOf(raw(r))) };
  if (state.mode === 'one') return { x: numbersOf(raw(state.colRef1)) };
  if (state.mode === 'two') return { x: numbersOf(raw(state.colRef1)), y: numbersOf(raw(state.colRef2)) };
  // paired: keep rows where both sides are numbers
  const a = raw(state.colRef1);
  const b = raw(state.colRef2);
  const x = [];
  const y = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const u = cellNumber(a[i]);
    const w = cellNumber(b[i]);
    if (u !== null && w !== null) { x.push(u); y.push(w); }
  }
  return { x, y };
}

function samplesOf(inputs) {
  if (inputs.groups) return inputs.groups;
  return inputs.y ? [inputs.x, inputs.y] : [inputs.x];
}

/**
 * Engine parameters of the selected statistic.
 * @param {import('./resampling-model.js').State} state
 */
export function statParamsFor(state) {
  const sp = state.statParams || {};
  if (state.statisticId === 'trimmedMean') return { trim: parseOptionalNumber(sp.trim) };
  if (state.statisticId === 'quantile') return { p: parseOptionalNumber(sp.p) };
  if (state.statisticId === 'ppk') return { lsl: parseOptionalNumber(sp.lsl), usl: parseOptionalNumber(sp.usl) };
  return {};
}

/**
 * First validation problem as an i18n key (modules.resampling.<key>), or null.
 * @param {import('./resampling-model.js').State} state
 * @param {{x?: number[], y?: number[], groups?: number[][]}} inputs from readInputs
 * @returns {string|null}
 */
export function validateInputs(state, inputs) {
  const allowed = STATS_BY_MODE[state.mode] || [];
  if (!allowed.includes(state.statisticId)) return 'errStatisticMode';
  const params = statParamsFor(state);
  if (state.statisticId === 'trimmedMean' && (typeof params.trim !== 'number' || !(params.trim >= 0 && params.trim < 0.5))) return 'errTrim';
  if (state.statisticId === 'quantile' && !(params.p > 0 && params.p < 1)) return 'errQuantileP';
  if (state.statisticId === 'ppk') {
    const { lsl, usl } = params;
    if (Number.isNaN(lsl) || Number.isNaN(usl) || (lsl === null && usl === null)) return 'errLimitsMissing';
    if (lsl !== null && usl !== null && lsl >= usl) return 'errLimitsOrder';
  }
  if (typeof state.confidence !== 'number' || !(state.confidence > 0 && state.confidence < 1)) return 'errConfidence';
  if (!Number.isInteger(state.B) || state.B < B_MIN || state.B > B_MAX) return 'errB';
  if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > SEED_MAX) return 'errSeed';
  if (state.mode === 'one' && Number.isNaN(parseOptionalNumber(state.target))) return 'errTarget';
  if (state.mode === 'k' && (state.colRefsK || []).length < 3) return 'errMinGroups';
  const samples = samplesOf(inputs);
  if (samples.some((s) => s.length < MIN_VALUES)) return 'errMinValues';
  if (state.statisticId === 'ppk' && samples.some((s) => s.length < MIN_VALUES_PPK)) return 'errMinPpk';
  if (state.mode === 'two' && state.contrast === 'ratio' && samples.some((s) => s.some((v) => v <= 0))) {
    return 'errRatioPositive';
  }
  return null;
}

const CODE_KEYS = {
  'insufficient-data': 'errMinValues',
  'invalid-limits': 'errLimitsOrder',
  'non-positive-ratio': 'errRatioPositive',
  'invalid-statistic-for-mode': 'errStatisticMode',
  'degenerate-statistic': 'errDegenerateStatistic',
  'invalid-options': 'errOptions',
};

/**
 * i18n key for an engine ResamplingError code.
 * @param {string} code
 */
export function errorKeyForCode(code) {
  return CODE_KEYS[code] || 'errUnexpected';
}

/**
 * Engine jobs for the current mode.
 * @returns {Array<{role: 'boot'|'perm'|'k', job: object}>}
 */
export function buildJobs(state, inputs) {
  const statistic = { id: state.statisticId, params: statParamsFor(state) };
  const options = { B: state.B, seed: state.seed, confidence: state.confidence };
  const job = (kind, data, extra = {}) => ({ kind, data, statistic, options: { ...options, ...extra } });
  switch (state.mode) {
    case 'two': {
      const extra = { contrast: state.contrast, direction: state.direction };
      const data = { x: inputs.x, y: inputs.y };
      return [
        { role: 'boot', job: job('bootstrapTwo', data, extra) },
        { role: 'perm', job: job('permutationTwo', data, extra) },
      ];
    }
    case 'paired': {
      const extra = { direction: state.direction };
      const data = { x: inputs.x, y: inputs.y };
      return [
        { role: 'boot', job: job('bootstrapPaired', data, extra) },
        { role: 'perm', job: job('permutationPaired', data, extra) },
      ];
    }
    case 'k':
      return [{ role: 'k', job: job('permutationK', { groups: inputs.groups }) }];
    default:
      return [{ role: 'boot', job: job('bootstrapOne', { x: inputs.x }) }];
  }
}

/** FNV-1a (32 bit) of a string as 8 hex characters. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash of everything a result depends on (target and ciMethod are display
 * choices and excluded).
 * @returns {string}
 */
export function computeInputsHash(state, inputs) {
  return fnv1a(JSON.stringify({
    mode: state.mode,
    statisticId: state.statisticId,
    statParams: statParamsFor(state),
    contrast: state.mode === 'two' ? state.contrast : null,
    direction: state.mode === 'two' || state.mode === 'paired' ? state.direction : null,
    B: state.B,
    seed: state.seed,
    confidence: state.confidence,
    data: samplesOf(inputs),
  }));
}

const plainCI = (ci) => ({
  percentile: ci.percentile ? [ci.percentile[0], ci.percentile[1]] : null,
  bca: ci.bca ? [ci.bca[0], ci.bca[1]] : null,
  bcaFallback: ci.bcaFallback,
});

/**
 * Condense engine results into the persisted summary (plain JSON).
 * @param {import('./resampling-model.js').State} state
 * @param {object} inputs from readInputs
 * @param {Array<{role: string, result: object}>} outcomes in buildJobs order
 * @param {string} inputsHash
 * @param {string[]} labels column names per sample
 */
export function summarize(state, inputs, outcomes, inputsHash, labels) {
  const byRole = Object.fromEntries(outcomes.map((o) => [o.role, o.result]));
  const boot = byRole.boot;
  const perm = byRole.perm;
  const k = byRole.k;
  return {
    inputsHash,
    mode: state.mode,
    statisticId: state.statisticId,
    contrast: state.contrast,
    direction: state.direction,
    confidence: state.confidence,
    B: state.B,
    seed: state.seed,
    labels: labels.slice(),
    n: samplesOf(inputs).map((s) => s.length),
    boot: boot ? {
      estimate: boot.estimate, se: boot.se, bias: boot.bias,
      ci: plainCI(boot.ci), bins: summarizeBins(boot.replicates, BIN_COUNT),
    } : null,
    perm: perm ? {
      observed: perm.test.observed, pValue: perm.test.pValue, exact: perm.test.exact,
      permutations: perm.test.permutations, bins: summarizeBins(perm.test.distribution, BIN_COUNT),
    } : null,
    k: k ? {
      estimate: k.estimate,
      observed: k.test.observed, pValue: k.test.pValue, exact: k.test.exact,
      permutations: k.test.permutations, bins: summarizeBins(k.test.distribution, BIN_COUNT),
      groups: k.groups.map((g) => ({ estimate: g.estimate, ci: plainCI(g.ci) })),
      posthoc: k.posthoc.map((h) => ({
        i: h.i, j: h.j, contrast: h.contrast, ci: plainCI(h.ci),
        pRaw: h.pRaw, pHolm: h.pHolm, exact: h.exact,
      })),
    } : null,
  };
}

/**
 * Interval of the chosen method.
 * @param {{percentile: number[]|null, bca: number[]|null}|null} ci
 * @param {'bca'|'percentile'} method
 */
export function pickCI(ci, method) {
  if (!ci) return null;
  return method === 'percentile' ? ci.percentile : ci.bca;
}

/**
 * Test decision against a hypothesised value via the interval.
 * @param {number[]|null} interval
 * @param {number|null} target
 * @returns {'reject'|'retain'|null}
 */
export function decision(interval, target) {
  if (!interval || target === null || !Number.isFinite(target)) return null;
  return target < interval[0] || target > interval[1] ? 'reject' : 'retain';
}
