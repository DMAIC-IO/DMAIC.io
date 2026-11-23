/**
 * D.Mike — Pareto-Diagramm: Viewmodel.
 *
 * `computed chartData` baut aus der Zeile der Datensätze, der Aggregation und
 * dem Arbeitsblatt (`ctx.source`) die Einträge bzw. Kategorien und Gruppen
 * mit Farbe; der Getter `paretoChart` ist die Konfiguration des
 * Diagramm-Widgets, die `stats*`-Getter liefern die Texte der geordneten
 * Tabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import { formatNum, formatPct } from '../../../core/chart/chart-core.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildChartData, hasData, statsRows } from '../domain/chart-data.js';

/**
 * Zeile der geordneten Tabelle, als Text.
 * @typedef {{ color: string, name: string, value: string, cumPct: string }} StatsRow
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
        /** Einträge bzw. Kategorien und Gruppen (mit Farbe) der gewählten Spalten; leer ohne Daten. */
        chartData() {
          return buildChartData(this.model.datasets[0], sourceColumns(ctx.source), this.model.aggregation);
        },
      },
      get hasData() { return hasData(this.chartData); },
      /** Ob die Auswahl „Aggregation“ wirkt (nur mit Wertespalte). */
      get showAggregation() { return !!this.activeParams?.includes('aggregation'); },
      /** Optionen der Auswahl „Aggregation“. */
      get aggregationOptions() {
        const cur = this.model.aggregation;
        return [
          { value: 'sum', label: this.t('aggSum'), selected: cur === 'sum' },
          { value: 'mean', label: this.t('aggMean'), selected: cur === 'mean' },
        ];
      },
      /**
       * Konfiguration des Diagramms: Daten, Achsentitel aus den Spaltennamen,
       * übersetzte Texte und die Vorgaben des Moduls, die von denen des Typs
       * abweichen (Titel aus, Sammelposten an, Legende nur mit Gruppenspalte).
       * Der Titel erscheint erst, wenn die Einstellungen `showTitle` setzen.
       */
      get paretoChart() {
        const row = this.model.datasets[0];
        const { items, categories, groups } = this.chartData;
        let yLabel = this.t('axisCount');
        if (row?.y) {
          const agg = this.model.aggregation === 'mean' ? this.t('axisMeanOf') : this.t('axisSumOf');
          yLabel = `${agg} ${nameOf(row.y)}`;
        }
        const data = groups.length > 0
          ? {
            categories: [...categories],
            groups: groups.map((g) => ({ name: g.name, values: [...g.values], color: g.color })),
          }
          : { items: items.map((it) => ({ name: it.name, value: it.value, color: it.color })) };
        return {
          title: '',
          showTitle: false,
          ...data,
          xLabel: nameOf(row?.x),
          yLabel,
          rightYLabel: this.t('cumLabel'),
          otherLabel: this.t('otherLabel'),
          otherCountTemplate: this.t('otherCountTemplate'),
          otherBucket: true,
          showLegend: !!row?.g,
        };
      },
      /** Kopf der Wertespalte: Häufigkeit ohne Wertespalte, sonst Summe bzw. Mittelwert. */
      get statsValueHeader() {
        if (!this.model.datasets[0]?.y) return this.t('statCount');
        return this.model.aggregation === 'mean' ? this.t('statMean') : this.t('statSum');
      },
      /** @returns {StatsRow[]} Zeile je Kategorie, absteigend, mit Farbe, Wert und kumuliertem Anteil als Text. */
      get statsRows() {
        if (!this.hasData) return [];
        const l = lang();
        return statsRows(this.chartData).rows.map((r) => ({
          color: r.color,
          name: r.name,
          value: formatNum(r.value, null, l),
          cumPct: formatPct(r.cumPct / 100, 1, l),
        }));
      },
      /** Summe aller Werte, als Text. */
      get statsTotal() { return formatNum(statsRows(this.chartData).grandTotal, null, lang()); },
      /** Kumulierter Anteil der Summe (100 %), als Text. */
      get statsTotalPct() { return formatPct(1, 1, lang()); },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'pareto'; },
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
