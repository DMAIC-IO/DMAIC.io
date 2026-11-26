/**
 * D.Mike — Einheitenumrechner: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */

/** Zeitzonenpositionen im Formatstand 1.0: 0 bis 22. */
const TZ_LAST_1_0 = 22;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Eine Zeitzonenposition wie das alte `fromJSON`, dazu der Ganzzahltext der
 * Erstform (Wert des Auswahlfelds, `'5'`). Alles andere wird die Vorgabe.
 * @param {unknown} v @param {number} fallback
 * @returns {number}
 */
function tzIndexOf(v, fallback) {
  if (Number.isInteger(v)) return /** @type {number} */ (v);
  if (typeof v === 'string' && /^\d+$/.test(v) && Number(v) <= TZ_LAST_1_0) return Number(v);
  return fallback;
}

/**
 * '0→1.0': Stände ohne `_schema` (Erstform). Wie das alte `State.fromJSON`:
 * Texte bleiben Texte, sonst die Vorgabe; Zeitzonen als Position (auch als
 * Ganzzahltext). Größenart und Einheiten gehen unverändert weiter, Laden mit
 * Reparatur setzt eine unbekannte Größenart auf Länge und unpassende
 * Einheiten wie das alte `fromJSON` (Invariante `unitsValid`). Ein leeres
 * Datum entfällt: die Erstform setzte beim Einhängen das heutige, so tut es
 * jetzt die Vorgabe. Fremde Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {Record<string, string|number>}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  /** @type {Record<string, string|number>} */
  const out = {
    activeCat: typeof o.activeCat === 'string' ? o.activeCat : 'laenge',
    fromUnit: typeof o.fromUnit === 'string' ? o.fromUnit : '',
    toUnit: typeof o.toUnit === 'string' ? o.toUnit : '',
    inputVal: typeof o.inputVal === 'string' ? o.inputVal : '',
    tzFrom: tzIndexOf(o.tzFrom, 1),
    tzTo: tzIndexOf(o.tzTo, 0),
    tzTime: typeof o.tzTime === 'string' ? o.tzTime : '12:00',
  };
  if (typeof o.tzDate === 'string' && o.tzDate !== '') out.tzDate = o.tzDate;
  return out;
}
