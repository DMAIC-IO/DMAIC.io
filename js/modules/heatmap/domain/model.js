/**
 * D.Mike — Heatmap: Model.
 *
 * Gespeichert wird eine Zeile der Datensätze: die Spaltenvariable X und die
 * Zeilenvariable G (beide kategorial, Pflicht), optional eine Wertespalte V,
 * dazu die Aggregation der Werte je Zelle. Ohne V zählt jede Zelle die
 * Zeilen. Ansicht: die Editor-Einstellungen des Diagramms. Das Raster liefert
 * die Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, oneOf, columnRef, datasets } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import heatmapChart from '../../../widgets/heatmap-chart/schema.js';
import { buildGrid, hasGrid, totalsOf, additive } from './grid.js';
import { from0 } from './migrations.js';

/**
 * Das Raster, wie `read().stats` es liefert.
 *
 * @typedef {object} HeatmapStats
 * @property {string[]} xCategories  Spalten des Rasters
 * @property {string[]} yCategories  Zeilen des Rasters
 * @property {Array<Array<number|null>>} cells  Wert je Zeile und Spalte
 * @property {Array<number|null>|null} rowTotals  Summe je Zeile, in der Reihenfolge der Zeilen; null im Mittelwertmodus
 * @property {Array<number|null>|null} colTotals  Summe je Spalte, in der Reihenfolge der Spalten; null im Mittelwertmodus
 * @property {number|null} total  Gesamtsumme aller Zellen; null im Mittelwertmodus
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    datasets: datasets({
      x: columnRef({ minCount: 1, required: true }),
      g: columnRef({ minCount: 1, required: true }),
      v: columnRef({ types: ['numeric', 'currency', 'percent'], minCount: 1 }),
    }),
    aggregation: oneOf(['mean', 'sum'], { default: 'mean' }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: heatmapChart.edits(),
  },
  derived: {
    /**
     * Stufen beider Achsen, Wert je Zelle (leere Wertzelle `null`) und die
     * Summen; Summen nur ohne Wertespalte oder mit `sum`, sonst `null`.
     * `null`, solange es kein Raster gibt.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {HeatmapStats|null}
     */
    stats(src) {
      const row = this.datasets[0];
      const grid = buildGrid(row, sourceColumns(src), this.aggregation);
      if (!hasGrid(grid)) return null;
      const sums = additive(row, this.aggregation) ? totalsOf(grid.cells) : null;
      return {
        xCategories: [...grid.xCategories],
        yCategories: [...grid.yCategories],
        cells: grid.cells.map((r) => [...r]),
        rowTotals: sums ? sums.rowTotals : null,
        colTotals: sums ? sums.colTotals : null,
        total: sums ? sums.total : null,
      };
    },
    /**
     * Die Felder, die im aktuellen Zustand wirken: `aggregation` nur mit
     * gesetzter Wertespalte.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      return this.datasets[0]?.v ? ['aggregation'] : [];
    },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['x', 'g', 'v']; },
  },
});
