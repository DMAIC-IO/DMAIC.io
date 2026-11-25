/**
 * D.Mike — TRIZ-Widerspruchsmatrix: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder matrix.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/** Kleinster und größter Parameter im Formatstand 1.0. */
const FIRST_PARAMETER_1_0 = 1;
const LAST_PARAMETER_1_0 = 39;

/**
 * Ein gespeicherter Parameter wie in der Altform gelesen (`d.x ? Number(d.x)
 * : null`); nur eine ganze Zahl von 1 bis 39 bleibt, alles andere wird `null`
 * (die Altform konnte solche Werte weder zeigen noch nachschlagen).
 * @param {unknown} v @returns {number|null}
 */
function parameterOr(v) {
  const n = v ? Number(v) : null;
  return Number.isInteger(n) && n >= FIRST_PARAMETER_1_0 && n <= LAST_PARAMETER_1_0 ? n : null;
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (die Altform schrieb nie eines).
 * Wie das alte `State.fromJSON`: kein Objekt → Vorgabe; je Parameter
 * `Number()` des wahren Werts (Zahltext `'9'` → 9, `true` → 1), außerhalb
 * 1 bis 39 oder mit Nachkommastellen `null`; die Notiz als Text oder leer;
 * die Matrix sichtbar nach `Boolean()`. Fremde Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ improving: number|null, worsening: number|null, problemNote: string, showMatrix: boolean }}
 */
export function from0(old) {
  const o = /** @type {Record<string, any>} */ (old && typeof old === 'object' && !Array.isArray(old) ? old : {});
  return {
    improving: parameterOr(o.improving),
    worsening: parameterOr(o.worsening),
    problemNote: typeof o.problemNote === 'string' ? o.problemNote : '',
    showMatrix: Boolean(o.showMatrix),
  };
}
