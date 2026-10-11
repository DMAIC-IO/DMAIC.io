/**
 * D.Mike — Kano dashboard tile (kano.tile.js)
 *
 * "What do customers expect?" — category distribution of the items,
 * completeness, a questionable-answer warning and a compact Better/Worse
 * scatter through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * model, the engine and the pure chart config. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
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

/** Small label/value stat (SPC tile classes). */
function stat(label, value) {
  return h('div', { class: 'dashboard-spc__stat' },
    h('span', { class: 'dashboard-spc__stat-label' }, label),
    h('span', { class: 'dashboard-spc__stat-value' }, value),
  );
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

  /**
   * Render figures and (optionally) the Better/Worse scatter. A newer render
   * or dispose invalidates a chart that is still being created.
   * @param {HTMLElement} host
   * @param {{state: object, settings: {showChart: boolean}, i18n: object, chartManager: object}} args
   * @returns {Promise<void>}
   */
  async render(host, { state, settings, i18n, chartManager }) {
    release(host);
    const token = {};
    charts.set(host, { chart: null, chartManager, token });

    const model = State.fromJSON(state);
    const empty = (key) => h('p', { class: 'dashboard-area__empty' }, i18n.t(key));
    if (model.items.length === 0) { host.replaceChildren(empty('dashboard.kanoEmpty')); return; }
    const { rows, totals } = evaluate(model.items, model.respondents, model.answers, model.options);
    if (rows.every(r => r.n === 0)) { host.replaceChildren(empty('dashboard.kanoNoData')); return; }

    const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    for (const r of rows) if (r.category) counts[r.category]++;
    const classified = CATEGORIES.reduce((s, c) => s + counts[c], 0);
    const present = CATEGORIES.filter(c => counts[c] > 0);
    const catName = (c) => i18n.t(`modules.kano.cat${c}`);

    const wrap = h('div', { class: 'dashboard-kano' },
      h('div', { class: 'dashboard-fmea__bar' },
        ...present.map(c => h('div', { class: 'dashboard-fmea__bar-seg', 'data-cat': c,
          style: `width:${counts[c] / classified * 100}%;background:${catColor(c)}`, title: `${catName(c)}: ${counts[c]}` }))),
      h('div', { class: 'dashboard-fmea__legend' },
        ...present.map(c => h('span', { class: 'dashboard-fmea__legend-item', 'data-cat': c },
          h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${catColor(c)}` }),
          ` ${catName(c)}: ${counts[c]}`))),
      h('div', { class: 'dashboard-kano__totals' },
        stat(i18n.t('dashboard.kanoCompleteness'), pct(totals.completeness)),
        stat(i18n.t('dashboard.kanoItems'), String(totals.items)),
        stat(i18n.t('dashboard.kanoRespondents'), String(totals.respondents)),
      ),
      totals.qShare > Q_WARN
        ? h('p', { class: 'dashboard-kano__warn' }, i18n.t('modules.kano.warnQShare', { share: pct(totals.qShare) }))
        : null,
    );
    host.replaceChildren(wrap);
    if (!settings.showChart || !chartManager) return;

    const { series, refLines } = kanoScatterConfig(rows, {
      importance: model.options.importance,
      sizeLabel: i18n.t('modules.kano.colImportanceMean'),
    });
    if (series.length === 0) return;

    const plotEl = h('div', { class: 'dashboard-area__plot dashboard-kano__plot' });
    wrap.append(plotEl);
    const chart = await chartManager.create(plotEl, 'scatter', {
      series,
      refLines,
      xLabel: i18n.t('modules.kano.chartX'),
      yLabel: i18n.t('modules.kano.chartY'),
      showTitle: false, showXLabel: false, showYLabel: false,
      showXTicks: false, showYTicks: false, showLegend: false,
    });
    const entry = charts.get(host);
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
