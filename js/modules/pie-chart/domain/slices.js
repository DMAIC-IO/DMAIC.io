/**
 * D.Mike — Tortendiagramm: Segmente aus einer Zeile der Datensätze. Rein.
 *
 * Zwei Modi, je nach gesetzten Slots:
 *   - nur `value`: je verschiedenem Wert ein Segment mit seiner Häufigkeit;
 *   - `value` und `label`: Summe der Werte je Beschriftung.
 * Reihenfolge des ersten Auftretens. Die Geometrie (Winkel, Beschriftung,
 * Donut-Loch) rechnet der Diagrammtyp.
 */
import { PALETTE } from '../../../core/chart/chart-data-prep.js';
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * @typedef {{ value: object|null, label: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, value: number, color: string }} PieSlice
 */

/**
 * Häufigkeit oder Summe je Name in ein Segment mit Farbe aus der gemeinsamen
 * Palette.
 * @param {Map<string, number>} map
 * @returns {PieSlice[]}
 */
function toSlices(map) {
  /** @type {PieSlice[]} */
  const slices = [];
  for (const [name, value] of map) slices.push({ name, value, color: PALETTE[slices.length % PALETTE.length] });
  return slices;
}

/**
 * Die Segmente einer Zeile der Datensätze. Leer ohne `value`-Slot, ohne
 * Werte oder bei einer nicht lesbaren Spalte (auch der Beschriftung).
 *
 * Mit Beschriftung zählen nur endliche Werte ≥ 0 (gelesen wie eine Eingabe,
 * „2,5“ zählt); fehlt die Beschriftung einer Zeile, ist der Name die
 * Zeilennummer. Ohne Beschriftung fallen leere Zellen heraus, jeder andere
 * Wert zählt als Text.
 *
 * @param {DatasetRow|undefined} row
 * @param {ColumnReader} read
 * @returns {PieSlice[]}
 */
export function buildSlices(row, read) {
  if (!row || !row.value) return [];
  const values = read.values(row.value);
  if (!values || values.length === 0) return [];

  /** @type {Map<string, number>} */
  const acc = new Map();
  if (row.label) {
    const labels = read.values(row.label);
    if (!labels) return [];
    for (let i = 0; i < values.length; i++) {
      const v = parseDecimalInput(values[i]);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      const name = labels[i] != null ? String(labels[i]) : `${i + 1}`;
      acc.set(name, (acc.get(name) || 0) + v);
    }
    return toSlices(acc);
  }

  for (const raw of values) {
    if (raw == null || raw === '') continue;
    const key = String(raw);
    acc.set(key, (acc.get(key) || 0) + 1);
  }
  return toSlices(acc);
}

/**
 * Summe und Anteile der Segmente. Eine Quelle für die Tabelle und für die
 * Ableitung `stats`.
 * @param {ReadonlyArray<{ name: string, value: number }>} slices
 * @returns {{ slices: { name: string, value: number, share: number }[], total: number }}
 */
export function sliceStats(slices) {
  let total = 0;
  for (const s of slices) total += Math.max(0, s.value);
  return {
    slices: slices.map((s) => ({ name: s.name, value: s.value, share: total > 0 ? s.value / total : 0 })),
    total,
  };
}
