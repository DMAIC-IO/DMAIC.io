/**
 * D.Mike — Diagramm-Vorschlag: Vorschaukonfigurationen. Rein.
 *
 * Aus den gewählten Spalten wird je Diagrammtyp die Eingabe für genau ein
 * Diagramm-Widget gebaut: `{ widget, config }`. Alle Texte kommen fertig über
 * `labels`; Farben sind CSS-Variablen aus der Diagrammpalette.
 */
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { computeIMR } from '../../../engines/control-chart-engine.js';
import { computeTransformedIMR } from '../../../engines/transformed-chart-engine.js';
import { computeEWMA, estimateSigma } from '../../../engines/time-weighted-chart-engine.js';
import { groupedMeans, cellMeans } from '../../../engines/grouped-aggregations.js';
import {
  toNum, mean, countCategories, crossTabCategorical, collectTimeOrderedSeries,
  collectDateLineGroups, boxplotGroups, groupedAxisLabels,
} from './columns.js';

/**
 * Die Achsentexte der Vorschau (`axis.*`).
 * @typedef {{ frequency: string, observation: string, count: string, proportion: string, mean: string, other: string, otherCategories: string, percentile: string, variable: string, value: string, cumulativeSum: string }} ChartLabels
 */

/** Typ des Vorschlags → Diagramm-Widget. */
const WIDGET_OF = {
  histogram: 'histogram-chart',
  boxplot: 'boxplot-chart',
  'individual-value-plot': 'individual-value-plot-chart',
  'run-chart': 'run-chart',
  scatter: 'scatter-chart',
  bubble: 'scatter-chart',
  bar: 'bar-chart',
  mosaic: 'mosaic-chart',
  heatmap: 'heatmap-chart',
  pareto: 'pareto-chart',
  pie: 'pie-chart',
  'probability-plot': 'probability-plot-chart',
  'control-chart': 'control-chart',
  'transformed-imr-chart': 'control-chart',
  ewma: 'control-chart',
};

/** @param {{ values?: any[] }} c @returns {number[]} */
const numericVals = (c) => (c?.values || []).map(toNum).filter((v) => Number.isFinite(v));

/** Grenze als Liste: ein Skalar wird zur einelementigen Liste. @param {number|number[]} v @returns {number[]} */
const asList = (v) => (Array.isArray(v) ? v : [v]);

/** @param {number[]} arr nicht leer @returns {number} */
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Linien über der Zeit als Streudiagramm mit Datumsachse.
 * @param {ReturnType<typeof collectDateLineGroups>} lines
 * @returns {object}
 */
function dateLineConfig({ groups, xLabel, yLabel }) {
  const series = groups.map((g, idx) => {
    const points = [...g.points].sort((a, b) => a.d - b.d);
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return { name: g.name, x: points.map((p) => p.d), y: points.map((p) => p.v), color, markerSize: 4, connectLine: { show: true, color, width: 1.5 } };
  });
  return { title: '', xLabel, yLabel, showLegend: series.length > 1, xAxis: 'date', series };
}

/**
 * Baut die Vorschau für einen Diagrammtyp.
 * @param {string} type Diagrammtyp des Vorschlags
 * @param {Array<{ name: string, role: string, values: any[] }>} cols die gewählten Spalten
 * @param {ChartLabels} labels Achsentexte
 * @returns {{ widget: string, config: object }|null} null, wenn Typ oder Spalten nicht reichen
 */
export function buildChartConfig(type, cols, labels) {
  const config = configFor(type, cols, labels);
  return config ? { widget: WIDGET_OF[type], config } : null;
}

/** @returns {object|null} */
function configFor(type, columns, labels) {
  const cont = columns.filter((c) => c.role === 'continuous');
  const cat = columns.filter((c) => c.role === 'categorical' || c.role === 'ordinal');
  const date = columns.filter((c) => c.role === 'date');

  switch (type) {
    case 'histogram': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return { title: c.name || '', xLabel: c.name || '', yLabel: labels.frequency, data: numericVals(c), showNormalCurve: true };
    }
    case 'boxplot': {
      const groups = boxplotGroups(cont, cat);
      if (!groups) return null;
      return { title: '', ...groupedAxisLabels(cont, cat, labels), showLegend: groups.length > 1, showMean: true, showOutliers: true, groups };
    }
    case 'individual-value-plot': {
      const groups = boxplotGroups(cont, cat);
      if (!groups) return null;
      return { title: '', ...groupedAxisLabels(cont, cat, labels), showLegend: groups.length > 1, groups };
    }
    case 'run-chart': {
      if (cont.length === 0) return null;
      const c = cont[0];
      const values = numericVals(c);
      return {
        title: c.name || '', xLabel: labels.observation, yLabel: c.name || '', values,
        ...(values.length ? { median: median(values) } : {}),
        pointColor: CHART_COLORS[0], lineColor: CHART_COLORS[0],
      };
    }
    case 'scatter': {
      const dateGroups = collectDateLineGroups(date, cont, cat);
      if (dateGroups) return dateLineConfig(dateGroups);
      if (cont.length < 2) return null;
      const xCol = cont[0], yCol = cont[1];
      const xRaw = xCol.values || [], yRaw = yCol.values || [];
      const n = Math.min(xRaw.length, yRaw.length);
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn)) { xs.push(xn); ys.push(yn); }
      }
      return { title: '', xLabel: xCol.name || '', yLabel: yCol.name || '', series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }] };
    }
    case 'bar': {
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return { title: '', xLabel: colA.name || '', yLabel: labels.count, categories, groups, stacked: true, showLegend: true };
      }
      if (cont.length >= 1 && cat.length >= 1) {
        const yCol = cont[0], factor = cat[0];
        const { levels, means } = groupedMeans(yCol.values || [], factor.values || []);
        const valid = levels.map((lvl, i) => ({ lvl, m: means[i] })).filter((p) => Number.isFinite(p.m));
        if (valid.length === 0) return null;
        return { title: '', xLabel: factor.name || '', yLabel: yCol.name || '', categories: valid.map((p) => p.lvl), groups: [{ name: yCol.name || '', values: valid.map((p) => p.m), color: CHART_COLORS[0] }] };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return { title: cc.name || '', xLabel: cc.name || '', yLabel: labels.count, categories, groups: [{ name: cc.name || '', values: counts, color: CHART_COLORS[0] }] };
    }
    case 'bubble': {
      if (cont.length < 3) return null;
      const xCol = cont[0], yCol = cont[1], sCol = cont[2];
      const xRaw = xCol.values || [], yRaw = yCol.values || [], sRaw = sCol.values || [];
      const N = Math.min(xRaw.length, yRaw.length, sRaw.length);
      const xs = [], ys = [], rawSizes = [];
      for (let i = 0; i < N; i++) {
        const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]), sn = toNum(sRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn) && Number.isFinite(sn) && sn >= 0) { xs.push(xn); ys.push(yn); rawSizes.push(sn); }
      }
      if (xs.length === 0) return null;
      const D_MIN = 6, D_MAX = 28;
      const sqrtVals = rawSizes.map(Math.sqrt);
      const sMin = Math.min(...sqrtVals), sMax = Math.max(...sqrtVals);
      const span = sMax - sMin;
      const sizes = sqrtVals.map((sv) => D_MIN + (span > 0 ? (sv - sMin) / span : 0.5) * (D_MAX - D_MIN));
      return { title: '', xLabel: xCol.name || '', yLabel: yCol.name || '', showLegend: false, series: [{ name: sCol.name || '', x: xs, y: ys, sizes, sizeValues: rawSizes, sizeLabel: sCol.name || '', color: CHART_COLORS[0] }] };
    }
    case 'mosaic': {
      if (cat.length < 2) return null;
      const colA = cat[0], colB = cat[1];
      const { categories, groups } = crossTabCategorical(colA, colB);
      if (categories.length === 0) return null;
      return { title: '', xLabel: colA.name || '', yLabel: labels.proportion, categories, groups, showLegend: true };
    }
    case 'heatmap': {
      if (cont.length >= 1 && cat.length >= 2) {
        const yCol = cont[0], colA = cat[0], colB = cat[1];
        const { aLevels, bLevels, means } = cellMeans(yCol.values || [], colA.values || [], colB.values || []);
        if (aLevels.length === 0 || bLevels.length === 0) return null;
        const cells = means.map((row) => row.map((v) => (Number.isFinite(v) ? v : null)));
        return { title: '', xLabel: colB.name || '', yLabel: colA.name || '', xCategories: bLevels, yCategories: aLevels, cells, valueLabel: labels.mean, valueDecimals: 2 };
      }
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0 || groups.length === 0) return null;
        const cells = groups.map((g) => categories.map((_, ci) => g.values[ci] || 0));
        return { title: '', xLabel: colA.name || '', yLabel: colB.name || '', xCategories: categories, yCategories: groups.map((g) => g.name), cells, valueLabel: labels.count, valueDecimals: 0 };
      }
      return null;
    }
    case 'pareto': {
      const other = { otherBucket: true, otherLabel: labels.other, otherCountTemplate: labels.otherCategories };
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return { title: '', xLabel: colA.name || '', yLabel: labels.count, categories, groups, showLegend: true, ...other };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const counted = countCategories(cc.values || []);
      const items = counted.categories.map((c, i) => ({ name: c, value: counted.counts[i], color: CHART_COLORS[0] })).sort((a, b) => b.value - a.value);
      return { title: cc.name || '', xLabel: cc.name || '', yLabel: labels.count, items, ...other };
    }
    case 'pie': {
      const cc = cat[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return { title: cc.name || '', slices: categories.map((c, i) => ({ name: c, value: counts[i], color: CHART_COLORS[i % CHART_COLORS.length] })) };
    }
    case 'probability-plot': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return { title: c.name || '', xLabel: c.name || '', yLabel: labels.percentile, data: numericVals(c), markerColor: CHART_COLORS[0] };
    }
    case 'control-chart': {
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 2) return null;
      const result = computeIMR(prep.values);
      const sub = result.subcharts.i;
      return {
        title: prep.valueName, xLabel: prep.xLabel || labels.observation, yLabel: prep.valueName,
        values: sub.values, cl: asList(sub.cl), ucl: asList(sub.ucl), lcl: asList(sub.lcl), sigma: asList(sub.sigma),
        labels: result.labels.map(String),
      };
    }
    case 'transformed-imr-chart': {
      // I-Karte in Originalskala mit rücktransformierten (asymmetrischen) Grenzen;
      // Zonen setzen Symmetrie voraus und bleiben aus.
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 2 || prep.values.some((v) => !(v > 0))) return null;
      const r = computeTransformedIMR(prep.values);
      const lim = r.iLimitsOriginal;
      if (![lim.cl, lim.ucl, lim.lcl].every(Number.isFinite)) return null;
      return {
        title: `${prep.valueName} (λ = ${r.lambda.toFixed(2)})`, xLabel: prep.xLabel || labels.observation, yLabel: prep.valueName,
        values: prep.values, cl: [lim.cl], ucl: [lim.ucl], lcl: [lim.lcl], sigma: [0], showZones: false,
        violationIndices: [...new Set(r.signalsI)].sort((a, b) => a - b),
      };
    }
    case 'ewma': {
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 3) return null;
      const target = mean(prep.values);
      const sigma = estimateSigma(prep.values, 'mr');
      if (!(sigma > 0)) return null;
      const r = computeEWMA(prep.values, target, sigma, 0.2, 3);
      return {
        title: prep.valueName, xLabel: prep.xLabel || labels.observation, yLabel: prep.valueName,
        values: r.values, cl: asList(r.cl), ucl: asList(r.ucl), lcl: asList(r.lcl), sigma: asList(r.sigma), showZones: false,
        violationIndices: [...new Set(r.signals)].sort((a, b) => a - b),
      };
    }
    default:
      return null;
  }
}
