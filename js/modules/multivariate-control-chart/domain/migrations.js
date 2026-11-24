/**
 * D.Mike — Multivariate Regelkarte: Migrationen. Rein.
 */

/**
 * Wie das alte Laden (`columnRefFromJSON`): `instanceId`, `sheetId` und
 * `columnId` müssen gesetzt sein und werden Text; leerer Text zählt als
 * fehlend.
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
 * '0→1.0': Altstände ohne `_schema` (`{ columnRefs, alpha, baselineCount,
 * exampleWorksheetId }`).
 *
 * - `columnRefs`: je Eintrag wie das alte Laden; ungültige Einträge fallen
 *   einzeln weg, keine Liste wird `[]`. Doppelte bleiben stehen, sie
 *   entfernt die Reparatur der Invariante `uniqueColumnRefs` beim Laden.
 * - `alpha`: nur eine endliche Zahl mit 0 < α < 1 bleibt, sonst greift die
 *   Vorgabe 0,0027 (auch für Text wie `'0.01'`, wie bisher).
 * - `baselineCount`: wie bisher `parseInt(bc, 10)`; über 0 bleibt es (auch
 *   `2.7` → 2, `'12'` → 12), sonst `null`. Fehlend oder `null` bleibt `null`.
 * - `exampleWorksheetId`: nur Text bleibt.
 * - Fremdschlüssel entfallen. Die Altform hatte keine Darstellungsfelder;
 *   alte Editor-Einstellungen übernimmt der Kern aus
 *   `chartEdits['control-chart']`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.columnRefs = Array.isArray(json.columnRefs) ? json.columnRefs.map(refOrNull).filter(Boolean) : [];
  const a = json.alpha;
  if (typeof a === 'number' && Number.isFinite(a) && a > 0 && a < 1) out.alpha = a;
  const bc = json.baselineCount;
  if (bc != null) {
    const n = parseInt(bc, 10);
    out.baselineCount = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    out.baselineCount = null;
  }
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
