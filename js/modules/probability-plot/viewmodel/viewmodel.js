/**
 * D.Mike — Wahrscheinlichkeitsnetz: Viewmodel.
 *
 * `computed series` baut aus Datensätzen und Arbeitsblatt (`ctx.source`) die
 * Reihen; die Kennzahlen kommen aus der Ableitung `stats` des Models. Der
 * Getter `probChart` ist die Konfiguration des Diagramm-Widgets.
 */
import { createModule } from '../../../core/template-module.js';
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { sourceColumns } from '../../../core/source-columns.js';
import { applyEdits } from '../../../widgets/chart-edits.js';
import probabilityPlotChart from '../../../widgets/probability-plot-chart/schema.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildSeries } from '../domain/series.js';

/** @param {any} s @returns {boolean} */
const hasSeriesKey = (s) => !!s && typeof s === 'object' && 'series' in s;

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** Lebenszyklus: andere Datensätze verwerfen die Einstellungen alter Stände. */
      init() {
        // Geleert wird nur, wenn sich die Datensätze allein ändern. Ändern sich beide
        // zugleich (Rückgängig, Wiederholen, Laden eines Stands), gehören die
        // Einstellungen zum neuen Stand und bleiben.
        // Das Leeren gehört zum Schritt der Änderung an den Datensätzen. Es läuft eine
        // Mikroaufgabe später: erst hält der Verlauf die Änderung selbst als Schritt fest,
        // dann faltet `amend` das Leeren in ihn hinein.
        this.$watch(
          () => [JSON.stringify(this.model.datasets), JSON.stringify(this.model.legacySeries)],
          (now, before) => {
            if (now[0] === before[0] || now[1] !== before[1] || this.model.legacySeries.length === 0) return;
            queueMicrotask(() => {
              if (this.model.legacySeries.length === 0) return;
              ctx.history?.amend(() => this.model.clearLegacySeries({}));
            });
          },
        );
      },
      computed: {
        /** Reihen mit den Einstellungen alter Stände, oder `{ error, params }`. */
        series() {
          return buildSeries(this.model, sourceColumns(ctx.source));
        },
        /** Reihen nach den Editor-Einstellungen; leer, solange es keine gibt. */
        shown() {
          const s = this.series;
          if (!hasSeriesKey(s)) return [];
          return applyEdits({ series: s.series }, this.model.chart ?? {}, probabilityPlotChart.editable, new Set()).series;
        },
      },
      get hasSeries() { return hasSeriesKey(this.series) && this.series.series.length > 0; },
      /** Eigener Fehler des Reihenbaus übersetzt; sonst leer (auch bei einer Ausnahme, kein fremder Text). */
      get errorText() {
        const s = this.series;
        if (!s || typeof s !== 'object' || !('params' in s) || !s.error) return '';
        return this.t(s.error, s.params);
      },
      /** Konfiguration des Diagramms: Titel aus den Namen aller Reihen (auch ausgeblendeter). */
      get probChart() {
        if (!this.hasSeries) return null;
        const col = this.shown.map((/** @type {any} */ s) => s.name).join(', ');
        return {
          title: this.t('chartTitle', { col }),
          xLabel: this.t('xLabel'),
          yLabel: this.t('yLabel'),
          series: this.series.series,
        };
      },
      /**
       * Zeilen der Kennzahlentabelle: die Ableitung `stats` mit der Farbe der Reihe im
       * Diagramm (Editorfarbe, sonst die Palette nach dem Index unter den sichtbaren
       * Reihen, wie der Diagrammtyp die Punkte färbt).
       */
      get statsRows() {
        const visible = this.shown.filter((/** @type {any} */ s) => s.visible !== false);
        return (this.stats ?? []).map((r, j) => ({
          ...r, color: visible[j]?.color || CHART_COLORS[j % CHART_COLORS.length],
        }));
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'probability-plot'; },
    };
  },
});
