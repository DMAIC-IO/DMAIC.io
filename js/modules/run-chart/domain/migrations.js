/**
 * D.Mike — Verlaufsdiagramm: Migrationen. Rein.
 */

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
 * '0→1.0': Altstände ohne `_schema`, auch die Vorbelegung aus dem
 * Diagrammvorschlag (`{ columnRef }`). α wird nur als endliche Zahl
 * zwischen 0 und 1 (beide ausgeschlossen) übernommen, sonst greift die
 * Vorgabe 0,05; Fremdschlüssel entfallen. Die Altform hatte keine
 * Darstellungsfelder; alte Editor-Einstellungen übernimmt der Kern aus
 * `chartEdits['run-chart']`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.columnRef = refOrNull(json.columnRef);
  const a = json.alpha;
  if (typeof a === 'number' && Number.isFinite(a) && a > 0 && a < 1) out.alpha = a;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
