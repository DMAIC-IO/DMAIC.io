/**
 * D.Mike — Chart-Suggestion Matcher (chart-suggestions.js)
 *
 * Given the analytical roles of a set of selected columns and a sample size,
 * return an ordered list of chart-type suggestions (highest score first).
 *
 * Pure module — no DOM, no i18n. The caller resolves `i18nKey` against the
 * `modules.chart-suggestion.charts.{key}` namespace.
 *
 * Rules live in chart-suggestions.json. Each rule has:
 *   - `match`: object mapping role → exact count (number) or comparator
 *              string (e.g. ">=3"). Roles not listed must have count 0.
 *   - `charts`: ordered list of `{type, score, i18nKey, conditions?, notesKey?}`.
 *              `conditions` may carry `minN`, `maxN`, `maxCategories` — if any
 *              fails for the current selection, the chart is dropped.
 *
 * Multiple rules may match (in theory); the first matching rule wins —
 * patterns are mutually exclusive by design.
 *
 * Sample size `n` is the longest non-null value count across the selection
 * (rows-with-data). `maxCategories` checks the distinct count of the first
 * categorical/ordinal column in the selection.
 */

import RULES_JSON from './chart-suggestions.json' with { type: 'json' };

/** Deep-freeze the imported rules so callers can't mutate the cached module data. */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}
export const RULES = deepFreeze(RULES_JSON);

/**
 * Count roles across a selection.
 * @param {Array<{role: string}>} columns
 * @returns {Object<string, number>}
 */
export function countRoles(columns) {
  const counts = {};
  for (const col of columns) {
    if (!col || !col.role) continue;
    counts[col.role] = (counts[col.role] || 0) + 1;
  }
  return counts;
}

/**
 * Check whether an actual role-count map matches a rule's `match` spec.
 *
 * Spec semantics:
 *   - `{ continuous: 2 }`            → exactly 2 continuous, 0 of every other role
 *   - `{ continuous: ">=3" }`        → 3 or more continuous, 0 of every other role
 *   - `{ continuous: 1, date: 1 }`   → exactly 1 continuous AND 1 date, 0 of others
 *
 * @param {Object<string, number>} actual
 * @param {Object<string, number|string>} spec
 * @returns {boolean}
 */
export function matchesPattern(actual, spec) {
  // 1) Every role mentioned in spec must satisfy its comparator
  for (const [role, expected] of Object.entries(spec)) {
    const got = actual[role] || 0;
    if (!compare(got, expected)) return false;
  }
  // 2) Every role NOT in spec must be 0
  for (const role of Object.keys(actual)) {
    if (!(role in spec) && actual[role] > 0) return false;
  }
  return true;
}

/**
 * Compare an integer count against a spec value:
 *   - number → exact equality
 *   - string ">=N" / "<=N" / ">N" / "<N" / "N" → comparator
 *
 * @param {number} got
 * @param {number|string} expected
 * @returns {boolean}
 */
function compare(got, expected) {
  if (typeof expected === 'number') return got === expected;
  if (typeof expected !== 'string') return false;
  const m = expected.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
  if (!m) return false;
  const op = m[1] || '=';
  const n = Number(m[2]);
  switch (op) {
    case '>=': return got >= n;
    case '<=': return got <= n;
    case '>':  return got >  n;
    case '<':  return got <  n;
    case '=':  return got === n;
    default:   return false;
  }
}

/**
 * Find the first rule whose `match` pattern fits the role-counts.
 * @param {Object<string, number>} roleCounts
 * @param {object} rules — defaults to the bundled rule set
 * @returns {object|null} the matching rule, or null if none match
 */
export function findRule(roleCounts, rules = RULES) {
  for (const rule of rules.rules) {
    if (matchesPattern(roleCounts, rule.match)) return rule;
  }
  return null;
}

/**
 * Test whether a chart's `conditions` block is satisfied for the current
 * selection. Unknown condition keys are ignored (forwards-compatible).
 *
 * @param {object} conditions — may be undefined/null
 * @param {{n: number, maxCategories: number|null}} ctx
 * @returns {boolean}
 */
export function conditionsHold(conditions, { n, maxCategories }) {
  if (!conditions) return true;
  if (conditions.minN != null && !(n >= conditions.minN)) return false;
  if (conditions.maxN != null && !(n <= conditions.maxN)) return false;
  if (conditions.maxCategories != null) {
    if (maxCategories == null) return true; // unknown — don't reject
    if (!(maxCategories <= conditions.maxCategories)) return false;
  }
  return true;
}

/**
 * Derive the effective sample size from a column snapshot.
 * Uses the longest non-null value count across all columns in the selection.
 *
 * @param {Array<{values?: any[], n?: number}>} columns
 * @returns {number}
 */
export function effectiveN(columns) {
  let max = 0;
  for (const col of columns) {
    if (typeof col.n === 'number') {
      if (col.n > max) max = col.n;
      continue;
    }
    if (Array.isArray(col.values)) {
      const c = col.values.reduce((acc, v) => acc + (v != null && v !== '' ? 1 : 0), 0);
      if (c > max) max = c;
    }
  }
  return max;
}

/**
 * Distinct non-null value count for the first categorical/ordinal column,
 * used to evaluate `maxCategories`. Returns null if no such column or no
 * values are provided.
 *
 * @param {Array<{role: string, values?: any[], distinctCount?: number}>} columns
 * @returns {number|null}
 */
export function categoricalCardinality(columns) {
  const target = columns.find(c => c.role === 'categorical' || c.role === 'ordinal');
  if (!target) return null;
  if (typeof target.distinctCount === 'number') return target.distinctCount;
  if (!Array.isArray(target.values)) return null;
  const set = new Set();
  for (const v of target.values) if (v != null && v !== '') set.add(v);
  return set.size;
}

/**
 * @typedef {object} Suggestion
 * @property {string} type — chart type id (e.g. 'histogram')
 * @property {number} score — sorting score (higher = better)
 * @property {string} i18nKey — relative key under `modules.chart-suggestion.charts`
 * @property {string|null} notesKey — optional secondary i18n key
 * @property {string} ruleId — id of the rule that produced the suggestion
 */

/**
 * Main API. Given a column selection, return ordered chart suggestions.
 *
 * @param {Array<{role: string, type?: string, values?: any[], n?: number, distinctCount?: number}>} columns
 * @param {object} [options]
 * @param {object} [options.rules] — override the bundled rule set
 * @returns {Suggestion[]}
 */
export function getSuggestionsFor(columns, options = {}) {
  if (!Array.isArray(columns) || columns.length === 0) return [];

  const roleCounts = countRoles(columns);
  const rule = findRule(roleCounts, options.rules || RULES);
  if (!rule) return [];

  const n = effectiveN(columns);
  const maxCategories = categoricalCardinality(columns);

  const out = [];
  for (const chart of rule.charts) {
    if (!conditionsHold(chart.conditions, { n, maxCategories })) continue;
    out.push({
      type:     chart.type,
      score:    chart.score,
      i18nKey:  chart.i18nKey,
      notesKey: chart.notesKey || null,
      ruleId:   rule.id,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
