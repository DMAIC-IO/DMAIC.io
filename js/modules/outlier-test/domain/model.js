/**
 * D.Mike — Ausreißertest: Model.
 *
 * Gespeichert werden die Messwertspalte, die acht Parameter der Verfahren,
 * die aktiven Verfahren und das hervorgehobene Verfahren des Diagramms
 * (`chartMethod`, beim Lesen geheilt über `effectiveChartMethod`). Ansicht:
 * die Editor-Einstellungen des Diagramms und das Beispielblatt. Das Ergebnis
 * liefert die Ableitung `result` aus Model und Arbeitsblatt.
 */
import { defineModel, command, list, text, number, boolean, oneOf, columnRef } from '../../../core/model.js';
import { roundTo } from '../../../core/number-format.js';
import { sourceColumns } from '../../../core/source-columns.js';
import individualValuePlotChart from '../../../widgets/individual-value-plot-chart/schema.js';
import { ALL_METHODS, PARAM_KEYS, inputValues, analyze, buildResult, chartMethodOptions } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    colRef: columnRef({ types: ['numeric'], minCount: 3 }),
    alpha: number({
      min: 0.0001,
      max: 0.5,
      default: (c) => Math.min(0.5, Math.max(0.0001, roundTo(1 - c.confidenceLevel / 100, 4))),
    }),
    side: oneOf(['two-sided', 'upper', 'lower']),
    tukeyFactor: number({ min: 0.1, max: 10, default: 1.5 }),
    hampelK: number({ min: 0.1, max: 20, default: 3 }),
    zThreshold: number({ min: 0.1, max: 10, default: 3 }),
    modZThreshold: number({ min: 0.1, max: 10, default: 3.5 }),
    esdMaxOutliers: number({ integer: true, min: 1, max: 50, nullable: true, default: null }),
    enabled: list(oneOf(['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z']), {
      unique: true,
      default: ['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z'],
    }),
    chartMethod: oneOf(['all', 'grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z']),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: individualValuePlotChart.edits(),
  },
  invariants: {
    enabledNotEmpty: {
      fields: ['enabled'],
      test(m) { return m.enabled.length > 0; },
      repair(m) { m._v.enabled = [...ALL_METHODS]; },
    },
  },
  derived: {
    /**
     * Die markierten Punkte je aktivem Verfahren samt Kennzahlen; `null`,
     * solange keine Spalte gewählt ist, sie nicht lesbar ist oder weniger als
     * drei Zahlen hat. Die Indizes zählen die Zahlen der Spalte ab 0 (leere
     * und nicht numerische Zellen übersprungen).
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      const values = inputValues(this, sourceColumns(src));
      const analysis = analyze(values, this);
      return analysis ? buildResult(values, analysis) : null;
    },
    /**
     * Die Ziele, die das Diagramm hervorheben kann: `'all'` und jedes aktive
     * Verfahren, das etwas markiert hat.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    chartMethodOptions(src) {
      const values = inputValues(this, sourceColumns(src));
      return chartMethodOptions(this, analyze(values, this));
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken (immer alle acht).
     * @returns {string[]}
     */
    activeParams() { return [...PARAM_KEYS]; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['colRef']; },
  },
  commands: {
    toggleMethod: command({
      params: {
        method: oneOf(['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z']),
        on: boolean(),
      },
      run({ method, on }) {
        const set = new Set(this.enabled);
        if (on) set.add(method); else set.delete(method);
        this.enabled = ALL_METHODS.filter((id) => set.has(id));
      },
    }),
  },
});
