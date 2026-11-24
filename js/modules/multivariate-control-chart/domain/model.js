/**
 * D.Mike — Multivariate Regelkarte (Hotelling T²): Model.
 *
 * Gespeichert werden die gemeinsam überwachten Zahlenspalten (`columnRefs`),
 * die Fehlalarmrate α und die Länge der Phase I (`baselineCount`, `null` für
 * alle Zeilen). Ansicht: die Editor-Einstellungen des Diagramms und das
 * Beispielblatt. Ergebnis, Punkte und Fehlergrund liefern die Ableitungen aus
 * Model und Arbeitsblatt; die Engine läuft je Änderung einmal (Merker in
 * `analyze.js`).
 */
import { defineModel, text, number, list, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { inputRows, optionsOf, analyze, resultOf, pointsOf, errorOf } from './analyze.js';
import { messageOf } from './format.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').Point} Point */
/** @typedef {import('./analyze.js').Reason} Reason */

/** Vorgabe für α: die 3σ-Konvention (gleich dem Literal im Schema und der Engine). */
export const ALPHA_DEFAULT = 0.0027;

/**
 * Schlüssel eines Spaltenbezugs zum Vergleich.
 * @param {{ instanceId: string, sheetId?: string, columnId: string }} r
 * @returns {string}
 */
const refKey = (r) => `${r.instanceId}|${r.sheetId ?? ''}|${r.columnId}`;

/**
 * Die Rechnung zum Stand des Models.
 * @param {import('./model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {import('./analyze.js').Analysis|null}
 */
const analysisOf = (m, src) => analyze(inputRows(m, sourceColumns(src)), optionsOf(m));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columnRefs: list(columnRef({ types: ['numeric'], minCount: 3, nullable: false })),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: 0.0027 }),
    baselineCount: number({ integer: true, min: 1, nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: controlChart.edits(),
  },
  invariants: {
    uniqueColumnRefs: {
      fields: ['columnRefs'],
      test(m) {
        const keys = m.columnRefs.map(refKey);
        return new Set(keys).size === keys.length;
      },
      repair(m) {
        const seen = new Set();
        m._v.columnRefs = m._v.columnRefs.filter((/** @type {any} */ r) => {
          const k = refKey(r);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      },
    },
  },
  derived: {
    /**
     * T²-Grenzen, Mittelwert und Kovarianz der Phase I und die Signalzeilen;
     * `null` unter zwei Variablen, bei einer nicht lesbaren Spalte, mit nicht
     * mehr vollständigen Zeilen als Variablen oder bei einem Fehler.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analysisOf(this, src));
    },
    /**
     * Je vollständiger Zeile der T²-Wert und ob sie über der Grenze liegt;
     * leer ohne Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Point[]}
     */
    points(src) {
      return pointsOf(analysisOf(this, src));
    },
    /**
     * Der Grund, warum nicht gerechnet wurde (Schlüssel), oder `null`.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Reason|null}
     */
    error(src) {
      return errorOf(analysisOf(this, src));
    },
    /**
     * Der Text zum Grund in der aktiven Sprache, wie ihn der Fehlerkasten
     * zeigt; `null` ohne Grund.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @param {any} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    message(src, _d, t) {
      return messageOf(analysisOf(this, src), t);
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeParams() { return ['alpha', 'baselineCount']; },
    /**
     * Die Spaltenfelder mit mehreren Bezügen, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeMultiSlots() { return ['columnRefs']; },
  },
  derivedBulk: ['points'],
});
