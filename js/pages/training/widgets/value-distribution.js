/**
 * D.Mike — Course widget "value distribution" (widgets/value-distribution.js)
 *
 * Measures single values of one or two processes (PROCESSES) and shows one
 * histogram per process through the chart manager, with a table of count,
 * mean, s, min, max, range and band shares below it. Values start empty on
 * every mount and are never persisted. Per-process counts feed the insight
 * gates through the `training-sim-progress` event.
 *
 * Params (all optional): processes (1–2 ids), selectable (one chart plus a
 * process select), showMean, bands (multiples of s), stats (table rows), seed.
 */

import { mulberry32 } from '../../../engines/random-variates-engine.js';
import { binValues } from '../populations.js';
import { PROCESSES, summarizeValues } from '../processes.js';

/** Batch sizes of the measure buttons. */
export const MEASURE_SIZES = [1, 10, 100, 1000];
/** Columns the template unrolls; the chart anchors stay put when the selection changes. */
export const MAX_COLUMNS = 2;
const DEFAULT_STATS = ['count', 'mean', 'sd', 'min', 'max', 'range'];
const BINS = 40;
const MEAN_COLOR = 'var(--color-accent)';
const BAND_COLOR = 'var(--color-text-secondary)';

/** A fresh seed per mount, as in the sampling widget. */
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–');
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : '–');

/**
 * Alpine component factory (registered as `trainingValueSim`).
 * @param {{i18n: {t: Function}, chartManager?: object}} ctx page context
 * @returns {object} Alpine data object
 */
export function valueSimComponent(ctx) {
  const t = (key, vars) => ctx.i18n.t(`training.course.values.${key}`, vars);
  // Generator, measured values and chart handles stay outside Alpine's reactive proxy.
  let rng = mulberry32(randomSeed());
  let values = {};
  let root = null;
  let charts = [];
  let destroyed = false;
  let lastMeasured = null;

  return {
    processes: ['fill-a'],
    selectable: false,
    current: 'fill-a',
    showMean: false,
    bands: [],
    stats: DEFAULT_STATS,
    measureSizes: MEASURE_SIZES,
    /** Per-process counts; reactive, so the table and data-count follow. */
    counts: {},

    /**
     * Initialise from the block's params and create the charts.
     * @param {HTMLElement} el widget root (event target)
     * @param {object} params block params
     */
    async setup(el, params) {
      root = el;
      const p = params || {};
      if (Number.isInteger(p.seed)) rng = mulberry32(p.seed);
      if (Array.isArray(p.processes)) {
        const ids = p.processes.filter((id) => PROCESSES[id]).slice(0, MAX_COLUMNS);
        if (ids.length) this.processes = ids;
      }
      this.current = this.processes[0];
      this.selectable = p.selectable === true;
      this.showMean = p.showMean === true;
      if (Array.isArray(p.bands)) this.bands = p.bands.filter((k) => k > 0);
      if (Array.isArray(p.stats)) this.stats = p.stats.filter((s) => DEFAULT_STATS.includes(s) || s === 'belowMean');
      values = {};
      const counts = {};
      for (const id of this.processes) { values[id] = []; counts[id] = 0; }
      this.counts = counts;
      this.report();
      await this.createCharts();
    },

    async createCharts() {
      const cm = ctx.chartManager;
      if (!cm || !root.querySelector) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const cols = this.columns();
      for (let slot = 0; slot < cols.length; slot++) {
        const container = root.querySelector(`.training-values__chart--${slot}`);
        if (!container || destroyed) return;
        const chart = await cm.create(container, 'histogram', this.chartConfig(cols[slot]));
        if (destroyed) { cm.destroy(chart); return; }
        charts[slot] = chart;
      }
      this.refresh();
    },

    /** Alpine calls this when the widget leaves the page: release every chart. */
    destroy() {
      destroyed = true;
      const cm = ctx.chartManager;
      if (cm) charts.forEach((chart) => chart && cm.destroy(chart));
      charts = [];
    },

    // ---------- template helpers ----------

    label(key, vars) { return t(key, vars); },
    measureLabel(k) { return t('measure', { k }); },
    processLabel(id) { return t(`process.${id}`); },
    /** Process ids shown as columns, in slot order. */
    columns() { return this.selectable ? [this.current] : this.processes; },
    /** Process id of a column slot, or '' when the slot is unused. */
    columnId(slot) { return this.columns()[slot] || ''; },
    hasColumn(slot) { return slot < this.columns().length; },
    gridClass() { return this.columns().length > 1 ? 'training-values__grid--two' : ''; },
    countOf(id) { return this.counts[id] || 0; },
    isCurrent(id) { return id === this.current; },

    /** Table rows in order: the chosen stats, then one share row per band. */
    rows() {
      const rows = this.stats.map((key) => ({ key, label: t(key) }));
      for (const k of this.bands) rows.push({ key: `within${k}`, label: t('within', { k }) });
      return rows;
    },

    /**
     * Display text of one table cell.
     * @param {string} id process id
     * @param {string} key row key
     * @returns {string}
     */
    cell(id, key) {
      const list = values[id] || [];
      // Read the reactive count so Alpine re-evaluates the cell after measuring.
      if (this.countOf(id) !== list.length) return '–';
      if (key === 'count') return String(list.length);
      const s = summarizeValues(list);
      if (key === 'belowMean') return pct(s.belowMean);
      if (key.startsWith('within')) return pct(s.within[Number(key.slice(6))]);
      return fmt(s[key]);
    },

    // ---------- interaction ----------

    /**
     * Measure `times` values of one process and report.
     * @param {string} id process id
     * @param {number} times
     */
    measure(id, times) {
      const process = PROCESSES[id];
      if (!process || !values[id]) return;
      for (let i = 0; i < times; i++) values[id].push(process.draw(rng));
      lastMeasured = id;
      this.counts = { ...this.counts, [id]: values[id].length };
      this.refresh();
      this.report();
    },

    /** @param {string} id process to show in a selectable widget */
    select(id) {
      if (!values[id]) return;
      this.current = id;
      this.refresh();
    },

    /** @param {Event} e change event of the process select */
    selectFrom(e) { this.select(e.target.value); },

    /** Announce cumulative counts of this mount to the page. */
    report() {
      if (!root) return;
      const perN = {};
      for (const id of this.processes) perN[id] = { 1: values[id].length };
      root.dispatchEvent(new CustomEvent('training-sim-progress', {
        bubbles: true,
        detail: { count: lastMeasured ? values[lastMeasured].length : 0, perN },
      }));
    },

    // ---------- charts ----------

    refresh() {
      const cm = ctx.chartManager;
      if (!cm) return;
      this.columns().forEach((id, slot) => {
        if (charts[slot]) cm.update(charts[slot], this.chartConfig(id));
      });
    },

    chartConfig(id) {
      const process = PROCESSES[id];
      const list = values[id] || [];
      const s = summarizeValues(list);
      const refLines = [];
      if (this.showMean && Number.isFinite(s.mean)) {
        refLines.push({ dir: 'v', value: s.mean, label: 'x̄', showLabel: true, width: 2, color: MEAN_COLOR });
      }
      if (Number.isFinite(s.sd)) {
        for (const k of this.bands) {
          const band = (sign) => ({
            dir: 'v', value: s.mean + sign * k * s.sd, label: `${sign < 0 ? '−' : '+'}${k} s`,
            showLabel: true, dash: 'dash', width: 1, color: BAND_COLOR,
          });
          refLines.push(band(-1), band(1));
        }
      }
      return {
        title: this.processLabel(id),
        xLabel: t(`axis.${process.unit}`),
        yLabel: t('frequency'),
        bins: binValues(list, process.axis, BINS),
        xMin: process.axis[0],
        xMax: process.axis[1],
        xExact: true,
        showLegend: false,
        refLines,
      };
    },
  };
}
