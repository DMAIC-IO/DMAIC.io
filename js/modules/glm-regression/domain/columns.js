/**
 * D.Mike — GLM-Regression: Spaltenwerte für die Rechnung (domain/columns.js). Rein.
 *
 * Wie die Altform (`buildFitData`): Textspalten unter den X sind kategorial
 * (Rohwerte), alle übrigen Spalten werden Zelle für Zelle zu Zahlen
 * (Zahlentexte gelten, Leeres und Unlesbares nicht). Eine Zeile zählt, wenn
 * Y eine Zahl ist, jedes X einen Wert hat und — mit Versuchszahl — deren
 * Wert größer als 0 ist.
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
 * Ein Zellwert als Zahl: Zahlen und Zahlentexte; Leeres und Unlesbares
 * `null` (Altform `coerceNumeric`).
 * @param {unknown} val
 * @returns {number|null}
 */
export function toNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;
  if (typeof val === 'string' && val.trim() === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Eine gelesene Spalte.
 * @typedef {object} Column
 * @property {string} name  Anzeigename
 * @property {string|undefined} type  Spaltenart
 * @property {any[]} values  Rohwerte
 */

/**
 * Die Spalte zum Bezug; `null`, wenn sie nicht lesbar ist (gelöscht).
 * @param {Source} src
 * @param {ColumnRef|null} ref
 * @returns {Column|null}
 */
export function readCol(src, ref) {
  if (!ref) return null;
  const col = readColumn(src, /** @type {any} */ (ref));
  if (!col) return null;
  return { name: columnLabel(col) || '?', type: col.type, values: col.values ?? [] };
}

/**
 * Die Daten eines Fits.
 * @typedef {object} FitData
 * @property {number[]} y  Zielgröße je gezählter Zeile
 * @property {any[][]} xCols  je X die Werte der gezählten Zeilen (kategorial: Text)
 * @property {string[]} xNames  Namen der X
 * @property {boolean[]} xIsCat  je X, ob kategorial
 * @property {string} yName  Name der Zielgröße
 * @property {number[]|null} weights  Versuchszahl je gezählter Zeile, `null` ohne
 */

/**
 * Die gelesenen Spalten des Stands; `null`, wenn ein Bezug nicht lesbar ist.
 * @param {{ colRefs: readonly ColumnRef[], yRef: ColumnRef|null, trialsRef: ColumnRef|null }} m
 * @param {Source} src
 * @returns {{ xs: Column[], y: Column, trials: Column|null }|null}
 */
export function readInputs(m, src) {
  /** @type {Column[]} */
  const xs = [];
  for (const r of m.colRefs) {
    const c = readCol(src, r);
    if (!c) return null;
    xs.push(c);
  }
  const y = readCol(src, m.yRef);
  if (!y) return null;
  let trials = null;
  // Eine Versuchszahl auf Y oder unter den X (Agent ohne Mount, Altstand)
  // zählt nicht: die Rechnung nähme sonst Y oder ein X als Gewichte. Eingehängt
  // leert die Ansicht den Bezug.
  const tKey = m.trialsRef ? refKey(m.trialsRef) : '';
  const clash = tKey !== '' && [m.yRef, ...m.colRefs].some((r) => r != null && refKey(r) === tKey);
  if (m.trialsRef && !clash) {
    trials = readCol(src, m.trialsRef);
    if (!trials) return null;
  }
  return { xs, y, trials };
}

/**
 * Die gezählten Zeilen (Altform `buildFitData`).
 * @param {{ xs: Column[], y: Column, trials: Column|null }} cols
 * @returns {FitData}
 */
export function fitDataOf(cols) {
  const xIsCat = cols.xs.map((c) => c.type === 'text');
  const xRaw = cols.xs.map((c, j) => (xIsCat[j] ? c.values : c.values.map(toNumber)));
  const trialsRaw = cols.trials ? cols.trials.values.map(toNumber) : null;
  const maxLen = Math.min(cols.y.values.length, ...xRaw.map((c) => c.length), ...(trialsRaw ? [trialsRaw.length] : []));
  /** @type {number[]} */ const y = [];
  /** @type {any[][]} */ const xCols = xRaw.map(() => []);
  /** @type {number[]|null} */ const weights = trialsRaw ? [] : null;
  for (let i = 0; i < maxLen; i++) {
    const yv = toNumber(cols.y.values[i]);
    if (yv === null) continue;
    let ok = true;
    for (let j = 0; j < xRaw.length; j++) {
      const v = xRaw[j][i];
      if (xIsCat[j] ? (v == null || v === '') : v === null) { ok = false; break; }
    }
    if (!ok) continue;
    if (trialsRaw && weights) {
      const w = trialsRaw[i];
      if (w === null || w <= 0) continue;
      weights.push(w);
    }
    y.push(yv);
    for (let j = 0; j < xRaw.length; j++) xCols[j].push(xRaw[j][i]);
  }
  return { y, xCols, xNames: cols.xs.map((c) => c.name), xIsCat, yName: cols.y.name, weights };
}
