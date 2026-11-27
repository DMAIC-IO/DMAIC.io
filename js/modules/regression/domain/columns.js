/**
 * D.Mike — Regression: Spaltenwerte für die Rechnung (domain/columns.js). Rein.
 *
 * Wie die Altform: Datum über `Date.parse` (Millisekunden), Zeit `h:mm[:ss]`
 * in Sekunden, alle übrigen Spaltenarten nur echte Zahlen. Kategoriale
 * Faktorspalten des Versuchsplaners tragen `meta.categoricalCoding`; als
 * Zahl gelesen gilt deren Kodierung, als Prädiktor sind sie kategorial mit
 * der Stufenfolge der Kodierung. Eine andere Textspalte ist ebenso ein
 * kategorialer Faktor: Stufen sind ihre Werte, alphabetisch (wie Minitab),
 * Referenz die erste, Kodierung gleichabständig −1 … +1 wie im Planer.
 * Gepaart wird über die Rohwerte je Zeile.
 */
import { readColumn, columnLabel } from '../../../core/source-columns.js';

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

/**
 * Schlüssel eines Spaltenbezugs, `instanceId|sheetId|columnId` (wie die
 * Altform `refToKey`).
 * @param {ColumnRef} r
 * @returns {string}
 */
export const refKey = (r) => `${r.instanceId}|${r.sheetId ?? ''}|${r.columnId}`;

/**
 * Ein Zellwert als Zahl nach der Spaltenart; `null`, wenn er nicht zählt.
 * @param {unknown} val
 * @param {string|undefined} colType
 * @returns {number|null}
 */
export function toNumeric(val, colType) {
  if (val == null) return null;
  if (colType === 'date') {
    if (typeof val !== 'string') return null;
    const t = Date.parse(val);
    return Number.isFinite(t) ? t : null;
  }
  if (colType === 'time') {
    if (typeof val !== 'string') return null;
    const m = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
  }
  return (typeof val === 'number' && !Number.isNaN(val)) ? val : null;
}

/**
 * Eine gelesene Spalte.
 * @typedef {object} Column
 * @property {string} name  Anzeigename
 * @property {string|undefined} type  Spaltenart
 * @property {any[]} values  Rohwerte
 * @property {Record<string, number>|null} coding  Kodierung kategorialer Planerspalten
 */

/**
 * Die Spalte zum Bezug; `null`, wenn sie nicht lesbar ist (gelöscht).
 * @param {Source} src
 * @param {ColumnRef|null} ref
 * @returns {Column|null}
 */
export function readCol(src, ref) {
  const col = readColumn(src, /** @type {any} */ (ref));
  if (!col) return null;
  const coding = col.meta?.categoricalCoding;
  return {
    name: columnLabel(col),
    type: col.type,
    values: col.values ?? [],
    coding: coding && typeof coding === 'object' ? coding : null,
  };
}

/**
 * Die Kodierung einer Spalte: die des Planers, bei einer Textspalte ohne sie
 * die aus ihren Werten (Stufen alphabetisch, −1 … +1; eine Stufe → 0),
 * sonst `null`.
 * @param {Column} col
 * @returns {Record<string, number>|null}
 */
export function codingOf(col) {
  if (col.coding) return col.coding;
  if (col.type !== 'text') return null;
  const levels = [...new Set(col.values.filter((v) => v != null && v !== '').map(String))]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (levels.length === 0) return null;
  const k = levels.length;
  return Object.fromEntries(levels.map((l, i) => [l, k === 1 ? 0 : -1 + (2 * i) / (k - 1)]));
}

/**
 * Ob eine Spalte als kategorialer Faktor gilt: mit Kodierung oder als Textspalte.
 * @param {Column} col
 * @returns {boolean}
 */
export const isCategoricalColumn = (col) => col.coding != null || col.type === 'text';

/**
 * Die Werte als Zahlen je Zeile (Kodierung kategorialer Spalten, sonst nach
 * Spaltenart), Leerstellen als `null`.
 * @param {Column} col
 * @returns {Array<number|null>}
 */
export function numericOf(col) {
  const coding = codingOf(col);
  if (coding) {
    return col.values.map((v) => {
      if (v == null) return null;
      const c = coding[String(v)];
      return Number.isFinite(c) ? c : null;
    });
  }
  return col.values.map((v) => toNumeric(v, col.type));
}

/**
 * Eine Spalte als Prädiktor: kategorial bei mindestens zwei kodierten Stufen
 * (Referenz die erste), sonst stetig.
 * @typedef {{ kind: 'continuous', name: string, values: Array<number|null> }
 *   | { kind: 'categorical', name: string, levels: string[], reference: string, values: Array<string|null> }} Descriptor
 */

/**
 * @param {Column} col
 * @returns {Descriptor}
 */
export function descriptorOf(col) {
  const coding = codingOf(col);
  if (coding && Object.keys(coding).length >= 2) {
    const levels = Object.keys(coding);
    return {
      kind: 'categorical', name: col.name, levels, reference: levels[0],
      values: col.values.map((v) => (v == null ? null : String(v))),
    };
  }
  return { kind: 'continuous', name: col.name, values: col.values.map((v) => toNumeric(v, col.type)) };
}

/**
 * Gepaarte Zahlen zweier Spalten je Zeile; eine Zeile zählt nur mit beiden
 * Werten. `null` ohne Paar.
 * @param {Column} a
 * @param {Column} b
 * @returns {{ x: number[], y: number[] }|null}
 */
export function pairedOf(a, b) {
  const rawA = numericOf(a);
  const rawB = numericOf(b);
  const len = Math.min(rawA.length, rawB.length);
  /** @type {number[]} */ const x = [];
  /** @type {number[]} */ const y = [];
  for (let i = 0; i < len; i++) {
    const va = rawA[i];
    const vb = rawB[i];
    if (va !== null && vb !== null) { x.push(va); y.push(vb); }
  }
  return x.length > 0 ? { x, y } : null;
}

/**
 * Wozu ein Hinweis der Versuchsvorgabe gehört: X, Y und Grad. Weicht der
 * Stand davon ab, gilt der Hinweis nicht (er bleibt gespeichert und gilt
 * wieder, wenn der Stand zurückkehrt).
 * @param {readonly ColumnRef[]} colRefs
 * @param {ColumnRef|null|undefined} yRef
 * @param {number} polyDegree
 * @returns {string}
 */
export function noticeBasis(colRefs, yRef, polyDegree) {
  return JSON.stringify([colRefs.map(refKey), yRef ? refKey(yRef) : null, polyDegree]);
}
