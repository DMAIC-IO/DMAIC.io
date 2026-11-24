/**
 * D.Mike — Zeitgewichtete Regelkarten: Migrationen. Rein.
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

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * '0→1.0': Altstände ohne `_schema` (flach: `chartTypeId`, `columnRef`,
 * `sigmaMethod`, `baselineCount`, `targetOverride`, `sigmaOverride`,
 * `lambda`, `L`, `kSigma`, `hSigma`, `exampleWorksheetId`). Nicht strenger
 * als das alte `fromJSON`.
 *
 * - `chartTypeId`: `'cusum'` bleibt, alles andere wird `'ewma'`;
 *   `sigmaMethod`: `'sd'` bleibt, sonst `'mr'`.
 * - `columnRef`: wie das alte Laden, sonst `null`.
 * - `baselineCount`: endlich und ≥ 1 → abgerundet (die Rechnung nahm den
 *   ganzzahligen Teil); ≤ 0 → `null` (gleiche Wirkung: alle Werte);
 *   0 < x < 1 → `null` (bisher kein Ergebnis, jetzt alle Werte, A14); sonst
 *   `null`.
 * - `targetOverride`: endlich bleibt, sonst `null`; `sigmaOverride`: endlich
 *   und ≥ 0 bleibt, sonst `null`.
 * - Die Parameter beider Typen gehen nach `params.ewma` bzw. `params.cusum`
 *   (Regel M6), auch die des nicht gewählten Typs: λ endlich mit 0 < λ ≤ 1,
 *   L, k, h endlich > 0; sonst die Vorgabe des alten `fromJSON` (λ 0,2,
 *   L 3, k 0,5, h 4; gleich der des Schemas). Texte wie `'0.3'` fallen
 *   ebenso auf die Vorgabe. Die Objekte sind vollständig: ein Teilobjekt
 *   verwürfe die Prüfung beim Laden ganz.
 * - `exampleWorksheetId`: nur Text bleibt.
 * - Fremdschlüssel entfallen, auch die flachen Parameter neben `params`.
 *   Die Altform hatte keine Darstellungsfelder; alte Editor-Einstellungen
 *   (`chartEdits['ewma']`, `['cusum']`, `['cusum#2']`) verteilt der Kern
 *   beim Einhängen über den Altschlüssel je Teilkarte.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.chartTypeId = json.chartTypeId === 'cusum' ? 'cusum' : 'ewma';
  out.columnRef = refOrNull(json.columnRef);
  out.sigmaMethod = json.sigmaMethod === 'sd' ? 'sd' : 'mr';
  const bc = json.baselineCount;
  out.baselineCount = finite(bc) && bc >= 1 ? Math.floor(bc) : null;
  out.targetOverride = finite(json.targetOverride) ? json.targetOverride : null;
  const so = json.sigmaOverride;
  out.sigmaOverride = finite(so) && so >= 0 ? so : null;
  const { lambda, L, kSigma, hSigma } = json;
  out.params = {
    ewma: {
      lambda: finite(lambda) && lambda > 0 && lambda <= 1 ? lambda : 0.2,
      L: finite(L) && L > 0 ? L : 3,
    },
    cusum: {
      kSigma: finite(kSigma) && kSigma > 0 ? kSigma : 0.5,
      hSigma: finite(hSigma) && hSigma > 0 ? hSigma : 4,
    },
  };
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
