/**
 * D.Mike — Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Migrationen. Rein.
 */

/** Kartentypen und ihr Untergruppenbereich (Stand der Altform). */
const RANGE = { 'i-mr': [1, 1], 'xbar-r': [2, 10], 'xbar-s': [2, 25] };

/** Die Nelson-Regeln der Altform. */
const RULES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Ein Anmerkungsschlüssel in Normalform: ganze Zahl ab 0 ohne führende Nullen. */
const INDEX_KEY = /^(0|[1-9]\d*)$/;

/**
 * Wie das alte Laden eines Spaltenbezugs: `instanceId`, `sheetId` und
 * `columnId` müssen gesetzt sein und werden Text; leerer Text zählt als
 * fehlend (daraus las die Altform keine Spalte).
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object' || r.instanceId == null || r.sheetId == null || r.columnId == null) return null;
  const out = { instanceId: String(r.instanceId), sheetId: String(r.sheetId), columnId: String(r.columnId) };
  return out.instanceId && out.sheetId && out.columnId ? out : null;
}

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => v !== null && typeof v === 'object';

/**
 * Die Untergruppengröße: eine endliche Zahl über 0 bleibt (sonst 1), wird
 * gerundet und in den Bereich des Kartentyps geklemmt wie der alte
 * Kartentypwechsel.
 * @param {unknown} v @param {'i-mr'|'xbar-r'|'xbar-s'} chartTypeId
 * @returns {number}
 */
function subgroupOf(v, chartTypeId) {
  const n = finite(v) && v > 0 ? Math.round(v) : 1;
  const [lo, hi] = RANGE[chartTypeId];
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Die Anmerkungen: je Eintrag mit Punktschlüssel und Objektwert Kommentar als
 * Text und Ausschluss als Wahrheitswert, wie Verletzungsliste und
 * Ausschlussliste der Altform sie lasen. Andere Einträge entfallen einzeln.
 * @param {unknown} v
 * @returns {Record<string, { comment: string, excluded: boolean }>}
 */
function annotationsOf(v) {
  /** @type {Record<string, { comment: string, excluded: boolean }>} */
  const out = {};
  if (!isObject(v) || Array.isArray(v)) return out;
  for (const [k, a] of Object.entries(v)) {
    if (!INDEX_KEY.test(k) || !Number.isSafeInteger(Number(k)) || !isObject(a)) continue;
    out[k] = { comment: a.comment ? String(a.comment) : '', excluded: Boolean(a.excluded) };
  }
  return out;
}

/** @param {any} l @returns {{ cl: number|null, ucl: number|null, lcl: number|null, sigma: number|null }} */
const limitsOf = (l) => ({
  cl: finite(l.cl) ? l.cl : null,
  ucl: finite(l.ucl) ? l.ucl : null,
  lcl: finite(l.lcl) ? l.lcl : null,
  sigma: finite(l.sigma) ? l.sigma : null,
});

/**
 * Die eingefrorenen Grenzen. Übernommen nur mit bekanntem Kartentyp,
 * Untergruppe über 0 und Objekten für beide Teilkarten (ohne eines davon
 * konnte die Altform die Grenzen nie anwenden); sonst `null`.
 * @param {unknown} v
 * @returns {Record<string, any>|null}
 */
function frozenOf(v) {
  if (!isObject(v)) return null;
  const { chartTypeId, subgroupSize, primary, secondary } = v;
  if (typeof chartTypeId !== 'string' || !Object.hasOwn(RANGE, chartTypeId)) return null;
  if (!finite(subgroupSize) || subgroupSize <= 0 || !isObject(primary) || !isObject(secondary)) return null;
  return {
    chartTypeId,
    subgroupSize: Math.max(1, Math.round(subgroupSize)),
    columnRef: refOrNull(v.columnRef),
    baselineEnd: finite(v.baselineEnd) ? v.baselineEnd : null,
    primary: limitsOf(primary),
    secondary: limitsOf(secondary),
    excludedIndices: Array.isArray(v.excludedIndices)
      ? v.excludedIndices.filter((i) => Number.isSafeInteger(i) && i >= 0)
      : [],
  };
}

/**
 * '0→1.0': Altstände ohne `_schema` (`{ chartTypeId, subgroupSize,
 * columnRef, baselineCount, stagesText, usl, lsl, enabledRules, annotations,
 * frozenLimits, exampleWorksheetId }`). Nicht strenger als das alte
 * `fromJSON`, das Anmerkungen und eingefrorene Grenzen ungeprüft nahm: es
 * bleibt, was die Altform darstellen oder anwenden konnte.
 *
 * - `chartTypeId`: bekannter Typ bleibt, sonst I-MR.
 * - `subgroupSize`: gerundet und in den Bereich des Kartentyps geklemmt.
 * - `columnRef`: wie das alte Laden, sonst `null`.
 * - `baselineCount`: über 0 aufgerundet (so viele Punkte nahm die Engine),
 *   sonst `null` (alle).
 * - `stagesText`: nur Text bleibt; `usl`/`lsl`: nur endliche Zahlen.
 * - `enabledRules`: bekannte Regeln, ohne Doppelte, sortiert; ohne Liste
 *   Regel 1.
 * - `annotations`, `frozenLimits`: siehe oben.
 * - `exampleWorksheetId`: nur Text bleibt.
 * - Fremdschlüssel entfallen. Die Altform hatte keine Darstellungsfelder;
 *   alte Editor-Einstellungen je Teilkarte übernimmt der Kern beim Einhängen
 *   aus `chartEdits`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const chartTypeId = typeof json.chartTypeId === 'string' && Object.hasOwn(RANGE, json.chartTypeId)
    ? /** @type {'i-mr'|'xbar-r'|'xbar-s'} */ (json.chartTypeId)
    : 'i-mr';
  out.chartTypeId = chartTypeId;
  out.subgroupSize = subgroupOf(json.subgroupSize, chartTypeId);
  out.columnRef = refOrNull(json.columnRef);
  out.baselineCount = finite(json.baselineCount) && json.baselineCount > 0 ? Math.ceil(json.baselineCount) : null;
  out.stagesText = typeof json.stagesText === 'string' ? json.stagesText : '';
  out.usl = finite(json.usl) ? json.usl : null;
  out.lsl = finite(json.lsl) ? json.lsl : null;
  out.enabledRules = Array.isArray(json.enabledRules)
    ? [...new Set(json.enabledRules.filter((r) => RULES.includes(r)))].sort((a, b) => a - b)
    : [1];
  out.annotations = annotationsOf(json.annotations);
  out.frozenLimits = frozenOf(json.frozenLimits);
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
