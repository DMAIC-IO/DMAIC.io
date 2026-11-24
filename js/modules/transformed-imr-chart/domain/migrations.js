/**
 * D.Mike — Transformierte I-MR-Karte: Migrationen. Rein.
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
 * Diagrammvorschlag (`{ columnRef, lambdaMode: 'auto' }`).
 *
 * - `lambdaMode`: nur `'manual'` bleibt, alles andere wird die Vorgabe `'auto'`.
 * - `lambdaManual`: eine endliche Zahl wird unverändert übernommen, auch im
 *   Modus `auto`. Dort spiegelte die Altform das geschätzte λ, aber nicht
 *   verlässlich (nach dem Laden eines Beispiels stand gespeichert 0, obwohl
 *   0,35 angezeigt wurde). Die Migration rät nichts nach: angezeigt wird im
 *   Modus `auto` das λ des Ergebnisses (`shownLambda`, Heilung beim Lesen),
 *   übernommen wird es erst beim Wechsel auf `manual` (`setLambdaMode`).
 *   Alles andere (Text, `NaN`, ±∞) entfällt, es greift die Vorgabe 0.
 * - Fremdschlüssel entfallen. Die Altform hatte keine Darstellungsfelder;
 *   alte Editor-Einstellungen übernimmt der Kern aus
 *   `chartEdits['control-chart']`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.columnRef = refOrNull(json.columnRef);
  if (json.lambdaMode === 'manual') out.lambdaMode = 'manual';
  if (typeof json.lambdaManual === 'number' && Number.isFinite(json.lambdaManual)) out.lambdaManual = json.lambdaManual;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
