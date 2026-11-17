/**
 * D.Mike — Reine Tabellenoperationen über TableData (datagrid/table/ops.js)
 *
 * Mutieren nur die übergebene `TableData` und liefern die Umkehrdaten.
 * Sie rufen `markTableChanged` nicht auf (das tun die Kommandos). Blöcke sind
 * spaltenweise: `block[spalte][zeile]`.
 */
import { parseNumeric, parseCellInput, isNumericType } from '../datagrid-utils.js';

/**
 * Schreibt einen Block ab (c0, r0). Der Block muss in der Tabelle liegen; sonst
 * wirft die Funktion, bevor sie etwas ändert.
 * @param {import('../../table-data.js').TableData} table
 * @param {number} c0 @param {number} r0
 * @param {any[][]} block spaltenweise
 * @returns {{ before: any[][] }} vorherige Werte, gleiche Form
 */
export function setRange(table, c0, r0, block) {
  for (let ci = 0; ci < block.length; ci++) {
    if (!table.columns[c0 + ci] || r0 < 0 || r0 + block[ci].length > table.rowCount) {
      throw new RangeError(`setRange: block outside table (col ${c0 + ci}, row ${r0})`);
    }
  }
  const before = [];
  for (let ci = 0; ci < block.length; ci++) {
    const col = table.columns[c0 + ci];
    const old = new Array(block[ci].length);
    for (let ri = 0; ri < block[ci].length; ri++) { old[ri] = col[r0 + ri]; col[r0 + ri] = block[ci][ri]; }
    before.push(old);
  }
  return { before };
}

/** @param {any[]} col @param {number} at @param {any[]} items */
function spliceIn(col, at, items) {
  const tail = col.splice(at);
  for (const v of items) col.push(v);
  for (const v of tail) col.push(v);
}

/**
 * Fügt `count` leere Zeilen ab `at` ein.
 * @param {import('../../table-data.js').TableData} table @param {number} at @param {number} count
 */
export function insertRows(table, at, count) {
  const nulls = new Array(count).fill(null);
  for (const col of table.columns) spliceIn(col, at, nulls);
  table.rowCount += count;
}

/**
 * Entfernt `count` Zeilen ab `at`.
 * @param {import('../../table-data.js').TableData} table @param {number} at @param {number} count
 * @returns {{ removed: any[][] }} entfernte Zellen, spaltenweise (Umkehr: `insertRows` + `setRange(table, 0, at, removed)`)
 */
export function deleteRows(table, at, count) {
  const removed = table.columns.map((col) => col.splice(at, count));
  table.rowCount -= removed.length ? removed[0].length : Math.min(count, Math.max(0, table.rowCount - at));
  return { removed };
}

/**
 * Verschiebt eine Zeile; `to` ist ihre Position danach. Umkehr: `moveRowData(table, to, from)`.
 * @param {import('../../table-data.js').TableData} table @param {number} from @param {number} to
 */
export function moveRowData(table, from, to) {
  if (from === to) return;
  for (const col of table.columns) { const [v] = col.splice(from, 1); col.splice(to, 0, v); }
}

/**
 * Fügt eine Spalte bei `at` ein (Vorgabe: lauter `null`; mehr Werte als Zeilen werfen, zu wenige werden mit `null` aufgefüllt).
 * @param {import('../../table-data.js').TableData} table @param {number} at @param {any[]} [values]
 */
export function insertColumn(table, at, values) {
  if (values && values.length > table.rowCount) throw new RangeError('insertColumn: more values than rows');
  const col = values ? values.slice() : new Array(table.rowCount).fill(null);
  while (col.length < table.rowCount) col.push(null);
  table.columns.splice(at, 0, col);
}

/**
 * Entfernt eine Spalte. @param {import('../../table-data.js').TableData} table @param {number} at
 * @returns {any[]} deren Werte (Umkehr: `insertColumn(table, at, werte)`)
 */
export function deleteColumn(table, at) {
  return table.columns.splice(at, 1)[0];
}

/**
 * Verschiebt eine Spalte; `to` ist ihre Position danach. Umkehr: `moveColumnData(table, to, from)`.
 * @param {import('../../table-data.js').TableData} table @param {number} from @param {number} to
 */
export function moveColumnData(table, from, to) {
  if (from === to) return;
  const [c] = table.columns.splice(from, 1);
  table.columns.splice(to, 0, c);
}

/**
 * Sortierreihenfolge wie `DataGrid.sortByColumn`: Zahlen vor Text je Vergleich
 * (Zahl/Zahl numerisch, sonst `localeCompare`), `null` immer am Ende, stabil.
 * @param {any[]} values @param {'asc'|'desc'} dir
 * @returns {number[]} `perm[neu] = alt`
 */
export function sortPermutation(values, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const idx = Array.from({ length: values.length }, (_, i) => i);
  idx.sort((a, b) => {
    const va = values[a], vb = values[b];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return String(va).localeCompare(String(vb)) * sign;
  });
  return idx;
}

/**
 * Ordnet die Zeilen aller Spalten nach `perm` (`neu[i] = alt[perm[i]]`), in den vorhandenen Arrays.
 * @param {import('../../table-data.js').TableData} table @param {number[]} perm
 */
export function applyPermutation(table, perm) {
  for (const col of table.columns) {
    const copy = col.slice();
    for (let i = 0; i < perm.length; i++) col[i] = copy[perm[i]];
  }
}

/** @param {number[]} perm @returns {number[]} die Umkehrung (`inv[perm[i]] = i`) */
export function invertPermutation(perm) {
  const inv = new Array(perm.length);
  for (let i = 0; i < perm.length; i++) inv[perm[i]] = i;
  return inv;
}

/**
 * Rechnet die Werte einer Spalte auf einen anderen Typ um (wie `DataGrid.setColumnType`).
 * @param {any[]} values @param {string} fromType @param {string} toType
 * @returns {any[]} neues Array
 */
export function convertColumn(values, fromType, toType) {
  if (fromType === toType) return values.slice();
  if (toType === 'binary') {
    return values.map((v) => {
      if (v == null) return null;
      if (v === 0 || v === 1) return v;
      const n = parseNumeric(v);
      return n === 0 ? 0 : n === 1 ? 1 : null;
    });
  }
  if (isNumericType(toType)) return values.map((v) => (v == null ? null : parseNumeric(v)));
  if (toType === 'text') return values.map((v) => (v == null ? null : String(v)));
  if (toType === 'date' || toType === 'time') {
    return values.map((v) => (v == null ? null : parseCellInput({ type: toType }, String(v))));
  }
  return values.slice();
}
