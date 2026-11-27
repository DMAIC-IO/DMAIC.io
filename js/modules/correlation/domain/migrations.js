/**
 * D.Mike — Korrelation: Migrationen. Rein.
 */

/**
 * Ein Spaltenbezug mit drei Texten, sonst `null`.
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object') return null;
  const { instanceId, sheetId, columnId } = r;
  if (typeof instanceId !== 'string' || typeof sheetId !== 'string' || typeof columnId !== 'string') return null;
  return { instanceId, sheetId, columnId };
}

/**
 * Eine endliche Zahl in [0; 1], sonst `null`.
 * @param {unknown} v
 * @returns {number|null}
 */
const unitOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/**
 * '0→1.0': Altstände ohne `_schema` (`{ colRefs | colRefX/colRefY,
 * confidenceLevel, matrixMethod, filterMinR, filterMaxP, exampleWorksheetId }`).
 *
 * - `colRefs`: als Liste (leere Einträge fallen), sonst das Altpaar
 *   `[colRefX, colRefY]`; je Eintrag nur `{ instanceId, sheetId, columnId }`
 *   mit Texten, sonst fällt er. Doppelte bleiben stehen, sie entfernt die
 *   Reparatur der Invariante `uniqueColumnRefs` beim Laden.
 * - `confidenceLevel`: fehlt er, entfällt der Schlüssel (Vorgabe aus den
 *   Einstellungen); `null`, keine Zahl oder außerhalb [0,5; 0,9999] → 0,95.
 * - `matrixMethod`: unbekannt → `'pearson'`.
 * - `filterMinR`/`filterMaxP`: endliche Zahl in [0; 1], sonst `null`.
 * - `exampleWorksheetId`: Text oder `null`.
 * - `result`/`matrixResult` (abgeleitet) und fremde Schlüssel entfallen;
 *   alte Editor-Einstellungen übernimmt der Kern aus `chartEdits`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const list = Array.isArray(json.colRefs)
    ? json.colRefs.filter(Boolean)
    : (json.colRefX || json.colRefY) ? [json.colRefX, json.colRefY].filter(Boolean) : [];
  out.colRefs = list.map(refOrNull).filter(Boolean);
  if ('confidenceLevel' in json) {
    const c = json.confidenceLevel;
    out.confidenceLevel = typeof c === 'number' && Number.isFinite(c) && c >= 0.5 && c <= 0.9999 ? c : 0.95;
  }
  out.matrixMethod = ['pearson', 'spearman', 'kendall'].includes(json.matrixMethod) ? json.matrixMethod : 'pearson';
  out.filterMinR = unitOrNull(json.filterMinR);
  out.filterMaxP = unitOrNull(json.filterMaxP);
  out.exampleWorksheetId = typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null;
  return out;
}
