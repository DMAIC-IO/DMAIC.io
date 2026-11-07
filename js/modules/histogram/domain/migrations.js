/**
 * D.Mike — Histogramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';

const BIN_MODES_0 = ['auto', 'manual'];

/** @param {any} r @returns {{ instanceId: string, sheetId?: string, columnId: string }|null} */
function refOrNull(r) {
  if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string' || !r.instanceId || !r.columnId) return null;
  return { instanceId: r.instanceId, ...(typeof r.sheetId === 'string' && r.sheetId ? { sheetId: r.sheetId } : {}), columnId: r.columnId };
}
/** @param {unknown} v @param {(n: number) => boolean} ok @returns {number|undefined} */
const numberOr = (v, ok) => (typeof v === 'number' && Number.isFinite(v) && ok(v) ? v : undefined);

/** Vorgaben der alten Diagrammfelder: gleich → entfällt. */
const CHART_DEFAULTS = { showTitle: true, titleSize: 15, labelSize: 12, tickSize: 11, showXLabel: true, showYLabel: true, showXTicks: true, showYTicks: true, barGap: 1 };
const TEXTS = { chartTitleText: 'title', chartXLabelText: 'xLabel', chartYLabelText: 'yLabel' };

/** Bearbeitbare Schlüssel einer Reihe und ihre Feldbeschreibungen (ohne `name`). */
const SERIES_SHAPE = /** @type {Record<string, any>} */ (histogramChart.edits().shape.series.item.shape);

/**
 * Reihen-Einstellungen des alten Stands nach Reihenname. Einträge ohne Namen,
 * doppelte Namen (der erste gewinnt), unbekannte Schlüssel und ungültige
 * Einzelwerte entfallen; ein Eintrag ohne übrige Schlüssel entfällt ganz.
 * @param {unknown} old
 * @returns {Array<Record<string, any>>}
 */
function seriesFrom(old) {
  if (!Array.isArray(old)) return [];
  const seen = new Set();
  const out = [];
  for (const o of old) {
    if (!o || typeof o !== 'object' || typeof o.name !== 'string' || o.name === '' || seen.has(o.name)) continue;
    seen.add(o.name);
    const entry = {};
    for (const [k, spec] of Object.entries(SERIES_SHAPE)) {
      if (k === 'name' || !(k in o) || o[k] === null || o[k] === undefined) continue;
      try { entry[k] = checkValue(spec, k, o[k]); } catch { /* ungültiger Einzelwert entfällt */ }
    }
    if (Object.keys(entry).length > 0) out.push({ name: o.name, ...entry });
  }
  return out;
}

/**
 * '0→2.0': Altstände ohne `_schema` (flache Form, v1 mit `seriesRefs`).
 * Reihen-Einstellungen (`seriesOverrides`) werden nach Reihenname in
 * `histogramChart.series` übernommen; Einträge ohne Namen entfallen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  const out = {};
  const rows = Array.isArray(json.datasets)
    ? json.datasets.map((d) => ({ valueRef: refOrNull(d?.valueRef), groupRef: refOrNull(d?.groupRef) }))
    : (Array.isArray(json.seriesRefs) ? json.seriesRefs.map(refOrNull).filter(Boolean).map((valueRef) => ({ valueRef, groupRef: null })) : null);
  if (rows && rows.length > 0) out.datasets = rows;
  if (BIN_MODES_0.includes(json.binMode)) out.binMode = json.binMode;
  const bw = numberOr(json.binWidth, (n) => n > 0);
  out.binWidth = out.binMode === 'manual' && bw !== undefined ? bw : null;
  const cl = numberOr(json.confLevel, (n) => n > 0 && n < 100);
  if (cl !== undefined) out.confLevel = cl;
  out.exampleWorksheetId = typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null;
  if (typeof json.showStats === 'boolean') out.showStats = json.showStats;

  const chart = {};
  for (const [from, to] of Object.entries(TEXTS)) if (typeof json[from] === 'string' && json[from] !== '') chart[to] = json[from];
  for (const [k, d] of Object.entries(CHART_DEFAULTS)) {
    const v = json[k];
    if (typeof v === typeof d && v !== d && (typeof v !== 'number' || Number.isFinite(v))) chart[k] = v;
  }
  if (typeof json.bgColor === 'string' && json.bgColor) chart.bgColor = json.bgColor;
  for (const k of ['refLines', 'refAreas']) if (Array.isArray(json[k]) && json[k].length > 0) chart[k] = json[k];
  if (json.showPareto === false) chart.pareto = false;
  if (json.showBoxplot === false) chart.boxplotStrip = false;
  const series = seriesFrom(json.seriesOverrides);
  if (series.length > 0) chart.series = series;
  out.histogramChart = chart;
  return out;
}
