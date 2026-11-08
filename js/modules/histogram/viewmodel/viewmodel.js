/**
 * D.Mike — Histogramm: Viewmodel.
 *
 * `computed series` baut aus Datensätzen und Arbeitsblatt (`ctx.data`) die
 * Reihen, `computed stats` die Kennzahlen; der Getter `histogram` ist die
 * Konfiguration des Diagramm-Widgets.
 */
import { createModule } from '../../../core/template-module.js';
import { computeSeriesStats } from '../../../core/stats-panel.js';
import { CHART_COLORS_RGBA, BORDER_COLORS } from '../../../core/chart/chart-colors.js';
import { applyEdits } from '../../../widgets/chart-edits.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import descriptor from '../module.js';
import { State, BIN_MODES } from '../domain/model.js';
import { buildGroups } from '../domain/analyze.js';
import { fromExample } from '../io/example.js';

/** @param {any} s @returns {boolean} */
const hasSeriesKey = (s) => !!s && typeof s === 'object' && 'series' in s;

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** @noagent Lebenszyklus: andere Datensätze verwerfen die Einstellungen alter Stände. */
      init() {
        this.$watch(() => JSON.stringify(this.model.datasets), () => {
          if (this.model.legacySeries.length > 0) this.model.clearLegacySeries();
        });
      },
      computed: {
        /** Reihen mit Darstellung, oder `{ error, params }`. */
        series() {
          const out = buildGroups(this.model.datasets, { values: (r) => ctx.data.values(r), name: (r) => ctx.data.name(r) });
          if ('error' in out) return out;
          return {
            series: out.groups.map((g, i) => ({
              name: g.level === null ? g.col : this.t('groupSeriesName', { col: g.col, level: g.level }),
              values: g.values, visible: true,
              fillColor: CHART_COLORS_RGBA[i % CHART_COLORS_RGBA.length],
              borderColor: BORDER_COLORS[i % BORDER_COLORS.length],
              borderWidth: 1, borderStyle: 'solid', pattern: '', patternColor: '', patternSolidity: 0.4,
              showNormalCurve: true,
              ...(this.model.legacySeries[i] ?? {}),
            })),
          };
        },
        /** Reihen nach den Editor-Einstellungen; leer, solange es keine gibt. */
        shown() {
          const s = this.series;
          if (!hasSeriesKey(s)) return [];
          return applyEdits({ series: s.series }, this.model.histogramChart ?? {}, histogramChart.editable, new Set()).series;
        },
        /**
         * Kennzahlen je sichtbarer Reihe (Konfidenzniveau in Prozent). Gerechnet
         * auf den Reihen nach den Editor-Einstellungen: im Editor ausgeblendete
         * Reihen fehlen.
         */
        stats() {
          return computeSeriesStats(
            this.shown.map((/** @type {any} */ r) => ({ name: r.name, values: r.values, color: r.fillColor, visible: r.visible })),
            this.model.confLevel / 100,
          );
        },
      },
      get hasSeries() { return hasSeriesKey(this.series) && this.series.series.length > 0; },
      /** Eigener Fehler mit Parametern übersetzt, eine Ausnahme als Meldung; sonst leer. */
      get errorText() {
        const s = this.series;
        if (!s || typeof s !== 'object' || !('error' in s) || !s.error) return '';
        return s.params ? this.t(s.error, s.params) : String(s.error);
      },
      get isManual() { return this.model.binMode === 'manual'; },
      get binModeOptions() {
        return BIN_MODES.map((value) => ({ value, label: this.t(value === 'auto' ? 'binAuto' : 'binManual'), selected: value === this.model.binMode }));
      },
      /** Konfiguration des Diagramms: automatischer Titel aus den Reihennamen. */
      get histogram() {
        if (!this.hasSeries) return null;
        const series = this.series.series;
        return {
          title: `${this.t('chartTitle')}: ${this.shown.filter((/** @type {any} */ s) => s.visible !== false).map((/** @type {any} */ s) => s.name).join(', ')}`,
          xLabel: this.t('xLabel'), yLabel: this.t('yLabel'),
          pareto: true, boxplotStrip: true, barGap: 1, fileName: 'histogram',
          ...(this.isManual && this.model.binWidth !== null ? { binWidth: this.model.binWidth } : {}),
          series,
        };
      },
      /**
       * @noagent Wechselt die Klasseneinteilung über das Kommando des Models.
       * @param {Event} event
       */
      binModeChanged(event) {
        this.model.setBinMode({ binMode: /** @type {any} */ (event.target).value });
      },
    };
  },
});
