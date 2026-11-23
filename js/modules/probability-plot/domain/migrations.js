/**
 * D.Mike — Wahrscheinlichkeitsnetz: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import probabilityPlotChart from '../../../widgets/probability-plot-chart/schema.js';

/** Form der Diagrammfelder und einer Reihe (mit `name`). */
const CHART_SHAPE = /** @type {Record<string, any>} */ (probabilityPlotChart.edits().shape);
const SERIES_SHAPE = /** @type {Record<string, any>} */ (CHART_SHAPE.series.item.shape);

/** Die Schlüssel einer alten Reihen-Einstellung: der Name und die bearbeitbaren. */
const SERIES_KEYS = ['name', ...probabilityPlotChart.editable.series];

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

/**
 * Reihen-Einstellungen des alten Stands je Index, samt `name`. Texte, die
 * das Altmodul nur nichtleer anwandte, entfallen leer; ungültige Einzelwerte
 * und fremde Schlüssel entfallen; ein Eintrag ohne gültige Schlüssel bleibt
 * `{}` (Index halten). Ohne gültigen Eintrag eine leere Liste.
 * @param {unknown} old
 * @returns {Array<Record<string, any>>}
 */
export function legacySeriesFrom(old) {
  if (!Array.isArray(old)) return [];
  const out = old.map((o) => {
    /** @type {Record<string, any>} */
    const entry = {};
    if (!o || typeof o !== 'object') return entry;
    for (const k of SERIES_KEYS) {
      const v = o[k];
      if (v === null || v === undefined || v === '') continue;
      const ok = validOrUndefined(SERIES_SHAPE[k], k, v);
      if (ok !== undefined) entry[k] = ok;
    }
    return entry;
  });
  return out.some((e) => Object.keys(e).length > 0) ? out : [];
}

/**
 * Die Zeilen der Datensätze: `datasets` (Nicht-Objekte werden eine leere
 * Zeile), sonst die Altform `columnRef` als eine Zeile ohne Gruppe.
 * @param {Record<string, any>} json
 * @returns {Array<{ valueRef: object|null, groupRef: object|null }>}
 */
function rowsFrom(json) {
  if (Array.isArray(json.datasets)) {
    return json.datasets.map((d) => (d && typeof d === 'object'
      ? { valueRef: refOrNull(d.valueRef), groupRef: refOrNull(d.groupRef) }
      : { valueRef: null, groupRef: null }));
  }
  if (json.columnRef) return [{ valueRef: refOrNull(json.columnRef), groupRef: null }];
  return [];
}

/**
 * '0→1.0': Altstände ohne `_schema` (`datasets`, die Altform `columnRef` und
 * die Vorbelegung der Diagrammempfehlung). Hintergrund, Bezugslinien und
 * -bereiche wandern in `chart`, die Reihen-Einstellungen (`seriesOverrides`)
 * je Index in `legacySeries`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const rows = rowsFrom(json);
  if (rows.length > 0) out.datasets = rows;
  if (typeof json.confLevel === 'number' && Number.isFinite(json.confLevel) && json.confLevel > 0) out.confLevel = json.confLevel;
  if (json.showStats != null) out.showStats = Boolean(json.showStats);
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;

  /** @type {Record<string, any>} */
  const chart = {};
  if (typeof json.bgColor === 'string' && json.bgColor !== '') chart.bgColor = json.bgColor;
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
