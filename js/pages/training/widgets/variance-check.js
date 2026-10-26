/**
 * D.Mike — Course widget "variance check" (widgets/variance-check.js)
 *
 * Draws many small samples from a process and computes each sample's variance
 * twice: dividing by n and by n − 1. A table shows the latest sample, the
 * running average of both variances over all samples and the process's σ² as
 * the reference row. No chart: a histogram of the variances would be lesson
 * 3's sampling distribution. Nothing is persisted; the number of samples drawn
 * feeds the insight gates through the `training-sim-progress` event.
 *
 * Params (all optional): process (default 'fill-a'), n (default 3), seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { PROCESSES, drawSample, sampleVariances } from '../processes.js';

/** Batch sizes of the draw buttons. */
export const DRAW_SIZES = [1, 10, 100, 1000];

/** A fresh seed per mount, as in the other course widgets. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');

/**
 * Alpine component factory (registered as `trainingVarianceCheck`).
 * @param {{i18n: {t: Function}}} ctx page context
 * @returns {object} Alpine data object
 */
export function varianceCheckComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.variance.${key}`, vars);
  // Generator, sums and the latest sample stay outside Alpine's reactive proxy.
  let rng = mulberry32(randomSeed());
  let latest = [];
  let latestVariances = { byN: NaN, byNMinus1: NaN };
  let sumByN = 0;
  let sumByNMinus1 = 0;
  let root = null;

  return {
    process: 'fill-a',
    n: 3,
    drawSizes: DRAW_SIZES,
    /** Reactive, so the table and data-count follow each draw. */
    samplesDrawn: 0,

    /**
     * Initialise from the block's params.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     */
    setup(el, params) {
      root = el;
      const p = params || {};
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      if (PROCESSES[p.process]) this.process = p.process;
      if (Number.isInteger(p.n) && p.n > 1) this.n = p.n;
      latest = [];
      latestVariances = { byN: NaN, byNMinus1: NaN };
      sumByN = 0;
      sumByNMinus1 = 0;
      this.samplesDrawn = 0;
      this.report();
    },

    /** No chart to release; kept for the widget contract. */
    destroy() {},

    // ---------- template helpers ----------

    label(key, vars) { return t(key, vars); },
    drawLabel(k) { return t(k === 1 ? 'drawOne' : 'draw', { k }); },

    /** Running averages over all samples drawn (NaN before the first). */
    averages() {
      const count = this.samplesDrawn;
      if (!count) return { byN: NaN, byNMinus1: NaN };
      return { byN: sumByN / count, byNMinus1: sumByNMinus1 / count };
    },

    /** Display text of the latest sample's values. */
    latest() {
      // Read the reactive counter so Alpine re-evaluates after each draw.
      return this.samplesDrawn ? latest.map((v) => fmt(v)) : [];
    },

    /**
     * Display text of one table cell.
     * @param {'count'|'latestByN'|'latestByNMinus1'|'avgByN'|'avgByNMinus1'|'sigma2'} key
     * @returns {string}
     */
    cell(key) {
      if (key === 'count') return String(this.samplesDrawn);
      if (key === 'sigma2') return fmt(PROCESSES[this.process].sd ** 2);
      if (!this.samplesDrawn) return '–';
      if (key === 'latestByN') return fmt(latestVariances.byN);
      if (key === 'latestByNMinus1') return fmt(latestVariances.byNMinus1);
      const avg = this.averages();
      return fmt(key === 'avgByN' ? avg.byN : avg.byNMinus1);
    },

    // ---------- interaction ----------

    /** @param {number} times samples to draw */
    draw(times) {
      for (let i = 0; i < times; i++) {
        latest = drawSample(this.process, this.n, rng);
        latestVariances = sampleVariances(latest);
        sumByN += latestVariances.byN;
        sumByNMinus1 += latestVariances.byNMinus1;
      }
      this.samplesDrawn += times;
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
  };
}
