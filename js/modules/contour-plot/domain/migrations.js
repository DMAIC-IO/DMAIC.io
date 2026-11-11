/**
 * D.Mike — Konturdiagramm: Migrationen des gespeicherten Zustands. Rein.
 *
 * Jede Funktion beschreibt einen festen Formatstand und importiert darum
 * nichts aus model.js; die alten Vorgaben stehen hier als Literale.
 */
import { checkValue } from '../../../core/model.js';
import contourChart from '../../../widgets/contour-chart/schema.js';

const MODEL_TYPES_0 = ['quadratic', 'interaction', 'custom'];
const COLOR_SCHEMES_0 = ['viridis', 'plasma', 'thermal', 'green', 'grayscale'];

/** Alte Vorgaben der Darstellung: gleich → entfällt. */
const DISPLAY_DEFAULTS_0 = { numLevels: 10, gridRes: 100, colorScheme: 'viridis', showLines: true, showLabels: true, showDataPoints: false };

/** Alte Vorgaben von `chartConfig`: gleich → entfällt. */
const CHART_CONFIG_DEFAULTS_0 = {
  showTitle: true, title: '',
  titleSize: 15, labelSize: 13, tickSize: 11,
  showXLabel: true, showYLabel: true,
  showXTicks: true, showYTicks: true,
  bgColor: '',
  markerSymbol: 'circle', markerSize: 10, markerColor: '',
  markerStroke: 'rgba(255,255,255,1)', markerStrokeWidth: 2, markerStrokeDash: 'solid',
};

/** Schlüssel aus `chartConfig`, die es in den Editor-Einstellungen nicht mehr gibt. */
const DROPPED_CHART_KEYS_0 = ['xLabelText', 'yLabelText'];

/** Feldbeschreibungen der Editor-Einstellungen des Konturdiagramms. */
const EDIT_SHAPE = /** @type {Record<string, any>} */ (/** @type {any} */ (contourChart.edits()).shape);

/**
 * Zahl aus einem alten Wert (Zahl oder Text), sonst `fallback`.
 * @param {unknown} v @param {number} fallback @returns {number}
 */
function num(v, fallback) {
  const n = typeof v === 'number' ? v
    : (typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Wert gegen die Feldart der Editor-Einstellung; ungültig → `undefined`.
 * @param {string} k @param {unknown} v @returns {any}
 */
function validEdit(k, v) {
  const spec = EDIT_SHAPE[k];
  if (!spec) return undefined;
  try { return checkValue(spec, k, v); } catch { return undefined; }
}

/**
 * Spaltenbezug aus dem alten Stand, oder null.
 * @param {unknown} d
 * @returns {{ instanceId: string, sheetId?: string, columnId: string }|null}
 */
function refFrom(d) {
  const r = /** @type {any} */ (d);
  if (!r || typeof r !== 'object' || r.instanceId == null || r.columnId == null) return null;
  const instanceId = String(r.instanceId);
  const columnId = String(r.columnId);
  if (!instanceId || !columnId) return null;
  const sheetId = r.sheetId == null ? '' : String(r.sheetId);
  return { instanceId, ...(sheetId ? { sheetId } : {}), columnId };
}

/**
 * Sechs Koeffizienten: fehlende Einträge werden 0, überzählige entfallen.
 * @param {unknown} v @returns {number[]|undefined}
 */
function coeffs(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (let i = 0; i < 6; i++) out.push(num(v[i], 0));
  return out;
}

/**
 * Bezugslinien oder -bereiche: nur gültige Einträge, leer → `undefined`.
 * @param {string} k @param {unknown} v @returns {any[]|undefined}
 */
function refList(k, v) {
  if (!Array.isArray(v)) return undefined;
  const item = EDIT_SHAPE[k].item;
  const kept = v.flatMap((e, i) => {
    try { return [checkValue(item, `${k}[${i}]`, e)]; } catch { return []; }
  });
  return kept.length > 0 ? kept : undefined;
}

/**
 * Die Editor-Einstellungen aus dem alten Stand: nur Abweichungen von den
 * alten Vorgaben, geklemmt auf die heutigen Bereiche, Ungültiges entfällt.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
function chartEditsFrom(json) {
  const out = {};
  if (typeof json.numLevels === 'number' && Number.isFinite(json.numLevels)) {
    const n = Math.round(Math.min(20, Math.max(4, json.numLevels)));
    if (n !== DISPLAY_DEFAULTS_0.numLevels) out.numLevels = n;
  }
  if (typeof json.gridRes === 'number' && Number.isFinite(json.gridRes)) {
    const r = Math.round(Math.min(200, Math.max(40, json.gridRes)) / 10) * 10;
    if (r !== DISPLAY_DEFAULTS_0.gridRes) out.gridRes = r;
  }
  if (COLOR_SCHEMES_0.includes(json.colorScheme) && json.colorScheme !== DISPLAY_DEFAULTS_0.colorScheme) out.colorScheme = json.colorScheme;
  for (const k of ['showLines', 'showLabels', 'showDataPoints']) {
    if (typeof json[k] === 'boolean' && json[k] !== DISPLAY_DEFAULTS_0[k]) out[k] = json[k];
  }
  const cc = json.chartConfig && typeof json.chartConfig === 'object' ? json.chartConfig : {};
  for (const [k, v] of Object.entries(cc)) {
    if (DROPPED_CHART_KEYS_0.includes(k)) continue;
    if (Object.hasOwn(CHART_CONFIG_DEFAULTS_0, k) && v === CHART_CONFIG_DEFAULTS_0[k]) continue;
    if (v === null || v === undefined) continue;
    const valid = validEdit(k, v);
    if (valid !== undefined) out[k] = valid;
  }
  for (const k of ['refLines', 'refAreas']) {
    const list = refList(k, json[k]);
    if (list) out[k] = list;
  }
  return out;
}

/**
 * '0→1.0': Altform ohne `_schema` — `model` wird `modelType`, die drei
 * Spaltenbezüge werden eine Zeile in `datasets`, Darstellung und
 * `chartConfig` werden die Editor-Einstellungen `chartEdits`.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const out = {};
  out.modelType = MODEL_TYPES_0.includes(json.model) ? json.model : 'quadratic';
  const b = coeffs(json.b);
  if (b) out.b = b;
  if (typeof json.customFormula === 'string') out.customFormula = json.customFormula;
  for (const k of ['xLabel', 'yLabel', 'zLabel']) if (typeof json[k] === 'string') out[k] = json[k];
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) {
    const v = num(json[k], NaN);
    if (Number.isFinite(v)) out[k] = v;
  }
  out.datasets = [{ x: refFrom(json.colRefX), y: refFrom(json.colRefY), z: refFrom(json.colRefZ) }];
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chartEdits = chartEditsFrom(json);
  return out;
}
