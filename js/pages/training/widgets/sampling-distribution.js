/**
 * D.Mike — Course widget "sampling distribution" (widgets/sampling-distribution.js)
 *
 * Draws samples of size n from a population and shows four views through the
 * chart manager: the population, the histogram of the drawn sample means
 * (empty on every mount), and — with `trackN` — the mean and the spread of the
 * means per n, read from the lesson's stored summaries. Cumulative counts feed
 * the insight gates through the `training-sim-progress` event.
 *
 * Params (all optional): population, n, lockPopulation, lockN, nChoices,
 * showTheory (sigma/sqrt(n) curves), trackN (per-n charts).
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import {
  POPULATIONS, drawSampleMean, meanSd, standardError, binValues,
} from '../populations.js';

/** Sample sizes offered when n is not locked and the block gives no `nChoices`. */
export const N_CHOICES = [2, 5, 10, 30];

/** A fresh seed per mount: draws are never replayed into the stored per-n summaries. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
const POP_BINS = 50;
const POP_DRAWS = 20000;
const MAX_MEANS_BINS = 400;
/** The per-n charts span the largest n the select can offer (50) plus margin. */
const N_AXIS_MAX = 52;
const MU_COLOR = 'var(--color-text-secondary)';
const XBAR_COLOR = 'var(--color-accent)';
const THEORY_COLOR = 'var(--color-error)';

/** Bin count of the means histogram: about six bins per standard error, at least POP_BINS. */
function meansBinCount(population, n) {
  const width = population.range[1] - population.range[0];
  const perSe = Math.ceil(width / (standardError(population, n) / 6));
  return Math.min(MAX_MEANS_BINS, Math.max(POP_BINS, perSe));
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');

/**
 * Alpine component factory (registered as `trainingSamplingSim`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function samplingSimComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.sim.${key}`, vars);
  // Generator, drawn means, chart handles and the page API stay outside Alpine's reactive proxy.
  let rng = mulberry32(randomSeed());
  let means = [];
  let root = null;
  let api = null;
  let charts = {};
  let destroyed = false;
  const popBinsCache = {};

  const populationBins = (id) => {
    if (!popBinsCache[id]) {
      const popRng = mulberry32(7);
      const values = Array.from({ length: POP_DRAWS }, () => POPULATIONS[id].draw(popRng));
      popBinsCache[id] = binValues(values, POPULATIONS[id].range, POP_BINS);
    }
    return popBinsCache[id];
  };

  const muLine = (mu) => ({ dir: 'v', value: mu, label: 'μ', dash: 'dot', width: 2, color: MU_COLOR });

  return {
    population: 'skewed',
    n: 5,
    lockPopulation: false,
    lockN: false,
    showTheory: false,
    trackN: false,
    nChoices: N_CHOICES,
    count: 0,
    perN: {},
    meansCount: 0,
    spreadText: '–',
    nPoints: 0,
    theoryMeans: false,
    theorySpread: false,
    populationIds: Object.keys(POPULATIONS),

    /**
     * Initialise from the block's params and create the charts.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     * @param {{addResult: Function, results?: Function}} lessonApi the lesson page's API
     */
    async setup(el, params, lessonApi) {
      root = el;
      api = lessonApi;
      const p = params || {};
      // Tests inject a seed; the UI draws a fresh one per mount.
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      if (POPULATIONS[p.population]) this.population = p.population;
      if (Number.isInteger(p.n) && p.n > 0) this.n = p.n;
      this.lockPopulation = p.lockPopulation === true;
      this.lockN = p.lockN === true;
      this.showTheory = p.showTheory === true;
      this.trackN = p.trackN === true;
      if (Array.isArray(p.nChoices) && p.nChoices.length) this.nChoices = p.nChoices;
      this.refresh();
      await this.createCharts();
    },

    /** The containers show up once Alpine applied `trackN`; create the charts then. */
    async createCharts() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const make = async (key, selector, type, config) => {
        const container = root.querySelector(selector);
        if (!container || destroyed) return;
        const chart = await cm.create(container, type, config);
        if (destroyed) { cm.destroy(chart); return; }
        charts[key] = chart;
      };
      await make('pop', '.training-sim__chart--pop', 'histogram', this.popConfig());
      await make('means', '.training-sim__chart--means', 'histogram', this.meansConfig());
      if (this.trackN) {
        await make('nMean', '.training-sim__chart--n-mean', 'scatter', this.nMeanConfig());
        await make('se', '.training-sim__chart--se', 'scatter', this.seConfig());
      }
      this.refresh();
    },

    /** Alpine calls this when the widget leaves the page: release every chart. */
    destroy() {
      destroyed = true;
      const cm = ctx.chartManager;
      if (cm) Object.values(charts).forEach((chart) => chart && cm.destroy(chart));
      charts = {};
    },

    // ---------- template helpers ----------

    label(key, vars) { return t(key, vars); },
    popLabel(id) { return t(`pop.${id}`); },
    /** A locked select offers only the fixed value. */
    popHidden(id) { return this.lockPopulation && id !== this.population; },
    /** Sample sizes of the n select: only the fixed value when locked, else the choices plus the start value. */
    nOptions() {
      if (this.lockN) return [this.n];
      const all = this.nChoices.includes(this.n) ? this.nChoices : [...this.nChoices, this.n];
      return [...all].sort((a, b) => a - b);
    },
    /** @param {Event} e change event of the n select */
    setN(e) {
      this.n = Number(e.target.value);
      this.changed();
    },
    countText() { return t('count', { count: this.count }); },
    muText() { return fmt(POPULATIONS[this.population].mu); },
    sigmaText() { return fmt(POPULATIONS[this.population].sigma); },
    seHint() {
      if (!this.showTheory) return '';
      return t('seHint', { se: fmt(standardError(POPULATIONS[this.population], Number(this.n))) });
    },

    // ---------- interaction ----------

    /** The learner changed population or n: the drawn means no longer belong to it. */
    changed() {
      means = [];
      this.refresh();
    },

    /**
     * Draw `times` samples of size n and report them.
     * @param {number} times
     */
    draw(times) {
      const population = POPULATIONS[this.population];
      const n = Number(this.n);
      if (!population || !(n > 0)) return;
      const batch = [];
      for (let i = 0; i < times; i++) batch.push(drawSampleMean(population, n, rng));
      for (const m of batch) means.push(m);
      const { mean, sd } = meanSd(batch);
      if (api) api.addResult(this.population, n, { mean, sd, count: times });
      this.count += times;
      const byN = this.perN[this.population] || (this.perN[this.population] = {});
      byN[n] = (byN[n] || 0) + times;
      this.refresh();
      this.report();
    },

    /** Announce cumulative counts of this step visit to the page. */
    report() {
      if (!root) return;
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: this.count, perN: JSON.parse(JSON.stringify(this.perN)) },
      }));
    },

    // ---------- charts ----------

    /** Update the numbers shown next to the charts and push fresh configs to the charts. */
    refresh() {
      this.meansCount = means.length;
      this.spreadText = means.length > 1 ? fmt(meanSd(means).sd) : '–';
      const meansCfg = this.meansConfig();
      this.theoryMeans = meansCfg.normalCurves.length > 0;
      this.nPoints = this.nPointsOf('mean').length;
      const seCfg = this.trackN ? this.seConfig() : null;
      this.theorySpread = !!seCfg && seCfg.series.length > 1;
      const cm = ctx.chartManager;
      if (!cm) return;
      if (charts.pop) cm.update(charts.pop, this.popConfig());
      if (charts.means) cm.update(charts.means, meansCfg);
      if (charts.nMean) cm.update(charts.nMean, this.nMeanConfig());
      if (charts.se) cm.update(charts.se, seCfg);
    },

    /** Stored per-n summaries of the current population as [n, value] pairs, sorted by n. */
    nPointsOf(key) {
      const results = api && api.results ? api.results() : {};
      const byN = results[this.population] || {};
      return Object.entries(byN)
        .map(([n, summary]) => [Number(n), summary[key]])
        .filter(([, v]) => Number.isFinite(v))
        .sort((a, b) => a[0] - b[0]);
    },

    nSeries(points, name) {
      return {
        name,
        x: points.map((p) => p[0]),
        y: points.map((p) => p[1]),
        color: XBAR_COLOR,
        markerSize: 8,
        connectLine: { show: points.length > 1, color: XBAR_COLOR, width: 1 },
      };
    },

    popConfig() {
      const pop = POPULATIONS[this.population];
      return {
        title: t('popChart'),
        xLabel: t('value'),
        yLabel: t('density'),
        bins: populationBins(this.population),
        xMin: pop.range[0],
        xMax: pop.range[1],
        xExact: true,
        showLegend: false,
        refLines: [muLine(pop.mu)],
      };
    },

    meansConfig() {
      const pop = POPULATIONS[this.population];
      const n = Number(this.n);
      const refLines = [muLine(pop.mu)];
      if (means.length) {
        refLines.push({
          dir: 'v', value: means.reduce((s, v) => s + v, 0) / means.length,
          label: 'x̄', width: 2, color: XBAR_COLOR,
        });
      }
      return {
        title: t('meansChart', { n }),
        xLabel: t('sampleMean'),
        yLabel: t('density'),
        // The axis stays fixed so the shrinking spread is visible; the bins follow the standard error.
        bins: binValues(means, pop.range, meansBinCount(pop, n)),
        xMin: pop.range[0],
        xMax: pop.range[1],
        xExact: true,
        showLegend: false,
        refLines,
        normalCurves: this.showTheory
          ? [{ mean: pop.mu, stdDev: standardError(pop, n), label: t('theory'), lineStyle: 'dashed', color: THEORY_COLOR }]
          : [],
      };
    },

    nMeanConfig() {
      const pop = POPULATIONS[this.population];
      return {
        title: t('nMeanChart'),
        xLabel: t('sampleSize'),
        yLabel: t('nMeanAxis'),
        xMin: 0,
        xMax: N_AXIS_MAX,
        xExact: true,
        // ±σ around μ: wide enough that the points visibly stay put.
        yMin: Math.floor(pop.mu - pop.sigma),
        yMax: Math.ceil(pop.mu + pop.sigma),
        showLegend: false,
        refLines: [{ dir: 'h', value: pop.mu, label: 'μ', dash: 'dot', width: 2, color: MU_COLOR }],
        series: [this.nSeries(this.nPointsOf('mean'), t('nMeanMeasured'))],
      };
    },

    seConfig() {
      const pop = POPULATIONS[this.population];
      const series = [this.nSeries(this.nPointsOf('sd'), t('seMeasured'))];
      if (this.showTheory) {
        const ns = Array.from({ length: 99 }, (_, i) => 1 + i * 0.5);
        series.push({
          name: t('theory'),
          x: ns,
          y: ns.map((n) => standardError(pop, n)),
          color: THEORY_COLOR,
          markerSize: 0,
          connectLine: { show: true, color: THEORY_COLOR, width: 2, dash: 'dash' },
        });
      }
      return {
        title: t('seChart'),
        xLabel: t('sampleSize'),
        yLabel: t('seAxis'),
        xMin: 0,
        xMax: N_AXIS_MAX,
        xExact: true,
        yMin: 0,
        yMax: Math.ceil(pop.sigma * 1.1),
        showLegend: false,
        series,
      };
    },
  };
}
