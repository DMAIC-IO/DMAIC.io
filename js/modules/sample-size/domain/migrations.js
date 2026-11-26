/**
 * D.Mike — Stichprobenumfang: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Eine Effektangabe: Zahl oder Zahlentext über `parseDecimalInput`; leer,
 * unlesbar oder nicht größer als 0 wird `null` (die Rechnung ignorierte sie).
 * @param {unknown} v @returns {number|null}
 */
function effect(v) {
  if (v === null || v === undefined) return null;
  const n = parseDecimalInput(typeof v === 'number' ? v : String(v));
  return finite(n) && n > 0 ? n : null;
}

/**
 * α bzw. Power: fehlt der Schlüssel, entfällt er (die Kontextvorgabe greift);
 * gespeichertes `null`, eine Nicht-Zahl oder ein Wert außerhalb des Bereichs
 * wird die feste Vorgabe; sonst bleibt der Wert.
 * @param {Record<string, any>} json @param {string} key
 * @param {number} min @param {number} max @param {number} fallback
 * @param {Record<string, any>} out
 */
function contextValue(json, key, min, max, fallback, out) {
  if (!(key in json)) return;
  const v = json[key];
  out[key] = finite(v) && v >= min && v <= max ? v : fallback;
}

/**
 * '0→1.0': Altstände ohne `_schema` (flach: `category`, `testType`,
 * `direction`, `alpha`, `power`, `sigma0`, `sigmaAlt`, `ratio`, `delta`,
 * `sigma`, Effektangaben als Text). Nicht strenger als das alte `fromJSON`.
 *
 * - `category`/`direction` außerhalb der Liste → Vorgabe; `testType`
 *   `'two-sample-t'` (Golden-Fixture v0.3.0) wird `'two'`, sonst Unbekanntes
 *   `'one'`.
 * - `alpha`/`power` siehe `contextValue` (0,05 bzw. 0,8).
 * - Die Effektangaben gehen nach `effect.varianceOne` (`sigma0`, `sigmaAlt`),
 *   `effect.varianceTwo` (`ratio`) und `effect.mean` (`delta`, `sigma`), auch
 *   die der nicht gewählten Variante.
 * - Fremdschlüssel entfallen. Alte Editor-Einstellungen
 *   (`chartEdits[<inst>].scatter`) übernimmt der Kern beim Einhängen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.category = json.category === 'mean' ? 'mean' : 'variance';
  out.testType = json.testType === 'two' || json.testType === 'two-sample-t' ? 'two' : 'one';
  out.direction = ['greater', 'less'].includes(json.direction) ? json.direction : 'two-sided';
  contextValue(json, 'alpha', 0.0001, 0.5, 0.05, out);
  contextValue(json, 'power', 0.5, 0.9999, 0.8, out);
  out.effect = {
    varianceOne: { sigma0: effect(json.sigma0), sigmaAlt: effect(json.sigmaAlt) },
    varianceTwo: { ratio: effect(json.ratio) },
    mean: { delta: effect(json.delta), sigma: effect(json.sigma) },
  };
  return out;
}
