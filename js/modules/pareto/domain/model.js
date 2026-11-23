/**
 * D.Mike — Pareto-Diagramm: Model.
 *
 * Gespeichert wird eine Zeile der Datensätze: die Kategorienspalte X
 * (Pflicht), optional eine Wertespalte Y und eine Gruppenspalte G, dazu die
 * Aggregation der Werte je Kategorie. Ohne Y zählt jeder Balken die Zeilen,
 * mit G wird jeder Balken nach Gruppen gestapelt. Ansicht: die
 * Editor-Einstellungen des Diagramms. Die geordnete Tabelle liefert die
 * Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, oneOf, columnRef, datasets } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';
import { buildChartData, hasData, statsRows } from './chart-data.js';
import { from0 } from './migrations.js';

/**
 * Die geordnete Tabelle, wie `read().stats` sie liefert.
 *
 * @typedef {object} ParetoStats
 * @property {ParetoRow[]} rows  Kategorien absteigend nach Wert
 * @property {number} total  Summe aller Werte
 */

/**
 * @typedef {object} ParetoRow
 * @property {string} name  Kategorie
 * @property {number} value  Wert der Kategorie
 * @property {number} cumPct  kumulierter Anteil in Prozent
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    datasets: datasets({
      x: columnRef({ minCount: 1, required: true }),
      y: columnRef({ types: ['numeric', 'currency', 'percent'], minCount: 1 }),
      g: columnRef({ group: true }),
    }),
    aggregation: oneOf(['sum', 'mean'], { default: 'sum' }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: paretoChart.edits(),
  },
  derived: {
    /**
     * Die Kategorien absteigend nach Wert mit kumuliertem Anteil; `null`,
     * solange es keine Daten gibt.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {ParetoStats|null}
     */
    stats(src) {
      const data = buildChartData(this.datasets[0], sourceColumns(src), this.aggregation);
      if (!hasData(data)) return null;
      const { rows, grandTotal } = statsRows(data);
      return { rows: rows.map((r) => ({ name: r.name, value: r.value, cumPct: r.cumPct })), total: grandTotal };
    },
    /**
     * Die Felder, die im aktuellen Zustand wirken: `aggregation` nur mit
     * gesetzter Wertespalte.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() { return this.datasets[0]?.y ? ['aggregation'] : []; },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['x', 'y', 'g']; },
  },
});
