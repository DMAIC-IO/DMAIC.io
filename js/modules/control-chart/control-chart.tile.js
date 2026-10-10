/**
 * D.Mike — SPC dashboard tile (control-chart.tile.js)
 *
 * One tile per control-chart instance (`spc:<instanceId>`). The sparkline
 * follows the tile width, so the tile re-renders on resize. Loaded via the
 * manifest's `loadTile`. Contract: docs/DASHBOARD.md.
 */

import { h, svg } from '../../core/dom.js';
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

  /**
   * @param {HTMLElement} host
   * @param {{state: object, i18n: object, stateManager: object}} args
   */
  render(host, { state, i18n, stateManager }) {
    if (!state || !state.columnRef) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.spcEmpty')));
      return;
    }

    const ct = getChartType(state.chartTypeId || 'i-mr');
    if (!ct) return;

    const rawValues = getColumnValues(stateManager, state.columnRef);
    const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));

    if (values.length < 2) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.spcNoData')));
      return;
    }

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

    const vCount = new Set(violations.map(v => v.index)).size;
    const totalPts = primaryData.values.filter(v => v !== null).length;
    const isStable = vCount === 0;
    const colName = getColumnName(stateManager, state.columnRef) || '?';
    const fmt = (v) => v != null ? v.toFixed(4) : '—';

    const usl = state.usl ?? null;
    const lsl = state.lsl ?? null;
    const hasSpec = usl != null || lsl != null;

    let oosCount = 0;
    if (hasSpec) {
      for (const v of primaryData.values) {
        if (v === null) continue;
        if ((usl != null && v > usl) || (lsl != null && v < lsl)) oosCount++;
      }
    }

    const chartTypeLabel = {
      'i-mr': 'I-MR', 'xbar-r': 'X̄-R', 'xbar-s': 'X̄-S',
    }[ct.id] || ct.id;

    const sparkWidth = host.clientWidth - 16;
    const violationSet = new Set(violations.map(v => v.index));
    const sparkSvg = buildSparkline(primaryData, violationSet, usl, lsl, sparkWidth);

    const stat = (label, value) => h('div', { class: 'dashboard-spc__stat' },
      h('span', { class: 'dashboard-spc__stat-label' }, label),
      h('span', { class: 'dashboard-spc__stat-value' }, value),
    );

    const metrics = h('div', { class: 'dashboard-spc__metrics' });
    metrics.append(
      h('div', { class: `dashboard-spc__metric ${isStable ? 'dashboard-spc__metric--ok' : 'dashboard-spc__metric--bad'}` },
        h('span', { class: 'dashboard-spc__metric-value' }, String(vCount)),
        h('span', { class: 'dashboard-spc__metric-label' }, i18n.t('dashboard.spcViolations')),
        h('span', { class: 'dashboard-spc__metric-sub' }, i18n.t('dashboard.spcOf', { total: totalPts })),
      ),
    );

    if (hasSpec) {
      const oosCls = oosCount === 0 ? '--ok' : '--warn';
      metrics.append(
        h('div', { class: `dashboard-spc__metric dashboard-spc__metric${oosCls}` },
          h('span', { class: 'dashboard-spc__metric-value' }, String(oosCount)),
          h('span', { class: 'dashboard-spc__metric-label' }, i18n.t('dashboard.spcOutOfSpec')),
          h('span', { class: 'dashboard-spc__metric-sub' }, i18n.t('dashboard.spcOf', { total: totalPts })),
        ),
      );
    }

    if (capability) {
      const cpkCls = capability.cpk >= 1.33 ? '--ok' : capability.cpk >= 1.0 ? '--warn' : '--bad';
      metrics.append(
        h('div', { class: `dashboard-spc__metric dashboard-spc__metric${cpkCls}` },
          h('span', { class: 'dashboard-spc__metric-value' }, capability.cpk.toFixed(3)),
          h('span', { class: 'dashboard-spc__metric-label' }, 'Cpk'),
          capability.cp ? h('span', { class: 'dashboard-spc__metric-sub' }, `Cp = ${capability.cp.toFixed(3)}`) : null,
        ),
      );
    }

    const spark = h('div', { class: 'dashboard-spc__spark' });
    if (sparkSvg) spark.append(sparkSvg);

    host.replaceChildren(
      h('div', { class: 'dashboard-spc' },
        h('div', { class: 'dashboard-spc__header' },
          h('span', { class: 'dashboard-spc__type' }, chartTypeLabel),
          h('span', { class: 'dashboard-spc__col' }, colName),
        ),
        spark,
        h('div', { class: 'dashboard-spc__stats' },
          stat('CL', fmt(primaryData.cl)),
          stat('UCL', fmt(primaryData.ucl)),
          stat('LCL', fmt(primaryData.lcl)),
          stat('σ̂', fmt(primaryData.sigma)),
        ),
        metrics,
      ),
    );
  },
};
