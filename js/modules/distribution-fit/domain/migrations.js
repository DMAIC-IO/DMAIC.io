/**
 * D.Mike — Verteilungstest: Migrationen. Rein.
 */

/** Die Datentypen (Formatstand 1.0). */
const DATA_TYPES = ['auto', 'continuous', 'discrete'];

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
 * '0→1.0': Altstände ohne `_schema`. Ein unbekannter Datentyp entfällt (dann
 * greift die Vorgabe `'auto'`); Fremdschlüssel entfallen. Die Altform hatte
 * keine Darstellungsfelder; alte Editor-Einstellungen übernimmt der Kern aus
 * `chartEdits['histogram']`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.columnRef = refOrNull(json.columnRef);
  if (DATA_TYPES.includes(json.dataType)) out.dataType = json.dataType;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
