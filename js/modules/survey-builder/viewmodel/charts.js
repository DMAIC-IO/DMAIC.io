/**
 * D.Mike — Survey builder: view part "charts" (viewmodel/charts.js)
 *
 * The charts of the results tab as plain configurations for the widgets
 * `bar-chart` and `scatter-chart`: the Better/Worse scatter over all Kano
 * rows, the grouped bars of the comparison, then per question the shares of
 * a choice, the means of a rating and the Better/Worse scatter of a Kano
 * question. `chartCells` holds them all in that order; the template draws
 * the cells of one place (`chartsAt`) in an `x-for`, and only while the
 * results tab is shown. The configurations carry no functions and no NaN.
 */

/**
 * @typedef {{ key: string, kind: 'bar'|'scatter', config: Record<string, any> }} ChartCell
 */

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const chartsView = () => ({
  computed: {
    /**
     * Every chart of the evaluation: overview, groups, questions.
     * @returns {ChartCell[]}
     */
    chartCells() {
      return [...this.overviewCells(), ...this.groupCells(), ...this.questionCells()];
    },
  },

  /** @returns {ChartCell[]} the Better/Worse scatter over all Kano rows */
  overviewCells() {
    const config = this.kanoScatter(this.results.kanoOverview.map((k) => ({ label: k.text, cs: k.cs, ds: k.ds })));
    return config ? [{ key: 'kano-overview', kind: 'scatter', config }] : [];
  },

  /** @returns {ChartCell[]} grouped bars, share in % per group, per choice question of the comparison */
  groupCells() {
    const cmp = this.results.groupComparison;
    if (!cmp) return [];
    return cmp.questions
      .filter((/** @type {any} */ part) => part.type === 'single' || part.type === 'multi')
      .map((/** @type {any} */ part) => ({
        key: `g:${part.questionId}`,
        kind: /** @type {'bar'} */ ('bar'),
        config: {
          categories: part.options.map((/** @type {any} */ o) => o.text),
          groups: cmp.groups.map((g, i) => ({
            name: g.text,
            values: part.options.map((/** @type {any} */ o) => Math.round((o.shares[i] || 0) * 1000) / 10),
            color: `var(--color-chart-${(i % 10) + 1})`,
          })),
          yLabel: '%', yMin: 0, showLegend: true,
        },
      }));
  },

  /** @returns {ChartCell[]} per question: choice shares, rating means, Kano Better/Worse */
  questionCells() {
    /** @type {ChartCell[]} */
    const cells = [];
    for (const s of /** @type {any[]} */ (this.results.questions)) {
      const key = `q:${s.questionId}`;
      if ((s.type === 'single' || s.type === 'multi') && s.n > 0) {
        cells.push({ key, kind: 'bar', config: {
          categories: s.options.map((/** @type {any} */ o) => o.text),
          groups: [{ name: this.t('chartShare'), values: s.options.map((/** @type {any} */ o) => Math.round((o.share || 0) * 1000) / 10), color: 'var(--color-chart-1)' }],
          yLabel: '%', yMin: 0, showLegend: false,
        } });
      }
      if (s.type === 'rating') {
        const rows = s.rows.filter((/** @type {any} */ r) => r.mean !== null).sort((/** @type {any} */ a, /** @type {any} */ c) => c.mean - a.mean);
        if (rows.length > 0) {
          cells.push({ key, kind: 'bar', config: {
            categories: rows.map((/** @type {any} */ r) => r.text),
            groups: [{ name: this.t('chartMean'), values: rows.map((/** @type {any} */ r) => r.mean), color: 'var(--color-chart-1)' }],
            yLabel: this.t('report.colMean'), yMin: 0, showLegend: false,
          } });
        }
      }
      if (s.type === 'kano') {
        const config = this.kanoScatter(s.rows.map((/** @type {any} */ r) => ({ label: r.text, cs: r.cs, ds: r.ds })));
        if (config) cells.push({ key, kind: 'scatter', config });
      }
    }
    return cells;
  },

  /**
   * Better/Worse scatter with the look of the kano module: one series per
   * item (the tooltip names it), no legend, dashed lines at 0.5.
   * @param {Array<{ label: string, cs: number|null, ds: number|null }>} rows
   * @returns {Record<string, any>|null} null without a plottable row
   */
  kanoScatter(rows) {
    const points = rows.filter((r) => r.cs !== null && r.ds !== null);
    if (points.length === 0) return null;
    return {
      xLabel: this.t('kano.chartX'),
      yLabel: this.t('kano.chartY'),
      showLegend: false,
      series: points.map((r) => ({
        name: r.label, color: 'var(--color-chart-1)', symbol: 'circle', markerSize: 8, strokeWidth: 1,
        x: [Math.abs(/** @type {number} */ (r.ds))], y: [/** @type {number} */ (r.cs)],
      })),
      moduleRefLines: [
        { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
        { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
      ],
    };
  },

  /**
   * The cells drawn at one place of the tab; none while another tab is shown.
   * @param {string} key `kano-overview`, `g:<questionId>` or `q:<questionId>`
   * @returns {ChartCell[]}
   */
  chartsAt(key) {
    if (this.model.tab !== 'results') return [];
    return this.chartCells.filter((c) => c.key === key);
  },

  /** @returns {ChartCell[]} the cells of the Kano overview */
  get overviewCharts() { return this.chartsAt('kano-overview'); },

  /** @param {{ questionId: string }} part @returns {ChartCell[]} the cells of one part of the comparison */
  groupCharts(part) { return this.chartsAt(`g:${part.questionId}`); },

  /** @param {{ key: string }} b block @returns {ChartCell[]} the cells of one question block */
  questionCharts(b) { return this.chartsAt(`q:${b.key}`); },

  /**
   * Table and chart side by side — only where a chart is drawn.
   * @param {ChartCell[]} cells the cells of one place
   * @returns {Record<string, boolean>} class map of the block body
   */
  sideClass(cells) { return { 'survey-builder__block-body--side': cells.length > 0 }; },

  /** @param {ChartCell} cell @param {'bar'|'scatter'} kind @returns {boolean} */
  cellIs(cell, kind) { return cell.kind === kind; },
});
