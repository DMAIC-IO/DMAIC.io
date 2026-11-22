/**
 * D.Mike — Einzelwertdiagramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import individualValuePlotChart from '../../../widgets/individual-value-plot-chart/schema.js';

/** Form der Diagrammfelder. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (individualValuePlotChart.edits().shape);

/** Vorgaben der alten Darstellungsfelder: gleich → entfällt. */
const CHART_DEFAULTS = { showMean: true, showMedian: false, connectMeans: false, showOverallMean: false, jitter: 0.6, pointSymbol: 'circle', pointSize: 6 };
const SWITCHES = /** @type {const} */ (['showMean', 'showMedian', 'connectMeans', 'showOverallMean']);

/** @param {unknown} v @returns {{ instanceId: string, sheetId?: string, columnId: string }|null} */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string' || !r.instanceId || !r.columnId) return null;
  return { instanceId: r.instanceId, ...(typeof r.sheetId === 'string' && r.sheetId ? { sheetId: r.sheetId } : {}), columnId: r.columnId };
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
 * Die drei Gruppen einer Reihe: ein Array wird `[g0, g1, g2]`, ein einzelner
 * Bezug die erste Gruppe, alles andere leer.
 * @param {unknown} g
 * @returns {{ group: object|null, group2: object|null, group3: object|null }}
 */
function groupsFrom(g) {
  if (Array.isArray(g)) return { group: refOrNull(g[0]), group2: refOrNull(g[1]), group3: refOrNull(g[2]) };
  return { group: refOrNull(g), group2: null, group3: null };
}

/**
 * Die Darstellungsfelder des alten Stands: nur Abweichungen von den alten
 * Vorgaben, Bereichsfremdes geklemmt, Ungültiges verworfen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
function chartFrom(json) {
  /** @type {Record<string, any>} */
  const chart = {};
  for (const k of SWITCHES) if (typeof json[k] === 'boolean' && json[k] !== CHART_DEFAULTS[k]) chart[k] = json[k];
  if (finite(json.jitter)) {
    const j = Math.min(1, Math.max(0, json.jitter));
    if (j !== CHART_DEFAULTS.jitter) chart.jitter = j;
  }
  if (finite(json.pointSize)) {
    const s = Math.max(0, json.pointSize);
    if (s !== CHART_DEFAULTS.pointSize) chart.pointSize = s;
  }
  if (nonEmpty(json.pointSymbol) && json.pointSymbol !== CHART_DEFAULTS.pointSymbol) chart.pointSymbol = json.pointSymbol;
  if (Array.isArray(json.pointColors) && json.pointColors.some(nonEmpty)) {
    chart.pointColors = Array.from(json.pointColors, (c) => (nonEmpty(c) ? c : null));
  }
  if (nonEmpty(json.bgColor)) chart.bgColor = json.bgColor;
  for (const k of ['refLines', 'refAreas']) {
    if (!Array.isArray(json[k])) continue;
    const kept = json[k].map((e) => validOrUndefined(CHART_SHAPE[k].item, k, e)).filter((e) => e !== undefined);
    if (kept.length > 0) chart[k] = kept;
  }
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`seriesRefs` mit `groupRefs` je Reihe,
 * auch die Vorbelegung aus der Diagrammempfehlung mit einem Gruppenbezug
 * oder `null` je Reihe). Die Darstellungsfelder wandern in `chart`. Ein
 * fehlendes `confLevel` entfällt, damit die Kontextvorgabe greift.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  if (Array.isArray(json.seriesRefs)) {
    // Wie das alte Laden: nur Objekte zählen als Reihe, Reihe i nimmt groupRefs[i].
    const series = json.seriesRefs.filter((r) => r && typeof r === 'object');
    const groupRefs = Array.isArray(json.groupRefs) ? json.groupRefs : [];
    const rows = series
      .map((r, i) => ({ value: refOrNull(r), ...groupsFrom(groupRefs[i]) }))
      .filter((row) => row.value !== null);
    if (rows.length > 0) out.datasets = rows;
  }
  // Fehlt das Feld, greift die Vorgabe aus dem Kontext; `null` und Bereichsfremdes werden 95.
  if (Object.hasOwn(json, 'confLevel')) {
    out.confLevel = finite(json.confLevel) && json.confLevel > 0 && json.confLevel < 100 ? json.confLevel : 95;
  }
  if (typeof json.showStats === 'boolean') out.showStats = json.showStats;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json);
  return out;
}
