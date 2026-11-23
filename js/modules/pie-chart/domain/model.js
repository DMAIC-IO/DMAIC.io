/**
 * D.Mike — Tortendiagramm: Model.
 *
 * Gespeichert wird eine Zeile der Datensätze: die Wertespalte (Pflicht) und
 * optional eine Beschriftungsspalte. Ohne Beschriftung zählt jedes Segment
 * die Häufigkeit eines Werts, mit Beschriftung die Summe der Werte je
 * Beschriftung. Ansicht: die Editor-Einstellungen des Diagramms. Die
 * Segmente liefert die Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, columnRef, datasets } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import pieChart from '../../../widgets/pie-chart/schema.js';
import { buildSlices, sliceStats } from './slices.js';
import { from0 } from './migrations.js';

/**
 * Summe und Anteile der Segmente.
 *
 * @typedef {object} PieStats
 * @property {Slice[]} slices  Segmente in der Reihenfolge des ersten Auftretens
 * @property {number} total  Summe aller Segmentwerte
 */

/**
 * @typedef {object} Slice
 * @property {string} name  Kategorie (Wert oder Beschriftung)
 * @property {number} value  Häufigkeit oder Summe
 * @property {number} share  Anteil an der Summe (0–1)
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    datasets: datasets({
      value: columnRef({ minCount: 1, required: true }),
      label: columnRef({ minCount: 1, group: true }),
    }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: pieChart.edits(),
  },
  derived: {
    /**
     * Summe und Anteile der Segmente; `null`, solange es kein Segment gibt.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {PieStats|null}
     */
    stats(src) {
      const slices = buildSlices(this.datasets[0], sourceColumns(src));
      if (slices.length === 0) return null;
      return sliceStats(slices);
    },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['value', 'label']; },
  },
});
