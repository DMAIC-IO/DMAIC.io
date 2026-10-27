/**
 * D.Mike — Course widget "interval coverage" (widgets/interval-coverage.js)
 *
 * Draws samples of n values from machine A, builds a confidence interval for
 * the mean from each and counts how often it contains the true μ. The chart
 * stacks the latest 50 intervals of the current setting around a μ line. Each
 * setting (confidence level × n) keeps its own counts, so switching back
 * continues where it left off. With `sigma: 'unknown'` the interval uses the
 * sample's s; with `compare` every sample yields two intervals from the same
 * values — 1,96 · s (`z`) and t · s (`t`). Nothing is persisted; the samples
 * per setting feed the insight gates through the `training-sim-progress`
 * event as `perN: {[level]: {[n]: samples}}`.
 *
 * Params (all optional): nChoices (default [10]), levelChoices (default
 * [0.95]), sigma ('known' default | 'unknown'), compare, seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { PROCESSES, drawSample } from '../processes.js';
import { meanInterval, covers } from '../intervals.js';

/** Batch sizes of the draw buttons. */
export const DRAW_SIZES = [1, 10, 100, 1000];
/** Intervals kept per setting for the chart. */
const ROWS = 50;
/** Half the chart's axis span around μ, in g. */
const AXIS_HALF = 6;
const PROCESS = 'fill-a';

/** A fresh seed per mount, as in the other course widgets. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const isLevel = (v) => typeof v === 'number' && v > 0 && v < 1;
const isN = (v) => Number.isInteger(v) && v > 1;

/**
 * Alpine component factory (registered as `trainingIntervalCoverage`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function intervalCoverageComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.interval.${key}`, vars);
  // Generator, per-setting state and chart handle stay outside Alpine's proxy.
  let rng = mulberry32(randomSeed());
  /** @type {Object<string, {drawn: number, hits: Object<string, number>, half: Object<string, number>, rows: object[]}>} */
  let settings = {};
  let root = null;
  let chart = null;
  let destroyed = false;

  return {
    n: 10,
    level: 0.95,
    nChoices: [10],
    levelChoices: [0.95],
    knownSigma: true,
    compare: false,
    drawSizes: DRAW_SIZES,
    /** Reactive: samples drawn in this mount, so cells and data-count follow. */
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
      if (Array.isArray(p.nChoices) && p.nChoices.length && p.nChoices.every(isN)) this.nChoices = p.nChoices;
      if (Array.isArray(p.levelChoices) && p.levelChoices.length && p.levelChoices.every(isLevel)) {
        this.levelChoices = p.levelChoices;
      }
      this.knownSigma = p.sigma !== 'unknown';
      this.compare = !this.knownSigma && p.compare === true;
      this.n = this.nChoices.includes(10) ? 10 : this.nChoices[0];
      this.level = this.levelChoices.includes(0.95) ? 0.95 : this.levelChoices[0];
      settings = {};
      this.samplesDrawn = 0;
      this.current();
      this.report();
      await this.createChart();
    },

    async createChart() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = root.querySelector('.training-interval__chart');
      if (!container || destroyed) return;
      const created = await cm.create(container, 'interval-stack', this.chartConfig());
      if (destroyed) { cm.destroy(created); return; }
      chart = created;
    },

    /** Alpine calls this when the widget leaves the page: release the chart. */
    destroy() {
      destroyed = true;
      if (ctx.chartManager && chart) ctx.chartManager.destroy(chart);
      chart = null;
    },

    // ---------- state ----------

    /** Interval kinds drawn per sample: one, or `z` and `t` in compare mode. */
    kinds() {
      return this.compare ? ['z', 't'] : ['main'];
    },

    /** State of the current setting, created on first use. */
    current() {
      const key = `${this.level}|${this.n}`;
      if (!settings[key]) {
        const zero = () => Object.fromEntries(this.kinds().map((k) => [k, 0]));
        settings[key] = { level: this.level, n: this.n, drawn: 0, hits: zero(), half: {}, rows: [] };
      }
      return settings[key];
    },

    /**
     * One sample's intervals, keyed by kind.
     * @param {number[]} values
     * @returns {Object<string, {lo: number, hi: number, half: number}>}
     */
    intervals(values) {
      const { level } = this;
      if (this.knownSigma) return { main: meanInterval(values, { level, sigma: PROCESSES[PROCESS].sd }) };
      if (this.compare) {
        return { z: meanInterval(values, { level, method: 'z' }), t: meanInterval(values, { level, method: 't' }) };
      }
      return { main: meanInterval(values, { level, method: 't' }) };
    },

    // ---------- template helpers ----------

    label(key, vars) { return t(key, vars); },
    drawLabel(k) { return t(k === 1 ? 'drawOne' : 'draw', { k }); },
    nOptions() { return [...this.nChoices]; },
    levelOptions() { return [...this.levelChoices]; },
    /** @param {number} level */
    levelText(level) { return `${Math.round(level * 1000) / 10} %`; },

    /**
     * Latest half-width of the current setting (NaN before the first sample).
     * @param {string} [kind] `z` or `t` in compare mode
     * @returns {number}
     */
    halfWidth(kind) {
      const half = this.current().half[kind || this.kinds()[0]];
      return Number.isFinite(half) ? half : NaN;
    },

    /**
     * Display text of one stat cell: drawn, hits, rate, half — in compare mode
     * hits-z, rate-z, half-z, hits-t, rate-t, half-t.
     * @param {string} key
     * @returns {string}
     */
    cell(key) {
      // Read the reactive counter so Alpine re-evaluates after each draw.
      if (this.samplesDrawn < 0) return '';
      const s = this.current();
      if (key === 'drawn') return String(s.drawn);
      const [stat, kind = this.kinds()[0]] = key.split('-');
      if (!this.kinds().includes(kind)) return '–';
      if (stat === 'hits') return String(s.hits[kind] || 0);
      if (!s.drawn) return '–';
      if (stat === 'rate') return `${((100 * s.hits[kind]) / s.drawn).toFixed(1)} %`;
      const half = this.halfWidth(kind);
      return Number.isFinite(half) ? `${half.toFixed(2)} g` : '–';
    },

    // ---------- interaction ----------

    /** @param {number} times samples to draw */
    draw(times) {
      const s = this.current();
      const mu = PROCESSES[PROCESS].mean;
      for (let i = 0; i < times; i++) {
        const byKind = this.intervals(drawSample(PROCESS, this.n, rng));
        const segments = [];
        for (const [kind, iv] of Object.entries(byKind)) {
          const hit = covers(iv, mu);
          if (hit) s.hits[kind]++;
          s.half[kind] = iv.half;
          segments.push(kind === 'main' ? { lo: iv.lo, hi: iv.hi, hit } : { lo: iv.lo, hi: iv.hi, hit, kind });
        }
        s.rows.unshift({ segments });
      }
      s.rows.length = Math.min(s.rows.length, ROWS);
      s.drawn += times;
      this.samplesDrawn += times;
      this.changed();
    },

    /** @param {number|Event} v sample size, or the select's change event */
    setN(v) {
      const n = Number(v && v.target ? v.target.value : v);
      if (!this.nChoices.includes(n)) return;
      this.n = n;
      this.changed();
    },

    /** @param {number|Event} v confidence level, or the select's change event */
    setLevel(v) {
      const level = Number(v && v.target ? v.target.value : v);
      if (!this.levelChoices.includes(level)) return;
      this.level = level;
      this.changed();
    },

    /** Redraw the chart and announce the progress. */
    changed() {
      this.current();
      if (ctx.chartManager && chart) ctx.chartManager.update(chart, this.chartConfig());
      this.report();
    },

    /** Announce the samples per setting to the page. */
    report() {
      if (!root) return;
      const perN = {};
      for (const s of Object.values(settings)) {
        (perN[s.level] = perN[s.level] || {})[s.n] = s.drawn;
      }
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: this.samplesDrawn, perN },
      }));
    },

    // ---------- chart ----------

    chartConfig() {
      const mu = PROCESSES[PROCESS].mean;
      const legend = this.compare
        ? [{ kind: 'z', label: t('kindZ') }, { kind: 't', label: t('kindT') }]
        : [];
      legend.push({ kind: 'miss', label: t('miss') });
      return {
        xDomain: [mu - AXIS_HALF, mu + AXIS_HALF],
        xLabel: t('axis'),
        reference: { value: mu, label: 'μ' },
        rows: this.current().rows.map((r) => ({ segments: r.segments.map((seg) => ({ ...seg })) })),
        capacity: ROWS,
        legend,
        // Segments get their stroke from chart.css only; an exported SVG
        // carries no stylesheet and would show an empty plot.
        showModebar: false,
      };
    },
  };
}
