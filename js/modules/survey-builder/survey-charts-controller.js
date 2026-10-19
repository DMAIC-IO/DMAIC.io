/**
 * D.Mike — Survey builder charts (survey-charts-controller.js)
 *
 * Results tab: chart jobs and their mounting through the chart manager.
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function chartsController(module, _t) {
  return {
    /** @type {object[]} mounted chart instances (results tab) */
    _charts: [],
    /** Render generation — drops mounts from outdated runs. */
    _renderGen: 0,

    /** Unmounts every chart of the results tab. */
    destroyCharts() {
      for (const c of this._charts) {
        try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
      }
      this._charts = [];
    },

    /**
     * Everything the charts depend on — a change re-mounts them.
     * @returns {string}
     */
    _resultsSignature() {
      return JSON.stringify([this.model.survey, this.model.responseIds(), this.model.ui.filter, this.model.ui.groupBy]);
    },

    /** Mounts the charts after the next render when the results tab is active. */
    scheduleCharts() {
      if (!this.isTab('results')) return;
      this.$nextTick(() => this.mountCharts());
    },

    /** Per-question charts: choice shares, rating means, Kano better/worse. */
    questionChartJobs() {
      const jobs = [];
      for (const b of this.blocks()) {
        const key = this.chartKey('q', b.question.id);
        const s = b.stats;
        if (this.isChoice(b) && s.n > 0) {
          jobs.push({ key, type: 'bar', config: {
            categories: s.options.map((o) => o.text),
            groups: [{ name: _t('chartShare'), values: s.options.map((o) => Math.round((o.share || 0) * 1000) / 10), color: 'var(--color-chart-1)' }],
            yLabel: '%', yMin: 0, showLegend: false,
          } });
        }
        if (s.type === 'rating') {
          const rows = s.rows.filter((r) => r.mean !== null).sort((a, c) => c.mean - a.mean);
          if (rows.length > 0) {
            jobs.push({ key, type: 'bar', config: {
              categories: rows.map((r) => r.text),
              groups: [{ name: _t('chartMean'), values: rows.map((r) => r.mean), color: 'var(--color-chart-1)' }],
              yLabel: _t('report.colMean'), yMin: 0, showLegend: false,
            } });
          }
        }
        if (s.type === 'kano') {
          const config = this._kanoScatter(s.rows.map((r) => ({ label: r.text, cs: r.cs, ds: r.ds })));
          if (config) jobs.push({ key, type: 'scatter', config });
        }
      }
      return jobs;
    },

    /**
     * Summary scatter, group bars, then the per-question charts.
     * @returns {Array<{key: string, type: string, config: object}>}
     */
    chartJobs() {
      return [...this.summaryChartJobs(), ...this.groupChartJobs(), ...this.questionChartJobs()];
    },

    /**
     * One Better/Worse scatter over all Kano rows of all Kano questions (spec §7.1).
     * @returns {Array<{key: string, type: string, config: object}>}
     */
    summaryChartJobs() {
      const config = this._kanoScatter(this._kanoOverview().map((k) => ({ label: k.text, cs: k.cs, ds: k.ds })));
      return config ? [{ key: 'kano-overview', type: 'scatter', config }] : [];
    },

    /**
     * Grouped bars, share in % per group, for every choice question of the comparison.
     * @returns {Array<{key: string, type: string, config: object}>}
     */
    groupChartJobs() {
      const cmp = this._comparison();
      if (!cmp) return [];
      return cmp.questions
        .filter((part) => part.type === 'single' || part.type === 'multi')
        .map((part) => ({
          key: this.chartKey('g', part.questionId),
          type: 'bar',
          config: {
            categories: part.options.map((o) => o.text),
            groups: cmp.groups.map((g, i) => ({
              name: g.text,
              values: part.options.map((o) => Math.round((o.shares[i] || 0) * 1000) / 10),
              color: `var(--color-chart-${(i % 10) + 1})`,
            })),
            yLabel: '%', yMin: 0, showLegend: true,
          },
        }));
    },

    /**
     * Better/worse scatter, same look as the kano module (kano.js mountChart):
     * one series per item so the tooltip names it, no legend.
     * @param {Array<{label: string, cs: number|null, ds: number|null}>} rows
     * @returns {object|null} chart config, null without a plottable row
     */
    _kanoScatter(rows) {
      const points = rows.filter((r) => r.cs !== null && r.ds !== null);
      if (points.length === 0) return null;
      const i18n = module._context.i18n;
      return {
        xLabel: i18n.t('modules.kano.chartX'),
        yLabel: i18n.t('modules.kano.chartY'),
        showLegend: false,
        series: points.map((r) => ({
          name: r.label, color: 'var(--color-chart-1)', symbol: 'circle', markerSize: 8, strokeWidth: 1,
          x: [Math.abs(r.ds)], y: [r.cs],
        })),
        refLines: [
          { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
          { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
        ],
      };
    },

    /**
     * Waits across animation frames (bounded) until an anchor exists, as the
     * hosts sit inside x-for/x-if templates that Alpine materialises late.
     * @param {string} selector
     * @param {number} gen render generation of the caller
     * @param {number} [maxFrames=30]
     * @returns {Promise<Element|null>} null when outdated or never rendered
     */
    _whenAnchor(selector, gen, maxFrames = 30) {
      return new Promise((resolve) => {
        const tick = (left) => {
          if (gen !== this._renderGen) { resolve(null); return; }
          const el = module._container && module._container.querySelector(selector);
          if (el) { resolve(el); return; }
          if (left <= 0) { resolve(null); return; }
          requestAnimationFrame(() => tick(left - 1));
        };
        tick(maxFrames);
      });
    },

    /** Mounts every chart job into its `[data-chart]` host (gen guard as in kano.js). */
    async mountCharts() {
      if (this._destroyed || !this.isTab('results')) return;
      this._renderGen++;
      const gen = this._renderGen;
      this.destroyCharts();
      for (const job of this.chartJobs()) {
        const host = await this._whenAnchor(`[data-chart="${job.key}"]`, gen);
        if (this._destroyed || gen !== this._renderGen) return;
        if (!host) continue;
        const chart = await module._context.chartManager.create(host, job.type, job.config);
        if (this._destroyed || gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      }
    },
  };
}
