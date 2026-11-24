/**
 * D.Mike — Kurzserien-Regelkarte (Z-MR): Migrationen. Rein.
 */

/**
 * Wie das alte Laden (`columnRefFromJSON`): `instanceId`, `sheetId` und
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

/**
 * '0→1.0': Altstände ohne `_schema` (`{ valuesRef, groupsRef,
 * exampleWorksheetId }`). Nicht strenger als das alte `fromJSON`.
 *
 * - `valuesRef`, `groupsRef`: wie das alte Laden, sonst `null`.
 * - `exampleWorksheetId`: nur Text bleibt.
 * - Fremdschlüssel entfallen. Die Altform hatte keine Darstellungsfelder;
 *   alte Editor-Einstellungen je Teilkarte übernimmt der Kern beim Einhängen
 *   aus `chartEdits['z']` und `chartEdits['mr']`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.valuesRef = refOrNull(json.valuesRef);
  out.groupsRef = refOrNull(json.groupsRef);
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
