/**
 * D.Mike — Resampling: Konstanten (Aufbauten, Statistiken, Grenzen).
 */

/** @type {readonly ('one'|'two'|'paired'|'k')[]} */
export const MODES = Object.freeze(['one', 'two', 'paired', 'k']);
/** @type {readonly ('difference'|'ratio')[]} */
export const CONTRASTS = Object.freeze(['difference', 'ratio']);
/** @type {readonly ('two-sided'|'greater'|'less')[]} */
export const DIRECTIONS = Object.freeze(['two-sided', 'greater', 'less']);
/** @type {readonly ('bca'|'percentile')[]} */
export const CI_METHODS = Object.freeze(['bca', 'percentile']);
export const SEED_MAX = 2147483647;
/** Alle Statistiken (gleich der Engine). */
export const STATISTIC_IDS = Object.freeze(['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk']);
/** Erlaubte Statistiken je Aufbau. */
export const STATS_BY_MODE = Object.freeze({
  one: STATISTIC_IDS,
  two: STATISTIC_IDS,
  paired: Object.freeze(['mean', 'median', 'trimmedMean']),
  k: Object.freeze(STATISTIC_IDS.filter((id) => id !== 'ppk')),
});
