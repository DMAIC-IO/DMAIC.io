/**
 * D.Mike — ZEG sheet model (core/zeg-sheet/zeg-sheet-model.js)
 *
 * Pure conversions between the goal-achievement history
 * (`phaseAchievementHistory`: { <phase>: [{t, v}, …] }), sheet rows
 * ({ date: 'YYYY-MM-DD', values: { <phase>: number|null } }) and the
 * DataGrid sheet state of the ZEG worksheet.
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
      if (last && toPercent(last.v) === v) entries.push(...old);
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
  // Kept rows after the dated ones: an undated typed row keeps its managed cells too.
  const tail = order.slice(body.length);
  const oldDates = managed(DATE_REF)?.values;
  const keepsManaged = (i) => i !== null && oldDates !== undefined && !isIsoDate(oldDates[i]);
  const withTail = (ref, values) => [...values, ...tail.map(i => (keepsManaged(i) ? managed(ref)?.values[i] ?? null : null))];

  const make = (ref, type, name, values, format) => {
    const old = managed(ref);
    return {
      ...(old || {}),
      id: old?.id ?? uid(),
      name: old?.name ?? name,
      type,
      unit: old?.unit ?? '',
      values: pad(withTail(ref, values)),
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

/** Id of the `writeColumns` action in a planned stack; later actions refer to it. */
const WRITE_ID = 'write';

/**
 * Column meta without unset keys: `read()` reports missing keys as null.
 * @param {object|null|undefined} meta
 * @returns {object}
 */
function cleanMeta(meta) {
  return Object.fromEntries(Object.entries(meta || {}).filter(([, v]) => v !== null && v !== undefined));
}

/** Cell array padded to `n` entries, missing cells as null. */
function cells(arr, n) {
  return Array.from({ length: n }, (_, i) => arr?.[i] ?? null);
}

/**
 * JSON text of a value with object keys sorted at every depth, so two
 * objects that differ only in key order serialize the same.
 * @param {unknown} v
 * @returns {string}
 */
function stableJson(v) {
  return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]]))
    : x));
}

/**
 * True if two values serialize the same (cells, formulas, meta), regardless
 * of key order: `read()` may hand out `meta` with its keys in another order.
 */
function same(a, b) {
  return stableJson(a) === stableJson(b);
}

/**
 * True if the sheet already shows the target: same column ids in the same
 * order, same values, formulas, meta and row count.
 * @param {{columns: object[], rowCount: number}} prev
 * @param {{columns: object[], rowCount: number}} next
 * @returns {boolean}
 */
function sheetMatches(prev, next) {
  const a = prev.columns || [];
  const b = next.columns || [];
  if (prev.rowCount !== next.rowCount || a.length !== b.length) return false;
  const n = next.rowCount;
  return b.every((col, i) => col.id === a[i].id
    && same(cells(col.values, n), cells(a[i].values, n))
    && same(cells(col.formulas, n), cells(a[i].formulas, n))
    && same(cleanMeta(col.meta), cleanMeta(a[i].meta)));
}

/**
 * Plan the agent stack that turns the ZEG sheet `prev` into `next` (from
 * `buildSheetState`): `instance.call`s on the worksheet, in this order —
 * one `writeColumns` (id `'write'`) for all target columns (existing ones
 * by id, new ones appended with name, type and format); `setColumnMeta`
 * per new column (its id as a reference into the write result) and per
 * existing column whose meta changed; `removeColumn` per dropped column;
 * `moveColumn` per column off its target index; `removeRows` for surplus
 * rows; `setFormula` per formula cell (`writeColumns` clears formulas).
 * Empty if the sheet already matches. Pure.
 *
 * Columns are sheet-state shaped: `{ id, name, type, format, meta, values,
 * formulas? }` with per-column `values`/`formulas` arrays.
 * @param {string} instanceId the worksheet instance
 * @param {string} sheetId the ZEG sheet
 * @param {{columns: object[], rowCount: number}} prev the sheet as read
 * @param {{columns: object[], rowCount: number}} next the target state
 * @returns {object[]} the stack, `[]` if nothing differs
 */
export function planZegStack(instanceId, sheetId, prev, next) {
  if (sheetMatches(prev, next)) return [];
  const call = (method, args, id) => ({
    op: 'instance.call', ...(id ? { id } : {}), instance: instanceId, module: 'worksheet', method, args,
  });
  const prevCols = prev.columns || [];
  const prevById = new Map(prevCols.map(c => [c.id, c]));
  const n = next.rowCount;

  // 1. Schreiben: neue Spalten hängen hinten an, ihre Id kommt als Referenz.
  const ref = new Map();
  const entries = next.columns.map((col, i) => {
    const values = cells(col.values, n);
    if (prevById.has(col.id)) return { to: col.id, values };
    ref.set(col.id, { $from: WRITE_ID, path: `value.${i}` });
    return { to: 'append', name: col.name, type: col.type, format: { ...(col.format ?? {}) }, values };
  });
  const target = (col) => ref.get(col.id) ?? col.id;
  const stack = [call('writeColumns', [sheetId, entries], WRITE_ID)];

  // 2. Merkmale: neue Spalten immer, bestehende bei Abweichung.
  for (const col of next.columns) {
    const meta = cleanMeta(col.meta);
    const old = prevById.get(col.id);
    if (old ? same(meta, cleanMeta(old.meta)) : Object.keys(meta).length === 0) continue;
    stack.push(call('setColumnMeta', [sheetId, target(col), Object.keys(meta).length ? meta : null]));
  }

  // 3. Weggefallene Spalten.
  const nextIds = new Set(next.columns.map(c => c.id));
  for (const col of prevCols) {
    if (!nextIds.has(col.id)) stack.push(call('removeColumn', [sheetId, col.id]));
  }

  // 4. Reihenfolge: nach dem Schreiben stehen neue Spalten hinten.
  const order = [...prevCols.filter(c => nextIds.has(c.id)).map(c => c.id),
    ...next.columns.filter(c => ref.has(c.id)).map(c => c.id)];
  next.columns.forEach((col, i) => {
    if (order[i] === col.id) return;
    order.splice(order.indexOf(col.id), 1);
    order.splice(i, 0, col.id);
    stack.push(call('moveColumn', [sheetId, target(col), i]));
  });

  // 5. Überzählige Zeilen.
  const prevRows = prev.rowCount ?? 0;
  if (n < prevRows) stack.push(call('removeRows', [sheetId, n, prevRows - n]));

  // 6. Formeln, die `writeColumns` gelöscht hat.
  for (const col of next.columns) {
    cells(col.formulas, n).forEach((f, row) => {
      if (typeof f === 'string' && f !== '') stack.push(call('setFormula', [sheetId, target(col), row, f]));
    });
  }
  return stack;
}

/**
 * For each new row, the old row index whose user cells it takes (null: none).
 * Old rows are matched by date; unmatched old rows that hold user data, and
 * undated rows with typed managed cells, follow the new rows. Without an old
 * date column, rows keep their position.
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
  for (let i = 0; i < dateCol.values.length; i++) {
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
  const filled = (v) => v !== null && v !== undefined && v !== '';
  const managedCols = prevState.columns.filter(isZegColumn);
  const hasUserData = (i) => userCols.some(c => filled(c.values[i]));
  const isTypedUndated = (i) => !isIsoDate(dateCol.values[i]) && managedCols.some(c => filled(c.values[i]));
  const rowTotal = Math.max(oldCount, ...managedCols.map(c => c.values.length));
  for (let i = 0; i < rowTotal; i++) {
    if (!used.has(i) && (hasUserData(i) || isTypedUndated(i))) order.push(i);
  }
  return order;
}
