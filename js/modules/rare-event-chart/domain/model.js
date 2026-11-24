/**
 * D.Mike — Regelkarte seltener Ereignisse (g-Karte, t-Karte): Model.
 *
 * Gespeichert werden der Kartentyp und die Spalte der Zählwerte bzw. Zeiten
 * zwischen Ereignissen. Ansicht: die Editor-Einstellungen des Diagramms und
 * das Beispielblatt. Ergebnis und Punkte liefern die Ableitungen aus Model
 * und Arbeitsblatt; die Engine läuft je Änderung einmal (Merker in
 * `analyze.js`).
 */
import { defineModel, text, oneOf, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { inputValues, inputsOf, analyze, resultOf, pointsOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').Point} Point */

/** Die Kartentypen (gleich dem Literal im Schema und den Schlüsseln von `ENGINES`). */
export const CHART_TYPE_IDS = Object.freeze(['g', 't']);

/**
 * Die Rechnung zum Stand des Models.
 * @param {import('./model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {import('./analyze.js').Analysis|null}
 */
const analysisOf = (m, src) => analyze(inputsOf(inputValues(m, sourceColumns(src)), m));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    chartTypeId: oneOf(['g', 't'], { default: 'g' }),
    columnRef: columnRef({ types: ['numeric'], minCount: 2, nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: controlChart.edits(),
  },
  derived: {
    /**
     * Grenzen, Mittellinie, Streuung und Signalpunkte; bei der t-Karte die
     * Kennzahlen auf der Originalskala, `plotted` auf der gezeichneten.
     * `null` ohne Spalte, bei einer nicht lesbaren Spalte, unter zwei
     * verwertbaren Werten (t: positiven) oder bei einem Rechenfehler.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analysisOf(this, src));
    },
    /**
     * Je gezeichnetem Platz der Wert auf der gezeichneten Skala und ob er
     * außerhalb der Grenzen liegt; an den Lücken der t-Karte ohne Wert. Leer
     * ohne Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Point[]}
     */
    points(src) {
      return pointsOf(analysisOf(this, src));
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeParams() { return ['chartTypeId']; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
  },
  derivedBulk: ['points'],
});
