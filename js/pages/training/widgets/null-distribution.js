/**
 * D.Mike — Course widget "null distribution" (widgets/null-distribution.js)
 *
 * Simulates machine A set exactly to μ₀ = 500 g: every sample of n values
 * yields one mean x̄, the histogram collects them, and the bins at least as
 * far from μ₀ as the observed mean are highlighted on both sides. The share
 * of such means is the simulated p value; with `showP` the widget also shows
 * the exact two-sided p and the decision at α = 5 %. Switching the observed
 * mean keeps the samples. Nothing is persisted; samples and distinct observed
 * means tried feed the insight gates through `training-sim-progress` as
 * `{count, choices}`.
 *
 * Params (all optional): n (default 10), observedChoices (default [501.6]),
 * showP (default false), seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { PROCESSES, drawSample } from '../processes.js';
import { zStatistic, twoSidedP, isAsFarOut, decide } from '../hypothesis.js';

/** Batch sizes of the draw buttons. */
export const DRAW_SIZES = [1, 10, 100, 1000];
const PROCESS = 'fill-a';
/** Axis and bin layout in g: 40 bins of 0.2 g between 496 and 504. */
const AXIS_MIN = 496;
const AXIS_MAX = 504;
const BIN_WIDTH = 0.2;
const BIN_COUNT = 40;
/** Bin edges rounded to 0.1 g, so 501.6 is an exact edge. */
const EDGES = Array.from({ length: BIN_COUNT + 1 }, (_, k) => Math.round((AXIS_MIN + k * BIN_WIDTH) * 10) / 10);
const EPS = 1e-9;
const OBSERVED_COLOR = 'var(--color-error)';

/** A fresh seed per mount, as in the other course widgets. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const isMean = (v) => typeof v === 'number' && Number.isFinite(v);
const isN = (v) => Number.isInteger(v) && v > 1;

/**
 * Alpine component factory (registered as `trainingNullDistribution`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function nullDistributionComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.nullDist.${key}`, vars);
  const process = PROCESSES[PROCESS];
  // Generator, means and chart handle stay outside Alpine's proxy.
  let rng = mulberry32(randomSeed());
  /** @type {number[]} */
  let means = [];
  /** @type {Set<number>} */
  let tried = new Set();
  let root = null;
  let chart = null;
  let destroyed = false;

  return {
    n: 10,
    observed: 501.6,
    observedChoices: [501.6],
    showP: false,
    drawSizes: DRAW_SIZES,
    /** Reactive: samples drawn in this mount, so cells and data-count follow. */
    samplesDrawn: 0,
    /** Reactive: bumped on every change so the cells re-evaluate. */
    revision: 0,

    /**
     * Initialise from the block's params and create the chart.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     */
    async setup(el, params) {
      root = el;
      const p = params || {};
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      if (isN(p.n)) this.n = p.n;
      if (Array.isArray(p.observedChoices) && p.observedChoices.length && p.observedChoices.every(isMean)) {
        this.observedChoices = p.observedChoices;
      }
      this.showP = p.showP === true;
      this.observed = this.observedChoices.includes(501.6) ? 501.6 : this.observedChoices[0];
      means = [];
      tried = new Set([this.observed]);
      this.samplesDrawn = 0;
      this.report();
      await this.createChart();
    },

    async createChart() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = root.querySelector('.training-null__chart');
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
    drawLabel(k) { return t(k === 1 ? 'drawOne' : 'draw', { k }); },
    /** With `showP` the share is labelled as the simulated p value. */
    shareLabel() { return t(this.showP ? 'shareApprox' : 'share'); },
    observedOptions() { return [...this.observedChoices]; },
    /** @param {number} value */
    observedText(value) { return `${value.toFixed(1)} g`; },

    /** Exact two-sided p of the observed mean. */
    pValue() {
      return twoSidedP(zStatistic(this.observed, process.mean, process.sd, this.n));
    },

    /**
     * Display text of one stat cell: drawn, far, share, p, decision.
     * @param {string} key
     * @returns {string}
     */
    cell(key) {
      // Read the reactive counters so Alpine re-evaluates after each change.
      if (this.samplesDrawn < 0 || this.revision < 0) return '';
      if (key === 'p') return this.pValue().toFixed(3);
      if (key === 'decision') return t(decide(this.pValue()));
      const far = this.farCount();
      if (key === 'drawn') return String(means.length);
      if (key === 'far') return String(far);
      if (key === 'share') return means.length ? `${((100 * far) / means.length).toFixed(1)} %` : '–';
      return '–';
    },

    /** Means of this mount at least as far from μ₀ as the observed one. */
    farCount() {
      let far = 0;
      for (const m of means) if (isAsFarOut(m, process.mean, this.observed)) far++;
      return far;
    },

    // ---------- interaction ----------

    /** @param {number} times samples to draw */
    draw(times) {
      for (let i = 0; i < times; i++) {
        const values = drawSample(PROCESS, this.n, rng);
        means.push(values.reduce((a, b) => a + b, 0) / values.length);
      }
      this.samplesDrawn = means.length;
      this.changed();
    },

    /** @param {number|Event} v observed mean, or the select's change event */
    setObserved(v) {
      const value = Number(v && v.target ? v.target.value : v);
      if (!this.observedChoices.includes(value)) return;
      this.observed = value;
      tried.add(value);
      this.changed();
    },

    /**
     * Test seam: add means directly, e.g. ones beyond the axis.
     * @param {number[]} values
     */
    _pushMeans(values) {
      means.push(...values);
      this.samplesDrawn = means.length;
      this.changed();
    },

    /** Test seam: copy of the simulated means. */
    _means() { return means.slice(); },

    /** Redraw the chart and announce the progress. */
    changed() {
      this.revision++;
      if (ctx.chartManager && chart) ctx.chartManager.update(chart, this.chartConfig());
      this.report();
    },

    /** Announce the samples and the distinct observed means tried. */
    report() {
      if (!root) return;
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: means.length, choices: tried.size },
      }));
    },

    // ---------- chart ----------

    /** Fixed 0.2 g bins; those as far out as the observed mean are highlighted. */
    bins() {
      const counts = new Array(BIN_COUNT).fill(0);
      for (const m of means) {
        if (m < AXIS_MIN || m >= AXIS_MAX) continue;
        let k = Math.floor((m - AXIS_MIN) / BIN_WIDTH);
        // Floating point may put a mean just below an edge into the next bin.
        if (k > 0 && m < EDGES[k]) k--;
        if (k < BIN_COUNT - 1 && m >= EDGES[k + 1]) k++;
        counts[k]++;
      }
      const d = Math.abs(this.observed - process.mean);
      return counts.map((count, k) => {
        const x0 = EDGES[k];
        const x1 = EDGES[k + 1];
        const highlight = x0 >= process.mean + d - EPS || x1 <= process.mean - d + EPS;
        return highlight ? { x0, x1, count, highlight } : { x0, x1, count };
      });
    },

    chartConfig() {
      const mirror = Math.round((2 * process.mean - this.observed) * 10) / 10;
      return {
        xLabel: t('axis'),
        bins: this.bins(),
        xMin: AXIS_MIN,
        xMax: AXIS_MAX,
        xExact: true,
        showLegend: false,
        refLines: [
          { dir: 'v', value: this.observed, label: 'x̄', showLabel: true, color: OBSERVED_COLOR, width: 2 },
          { dir: 'v', value: mirror, label: '', color: OBSERVED_COLOR, width: 2, dash: 'dot' },
        ],
      };
    },
  };
}
