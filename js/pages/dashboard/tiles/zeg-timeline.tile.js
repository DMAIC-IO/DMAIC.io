/**
 * D.Mike — ZEG timeline host tile (tiles/zeg-timeline.tile.js)
 *
 * Goal achievement per phase over time, from the project-level
 * phaseAchievementHistory. Belongs to no module; always loaded via
 * HOST_TILES. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../../core/dom.js';
import { getPhaseIds } from '../../../core/cycles/cycles.js';

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

  enumerate(ctx) {
    return [{ tileId: 'zeg-timeline', instanceId: null, title: ctx.i18n.t('dashboard.zegTimeline') }];
  },

  async render(host, { settings, i18n, chartManager, stateManager }) {
    release(host);
    const token = {};
    charts.set(host, { chart: null, chartManager, token });

    const { series, empty } = buildSeries(stateManager, i18n);
    if (empty) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.noHistory')));
      return;
    }
    const plotEl = h('div', { class: 'dashboard-area__plot', 'data-ref': 'plot' });
    host.replaceChildren(plotEl);

    const dateFmt = (ts) => new Date(ts).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
    const chart = await chartManager.create(plotEl, 'scatter', {
      title: '',
      xLabel: i18n.t('dashboard.xLabel'),
      yLabel: i18n.t('dashboard.yLabel'),
      showLegend: settings.showLegend,
      series,
      yMin: 0,
      yMax: 100,
      xTickFormat: dateFmt,
    });
    const entry = charts.get(host);
    if (entry?.token !== token) { chartManager.destroy(chart); return; }
    entry.chart = chart;
  },

  dispose(host) {
    release(host);
  },
};
