/**
 * D.Mike — Balkendiagramm: Viewmodel.
 *
 * `computed chartData` baut aus der Zeile der Datensätze, der Aggregation und
 * dem Arbeitsblatt (`ctx.source`) die Kategorien und Reihen mit Farbe; der
 * Getter `barChart` ist die Konfiguration des Diagramm-Widgets, die
 * `stats*`-Getter liefern die Texte der Tabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import { formatNum } from '../../../core/chart/chart-core.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildChartData, hasData, frequencyTotal, tableRows } from '../domain/chart-data.js';

/**
 * Zeile der Tabelle, als Text.
 * @typedef {{ color: string, name: string, group: string, value: string }} StatsRow
 */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** @returns {string} */
    const lang = () => ctx.i18n.getLanguage();
    /** @param {object|null|undefined} ref @returns {string} */
    const nameOf = (ref) => (ref ? columnName(ctx.source, /** @type {any} */ (ref)) || '' : '');
    return {
      computed: {
        /** Kategorien und Reihen (mit Farbe) der gewählten Spalten; leer ohne Daten. */
        chartData() {
          return buildChartData(this.model.datasets[0], sourceColumns(ctx.source), this.model.aggregation);
        },
      },
      get hasData() { return hasData(this.chartData); },
      /** Ob die Auswahl „Aggregation“ wirkt (nur mit Wertespalte). */
      get showAggregation() { return !!this.activeParams?.includes('aggregation'); },
      /** Ob das Kästchen „Gestapelt“ wirkt (nur mit Gruppenspalte). */
      get showStacked() { return !!this.activeParams?.includes('stacked'); },
      /** Ob der Optionsbereich etwas zeigt. */
      get showOptions() { return this.showAggregation || this.showStacked; },
      /** Optionen der Auswahl „Aggregation“. */
      get aggregationOptions() {
        const cur = this.model.aggregation;
        return [
          { value: 'mean', label: this.t('aggMean'), selected: cur === 'mean' },
          { value: 'sum', label: this.t('aggSum'), selected: cur === 'sum' },
        ];
      },
      /**
       * Konfiguration des Diagramms: Daten, Achsentitel aus den Spaltennamen
       * und die Vorgaben des Moduls, die von denen des Typs abweichen (Titel
       * aus, Legende nur mit Gruppenspalte). Der Titel erscheint erst, wenn
       * die Einstellungen `showTitle` setzen.
       */
      get barChart() {
        const row = this.model.datasets[0];
        const { categories, groups } = this.chartData;
        let yLabel = this.t('axisCount');
        if (row?.y) {
          const agg = this.model.aggregation === 'sum' ? this.t('axisSumOf') : this.t('axisMeanOf');
          yLabel = `${agg} ${nameOf(row.y)}`;
        }
        return {
          title: '',
          showTitle: false,
          categories: [...categories],
          groups: groups.map((g) => ({ name: g.name, values: [...g.values], color: g.color })),
          xLabel: nameOf(row?.x),
          yLabel,
          stacked: this.model.stacked,
          showLegend: !!row?.g,
        };
      },
      /** Kopf der Wertespalte: Häufigkeit ohne Wertespalte, sonst Summe bzw. Mittelwert. */
      get statsValueHeader() {
        if (!this.model.datasets[0]?.y) return this.t('statCount');
        return this.model.aggregation === 'sum' ? this.t('statSum') : this.t('statMean');
      },
      /** Ob die Tabelle die Spalte „Gruppe“ zeigt (nur mit Gruppenspalte). */
      get showGroupCol() { return !!this.model.datasets[0]?.g; },
      /** Ob die Tabelle die Summenzeile zeigt (nur bei Häufigkeiten, ohne Wertespalte). */
      get showTotal() { return !this.model.datasets[0]?.y; },
      /** @returns {StatsRow[]} Zeile je Reihe und Kategorie, mit Farbe und Wert als Text. */
      get statsRows() {
        if (!this.hasData) return [];
        const l = lang();
        return tableRows(this.chartData).map((r) => ({
          color: r.color,
          name: r.name,
          group: r.group,
          value: formatNum(r.value, null, l),
        }));
      },
      /** Summe aller Werte, als Text. */
      get statsTotal() { return formatNum(frequencyTotal(this.chartData), null, lang()); },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'bar'; },
      /**
       * Farbfeld einer Tabellenzeile.
       * @param {{ color: string }} r
       * @returns {string}
       */
      swatchStyle(r) { return `background:${r.color}`; },
      /**
       * Name einer Tabellenzeile, mit Abstand zum Farbfeld.
       * @param {{ name: string }} r
       * @returns {string}
       */
      rowLabel(r) { return ` ${r.name}`; },
    };
  },
});
