/**
 * D.Mike — Mosaikdiagramm: Kreuztabelle aus zwei Kategorienspalten. Rein.
 *
 * Kategorien (X) und Gruppen (G) in der Reihenfolge des ersten Auftretens;
 * Zeilen mit leerer X- oder G-Zelle fallen auf beiden Achsen heraus. Die
 * Geometrie (Spaltenbreite, Segmenthöhe) rechnet der Diagrammtyp.
 */
import { PALETTE, cleanCat } from '../../../core/chart/chart-data-prep.js';

/**
 * @typedef {{ x: object|null, g: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, values: number[], color: string }} CrossTabGroup
 * @typedef {{ categories: string[], groups: CrossTabGroup[] }} CrossTab
 */

/**
 * Die Kreuztabelle einer Zeile der Datensätze: je Gruppe die Häufigkeit je
 * Kategorie und die Farbe aus der gemeinsamen Palette. Leer ohne beide
 * Slots, ohne Werte oder bei einer nicht lesbaren Spalte. Gelesen wird bis
 * zur kürzeren Spalte.
 *
 * @param {DatasetRow|undefined} row
 * @param {ColumnReader} read
 * @returns {CrossTab}
 */
export function buildCrossTab(row, read) {
  /** @type {CrossTab} */
  const empty = { categories: [], groups: [] };
  if (!row || !row.x || !row.g) return empty;
  const xVals = read.values(row.x);
  const gVals = read.values(row.g);
  if (!xVals || !gVals || xVals.length === 0 || gVals.length === 0) return empty;

  /** @type {string[]} */
  const xLevels = [];
  /** @type {string[]} */
  const gLevels = [];
  const xSeen = new Set();
  const gSeen = new Set();
  const n = Math.min(xVals.length, gVals.length);
  for (let i = 0; i < n; i++) {
    const xc = cleanCat(xVals[i]);
    const gc = cleanCat(gVals[i]);
    if (xc === '' || gc === '') continue;
    if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
    if (!gSeen.has(gc)) { gSeen.add(gc); gLevels.push(gc); }
  }
  if (xLevels.length === 0 || gLevels.length === 0) return empty;

  /** @type {Map<string, Map<string, number>>} */
  const matrix = new Map(xLevels.map((x) => [x, new Map(gLevels.map((g) => [g, 0]))]));
  for (let i = 0; i < n; i++) {
    const cell = matrix.get(cleanCat(xVals[i]));
    const g = cleanCat(gVals[i]);
    if (cell && cell.has(g)) cell.set(g, /** @type {number} */ (cell.get(g)) + 1);
  }

  return {
    categories: xLevels,
    groups: gLevels.map((name, gi) => ({
      name,
      values: xLevels.map((x) => /** @type {number} */ (matrix.get(x)?.get(name))),
      color: PALETTE[gi % PALETTE.length],
    })),
  };
}

/**
 * Summe je Kategorie, je Gruppe und insgesamt. Eine Quelle für die Tabelle
 * und für die Ableitung `stats`.
 *
 * @param {ReadonlyArray<{ values: number[] }>} groups  je Gruppe die Häufigkeit je Kategorie
 * @param {number} categoryCount  Zahl der Kategorien
 * @returns {{ rowTotals: number[], colTotals: number[], total: number }}
 */
export function totalsOf(groups, categoryCount) {
  const rowTotals = Array.from({ length: categoryCount }, () => 0);
  const colTotals = groups.map((g) => {
    let sum = 0;
    for (let ci = 0; ci < categoryCount; ci++) {
      const v = g.values[ci] || 0;
      sum += v;
      rowTotals[ci] += v;
    }
    return sum;
  });
  return { rowTotals, colTotals, total: colTotals.reduce((a, b) => a + b, 0) };
}
