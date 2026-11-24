/**
 * D.Mike — Messverlaufsdiagramm: Migrationen. Rein.
 *
 * Jede Funktion beschreibt einen FESTEN Formatstand und importiert darum
 * nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/** Die Kopfzeilenschlüssel der Altform (`GAGE_INFO_KEYS` im Stand 0). */
const GAGE_INFO_KEYS_0 = ['name', 'date', 'reporter', 'tolerance', 'misc'];

/** Obergrenze der Teile je Streifen (Eingabefeld der Altform). */
const MAX_PARTS_PER_ROW_0 = 20;

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
 * '0→1.0': Altstände ohne `_schema`. `columnRefs.<slot>` wird ein
 * gleichnamiges Feld. Der Bezugswert war Text und wird über
 * `parseDecimalInput` die Zahl, mit der die Altform rechnete; Text ohne
 * endliche Zahl (leer, „-“, „3,5x“) wird `null` (Gesamtmittel, wie bisher).
 * Teile je Streifen: endliche Zahl ab 1 wird abgerundet und auf 20 begrenzt,
 * sonst greift die Vorgabe. Schalter folgen `!== false`. Die Kopfzeile
 * übernimmt je bekanntem Schlüssel nur Text. Fremdschlüssel entfallen. Die
 * Altform hatte keine Darstellungsfelder; alte Editor-Einstellungen der
 * Streifen übernimmt der Kern aus `chartEdits['gage-run-chart']`,
 * `chartEdits['gage-run-chart#2']`, …
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  const refs = json.columnRefs && typeof json.columnRefs === 'object' ? json.columnRefs : {};
  /** @type {Record<string, any>} */
  const out = {
    part: refOrNull(refs.part),
    operator: refOrNull(refs.operator),
    measurement: refOrNull(refs.measurement),
  };

  const rv = typeof json.refValue === 'string' ? parseDecimalInput(json.refValue) : null;
  out.refValue = typeof rv === 'number' && Number.isFinite(rv) ? rv : null;

  const ppr = json.partsPerRow;
  if (typeof ppr === 'number' && Number.isFinite(ppr) && ppr >= 1) {
    out.partsPerRow = Math.min(Math.floor(ppr), MAX_PARTS_PER_ROW_0);
  }

  out.showOperatorMean = json.showOperatorMean !== false;
  out.connectWithin = json.connectWithin !== false;

  const info = json.gageInfo && typeof json.gageInfo === 'object' ? json.gageInfo : {};
  out.gageInfo = Object.fromEntries(GAGE_INFO_KEYS_0.map((k) => [k, typeof info[k] === 'string' ? info[k] : '']));

  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  return out;
}
