/**
 * D.Mike — XY-Plot: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import { columnRefFromJSON } from '../../../core/chart/chart-data-prep.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { ERROR_BAR_KEYS, isColumnMode } from './error-bars.js';

/** Form der Diagrammfelder und einer Reihe (mit `name`). */
const CHART_SHAPE = /** @type {Record<string, any>} */ (scatterChart.edits().shape);
const SERIES_SHAPE = /** @type {Record<string, any>} */ (CHART_SHAPE.series.item.shape);
const CONNECT_SHAPE = /** @type {Record<string, any>} */ (SERIES_SHAPE.connectLine.shape);

/** Texte, die das Altmodul mit `||` las: leer hieß „nicht gesetzt“. */
const OR_TEXTS = new Set(['name', 'color', 'stroke', 'symbol']);

/**
 * Prüft einen Wert gegen die Feldart; ungültig → `undefined`.
 * @param {any} spec @param {string} k @param {unknown} v @returns {any}
 */
function validOrUndefined(spec, k, v) {
  try { return checkValue(spec, k, v); } catch { return undefined; }
}

/**
 * Spaltenbezug wie im alten `fromJSON`; leere ids → `null` (nie auflösbar).
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refOrNull(v) {
  const r = columnRefFromJSON(v);
  return r && r.instanceId && r.sheetId && r.columnId ? r : null;
}

/**
 * Verbindungslinie einer alten Reihe: gültige Schlüssel bleiben, `show` als
 * Wahrheitswert (die Zeichnung prüfte nur auf truthy).
 * @param {unknown} v
 * @returns {Record<string, any>|undefined}
 */
function connectLineFrom(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = /** @type {Record<string, unknown>} */ (v);
  /** @type {Record<string, any>} */
  const out = { show: Boolean(o.show) };
  for (const [k, spec] of Object.entries(CONNECT_SHAPE)) {
    if (k === 'show' || o[k] === null || o[k] === undefined) continue;
    const ok = validOrUndefined(spec, k, o[k]);
    if (ok !== undefined) out[k] = ok;
  }
  return out;
}

/**
 * Reihen-Einstellungen des alten Stands je Index der Reihe, samt `name`.
 * Unbekannte Schlüssel, ungültige Einzelwerte und leere Texte, die das
 * Altmodul übergangen hat, entfallen; ein Eintrag ohne gültige Schlüssel
 * bleibt als `{}` (Index halten).
 * @param {unknown} old
 * @returns {Array<Record<string, any>>}
 */
export function legacySeriesFrom(old) {
  if (!Array.isArray(old)) return [];
  const out = old.map((o) => {
    /** @type {Record<string, any>} */
    const entry = {};
    if (!o || typeof o !== 'object') return entry;
    for (const [k, spec] of Object.entries(SERIES_SHAPE)) {
      const v = o[k];
      if (v === null || v === undefined) continue;
      if (OR_TEXTS.has(k) && v === '') continue;
      const ok = k === 'connectLine' ? connectLineFrom(v) : validOrUndefined(spec, k, v);
      if (ok !== undefined) entry[k] = ok;
    }
    return entry;
  });
  return out.some((e) => Object.keys(e).length > 0) ? out : [];
}

/**
 * Fehlerbalken der Altform 1.9 (`{ mode, xPlus, xMinus, yPlus, yMinus }`, flach)
 * in der verschachtelten Form. Wie `errorBarsFromJSON` der Altform: ein
 * unbekannter Modus wird `none`; bei `constant` gelten nur endliche Zahlen,
 * bei `columns` und `columnsAbsolute` nur gültige Bezüge. Unpassende Werte fehlen.
 * @param {unknown} d
 * @returns {Record<string, any>}
 */
export function errorBarsFrom(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { mode: 'none' };
  const o = /** @type {Record<string, unknown>} */ (d);
  if (o.mode !== 'constant' && !isColumnMode(o.mode)) return { mode: 'none' };
  /** @type {Record<string, any>} */
  const values = {};
  for (const key of ERROR_BAR_KEYS) {
    const v = o[key];
    if (o.mode === 'constant') {
      if (typeof v === 'number' && Number.isFinite(v)) values[key] = v;
    } else {
      const r = refOrNull(v);
      if (r) values[key] = r;
    }
  }
  return { mode: o.mode, [o.mode]: values };
}

/**
 * Eine Zeile der Datensätze aus der Altform `{ xRef, yRef, groupRef, sizeRef, errorBars? }`.
 * @param {any} d
 * @returns {{ x: object|null, y: object|null, group: object|null, size: object|null, errorBars: Record<string, any> }}
 */
function rowFrom(d) {
  if (!d || typeof d !== 'object') return { x: null, y: null, group: null, size: null, errorBars: { mode: 'none' } };
  return {
    x: refOrNull(d.xRef), y: refOrNull(d.yRef), group: refOrNull(d.groupRef), size: refOrNull(d.sizeRef),
    errorBars: errorBarsFrom(d.errorBars),
  };
}

/**
 * '0→1.1': Altstände ohne `_schema` (v2 mit `datasets` samt Fehlerbalken aus
 * 1.9, v1 mit `colRefX` und `seriesRefs`). Referenzlinien, -flächen und Hintergrund wandern in `chart`,
 * Reihen-Einstellungen (`seriesOverrides`) je Index in `legacySeries`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  let rows = null;
  if (Array.isArray(json.datasets)) rows = json.datasets.map(rowFrom);
  else if (json.colRefX && Array.isArray(json.seriesRefs)) {
    const x = refOrNull(json.colRefX);
    rows = json.seriesRefs.map((y) => ({ x, y: refOrNull(y), group: null, size: null, errorBars: { mode: 'none' } }));
  }
  if (rows) out.datasets = rows.length > 0 ? rows : [{ x: null, y: null, group: null, size: null, errorBars: { mode: 'none' } }];

  out.showLines = typeof json.showLines === 'boolean' ? json.showLines : false;
  out.showMarkers = typeof json.showMarkers === 'boolean' ? json.showMarkers : true;
  out.showStats = json.showStats == null ? true : Boolean(json.showStats);
  if (typeof json.confLevel === 'number' && Number.isFinite(json.confLevel)) out.confLevel = json.confLevel;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;

  /** @type {Record<string, any>} */
  const chart = {};
  if (typeof json.bgColor === 'string' && json.bgColor) chart.bgColor = json.bgColor;
  for (const k of ['refLines', 'refAreas']) {
    if (!Array.isArray(json[k])) continue;
    const kept = json[k].map((e) => validOrUndefined(CHART_SHAPE[k].item, k, e)).filter((e) => e !== undefined);
    if (kept.length > 0) chart[k] = kept;
  }
  out.chart = chart;
  const legacy = legacySeriesFrom(json.seriesOverrides);
  if (legacy.length > 0) out.legacySeries = legacy;
  return out;
}

/**
 * '1.0→1.1': jede Zeile bekommt `errorBars: { mode: 'none' }`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from10(json) {
  if (!Array.isArray(json.datasets)) return json;
  return {
    ...json,
    datasets: json.datasets.map((d) => (d && typeof d === 'object' && !Array.isArray(d) && d.errorBars === undefined
      ? { ...d, errorBars: { mode: 'none' } } : d)),
  };
}
