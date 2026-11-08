/**
 * D.Mike — Histogramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';

const BIN_MODES_0 = ['auto', 'manual'];

/** @param {unknown} v @returns {{ instanceId: string, sheetId?: string, columnId: string }|null} */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string' || !r.instanceId || !r.columnId) return null;
  return { instanceId: r.instanceId, ...(typeof r.sheetId === 'string' && r.sheetId ? { sheetId: r.sheetId } : {}), columnId: r.columnId };
}
/** @param {unknown} v @param {(n: number) => boolean} ok @returns {number|undefined} */
const numberOr = (v, ok) => (typeof v === 'number' && Number.isFinite(v) && ok(v) ? v : undefined);

/** Vorgaben der alten Diagrammfelder: gleich → entfällt. */
const CHART_DEFAULTS = { showTitle: true, titleSize: 15, labelSize: 12, tickSize: 11, showXLabel: true, showYLabel: true, showXTicks: true, showYTicks: true, barGap: 1 };
const TEXTS = { chartTitleText: 'title', chartXLabelText: 'xLabel', chartYLabelText: 'yLabel' };

/** Bearbeitbare Schlüssel einer Reihe und ihre Feldbeschreibungen (ohne `name`). */
const CHART_SHAPE = /** @type {Record<string, any>} */ (histogramChart.edits().shape);
const SERIES_SHAPE = /** @type {Record<string, any>} */ (CHART_SHAPE.series.item.shape);

/**
 * Prüft einen Wert gegen die Feldart; ungültig → `undefined`.
 * @param {any} spec @param {string} k @param {unknown} v @returns {any}
 */
function validOrUndefined(spec, k, v) {
  try { return checkValue(spec, k, v); } catch { return undefined; }
}

/**
 * Reihen-Einstellungen des alten Stands. Wie die alte Laufzeit gilt Eintrag `i`
 * für die Reihe `i`; `names[i]` ist deren Name (fehlt er, gilt der Name im
 * Eintrag). Reihen ohne Namen, unbekannte Schlüssel und ungültige Einzelwerte
 * entfallen; ein Eintrag ohne übrige Schlüssel entfällt ganz. Doppelte Namen
 * (dieselbe Spalte mehrfach) behalten je einen eigenen Eintrag.
 * @param {unknown} old
 * @param {unknown[]} [names] Reihennamen in Reihenfolge der Datensätze
 * @returns {Array<Record<string, any>>}
 */
export function seriesFrom(old, names = []) {
  if (!Array.isArray(old)) return [];
  const out = [];
  for (let i = 0; i < old.length; i++) {
    const o = old[i];
    if (!o || typeof o !== 'object') continue;
    const name = typeof names[i] === 'string' && names[i] !== '' ? names[i] : o.name;
    if (typeof name !== 'string' || name === '') continue;
    const entry = {};
    for (const [k, spec] of Object.entries(SERIES_SHAPE)) {
      if (k === 'name' || !(k in o) || o[k] === null || o[k] === undefined) continue;
      const v = validOrUndefined(spec, k, o[k]);
      if (v !== undefined) entry[k] = v;
    }
    if (Object.keys(entry).length > 0) out.push({ name, ...entry });
  }
  return out;
}

/**
 * '0→2.0': Altstände ohne `_schema` (flache Form, v1 mit `seriesRefs`).
 * Reihen-Einstellungen (`seriesOverrides`) werden nach Reihenname in
 * `histogramChart.series` übernommen (Zuordnung über den Index); Einträge ohne Namen entfallen.
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
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  if (typeof json.showStats === 'boolean') out.showStats = json.showStats;

  const chart = {};
  for (const [from, to] of Object.entries(TEXTS)) if (typeof json[from] === 'string' && json[from] !== '') chart[to] = json[from];
  for (const [k, d] of Object.entries(CHART_DEFAULTS)) {
    const v = json[k];
    if (typeof v !== typeof d || v === d) continue;
    const ok = validOrUndefined(CHART_SHAPE[k], k, v);
    if (ok !== undefined && ok !== d) chart[k] = ok;
  }
  if (typeof json.bgColor === 'string' && json.bgColor) chart.bgColor = json.bgColor;
  for (const k of ['refLines', 'refAreas']) {
    if (!Array.isArray(json[k])) continue;
    const kept = json[k].map((e) => validOrUndefined(CHART_SHAPE[k].item, k, e)).filter((e) => e !== undefined);
    if (kept.length > 0) chart[k] = kept;
  }
  if (json.showPareto === false) chart.pareto = false;
  if (json.showBoxplot === false) chart.boxplotStrip = false;
  const series = seriesFrom(json.seriesOverrides, []);
  if (series.length > 0) chart.series = series;
  out.histogramChart = chart;
  return out;
}
