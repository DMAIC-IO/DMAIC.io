/**
 * D.Mike — Kano dashboard tile (kano.tile.js)
 *
 * "What do customers expect?" — category distribution of the items,
 * completeness, a questionable-answer warning and a compact Better/Worse
 * scatter through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * model, the engine and the pure chart config. The markup lives in
 * kano.tile.html. Contract: docs/DASHBOARD.md.
 */

import { State } from './kano-model.js';
import { evaluate, CATEGORIES, Q_WARN } from '../../engines/kano-engine.js';
import { kanoScatterConfig } from './kano-chart.js';

/** host -> { chart, chartManager, token } of the latest render. */
const charts = new WeakMap();

/**
 * Destroy the chart of the latest render in a host and forget it.
 * @param {HTMLElement} host
 */
function release(host) {
  const entry = charts.get(host);
  if (entry?.chart) entry.chartManager.destroy(entry.chart);
  charts.delete(host);
}

/** Share as a whole percent ("75 %"); `|| 0` smooths a possible -0. */
function pct(v) {
  return `${Math.round((v || 0) * 100) || 0} %`;
}

/** Chart colour of a category, by its position in CATEGORIES. */
function catColor(cat) {
  return `var(--color-chart-${CATEGORIES.indexOf(cat) + 1})`;
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Kano',
  refreshOn: ['state:saved', 'resize'],
  settings: {
    showChart: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showChart' },
  },

  template: 'js/modules/kano/kano.tile.html',

  /**
   * Category distribution, completeness, questionable-answer warning and the
   * Better/Worse scatter config (null when hidden or nothing to plot).
   * @param {{state: object, settings: {showChart: boolean}, i18n: object}} args
   * @returns {object} view model for kano.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const none = (key) => ({ empty: i18n.t(key), bar: [], legend: [], totals: [], warn: null, chart: null });
    const model = State.fromJSON(state);
    if (model.items.length === 0) return none('dashboard.kanoEmpty');
    const { rows, totals } = evaluate(model.items, model.respondents, model.answers, model.options);
    if (rows.every(r => r.n === 0)) return none('dashboard.kanoNoData');

    const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    for (const r of rows) if (r.category) counts[r.category]++;
    const classified = CATEGORIES.reduce((s, c) => s + counts[c], 0);
    const present = CATEGORIES.filter(c => counts[c] > 0);
    const catName = (c) => i18n.t(`modules.kano.cat${c}`);

    let chart = null;
    if (settings.showChart) {
      const { series, refLines } = kanoScatterConfig(rows, {
        importance: model.options.importance,
        sizeLabel: i18n.t('modules.kano.colImportanceMean'),
      });
      if (series.length > 0) {
        chart = {
          series,
          refLines,
          xLabel: i18n.t('modules.kano.chartX'),
          yLabel: i18n.t('modules.kano.chartY'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      }
    }

    return {
      empty: null,
      bar: present.map(c => ({
        cat: c,
        style: `width:${counts[c] / classified * 100}%;background:${catColor(c)}`,
        title: `${catName(c)}: ${counts[c]}`,
      })),
      legend: present.map(c => ({ cat: c, dot: `background:${catColor(c)}`, text: ` ${catName(c)}: ${counts[c]}` })),
      totals: [
        { label: i18n.t('dashboard.kanoCompleteness'), value: pct(totals.completeness) },
        { label: i18n.t('dashboard.kanoItems'), value: String(totals.items) },
        { label: i18n.t('dashboard.kanoRespondents'), value: String(totals.respondents) },
      ],
      warn: totals.qShare > Q_WARN ? i18n.t('modules.kano.warnQShare', { share: pct(totals.qShare) }) : null,
      chart,
    };
  },

  /**
   * Create the scatter in the chart slot. A newer render or dispose
   * invalidates a chart that is still being created.
   * @param {HTMLElement} root  tile body
   * @param {object} vm  view model from viewModel()
   * @param {{chartManager: object}} args
   * @returns {Promise<void>}
   */
  async mount(root, vm, { chartManager }) {
    release(root);
    const token = {};
    charts.set(root, { chart: null, chartManager, token });
    if (!vm.chart || !chartManager) return;

    const slot = root.querySelector('[data-tile-slot="chart"]');
    const chart = await chartManager.create(slot, 'scatter', { ...vm.chart });
    const entry = charts.get(root);
    if (entry?.token !== token) { chartManager.destroy(chart); return; }
    entry.chart = chart;
  },

  /**
   * Release the chart of the host (tile removed or host abandoned).
   * @param {HTMLElement} host
   */
  dispose(host) {
    release(host);
  },
};
