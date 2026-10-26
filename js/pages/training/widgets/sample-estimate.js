/**
 * D.Mike — Course widget "sample estimate" (widgets/sample-estimate.js)
 *
 * Draws samples of n values from a process (PROCESSES) and sets the current
 * sample's x̄ and s against the process's fixed μ and σ. The chart shows the
 * current sample as a histogram, optionally behind the true normal curve and a
 * μ line. An optional list holds the last few samples' x̄ and s — numbers only,
 * never a chart of many means (that is lesson 3's sampling distribution).
 * Nothing is persisted; the number of samples drawn feeds the insight gates
 * through the `training-sim-progress` event.
 *
 * Params (all optional): process (default 'fill-a'), n (default 10),
 * showTruth, history (list length, 0 = off), seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { binValues } from '../populations.js';
import { PROCESSES, drawSample, summarizeValues } from '../processes.js';

/** Batch sizes of the draw buttons. */
export const DRAW_SIZES = [1, 5];
const BINS = 20;
const MU_COLOR = 'var(--color-text-secondary)';
const TRUTH_COLOR = 'var(--color-error)';

/** A fresh seed per mount, as in the other course widgets. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');

/**
 * Alpine component factory (registered as `trainingSampleEstimate`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function sampleEstimateComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.estimate.${key}`, vars);
  // Generator, samples and chart handle stay outside Alpine's reactive proxy.
  let rng = mulberry32(randomSeed());
  let current = [];
  let history = [];
  let root = null;
  let chart = null;
  let destroyed = false;

  return {
    process: 'fill-a',
    n: 10,
    showTruth: false,
    historySize: 0,
    drawSizes: DRAW_SIZES,
    /** Reactive, so the table, history and data-count follow each draw. */
    samplesDrawn: 0,

    /**
     * Initialise from the block's params and create the chart.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     */
    async setup(el, params) {
      root = el;
      const p = params || {};
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      if (PROCESSES[p.process]) this.process = p.process;
      if (Number.isInteger(p.n) && p.n > 1) this.n = p.n;
      this.showTruth = p.showTruth === true;
      this.historySize = Number.isInteger(p.history) && p.history > 0 ? p.history : 0;
      current = [];
      history = [];
      this.samplesDrawn = 0;
      this.report();
      await this.createChart();
    },

    async createChart() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = root.querySelector('.training-estimate__chart');
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

    // ---------- template helpers ----------

    label(key, vars) { return t(key, vars); },
    drawLabel(k) { return t(k === 1 ? 'drawOne' : 'drawMany', { k }); },
    sampleLabel() { return t('sample', { n: this.n }); },
    /** @returns {number[]} values of the current sample */
    currentSample() { return current.slice(); },

    /**
     * Display text of one table cell: mu, sigma (population), mean, sd (sample).
     * @param {string} key
     * @returns {string}
     */
    cell(key) {
      const process = PROCESSES[this.process];
      if (key === 'mu') return fmt(process.mean);
      if (key === 'sigma') return fmt(process.sd);
      // Read the reactive counter so Alpine re-evaluates after each draw.
      if (this.samplesDrawn === 0) return '–';
      const s = summarizeValues(current);
      return fmt(key === 'mean' ? s.mean : s.sd);
    },

    /** Last samples, newest first, as display text. */
    historyRows() {
      if (this.samplesDrawn === 0) return [];
      return history.map((h) => ({ key: h.index, mean: fmt(h.mean), sd: fmt(h.sd) }));
    },

    // ---------- interaction ----------

    /** @param {number} times samples to draw; the last one becomes the current sample */
    draw(times) {
      for (let i = 0; i < times; i++) {
        current = drawSample(this.process, this.n, rng);
        if (this.historySize) {
          const s = summarizeValues(current);
          history.unshift({ index: this.samplesDrawn + i + 1, mean: s.mean, sd: s.sd });
          history = history.slice(0, this.historySize);
        }
      }
      this.samplesDrawn += times;
      if (ctx.chartManager && chart) ctx.chartManager.update(chart, this.chartConfig());
      this.report();
    },

    /** Announce the samples drawn in this mount to the page. */
    report() {
      if (!root) return;
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: this.samplesDrawn, perN: {} },
      }));
    },

    // ---------- chart ----------

    chartConfig() {
      const process = PROCESSES[this.process];
      const refLines = [];
      if (this.showTruth) {
        refLines.push({ dir: 'v', value: process.mean, label: 'μ', showLabel: true, dash: 'dot', width: 2, color: MU_COLOR });
      }
      return {
        title: this.sampleLabel(),
        xLabel: t(`axis.${process.unit}`),
        yLabel: t('density'),
        bins: binValues(current, process.axis, BINS),
        xMin: process.axis[0],
        xMax: process.axis[1],
        xExact: true,
        showLegend: false,
        refLines,
        normalCurves: this.showTruth
          ? [{ mean: process.mean, stdDev: process.sd, label: t('population'), lineStyle: 'dashed', color: TRUTH_COLOR }]
          : [],
      };
    },
  };
}
