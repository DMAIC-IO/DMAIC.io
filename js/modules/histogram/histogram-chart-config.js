/**
 * D.Mike — Histogram module: model ⇄ chart config (histogram-chart-config.js)
 *
 * The module's model is the only store of every chart setting; the chart is
 * created with persistEdits:false and reports editor edits via onEditorChange,
 * which copyBack() mirrors into the model. Labels equal to the automatic ones
 * are stored as '' so they keep following the data.
 */

/** chartConfig keys that map 1:1 onto ChartBase config keys. */
export const CHART_CONFIG_KEYS = ['showTitle', 'titleSize', 'labelSize', 'tickSize', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'bgColor'];

const LABEL_KEYS = ['title', 'xLabel', 'yLabel'];
const OVERRIDE_KEYS = ['name', 'visible', 'fillColor', 'borderColor', 'borderWidth', 'borderStyle', 'pattern', 'patternColor', 'patternSolidity', 'showNormalCurve'];

const copy = (v) => JSON.parse(JSON.stringify(v ?? []));

/**
 * Chart config of the histogram chart type from the module model.
 * @param {import('./histogram-model.js').State} model
 * @param {object[]} series - expanded series (see histogram.js _plot)
 * @param {{ title: string, xLabel: string, yLabel: string }} auto - automatic labels
 * @returns {object}
 */
export function buildChartConfig(model, series, auto) {
  const cc = model.chartConfig || {};
  const cfg = { persistEdits: false, fileName: 'histogram' };
  for (const k of CHART_CONFIG_KEYS) cfg[k] = cc[k];
  for (const k of LABEL_KEYS) cfg[k] = cc[k] || auto[k];
  return Object.assign(cfg, {
    refLines: copy(model.refLines),
    refAreas: copy(model.refAreas),
    barGap: model.barGap,
    binWidth: model.binMode === 'manual' && model.binWidth > 0 ? model.binWidth : null,
    pareto: !!model.showPareto,
    boxplotStrip: !!model.showBoxplot,
    series: series.map(s => ({ ...s })),
  });
}

/**
 * Mirror chart edits into the model.
 * @param {import('./histogram-model.js').State} model
 * @param {object} cfg - the chart's live config
 * @param {{ title: string, xLabel: string, yLabel: string }} auto
 */
export function copyBack(model, cfg, auto) {
  const cc = model.chartConfig;
  for (const k of CHART_CONFIG_KEYS) cc[k] = cfg[k];
  for (const k of LABEL_KEYS) cc[k] = !cfg[k] || cfg[k] === auto[k] ? '' : cfg[k];
  model.refLines = copy(cfg.refLines);
  model.refAreas = copy(cfg.refAreas);
  model.barGap = cfg.barGap;
  model.showPareto = !!cfg.pareto;
  model.showBoxplot = !!cfg.boxplotStrip;
  model.seriesOverrides = toOverrides(cfg.series || []);
}

/**
 * Persisted per-series overrides (legacy shape, without values).
 * @param {object[]} series
 * @returns {object[]}
 */
export function toOverrides(series) {
  return series.map((s) => {
    const o = {};
    for (const k of OVERRIDE_KEYS) o[k] = s[k];
    return o;
  });
}
