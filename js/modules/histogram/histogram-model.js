/**
 * D.Mike — Histogram Module Model (histogram-model.js)
 *
 * Holds ONLY persistence state + serialization. No i18n, no CSS, no DOM,
 * no view flags. The pure binning engine lives in histogram-binning.js and is
 * imported by both the model consumers and the data-fn (unit-tested separately).
 *
 * Persistence shape (toJSON) matches the legacy getState() EXACTLY — the
 * chartConfig fields are persisted FLAT (chartTitleText, showTitle, titleSize, …),
 * not nested, so old projects round-trip. Every nested object/array is
 * deep-copied so `structuredClone(model.toJSON())` (the createModule persist path,
 * run against an Alpine reactive proxy) is safe.
 */

const BIN_MODES = ['auto', 'manual'];

/** Deep-copy a column ref (or null). */
function cloneRef(r) {
  return r && typeof r === 'object' ? { ...r } : (r ?? null);
}

/** Deep-copy a dataset {valueRef, groupRef}. */
function cloneDataset(d) {
  return { valueRef: cloneRef(d && d.valueRef), groupRef: cloneRef(d && d.groupRef) };
}

/** Deep-copy an arbitrary plain object/array via JSON (refLines/refAreas/overrides). */
function deepCopy(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

export class State {
  /** @type {{valueRef: object|null, groupRef: object|null}[]} */
  datasets = [{ valueRef: null, groupRef: null }];
  /** Per-series overrides (color, pattern, visibility, name, …). */
  seriesOverrides = [];
  binMode = 'auto';
  /** @type {number|null} */
  binWidth = null;
  showPareto = true;
  showStats = true;
  showBoxplot = true;
  confLevel = 95;
  /** Shared chart display config (mutated in-place by the shared editor builders). */
  chartConfig = {
    showTitle: true, title: '',
    titleSize: 15, labelSize: 12, tickSize: 11,
    showXLabel: true, showYLabel: true,
    showXTicks: true, showYTicks: true,
    bgColor: null,
  };
  barGap = 1;
  refLines = [];
  refAreas = [];

  /** True when any dataset has a value column selected (loadExample confirm guard). */
  hasContent() {
    return Array.isArray(this.datasets) && this.datasets.some(d => d && d.valueRef);
  }

  toJSON() {
    const cc = this.chartConfig || {};
    return {
      datasets: this.datasets.map(cloneDataset),
      binMode: this.binMode,
      binWidth: this.binWidth,
      showTitle: cc.showTitle,
      chartTitleText: cc.title,
      showPareto: this.showPareto,
      showStats: this.showStats,
      showBoxplot: this.showBoxplot,
      confLevel: this.confLevel,
      titleSize: cc.titleSize,
      labelSize: cc.labelSize,
      tickSize: cc.tickSize,
      showXLabel: cc.showXLabel,
      showYLabel: cc.showYLabel,
      showXTicks: cc.showXTicks,
      showYTicks: cc.showYTicks,
      barGap: this.barGap,
      bgColor: cc.bgColor ?? null,
      refLines: deepCopy(this.refLines) || [],
      refAreas: deepCopy(this.refAreas) || [],
      seriesOverrides: deepCopy(this.seriesOverrides) || [],
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.datasets = loadDatasets(d);
    s.seriesOverrides = Array.isArray(d.seriesOverrides) ? deepCopy(d.seriesOverrides) : [];
    s.binMode = BIN_MODES.includes(d.binMode) ? d.binMode : 'auto';
    s.binWidth = (typeof d.binWidth === 'number' && isFinite(d.binWidth)) ? d.binWidth : null;
    s.showPareto = d.showPareto ?? true;
    s.showStats = d.showStats ?? true;
    s.showBoxplot = d.showBoxplot ?? true;
    s.confLevel = (typeof d.confLevel === 'number' && isFinite(d.confLevel)) ? d.confLevel : 95;
    s.chartConfig = {
      showTitle: d.showTitle ?? true,
      title: typeof d.chartTitleText === 'string' ? d.chartTitleText : '',
      titleSize: d.titleSize ?? 15,
      labelSize: d.labelSize ?? 12,
      tickSize: d.tickSize ?? 11,
      showXLabel: d.showXLabel ?? true,
      showYLabel: d.showYLabel ?? true,
      showXTicks: d.showXTicks ?? true,
      showYTicks: d.showYTicks ?? true,
      bgColor: d.bgColor ?? null,
    };
    s.barGap = (typeof d.barGap === 'number' && isFinite(d.barGap)) ? d.barGap : 1;
    s.refLines = Array.isArray(d.refLines) ? deepCopy(d.refLines) : [];
    s.refAreas = Array.isArray(d.refAreas) ? deepCopy(d.refAreas) : [];
    return s;
  }
}

/**
 * Load datasets with backward compat for the v1 format (flat seriesRefs).
 * @param {object} saved
 * @returns {{valueRef: object|null, groupRef: object|null}[]}
 */
export function loadDatasets(saved) {
  if (Array.isArray(saved.datasets)) {
    return saved.datasets.map(cloneDataset);
  }
  if (Array.isArray(saved.seriesRefs)) {
    return saved.seriesRefs.map(ref => ({ valueRef: cloneRef(ref), groupRef: null }));
  }
  return [{ valueRef: null, groupRef: null }];
}
