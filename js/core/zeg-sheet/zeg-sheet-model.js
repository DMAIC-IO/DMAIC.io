/**
 * D.Mike — ZEG sheet model (core/zeg-sheet/zeg-sheet-model.js)
 *
 * Pure conversions between the goal-achievement history
 * (`phaseAchievementHistory`: { <phase>: [{t, v}, …] }), sheet rows
 * ({ date: 'YYYY-MM-DD', values: { <phase>: number|null } }) and the
 * DataGrid sheet state of the ZEG worksheet. Spec:
 * docs/superpowers/specs/2026-10-12-zeg-worksheet-design.md
 */

import { todayISO, isIsoDate } from '../local-date.js';
import { uid } from '../uid.js';

export const ZEG_MANAGED_BY = 'zeg';
export const DATE_REF = 'date';

/**
 * True for a column the ZEG sync owns.
 * @param {object} col
 * @returns {boolean}
 */
export function isZegColumn(col) {
  return col?.meta?.managedBy === ZEG_MANAGED_BY;
}

/** Local day of a timestamp as `YYYY-MM-DD`. */
function dayOf(t) {
  return todayISO(new Date(t));
}

/** 12:00 local time of an ISO day. */
function noonOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * Cell value → integer percentage 0..100, or null when not a number.
 * @param {unknown} v
 * @returns {number|null}
 */
function toPercent(v) {
  let n = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const s = v.replace('%', '').replace(',', '.').trim();
    if (s !== '') n = Number(s);
  }
  if (n === null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** True for a history entry with a usable timestamp. */
function hasTime(e) {
  return Number.isFinite(e?.t);
}

/**
 * Entries of one phase grouped by local day, each group in time order.
 * Entries without a numeric `t` are left out.
 */
function groupByDay(entries) {
  const byDay = new Map();
  for (const e of (entries || []).filter(hasTime).sort((a, b) => a.t - b.t)) {
    const day = dayOf(e.t);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  return byDay;
}

/**
 * History → one row per day (last entry of a day wins), sorted by date.
 * @param {object} history
 * @param {string[]} phaseIds
 * @returns {Array<{date: string, values: Object<string, number|null>}>}
 */
export function historyToRows(history, phaseIds) {
  const rows = new Map();
  for (const phase of phaseIds) {
    for (const [day, entries] of groupByDay(history?.[phase])) {
      if (!rows.has(day)) rows.set(day, Object.fromEntries(phaseIds.map(p => [p, null])));
      rows.get(day)[phase] = entries[entries.length - 1].v;
    }
  }
  return [...rows.keys()].sort().map(date => ({ date, values: rows.get(date) }));
}

/**
 * Rows → history. Per phase in `presentPhases` and day: unchanged value keeps
 * all of the day's old entries, changed value keeps the day's last timestamp,
 * a new day gets 12:00 local time, a missing value drops the day. Phases not
 * present (column missing) and phases outside `phaseIds` keep their history.
 * Entries without a numeric `t` are never shown, so they are passed through.
 * @param {Array<{date: unknown, values: object}>} rows
 * @param {string[]} phaseIds
 * @param {object} [oldHistory]
 * @param {string[]} [presentPhases]
 * @returns {object}
 */
export function rowsToHistory(rows, phaseIds, oldHistory = {}, presentPhases = phaseIds) {
  const next = { ...oldHistory };
  for (const phase of phaseIds) {
    if (!presentPhases.includes(phase)) continue;
    const perDay = new Map();
    for (const row of rows) {
      if (!isIsoDate(row.date)) continue;
      const v = toPercent(row.values?.[phase]);
      if (v !== null) perDay.set(row.date, v);
    }
    const oldByDay = groupByDay(oldHistory[phase]);
    const entries = [];
    for (const [day, v] of perDay) {
      const old = oldByDay.get(day);
      const last = old?.[old.length - 1];
      if (last && last.v === v) entries.push(...old);
      else entries.push({ t: last ? last.t : noonOf(day), v });
    }
    entries.sort((a, b) => a.t - b.t);
    entries.unshift(...(oldHistory[phase] || []).filter(e => !hasTime(e)));
    if (entries.length || oldHistory[phase]) next[phase] = entries;
  }
  return next;
}

/**
 * Read the rows from a ZEG sheet state. Without a date column — deleted, or
 * emptied while phase values remain — no phase counts as present, so losing
 * the dates never wipes the history.
 * @param {object|null} sheetState
 * @returns {{rows: Array<{date: unknown, values: object}>, presentPhases: string[]}}
 */
export function readRows(sheetState) {
  const cols = sheetState?.columns || [];
  const dateCol = cols.find(c => isZegColumn(c) && c.meta.managedRef === DATE_REF);
  if (!dateCol) return { rows: [], presentPhases: [] };
  const phaseCols = cols.filter(c => isZegColumn(c) && c.meta.managedRef !== DATE_REF);
  const n = sheetState.rowCount ?? Math.max(0, ...cols.map(c => c.values.length));
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      date: dateCol.values[i] ?? null,
      values: Object.fromEntries(phaseCols.map(c => [c.meta.managedRef, c.values[i] ?? null])),
    });
  }
  const anyDate = rows.some(r => isIsoDate(r.date));
  const anyValue = rows.some(r => Object.values(r.values).some(v => v !== null && v !== ''));
  if (!anyDate && anyValue) return { rows: [], presentPhases: [] };
  return { rows, presentPhases: phaseCols.map(c => c.meta.managedRef) };
}

/**
 * Build the ZEG sheet state from rows. Reuses id/name/format of existing
 * managed columns, drops managed columns of phases outside `phaseIds`, keeps
 * user columns (after the managed ones, never truncated). A user cell stays
 * with the date of its old row; cells of rows whose date is gone move below
 * the dated rows. No rows → one row dated today so the user can start typing.
 * @param {object|null} prevState
 * @param {Array<{date: string, values: object}>} rows
 * @param {string[]} phaseIds
 * @param {{date: string, phases: Object<string, string>}} labels
 * @returns {object}
 */
export function buildSheetState(prevState, rows, phaseIds, labels) {
  const prevCols = prevState?.columns || [];
  const managed = (ref) => prevCols.find(c => isZegColumn(c) && c.meta.managedRef === ref);
  const userCols = prevCols.filter(c => !isZegColumn(c));
  const body = rows.length ? rows : [{ date: todayISO(), values: {} }];
  const order = userRowOrder(prevState, userCols, body);
  const rowCount = Math.max(body.length, order.length);
  const pad = (arr) => [...arr, ...new Array(Math.max(0, rowCount - arr.length)).fill(null)];
  const reorder = (arr) => pad(order.map(i => (i === null ? null : arr[i] ?? null)));

  const make = (ref, type, name, values, format) => {
    const old = managed(ref);
    return {
      ...(old || {}),
      id: old?.id ?? uid(),
      name: old?.name ?? name,
      type,
      unit: old?.unit ?? '',
      values: pad(values),
      formulas: new Array(rowCount).fill(null),
      format: old?.format ?? format,
      meta: { managedBy: ZEG_MANAGED_BY, managedRef: ref },
    };
  };

  const columns = [
    make(DATE_REF, 'date', labels.date, body.map(r => r.date), {}),
    ...phaseIds.map(p => make(p, 'percent', labels.phases[p] ?? p, body.map(r => r.values[p] ?? null), { decimals: 0 })),
    ...userCols.map(c => ({ ...c, values: reorder(c.values), formulas: c.formulas ? reorder(c.formulas) : null })),
  ].map((c, i) => ({ ...c, shortName: `C${i + 1}` }));

  return {
    colWidths: {},
    ...(prevState || {}),
    columns,
    rowCount,
    sortCol: null,
    sortDir: null,
    selection: null,
  };
}

/**
 * For each new row, the old row index whose user cells it takes (null: none).
 * Old rows are matched by date; unmatched old rows that hold user data follow
 * the new rows. Without an old date column, rows keep their position.
 * @param {object|null} prevState
 * @param {object[]} userCols
 * @param {Array<{date: string}>} body
 * @returns {Array<number|null>}
 */
function userRowOrder(prevState, userCols, body) {
  const oldCount = Math.max(0, ...userCols.map(c => c.values.length));
  const dateCol = (prevState?.columns || []).find(c => isZegColumn(c) && c.meta.managedRef === DATE_REF);
  if (!dateCol) return Array.from({ length: oldCount }, (_, i) => i);
  const free = new Map();
  for (let i = 0; i < oldCount; i++) {
    const d = dateCol.values[i];
    if (!isIsoDate(d)) continue;
    if (!free.has(d)) free.set(d, []);
    free.get(d).push(i);
  }
  const used = new Set();
  const order = body.map(r => {
    const i = free.get(r.date)?.shift();
    if (i === undefined) return null;
    used.add(i);
    return i;
  });
  const hasUserData = (i) => userCols.some(c => c.values[i] !== null && c.values[i] !== undefined && c.values[i] !== '');
  for (let i = 0; i < oldCount; i++) {
    if (!used.has(i) && hasUserData(i)) order.push(i);
  }
  return order;
}
