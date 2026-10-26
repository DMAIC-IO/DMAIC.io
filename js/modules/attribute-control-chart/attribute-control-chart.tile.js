/**
 * D.Mike — Attribute control chart dashboard tile (attribute-control-chart.tile.js)
 *
 * "Is the process stable?" — stable/unstable badge, violated points, CL and
 * limits, and a compact control chart through the tile-bound chartManager.
 * One tile per instance; source/copies via the host. Imports only the pure
 * analysis and model files. The markup lives in
 * attribute-control-chart.tile.html. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { getColumnValues } from '../../ui/column-picker.js';
import { windowed } from '../../ui/tile-chart-window.js';
import { State } from './attribute-control-chart-model.js';
import { analyzeState } from './attribute-control-chart-analysis.js';

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

/** Mean of the finite entries of a limit (array for variable limits). */
function meanOf(v) {
  if (!Array.isArray(v)) return v;
  const finite = v.filter(Number.isFinite);
  return finite.length ? finite.reduce((s, x) => s + x, 0) / finite.length : null;
}

/** Four decimals, '—' when missing. */
function fmt(v) {
  return Number.isFinite(v) ? v.toFixed(4) : '—';
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize'],
  settings: {
    lastN: { type: 'number', min: 0, max: 500, step: 1, default: 0, label: 'dashboard.tileSettings.lastN' },
    showChart: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showChart' },
  },

  template: 'js/modules/attribute-control-chart/attribute-control-chart.tile.html',

  /**
   * Stability badge, violation count, CL/limits and the windowed control
   * chart config (null when hidden). Violation indices are a number array.
   * @param {{state: object, settings: {lastN: number, showChart: boolean}, i18n: object,
   *   stateManager: object}} args
   * @returns {object} view model for attribute-control-chart.tile.html
   */
  viewModel({ state, settings, i18n, stateManager }) {
    const none = (key) => ({ empty: i18n.t(key), type: '', badgeModifier: '', badge: '', metric: null, stats: [], chart: null });
    const model = State.fromJSON(state);
    if (!model.defectsRef) return none('dashboard.attrSpcEmpty');
    const a = analyzeState(model, (ref) => getColumnValues(stateManager, ref));
    if (!a) return none('dashboard.attrSpcNoData');

    const { result, ct, violations, valid } = a;
    const violationIndices = new Set(violations.map(v => v.index));
    const stable = violations.length === 0;
    const variable = !!result.variableLimits;

    let chart = null;
    if (settings.showChart) {
      const baselineEnd = model.baselineCount && model.baselineCount < result.values.length ? model.baselineCount : null;
      const win = windowed(result, violationIndices, baselineEnd, settings.lastN);
      chart = {
        ...win,
        violationIndices: [...win.violationIndices],
        usl: null, lsl: null,
        showZones: !variable,
        xLabel: i18n.t('modules.attribute-control-chart.xLabelSample'),
        yLabel: i18n.t(`modules.attribute-control-chart.yLabel_${model.chartTypeId}`),
        showTitle: false, showXLabel: false, showYLabel: false,
        showXTicks: false, showYTicks: false, showLegend: false,
      };
    }

    return {
      empty: null,
      type: ct.id,
      badgeModifier: `dashboard-attr-spc__badge--${stable ? 'ok' : 'bad'}`,
      badge: i18n.t(stable ? 'dashboard.attrSpcStable' : 'dashboard.attrSpcUnstable'),
      metric: {
        modifier: `dashboard-spc__metric--${stable ? 'ok' : 'bad'}`,
        value: String(violationIndices.size),
        label: i18n.t('dashboard.spcViolations'),
        sub: i18n.t('dashboard.spcOf', { total: valid }),
      },
      stats: [
        { label: 'CL', value: fmt(meanOf(result.cl)) },
        { label: variable ? 'UCL̄' : 'UCL', value: fmt(meanOf(result.ucl)) },
        { label: variable ? 'LCL̄' : 'LCL', value: fmt(meanOf(result.lcl)) },
      ],
      chart,
    };
  },

  /**
   * Create the control chart in the chart slot. A newer render or dispose
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
    const chart = await chartManager.create(slot, 'control-chart', {
      ...vm.chart,
      violationIndices: new Set(vm.chart.violationIndices),
    });
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
