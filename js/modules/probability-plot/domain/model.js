/**
 * D.Mike — Wahrscheinlichkeitsnetz: Model.
 *
 * Gespeichert werden die Datensätze (je Zeile eine Wertespalte und eine
 * optionale Gruppenspalte). Ansicht: Statistik-Schalter, Konfidenzniveau der
 * Tabelle, die Editor-Einstellungen des Diagramms und die Reihen-Einstellungen
 * alter Stände je Index. Die Kennzahlen liefert die Ableitung `stats` aus
 * Model und Arbeitsblatt.
 */
import { defineModel, command, list, object, text, number, boolean, columnRef, datasets } from '../../../core/model.js';
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { computeSeriesStats } from '../../../core/stats-panel.js';
import { sourceColumns } from '../../../core/source-columns.js';
import { applyEdits } from '../../../core/chart-edits.js';
import { referenceLineOf } from '../../../core/chart/types/probability-plot.js';
import probabilityPlotChart from '../../../widgets/probability-plot-chart/schema.js';
import { buildSeries } from './series.js';
import { from0 } from './migrations.js';

const opt = { optional: true };

/**
 * Kennzahlen einer gezeichneten Reihe (`computeSeriesStats`) samt
 * Referenzgerade. Sätze geteilt unter `modules.shared.types.SeriesStats.*`.
 *
 * @typedef {object} SeriesStats
 * @property {string} name  Name der Reihe
 * @property {Stats|null} stats  Kennzahlen, leer ohne Werte
 * @property {StatsCi} ci  Konfidenzintervalle
 * @property {ReferenceLine|null} referenceLine  die Referenzgerade der Reihe, leer bei weniger als zwei Werten
 */

/**
 * Die Referenzgerade durch Q1 und Q3 einer Reihe (`referenceLineOf`): auf
 * der Rechtsachse der Messwert, auf der Hochachse das Normalquantil z.
 *
 * @typedef {object} ReferenceLine
 * @property {number|null} slope  Steigung: z je Einheit des Messwerts
 * @property {number|null} intercept  Achsenabschnitt: z bei Messwert 0
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
 * @property {number|null} skewness  Schiefe
 * @property {number|null} kurtosis  Kurtosis
 */

/**
 * @typedef {object} StatsCi
 * @property {Array<number|null>} [mean]  Intervall des Mittelwerts
 * @property {Array<number|null>} [variance]  Intervall der Varianz
 * @property {Array<number|null>} [stddev]  Intervall der Standardabweichung
 */

/**
 * Nicht endliche Zahlen → `null`.
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
      valueRef: columnRef({ types: ['numeric'], minCount: 2, required: true }),
      groupRef: columnRef({ group: true }),
    }, { multi: true, colors: CHART_COLORS }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    showStats: boolean({ default: true }),
    confLevel: number({ exclusiveMin: 0, default: 95 }),
    chart: probabilityPlotChart.edits(),
    // Einstellungen alter Stände je Index der Reihe, samt Name.
    legacySeries: list(object({
      name: text(opt), color: text(opt), lineColor: text(opt), markerSymbol: text(opt), markerStroke: text(opt),
      markerSize: number({ optional: true, min: 0 }), markerStrokeWidth: number({ optional: true, min: 0 }),
      visible: boolean(opt),
    }), { default: [] }),
  },
  derived: {
    /**
     * Kennzahlen und Referenzgerade je gezeichneter Reihe (Konfidenzniveau in
     * Prozent), auf den Reihen nach den Editor-Einstellungen: Namen nach
     * `label`, ausgeblendete Reihen fehlen. `null`, solange nichts rechenbar
     * ist.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {SeriesStats[]|null}
     */
    stats(src) {
      const built = buildSeries(this, sourceColumns(src));
      if (!('series' in built)) return null;
      const shown = applyEdits({ series: built.series }, this.chart ?? {}, probabilityPlotChart.editable, new Set()).series
        .filter((/** @type {any} */ s) => s.visible !== false);
      if (shown.length === 0) return null;
      return computeSeriesStats(shown, this.confLevel / 100)
        .map(({ name, stats, ci }, i) => finiteOrNull({ name, stats, ci, referenceLine: referenceLineOf(shown[i].values) }));
    },
    /**
     * Die Verteilung, gegen die geprüft wird.
     * @returns {string}
     */
    distribution() { return 'normal'; },
    /**
     * Die Slots einer Zeile der Datensätze.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['valueRef', 'groupRef']; },
  },
  commands: {
    clearLegacySeries: command({
      params: {},
      run() { this.legacySeries = []; },
    }),
  },
});
