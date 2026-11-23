/**
 * D.Mike — Ausreißertest: Migrationen. Rein.
 */

/** Die Verfahren in der festen Reihenfolge (Formatstand 1.0). */
const METHODS = ['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z'];

/** Die Seiten der Tests. */
const SIDES = ['two-sided', 'upper', 'lower'];

/** Bereich der Schwellen (Formatstand 1.0). */
const RANGES = {
  tukeyFactor: [0.1, 10],
  hampelK: [0.1, 20],
  zThreshold: [0.1, 10],
  modZThreshold: [0.1, 10],
};

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
 * Eine Zahl wie das alte Laden (`Number(v)`, auch aus Text) im Bereich;
 * sonst `undefined` (dann greift die Vorgabe).
 * @param {unknown} v @param {number} min @param {number} max
 * @returns {number|undefined}
 */
function inRange(v, min, max) {
  if (v == null || typeof v === 'boolean' || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

/**
 * '0→1.0': Altstände ohne `_schema`. Werte außerhalb des Bereichs entfallen
 * (dann greift die Vorgabe, bei `alpha` die Kontextvorgabe aus dem
 * Konfidenzniveau); `esdMaxOutliers` über 50 wird 50; `enabled` behält die
 * bekannten Verfahren in fester Reihenfolge ohne Doppelte.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.colRef = refOrNull(json.colRef);

  const alpha = inRange(json.alpha, 0.0001, 0.5);
  if (alpha !== undefined) out.alpha = alpha;

  if (SIDES.includes(json.side)) out.side = json.side;

  for (const [k, [min, max]] of Object.entries(RANGES)) {
    const n = inRange(json[k], min, max);
    if (n !== undefined) out[k] = n;
  }

  if (json.esdMaxOutliers != null) {
    const n = parseInt(json.esdMaxOutliers, 10);
    out.esdMaxOutliers = Number.isFinite(n) && n > 0 ? Math.min(n, 50) : null;
  }

  if (Array.isArray(json.enabled)) {
    const kept = METHODS.filter((id) => json.enabled.includes(id));
    if (kept.length > 0) out.enabled = kept;
  }

  if (json.chartMethod === 'all' || METHODS.includes(json.chartMethod)) out.chartMethod = json.chartMethod;

  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
