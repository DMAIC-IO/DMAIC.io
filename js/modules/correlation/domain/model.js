/**
 * D.Mike — Korrelation: Model.
 *
 * Gespeichert werden die gewählten Spalten in Klickfolge (die erste ist X, die
 * zweite Y), das Konfidenzniveau als Anteil und der Koeffizient der Matrix.
 * Ansicht: die Filter der Matrix, die Editor-Einstellungen der Streudiagramme
 * und das Beispielblatt. Ergebnis, Matrix, Rohpaare und Fehlergrund liefern
 * die Ableitungen aus Model und Arbeitsblatt; die Engine läuft je Änderung
 * einmal (Merker in `analyze.js`).
 */
import { defineModel, text, number, oneOf, list, map, columnRef } from '../../../core/model.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { analyze } from './analyze.js';
import { confFromSetting } from './confidence.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').PairResult} PairResult */
/** @typedef {import('./analyze.js').MatrixResult} MatrixResult */
/** @typedef {import('./analyze.js').MatrixPair} MatrixPair */
/** @typedef {import('./analyze.js').CorrError} CorrError */

/**
 * Schlüssel eines Spaltenbezugs zum Vergleich.
 * @param {{ instanceId: string, sheetId?: string, columnId: string }} r
 * @returns {string}
 */
export const refKey = (r) => `${r.instanceId}|${r.sheetId ?? ''}|${r.columnId}`;

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    colRefs: list(columnRef({ nullable: false, types: ['numeric', 'currency', 'percent', 'date', 'time'], minCount: 5 }), { default: [] }),
    confidenceLevel: number({ min: 0.5, max: 0.9999, default: (c) => confFromSetting(c.confidenceLevel) }),
    matrixMethod: oneOf(['pearson', 'spearman', 'kendall'], { default: 'pearson' }),
  },
  view: {
    filterMinR: number({ nullable: true, min: 0, max: 1 }),
    filterMaxP: number({ nullable: true, min: 0, max: 1 }),
    exampleWorksheetId: text({ nullable: true }),
    pairEdits: scatterChart.edits(),
    matrixEdits: map(text(), scatterChart.edits()),
  },
  invariants: {
    uniqueColumnRefs: {
      fields: ['colRefs'],
      test(m) {
        const keys = m.colRefs.map(refKey);
        return new Set(keys).size === keys.length;
      },
      repair(m) {
        const seen = new Set();
        m._v.colRefs = m._v.colRefs.filter((/** @type {any} */ r) => {
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
     * Die Parameterfelder, die im aktuellen Stand wirken: das
     * Konfidenzniveau, in der Matrix dazu der Koeffizient.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams(src) {
      return analyze(this, src).mode === 'matrix' ? ['confidenceLevel', 'matrixMethod'] : ['confidenceLevel'];
    },
    /**
     * Die Spaltenfelder mit mehreren Bezügen, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeMultiSlots() { return ['colRefs']; },
    /**
     * `'pairwise'` bei zwei Spalten mit Ergebnis, `'matrix'` ab drei
     * lesbaren Spalten, sonst `'none'`.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {'pairwise'|'matrix'|'none'}
     */
    mode(src) {
      return analyze(this, src).mode;
    },
    /**
     * Die paarweise Auswertung (genau zwei Spalten); `null` sonst oder ohne
     * Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {PairResult|null}
     */
    result(src) {
      return analyze(this, src).result;
    },
    /**
     * Die Korrelationsmatrix (ab drei Spalten); `null` sonst.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {MatrixResult|null}
     */
    matrixResult(src) {
      return analyze(this, src).matrixResult;
    },
    /**
     * Die gepaarten Rohwerte je Spaltenpaar mit Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {MatrixPair[]}
     */
    pairs(src) {
      return analyze(this, src).pairs;
    },
    /**
     * Warum es kein Ergebnis gibt, mit dem Text in der aktiven Sprache;
     * `null` mit Ergebnis oder unter zwei Spalten.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {CorrError|null}
     */
    error(src, _d, t) {
      const e = analyze(this, src).error;
      if (!e) return null;
      return { ...e, message: e.reason === 'errMin4' ? t(e.reason, { n: e.n }) : t(e.reason) };
    },
  },
  derivedBulk: ['pairs'],
}) {
  /**
   * Inhalt hat die Instanz, sobald eine Spalte gewählt ist (wie bisher).
   * @returns {boolean}
   */
  hasContent() {
    return this.colRefs.length > 0;
  }
}
