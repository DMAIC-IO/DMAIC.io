/**
 * D.Mike — TRIZ-IFR: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Textfelder im Formatstand 1.0, in gespeicherter Reihenfolge. */
const FIELDS_1_0 = ['system', 'usefulFunction', 'harmfulEffect', 'ifr1', 'ifr2', 'ifr3', 'obstacles'];

/**
 * '0→1.0': Altstände ohne `_schema` (Beispieldatei, Projektdateien). Je Feld
 * der Text unverändert, alles andere wird leer; fremde Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {Record<string, string>}
 */
export function from0(old) {
  const o = old !== null && typeof old === 'object' && !Array.isArray(old)
    ? /** @type {Record<string, unknown>} */ (old) : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of FIELDS_1_0) {
    const v = o[key];
    out[key] = typeof v === 'string' ? v : '';
  }
  return out;
}
