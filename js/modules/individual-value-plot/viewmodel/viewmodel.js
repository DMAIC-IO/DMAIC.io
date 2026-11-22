/**
 * D.Mike — Einzelwertdiagramm: Viewmodel.
 *
 * `computed groups` baut aus Datensätzen und Arbeitsblatt (`ctx.source`) die
 * Punktgruppen; die Kennzahlen kommen aus der Ableitung `stats` des Models.
 * Der Getter `ivp` ist die Konfiguration des Diagramm-Widgets.
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
        /** Punktgruppen, oder `{ error, params }`. */
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
      /** Konfiguration des Diagramms: Titel und y-Achse aus den Texten, Legende ab zwei Gruppen. */
      get ivp() {
        if (!this.hasSeries) return null;
        const groups = this.groups.groups;
        return {
          title: this.t('chartTitle'),
          xLabel: '',
          yLabel: this.t('yLabel'),
          showLegend: groups.length > 1,
          showXTicks: false,
          groups: groups.map((/** @type {any} */ g) => ({ name: g.name, values: g.values })),
        };
      },
      /** Zeilen der Kennzahlentabelle: die Ableitung `stats` mit der Punktfarbe der Gruppe. */
      get statsRows() {
        const colors = this.model.chart?.pointColors ?? [];
        return (this.stats ?? []).map((r, i) => ({ ...r, color: colors[i] || CHART_COLORS[i % CHART_COLORS.length] }));
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'individual-value-plot'; },
    };
  },
});
