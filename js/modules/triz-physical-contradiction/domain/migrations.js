/**
 * D.Mike — TRIZ physikalischer Widerspruch: Migrationen des gespeicherten
 * Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder principles.js (das Schema darf sich ändern,
 * die Migration nicht).
 */

/** Trennungsprinzipien im Formatstand 1.0, in gespeicherter Reihenfolge. */
const PRINCIPLES_1_0 = ['time', 'space', 'condition', 'system'];

/** @param {unknown} v @returns {string} der Text oder leer */
const textOr = (v) => (typeof v === 'string' ? v : '');

/**
 * '0→1.0': Altstände ohne `_schema` (Beispieldatei, von Hand). Jeder Text als
 * Text oder leer; je Trennungsprinzip die Notiz als Text oder leer; die Wahl
 * aus der Liste oder `null`. Fremde Prinzipien und Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ parameter: string, requirementA: string, requirementNotA: string, problemNote: string,
 *   principleNotes: Record<string, string>, selectedPrinciple: string|null, solutionNote: string }}
 */
export function from0(old) {
  const o = /** @type {Record<string, any>} */ (old && typeof old === 'object' ? old : {});
  const pn = o.principleNotes;
  /** @type {Record<string, string>} */
  const principleNotes = {};
  for (const k of PRINCIPLES_1_0) principleNotes[k] = textOr(pn?.[k]);
  return {
    parameter: textOr(o.parameter),
    requirementA: textOr(o.requirementA),
    requirementNotA: textOr(o.requirementNotA),
    problemNote: textOr(o.problemNote),
    principleNotes,
    selectedPrinciple: PRINCIPLES_1_0.includes(o.selectedPrinciple) ? o.selectedPrinciple : null,
    solutionNote: textOr(o.solutionNote),
  };
}
