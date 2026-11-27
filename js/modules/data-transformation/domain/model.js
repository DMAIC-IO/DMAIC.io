/**
 * D.Mike — Datentransformation: Model.
 *
 * Gespeichert sind die gewählte Transformation, die Quellspalte und die
 * Parameter je Transformation (λ leer heißt geschätzt). Ansicht: das
 * Beispielblatt und die Editor-Einstellungen der vier Diagramme. Die
 * Rechnung selbst ist ein Lauf des Viewmodels; hier stehen die Ableitungen,
 * die der Agent liest: wirksame Transformation (Rückfall Box-Cox →
 * Yeo-Johnson), wirkende Pfade und die Ziele für das Senden.
 * Ohne DOM, ohne i18n.
 */
import { defineModel, oneOf, columnRef, object, text } from '../../../core/model.js';
import { columnValues, numericValues } from '../../../core/source-columns.js';
import { targetList } from '../../../core/worksheet-targets.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import probabilityPlotChart from '../../../widgets/probability-plot-chart/schema.js';
import { from0 } from './migrations.js';
import { PARAMS_SHAPE } from './transforms.js';
import { effectiveTransform } from './analyze.js';

/** Ziele zum Senden: jede Spalte eines Blatts nimmt die Werte auf (sie werden überschrieben). */
export const TARGET_FILTER = Object.freeze({});

/**
 * Die Zahlen der Quellspalte; leer ohne Spalte oder wenn sie nicht lesbar ist.
 * @param {import('../../../core/source-reader.js').Source} src
 * @param {{ instanceId: string, sheetId?: string, columnId: string }|null} ref
 * @returns {number[]}
 */
export function sourceValues(src, ref) {
  const raw = ref ? columnValues(src, /** @type {any} */ (ref)) : null;
  return raw ? numericValues(raw) : [];
}

/**
 * @typedef {object} TargetColumn
 * @property {string} key  Ziel `instanceId|sheetId|columnId`
 * @property {string} name  Spaltenname bzw. Blattname beim Eintrag „neue Spalte“
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die gewählte Transformation */
    currentTF: oneOf(['boxcox', 'yeojohnson', 'johnson_su', 'johnson_sb', 'log', 'log10', 'sqrt', 'inverse', 'square'], { default: 'boxcox' }),
    /** die Quellspalte */
    columnRef: columnRef({ types: ['numeric'], minCount: 3 }),
    /** die Parameter je Transformation mit Parametern */
    params: object(PARAMS_SHAPE),
  },
  view: {
    /** Arbeitsblatt, das ein Beispiel angelegt hat */
    exampleWorksheetId: text({ nullable: true }),
    /** Editor-Einstellungen des Histogramms vorher */
    histOrigEdits: histogramChart.edits(),
    /** Editor-Einstellungen des Histogramms nachher */
    histTransEdits: histogramChart.edits(),
    /** Editor-Einstellungen des Wahrscheinlichkeitsnetzes vorher */
    ppOrigEdits: probabilityPlotChart.edits(),
    /** Editor-Einstellungen des Wahrscheinlichkeitsnetzes nachher */
    ppTransEdits: probabilityPlotChart.edits(),
  },
  derived: {
    /**
     * Die Transformation, mit der gerechnet wird: die gewählte, außer Box-Cox
     * auf einer Spalte mit einem Wert ≤ 0 — dann Yeo-Johnson.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string}
     */
    effectiveTF(src) {
      return effectiveTransform(this.currentTF, sourceValues(src, this.columnRef));
    },
    /**
     * Die Pfade, die im aktuellen Stand wirken: die Parameter der wirksamen
     * Transformation; geschrieben wird das ganze Feld `params`.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams(src) {
      const tf = effectiveTransform(this.currentTF, sourceValues(src, this.columnRef));
      const own = /** @type {Record<string, any>} */ (this.params)[tf];
      return own ? Object.keys(own).map((k) => `params.${tf}.${k}`) : [];
    },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
    /**
     * Die Ziele, die der Lauf `toWorksheet` annimmt: je Blatt seine Spalten,
     * danach ein Eintrag „neue Spalte“.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @returns {TargetColumn[]}
     */
    targetColumns(src) {
      return targetList(src, TARGET_FILTER);
    },
  },
});
