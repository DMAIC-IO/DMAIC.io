/**
 * D.Mike — Course widget "normal tails" (widgets/normal-tails.js)
 *
 * Static picture of the standard normal curve with both tails beyond −z and
 * +z shaded, so the lesson text can point at the area that makes up the
 * two-sided p-value. No simulation, nothing persisted.
 *
 * Params (all optional): z (default 1.96, must be positive and finite).
 */

import { twoSidedP } from '../hypothesis.js';
import { numberFormatter } from './number-format.js';

const DEFAULT_Z = 1.96;
const AXIS = 4;
const CURVE_COLOR = 'var(--color-chart-2)';
const TAIL_COLOR = 'var(--color-error)';

/**
 * Alpine component of the normal-tails widget.
 * @param {{i18n: {t: Function, getLanguage?: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function normalTailsComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.tails.${key}`, vars);
  const fmt = numberFormatter(ctx);
  // Chart handle stays outside Alpine's proxy.
  let root = null;
  let chart = null;
  let destroyed = false;

  return {
    z: DEFAULT_Z,

    /**
     * Initialise from the block's params and create the chart.
     * @param {HTMLElement} el widget root
     * @param {{z?: number}} params block params
     */
    async setup(el, params) {
      root = el;
      const z = (params || {}).z;
      this.z = Number.isFinite(z) && z > 0 ? z : DEFAULT_Z;
      await this.createChart();
    },

    async createChart() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = root.querySelector('.training-tails__chart');
      if (!container || destroyed) return;
      const created = await cm.create(container, 'histogram', this.chartConfig());
      if (destroyed) { cm.destroy(created); return; }
      chart = created;
    },

    /** Alpine calls this when the widget leaves the page: release the chart. */
    destroy() {
      destroyed = true;
      if (ctx.chartManager && chart) ctx.chartManager.destroy(chart);
      chart = null;
    },

    /**
     * Legend below the chart: the cut-offs and the shaded share.
     * @returns {string}
     */
    legend() {
      return t('legend', { z: fmt(this.z), share: `${fmt(100 * twoSidedP(this.z), 1)} %` });
    },

    chartConfig() {
      const z = this.z;
      return {
        xLabel: t('axis'),
        // The histogram draws nothing without bins; an empty bin keeps the axes.
        bins: [{ x0: -AXIS, x1: AXIS, count: 0 }],
        xMin: -AXIS,
        xMax: AXIS,
        xExact: true,
        // The widget's own legend explains the shaded areas below the chart.
        showLegend: false,
        refLines: [
          { dir: 'v', value: -z, label: '', color: TAIL_COLOR, width: 2 },
          { dir: 'v', value: z, label: '', color: TAIL_COLOR, width: 2 },
        ],
        normalCurves: [{
          mean: 0,
          stdDev: 1,
          color: CURVE_COLOR,
          label: 'H₀',
          shade: [
            { from: -Infinity, to: -z, color: TAIL_COLOR, key: 'tail' },
            { from: z, to: Infinity, color: TAIL_COLOR, key: 'tail' },
          ],
        }],
      };
    },
  };
}
