/**
 * D.Mike — Heatmap: Raster und Summen aus einer Zeile der Datensätze. Rein.
 *
 * X bildet die Spalten, G die Zeilen des Rasters. Ohne V zählt jede Zelle
 * die Zeilen, mit V Mittelwert bzw. Summe der Werte. Stufen in der
 * Reihenfolge des ersten Auftretens; Zeilen mit leerer X- oder G-Zelle
 * fallen ganz heraus. Eine Quelle für Diagramm, Tabelle und `stats`.
 */
import { cleanCat } from '../../../core/chart/chart-data-prep.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * @typedef {{ x: object|null, g: object|null, v: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ xCategories: string[], yCategories: string[], cells: Array<Array<number|null>> }} HeatmapGrid
 * @typedef {{ rowTotals: number[], colTotals: number[], total: number }} HeatmapTotals
 */

/** @returns {HeatmapGrid} */
const empty = () => ({ xCategories: [], yCategories: [], cells: [] });

/**
 * Ein Wert der Wertespalte, gelesen wie eine Eingabe („2,5“ zählt);
 * `NaN`, wenn die Zelle keine endliche Zahl ist.
 * @param {unknown} v
 * @returns {number}
 */
function vNumber(v) {
  const n = parseDecimalInput(/** @type {any} */ (v));
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
}

/**
 * Das Raster einer Zeile der Datensätze. Leer ohne `x`- oder `g`-Slot und
 * sobald ein gesetzter Slot nicht lesbar ist (auch `v`). Gelesen wird bis zur
 * kürzesten der gesetzten Spalten. Im Zählmodus ist eine leere Zelle `0`, im
 * Wertmodus `null`; nur endliche V-Werte zählen.
 *
 * @param {DatasetRow|undefined} row
 * @param {ColumnReader} read
 * @param {'mean'|'sum'} aggregation  wirkt nur mit `v`-Slot
 * @returns {HeatmapGrid}
 */
export function buildGrid(row, read, aggregation) {
  if (!row || !row.x || !row.g) return empty();
  const xVals = read.values(row.x);
  const gVals = read.values(row.g);
  if (!xVals || !gVals) return empty();
  const vVals = row.v ? read.values(row.v) : null;
  if (row.v && !vVals) return empty();

  const n = Math.min(xVals.length, gVals.length, vVals ? vVals.length : Infinity);

  /** @type {string[]} */
  const xLevels = [];
  /** @type {string[]} */
  const yLevels = [];
  const xSeen = new Set();
  const ySeen = new Set();
  for (let i = 0; i < n; i++) {
    const xc = cleanCat(xVals[i]);
    const gc = cleanCat(gVals[i]);
    if (xc === '' || gc === '') continue;
    if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
    if (!ySeen.has(gc)) { ySeen.add(gc); yLevels.push(gc); }
  }
  if (xLevels.length === 0 || yLevels.length === 0) return empty();

  const accum = yLevels.map(() => xLevels.map(() => ({ sum: 0, count: 0 })));
  const xIdx = new Map(xLevels.map((v, i) => [v, i]));
  const yIdx = new Map(yLevels.map((v, i) => [v, i]));
  for (let i = 0; i < n; i++) {
    const xi = xIdx.get(cleanCat(xVals[i]));
    const yi = yIdx.get(cleanCat(gVals[i]));
    if (xi === undefined || yi === undefined) continue;
    const cell = accum[yi][xi];
    if (vVals) {
      const v = vNumber(vVals[i]);
      if (Number.isNaN(v)) continue;
      cell.sum += v;
    }
    cell.count += 1;
  }

  const mode = !vVals ? 'count' : aggregation === 'sum' ? 'sum' : 'mean';
  const cells = accum.map((r) => r.map((c) => {
    if (mode === 'count') return c.count;
    if (c.count === 0) return null;
    return mode === 'sum' ? c.sum : c.sum / c.count;
  }));
  return { xCategories: xLevels, yCategories: yLevels, cells };
}

/**
 * Ob das Raster ein Diagramm trägt: Stufen auf beiden Achsen.
 * @param {HeatmapGrid} grid
 * @returns {boolean}
 */
export function hasGrid(grid) {
  return grid.xCategories.length > 0 && grid.yCategories.length > 0;
}

/**
 * Zeilen-, Spalten- und Gesamtsumme; leere Zellen (`null`) zählen nicht.
 * @param {Array<Array<number|null>>} cells
 * @returns {HeatmapTotals}
 */
export function totalsOf(cells) {
  const colTotals = (cells[0] || []).map(() => 0);
  const rowTotals = cells.map((r) => {
    let sum = 0;
    r.forEach((v, xi) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        colTotals[xi] += v;
      }
    });
    return sum;
  });
  return { rowTotals, colTotals, total: rowTotals.reduce((a, b) => a + b, 0) };
}

/**
 * Ob sich die Zellen sinnvoll summieren lassen: ohne `v`-Slot (Zählen) oder
 * mit der Aggregation `sum`.
 * @param {DatasetRow|undefined} row
 * @param {'mean'|'sum'} aggregation
 * @returns {boolean}
 */
export function additive(row, aggregation) {
  return !row?.v || aggregation === 'sum';
}
