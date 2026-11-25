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
const CHART_DEFAULTS = { showTitle: true, titleSize: 15, labelSize: 12, tickSize: 11, showXLabel: true, showYLabel: true, showXTicks: true, showYTicks: true, showXGrid: true, showYGrid: true, barGap: 1 };
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
 * Reihen-Einstellungen des alten Stands je Index der Reihe (die alte Laufzeit
 * ordnete sie über den Index zu). Namen kennt die Migration nicht — sie hängen
 * an Arbeitsblatt und Sprache. Unbekannte Schlüssel und ungültige Einzelwerte
 * entfallen; ein Eintrag ohne gültige Schlüssel bleibt als `{}` (Index halten).
 * @param {unknown} old
 * @returns {Array<Record<string, any>>}
 */
export function legacySeriesFrom(old) {
  if (!Array.isArray(old)) return [];
  const out = old.map((o) => {
    const entry = {};
    if (!o || typeof o !== 'object') return entry;
    for (const [k, spec] of Object.entries(SERIES_SHAPE)) {
      if (k === 'name' || !(k in o) || o[k] === null || o[k] === undefined) continue;
      const v = validOrUndefined(spec, k, o[k]);
      if (v !== undefined) entry[k] = v;
    }
    return entry;
  });
  return out.some((e) => Object.keys(e).length > 0) ? out : [];
}

/**
 * '0→2.0': Altstände ohne `_schema` (flache Form, v1 mit `seriesRefs`).
 * Reihen-Einstellungen (`seriesOverrides`) landen je Index in `legacySeries`;
 * die Ansicht legt sie beim Rechnen auf die Reihe gleichen Index.
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
  const legacy = legacySeriesFrom(json.seriesOverrides);
  if (legacy.length > 0) out.legacySeries = legacy;
  out.histogramChart = chart;
  return out;
}
