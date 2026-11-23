/**
 * D.Mike — Boxplot: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import boxplotChart from '../../../widgets/boxplot-chart/schema.js';

/** Form der Diagrammfelder. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (boxplotChart.edits().shape);

/** Vorgaben der alten Schalter: nur `false` weicht ab. */
const SWITCHES = /** @type {const} */ (['showMean', 'showOutliers']);

/**
 * Wie das alte Laden: `instanceId`, `sheetId` und `columnId` müssen gesetzt
 * sein und werden Text; leerer Text zählt als fehlend.
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object' || r.instanceId == null || r.sheetId == null || r.columnId == null) return null;
  const out = { instanceId: String(r.instanceId), sheetId: String(r.sheetId), columnId: String(r.columnId) };
  return out.instanceId && out.sheetId && out.columnId ? out : null;
}

/**
 * Prüft einen Wert gegen die Feldart; ungültig → `undefined`.
 * @param {any} spec @param {string} k @param {unknown} v @returns {any}
 */
function validOrUndefined(spec, k, v) {
  try { return checkValue(spec, k, v); } catch { return undefined; }
}

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @returns {v is string} */
const nonEmpty = (v) => typeof v === 'string' && v !== '';

/**
 * Eine Bezugslinie bzw. ein Bezugsbereich der Altform: ohne gültiges `dir`
 * zeichnete der Typ eine senkrechte Linie bzw. einen Bereich auf der
 * x-Achse; Schlüssel außerhalb der Form (`axis`, `style`, …) entfallen.
 * @param {unknown} e @param {string[]} dirs @param {string} fallback @param {Record<string, any>} shape
 * @returns {unknown}
 */
function refEntry(e, dirs, fallback, shape) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
  const src = /** @type {Record<string, any>} */ (e);
  /** @type {Record<string, any>} */
  const out = Object.fromEntries(Object.entries(src).filter(([k]) => k in shape));
  if (!dirs.includes(out.dir)) out.dir = fallback;
  return out;
}

/**
 * Die Darstellungsfelder des alten Stands: nur Abweichungen von den alten
 * Vorgaben, Ungültiges einzeln verworfen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
function chartFrom(json) {
  /** @type {Record<string, any>} */
  const chart = {};
  for (const k of SWITCHES) if (json[k] === false) chart[k] = false;
  if (nonEmpty(json.bgColor)) chart.bgColor = json.bgColor;
  if (Array.isArray(json.boxColors) && json.boxColors.some(nonEmpty)) {
    chart.boxColors = Array.from(json.boxColors, (c) => (nonEmpty(c) ? c : null));
  }
  for (const [k, dirs, fallback] of /** @type {const} */ ([['refLines', ['h', 'v'], 'v'], ['refAreas', ['x', 'y'], 'x']])) {
    if (!Array.isArray(json[k])) continue;
    const item = CHART_SHAPE[k].item;
    const kept = json[k]
      .map((e) => validOrUndefined(item, k, refEntry(e, [...dirs], fallback, item.shape)))
      .filter((e) => e !== undefined);
    if (kept.length > 0) chart[k] = kept;
  }
  for (const [k, v] of Object.entries(chart)) {
    if (validOrUndefined(CHART_SHAPE[k], k, v) === undefined) delete chart[k];
  }
  return chart;
}

/**
 * Die Zeilen der Datensätze: die Altform `mode: 'grouped'` mit einem
 * `valueRef`, sonst die gültigen Bezüge aus `seriesRefs`; Zeile i nimmt
 * `groupRefs[i]` (Index der gefilterten Liste, wie das alte Laden).
 * @param {Record<string, any>} json
 * @returns {Array<{ value: object, group: object|null }>}
 */
function rowsFrom(json) {
  if (json.mode === 'grouped' && json.valueRef) {
    const value = refOrNull(json.valueRef);
    return value ? [{ value, group: refOrNull(json.groupRef) }] : [];
  }
  if (!Array.isArray(json.seriesRefs)) return [];
  const groupRefs = Array.isArray(json.groupRefs) ? json.groupRefs : [];
  return json.seriesRefs
    .map(refOrNull)
    .filter((r) => r !== null)
    .map((value, i) => ({ value, group: refOrNull(groupRefs[i]) }));
}

/**
 * '0→1.0': Altstände ohne `_schema` (`seriesRefs`/`groupRefs`, die Altform
 * `mode: 'grouped'` und die Vorbelegung aus der Diagrammempfehlung). Die
 * Darstellungsfelder wandern in `chart`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const rows = rowsFrom(json);
  if (rows.length > 0) out.datasets = rows;
  if (finite(json.confLevel) && json.confLevel > 0) out.confLevel = json.confLevel;
  if (json.showStats === false) out.showStats = false;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json);
  return out;
}
