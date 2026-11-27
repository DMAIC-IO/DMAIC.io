/**
 * D.Mike — Korrelation: Spaltenwerte als Zahlen (domain/values.js). Rein.
 *
 * Wie die Altform: Datum über `Date.parse` (Millisekunden), Zeit `h:mm[:ss]`
 * in Sekunden, alle übrigen Spaltenarten nur echte Zahlen. Gepaart wird
 * zeilenweise; eine Zeile fällt, sobald einer der beiden Werte fehlt.
 */
import { readColumn, columnLabel } from '../../../core/source-columns.js';

/**
 * Ein Datumstext als Zahl (Millisekunden) oder `null`.
 * @param {unknown} str
 * @returns {number|null}
 */
function dateToNum(str) {
  if (typeof str !== 'string') return null;
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
}

/**
 * Ein Zeittext `h:mm` oder `h:mm:ss` als Sekunden oder `null`.
 * @param {unknown} str
 * @returns {number|null}
 */
function timeToNum(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
}

/**
 * Ein Zellwert als Zahl nach der Spaltenart; `null`, wenn er nicht zählt.
 * @param {unknown} val
 * @param {string|undefined} colType
 * @returns {number|null}
 */
export function toNumeric(val, colType) {
  if (val == null) return null;
  if (colType === 'date') return dateToNum(val);
  if (colType === 'time') return timeToNum(val);
  return (typeof val === 'number' && !Number.isNaN(val)) ? val : null;
}

/**
 * Eine Spalte, umgerechnet nach ihrer Art, Leerstellen als `null` (für die
 * Paarung); `null`, wenn der Bezug nicht lesbar ist (Spalte gelöscht).
 * @typedef {object} NumericColumn
 * @property {string} name  Anzeigename der Spalte
 * @property {Array<number|null>} values  Werte in Zeilenfolge
 */

/**
 * @param {import('../../../core/source-reader.js').Source} src
 * @param {{ instanceId: string, sheetId?: string, columnId: string }} ref
 * @returns {NumericColumn|null}
 */
export function numericColumn(src, ref) {
  const col = readColumn(src, /** @type {any} */ (ref));
  if (!col) return null;
  return { name: columnLabel(col), values: (col.values || []).map((v) => toNumeric(v, col.type)) };
}

/**
 * Zwei Spalten zeilenweise paaren: gezählt bis zur kürzeren, eine Zeile nur,
 * wenn beide Werte Zahlen sind.
 * @param {ReadonlyArray<number|null>} a
 * @param {ReadonlyArray<number|null>} b
 * @returns {{ x: number[], y: number[] }}
 */
export function pairedValues(a, b) {
  const len = Math.min(a.length, b.length);
  /** @type {number[]} */ const x = [];
  /** @type {number[]} */ const y = [];
  for (let i = 0; i < len; i++) {
    const va = a[i], vb = b[i];
    if (va !== null && vb !== null) { x.push(va); y.push(vb); }
  }
  return { x, y };
}

/**
 * Zahl der zählenden Werte einer Spalte.
 * @param {ReadonlyArray<number|null>} values
 * @returns {number}
 */
export function countValues(values) {
  return values.filter((v) => v !== null).length;
}
