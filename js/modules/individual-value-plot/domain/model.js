/**
 * D.Mike — Einzelwertdiagramm: Model.
 *
 * Gespeichert werden die Datensätze (je Zeile eine Wertespalte und bis zu
 * drei Gruppenspalten) und das Konfidenzniveau. Ansicht: Statistik-Schalter
 * und die Editor-Einstellungen des Diagramms. Die Kennzahlen liefert die
 * Ableitung `stats` aus Model und Arbeitsblatt.
 */
import { defineModel, text, number, boolean, columnRef, datasets } from '../../../core/model.js';
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { computeSeriesStats } from '../../../core/stats-panel.js';
import { sourceColumns } from '../../../core/source-columns.js';
import individualValuePlotChart from '../../../widgets/individual-value-plot-chart/schema.js';
import { buildGroups } from './groups.js';
import { from0 } from './migrations.js';

/**
 * Kennzahlen einer gezeichneten Reihe (`computeSeriesStats`). Sätze
 * geteilt unter `modules.shared.types.SeriesStats.*`.
 *
 * @typedef {object} SeriesStats
 * @property {string} name  Name der Reihe
 * @property {Stats|null} stats  Kennzahlen, leer ohne Werte
 * @property {StatsCi} ci  Konfidenzintervalle
 */

/**
 * @typedef {object} Stats
 * @property {number} n  Anzahl Werte
 * @property {number} mean  Mittelwert
 * @property {number|null} stddev  Standardabweichung
 * @property {number|null} variance  Varianz
 * @property {number|null} seMean  Standardfehler des Mittelwerts
 * @property {number} median  Median
 * @property {number} min  kleinster Wert
 * @property {number} max  größter Wert
 * @property {number} range  Spannweite
 * @property {number} q1  erstes Quartil
 * @property {number} q3  drittes Quartil
 * @property {number} skewness  Schiefe
 * @property {number} kurtosis  Kurtosis
 */

/**
 * @typedef {object} StatsCi
 * @property {Array<number|null>} [mean]  Intervall des Mittelwerts
 * @property {Array<number|null>} [variance]  Intervall der Varianz
 * @property {Array<number|null>} [stddev]  Intervall der Standardabweichung
 */

/**
 * Nicht endliche Zahlen (Einzelwertgruppe: Varianz, Streuung, seMean) → `null`.
 * @param {any} v
 * @returns {any}
 */
function finiteOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.map(finiteOrNull);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, finiteOrNull(x)]));
  return v;
}

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    datasets: datasets({
      value: columnRef({ types: ['numeric'], minCount: 1, required: true }),
      group: columnRef({ group: true }),
      group2: columnRef({ group: true }),
      group3: columnRef({ group: true }),
    }, { multi: true, colors: CHART_COLORS }),
    confLevel: number({ exclusiveMin: 0, exclusiveMax: 100, step: 0.1, default: (c) => Math.min(99.9, Math.max(0.1, c.confidenceLevel)) }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    showStats: boolean({ default: true }),
    chart: individualValuePlotChart.edits(),
  },
  derived: {
    /**
     * Kennzahlen je gezeichneter Gruppe (Konfidenzniveau in Prozent).
     * `null`, solange nichts rechenbar ist.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {SeriesStats[]|null}
     */
    stats(src) {
      const built = buildGroups(this.datasets, sourceColumns(src));
      if (!('groups' in built) || built.groups.length === 0) return null;
      return computeSeriesStats(built.groups.map((g, i) => ({ name: g.name, values: g.values, color: CHART_COLORS[i % CHART_COLORS.length] })), this.confLevel / 100)
        .map(({ name, stats, ci }) => finiteOrNull({ name, stats, ci }));
    },
    /**
     * Die schreibbaren Optionen.
     * @returns {string[]}
     */
    activeParams() { return ['confLevel']; },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['value', 'group', 'group2', 'group3']; },
  },
});
