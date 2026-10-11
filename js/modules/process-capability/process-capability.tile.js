/**
 * D.Mike — Process capability dashboard tile (process-capability.tile.js)
 *
 * "Is the process capable?" — Cpk traffic light, Ppk, PPM, n and a compact
 * histogram through the tile-bound chartManager (editor edits persist per
 * tile). One tile per instance; source/copies via the host. Imports only the
 * pure analysis, model and format files. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { getColumnValues } from '../../ui/column-picker.js';
import { State } from './process-capability-model.js';
import { analyzeState, formatHint, specRefLines } from './process-capability-analysis.js';
import { fmt } from './process-capability-format.js';

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

/** Key-figure box (SPC tile classes). */
function metric(modifier, value, label, sub) {
  return h('div', { class: `dashboard-spc__metric${modifier ? ` dashboard-spc__metric--${modifier}` : ''}` },
    h('span', { class: 'dashboard-spc__metric-value' }, value),
    h('span', { class: 'dashboard-spc__metric-label' }, label),
    sub ? h('span', { class: 'dashboard-spc__metric-sub' }, sub) : null,
  );
}

/** Small label/value stat (SPC tile classes). */
function stat(label, value) {
  return h('div', { class: 'dashboard-spc__stat' },
    h('span', { class: 'dashboard-spc__stat-label' }, label),
    h('span', { class: 'dashboard-spc__stat-value' }, value),
  );
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

  /**
   * Render figures and (optionally) the histogram. A newer render or dispose
   * invalidates a chart that is still being created.
   * @param {HTMLElement} host
   * @param {{state: object, settings: {ppmBasis: string, showChart: boolean}, i18n: object,
   *   chartManager: object, stateManager: object}} args
   * @returns {Promise<void>}
   */
  async render(host, { state, settings, i18n, chartManager, stateManager }) {
    release(host);
    const token = {};
    charts.set(host, { chart: null, chartManager, token });

    const t = (key, params) => i18n.t(`modules.process-capability.${key}`, params);
    const a = analyzeState(State.fromJSON(state), (ref) => getColumnValues(stateManager, ref));
    const empty = (key) => h('p', { class: 'dashboard-area__empty' }, i18n.t(key));
    const hintText = formatHint(a.hint, t);
    const hint = hintText ? h('p', { class: 'dashboard-capability__hint' }, hintText) : null;

    if (a.empty) { host.replaceChildren(empty('dashboard.capabilityEmpty')); return; }
    if (!a.result) { host.replaceChildren(...[empty('dashboard.capabilityNoData'), hint].filter(Boolean)); return; }

    const r = a.result;
    const wrap = h('div', { class: 'dashboard-capability' },
      h('div', { class: 'dashboard-spc__metrics' },
        metric(CPK_MODIFIER[r.cpkStatus] || 'warn', fmt(r.Cpk, 2), 'Cpk', r.Cp != null ? `Cp = ${fmt(r.Cp, 2)}` : null),
        metric('', fmt(r.Ppk, 2), 'Ppk'),
      ),
      h('div', { class: 'dashboard-capability__stats' },
        stat(i18n.t('dashboard.capabilityPpm'), ppmText(r[PPM_FIELD[settings.ppmBasis]])),
        stat('n', String(r.n)),
      ),
      hint,
    );
    host.replaceChildren(wrap);
    if (!settings.showChart || !chartManager) return;

    const plotEl = h('div', { class: 'dashboard-area__plot dashboard-capability__plot' });
    wrap.append(plotEl);
    const chart = await chartManager.create(plotEl, 'histogram', {
      data: a.values,
      binMethod: 'sturges',
      showNormalCurve: true,
      barColor: 'var(--color-accent)',
      normalCurveColor: 'var(--color-info)',
      refLines: specRefLines(r),
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
