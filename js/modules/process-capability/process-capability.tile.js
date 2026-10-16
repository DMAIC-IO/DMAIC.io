/**
 * D.Mike — Process capability dashboard tile (process-capability.tile.js)
 *
 * "Is the process capable?" — Cpk traffic light, Ppk, PPM, n and a compact
 * histogram through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * pure analysis, model and format files. The markup lives in
 * process-capability.tile.html. Contract: docs/DASHBOARD.md.
 */

import { getColumnValues } from '../../ui/column-picker.js';
import { State } from './process-capability-model.js';
import { analyzeState, formatHint, specRefLines } from './process-capability-analysis.js';
import { fmt as formatNumber } from './process-capability-format.js';

/** host -> { chart, chartManager, token } of the latest render. */
const charts = new WeakMap();

/** ppmBasis setting → engine result field. */
const PPM_FIELD = { overall: 'ppmTotal', within: 'ppmWithinTotal', observed: 'ppmObservedTotal' };

/** Engine cpkStatus → SPC metric modifier. */
const CPK_MODIFIER = { pass: 'ok', warn: 'warn', fail: 'bad' };

/**
 * Destroy the chart of the latest render in a host and forget it.
 * @param {HTMLElement} host
 */
function release(host) {
  const entry = charts.get(host);
  if (entry?.chart) entry.chartManager.destroy(entry.chart);
  charts.delete(host);
}

/** Fixed decimals, '—' when missing or not finite (e.g. Cp with a within-sigma of 0). */
function fmt(v, d) {
  return Number.isFinite(v) ? formatNumber(v, d) : '—';
}

/** PPM as a whole number, '—' when not finite. */
function ppmText(v) {
  return Number.isFinite(v) ? String(Math.round(v)) : '—';
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Cpk',
  refreshOn: ['state:saved', 'resize'],
  settings: {
    ppmBasis: {
      type: 'select', options: ['overall', 'within', 'observed'], default: 'overall',
      label: 'dashboard.tileSettings.ppmBasis',
      optionLabels: {
        overall: 'dashboard.tileSettings.ppmOverall',
        within: 'dashboard.tileSettings.ppmWithin',
        observed: 'dashboard.tileSettings.ppmObserved',
      },
    },
    showChart: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showChart' },
  },

  template: 'js/modules/process-capability/process-capability.tile.html',

  /**
   * Cpk traffic light, Ppk, PPM, n, the analysis hint and the histogram
   * config (null when hidden).
   * @param {{state: object, settings: {ppmBasis: string, showChart: boolean}, i18n: object,
   *   stateManager: object}} args
   * @returns {object} view model for process-capability.tile.html
   */
  viewModel({ state, settings, i18n, stateManager }) {
    const t = (key, params) => i18n.t(`modules.process-capability.${key}`, params);
    const a = analyzeState(State.fromJSON(state), (ref) => getColumnValues(stateManager, ref),
      { defaultConfidence: stateManager?.get?.('settings.confidenceLevel') ?? 95 });
    const hint = formatHint(a.hint, t) || null;
    const none = (key, hintText) => ({ empty: i18n.t(key), hint: hintText, metrics: [], stats: [], chart: null });

    if (a.empty) return none('dashboard.capabilityEmpty', null);
    if (!a.result) return none('dashboard.capabilityNoData', hint);

    const r = a.result;
    return {
      empty: null,
      hint,
      metrics: [
        { modifier: `dashboard-spc__metric--${CPK_MODIFIER[r.cpkStatus] || 'warn'}`, value: fmt(r.Cpk, 2), label: 'Cpk',
          sub: r.Cp != null ? `Cp = ${fmt(r.Cp, 2)}` : null },
        { modifier: '', value: fmt(r.Ppk, 2), label: 'Ppk', sub: null },
      ],
      stats: [
        { label: i18n.t('dashboard.capabilityPpm'), value: ppmText(r[PPM_FIELD[settings.ppmBasis]]) },
        { label: 'n', value: String(r.n) },
      ],
      chart: settings.showChart
        ? {
          data: a.values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          refLines: specRefLines(r),
          xLabel: i18n.t('modules.histogram.xLabel'),
          yLabel: i18n.t('modules.histogram.yLabel'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        }
        : null,
    };
  },

  /**
   * Create the histogram in the chart slot. A newer render or dispose
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
    const chart = await chartManager.create(slot, 'histogram', { ...vm.chart });
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
