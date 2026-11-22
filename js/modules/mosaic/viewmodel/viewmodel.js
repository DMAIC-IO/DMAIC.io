/**
 * D.Mike — Mosaikdiagramm: Viewmodel.
 *
 * `computed crossTab` baut aus der Zeile der Datensätze und dem
 * Arbeitsblatt (`ctx.source`) Kategorien und Gruppen mit Farbe; der Getter
 * `mosaicChart` ist die Konfiguration des Diagramm-Widgets, die
 * `stats*`-Getter liefern die Texte der Kreuztabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import { formatNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildCrossTab, totalsOf } from '../domain/crosstab.js';

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** @param {object|null} ref @returns {string} */
    const nameOf = (ref) => (ref ? columnName(ctx.source, /** @type {any} */ (ref)) || '' : '');
    /** @param {number} v @returns {string} */
    const num = (v) => formatNumber(v, ctx.i18n.getLanguage());
    return {
      computed: {
        /** Kategorien und Gruppen (mit Farbe) der gewählten Spalten; leer ohne beide. */
        crossTab() {
          return buildCrossTab(this.model.datasets[0], sourceColumns(ctx.source));
        },
      },
      get hasSeries() { return this.crossTab.categories.length > 0 && this.crossTab.groups.length > 0; },
      /** Konfiguration des Diagramms: x-Achse aus dem Spaltennamen, Titel nur aus den Editor-Einstellungen. */
      get mosaicChart() {
        const { categories, groups } = this.crossTab;
        return {
          title: '',
          showTitle: false,
          xLabel: nameOf(this.model.datasets[0]?.x ?? null),
          yLabel: '',
          categories: [...categories],
          groups: groups.map((g) => ({ name: g.name, values: [...g.values], color: g.color })),
        };
      },
      /** Ecke der Kreuztabelle: „X-Spalte \ G-Spalte“. */
      get statsCorner() {
        const row = this.model.datasets[0];
        return `${nameOf(row?.x ?? null) || this.t('statX')} \\ ${nameOf(row?.g ?? null) || this.t('statG')}`;
      },
      /** Kopf je Gruppe: Name und Farbe. */
      get statsHeaders() { return this.crossTab.groups.map((g) => ({ name: g.name, color: g.color })); },
      /** Zeile je Kategorie: Häufigkeit je Gruppe und Summe, als Text. */
      get statsRows() {
        const { categories, groups } = this.crossTab;
        const sums = totalsOf(groups, categories.length);
        return categories.map((label, ci) => ({
          label,
          cells: groups.map((g) => num(g.values[ci] || 0)),
          total: num(sums.rowTotals[ci]),
        }));
      },
      /** Summe je Gruppe, als Text. */
      get statsColTotals() { return totalsOf(this.crossTab.groups, this.crossTab.categories.length).colTotals.map(num); },
      /** Gesamtsumme, als Text. */
      get statsGrandTotal() { return num(totalsOf(this.crossTab.groups, this.crossTab.categories.length).total); },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'mosaic'; },
      /**
       * Farbfeld im Kopf einer Gruppe.
       * @param {{ color: string }} h
       * @returns {string}
       */
      swatchStyle(h) { return `background:${h.color}`; },
    };
  },
});
