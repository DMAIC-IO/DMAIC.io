/**
 * D.Mike — Process Capability shared analysis (process-capability-analysis.js)
 *
 * Pure: from a model State and a column reader to the engine result, the
 * estimator choice and an optional hint (i18n key + params, never text).
 * Used by the module view and the dashboard tile. No DOM, no i18n.
 */

import { validate, analyze } from '../../engines/process-capability-engine.js';
import {
  splitSubgroups, alignValuesAndIds, validMethods, defaultMethod, SigmaWithinError,
  SUBGROUP_METHODS,
} from '../../engines/sigma-within-engine.js';
import { decimalOr } from '../../core/parse-decimal.js';

/** SigmaWithinError code → hint key. */
const WITHIN_ERROR_HINT = {
  subgroupTooLarge: 'errWithinSubgroupTooLarge',
  spanTooLarge: 'errWithinSpanTooLarge',
};

/**
 * Resolved confidence as a fraction (0 < c < 1), from the percent input.
 * @param {import('./process-capability-model.js').State} state
 * @param {number} [defaultConfidence=95] - percent, used when the input is unusable
 * @returns {number}
 */
export function confidenceFraction(state, defaultConfidence = 95) {
  const raw = decimalOr(state.params.confidence, NaN);
  if (!isNaN(raw) && raw > 0) return Math.max(50, Math.min(99.99, raw)) / 100;
  return defaultConfidence / 100;
}

/** Numbers only. */
function numbers(arr) {
  return arr.filter(v => v != null && typeof v === 'number' && !isNaN(v));
}

/**
 * Values and, in ID-column mode, their aligned subgroup IDs. Embedded example
 * values take precedence (and force size mode, see effectiveSubgroupMode).
 * @returns {{ values: number[], ids: string[]|null, missingIds: boolean }}
 */
function analysisInput(state, readColumn) {
  if (state.effectiveSubgroupMode() !== 'column') {
    if (state.embeddedValues) return { values: numbers(state.embeddedValues), ids: null, missingIds: false };
    if (!state.columnRef) return { values: [], ids: null, missingIds: false };
    return { values: numbers(readColumn(state.columnRef)), ids: null, missingIds: false };
  }
  if (!state.columnRef) return { values: [], ids: null, missingIds: false };
  if (!state.subgroupColumnMatches()) return { values: [], ids: null, missingIds: true };
  const { values, ids } = alignValuesAndIds(readColumn(state.columnRef), readColumn(state.subgroupColumnRef));
  return { values, ids, missingIds: false };
}

/** Offered estimators for these groups and the active one. */
function chooseMethod(groups, stored) {
  const methods = validMethods(groups);
  return { methods, method: methods.includes(stored) ? stored : defaultMethod(groups) };
}

/**
 * Run the capability analysis for a model state.
 * @param {import('./process-capability-model.js').State} state
 * @param {(ref: object) => any[]} readColumn - raw worksheet column values
 * @param {{ defaultConfidence?: number }} [opts] - percent fallback for the confidence input
 * @returns {{ result: object|null, values: number[], method: string, methods: string[],
 *   hint: {key: string, params: object}|null, empty: boolean }}
 */
export function analyzeState(state, readColumn, { defaultConfidence = 95 } = {}) {
  const stored = state.params.withinMethod;
  // Without data the method list follows the settings alone (ID column →
  // subgroups, fixed size n → subgroups for n ≥ 2).
  const placeholder = [new Array(state.effectiveSubgroupMode() === 'column' ? 2 : state.subgroupSizeValue()).fill(0)];
  let { methods, method } = chooseMethod(placeholder, stored);
  const none = (extra = {}) => ({ result: null, values: [], method, methods, hint: null, empty: false, ...extra });

  if (!state.columnRef && !state.embeddedValues) return none({ empty: true });
  const { values, ids, missingIds } = analysisInput(state, readColumn);
  let hint = missingIds ? { key: 'subgroupColumnMissing', params: {} } : null;
  if (values.length === 0) return none({ hint });

  const groups = ids ? splitSubgroups(values, { ids }) : splitSubgroups(values, { size: state.subgroupSizeValue() });
  ({ methods, method } = chooseMethod(groups, stored));
  if (stored && stored !== method) {
    hint = {
      key: 'methodFallbackHint',
      params: { method: stored, kind: SUBGROUP_METHODS.includes(stored) ? 'kindSubgroups' : 'kindIndividuals', fallback: method },
    };
  }

  const p = state.params;
  const params = {
    lsl: decimalOr(p.lsl, null),
    usl: decimalOr(p.usl, null),
    target: decimalOr(p.target, null),
    confidence: confidenceFraction(state, defaultConfidence),
    withinMethod: method,
    unbiased: p.unbiased !== false,
    mrSpan: state.mrSpanValue(),
  };
  if (ids) params.subgroupIds = ids;
  else params.subgroupSize = state.subgroupSizeValue();

  if (!validate(params, values).valid) return none({ hint });
  try {
    return { result: analyze(params, values), values, method, methods, hint, empty: false };
  } catch (e) {
    if (!(e instanceof SigmaWithinError)) throw e;
    return none({ hint: { key: WITHIN_ERROR_HINT[e.code] || 'errWithinMethodInvalid', params: {} } });
  }
}

/**
 * Text of an analysis hint.
 * @param {{key: string, params: object}|null} hint
 * @param {(key: string, params?: object) => string} t - translator relative to the module namespace
 * @returns {string}
 */
export function formatHint(hint, t) {
  if (!hint) return '';
  if (hint.key !== 'methodFallbackHint') return t(hint.key, hint.params);
  const name = (k) => t(`withinMethodNames.${k}`);
  return t(hint.key, { method: name(hint.params.method), kind: t(hint.params.kind), fallback: name(hint.params.fallback) });
}

/**
 * Vertical reference lines for the spec limits and the target.
 * @param {{hasLsl: boolean, lsl: number, hasUsl: boolean, usl: number, targetVal: number|null}} r
 * @param {(key: string) => string} t - translator for global keys (common.sym.*)
 * @returns {object[]} histogram refLines
 */
export function specRefLines(r, t) {
  const line = (value, label, color) => ({ dir: 'v', value, label, color, dash: 'dash', width: 1.5, showLabel: true });
  const out = [];
  if (r.hasLsl) out.push(line(r.lsl, t('common.sym.lsl'), 'var(--color-error)'));
  if (r.hasUsl) out.push(line(r.usl, t('common.sym.usl'), 'var(--color-error)'));
  if (r.targetVal != null) out.push(line(r.targetVal, t('common.sym.target'), 'var(--color-success)'));
  return out;
}
