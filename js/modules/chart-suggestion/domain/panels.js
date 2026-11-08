/**
 * D.Mike — Diagramm-Vorschlag: zusammengesetzte Vorschauen. Rein.
 *
 * `buildPreview` liefert je Vorschlagstyp entweder ein Diagramm (`single`), eine
 * Zellenliste aus mehreren Diagrammen (`panels`) oder nichts (`none`). Alle Texte
 * kommen fertig über `labels`; Farben sind CSS-Variablen aus der Diagrammpalette.
 */
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { computeCUSUM, estimateSigma } from '../../../engines/time-weighted-chart-engine.js';
import { groupedMeans, cellMeans } from '../../../engines/grouped-aggregations.js';
import { toNum, mean, collectTimeOrderedSeries } from './columns.js';
import { buildChartConfig } from './charts.js';

/**
 * Eine Zelle einer zusammengesetzten Vorschau. Zellen mit `widget` haben `label` leer (der Titel steht in `config`). Ohne `widget` ist sie eine Beschriftung,
 * eine Lücke (`label` leer) oder, mit `placeholder`, ein Hinweis, dass hier nichts zu zeigen ist.
 * @typedef {{ key: string, widget: string|null, config: object|null, label: string, placeholder: boolean }} Cell
 */

/**
 * Die Vorschau eines Vorschlags.
 * @typedef {{ kind: 'single', widget: string, config: object }
 *   | { kind: 'panels', layout: 'matrix'|'row'|'stack'|'marginal', n: number, note: { shown: number, total: number }|null, cells: Cell[] }
 *   | { kind: 'none' }} Preview
 */

/** Höchstzahl der Spalten in der Streudiagramm-Matrix. */
const MATRIX_MAX = 6;

const NONE = Object.freeze({ kind: 'none' });
const isCat = (c) => c.role === 'categorical' || c.role === 'ordinal';
const finiteOrNull = (v) => (Number.isFinite(v) ? v : null);

/** @param {string} key @param {string} widget @param {object} config @returns {Cell} */
const chartCell = (key, widget, config) => ({ key, widget, config, label: '', placeholder: false });
/** @param {string} key @param {string} label @returns {Cell} */
const textCell = (key, label) => ({ key, widget: null, config: null, label, placeholder: false });

/** @returns {Preview} */
const panels = (layout, n, cells, note = null) => ({ kind: 'panels', layout, n, note, cells });

/** Paare mit endlichem x und y. @returns {{ xs: number[], ys: number[] }} */
function finitePairs(xRaw, yRaw) {
  const n = Math.min(xRaw.length, yRaw.length);
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]);
    if (Number.isFinite(xn) && Number.isFinite(yn)) { xs.push(xn); ys.push(yn); }
  }
  return { xs, ys };
}

/**
 * Achsengrenzen mit Randabstand: `ratio` des Wertebereichs, bei Bereich 0 der Abstand `fallbackPad`.
 * Ist der Bereich leer, unendlich oder ohne Ausdehnung, gelten `fallbackLo`/`fallbackHi`.
 * @returns {{ min: number, max: number }}
 */
function padded(yMin, yMax, fallbackLo, fallbackHi, ratio, fallbackPad) {
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) { yMin = fallbackLo; yMax = fallbackHi; }
  const pad = (yMax - yMin) * ratio || fallbackPad;
  return { min: yMin - pad, max: yMax + pad };
}

function scatterMatrix(cols) {
  const allCont = cols.filter((c) => c.role === 'continuous');
  if (allCont.length < 2) return NONE;
  const used = allCont.slice(0, MATRIX_MAX);
  const n = used.length;
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const key = `matrix-${r}-${c}`;
      if (r === c) { cells.push(textCell(key, used[r].name || `c${r + 1}`)); continue; }
      const xCol = used[c], yCol = used[r];
      const { xs, ys } = finitePairs(xCol.values || [], yCol.values || []);
      cells.push(chartCell(key, 'scatter-chart', {
        title: '', xLabel: '', yLabel: '', showLegend: false,
        series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }],
      }));
    }
  }
  return panels('matrix', n, cells, allCont.length > MATRIX_MAX ? { shown: n, total: allCont.length } : null);
}

function mainEffects(cols, labels) {
  const yCol = cols.find((c) => c.role === 'continuous');
  const factors = cols.filter(isCat);
  if (!yCol || factors.length === 0) return NONE;
  const items = factors.map((f) => ({ factor: f, gm: groupedMeans(yCol.values || [], f.values || []) }));
  const yValsAll = (yCol.values || []).map(toNum).filter(Number.isFinite);
  const overallY = yValsAll.length > 0 ? yValsAll.reduce((s, v) => s + v, 0) / yValsAll.length : NaN;

  let lo = Infinity, hi = -Infinity;
  for (const { gm } of items) {
    for (const m of gm.means) if (Number.isFinite(m)) { if (m < lo) lo = m; if (m > hi) hi = m; }
  }
  if (Number.isFinite(overallY)) { if (overallY < lo) lo = overallY; if (overallY > hi) hi = overallY; }
  const y = padded(lo, hi, Number.isFinite(overallY) ? overallY - 1 : 0, Number.isFinite(overallY) ? overallY + 1 : 1, 0.15, 1);

  const cells = items.map(({ factor, gm }) => {
    const key = `factor-${factor.id}`;
    if (gm.levels.length === 0) {
      return { key, widget: null, config: null, label: labels.previewUnavailable.replace('{type}', 'main-effects'), placeholder: true };
    }
    const xs = gm.levels.map((_, i) => i);
    return chartCell(key, 'scatter-chart', {
      title: factor.name || '', titleSize: 12, labelSize: 11, tickSize: 10,
      xLabel: '', yLabel: yCol.name || '', showLegend: false,
      xMin: -0.5, xMax: gm.levels.length - 0.5, yMin: y.min, yMax: y.max, xTicks: xs, xTickLabels: gm.levels,
      refLines: Number.isFinite(overallY) ? [{ dir: 'h', value: overallY, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' }] : [],
      series: [{
        name: factor.name || '', color: CHART_COLORS[0], markerSize: 5,
        x: xs, y: gm.means.map(finiteOrNull),
        connectLine: { show: true, dash: 'solid', width: 2, color: CHART_COLORS[0] },
      }],
    });
  });
  return panels('row', items.length, cells);
}

function interactionPlot(cols) {
  const yCol = cols.find((c) => c.role === 'continuous');
  const factors = cols.filter(isCat);
  if (!yCol || factors.length < 2) return NONE;
  const fA = factors[0], fB = factors[1];
  const { aLevels, bLevels, means } = cellMeans(yCol.values || [], fA.values || [], fB.values || []);
  if (aLevels.length === 0 || bLevels.length === 0) return NONE;
  const series = bLevels.map((bName, bi) => {
    const color = CHART_COLORS[bi % CHART_COLORS.length];
    return {
      name: bName, color, markerSize: 5,
      x: aLevels.map((_, ai) => ai),
      y: aLevels.map((_, ai) => finiteOrNull(means[ai][bi])),
      connectLine: { show: true, dash: 'solid', width: 2, color },
    };
  });
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s.y) if (v !== null) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const y = padded(lo, hi, (lo === hi && Number.isFinite(lo)) ? lo - 1 : 0, Number.isFinite(hi) ? hi + 1 : 1, 0.15, 1);
  return {
    kind: /** @type {const} */ ('single'), widget: 'scatter-chart',
    config: {
      title: '', titleSize: 13, labelSize: 11, tickSize: 10,
      xLabel: fA.name || '', yLabel: yCol.name || '', showLegend: true,
      xMin: -0.5, xMax: aLevels.length - 0.5, yMin: y.min, yMax: y.max,
      xTicks: aLevels.map((_, i) => i), xTickLabels: aLevels,
      series,
    },
  };
}

function boxplotTrellis(cols) {
  const yCol = cols.find((c) => c.role === 'continuous');
  const factors = cols.filter(isCat);
  if (!yCol || factors.length < 2) return NONE;
  const fA = factors[0], fB = factors[1];
  const yVals = yCol.values || [], aVals = fA.values || [], bVals = fB.values || [];
  const N = Math.min(yVals.length, aVals.length, bVals.length);
  const levelOf = (v) => (v == null ? '' : String(v));
  const aLevels = [], bLevels = [];
  const seenA = new Set(), seenB = new Set();
  for (let i = 0; i < N; i++) {
    const a = levelOf(aVals[i]), b = levelOf(bVals[i]);
    if (!seenA.has(a)) { seenA.add(a); aLevels.push(a); }
    if (!seenB.has(b)) { seenB.add(b); bLevels.push(b); }
  }
  if (aLevels.length === 0 || bLevels.length === 0) return NONE;
  const bucket = new Map();
  for (const b of bLevels) bucket.set(b, new Map(aLevels.map((a) => [a, []])));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const v = toNum(yVals[i]);
    if (!Number.isFinite(v)) continue;
    bucket.get(levelOf(bVals[i])).get(levelOf(aVals[i])).push(v);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const x = padded(Number.isFinite(lo) ? lo : NaN, Number.isFinite(hi) ? hi : NaN,
    Number.isFinite(lo) ? lo - 1 : 0, Number.isFinite(hi) ? hi + 1 : 1, 0.05, 0.5);
  const cells = bLevels.map((bLevel, bi) => {
    const title = `${fB.name || ''}: ${bLevel}`.trim();
    return chartCell(`level-${bi}`, 'boxplot-chart', {
      title, titleSize: 12, labelSize: 11, tickSize: 10,
      xLabel: yCol.name || '', yLabel: '', showLegend: false, showMean: true, showOutliers: true,
      xMin: x.min, xMax: x.max,
      groups: aLevels.map((aLevel, ai) => ({ name: aLevel, values: bucket.get(bLevel).get(aLevel), color: CHART_COLORS[ai % CHART_COLORS.length] })),
    });
  });
  return panels('row', bLevels.length, cells);
}

function scatterMarginal(cols, kind) {
  const cont = cols.filter((c) => c.role === 'continuous');
  if (cont.length < 2) return NONE;
  const xCol = cont[0], yCol = cont[1];
  const { xs, ys } = finitePairs(xCol.values || [], yCol.values || []);
  if (xs.length === 0) return NONE;
  const range = (vals) => {
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const p = (mx - mn) * 0.05 || 0.5;
    return { min: mn - p, max: mx + p };
  };
  const xR = range(xs), yR = range(ys);
  const scatter = chartCell('scatter', 'scatter-chart', {
    title: '', xLabel: xCol.name || '', yLabel: yCol.name || '',
    xMin: xR.min, xMax: xR.max, yMin: yR.min, yMax: yR.max, showLegend: false,
    series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }],
  });
  let top, right;
  if (kind === 'boxplot') {
    top = chartCell('marginal-x', 'boxplot-chart', {
      title: '', xLabel: '', yLabel: '', showLegend: false, showMean: false,
      xMin: xR.min, xMax: xR.max, groups: [{ name: '', values: xs, color: CHART_COLORS[0] }],
    });
    right = chartCell('marginal-y', 'boxplot-chart', {
      title: '', xLabel: '', yLabel: '', showLegend: false, showMean: false, orientation: 'vertical',
      yMin: yR.min, yMax: yR.max, groups: [{ name: '', values: ys, color: CHART_COLORS[0] }],
    });
  } else {
    top = chartCell('marginal-x', 'histogram-chart', {
      title: '', xLabel: '', yLabel: '', showLegend: false, showXTicks: false, showYTicks: false,
      xMin: xR.min, xMax: xR.max, data: xs, barColor: CHART_COLORS[0],
    });
    right = chartCell('marginal-y', 'histogram-chart', {
      title: '', xLabel: '', yLabel: '', showLegend: false, showXTicks: false, showYTicks: false,
      orientation: 'horizontal', yMin: yR.min, yMax: yR.max, data: ys, barColor: CHART_COLORS[0],
    });
  }
  return panels('marginal', 2, [top, textCell('blank', ''), scatter, right]);
}

function cusumStacked(cols, labels) {
  const prep = collectTimeOrderedSeries(cols.filter((c) => c.role === 'date'), cols.filter((c) => c.role === 'continuous'));
  if (!prep || prep.values.length < 3) return NONE;
  const sigma = estimateSigma(prep.values, 'mr');
  if (!(sigma > 0)) return NONE;
  const r = computeCUSUM(prep.values, mean(prep.values), sigma, 0.5, 4);
  const half = (key, label, values, signals) => chartCell(key, 'control-chart', {
    title: label, titleSize: 12, labelSize: 11, tickSize: 10,
    xLabel: prep.xLabel || labels.observation, yLabel: labels.cumulativeSum, showLegend: false,
    values, cl: [0], ucl: [r.h], lcl: [0], sigma: [0], showZones: false,
    violationIndices: [...new Set(signals)],
  });
  return panels('stack', 1, [half('c-plus', 'C⁺', r.cPlus, r.signalsHi), half('c-minus', 'C⁻', r.cMinus, r.signalsLo)]);
}

/**
 * Baut die Vorschau für einen Vorschlagstyp.
 * @param {string} type Diagrammtyp des Vorschlags
 * @param {Array<{ id?: string, name: string, role: string, values: any[] }>} cols die gewählten Spalten
 * @param {import('./charts.js').ChartLabels} labels Texte der Vorschau
 * @returns {Preview} `none`, wenn Typ oder Spalten nicht reichen
 */
export function buildPreview(type, cols, labels) {
  switch (type) {
    case 'scatter-matrix': return scatterMatrix(cols);
    case 'main-effects': return mainEffects(cols, labels);
    case 'interaction-plot': return interactionPlot(cols);
    case 'boxplot':
      if (cols.filter(isCat).length === 2) return boxplotTrellis(cols);
      break;
    case 'scatter-marginal-boxplot': return scatterMarginal(cols, 'boxplot');
    case 'scatter-marginal-histogram': return scatterMarginal(cols, 'histogram');
    case 'cusum': return cusumStacked(cols, labels);
    default:
  }
  const built = buildChartConfig(type, cols, labels);
  return built ? { kind: /** @type {const} */ ('single'), widget: built.widget, config: built.config } : NONE;
}
