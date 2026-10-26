/**
 * D.Mike — SPC dashboard tile (control-chart.tile.js)
 *
 * One tile per control-chart instance (`spc:<instanceId>`): CL/limits/sigma,
 * violation / out-of-spec / Cpk metrics and a compact control chart through
 * the tile-bound chartManager. The chart follows the tile width, so the tile
 * re-renders on resize. Loaded via the manifest's `loadTile`. The markup
 * lives in control-chart.tile.html. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { getChartType, evaluateNelsonRules, computeCapability, capabilitySigma, DEFAULT_ENABLED_RULES } from '../../engines/control-chart-engine.js';
import { getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { windowed } from '../../ui/tile-chart-window.js';

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

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize'],
  settings: {
    lastN: { type: 'number', min: 0, max: 500, step: 1, default: 0, label: 'dashboard.tileSettings.lastN' },
    showChart: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showChart' },
  },

  /**
   * One tile per control-chart instance.
   * @param {{i18n: object, findInstances: function}} ctx
   * @returns {Array<{tileId: string, instanceId: string, title: string}>}
   */
  enumerate(ctx) {
    return ctx.findInstances('control-chart').map(inst => ({
      tileId: `spc:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: `SPC — ${inst.customName || ctx.i18n.t('modules.control-chart.name')}`,
    }));
  },

  template: 'js/modules/control-chart/control-chart.tile.html',

  /**
   * Chart type, column, CL/limits/sigma, violation / out-of-spec / Cpk
   * metrics over all points and the windowed control chart config (null
   * when hidden). Violation indices are a number array.
   * @param {{state: object, settings: {lastN: number, showChart: boolean}, i18n: object, stateManager: object}} args
   * @returns {object} view model for control-chart.tile.html
   */
  viewModel({ state, settings, i18n, stateManager }) {
    const none = (key) => ({ empty: i18n.t(key), typeLabel: '', colName: '', stats: [], metrics: [], chart: null });
    if (!state || !state.columnRef) return none('dashboard.spcEmpty');

    const ct = getChartType(state.chartTypeId || 'i-mr');
    if (!ct) return none('dashboard.spcNoData');

    const rawValues = getColumnValues(stateManager, state.columnRef);
    const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (values.length < 2) return none('dashboard.spcNoData');

    const n = state.subgroupSize || 1;
    const baselineEnd = state.baselineCount || values.length;
    const result = ct.compute(values, n, baselineEnd);

    const primary = ct.subcharts[0];
    const primaryData = result.subcharts[primary.id];
    const enabledRules = state.enabledRules || [...DEFAULT_ENABLED_RULES];
    const violations = evaluateNelsonRules(
      primaryData.values, primaryData.cl, primaryData.sigma, enabledRules,
    );
    const capability = computeCapability(
      primaryData.values.filter(v => v !== null),
      primaryData.cl, capabilitySigma(state.chartTypeId || 'i-mr', primaryData.sigma, n),
      state.usl ?? null, state.lsl ?? null,
    );

    const violationSet = new Set(violations.map(v => v.index));
    const totalPts = primaryData.values.filter(v => v !== null).length;
    const fmt = (v) => v != null ? v.toFixed(4) : '—';
    const of = i18n.t('dashboard.spcOf', { total: totalPts });

    const usl = state.usl ?? null;
    const lsl = state.lsl ?? null;
    const hasSpec = usl != null || lsl != null;

    const metrics = [{
      modifier: `dashboard-spc__metric--${violationSet.size === 0 ? 'ok' : 'bad'}`,
      value: String(violationSet.size),
      label: i18n.t('dashboard.spcViolations'),
      sub: of,
    }];
    if (hasSpec) {
      let oosCount = 0;
      for (const v of primaryData.values) {
        if (v === null) continue;
        if ((usl != null && v > usl) || (lsl != null && v < lsl)) oosCount++;
      }
      metrics.push({
        modifier: `dashboard-spc__metric--${oosCount === 0 ? 'ok' : 'warn'}`,
        value: String(oosCount),
        label: i18n.t('dashboard.spcOutOfSpec'),
        sub: of,
      });
    }
    if (capability) {
      const cpkMod = capability.cpk >= 1.33 ? 'ok' : capability.cpk >= 1.0 ? 'warn' : 'bad';
      metrics.push({
        modifier: `dashboard-spc__metric--${cpkMod}`,
        value: capability.cpk.toFixed(3),
        label: 'Cpk',
        sub: capability.cp ? `Cp = ${capability.cp.toFixed(3)}` : null,
      });
    }

    let chart = null;
    if (settings.showChart) {
      // The baseline counts observations; subgroup charts plot one point per subgroup.
      const blEnd = state.baselineCount
        ? (ct.id === 'i-mr' ? state.baselineCount : Math.ceil(state.baselineCount / n))
        : null;
      const win = windowed(primaryData, violationSet,
        blEnd != null && blEnd < primaryData.values.length ? blEnd : null, settings.lastN);
      chart = {
        ...win,
        violationIndices: [...win.violationIndices],
        usl, lsl,
        showZones: true,
        xLabel: i18n.t('modules.control-chart.xLabelSample'),
        yLabel: primary.yLabel?.[i18n.language] || primary.yLabel?.de || '',
        showTitle: false, showXLabel: false, showYLabel: false,
        showXTicks: false, showYTicks: false, showLegend: false,
      };
    }

    return {
      empty: null,
      typeLabel: { 'i-mr': 'I-MR', 'xbar-r': 'X̄-R', 'xbar-s': 'X̄-S' }[ct.id] || ct.id,
      colName: getColumnName(stateManager, state.columnRef) || '?',
      stats: [
        { label: 'CL', value: fmt(primaryData.cl) },
        { label: 'UCL', value: fmt(primaryData.ucl) },
        { label: 'LCL', value: fmt(primaryData.lcl) },
        { label: 'σ̂', value: fmt(primaryData.sigma) },
      ],
      metrics,
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
