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

/**
 * Normalize the summarized input of the active test kind.
 * @param {object} state — model state (see attribute-test-model.js)
 * @returns {object} Norm
 */
export function normalizeSummary(state) {
  const s = state.summary;
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
