/**
 * D.Mike — XY-Plot: Model.
 *
 * Gespeichert werden die Datensätze (je Zeile X, Y, Gruppe, Größe und die
 * Fehlerbalken der Reihe, `domain/error-bars.js`). Ansicht:
 * Linien- und Markerschalter, Statistik und Konfidenzniveau, die
 * Editor-Einstellungen des Diagramms und die Reihen-Einstellungen alter
 * Stände. Die Kennzahlen liefert die Ableitung `stats` aus Model und
 * Arbeitsblatt.
 */
import { defineModel, command, list, object, text, number, boolean, columnRef, datasets, index } from '../../../core/model.js';
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { computeSeriesStats } from '../../../core/stats-panel.js';
import { applyEdits } from '../../../core/chart-edits.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { buildSeries, statsInput, sourceColumns } from './series.js';
import { from0, from10 } from './migrations.js';
import { ErrorBarsSpec, NUMBER_TYPES } from './error-bars.js';

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
 * @property {number} stddev  Standardabweichung
 * @property {number} variance  Varianz
 * @property {number} seMean  Standardfehler des Mittelwerts
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
 * @property {number[]} [mean]  Intervall des Mittelwerts
 * @property {number[]} [variance]  Intervall der Varianz
 * @property {number[]} [stddev]  Intervall der Standardabweichung
 */

const opt = { optional: true };

export const State = defineModel({
  version: '1.1',
  migrations: { '0→1.1': from0, '1.0→1.1': from10 },
  fields: {
    datasets: datasets({
      x: columnRef({ types: NUMBER_TYPES, minCount: 1, required: true }),
      y: columnRef({ types: NUMBER_TYPES, minCount: 1, required: true }),
      group: columnRef({ group: true }),
      size: columnRef({ types: NUMBER_TYPES, minCount: 1 }),
    }, { multi: true, colors: CHART_COLORS, extension: object({ errorBars: ErrorBarsSpec }) }),
  },
  view: {
    showLines: boolean({ default: false }),
    showMarkers: boolean({ default: true }),
    showStats: boolean({ default: true }),
    confLevel: number({ default: 95 }),
    exampleWorksheetId: text({ nullable: true }),
    // Einstellungen alter Stände je Index der Reihe, auch der Name.
    legacySeries: list(object({
      name: text(opt), color: text(opt), visible: boolean(opt), symbol: text(opt),
      markerSize: number({ optional: true, min: 0 }), stroke: text(opt), strokeWidth: number({ optional: true, min: 0 }),
      connectLine: object({ show: boolean(), dash: text(opt), width: number(opt), color: text(opt) }, opt),
    }), { default: [] }),
    chart: scatterChart.edits(),
  },
  derived: {
    /**
     * Kennzahlen der Y-Werte je sichtbarer Reihe (Konfidenzniveau in Prozent).
     * Gerechnet auf den Reihen nach den Editor-Einstellungen: im Editor
     * ausgeblendete Reihen fehlen. `null`, solange nichts rechenbar ist.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {SeriesStats[]|null}
     */
    stats(src) {
      const built = buildSeries(this, sourceColumns(src));
      if (!('series' in built)) return null;
      const shown = applyEdits({ series: built.series }, this.chart ?? {}, scatterChart.editable, new Set()).series;
      const result = computeSeriesStats(statsInput(shown), this.confLevel / 100)
        .map(({ name, stats, ci }) => ({ name, stats, ci }));
      return result.length > 0 ? result : null;
    },
  },
  commands: {
    clearLegacySeries: command({
      params: {},
      run() { this.legacySeries = []; },
    }),
    /** Die Fehlerbalken einer Reihe ersetzen (ganze Spezifikation; ein Moduswechsel leert). */
    setErrorBars: command({
      params: { index: index('datasets', { existing: true }), spec: ErrorBarsSpec },
      run({ index: at, spec }) {
        this.datasets = this.datasets.map((d, i) => (i === at ? { ...d, errorBars: spec } : d));
      },
    }),
  },
});
