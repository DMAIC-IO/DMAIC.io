/**
 * D.Mike — Boxplot: Viewmodel.
 *
 * `computed groups` baut aus Datensätzen und Arbeitsblatt (`ctx.source`) die
 * Boxen; die Kennzahlen kommen aus der Ableitung `stats` des Models. Der
 * Getter `boxChart` ist die Konfiguration des Diagramm-Widgets.
 */
import { createModule } from '../../../core/template-module.js';
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { sourceColumns } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildGroups } from '../domain/groups.js';

/** @param {any} g @returns {boolean} */
const hasGroupsKey = (g) => !!g && typeof g === 'object' && 'groups' in g;

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      computed: {
        /** Boxen, oder `{ error, params }`. */
        groups() {
          return buildGroups(this.model.datasets, sourceColumns(ctx.source));
        },
      },
      get hasSeries() { return hasGroupsKey(this.groups) && this.groups.groups.length > 0; },
      /** Eigener Fehler des Gruppenbaus übersetzt; sonst leer (auch bei einer Ausnahme, kein fremder Text). */
      get errorText() {
        const g = this.groups;
        if (!g || typeof g !== 'object' || !('params' in g) || !g.error) return '';
        return this.t(g.error, g.params);
      },
      /** Konfiguration des Diagramms: Titel und x-Achse aus den Texten, Legende ab zwei Boxen. */
      get boxChart() {
        if (!this.hasSeries) return null;
        const groups = this.groups.groups;
        return {
          title: this.t('chartTitle'),
          xLabel: this.t('xLabel'),
          yLabel: '',
          showLegend: groups.length > 1,
          showYTicks: false,
          groups: groups.map((/** @type {any} */ g) => ({ name: g.name, values: g.values })),
        };
      },
      /** Zeilen der Kennzahlentabelle: die Ableitung `stats` mit der Boxfarbe. */
      get statsRows() {
        const colors = this.model.chart?.boxColors ?? [];
        return (this.stats ?? []).map((r, i) => ({ ...r, color: colors[i] || CHART_COLORS[i % CHART_COLORS.length] }));
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'boxplot'; },
    };
  },
});
