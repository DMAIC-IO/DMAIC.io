/**
 * D.Mike — Balkendiagramm: Diagrammdaten und Tabelle aus einer Zeile der
 * Datensätze. Rein.
 *
 * Vier Modi, je nach gesetzten Slots:
 *   - nur `x`:         Häufigkeit je Kategorie                  → eine Reihe
 *   - `x` + `y`:       Mittelwert bzw. Summe von Y je Kategorie → eine Reihe
 *   - `x` + `g`:       Häufigkeit je Kategorie und Gruppe        → eine Reihe je Gruppe
 *   - `x` + `y` + `g`: Mittelwert bzw. Summe je Kategorie und Gruppe
 *
 * Kategorien und Gruppen in der Reihenfolge des ersten Auftretens, leere
 * Zellen fallen heraus. Die Geometrie der Balken (Breiten, Abstände,
 * Stapeln) macht der Diagrammtyp.
 */
import { PALETTE, cleanCat } from '../../../core/chart/chart-data-prep.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * @typedef {{ x: object|null, y: object|null, g: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, values: number[], color: string }} BarSeries
 * @typedef {{ categories: string[], groups: BarSeries[] }} BarData
 * @typedef {{ color: string, name: string, group: string, value: number }} BarTableRow
 */

/** @returns {BarData} */
const empty = () => ({ categories: [], groups: [] });

/** Schlüssel der einzigen Reihe ohne `g`-Slot. */
const SINGLE = Symbol('single');

/**
 * Eine Zahl der Wertespalte, gelesen wie eine Eingabe („2,5“ zählt);
 * `NaN`, wenn die Zelle keine endliche Zahl ist.
 * @param {unknown} v
 * @returns {number}
 */
function yNumber(v) {
  const n = parseDecimalInput(/** @type {any} */ (v));
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
}

/**
 * Die Diagrammdaten einer Zeile der Datensätze. Leer ohne `x`-Slot, ohne
 * Werte oder sobald ein gesetzter Slot nicht lesbar ist (auch `y` und `g`).
 * Gelesen wird bis zur kürzesten Spalte. Eine Kategorie entsteht auch, wenn
 * G oder Y in der Zeile fehlt (Wert 0); der Mittelwert einer leeren Zelle
 * ist 0. Nur endliche Y-Werte zählen. Ohne `g` gibt es genau eine Reihe,
 * benannt nach der Y- bzw. (ohne `y`) der X-Spalte.
 *
 * @param {DatasetRow|undefined} row
 * @param {ColumnReader} read
 * @param {'mean'|'sum'} aggregation  wirkt nur mit `y`-Slot
 * @returns {BarData}
 */
export function buildChartData(row, read, aggregation) {
  if (!row || !row.x) return empty();
  const xVals = read.values(row.x);
  if (!xVals || xVals.length === 0) return empty();
  const yVals = row.y ? read.values(row.y) : null;
  if (row.y && !yVals) return empty();
  const gVals = row.g ? read.values(row.g) : null;
  if (row.g && !gVals) return empty();

  const n = Math.min(xVals.length, yVals ? yVals.length : Infinity, gVals ? gVals.length : Infinity);

  /** @type {string[]} */
  const xLevels = [];
  /** @type {string[]} */
  const gLevels = [];
  const xSeen = new Set();
  const gSeen = new Set();
  for (let i = 0; i < n; i++) {
    const xc = cleanCat(xVals[i]);
    if (xc === '') continue;
    if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
    if (gVals) {
      const gc = cleanCat(gVals[i]);
      if (gc !== '' && !gSeen.has(gc)) { gSeen.add(gc); gLevels.push(gc); }
    }
  }
  if (xLevels.length === 0) return empty();

  /** @type {(string|symbol)[]} */
  const groupKeys = gVals ? gLevels : [SINGLE];
  /** @type {Map<string, Map<string|symbol, { sum: number, count: number }>>} */
  const matrix = new Map(xLevels.map((x) => [x, new Map(groupKeys.map((g) => [g, { sum: 0, count: 0 }]))]));
  for (let i = 0; i < n; i++) {
    const cells = matrix.get(cleanCat(xVals[i]));
    if (!cells) continue;
    const cell = cells.get(gVals ? cleanCat(gVals[i]) : SINGLE);
    if (!cell) continue;
    if (yVals) {
      const y = yNumber(yVals[i]);
      if (Number.isNaN(y)) continue;
      cell.sum += y;
    }
    cell.count += 1;
  }

  const mode = !yVals ? 'count' : aggregation === 'sum' ? 'sum' : 'mean';
  /** @param {{ sum: number, count: number }} c */
  const cellValue = (c) => {
    if (mode === 'mean') return c.count > 0 ? c.sum / c.count : 0;
    if (mode === 'sum') return c.sum;
    return c.count;
  };
  const singleName = (row.y ? read.name(row.y) : read.name(row.x)) || '';

  return {
    categories: xLevels,
    groups: groupKeys.map((key, gi) => ({
      name: typeof key === 'string' ? key : singleName,
      values: xLevels.map((x) => cellValue(/** @type {{ sum: number, count: number }} */ (matrix.get(x)?.get(key)))),
      color: PALETTE[gi % PALETTE.length],
    })),
  };
}

/**
 * Ob die Daten ein Diagramm tragen. Eine Quelle für Diagramm, Tabelle und
 * die Ableitung `stats`.
 * @param {BarData} data
 * @returns {boolean}
 */
export function hasData(data) {
  return data.categories.length > 0 && data.groups.length > 0;
}

/**
 * Summe aller Balkenwerte — die Summenzeile der Tabelle und `stats.total`.
 * @param {BarData} data
 * @returns {number}
 */
export function frequencyTotal(data) {
  let total = 0;
  for (const g of data.groups) for (const v of g.values) total += v || 0;
  return total;
}

/**
 * Die Tabellenzeilen: je Reihe alle Kategorien (reihenweise), mit der Farbe
 * der Reihe. Die Werte bleiben Zahlen, formatiert wird in der Ansicht.
 * @param {BarData} data
 * @returns {BarTableRow[]}
 */
export function tableRows(data) {
  return data.groups.flatMap((g) => data.categories.map((name, ci) => ({
    color: g.color, name, group: g.name, value: g.values[ci] || 0,
  })));
}
