/**
 * D.Mike — Heatmap: Viewmodel.
 *
 * `computed grid` baut aus der Zeile der Datensätze, der Aggregation und dem
 * Arbeitsblatt (`ctx.source`) das Raster; der Getter `heatmapChart` ist die
 * Konfiguration des Diagramm-Widgets, die `stats*`-Getter liefern die Texte
 * der Kreuztabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import { formatNum } from '../../../core/chart/chart-core.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildGrid, hasGrid, totalsOf, additive } from '../domain/grid.js';

/**
 * Zeile der Kreuztabelle, als Text.
 * @typedef {{ label: string, cells: string[], total: string }} StatsRow
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
    /** @param {number|null} v @param {number} d @returns {string} */
    const cellText = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? formatNum(v, d, lang()) : '—');
    return {
      computed: {
        /** Stufen beider Achsen und Wert je Zelle der gewählten Spalten; leer ohne Daten. */
        grid() {
          return buildGrid(this.model.datasets[0], sourceColumns(ctx.source), this.model.aggregation);
        },
      },
      get hasData() { return hasGrid(this.grid); },
      /** Ob die Auswahl „Aggregation“ wirkt (nur mit Wertespalte). */
      get showAggregation() { return !!this.activeParams?.includes('aggregation'); },
      /** Optionen der Auswahl „Aggregation“. */
      get aggregationOptions() {
        const cur = this.model.aggregation;
        return [
          { value: 'mean', label: this.t('aggMean'), selected: cur === 'mean' },
          { value: 'sum', label: this.t('aggSum'), selected: cur === 'sum' },
        ];
      },
      /**
       * Konfiguration des Diagramms: Raster, Achsentitel aus den Spaltennamen,
       * Beschriftung der Werte und die Vorgaben des Moduls, die von denen des
       * Typs abweichen (Titel aus, im Zählmodus ganze Zahlen). Der Titel
       * erscheint erst, wenn die Einstellungen `showTitle` setzen.
       */
      get heatmapChart() {
        const row = this.model.datasets[0];
        const { xCategories, yCategories, cells } = this.grid;
        let valueLabel = this.t('axisCount');
        if (row?.v) {
          const agg = this.model.aggregation === 'sum' ? this.t('axisSumOf') : this.t('axisMeanOf');
          valueLabel = `${agg} ${nameOf(row.v)}`.trim();
        }
        /** @type {Record<string, any>} */
        const cfg = {
          title: '',
          showTitle: false,
          xLabel: nameOf(row?.x),
          yLabel: nameOf(row?.g),
          xCategories: [...xCategories],
          yCategories: [...yCategories],
          cells: cells.map((r) => [...r]),
          valueLabel,
        };
        if (!row?.v) cfg.valueDecimals = 0;
        return cfg;
      },
      /** Stellen der Tabelle: im Zählmodus 0, sonst die Stellen des Diagramms. */
      get decimals() {
        if (!this.model.datasets[0]?.v) return 0;
        return this.model.chart.valueDecimals ?? 1;
      },
      /** Ob die Tabelle Summen zeigt (Zählen oder Summe). */
      get showTotals() { return additive(this.model.datasets[0], this.model.aggregation); },
      /** Ecke der Tabelle: „G-Spalte \ X-Spalte“. */
      get statsCorner() {
        const row = this.model.datasets[0];
        return `${nameOf(row?.g) || this.t('statG')} \\ ${nameOf(row?.x) || this.t('statX')}`;
      },
      /** Köpfe der Tabelle: die Stufen der X-Spalte. */
      get statsHeaders() { return [...this.grid.xCategories]; },
      /** @returns {StatsRow[]} Zeile je Stufe der G-Spalte, Werte als Text. */
      get statsRows() {
        if (!this.hasData) return [];
        const d = this.decimals;
        const { yCategories, cells } = this.grid;
        const sums = this.showTotals ? totalsOf(cells) : null;
        return yCategories.map((label, yi) => ({
          label,
          cells: cells[yi].map((v) => cellText(v, d)),
          total: sums ? formatNum(sums.rowTotals[yi], d, lang()) : '',
        }));
      },
      /** Spaltensummen als Text; leer ohne Summen. */
      get statsColTotals() {
        if (!this.hasData || !this.showTotals) return [];
        const d = this.decimals;
        return totalsOf(this.grid.cells).colTotals.map((c) => formatNum(c, d, lang()));
      },
      /** Gesamtsumme als Text; leer ohne Summen. */
      get statsGrandTotal() {
        if (!this.hasData || !this.showTotals) return '';
        return formatNum(totalsOf(this.grid.cells).total, this.decimals, lang());
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'heatmap'; },
    };
  },
});
