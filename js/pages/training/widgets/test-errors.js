/**
 * D.Mike — Course widget "test errors" (widgets/test-errors.js)
 *
 * Simulates checks of machine A against μ₀ = 500 g while the machine may have
 * drifted by δ: every check measures n packs, takes the mean x̄ and raises an
 * alarm when x̄ lies outside the alarm limits of level α. The histogram
 * collects the means, the bins outside the limits are highlighted. At δ = 0
 * the alarm share estimates α, at δ > 0 the power. With theory on, the H₀
 * curve shades α and the curve of the true mean shades β. Every setting
 * (δ, n, α) keeps its own means, so switching back continues it. Nothing is
 * persisted; checks per setting value feed the insight gates through
 * `training-sim-progress` as `{count, values}`.
 *
 * Params (all optional): driftChoices (default [0]), nChoices (default [10]),
 * alphaChoices (default [0.05]) — the first entry is the start value;
 * showTheory (false | 'afterInsight' | true, default false), showExact
 * (default false), seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { PROCESSES, drawSample } from '../processes.js';
import { alarmLimits, isAlarm, exactPower } from '../power.js';

/** Batch sizes of the draw buttons. */
export const DRAW_SIZES = [1, 10, 100, 1000];
const PROCESS = 'fill-a';
/** Axis in g; bins of about 0.2 g are laid out from the alarm limits. */
const AXIS_MIN = 496;
const AXIS_MAX = 506;
const TARGET_WIDTH = 0.2;
const EPS = 1e-9;
const LIMIT_COLOR = 'var(--color-error)';
const H0_COLOR = 'var(--color-chart-2)';
const TRUE_COLOR = 'var(--color-chart-3)';
const ALPHA_COLOR = 'var(--color-error)';
const BETA_COLOR = 'var(--color-warning)';
const SETTINGS = ['drift', 'n', 'alpha'];

/** A fresh seed per mount, as in the other course widgets. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const isDrift = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isN = (v) => Number.isInteger(v) && v > 1;
const isAlpha = (v) => typeof v === 'number' && v > 0 && v < 1;
const VALID = { drift: isDrift, n: isN, alpha: isAlpha };
const DEFAULTS = { drift: [0], n: [10], alpha: [0.05] };

/** Key of one setting in the means map. */
const settingKey = (drift, n, alpha) => `${drift}|${n}|${alpha}`;

/**
 * Alpine component factory (registered as `trainingTestErrors`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function testErrorsComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.testErrors.${key}`, vars);
  const process = PROCESSES[PROCESS];
  // Generator, means per setting and chart handle stay outside Alpine's proxy.
  let rng = mulberry32(randomSeed());
  /** @type {Map<string, number[]>} */
  let meansBySetting = new Map();
  let choices = { ...DEFAULTS };
  let api = null;
  let root = null;
  let chart = null;
  let destroyed = false;

  return {
    drift: 0,
    n: 10,
    alpha: 0.05,
    showTheory: false,
    showExact: false,
    drawSizes: DRAW_SIZES,
    /** Reactive: whether the theory curves and legend are shown. */
    theory: false,
    /** Reactive: checks of the current setting, so cells and data-count follow. */
    checks: 0,
    /** Reactive: bumped on every change so the cells re-evaluate. */
    revision: 0,

    /**
     * Initialise from the block's params and create the chart.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     * @param {{insightOpen?: Function}} lessonApi the lesson page's API
     */
    async setup(el, params, lessonApi) {
      root = el;
      api = lessonApi || null;
      const p = params || {};
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      choices = {};
      for (const name of SETTINGS) {
        const list = p[`${name}Choices`];
        choices[name] = Array.isArray(list) && list.length && list.every(VALID[name]) ? list : DEFAULTS[name];
        this[name] = choices[name][0];
      }
      this.showTheory = p.showTheory === true || p.showTheory === 'afterInsight' ? p.showTheory : false;
      this.showExact = p.showExact === true;
      meansBySetting = new Map();
      this.checks = 0;
      this.report();
      this.evaluateTheory();
      await this.createChart();
    },

    async createChart() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = root.querySelector('.training-errors__chart');
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
    assumption() { return t('assumption', { mu: process.mean + this.drift }); },
    /** At δ = 0 the exact value is α, otherwise the power. */
    exactLabel() { return t(this.drift > 0 ? 'exactPower' : 'exactAlpha'); },
    /** @param {'drift'|'n'|'alpha'} name */
    options(name) { return [...choices[name]]; },
    /**
     * Option text of one setting value.
     * @param {'drift'|'n'|'alpha'} name
     * @param {number} value
     */
    optionText(name, value) {
      if (name === 'drift') return `+${value} g`;
      if (name === 'alpha') return `${Math.round(value * 1000) / 10} %`;
      return String(value);
    },
    /** Legend keys under the chart: alpha, plus beta when the machine drifted. */
    legends() {
      if (!this.theory) return [];
      return this.drift > 0 ? ['alpha', 'beta'] : ['alpha'];
    },

    /** Alarm limits of the current n and α. */
    limits() { return alarmLimits(process.mean, process.sd, this.n, this.alpha); },

    /**
     * Display text of one stat cell: limits, checks, alarms, share, exact.
     * @param {string} key
     * @returns {string}
     */
    cell(key) {
      // Read the reactive counters so Alpine re-evaluates after each change.
      if (this.checks < 0 || this.revision < 0) return '';
      const limits = this.limits();
      if (key === 'limits') return `${limits.lower.toFixed(2)} – ${limits.upper.toFixed(2)} g`;
      if (key === 'exact') return `${(100 * exactPower(this.drift, process.sd, this.n, this.alpha)).toFixed(1)} %`;
      const means = this.current();
      const alarms = means.filter((m) => isAlarm(m, limits)).length;
      if (key === 'checks') return String(means.length);
      if (key === 'alarms') return String(alarms);
      if (key === 'share') return means.length ? `${((100 * alarms) / means.length).toFixed(1)} %` : '–';
      return '–';
    },

    // ---------- interaction ----------

    /** @param {number} times checks to run */
    draw(times) {
      const means = this.current(true);
      for (let i = 0; i < times; i++) {
        const values = drawSample(PROCESS, this.n, rng);
        means.push(values.reduce((a, b) => a + b, 0) / values.length + this.drift);
      }
      this.changed();
    },

    /** @param {number|Event} v drift, or the select's change event */
    setDrift(v) { this.set('drift', v); },
    /** @param {number|Event} v packs per check, or the select's change event */
    setN(v) { this.set('n', v); },
    /** @param {number|Event} v significance level, or the select's change event */
    setAlpha(v) { this.set('alpha', v); },

    set(name, v) {
      const value = Number(v && v.target ? v.target.value : v);
      if (!choices[name].includes(value)) return;
      this[name] = value;
      this.changed();
    },

    /**
     * Means of the current setting.
     * @param {boolean} [create] add an empty entry when missing
     * @returns {number[]}
     */
    current(create = false) {
      const key = settingKey(this.drift, this.n, this.alpha);
      let means = meansBySetting.get(key);
      if (!means) {
        means = [];
        if (create) meansBySetting.set(key, means);
      }
      return means;
    },

    /**
     * Test seam: add means to the current setting, e.g. ones on a limit.
     * @param {number[]} values
     */
    _pushMeans(values) {
      this.current(true).push(...values);
      this.changed();
    },

    /** Test seam: copy of the current setting's means. */
    _means() { return this.current().slice(); },

    /** Announce, re-evaluate the theory, then redraw. */
    changed() {
      this.checks = this.current().length;
      this.revision++;
      this.report();
      this.evaluateTheory();
      if (ctx.chartManager && chart) ctx.chartManager.update(chart, this.chartConfig());
    },

    /** Theory is on when forced, or after an insight of the step opened. */
    evaluateTheory() {
      this.theory = this.showTheory === true
        || (this.showTheory === 'afterInsight' && !!api && typeof api.insightOpen === 'function' && api.insightOpen());
    },

    /** Announce the current setting's checks and the most checks per setting value. */
    report() {
      if (!root) return;
      const values = {};
      for (const name of SETTINGS) values[name] = {};
      for (const drift of choices.drift) {
        for (const n of choices.n) {
          for (const alpha of choices.alpha) {
            const count = (meansBySetting.get(settingKey(drift, n, alpha)) || []).length;
            const setting = { drift, n, alpha };
            for (const name of SETTINGS) {
              const byValue = values[name];
              byValue[setting[name]] = Math.max(byValue[setting[name]] || 0, count);
            }
          }
        }
      }
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: this.current().length, values },
      }));
    },

    // ---------- chart ----------

    /**
     * Bins of about 0.2 g laid out from the alarm limits, so both limits are
     * edges; bins outside the limits are highlighted.
     */
    bins() {
      const { lower: L, upper: U } = this.limits();
      const m = Math.max(1, Math.round((U - L) / TARGET_WIDTH));
      const w = (U - L) / m;
      const kMin = Math.ceil((AXIS_MIN - w - L) / w - EPS);
      const kMax = Math.floor((AXIS_MAX + w - L) / w + EPS);
      const edges = [];
      for (let k = kMin; k <= kMax; k++) edges.push(k === m ? U : L + k * w);
      const counts = new Array(edges.length - 1).fill(0);
      for (const mean of this.current()) {
        if (mean < edges[0] || mean >= edges[edges.length - 1]) continue;
        let k = Math.floor((mean - edges[0]) / w);
        // Floating point may put a mean just below an edge into the next bin.
        if (k > 0 && mean < edges[k]) k--;
        if (k < counts.length - 1 && mean >= edges[k + 1]) k++;
        counts[k]++;
      }
      return counts.map((count, k) => {
        const x0 = edges[k];
        const x1 = edges[k + 1];
        const highlight = x0 >= U - EPS || x1 <= L + EPS;
        return highlight ? { x0, x1, count, highlight } : { x0, x1, count };
      });
    },

    /** H₀ curve shading α and, when drifted, the true curve shading β. */
    curves() {
      const { lower: L, upper: U } = this.limits();
      const stdDev = process.sd / Math.sqrt(this.n);
      const out = [{
        mean: process.mean,
        stdDev,
        color: H0_COLOR,
        label: 'H₀',
        shade: [
          { from: -Infinity, to: L, color: ALPHA_COLOR, key: 'alpha' },
          { from: U, to: Infinity, color: ALPHA_COLOR, key: 'alpha' },
        ],
      }];
      if (this.drift > 0) {
        out.push({
          mean: process.mean + this.drift,
          stdDev,
          color: TRUE_COLOR,
          label: 'μ',
          shade: [{ from: L, to: U, color: BETA_COLOR, key: 'beta' }],
        });
      }
      return out;
    },

    chartConfig() {
      const { lower: L, upper: U } = this.limits();
      const config = {
        xLabel: t('axis'),
        bins: this.bins(),
        xMin: AXIS_MIN,
        xMax: AXIS_MAX,
        xExact: true,
        // The widget's own legend explains the shaded areas below the chart.
        showLegend: false,
        refLines: [
          { dir: 'v', value: L, label: '', color: LIMIT_COLOR, width: 2 },
          { dir: 'v', value: U, label: '', color: LIMIT_COLOR, width: 2 },
        ],
        // Always set, so an update drops the curves when theory turns off.
        normalCurves: this.theory ? this.curves() : [],
      };
      return config;
    },
  };
}
