/**
 * D.Mike — Kano dashboard tile (kano.tile.js)
 *
 * "What do customers expect?" — category distribution of the items,
 * completeness, a questionable-answer warning and a compact Better/Worse
 * scatter through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * model, the engine and the pure chart config. The markup lives in
 * kano.tile.html. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { State } from './kano-model.js';
import { evaluate, CATEGORIES, Q_WARN } from '../../engines/kano-engine.js';
import { kanoScatterConfig } from './kano-chart.js';
import { showChart, chartSlot, distribution } from '../../ui/tile-kit.js';

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
    showChart: showChart(),
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
    const catName = (c) => i18n.t(`modules.kano.cat${c}`);
    const { segments, legend } = distribution(CATEGORIES.map(c => ({ key: c, label: catName(c), count: counts[c], color: catColor(c) })));

    let chart = null;
    if (settings.showChart) {
      const { series, moduleRefLines } = kanoScatterConfig(rows, {
        importance: model.options.importance,
        sizeLabel: i18n.t('modules.kano.colImportanceMean'),
      });
      if (series.length > 0) {
        chart = {
          series,
          moduleRefLines,
          xLabel: i18n.t('modules.kano.chartX'),
          yLabel: i18n.t('modules.kano.chartY'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      }
    }

    return {
      empty: null,
      bar: segments,
      legend,
      totals: [
        { label: i18n.t('dashboard.kanoCompleteness'), value: pct(totals.completeness) },
        { label: i18n.t('dashboard.kanoItems'), value: String(totals.items) },
        { label: i18n.t('dashboard.kanoRespondents'), value: String(totals.respondents) },
      ],
      warn: totals.qShare > Q_WARN ? i18n.t('modules.kano.warnQShare', { share: pct(totals.qShare) }) : null,
      chart,
    };
  },

  ...chartSlot('scatter'),
};
