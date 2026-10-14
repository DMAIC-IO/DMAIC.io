/**
 * D.Mike — SPC dashboard tile (control-chart.tile.js)
 *
 * One tile per control-chart instance (`spc:<instanceId>`). The sparkline
 * follows the tile width, so the tile re-renders on resize. Loaded via the
 * manifest's `loadTile`. The markup lives in control-chart.tile.html; the
 * sparkline is drawn in mount(). Contract: docs/DASHBOARD.md.
 */

import { svg } from '../../core/dom.js';
import { getChartType, evaluateNelsonRules, computeCapability, capabilitySigma, DEFAULT_ENABLED_RULES } from '../../engines/control-chart-engine.js';
import { getColumnValues, getColumnName } from '../../ui/column-picker.js';

/**
 * Sparkline of the primary subchart; null with fewer than two points.
 * @param {{values: Array<number|null>, lcl: number, ucl: number, cl: number, sigma: number}} scData
 * @param {Set<number>} violationSet  indices with Nelson violations
 * @param {number|null} usl
 * @param {number|null} lsl
 * @param {number} width  pixel width (0/undefined falls back to 320)
 * @returns {SVGElement|null}
 */
function buildSparkline(scData, violationSet, usl, lsl, width) {
  const W = width || 320, H = 160, PAD_X = 2, PAD_Y = 6;
  const pts = scData.values.filter(v => v !== null);
  if (pts.length < 2) return null;

  const extents = [scData.lcl, scData.ucl, ...pts];
  if (usl != null) extents.push(usl);
  if (lsl != null) extents.push(lsl);
  const yMin = Math.min(...extents) - scData.sigma * 0.3;
  const yMax = Math.max(...extents) + scData.sigma * 0.3;
  const yRange = yMax - yMin || 1;

  const sx = (i) => PAD_X + (i / (scData.values.length - 1)) * (W - 2 * PAD_X);
  const sy = (v) => PAD_Y + (1 - (v - yMin) / yRange) * (H - 2 * PAD_Y);

  const uclY = sy(scData.ucl), lclY = sy(scData.lcl), clY = sy(scData.cl);
  const kids = [
    svg('rect', { x: PAD_X, y: uclY, width: W - 2 * PAD_X, height: lclY - uclY,
      fill: 'var(--color-success)', opacity: 0.06, rx: 2 }),
    svg('line', { x1: PAD_X, y1: uclY, x2: W - PAD_X, y2: uclY,
      stroke: 'var(--color-error)', 'stroke-width': 0.8, 'stroke-dasharray': '4,3', opacity: 0.6 }),
    svg('line', { x1: PAD_X, y1: lclY, x2: W - PAD_X, y2: lclY,
      stroke: 'var(--color-error)', 'stroke-width': 0.8, 'stroke-dasharray': '4,3', opacity: 0.6 }),
    svg('line', { x1: PAD_X, y1: clY, x2: W - PAD_X, y2: clY,
      stroke: 'var(--color-accent)', 'stroke-width': 0.8, opacity: 0.5 }),
  ];

  if (usl != null) {
    const uslY = sy(usl);
    kids.push(svg('line', { x1: PAD_X, y1: uslY, x2: W - PAD_X, y2: uslY,
      stroke: 'var(--color-warning)', 'stroke-width': 1, opacity: 0.7 }));
  }
  if (lsl != null) {
    const lslY = sy(lsl);
    kids.push(svg('line', { x1: PAD_X, y1: lslY, x2: W - PAD_X, y2: lslY,
      stroke: 'var(--color-warning)', 'stroke-width': 1, opacity: 0.7 }));
  }

  const polyPts = [];
  for (let i = 0; i < scData.values.length; i++) {
    if (scData.values[i] === null) continue;
    polyPts.push(`${sx(i).toFixed(1)},${sy(scData.values[i]).toFixed(1)}`);
  }
  kids.push(svg('polyline', { points: polyPts.join(' '), fill: 'none',
    stroke: 'var(--color-text-secondary)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));

  for (let i = 0; i < scData.values.length; i++) {
    if (scData.values[i] === null) continue;
    const v = scData.values[i];
    const isNelson = violationSet.has(i);
    const isOos = (usl != null && v > usl) || (lsl != null && v < lsl);
    if (!isNelson && !isOos) continue;
    const color = isNelson ? 'var(--color-error)' : 'var(--color-warning)';
    kids.push(svg('circle', { cx: sx(i).toFixed(1), cy: sy(v).toFixed(1), r: 2.5, fill: color }));
  }

  return svg('svg', { class: 'dashboard-spc__sparkline', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, kids);
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'SPC',
  refreshOn: ['state:saved', 'resize'],

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
   * metrics and the data the sparkline is drawn from.
   * @param {{state: object, i18n: object, stateManager: object}} args
   * @returns {object} view model for control-chart.tile.html
   */
  viewModel({ state, i18n, stateManager }) {
    const none = (key) => ({ empty: i18n.t(key), typeLabel: '', colName: '', stats: [], metrics: [], spark: null });
    if (!state || !state.columnRef) return none('dashboard.spcEmpty');

    const ct = getChartType(state.chartTypeId || 'i-mr');
    if (!ct) return none('dashboard.spcNoData');

    const rawValues = getColumnValues(stateManager, state.columnRef);
    const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (values.length < 2) return none('dashboard.spcNoData');

    const n = state.subgroupSize || 1;
    const baselineEnd = state.baselineCount || values.length;
    const result = ct.compute(values, n, baselineEnd);

    const primaryId = ct.subcharts[0].id;
    const primaryData = result.subcharts[primaryId];
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
      spark: {
        values: primaryData.values,
        cl: primaryData.cl, ucl: primaryData.ucl, lcl: primaryData.lcl, sigma: primaryData.sigma,
        violations: [...violationSet],
        usl, lsl,
      },
    };
  },

  /**
   * Draw the sparkline into the spark slot; it follows the tile width.
   * @param {HTMLElement} root  tile body
   * @param {object} vm  view model from viewModel()
   */
  mount(root, vm) {
    if (vm.empty || !vm.spark) return;
    const { spark } = vm;
    const sparkSvg = buildSparkline(spark, new Set(spark.violations), spark.usl, spark.lsl, root.clientWidth - 16);
    if (sparkSvg) root.querySelector('[data-tile-slot="spark"]').append(sparkSvg);
  },
};
