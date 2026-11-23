/**
 * D.Mike — Balkendiagramm: Model.
 *
 * Gespeichert wird eine Zeile der Datensätze: die Kategorienspalte X
 * (Pflicht), optional eine Wertespalte Y und eine Gruppenspalte G, dazu die
 * Aggregation der Werte je Balken und ob die Gruppen gestapelt werden. Ohne Y
 * zählt jeder Balken die Zeilen, mit G gibt es eine Reihe je Gruppe.
 * Ansicht: die Editor-Einstellungen des Diagramms. Die Balkenwerte liefert
 * die Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, boolean, oneOf, columnRef, datasets } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import barChart from '../../../widgets/bar-chart/schema.js';
import { buildChartData, hasData, frequencyTotal } from './chart-data.js';
import { from0 } from './migrations.js';

/**
 * Die Balkenwerte, wie `read().stats` sie liefert.
 *
 * @typedef {object} BarStats
 * @property {string[]} categories  Kategorien der X-Spalte in Balkenreihenfolge
 * @property {BarGroup[]} groups  je Gruppe die Werte, ohne Gruppenspalte eine
 * @property {number|null} total  Summe aller Werte, nur bei Häufigkeiten (ohne Wertespalte); sonst leer
 */

/**
 * @typedef {object} BarGroup
 * @property {string} name  Gruppenname
 * @property {number[]} values  Wert je Kategorie
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
    aggregation: oneOf(['mean', 'sum'], { default: 'mean' }),
    stacked: boolean({ default: false }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: barChart.edits(),
  },
  derived: {
    /**
     * Kategorien und Werte je Gruppe; `total` nur ohne Wertespalte, sonst
     * `null`. `null`, solange es keine Daten gibt.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {BarStats|null}
     */
    stats(src) {
      const row = this.datasets[0];
      const data = buildChartData(row, sourceColumns(src), this.aggregation);
      if (!hasData(data)) return null;
      return {
        categories: [...data.categories],
        groups: data.groups.map((g) => ({ name: g.name, values: [...g.values] })),
        total: row?.y ? null : frequencyTotal(data),
      };
    },
    /**
     * Die Felder, die im aktuellen Zustand wirken: `aggregation` nur mit
     * gesetzter Wertespalte, `stacked` nur mit gesetzter Gruppenspalte.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      const row = this.datasets[0];
      return [...(row?.y ? ['aggregation'] : []), ...(row?.g ? ['stacked'] : [])];
    },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['x', 'y', 'g']; },
  },
});
