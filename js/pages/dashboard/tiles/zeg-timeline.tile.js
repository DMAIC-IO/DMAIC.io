/**
 * D.Mike — ZEG timeline host tile (tiles/zeg-timeline.tile.js)
 *
 * Goal achievement per phase over time, from the project-level
 * phaseAchievementHistory. Belongs to no module; always loaded via
 * HOST_TILES. Contract: docs/DASHBOARD.md. Offers a link to the ZEG
 * worksheet (router action verb `zeg-sheet`). The markup lives in
 * zeg-timeline.tile.html.
 */

import { getPhaseIds } from '../../../core/cycles/cycles.js';
import { findZegSheet } from '../../../core/zeg-sheet/zeg-sheet.js';

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

/**
 * Resolve the CSS colour of a phase.
 * @param {string} phase
 * @returns {string}
 */
function phaseColor(phase) {
  const css = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-phase-${phase}`).trim();
  return css || '#888';
}

/**
 * Chart series per methodology phase.
 * @param {object} stateManager
 * @param {{t: function}} i18n
 * @returns {{series: object[], empty: boolean}}
 */
export function buildSeries(stateManager, i18n) {
  const histories = {};
  let hasAny = false;
  const methodPhases = getPhaseIds(stateManager.getProjectCycle());
  for (const phase of methodPhases) {
    const hist = stateManager.get(`phaseAchievementHistory.${phase}`) || [];
    histories[phase] = hist;
    if (hist.length) hasAny = true;
  }
  if (!hasAny) return { series: [], empty: true };

  const series = methodPhases.map(phase => {
    const hist = histories[phase];
    const color = phaseColor(phase);
    return {
      name: i18n.t(`phases.${phase}`),
      x: hist.map(e => e.t),
      y: hist.map(e => e.v),
      color,
      markerSize: hist.length === 1 ? 5 : 3,
      connectLine: { show: true, foreground: true, width: 2, color, dash: 'solid' },
      visible: hist.length > 0,
    };
  });
  return { series, empty: series.every(ser => ser.x.length === 0) };
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 3, minH: 6 },
  refreshOn: ['phase:achievement-changed'],
  settings: {
    showLegend: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' },
  },

  /**
   * The timeline is a singleton project-level tile.
   * @param {{i18n: {t: function}}} ctx
   * @returns {Array<{tileId: string, instanceId: null, title: string}>}
   */
  enumerate(ctx) {
    return [{ tileId: 'zeg-timeline', instanceId: null, title: ctx.i18n.t('dashboard.zegTimeline') }];
  },

  template: 'js/pages/dashboard/tiles/zeg-timeline.tile.html',

  /**
   * Timeline chart config and the link to the ZEG worksheet (router action
   * verb `zeg-sheet`). The link is omitted in a read-only project that has
   * no ZEG sheet yet, since none could be created.
   * @param {{settings: {showLegend: boolean}, i18n: object, stateManager: object}} args
   * @returns {{empty: string|null, showEdit: boolean, editLabel: string, chart: object|null}}
   */
  viewModel({ settings, i18n, stateManager }) {
    const { series, empty } = buildSeries(stateManager, i18n);
    return {
      empty: empty ? i18n.t('dashboard.noHistory') : null,
      showEdit: !(stateManager.isCompleted?.() && !findZegSheet(stateManager)),
      editLabel: i18n.t('dashboard.zegSheet.edit'),
      chart: empty ? null : {
        title: '',
        xLabel: i18n.t('dashboard.xLabel'),
        yLabel: i18n.t('dashboard.yLabel'),
        showLegend: settings.showLegend,
        series,
        yMin: 0,
        yMax: 100,
      },
    };
  },

  /**
   * Create the timeline in the chart slot, with a localized date tick format.
   * A newer render or dispose invalidates a chart that is still being created.
   * @param {HTMLElement} root  tile body
   * @param {object} vm  view model from viewModel()
   * @param {{i18n: object, chartManager: object}} args
   * @returns {Promise<void>}
   */
  async mount(root, vm, { i18n, chartManager }) {
    release(root);
    const token = {};
    charts.set(root, { chart: null, chartManager, token });
    if (!vm.chart || !chartManager) return;

    const dateFmt = (ts) => new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
    const slot = root.querySelector('[data-tile-slot="chart"]');
    const chart = await chartManager.create(slot, 'scatter', { ...vm.chart, xTickFormat: dateFmt });
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
