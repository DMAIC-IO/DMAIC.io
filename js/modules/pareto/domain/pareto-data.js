/**
 * D.Mike — Pareto-Diagramm: Diagrammdaten und Tabelle aus einer Zeile der
 * Datensätze. Rein.
 *
 * Vier Modi, je nach gesetzten Slots:
 *   - nur `x`:        Häufigkeit je Kategorie                → `items`
 *   - `x` + `y`:      Summe bzw. Mittelwert von Y je Kategorie → `items`
 *   - `x` + `g`:      Häufigkeit je Kategorie und Gruppe      → `categories` + `groups`
 *   - `x` + `y` + `g`: Summe bzw. Mittelwert je Kategorie und Gruppe → gestapelt
 *
 * Kategorien und Gruppen in der Reihenfolge des ersten Auftretens, leere
 * Zellen fallen heraus. Sortieren und Bündeln („Sonstige“) macht der
 * Diagrammtyp; die Tabelle sortiert `statsRows`.
 */
import { PALETTE, cleanCat } from '../../../core/chart/chart-data-prep.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * @typedef {{ x: object|null, y: object|null, g: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, value: number, color: string }} ParetoItem
 * @typedef {{ name: string, values: number[], color: string }} ParetoGroup
 * @typedef {{ items: ParetoItem[], categories: string[], groups: ParetoGroup[] }} ParetoData
 * @typedef {{ name: string, value: number, color: string, cumPct: number }} ParetoStatsRow
 */

/** @returns {ParetoData} */
const empty = () => ({ items: [], categories: [], groups: [] });

/** Schlüssel der einzigen Gruppe ohne `g`-Slot. */
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
 * ist 0. Nur endliche Y-Werte zählen.
 *
 * @param {DatasetRow|undefined} row
 * @param {ColumnReader} read
 * @param {'sum'|'mean'} aggregation  wirkt nur mit `y`-Slot
 * @returns {ParetoData}
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

  const mode = !yVals ? 'count' : aggregation === 'mean' ? 'mean' : 'sum';
  /** @param {{ sum: number, count: number }} c */
  const cellValue = (c) => {
    if (mode === 'mean') return c.count > 0 ? c.sum / c.count : 0;
    if (mode === 'sum') return c.sum;
    return c.count;
  };
  /** @param {string} x @param {string|symbol} g */
  const valueAt = (x, g) => cellValue(/** @type {{ sum: number, count: number }} */ (matrix.get(x)?.get(g)));

  if (gVals) {
    return {
      items: [],
      categories: xLevels,
      groups: gLevels.map((name, gi) => ({
        name,
        values: xLevels.map((x) => valueAt(x, name)),
        color: PALETTE[gi % PALETTE.length],
      })),
    };
  }
  return {
    items: xLevels.map((name, i) => ({ name, value: valueAt(name, SINGLE), color: PALETTE[i % PALETTE.length] })),
    categories: [],
    groups: [],
  };
}

/**
 * Ob die Daten ein Diagramm tragen. Eine Quelle für Diagramm, Tabelle und
 * die Ableitung `stats`.
 * @param {ParetoData} data
 * @returns {boolean}
 */
export function hasData(data) {
  return data.items.length > 0 || (data.categories.length > 0 && data.groups.length > 0);
}

/**
 * Die Tabellenzeilen absteigend nach Wert (stabil) mit kumuliertem Anteil
 * in Prozent. Im Stapelmodus ist der Wert einer Kategorie die Summe über die
 * Gruppen und die Farbe die Palettenfarbe ihres Kategorie-Index. Negative
 * Werte zählen für Summe und Anteil als 0.
 * @param {ParetoData} data
 * @returns {{ rows: ParetoStatsRow[], grandTotal: number }}
 */
export function statsRows(data) {
  /** @type {{ name: string, value: number, color: string }[]} */
  let rows = [];
  if (data.items.length > 0) {
    rows = data.items.map((it) => ({ name: it.name, value: it.value, color: it.color }));
  } else if (data.categories.length > 0) {
    rows = data.categories.map((name, ci) => ({
      name,
      value: data.groups.reduce((s, g) => s + (g.values[ci] || 0), 0),
      color: PALETTE[ci % PALETTE.length],
    }));
  }
  rows.sort((a, b) => b.value - a.value);

  const grandTotal = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  let cum = 0;
  return {
    rows: rows.map((r) => {
      cum += Math.max(0, r.value);
      return { ...r, cumPct: grandTotal > 0 ? (cum / grandTotal) * 100 : 0 };
    }),
    grandTotal,
  };
}
