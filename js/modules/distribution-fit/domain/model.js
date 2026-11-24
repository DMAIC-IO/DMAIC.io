/**
 * D.Mike — Verteilungstest: Model.
 *
 * Gespeichert werden die Messwertspalte und der Datentyp. Ansicht: die
 * Editor-Einstellungen des Histogramms und das Beispielblatt. Das Ergebnis
 * liefert die Ableitung `result` aus Model und Arbeitsblatt.
 */
import { defineModel, text, oneOf, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import { inputValues, analyze, buildResult } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columnRef: columnRef({ types: ['numeric'], minCount: 1 }),
    dataType: oneOf(['auto', 'continuous', 'discrete']),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: histogramChart.edits(),
  },
  derived: {
    /**
     * Kennwerte, angepasste Verteilungen (beste zuerst) und
     * Normalitätstests; `null`, solange keine Spalte gewählt ist, sie nicht
     * lesbar ist, weniger als fünf Zahlen hat, keine Streuung hat oder die
     * Rechnung scheitert.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      const values = inputValues(this, sourceColumns(src));
      return buildResult(analyze(values, this.dataType), this.dataType);
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken (immer der Datentyp).
     * @returns {string[]}
     */
    activeParams() { return ['dataType']; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
  },
});
