/**
 * D.Mike — Verlaufsdiagramm: Model.
 *
 * Gespeichert werden die Messwertspalte und das Signifikanzniveau α.
 * Ansicht: die Editor-Einstellungen des Diagramms und das Beispielblatt.
 * Ergebnis und Punkte liefern die Ableitungen aus Model und Arbeitsblatt; die
 * Engine läuft je Datenänderung einmal (Merker in `analyze.js`).
 */
import { defineModel, text, number, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import runChart from '../../../widgets/run-chart/schema.js';
import { inputValues, analyze, resultOf, pointsOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').Point} Point */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columnRef: columnRef({ types: ['numeric'], minCount: 2 }),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: 0.05 }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: runChart.edits(),
  },
  derived: {
    /**
     * Median, Läufe und die vier Lauftests, bewertet gegen α; `null`, solange
     * keine Spalte gewählt ist, sie nicht lesbar ist oder weniger als drei
     * Zahlen hat.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analyze(inputValues(this, sourceColumns(src))), this.alpha);
    },
    /**
     * Je gezeichnetem Wert eine Zeile in Datenfolge; leer ohne Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Point[]}
     */
    points(src) {
      return pointsOf(analyze(inputValues(this, sourceColumns(src))));
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken (immer α).
     * @returns {string[]}
     */
    activeParams() { return ['alpha']; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
  },
  derivedBulk: ['points'],
});
