/**
 * D.Mike — Hypothesentest: Model.
 *
 * Gespeichert wird nur die Konfiguration; das Ergebnis rechnet die Ableitung
 * `result` aus Model und Arbeitsblatt.
 */
import { defineModel, command, text, number, boolean, oneOf, list, columnRef } from '../../../core/model.js';
import { parseNumber, roundTo } from '../../../core/number-format.js';
import { from0 } from './migrations.js';
import { analyze } from './analyze.js';
import { readColumn, columnLabel, numericValues } from '../../../core/source-columns.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import probabilityPlotChart from '../../../widgets/probability-plot-chart/schema.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';

/** @type {readonly ('variance'|'mean')[]} */
export const CATEGORIES = Object.freeze(['variance', 'mean']);
/** @type {readonly ('one'|'two'|'paired'|'k')[]} */
export const TEST_TYPES = Object.freeze(['one', 'two', 'paired', 'k']);
/** @type {readonly ('two-sided'|'greater'|'less')[]} */
export const DIRECTIONS = Object.freeze(['two-sided', 'greater', 'less']);
/** @type {readonly ('variance'|'stddev')[]} */
export const TARGET_TYPES = Object.freeze(['variance', 'stddev']);

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    category: oneOf(['variance', 'mean']),
    testType: oneOf(['one', 'two', 'paired', 'k']),
    direction: oneOf(['two-sided', 'greater', 'less']),
    alpha: number({
      exclusiveMin: 0, exclusiveMax: 1,
      // Aus dem Konfidenzniveau; auf den erlaubten Bereich geklemmt (Kontext erlaubt 0 < Wert < 100).
      default: (c) => Math.min(0.9999, Math.max(0.0001, roundTo(1 - c.confidenceLevel / 100, 4))),
    }),
    powerGoal: number({
      min: 0.5, max: 0.99,
      // Aus der Teststärke; auf den erlaubten Bereich geklemmt.
      default: (c) => Math.min(0.99, Math.max(0.5, c.power / 100)),
    }),
    targetValue: text(),
    targetType: oneOf(['variance', 'stddev']),
    colRef1: columnRef({ types: ['numeric'], minCount: 3 }),
    colRef2: columnRef({ types: ['numeric'], minCount: 3 }),
    colRefsK: list(columnRef({ types: ['numeric'], minCount: 3, nullable: false })),
    equalVariances: boolean(),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    residFittedChart: scatterChart.edits(),
    residProbChart: probabilityPlotChart.edits(),
    residHistChart: histogramChart.edits(),
    residOrderChart: scatterChart.edits(),
  },
  derived: {
    /**
     * Die Analyse als Zahlen; `{ status: 'insufficient', reason }`, solange Eingaben fehlen.
     * Gepaart kommen die Spalten ungefiltert (die Paarbildung dünnt sie aus), sonst nur Zahlen.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {import('./analyze.js').Analysis}
     */
    result(src) {
      const m = this;
      const refs = m.testType === 'k' ? m.colRefsK
        : (m.testType === 'one' ? [m.colRef1] : [m.colRef1, m.colRef2]);
      const samples = refs.map((/** @type {any} */ ref) => {
        if (!ref) return { name: '', values: null };
        const col = readColumn(src, ref);
        if (!col) return { name: '', values: null };
        const name = columnLabel(col);
        return { name, values: m.testType === 'paired' ? [...col.values] : numericValues(col.values) };
      });
      return analyze({
        category: m.category, testType: m.testType, direction: m.direction,
        alpha: m.alpha, powerGoal: m.powerGoal, target: resolveTarget(m), targetType: m.targetType,
        equalVariances: m.equalVariances, samples,
      });
    },
  },
  invariants: {
    pairedMeansOnly: {
      fields: ['category', 'testType'],
      test(m) { return !(m.category === 'variance' && m.testType === 'paired'); },
    },
  },
  commands: {
    setCategory: command({
      params: { category: oneOf(['variance', 'mean']) },
      run({ category }) {
        this.category = category;
        if (category === 'variance' && this.testType === 'paired') this.testType = 'two';
      },
    }),
    setTestType: command({
      params: { testType: oneOf(['one', 'two', 'paired', 'k']) },
      run({ testType }) {
        if ((testType === 'paired') !== (this.testType === 'paired')) this.targetValue = '';
        this.testType = testType;
      },
    }),
  },
});

/**
 * Der Zielwert als Zahl: gepaart und leer → 0; Varianz > 0 (`stddev`
 * quadriert); Mittelwert endlich; sonst `null`.
 * @param {{ category: string, testType: string, targetType: string, targetValue: string }} m
 * @returns {number|null}
 */
export function resolveTarget(m) {
  if (m.testType === 'paired' && m.targetValue.trim() === '') return 0;
  const tv = parseNumber(m.targetValue);
  if (m.category === 'variance') {
    if (tv === null || isNaN(tv) || tv <= 0) return null;
    return m.targetType === 'stddev' ? tv * tv : tv;
  }
  if (tv === null || isNaN(tv)) return null;
  return tv;
}
