/**
 * D.Mike — Attribute Test Module — Input normalizer (attribute-test-input.js)
 *
 * Turns the persisted state (raw strings from the summary inputs) or raw
 * worksheet columns into validated counts for the engine. Pure: no DOM, no
 * i18n — errors are i18n keys under `modules.attribute-test`.
 */

import { resolveColumnRef } from '../../core/worksheet-columns.js';

/**
 * Read a column's raw values; null when no ref is set or it no longer
 * resolves (deleted worksheet/column), so the UI shows the "pick columns" hint.
 * @param {object} stateManager
 * @param {{instanceId:string,sheetId:string,columnId:string}|null} ref
 * @returns {any[]|null}
 */
export function columnValuesOrNull(stateManager, ref) {
  const col = resolveColumnRef(stateManager, ref);
  return col ? (col.values || []) : null;
}

/** @param {unknown} v @returns {boolean} */
function isMissing(v) {
  return v == null || (typeof v === 'number' && Number.isNaN(v)) || String(v).trim() === '';
}

/** @param {unknown} v @returns {boolean} true for blank summary inputs */
function isBlank(v) {
  return v == null || String(v).trim() === '';
}

/**
 * Parse a count: integer ≥ 0, blanks inside the number allowed ("1 200").
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseCount(raw) {
  if (isBlank(raw)) return null;
  const s = String(raw).replace(/\s+/g, '');
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * Parse a proportion with `.` or `,` as decimal separator.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseProportion(raw) {
  if (isBlank(raw)) return null;
  const v = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse a strictly positive number with `.` or `,` as decimal separator.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parsePositive(raw) {
  const v = parseProportion(raw);
  return v != null && v > 0 ? v : null;
}

/**
 * Distinct non-missing values as trimmed strings, natural sort order.
 * @param {unknown[]} values
 * @returns {string[]}
 */
export function distinctValues(values) {
  const set = new Set();
  for (const v of values || []) if (!isMissing(v)) set.add(String(v).trim());
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Default "event" value: the last distinct value (Minitab convention).
 * @param {unknown[]} values
 * @returns {string|null}
 */
export function defaultEventValue(values) {
  const d = distinctValues(values);
  return d.length ? d[d.length - 1] : null;
}

/** Chosen event level, or the default (last level) when unset or stale. */
function pickEvent(chosen, levels) {
  return chosen != null && levels.includes(chosen) ? chosen : levels[levels.length - 1];
}

const fail = (error) => ({ ok: false, error });
const hint = (error) => ({ ok: false, error, hint: true });

/** Validate one x/n pair. @returns {string|null} error key */
function checkPair(x, n) {
  if (x == null || n == null) return 'errCountInvalid';
  if (n === 0) return 'errNZero';
  if (x > n) return 'errXGreaterN';
  return null;
}

/** @returns {{ p0: number }|{ error: string }} */
function readP0(state) {
  const p0 = parseProportion(state.p0);
  if (p0 == null || p0 <= 0 || p0 >= 1) return { error: 'errP0Range' };
  return { p0 };
}

/** Hypothesized rate difference; blank means 0. */
function readDiff0(raw) {
  return isBlank(raw) ? 0 : parseProportion(raw);
}

/** Raw before/after labels of the McNemar table (empty → the template falls back). */
function readLabels(state) {
  const l = (state.summary.pairs && state.summary.pairs.labels) || {};
  return { before: l.before || '', after: l.after || '' };
}

/**
 * Column mode has no explicit McNemar labels: use the picked column names for
 * every label that is still empty. Non-McNemar results pass through unchanged.
 * @param {object} norm normalizer result
 * @param {{ before?: string, after?: string }} names column names
 * @returns {object}
 */
export function withColumnLabels(norm, names) {
  if (!norm || norm.kind !== 'mcnemar') return norm;
  const l = norm.labels || {};
  return { ...norm, labels: { before: l.before || names.before || '', after: l.after || names.after || '' } };
}

/**
 * Sum already-filtered count values (callers drop blanks first).
 * @returns {{ x: number, rows: number }|{ error: string }}
 */
function sumCounts(values) {
  let x = 0;
  for (const v of values) {
    const c = parseCount(v);
    if (c == null) return { error: 'errCountInvalid' };
    x += c;
  }
  return { x, rows: values.length };
}

/**
 * Equivalence bounds in percentage points → proportions (differences; for one
 * sample relative to p₀). Missing bounds are a hint, not an error.
 * @returns {{ lower: number, upper: number }|{ error: string, hint?: true }}
 */
function readBounds(state) {
  const e = state.equiv || {};
  let lower;
  let upper;
  if (e.symmetric !== false) {
    const d = parseProportion(e.delta);
    if (d == null) return { error: 'hintEnterBounds', hint: true };
    lower = -d / 100;
    upper = d / 100;
  } else {
    const lo = parseProportion(e.lower);
    const up = parseProportion(e.upper);
    if (lo == null || up == null) return { error: 'hintEnterBounds', hint: true };
    lower = lo / 100;
    upper = up / 100;
  }
  if (lower >= upper) return { error: 'errBoundsOrder' };
  if (!(lower < 0 && upper > 0)) return { error: e.samples === 1 ? 'errBoundsContainOne' : 'errBoundsContain' };
  return { lower, upper };
}

/** Wrap a part-1 proportion Norm as an equivalence Norm once the bounds are valid. */
function toEquivalence(state, norm) {
  if (!norm.ok) return norm;
  const b = readBounds(state);
  if (b.error) return b.hint ? hint(b.error) : fail(b.error);
  const { kind, ok, ...rest } = norm;
  return { ok, kind: 'equiv', samples: kind === 'one' ? 1 : 2, ...rest, lower: b.lower, upper: b.upper };
}

/** Exposure and hypothesized rate for the summary inputs. */
function readExposure(raw) {
  const t = parsePositive(raw);
  return t == null ? { error: 'errExposure' } : { t };
}

/**
 * Normalize the summarized input of the active test kind.
 * @param {object} state — model state (see attribute-test-model.js)
 * @returns {object} Norm
 */
export function normalizeSummary(state) {
  const s = state.summary;
  if (state.testKind === 'equiv') {
    const base = { ...state, testKind: state.equiv && state.equiv.samples === 1 ? 'one' : 'two' };
    return toEquivalence(state, normalizeSummary(base));
  }
  if (state.testKind === 'rate1') {
    if ([s.x, s.t, s.lambda0].every(isBlank)) return hint('hintEnterCounts');
    const x = parseCount(s.x);
    if (x == null) return fail('errCountInvalid');
    const e = readExposure(s.t);
    if (e.error) return fail(e.error);
    const lambda0 = parsePositive(s.lambda0);
    if (lambda0 == null) return fail('errLambda0');
    return { ok: true, kind: 'rate1', x, t: e.t, lambda0, missing: 0 };
  }
  if (state.testKind === 'rate2') {
    if ([s.x1, s.t1, s.x2, s.t2].every(isBlank)) return hint('hintEnterCounts');
    const x1 = parseCount(s.x1);
    const x2 = parseCount(s.x2);
    if (x1 == null || x2 == null) return fail('errCountInvalid');
    const e1 = readExposure(s.t1);
    const e2 = readExposure(s.t2);
    if (e1.error || e2.error) return fail('errExposure');
    const diff0 = readDiff0(s.diff0);
    if (diff0 == null) return fail('errDiff0');
    return { ok: true, kind: 'rate2', x1, t1: e1.t, x2, t2: e2.t, diff0, groups: null, missing: 0 };
  }
  if (state.testKind === 'mcnemar') {
    const c = s.pairs.counts;
    if (c.every(row => row.every(isBlank))) return hint('hintEnterCounts');
    const table = c.map(row => row.map(parseCount));
    if (table.some(row => row.some(v => v == null))) return fail('errCountInvalid');
    if (table.flat().every(v => v === 0)) return fail('errNZero');
    return { ok: true, kind: 'mcnemar', table, labels: readLabels(state), missing: 0 };
  }
  if (state.testKind === 'one') {
    if (isBlank(s.x) && isBlank(s.n)) return hint('hintEnterCounts');
    const x = parseCount(s.x);
    const n = parseCount(s.n);
    const err = checkPair(x, n);
    if (err) return fail(err);
    const p = readP0(state);
    if (p.error) return fail(p.error);
    return { ok: true, kind: 'one', x, n, p0: p.p0, missing: 0 };
  }
  if (state.testKind === 'two') {
    if ([s.x1, s.n1, s.x2, s.n2].every(isBlank)) return hint('hintEnterCounts');
    const [x1, n1, x2, n2] = [s.x1, s.n1, s.x2, s.n2].map(parseCount);
    const err = checkPair(x1, n1) || checkPair(x2, n2);
    if (err) return fail(err);
    return { ok: true, kind: 'two', x1, n1, x2, n2, groups: null, missing: 0 };
  }
  const t = s.table;
  if (t.counts.every(row => row.every(isBlank))) return hint('hintEnterCounts');
  const counts = t.counts.map(row => row.map(parseCount));
  if (counts.some(row => row.some(v => v == null))) return fail('errCountInvalid');
  if (counts.length < 2 || counts[0].length < 2) return fail('errTableTooSmall');
  return { ok: true, kind: 'assoc', rows: [...t.rows], cols: [...t.cols], counts, missing: 0 };
}

/**
 * Normalize column input of the active test kind.
 * @param {object} state — model state
 * @param {{ response: unknown[]|null, group: unknown[]|null,
 *   rowVar: unknown[]|null, colVar: unknown[]|null }} cols
 * @returns {object} Norm
 */
export function normalizeColumns(state, cols) {
  if (state.testKind === 'equiv') {
    const base = { ...state, testKind: state.equiv && state.equiv.samples === 1 ? 'one' : 'two' };
    return toEquivalence(state, normalizeColumns(base, cols));
  }

  if (state.testKind === 'rate1') {
    if (!cols.counts) return hint('hintPickColumns');
    const perRow = parsePositive(state.exposurePerRow);
    if (perRow == null) return fail('errExposure');
    const present = cols.counts.filter(v => !isMissing(v));
    if (present.length === 0) return fail('errExposure');
    const sum = sumCounts(present);
    if (sum.error) return fail(sum.error);
    const lambda0 = parsePositive(state.summary.lambda0);
    if (lambda0 == null) return fail('errLambda0');
    return {
      ok: true, kind: 'rate1', x: sum.x, t: sum.rows * perRow, lambda0,
      missing: cols.counts.length - present.length,
    };
  }

  if (state.testKind === 'rate2') {
    if (!cols.counts || !cols.group) return hint('hintPickColumns');
    const perRow = parsePositive(state.exposurePerRow);
    if (perRow == null) return fail('errExposure');
    const rows = [];
    let missing = 0;
    const len = Math.max(cols.counts.length, cols.group.length);
    for (let i = 0; i < len; i++) {
      const c = cols.counts[i];
      const g = cols.group[i];
      if (isMissing(c) || isMissing(g)) {
        if (!(isMissing(c) && isMissing(g))) missing++;
        continue;
      }
      rows.push([c, String(g).trim()]);
    }
    const groups = distinctValues(rows.map(r => r[1]));
    if (groups.length !== 2) return fail('errGroupLevels');
    const sums = groups.map(g => sumCounts(rows.filter(r => r[1] === g).map(r => r[0])));
    const bad = sums.find(r => r.error);
    if (bad) return fail(bad.error);
    const diff0 = readDiff0(state.summary.diff0);
    if (diff0 == null) return fail('errDiff0');
    return {
      ok: true, kind: 'rate2',
      x1: sums[0].x, t1: sums[0].rows * perRow, x2: sums[1].x, t2: sums[1].rows * perRow,
      diff0, groups, missing,
    };
  }

  if (state.testKind === 'mcnemar') {
    if (!cols.before || !cols.after) return hint('hintPickColumns');
    const trim = (arr) => {
      let end = arr.length;
      while (end > 0 && isMissing(arr[end - 1])) end--;
      return arr.slice(0, end);
    };
    const before = trim(cols.before);
    const after = trim(cols.after);
    if (before.length !== after.length) return fail('errPairsLength');
    const pairs = [];
    let missing = 0;
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (isMissing(b) || isMissing(a)) {
        if (!(isMissing(b) && isMissing(a))) missing++;
        continue;
      }
      pairs.push([String(b).trim(), String(a).trim()]);
    }
    const levels = distinctValues(pairs.flat());
    if (levels.length !== 2) return fail('errPairLevels');
    const event = pickEvent(state.eventValue, levels);
    const table = [[0, 0], [0, 0]];
    for (const [b, a] of pairs) table[b === event ? 0 : 1][a === event ? 0 : 1]++;
    return { ok: true, kind: 'mcnemar', table, labels: readLabels(state), missing };
  }

  if (state.testKind === 'one') {
    if (!cols.response) return hint('hintPickColumns');
    const levels = distinctValues(cols.response);
    if (levels.length !== 2) return fail('errResponseLevels');
    const event = pickEvent(state.eventValue, levels);
    let x = 0;
    let n = 0;
    let missing = 0;
    for (const v of cols.response) {
      if (isMissing(v)) { missing++; continue; }
      n++;
      if (String(v).trim() === event) x++;
    }
    const p = readP0(state);
    if (p.error) return fail(p.error);
    return { ok: true, kind: 'one', x, n, p0: p.p0, missing };
  }

  if (state.testKind === 'two') {
    if (!cols.response || !cols.group) return hint('hintPickColumns');
    const pairs = [];
    let missing = 0;
    const len = Math.max(cols.response.length, cols.group.length);
    for (let i = 0; i < len; i++) {
      const r = cols.response[i];
      const g = cols.group[i];
      if (isMissing(r) || isMissing(g)) {
        if (!(isMissing(r) && isMissing(g))) missing++;
        continue;
      }
      pairs.push([String(r).trim(), String(g).trim()]);
    }
    const groups = distinctValues(pairs.map(p => p[1]));
    if (groups.length !== 2) return fail('errGroupLevels');
    const levels = distinctValues(pairs.map(p => p[0]));
    if (levels.length !== 2) return fail('errResponseLevels');
    const event = pickEvent(state.eventValue, levels);
    const count = (g) => pairs.filter(p => p[1] === g);
    const s1 = count(groups[0]);
    const s2 = count(groups[1]);
    return {
      ok: true,
      kind: 'two',
      x1: s1.filter(p => p[0] === event).length,
      n1: s1.length,
      x2: s2.filter(p => p[0] === event).length,
      n2: s2.length,
      groups,
      missing,
    };
  }

  if (!cols.rowVar || !cols.colVar) return hint('hintPickColumns');
  const pairs = [];
  let missing = 0;
  const len = Math.max(cols.rowVar.length, cols.colVar.length);
  for (let i = 0; i < len; i++) {
    const r = cols.rowVar[i];
    const c = cols.colVar[i];
    if (isMissing(r) || isMissing(c)) {
      if (!(isMissing(r) && isMissing(c))) missing++;
      continue;
    }
    pairs.push([String(r).trim(), String(c).trim()]);
  }
  const rows = distinctValues(pairs.map(p => p[0]));
  const colsOut = distinctValues(pairs.map(p => p[1]));
  if (rows.length < 2 || colsOut.length < 2) return fail('errTableTooSmall');
  const counts = rows.map(() => colsOut.map(() => 0));
  for (const [r, c] of pairs) counts[rows.indexOf(r)][colsOut.indexOf(c)]++;
  return { ok: true, kind: 'assoc', rows, cols: colsOut, counts, missing };
}
