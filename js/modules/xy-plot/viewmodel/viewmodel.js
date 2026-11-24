/**
 * D.Mike — XY-Diagramm: Viewmodel.
 *
 * `computed series` baut aus Datensätzen und Arbeitsblatt (`ctx.source`) die
 * Reihen; die Kennzahlen kommen aus der Ableitung `stats` des Models. Der
 * Getter `scatter` ist die Konfiguration des Diagramm-Widgets.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildSeries, sourceColumns } from '../domain/series.js';
import { applyEdits } from '../../../widgets/chart-edits.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';

/** @param {any} s @returns {boolean} */
const hasSeriesKey = (s) => !!s && typeof s === 'object' && 'series' in s;

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** @noagent Lebenszyklus: andere Spalten der Datensätze verwerfen die Einstellungen alter Stände. */
      init() {
        // Geleert wird nur, wenn sich die Datensätze allein ändern. Ändern sich beide
        // zugleich (Rückgängig, Wiederholen, Laden eines Stands), gehören die
        // Einstellungen zum neuen Stand und bleiben.
        // Das Leeren gehört zum Schritt der Änderung an den Datensätzen. Es läuft eine
        // Mikroaufgabe später: erst hält der Verlauf die Änderung selbst als Schritt fest,
        // dann faltet `amend` das Leeren in ihn hinein.
        // Verglichen werden nur die Slots: eine Änderung allein an den Fehlerbalken
        // behält die Reihen und damit ihre Einstellungen.
        const slots = (/** @type {any[]} */ rows) => rows.map((d) => [d.x, d.y, d.group, d.size]);
        this.$watch(
          () => [JSON.stringify(slots(this.model.datasets)), JSON.stringify(this.model.legacySeries)],
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
        /** Reihen mit Darstellung, oder `{ error, params }`. */
        series() {
          return buildSeries(this.model, sourceColumns(ctx.source));
        },
        /** Die sichtbaren Reihen nach den Editor-Einstellungen; leer, solange es keine gibt. */
        visibleSeries() {
          const s = this.series;
          if (!hasSeriesKey(s)) return [];
          return applyEdits({ series: s.series }, this.model.chart ?? {}, scatterChart.editable, new Set()).series
            .filter((/** @type {any} */ r) => r.visible !== false);
        },
      },
      get hasSeries() { return hasSeriesKey(this.series) && this.series.series.length > 0; },
      /** Eigener Fehler des Reihenbaus übersetzt; sonst leer (auch bei einer Ausnahme, kein fremder Text). */
      get errorText() {
        const s = this.series;
        if (!s || typeof s !== 'object' || !('params' in s) || !s.error) return '';
        return this.t(s.error, s.params);
      },
      /** Konfiguration des Diagramms: die x-Achse trägt den Namen der X-Spalte der ersten Reihe. */
      get scatter() {
        if (!this.hasSeries) return null;
        const { series, xRef } = this.series;
        return {
          title: '',
          xLabel: (xRef ? sourceColumns(ctx.source).name(xRef) : null) ?? '',
          yLabel: '',
          editConnectLine: true,
          series,
        };
      },
      /**
       * Zeilen der Kennzahlentabelle: die Ableitung `stats` mit der Farbe der Reihe
       * (gleiche Reihenfolge: beide über die sichtbaren Reihen nach den Editor-Einstellungen).
       */
      get statsRows() {
        const rows = this.stats ?? [];
        const shown = this.visibleSeries;
        return rows.map((r, i) => ({ ...r, color: shown[i]?.color ?? null }));
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'scatter'; },
    };
  },
});
