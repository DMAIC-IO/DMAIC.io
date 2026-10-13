/**
 * D.Mike — Attribute control chart dashboard tile (attribute-control-chart.tile.js)
 *
 * "Is the process stable?" — stable/unstable badge, violated points, CL and
 * limits, and a compact control chart through the tile-bound chartManager.
 * One tile per instance; source/copies via the host. Imports only the pure
 * analysis and model files. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { getColumnValues } from '../../ui/column-picker.js';
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

/** Small label/value stat (SPC tile classes). */
function stat(label, value) {
  return h('div', { class: 'dashboard-spc__stat' },
    h('span', { class: 'dashboard-spc__stat-label' }, label),
    h('span', { class: 'dashboard-spc__stat-value' }, value),
  );
}

/**
 * Chart data for the last `lastN` points (0 = all): series and limit arrays
 * are cut, violation indices and the baseline end shifted into the window.
 * @param {object} result - engine result
 * @param {Set<number>} violationIndices
 * @param {number|null} baselineEnd
 * @param {number} lastN
 * `xOffset` is the number of points cut off in front, so the chart keeps the
 * real sample numbers.
 * @returns {{values: number[], cl: any, ucl: any, lcl: any, sigma: any, violationIndices: Set<number>, baselineEnd: number|null, xOffset: number}}
 */
export function windowed(result, violationIndices, baselineEnd, lastN) {
  const offset = lastN > 0 ? Math.max(0, result.values.length - lastN) : 0;
  const cut = (v) => (Array.isArray(v) ? v.slice(offset) : v);
  const shifted = new Set([...violationIndices].filter(i => i >= offset).map(i => i - offset));
  const end = baselineEnd != null && baselineEnd - offset > 0 ? baselineEnd - offset : null;
  return {
    values: cut(result.values), cl: cut(result.cl), ucl: cut(result.ucl), lcl: cut(result.lcl), sigma: cut(result.sigma),
    violationIndices: shifted, baselineEnd: end, xOffset: offset,
  };
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
   * Render figures and (optionally) the control chart. A newer render or
   * dispose invalidates a chart that is still being created.
   * @param {HTMLElement} host
   * @param {{state: object, settings: {lastN: number, showChart: boolean}, i18n: object,
   *   chartManager: object, stateManager: object}} args
   * @returns {Promise<void>}
   */
  async render(host, { state, settings, i18n, chartManager, stateManager }) {
    release(host);
    const token = {};
    charts.set(host, { chart: null, chartManager, token });

    const model = State.fromJSON(state);
    const empty = (key) => h('p', { class: 'dashboard-area__empty' }, i18n.t(key));
    if (!model.defectsRef) { host.replaceChildren(empty('dashboard.attrSpcEmpty')); return; }
    const a = analyzeState(model, (ref) => getColumnValues(stateManager, ref));
    if (!a) { host.replaceChildren(empty('dashboard.attrSpcNoData')); return; }

    const { result, ct, violations, valid } = a;
    const violationIndices = new Set(violations.map(v => v.index));
    const stable = violations.length === 0;
    const variable = !!result.variableLimits;

    const wrap = h('div', { class: 'dashboard-attr-spc' },
      h('div', { class: 'dashboard-spc__header' },
        h('span', { class: 'dashboard-spc__type dashboard-attr-spc__type' }, ct.id),
        h('span', { class: `dashboard-attr-spc__badge dashboard-attr-spc__badge--${stable ? 'ok' : 'bad'}` },
          i18n.t(stable ? 'dashboard.attrSpcStable' : 'dashboard.attrSpcUnstable')),
      ),
      h('div', { class: 'dashboard-spc__metrics' },
        h('div', { class: `dashboard-spc__metric dashboard-spc__metric--${stable ? 'ok' : 'bad'}` },
          h('span', { class: 'dashboard-spc__metric-value' }, String(violationIndices.size)),
          h('span', { class: 'dashboard-spc__metric-label' }, i18n.t('dashboard.spcViolations')),
          h('span', { class: 'dashboard-spc__metric-sub' }, i18n.t('dashboard.spcOf', { total: valid })),
        ),
      ),
      h('div', { class: 'dashboard-spc__stats dashboard-attr-spc__stats' },
        stat('CL', fmt(meanOf(result.cl))),
        stat(variable ? 'UCL̄' : 'UCL', fmt(meanOf(result.ucl))),
        stat(variable ? 'LCL̄' : 'LCL', fmt(meanOf(result.lcl))),
      ),
    );
    host.replaceChildren(wrap);
    if (!settings.showChart || !chartManager) return;

    const baselineEnd = model.baselineCount && model.baselineCount < result.values.length ? model.baselineCount : null;
    const win = windowed(result, violationIndices, baselineEnd, settings.lastN);
    const plotEl = h('div', { class: 'dashboard-area__plot dashboard-attr-spc__plot' });
    wrap.append(plotEl);
    const chart = await chartManager.create(plotEl, 'control-chart', {
      ...win,
      usl: null, lsl: null,
      showZones: !variable,
      xLabel: i18n.t('modules.attribute-control-chart.xLabelSample'),
      yLabel: i18n.t(`modules.attribute-control-chart.yLabel_${model.chartTypeId}`),
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
