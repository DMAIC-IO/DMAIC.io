/**
 * D.Mike — Mosaikdiagramm: Model.
 *
 * Gespeichert wird eine Zeile der Datensätze mit zwei Kategorienspalten:
 * X teilt in Spalten, G teilt jede Spalte in Segmente. Ansicht: die
 * Editor-Einstellungen des Diagramms. Die Kreuztabelle liefert die
 * Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, columnRef, datasets } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import mosaicChart from '../../../widgets/mosaic-chart/schema.js';
import { buildCrossTab, totalsOf } from './crosstab.js';
import { from0 } from './migrations.js';

/**
 * Die Kreuztabelle der gewählten Spalten.
 *
 * @typedef {object} MosaicStats
 * @property {string[]} categories  Kategorien der X-Achse
 * @property {MosaicGroup[]} groups  je Gruppe die Häufigkeiten
 * @property {number[]} rowTotals  Summe je Kategorie, in der Reihenfolge der Kategorien
 * @property {number[]} colTotals  Summe je Gruppe, in der Reihenfolge der Gruppen
 * @property {number} total  Gesamtsumme aller Häufigkeiten
 */

/**
 * @typedef {object} MosaicGroup
 * @property {string} name  Gruppe
 * @property {number[]} counts  Häufigkeit je X-Kategorie
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    datasets: datasets({
      x: columnRef({ minCount: 1, required: true }),
      g: columnRef({ minCount: 1, required: true }),
    }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: mosaicChart.edits(),
  },
  derived: {
    /**
     * Die Kreuztabelle als Zahlen; `null`, solange ein Slot leer ist oder
     * keine Zeile beide Werte hat.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {MosaicStats|null}
     */
    stats(src) {
      const d = buildCrossTab(this.datasets[0], sourceColumns(src));
      if (d.categories.length === 0 || d.groups.length === 0) return null;
      return {
        categories: [...d.categories],
        groups: d.groups.map((g) => ({ name: g.name, counts: [...g.values] })),
        ...totalsOf(d.groups, d.categories.length),
      };
    },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['x', 'g']; },
  },
});
